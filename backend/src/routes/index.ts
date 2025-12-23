import { Router } from 'express';
import { AuthController } from '../controllers';
import { UserModel, OrderModel, MembershipModel } from '../models';
import { authenticate } from '../middleware/auth';
import { Pool } from 'pg';
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
    const orderModel = new OrderModel(pool);
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

            const { total, items, selections, design, shipping_info } = req.body;
            if (!items || !Array.isArray(items) || typeof total !== 'number') {
                return res.status(400).json({ message: 'Invalid order payload' });
            }

            const created = await orderModel.createOrder(req.userId, total, items, selections, design, shipping_info);
            res.status(201).json({ order: created });
        } catch (error) {
            console.error('Create order error:', error);
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