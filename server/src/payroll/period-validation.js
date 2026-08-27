import { isIsoDate } from '../validation.js';

const millisecondsPerDay = 24 * 60 * 60 * 1000;

function parseDate(value) {
  const date = String(value || '');
  if (!date || !isIsoDate(date)) return null;
  const [year, month, day] = date.split('-').map(Number);
  return {
    year,
    month,
    day,
    time:Date.parse(`${date}T00:00:00Z`)
  };
}

function daysInMonth(year, month) {
  if (month === 2) {
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leapYear ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function isPayrollPeriodShapeValid({ frequency, periodStart, periodEnd } = {}) {
  const start = parseDate(periodStart);
  const end = parseDate(periodEnd);
  if (!start || !end || start.time > end.time) return false;

  const inclusiveDays = (end.time - start.time) / millisecondsPerDay + 1;
  if (frequency === 'weekly') return inclusiveDays === 7;
  if (frequency === 'biweekly') return inclusiveDays === 14;

  const sameMonth = start.year === end.year && start.month === end.month;
  if (!sameMonth) return false;
  const monthEnd = daysInMonth(start.year, start.month);

  if (frequency === 'semi_monthly') {
    return (start.day === 1 && end.day === 15)
      || (start.day === 16 && end.day === monthEnd);
  }
  if (frequency === 'monthly') return start.day === 1 && end.day === monthEnd;
  return false;
}
