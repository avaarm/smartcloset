# Swap moderation

Swaps let members show photos and exchange messages. This is how reports are handled. Response target: a person looks at new reports within 24 hours, and says so in the app guidelines and in App Review notes. That is only true while someone is told when reports are waiting (next section).

Professional accounts (stylists and their clients) have their own section at the end of this file.

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

## Professional accounts

A stylist gives a client a one-time invite code. After the client connects, the two exchange looks (styling suggestions), sessions (appointments) and text messages, and the client may let the stylist see their closet for a limited time. Nothing is shared when they connect, no payment happens in the app, and nobody is verified: the app says stylists are independent professionals that SmartCloset does not check. Reports are read by a person. Response target: a person looks at new reports within 24 hours. As for swaps, that is only true while someone is told when reports are waiting.

### Professional reports: the alert
The queue is a view; nothing alerts anyone by itself. An hourly job posts a one-line message (how many professional reports are waiting and how old the oldest is, never a member or any text) to the same webhook address in Vault, `swap_report_webhook`, so one alert channel serves both features. If that secret, `pg_net` or the schedule is missing, no message is sent. Schedule it once (gate P5 in section 11.1 of `documentation/design/pro-accounts.md`):

    select cron.schedule('pro-report-digest', '11 * * * *', $$ select public.pro_send_report_digest(); $$);

Then prove it once: file a report from a test account, run `select public.pro_send_report_digest(interval '0 seconds');` (it returns true and the message arrives), then mark the report handled. Until a message has been seen to arrive, read the queue yourself every day, and reword the 24-hour aim in the app to "as soon as we can".

### Professional reports: the queue
In the Supabase SQL editor (runs as the service role):

    select * from pro_moderation_queue;

Each row is one report: when, the context (`pro_profile`, `pro_chat` or `pro_content`), the reason, the details the reporter wrote, the reported account, `evidence` and `qualified`. Read in this order: `underage`, `unsafe_meeting`, anything that threatens someone, then the rest. The view lists `underage`, `unsafe_meeting`, `unsafe` and `harassment` first, then the oldest first. The reasons added for professional accounts are `underage`, `false_credentials`, `data_misuse` and `unsafe_meeting`.

What a report holds:

- A report about a person (from a profile, an invite preview or a message): the stylist profile as it was when reported, or the last 30 messages marked reporter, reported or system, with `flaggedMessageId` for a message the reporter pointed at. Each message is cut to 300 characters and the oldest are dropped first, so the copy fits the table's size limit.
- A report about a look or a session: its fields.
- `qualified`: true only when the reporter's account is at least 48 hours old and they really worked with the reported person (a connection of at least 24 hours, or at least 3 text messages from the person reported; the reporter's own messages prove nothing). A report made from an invite preview is never qualified.
- Never the rest of a client's closet, a photo or a storage path. A look names the pieces the stylist chose and nothing else about them.

### New stylists: the review queue
New stylists start with a limit of 3 active clients and 1 live invite. Read the profile text of each one:

    select * from pro_review_queue;

Each row is a stylist who has not been approved or removed: the display name, headline, bio, services, rates text, when it was created and how many active clients they have. Approving lifts the limits to 25 clients and 10 live invites and nothing else: clients are never shown it, and nobody in the app is called verified, certified or approved. Removing is for a profile that impersonates someone, claims credentials or approval it does not have, or breaks the rules.

### Professional accounts: actions
    select pro_admin_approve_stylist('<user id>');             -- lift the new-stylist limits
    select pro_admin_hold_stylist('<user id>');                -- stop their new invites; their live codes cannot be redeemed
    select pro_admin_release_stylist('<user id>');             -- lift a hold, whoever made it
    select pro_admin_suspend('<user id>', 'reason');           -- end all their connections, on either side, and pause their professional features
    select pro_admin_unsuspend('<user id>');                   -- end the suspension; reconnects nothing
    select pro_admin_remove_stylist('<user id>', 'reason');    -- end their connections, delete their invites and profile, refuse a new profile
    select pro_admin_restore_stylist('<user id>');             -- allow a new profile; recreates nothing

A hold stops the stylist's new invites and makes their live codes unredeemable. Their existing connections continue. A hold made by you never expires. Reports and churn make a hold on their own (below), and that kind releases itself after 7 days unless you confirm it with `pro_admin_hold_stylist`. A suspension ends every connection of the person as the system, and the person can still stop sharing, end a connection, report, block and export their data while it stands. A removal is more than a hold: the stylist cannot get round it by closing the profile and creating a new one, and `pro_admin_restore_stylist` is the only way back. It also marks their open reports handled with your reason. Approval, holds and removals belong to the person, not to the profile, so closing and re-creating a profile resets none of them. A credible `underage` report is a reason to suspend at once (the professional membership, not the whole account) and to keep the evidence.

Mark a report handled (removing a stylist does this for the open reports about them):

    update content_reports set reviewed_at = now(), outcome = 'suspended' where id = '<report id>';

Two different reporters who really worked with a stylist (both `qualified`) within 14 days put a hold on their new invites automatically. So does a run of ten connections that clients ended within 48 hours of starting, within 30 days; connections the stylist ended do not count. That is reversible by you and never suspends or ends anything: suspending a member is always a person's decision.

### Professional accounts: switches
    select pro_set_enabled(false);             -- pause professional accounts for everyone

Pausing stops closet reads at once and every professional action except the ways out: stop sharing, end a connection, block, report, unblock and export keep working. The switch starts off, and turning it on refuses until at least 50 terms are in `swap_blocked_terms`. The app has its own build switch, a one-line change that needs a new build.

### Professional accounts: filters and the term list
The term list of swaps is the same list for professional accounts. In a stylist's name, headline, bio and rates, a client's chosen name and the place of a session, scam wording, payment words, links, email addresses, handles, phone numbers and messaging-app names are refused as well as listed terms. In messages, looks, notes, feedback and a stylist's private invite labels only scam wording and listed terms are refused, because two connected adults may talk about payment and share contact details. Report details are not filtered at all: a person reporting a scam must be able to quote it, so what you read in a report is exactly what they wrote (control characters removed, cut to 500 characters). In every field, text that hides characters or reverses its own direction (a right-to-left override, a zero-width space) is refused, and in a stylist's headline, bio and rates a claim of approval by SmartCloset (the app's name next to words such as official, approved by or endorsed) is refused; emoji and the joiners other scripts need are fine. Load terms as described under the term list above.

### Professional accounts: what cannot be seen
A report never reveals who reported to the reported person. A block is never revealed to the person blocked: they see a closed connection with no content and never the word blocked. Reports and their evidence are deleted when either account is deleted. A removed or suspended person who deletes their account takes the reports about them with it and can register again under another email; new accounts wait 48 hours before they can create an invite code. No suppression record is kept. If the owner decides to keep a minimal one, that changes the privacy policy first.
