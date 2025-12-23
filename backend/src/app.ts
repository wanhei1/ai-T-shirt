import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import connectToDatabase from './config/database';
import { Pool } from 'pg';
import { createRoutes } from './routes';
import './types'; // 导入类型扩展

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8189; // 改为 8189，避免与前端冲突

// 中间件
// --- More robust CORS configuration ---
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000,http://localhost:3001,https://www.bit810.cn')
    .split(',')
    .map(url => url.trim());

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    credentials: true
}));
// Increase JSON and URL-encoded body size limits to allow larger payloads
// (orders may contain design data or embedded images in demo setups).
// For production, prefer uploading large files to object storage and sending references.
app.use(express.json({ limit: process.env.EXPRESS_JSON_LIMIT || '5mb' }));
app.use(express.urlencoded({ extended: true, limit: process.env.EXPRESS_JSON_LIMIT || '5mb' }));

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
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // 创建订单表，用于保存用户下单记录
            await pool.query(`
                CREATE TABLE IF NOT EXISTS orders (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    total NUMERIC(10,2) NOT NULL,
                    status VARCHAR(50) DEFAULT 'pending',
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

            // 创建会员表，记录会员计划与支付状态
            await pool.query(`
                CREATE TABLE IF NOT EXISTS memberships (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    plan_id VARCHAR(50) NOT NULL,
                    amount NUMERIC(10,2) NOT NULL,
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
            await pool.query(`
                CREATE INDEX IF NOT EXISTS idx_memberships_user_id ON memberships(user_id)
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