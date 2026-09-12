import dotenv from 'dotenv';

dotenv.config({ path: new URL('../../.env', import.meta.url), quiet: true });

const isProduction = process.env.NODE_ENV === 'production';
const sessionSecret = process.env.SESSION_SECRET || 'development-only-change-this-secret';
const databaseSchema = process.env.DATABASE_SCHEMA || 'paytimepro';
const configuredDatabaseUrl = process.env.DATABASE_URL;

function normalizeDatabaseUrl(value) {
  try {
    const url = new URL(value);
    if (['prefer', 'require', 'verify-ca'].includes(url.searchParams.get('sslmode'))) {
      url.searchParams.set('sslmode', 'verify-full');
    }
    return url.toString();
  } catch {
    return value;
  }
}

if (isProduction && (sessionSecret.length < 32 || sessionSecret === 'development-only-change-this-secret' || sessionSecret.startsWith('replace-with-'))) {
  throw new Error('SESSION_SECRET must be set to a unique value of at least 32 characters in production.');
}

if (isProduction && !configuredDatabaseUrl) {
  throw new Error('DATABASE_URL must be set in production.');
}

if (!/^[a-z_][a-z0-9_]*$/.test(databaseSchema)) {
  throw new Error('DATABASE_SCHEMA must contain only lowercase letters, numbers, and underscores, and cannot start with a number.');
}

export const config = {
  port: Number(process.env.PORT) || 5000,
  databaseUrl: normalizeDatabaseUrl(configuredDatabaseUrl || 'postgresql://postgres:postgres@localhost:5432/paytimepro'),
  databaseSchema,
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  sessionSecret,
  adminEmail: process.env.ADMIN_EMAIL || 'admin@paytimepro.local',
  adminPassword: process.env.ADMIN_PASSWORD || 'ChangeMe123!',
  adminName: process.env.ADMIN_NAME || 'PayTimePro Administrator',
  resetAdminPassword: process.env.RESET_ADMIN_PASSWORD === 'true',
  seedDemoData: !isProduction && process.env.SEED_DEMO_DATA === 'true',
  isProduction,
  databaseSsl: process.env.DATABASE_SSL === 'true',
  debugApiErrors: !isProduction && process.env.DEBUG_API_ERRORS === 'true',
  trustProxy: process.env.TRUST_PROXY === 'true',
  syncAgentId: process.env.SYNC_AGENT_ID || 'office-main',
  syncAgentSecret: process.env.SYNC_AGENT_SECRET || ''
};

export const databaseSchemaIdentifier = `"${databaseSchema}"`;
