ALTER TABLE employee_profiles
  ADD COLUMN IF NOT EXISTS middle_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS suffix TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS gender TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS civil_status TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS profile_picture_data BYTEA,
  ADD COLUMN IF NOT EXISTS profile_picture_mime_type TEXT,
  ADD COLUMN IF NOT EXISTS profile_picture_updated_at TIMESTAMPTZ;

ALTER TABLE employee_profiles
  DROP CONSTRAINT IF EXISTS employee_profiles_middle_name_length_check,
  DROP CONSTRAINT IF EXISTS employee_profiles_suffix_length_check,
  DROP CONSTRAINT IF EXISTS employee_profiles_address_length_check,
  DROP CONSTRAINT IF EXISTS employee_profiles_gender_check,
  DROP CONSTRAINT IF EXISTS employee_profiles_civil_status_check,
  DROP CONSTRAINT IF EXISTS employee_profiles_profile_picture_check;

ALTER TABLE employee_profiles
  ADD CONSTRAINT employee_profiles_middle_name_length_check
    CHECK (LENGTH(middle_name) <= 100),
  ADD CONSTRAINT employee_profiles_suffix_length_check
    CHECK (LENGTH(suffix) <= 30),
  ADD CONSTRAINT employee_profiles_address_length_check
    CHECK (LENGTH(address) <= 600),
  ADD CONSTRAINT employee_profiles_gender_check
    CHECK (gender IN ('', 'female', 'male', 'non_binary', 'prefer_not_to_say')),
  ADD CONSTRAINT employee_profiles_civil_status_check
    CHECK (civil_status IN ('', 'single', 'married', 'widowed', 'separated', 'annulled', 'prefer_not_to_say')),
  ADD CONSTRAINT employee_profiles_profile_picture_check
    CHECK (
      (profile_picture_data IS NULL) = (profile_picture_mime_type IS NULL)
      AND (profile_picture_data IS NULL OR OCTET_LENGTH(profile_picture_data) BETWEEN 1 AND 2097152)
      AND (profile_picture_mime_type IS NULL OR profile_picture_mime_type IN ('image/jpeg', 'image/png', 'image/webp'))
    );
