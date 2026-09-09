CREATE TABLE IF NOT EXISTS public.monitoring_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL,
  interval_hours integer NOT NULL DEFAULT 24 CHECK (interval_hours BETWEEN 1 AND 720),
  active boolean NOT NULL DEFAULT true,
  last_checked_at timestamptz,
  next_check_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS monitoring_targets_user_active_idx ON public.monitoring_targets(user_id, active, next_check_at);

CREATE TABLE IF NOT EXISTS public.monitoring_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES public.monitoring_targets(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('change','new-page','availability','pricing','content','error','check')),
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','low','medium','high','critical')),
  title text NOT NULL,
  summary text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  detected_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz
);
CREATE INDEX IF NOT EXISTS monitoring_events_user_detected_idx ON public.monitoring_events(user_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS monitoring_events_target_idx ON public.monitoring_events(target_id, detected_at DESC);

ALTER TABLE public.monitoring_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitoring_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their monitoring targets" ON public.monitoring_targets;
CREATE POLICY "Users can view their monitoring targets" ON public.monitoring_targets FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can create their monitoring targets" ON public.monitoring_targets;
CREATE POLICY "Users can create their monitoring targets" ON public.monitoring_targets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their monitoring targets" ON public.monitoring_targets;
CREATE POLICY "Users can update their monitoring targets" ON public.monitoring_targets FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete their monitoring targets" ON public.monitoring_targets;
CREATE POLICY "Users can delete their monitoring targets" ON public.monitoring_targets FOR DELETE TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can view their monitoring events" ON public.monitoring_events;
CREATE POLICY "Users can view their monitoring events" ON public.monitoring_events FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can create their monitoring events" ON public.monitoring_events;
CREATE POLICY "Users can create their monitoring events" ON public.monitoring_events FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their monitoring events" ON public.monitoring_events;
CREATE POLICY "Users can update their monitoring events" ON public.monitoring_events FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monitoring_targets TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.monitoring_events TO authenticated;
GRANT ALL ON public.monitoring_targets, public.monitoring_events TO service_role;

CREATE OR REPLACE FUNCTION public.set_monitoring_targets_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS monitoring_targets_updated_at ON public.monitoring_targets;
CREATE TRIGGER monitoring_targets_updated_at BEFORE UPDATE ON public.monitoring_targets FOR EACH ROW EXECUTE FUNCTION public.set_monitoring_targets_updated_at();
