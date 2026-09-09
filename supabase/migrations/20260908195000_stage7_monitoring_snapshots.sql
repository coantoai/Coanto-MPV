CREATE TABLE IF NOT EXISTS public.monitoring_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES public.monitoring_targets(id) ON DELETE CASCADE,
  content_hash text NOT NULL,
  title text NOT NULL DEFAULT '',
  text_excerpt text NOT NULL DEFAULT '',
  checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS monitoring_snapshots_target_checked_idx ON public.monitoring_snapshots(target_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS monitoring_snapshots_user_checked_idx ON public.monitoring_snapshots(user_id, checked_at DESC);
ALTER TABLE public.monitoring_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their monitoring snapshots" ON public.monitoring_snapshots;
CREATE POLICY "Users can view their monitoring snapshots" ON public.monitoring_snapshots FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can create their monitoring snapshots" ON public.monitoring_snapshots;
CREATE POLICY "Users can create their monitoring snapshots" ON public.monitoring_snapshots FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
GRANT SELECT, INSERT ON public.monitoring_snapshots TO authenticated;
GRANT ALL ON public.monitoring_snapshots TO service_role;
