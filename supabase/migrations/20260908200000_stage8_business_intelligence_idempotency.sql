ALTER TABLE public.business_metrics
  ADD COLUMN IF NOT EXISTS run_key text;

ALTER TABLE public.business_insights
  ADD COLUMN IF NOT EXISTS run_key text;

CREATE INDEX IF NOT EXISTS business_metrics_user_run_key_idx
  ON public.business_metrics(user_id, run_key);

CREATE INDEX IF NOT EXISTS business_insights_user_run_key_idx
  ON public.business_insights(user_id, run_key);
