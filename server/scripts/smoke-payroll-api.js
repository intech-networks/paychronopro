import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { config } from '../src/config.js';
import { pool } from '../src/db/pool.js';
import { manilaDateValue } from '../src/payroll/payout-adjustments.js';

if (config.isProduction) {
  throw new Error('The payroll smoke test is intentionally disabled in production.');
}

const baseUrl = `http://127.0.0.1:${config.port}`;
let cookie = '';
let employeeId = null;
let userId = null;
let payrollRunId = null;
let checks = 0;

function completedSemiMonthlyPeriod() {
  const today = manilaDateValue();
  const [year, month, day] = today.split('-').map(Number);
  if (day > 15) {
    return {
      periodStart:`${year}-${String(month).padStart(2, '0')}-01`,
      periodEnd:`${year}-${String(month).padStart(2, '0')}-15`
    };
  }
  const previousMonthEnd = new Date(Date.UTC(year, month - 1, 0));
  const end = previousMonthEnd.toISOString().slice(0, 10);
  return { periodStart:`${end.slice(0, 8)}16`, periodEnd:end };
}

async function api(path, { expectedStatus = 200, body, method = 'GET' } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers:{
      ...(cookie ? { Cookie:cookie } : {}),
      ...(body === undefined ? {} : { 'Content-Type':'application/json' })
    },
    body:body === undefined ? undefined : JSON.stringify(body)
  });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';', 1)[0];
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  assert.equal(response.status, expectedStatus, `${method} ${path}: ${text}`);
  checks += 1;
  return data;
}

try {
  await api('/api/auth/login', {
    method:'POST',
    body:{ email:config.adminEmail, password:config.adminPassword }
  });
  const health = await api('/api/health');
  assert.equal(health.status, 'ok');

  const roles = await api('/api/workforce/role-options');
  const employeeRole = roles.roles.find((role) => role.name === 'Employee' && role.assignable);
  assert.ok(employeeRole, 'The Employee role must be assignable.');

  const marker = randomUUID();
  const employee = await api('/api/workforce', {
    method:'POST',
    expectedStatus:201,
    body:{
      firstName:'Payroll',
      lastName:'Smoke Test',
      email:`payroll-smoke-${marker}@example.test`,
      hireDate:'2026-01-01',
      employmentStatus:'active',
      roleId:employeeRole.id,
      temporaryPassword:`Smoke-${marker}`
    }
  });
  employeeId = String(employee.employee.id);
  const account = await pool.query('SELECT user_id FROM employee_profiles WHERE id=$1', [employeeId]);
  userId = account.rows[0]?.user_id || null;

  await api(`/api/payroll/employees/${employeeId}`, {
    method:'PUT',
    body:{
      payBasis:'monthly',
      payFrequency:'semi_monthly',
      baseRate:30000,
      standardHoursPerDay:8,
      taxStatus:'taxable',
      effectiveDate:'2026-01-01',
      isMinimumWageEarner:false,
      autoCalculateContributions:false,
      contributionDeductionSchedule:'split_evenly',
      sssEmployeeShare:0,
      philhealthEmployeeShare:0,
      pagibigEmployeeShare:0,
      unionDues:0,
      notes:'API smoke test',
      components:[]
    }
  });

  const tomorrow = new Date(`${manilaDateValue()}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const futureDate = tomorrow.toISOString().slice(0, 10);
  await api(`/api/payroll/employees/${employeeId}/payout-preview`, {
    method:'POST',
    expectedStatus:400,
    body:{ periodStart:futureDate, periodEnd:futureDate, payDate:futureDate }
  });

  const period = completedSemiMonthlyPeriod();
  const preview = await api(`/api/payroll/employees/${employeeId}/payout-preview`, {
    method:'POST',
    body:{ ...period, payDate:period.periodEnd }
  });
  assert.equal(preview.employeeId, employeeId);
  assert.equal(typeof preview.payrollRunToken, 'string');
  assert.equal(preview.attendance.requiresReview, false);

  const unsignedPreview = { ...preview };
  delete unsignedPreview.payrollRunToken;
  await api('/api/payroll/runs', {
    method:'POST',
    expectedStatus:400,
    body:{ ...period, payDate:period.periodEnd, items:[unsignedPreview] }
  });

  const run = await api('/api/payroll/runs', {
    method:'POST',
    expectedStatus:201,
    body:{ ...period, payDate:period.periodEnd, items:[preview] }
  });
  payrollRunId = String(run.run.id);
  await api(`/api/payroll/runs/${payrollRunId}/status`, {
    method:'PUT',
    body:{ status:'finalized' }
  });
  await api(`/api/payroll/runs/${payrollRunId}/status`, {
    method:'PUT',
    body:{ status:'void' }
  });
  await api(`/api/workforce/${employeeId}`, { method:'DELETE', expectedStatus:409 });

  const taxConfigurations = await api('/api/tax-configurations');
  const configuration = taxConfigurations.configurations.find((item) => item.isActive);
  assert.ok(configuration, 'An active tax configuration is required.');
  await api('/api/tax-configurations/preview', {
    method:'POST',
    expectedStatus:400,
    body:{
      frequency:configuration.payFrequency,
      regularCompensation:0.001,
      brackets:configuration.brackets
    }
  });

  console.log(JSON.stringify({ ok:true, checks }));
} finally {
  if (payrollRunId) await pool.query('DELETE FROM payroll_runs WHERE id=$1', [payrollRunId]);
  if (employeeId) await pool.query('DELETE FROM employee_profiles WHERE id=$1', [employeeId]);
  if (userId) await pool.query('DELETE FROM users WHERE id=$1', [userId]);
  await pool.end();
}
