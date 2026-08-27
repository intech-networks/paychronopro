function dateAtYear(dateValue, year) {
  const [, , month, day] = String(dateValue).match(/^(\d{4})-(\d{2})-(\d{2})$/) || [];
  if (!month || !day) return null;
  const date = new Date(Date.UTC(year, Number(month) - 1, Number(day)));
  if (date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) return null;
  return date.toISOString().slice(0, 10);
}

function addDays(dateValue, days) {
  const date = new Date(`${dateValue}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function durationInDays(startDate, endDate) {
  return Math.max(0, Math.round((Date.parse(`${endDate || startDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000));
}

function overlaps(item, startDate, endDate) {
  return item.startDate <= endDate && (item.endDate || item.startDate) >= startDate;
}

const gregorianCalendarCycleYears = 400;

/**
 * Returns the smallest safe comparison window for calendar records.
 *
 * A recurring date pattern repeats every 400 years in the Gregorian calendar.
 * Checking one full cycle from the first year both records can exist catches
 * collisions such as a February 29 series intersecting a February 28–March 1
 * series in a later leap year.
 */
export function occurrenceComparisonRange(items) {
  const sourceStartYears = items.map((item) => Number((item.sourceStartDate || item.startDate).slice(0, 4)));
  const hasRecurringItem = items.some((item) => item.isRecurring);

  if (hasRecurringItem) {
    const firstComparableYear = Math.max(...sourceStartYears);
    return {
      startDate:`${firstComparableYear}-01-01`,
      endDate:`${firstComparableYear + gregorianCalendarCycleYears - 1}-12-31`
    };
  }

  const sourceEndYears = items.map((item) => Number((item.sourceEndDate ?? item.endDate ?? item.startDate).slice(0, 4)));
  return {
    startDate:`${Math.min(...sourceStartYears) - 1}-01-01`,
    endDate:`${Math.max(...sourceEndYears) + 1}-12-31`
  };
}

export function expandYearlyOccurrences(items, startDate, endDate) {
  const requestedFirstYear = Number(startDate.slice(0, 4)) - 1;
  const lastYear = Number(endDate.slice(0, 4));
  const occurrences = [];

  for (const item of items) {
    const sourceStartDate = item.sourceStartDate || item.startDate;
    const sourceEndDate = item.sourceEndDate === undefined ? item.endDate : item.sourceEndDate;
    if (!item.isRecurring) {
      if (overlaps(item, startDate, endDate)) {
        occurrences.push({ ...item, sourceStartDate, sourceEndDate });
      }
      continue;
    }

    const duration = durationInDays(sourceStartDate, sourceEndDate);
    const firstYear = Math.max(requestedFirstYear, Number(sourceStartDate.slice(0, 4)));
    for (let year = firstYear; year <= lastYear; year += 1) {
      const occurrenceStart = dateAtYear(sourceStartDate, year);
      if (!occurrenceStart) continue;
      const occurrenceEnd = duration ? addDays(occurrenceStart, duration) : null;
      const occurrence = {
        ...item,
        startDate:occurrenceStart,
        endDate:occurrenceEnd,
        sourceStartDate,
        sourceEndDate,
        occurrenceYear:year
      };
      if (overlaps(occurrence, startDate, endDate)) occurrences.push(occurrence);
    }
  }

  return occurrences;
}
