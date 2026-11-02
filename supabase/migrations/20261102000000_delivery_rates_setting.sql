-- Delivery fees are now editable by the admin (Admin → Delivery Fees) and read
-- by checkout, POS and the shipping info page. Seed the row with starter
-- values so the store charges delivery from day one; the owner adjusts them
-- in the admin.
INSERT INTO public.store_settings (key, value, description)
VALUES (
  'delivery_rates',
  '{"accra": 25, "outside_accra": 50, "free_threshold": 0}'::jsonb,
  'Delivery fees charged at checkout and POS (GHS)'
)
ON CONFLICT (key) DO NOTHING;
