import 'dotenv/config';

import connectToDatabase from './config/database';
import { runStartupDbMigrations } from './db/startup-migrations';
import { assertRuntimeEnvOrThrow } from './config/env-guard';

const main = async () => {
  assertRuntimeEnvOrThrow();

  const pool = await connectToDatabase();
  try {
    console.log('🛠️ Running database migrations...');
    await runStartupDbMigrations(pool);
    console.log('✅ Database migrations completed.');
  } finally {
    await pool.end();
  }
};

main().catch((error) => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});
