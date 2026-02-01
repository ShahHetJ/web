-- ============================================================
--  ShopFlow — Supabase Database Schema + RLS Policies
--  Paste everything into Supabase Studio → SQL Editor → Run
-- ============================================================

-- ── Extensions ────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- ============================================================
--  1.  PROFILES  (mirrors auth.users, carries app-level role)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id         uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name  text        NOT NULL    DEFAULT '',
  role       text        NOT NULL    DEFAULT 'user'
                                     CHECK (role IN ('user', 'admin')),
  created_at timestamptz NOT NULL    DEFAULT now()
);

-- Auto-create a profile row whenever a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
--  2.  PRODUCTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.products (
  id          uuid          PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name        text          NOT NULL,
  description text          NOT NULL    DEFAULT '',
  price       numeric(10,2) NOT NULL    CHECK (price >= 0),
  stock       integer       NOT NULL    DEFAULT 0 CHECK (stock >= 0),
  image_url   text,                                -- nullable
  category    text          NOT NULL    DEFAULT 'General',
  created_at  timestamptz   NOT NULL    DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category);

-- ============================================================
--  3.  ORDERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.orders (
  id           uuid          PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id      uuid          NOT NULL    REFERENCES auth.users(id) ON DELETE SET NULL,
  total_amount numeric(12,2) NOT NULL    CHECK (total_amount >= 0),
  status       text          NOT NULL    DEFAULT 'pending'
                                         CHECK (status IN ('pending','confirmed','shipped','delivered')),
  created_at   timestamptz   NOT NULL    DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_user   ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);

-- ============================================================
--  4.  ORDER_ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.order_items (
  id         uuid          PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  order_id   uuid          NOT NULL    REFERENCES public.orders(id)    ON DELETE CASCADE,
  product_id uuid          NOT NULL    REFERENCES public.products(id) ON DELETE SET NULL,
  quantity   integer       NOT NULL    CHECK (quantity > 0),
  price      numeric(10,2) NOT NULL    CHECK (price >= 0)
);

CREATE INDEX IF NOT EXISTS idx_order_items_order   ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON public.order_items(product_id);

-- ============================================================
--  5.  ROW LEVEL SECURITY — PROFILES
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles: owner read"
  ON public.profiles
  FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "profiles: owner update"
  ON public.profiles
  FOR UPDATE
  USING    (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ============================================================
--  6.  ROW LEVEL SECURITY — PRODUCTS
--      • Anyone (including anon) may SELECT.
--      • Only admin may INSERT / UPDATE / DELETE.
-- ============================================================
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "products: public read"
  ON public.products
  FOR SELECT
  USING (true);

CREATE POLICY "products: admin insert"
  ON public.products
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE  id   = auth.uid()
        AND  role = 'admin'
    )
  );

CREATE POLICY "products: admin update"
  ON public.products
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE  id   = auth.uid()
        AND  role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE  id   = auth.uid()
        AND  role = 'admin'
    )
  );

CREATE POLICY "products: admin delete"
  ON public.products
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE  id   = auth.uid()
        AND  role = 'admin'
    )
  );

-- ============================================================
--  7.  ROW LEVEL SECURITY — ORDERS
--      • Users may SELECT / INSERT / UPDATE only their own rows.
--      • Admins may SELECT and UPDATE any row.
-- ============================================================
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orders: owner read"
  ON public.orders
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "orders: owner insert"
  ON public.orders
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "orders: owner update"
  ON public.orders
  FOR UPDATE
  USING    (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "orders: admin read all"
  ON public.orders
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE  id   = auth.uid()
        AND  role = 'admin'
    )
  );

CREATE POLICY "orders: admin update all"
  ON public.orders
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE  id   = auth.uid()
        AND  role = 'admin'
    )
  );

-- ============================================================
--  8.  ROW LEVEL SECURITY — ORDER_ITEMS
--      • Users may read / insert items that belong to their own orders.
--      • Admins may read all.
-- ============================================================
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_items: owner read"
  ON public.order_items
  FOR SELECT
  USING (
    order_id IN (
      SELECT id FROM public.orders WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "order_items: owner insert"
  ON public.order_items
  FOR INSERT
  WITH CHECK (
    order_id IN (
      SELECT id FROM public.orders WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "order_items: admin read all"
  ON public.order_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE  id   = auth.uid()
        AND  role = 'admin'
    )
  );

-- ============================================================
--  PROMOTE A USER TO ADMIN  (run manually when needed)
--  Replace <user-uuid> with the UUID shown in Studio → Auth
-- ============================================================
-- UPDATE public.profiles SET role = 'admin' WHERE id = '<user-uuid>';
