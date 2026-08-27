import { isIsoDate, isPositiveInteger } from '../validation.js';

export const holidayTypes = ['regular', 'special_non_working', 'company', 'other'];
export const eventTypes = ['company_event', 'meeting', 'training', 'celebration', 'other'];
export const calendarStatuses = ['active', 'cancelled'];

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const maximumCalendarRecordSpanDays = 365;

function cleanText(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function checked(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function isRequestBody(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validRequiredDate(value) {
  return Boolean(value) && isIsoDate(value);
}

function dayCount(startDate, endDate) {
  return Math.floor((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000);
}

function validRecordSpan(startDate, endDate) {
  return dayCount(startDate, endDate) <= maximumCalendarRecordSpanDays;
}

function normalizeAttendees(value) {
  const values = Array.isArray(value) ? value : String(value ?? '').split(/[\n,]/);
  return [...new Set(values.map((item) => cleanText(item)).filter(Boolean))];
}

export function validateCalendarRange(startDate, endDate, maximumDays = 400) {
  const start = String(startDate ?? '').trim();
  const end = String(endDate ?? '').trim();
  if (!validRequiredDate(start) || !validRequiredDate(end)) return { error:'Please select a valid date range.' };
  if (end < start) return { error:'End date cannot be earlier than the start date.' };
  if (dayCount(start, end) > maximumDays) return { error:`Select a date range of no more than ${maximumDays} days.` };
  return { value:{ startDate:start, endDate:end } };
}

export function validateHolidayInput(body = {}) {
  if (!isRequestBody(body)) return { error:'Calendar data must be a JSON object.' };
  const name = cleanText(body.name);
  const startDate = String(body.startDate ?? '').trim();
  const endDate = String(body.endDate ?? '').trim() || startDate;
  const holidayType = String(body.holidayType ?? '').trim();
  const description = cleanText(body.description);
  const status = String(body.status ?? 'active').trim().toLowerCase();

  if (!name) return { error:'Please enter a holiday name.' };
  if (name.length > 140) return { error:'Holiday name must be 140 characters or fewer.' };
  if (!validRequiredDate(startDate)) return { error:'Please select a valid holiday date.' };
  if (!validRequiredDate(endDate)) return { error:'Please select a valid end date.' };
  if (endDate < startDate) return { error:'End date cannot be earlier than the start date.' };
  if (!validRecordSpan(startDate, endDate)) return { error:'A holiday can cover no more than 366 calendar days.' };
  if (!holidayTypes.includes(holidayType)) return { error:'Please select a valid holiday type.' };
  if (description.length > 2000) return { error:'Holiday description must be 2,000 characters or fewer.' };
  if (!calendarStatuses.includes(status)) return { error:'Please select a valid holiday status.' };

  return {
    value: {
      name,
      startDate,
      endDate: endDate === startDate ? null : endDate,
      holidayType,
      description,
      isRecurring: checked(body.isRecurring),
      status
    }
  };
}

export function validateEventInput(body = {}) {
  if (!isRequestBody(body)) return { error:'Calendar data must be a JSON object.' };
  const title = cleanText(body.title);
  const startDate = String(body.startDate ?? '').trim();
  const endDate = String(body.endDate ?? '').trim() || startDate;
  const allDay = checked(body.allDay);
  const startTime = allDay ? '' : String(body.startTime ?? '').trim();
  const endTime = allDay ? '' : String(body.endTime ?? '').trim();
  const location = cleanText(body.location);
  const description = cleanText(body.description);
  const eventType = String(body.eventType ?? '').trim();
  const status = String(body.status ?? 'active').trim().toLowerCase();
  const attendees = normalizeAttendees(body.attendees);
  const organizerId = body.organizerId == null || body.organizerId === '' ? null : String(body.organizerId);

  if (!title) return { error:'Please enter an event title.' };
  if (title.length > 160) return { error:'Event title must be 160 characters or fewer.' };
  if (!validRequiredDate(startDate)) return { error:'Please select a valid event date.' };
  if (!validRequiredDate(endDate)) return { error:'Please select a valid end date.' };
  if (endDate < startDate) return { error:'End date cannot be earlier than the start date.' };
  if (!validRecordSpan(startDate, endDate)) return { error:'An event can cover no more than 366 calendar days.' };
  if (!allDay && (!timePattern.test(startTime) || !timePattern.test(endTime))) return { error:'Please enter a valid start and end time.' };
  if (!allDay && startDate === endDate && endTime <= startTime) return { error:'End time must be after the start time.' };
  if (!eventTypes.includes(eventType)) return { error:'Please select a valid event category.' };
  if (location.length > 200) return { error:'Event location must be 200 characters or fewer.' };
  if (description.length > 4000) return { error:'Event description must be 4,000 characters or fewer.' };
  if (attendees.length > 50 || attendees.some((attendee) => attendee.length > 120)) return { error:'Add no more than 50 attendees, with 120 characters per attendee.' };
  if (organizerId && !isPositiveInteger(organizerId)) return { error:'Please select a valid organizer.' };
  if (!calendarStatuses.includes(status)) return { error:'Please select a valid event status.' };

  return {
    value: {
      title,
      startDate,
      endDate: endDate === startDate ? null : endDate,
      startTime: allDay ? null : startTime,
      endTime: allDay ? null : endTime,
      allDay,
      location,
      description,
      eventType,
      organizerId,
      attendees,
      isRecurring: checked(body.isRecurring),
      status
    }
  };
}
