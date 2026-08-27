ALTER TABLE company_holidays
  ADD CONSTRAINT company_holidays_maximum_span_check
  CHECK (end_date IS NULL OR end_date - start_date <= 365) NOT VALID;

ALTER TABLE company_events
  ADD CONSTRAINT company_events_maximum_span_check
  CHECK (end_date IS NULL OR end_date - start_date <= 365) NOT VALID;

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;

ALTER TABLE company_holidays
  ADD CONSTRAINT company_holidays_active_one_off_no_overlap
  EXCLUDE USING gist (
    daterange(start_date, COALESCE(end_date, start_date), '[]') WITH &&
  )
  WHERE (status = 'active' AND NOT is_recurring);

ALTER TABLE company_events
  ADD CONSTRAINT company_events_active_one_off_title_no_overlap
  EXCLUDE USING gist (
    lower(title) WITH =,
    tsrange(
      start_date + COALESCE(start_time, TIME '00:00'),
      CASE WHEN start_time IS NULL
        THEN (COALESCE(end_date, start_date) + 1)::timestamp
        ELSE COALESCE(end_date, start_date) + end_time
      END,
      '[)'
    ) WITH &&
  )
  WHERE (status = 'active' AND NOT is_recurring);

ALTER TABLE company_events
  ADD CONSTRAINT company_events_active_one_off_location_no_overlap
  EXCLUDE USING gist (
    lower(location) WITH =,
    tsrange(
      start_date + COALESCE(start_time, TIME '00:00'),
      CASE WHEN start_time IS NULL
        THEN (COALESCE(end_date, start_date) + 1)::timestamp
        ELSE COALESCE(end_date, start_date) + end_time
      END,
      '[)'
    ) WITH &&
  )
  WHERE (status = 'active' AND NOT is_recurring AND BTRIM(location) <> '');
