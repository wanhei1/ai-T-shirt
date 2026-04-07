import 'dotenv/config';

type ValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

const PRODUCTION = process.env.NODE_ENV === 'production';

const parseBool = (value: string | undefined, fallback: boolean) => {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};

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

const parsePositiveNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseFloat(value || '');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const validateDrReadiness = (): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  const enforceMultiAz = parseBool(process.env.DR_ENFORCE_MULTI_AZ, PRODUCTION);
  const allowSingleNodeDev = parseBool(process.env.DR_ALLOW_SINGLE_NODE, !PRODUCTION);

  const dbEndpoints = parseEndpointList(process.env.DATABASE_URLS, process.env.DATABASE_URL);
  const mqEndpoints = parseEndpointList(process.env.RABBITMQ_URLS, process.env.RABBITMQ_URL);
  const redisEndpoints = parseEndpointList(process.env.REDIS_URLS, process.env.REDIS_URL);

  if (enforceMultiAz && !allowSingleNodeDev) {
    if (dbEndpoints.length < 2) {
      errors.push('DR readiness requires >=2 database endpoints (DATABASE_URLS) for multi-AZ failover');
    }
    if (mqEndpoints.length < 2) {
      errors.push('DR readiness requires >=2 RabbitMQ endpoints (RABBITMQ_URLS) for multi-AZ failover');
    }
    if (redisEndpoints.length < 2) {
      errors.push('DR readiness requires >=2 Redis endpoints (REDIS_URLS) for multi-AZ failover');
    }
  } else {
    warnings.push('DR multi-AZ endpoint enforcement is relaxed (DR_ALLOW_SINGLE_NODE=true or DR_ENFORCE_MULTI_AZ=false)');
  }

  const txRtoSameAz = parsePositiveNumber(process.env.DR_RTO_CORE_SAME_AZ_MINUTES, 15);
  const txRpoSameAz = parsePositiveNumber(process.env.DR_RPO_CORE_SAME_AZ_MINUTES, 5);
  const aiRtoSameAz = parsePositiveNumber(process.env.DR_RTO_AI_SAME_AZ_MINUTES, 60);
  const aiRpoSameAz = parsePositiveNumber(process.env.DR_RPO_AI_SAME_AZ_MINUTES, 15);

  if (txRtoSameAz > 15) warnings.push(`Core transaction same-AZ RTO target is ${txRtoSameAz}m (>15m recommended)`);
  if (txRpoSameAz > 5) warnings.push(`Core transaction same-AZ RPO target is ${txRpoSameAz}m (>5m recommended)`);
  if (aiRtoSameAz > 60) warnings.push(`AI async same-AZ RTO target is ${aiRtoSameAz}m (>60m recommended)`);
  if (aiRpoSameAz > 15) warnings.push(`AI async same-AZ RPO target is ${aiRpoSameAz}m (>15m recommended)`);

  const backupIncrementalMins = parsePositiveNumber(process.env.DR_BACKUP_INCREMENTAL_MINUTES, 15);
  const backupDailyFull = parseBool(process.env.DR_BACKUP_DAILY_FULL, false);
  const objectCrossRegion = parseBool(process.env.DR_OBJECT_STORAGE_CROSS_REGION, false);
  const secretMultiRegion = parseBool(process.env.DR_SECRETS_MULTI_REGION, false);

  if (backupIncrementalMins > 15) {
    warnings.push(`DR_BACKUP_INCREMENTAL_MINUTES=${backupIncrementalMins} exceeds recommended 15m for cross-region recovery`);
  }
  if (!backupDailyFull) {
    warnings.push('DR_BACKUP_DAILY_FULL=false: daily full backup is recommended for cross-region restore confidence');
  }
  if (!objectCrossRegion) {
    warnings.push('DR_OBJECT_STORAGE_CROSS_REGION=false: design/result assets may not be recoverable across region');
  }
  if (!secretMultiRegion) {
    warnings.push('DR_SECRETS_MULTI_REGION=false: key material is not explicitly multi-region hardened');
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
};

const main = () => {
  const result = validateDrReadiness();

  for (const warning of result.warnings) {
    console.warn(`[dr-readiness] ${warning}`);
  }

  if (!result.ok) {
    for (const error of result.errors) {
      console.error(`[dr-readiness] ${error}`);
    }
    process.exit(1);
  }

  console.log('[dr-readiness] DR readiness validation passed.');
};

if (require.main === module) {
  main();
}
