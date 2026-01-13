import { Router } from 'express';
import { AuthController } from '../controllers';
import { AIController } from '../controllers/aiController';
import { UserModel, OrderModel, MembershipModel, AllDesignModel } from '../models';
import { authenticate } from '../middleware/auth';
import { Pool } from 'pg';
import { normalizeCategory } from '../utils/category';
import { categoryAliases } from '../utils/category';
import { randomUUID } from 'crypto';

export const createRoutes = (pool: Pool | null) => {
    const router = Router();

    // 如果没有数据库连接，则返回服务不可用的路由
    if (!pool) {
        router.use((req, res) => {
            res.status(503).json({
                message: 'Database service is unavailable. Please configure DATABASE_URL.',
                code: 'DB_CONNECTION_FAILED'
            });
        });
        return router;
    }

    const userModel = new UserModel(pool);
    const authController = new AuthController(userModel);
    const aiController = new AIController();
    const orderModel = new OrderModel(pool);
    const allDesignModel = new AllDesignModel(pool);
    const membershipModel = new MembershipModel(pool);

    const membershipPlans: Record<string, { amount: number; currency: string; durationDays: number }> = {
        monthly: { amount: 188, currency: 'CNY', durationDays: 30 },
        quarterly: { amount: 564, currency: 'CNY', durationDays: 90 },
        'half-year': { amount: 1128, currency: 'CNY', durationDays: 180 },
        yearly: { amount: 2256, currency: 'CNY', durationDays: 365 }
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
            const designs = await allDesignModel.list({ limit, offset, category });
            res.json({ designs });
        } catch (error) {
            console.error('Get gallery error:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    });

    router.get('/gallery/:designId', async (req, res) => {
        try {
            const designId = Number(req.params.designId);
            if (!Number.isFinite(designId) || designId <= 0) {
                return res.status(400).json({ message: 'Invalid designId' });
            }

            const design = await allDesignModel.getById(designId);
            if (!design) {
                return res.status(404).json({ message: 'Not found' });
            }
            res.json({ design });
        } catch (error) {
            console.error('Get gallery item error:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    });

    // AI 生成路由
    router.post('/generate', authenticate, async (req, res) => {
        try {
            if (!req.userId) return res.status(401).json({ message: 'User ID not found' });

            const membership = await membershipModel.getMembershipByUserId(req.userId);
            const expiresAt = membership?.expires_at ? new Date(membership.expires_at) : null;
            const isActive = Boolean(
                membership &&
                (!membership.status || membership.status === 'active') &&
                (!expiresAt || expiresAt.getTime() >= Date.now())
            );

            if (!isActive) {
                return res.status(403).json({
                    message: 'Active membership required',
                    code: 'MEMBERSHIP_REQUIRED'
                });
            }

            return aiController.generateDesign(req, res);
        } catch (error) {
            console.error('Membership gate error:', error);
            return res.status(500).json({ message: 'Internal server error' });
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

            const membership = await membershipModel.getMembershipByUserId(user.id);
            res.json({
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    created_at: user.created_at,
                    membership
                }
            });
        } catch (error) {
            res.status(500).json({ message: 'Internal server error' });
        }
    });

    // 创建订单
    router.post('/orders', authenticate, async (req, res) => {
        try {
            if (!req.userId) return res.status(401).json({ message: 'User ID not found' });

            const { total, items, selections, design, shipping_info, canvas, publishToAll = true, sourceAllId, category } = req.body || {};
            if (!items || !Array.isArray(items) || typeof total !== 'number') {
                return res.status(400).json({ message: 'Invalid order payload' });
            }

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

            const created = await orderModel.createOrder({
                userId: req.userId,
                total,
                    category: normalizedCategory,
                items,
                selections,
                design,
                shippingInfo: shipping_info,
                canvas: canvasPayload,
                sourceAllId: sourceAllId ?? null
            });

            let allDesignId: number | null = null;
            if (publishToAll) {
                const allDesign = await allDesignModel.createDesign({
                    userId: req.userId,
                    sourceOrderId: created.id,
                        category: normalizedCategory,
                    selections,
                    design,
                    canvas: canvasPayload
                });
                allDesignId = allDesign?.id ?? null;
                if (!sourceAllId && allDesignId) {
                    await orderModel.attachSourceAllId(created.id, allDesignId);
                    (created as any).source_all_id = allDesignId;
                }
            }

            res.status(201).json({ order: created, allDesignId });
        } catch (error) {
            console.error('Create order error:', error);
            res.status(500).json({ message: 'Internal server error' });
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
    router.get('/orders', authenticate, async (req, res) => {
        try {
            if (!req.userId) return res.status(401).json({ message: 'User ID not found' });
            const orders = await orderModel.getOrdersByUserId(req.userId);
            res.json({ orders });
        } catch (error) {
            console.error('Get orders error:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    });

    router.get('/memberships/me', authenticate, async (req, res) => {
        try {
            if (!req.userId) return res.status(401).json({ message: 'User ID not found' });
            const membership = await membershipModel.getMembershipByUserId(req.userId);
            res.json({ membership });
        } catch (error) {
            console.error('Get membership error:', error);
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
                currency: planConfig.currency,
                transactionId,
                provider: typeof provider === 'string' && provider ? provider : 'manual',
                expiresAt,
                rawPayload: rawPayload ?? null
            });

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