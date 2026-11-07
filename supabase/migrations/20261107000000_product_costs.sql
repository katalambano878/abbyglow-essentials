-- Supplier cost per product, used by Admin → Profit Margins and the End of Day
-- report. Kept in its own table (not on products) so the public catalog shim
-- can never expose what the store paid. Only admins may read or write it.
CREATE TABLE IF NOT EXISTS public.product_costs (
  product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  cost_price numeric NOT NULL CHECK (cost_price >= 0),
  supplier_name text,
  notes text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.product_costs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage product costs" ON public.product_costs;
CREATE POLICY "Admins manage product costs" ON public.product_costs
  FOR ALL USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- Speeds up the End of Day stock-movement and sales-by-day queries.
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON public.orders (created_at);
CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON public.order_items (order_id);
