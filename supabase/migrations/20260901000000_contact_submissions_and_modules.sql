-- Contact form persistence + default store modules
CREATE TABLE IF NOT EXISTS public.contact_submissions (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name text,
  email text,
  phone text,
  subject text,
  message text,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contact_submissions_created_at
  ON public.contact_submissions (created_at DESC);

INSERT INTO public.store_modules (id, enabled, updated_at) VALUES
  ('notifications', true, now()),
  ('cms', true, now()),
  ('homepage', true, now()),
  ('blog', true, now()),
  ('customer-insights', true, now()),
  ('flash-sales', false, now()),
  ('loyalty-program', false, now()),
  ('pwa-settings', false, now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.schema_migrations (id, notes, applied_at)
VALUES ('20260901000000_contact_submissions_and_modules', 'contact form table + default modules', now())
ON CONFLICT (id) DO NOTHING;
