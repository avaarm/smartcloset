# Swap moderation

Swaps let members show photos and exchange messages. This is how reports are handled. Response target: a person looks at new reports within 24 hours, and says so in the app guidelines and in App Review notes. That is only true while someone is told when reports are waiting (next section).

## Being told
The queue below is a view; nothing alerts anyone by itself. An hourly job posts a one-line message (how many reports are waiting and how old the oldest is, never a member or any text) to the webhook address stored in Vault under the name `swap_report_webhook`. If that secret, `pg_net` or the schedule is missing, no message is sent: check that you receive one after any test report (see section 11.3, "Scheduling the sweep and the report alert", in `documentation/design/swap.md`), and until then read the queue yourself every day.

## The queue
In the Supabase SQL editor (runs as the service role):

    select * from swap_moderation_queue;

Each row is one report: when, the context (`swap_listing` or `swap_chat`), the reason, the reporter's details, the reported account, and `evidence`. For a listing, evidence is the listing as it was when reported. For a conversation it is the status, the pieces, and the last 30 messages marked reporter, reported or system, with `flaggedMessageId` for a message the reporter pointed at.

## Actions
    select swap_admin_hold_listing('<listing id>');                  -- hide a listing and end offers for it
    select swap_admin_release_listing('<listing id>');               -- lift one hold, whoever made it
    select swap_admin_remove_listing('<listing id>', 'reason');      -- take a listing down for good
    select swap_admin_suspend('<user id>', 'reason');                -- end all their swaps, hold their listings, block new activity
    select swap_admin_unsuspend('<user id>');                        -- end the suspension; releases only the listings it held

A hold stays until you lift it: it does not expire, the owner cannot renew, withdraw or list the piece again, and ending a suspension does not release listings held by reports or by you. Removing a listing is permanent: open swaps that include it end, its photo is deleted at the next sweep, its reports are marked handled with your reason, and the piece cannot be listed again while it exists. An owner who adds the same clothes as a new piece is a case for suspension.

Mark a report handled (removing a listing does this for the reports about that listing):

    update content_reports set reviewed_at = now(), outcome = 'removed listing' where id = '<report id>';

A listing reported by three different members within seven days is held automatically, also while it is reserved in a swap (the hold lands when that swap ends). That is reversible by you and never suspends anyone: suspending a member is always a person's decision.

## Switches
    select swap_set_enabled(false);             -- pause swaps for everyone
    select swap_set_community_enabled(false);   -- pause only swaps between people who are not friends
Turning the community on again refuses until at least 50 terms are in `swap_blocked_terms`.

## The term list
`swap_blocked_terms` holds words and short phrases refused in listing names, notes, aliases and messages, matched as whole words. Terms are letters, digits and single spaces in any script, lower-case and without accents; text is folded the same way before it is compared (accents and invisible or wide characters do not get round a term), so write a term once, in plain form. Check every candidate against clothing vocabulary first (colours, cuts and brand names). Scam wording, payment words and contact details are built into the database function and need no rows.

The first build ships with no terms (friends-only swaps work with an empty list; the community cannot be switched on). Load the owner's reviewed list from the SQL editor:

    insert into swap_blocked_terms (term, kind)
    select swap_fold_text(t), 'content'
      from unnest(array['first term', 'second term']) as t
    on conflict (term) do nothing;

When the list is final, also commit the same statement as a new migration whose version is later than every existing file (see the release command in section 4.1 of `documentation/design/swap.md`), so a rebuilt database has it. Never edit a migration that has already been applied: `supabase db push` will not run it again.

## What cannot be seen
A report never reveals who reported to the reported person. Reports and their evidence are deleted when either account is deleted. A removed account takes its reports with it; if repeat abuse after deletion becomes a problem, keeping a minimal ban record is a decision for the owner (it changes the privacy policy).
