CREATE SEQUENCE IF NOT EXISTS employee_number_sequence
  AS BIGINT
  MINVALUE 1
  MAXVALUE 999999
  START WITH 1
  NO CYCLE;

DO $$
DECLARE
  current_employee_number BIGINT;
  profile_id_high_water BIGINT;
  employee_number_high_water BIGINT;
  required_high_water BIGINT;
BEGIN
  SELECT COALESCE(MAX(employee_number::BIGINT), 0)
  INTO current_employee_number
  FROM employee_profiles
  WHERE employee_number ~ '^[0-9]{6}$';

  SELECT CASE WHEN is_called THEN last_value ELSE last_value - 1 END
  INTO profile_id_high_water
  FROM employee_profiles_id_seq;

  SELECT CASE WHEN is_called THEN last_value ELSE last_value - 1 END
  INTO employee_number_high_water
  FROM employee_number_sequence;

  required_high_water := GREATEST(
    current_employee_number,
    profile_id_high_water,
    employee_number_high_water,
    0
  );

  IF required_high_water > 999999 THEN
    RAISE EXCEPTION 'The six-digit employee number series is exhausted.';
  ELSIF required_high_water = 0 THEN
    PERFORM SETVAL('employee_number_sequence', 1, FALSE);
  ELSE
    PERFORM SETVAL('employee_number_sequence', required_high_water, TRUE);
  END IF;
END;
$$;
