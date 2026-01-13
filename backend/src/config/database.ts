import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectToDatabase = async () => {
    const poolConfig: any = {
        connectionString: process.env.DATABASE_URL,
        max: 20, // 最大连接数
        idleTimeoutMillis: 30000, // 连接空闲时间（毫秒）
        connectionTimeoutMillis: 10000, // 连接超时时间（毫秒）
    };

    if (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('sslmode=require')) {
        poolConfig.ssl = {
            rejectUnauthorized: false // Neon DB requires SSL but often self-signed in dev/pooler
        };
    }

    const pool = new Pool(poolConfig);

    try {
        const client = await pool.connect();
        console.log('Connected to the database successfully');
        client.release(); // 释放客户端回连接池
    } catch (error) {
        console.error('Database connection error:', error);
        throw error;
    }

    return pool;
};

export default connectToDatabase;