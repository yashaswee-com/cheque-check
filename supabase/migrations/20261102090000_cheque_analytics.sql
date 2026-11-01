CREATE FUNCTION public.cheque_analytics(
  requested_business uuid, requested_today date,
  requested_include_inward boolean DEFAULT true,
  requested_from date DEFAULT NULL, requested_to date DEFAULT NULL,
  requested_direction text DEFAULT 'All', requested_offset int DEFAULT 0,
  requested_limit int DEFAULT 50
) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
DECLARE
  first_day date; last_day date; bucket text; result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF requested_business IS NULL OR requested_today IS NULL
    OR requested_include_inward IS NULL OR requested_direction IS NULL
    OR requested_direction NOT IN ('All','Outward','Inward')
    OR requested_offset IS NULL OR requested_offset < 0
    OR requested_limit IS NULL OR requested_limit NOT BETWEEN 1 AND 100
    OR requested_from > requested_to THEN
    RAISE EXCEPTION 'Invalid analytics request' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(requested_from, min(c.cheque_date), requested_to, requested_today),
    coalesce(requested_to, max(c.cheque_date), requested_from, requested_today)
    INTO first_day,last_day
  FROM public.cheques c
  WHERE c.business_id = requested_business AND c.deleted_at IS NULL AND NOT c.is_draft
    AND (requested_include_inward OR c.type::text <> 'Inward')
    AND (requested_direction = 'All' OR c.type::text = requested_direction)
    AND (requested_from IS NULL OR c.cheque_date >= requested_from)
    AND (requested_to IS NULL OR c.cheque_date <= requested_to);
  IF last_day > first_day + interval '10 years' THEN
    RAISE EXCEPTION 'Analytics date range cannot exceed 10 years' USING ERRCODE = '22023';
  END IF;
  bucket := CASE WHEN last_day - first_day + 1 <= 31 THEN 'day'
    WHEN last_day - first_day + 1 <= 90 THEN 'week' ELSE 'month' END;
  WITH eligible AS MATERIALIZED (
    SELECT c.*, a.bank_id, coalesce(b.name,'Unknown bank') AS bank_name
    FROM public.cheques c
    LEFT JOIN public.accounts a ON a.id = c.account_id
    LEFT JOIN public.banks b ON b.id = a.bank_id
    WHERE c.business_id = requested_business AND c.deleted_at IS NULL AND NOT c.is_draft
      AND (requested_include_inward OR c.type::text <> 'Inward')
      AND (requested_direction = 'All' OR c.type::text = requested_direction)
      AND c.cheque_date BETWEEN first_day AND last_day
  ), metrics AS (
    SELECT e.bank_id, e.bank_name, e.status::text AS status, e.type::text AS type,
      count(*) AS cheque_count, sum(e.amount) AS total_amount,
      count(*) FILTER (WHERE e.status::text IN ('Issued','Received') AND e.deposit_date = requested_today) AS today_count,
      coalesce(sum(e.amount) FILTER (WHERE e.status::text IN ('Issued','Received') AND e.deposit_date = requested_today),0) AS today_amount,
      count(*) FILTER (WHERE e.status::text IN ('Issued','Received') AND e.deposit_date < requested_today) AS overdue_count,
      coalesce(sum(e.amount) FILTER (WHERE e.status::text IN ('Issued','Received') AND e.deposit_date < requested_today),0) AS overdue_amount
    FROM eligible e GROUP BY e.bank_id,e.bank_name,e.status,e.type
  ), summary AS (
    SELECT status,type,sum(cheque_count) AS cheque_count,sum(total_amount) AS total_amount,
      sum(today_count) AS today_count,sum(today_amount) AS today_amount,
      sum(overdue_count) AS overdue_count,sum(overdue_amount) AS overdue_amount
    FROM metrics GROUP BY status,type
  ), banks AS (
    SELECT bank_id AS id,bank_name AS name,
      jsonb_agg(to_jsonb(m) - 'bank_id' - 'bank_name' ORDER BY type,status) AS metrics,
      coalesce(sum(total_amount) FILTER (WHERE status IN ('Issued','Received')),0) AS pending
    FROM metrics m GROUP BY bank_id,bank_name
  ), bank_page AS (
    SELECT * FROM banks ORDER BY pending DESC,name,id NULLS LAST
    LIMIT requested_limit OFFSET requested_offset
  ), points AS (
    SELECT date_trunc(bucket,e.cheque_date::timestamp)::date AS day,
      count(*) FILTER (WHERE e.type::text = 'Outward') AS outward_count,
      count(*) FILTER (WHERE e.type::text = 'Inward') AS inward_count,
      coalesce(sum(e.amount) FILTER (WHERE e.type::text = 'Outward'),0) AS outward_amount,
      coalesce(sum(e.amount) FILTER (WHERE e.type::text = 'Inward'),0) AS inward_amount
    FROM eligible e GROUP BY 1
  ), series AS (
    SELECT g.day::date AS day,coalesce(p.outward_count,0) AS outward_count,
      coalesce(p.inward_count,0) AS inward_count,coalesce(p.outward_amount,0) AS outward_amount,
      coalesce(p.inward_amount,0) AS inward_amount
    FROM generate_series(date_trunc(bucket,first_day::timestamp),
      date_trunc(bucket,last_day::timestamp),
      CASE bucket WHEN 'day' THEN interval '1 day' WHEN 'week' THEN interval '1 week' ELSE interval '1 month' END
    ) g(day) LEFT JOIN points p ON p.day = g.day::date
  )
  SELECT jsonb_build_object(
    'from',first_day,'to',last_day,'granularity',bucket,
    'series',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY day),'[]') FROM series s),
    'summary',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY type,status),'[]') FROM summary s),
    'banks',(SELECT coalesce(jsonb_agg(to_jsonb(b) - 'pending' ORDER BY pending DESC,name,id NULLS LAST),'[]') FROM bank_page b),
    'matching_banks',(SELECT count(*) FROM banks)
  ) INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.cheque_analytics(uuid,date,boolean,date,date,text,int,int) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cheque_analytics(uuid,date,boolean,date,date,text,int,int) TO authenticated;
