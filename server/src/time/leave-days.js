const weekdayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
export const defaultLeaveWorkDays = ['monday','tuesday','wednesday','thursday','friday'];

export function countLeaveWorkDays(startDate, endDate, workDays = defaultLeaveWorkDays, excludedDates = []) {
  const allowedDays = new Set(workDays);
  const excluded = new Set(excludedDates);
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  let count = 0;
  for (const date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
    const dateValue = date.toISOString().slice(0, 10);
    if (allowedDays.has(weekdayNames[date.getUTCDay()]) && !excluded.has(dateValue)) count += 1;
  }
  return count;
}
