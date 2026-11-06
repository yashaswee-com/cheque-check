# Operations

Use this as the default command map for Cheque Check. Keep it simple: setup, Supabase, DB, app, tests, functions, quality, and GitHub.

## Setup

```bash
cd /Users/yashaswee/code/cheque-check
npm ci
node -v
npm -v

# install tools
brew install supabase/tap/supabase
brew install gh

supabase --version
gh --version
```

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
git config --global core.editor "code --wait"

git status --short
git branch --show-current
git remote -v
```

## Supabase

```bash
export PROJECT_REF="<project-ref>"
export SUPABASE_ACCESS_TOKEN="<token-if-needed>"

npx supabase login
npx supabase link --project-ref "$PROJECT_REF"
npx supabase status
```

```bash
npx supabase start
npx supabase status
```

```bash
NEXT_PUBLIC_SUPABASE_URL="https://<project-ref>.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="<anon-key>"
SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
SUPABASE_DB_URL="postgresql://..."
```

## DB

```bash
npx supabase migration new add_<feature_name>
npx supabase db push
npx supabase db reset --db-url "$SUPABASE_DB_URL" --yes
npx supabase db seed
```

```bash
npm run db:migrate
npm run db:reset
npm run supabase:reset
```

## App

```bash
npm run supabase:setup
npm run dev
```

```text
http://localhost:3000
```

```bash
npm run build
npm run start
```

## Tests

```bash
npm test
npm run test:watch
npm run test:coverage

npm run test:e2e:install
npm run test:e2e:qa
npm run test:e2e:ui
npm run test:e2e:qa:reset-only
npm run test:e2e:qa -- --skip-reset
```

## Functions

```bash
npm run supabase:functions:deploy

npx supabase secrets list
npx supabase secrets set \
  TWILIO_ACCOUNT_SID="<sid>" \
  TWILIO_AUTH_TOKEN="<auth-token>" \
  TWILIO_FROM_NUMBER="<number>" \
  RAZORPAY_WEBHOOK_SECRET="<webhook-secret>" \
  OPENAI_API_KEY="<api-key>"

npx supabase functions deploy razorpay-webhook
npx supabase functions deploy notifications-dispatcher
```

## Quality

```bash
npm run lint
npm run type-check
```

## GitHub

```bash
gh auth login
gh auth status
gh auth setup-git
gh repo set-default <owner>/<repo>

git pull --ff-only origin <branch>
git checkout -b feature/<short-name>
git add .
git commit -m "feat: add <short-change>"
git push origin <branch>
gh pr create --fill
```

## Quick

```bash
npm ci
npx supabase login
npx supabase link --project-ref "$PROJECT_REF"
npm run supabase:setup
npm run dev

npx supabase db push
npx supabase db reset --db-url "$SUPABASE_DB_URL" --yes
npx supabase db seed

npm run lint
npm run type-check
npm test
npm run test:e2e:qa
npm run test:e2e:ui
npm run build
```
