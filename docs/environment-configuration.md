# Environment configuration

| Variable                                                              | Scope                     | Notes                                                                                                    |
| --------------------------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`           | all                       | Required. Must not be local in qa/production/preview.                                                    |
| `NEXT_PUBLIC_APP_ENV`                                                 | all deployed              | `production` \| `qa` \| `development`                                                                    |
| `NEXT_PUBLIC_DEPLOYMENT_KIND`                                         | all deployed              | `production` \| `qa` \| `preview` \| `development`                                                       |
| `NEXT_PUBLIC_PHONE_AUTH_ENABLED`                                      | per env                   | Default `false`. Shows phone OTP UI.                                                                     |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`                                      | per env                   | Required when phone auth is enabled in production; public site key for the registered frontend hostname. |
| `SUPABASE_SERVICE_ROLE_KEY`                                           | server only               | Used by the deactivate route and CLI. Never public.                                                      |
| `SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN`, `SUPABASE_AUTH_CAPTCHA_SECRET` | Supabase Auth config only | Shell env for `supabase config push`; not Vercel.                                                        |

Previews must use a QA/preview Supabase project, never production; the schema
rejects local URLs in deployed environments and production telemetry in
previews.

## Deployment sequence

1. Apply migrations (`supabase db push`), regenerate types.
2. `npm run ops -- dev setup` (dev projects) provisions Vault cron credentials via
   `configure_cron_credentials`; storage buckets/policies come from migrations,
   so no SQL editor step remains.
3. Push Auth config (`supabase config push`) and set Vercel variables per environment.
4. Add callback URLs for each origin to Supabase Auth redirect allow-list.
5. Rotate secrets by re-running the relevant push/set; rotate the service-role key
   then re-run `configure_cron_credentials`.
