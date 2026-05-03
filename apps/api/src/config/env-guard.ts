import 'dotenv/config';

const PRODUCTION = process.env.NODE_ENV === 'production';

const looksWeakSecret = (value: string) => {
    const normalized = value.trim().toLowerCase();
    const knownWeak = new Set([
        'your-super-secret-jwt-key-change-this-in-production',
        'change-me',
        '123456',
        'password',
        'secret',
        'jwt-secret',
        'admin',
    ]);

    return value.trim().length < 32 || knownWeak.has(normalized);
};

export const validateRuntimeEnv = () => {
    const errors: string[] = [];
    const warnings: string[] = [];

    const parseEndpointList = (multiValue?: string, singleValue?: string) => {
        return Array.from(
            new Set(
                `${multiValue || ''},${singleValue || ''}`
                    .split(',')
                    .map((item) => item.trim())
                    .filter(Boolean)
            )
        );
    };

    const jwtSecret = process.env.JWT_SECRET || '';
    if (!jwtSecret.trim()) {
        errors.push('JWT_SECRET is required');
    } else if (PRODUCTION && looksWeakSecret(jwtSecret)) {
        errors.push('JWT_SECRET is too weak for production (min 32 chars and not a known default)');
    }

    const dbUrls = parseEndpointList(process.env.DATABASE_URLS, process.env.DATABASE_URL);
    if (dbUrls.length === 0) {
        warnings.push('DATABASE_URL / DATABASE_URLS are missing (service may run in degraded mode)');
    }

    const rabbitUrls = parseEndpointList(process.env.RABBITMQ_URLS, process.env.RABBITMQ_URL);
    if (PRODUCTION && rabbitUrls.some((url) => url.includes('guest:guest@'))) {
        errors.push('RABBITMQ_URL / RABBITMQ_URLS use guest credentials in production');
    }

    const adminPassword = process.env.ADMIN_PASSWORD || '';
    if (PRODUCTION && adminPassword.trim() && looksWeakSecret(adminPassword)) {
        errors.push('ADMIN_PASSWORD looks weak in production');
    }

    const requireSharedJobState = (process.env.REQUIRE_SHARED_JOB_STATE || 'true').toLowerCase() === 'true';
    const allowInMemoryJobState = (process.env.ALLOW_INMEMORY_JOB_STATE || 'false').toLowerCase() === 'true';
    const hasRedisUrl = parseEndpointList(process.env.REDIS_URLS, process.env.REDIS_URL).length > 0;

    if (!hasRedisUrl && !allowInMemoryJobState) {
        errors.push('Durable job state requires REDIS_URL / REDIS_URLS (or explicitly set ALLOW_INMEMORY_JOB_STATE=true for local-only volatile mode)');
    }

    if (requireSharedJobState && !hasRedisUrl) {
        errors.push('REQUIRE_SHARED_JOB_STATE=true requires REDIS_URL or REDIS_URLS');
    }

    if (PRODUCTION && allowInMemoryJobState) {
        errors.push('ALLOW_INMEMORY_JOB_STATE=true is not allowed in production');
    }

    if (allowInMemoryJobState) {
        warnings.push('ALLOW_INMEMORY_JOB_STATE=true enables volatile job metadata; job state will be lost after restart');
    }

    return {
        ok: errors.length === 0,
        errors,
        warnings,
    };
};

export const assertRuntimeEnvOrThrow = () => {
    const result = validateRuntimeEnv();

    for (const warning of result.warnings) {
        console.warn(`[env-guard] ${warning}`);
    }

    if (!result.ok) {
        for (const error of result.errors) {
            console.error(`[env-guard] ${error}`);
        }
        throw new Error('Environment validation failed. Refuse to start with unsafe configuration.');
    }
};

if (require.main === module) {
    try {
        assertRuntimeEnvOrThrow();
        console.log('[env-guard] Environment validation passed.');
    } catch (error) {
        console.error('[env-guard] Validation failed:', error instanceof Error ? error.message : error);
        process.exit(1);
    }
}
