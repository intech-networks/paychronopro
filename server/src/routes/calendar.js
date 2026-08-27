import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAnyPermission, requirePermission } from '../auth/authorization.js';
import { isPositiveInteger } from '../validation.js';
import { expandYearlyOccurrences, occurrenceComparisonRange } from '../calendar/occurrences.js';
import { listCalendarItems, listEventOccurrences, listHolidayOccurrences, todayInManila } from '../calendar/service.js';
import { calendarStatuses, eventTypes, holidayTypes, validateCalendarRange, validateEventInput, validateHolidayInput } from '../calendar/validation.js';

export const calendarRouter = Router();

function addDays(dateValue, days) {
  const date = new Date(`${dateValue}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function readRange(query, fallbackDays = 400) {
  const startDate = String(query.startDate || '').trim();
  const endDate = String(query.endDate || '').trim();
  if (!startDate && !endDate) {
    const today = todayInManila();
    return { value:{ startDate:today, endDate:addDays(today, fallbackDays) } };
  }
  return validateCalendarRange(startDate, endDate);
}

function readStatus(query) {
  const status = String(query.status || 'active').trim().toLowerCase();
  return status === 'all' || calendarStatuses.includes(status) ? { value:status } : { error:'Please select a valid status filter.' };
}

function readType(query) {
  const type = String(query.type || 'all').trim().toLowerCase();
  return ['all', 'holiday', 'event'].includes(type) ? { value:type } : { error:'Please select a valid calendar item type.' };
}

function readSearch(query) {
  const search = String(query.search || '').trim();
  return search.length <= 120 ? { value:search } : { error:'Search must be 120 characters or fewer.' };
}

function timeRangesOverlap(left, right) {
  const rangeFor = (item) => {
    const endDate = item.endDate || item.startDate;
    if (!item.startTime) return { start:`${item.startDate}T00:00`, end:`${addDays(endDate, 1)}T00:00` };
    return { start:`${item.startDate}T${item.startTime}`, end:`${endDate}T${item.endTime}` };
  };
  const leftRange = rangeFor(left);
  const rightRange = rangeFor(right);
  return leftRange.start < rightRange.end && rightRange.start < leftRange.end;
}

function dateRangesOverlap(left, right) {
  return left.startDate <= (right.endDate || right.startDate) && (left.endDate || left.startDate) >= right.startDate;
}

function occurrencePairs(left, right) {
  const { startDate, endDate } = occurrenceComparisonRange([left, right]);
  return [
    expandYearlyOccurrences([left], startDate, endDate),
    expandYearlyOccurrences([right], startDate, endDate)
  ];
}

async function lockCalendarWrites(client, kind) {
  const lockKey = kind === 'holiday' ? 1 : 2;
  await client.query('SELECT pg_advisory_xact_lock(hashtext(current_schema()), $1::integer)', [lockKey]);
}

async function holidayConflict(client, input, excludedId = null) {
  const result = await client.query(
    `SELECT id, TO_CHAR(start_date, 'YYYY-MM-DD') AS "startDate",
            CASE WHEN end_date IS NULL THEN NULL ELSE TO_CHAR(end_date, 'YYYY-MM-DD') END AS "endDate",
            is_recurring AS "isRecurring"
     FROM company_holidays
     WHERE status = 'active' AND ($1::bigint IS NULL OR id <> $1)`,
    [excludedId]
  );
  const candidate = { ...input, isRecurring:input.isRecurring };
  return result.rows.find((existing) => {
    const [candidateOccurrences, existingOccurrences] = occurrencePairs(candidate, existing);
    return candidateOccurrences.some((left) => existingOccurrences.some((right) => dateRangesOverlap(left, right)));
  }) || null;
}

async function eventConflict(client, input, excludedId = null) {
  const result = await client.query(
    `SELECT id, title, location, TO_CHAR(start_date, 'YYYY-MM-DD') AS "startDate",
            CASE WHEN end_date IS NULL THEN NULL ELSE TO_CHAR(end_date, 'YYYY-MM-DD') END AS "endDate",
            CASE WHEN start_time IS NULL THEN NULL ELSE TO_CHAR(start_time, 'HH24:MI') END AS "startTime",
            CASE WHEN end_time IS NULL THEN NULL ELSE TO_CHAR(end_time, 'HH24:MI') END AS "endTime",
            is_recurring AS "isRecurring"
     FROM company_events
     WHERE status = 'active' AND ($1::bigint IS NULL OR id <> $1)`,
    [excludedId]
  );
  const candidate = { ...input, isRecurring:input.isRecurring };
  return result.rows.find((existing) => {
    const sameTitle = existing.title.toLocaleLowerCase() === input.title.toLocaleLowerCase();
    const sameLocation = input.location && existing.location && existing.location.toLocaleLowerCase() === input.location.toLocaleLowerCase();
    if (!sameTitle && !sameLocation) return false;
    const [candidateOccurrences, existingOccurrences] = occurrencePairs(candidate, existing);
    return candidateOccurrences.some((left) => existingOccurrences.some((right) => timeRangesOverlap(left, right)));
  }) || null;
}

async function resolveOrganizerId(client, requestedOrganizerId, fallbackOrganizerId) {
  const organizerId = requestedOrganizerId || String(fallbackOrganizerId);
  const result = await client.query('SELECT id FROM users WHERE id = $1 AND is_active = TRUE LIMIT 1', [organizerId]);
  return result.rows[0]?.id || null;
}

function pgError(response, error) {
  if (error?.code === '23505' || error?.code === '23P01') return response.status(409).json({ error:'This calendar record conflicts with an existing active record.' });
  if (error?.code === '23514' || error?.code === '22007') return response.status(400).json({ error:'Please review the calendar dates and values.' });
  if (error?.code === '23503') return response.status(409).json({ error:'A linked calendar user is no longer available.' });
  return null;
}

calendarRouter.get('/', ...requirePermission('calendar', 'view'), async (request, response, next) => {
  try {
    const range = readRange(request.query);
    const status = readStatus(request.query);
    const type = readType(request.query);
    const search = readSearch(request.query);
    const invalid = [range, status, type, search].find((item) => item.error);
    if (invalid) return response.status(400).json({ error:invalid.error });
    const items = await listCalendarItems({ ...range.value, status:status.value, type:type.value, search:search.value });
    return response.json({ range:range.value, items });
  } catch (error) { return next(error); }
});

calendarRouter.get('/upcoming', ...requirePermission('calendar', 'view'), async (request, response, next) => {
  try {
    const parsedLimit = Number(request.query.limit || 6);
    const limit = Number.isInteger(parsedLimit) && parsedLimit > 0 && parsedLimit <= 20 ? parsedLimit : 6;
    const today = todayInManila();
    const items = await listCalendarItems({ startDate:today, endDate:addDays(today, 366) });
    return response.json({ items:items.slice(0, limit) });
  } catch (error) { return next(error); }
});

calendarRouter.get('/organizers', ...requireAnyPermission('calendar', ['create', 'update']), async (_request, response, next) => {
  try {
    const result = await pool.query(
      `SELECT id, display_name AS "displayName" FROM users
       WHERE is_active = TRUE ORDER BY display_name, id LIMIT 200`
    );
    return response.json({ organizers:result.rows });
  } catch (error) { return next(error); }
});

calendarRouter.get('/holidays', ...requirePermission('calendar', 'view'), async (request, response, next) => {
  try {
    const range = readRange(request.query);
    const status = readStatus(request.query);
    const search = readSearch(request.query);
    const invalid = [range, status, search].find((item) => item.error);
    if (invalid) return response.status(400).json({ error:invalid.error });
    const holidays = await listHolidayOccurrences({ ...range.value, status:status.value, search:search.value });
    return response.json({ range:range.value, holidays });
  } catch (error) { return next(error); }
});

calendarRouter.get('/events', ...requirePermission('calendar', 'view'), async (request, response, next) => {
  try {
    const range = readRange(request.query);
    const status = readStatus(request.query);
    const search = readSearch(request.query);
    const invalid = [range, status, search].find((item) => item.error);
    if (invalid) return response.status(400).json({ error:invalid.error });
    const events = await listEventOccurrences({ ...range.value, status:status.value, search:search.value });
    return response.json({ range:range.value, events });
  } catch (error) { return next(error); }
});

calendarRouter.post('/holidays', ...requirePermission('calendar', 'create'), async (request, response, next) => {
  const parsed = validateHolidayInput(request.body);
  if (parsed.error) return response.status(400).json({ error:parsed.error });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await lockCalendarWrites(client, 'holiday');
    if (parsed.value.status === 'active' && await holidayConflict(client, parsed.value)) {
      await client.query('ROLLBACK');
      return response.status(409).json({ error:'An active holiday already covers one or more of these dates.' });
    }
    const result = await client.query(
      `INSERT INTO company_holidays
         (name, start_date, end_date, holiday_type, description, is_recurring, status, created_by, updated_by)
       VALUES ($1, $2::date, $3::date, $4, $5, $6, $7, $8, $8)
       RETURNING id`,
      [parsed.value.name, parsed.value.startDate, parsed.value.endDate, parsed.value.holidayType, parsed.value.description, parsed.value.isRecurring, parsed.value.status, request.user.id]
    );
    await client.query('COMMIT');
    return response.status(201).json({ holiday:{ id:result.rows[0].id } });
  } catch (error) {
    await client.query('ROLLBACK');
    return pgError(response, error) || next(error);
  } finally { client.release(); }
});

calendarRouter.put('/holidays/:holidayId', ...requirePermission('calendar', 'update'), async (request, response, next) => {
  const holidayId = String(request.params.holidayId || '');
  const parsed = validateHolidayInput(request.body);
  if (!isPositiveInteger(holidayId)) return response.status(400).json({ error:'A valid holiday is required.' });
  if (parsed.error) return response.status(400).json({ error:parsed.error });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await lockCalendarWrites(client, 'holiday');
    if (parsed.value.status === 'active' && await holidayConflict(client, parsed.value, holidayId)) {
      await client.query('ROLLBACK');
      return response.status(409).json({ error:'An active holiday already covers one or more of these dates.' });
    }
    const result = await client.query(
      `UPDATE company_holidays SET name = $2, start_date = $3::date, end_date = $4::date,
         holiday_type = $5, description = $6, is_recurring = $7, status = $8,
         updated_by = $9, updated_at = NOW()
       WHERE id = $1 RETURNING id`,
      [holidayId, parsed.value.name, parsed.value.startDate, parsed.value.endDate, parsed.value.holidayType, parsed.value.description, parsed.value.isRecurring, parsed.value.status, request.user.id]
    );
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return response.status(404).json({ error:'Holiday not found.' });
    }
    await client.query('COMMIT');
    return response.json({ holiday:{ id:result.rows[0].id } });
  } catch (error) {
    await client.query('ROLLBACK');
    return pgError(response, error) || next(error);
  } finally { client.release(); }
});

calendarRouter.delete('/holidays/:holidayId', ...requirePermission('calendar', 'delete'), async (request, response, next) => {
  const client = await pool.connect();
  try {
    const holidayId = String(request.params.holidayId || '');
    if (!isPositiveInteger(holidayId)) return response.status(400).json({ error:'A valid holiday is required.' });
    await client.query('BEGIN');
    await lockCalendarWrites(client, 'holiday');
    const result = await client.query('DELETE FROM company_holidays WHERE id = $1 RETURNING id', [holidayId]);
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return response.status(404).json({ error:'Holiday not found.' });
    }
    await client.query('COMMIT');
    return response.status(204).end();
  } catch (error) {
    await client.query('ROLLBACK');
    return pgError(response, error) || next(error);
  } finally { client.release(); }
});

calendarRouter.post('/events', ...requirePermission('calendar', 'create'), async (request, response, next) => {
  const parsed = validateEventInput(request.body);
  if (parsed.error) return response.status(400).json({ error:parsed.error });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await lockCalendarWrites(client, 'event');
    const organizerId = await resolveOrganizerId(client, parsed.value.organizerId, request.user.id);
    if (!organizerId) {
      await client.query('ROLLBACK');
      return response.status(400).json({ error:'Please select an active organizer.' });
    }
    if (parsed.value.status === 'active' && await eventConflict(client, parsed.value)) {
      await client.query('ROLLBACK');
      return response.status(409).json({ error:'A matching event already exists at this time.' });
    }
    const result = await client.query(
      `INSERT INTO company_events
         (title, start_date, end_date, start_time, end_time, location, description, event_type,
          organizer_id, attendees, is_recurring, status, created_by, updated_by)
       VALUES ($1, $2::date, $3::date, $4::time, $5::time, $6, $7, $8, $9, $10::text[], $11, $12, $13, $13)
       RETURNING id`,
      [parsed.value.title, parsed.value.startDate, parsed.value.endDate, parsed.value.startTime, parsed.value.endTime,
        parsed.value.location, parsed.value.description, parsed.value.eventType, organizerId, parsed.value.attendees,
        parsed.value.isRecurring, parsed.value.status, request.user.id]
    );
    await client.query('COMMIT');
    return response.status(201).json({ event:{ id:result.rows[0].id } });
  } catch (error) {
    await client.query('ROLLBACK');
    return pgError(response, error) || next(error);
  } finally { client.release(); }
});

calendarRouter.put('/events/:eventId', ...requirePermission('calendar', 'update'), async (request, response, next) => {
  const eventId = String(request.params.eventId || '');
  const parsed = validateEventInput(request.body);
  if (!isPositiveInteger(eventId)) return response.status(400).json({ error:'A valid event is required.' });
  if (parsed.error) return response.status(400).json({ error:parsed.error });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await lockCalendarWrites(client, 'event');
    const organizerId = await resolveOrganizerId(client, parsed.value.organizerId, request.user.id);
    if (!organizerId) {
      await client.query('ROLLBACK');
      return response.status(400).json({ error:'Please select an active organizer.' });
    }
    if (parsed.value.status === 'active' && await eventConflict(client, parsed.value, eventId)) {
      await client.query('ROLLBACK');
      return response.status(409).json({ error:'A matching event already exists at this time.' });
    }
    const result = await client.query(
      `UPDATE company_events SET title = $2, start_date = $3::date, end_date = $4::date,
         start_time = $5::time, end_time = $6::time, location = $7, description = $8,
         event_type = $9, organizer_id = $10, attendees = $11::text[], is_recurring = $12,
         status = $13, updated_by = $14, updated_at = NOW()
       WHERE id = $1 RETURNING id`,
      [eventId, parsed.value.title, parsed.value.startDate, parsed.value.endDate, parsed.value.startTime,
        parsed.value.endTime, parsed.value.location, parsed.value.description, parsed.value.eventType, organizerId,
        parsed.value.attendees, parsed.value.isRecurring, parsed.value.status, request.user.id]
    );
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return response.status(404).json({ error:'Event not found.' });
    }
    await client.query('COMMIT');
    return response.json({ event:{ id:result.rows[0].id } });
  } catch (error) {
    await client.query('ROLLBACK');
    return pgError(response, error) || next(error);
  } finally { client.release(); }
});

calendarRouter.delete('/events/:eventId', ...requirePermission('calendar', 'delete'), async (request, response, next) => {
  const client = await pool.connect();
  try {
    const eventId = String(request.params.eventId || '');
    if (!isPositiveInteger(eventId)) return response.status(400).json({ error:'A valid event is required.' });
    await client.query('BEGIN');
    await lockCalendarWrites(client, 'event');
    const result = await client.query('DELETE FROM company_events WHERE id = $1 RETURNING id', [eventId]);
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return response.status(404).json({ error:'Event not found.' });
    }
    await client.query('COMMIT');
    return response.status(204).end();
  } catch (error) {
    await client.query('ROLLBACK');
    return pgError(response, error) || next(error);
  } finally { client.release(); }
});

export const calendarOptions = { holidayTypes, eventTypes, calendarStatuses };
