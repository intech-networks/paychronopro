import { isIsoDate, isPositiveInteger } from '../validation.js';

const maximumMoney = 999999999999.99;
const monetaryFields = [
  'grossCompensation',
  'taxableIncome',
  'nonTaxableCompensation',
  'sssEmployee',
  'philhealthEmployee',
  'pagibigEmployee',
  'unionDues',
  'tax',
  'netPay'
];

function readMoney(value) {
  const amount = Number(value);
  const cents = Math.round(amount * 100);
  if (!Number.isFinite(amount) || amount < 0 || amount > maximumMoney
    || Math.abs(amount * 100 - cents) > 1e-7) {
    return null;
  }
  return cents / 100;
}

function moneyCents(value) {
  return Math.round(value * 100);
}

export function validatePayrollRunInput(body) {
  const periodStart = String(body?.periodStart || '');
  const periodEnd = String(body?.periodEnd || '');
  const payDate = String(body?.payDate || '');
  const items = Array.isArray(body?.items) ? body.items : [];

  if (!periodStart || !periodEnd || !payDate || !isIsoDate(periodStart) || !isIsoDate(periodEnd) || !isIsoDate(payDate) || periodStart > periodEnd) {
    return { error:'Enter a valid payroll period and pay date.' };
  }
  if (payDate < periodEnd) {
    return { error:'Pay date cannot be earlier than the payroll period end.' };
  }
  const payDelayDays = (Date.parse(`${payDate}T00:00:00Z`)
    - Date.parse(`${periodEnd}T00:00:00Z`)) / 86400000;
  if (payDelayDays > 31) {
    return { error:'Pay date cannot be more than 31 days after the payroll period end.' };
  }
  const periodDays = (Date.parse(`${periodEnd}T00:00:00Z`)
    - Date.parse(`${periodStart}T00:00:00Z`)) / 86400000 + 1;
  if (periodDays > 31) {
    return { error:'A payroll run cannot cover more than 31 calendar days.' };
  }
  if (!items.length || items.length > 200) {
    return { error:'Include between 1 and 200 calculated employees.' };
  }

  const employeeIds = new Set();
  const normalizedItems = [];
  for (const item of items) {
    const employeeId = String(item?.employeeId || '');
    if (!isPositiveInteger(employeeId) || employeeIds.has(employeeId)) {
      return { error:'Each payroll employee must be valid and included only once.' };
    }
    employeeIds.add(employeeId);

    const recurringDeductions = Array.isArray(item?.deductions)
      ? item.deductions.reduce((sum, deduction) => sum + Number(deduction?.value || 0), 0)
      : Number(item?.recurringDeductions || 0);
    const nonTaxableEarnings = Array.isArray(item?.earnings)
      ? item.earnings.filter((earning) => earning?.isTaxable === false)
        .reduce((sum, earning) => sum + Number(earning?.value || 0), 0)
      : 0;
    const values = {
      grossCompensation:item.grossCompensation ?? item.grossPay,
      taxableIncome:item.taxableIncome ?? item.tax?.taxableIncome,
      nonTaxableCompensation:item.nonTaxableCompensation ?? nonTaxableEarnings,
      sssEmployee:item.contributions?.sssEmployee ?? 0,
      philhealthEmployee:item.contributions?.philhealthEmployee ?? 0,
      pagibigEmployee:item.contributions?.pagibigEmployee ?? 0,
      unionDues:item.unionDues ?? 0,
      tax:item.tax?.amount ?? item.tax,
      netPay:item.netPay
    };
    const normalized = Object.fromEntries(monetaryFields.map((field) => [field, readMoney(values[field])]));
    if (Object.values(normalized).some((value) => value === null)) {
      return { error:'Each payroll calculation must contain valid non-negative monetary values with up to two decimal places.' };
    }
    if (moneyCents(normalized.taxableIncome) + moneyCents(normalized.nonTaxableCompensation)
      > moneyCents(normalized.grossCompensation)) {
      return { error:'Taxable and non-taxable compensation cannot exceed gross compensation.' };
    }

    const attendanceDeduction = readMoney(item.attendanceDeduction ?? item.salary?.attendanceDeduction ?? 0);
    const normalizedRecurringDeductions = readMoney(recurringDeductions);
    if (attendanceDeduction === null || normalizedRecurringDeductions === null) {
      return { error:'Each payroll calculation must contain valid non-negative deductions.' };
    }
    const deductionsCents = moneyCents(normalized.sssEmployee)
      + moneyCents(normalized.philhealthEmployee)
      + moneyCents(normalized.pagibigEmployee)
      + moneyCents(normalized.unionDues)
      + moneyCents(normalized.tax)
      + moneyCents(attendanceDeduction)
      + moneyCents(normalizedRecurringDeductions);
    if (item.totalDeductions !== undefined) {
      const suppliedTotalDeductions = readMoney(item.totalDeductions);
      if (suppliedTotalDeductions === null || moneyCents(suppliedTotalDeductions) !== deductionsCents) {
        return { error:'A payroll calculation has inconsistent total deductions.' };
      }
    }
    const grossCompensationCents = moneyCents(normalized.grossCompensation);
    const expectedNetPayCents = grossCompensationCents - deductionsCents;
    if (moneyCents(normalized.netPay) > grossCompensationCents
      || moneyCents(normalized.netPay) !== expectedNetPayCents) {
      return { error:'A payroll calculation has an invalid net pay amount.' };
    }
    normalizedItems.push({ employeeId, ...normalized, calculation:item });
  }

  return { value:{ periodStart, periodEnd, payDate, items:normalizedItems } };
}
