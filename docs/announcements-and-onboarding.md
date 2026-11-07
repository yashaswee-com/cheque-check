# Announcements and onboarding

Developer announcements provide versioned, localized product messages to signed-in users. The first-run tour is a separate profile-backed onboarding flow ([announcement schema](../supabase/migrations/20261104010000_developer_announcements.sql#L1-L20), [tour status migration](../supabase/migrations/20261105020000_first_run_tour.sql#L1-L5)).

## Quick reference

- The application reads only the latest published, unexpired announcement through a database RPC; users acknowledge it through a separate RPC ([announcement RPCs](../supabase/migrations/20261104010000_developer_announcements.sql#L22-L47)).
- Announcement reads are private to authenticated active users, and direct client table access is revoked ([announcement permissions](../supabase/migrations/20261104010000_developer_announcements.sql#L17-L20), [RPC guards](../supabase/migrations/20261104010000_developer_announcements.sql#L22-L47)).
- The client repository validates the RPC response and invalidates its query after acknowledgement ([repository](../src/features/announcements/repositories/announcement.repository.ts#L1-L23), [hook](../src/features/announcements/hooks/use-announcement.ts#L1-L29)).
- Tour steps are spotlight UI; completion state is stored on the profile ([tour component](../src/features/tour/components/first-run-tour.tsx#L1-L120), [profile migration](../supabase/migrations/20261105020000_first_run_tour.sql#L1-L5)).

## Announcement lifecycle

The database stores a positive version, author, locale-keyed content, publish time, and optional expiry; only the service role can access the tables directly ([announcement tables and grants](../supabase/migrations/20261104010000_developer_announcements.sql#L1-L20)). The `latest_developer_message` RPC requires an authenticated active profile and returns the latest message whose publish/expiry window is active ([latest-message RPC](../supabase/migrations/20261104010000_developer_announcements.sql#L22-L33)). Acknowledgement checks that the message is currently available and inserts an idempotent read record ([acknowledgement RPC](../supabase/migrations/20261104010000_developer_announcements.sql#L34-L47)).

The client parses the returned data through a Zod schema, acknowledges through the RPC, and refreshes the query ([repository](../src/features/announcements/repositories/announcement.repository.ts#L1-L23), [query hook](../src/features/announcements/hooks/use-announcement.ts#L1-L29)). The shared message component renders a profile-visible announcement and can present it in the onboarding sheet ([developer message component](../src/features/announcements/components/developer-message.tsx#L1-L62)).

## First-run tour

The first-run migration adds `tour_status`, marks existing profiles as skipped, and sets new profiles to pending ([migration](../supabase/migrations/20261105020000_first_run_tour.sql#L1-L5)). The tour component contains five guided targets and records completion or skip through its profile callback; failed saves leave the tour retryable ([tour component](../src/features/tour/components/first-run-tour.tsx#L1-L120)). The onboarding message component only starts the tour after the announcement is acknowledged or absent ([onboarding integration](../src/features/announcements/components/developer-message.tsx#L20-L62)).

## Publishing and environment limits

The migration grants direct announcement-table access to the service role and revokes it from client roles; publishing content is therefore an operator-side action, not user authoring ([database grants](../supabase/migrations/20261104010000_developer_announcements.sql#L17-L20)). The repository does not show which versions are currently published in a hosted project or whether the relevant migrations have been applied; check the target database before treating a message or tour as live ([migration state boundary](../docs/infrastructure-and-deployment.md#deployment-verification)).
