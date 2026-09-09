CREATE TABLE IF NOT EXISTS public.business_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  metric_key text NOT NULL, metric_value numeric NOT NULL, unit text, period_start timestamptz, period_end timestamptz,
  source_analysis_id uuid REFERENCES public.analyses(id) ON DELETE SET NULL, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS business_metrics_user_created_idx ON public.business_metrics(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS public.business_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL, summary text NOT NULL, category text NOT NULL CHECK (category IN ('growth','pricing','competition','risk','opportunity','retention','operations')),
  impact text NOT NULL DEFAULT 'medium' CHECK (impact IN ('low','medium','high','critical')), confidence numeric NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 1),
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb, recommendation text, source_analysis_id uuid REFERENCES public.analyses(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS business_insights_user_created_idx ON public.business_insights(user_id, created_at DESC);
ALTER TABLE public.business_metrics ENABLE ROW LEVEL SECURITY; ALTER TABLE public.business_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own business metrics" ON public.business_metrics FOR SELECT TO authenticated USING(auth.uid()=user_id);
CREATE POLICY "Users can create own business metrics" ON public.business_metrics FOR INSERT TO authenticated WITH CHECK(auth.uid()=user_id);
CREATE POLICY "Users can delete own business metrics" ON public.business_metrics FOR DELETE TO authenticated USING(auth.uid()=user_id);
CREATE POLICY "Users can view own business insights" ON public.business_insights FOR SELECT TO authenticated USING(auth.uid()=user_id);
CREATE POLICY "Users can create own business insights" ON public.business_insights FOR INSERT TO authenticated WITH CHECK(auth.uid()=user_id);
GRANT SELECT,INSERT,DELETE ON public.business_metrics TO authenticated; GRANT SELECT,INSERT ON public.business_insights TO authenticated;
GRANT ALL ON public.business_metrics, public.business_insights TO service_role;
