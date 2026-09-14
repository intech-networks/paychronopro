import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { requireAuth } from './auth/authorization.js';
import { rbacRouter } from './routes/rbac.js';
import { workforceRouter } from './routes/workforce.js';
import { leaveManagementRouter } from './routes/leave-management.js';
import { leaveRequestsRouter } from './routes/leave-requests.js';
import { requestsRouter } from './routes/requests.js';
import { timeTrackingRouter } from './routes/time-tracking.js';
import { schedulerRouter } from './routes/scheduler.js';
import { organizationRouter } from './routes/organization.js';
import { payrollRouter } from './routes/payroll.js';
import { payrollComplianceRouter } from './routes/payroll-compliance.js';
import { payoutRouter } from './routes/payout.js';
import { disbursementRouter } from './routes/disbursement.js';
import { taxRouter } from './routes/tax.js';
import { calendarRouter } from './routes/calendar.js';
import { companyRouter } from './routes/company.js';
import { siteSettingsRouter } from './routes/site-settings.js';

export const app = express();
const PgSession = connectPgSimple(session);
const sessionCookieName = 'paytimepro.sid';

if (config.trustProxy) app.set('trust proxy', 1);
app.use((request, response, next) => {
  request.requestId = randomUUID();
  response.setHeader('X-Request-ID', request.requestId);
  next();
});
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
      to_regclass($1) IS NOT NULL AS users,
      to_regclass($2) IS NOT NULL AS roles,
      to_regclass($3) IS NOT NULL AS modules,
      to_regclass($4) IS NOT NULL AS calendar_holidays,
      to_regclass($5) IS NOT NULL AS calendar_events,
      to_regclass($6) IS NOT NULL AS company_profile,
      to_regclass($7) IS NOT NULL AS employee_profiles,
      to_regclass($8) IS NOT NULL AS employee_number_sequence,
      to_regclass($9) IS NOT NULL AS organization_departments,
      to_regclass($10) IS NOT NULL AS organization_positions,
      to_regclass($11) IS NOT NULL AS organization_assignments,
      to_regclass($12) IS NOT NULL AS organization_assignment_managers,
      to_regclass($13) IS NOT NULL AS employee_payroll_profiles,
      to_regclass($14) IS NOT NULL AS employee_payroll_components,
      to_regclass($15) IS NOT NULL AS payroll_runs,
      to_regclass($16) IS NOT NULL AS payroll_run_items,
      to_regclass($17) IS NOT NULL AS employee_shift_assignments,
      to_regclass($18) IS NOT NULL AS employee_leave_requests,
      NOT EXISTS (
        SELECT 1 FROM UNNEST($20::text[]) required(column_name)
        WHERE NOT EXISTS (
          SELECT 1 FROM information_schema.columns actual
          WHERE actual.table_schema=$19
            AND actual.table_name='employee_profiles'
            AND actual.column_name=required.column_name
        )
      ) AS employee_profile_columns,
      NOT EXISTS (
        SELECT 1 FROM UNNEST($21::text[]) required(column_name)
        WHERE NOT EXISTS (
          SELECT 1 FROM information_schema.columns actual
          WHERE actual.table_schema=$19
            AND actual.table_name='organization_assignments'
            AND actual.column_name=required.column_name
        )
      ) AS organization_assignment_columns,
      NOT EXISTS (
        SELECT 1 FROM UNNEST($22::text[]) required(column_name)
        WHERE NOT EXISTS (
          SELECT 1 FROM information_schema.columns actual
          WHERE actual.table_schema=$19
            AND actual.table_name='employee_payroll_profiles'
            AND actual.column_name=required.column_name
        )
      ) AS employee_payroll_profile_columns,
      NOT EXISTS (
        SELECT 1 FROM UNNEST($23::text[]) required(column_name)
        WHERE NOT EXISTS (
          SELECT 1 FROM information_schema.columns actual
          WHERE actual.table_schema=$19
            AND actual.table_name='payroll_run_items'
            AND actual.column_name=required.column_name
        )
      ) AS payroll_run_item_columns,
      NOT EXISTS (
        SELECT 1 FROM UNNEST($24::text[]) required(column_name)
        WHERE NOT EXISTS (
          SELECT 1 FROM information_schema.columns actual
          WHERE actual.table_schema=$19
            AND actual.table_name='employee_shift_assignments'
            AND actual.column_name=required.column_name
        )
      ) AS employee_shift_assignment_columns,
      EXISTS (SELECT 1 FROM modules WHERE module_key = 'calendar' AND is_active = TRUE) AS calendar_module,
      EXISTS (SELECT 1 FROM modules WHERE module_key = 'disbursement' AND is_active = TRUE) AS disbursement_module,
      EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname='payroll_run_items_compensation_totals_check' AND convalidated=TRUE
      ) AS payroll_run_integrity`, [
      `${config.databaseSchema}.users`,
      `${config.databaseSchema}.roles`,
      `${config.databaseSchema}.modules`,
      `${config.databaseSchema}.company_holidays`,
      `${config.databaseSchema}.company_events`,
      `${config.databaseSchema}.company_profiles`,
      `${config.databaseSchema}.employee_profiles`,
      `${config.databaseSchema}.employee_number_sequence`,
      `${config.databaseSchema}.organization_departments`,
      `${config.databaseSchema}.organization_positions`,
      `${config.databaseSchema}.organization_assignments`,
      `${config.databaseSchema}.organization_assignment_managers`,
      `${config.databaseSchema}.employee_payroll_profiles`,
      `${config.databaseSchema}.employee_payroll_components`,
      `${config.databaseSchema}.payroll_runs`,
      `${config.databaseSchema}.payroll_run_items`,
      `${config.databaseSchema}.employee_shift_assignments`,
      `${config.databaseSchema}.employee_leave_requests`,
      config.databaseSchema,
      [
        'id', 'user_id', 'employee_number', 'first_name', 'middle_name', 'last_name', 'suffix',
        'preferred_name', 'email', 'phone', 'address', 'date_of_birth', 'gender', 'civil_status',
        'job_title', 'department', 'hire_date', 'employment_status', 'emergency_contact_name',
        'emergency_contact_relationship', 'emergency_contact_phone', 'emergency_contact_alternate_phone',
        'profile_picture_data', 'profile_picture_mime_type', 'profile_picture_updated_at'
      ],
      ['id', 'employee_id', 'unit_id', 'position_id', 'manager_employee_id', 'effective_from', 'effective_to'],
      [
        'employee_id', 'pay_basis', 'pay_frequency', 'base_rate', 'standard_hours_per_day', 'tax_status',
        'effective_date', 'is_minimum_wage_earner', 'auto_calculate_contributions',
        'monthly_contribution_base', 'minimum_wage_region', 'minimum_daily_wage',
        'contribution_deduction_schedule', 'employee_classification', 'sss_employee_share',
        'philhealth_employee_share', 'pagibig_employee_share', 'union_dues', 'notes'
      ],
      [
        'run_id', 'employee_id', 'gross_compensation', 'taxable_compensation',
        'non_taxable_compensation', 'sss_employee', 'philhealth_employee', 'pagibig_employee',
        'sss_employer', 'sss_ec_employer', 'philhealth_employer', 'pagibig_employer',
        'union_dues', 'tax_withheld', 'tax_refund', 'net_pay', 'calculation',
        'disbursement_status', 'disbursement_method', 'disbursement_reference',
        'disbursement_notes', 'disbursed_at', 'disbursed_by'
      ],
      ['employee_id', 'shift_type', 'start_time', 'end_time', 'work_days']
    ]);
    const schemaReady = Object.values(result.rows[0]).every(Boolean);
    response.status(schemaReady ? 200 : 503).json({
      status: schemaReady ? 'ok' : 'degraded',
      database: 'connected',
      databaseSchema: config.databaseSchema,
      schema: schemaReady ? 'ready' : 'missing',
      checks: result.rows[0]
    });
  } catch (error) {
    console.error('Database health check failed', error);
    response.status(503).json({
      status: 'degraded',
      database: 'disconnected',
      databaseSchema: config.databaseSchema,
      schema: 'unknown'
    });
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
app.use('/api/leave-management', leaveManagementRouter);
app.use('/api/leave-requests', leaveRequestsRouter);
app.use('/api/requests', requestsRouter);
app.use('/api/time-tracking', timeTrackingRouter);
app.use('/api/scheduler', schedulerRouter);
app.use('/api/organization', organizationRouter);
app.use('/api/payroll', payrollRouter);
app.use('/api/payroll', payrollComplianceRouter);
app.use('/api/payroll', payoutRouter);
app.use('/api/payroll', disbursementRouter);
app.use('/api/tax-configurations', taxRouter);
app.use('/api/calendar', calendarRouter);
app.use('/api/company', companyRouter);
app.use('/api/site-settings', siteSettingsRouter);

app.use((error, request, response, _next) => {
  const requestId = request.requestId || randomUUID();
  console.error(`[API ${requestId}] ${request.method} ${request.originalUrl}`, {
    message:error.message,
    code:error.code,
    constraint:error.constraint,
    stack:error.stack
  });
  if (error.type === 'entity.too.large') return response.status(413).json({ error: 'The uploaded document exceeds the 10 MB limit.', requestId });
  if (error.type === 'entity.parse.failed') return response.status(400).json({ error: 'The request contains invalid JSON.', requestId });
  if (['22P02', '22007', '22003', '23514'].includes(error.code)) {
    return response.status(400).json({ error:'The request contains an invalid value.', requestId });
  }
  if (error.code === '23503' || error.code === '23001') {
    return response.status(409).json({ error:'The request conflicts with related records.', requestId });
  }
  if (error.code === '23505') {
    return response.status(409).json({ error:'The request conflicts with an existing record.', requestId });
  }
  if (Number.isInteger(error.status) && error.status >= 400 && error.status < 600) {
    return response.status(error.status).json({ error:error.message, requestId });
  }
  const payload = { error:'The server could not complete this request.', requestId };
  if (config.debugApiErrors) payload.debug = { message:error.message || 'Unknown error', code:error.code || null };
  return response.status(500).json(payload);
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
