CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO store_abbyglow;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA extensions TO store_abbyglow;
ALTER ROLE store_abbyglow SET search_path TO public, extensions;
