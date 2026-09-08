CREATE TABLE IF NOT EXISTS public.memory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('decision','recommendation','insight','preference','note')),
  title text NOT NULL,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_analysis_id uuid REFERENCES public.analyses(id) ON DELETE SET NULL,
  importance integer NOT NULL DEFAULT 50 CHECK (importance BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memory_items_user_created_idx
  ON public.memory_items(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS memory_items_user_kind_idx
  ON public.memory_items(user_id, kind);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.memory_items TO authenticated;
GRANT ALL ON public.memory_items TO service_role;

ALTER TABLE public.memory_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own memory" ON public.memory_items;
CREATE POLICY "Users can view their own memory"
  ON public.memory_items FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own memory" ON public.memory_items;
CREATE POLICY "Users can create their own memory"
  ON public.memory_items FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own memory" ON public.memory_items;
CREATE POLICY "Users can update their own memory"
  ON public.memory_items FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own memory" ON public.memory_items;
CREATE POLICY "Users can delete their own memory"
  ON public.memory_items FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.set_memory_items_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS memory_items_updated_at ON public.memory_items;
CREATE TRIGGER memory_items_updated_at
BEFORE UPDATE ON public.memory_items
FOR EACH ROW EXECUTE FUNCTION public.set_memory_items_updated_at();
