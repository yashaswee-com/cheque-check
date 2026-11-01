# Environment configuration

For the complete from-scratch provisioning process, provider dashboard settings,
key sources, naming standard, and verification checklist, see
[Application setup](application-setup.md).

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

1. Verify the target project, apply migrations (`supabase db push`), include
   reference seed data for a fresh project, and regenerate types.
2. Deploy Edge Functions and set their provider secrets. Razorpay's external
   webhook needs gateway JWT verification disabled; internal workers remain
   protected. See [function deployment](application-setup.md#91-set-custom-secrets-and-deploy).
3. Provision Vault cron credentials through `configure_cron_credentials`.
   `npm run ops -- dev setup` does this only for disposable dev projects when
   function deployment is selected and a service-role key is supplied.
   Use the [manual RPC procedure](application-setup.md#92-provision-vault-safely)
   for QA/production. Storage buckets/policies come from migrations.
4. Configure hosted Auth and callback URLs in the dashboard, or review
   `supabase config diff` before pushing environment-specific config.
   The checked-in local defaults must not be blindly pushed to production.
   Test email flows too when enabling project-wide CAPTCHA.
5. Set Vercel variables per environment and rebuild. Verify workers and private
   downloads before enabling the initially paused export cron job.
6. Rotate secrets in every matching destination; after rotating the service-role
   key, re-run `configure_cron_credentials` and verify cron authentication.
