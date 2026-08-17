CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique_idx
  ON users (LOWER(email));

CREATE UNIQUE INDEX IF NOT EXISTS employee_profiles_email_lower_unique_idx
  ON employee_profiles (LOWER(email));
