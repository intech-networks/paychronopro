import { pool } from '../db/pool.js';
import { expandYearlyOccurrences } from './occurrences.js';

function localDateInManila(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone:'Asia/Manila', year:'numeric', month:'2-digit', day:'2-digit'
  }).formatToParts(now).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDays(dateValue, days) {
  const date = new Date(`${dateValue}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function sortableDate(item) {
  return `${item.startDate}T${item.startTime || '00:00'}:${item.kind === 'holiday' ? '00' : '00'}`;
}

function sortCalendarItems(left, right) {
  return sortableDate(left).localeCompare(sortableDate(right))
    || left.kind.localeCompare(right.kind)
    || left.title.localeCompare(right.title);
}

export function todayInManila(now) {
  return localDateInManila(now);
}

export async function listHolidayOccurrences({ startDate, endDate, status = 'active', search = '', client = pool }) {
  const pattern = `%${search}%`;
  const result = await client.query(
    `SELECT holiday.id, holiday.name AS title,
            TO_CHAR(holiday.start_date, 'YYYY-MM-DD') AS "startDate",
            CASE WHEN holiday.end_date IS NULL THEN NULL ELSE TO_CHAR(holiday.end_date, 'YYYY-MM-DD') END AS "endDate",
            holiday.holiday_type AS type, holiday.description,
            holiday.is_recurring AS "isRecurring", holiday.status,
            holiday.created_at AS "createdAt", holiday.updated_at AS "updatedAt",
            holiday.created_by AS "createdById", creator.display_name AS "createdBy",
            holiday.updated_by AS "updatedById", updater.display_name AS "updatedBy"
     FROM company_holidays holiday
     LEFT JOIN users creator ON creator.id = holiday.created_by
     LEFT JOIN users updater ON updater.id = holiday.updated_by
     WHERE ($3 = 'all' OR holiday.status = $3)
       AND (holiday.is_recurring OR (holiday.start_date <= $2::date AND COALESCE(holiday.end_date, holiday.start_date) >= $1::date))
       AND ($4 = '' OR holiday.name ILIKE $5 OR holiday.description ILIKE $5)
     ORDER BY holiday.start_date, holiday.name`,
    [startDate, endDate, status, search, pattern]
  );

  return expandYearlyOccurrences(result.rows.map((holiday) => ({ ...holiday, kind:'holiday' })), startDate, endDate)
    .sort(sortCalendarItems);
}

export async function listEventOccurrences({ startDate, endDate, status = 'active', search = '', client = pool }) {
  const pattern = `%${search}%`;
  const result = await client.query(
    `SELECT event.id, event.title,
            TO_CHAR(event.start_date, 'YYYY-MM-DD') AS "startDate",
            CASE WHEN event.end_date IS NULL THEN NULL ELSE TO_CHAR(event.end_date, 'YYYY-MM-DD') END AS "endDate",
            CASE WHEN event.start_time IS NULL THEN NULL ELSE TO_CHAR(event.start_time, 'HH24:MI') END AS "startTime",
            CASE WHEN event.end_time IS NULL THEN NULL ELSE TO_CHAR(event.end_time, 'HH24:MI') END AS "endTime",
            event.location, event.description, event.event_type AS type,
            event.organizer_id AS "organizerId", organizer.display_name AS organizer,
            event.attendees, event.is_recurring AS "isRecurring", event.status,
            event.created_at AS "createdAt", event.updated_at AS "updatedAt",
            event.created_by AS "createdById", creator.display_name AS "createdBy",
            event.updated_by AS "updatedById", updater.display_name AS "updatedBy"
     FROM company_events event
     LEFT JOIN users organizer ON organizer.id = event.organizer_id
     LEFT JOIN users creator ON creator.id = event.created_by
     LEFT JOIN users updater ON updater.id = event.updated_by
     WHERE ($3 = 'all' OR event.status = $3)
       AND (event.is_recurring OR (event.start_date <= $2::date AND COALESCE(event.end_date, event.start_date) >= $1::date))
       AND ($4 = '' OR event.title ILIKE $5 OR event.description ILIKE $5 OR event.location ILIKE $5)
     ORDER BY event.start_date, event.start_time NULLS FIRST, event.title`,
    [startDate, endDate, status, search, pattern]
  );

  return expandYearlyOccurrences(result.rows.map((event) => ({ ...event, kind:'event' })), startDate, endDate)
    .sort(sortCalendarItems);
}

export async function listCalendarItems({ startDate, endDate, status = 'active', type = 'all', search = '', client = pool }) {
  const requests = [];
  if (type === 'all' || type === 'holiday') requests.push(listHolidayOccurrences({ startDate, endDate, status, search, client }));
  if (type === 'all' || type === 'event') requests.push(listEventOccurrences({ startDate, endDate, status, search, client }));
  return (await Promise.all(requests)).flat().sort(sortCalendarItems);
}

export async function holidayOccurrencesByDate({ startDate, endDate, client = pool }) {
  const holidays = await listHolidayOccurrences({ startDate, endDate, client });
  const dates = new Map();
  for (const holiday of holidays) {
    const firstDate = holiday.startDate < startDate ? startDate : holiday.startDate;
    const lastDate = (holiday.endDate || holiday.startDate) > endDate ? endDate : (holiday.endDate || holiday.startDate);
    for (let date = firstDate; date <= lastDate; date = addDays(date, 1)) {
      const current = dates.get(date) || [];
      current.push(holiday);
      dates.set(date, current);
    }
  }
  return dates;
}
