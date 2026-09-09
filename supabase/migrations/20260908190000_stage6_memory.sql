CREATE TABLE IF NOT EXISTS public.memory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_analysis_id uuid REFERENCES public.analyses(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('decision','recommendation','insight','preference','note')),
  title text NOT NULL,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  importance smallint NOT NULL DEFAULT 50 CHECK (importance BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memory_items_user_updated_idx ON public.memory_items(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS memory_items_user_kind_idx ON public.memory_items(user_id, kind);
CREATE INDEX IF NOT EXISTS memory_items_source_analysis_idx ON public.memory_items(source_analysis_id);

ALTER TABLE public.memory_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own memory" ON public.memory_items;
CREATE POLICY "Users can view their own memory" ON public.memory_items FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can create their own memory" ON public.memory_items;
CREATE POLICY "Users can create their own memory" ON public.memory_items FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own memory" ON public.memory_items;
CREATE POLICY "Users can update their own memory" ON public.memory_items FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete their own memory" ON public.memory_items;
CREATE POLICY "Users can delete their own memory" ON public.memory_items FOR DELETE TO authenticated USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.memory_items TO authenticated;
GRANT ALL ON public.memory_items TO service_role;

CREATE OR REPLACE FUNCTION public.set_memory_items_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS memory_items_updated_at ON public.memory_items;
CREATE TRIGGER memory_items_updated_at BEFORE UPDATE ON public.memory_items
FOR EACH ROW EXECUTE FUNCTION public.set_memory_items_updated_at();
