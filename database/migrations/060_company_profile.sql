CREATE TABLE IF NOT EXISTS company_profiles (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  company_name TEXT NOT NULL DEFAULT '' CHECK (LENGTH(BTRIM(company_name)) <= 160),
  company_address TEXT NOT NULL DEFAULT '' CHECK (LENGTH(company_address) <= 600),
  contact_number TEXT NOT NULL DEFAULT '' CHECK (LENGTH(contact_number) <= 60),
  email_address TEXT NOT NULL DEFAULT '' CHECK (LENGTH(email_address) <= 254),
  website TEXT NOT NULL DEFAULT '' CHECK (LENGTH(website) <= 255),
  description TEXT NOT NULL DEFAULT '' CHECK (LENGTH(description) <= 2000),
  logo_data BYTEA,
  logo_mime_type TEXT CHECK (logo_mime_type IS NULL OR logo_mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((logo_data IS NULL) = (logo_mime_type IS NULL)),
  CHECK (logo_data IS NULL OR OCTET_LENGTH(logo_data) BETWEEN 1 AND 2097152)
);

INSERT INTO company_profiles (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;
