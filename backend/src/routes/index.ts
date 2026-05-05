import { Router } from 'express';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { AuthController } from '../controllers';
import { UserModel, OrderModel, MembershipModel, AllDesignModel, CartModel } from '../models';
import { authenticate, authenticateOptional } from '../middleware/auth';
import { Pool } from 'pg';
import { normalizeCategory } from '../utils/category';
import { categoryAliases } from '../utils/category';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { hashPassword } from '../utils';
import { createRateLimiter } from '../utils/rate-limit';
import { incrementCounter, setGauge } from '../observability/metrics';
import { createCacheStore } from '../utils/cache';
import { logError, logWarn } from '../utils/structured-logger';
import { externalizeImageDataUrls, type StoredAssetRef } from '../utils/asset-storage';
import { API_COMMON_ERROR_CODES } from '@v0-t-shirt-design-editor/shared';
import {
    enqueueJob,
    getQueueByName,
    AI_QUEUE_NAME,
    TRYON_QUEUE_NAME,
    getQueueStats as getQueueStatsByName,
    getJobById,
} from '../queue/queues';
import { runBillingReconciliation } from '../release/billing-reconciliation';
import {
    validateCheckoutPayload,
    validateCreateMembershipPayload,
    validateCreateOrderPayload,
} from '../validation/request-schemas';

export const createRoutes = (pool: Pool | null, readPool?: Pool | null) => {
    const router = Router();

    const sendError = (res: any, status: number, code: string, message: string, details?: unknown) => {
        const req = res.req as any;
        const route = req?.route?.path || req?.path || req?.originalUrl || 'unknown';
        const detailsObj = details && typeof details === 'object' ? details as Record<string, unknown> : null;
        const queue = typeof detailsObj?.queue === 'string' ? detailsObj.queue : undefined;
        const detailJobId = typeof detailsObj?.jobId === 'string' ? detailsObj.jobId : undefined;
        const paramJobId = typeof req?.params?.id === 'string' ? req.params.id : undefined;
        const bodyJobId = typeof req?.body?.jobId === 'string' ? req.body.jobId : undefined;
        const jobId = detailJobId || paramJobId || bodyJobId;

        incrementCounter('api_errors_total', {
            code,
            status,
            route,
        });

        logWarn('api_error', {
            requestId: res.locals?.requestId || null,
            code,
            status,
            route,
            method: req?.method || null,
            queue: queue || null,
            jobId: jobId || null,
            details: details ?? null,
        });

        return res.status(status).json({
            code,
            message,
            details: details ?? null,
            requestId: res.locals?.requestId || null,
        });
    };

    const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

    const toOptionalString = (value: unknown): string | undefined => {
        if (typeof value !== 'string') return undefined;
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : undefined;
    };

    const toOptionalNumber = (value: unknown): number | undefined => {
        if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
        return value;
    };

    const parseAiGenerationOptions = (input: any) => {
        const widthRaw = toOptionalNumber(input?.width);
        const heightRaw = toOptionalNumber(input?.height);
        const stepsRaw = toOptionalNumber(input?.steps);
        const cfgRaw = toOptionalNumber(input?.cfg);
        const seedRaw = toOptionalNumber(input?.seed);
        const denoiseRaw = toOptionalNumber(input?.denoise);

        return {
            style: toOptionalString(input?.style),
            width: widthRaw !== undefined ? clamp(Math.round(widthRaw), 256, 1536) : undefined,
            height: heightRaw !== undefined ? clamp(Math.round(heightRaw), 256, 1536) : undefined,
            steps: stepsRaw !== undefined ? clamp(Math.round(stepsRaw), 1, 80) : undefined,
            cfg: cfgRaw !== undefined ? clamp(cfgRaw, 1, 20) : undefined,
            seed: seedRaw !== undefined ? Math.max(0, Math.round(seedRaw)) : undefined,
            denoise: denoiseRaw !== undefined ? clamp(denoiseRaw, 0, 1) : undefined,
            modelName: toOptionalString(input?.modelName),
            samplerName: toOptionalString(input?.samplerName),
            scheduler: toOptionalString(input?.scheduler),
            negativePrompt: toOptionalString(input?.negativePrompt)
        };
    };

    const isAiEnabled = () => {
        const raw = (process.env.AI_ENABLED || 'true').trim().toLowerCase();
        return raw !== 'false' && raw !== '0' && raw !== 'off';
    };

    const isAiBudgetGuardEnabled = () => {
        const raw = (process.env.AI_BUDGET_GUARD_ENABLED || 'true').trim().toLowerCase();
        return raw !== 'false' && raw !== '0' && raw !== 'off';
    };

    const getAiBudgetGuardMode = (): 'degrade' | 'delay' | 'pause' => {
        const raw = (process.env.AI_BUDGET_GUARD_MODE || 'degrade').trim().toLowerCase();
        if (raw === 'delay' || raw === 'pause') return raw;
        return 'degrade';
    };

    // 如果没有数据库连接，则返回服务不可用的路由
    if (!pool) {
        router.use((req, res) => {
            sendError(res, 503, 'DB_CONNECTION_FAILED', 'Database service is unavailable. Please configure DATABASE_URL.');
        });
        return router;
    }

    const userModel = new UserModel(pool);
    const authController = new AuthController(userModel);
    const orderModel = new OrderModel(pool);
    const orderReadModel = new OrderModel(readPool || pool);
    const allDesignModel = new AllDesignModel(pool);
    const allDesignReadModel = new AllDesignModel(readPool || pool);
    const membershipModel = new MembershipModel(pool);
    const membershipReadModel = new MembershipModel(readPool || pool);
    const cartModel = new CartModel(pool);
    const cartReadModel = new CartModel(readPool || pool);

    // Ops: Alertmanager webhook -> generate incident ticket template file
    router.post('/ops/alerts/ticket', async (req, res) => {
        try {
            const configuredToken = (process.env.ALERT_TICKET_WEBHOOK_TOKEN || '').trim();
            if (!configuredToken) {
                return res.status(503).json({ message: 'ALERT_TICKET_WEBHOOK_TOKEN is not configured' });
            }

            const headerToken = typeof req.headers['x-alert-ticket-token'] === 'string'
                ? req.headers['x-alert-ticket-token'].trim()
                : '';
            const queryToken = typeof req.query?.token === 'string' ? req.query.token.trim() : '';
            const receivedToken = headerToken || queryToken;

            if (!receivedToken || receivedToken !== configuredToken) {
                return res.status(401).json({ message: 'Unauthorized webhook token' });
            }

            const payload = req.body && typeof req.body === 'object' ? req.body as any : {};
            const alerts = Array.isArray(payload.alerts) ? payload.alerts : [];
            const firstAlert = alerts[0] || {};
            const labels = firstAlert.labels && typeof firstAlert.labels === 'object' ? firstAlert.labels : {};
            const annotations = firstAlert.annotations && typeof firstAlert.annotations === 'object' ? firstAlert.annotations : {};

            const alertName = String(labels.alertname || 'UnknownAlert');
            const service = String(labels.service || 'unknown-service');
            const severity = String(labels.severity || 'unknown');
            const startsAt = String(firstAlert.startsAt || new Date().toISOString());
            const summary = String(annotations.summary || 'N/A');
            const description = String(annotations.description || 'N/A');
            const runbook = String(annotations.runbook || 'N/A');
            const fingerprint = String(firstAlert.fingerprint || 'no-fingerprint');

            const incidentId = `INC-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 7)}`;
            const outputDir = path.resolve(
                process.cwd(),
                (process.env.ALERT_TICKET_OUTPUT_DIR || '../artifacts/incidents').trim()
            );
            mkdirSync(outputDir, { recursive: true });

            const safeAlertName = alertName.replace(/[^a-zA-Z0-9-_]/g, '_');
            const ticketPath = path.join(outputDir, `${incidentId}-${safeAlertName}.md`);

            const markdown = [
                `# Incident Ticket: ${incidentId}`,
                '',
                `- Alert: ${alertName}`,
                `- Service: ${service}`,
                `- Severity: ${severity}`,
                `- Started At: ${startsAt}`,
                `- Fingerprint: ${fingerprint}`,
                '',
                '## Summary',
                '',
                summary,
                '',
                '## Description',
                '',
                description,
                '',
                '## Immediate Checks',
                '',
                '- [ ] Confirm alert is not duplicate/noise and identify affected users/orders.',
                '- [ ] Check latest reconciliation report in admin panel.',
                '- [ ] Validate DB and queue health and recent deployment changes.',
                '- [ ] Decide mitigation (throttle, degrade, manual reconcile).',
                '',
                '## Runbook',
                '',
                runbook,
                '',
                '## Evidence',
                '',
                '- [ ] Screenshot /metrics and alert timeline',
                '- [ ] Reconciliation report artifact',
                '- [ ] SQL or logs used for verification',
                '',
                '## Postmortem',
                '',
                '- Root cause:',
                '- Corrective action:',
                '- Preventive action:',
                '- Owner and ETA:',
                ''
            ].join('\n');

            writeFileSync(ticketPath, markdown, 'utf-8');
            return res.status(201).json({
                incidentId,
                ticketPath,
                alertName,
                service,
                severity,
            });
        } catch (error) {
            console.error('Create alert ticket error:', error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    });
    const rateLimiter = createRateLimiter();
    const cacheStore = createCacheStore();

    const ttlFromEnv = (envName: string, fallbackSeconds: number, minSeconds = 5) => {
        const raw = Number.parseInt(process.env[envName] || '', 10);
        if (!Number.isFinite(raw)) {
            return Math.max(minSeconds, fallbackSeconds);
        }
        return Math.max(minSeconds, raw);
    };

    const cacheTtl = {
        galleryList: ttlFromEnv('GALLERY_CACHE_TTL_SECONDS', 30),
        galleryItem: ttlFromEnv('GALLERY_ITEM_CACHE_TTL_SECONDS', 30),
        membershipMe: ttlFromEnv('MEMBERSHIP_CACHE_TTL_SECONDS', 20),
        membershipTransactions: ttlFromEnv('MEMBERSHIP_TRANSACTIONS_CACHE_TTL_SECONDS', 20),
        cartList: ttlFromEnv('CART_CACHE_TTL_SECONDS', 15),
        orderSummary: ttlFromEnv('ORDERS_SUMMARY_CACHE_TTL_SECONDS', 20),
        orderList: ttlFromEnv('ORDERS_LIST_CACHE_TTL_SECONDS', 20),
        adminOrders: ttlFromEnv('ADMIN_ORDERS_CACHE_TTL_SECONDS', 10),
    };

    const markCache = (route: string, result: 'hit' | 'miss' | 'store' | 'invalidate' | 'error') => {
        incrementCounter('cache_requests_total', { route, result });
    };

    const readThroughCache = async <TPayload>(
        route: string,
        cacheKey: string,
        ttlSeconds: number,
        loader: () => Promise<TPayload>
    ): Promise<TPayload> => {
        try {
            const cached = await cacheStore.get<TPayload>(cacheKey);
            if (cached !== null) {
                incrementCounter('cache_hits_total', { route });
                markCache(route, 'hit');
                return cached;
            }

            incrementCounter('cache_misses_total', { route });
            incrementCounter('cache_backsource_total', { route });
            markCache(route, 'miss');

            const payload = await loader();
            await cacheStore.set(cacheKey, payload, ttlSeconds);
            markCache(route, 'store');
            return payload;
        } catch (error) {
            markCache(route, 'error');
            throw error;
        }
    };

    const safeInvalidatePrefix = async (prefix: string, route: string) => {
        try {
            await cacheStore.deleteByPrefix(prefix);
            markCache(route, 'invalidate');
        } catch (error) {
            markCache(route, 'error');
            logWarn('cache_invalidation_failed', {
                route,
                prefix,
                error,
            });
        }
    };

    const stableStringify = (input: unknown): string => {
        if (input === null || typeof input !== 'object') {
            return JSON.stringify(input);
        }
        if (Array.isArray(input)) {
            return `[${input.map((item) => stableStringify(item)).join(',')}]`;
        }

        const obj = input as Record<string, unknown>;
        const keys = Object.keys(obj).sort();
        return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`).join(',')}}`;
    };

    const getIdempotencyKey = (req: any) => {
        const value = req.headers?.['idempotency-key'];
        if (Array.isArray(value)) {
            const first = value.find((item) => typeof item === 'string' && item.trim().length > 0);
            return typeof first === 'string' ? first.trim() : '';
        }
        if (typeof value === 'string') {
            return value.trim();
        }
        return '';
    };

    const hashRequestPayload = (endpoint: string, payload: unknown) => {
        const normalized = stableStringify(payload);
        return createHash('sha256').update(`${endpoint}:${normalized}`).digest('hex');
    };

    const safeEqual = (left: string, right: string) => {
        const a = Buffer.from(left);
        const b = Buffer.from(right);
        if (a.length !== b.length) return false;
        return timingSafeEqual(a, b);
    };

    const verifyWebhookSignature = (payload: unknown, timestamp: string, signature: string, secret: string) => {
        const base = `${timestamp}.${stableStringify(payload ?? {})}`;
        const expectedHex = createHmac('sha256', secret).update(base).digest('hex');
        const expectedBase64 = createHmac('sha256', secret).update(base).digest('base64');
        return safeEqual(signature, expectedHex) || safeEqual(signature, expectedBase64);
    };

    const invalidateMembershipCache = async (userId?: number | null) => {
        if (!userId || !Number.isFinite(userId)) return;
        await Promise.all([
            safeInvalidatePrefix(`membership:me:${userId}:`, '/memberships/me'),
            safeInvalidatePrefix(`membership:transactions:${userId}:`, '/memberships/transactions/me'),
        ]);
    };

    const invalidateCartCache = async (userId?: number | null) => {
        if (!userId || !Number.isFinite(userId)) return;
        await safeInvalidatePrefix(`cart:list:${userId}:`, '/cart');
    };

    const invalidateOrderCache = async (userId?: number | null) => {
        if (!userId || !Number.isFinite(userId)) return;
        await Promise.all([
            safeInvalidatePrefix(`orders:list:${userId}:`, '/orders'),
            safeInvalidatePrefix(`orders:summary:${userId}:`, '/orders/summary'),
        ]);
    };

    const invalidateAdminOrderCache = async () => {
        await safeInvalidatePrefix('orders:admin:list:', '/admin/orders');
    };

    const invalidateGalleryCache = async (designId?: number | null) => {
        await safeInvalidatePrefix('gallery:list:', '/gallery');
        if (designId && Number.isFinite(designId)) {
            await safeInvalidatePrefix(`gallery:item:${designId}`, '/gallery/:designId');
        }
    };

    const mergeAssetRefs = (baseMeta: unknown, refs: StoredAssetRef[]) => {
        const base = baseMeta && typeof baseMeta === 'object' ? baseMeta as Record<string, unknown> : {};
        const existing = Array.isArray(base.assetRefs) ? base.assetRefs : [];
        return {
            ...base,
            assetRefs: [...existing, ...refs],
        };
    };

    const buildTrackingTimeline = (orderCreatedAt?: string | Date | null, shipment?: {
        status?: string | null;
        shipped_at?: string | Date | null;
        delivered_at?: string | Date | null;
        updated_at?: string | Date | null;
    } | null) => {
        const timeline: Array<{ key: string; label: string; time: string | null }> = [];

        timeline.push({
            key: 'order_created',
            label: 'Order created',
            time: orderCreatedAt ? new Date(orderCreatedAt).toISOString() : null,
        });

        if (shipment?.shipped_at) {
            timeline.push({
                key: 'shipped',
                label: 'Shipped',
                time: new Date(shipment.shipped_at).toISOString(),
            });
        }

        if (shipment?.delivered_at) {
            timeline.push({
                key: 'delivered',
                label: 'Delivered',
                time: new Date(shipment.delivered_at).toISOString(),
            });
        } else if (shipment?.status) {
            timeline.push({
                key: `status_${String(shipment.status).toLowerCase()}`,
                label: `Status: ${shipment.status}`,
                time: shipment.updated_at ? new Date(shipment.updated_at).toISOString() : null,
            });
        }

        return timeline;
    };

    const extractSkuHintFromOrderPayload = (items: any[] | undefined, selections: any) => {
        const firstItem = Array.isArray(items) && items.length > 0 ? items[0] : null;
        const skuCode = typeof firstItem?.sku === 'string'
            ? firstItem.sku.trim()
            : (typeof firstItem?.skuCode === 'string' ? firstItem.skuCode.trim() : null);
        const size = typeof selections?.size === 'string' ? selections.size.trim() : null;
        const color = typeof selections?.color === 'string' ? selections.color.trim() : null;
        return {
            skuCode: skuCode && skuCode.length > 0 ? skuCode : null,
            size: size && size.length > 0 ? size : null,
            color: color && color.length > 0 ? color : null,
        };
    };

    const reserveProductionSlot = async (
        db: { query: (sql: string, params?: any[]) => Promise<any> },
        options: { paymentTime: Date; defaultCapacity: number }
    ) => {
        const day = new Date(options.paymentTime);
        day.setUTCHours(0, 0, 0, 0);

        for (let offset = 0; offset < 30; offset += 1) {
            const slotDate = new Date(day);
            slotDate.setUTCDate(day.getUTCDate() + offset);
            const capacityDate = slotDate.toISOString().slice(0, 10);

            const reserved = await db.query(
                `INSERT INTO production_capacity_daily (capacity_date, capacity_total, reserved_count)
                 VALUES ($1, $2, 1)
                 ON CONFLICT (capacity_date)
                 DO UPDATE SET
                    reserved_count = production_capacity_daily.reserved_count + 1,
                    updated_at = NOW()
                 WHERE production_capacity_daily.reserved_count < production_capacity_daily.capacity_total
                 RETURNING capacity_date, capacity_total, reserved_count`,
                [capacityDate, options.defaultCapacity]
            );

            if ((reserved.rowCount || 0) > 0) {
                const row = reserved.rows[0];
                return {
                    capacityDate,
                    capacityTotal: Number(row.capacity_total),
                    reservedCount: Number(row.reserved_count),
                };
            }
        }

        throw new Error('no_available_capacity_slots_within_30_days');
    };

    const getQueueStats = async (queueName: string) => {
        if (queueName !== AI_QUEUE_NAME && queueName !== TRYON_QUEUE_NAME) {
            return {
                waiting: 0,
                active: 0,
                completed: 0,
                failed: 0,
                delayed: 0,
                paused: 0
            };
        }

        const stats = await getQueueStatsByName(queueName);
        setGauge('queue_depth', stats.waiting || 0, { queue: queueName, state: 'waiting' });
        setGauge('queue_depth', stats.active || 0, { queue: queueName, state: 'active' });
        setGauge('queue_depth', stats.completed || 0, { queue: queueName, state: 'completed' });
        setGauge('queue_depth', stats.failed || 0, { queue: queueName, state: 'failed' });
        setGauge('queue_depth', stats.delayed || 0, { queue: queueName, state: 'delayed' });
        setGauge('queue_depth', stats.paused || 0, { queue: queueName, state: 'paused' });
        return stats;
    };

    const buildJobOptions = () => {
        const attempts = Math.max(1, Number.parseInt(process.env.JOB_MAX_ATTEMPTS || '1', 10));
        const backoffMs = Math.max(0, Number.parseInt(process.env.JOB_BACKOFF_MS || '5000', 10));
        const removeOnComplete = Math.max(10, Number.parseInt(process.env.JOB_REMOVE_ON_COMPLETE || '100', 10));
        const removeOnFail = Math.max(10, Number.parseInt(process.env.JOB_REMOVE_ON_FAIL || '200', 10));

        return {
            attempts,
            backoff: attempts > 1 ? { type: 'fixed', delay: backoffMs } : undefined,
            removeOnComplete,
            removeOnFail
        };
    };

    const getQueueThreshold = (queueName: string) => {
        if (queueName === AI_QUEUE_NAME) {
            return Math.max(1, Number.parseInt(process.env.AI_QUEUE_MAX_WAITING || '100', 10));
        }
        if (queueName === TRYON_QUEUE_NAME) {
            return Math.max(1, Number.parseInt(process.env.TRYON_QUEUE_MAX_WAITING || '50', 10));
        }
        return Math.max(1, Number.parseInt(process.env.JOB_QUEUE_MAX_WAITING || '100', 10));
    };

    const assertQueueCapacity = async (queueName: typeof AI_QUEUE_NAME | typeof TRYON_QUEUE_NAME, res: any) => {
        const stats = await getQueueStats(queueName);
        const maxWaiting = getQueueThreshold(queueName);
        if ((stats.waiting || 0) >= maxWaiting) {
            incrementCounter('queue_overloaded_total', { queue: queueName });
            const retryAfter = Math.max(5, Number.parseInt(process.env.JOB_OVERLOAD_RETRY_AFTER || '15', 10));
            res.setHeader('Retry-After', String(retryAfter));
            sendError(res, 503, 'QUEUE_OVERLOADED', 'Queue overloaded, please retry later', {
                queue: queueName,
                retryAfter,
                queueStats: stats,
            });
            return false;
        }
        return true;
    };

    const getClientIp = (req: any) => {
        const forwarded = req.headers?.['x-forwarded-for'];
        if (typeof forwarded === 'string' && forwarded.trim().length > 0) {
            return forwarded.split(',')[0].trim();
        }
        if (Array.isArray(forwarded) && forwarded.length > 0) {
            return String(forwarded[0]).trim();
        }
        return req.ip || req.socket?.remoteAddress || 'unknown';
    };

    const assertRateLimit = async (
        req: any,
        res: any,
        options: {
            scope: string;
            queue: typeof AI_QUEUE_NAME | typeof TRYON_QUEUE_NAME;
            ipPerMinute: number;
            userPerMinute?: number;
        }
    ) => {
        const ip = getClientIp(req);
        const ipKey = `ip:${options.scope}:${options.queue}:${ip}`;
        const ipCheck = await rateLimiter.hit(ipKey, Math.max(1, options.ipPerMinute), 60_000);
        if (!ipCheck.allowed) {
            incrementCounter('rate_limited_total', { queue: options.queue, scope: 'ip' });
            res.setHeader('Retry-After', String(ipCheck.retryAfterSeconds));
            sendError(res, 429, 'RATE_LIMITED', 'Too many requests, please retry later', {
                scope: 'ip',
                queue: options.queue,
                retryAfter: ipCheck.retryAfterSeconds,
            });
            return false;
        }

        if (options.userPerMinute && req.userId) {
            const userKey = `user:${options.scope}:${options.queue}:${req.userId}`;
            const userCheck = await rateLimiter.hit(userKey, Math.max(1, options.userPerMinute), 60_000);
            if (!userCheck.allowed) {
                incrementCounter('rate_limited_total', { queue: options.queue, scope: 'user' });
                res.setHeader('Retry-After', String(userCheck.retryAfterSeconds));
                sendError(res, 429, 'RATE_LIMITED', 'Too many requests, please retry later', {
                    scope: 'user',
                    queue: options.queue,
                    retryAfter: userCheck.retryAfterSeconds,
                });
                return false;
            }
        }

        return true;
    };

    const getDailyBudgetLimit = (
        operation: typeof AI_QUEUE_NAME | typeof TRYON_QUEUE_NAME,
        scope: 'user' | 'global'
    ) => {
        const fallback = operation === AI_QUEUE_NAME
            ? (scope === 'user' ? 50 : 2000)
            : (scope === 'user' ? 20 : 1000);
        const envName = operation === AI_QUEUE_NAME
            ? (scope === 'user' ? 'AI_DAILY_USER_QUOTA' : 'AI_DAILY_GLOBAL_QUOTA')
            : (scope === 'user' ? 'TRYON_DAILY_USER_QUOTA' : 'TRYON_DAILY_GLOBAL_QUOTA');
        const parsed = Number.parseInt(process.env[envName] || '', 10);
        if (!Number.isFinite(parsed)) return fallback;
        return Math.max(0, parsed);
    };

    const consumeDailyAiBudget = async (
        userId: number | null,
        operation: typeof AI_QUEUE_NAME | typeof TRYON_QUEUE_NAME
    ): Promise<
        | { allowed: true; mode: 'degrade' | 'delay' | 'pause'; operation: typeof AI_QUEUE_NAME | typeof TRYON_QUEUE_NAME }
        | {
            allowed: false;
            mode: 'degrade' | 'delay' | 'pause';
            operation: typeof AI_QUEUE_NAME | typeof TRYON_QUEUE_NAME;
            scope: 'user' | 'global';
            limit: number;
            usageDate: string;
        }
    > => {
        const mode = getAiBudgetGuardMode();
        if (!isAiBudgetGuardEnabled()) {
            return { allowed: true, mode, operation };
        }

        const userQuota = getDailyBudgetLimit(operation, 'user');
        const globalQuota = getDailyBudgetLimit(operation, 'global');
        if ((!userId || userQuota <= 0) && globalQuota <= 0) {
            return { allowed: true, mode, operation };
        }

        const usageDate = new Date().toISOString().slice(0, 10);
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            if (userId && userQuota > 0) {
                const userResult = await client.query(
                    `INSERT INTO ai_budget_daily_counters (usage_date, operation, scope, user_key, user_id, used_count)
                     VALUES ($1, $2, 'user', $3, $3, 1)
                     ON CONFLICT (usage_date, operation, scope, user_key)
                     DO UPDATE SET used_count = ai_budget_daily_counters.used_count + 1, updated_at = NOW()
                     WHERE ai_budget_daily_counters.used_count < $4
                     RETURNING used_count`,
                    [usageDate, operation, userId, userQuota]
                );

                if ((userResult.rowCount || 0) === 0) {
                    await client.query('ROLLBACK');
                    return {
                        allowed: false,
                        mode,
                        operation,
                        scope: 'user',
                        limit: userQuota,
                        usageDate,
                    };
                }
            }

            if (globalQuota > 0) {
                const globalResult = await client.query(
                    `INSERT INTO ai_budget_daily_counters (usage_date, operation, scope, user_key, user_id, used_count)
                     VALUES ($1, $2, 'global', 0, NULL, 1)
                     ON CONFLICT (usage_date, operation, scope, user_key)
                     DO UPDATE SET used_count = ai_budget_daily_counters.used_count + 1, updated_at = NOW()
                     WHERE ai_budget_daily_counters.used_count < $3
                     RETURNING used_count`,
                    [usageDate, operation, globalQuota]
                );

                if ((globalResult.rowCount || 0) === 0) {
                    await client.query('ROLLBACK');
                    return {
                        allowed: false,
                        mode,
                        operation,
                        scope: 'global',
                        limit: globalQuota,
                        usageDate,
                    };
                }
            }

            await client.query('COMMIT');
            return { allowed: true, mode, operation };
        } catch (error) {
            try {
                await client.query('ROLLBACK');
            } catch {
                // ignore rollback failures
            }
            throw error;
        } finally {
            client.release();
        }
    };

    const assertAiBudgetGuard = async (
        req: any,
        res: any,
        operation: typeof AI_QUEUE_NAME | typeof TRYON_QUEUE_NAME
    ) => {
        const result = await consumeDailyAiBudget(req.userId || null, operation);
        if (result.allowed) return true;

        if (result.scope === 'user') {
            sendError(
                res,
                429,
                API_COMMON_ERROR_CODES.AI_BUDGET_USER_QUOTA_EXCEEDED,
                'Daily AI quota reached for this account. Please try again tomorrow.',
                {
                    scope: result.scope,
                    operation: result.operation,
                    dailyQuota: result.limit,
                    usageDate: result.usageDate,
                    mode: result.mode,
                }
            );
            return false;
        }

        if (result.mode === 'delay') {
            const retryAfter = Math.max(60, Number.parseInt(process.env.AI_BUDGET_DELAY_RETRY_AFTER_SECONDS || '600', 10));
            res.setHeader('Retry-After', String(retryAfter));
            sendError(
                res,
                429,
                API_COMMON_ERROR_CODES.AI_BUDGET_DELAYED,
                'AI budget guard is active. Requests are temporarily delayed, please retry later.',
                {
                    scope: result.scope,
                    operation: result.operation,
                    dailyQuota: result.limit,
                    usageDate: result.usageDate,
                    mode: result.mode,
                    retryAfter,
                }
            );
            return false;
        }

        const message = result.mode === 'pause'
            ? 'AI service is temporarily paused due to daily budget cap. Please use template mode and retry tomorrow.'
            : 'AI budget cap reached. System is degraded to template mode for the rest of today.';

        sendError(
            res,
            503,
            API_COMMON_ERROR_CODES.AI_BUDGET_GLOBAL_QUOTA_EXCEEDED,
            message,
            {
                scope: result.scope,
                operation: result.operation,
                dailyQuota: result.limit,
                usageDate: result.usageDate,
                mode: result.mode,
            }
        );
        return false;
    };

    const requireAdmin = async (req: any, res: any) => {
        if (!req.userId) {
            sendError(res, 401, 'UNAUTHORIZED', 'User ID not found');
            return null;
        }

        const user = await userModel.findUserById(req.userId);
        if (!user || !(user as any).is_admin) {
            sendError(res, 403, 'FORBIDDEN', 'Admin access required');
            return null;
        }

        return user;
    };

    const getBudgetQuota = (operation: typeof AI_QUEUE_NAME | typeof TRYON_QUEUE_NAME, scope: 'user' | 'global') => {
        const fallback = operation === AI_QUEUE_NAME
            ? (scope === 'user' ? 50 : 2000)
            : (scope === 'user' ? 20 : 1000);
        const envName = operation === AI_QUEUE_NAME
            ? (scope === 'user' ? 'AI_DAILY_USER_QUOTA' : 'AI_DAILY_GLOBAL_QUOTA')
            : (scope === 'user' ? 'TRYON_DAILY_USER_QUOTA' : 'TRYON_DAILY_GLOBAL_QUOTA');
        const parsed = Number.parseInt(process.env[envName] || '', 10);
        if (!Number.isFinite(parsed)) return fallback;
        return Math.max(0, parsed);
    };

    const estimateExhaustAt = (used: number, remaining: number, usageDate: string) => {
        if (remaining <= 0) return new Date().toISOString();
        if (used <= 0) return null;

        const startOfDayEpoch = Date.parse(`${usageDate}T00:00:00.000Z`);
        const elapsedSeconds = Math.max(1, Math.floor((Date.now() - startOfDayEpoch) / 1000));
        const perSecond = used / elapsedSeconds;
        if (!Number.isFinite(perSecond) || perSecond <= 0) return null;

        const etaSeconds = Math.ceil(remaining / perSecond);
        return new Date(Date.now() + etaSeconds * 1000).toISOString();
    };

    const baseMonthlyAmount = 198;
    const discountRate = 0.85;
    const membershipPlans: Record<string, { amount: number; currency: string; durationDays: number }> = {
        monthly: { amount: baseMonthlyAmount, currency: 'CNY', durationDays: 30 },
        quarterly: { amount: Number((baseMonthlyAmount * 3 * discountRate).toFixed(2)), currency: 'CNY', durationDays: 90 },
        'half-year': { amount: Number((baseMonthlyAmount * 6 * discountRate).toFixed(2)), currency: 'CNY', durationDays: 180 },
        yearly: { amount: Number((baseMonthlyAmount * 12 * discountRate).toFixed(2)), currency: 'CNY', durationDays: 365 }
    };

    // 注册路由
    router.post('/register', (req, res) => authController.register(req, res));

    // 登录路由
    router.post('/login', (req, res) => authController.login(req, res));

    // 公开画廊（展示商城作品，来源 all_designs 表）
    router.get('/gallery', async (req, res) => {
        try {
            const limit = req.query.limit ? Number(req.query.limit) : undefined;
            const offset = req.query.offset ? Number(req.query.offset) : undefined;
            const category = typeof req.query.category === 'string' ? req.query.category : undefined;
            const sortRaw = typeof req.query.sort === 'string' ? req.query.sort : undefined;
            const sort: 'new' | 'sales' = sortRaw === 'sales' ? 'sales' : 'new';
            const search = typeof req.query.search === 'string' ? req.query.search : undefined;

            const queryPayload = { limit, offset, category, sort, search };
            const cacheKey = `gallery:list:${stableStringify(queryPayload)}`;
            const payload = await readThroughCache('/gallery', cacheKey, cacheTtl.galleryList, async () => {
                const designs = await allDesignReadModel.list(queryPayload);
                return { designs };
            });

            res.json(payload);
        } catch (error) {
            console.error('Get gallery error:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    });

    // 发布作品到商城（不创建订单）
    router.post('/gallery/publish', authenticate, async (req, res) => {
        try {
            if (!req.userId) return res.status(401).json({ message: 'User ID not found' });

            const { selections, design, canvas, category } = req.body || {};
            if (!selections || !design) {
                return res.status(400).json({ message: 'Invalid publish payload' });
            }

            const resolvedCategory =
                (typeof category === 'string' && category.trim().length > 0 ? category.trim() : null) ||
                (typeof design?.category === 'string' && design.category.trim().length > 0 ? design.category.trim() : null);
            const normalizedCategory = normalizeCategory(resolvedCategory) ?? resolvedCategory;

            const canvasPayload = {
                frontSnapshot: canvas?.frontSnapshot ?? canvas?.front ?? design?.canvas?.snapshots?.front ?? null,
                backSnapshot: canvas?.backSnapshot ?? canvas?.back ?? design?.canvas?.snapshots?.back ?? null,
                meta: canvas?.meta ?? design?.canvas ?? null
            };

            const [designExternalized, selectionsExternalized, canvasExternalized] = await Promise.all([
                externalizeImageDataUrls(design, { context: 'gallery-design' }),
                externalizeImageDataUrls(selections, { context: 'gallery-selections' }),
                externalizeImageDataUrls(canvasPayload, { context: 'gallery-canvas' }),
            ]);

            const canvasMeta = mergeAssetRefs(
                canvasExternalized.value?.meta,
                [...designExternalized.assets, ...selectionsExternalized.assets, ...canvasExternalized.assets]
            );

            const created = await allDesignModel.createDesign({
                userId: req.userId,
                sourceOrderId: null,
                category: normalizedCategory ?? null,
                selections: selectionsExternalized.value,
                design: designExternalized.value,
                canvas: {
                    frontSnapshot: canvasExternalized.value?.frontSnapshot ?? null,
                    backSnapshot: canvasExternalized.value?.backSnapshot ?? null,
                    meta: canvasMeta,
                }
            });

            await invalidateGalleryCache(created?.id ?? null);

            res.status(201).json({ design: created, allDesignId: created?.id ?? null });
        } catch (error) {
            console.error('Publish gallery error:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    });

    router.get('/gallery/:designId', async (req, res) => {
        try {
            const designId = Number(req.params.designId);
            if (!Number.isFinite(designId) || designId <= 0) {
                return res.status(400).json({ message: 'Invalid designId' });
            }

            const cacheKey = `gallery:item:${designId}`;
            const cached = await cacheStore.get<{ design: unknown }>(cacheKey);
            if (cached !== null) {
                incrementCounter('cache_hits_total', { route: '/gallery/:designId' });
                markCache('/gallery/:designId', 'hit');
                return res.json(cached);
            }

            incrementCounter('cache_misses_total', { route: '/gallery/:designId' });
            incrementCounter('cache_backsource_total', { route: '/gallery/:designId' });
            markCache('/gallery/:designId', 'miss');

            const design = await allDesignReadModel.getById(designId);
            if (!design) {
                return res.status(404).json({ message: 'Not found' });
            }

            const payload = { design };
            await cacheStore.set(cacheKey, payload, cacheTtl.galleryItem);
            markCache('/gallery/:designId', 'store');
            res.json(payload);
        } catch (error) {
            markCache('/gallery/:designId', 'error');
            logError('gallery_item_failed', {
                requestId: res.locals?.requestId || null,
                route: '/gallery/:designId',
                designId: req.params.designId,
                error,
            });
            res.status(500).json({ message: 'Internal server error' });
        }
    });

    // AI 生成路由
    router.post('/generate', authenticate, async (req, res) => {
        try {
            if (!req.userId) return sendError(res, 401, 'UNAUTHORIZED', 'User ID not found');

            if (!isAiEnabled()) {
                return sendError(
                    res,
                    503,
                    'AI_DISABLED',
                    'AI customization is temporarily disabled. Please choose template products or try again later.'
                );
            }

            const membership = await membershipModel.getMembershipByUserId(req.userId);
            const expiresAt = membership?.expires_at ? new Date(membership.expires_at) : null;
            const isActive = Boolean(
                membership &&
                (!membership.status || membership.status === 'active') &&
                (!expiresAt || expiresAt.getTime() >= Date.now())
            );

            if (!isActive) {
                return sendError(res, 403, 'MEMBERSHIP_REQUIRED', 'Active membership required');
            }

            const { prompt } = req.body || {};
            if (!prompt || typeof prompt !== 'string') {
                return sendError(res, 400, 'INVALID_REQUEST', 'Prompt is required');
            }

            const ipLimit = Math.max(1, Number.parseInt(process.env.AI_RATE_LIMIT_IP_PER_MIN || '60', 10));
            const userLimit = Math.max(1, Number.parseInt(process.env.AI_RATE_LIMIT_USER_PER_MIN || '20', 10));
            const allowedByRate = await assertRateLimit(req, res, {
                scope: 'generate',
                queue: AI_QUEUE_NAME,
                ipPerMinute: ipLimit,
                userPerMinute: userLimit,
            });
            if (!allowedByRate) return;

            const allowedByBudget = await assertAiBudgetGuard(req, res, AI_QUEUE_NAME);
            if (!allowedByBudget) return;

            const canEnqueue = await assertQueueCapacity(AI_QUEUE_NAME, res);
            if (!canEnqueue) return;

            const generationOptions = parseAiGenerationOptions(req.body);

            const job = await enqueueJob(
                AI_QUEUE_NAME,
                {
                    userId: req.userId,
                    prompt: prompt.trim(),
                    ...generationOptions
                },
                buildJobOptions()
            );

            incrementCounter('jobs_enqueued_total', { queue: AI_QUEUE_NAME, source: 'generate' });

            return res.status(202).json({ jobId: job.id, queue: AI_QUEUE_NAME });
        } catch (error) {
            console.error('Membership gate error:', error);
            return sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
        }
    });

    router.post('/jobs', authenticateOptional, async (req, res) => {
        try {
            const { type, payload } = req.body || {};

            if (type !== AI_QUEUE_NAME && type !== TRYON_QUEUE_NAME) {
                return sendError(res, 400, 'INVALID_REQUEST', 'Invalid job type');
            }

            if (!isAiEnabled()) {
                return sendError(
                    res,
                    503,
                    'AI_DISABLED',
                    'AI customization is temporarily disabled. Please choose template products or try again later.'
                );
            }

            if (type === AI_QUEUE_NAME) {
                if (!req.userId) return sendError(res, 401, 'UNAUTHORIZED', 'User ID not found');

                const ipLimit = Math.max(1, Number.parseInt(process.env.AI_RATE_LIMIT_IP_PER_MIN || '60', 10));
                const userLimit = Math.max(1, Number.parseInt(process.env.AI_RATE_LIMIT_USER_PER_MIN || '20', 10));
                const allowedByRate = await assertRateLimit(req, res, {
                    scope: 'jobs',
                    queue: AI_QUEUE_NAME,
                    ipPerMinute: ipLimit,
                    userPerMinute: userLimit,
                });
                if (!allowedByRate) return;

                const allowedByBudget = await assertAiBudgetGuard(req, res, AI_QUEUE_NAME);
                if (!allowedByBudget) return;

                const membership = await membershipModel.getMembershipByUserId(req.userId);
                const expiresAt = membership?.expires_at ? new Date(membership.expires_at) : null;
                const isActive = Boolean(
                    membership &&
                    (!membership.status || membership.status === 'active') &&
                    (!expiresAt || expiresAt.getTime() >= Date.now())
                );

                if (!isActive) {
                    return sendError(res, 403, 'MEMBERSHIP_REQUIRED', 'Active membership required');
                }

                const prompt = typeof payload?.prompt === 'string' ? payload.prompt.trim() : '';
                if (!prompt) {
                    return sendError(res, 400, 'INVALID_REQUEST', 'Prompt is required');
                }

                const canEnqueue = await assertQueueCapacity(AI_QUEUE_NAME, res);
                if (!canEnqueue) return;

                const job = await enqueueJob(
                    AI_QUEUE_NAME,
                    {
                        userId: req.userId,
                        prompt,
                        ...parseAiGenerationOptions(payload)
                    },
                    buildJobOptions()
                );

                incrementCounter('jobs_enqueued_total', { queue: AI_QUEUE_NAME, source: 'jobs' });

                return res.status(202).json({
                    jobId: job.id,
                    queue: AI_QUEUE_NAME,
                    queueStats: await getQueueStats(AI_QUEUE_NAME)
                });
            }

            const personDataUrl = typeof payload?.personDataUrl === 'string' ? payload.personDataUrl : '';
            const clothDataUrl = typeof payload?.clothDataUrl === 'string' ? payload.clothDataUrl : '';
            if (!personDataUrl || !clothDataUrl) {
                return sendError(res, 400, 'INVALID_REQUEST', 'Missing try-on inputs');
            }

            const tryonIpLimit = Math.max(1, Number.parseInt(process.env.TRYON_RATE_LIMIT_IP_PER_MIN || '30', 10));
            const tryonUserLimit = Math.max(1, Number.parseInt(process.env.TRYON_RATE_LIMIT_USER_PER_MIN || '10', 10));
            const allowedByRate = await assertRateLimit(req, res, {
                scope: 'jobs',
                queue: TRYON_QUEUE_NAME,
                ipPerMinute: tryonIpLimit,
                userPerMinute: tryonUserLimit,
            });
            if (!allowedByRate) return;

            const allowedByBudget = await assertAiBudgetGuard(req, res, TRYON_QUEUE_NAME);
            if (!allowedByBudget) return;

            const canEnqueue = await assertQueueCapacity(TRYON_QUEUE_NAME, res);
            if (!canEnqueue) return;

            const job = await enqueueJob(
                TRYON_QUEUE_NAME,
                {
                    userId: req.userId,
                    personDataUrl,
                    clothDataUrl,
                    clothType: typeof payload?.clothType === 'string' ? payload.clothType : undefined
                },
                buildJobOptions()
            );

            incrementCounter('jobs_enqueued_total', { queue: TRYON_QUEUE_NAME, source: 'jobs' });

            return res.status(202).json({
                jobId: job.id,
                queue: TRYON_QUEUE_NAME,
                queueStats: await getQueueStats(TRYON_QUEUE_NAME)
            });
        } catch (error) {
            console.error('Create job error:', error);
            return sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
        }
    });

    router.get('/jobs/:queue/stats', authenticateOptional, async (req, res) => {
        try {
            const queue = getQueueByName(req.params.queue);
            if (!queue) {
                return sendError(res, 404, 'NOT_FOUND', 'Queue not found');
            }

            return res.json({ queue: queue.name, stats: await getQueueStats(queue.name) });
        } catch (error) {
            console.error('Get queue stats error:', error);
            return sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
        }
    });

    router.get('/jobs/:queue/:id', authenticateOptional, async (req, res) => {
        try {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            const queue = getQueueByName(req.params.queue);
            if (!queue) {
                return sendError(res, 404, 'NOT_FOUND', 'Queue not found');
            }

            const queueName = queue.name;
            if (queueName !== AI_QUEUE_NAME && queueName !== TRYON_QUEUE_NAME) {
                return sendError(res, 404, 'NOT_FOUND', 'Queue not found');
            }

            const job = await getJobById(queueName, req.params.id);
            if (!job) {
                return sendError(res, 404, 'NOT_FOUND', 'Job not found');
            }

            const ownerId = (job.data as any)?.userId as number | undefined;
            if (ownerId) {
                if (!req.userId) {
                    return sendError(res, 401, 'UNAUTHORIZED', 'User ID not found');
                }
                if (req.userId !== ownerId) {
                    const viewer = await userModel.findUserById(req.userId);
                    if (!viewer || !(viewer as any).is_admin) {
                        return sendError(res, 403, 'FORBIDDEN', 'Forbidden');
                    }
                }
            }

            return res.json({
                job: {
                    id: job.id,
                    queue: queue.name,
                    state: job.state,
                    progress: job.progress ?? 0,
                    result: job.result ?? null,
                    failedReason: job.failedReason ?? null,
                    attemptsMade: job.attemptsMade,
                    createdAt: job.createdAt,
                    finishedAt: job.finishedAt ?? null,
                    logs: job.logs.slice(-50)
                }
            });
        } catch (error) {
            console.error('Get job error:', error);
            return sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
        }
    });

    // 受保护的路由示例
    router.get('/profile', authenticate, async (req, res) => {
        try {
            // 添加类型检查
            if (!req.userId) {
                return res.status(401).json({ message: 'User ID not found' });
            }

            const user = await userModel.findUserById(req.userId);
            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }

            // Make sure invite_code exists for older accounts.
            const inviteCode = await userModel.getOrCreateInviteCode(user.id);

            const membership = await membershipModel.getMembershipByUserId(user.id);
            res.json({
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    created_at: user.created_at,
                    invite_code: inviteCode,
                    invited_by_user_id: (user as any).invited_by_user_id ?? null,
                    invite_redeemed_at: (user as any).invite_redeemed_at ?? null,
                    membership,
                    is_admin: (user as any).is_admin ?? false
                }
            });
        } catch (error) {
            res.status(500).json({ message: 'Internal server error' });
        }
    });

    // Referral / invite
    router.get('/referrals/me', authenticate, async (req, res) => {
        try {
            if (!req.userId) return res.status(401).json({ message: 'User ID not found' });
            const inviteCode = await userModel.getOrCreateInviteCode(req.userId);
            const inviteState = await pool.query(
                `SELECT invited_by_user_id, invite_redeemed_at
                 FROM users
                 WHERE id = $1
                 LIMIT 1`,
                [req.userId]
            );
            const stats = await pool.query(
                `SELECT COUNT(*)::int AS total_invites,
                        COALESCE(SUM(CASE WHEN rewarded_at IS NOT NULL THEN reward_amount ELSE 0 END), 0)::numeric AS total_rewards
                 FROM referral_redemptions
                 WHERE inviter_user_id = $1
                `,
                [req.userId]
            );
            res.json({
                invite_code: inviteCode,
                invited_by_user_id: inviteState.rows[0]?.invited_by_user_id ?? null,
                invite_redeemed_at: inviteState.rows[0]?.invite_redeemed_at ?? null,
                total_invites: stats.rows[0]?.total_invites ?? 0,
                total_rewards: Number(stats.rows[0]?.total_rewards ?? 0)
            });
        } catch (error) {
            console.error('Get referral stats error:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    });

    router.post('/referrals/redeem', authenticate, async (req, res) => {
        const client = await pool.connect();
        try {
            if (!req.userId) return res.status(401).json({ message: 'User ID not found' });
            const codeRaw = req.body?.code;
            const code = typeof codeRaw === 'string' ? codeRaw.trim().toUpperCase() : '';
            if (!code || code.length < 4 || code.length > 32) {
                return res.status(400).json({ message: 'Invalid invite code', code: 'INVALID_INVITE_CODE' });
            }

            await client.query('BEGIN');
            const invitee = await userModel.getUserForUpdate(client, req.userId);
            if (!invitee) {
                await client.query('ROLLBACK');
                return res.status(404).json({ message: 'User not found' });
            }
            if (invitee.invited_by_user_id || invitee.invite_redeemed_at) {
                await client.query('ROLLBACK');
                return res.status(409).json({
                    message: 'Invite code already redeemed',
                    code: 'ALREADY_REDEEMED'
                });
            }

            const inviter = await client.query(
                'SELECT id, username, email, invite_code FROM users WHERE invite_code = $1 LIMIT 1',
                [code]
            );
            const inviterUser = inviter.rows[0] || null;
            if (!inviterUser) {
                await client.query('ROLLBACK');
                return res.status(404).json({ message: 'Invite code not found', code: 'INVITE_CODE_NOT_FOUND' });
            }
            if (Number(inviterUser.id) === Number(req.userId)) {
                await client.query('ROLLBACK');
                return res.status(400).json({ message: 'Cannot redeem your own code', code: 'CANNOT_SELF_REDEEM' });
            }

            const marked = await userModel.markInviteRedeemed(client, {
                inviteeUserId: req.userId,
                inviterUserId: Number(inviterUser.id)
            });
            if (!marked) {
                await client.query('ROLLBACK');
                return res.status(409).json({ message: 'Invite code already redeemed', code: 'ALREADY_REDEEMED' });
            }

            const rewardAmount = 35;
            const inviteeMembership = await membershipModel.getMembershipByUserId(req.userId);
            const expiresAt = inviteeMembership?.expires_at ? new Date(inviteeMembership.expires_at) : null;
            const inviteeActive = Boolean(
                inviteeMembership &&
                (!inviteeMembership.status || inviteeMembership.status === 'active') &&
                (!expiresAt || expiresAt.getTime() >= Date.now())
            );

            let updatedMembership = null;
            if (inviteeActive) {
                updatedMembership = await membershipModel.creditBalance(client, {
                    userId: Number(inviterUser.id),
                    amount: rewardAmount,
                    currency: 'CNY',
                    rawPayload: {
                        type: 'referral_reward',
                        inviterUserId: Number(inviterUser.id),
                        inviteeUserId: req.userId,
                        inviteCode: code,
                        amount: rewardAmount
                    }
                });
            }

            await client.query(
                `INSERT INTO referral_redemptions (inviter_user_id, invitee_user_id, invite_code, reward_amount, rewarded_at)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (invitee_user_id) DO NOTHING`,
                [Number(inviterUser.id), req.userId, code, rewardAmount, inviteeActive ? new Date().toISOString() : null]
            );

            await client.query('COMMIT');
            res.json({
                success: true,
                inviter: { id: inviterUser.id, username: inviterUser.username, invite_code: inviterUser.invite_code },
                reward: inviteeActive ? { amount: rewardAmount, currency: 'CNY' } : null,
                pending: !inviteeActive,
                membership: updatedMembership
            });
        } catch (error) {
            console.error('Redeem invite code error:', error);
            try {
                await client.query('ROLLBACK');
            } catch {
                // ignore
            }
            res.status(500).json({ message: 'Internal server error' });
        } finally {
            client.release();
        }
    });

    // 创建订单
    router.post('/orders', authenticate, async (req, res) => {
        const client = await pool.connect();
        try {
            if (!req.userId) return res.status(401).json({ message: 'User ID not found' });

            const parsedOrderPayload = validateCreateOrderPayload(req.body || {});
            if (!parsedOrderPayload.success) {
                return sendError(res, 400, 'INVALID_REQUEST', 'Invalid order payload', {
                    errors: parsedOrderPayload.errors,
                });
            }
            const {
                total: totalNumber,
                items,
                selections,
                design,
                shipping_info,
                address: addressRaw,
                phone: phoneRaw,
                canvas,
                publishToAll,
                sourceAllId,
                category,
            } = parsedOrderPayload.data;

            const endpoint = '/orders';
            const idempotencyKey = getIdempotencyKey(req);
            if (idempotencyKey.length > 128) {
                return res.status(400).json({ message: 'Idempotency-Key must be <= 128 characters' });
            }
            const requestHash = idempotencyKey
                ? hashRequestPayload(endpoint, {
                    userId: req.userId,
                    body: req.body || {}
                })
                : null;
            let idempotencyRowId: number | null = null;

            await client.query('BEGIN');

            if (idempotencyKey) {
                const inserted = await client.query(
                    `INSERT INTO order_idempotency_keys (user_id, endpoint, idempotency_key, request_hash, status)
                     VALUES ($1, $2, $3, $4, 'pending')
                     ON CONFLICT (user_id, endpoint, idempotency_key) DO NOTHING
                     RETURNING id`,
                    [req.userId, endpoint, idempotencyKey, requestHash]
                );

                if ((inserted.rowCount || 0) > 0) {
                    idempotencyRowId = Number(inserted.rows[0].id);
                } else {
                    const existing = await client.query(
                        `SELECT id, request_hash, status, response_status, response_body
                         FROM order_idempotency_keys
                         WHERE user_id = $1 AND endpoint = $2 AND idempotency_key = $3
                         FOR UPDATE`,
                        [req.userId, endpoint, idempotencyKey]
                    );

                    const row = existing.rows[0];
                    if (!row) {
                        await client.query('ROLLBACK');
                        return res.status(409).json({ message: 'Idempotency key conflict, please retry', code: 'IDEMPOTENCY_CONFLICT' });
                    }

                    if (row.request_hash !== requestHash) {
                        await client.query('ROLLBACK');
                        return res.status(409).json({
                            message: 'Idempotency key has already been used with a different payload',
                            code: 'IDEMPOTENCY_KEY_REUSED'
                        });
                    }

                    if (row.status === 'completed' && row.response_body) {
                        await client.query('ROLLBACK');
                        res.setHeader('Idempotency-Replayed', 'true');
                        return res.status(Number(row.response_status) || 201).json(row.response_body);
                    }

                    await client.query('ROLLBACK');
                    return res.status(409).json({
                        message: 'An identical request is already being processed',
                        code: 'IDEMPOTENCY_IN_PROGRESS'
                    });
                }
            }

            // Membership wallet: orders are paid by deducting balance.
            const membership = await membershipModel.getMembershipForUpdate(client, req.userId);
            const expiresAt = membership?.expires_at ? new Date(membership.expires_at) : null;
            const isActive = Boolean(
                membership &&
                (!membership.status || membership.status === 'active') &&
                (!expiresAt || expiresAt.getTime() >= Date.now())
            );

            if (!isActive) {
                await client.query('ROLLBACK');
                return res.status(403).json({
                    message: 'Active membership required to place orders',
                    code: 'MEMBERSHIP_REQUIRED'
                });
            }

            const currentBalance = Number(membership?.balance ?? 0);
            if (!Number.isFinite(currentBalance) || currentBalance < totalNumber) {
                await client.query('ROLLBACK');
                return res.status(402).json({
                    message: 'Insufficient membership balance',
                    code: 'INSUFFICIENT_BALANCE',
                    balance: currentBalance,
                    required: totalNumber
                });
            }

            const newBalance = Number((currentBalance - totalNumber).toFixed(2));
            const updatedMembership = await membershipModel.updateBalanceAndMaybeCancel(client, {
                userId: req.userId,
                newBalance,
                cancelIfEmpty: true
            });

            const resolvedCategory =
                (typeof category === 'string' && category.trim().length > 0 ? category.trim() : null) ||
                (typeof design?.category === 'string' && design.category.trim().length > 0 ? design.category.trim() : null);

                const normalizedCategory = normalizeCategory(resolvedCategory) ?? resolvedCategory;
                console.log('[orders.create] category', {
                    userId: req.userId,
                    category: typeof category === 'string' ? category : null,
                    designCategory: typeof design?.category === 'string' ? design.category : null,
                    resolvedCategory,
                    normalizedCategory,
                    publishToAll: !!publishToAll
                });

            const canvasPayload = {
                frontSnapshot: canvas?.frontSnapshot ?? canvas?.front ?? design?.canvas?.snapshots?.front ?? null,
                backSnapshot: canvas?.backSnapshot ?? canvas?.back ?? design?.canvas?.snapshots?.back ?? null,
                meta: canvas?.meta ?? design?.canvas ?? null
            };

            const [itemsExternalized, selectionsExternalized, designExternalized, shippingExternalized, canvasExternalized] = await Promise.all([
                externalizeImageDataUrls(items, { context: 'order-items' }),
                externalizeImageDataUrls(selections || {}, { context: 'order-selections' }),
                externalizeImageDataUrls(design || {}, { context: 'order-design' }),
                externalizeImageDataUrls(shipping_info || {}, { context: 'order-shipping' }),
                externalizeImageDataUrls(canvasPayload, { context: 'order-canvas' }),
            ]);

            const orderAssetRefs = [
                ...itemsExternalized.assets,
                ...selectionsExternalized.assets,
                ...designExternalized.assets,
                ...shippingExternalized.assets,
                ...canvasExternalized.assets,
            ];

            const orderCanvasMeta = mergeAssetRefs(canvasExternalized.value?.meta, orderAssetRefs);

            const address =
                (typeof addressRaw === 'string' && addressRaw.trim().length > 0 ? addressRaw.trim() : null) ||
                (typeof shipping_info?.address === 'string' && shipping_info.address.trim().length > 0
                    ? shipping_info.address.trim()
                    : null);
            const phone =
                (typeof phoneRaw === 'string' && phoneRaw.trim().length > 0 ? phoneRaw.trim() : null) ||
                (typeof shipping_info?.phone === 'string' && shipping_info.phone.trim().length > 0
                    ? shipping_info.phone.trim()
                    : null);

            const created = await client.query(
                `
                INSERT INTO orders (user_id, total, category, items, selections, design, shipping_info, address, phone, order_time, canvas_front, canvas_back, canvas_meta, source_all_id)
                VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9, NOW(), $10, $11, $12::jsonb, $13)
                RETURNING id, user_id, total, category, status, payment_status, payment_channel, payment_order_id, paid_at, refund_status, refunded_at, sku_id, sku_snapshot, production_slot_date, production_due_at, promised_ship_at, items, selections, design, shipping_info, address, phone, order_time, canvas_front, canvas_back, canvas_meta, source_all_id, created_at
                `,
                [
                    req.userId,
                    totalNumber,
                    normalizedCategory ?? null,
                    JSON.stringify(itemsExternalized.value),
                    JSON.stringify(selectionsExternalized.value),
                    JSON.stringify(designExternalized.value),
                    JSON.stringify(shippingExternalized.value),
                    address,
                    phone,
                    canvasExternalized.value?.frontSnapshot ?? null,
                    canvasExternalized.value?.backSnapshot ?? null,
                    orderCanvasMeta ? JSON.stringify(orderCanvasMeta) : null,
                    sourceAllId ?? null
                ]
            );
            const createdOrder = created.rows[0];

            // Designer reward: if this order references a published design from another user, reward the designer.
            // Reward is idempotent per order via design_usage_rewards(order_id UNIQUE).
            if (sourceAllId && Number.isFinite(Number(sourceAllId))) {
                const source = await client.query(
                    `SELECT id, user_id
                     FROM all_designs
                     WHERE id = $1
                     LIMIT 1`,
                    [sourceAllId]
                );

                const designerUserId = Number(source.rows[0]?.user_id ?? 0);
                const buyerUserId = req.userId;
                if (designerUserId && designerUserId !== buyerUserId) {
                    const rewardAmount = 15;
                    const insertedReward = await client.query(
                        `INSERT INTO design_usage_rewards (order_id, source_all_id, buyer_user_id, designer_user_id, reward_amount)
                         VALUES ($1, $2, $3, $4, $5)
                         ON CONFLICT (order_id) DO NOTHING
                         RETURNING id`,
                        [createdOrder.id, sourceAllId, buyerUserId, designerUserId, rewardAmount]
                    );

                    if (insertedReward.rowCount && insertedReward.rowCount > 0) {
                        await membershipModel.creditBalance(client, {
                            userId: designerUserId,
                            amount: rewardAmount,
                            currency: 'CNY',
                            rawPayload: {
                                type: 'design_usage_reward',
                                designerUserId,
                                buyerUserId,
                                sourceAllId,
                                orderId: createdOrder.id,
                                amount: rewardAmount
                            }
                        });
                    }
                }
            }

            let allDesignId: number | null = null;
            if (publishToAll) {
                const allDesign = await client.query(
                    `
                    INSERT INTO all_designs (user_id, source_order_id, category, selections, design, canvas_front, canvas_back, canvas_meta)
                    VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8::jsonb)
                    RETURNING id, user_id, source_order_id, category, selections, design, canvas_front, canvas_back, canvas_meta, created_at
                    `,
                    [
                        req.userId,
                        createdOrder.id,
                        normalizedCategory ?? null,
                        JSON.stringify(selectionsExternalized.value),
                        JSON.stringify(designExternalized.value),
                        canvasExternalized.value?.frontSnapshot ?? null,
                        canvasExternalized.value?.backSnapshot ?? null,
                        orderCanvasMeta ? JSON.stringify(orderCanvasMeta) : null
                    ]
                );
                allDesignId = allDesign.rows[0]?.id ?? null;
                if (!sourceAllId && allDesignId) {
                    const attach = await client.query(
                        `UPDATE orders SET source_all_id = $1 WHERE id = $2 RETURNING source_all_id`,
                        [allDesignId, createdOrder.id]
                    );
                    createdOrder.source_all_id = attach.rows[0]?.source_all_id ?? allDesignId;
                }
            }

            const responseBody = { order: createdOrder, allDesignId, membership: updatedMembership };

            if (idempotencyRowId) {
                await client.query(
                    `UPDATE order_idempotency_keys
                     SET status = 'completed',
                         response_status = $2,
                         response_body = $3::jsonb,
                         created_order_ids = $4::jsonb,
                         updated_at = NOW()
                     WHERE id = $1`,
                    [
                        idempotencyRowId,
                        201,
                        JSON.stringify(responseBody),
                        JSON.stringify([createdOrder.id])
                    ]
                );
            }

            await client.query('COMMIT');
            await invalidateMembershipCache(req.userId);
            await invalidateOrderCache(req.userId);
            await invalidateAdminOrderCache();
            if (allDesignId) {
                await invalidateGalleryCache(allDesignId);
            }
            res.status(201).json(responseBody);
        } catch (error) {
            console.error('Create order error:', error);
            try {
                await client.query('ROLLBACK');
            } catch {
                // ignore
            }
            res.status(500).json({ message: 'Internal server error' });
        } finally {
            client.release();
        }
    });

    // Payment: create Alipay intent for an existing order.
    router.post('/payments/create-intent', authenticate, async (req, res) => {
        const client = await pool.connect();
        try {
            if (!req.userId) return sendError(res, 401, 'UNAUTHORIZED', 'User ID not found');

            const orderId = Number(req.body?.orderId);
            const amount = Number(req.body?.amount);
            const channel = typeof req.body?.channel === 'string' ? req.body.channel.trim().toLowerCase() : '';

            if (!Number.isFinite(orderId) || orderId <= 0) {
                return sendError(res, 400, API_COMMON_ERROR_CODES.INVALID_REQUEST, 'Invalid orderId');
            }
            if (!Number.isFinite(amount) || amount <= 0) {
                return sendError(res, 400, API_COMMON_ERROR_CODES.INVALID_REQUEST, 'Invalid amount');
            }
            if (channel !== 'alipay') {
                return sendError(res, 400, API_COMMON_ERROR_CODES.INVALID_REQUEST, 'Only alipay channel is supported');
            }

            await client.query('BEGIN');

            const orderResult = await client.query(
                `SELECT id, user_id, total, status, payment_status, payment_order_id
                 FROM orders
                 WHERE id = $1 AND user_id = $2
                 FOR UPDATE`,
                [orderId, req.userId]
            );

            const order = orderResult.rows[0];
            if (!order) {
                await client.query('ROLLBACK');
                return sendError(res, 404, 'NOT_FOUND', 'Order not found');
            }

            const total = Number(order.total);
            if (!Number.isFinite(total) || Math.abs(total - amount) > 0.01) {
                await client.query('ROLLBACK');
                return sendError(res, 409, API_COMMON_ERROR_CODES.INVALID_REQUEST, 'Amount mismatch with order total', {
                    orderTotal: total,
                    requestedAmount: amount,
                });
            }

            if (String(order.payment_status || '').toLowerCase() === 'paid') {
                await client.query('ROLLBACK');
                return sendError(res, 409, API_COMMON_ERROR_CODES.INVALID_REQUEST, 'Order has already been paid');
            }

            const paymentOrderId = (typeof order.payment_order_id === 'string' && order.payment_order_id.trim().length > 0)
                ? order.payment_order_id.trim()
                : `ALI_${Date.now()}_${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
            const eventId = `payevt_${randomUUID().replace(/-/g, '')}`;

            await client.query(
                `UPDATE orders
                 SET payment_status = 'pending',
                     payment_channel = 'alipay',
                     payment_order_id = $2,
                     paid_at = NULL
                 WHERE id = $1`,
                [orderId, paymentOrderId]
            );

            await client.query(
                `INSERT INTO payment_events (
                    event_id,
                    channel,
                    order_id,
                    payment_order_id,
                    event_type,
                    event_status,
                    payload,
                    processed_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW())`,
                [
                    eventId,
                    'alipay',
                    orderId,
                    paymentOrderId,
                    'payment_intent_created',
                    'pending',
                    JSON.stringify({
                        source: 'api.payments.create-intent',
                        userId: req.userId,
                        orderId,
                        amount,
                        channel: 'alipay',
                    }),
                ]
            );

            await client.query('COMMIT');
            await invalidateOrderCache(req.userId);
            await invalidateAdminOrderCache();

            const clientPayload = {
                provider: 'alipay',
                outTradeNo: paymentOrderId,
                totalAmount: Number(amount.toFixed(2)),
                subject: `Order #${orderId}`,
                timeoutExpress: '30m',
                notifyUrl: process.env.ALIPAY_NOTIFY_URL || null,
                returnUrl: process.env.ALIPAY_RETURN_URL || null,
            };

            return res.json({
                orderId,
                channel: 'alipay',
                amount: Number(amount.toFixed(2)),
                paymentOrderId,
                clientPayload,
            });
        } catch (error) {
            try {
                await client.query('ROLLBACK');
            } catch {
                // ignore rollback errors
            }
            console.error('Create payment intent error:', error);
            return sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
        } finally {
            client.release();
        }
    });

    // Payment webhook: Alipay callback with signature verification, anti-replay and idempotency.
    router.post('/payments/webhook/:channel', async (req, res) => {
        const client = await pool.connect();
        try {
            const channel = typeof req.params?.channel === 'string' ? req.params.channel.trim().toLowerCase() : '';
            if (channel !== 'alipay') {
                return sendError(res, 400, API_COMMON_ERROR_CODES.INVALID_REQUEST, 'Only alipay channel is supported');
            }

            const timestampHeader = typeof req.headers['x-alipay-timestamp'] === 'string'
                ? req.headers['x-alipay-timestamp'].trim()
                : '';
            const signatureHeader = typeof req.headers['x-alipay-signature'] === 'string'
                ? req.headers['x-alipay-signature'].trim()
                : '';

            if (!timestampHeader || !signatureHeader) {
                return sendError(res, 401, 'INVALID_SIGNATURE', 'Missing webhook signature headers');
            }

            const webhookSecret = (process.env.ALIPAY_WEBHOOK_SECRET || '').trim();
            if (!webhookSecret) {
                return sendError(res, 503, 'WEBHOOK_SECRET_MISSING', 'ALIPAY_WEBHOOK_SECRET is not configured');
            }

            const timestampMs = Number(timestampHeader);
            if (!Number.isFinite(timestampMs) || timestampMs <= 0) {
                return sendError(res, 400, API_COMMON_ERROR_CODES.INVALID_REQUEST, 'Invalid webhook timestamp');
            }

            const maxSkewSeconds = Math.max(30, Number.parseInt(process.env.ALIPAY_WEBHOOK_MAX_SKEW_SECONDS || '300', 10));
            const nowMs = Date.now();
            if (Math.abs(nowMs - timestampMs) > maxSkewSeconds * 1000) {
                return sendError(res, 401, 'WEBHOOK_REPLAY_BLOCKED', 'Webhook timestamp is outside allowed window', {
                    maxSkewSeconds,
                });
            }

            const signatureOk = verifyWebhookSignature(req.body || {}, timestampHeader, signatureHeader, webhookSecret);
            if (!signatureOk) {
                return sendError(res, 401, 'INVALID_SIGNATURE', 'Webhook signature verification failed');
            }

            const payload = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
            const eventIdRaw = payload.eventId ?? payload.event_id ?? payload.notify_id;
            const paymentOrderIdRaw = payload.paymentOrderId ?? payload.payment_order_id ?? payload.outTradeNo ?? payload.out_trade_no;
            const orderIdRaw = payload.orderId ?? payload.order_id;
            const tradeStatusRaw = payload.tradeStatus ?? payload.trade_status ?? payload.status;

            const eventId = typeof eventIdRaw === 'string' ? eventIdRaw.trim() : '';
            const paymentOrderId = typeof paymentOrderIdRaw === 'string' ? paymentOrderIdRaw.trim() : '';
            const orderId = Number(orderIdRaw);
            const tradeStatus = typeof tradeStatusRaw === 'string' ? tradeStatusRaw.trim().toUpperCase() : '';

            if (!eventId) {
                return sendError(res, 400, API_COMMON_ERROR_CODES.INVALID_REQUEST, 'Missing event_id');
            }
            if (!paymentOrderId && (!Number.isFinite(orderId) || orderId <= 0)) {
                return sendError(res, 400, API_COMMON_ERROR_CODES.INVALID_REQUEST, 'Missing payment_order_id or order_id');
            }

            let mappedStatus: 'paid' | 'failed' | 'cancelled' | 'pending' = 'pending';
            if (tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED' || tradeStatus === 'SUCCESS' || tradeStatus === 'PAID') {
                mappedStatus = 'paid';
            } else if (tradeStatus === 'TRADE_CLOSED' || tradeStatus === 'CLOSED' || tradeStatus === 'CANCELLED') {
                mappedStatus = 'cancelled';
            } else if (tradeStatus === 'FAILED' || tradeStatus === 'PAY_FAILED') {
                mappedStatus = 'failed';
            }

            await client.query('BEGIN');

            const insertedEvent = await client.query(
                `INSERT INTO payment_events (
                    event_id,
                    channel,
                    order_id,
                    payment_order_id,
                    event_type,
                    event_status,
                    payload,
                    processed_at
                ) VALUES ($1, $2, NULL, $3, $4, $5, $6::jsonb, NOW())
                ON CONFLICT (event_id) DO NOTHING
                RETURNING id`,
                [
                    eventId,
                    'alipay',
                    paymentOrderId || null,
                    'payment_webhook',
                    mappedStatus,
                    JSON.stringify({
                        source: 'api.payments.webhook',
                        channel: 'alipay',
                        timestamp: timestampHeader,
                        tradeStatus,
                        payload,
                    }),
                ]
            );

            if ((insertedEvent.rowCount || 0) === 0) {
                await client.query('COMMIT');
                return res.json({ success: true, idempotent: true, eventId });
            }

            const orderResult = await client.query(
                `SELECT id, user_id, total, payment_status, items, selections
                 FROM orders
                 WHERE ($1 <> '' AND payment_order_id = $1)
                    OR ($2 > 0 AND id = $2)
                 ORDER BY id DESC
                 LIMIT 1
                 FOR UPDATE`,
                [paymentOrderId, Number.isFinite(orderId) ? orderId : 0]
            );

            const order = orderResult.rows[0];
            if (!order) {
                await client.query('ROLLBACK');
                return sendError(res, 404, 'NOT_FOUND', 'Order not found for webhook event', {
                    eventId,
                    paymentOrderId: paymentOrderId || null,
                    orderId: Number.isFinite(orderId) ? orderId : null,
                });
            }

            const orderIdMatched = Number(order.id);
            const userIdMatched = Number(order.user_id);
            const currentPaymentStatus = String(order.payment_status || '').toLowerCase();

            if (mappedStatus === 'paid') {
                if (currentPaymentStatus !== 'paid') {
                    const paymentTime = new Date();
                    const defaultCapacity = Math.max(1, Number.parseInt(process.env.PRODUCTION_DEFAULT_DAILY_CAPACITY || '200', 10));
                    const reserved = await reserveProductionSlot(client, {
                        paymentTime,
                        defaultCapacity,
                    });

                    const selectionsObj = order.selections && typeof order.selections === 'object' ? order.selections : {};
                    const itemList = Array.isArray(order.items) ? order.items : [];
                    const skuHint = extractSkuHintFromOrderPayload(itemList, selectionsObj);

                    let skuSnapshot: Record<string, unknown> = {
                        skuCode: skuHint.skuCode,
                        size: skuHint.size,
                        color: skuHint.color,
                        snapshotPrice: Number(order.total),
                    };
                    let skuId: number | null = null;
                    let slaDays = Math.max(0, Number.parseInt(process.env.PRODUCTION_DEFAULT_SLA_DAYS || '1', 10));

                    if (skuHint.skuCode) {
                        const skuResult = await client.query(
                            `SELECT id, product_id, sku_code, size, color, price, sla_days, is_active
                             FROM product_skus
                             WHERE sku_code = $1
                             LIMIT 1`,
                            [skuHint.skuCode]
                        );
                        const sku = skuResult.rows[0];
                        if (sku) {
                            skuId = Number(sku.id);
                            slaDays = Math.max(0, Number(sku.sla_days) || slaDays);
                            skuSnapshot = {
                                skuId,
                                productId: Number(sku.product_id),
                                skuCode: sku.sku_code,
                                size: sku.size,
                                color: sku.color,
                                snapshotPrice: Number(sku.price),
                                isActive: Boolean(sku.is_active),
                                slaDays,
                            };
                        }
                    }

                    const productionDueAt = new Date(`${reserved.capacityDate}T23:59:59.000Z`);
                    const promisedShipAt = new Date(productionDueAt);
                    promisedShipAt.setUTCDate(promisedShipAt.getUTCDate() + slaDays);

                    await client.query(
                        `UPDATE orders
                         SET payment_status = 'paid',
                             payment_channel = 'alipay',
                             payment_order_id = COALESCE(NULLIF($2, ''), payment_order_id),
                             paid_at = COALESCE(paid_at, NOW()),
                             sku_id = COALESCE($3, sku_id),
                             sku_snapshot = COALESCE($4::jsonb, sku_snapshot),
                             production_slot_date = COALESCE($5::date, production_slot_date),
                             production_due_at = COALESCE($6::timestamp, production_due_at),
                             promised_ship_at = COALESCE($7::timestamp, promised_ship_at)
                         WHERE id = $1`,
                        [
                            orderIdMatched,
                            paymentOrderId,
                            skuId,
                            JSON.stringify(skuSnapshot),
                            reserved.capacityDate,
                            productionDueAt.toISOString(),
                            promisedShipAt.toISOString(),
                        ]
                    );
                }
            } else if (mappedStatus === 'failed' || mappedStatus === 'cancelled') {
                if (currentPaymentStatus !== 'paid') {
                    await client.query(
                        `UPDATE orders
                         SET payment_status = $2,
                             payment_channel = 'alipay',
                             payment_order_id = COALESCE(NULLIF($3, ''), payment_order_id)
                         WHERE id = $1`,
                        [orderIdMatched, mappedStatus, paymentOrderId]
                    );
                }
            }

            await client.query(
                `UPDATE payment_events
                 SET order_id = $2,
                     payment_order_id = COALESCE(NULLIF($3, ''), payment_order_id),
                     event_status = $4,
                     processed_at = NOW()
                 WHERE event_id = $1`,
                [eventId, orderIdMatched, paymentOrderId, mappedStatus]
            );

            await client.query('COMMIT');
            if (Number.isFinite(userIdMatched) && userIdMatched > 0) {
                await invalidateOrderCache(userIdMatched);
            }
            await invalidateAdminOrderCache();

            return res.json({
                success: true,
                idempotent: false,
                eventId,
                orderId: orderIdMatched,
                paymentStatus: mappedStatus,
            });
        } catch (error) {
            try {
                await client.query('ROLLBACK');
            } catch {
                // ignore rollback errors
            }
            console.error('Payment webhook error:', error);
            return sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
        } finally {
            client.release();
        }
    });

    // Admin: create shipment for an order (fulfillment start).
    router.post('/admin/orders/:id/ship', authenticate, async (req, res) => {
        const client = await pool.connect();
        try {
            const adminUser = await requireAdmin(req, res);
            if (!adminUser) return;

            const orderId = Number(req.params.id);
            if (!Number.isFinite(orderId) || orderId <= 0) {
                return sendError(res, 400, API_COMMON_ERROR_CODES.INVALID_REQUEST, 'Invalid order id');
            }

            const carrier = typeof req.body?.carrier === 'string' ? req.body.carrier.trim() : '';
            const trackingNo = typeof req.body?.trackingNo === 'string' ? req.body.trackingNo.trim() : '';
            const statusRaw = typeof req.body?.status === 'string' ? req.body.status.trim().toLowerCase() : 'shipping';
            const allowedStatus = new Set(['shipping', 'in_transit', 'delivered']);
            const status = allowedStatus.has(statusRaw) ? statusRaw : 'shipping';

            if (!carrier || !trackingNo) {
                return sendError(res, 400, API_COMMON_ERROR_CODES.INVALID_REQUEST, 'carrier and trackingNo are required');
            }

            await client.query('BEGIN');

            const orderResult = await client.query(
                `SELECT id, user_id, created_at
                 FROM orders
                 WHERE id = $1
                 LIMIT 1
                 FOR UPDATE`,
                [orderId]
            );
            const order = orderResult.rows[0];
            if (!order) {
                await client.query('ROLLBACK');
                return sendError(res, 404, 'NOT_FOUND', 'Order not found');
            }

            const shippedAt = status === 'delivered' ? new Date().toISOString() : new Date().toISOString();
            const deliveredAt = status === 'delivered' ? new Date().toISOString() : null;

            const shipmentResult = await client.query(
                `INSERT INTO shipments (order_id, carrier, tracking_no, status, shipped_at, delivered_at)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (order_id)
                 DO UPDATE SET
                    carrier = EXCLUDED.carrier,
                    tracking_no = EXCLUDED.tracking_no,
                    status = EXCLUDED.status,
                    shipped_at = COALESCE(shipments.shipped_at, EXCLUDED.shipped_at),
                    delivered_at = CASE
                        WHEN EXCLUDED.status = 'delivered' THEN COALESCE(shipments.delivered_at, EXCLUDED.delivered_at)
                        ELSE shipments.delivered_at
                    END,
                    updated_at = NOW()
                 RETURNING id, order_id, carrier, tracking_no, status, shipped_at, delivered_at, created_at, updated_at`,
                [orderId, carrier, trackingNo, status, shippedAt, deliveredAt]
            );
            const shipment = shipmentResult.rows[0];

            const targetOrderStatus = status === 'delivered' ? 'delivered' : 'shipping';
            await client.query(
                `UPDATE orders SET status = $2 WHERE id = $1`,
                [orderId, targetOrderStatus]
            );

            await client.query('COMMIT');

            const userId = Number(order.user_id);
            if (Number.isFinite(userId) && userId > 0) {
                await invalidateOrderCache(userId);
            }
            await invalidateAdminOrderCache();

            return res.status(201).json({
                shipment,
                timeline: buildTrackingTimeline(order.created_at, shipment),
            });
        } catch (error) {
            try {
                await client.query('ROLLBACK');
            } catch {
                // ignore rollback errors
            }
            console.error('Create shipment error:', error);
            return sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
        } finally {
            client.release();
        }
    });

    // Admin: update shipment status/tracking.
    router.put('/admin/shipments/:id', authenticate, async (req, res) => {
        const client = await pool.connect();
        try {
            const adminUser = await requireAdmin(req, res);
            if (!adminUser) return;

            const shipmentId = Number(req.params.id);
            if (!Number.isFinite(shipmentId) || shipmentId <= 0) {
                return sendError(res, 400, API_COMMON_ERROR_CODES.INVALID_REQUEST, 'Invalid shipment id');
            }

            const statusRaw = typeof req.body?.status === 'string' ? req.body.status.trim().toLowerCase() : '';
            const carrierRaw = typeof req.body?.carrier === 'string' ? req.body.carrier.trim() : '';
            const trackingNoRaw = typeof req.body?.trackingNo === 'string' ? req.body.trackingNo.trim() : '';

            const allowedStatus = new Set(['shipping', 'in_transit', 'delivered']);
            const status = allowedStatus.has(statusRaw) ? statusRaw : '';

            if (!status && !carrierRaw && !trackingNoRaw) {
                return sendError(res, 400, API_COMMON_ERROR_CODES.INVALID_REQUEST, 'No valid fields to update');
            }

            await client.query('BEGIN');

            const existingResult = await client.query(
                `SELECT s.id, s.order_id, s.status, s.carrier, s.tracking_no, s.shipped_at, s.delivered_at, s.created_at, s.updated_at,
                        o.user_id, o.created_at AS order_created_at
                 FROM shipments s
                 INNER JOIN orders o ON o.id = s.order_id
                 WHERE s.id = $1
                 LIMIT 1
                 FOR UPDATE`,
                [shipmentId]
            );
            const existing = existingResult.rows[0];
            if (!existing) {
                await client.query('ROLLBACK');
                return sendError(res, 404, 'NOT_FOUND', 'Shipment not found');
            }

            const nextStatus = status || String(existing.status || 'shipping').toLowerCase();
            const deliveredAt = nextStatus === 'delivered'
                ? (existing.delivered_at || new Date().toISOString())
                : existing.delivered_at;

            const updatedResult = await client.query(
                `UPDATE shipments
                 SET carrier = COALESCE(NULLIF($2, ''), carrier),
                     tracking_no = COALESCE(NULLIF($3, ''), tracking_no),
                     status = COALESCE(NULLIF($4, ''), status),
                     delivered_at = $5,
                     updated_at = NOW()
                 WHERE id = $1
                 RETURNING id, order_id, carrier, tracking_no, status, shipped_at, delivered_at, created_at, updated_at`,
                [shipmentId, carrierRaw, trackingNoRaw, nextStatus, deliveredAt]
            );
            const shipment = updatedResult.rows[0];

            const targetOrderStatus = nextStatus === 'delivered' ? 'delivered' : 'shipping';
            await client.query(
                `UPDATE orders SET status = $2 WHERE id = $1`,
                [Number(existing.order_id), targetOrderStatus]
            );

            await client.query('COMMIT');

            const userId = Number(existing.user_id);
            if (Number.isFinite(userId) && userId > 0) {
                await invalidateOrderCache(userId);
            }
            await invalidateAdminOrderCache();

            return res.json({
                shipment,
                timeline: buildTrackingTimeline(existing.order_created_at, shipment),
            });
        } catch (error) {
            try {
                await client.query('ROLLBACK');
            } catch {
                // ignore rollback errors
            }
            console.error('Update shipment error:', error);
            return sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
        } finally {
            client.release();
        }
    });

    // User: get order tracking timeline.
    router.get('/orders/:id/tracking', authenticate, async (req, res) => {
        try {
            if (!req.userId) return sendError(res, 401, 'UNAUTHORIZED', 'User ID not found');

            const orderId = Number(req.params.id);
            if (!Number.isFinite(orderId) || orderId <= 0) {
                return sendError(res, 400, API_COMMON_ERROR_CODES.INVALID_REQUEST, 'Invalid order id');
            }

            const result = await pool.query(
                `SELECT o.id AS order_id,
                        o.user_id,
                        o.created_at AS order_created_at,
                        o.status AS order_status,
                        s.id AS shipment_id,
                        s.carrier,
                        s.tracking_no,
                        s.status AS shipment_status,
                        s.shipped_at,
                        s.delivered_at,
                        s.updated_at AS shipment_updated_at
                 FROM orders o
                 LEFT JOIN shipments s ON s.order_id = o.id
                 WHERE o.id = $1 AND o.user_id = $2
                 LIMIT 1`,
                [orderId, req.userId]
            );

            const row = result.rows[0];
            if (!row) {
                return sendError(res, 404, 'NOT_FOUND', 'Order not found');
            }

            const shipment = row.shipment_id ? {
                id: Number(row.shipment_id),
                orderId: Number(row.order_id),
                carrier: row.carrier,
                trackingNo: row.tracking_no,
                status: row.shipment_status,
                shippedAt: row.shipped_at,
                deliveredAt: row.delivered_at,
                updatedAt: row.shipment_updated_at,
            } : null;

            return res.json({
                orderId: Number(row.order_id),
                orderStatus: row.order_status,
                shipment,
                timeline: buildTrackingTimeline(row.order_created_at, row.shipment_id ? {
                    status: row.shipment_status,
                    shipped_at: row.shipped_at,
                    delivered_at: row.delivered_at,
                    updated_at: row.shipment_updated_at,
                } : null),
            });
        } catch (error) {
            console.error('Get order tracking error:', error);
            return sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
        }
    });

    // User: create after-sales request (refund/return/exchange).
    router.post('/after-sales', authenticate, async (req, res) => {
        const client = await pool.connect();
        try {
            if (!req.userId) return sendError(res, 401, 'UNAUTHORIZED', 'User ID not found');

            const orderId = Number(req.body?.orderId);
            const typeRaw = typeof req.body?.type === 'string' ? req.body.type.trim().toLowerCase() : '';
            const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : null;
            const requestedAmountRaw = req.body?.requestedAmount;
            const requestedAmount = Number.isFinite(Number(requestedAmountRaw)) ? Number(requestedAmountRaw) : null;

            const allowedTypes = new Set(['refund', 'return', 'exchange']);
            if (!Number.isFinite(orderId) || orderId <= 0) {
                return sendError(res, 400, API_COMMON_ERROR_CODES.INVALID_REQUEST, 'Invalid orderId');
            }
            if (!allowedTypes.has(typeRaw)) {
                return sendError(res, 400, API_COMMON_ERROR_CODES.INVALID_REQUEST, 'Invalid after-sales type');
            }

            await client.query('BEGIN');

            const orderResult = await client.query(
                `SELECT id, user_id, total, payment_status, refund_status, created_at
                 FROM orders
                 WHERE id = $1 AND user_id = $2
                 LIMIT 1
                 FOR UPDATE`,
                [orderId, req.userId]
            );
            const order = orderResult.rows[0];
            if (!order) {
                await client.query('ROLLBACK');
                return sendError(res, 404, 'NOT_FOUND', 'Order not found');
            }

            const pendingExists = await client.query(
                `SELECT id
                 FROM after_sales_requests
                 WHERE order_id = $1
                   AND status IN ('pending', 'approved')
                 LIMIT 1`,
                [orderId]
            );
            if ((pendingExists.rowCount || 0) > 0) {
                await client.query('ROLLBACK');
                return sendError(res, 409, API_COMMON_ERROR_CODES.INVALID_REQUEST, 'An after-sales request is already in progress for this order');
            }

            const orderTotal = Number(order.total);
            const requestedAmountSafe = typeRaw === 'refund'
                ? (requestedAmount !== null && requestedAmount > 0 ? requestedAmount : orderTotal)
                : null;

            const createdResult = await client.query(
                `INSERT INTO after_sales_requests (
                    order_id,
                    user_id,
                    type,
                    reason,
                    status,
                    refund_status,
                    requested_amount,
                    updated_at
                 ) VALUES ($1, $2, $3, $4, 'pending', $5, $6, NOW())
                 RETURNING id, order_id, user_id, type, reason, status, refund_status, requested_amount, refund_amount, review_note, admin_id, reviewed_at, completed_at, created_at, updated_at`,
                [
                    orderId,
                    req.userId,
                    typeRaw,
                    reason,
                    typeRaw === 'refund' ? 'requested' : 'none',
                    requestedAmountSafe,
                ]
            );
            const requestRow = createdResult.rows[0];

            if (typeRaw === 'refund') {
                await client.query(
                    `UPDATE orders
                     SET refund_status = 'requested'
                     WHERE id = $1`,
                    [orderId]
                );
            }

            await client.query('COMMIT');

            await invalidateOrderCache(req.userId);
            await invalidateAdminOrderCache();

            return res.status(201).json({ request: requestRow });
        } catch (error) {
            try {
                await client.query('ROLLBACK');
            } catch {
                // ignore rollback errors
            }
            console.error('Create after-sales request error:', error);
            return sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
        } finally {
            client.release();
        }
    });

    // User: list my after-sales requests for full traceability.
    router.get('/after-sales/me', authenticate, async (req, res) => {
        try {
            if (!req.userId) return sendError(res, 401, 'UNAUTHORIZED', 'User ID not found');

            const result = await pool.query(
                `SELECT a.id,
                        a.order_id,
                        a.user_id,
                        a.type,
                        a.reason,
                        a.status,
                        a.refund_status,
                        a.requested_amount,
                        a.refund_amount,
                        a.review_note,
                        a.admin_id,
                        a.reviewed_at,
                        a.completed_at,
                        a.created_at,
                        a.updated_at,
                        o.status AS order_status,
                        o.payment_status,
                        o.refund_status AS order_refund_status
                 FROM after_sales_requests a
                 INNER JOIN orders o ON o.id = a.order_id
                 WHERE a.user_id = $1
                 ORDER BY a.created_at DESC`,
                [req.userId]
            );

            return res.json({ requests: result.rows || [] });
        } catch (error) {
            console.error('Get my after-sales requests error:', error);
            return sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
        }
    });

    // Admin: list after-sales requests.
    router.get('/admin/after-sales', authenticate, async (req, res) => {
        try {
            const adminUser = await requireAdmin(req, res);
            if (!adminUser) return;

            const result = await pool.query(
                `SELECT a.id,
                        a.order_id,
                        a.user_id,
                        a.type,
                        a.reason,
                        a.status,
                        a.refund_status,
                        a.requested_amount,
                        a.refund_amount,
                        a.review_note,
                        a.admin_id,
                        a.reviewed_at,
                        a.completed_at,
                        a.created_at,
                        a.updated_at,
                        o.status AS order_status,
                        o.payment_status,
                        o.refund_status AS order_refund_status,
                        u.username,
                        u.email
                 FROM after_sales_requests a
                 INNER JOIN orders o ON o.id = a.order_id
                 LEFT JOIN users u ON u.id = a.user_id
                 ORDER BY a.created_at DESC`,
                []
            );

            return res.json({ requests: result.rows || [] });
        } catch (error) {
            console.error('Get admin after-sales requests error:', error);
            return sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
        }
    });

    // Admin: review/update after-sales request.
    router.put('/admin/after-sales/:id', authenticate, async (req, res) => {
        const client = await pool.connect();
        try {
            const adminUser = await requireAdmin(req, res);
            if (!adminUser) return;

            const requestId = Number(req.params.id);
            const statusRaw = typeof req.body?.status === 'string' ? req.body.status.trim().toLowerCase() : '';
            const reviewNote = typeof req.body?.reviewNote === 'string' ? req.body.reviewNote.trim() : null;
            const refundAmountInput = Number(req.body?.refundAmount);
            const refundAmount = Number.isFinite(refundAmountInput) ? refundAmountInput : null;

            const allowedStatus = new Set(['approved', 'rejected', 'completed']);
            if (!Number.isFinite(requestId) || requestId <= 0) {
                return sendError(res, 400, API_COMMON_ERROR_CODES.INVALID_REQUEST, 'Invalid request id');
            }
            if (!allowedStatus.has(statusRaw)) {
                return sendError(res, 400, API_COMMON_ERROR_CODES.INVALID_REQUEST, 'Invalid review status');
            }

            await client.query('BEGIN');

            const existingResult = await client.query(
                `SELECT a.id,
                        a.order_id,
                        a.user_id,
                        a.type,
                        a.status,
                        a.refund_status,
                        a.requested_amount,
                        a.refund_amount,
                        o.total,
                        o.payment_order_id,
                        o.refund_status AS order_refund_status
                 FROM after_sales_requests a
                 INNER JOIN orders o ON o.id = a.order_id
                 WHERE a.id = $1
                 LIMIT 1
                 FOR UPDATE`,
                [requestId]
            );
            const existing = existingResult.rows[0];
            if (!existing) {
                await client.query('ROLLBACK');
                return sendError(res, 404, 'NOT_FOUND', 'After-sales request not found');
            }

            const type = String(existing.type || '').toLowerCase();
            const isRefund = type === 'refund';
            const nowIso = new Date().toISOString();

            let nextRefundStatus = String(existing.refund_status || 'none').toLowerCase();
            let nextCompletedAt: string | null = null;
            let orderRefundStatus: string | null = null;
            let orderRefundedAt: string | null = null;

            if (statusRaw === 'approved') {
                if (isRefund) {
                    nextRefundStatus = 'processing';
                    orderRefundStatus = 'processing';

                    await client.query(
                        `INSERT INTO payment_events (
                            event_id,
                            channel,
                            order_id,
                            payment_order_id,
                            event_type,
                            event_status,
                            payload,
                            processed_at
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW())
                        ON CONFLICT (event_id) DO NOTHING`,
                        [
                            `refundreq_${requestId}_${Date.now()}`,
                            'alipay',
                            Number(existing.order_id),
                            existing.payment_order_id || null,
                            'refund_requested',
                            'processing',
                            JSON.stringify({
                                source: 'api.admin.after-sales.review',
                                requestId,
                                orderId: Number(existing.order_id),
                                userId: Number(existing.user_id),
                                requestedAmount: Number(existing.requested_amount || existing.total || 0),
                                approvedAmount: refundAmount,
                            }),
                        ]
                    );
                }
            } else if (statusRaw === 'rejected') {
                if (isRefund) {
                    nextRefundStatus = 'rejected';
                    orderRefundStatus = 'rejected';
                }
                nextCompletedAt = nowIso;
            } else if (statusRaw === 'completed') {
                nextCompletedAt = nowIso;
                if (isRefund) {
                    nextRefundStatus = 'refunded';
                    orderRefundStatus = 'refunded';
                    orderRefundedAt = nowIso;

                    await client.query(
                        `INSERT INTO payment_events (
                            event_id,
                            channel,
                            order_id,
                            payment_order_id,
                            event_type,
                            event_status,
                            payload,
                            processed_at
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW())
                        ON CONFLICT (event_id) DO NOTHING`,
                        [
                            `refunddone_${requestId}_${Date.now()}`,
                            'alipay',
                            Number(existing.order_id),
                            existing.payment_order_id || null,
                            'refund_completed',
                            'refunded',
                            JSON.stringify({
                                source: 'api.admin.after-sales.review',
                                requestId,
                                orderId: Number(existing.order_id),
                                userId: Number(existing.user_id),
                                finalRefundAmount: Number(refundAmount || existing.requested_amount || existing.total || 0),
                            }),
                        ]
                    );
                }
            }

            const finalRefundAmount = isRefund
                ? (refundAmount !== null && refundAmount > 0
                    ? refundAmount
                    : Number(existing.refund_amount || existing.requested_amount || existing.total || 0))
                : null;

            const updatedResult = await client.query(
                `UPDATE after_sales_requests
                 SET status = $2,
                     refund_status = $3,
                     refund_amount = COALESCE($4, refund_amount),
                     review_note = COALESCE($5, review_note),
                     admin_id = $6,
                     reviewed_at = NOW(),
                     completed_at = COALESCE($7, completed_at),
                     updated_at = NOW()
                 WHERE id = $1
                 RETURNING id, order_id, user_id, type, reason, status, refund_status, requested_amount, refund_amount, review_note, admin_id, reviewed_at, completed_at, created_at, updated_at`,
                [
                    requestId,
                    statusRaw,
                    nextRefundStatus,
                    finalRefundAmount,
                    reviewNote,
                    Number((adminUser as any).id),
                    nextCompletedAt,
                ]
            );
            const requestRow = updatedResult.rows[0];

            if (isRefund && orderRefundStatus) {
                await client.query(
                    `UPDATE orders
                     SET refund_status = $2,
                         refunded_at = CASE WHEN $3::timestamp IS NULL THEN refunded_at ELSE $3::timestamp END
                     WHERE id = $1`,
                    [Number(existing.order_id), orderRefundStatus, orderRefundedAt]
                );
            }

            await client.query('COMMIT');

            const userId = Number(existing.user_id);
            if (Number.isFinite(userId) && userId > 0) {
                await invalidateOrderCache(userId);
            }
            await invalidateAdminOrderCache();

            return res.json({ request: requestRow });
        } catch (error) {
            try {
                await client.query('ROLLBACK');
            } catch {
                // ignore rollback errors
            }
            console.error('Review after-sales request error:', error);
            return sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
        } finally {
            client.release();
        }
    });

    // 购物车：获取列表
    router.get('/cart', authenticate, async (req, res) => {
        try {
            if (!req.userId) return res.status(401).json({ message: 'User ID not found' });
            const cacheKey = `cart:list:${req.userId}:v1`;
            const payload = await readThroughCache('/cart', cacheKey, cacheTtl.cartList, async () => {
                const items = await cartReadModel.listCartItems(req.userId as number);
                return { items };
            });
            res.json(payload);
        } catch (error) {
            console.error('Get cart error:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    });

    // 购物车：添加
    router.post('/cart', authenticate, async (req, res) => {
        try {
            if (!req.userId) return res.status(401).json({ message: 'User ID not found' });

            const { items, selections, design, quantity, price, category, canvas, sourceAllId, publishToAll } = req.body || {};
            if (!items || !Array.isArray(items)) {
                return res.status(400).json({ message: 'Invalid cart payload' });
            }

            const canvasPayload = {
                frontSnapshot: canvas?.frontSnapshot ?? canvas?.front ?? design?.canvas?.snapshots?.front ?? null,
                backSnapshot: canvas?.backSnapshot ?? canvas?.back ?? design?.canvas?.snapshots?.back ?? null,
                meta: canvas?.meta ?? design?.canvas ?? null
            };

            const [itemsExternalized, selectionsExternalized, designExternalized, canvasExternalized] = await Promise.all([
                externalizeImageDataUrls(items, { context: 'cart-items' }),
                externalizeImageDataUrls(selections || {}, { context: 'cart-selections' }),
                externalizeImageDataUrls(design || {}, { context: 'cart-design' }),
                externalizeImageDataUrls(canvasPayload, { context: 'cart-canvas' }),
            ]);

            const cartAssetRefs = [
                ...itemsExternalized.assets,
                ...selectionsExternalized.assets,
                ...designExternalized.assets,
                ...canvasExternalized.assets,
            ];

            const cartCanvasMeta = mergeAssetRefs(canvasExternalized.value?.meta, cartAssetRefs);

            const created = await cartModel.createCartItem({
                userId: req.userId,
                quantity: typeof quantity === 'number' ? quantity : 1,
                price: typeof price === 'number' ? price : Number(price) || 0,
                category: typeof category === 'string' ? category : null,
                items: itemsExternalized.value,
                selections: selectionsExternalized.value,
                design: designExternalized.value,
                canvas: {
                    frontSnapshot: canvasExternalized.value?.frontSnapshot ?? null,
                    backSnapshot: canvasExternalized.value?.backSnapshot ?? null,
                    meta: cartCanvasMeta,
                },
                sourceAllId: typeof sourceAllId === 'number' ? sourceAllId : null,
                publishToAll: publishToAll !== false
            });

            await invalidateCartCache(req.userId);

            res.status(201).json({ item: created });
        } catch (error) {
            console.error('Add cart error:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    });

    // 购物车：更新数量/发布
    router.put('/cart/:id', authenticate, async (req, res) => {
        try {
            if (!req.userId) return res.status(401).json({ message: 'User ID not found' });
            const cartId = Number(req.params.id);
            if (!Number.isFinite(cartId) || cartId <= 0) {
                return res.status(400).json({ message: 'Invalid cart item id' });
            }

            const quantity = typeof req.body?.quantity === 'number' ? req.body.quantity : undefined;
            const publishToAll = typeof req.body?.publishToAll === 'boolean' ? req.body.publishToAll : undefined;

            const updated = await cartModel.updateCartItem(req.userId, cartId, { quantity, publishToAll });
            if (!updated) {
                return res.status(404).json({ message: 'Cart item not found' });
            }

            await invalidateCartCache(req.userId);

            res.json({ item: updated });
        } catch (error) {
            console.error('Update cart error:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    });

    // 购物车：删除
    router.delete('/cart/:id', authenticate, async (req, res) => {
        try {
            if (!req.userId) return res.status(401).json({ message: 'User ID not found' });
            const cartId = Number(req.params.id);
            if (!Number.isFinite(cartId) || cartId <= 0) {
                return res.status(400).json({ message: 'Invalid cart item id' });
            }

            const removed = await cartModel.removeCartItem(req.userId, cartId);
            if (!removed) {
                return res.status(404).json({ message: 'Cart item not found' });
            }

            await invalidateCartCache(req.userId);

            res.json({ success: true });
        } catch (error) {
            console.error('Remove cart error:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    });

    // 购物车：清空
    router.post('/cart/clear', authenticate, async (req, res) => {
        try {
            if (!req.userId) return res.status(401).json({ message: 'User ID not found' });
            await cartModel.clearCart(req.userId);
            await invalidateCartCache(req.userId);
            res.json({ success: true });
        } catch (error) {
            console.error('Clear cart error:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    });

    // 购物车：结算
    router.post('/cart/checkout', authenticate, async (req, res) => {
        const client = await pool.connect();
        try {
            if (!req.userId) return res.status(401).json({ message: 'User ID not found' });

            const parsedCheckoutPayload = validateCheckoutPayload(req.body || {});
            if (!parsedCheckoutPayload.success) {
                return sendError(res, 400, 'INVALID_REQUEST', 'Invalid checkout payload', {
                    errors: parsedCheckoutPayload.errors,
                });
            }
            const { address, phone } = parsedCheckoutPayload.data;

            const endpoint = '/cart/checkout';
            const idempotencyKey = getIdempotencyKey(req);
            if (idempotencyKey.length > 128) {
                return res.status(400).json({ message: 'Idempotency-Key must be <= 128 characters' });
            }
            const requestHash = idempotencyKey
                ? hashRequestPayload(endpoint, {
                    userId: req.userId,
                    body: req.body || {}
                })
                : null;
            let idempotencyRowId: number | null = null;

            await client.query('BEGIN');

            if (idempotencyKey) {
                const inserted = await client.query(
                    `INSERT INTO order_idempotency_keys (user_id, endpoint, idempotency_key, request_hash, status)
                     VALUES ($1, $2, $3, $4, 'pending')
                     ON CONFLICT (user_id, endpoint, idempotency_key) DO NOTHING
                     RETURNING id`,
                    [req.userId, endpoint, idempotencyKey, requestHash]
                );

                if ((inserted.rowCount || 0) > 0) {
                    idempotencyRowId = Number(inserted.rows[0].id);
                } else {
                    const existing = await client.query(
                        `SELECT id, request_hash, status, response_status, response_body
                         FROM order_idempotency_keys
                         WHERE user_id = $1 AND endpoint = $2 AND idempotency_key = $3
                         FOR UPDATE`,
                        [req.userId, endpoint, idempotencyKey]
                    );

                    const row = existing.rows[0];
                    if (!row) {
                        await client.query('ROLLBACK');
                        return res.status(409).json({ message: 'Idempotency key conflict, please retry', code: 'IDEMPOTENCY_CONFLICT' });
                    }

                    if (row.request_hash !== requestHash) {
                        await client.query('ROLLBACK');
                        return res.status(409).json({
                            message: 'Idempotency key has already been used with a different payload',
                            code: 'IDEMPOTENCY_KEY_REUSED'
                        });
                    }

                    if (row.status === 'completed' && row.response_body) {
                        await client.query('ROLLBACK');
                        res.setHeader('Idempotency-Replayed', 'true');
                        return res.status(Number(row.response_status) || 201).json(row.response_body);
                    }

                    await client.query('ROLLBACK');
                    return res.status(409).json({
                        message: 'An identical request is already being processed',
                        code: 'IDEMPOTENCY_IN_PROGRESS'
                    });
                }
            }

            const cartItems = await cartModel.getCartItemsForUpdate(client, req.userId);
            if (!cartItems.length) {
                await client.query('ROLLBACK');
                return res.status(400).json({ message: 'Cart is empty' });
            }

            const totalSum = cartItems.reduce((sum, item) => {
                const qty = Math.max(1, Number(item.quantity) || 1);
                const price = Number(item.price) || 0;
                return sum + price * qty;
            }, 0);

            const membership = await membershipModel.getMembershipForUpdate(client, req.userId);
            const expiresAt = membership?.expires_at ? new Date(membership.expires_at) : null;
            const isActive = Boolean(
                membership &&
                (!membership.status || membership.status === 'active') &&
                (!expiresAt || expiresAt.getTime() >= Date.now())
            );

            if (!isActive) {
                await client.query('ROLLBACK');
                return res.status(403).json({
                    message: 'Active membership required to place orders',
                    code: 'MEMBERSHIP_REQUIRED'
                });
            }

            const currentBalance = Number(membership?.balance ?? 0);
            if (!Number.isFinite(currentBalance) || currentBalance < totalSum) {
                await client.query('ROLLBACK');
                return res.status(402).json({
                    message: 'Insufficient membership balance',
                    code: 'INSUFFICIENT_BALANCE',
                    balance: currentBalance,
                    required: totalSum
                });
            }

            const newBalance = Number((currentBalance - totalSum).toFixed(2));
            const updatedMembership = await membershipModel.updateBalanceAndMaybeCancel(client, {
                userId: req.userId,
                newBalance,
                cancelIfEmpty: true
            });

            const createdOrders: any[] = [];

            for (const cartItem of cartItems) {
                const qty = Math.max(1, Number(cartItem.quantity) || 1);
                const price = Number(cartItem.price) || 0;
                const orderTotal = Number((price * qty).toFixed(2));

                const resolvedCategory =
                    (typeof cartItem.category === 'string' && cartItem.category.trim().length > 0 ? cartItem.category.trim() : null) ||
                    (typeof cartItem.design?.category === 'string' && cartItem.design.category.trim().length > 0 ? cartItem.design.category.trim() : null);

                const normalizedCategory = normalizeCategory(resolvedCategory) ?? resolvedCategory;

                const canvasPayload = {
                    frontSnapshot: cartItem.canvas_front ?? null,
                    backSnapshot: cartItem.canvas_back ?? null,
                    meta: cartItem.canvas_meta ?? null
                };

                const [itemsExternalized, selectionsExternalized, designExternalized, shippingExternalized, canvasExternalized] = await Promise.all([
                    externalizeImageDataUrls(cartItem.items || [], { context: 'checkout-items' }),
                    externalizeImageDataUrls({ ...(cartItem.selections || {}), quantity: qty }, { context: 'checkout-selections' }),
                    externalizeImageDataUrls(cartItem.design || {}, { context: 'checkout-design' }),
                    externalizeImageDataUrls({ address }, { context: 'checkout-shipping' }),
                    externalizeImageDataUrls(canvasPayload, { context: 'checkout-canvas' }),
                ]);

                const checkoutAssetRefs = [
                    ...itemsExternalized.assets,
                    ...selectionsExternalized.assets,
                    ...designExternalized.assets,
                    ...shippingExternalized.assets,
                    ...canvasExternalized.assets,
                ];

                const checkoutCanvasMeta = mergeAssetRefs(canvasExternalized.value?.meta, checkoutAssetRefs);

                const selectionsWithQty = selectionsExternalized.value;

                const created = await client.query(
                    `
                    INSERT INTO orders (user_id, total, category, items, selections, design, shipping_info, address, phone, order_time, canvas_front, canvas_back, canvas_meta, source_all_id)
                    VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9, NOW(), $10, $11, $12::jsonb, $13)
                    RETURNING id, user_id, total, category, status, payment_status, payment_channel, payment_order_id, paid_at, refund_status, refunded_at, sku_id, sku_snapshot, production_slot_date, production_due_at, promised_ship_at, items, selections, design, shipping_info, address, phone, order_time, canvas_front, canvas_back, canvas_meta, source_all_id, created_at
                    `,
                    [
                        req.userId,
                        orderTotal,
                        normalizedCategory ?? null,
                        JSON.stringify(itemsExternalized.value),
                        JSON.stringify(selectionsWithQty),
                        JSON.stringify(designExternalized.value),
                        JSON.stringify(shippingExternalized.value),
                        address,
                        phone || null,
                        canvasExternalized.value?.frontSnapshot ?? null,
                        canvasExternalized.value?.backSnapshot ?? null,
                        checkoutCanvasMeta ? JSON.stringify(checkoutCanvasMeta) : null,
                        cartItem.source_all_id ?? null
                    ]
                );
                const createdOrder = created.rows[0];
                createdOrders.push(createdOrder);

                if (cartItem.source_all_id && Number.isFinite(Number(cartItem.source_all_id))) {
                    const source = await client.query(
                        `SELECT id, user_id
                         FROM all_designs
                         WHERE id = $1
                         LIMIT 1`,
                        [cartItem.source_all_id]
                    );

                    const designerUserId = Number(source.rows[0]?.user_id ?? 0);
                    const buyerUserId = req.userId;
                    if (designerUserId && designerUserId !== buyerUserId) {
                        const rewardAmount = 15;
                        const insertedReward = await client.query(
                            `INSERT INTO design_usage_rewards (order_id, source_all_id, buyer_user_id, designer_user_id, reward_amount)
                             VALUES ($1, $2, $3, $4, $5)
                             ON CONFLICT (order_id) DO NOTHING
                             RETURNING id`,
                            [createdOrder.id, cartItem.source_all_id, buyerUserId, designerUserId, rewardAmount]
                        );

                        if (insertedReward.rowCount && insertedReward.rowCount > 0) {
                            await membershipModel.creditBalance(client, {
                                userId: designerUserId,
                                amount: rewardAmount,
                                currency: 'CNY',
                                rawPayload: {
                                    type: 'design_usage_reward',
                                    designerUserId,
                                    buyerUserId,
                                    sourceAllId: cartItem.source_all_id,
                                    orderId: createdOrder.id,
                                    amount: rewardAmount
                                }
                            });
                        }
                    }
                }

                if (cartItem.publish_to_all) {
                    const allDesign = await client.query(
                        `
                        INSERT INTO all_designs (user_id, source_order_id, category, selections, design, canvas_front, canvas_back, canvas_meta)
                        VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8::jsonb)
                        RETURNING id
                        `,
                        [
                            req.userId,
                            createdOrder.id,
                            normalizedCategory ?? null,
                            JSON.stringify(selectionsWithQty || {}),
                            JSON.stringify(designExternalized.value),
                            canvasExternalized.value?.frontSnapshot ?? null,
                            canvasExternalized.value?.backSnapshot ?? null,
                            checkoutCanvasMeta ? JSON.stringify(checkoutCanvasMeta) : null
                        ]
                    );
                    const allDesignId = allDesign.rows[0]?.id ?? null;
                    if (!cartItem.source_all_id && allDesignId) {
                        await client.query(
                            `UPDATE orders SET source_all_id = $1 WHERE id = $2`,
                            [allDesignId, createdOrder.id]
                        );
                        createdOrder.source_all_id = allDesignId;
                    }
                }
            }

            await client.query(`DELETE FROM cart_items WHERE user_id = $1`, [req.userId]);

            const responseBody = { orders: createdOrders, membership: updatedMembership };

            if (idempotencyRowId) {
                await client.query(
                    `UPDATE order_idempotency_keys
                     SET status = 'completed',
                         response_status = $2,
                         response_body = $3::jsonb,
                         created_order_ids = $4::jsonb,
                         updated_at = NOW()
                     WHERE id = $1`,
                    [
                        idempotencyRowId,
                        201,
                        JSON.stringify(responseBody),
                        JSON.stringify(createdOrders.map((order) => order.id))
                    ]
                );
            }

            await client.query('COMMIT');
            await invalidateMembershipCache(req.userId);
            await invalidateCartCache(req.userId);
            await invalidateOrderCache(req.userId);
            await invalidateAdminOrderCache();
            await invalidateGalleryCache(null);
            res.status(201).json(responseBody);
        } catch (error) {
            console.error('Cart checkout error:', error);
            try {
                await client.query('ROLLBACK');
            } catch {
                // ignore
            }
            res.status(500).json({ message: 'Internal server error' });
        } finally {
            client.release();
        }
    });

    // Debug: inspect category normalization/aliases (auth required)
    router.get('/debug/category', authenticate, async (req, res) => {
        try {
            const raw = typeof req.query?.value === 'string' ? req.query.value : '';
            const normalized = normalizeCategory(raw);
            res.json({
                input: raw,
                normalized,
                aliases: normalized ? categoryAliases(normalized) : []
            });
        } catch (error) {
            console.error('Debug category error:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    });

    // 获取用户订单历史
    router.get('/orders/summary', authenticate, async (req, res) => {
        try {
            if (!req.userId) return res.status(401).json({ message: 'User ID not found' });
            const limitRaw = Number.parseInt(String(req.query.limit || '30'), 10);
            const limit = Number.isFinite(limitRaw) ? limitRaw : 30;
            const cacheKey = `orders:summary:${req.userId}:${limit}:v1`;
            const payload = await readThroughCache('/orders/summary', cacheKey, cacheTtl.orderSummary, async () => {
                const orders = await orderReadModel.getOrderSummariesByUserId(req.userId as number, limit);
                return { orders };
            });
            res.json(payload);
        } catch (error) {
            console.error('Get order summaries error:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    });

    router.get('/orders', authenticate, async (req, res) => {
        try {
            if (!req.userId) return res.status(401).json({ message: 'User ID not found' });
            const cacheKey = `orders:list:${req.userId}:v1`;
            const payload = await readThroughCache('/orders', cacheKey, cacheTtl.orderList, async () => {
                const orders = await orderReadModel.getOrdersByUserId(req.userId as number);
                return { orders };
            });
            res.json(payload);
        } catch (error) {
            console.error('Get orders error:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    });

    // Admin: list all orders with user info
    router.get('/admin/orders', authenticate, async (req, res) => {
        try {
            const adminUser = await requireAdmin(req, res);
            if (!adminUser) return;

            const cacheKey = 'orders:admin:list:v1';
            const payload = await readThroughCache('/admin/orders', cacheKey, cacheTtl.adminOrders, async () => {
                const orders = await orderReadModel.getAllOrders();
                return { orders };
            });
            res.json(payload);
        } catch (error) {
            console.error('Get admin orders error:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    });

    // Admin: fetch latest billing reconciliation report (on-demand)
    router.get('/admin/reconciliation/latest', authenticate, async (req, res) => {
        try {
            const adminUser = await requireAdmin(req, res);
            if (!adminUser) return;

            const lookbackHoursRaw = Number.parseInt(String(req.query.lookbackHours || ''), 10);
            const lookbackHours = Number.isFinite(lookbackHoursRaw)
                ? Math.min(Math.max(lookbackHoursRaw, 1), 168)
                : Math.max(1, Number.parseInt(process.env.BILLING_RECONCILIATION_LOOKBACK_HOURS || '24', 10) || 24);

            const report = await runBillingReconciliation(pool, {
                lookbackHours,
                sampleLimit: 20,
            });

            res.json({ report });
        } catch (error) {
            console.error('Get admin reconciliation report error:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    });

    // Admin: today's AI budget usage dashboard
    router.get('/admin/ai-budget/today', authenticate, async (req, res) => {
        try {
            const adminUser = await requireAdmin(req, res);
            if (!adminUser) return;

            const usageDate = new Date().toISOString().slice(0, 10);
            const guardMode = getAiBudgetGuardMode();

            const globalRows = await pool.query(
                `SELECT operation, used_count
                 FROM ai_budget_daily_counters
                 WHERE usage_date = $1
                   AND scope = 'global'
                   AND user_key = 0`,
                [usageDate]
            );

            const globalUsageMap = new Map<string, number>();
            for (const row of globalRows.rows as Array<{ operation: string; used_count: number }>) {
                globalUsageMap.set(String(row.operation), Number(row.used_count) || 0);
            }

            const operations: Array<typeof AI_QUEUE_NAME | typeof TRYON_QUEUE_NAME> = [AI_QUEUE_NAME, TRYON_QUEUE_NAME];
            const global = operations.map((operation) => {
                const quota = getBudgetQuota(operation, 'global');
                const used = globalUsageMap.get(operation) || 0;
                const remaining = Math.max(0, quota - used);
                const usageRate = quota > 0 ? Number((used / quota).toFixed(4)) : 0;
                return {
                    operation,
                    quota,
                    used,
                    remaining,
                    usageRate,
                    estimatedExhaustAt: estimateExhaustAt(used, remaining, usageDate),
                };
            });

            const userRows = await pool.query(
                `SELECT
                    c.user_id,
                    c.operation,
                    c.used_count,
                    u.username,
                    u.email
                 FROM ai_budget_daily_counters c
                 LEFT JOIN users u ON u.id = c.user_id
                 WHERE c.usage_date = $1
                   AND c.scope = 'user'
                 ORDER BY c.used_count DESC
                 LIMIT 100`,
                [usageDate]
            );

            const users = (userRows.rows as Array<{
                user_id: number;
                operation: string;
                used_count: number;
                username: string | null;
                email: string | null;
            }>).map((row) => {
                const operation = row.operation === TRYON_QUEUE_NAME ? TRYON_QUEUE_NAME : AI_QUEUE_NAME;
                const quota = getBudgetQuota(operation, 'user');
                const used = Number(row.used_count) || 0;
                return {
                    userId: Number(row.user_id),
                    operation,
                    quota,
                    used,
                    usageRate: quota > 0 ? Number((used / quota).toFixed(4)) : 0,
                    username: row.username,
                    email: row.email,
                };
            });

            res.json({
                usageDate,
                generatedAt: new Date().toISOString(),
                guardMode,
                global,
                users,
            });
        } catch (error) {
            console.error('Get admin ai budget usage error:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    });

    // Admin: product and SKU master data (make-to-order).
    router.get('/admin/products', authenticate, async (req, res) => {
        try {
            const adminUser = await requireAdmin(req, res);
            if (!adminUser) return;

            const result = await pool.query(
                `SELECT p.id, p.name, p.description, p.is_active, p.created_at, p.updated_at,
                        COALESCE(
                            json_agg(
                                json_build_object(
                                    'id', s.id,
                                    'skuCode', s.sku_code,
                                    'size', s.size,
                                    'color', s.color,
                                    'price', s.price,
                                    'slaDays', s.sla_days,
                                    'isActive', s.is_active,
                                    'metadata', s.metadata,
                                    'createdAt', s.created_at,
                                    'updatedAt', s.updated_at
                                )
                                ORDER BY s.id
                            ) FILTER (WHERE s.id IS NOT NULL),
                            '[]'::json
                        ) AS skus
                 FROM products p
                 LEFT JOIN product_skus s ON s.product_id = p.id
                 GROUP BY p.id
                 ORDER BY p.id DESC`
            );

            return res.json({ products: result.rows || [] });
        } catch (error) {
            console.error('Get admin products error:', error);
            return sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
        }
    });

    router.post('/admin/products', authenticate, async (req, res) => {
        try {
            const adminUser = await requireAdmin(req, res);
            if (!adminUser) return;

            const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
            const description = typeof req.body?.description === 'string' ? req.body.description.trim() : null;
            const isActive = typeof req.body?.isActive === 'boolean' ? req.body.isActive : true;
            if (!name) {
                return sendError(res, 400, API_COMMON_ERROR_CODES.INVALID_REQUEST, 'name is required');
            }

            const created = await pool.query(
                `INSERT INTO products (name, description, is_active, updated_at)
                 VALUES ($1, $2, $3, NOW())
                 RETURNING id, name, description, is_active, created_at, updated_at`,
                [name, description, isActive]
            );

            return res.status(201).json({ product: created.rows[0] });
        } catch (error) {
            console.error('Create admin product error:', error);
            return sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
        }
    });

    router.post('/admin/product-skus', authenticate, async (req, res) => {
        try {
            const adminUser = await requireAdmin(req, res);
            if (!adminUser) return;

            const productId = Number(req.body?.productId);
            const skuCode = typeof req.body?.skuCode === 'string' ? req.body.skuCode.trim() : '';
            const size = typeof req.body?.size === 'string' ? req.body.size.trim() : null;
            const color = typeof req.body?.color === 'string' ? req.body.color.trim() : null;
            const price = Number(req.body?.price);
            const slaDaysRaw = Number(req.body?.slaDays);
            const slaDays = Number.isFinite(slaDaysRaw) ? Math.max(0, Math.trunc(slaDaysRaw)) : 1;
            const isActive = typeof req.body?.isActive === 'boolean' ? req.body.isActive : true;

            if (!Number.isFinite(productId) || productId <= 0 || !skuCode || !Number.isFinite(price) || price <= 0) {
                return sendError(res, 400, API_COMMON_ERROR_CODES.INVALID_REQUEST, 'productId, skuCode, price are required');
            }

            const created = await pool.query(
                `INSERT INTO product_skus (product_id, sku_code, size, color, price, sla_days, is_active, metadata, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW())
                 RETURNING id, product_id, sku_code, size, color, price, sla_days, is_active, metadata, created_at, updated_at`,
                [productId, skuCode, size, color, price, slaDays, isActive, JSON.stringify(req.body?.metadata ?? null)]
            );

            return res.status(201).json({ sku: created.rows[0] });
        } catch (error) {
            console.error('Create admin product sku error:', error);
            return sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
        }
    });

    router.put('/admin/product-skus/:id', authenticate, async (req, res) => {
        try {
            const adminUser = await requireAdmin(req, res);
            if (!adminUser) return;

            const skuId = Number(req.params.id);
            if (!Number.isFinite(skuId) || skuId <= 0) {
                return sendError(res, 400, API_COMMON_ERROR_CODES.INVALID_REQUEST, 'Invalid sku id');
            }

            const priceInput = req.body?.price;
            const slaDaysInput = req.body?.slaDays;
            const isActiveInput = req.body?.isActive;

            const price = Number.isFinite(Number(priceInput)) ? Number(priceInput) : null;
            const slaDays = Number.isFinite(Number(slaDaysInput)) ? Math.max(0, Math.trunc(Number(slaDaysInput))) : null;
            const isActive = typeof isActiveInput === 'boolean' ? isActiveInput : null;

            if (price === null && slaDays === null && isActive === null) {
                return sendError(res, 400, API_COMMON_ERROR_CODES.INVALID_REQUEST, 'No valid fields to update');
            }

            const updated = await pool.query(
                `UPDATE product_skus
                 SET price = COALESCE($2, price),
                     sla_days = COALESCE($3, sla_days),
                     is_active = COALESCE($4, is_active),
                     updated_at = NOW()
                 WHERE id = $1
                 RETURNING id, product_id, sku_code, size, color, price, sla_days, is_active, metadata, created_at, updated_at`,
                [skuId, price, slaDays, isActive]
            );

            if ((updated.rowCount || 0) === 0) {
                return sendError(res, 404, 'NOT_FOUND', 'SKU not found');
            }

            return res.json({ sku: updated.rows[0] });
        } catch (error) {
            console.error('Update admin product sku error:', error);
            return sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
        }
    });

    router.put('/admin/production-capacity/:date', authenticate, async (req, res) => {
        try {
            const adminUser = await requireAdmin(req, res);
            if (!adminUser) return;

            const dateRaw = typeof req.params.date === 'string' ? req.params.date.trim() : '';
            const capacityTotal = Number(req.body?.capacityTotal);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRaw) || !Number.isFinite(capacityTotal) || capacityTotal < 0) {
                return sendError(res, 400, API_COMMON_ERROR_CODES.INVALID_REQUEST, 'Invalid date or capacityTotal');
            }

            const updated = await pool.query(
                `INSERT INTO production_capacity_daily (capacity_date, capacity_total, reserved_count, updated_at)
                 VALUES ($1, $2, 0, NOW())
                 ON CONFLICT (capacity_date)
                 DO UPDATE SET
                    capacity_total = EXCLUDED.capacity_total,
                    updated_at = NOW()
                 RETURNING id, capacity_date, capacity_total, reserved_count, created_at, updated_at`,
                [dateRaw, Math.trunc(capacityTotal)]
            );

            return res.json({ capacity: updated.rows[0] });
        } catch (error) {
            console.error('Update production capacity error:', error);
            return sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
        }
    });

    // Admin: update order status
    router.put('/admin/orders/:orderId/status', authenticate, async (req, res) => {
        try {
            const adminUser = await requireAdmin(req, res);
            if (!adminUser) return;

            const orderId = Number(req.params.orderId);
            if (!Number.isFinite(orderId) || orderId <= 0) {
                return res.status(400).json({ message: 'Invalid orderId' });
            }

            const status = typeof req.body?.status === 'string' ? req.body.status.trim() : '';
            if (!status) {
                return res.status(400).json({ message: 'Status is required' });
            }

            const updated = await orderModel.updateOrderStatus(orderId, status);
            if (!updated) {
                return res.status(404).json({ message: 'Order not found' });
            }

            await invalidateAdminOrderCache();
            const targetUserId = Number((updated as any)?.user_id);
            if (Number.isFinite(targetUserId) && targetUserId > 0) {
                await invalidateOrderCache(targetUserId);
            }

            res.json({
                order: updated,
                statusTransition: {
                    before: (updated as any)?.previous_status ?? null,
                    after: (updated as any)?.status ?? null,
                },
            });
        } catch (error) {
            console.error('Update order status error:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    });

    // Admin: update admin credentials (email/password)
    router.put('/admin/credentials', authenticate, async (req, res) => {
        try {
            const adminUser = await requireAdmin(req, res);
            if (!adminUser) return;

            const { email, password } = req.body || {};
            const updates: string[] = [];
            const values: any[] = [];
            let idx = 1;

            if (typeof email === 'string' && email.trim().length > 0) {
                const emailTrimmed = email.trim();
                const existing = await userModel.findUserByEmail(emailTrimmed);
                if (existing && Number(existing.id) !== Number((adminUser as any).id)) {
                    return res.status(409).json({ message: 'Email already exists' });
                }
                updates.push(`email = $${idx}`);
                values.push(emailTrimmed);
                idx++;
            }

            if (typeof password === 'string' && password.trim().length >= 6) {
                const hashed = await hashPassword(password.trim());
                updates.push(`password = $${idx}`);
                values.push(hashed);
                idx++;
            }

            if (updates.length === 0) {
                return res.status(400).json({ message: 'No valid fields to update' });
            }

            values.push((adminUser as any).id);
            const updateQuery = `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id, username, email, created_at, invite_code, invited_by_user_id, invite_redeemed_at, is_admin`;
            const updated = await pool.query(updateQuery, values);
            const user = updated.rows[0];
            res.json({ message: 'Admin credentials updated', user });
        } catch (error) {
            console.error('Update admin credentials error:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    });

    router.get('/memberships/me', authenticate, async (req, res) => {
        try {
            if (!req.userId) return res.status(401).json({ message: 'User ID not found' });

            const cacheKey = `membership:me:${req.userId}:v1`;

            const payload = await readThroughCache('/memberships/me', cacheKey, cacheTtl.membershipMe, async () => {
                const membership = await membershipReadModel.getMembershipByUserId(req.userId as number);
                return { membership };
            });
            res.json(payload);
        } catch (error) {
            logError('membership_me_failed', {
                requestId: res.locals?.requestId || null,
                route: '/memberships/me',
                userId: req.userId || null,
                error,
            });
            res.status(500).json({ message: 'Internal server error' });
        }
    });

    router.get('/memberships/transactions/me', authenticate, async (req, res) => {
        try {
            if (!req.userId) return res.status(401).json({ message: 'User ID not found' });
            const limit = req.query.limit ? Number(req.query.limit) : 50;
            const cacheKey = `membership:transactions:${req.userId}:${limit}:v1`;
            const payload = await readThroughCache('/memberships/transactions/me', cacheKey, cacheTtl.membershipTransactions, async () => {
                const transactions = await membershipReadModel.getTransactionsByUserId(req.userId as number, limit);
                return { transactions };
            });
            res.json(payload);
        } catch (error) {
            console.error('Get membership transactions error:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    });

    router.post('/memberships', authenticate, async (req, res) => {
        try {
            if (!req.userId) return res.status(401).json({ message: 'User ID not found' });

            const parsedMembershipPayload = validateCreateMembershipPayload(req.body || {}, Object.keys(membershipPlans));
            if (!parsedMembershipPayload.success) {
                return sendError(res, 400, 'INVALID_REQUEST', 'Invalid membership payload', {
                    errors: parsedMembershipPayload.errors,
                });
            }
            const { planId, paymentReference, provider, rawPayload } = parsedMembershipPayload.data;

            const planConfig = membershipPlans[planId];

            const transactionId = typeof paymentReference === 'string' && paymentReference.trim().length > 0
                ? paymentReference.trim()
                : randomUUID();

            const expiresAt = new Date(Date.now() + planConfig.durationDays * 24 * 60 * 60 * 1000);

            const membership = await membershipModel.upsertMembership({
                userId: req.userId,
                planId,
                amount: planConfig.amount,
                balance: planConfig.amount,
                currency: planConfig.currency,
                transactionId,
                provider: typeof provider === 'string' && provider ? provider : 'manual',
                expiresAt,
                rawPayload: rawPayload ?? null
            });

            // If user redeemed an invite code before purchasing, pay the inviter now.
            try {
                const pending = await pool.query(
                    `SELECT inviter_user_id, reward_amount
                     FROM referral_redemptions
                     WHERE invitee_user_id = $1
                       AND rewarded_at IS NULL
                     LIMIT 1`,
                    [req.userId]
                );
                const row = pending.rows[0];
                if (row?.inviter_user_id) {
                    const rewardAmount = Number(row.reward_amount ?? 35);
                    const updatedMembership = await membershipModel.creditBalance(pool, {
                        userId: Number(row.inviter_user_id),
                        amount: rewardAmount,
                        currency: 'CNY',
                        rawPayload: {
                            type: 'referral_reward',
                            inviterUserId: Number(row.inviter_user_id),
                            inviteeUserId: req.userId,
                            amount: rewardAmount
                        }
                    });
                    await pool.query(
                        `UPDATE referral_redemptions
                         SET rewarded_at = NOW()
                         WHERE invitee_user_id = $1
                           AND rewarded_at IS NULL`,
                        [req.userId]
                    );
                    // Optional: attach reward info for the invitee response
                    (membership as any).referral_reward = {
                        inviter_user_id: Number(row.inviter_user_id),
                        amount: rewardAmount,
                        currency: 'CNY'
                    };
                    await invalidateMembershipCache(Number(row.inviter_user_id));
                    void updatedMembership;
                }
            } catch (error) {
                console.warn('Referral reward on membership purchase failed:', error);
            }

            await invalidateMembershipCache(req.userId);
            res.status(201).json({ membership });
        } catch (error) {
            console.error('Create membership error:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    });

    // 新增：更新用户资料的路由
    router.put('/profile', authenticate, async (req, res) => {
        try {
            if (!req.userId) {
                return res.status(401).json({ message: 'User ID not found' });
            }

            const { username } = req.body;

            if (!username || username.trim() === '') {
                return res.status(400).json({ message: 'Username is required' });
            }

            // 检查用户名是否已被其他用户使用
            const existingUser = await userModel.findUserByUsername(username);
            if (existingUser && existingUser.id !== req.userId) {
                return res.status(409).json({ message: 'Username already exists' });
            }

            const updatedUser = await userModel.updateUser(req.userId, { username });

            if (!updatedUser) {
                return res.status(404).json({ message: 'User not found' });
            }

            res.json({
                message: 'Profile updated successfully',
                user: {
                    id: updatedUser.id,
                    username: updatedUser.username,
                    email: updatedUser.email
                }
            });
        } catch (error) {
            console.error('Profile update error:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    });

    return router;
};