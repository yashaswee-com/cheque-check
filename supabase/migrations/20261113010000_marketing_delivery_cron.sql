SELECT cron.schedule('marketing-delivery','* * * * *',$$
  SELECT net.http_post(
    url:=(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='project_url')||'/functions/v1/marketing-delivery',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization',
      'Bearer '||(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='service_role_key')),
    body:='{}'::jsonb,
    timeout_milliseconds:=60000
  );
$$);
