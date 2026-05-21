import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const parseCandidates = (multiValue?: string, singleValue?: string, fallback: string[] = []) => {
    const multi = (multiValue || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    const single = (singleValue || '').trim();
    const merged = [...multi, ...(single ? [single] : []), ...fallback];
    return Array.from(new Set(merged));
};

const createPoolFromCandidates = async (candidates: string[], label: string) => {
    if (candidates.length === 0) {
        throw new Error(`No ${label} database endpoint configured.`);
    }

    let lastError: unknown = null;

    for (const candidate of candidates) {
        const poolConfig: any = {
            connectionString: candidate,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000,
        };

        if (candidate.includes('sslmode=require')) {
            poolConfig.ssl = {
                rejectUnauthorized: false
            };
        }

        const pool = new Pool(poolConfig);

        try {
            const client = await pool.connect();
            const masked = candidate.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:***@');
            console.log(`Connected to ${label} database successfully (${masked})`);
            client.release();
            return pool;
        } catch (error) {
            lastError = error;
            console.error(`${label} database connection failed for endpoint:`, error);
            await pool.end().catch(() => undefined);
        }
    }

    throw new Error(
        `Unable to connect to any configured ${label} database endpoints. Last error: ${
            lastError instanceof Error ? lastError.message : String(lastError)
        }`
    );
};

const connectToDatabase = async () => {
    const candidates = parseCandidates(
        process.env.DATABASE_URLS,
        process.env.DATABASE_URL,
        []
    );

    return createPoolFromCandidates(candidates, 'primary');
};

export const connectToReadDatabase = async (): Promise<Pool | null> => {
    const readCandidates = parseCandidates(process.env.DATABASE_READ_URLS, process.env.DATABASE_READ_URL, []);
    if (readCandidates.length === 0) {
        return null;
    }
    return createPoolFromCandidates(readCandidates, 'read-replica');
};

export default connectToDatabase;