-- AbbyGlow Essentials — plain Postgres bootstrap (no Supabase cloud, no Anael)
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  instance_id uuid,
  aud text,
  role text,
  email text UNIQUE,
  encrypted_password text,
  email_confirmed_at timestamptz,
  invited_at timestamptz,
  confirmation_token text DEFAULT '',
  confirmation_sent_at timestamptz,
  recovery_token text DEFAULT '',
  recovery_sent_at timestamptz,
  email_change_token_new text DEFAULT '',
  email_change text DEFAULT '',
  email_change_sent_at timestamptz,
  last_sign_in_at timestamptz,
  raw_app_meta_data jsonb DEFAULT '{}'::jsonb,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  is_super_admin boolean,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  phone text DEFAULT NULL,
  phone_confirmed_at timestamptz,
  phone_change text DEFAULT '',
  phone_change_token text DEFAULT '',
  phone_change_sent_at timestamptz,
  confirmed_at timestamptz,
  email_change_token_current text DEFAULT '',
  email_change_confirm_status smallint DEFAULT 0,
  banned_until timestamptz,
  reauthentication_token text DEFAULT '',
  reauthentication_sent_at timestamptz,
  is_sso_user boolean NOT NULL DEFAULT false,
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS users_email_idx ON auth.users (lower(email));

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    'anon'
  );
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END$$;

GRANT USAGE ON SCHEMA public TO store_abbyglow, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth TO store_abbyglow, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA extensions TO store_abbyglow, anon, authenticated, service_role;
GRANT ALL ON SCHEMA public TO store_abbyglow;
GRANT ALL ON SCHEMA auth TO store_abbyglow;
GRANT ALL ON ALL TABLES IN SCHEMA auth TO store_abbyglow;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA extensions TO store_abbyglow;
ALTER ROLE store_abbyglow SET search_path TO public, extensions, auth;
