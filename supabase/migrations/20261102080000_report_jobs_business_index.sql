CREATE INDEX report_export_business_created_idx
  ON public.report_export_jobs(business_id, created_at DESC, id);
