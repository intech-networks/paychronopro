const ordinaryWorkMultipliers = {
  scheduledOvertime:1.25,
  restDayFirstHours:1.3,
  restDayOvertime:1.69
};

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function nonNegativeNumber(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new RangeError(`${field} must be a non-negative number.`);
  }
  return number;
}

export function manilaDateValue(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(date.getTime())) throw new RangeError('now must be a valid date.');
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone:'Asia/Manila',
    year:'numeric',
    month:'2-digit',
    day:'2-digit'
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function isFuturePayoutPeriodEnd(periodEnd, now = new Date()) {
  return String(periodEnd) > manilaDateValue(now);
}

// Statutory overtime, holiday, night-shift, and hazard premiums remain exempt
// for a qualified minimum-wage earner. Other configured earnings retain their
// own isTaxable setting and must not use this helper.
export function isStatutoryPremiumTaxable(isMinimumWageEarner) {
  return isMinimumWageEarner !== true;
}

// approvedMinutes must come from a trusted, approved overtime record. Attendance
// alone establishes work performed, but it must not silently authorize overtime.
export function calculateOrdinaryWorkAdjustment({
  dayRate,
  workedMinutes,
  standardMinutes,
  isScheduledDay,
  approvedMinutes = 0
} = {}) {
  const rate = nonNegativeNumber(dayRate, 'dayRate');
  const worked = nonNegativeNumber(workedMinutes, 'workedMinutes');
  const standard = nonNegativeNumber(standardMinutes, 'standardMinutes');
  const approved = nonNegativeNumber(approvedMinutes, 'approvedMinutes');
  if (standard === 0) throw new RangeError('standardMinutes must be greater than zero.');
  if (typeof isScheduledDay !== 'boolean') {
    throw new TypeError('isScheduledDay must be a boolean.');
  }

  const candidateMinutes = isScheduledDay ? Math.max(0, worked - standard) : worked;
  const payableMinutes = Math.min(candidateMinutes, approved);
  const unapprovedMinutes = Math.max(0, candidateMinutes - payableMinutes);
  const firstHoursMinutes = isScheduledDay ? 0 : Math.min(payableMinutes, standard);
  const overtimeMinutes = isScheduledDay
    ? payableMinutes
    : Math.max(0, payableMinutes - standard);
  const firstHoursPay = isScheduledDay ? 0 : roundMoney(
    rate * (firstHoursMinutes / standard) * ordinaryWorkMultipliers.restDayFirstHours
  );
  const overtimeMultiplier = isScheduledDay
    ? ordinaryWorkMultipliers.scheduledOvertime
    : ordinaryWorkMultipliers.restDayOvertime;
  const overtimePay = roundMoney(rate * (overtimeMinutes / standard) * overtimeMultiplier);

  return {
    additionalPay:roundMoney(firstHoursPay + overtimePay),
    approvalRequired:unapprovedMinutes > 0,
    breakdown:{
      candidateMinutes:Math.round(candidateMinutes),
      approvedMinutes:Math.round(payableMinutes),
      unapprovedMinutes:Math.round(unapprovedMinutes),
      firstHoursMinutes:Math.round(firstHoursMinutes),
      overtimeMinutes:Math.round(overtimeMinutes),
      firstHoursPay,
      overtimePay
    }
  };
}
