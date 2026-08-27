const holidayRules = {
  regular: {
    label:'Regular holiday',
    scheduledFirstHours:2,
    restDayFirstHours:2.6,
    scheduledOvertime:2.6,
    restDayOvertime:3.38,
    scheduledNoWorkPaid:true
  },
  special_non_working: {
    label:'Special non-working holiday',
    scheduledFirstHours:1.3,
    restDayFirstHours:1.5,
    scheduledOvertime:1.69,
    restDayOvertime:1.95,
    scheduledNoWorkPaid:false
  }
};

const nonStatutoryHolidayLabels = {
  company:'Company holiday',
  other:'Other holiday'
};

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function nonNegativeNumber(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new RangeError(`${field} must be a non-negative number.`);
  return number;
}

function emptyResult() {
  return {
    baseDeduction:0,
    additionalPay:0,
    labels:[],
    breakdown:{
      firstHoursAdditionalPay:0,
      overtimeAdditionalPay:0,
      regularMinutes:0,
      overtimeMinutes:0
    }
  };
}

// Adjusts a payroll base that already includes one dayRate for every scheduled day.
// baseDeduction removes an unearned scheduled base; additionalPay adds premiums or
// the full holiday/rest-day amount when no scheduled base was included.
export function calculateHolidayPayAdjustment({
  dayRate,
  workedMinutes,
  standardMinutes,
  isScheduledDay,
  holidayType
} = {}) {
  const rate = nonNegativeNumber(dayRate, 'dayRate');
  const worked = nonNegativeNumber(workedMinutes, 'workedMinutes');
  const standard = nonNegativeNumber(standardMinutes, 'standardMinutes');
  if (standard === 0) throw new RangeError('standardMinutes must be greater than zero.');
  if (typeof isScheduledDay !== 'boolean') throw new TypeError('isScheduledDay must be a boolean.');

  const result = emptyResult();
  const type = String(holidayType || '');
  if (!type) return result;

  const nonStatutoryLabel = nonStatutoryHolidayLabels[type];
  if (nonStatutoryLabel) {
    result.labels.push(worked === 0 && isScheduledDay
      ? `${nonStatutoryLabel} paid scheduled day`
      : `${nonStatutoryLabel} — no statutory premium`);
    return result;
  }

  const rule = holidayRules[type];
  if (!rule) throw new RangeError('holidayType must be regular, special_non_working, company, or other.');

  const regularMinutes = Math.min(worked, standard);
  const overtimeMinutes = Math.max(0, worked - standard);
  result.breakdown.regularMinutes = regularMinutes;
  result.breakdown.overtimeMinutes = overtimeMinutes;

  if (worked === 0) {
    if (isScheduledDay && !rule.scheduledNoWorkPaid) {
      result.baseDeduction = roundMoney(rate);
      result.labels.push(`${rule.label} — no work, no pay`);
    } else if (isScheduledDay) {
      result.labels.push(`${rule.label} paid scheduled day`);
    }
    return result;
  }

  // A scheduled special non-working day starts as part of periodBase, but the
  // statutory default is no-work/no-pay. Remove that base first, then add only
  // the hours actually worked at the full special-day multiplier.
  const removeScheduledBase = isScheduledDay && !rule.scheduledNoWorkPaid;
  if (removeScheduledBase) result.baseDeduction = roundMoney(rate);
  const firstHoursMultiplier = isScheduledDay
    ? (removeScheduledBase ? rule.scheduledFirstHours : rule.scheduledFirstHours - 1)
    : rule.restDayFirstHours;
  const overtimeMultiplier = isScheduledDay
    ? rule.scheduledOvertime
    : rule.restDayOvertime;
  const firstHoursAdditionalPay = roundMoney(rate * (regularMinutes / standard) * firstHoursMultiplier);
  const overtimeAdditionalPay = roundMoney(rate * (overtimeMinutes / standard) * overtimeMultiplier);

  result.breakdown.firstHoursAdditionalPay = firstHoursAdditionalPay;
  result.breakdown.overtimeAdditionalPay = overtimeAdditionalPay;
  result.additionalPay = roundMoney(firstHoursAdditionalPay + overtimeAdditionalPay);
  if (firstHoursAdditionalPay > 0) {
    result.labels.push(isScheduledDay
      ? `${rule.label} worked-day premium`
      : `${rule.label} rest-day pay`);
  }
  if (overtimeAdditionalPay > 0) result.labels.push(`${rule.label} overtime pay`);
  return result;
}
