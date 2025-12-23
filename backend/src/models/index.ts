import { Pool } from 'pg';

export class UserModel {
    constructor(private pool: Pool) { }

    async createUser(username: string, email: string, hashedPassword: string) {
        const query = 'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id, username, email, created_at';
        const values = [username, email, hashedPassword];

        const result = await this.pool.query(query, values);
        return result.rows[0];
    }

    async findUserByEmail(email: string) {
        const query = 'SELECT * FROM users WHERE email = $1';
        const values = [email];

        const result = await this.pool.query(query, values);
        return result.rows[0] || null;
    }

    async findUserById(id: number | string) {
        const query = 'SELECT id, username, email, created_at FROM users WHERE id = $1';
        const values = [id];

        const result = await this.pool.query(query, values);
        return result.rows[0] || null;
    }

    async findUserByIdWithPassword(id: number | string) {
        const query = 'SELECT * FROM users WHERE id = $1';
        const result = await this.pool.query(query, [id]);
        return result.rows[0] || null;
    }

    // 新增：通过用户名查找用户
    async findUserByUsername(username: string) {
        const query = 'SELECT id, username, email, created_at FROM users WHERE username = $1';
        const result = await this.pool.query(query, [username]);
        return result.rows[0] || null;
    }

    // 新增：更新用户信息
    async updateUser(id: number | string, updateData: { username?: string; email?: string }) {
        const fields = [];
        const values = [];
        let paramCount = 1;

        if (updateData.username) {
            fields.push(`username = $${paramCount}`);
            values.push(updateData.username);
            paramCount++;
        }

        if (updateData.email) {
            fields.push(`email = $${paramCount}`);
            values.push(updateData.email);
            paramCount++;
        }

        if (fields.length === 0) {
            throw new Error('No fields to update');
        }

        values.push(id);
        const query = `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING id, username, email, created_at`;

        const result = await this.pool.query(query, values);
        return result.rows[0] || null;
    }
}

export class OrderModel {
    constructor(private pool: Pool) { }

    async createOrder(userId: number, total: number, items: any, selections: any, design: any, shippingInfo: any) {
        const query = `INSERT INTO orders (user_id, total, items, selections, design, shipping_info) VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb) RETURNING id, user_id, total, status, items, selections, design, shipping_info, created_at`;
        const values = [userId, total, JSON.stringify(items), JSON.stringify(selections || {}), JSON.stringify(design || {}), JSON.stringify(shippingInfo || {})];
        const result = await this.pool.query(query, values);
        return result.rows[0];
    }

    async getOrdersByUserId(userId: number) {
        const query = `SELECT id, user_id, total, status, items, selections, design, shipping_info, created_at FROM orders WHERE user_id = $1 ORDER BY created_at DESC`;
        const result = await this.pool.query(query, [userId]);
        return result.rows || [];
    }
}

export class MembershipModel {
    constructor(private pool: Pool) { }

    private mapMembershipRow(row: any) {
        if (!row) return null;
        return {
            ...row,
            amount: row.amount !== null && row.amount !== undefined ? Number(row.amount) : 0,
            raw_payload: row.raw_payload ?? null
        };
    }

    async upsertMembership(params: {
        userId: number;
        planId: string;
        amount: number;
        currency: string;
        status?: string;
        transactionId: string;
        provider?: string;
        expiresAt: Date | null;
        rawPayload?: unknown;
    }) {
        const {
            userId,
            planId,
            amount,
            currency,
            status = 'active',
            transactionId,
            provider = 'manual',
            expiresAt,
            rawPayload
        } = params;

        const query = `
            INSERT INTO memberships (user_id, plan_id, amount, currency, status, transaction_id, provider, started_at, expires_at, raw_payload, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9::jsonb, NOW())
            ON CONFLICT (user_id) DO UPDATE SET
                plan_id = EXCLUDED.plan_id,
                amount = EXCLUDED.amount,
                currency = EXCLUDED.currency,
                status = EXCLUDED.status,
                transaction_id = EXCLUDED.transaction_id,
                provider = EXCLUDED.provider,
                started_at = NOW(),
                expires_at = EXCLUDED.expires_at,
                raw_payload = COALESCE(EXCLUDED.raw_payload, memberships.raw_payload),
                updated_at = NOW()
            RETURNING id, user_id, plan_id, amount, currency, status, started_at, expires_at, transaction_id, provider, raw_payload, created_at, updated_at
        `;

        const values = [
            userId,
            planId,
            amount,
            currency,
            status,
            transactionId,
            provider,
            expiresAt ? expiresAt.toISOString() : null,
            rawPayload ? JSON.stringify(rawPayload) : null
        ];

        const result = await this.pool.query(query, values);
        return this.mapMembershipRow(result.rows[0]);
    }

    async getMembershipByUserId(userId: number) {
        const query = `
            SELECT id, user_id, plan_id, amount, currency, status, started_at, expires_at, transaction_id, provider, raw_payload, created_at, updated_at
            FROM memberships
            WHERE user_id = $1
        `;
        const result = await this.pool.query(query, [userId]);
        return this.mapMembershipRow(result.rows[0] || null);
    }
}