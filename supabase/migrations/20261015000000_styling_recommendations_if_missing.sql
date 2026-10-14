-- Prerequisite for the swap migrations (and for account deletion on any new database):
-- public.styling_recommendations.
--
-- delete_user_account() (20261002000000) runs "delete from public.styling_recommendations", but no
-- migration in this repository creates that table. It was created by hand on the live project from the
-- definition in documentation/SUPABASE_MIGRATION_GUIDE.md. On a database built only from these
-- migrations (supabase db reset, a preview branch, a new environment) the function therefore fails
-- with "relation public.styling_recommendations does not exist", so nobody could delete their
-- account there, and the account-deletion script of the swap tests (s4_deletion) cannot pass.
--
-- This creates the table, with row-level security on and the two policies of that guide, only when it
-- is missing. On the live project the table exists, so the whole block does nothing. The definition
-- below is the guide's. Before this file merges, stream SW1 compares it with the live table
-- (select column_name, data_type, is_nullable from information_schema.columns where table_schema =
-- 'public' and table_name = 'styling_recommendations') and corrects this file to match; the three
-- columns delete_user_account() uses are id, client_id and stylist_id.
--
-- Safe to run twice.

do $$
begin
  if to_regclass('public.styling_recommendations') is null then
    create table public.styling_recommendations (
      id               uuid primary key default gen_random_uuid(),
      stylist_id       uuid not null references public.stylist_profiles(id) on delete cascade,
      client_id        uuid not null references auth.users(id) on delete cascade,
      title            text not null,
      description      text,
      category         text check (category in ('outfit', 'purchase', 'wardrobe-tip', 'color-palette', 'style-guide')),
      item_ids         uuid[] default '{}',
      images           text[] default '{}',
      occasion         text,
      season           text[] default '{}',
      notes            text,
      status           text default 'draft' check (status in ('draft', 'sent', 'viewed', 'implemented')),
      sent_at          timestamptz,
      viewed_at        timestamptz,
      feedback_rating  integer,
      feedback_comment text,
      feedback_date    timestamptz,
      created_at       timestamptz default now(),
      updated_at       timestamptz default now()
    );
    alter table public.styling_recommendations enable row level security;
    create policy "Stylists manage recommendations" on public.styling_recommendations for all
      using (stylist_id in (select id from public.stylist_profiles where user_id = auth.uid()));
    create policy "Clients view own recommendations" on public.styling_recommendations for select
      using (auth.uid() = client_id);
  end if;
end
$$;
