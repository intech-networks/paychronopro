import dotenv from 'dotenv';

dotenv.config({ path: new URL('../../.env', import.meta.url), quiet: true });

const isProduction = process.env.NODE_ENV === 'production';
const sessionSecret = process.env.SESSION_SECRET || 'development-only-change-this-secret';

if (isProduction && (sessionSecret.length < 32 || sessionSecret === 'development-only-change-this-secret' || sessionSecret.startsWith('replace-with-'))) {
  throw new Error('SESSION_SECRET must be set to a unique value of at least 32 characters in production.');
}

export const config = {
  port: Number(process.env.PORT) || 5000,
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/paytimepro',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  sessionSecret,
  adminEmail: process.env.ADMIN_EMAIL || 'admin@paytimepro.local',
  adminPassword: process.env.ADMIN_PASSWORD || 'ChangeMe123!',
  adminName: process.env.ADMIN_NAME || 'PayTimePro Administrator',
  isProduction,
  databaseSsl: process.env.DATABASE_SSL === 'true',
  trustProxy: process.env.TRUST_PROXY === 'true'
};
