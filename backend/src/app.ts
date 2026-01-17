import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import connectToDatabase from './config/database';
import { Pool } from 'pg';
import { createRoutes } from './routes';
import './types'; // 导入类型扩展

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8181; // 改为 8189，避免与前端冲突

// 中间件
// --- More robust CORS configuration ---
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000,http://localhost:3001,https://www.bit810.cn')
    .split(',')
    .map(url => url.trim());

const isDev = process.env.NODE_ENV !== 'production';
const isLocalDevOrigin = (origin: string) => {
    return (
        /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
        /^http:\/\/\[::1\](:\d+)?$/.test(origin)
    );
};

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        // In development, allow local dev origins regardless of port.
        // This prevents CORS breakage when Next dev server port changes.
        if (isDev && isLocalDevOrigin(origin)) {
            return callback(null, true);
        }

        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    credentials: true
}));
// Increase JSON and URL-encoded body size limits to allow larger payloads.
// Orders can include embedded design images (data URLs), which easily exceed small defaults.
// For production, prefer uploading large files to object storage and sending references.
const bodyLimit = process.env.EXPRESS_JSON_LIMIT || '25mb';
app.use(express.json({ limit: bodyLimit }));
app.use(express.urlencoded({ extended: true, limit: bodyLimit }));

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
    res.json({
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// 初始化数据库连接和路由
const initializeApp = async () => {
    let pool: Pool | null = null;
    let dbConnected = false;

    try {
        // 尝试连接数据库
        try {
            pool = await connectToDatabase();

            // 创建用户表
            await pool.query(`
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(255) NOT NULL,
                    email VARCHAR(255) UNIQUE NOT NULL,
                    password VARCHAR(255) NOT NULL,
                    invite_code VARCHAR(32) UNIQUE,
                    invited_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    invite_redeemed_at TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Referral/invite upgrades for older installations.
            try {
                await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_code VARCHAR(32) UNIQUE`);
                await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS invited_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL`);
                await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_redeemed_at TIMESTAMP`);
                await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_invite_code_unique ON users(invite_code)`);
                await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_invited_by_user_id ON users(invited_by_user_id)`);
            } catch (err) {
                console.warn('⚠️ Failed to ensure users referral columns:', (err as any)?.message || err);
            }

            // Track invite redemptions for auditing and stats.
            await pool.query(`
                CREATE TABLE IF NOT EXISTS referral_redemptions (
                    id SERIAL PRIMARY KEY,
                    inviter_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    invitee_user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    invite_code VARCHAR(32) NOT NULL,
                    reward_amount NUMERIC(10,2) NOT NULL DEFAULT 35,
                    rewarded_at TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            try {
                await pool.query(`ALTER TABLE referral_redemptions ADD COLUMN IF NOT EXISTS rewarded_at TIMESTAMP`);
                await pool.query(`UPDATE referral_redemptions SET rewarded_at = COALESCE(rewarded_at, created_at)`);
                await pool.query(`CREATE INDEX IF NOT EXISTS idx_referral_redemptions_inviter ON referral_redemptions(inviter_user_id)`);
                await pool.query(`CREATE INDEX IF NOT EXISTS idx_referral_redemptions_rewarded_at ON referral_redemptions(rewarded_at)`);
            } catch (err) {
                console.warn('⚠️ Failed to ensure referral_redemptions indexes:', (err as any)?.message || err);
            }

            // 创建订单表，用于保存用户下单记录
            await pool.query(`
                CREATE TABLE IF NOT EXISTS orders (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    total NUMERIC(10,2) NOT NULL,
                    status VARCHAR(50) DEFAULT 'pending',
                    category TEXT,
                    items JSONB NOT NULL,
                    selections JSONB,
                    design JSONB,
                    shipping_info JSONB,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            // Ensure existing databases that were created before `design` column existed get upgraded.
            try {
                await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS design JSONB`);
                console.log('✅ Ensured orders.design column exists');
            } catch (err) {
                console.warn('⚠️ Failed to ensure orders.design column:', (err as any)?.message || err);
            }

            // Ensure category exists for older installations (used as style tag, e.g. 抽象/写实/简约)
            try {
                await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS category TEXT`);
            } catch (err) {
                console.warn('⚠️ Failed to ensure orders.category column:', (err as any)?.message || err);
            }

            // Create mall-facing all_designs table to store published canvases
            await pool.query(`
                CREATE TABLE IF NOT EXISTS all_designs (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    source_order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
                    category TEXT,
                    selections JSONB,
                    design JSONB,
                    canvas_front TEXT,
                    canvas_back TEXT,
                    canvas_meta JSONB,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Gallery listing can be large; keep common sort/filter fast.
            try {
                await pool.query(`CREATE INDEX IF NOT EXISTS idx_all_designs_created_at_desc ON all_designs(created_at DESC)`);
                await pool.query(`CREATE INDEX IF NOT EXISTS idx_all_designs_category_created_at_desc ON all_designs(category, created_at DESC)`);
            } catch (err) {
                console.warn('⚠️ Failed to ensure all_designs indexes:', (err as any)?.message || err);
            }

            // Reward designers when others place orders using their published designs.
            // One reward per order (idempotent via unique order_id).
            await pool.query(`
                CREATE TABLE IF NOT EXISTS design_usage_rewards (
                    id SERIAL PRIMARY KEY,
                    order_id INTEGER UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
                    source_all_id INTEGER NOT NULL REFERENCES all_designs(id) ON DELETE CASCADE,
                    buyer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    designer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    reward_amount NUMERIC(10,2) NOT NULL DEFAULT 15,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            try {
                await pool.query(`CREATE INDEX IF NOT EXISTS idx_design_usage_rewards_designer ON design_usage_rewards(designer_user_id)`);
                await pool.query(`CREATE INDEX IF NOT EXISTS idx_design_usage_rewards_buyer ON design_usage_rewards(buyer_user_id)`);
                await pool.query(`CREATE INDEX IF NOT EXISTS idx_design_usage_rewards_source_all_id ON design_usage_rewards(source_all_id)`);
            } catch (err) {
                console.warn('⚠️ Failed to ensure design_usage_rewards indexes:', (err as any)?.message || err);
            }

            // Ensure category exists for older installations
            try {
                await pool.query(`ALTER TABLE all_designs ADD COLUMN IF NOT EXISTS category TEXT`);
            } catch (err) {
                console.warn('⚠️ Failed to ensure all_designs.category column:', (err as any)?.message || err);
            }

            // Add richer canvas fields onto orders for storing full garment state
            try {
                await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS canvas_front TEXT`);
                await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS canvas_back TEXT`);
                await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS canvas_meta JSONB`);
                await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS source_all_id INTEGER REFERENCES all_designs(id)`);
                console.log('✅ Ensured orders canvas columns exist');
            } catch (err) {
                console.warn('⚠️ Failed to ensure orders canvas columns:', (err as any)?.message || err);
            }

            // 创建会员表，记录会员计划与支付状态
            await pool.query(`
                CREATE TABLE IF NOT EXISTS memberships (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    plan_id VARCHAR(50) NOT NULL,
                    amount NUMERIC(10,2) NOT NULL,
                    balance NUMERIC(10,2) NOT NULL DEFAULT 0,
                    currency VARCHAR(10) DEFAULT 'CNY',
                    status VARCHAR(20) DEFAULT 'active',
                    transaction_id VARCHAR(255) UNIQUE NOT NULL,
                    provider VARCHAR(50) DEFAULT 'manual',
                    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    expires_at TIMESTAMP,
                    raw_payload JSONB,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Ensure balance exists for older installations.
            try {
                await pool.query(`ALTER TABLE memberships ADD COLUMN IF NOT EXISTS balance NUMERIC(10,2) NOT NULL DEFAULT 0`);
            } catch (err) {
                console.warn('⚠️ Failed to ensure memberships.balance column:', (err as any)?.message || err);
            }
            await pool.query(`
                CREATE INDEX IF NOT EXISTS idx_memberships_user_id ON memberships(user_id)
            `);

            // Track membership balance history per user.
            await pool.query(`
                CREATE TABLE IF NOT EXISTS membership_transactions (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    delta NUMERIC(10,2) NOT NULL,
                    balance_after NUMERIC(10,2) NOT NULL,
                    currency VARCHAR(10) NOT NULL DEFAULT 'CNY',
                    type VARCHAR(64) NOT NULL,
                    reference_id VARCHAR(128),
                    raw_payload JSONB,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            await pool.query(`CREATE INDEX IF NOT EXISTS idx_membership_transactions_user_time ON membership_transactions(user_id, created_at DESC)`);

            // Backfill membership purchase history for existing members if missing.
            await pool.query(`
                INSERT INTO membership_transactions (user_id, delta, balance_after, currency, type, reference_id, raw_payload, created_at)
                SELECT m.user_id,
                       m.amount,
                       m.balance,
                       m.currency,
                       'membership_purchase',
                       m.transaction_id,
                       m.raw_payload,
                       COALESCE(m.started_at, m.created_at, NOW())
                FROM memberships m
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM membership_transactions t
                    WHERE t.user_id = m.user_id
                      AND t.type = 'membership_purchase'
                      AND t.reference_id = m.transaction_id
                )
            `);

            dbConnected = true;
            console.log('✅ Database connected and initialized');
        } catch (dbError: any) {
            console.warn('⚠️ Database connection failed, running without database features');
            console.log(`📝 Database error: ${dbError?.message || 'Unknown error'}`);
            console.log('💡 To enable full features, please configure your DATABASE_URL environment variable');
        }

        // 设置 API 路由（传入数据库连接池，如果连接失败则为 null）
        app.use('/api', createRoutes(pool));

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

        app.listen(PORT, () => {
            console.log(`🚀 Backend server is running on port ${PORT}`);
            console.log(`📡 API available at http://localhost:${PORT}/api`);
            console.log(`💚 Health check at http://localhost:${PORT}/health`);
            console.log(`🗄️ Database status: ${dbConnected ? '✅ Connected' : '❌ Disconnected'}`);
        });
    } catch (error) {
        console.error('❌ Failed to initialize app:', error);
        process.exit(1);
    }
};

initializeApp();
