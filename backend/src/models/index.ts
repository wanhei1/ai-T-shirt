import { Pool } from 'pg';
import { categoryAliases, normalizeCategory } from '../utils/category';
import { randomBytes, randomUUID } from 'crypto';

type CanvasPayload = {
    frontSnapshot?: string | null;
    backSnapshot?: string | null;
    meta?: any;
};

type CreateOrderParams = {
    userId: number;
    total: number;
    category?: string | null;
    items: any;
    selections: any;
    design: any;
    shippingInfo: any;
    canvas?: CanvasPayload;
    sourceAllId?: number | null;
};

export class UserModel {
    constructor(private pool: Pool) { }

    private async generateUniqueInviteCode(userId: number): Promise<string> {
        // Example: U-K1Z-8F3A1B2C (uppercase, URL-safe)
        // Keep it short but collision-resistant.
        const userPart = userId.toString(36).toUpperCase();
        for (let attempt = 0; attempt < 6; attempt++) {
            const rand = randomBytes(4).toString('hex').toUpperCase();
            const code = `U-${userPart}-${rand}`;
            try {
                const result = await this.pool.query(
                    'UPDATE users SET invite_code = $2 WHERE id = $1 AND invite_code IS NULL RETURNING invite_code',
                    [userId, code]
                );
                if (result.rows[0]?.invite_code) return result.rows[0].invite_code;

                // If invite_code already existed, just return it.
                const existing = await this.pool.query('SELECT invite_code FROM users WHERE id = $1', [userId]);
                if (existing.rows[0]?.invite_code) return existing.rows[0].invite_code;
            } catch (err: any) {
                // Retry on unique conflicts.
                const msg = String(err?.message || '');
                if (msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('unique')) {
                    continue;
                }
                throw err;
            }
        }

        // Last resort: UUID-based.
        const fallback = `U-${userPart}-${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
        const result = await this.pool.query(
            'UPDATE users SET invite_code = $2 WHERE id = $1 AND invite_code IS NULL RETURNING invite_code',
            [userId, fallback]
        );
        if (result.rows[0]?.invite_code) return result.rows[0].invite_code;
        const existing = await this.pool.query('SELECT invite_code FROM users WHERE id = $1', [userId]);
        return existing.rows[0]?.invite_code || fallback;
    }

    async getOrCreateInviteCode(userId: number) {
        const existing = await this.pool.query('SELECT invite_code FROM users WHERE id = $1', [userId]);
        const current = existing.rows[0]?.invite_code;
        if (current) return String(current);
        return this.generateUniqueInviteCode(Number(userId));
    }

    async findUserByInviteCode(code: string) {
        const query = 'SELECT id, username, email, created_at, invite_code FROM users WHERE invite_code = $1';
        const result = await this.pool.query(query, [code]);
        return result.rows[0] || null;
    }

    async getUserForUpdate(client: { query: Pool['query'] }, userId: number) {
        const result = await client.query(
            'SELECT id, username, email, created_at, invite_code, invited_by_user_id, invite_redeemed_at FROM users WHERE id = $1 FOR UPDATE',
            [userId]
        );
        return result.rows[0] || null;
    }

    async markInviteRedeemed(
        client: { query: Pool['query'] },
        params: { inviteeUserId: number; inviterUserId: number }
    ) {
        const { inviteeUserId, inviterUserId } = params;
        const result = await client.query(
            `UPDATE users
             SET invited_by_user_id = $2,
                 invite_redeemed_at = NOW()
             WHERE id = $1
               AND invited_by_user_id IS NULL
               AND invite_redeemed_at IS NULL
             RETURNING id, username, email, created_at, invite_code, invited_by_user_id, invite_redeemed_at`,
            [inviteeUserId, inviterUserId]
        );
        return result.rows[0] || null;
    }

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
        const query = 'SELECT id, username, email, created_at, invite_code, invited_by_user_id, invite_redeemed_at FROM users WHERE id = $1';
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

    async createOrder(params: CreateOrderParams) {
        const { userId, total, category, items, selections, design, shippingInfo, canvas, sourceAllId } = params;

        const query = `
            INSERT INTO orders (user_id, total, category, items, selections, design, shipping_info, canvas_front, canvas_back, canvas_meta, source_all_id)
            VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9, $10::jsonb, $11)
            RETURNING id, user_id, total, category, status, items, selections, design, shipping_info, canvas_front, canvas_back, canvas_meta, source_all_id, created_at
        `;

        const values = [
            userId,
            total,
            category ?? null,
            JSON.stringify(items),
            JSON.stringify(selections || {}),
            JSON.stringify(design || {}),
            JSON.stringify(shippingInfo || {}),
            canvas?.frontSnapshot ?? null,
            canvas?.backSnapshot ?? null,
            canvas?.meta ? JSON.stringify(canvas.meta) : null,
            sourceAllId ?? null
        ];

        const result = await this.pool.query(query, values);
        return result.rows[0];
    }

    async attachSourceAllId(orderId: number, sourceAllId: number) {
        const query = `UPDATE orders SET source_all_id = $1 WHERE id = $2 RETURNING id, source_all_id`;
        const result = await this.pool.query(query, [sourceAllId, orderId]);
        return result.rows[0];
    }

    async getOrdersByUserId(userId: number) {
        const query = `SELECT id, user_id, total, category, status, items, selections, design, shipping_info, canvas_front, canvas_back, canvas_meta, source_all_id, created_at FROM orders WHERE user_id = $1 ORDER BY created_at DESC`;
        const result = await this.pool.query(query, [userId]);
        return result.rows || [];
    }
}

export class AllDesignModel {
    constructor(private pool: Pool) { }

    async createDesign(params: {
        userId: number;
        sourceOrderId: number | null;
        category?: string | null;
        selections: any;
        design: any;
        canvas?: CanvasPayload;
    }) {
        const { userId, sourceOrderId, category, selections, design, canvas } = params;

        const query = `
            INSERT INTO all_designs (user_id, source_order_id, category, selections, design, canvas_front, canvas_back, canvas_meta)
            VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8::jsonb)
            RETURNING id, user_id, source_order_id, category, selections, design, canvas_front, canvas_back, canvas_meta, created_at
        `;

        const values = [
            userId,
            sourceOrderId,
            category ?? null,
            JSON.stringify(selections || {}),
            JSON.stringify(design || {}),
            canvas?.frontSnapshot ?? null,
            canvas?.backSnapshot ?? null,
            canvas?.meta ? JSON.stringify(canvas.meta) : null
        ];

        const result = await this.pool.query(query, values);
        return result.rows[0];
    }

    async list(params?: { limit?: number; offset?: number; category?: string; sort?: 'new' | 'sales' }) {
        const limit = Math.min(Math.max(Number(params?.limit ?? 30) || 30, 1), 100);
        const offset = Math.max(Number(params?.offset ?? 0) || 0, 0);

        const category = typeof params?.category === 'string' && params.category.trim().length > 0
            ? params.category.trim()
            : null;

        const canonicalCategory = normalizeCategory(category);
        const categoryFilter = canonicalCategory ? categoryAliases(canonicalCategory) : category;

        const whereSql = categoryFilter
            ? (Array.isArray(categoryFilter)
                ? 'WHERE a.category = ANY($3::text[])'
                : 'WHERE a.category = $3')
            : '';

        const sort = params?.sort === 'sales' ? 'sales' : 'new';
        const orderByRankedSql = sort === 'sales'
            ? 'ORDER BY COALESCE(s.sales_count, 0) DESC, a.created_at DESC'
            : 'ORDER BY a.created_at DESC';

        // Important: all_designs can store very large payloads (canvas snapshots/data URLs).
        // Doing ORDER BY + LIMIT directly on wide rows can become extremely slow.
        // We first select the top-N ids (ranked) using a narrow row shape, then fetch the full rows.
        const query = `
            WITH sales AS (
                SELECT source_all_id, COUNT(*)::int AS sales_count
                FROM design_usage_rewards
                GROUP BY source_all_id
            ),
            ranked AS (
                SELECT a.id
                FROM all_designs a
                LEFT JOIN sales s ON s.source_all_id = a.id
                ${whereSql}
                ${orderByRankedSql}
                LIMIT $1 OFFSET $2
            )
            SELECT a.id,
                   a.id AS order_id,
                   a.user_id,
                   a.source_order_id,
                   a.category,
                   a.selections,
                     a.canvas_front,
                   a.created_at,
                   u.username,
                   COALESCE(s.sales_count, 0) AS sales_count
            FROM ranked
            JOIN all_designs a ON a.id = ranked.id
            LEFT JOIN users u ON u.id = a.user_id
            LEFT JOIN sales s ON s.source_all_id = a.id
            ${orderByRankedSql}
        `;

        const values: any[] = categoryFilter ? [limit, offset, categoryFilter] : [limit, offset];
        const result = await this.pool.query(query, values);
        return result.rows || [];
    }

    async getById(id: number) {
        const query = `
            SELECT a.id, a.id AS order_id, a.user_id, a.source_order_id, a.category, a.selections, a.design, a.canvas_front, a.canvas_back, a.canvas_meta, a.created_at,
                   u.username,
                   COALESCE(r.sales_count, 0) AS sales_count
            FROM all_designs a
            LEFT JOIN users u ON u.id = a.user_id
            LEFT JOIN (
                SELECT source_all_id, COUNT(*)::int AS sales_count
                FROM design_usage_rewards
                GROUP BY source_all_id
            ) r ON r.source_all_id = a.id
            WHERE a.id = $1
            LIMIT 1
        `;

        const result = await this.pool.query(query, [id]);
        return result.rows[0] || null;
    }
}

export class MembershipModel {
    constructor(private pool: Pool) { }

    private async ensureTransactionsTable(executor: { query: Pool['query'] }) {
        await executor.query(`
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
        await executor.query(`CREATE INDEX IF NOT EXISTS idx_membership_transactions_user_time ON membership_transactions(user_id, created_at DESC)`);
    }

    private async insertTransaction(
        executor: { query: Pool['query'] },
        params: { userId: number; delta: number; balanceAfter: number; currency: string; type: string; referenceId?: string | null; rawPayload?: unknown }
    ) {
        const { userId, delta, balanceAfter, currency, type, referenceId, rawPayload } = params;
        try {
            await executor.query(
                `INSERT INTO membership_transactions (user_id, delta, balance_after, currency, type, reference_id, raw_payload)
                 VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
                [
                    userId,
                    delta,
                    balanceAfter,
                    currency,
                    type,
                    referenceId ?? null,
                    rawPayload ? JSON.stringify(rawPayload) : null
                ]
            );
        } catch (error: any) {
            const message = String(error?.message || "");
            if (message.toLowerCase().includes("membership_transactions") && message.toLowerCase().includes("does not exist")) {
                await this.ensureTransactionsTable(executor);
                await executor.query(
                    `INSERT INTO membership_transactions (user_id, delta, balance_after, currency, type, reference_id, raw_payload)
                     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
                    [
                        userId,
                        delta,
                        balanceAfter,
                        currency,
                        type,
                        referenceId ?? null,
                        rawPayload ? JSON.stringify(rawPayload) : null
                    ]
                );
                return;
            }
            throw error;
        }
    }

    private mapMembershipRow(row: any) {
        if (!row) return null;
        return {
            ...row,
            amount: row.amount !== null && row.amount !== undefined ? Number(row.amount) : 0,
            balance: row.balance !== null && row.balance !== undefined ? Number(row.balance) : 0,
            raw_payload: row.raw_payload ?? null
        };
    }

    async upsertMembership(params: {
        userId: number;
        planId: string;
        amount: number;
        balance?: number;
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
            balance = amount,
            currency,
            status = 'active',
            transactionId,
            provider = 'manual',
            expiresAt,
            rawPayload
        } = params;

        const query = `
            INSERT INTO memberships (user_id, plan_id, amount, balance, currency, status, transaction_id, provider, started_at, expires_at, raw_payload, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, $10::jsonb, NOW())
            ON CONFLICT (user_id) DO UPDATE SET
                plan_id = EXCLUDED.plan_id,
                amount = EXCLUDED.amount,
                balance = memberships.balance + EXCLUDED.balance,
                currency = EXCLUDED.currency,
                status = EXCLUDED.status,
                transaction_id = EXCLUDED.transaction_id,
                provider = EXCLUDED.provider,
                started_at = NOW(),
                expires_at = EXCLUDED.expires_at,
                raw_payload = COALESCE(EXCLUDED.raw_payload, memberships.raw_payload),
                updated_at = NOW()
            RETURNING id, user_id, plan_id, amount, balance, currency, status, started_at, expires_at, transaction_id, provider, raw_payload, created_at, updated_at
        `;

        const values = [
            userId,
            planId,
            amount,
            balance,
            currency,
            status,
            transactionId,
            provider,
            expiresAt ? expiresAt.toISOString() : null,
            rawPayload ? JSON.stringify(rawPayload) : null
        ];

        const result = await this.pool.query(query, values);
        const membership = this.mapMembershipRow(result.rows[0]);

        try {
            if (membership) {
                await this.insertTransaction(this.pool, {
                    userId,
                    delta: balance,
                    balanceAfter: membership.balance ?? balance,
                    currency,
                    type: 'membership_purchase',
                    referenceId: transactionId,
                    rawPayload
                });
            }
        } catch (error) {
            console.warn('⚠️ Failed to log membership transaction:', (error as any)?.message || error);
        }

        return membership;
    }

    async getMembershipByUserId(userId: number) {
        const query = `
            SELECT id, user_id, plan_id, amount, balance, currency, status, started_at, expires_at, transaction_id, provider, raw_payload, created_at, updated_at
            FROM memberships
            WHERE user_id = $1
        `;
        const result = await this.pool.query(query, [userId]);
        return this.mapMembershipRow(result.rows[0] || null);
    }

    async getMembershipForUpdate(client: { query: Pool['query'] }, userId: number) {
        const result = await client.query(
            `SELECT id, user_id, plan_id, amount, balance, currency, status, started_at, expires_at, transaction_id, provider, raw_payload, created_at, updated_at
             FROM memberships
             WHERE user_id = $1
             FOR UPDATE`,
            [userId]
        );
        return this.mapMembershipRow(result.rows[0] || null);
    }

    async updateBalanceAndMaybeCancel(
        client: { query: Pool['query'] },
        params: { userId: number; newBalance: number; cancelIfEmpty: boolean }
    ) {
        const { userId, newBalance, cancelIfEmpty } = params;
        const previous = await client.query('SELECT balance, currency FROM memberships WHERE user_id = $1', [userId]);
        const previousBalance = Number(previous.rows[0]?.balance ?? 0);
        const currency = previous.rows[0]?.currency ?? 'CNY';
        const shouldCancel = cancelIfEmpty && newBalance <= 0;
        const status = shouldCancel ? 'inactive' : undefined;
        const expiresAt = shouldCancel ? new Date().toISOString() : undefined;

        const result = await client.query(
            `UPDATE memberships
             SET balance = $2,
                 status = COALESCE($3, status),
                 expires_at = COALESCE($4, expires_at),
                 updated_at = NOW()
             WHERE user_id = $1
             RETURNING id, user_id, plan_id, amount, balance, currency, status, started_at, expires_at, transaction_id, provider, raw_payload, created_at, updated_at`,
            [userId, newBalance, status ?? null, expiresAt ?? null]
        );

        const membership = this.mapMembershipRow(result.rows[0] || null);

        try {
            const delta = Number((newBalance - previousBalance).toFixed(2));
            await this.insertTransaction(client, {
                userId,
                delta,
                balanceAfter: newBalance,
                currency,
                type: delta < 0 ? 'order_payment' : 'balance_adjust'
            });
        } catch (error) {
            console.warn('⚠️ Failed to log membership debit:', (error as any)?.message || error);
        }

        return membership;
    }

    async creditBalance(
        client: { query: Pool['query'] },
        params: { userId: number; amount: number; currency?: string; rawPayload?: unknown }
    ) {
        const { userId, amount, currency = 'CNY', rawPayload } = params;
        if (!Number.isFinite(amount) || amount <= 0) {
            throw new Error('Invalid credit amount');
        }

        const updated = await client.query(
            `UPDATE memberships
             SET balance = balance + $2,
                 updated_at = NOW()
             WHERE user_id = $1
             RETURNING id, user_id, plan_id, amount, balance, currency, status, started_at, expires_at, transaction_id, provider, raw_payload, created_at, updated_at`,
            [userId, amount]
        );

        if (updated.rows[0]) {
            const membership = this.mapMembershipRow(updated.rows[0]);
            try {
                await this.insertTransaction(client, {
                    userId,
                    delta: amount,
                    balanceAfter: membership?.balance ?? amount,
                    currency,
                    type: 'balance_credit',
                    rawPayload
                });
            } catch (error) {
                console.warn('⚠️ Failed to log membership credit:', (error as any)?.message || error);
            }
            return membership;
        }

        // If user has no membership row yet, create an inactive "referral" wallet entry.
        const transactionId = randomUUID();
        const inserted = await client.query(
            `INSERT INTO memberships (user_id, plan_id, amount, balance, currency, status, transaction_id, provider, started_at, expires_at, raw_payload, updated_at)
             VALUES ($1, 'referral', 0, $2, $3, 'inactive', $4, 'referral', NOW(), NOW(), $5::jsonb, NOW())
             RETURNING id, user_id, plan_id, amount, balance, currency, status, started_at, expires_at, transaction_id, provider, raw_payload, created_at, updated_at`,
            [userId, amount, currency, transactionId, rawPayload ? JSON.stringify(rawPayload) : null]
        );

        const membership = this.mapMembershipRow(inserted.rows[0] || null);
        try {
            await this.insertTransaction(client, {
                userId,
                delta: amount,
                balanceAfter: membership?.balance ?? amount,
                currency,
                type: 'balance_credit',
                rawPayload
            });
        } catch (error) {
            console.warn('⚠️ Failed to log membership credit (insert):', (error as any)?.message || error);
        }
        return membership;
    }

    async getTransactionsByUserId(userId: number, limit = 50) {
        const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
        const result = await this.pool.query(
            `SELECT id, user_id, delta, balance_after, currency, type, reference_id, raw_payload, created_at
             FROM membership_transactions
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT $2`,
            [userId, safeLimit]
        );
        return result.rows || [];
    }
}