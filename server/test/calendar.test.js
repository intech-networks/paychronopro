import test from 'node:test';
import assert from 'node:assert/strict';
import { hasPermission } from '../src/auth/authorization.js';
import { expandYearlyOccurrences, occurrenceComparisonRange } from '../src/calendar/occurrences.js';
import { holidayOccurrencesByDate } from '../src/calendar/service.js';
import { validateCalendarRange, validateEventInput, validateHolidayInput } from '../src/calendar/validation.js';

test('validates calendar date ranges and holiday fields', () => {
  assert.equal(validateCalendarRange('2026-12-31', '2026-12-30').error, 'End date cannot be earlier than the start date.');
  assert.equal(validateHolidayInput({ name:'', startDate:'2026-12-25', holidayType:'regular' }).error, 'Please enter a holiday name.');
  assert.equal(validateHolidayInput({
    name:'Too long', startDate:'2026-01-01', endDate:'2027-01-02', holidayType:'company'
  }).error, 'A holiday can cover no more than 366 calendar days.');

  const result = validateHolidayInput({
    name:' Christmas Day ', startDate:'2026-12-25', endDate:'2026-12-25',
    holidayType:'regular', description:'Company-wide holiday', isRecurring:'true', status:'active'
  });
  assert.deepEqual(result.value, {
    name:'Christmas Day', startDate:'2026-12-25', endDate:null, holidayType:'regular',
    description:'Company-wide holiday', isRecurring:true, status:'active'
  });
});

test('validates event time ranges and attendee input', () => {
  assert.equal(validateEventInput({
    title:'Town hall', startDate:'2026-08-28', startTime:'12:00', endTime:'09:00', eventType:'meeting'
  }).error, 'End time must be after the start time.');

  const result = validateEventInput({
    title:'Annual meeting', startDate:'2026-08-28', startTime:'09:00', endTime:'12:00',
    eventType:'meeting', attendees:'Ana, Ben\nAna', status:'active', organizerId:'42'
  });
  assert.deepEqual(result.value.attendees, ['Ana', 'Ben']);
  assert.equal(result.value.organizerId, '42');
  assert.equal(result.value.allDay, false);
});

test('rejects non-object calendar request bodies', () => {
  assert.equal(validateHolidayInput(null).error, 'Calendar data must be a JSON object.');
  assert.equal(validateEventInput([]).error, 'Calendar data must be a JSON object.');
});

test('expands recurring holidays without changing their duration', () => {
  const occurrences = expandYearlyOccurrences([{
    id:1, startDate:'2024-12-31', endDate:'2025-01-02', isRecurring:true
  }], '2026-12-01', '2027-01-05');
  assert.deepEqual(occurrences.map((item) => ({ startDate:item.startDate, endDate:item.endDate })), [
    { startDate:'2026-12-31', endDate:'2027-01-02' }
  ]);
});

test('does not create an invalid February 29 occurrence in a non-leap year', () => {
  const occurrences = expandYearlyOccurrences([{
    id:1, startDate:'2024-02-29', endDate:null, isRecurring:true
  }], '2025-01-01', '2025-12-31');
  assert.equal(occurrences.length, 0);
});

test('does not expand a recurring series before its original start year', () => {
  const occurrences = expandYearlyOccurrences([{
    id:1, startDate:'2026-12-31', endDate:'2027-01-02', isRecurring:true
  }], '2025-01-01', '2026-01-05');

  assert.deepEqual(occurrences, []);
});

test('checks one complete Gregorian cycle for recurring-record conflicts', () => {
  const leapDay = { id:1, startDate:'2024-02-29', endDate:null, isRecurring:true };
  const spanningHoliday = { id:2, startDate:'2025-02-28', endDate:'2025-03-01', isRecurring:true };
  const range = occurrenceComparisonRange([leapDay, spanningHoliday]);
  const [leapDayOccurrences, spanningOccurrences] = [
    expandYearlyOccurrences([leapDay], range.startDate, range.endDate),
    expandYearlyOccurrences([spanningHoliday], range.startDate, range.endDate)
  ];

  assert.deepEqual(range, { startDate:'2025-01-01', endDate:'2424-12-31' });
  assert.ok(leapDayOccurrences.some((left) => spanningOccurrences.some((right) =>
    left.startDate <= (right.endDate || right.startDate)
      && (left.endDate || left.startDate) >= right.startDate
  )));
});

test('keeps recurring-series source dates and metadata on expanded occurrences', () => {
  const [occurrence] = expandYearlyOccurrences([{
    id:42,
    title:'Year-end shutdown',
    startDate:'2025-12-31',
    endDate:'2026-01-02',
    isRecurring:true,
    createdById:'7',
    organizerId:'11',
    attendees:['Operations'],
    metadata:{ source:'calendar-import' }
  }], '2027-12-01', '2028-01-05');

  assert.deepEqual({
    startDate:occurrence.startDate,
    endDate:occurrence.endDate,
    sourceStartDate:occurrence.sourceStartDate,
    sourceEndDate:occurrence.sourceEndDate,
    createdById:occurrence.createdById,
    organizerId:occurrence.organizerId,
    attendees:occurrence.attendees,
    metadata:occurrence.metadata
  }, {
    startDate:'2027-12-31',
    endDate:'2028-01-02',
    sourceStartDate:'2025-12-31',
    sourceEndDate:'2026-01-02',
    createdById:'7',
    organizerId:'11',
    attendees:['Operations'],
    metadata:{ source:'calendar-import' }
  });
});

test('limits holiday dates used by reports to the requested range', async () => {
  const client = {
    query: async () => ({
      rows:[{
        id:9,
        title:'Company shutdown',
        startDate:'2025-12-30',
        endDate:'2026-01-04',
        type:'company',
        description:'Spans the reporting boundary.',
        isRecurring:false,
        status:'active'
      }]
    })
  };

  const dates = await holidayOccurrencesByDate({ startDate:'2026-01-01', endDate:'2026-01-02', client });

  assert.deepEqual([...dates.keys()], ['2026-01-01', '2026-01-02']);
  assert.equal(dates.get('2026-01-01')[0].id, 9);
  assert.equal(dates.get('2026-01-02')[0].id, 9);
});

test('calendar remains a direct top-level permission', () => {
  const user = { permissions:[{ moduleKey:'calendar', view:true, create:false, update:false, delete:false }] };
  assert.equal(hasPermission(user, 'calendar', 'view'), true);
  assert.equal(hasPermission(user, 'calendar', 'update'), false);
});
