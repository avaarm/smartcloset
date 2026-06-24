# Supabase project

This folder is the source of truth for the SmartCloset backend (schema, policies, Edge Functions).

## One-time setup

```bash
brew install supabase/tap/supabase
supabase login
supabase link --project-ref <your-project-ref>
```

## Edge Functions

### `ai-proxy`

Proxies Google Vision / OpenAI / Google CSE so secret keys never ship in the client bundle.

**Deploy:**
```bash
supabase functions deploy ai-proxy
```

**Set secrets** (one-time per environment):
```bash
supabase secrets set \
  GOOGLE_VISION_API_KEY="..." \
  OPENAI_API_KEY="..." \
  GOOGLE_CSE_API_KEY="..." \
  GOOGLE_CSE_ID="..."
```

**Local dev:**
```bash
supabase functions serve ai-proxy --env-file ./supabase/.env.local
```

## Migrations

```bash
# Pull current remote schema into a baseline migration
supabase db dump --schema public > supabase/migrations/$(date +%Y%m%d%H%M%S)_baseline.sql

# After local changes
supabase db diff -f <name>
supabase db push   # apply to remote
```

## RLS audit (do this before launch)

For every table in `public`, verify:
1. RLS is `ENABLED`
2. There's a policy that scopes by `auth.uid()` (no `USING (true)` for user-owned data)
3. `INSERT` policies set `user_id` from `auth.uid()`, not from client payload

```sql
-- Tables without RLS:
SELECT tablename FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = false;

-- Permissive policies (potential issue):
SELECT tablename, policyname, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND (qual = 'true' OR with_check = 'true');
```
