import { Router } from 'express';
import { AuthController } from '../controllers';
import { UserModel, OrderModel, MembershipModel, AllDesignModel, CartModel } from '../models';
import { authenticate, authenticateOptional } from '../middleware/auth';
import { Pool } from 'pg';
import { normalizeCategory } from '../utils/category';
import { categoryAliases } from '../utils/category';
import { randomUUID } from 'crypto';
import { hashPassword } from '../utils';
import { createRateLimiter } from '../utils/rate-limit';
import { incrementCounter, setGauge } from '../observability/metrics';
import { createCacheStore } from '../utils/cache';
import { logError, logWarn } from '../utils/structured-logger';
import { externalizeImageDataUrls, type StoredAssetRef } from '../utils/asset-storage';
import {
    enqueueJob,
    getQueueByName,
    AI_QUEUE_NAME,
    TRYON_QUEUE_NAME,
    getQueueStats as getQueueStatsByName,
    getJobById,
} from '../queue/queues';

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

            const { total, items, selections, design, shipping_info, address: addressRaw, phone: phoneRaw, canvas, publishToAll = true, sourceAllId, category } = req.body || {};
            const totalNumber = typeof total === 'number' ? total : Number(total);
            if (!items || !Array.isArray(items) || !Number.isFinite(totalNumber)) {
                return res.status(400).json({ message: 'Invalid order payload' });
            }
            if (totalNumber <= 0) {
                return res.status(400).json({ message: 'Invalid total amount' });
            }

            await client.query('BEGIN');

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
                RETURNING id, user_id, total, category, status, items, selections, design, shipping_info, address, phone, order_time, canvas_front, canvas_back, canvas_meta, source_all_id, created_at
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

            await client.query('COMMIT');
            await invalidateMembershipCache(req.userId);
            await invalidateOrderCache(req.userId);
            await invalidateAdminOrderCache();
            if (allDesignId) {
                await invalidateGalleryCache(allDesignId);
            }
            res.status(201).json({ order: createdOrder, allDesignId, membership: updatedMembership });
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

            const addressRaw = typeof req.body?.address === 'string' ? req.body.address : '';
            const phoneRaw = typeof req.body?.phone === 'string' ? req.body.phone : '';
            const address = addressRaw.trim();
            const phone = phoneRaw.trim();

            if (!address) {
                return res.status(400).json({ message: 'Shipping address is required' });
            }

            await client.query('BEGIN');

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
                    RETURNING id, user_id, total, category, status, items, selections, design, shipping_info, address, phone, order_time, canvas_front, canvas_back, canvas_meta, source_all_id, created_at
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

            await client.query('COMMIT');
            await invalidateMembershipCache(req.userId);
            await invalidateCartCache(req.userId);
            await invalidateOrderCache(req.userId);
            await invalidateAdminOrderCache();
            await invalidateGalleryCache(null);
            res.status(201).json({ orders: createdOrders, membership: updatedMembership });
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
            await invalidateOrderCache(Number((updated as any)?.user_id || 0));

            res.json({ order: updated });
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

            const { planId, paymentReference, provider, rawPayload } = req.body || {};

            if (!planId || typeof planId !== 'string') {
                return res.status(400).json({ message: 'planId is required' });
            }

            const planConfig = membershipPlans[planId];
            if (!planConfig) {
                return res.status(400).json({ message: 'Invalid membership plan selected' });
            }

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