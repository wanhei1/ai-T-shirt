import { Pool } from 'pg';
import { hashPassword } from '../utils';

const SCHEMA_MIGRATION_NAME = 'startup_bootstrap_v1';

const ensureSchemaMigrationsTable = async (pool: Pool) => {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id SERIAL PRIMARY KEY,
            name VARCHAR(128) UNIQUE NOT NULL,
            executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            app_version VARCHAR(64)
        )
    `);
};

const markMigrationExecuted = async (pool: Pool, name: string) => {
    const appVersion = process.env.APP_VERSION || process.env.npm_package_version || null;
    await pool.query(
        `INSERT INTO schema_migrations (name, app_version)
         VALUES ($1, $2)
         ON CONFLICT (name)
         DO UPDATE SET executed_at = CURRENT_TIMESTAMP, app_version = EXCLUDED.app_version`,
        [name, appVersion]
    );
};

const ensureUsersAndAdmin = async (pool: Pool) => {
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
            is_admin BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Referral/invite upgrades for older installations.
    try {
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_code VARCHAR(32) UNIQUE`);
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS invited_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL`);
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_redeemed_at TIMESTAMP`);
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE`);
        await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_invite_code_unique ON users(invite_code)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_invited_by_user_id ON users(invited_by_user_id)`);
    } catch (err) {
        console.warn('⚠️ Failed to ensure users referral columns:', (err as any)?.message || err);
    }

    // Ensure configured admin account exists and can be used for login.
    try {
        const adminEmail = (process.env.ADMIN_EMAIL || 'admin@gmail.com').trim().toLowerCase();
        const adminPassword = process.env.ADMIN_PASSWORD || '123456';

        const adminSyncPasswordDefault = process.env.NODE_ENV !== 'production' ? 'true' : 'false';
        const adminSyncPassword = (process.env.ADMIN_SYNC_PASSWORD || adminSyncPasswordDefault).toLowerCase() === 'true';

        const existingByEmail = await pool.query(
            'SELECT id, is_admin FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM($1)) LIMIT 1',
            [adminEmail]
        );

        const hashed = await hashPassword(adminPassword);

        if (existingByEmail.rows[0]) {
            const targetUser = existingByEmail.rows[0];
            const updates: string[] = ['is_admin = TRUE'];
            const values: any[] = [];
            let idx = 1;

            if (adminSyncPassword) {
                updates.push(`password = $${idx}`);
                values.push(hashed);
                idx++;
            }

            updates.push(`email = $${idx}`);
            values.push(adminEmail);
            idx++;

            values.push(targetUser.id);

            await pool.query(
                `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}`,
                values
            );
        } else {
            await pool.query(
                `INSERT INTO users (username, email, password, is_admin)
                 VALUES ($1, $2, $3, TRUE)`,
                ['admin', adminEmail, hashed]
            );
        }
    } catch (err) {
        console.warn('⚠️ Failed to ensure default admin user:', (err as any)?.message || err);
    }
};

const ensureReferralRedemptions = async (pool: Pool) => {
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
};

const ensureOrderAndDesignTables = async (pool: Pool) => {
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
            address TEXT,
            phone TEXT,
            order_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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

    // Ensure admin-facing fields exist on orders.
    try {
        await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS address TEXT`);
        await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS phone TEXT`);
        await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
        await pool.query(`UPDATE orders SET order_time = created_at WHERE order_time IS NULL`);
    } catch (err) {
        console.warn('⚠️ Failed to ensure orders address/phone/order_time columns:', (err as any)?.message || err);
    }

    // Ensure category exists for older installations (used as style tag, e.g. 抽象/写实/简约)
    try {
        await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS category TEXT`);
    } catch (err) {
        console.warn('⚠️ Failed to ensure orders.category column:', (err as any)?.message || err);
    }

    // Keep per-user order history queries fast as data grows.
    try {
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_user_created_at_desc ON orders(user_id, created_at DESC)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_status_created_at_desc ON orders(status, created_at DESC)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_created_at_desc ON orders(created_at DESC)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_source_all_id ON orders(source_all_id)`);
    } catch (err) {
        console.warn('⚠️ Failed to ensure orders indexes:', (err as any)?.message || err);
    }

    // Archive table for cold orders; used by archive jobs in long-term retention strategy.
    await pool.query(`
        CREATE TABLE IF NOT EXISTS orders_archive (
            archived_id BIGSERIAL PRIMARY KEY,
            original_order_id INTEGER UNIQUE NOT NULL,
            user_id INTEGER,
            total NUMERIC(10,2),
            status VARCHAR(50),
            category TEXT,
            items JSONB,
            selections JSONB,
            design JSONB,
            shipping_info JSONB,
            address TEXT,
            phone TEXT,
            order_time TIMESTAMP,
            created_at TIMESTAMP,
            canvas_front TEXT,
            canvas_back TEXT,
            canvas_meta JSONB,
            source_all_id INTEGER,
            archived_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    try {
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_archive_user_created_at_desc ON orders_archive(user_id, created_at DESC)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_archive_archived_at_desc ON orders_archive(archived_at DESC)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_archive_status_created_at_desc ON orders_archive(status, created_at DESC)`);
    } catch (err) {
        console.warn('⚠️ Failed to ensure orders_archive indexes:', (err as any)?.message || err);
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

    // 购物车表：保存用户准备下单的设计
    await pool.query(`
        CREATE TABLE IF NOT EXISTS cart_items (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            quantity INTEGER NOT NULL DEFAULT 1,
            price NUMERIC(10,2) NOT NULL DEFAULT 0,
            category TEXT,
            items JSONB NOT NULL,
            selections JSONB,
            design JSONB,
            canvas_front TEXT,
            canvas_back TEXT,
            canvas_meta JSONB,
            source_all_id INTEGER REFERENCES all_designs(id) ON DELETE SET NULL,
            publish_to_all BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    try {
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_cart_items_user_id ON cart_items(user_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_cart_items_updated_at ON cart_items(updated_at DESC)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_cart_items_source_all_id ON cart_items(source_all_id)`);
    } catch (err) {
        console.warn('⚠️ Failed to ensure cart_items indexes:', (err as any)?.message || err);
    }

    // Gallery listing can be large; keep common sort/filter fast.
    try {
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_all_designs_created_at_desc ON all_designs(created_at DESC)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_all_designs_category_created_at_desc ON all_designs(category, created_at DESC)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_all_designs_source_order_id ON all_designs(source_order_id)`);
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
};

const ensureMembershipTables = async (pool: Pool) => {
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
        await pool.query(`ALTER TABLE memberships ADD COLUMN IF NOT EXISTS raw_payload JSONB`);
        await pool.query(`ALTER TABLE memberships ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
        await pool.query(`UPDATE memberships SET updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)`);
    } catch (err) {
        console.warn('⚠️ Failed to ensure memberships backward-compatible columns:', (err as any)?.message || err);
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
};

export const runStartupDbMigrations = async (pool: Pool) => {
    await ensureSchemaMigrationsTable(pool);
    await ensureUsersAndAdmin(pool);
    await ensureReferralRedemptions(pool);
    await ensureOrderAndDesignTables(pool);
    await ensureMembershipTables(pool);
    await markMigrationExecuted(pool, SCHEMA_MIGRATION_NAME);
};
