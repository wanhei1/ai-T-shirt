import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { mkdirSync } from 'fs';
import connectToDatabase, { connectToReadDatabase } from './config/database';
import { Pool } from 'pg';
import { createClient } from 'redis';
import { createRoutes } from './routes';
import { getRabbitConnection } from './queue/connection';
import './types'; // 导入类型扩展
import { randomUUID } from 'crypto';
import { getMetricsAsPrometheus, incrementCounter, observeHistogram, setGauge } from './observability/metrics';
import { logInfo, logWarn } from './utils/structured-logger';
import { assertRuntimeEnvOrThrow } from './config/env-guard';
import { BILLING_RECONCILIATION_KINDS, runBillingReconciliation } from './release/billing-reconciliation';

const app = express();
const PORT = process.env.PORT || 8181; // 改为 8189，避免与前端冲突
const suppressPolling304Logs = (process.env.SUPPRESS_POLLING_304_LOGS || 'true').toLowerCase() !== 'false';
let dbConnectedState = false;

const parseCandidates = (multiValue?: string, singleValue?: string) => {
    const values = `${multiValue || ''},${singleValue || ''}`
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
    return Array.from(new Set(values));
};

const redisDependencyUrls = parseCandidates(process.env.REDIS_URLS, process.env.REDIS_URL);
const dependencyCheckIntervalMs = Math.max(5000, Number.parseInt(process.env.DEPENDENCY_CHECK_INTERVAL_MS || '15000', 10) || 15000);
const billingReconciliationEnabled = (process.env.BILLING_RECONCILIATION_ENABLED || 'true').toLowerCase() !== 'false';
const billingReconciliationIntervalMs = Math.max(
    60_000,
    Number.parseInt(process.env.BILLING_RECONCILIATION_INTERVAL_MS || '900000', 10) || 900000
);
const billingReconciliationLookbackHours = Math.max(
    1,
    Number.parseInt(process.env.BILLING_RECONCILIATION_LOOKBACK_HOURS || '24', 10) || 24
);
const dependencyStatus = new Map<string, number>();
let redisProbeClient: ReturnType<typeof createClient> | null = null;

const runWithTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> => {
    let timer: NodeJS.Timeout | null = null;
    try {
        return await Promise.race([
            promise,
            new Promise<T>((_, reject) => {
                timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
            })
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
};

const publishDependencyState = (dependency: string, up: number, details?: Record<string, unknown>) => {
    setGauge('dependency_up', up, { dependency });
    const previous = dependencyStatus.get(dependency);
    if (previous === up) return;

    dependencyStatus.set(dependency, up);
    if (up === 1) {
        logInfo('dependency_recovered', { dependency, ...details });
    } else {
        logWarn('dependency_unavailable', { dependency, ...details });
    }
};

const ensureRedisProbeClient = async () => {
    if (redisProbeClient?.isOpen) {
        return redisProbeClient;
    }

    const candidates = redisDependencyUrls.length > 0 ? redisDependencyUrls : ['redis://127.0.0.1:6379'];
    let lastError: unknown = null;

    for (const url of candidates) {
        const client = createClient({ url });
        client.on('error', () => {
            // no-op: we record availability from explicit probe checks
        });
        try {
            await client.connect();
            redisProbeClient = client;
            return client;
        } catch (error) {
            lastError = error;
            try {
                await client.disconnect();
            } catch {
                // ignore disconnect errors for failed probes
            }
        }
    }

    throw lastError instanceof Error ? lastError : new Error('Redis probe connection failed');
};

const observeDependency = async (dependency: string, check: () => Promise<void>) => {
    const started = Date.now();
    try {
        await check();
        const durationSeconds = Math.max(0, (Date.now() - started) / 1000);
        observeHistogram('dependency_check_duration_seconds', durationSeconds, { dependency, status: 'up' });
        publishDependencyState(dependency, 1);
    } catch (error) {
        const durationSeconds = Math.max(0, (Date.now() - started) / 1000);
        observeHistogram('dependency_check_duration_seconds', durationSeconds, { dependency, status: 'down' });
        publishDependencyState(dependency, 0, {
            error: error instanceof Error ? error.message : String(error)
        });
    }
};

const startDependencyMetricsLoop = (pool: Pool | null) => {
    const runChecks = async () => {
        await observeDependency('postgres', async () => {
            if (!pool) throw new Error('postgres_pool_not_initialized');
            await runWithTimeout(pool.query('SELECT 1'), 3000, 'postgres_probe_timeout');
        });

        await observeDependency('rabbitmq', async () => {
            await runWithTimeout(getRabbitConnection(), 3000, 'rabbitmq_probe_timeout');
        });

        await observeDependency('redis', async () => {
            const client = await runWithTimeout(ensureRedisProbeClient(), 3000, 'redis_connect_timeout');
            await runWithTimeout(client.ping(), 3000, 'redis_ping_timeout');
        });
    };

    void runChecks();
    return setInterval(() => {
        void runChecks();
    }, dependencyCheckIntervalMs);
};

assertRuntimeEnvOrThrow();

const startBillingReconciliationLoop = (pool: Pool | null) => {
    if (!pool || !billingReconciliationEnabled) {
        return null;
    }

    const runCheck = async () => {
        const nowSeconds = Math.floor(Date.now() / 1000);
        try {
            const report = await runBillingReconciliation(pool, {
                lookbackHours: billingReconciliationLookbackHours,
                sampleLimit: 5,
            });

            for (const kind of BILLING_RECONCILIATION_KINDS) {
                const item = report.mismatches.find((entry) => entry.kind === kind);
                setGauge('billing_reconciliation_mismatch_count', item?.count || 0, { kind });
            }
            setGauge('billing_reconciliation_total_mismatches', report.totalMismatches);
            setGauge('billing_reconciliation_last_run_status', 1);
            setGauge('billing_reconciliation_last_run_timestamp_seconds', nowSeconds);
            incrementCounter('billing_reconciliation_runs_total', { status: 'success' });
        } catch (error) {
            setGauge('billing_reconciliation_last_run_status', 0);
            setGauge('billing_reconciliation_last_run_timestamp_seconds', nowSeconds);
            incrementCounter('billing_reconciliation_runs_total', { status: 'failed' });
            logWarn('billing_reconciliation_failed', {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    };

    void runCheck();
    return setInterval(() => {
        void runCheck();
    }, billingReconciliationIntervalMs);
};

// 中间件
const allowedOrigins = [
    'http://localhost:3000',
    'http://36.110.14.112:8478',
];


app.use(cors({
    origin: allowedOrigins,
    credentials: true
}));

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: '请求过于频繁，请稍后再试' }
});
app.use('/api/login', authLimiter);
app.use('/api/register', authLimiter);
// Increase JSON and URL-encoded body size limits to allow larger payloads.
// Orders can include embedded design images (data URLs), which easily exceed small defaults.
// For production, prefer uploading large files to object storage and sending references.
const bodyLimit = process.env.EXPRESS_JSON_LIMIT || '50mb';
app.use(express.json({ limit: bodyLimit }));
app.use(express.urlencoded({ extended: true, limit: bodyLimit }));

const assetStorageDir = process.env.ASSET_STORAGE_DIR?.trim() || path.join(process.cwd(), 'storage', 'assets');
const assetPublicBase = process.env.ASSET_PUBLIC_BASE_URL?.trim() || '/assets';
if (assetPublicBase.startsWith('/')) {
    mkdirSync(assetStorageDir, { recursive: true });
    app.use(assetPublicBase, express.static(assetStorageDir, {
        maxAge: '30d',
        immutable: true
    }));
}

app.use((req, res, next) => {
    const requestIdHeader = req.headers['x-request-id'];
    const requestId = typeof requestIdHeader === 'string' && requestIdHeader.trim().length > 0
        ? requestIdHeader.trim()
        : randomUUID();

    res.locals.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
});

app.use((req: Request, res: Response, next: NextFunction) => {
    const start = process.hrtime.bigint();

    res.on('finish', () => {
        const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
        const route = req.route?.path || req.path || 'unknown';

        incrementCounter('http_requests_total', {
            method: req.method,
            route,
            status: res.statusCode
        });
        observeHistogram('http_request_duration_seconds', durationSeconds, {
            method: req.method,
            route,
            status: res.statusCode
        });

        // Polling job-status endpoints can generate high-volume 304 logs that are not actionable.
        if (suppressPolling304Logs && route === '/jobs/:queue/:id' && res.statusCode === 304) {
            return;
        }

        const logger = res.statusCode >= 400 ? logWarn : logInfo;
        logger('http_request_completed', {
            requestId: res.locals.requestId || null,
            method: req.method,
            route,
            path: req.originalUrl || req.path,
            status: res.statusCode,
            durationMs: Math.round(durationSeconds * 1000)
        });
    });

    next();
});

// 健康检查路由
app.get('/', (req, res) => {
    res.json({
        message: 'T-shirt Design Editor API is running!',
        version: '1.0.0',
        timestamp: new Date().toISOString()
    });
});

// API 根路由提示
app.get('/api', (req, res) => {
    res.json({
        message: 'API online',
        endpoints: {
            login: 'POST /api/login',
            register: 'POST /api/register',
            profile: 'GET /api/profile',
            health: 'GET /health'
        }
    });
});

// API 状态路由
app.get('/health', (req, res) => {
    res.status(dbConnectedState ? 200 : 503).json({
        status: dbConnectedState ? 'healthy' : 'degraded',
        checks: {
            database: dbConnectedState ? 'up' : 'down'
        },
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// Readiness probe for load balancers: traffic should only reach instances with DB connectivity.
app.get('/health/ready', (req, res) => {
    if (!dbConnectedState) {
        return res.status(503).json({
            status: 'not-ready',
            reason: 'database_unavailable',
            timestamp: new Date().toISOString()
        });
    }

    return res.status(200).json({
        status: 'ready',
        timestamp: new Date().toISOString()
    });
});

// 初始化数据库连接和路由
const initializeApp = async () => {
    let pool: Pool | null = null;
    let readPool: Pool | null = null;
    let dbConnected = false;
    let dependencyMetricsTimer: NodeJS.Timeout | null = null;
    let billingReconciliationTimer: NodeJS.Timeout | null = null;

    try {
        // 尝试连接数据库
        try {
            pool = await connectToDatabase();
            dbConnected = true;
            dbConnectedState = true;
            console.log('✅ Database connected');

            readPool = await connectToReadDatabase();
            if (readPool) {
                console.log('✅ Read replica database connected');
            } else {
                console.log('ℹ️ Read replica database not configured, falling back to primary for reads');
            }
        } catch (dbError: any) {
            console.warn('⚠️ Database connection failed, running without database features');
            console.log(`📝 Database error: ${dbError?.message || 'Unknown error'}`);
            console.log('💡 To enable full features, please configure your DATABASE_URL environment variable');
            dbConnectedState = false;
        }

        // 设置 API 路由（传入数据库连接池，如果连接失败则为 null）
        app.get('/metrics', (req: Request, res: Response) => {
            const metricsToken = process.env.METRICS_TOKEN?.trim();
            if (metricsToken) {
                const authHeader = req.headers.authorization || '';
                const receivedToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
                if (receivedToken !== metricsToken) {
                    return res.status(401).json({ error: 'Unauthorized' });
                }
            }

            res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
            return res.send(getMetricsAsPrometheus());
        });

        app.use('/api', createRoutes(pool, readPool));

        dependencyMetricsTimer = startDependencyMetricsLoop(pool);
        billingReconciliationTimer = startBillingReconciliationLoop(pool);

        // 404 处理
        app.use('*', (req, res) => {
            res.status(404).json({
                message: 'Route not found',
                database: dbConnected ? 'connected' : 'disconnected',
                availableRoutes: [
                    'GET /',
                    'GET /health',
                    'GET /api/gallery (需要数据库)',
                    'POST /api/register (需要数据库)',
                    'POST /api/login (需要数据库)',
                    'GET /api/profile (需要数据库)',
                    'POST /api/orders (需要数据库)',
                    'GET /api/orders (需要数据库)',
                    'POST /api/memberships (需要数据库)',
                    'GET /api/memberships/me (需要数据库)'
                ]
            });
        });

        // ✅ 安全修复：仅监听 127.0.0.1，禁止公网直连
        app.listen(Number(PORT), '127.0.0.1', () => {
            console.log(`🚀 Backend server is running on port ${PORT}`);
            console.log(`📡 API available at http://localhost:${PORT}/api`);
            console.log(`💚 Health check at http://localhost:${PORT}/health`);
            console.log(`🗄️ Database status: ${dbConnected ? '✅ Connected' : '❌ Disconnected'}`);
        });

        const cleanup = async () => {
            if (dependencyMetricsTimer) {
                clearInterval(dependencyMetricsTimer);
                dependencyMetricsTimer = null;
            }
            if (billingReconciliationTimer) {
                clearInterval(billingReconciliationTimer);
                billingReconciliationTimer = null;
            }
            if (redisProbeClient?.isOpen) {
                try {
                    await redisProbeClient.quit();
                } catch {
                    // ignore shutdown race for probe client
                }
            }
        };

        process.on('SIGINT', () => {
            void cleanup().finally(() => process.exit(0));
        });
        process.on('SIGTERM', () => {
            void cleanup().finally(() => process.exit(0));
        });
    } catch (error) {
        console.error('❌ Failed to initialize app:', error);
        process.exit(1);
    }
};

initializeApp();
