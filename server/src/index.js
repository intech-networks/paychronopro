import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import bcrypt from 'bcryptjs';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { requireAuth } from './auth/authorization.js';
import { rbacRouter } from './routes/rbac.js';
import { workforceRouter } from './routes/workforce.js';
import { departmentsRouter } from './routes/departments.js';
import { leaveManagementRouter } from './routes/leave-management.js';
import { leaveRequestsRouter } from './routes/leave-requests.js';
import { requestsRouter } from './routes/requests.js';
import { timeTrackingRouter } from './routes/time-tracking.js';
import { schedulerRouter } from './routes/scheduler.js';

export const app = express();
const PgSession = connectPgSimple(session);
const sessionCookieName = 'paytimepro.sid';

if (config.trustProxy) app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: config.clientOrigin, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(session({
  name: sessionCookieName,
  store: new PgSession({ pool, tableName: 'user_sessions', createTableIfMissing: true }),
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000
  }
}));

app.get('/api/health', async (_request, response) => {
  try {
    const result = await pool.query(`SELECT
      to_regclass('public.users') IS NOT NULL AS users,
      to_regclass('public.roles') IS NOT NULL AS roles,
      to_regclass('public.modules') IS NOT NULL AS modules`);
    const schemaReady = Object.values(result.rows[0]).every(Boolean);
    response.status(schemaReady ? 200 : 503).json({
      status: schemaReady ? 'ok' : 'degraded',
      database: 'connected',
      schema: schemaReady ? 'ready' : 'missing'
    });
  } catch (error) {
    console.error('Database health check failed', error);
    response.status(503).json({ status: 'degraded', database: 'disconnected', schema: 'unknown' });
  }
});

app.post('/api/auth/login', async (request, response, next) => {
  try {
    const email = String(request.body?.email || '').trim().toLowerCase();
    const password = String(request.body?.password || '');

    if (!email || !password) {
      return response.status(400).json({ error: 'Email and password are required.' });
    }
    if (email.length > 254 || password.length > 256) {
      return response.status(400).json({ error: 'Invalid email or password.' });
    }

    const result = await pool.query(
      `SELECT id, email, password_hash, display_name, role
       FROM users WHERE LOWER(email) = $1 AND is_active = TRUE LIMIT 1`,
      [email]
    );
    const user = result.rows[0];
    const passwordMatches = user ? await bcrypt.compare(password, user.password_hash) : false;

    if (!passwordMatches) {
      return response.status(401).json({ error: 'Invalid email or password.' });
    }

    await new Promise((resolve, reject) => request.session.regenerate((error) => error ? reject(error) : resolve()));
    request.session.userId = user.id;
    if (request.body?.remember) request.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
    await new Promise((resolve, reject) => request.session.save((error) => error ? reject(error) : resolve()));

    return response.json({
      user: { id: user.id, email: user.email, displayName: user.display_name, role: user.role }
    });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/auth/me', requireAuth, (request, response) => response.json({ user: request.user }));

app.post('/api/auth/logout', (request, response, next) => {
  request.session.destroy((error) => {
    if (error) return next(error);
    response.clearCookie(sessionCookieName, { httpOnly: true, secure: config.isProduction, sameSite: 'lax' });
    return response.status(204).end();
  });
});

app.use('/api/rbac', rbacRouter);
app.use('/api/workforce', workforceRouter);
app.use('/api/departments', departmentsRouter);
app.use('/api/leave-management', leaveManagementRouter);
app.use('/api/leave-requests', leaveRequestsRouter);
app.use('/api/requests', requestsRouter);
app.use('/api/time-tracking', timeTrackingRouter);
app.use('/api/scheduler', schedulerRouter);

app.use((error, _request, response, _next) => {
  console.error(error);
  if (error.type === 'entity.too.large') return response.status(413).json({ error: 'The uploaded document exceeds the 10 MB limit.' });
  if (error.type === 'entity.parse.failed') return response.status(400).json({ error: 'The request contains invalid JSON.' });
  response.status(500).json({ error: 'Internal server error' });
});

if (!process.env.VERCEL) {
  const server = app.listen(config.port, () => {
    console.log(`API listening on http://localhost:${config.port}`);
  });

  async function shutdown() {
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

export default app;
