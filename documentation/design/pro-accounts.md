# Professional accounts: build specification (stylists and their clients)

Status: design, ready to build. Written 2026-10-23 against `main` at `710adaa`, Supabase project `ipgndphqbuftuxstoitk`.

Revision 2 (2026-10-23): applies the review by three critics (about 60 findings, two blockers). The larger changes: a sign-in-only **`safety` gate**, so nobody can be trapped by terms, the kill switch, a suspension or an old build (4.1); closet photos served through one edge function, **`pro-photo`**, instead of storage links, so no account id and no location data reaches a stylist (4.8); sanctions kept on the person instead of on the profile (3.4); a stored closed shell (2.9); reports counted toward an automatic hold only from people who really worked with the stylist (6.4); `pro_enabled` seeded **off** and switched on by hand after the alert and the term list exist (4.2, 11.1); migration versions re-assigned at release (3.1); locking and idempotency rules for every write (4.1, 4.6). Whatever was not applied as written is explained in "Review notes" at the end.

Revision 3 (2026-10-25): applies the review of the first build (six confirmed findings and the cheap minor ones; the review notes 15 to 22 at the end say what and why). The changes to the contract: a block made through Friends or Swaps takes the pair lock a redeem takes and `pro_refresh` finishes a block the trigger missed (4.1, 4.5); `list_pro_connections` never returns `system` (4.6); a session carries its proposer's **offset from UTC** (`p_utc_offset_minutes`, `utc_offset_minutes`) and never a zone name (3.4, 4.6, 5.1); a stylist who deletes their account loses their unsent drafts (2.9, 8.1); report details are not filtered, a qualified report needs three messages from the reported person, hidden characters and claims of approval by SmartCloset are refused, a spent code only counts as connected while its connection is active, and a client alias is held to the reserved words (4.5, 4.6, 6.3); `useProAccess` keeps what a screen has when a re-read fails (7.5.2); every pro Jest suite finds the migrations by name (9.3, 11.1).

Reconciliation with the repository (2026-10-23): every existing file, function, route, table, column, policy, migration and test landmark this document cites was re-read against `main` at `710adaa`, and Appendix B was compiled and run on a scratch PostgreSQL 16 (see "Status and provenance"). The corrections are in 1.5, 3.3 (rule 9), 3.5, 4.3, 7.1, 7.4, 7.10, 7.11, 8.1, 10.2 and Appendix B (B.9, B.10); none changes a product or a security decision.

Feature: a person can be a **stylist** (a professional who works with clients) and/or the **client of a stylist**, between two real people on two real phones. It replaces the Stylist and Client modes that were a one-device simulation and were switched off on 2026-10-04 (`PRO_MODES_ENABLED = false`, commit `e1b2e4e`).

Request (owner, verbatim): "the app is missing the professional account options (so a stylist account and a client of a stylist account)".

Short names used in this document: **pro** (the feature, and the prefix of every new database object and file), **stylist** (a person with a stylist profile), **client** (a person connected to a stylist), **connection** (the link between one stylist and one client), **look** (a styling recommendation a stylist writes for a client), **session** (an appointment).

## Contents

- Status and provenance (what was read, what was run)
- 1. Summary, what ships in the first release, what is cut
- 2. Roles and states
- 3. Data model and migrations
- 4. Server interface
- 5. Privacy and consent
- 6. Safety and moderation
- 7. Client app
- 8. Account deletion and data export
- 9. Test plan
- 10. Build plan: waves, streams, file ownership, integration passes
- 11. Release checklist and open decisions for the owner
- Appendix A: copy (terms, guidelines, safety tips, error messages)
- Appendix B: normative SQL sketches
- Review notes: findings not applied as written, and why

---

## Status and provenance

This is a design, not a build. **No pro migration was applied to a real project, no function of 4.6 was called, no Jest test was executed, and no network service or live database was contacted.** The reconciliation pass of 2026-10-23 ran one thing: it applied the 33 existing migrations, in order, to a scratch PostgreSQL 16 (with a stub of Supabase's roles, `auth` and `storage`), created the fifteen tables of 3.4 from this text, compiled the SQL of Appendix B (B.1 to B.10) and ran it against fixtures through the real roles (53 checks, all passed: the gate, the code and text helpers, ending a connection, the closed shell, the block and member-left triggers on a real `delete from auth.users`, `pro_can_read_closet`, `pro_photo_source`, the evidence budget, the janitor, and the order of redeeming a code), and ran the repository's bare-write scanner (`migrationSafeUpdate.test.ts`) over the same SQL, which found nothing. The helpers of 4.5 that Appendix B calls but does not show (`pro_cfg`, `pro_limit`, `pro_rate_check`, `pro_photo_path`, `pro_lock_users`, `pro_invites_held`, `pro_end_between`) were written from their prose for that run only, and the functions of 4.6 were not written. Every signature, table and rule is the contract the streams in section 10 build to, and the first job of each database stream is to prove its part on a scratch PostgreSQL 16 (swap's method, `documentation/design/swap.md` section 0) and then on a local Supabase stack.

What the design stands on (all read, none changed):

| Source | What was taken from it |
| --- | --- |
| `documentation/design/swap.md`, `BUILD-PLAN.md`, `quality-ratings.md` | House style: `SECURITY DEFINER` functions with fixed output columns, row level security on with no policies, kill switch, versioned terms, rate counters, `client_ref` idempotency, lazy upkeep, reports and blocks through existing tables, no push, deletion by cascade, streams with single file owners |
| `supabase/migrations/20261015000100..0500_swap_*.sql`, `20261019000000_swap_janitor_where_clause.sql` | The exact helper shapes (`swap_raise`, `swap_gate`, `swap_rate_check`, `swap_text_ok`, `swap_close`, `swap_janitor`, `report_swap_content`, `block_swap_member`, `swap_send_report_digest`) and the lesson of the janitor that failed through the API because of a missing `WHERE` |
| `supabase/migrations/001_initial_schema.sql` (lines 139-411), `20261002000000`, `20261004000000`, `20261005000000`, `20261006000000`, `20261015000000`, `20261019204430` | The legacy pro tables, their policies, `delete_user_account()`, the friends photo policy, `user_blocks`, `content_reports`, `is_blocked_between`, `get_friend_closet`, the private-bucket flag |
| `App.tsx`, `src/config/features.ts`, `src/context/AccountModeContext.tsx`, `src/services/{accountService,stylistService,marketplaceService,messagingService,localData,seedDemoData,swapService,swapErrors,swapPhotoUrls,imageUrls,backupService,accountDeletion}.ts`, `src/hooks/useSwapAccess.ts`, `src/screens/{Home,Settings}Screen.tsx`, the 22 legacy pro screens | What exists, what is reusable, what is a fake |
| `__tests__/navigationRoutes.test.ts`, `migrationVersions.test.ts`, `migrationSafeUpdate.test.ts`, `swapMigrations.test.ts`, `services/localData.test.ts`, `docs/privacyPolicy.test.ts`, keyboard tests | The guards the build must satisfy, and the ones it must change on purpose |
| `docs/privacy.html`, `docs/MODERATION.md`, `ios/smartcloset/PrivacyInfo.xcprivacy`, `supabase/functions/delete-account/index.ts`, `supabase/audit.sql` | The public policy and the deletion path |
| Four read-only studies run for this design (client app, server, swap as a template, legal and safety position) | Findings quoted by name where used |

**Not verifiable from the repository, and therefore listed as release checks (section 11):** the live definition of the legacy pro tables and of the hand-made `styling_recommendations`; their row counts; whether `public.profiles` (from `documentation/SUPABASE_MIGRATION_GUIDE.md`) exists; whether `pg_cron`, `pg_net` and Vault exist and the swap report alert actually arrives; whether the project requires email confirmation and has anonymous sign-ins off; whether `wardrobe-images` is private and which policies on `storage.objects` mention it (the bucket and its owner policy were made by hand in the dashboard; `20261019204430_wardrobe_images_private.sql` flags the bucket private once it has been pushed, and whether it has been is the remote head); the remote migration head (`supabase migration list`); which shipped builds still contain the pre-2026-10-04 Stylist and Client screens; Apple's current age-rating wording; the real backup retention period; whether PostgREST on the local stack loads the same "UPDATE requires a WHERE clause" guard as the hosted project (the API script of 9.4 proves it before it trusts anything).

Two corrections to the working assumptions, found while reading:

1. The legacy `stylistService` is not purely a simulation: signed in, it already reads and writes `stylist_profiles`, `stylist_clients`, `appointments` and `recommendations` directly through the table API. Those tables, and five more (`message_threads`, `messages`, `booking_requests`, `stylist_reviews`, `styling_recommendations`), are **reachable by every signed-in account today**, hidden only by the missing screens. Their policies let any member read every active stylist's email and phone, let a stylist attach rows to any user id, let a client rewrite any column of a recommendation, and let anyone post in any thread. Section 3.2 closes them first and independently.
2. Apple's guideline for real-time one-to-one services between two people is 3.1.3(d); 3.1.3(e) is goods and services consumed outside the app. Neither is exercised, because **no payment of any kind happens in the app** (section 1.4, decision 6).

---

## 1. Summary, what ships in the first release, what is cut

### 1.1 What a person sees

- **Everyone** keeps the app they have. A signed-in adult sees a new cell on Home, **Stylists**, and a new **Professional** section in Settings. Guests see neither.
- **A stylist** opens the Stylist workspace (a separate tab bar: Clients, Schedule, Messages, Settings). They fill in a short profile, accept the stylist terms and confirm they are 18 or older, then create an **invite code** and give it to a client by any channel they like (a text message, in person). They never see a client's closet unless that client switches it on.
- **A client** enters the code under Stylists, sees who the stylist is (name, headline, bio, services, rates as text the stylist wrote), accepts the client terms, picks the name the stylist will see, and connects. **Nothing is shared when they connect.** On the connection's page they decide what their stylist can see: **their closet** (not the wishlist), all pieces or only chosen ones, for 90 days, switch off at any moment.
- **Between the two:** looks (the stylist builds a look from the client's shared pieces, adds a note, sends it; the client reads it, rates it, says if they wore it), sessions (either side proposes a time, the other confirms; virtual or in person; no payment), and a text-only thread. A dot and a count on Home show what needs attention. There are no push notifications.
- **Safety:** adults only; Report and Block on every surface; either side can end the connection at any time and sharing stops at once; scam and payment wording is refused; the app says plainly that stylists are independent professionals, that SmartCloset does not check or vouch for them, and that it never takes payment.

### 1.2 What ships in the first release

| Area | In the first release |
| --- | --- |
| Roles | Personal (everyone), stylist (additive), client (a connection; additive). One person can be all three, and can be the client of up to 5 stylists |
| Connecting | Stylist-issued invite code (single use, 7 days). The client previews, confirms, connects. Either side ends it at any time |
| Sharing | One scope: **closet** (owned pieces only, fixed columns, cover photo, no prices, notes, tags, wear data or wishlist). All pieces or selected pieces, 90 days, revocable, every grant recorded |
| Photos | A stylist never receives a storage path or a link. Each shared piece's cover photo is fetched through the `pro-photo` edge function, which checks the live grant on every request and removes location and camera data before it sends the image (4.8) |
| Work | Looks (draft, sent, viewed, wore it; one client rating and comment), sessions (propose, confirm, decline, cancel; time, length, virtual or in person, short place text), text thread (500 characters, polled every 15 seconds while open) |
| Stylist offer | Profile: name, headline, bio, services (closed list), languages, rates as text, accepting clients on or off. Visible only to someone holding one of the stylist's live invite codes |
| Safety | 18+ attestation, per-role versioned terms accepted on the server, report and block (existing `content_reports` and `user_blocks`), filters, rate limits, probation caps for new stylists, a self-releasing hold on a stylist's new invites when two people who really worked with them report within 14 days, a server off-switch (off until the alert and the term list exist), suspension by a person, and a sign-in-only `safety` gate so every way out (stop sharing, end, block, report, export) works under the switch, a suspension or stale terms |
| Operations | Moderation queue view, report digest to the owner's webhook (the swap alert channel), admin functions |
| Housekeeping | Legacy tables locked on the server and their local simulation data removed; Export Data section; account deletion by cascade for both roles |

### 1.3 What is cut, and where it goes

| Cut from the first release | Why | Where it goes |
| --- | --- | --- |
| **Public directory ("marketplace") and client-initiated requests** | The largest source of stalking, scraping, fake-profile and (in the EU) marketplace-law risk. A stylist who already has clients, or who meets a client in person, can use invite codes. The seeded fake stylists (verified ticks, 4.9 stars) are deleted | Phase 2, behind its own server switch (4.2 reserves the config row name; section 11.3 lists its gates). The database design leaves a clean place for it (connection state `requested`, added by a later migration) |
| Reviews and star ratings of stylists | Needs a review-integrity design (only after completed sessions, one per connection, reply rules) and counsel review of consumer-review rules | Phase 2 |
| Sharing anything but the closet (body profile, skin tone, style quiz, colour season, outfits, wishlist) | Body and skin data is sensitive and is not yet declared in the privacy label; each needs its own switch and its own consent text | Phase 2, one scope at a time (the `pro_grants.scope` check is widened by a later migration) |
| Photos and attachments in chat or looks; links | Strangers' images need the metadata strip and a safety check (swap's `swap-media`); links are phishing vectors | Phase 3 with an edge function. Links are never rendered |
| Stylist-typed client records (a CRM for people without accounts), private stylist notes about clients | Personal data about a person who has not consented and cannot see or delete it | Not planned. A stylist keeps their own notes outside the app |
| Fees, "paid" flags, "Total Earnings", "Total Investment", invoices, booking prices | The app takes no money and must not look as if it tracks it | Not planned. Rates are free text the stylist writes |
| Wardrobe audit, Lookbook and Capsule tools | They work on the signed-in person's own closet, not a client's | Parked (7.11); Phase 2 points them at a client's shared closet |
| Push notifications, reminders, calendar export, meeting-link fields, deep-link invites | New entitlement and identifiers; links are an attack surface | Phase 3. The invite is a code that is typed or pasted |
| Stylist approval before use | Would block the owner's own testers and App Review | Replaced by probation caps (6.6) and a review queue; approval lifts the caps |

### 1.4 Departures from the owner's defaults, and why

| Owner default | Final | Reason |
| --- | --- | --- |
| 1. Roles are additive: personal plus stylist and/or client | Same | |
| 2. "Client mode" (a mode of the app) | **A client is a connection, not a tab set.** The personal app stays whole; "Stylists" on Home is the client's place. Only the stylist has a workspace tab set | Today's client mode replaces Home, Wardrobe, Outfits and Wishlist with six tabs of its own (Dashboard, My Stylist, Recs, Appointments, Messages, Settings). A client needs their closet to share it. A mode that removes the closet makes the feature unusable. Stylists genuinely work in a different shape (clients, schedule, inbox), so they keep a separate tab bar |
| 3. Connect by invite code, or by marketplace request the other side accepts | Invite code only (the stylist's issuing of the code is their acceptance; the client confirms after a preview). Marketplace deferred | 1.3 |
| 4. Nothing shared by default; wardrobe items, not the wishlist; more is a separate switch or excluded | Same. Only the closet is a switch in the first release; everything else is excluded | 1.3 |
| 5. Stylist offer visible in a marketplace when switched on | Visible only through a live invite code | 1.3 |
| 6. Recommendations, appointments, text messaging; no payment; rates are information; the app says so | Same. Rates are text (120 characters), labelled as the stylist's, with "Payment is arranged directly between you and your stylist. SmartCloset does not take payments, add fees or guarantee any service" shown wherever rates appear | Apple 3.1.1 and the "fake commerce" lesson that hid the old modes |
| 7. Adults only; terms for stylists and clients; report and block; rate limits; server off-switch; filter; no verification claims | Same. Age is attested and enforced inside every function that creates or shares anything, not only in the app (the ways out need only a sign-in, 4.1). No "verified", "certified", "featured" or rating badge exists anywhere | |
| 8. No push; existing local simulated data discarded | Same. A one-time purge removes the old device-local stores (7.11) | |

### 1.5 How it is built, in brief

- **Fifteen new tables**, none readable or writable by an app user (row level security on, all privileges revoked, no policies). Every read and write is a `SECURITY DEFINER` function that checks sign-in, the off-switch, terms, adult attestation, suspension and blocks (the ways out check only sign-in and participation), and returns a fixed list of columns. **No function returns another person's account id, email or phone.** Other people are `connection` ids and labels.
- **The legacy pro tables are locked first**, by a migration that only revokes privileges (3.2). They are not dropped, because `delete_user_account()` still deletes from eight of them by name (the ninth, `stylist_profiles`, goes with the account through the `auth.users` cascade) and would fail on a missing table.
- **Roles are server facts.** The device keeps one preference (`@smartcloset_current_mode`, which may only be `user` or `stylist`) and honours `stylist` only while `get_pro_status()` says the account holds an active stylist role.
- **The closet reaches a stylist through one door:** `get_client_closet(connection)`, built on the pattern of `get_friend_closet` (a fixed column list, no wishlist, no blocked pairs, access decided on the server). That function returns the `user_image` and `retailer_image` addresses, which name `<account id>/<file>`; this one returns piece details and a piece id and **never a storage path or a photo address** (a path is `<account id>/<file>`). Photos come through one edge function, `pro-photo`, that asks the database (`pro_photo_source`, service role only) on every request and answers with the image, location and camera data removed, `no-store`. No storage policy is added and the folder-wide friends policy is not copied.
- **Everything that ends a connection** (either person ends it, a block, a suspension, a deleted account, a closed stylist profile) goes through one internal function, `pro_end_connection`, which removes the grant, cancels open sessions and writes one neutral system line. A block additionally turns the connection into a stored **closed shell** and deletes its content (`pro_shell_connection`, 2.9).
- **Withdrawing is always possible.** Stopping sharing, ending, blocking, reporting, listing and removing blocks, closing a stylist profile, exporting data and reading ended history use a **`safety` gate** that checks only that the caller is signed in (not anonymous) and a participant. Terms, the kill switch, a suspension or an old build never lock a person in (4.1).
- **Account deletion needs no change** to `delete_user_account()`, `block_user()` or `report_user()`; foreign keys, triggers and the janitor do the work (8).
- **Client code** is one service module, one error mapper, one access hook, one badge hook, and twelve screens and 22 components, all new files with a `Pro` prefix, plus one edge function (`pro-photo`). The 19 old pro screens, three old services and `src/types/stylist.ts` are deleted in a cleanup pass; the UI layouts are references, not code to patch (7.11).

### 1.6 Rules every part follows (the lessons, as rules)

1. **Every `UPDATE` and `DELETE` has a `WHERE`, including one-row tables** (`where id`, `where key = ...`). PostgREST rejects a bare one; direct SQL does not. The swap upkeep job failed on phones for exactly this (`20261019000000`). `__tests__/migrationSafeUpdate.test.ts` scans migrations; the API script (9.4) calls every function through the real API; 4.9 lists every write statement and its `WHERE`.
2. **Named parameters are the contract.** PostgREST matches function arguments by name. Every client function takes `p_`-prefixed arguments listed in 4.6, the service sends exactly those, and a Jest test compares the service, the SQL and the API script (9.3). Renaming an argument breaks every installed build.
3. **No function is overloaded** (PostgREST cannot choose between overloads reliably) and none is renamed after release.
4. **The server is the authority.** Nothing about roles, terms, age or access is stored on the device except the mode preference, and every function re-checks everything.
5. **One existence-hiding error** (`pro_unavailable`) for not found, not visible, not a participant, blocked and gone, so ids cannot be probed and a block is never revealed.
6. **No new AsyncStorage key** (`localData.test.ts` enumerates keys); in-memory only for anything about another person.
7. **No module-scope network, storage or timers** in any new file (`App.test.tsx` and `AppModeGate.test.tsx` import every screen, the second with `supabase` mocked to `auth` only, and the settings and home suites mock it the same way); guest and failure paths never call `console.error`.
8. **A feature that is dark is dark everywhere:** `PRO_MODES_ENABLED` (build) and `pro_enabled` (server) both gate it. `pro_enabled` is **seeded `false`** and is switched on by hand only after the report alert and the term list exist (`pro_set_enabled(true)` refuses before 50 reviewed terms are loaded); the build flag flips last (7.4, 11.1). A push of the migrations therefore never turns anything on.
9. **Ways out never depend on consent, switches or versions.** Stop sharing, end, block, report, unblock, export, close the profile and read ended history use the `safety` gate (4.1). Disabling a grant never needs a text version and is never rate limited.
10. **Every write to a connection locks it first** (`select ... for update`, then re-check `active`), and the functions that read a stylist's state before deciding (redeem, revoke, close, accepting, admin holds) take the stylist's advisory lock (4.1). Code failures of the two invite lookups are returned, not raised, so their rate counter commits (4.1).

---

## 2. Roles and states

### 2.1 Roles

| Role | How a person gets it | What it adds | Needs |
| --- | --- | --- | --- |
| **Personal** | Signing in | The whole existing app | Nothing |
| **Stylist** | "I'm a stylist" in onboarding, or Settings > Professional > Become a stylist | A stylist profile, invite codes, the Stylist workspace | Signed in (not a guest), 18+ attestation, stylist terms accepted at the current version, a saved profile |
| **Client** | Redeeming an invite code | One connection per stylist; the page for it under Stylists on Home | Signed in (not a guest), 18+ attestation, client terms accepted at the current version, a name to show the stylist |

A person can hold any combination. A stylist who is also a client of another stylist uses the personal app for that (Stylists on Home) and the workspace for their own clients. **Guests cannot use any pro feature**: the Home cell and the Settings section are hidden, and every function raises `not_authenticated` before any network call.

The device preference `currentMode` has two values, `user` and `stylist`. A stored `client` (from an older build) is read as `user`. `stylist` is honoured only when the server confirms the role (7.3).

### 2.2 Stylist account states

| State | Meaning | Set by |
| --- | --- | --- |
| none | No profile | start |
| active, on probation | Profile saved, stylist terms current, not yet approved: at most **3** active clients and **1** live invite | `save_stylist_profile` |
| active, approved | Same, caps lifted to 25 clients and 10 live invites (`pro_members.stylist_approved_at`: it belongs to the person, so closing and re-creating the profile does not reset it) | `pro_admin_approve_stylist` (a person, after reading the profile text) |
| not accepting | `accepting_clients = false`: existing connections continue, no new code can be redeemed | `set_stylist_accepting` |
| invites held | `pro_members.invites_held_at` is set (the hold belongs to the person, so closing and re-creating the profile does not clear it): the stylist cannot create invites and no code of theirs can be redeemed; connections continue. Set automatically (`invites_held_by = 'system'`) when two different reporters **who really worked with the stylist** report within 14 days (6.4) or by churn (6.6), and **released automatically 7 days later** unless a person confirms it (`pro_admin_hold_stylist`, `invites_held_by = 'admin'`, which never expires); lifted early by `pro_admin_release_stylist` | system or a person |
| suspended | `pro_members.suspended_at` is set (a person's decision): every pro function except the `safety` ones (4.1) refuses with `pro_suspended`, all connections end as `system`, the profile stops being shown | `pro_admin_suspend` / `pro_admin_unsuspend` |
| removed | `pro_members.stylist_removed_at` is set by a person (`pro_admin_remove_stylist`): connections end, invites and profile are deleted, and `save_stylist_profile` answers `stylist_profile_removed` until `pro_admin_restore_stylist`. The person remains an ordinary member | `pro_admin_remove_stylist` / `pro_admin_restore_stylist` |
| closed | The stylist closed the profile: connections end, invites are deleted, the profile row is deleted; the person remains an ordinary member. Approval, a hold and a removal stay on `pro_members`: re-creating the profile never resets probation and never clears a sanction | `close_stylist_profile` |

### 2.3 Invite states

`live` -> `used` (redeemed; the new connection points back to it through its `invite_id`) | `revoked` (by the stylist) | expired (7 days after creation, evaluated by time, not stored; the janitor deletes it 30 days later). A used code cannot be reused. A code that is not live, not found, expired, the caller's own, held, or between blocked accounts all answer the same way: `invite_invalid`, as a returned result and not a raised error (so the lookup counter commits, 4.1). One exception: the client who already redeemed that code, asking again **while that connection is still active**, gets the same connection (`alreadyConnected`), so a retry after a lost response is safe. Once the connection has ended or become a closed shell, the spent code answers `invite_invalid` like any other: the app is never told it is connected to something that is over, and the answer does not change when a blocker unblocks.

### 2.4 Connection lifecycle

There is no pending state in the first release. Redeeming creates the connection already `active`: the stylist's consent is the act of issuing the code, the client's consent is the confirm after the preview.

| From | Event | By | To | Effects |
| --- | --- | --- | --- | --- |
| (none) | `redeem_pro_invite` | client | active | Invite becomes `used`; system line "connected"; **no grant exists** |
| active | `end_pro_connection` | either | ended (`ended_by` = the caller's role) | Grant deleted, events written, open sessions cancelled, system line "ended" |
| active | block (any feature's `user_blocks` insert, or `block_pro_member`) | either | ended (`ended_by` = the role of the person who blocked) | Same, and the connection becomes a closed shell and its content is deleted (2.9) |
| active | stylist closes the profile | stylist | ended (`ended_by` = stylist) | Same |
| active | suspension | admin | ended (`system`) | Same |
| active | either account deleted | system | ended (`system`), the leaver's side becomes null | Same, and see 8 |
| ended | 90 days later | janitor | row deleted (messages already gone at 30 days) | |

Ended connections stay visible (read-only) for 30 days of messages and 90 days of the rest. Both people see the same neutral wording: "This connection has ended." The person who ended it sees "You ended this connection." A blocked pair sees a closed shell with no content (2.9).

### 2.5 What each side can do, by state

| | Active | Ended |
| --- | --- | --- |
| **Client** | Message, propose or answer sessions, see looks (sent ones), rate a look and say they wore it, change what the stylist can see, change the name shown, end, report, block | Read looks, sessions and the last 30 days of messages. Nothing else. Report and block remain |
| **Stylist** | Message, propose or answer sessions, write drafts and send looks (items only from the shared closet), browse the shared closet while a grant is active, end, report, block | Read their own looks and sessions and the last 30 days of messages. Nothing about the client's closet |

A stylist **never** sees: whether a grant was revoked rather than expired or changed (they see only "not shared"; turning sharing off writes no message and moves nothing in their list), why a connection ended, or anything about the client beyond the chosen name, the shared closet while granted, the client's messages, feedback and sessions.

### 2.6 Sharing (grant) states

`none` -> `active` (client turns the closet on; expires 90 days later) -> `none` (client turns it off, the grant expires, the connection ends, or the pro switch goes off). A client can change the pieces of an active grant (all/selected) at any time and the original expiry is kept; **renewing is an explicit act** (the "Keep sharing" button, `p_renew`) that sets a new 90 days. Every change appends one row to `pro_grant_events` (granted, changed, renewed, revoked, expired, connection ended), which only the client can read. A banner warns the client 7 days before expiry. Turning sharing off never needs a text version, a current terms version or a switched-on feature (4.1).

### 2.7 Look states

`draft` (only the stylist sees it) -> `sent` (client can see it) -> `viewed` (the client opened it) -> `implemented` (the client said they wore it). Feedback (rating 1-5 and a comment of up to 500 characters) can be given once the look is `sent` and edited by the client at any time. A sent look cannot be edited or deleted by the stylist (a typo means sending a new one); a draft can be edited and deleted. Looks end with the connection (90 days, 8). A client never sees a draft: for them a draft is as if it did not exist (`pro_unavailable`).

### 2.8 Session states

| From | Event | By | To |
| --- | --- | --- | --- |
| (none) | propose | either | proposed (`proposed_by` = role) |
| proposed | confirm | the other side | confirmed |
| proposed | decline | the other side | declined |
| proposed or confirmed | cancel (before it starts) | either | cancelled |
| proposed | start time passes | system (lazy) | expired |
| confirmed | end time passes | system (lazy) | completed |

Confirming checks that the **stylist** has no other confirmed session overlapping it (`appointment_conflict`). A session carries a start (timestamp with zone), a length (15 to 480 minutes, in steps of 15), a mode (`virtual` or `in_person`), a short place text and a short note. **No fee, price, paid flag or link field exists.**

### 2.9 When things change under a connection

| What happens | Connection | Sharing | Sessions and looks | What people see |
| --- | --- | --- | --- | --- |
| Either person ends it | ended | Grant deleted | Open sessions cancelled; looks kept for 90 days | "You ended this connection" / "This connection has ended" |
| One blocks the other (through Stylists, Friends or Swap: `user_blocks` is shared) | ended (`ended_by` = the role of the blocker) | Deleted | The connection's **messages, looks, sessions, view counters and grant events are deleted at once** | Both keep a **closed shell**: label "Former stylist" / "Former client", no messages, looks or sessions, no actions. Never the word "blocked". The shell is **stored on the connection** (`shell_at`), not worked out from the block list, so unblocking changes nothing and never reveals the block or brings content back |
| Stylist closes the profile | ended (`stylist`) | Deleted | Cancelled; the client keeps looks and session records 90 days | "This connection has ended" (the label stays while the stylist's account exists; "Former stylist" once it is deleted) |
| Stylist is suspended | ended (`system`) for all their connections | Deleted | Cancelled | The stylist sees "Professional features are paused on your account"; clients see "This connection has ended" |
| Client deletes the account | ended (`system`); the client side is null | Deleted | **Looks and sessions of the connection deleted** (they hold personal details); messages the client sent are deleted | Stylist keeps a stub "Former client" with dates for 90 days |
| Stylist deletes the account | ended (`system`); the stylist side is null | Deleted | Client keeps the **sent** looks and session records for 90 days; the stylist's messages and **unsent draft looks** are deleted | "Former stylist" |
| Server switch `pro_enabled` goes false | unchanged | **Reads stop immediately** (closet and photos refuse) | | "Professional features are paused" everywhere. Stopping sharing, ending, blocking, reporting, unblocking and export keep working (4.1) |
| Client's closet piece is deleted | unchanged | Removed from a "selected" grant by cascade | A look keeps the piece's name, marked "no longer in the closet" | |
| Terms version bumps | unchanged | unchanged | | The person is asked to accept before any further action that creates or reads content. **Withdrawal and safety actions never need terms** (stop sharing, end, block, report, export, close the profile), so a client can always switch sharing off, and an old build shows "Update SmartCloset" and still offers them. The stylist's `get_client_closet` is gated by the stylist's own terms and by the live grant, and nothing the client's terms say can stop the client from closing that grant |
| Invite code is leaked and redeemed by a stranger | A new connection appears on the stylist's list | None | | The stylist can end it; the 25-client cap and probation cap bound the damage |

**The closed shell is not claimed to look like a deleted account.** A stylist who deletes their account leaves the client the looks already sent (8.1), while a blocked person sees a shell with no content, so the two can be told apart. The promise is narrower and can be kept: nothing says "blocked", nothing changes when the blocker unblocks, and the blocked person's reads return the same fixed shell every time. A person who is blocked may guess; they are never told.

---

## 3. Data model and migrations

The SQL shapes that need exactness are in Appendix B. This section is the map: files, rules, tables, what happens to the old tables, and how to get from the live database to the new one safely.

### 3.1 Files, in the order they are applied

**Versions.** `supabase db push` records each file under its version (the digits before the first underscore, the primary key of its history table) and **skips a file whose version is older than the newest one already applied** unless `--include-all` is passed (the header of `20261015000600_drop_legacy_friend_wardrobe_policy.sql` says so). The digits `20261023000000` to `20261023000700` below are therefore **working versions**. They sort after everything that exists on the day of writing (the newest file is `20261021000000_item_images.sql`; ratings use `20261014000000-399`, swaps `20261015000000-500`), but the remote head advances by wall-clock versions, as the released `20261019204430_wardrobe_images_private.sql` shows, so by release day they may be older than the head. They are replaced at release by the recipe of 11.1 (P0, P1, P3): read the remote head with `supabase migration list`, take `v = max(now UTC as YYYYMMDDHHMMSS, newest local or remote version + 1)`, rename the eight files to `v`, `v+1`, ... `v+7` in the same order, and commit the rename on its own. What identifies a file is the name after the first underscore and its position in the list below, never its digits. `__tests__/migrationVersions.test.ts` gains a pro check that asserts the eight names, their relative order, that every one is later than every non-pro file in the folder, and that none shares a version, with **no hard-coded date range**, so it passes both before and after the rename (9.3). One file per concern:

| # | File | Contents | Needs | Stream |
| --- | --- | --- | --- | --- |
| 1 | `20261023000000_pro_lockdown_legacy_tables.sql` | `revoke all` on the nine legacy pro tables from `public`, `anon`, `authenticated`, each guarded by `to_regclass` (a table that does not exist is skipped). Changes nothing else. Can ship alone (P1); if it does, files 2-8 are re-versioned right after, before any later push (11.1) | existing | PDB1 |
| 2 | `20261023000100_pro_foundation.sql` | All fifteen tables with their constraints and indexes (an index on every foreign key, 3.3 rule 11); the row-security-and-revoke loop; config seeds (`pro_enabled` = `false`); helpers (`pro_raise`, `pro_cfg`, `pro_limit`, `pro_rate_check`, `pro_text_ok`, `pro_require_text`, `pro_gate`, `pro_new_code`, `pro_norm_code`, `pro_clean_name`, `pro_name_ok`, `pro_clean_list`, `pro_clean_materials`, `pro_clean_season`, `pro_photo_path`, `pro_lock_users`, `pro_invites_held`, `pro_report_is_qualified`, `pro_can_read_closet`); the ending functions (`pro_end_connection`, `pro_end_between`, `pro_shell_connection`); triggers `pro_on_block` and `pro_on_member_left`; `user_blocks.via_pro` and its two recreated policies | 1 | PDB1 |
| 3 | `20261023000200_pro_upkeep.sql` | `pro_meta` use: `pro_refresh(uid)` (per-member lazy upkeep; never raises; repairs connections an account deletion left half done) and `pro_janitor(force)` (global retention in bounded deletes, throttled to 15 minutes). It sits with PDB1 because the list and status functions of files 4 and 5 call it, so PDB1's scenarios run without PDB3 | 2 | PDB1 |
| 4 | `20261023000300_pro_profiles_invites.sql` | `get_pro_status`, `get_pro_badge`, `accept_pro_terms`, `get_my_stylist_profile`, `save_stylist_profile`, `set_stylist_accepting`, `close_stylist_profile`, `create_pro_invite`, `list_my_pro_invites`, `revoke_pro_invite`, `preview_pro_invite`, `redeem_pro_invite` | 2, 3 | PDB1 |
| 5 | `20261023000400_pro_connections.sql` | `list_pro_connections`, `get_pro_connection`, `end_pro_connection`, `set_pro_alias` | 2, 3 | PDB1 |
| 6 | `20261023000500_pro_sharing.sql` | `get_pro_grant`, `set_pro_grant`, `get_client_closet`, and `pro_photo_source` (service role only, called by the `pro-photo` edge function). **No storage policy** | 2-5 | PDB2 |
| 7 | `20261023000600_pro_work.sql` | Looks (`save_pro_recommendation`, `send_pro_recommendation`, `delete_pro_recommendation`, `list_pro_recommendations`, `get_pro_recommendation`, `give_recommendation_feedback`), sessions (`propose_pro_appointment`, `respond_pro_appointment`, `cancel_pro_appointment`, `list_pro_appointments`), messages (`send_pro_message`, `get_pro_thread`) | 2-6 | PDB2 |
| 8 | `20261023000700_pro_moderation.sql` | Widened `content_reports` checks; `report_swap_content` re-created with the **same signature and grants** and its evidence built under a byte budget (the one existing function this release replaces, 4.6 group 9); `pro_chat_evidence`; `report_pro_content`, `block_pro_member`, `list_pro_blocks`, `unblock_pro_member`, `export_my_pro_data`; admin functions (`pro_set_enabled`, `pro_admin_approve_stylist`, `pro_admin_suspend`, `pro_admin_unsuspend`, `pro_admin_hold_stylist`, `pro_admin_release_stylist`, `pro_admin_remove_stylist`, `pro_admin_restore_stylist`); `pro_report_backlog`, `pro_send_report_digest`; views `pro_moderation_queue`, `pro_review_queue` | 2-7 | PDB3 |

**Held, never applied by `db push`** (`supabase/held/`, same rule as swap.md 4.1): `purge_legacy_pro_tables.sql` (owner PDB1). It deletes every row of the nine legacy tables (`delete from public.<t> where <pk> is not null`, one statement per table, each guarded by `to_regclass`) for the case where the read-only check of 3.2 finds tester rows that hold third-party names, emails or phones. It is released only by the owner's decision (11.2, question 3), by the release command of swap.md 4.1. `__tests__/migrationVersions.test.ts` accepts it in release form `<14 digits>_purge_legacy_pro_tables.sql` and rejects a second copy.

Every file is idempotent (`if not exists`, `create or replace`, `drop ... if exists` then `create`, `on conflict do nothing`, and `do` blocks guarded by `pg_constraint` / `to_regclass`), is safe to run twice, and contains no `UPDATE` or `DELETE` without a top-level `WHERE`.

### 3.2 The safe path on the live database

The live database is believed to hold the legacy pro tables **empty** (no shipped build wrote to them after the screens were hidden; builds before 2026-10-04 could have written to four of them). Believed, not proved: step 1 proves it.

1. **Read-only checks** (SQL in 11.1, step P0): which of the nine legacy tables exist, their columns and policies, their row counts, `to_regclass('public.profiles')`, the remote migration head, the bucket flag and every policy on `storage.objects`, and the sign-up settings (anonymous sign-ins, email confirmation). If any table holds rows, stop and take the owner's decision (11.2, question 3) before step 4.
2. **Lock the legacy tables.** File 1 revokes all privileges on the nine tables from `anon` and `authenticated`. It leaves the tables, their rows, their policies and their row-level-security flag in place, so `supabase/audit.sql` (which lists four of them) and `delete_user_account()` (which deletes from eight of them by name and reaches `stylist_profiles` through the `auth.users` cascade) keep working, and nothing is lost. Effect: the open surface of section "Status and provenance", correction 1, is closed. Installed builds are unaffected, because nothing reachable calls those tables. This file can be pushed on its own, today, as a stop-gap, if the owner wants the exposure closed before the feature is ready (11.1, P1). Pushing it alone moves the remote head, so files 2-8 are re-versioned right after (11.1, P1).
3. **Re-version, then push all eight files together** (11.1, P3: the rename recipe of 3.1, then `supabase db push --dry-run` must list exactly the eight files of 3.1 and nothing else, no `--include-all`). The seven new files add objects only: no existing table is dropped or altered except `user_blocks` (one new column, two recreated policies) and `content_reports` (three widened checks), and the only existing function replaced is `report_swap_content` (file 8: same signature and grants, evidence built under a byte budget). Because `pro_enabled` is seeded **false**, a push never turns anything on; nothing reachable by an app user works until the owner switches it on (11.1, P6).
4. **Only if step 1 found rows:** the owner releases the held purge (3.1), then the lead re-runs the checks of step 1 and expects zero rows.
5. **Verify** (read-only, then the rolled-back scenarios): as a signed-in test user, `GET /rest/v1/stylist_profiles` and `GET /rest/v1/pro_members` both fail with a permission error; `scripts/run-pro-sql-tests.sh p7_catalog` passes; `to_regclass('t.log')` is null afterwards.
6. **Rollback is a switch, not a migration:** `select public.pro_set_enabled(false);` pauses every pro function and stops closet reads at once. The lockdown is never rolled back: it only removes access nothing legitimate uses.
7. **Later (not part of this release):** a clean-up migration drops the nine legacy tables, but only in the same file that redefines `delete_user_account()` without them and with a deletion scenario in the same change. Dropping first would make every account deletion fail (the lesson of `20261015000000_styling_recommendations_if_missing.sql`).

### 3.3 Rules every object follows

1. Row level security is **on** for all fifteen pro tables and **every privilege is revoked** from `public`, `anon` and `authenticated` in one `do` loop over a literal list; the identity sequences (`pro_messages_id_seq`, `pro_grant_events_id_seq`) are revoked too. There are **no policies** on pro tables. App users reach pro data only through functions.
2. Every function pins `search_path = public`. Client functions are granted to `authenticated` only and **explicitly revoked from `public` and `anon`** (Supabase grants execute to `anon` on new functions by default). Internal helpers and triggers are revoked from everyone but the owner. Admin functions and `pro_photo_source` are granted to `service_role` only (an app user could otherwise read a storage path). A catalogue scenario (`p7_catalog`) and a migration-text Jest test assert the exact lists (4.6 is the list).
3. Every foreign key to `auth.users` is `ON DELETE CASCADE`, **except** `pro_connections.stylist_id` and `pro_connections.client_id`, which are `ON DELETE SET NULL` on purpose so the other person keeps a labelled record for 90 days (8). `delete_user_account()` needs no change.
4. Client functions never return an account id, an email, a phone number, a price, a note, tag text, an estimated value, wear data or **a storage path** (`<account id>/<file>` carries the owner's account id; only the owner of a photo ever receives its path). A Jest test inspects every `returns table` list and jsonb key list for forbidden words and for the shape `<uuid>/<file>` (9.3). The only path-carrying outputs are `list_pro_recommendations.cover_photo_path` and the `photoPath` of `get_pro_recommendation` items, which return the **client's own** path to the client and are null / omitted for a stylist; the test allows exactly those two names and asserts that they are empty in every stylist-side call.
5. Failure vocabulary is small and stable (4.4). Not found, not visible, not a participant, blocked, gone and expired are all `pro_unavailable`, except where a person must be told a plain fact about their own state (`connection_ended`, `closet_not_shared`).
6. Every limit lives in `pro_limit(name)` and `src/config/proRules.ts` mirrors it (a Jest test compares them).
7. Functions with a `returns table (...)` list begin with `#variable_conflict use_column`.
8. Identity of the other person is a label computed by the server: a stylist's `display_name` (filtered, 2-40 characters), a client's chosen `client_alias` (filtered, 2-30 characters). `friend_display_name()` is never used (it falls back to the part of an email before the `@`).
9. Dependencies on swap's own functions and tables are exactly two, both read-only: `swap_fold_text(text)` (the pure folding function) and the table `swap_blocked_terms` (so moderators load one term list for both features). Pro does not call `swap_raise`, `swap_limit`, `swap_gate`, `swap_text_ok` or any other swap table, so the swap catalogue tests (`s6_catalog`, `swapMigrations.test.ts`, which match swap's function names and its own file list) and the pro ones stay independent. Pro also builds on three things the swap migrations added to shared objects, so files 1-8 of 3.1 must sort after them (they do): `are_friends(uuid, uuid)` (called by `block_pro_member`), `user_blocks.via_swap` and `user_blocks.ref`, and the `ref_type`, `ref_id`, `evidence`, `reviewed_at` and `outcome` columns of `content_reports`.
10. File 8 re-creates `report_swap_content` (evidence budget only). It is the one existing function this release replaces; the swap SQL suites and `swapMigrations.test.ts` run after it, and re-running the earlier swap files would restore the old body (the same caveat as B.7).
11. Every foreign key has an index whose leading column is the key column (a `p7_catalog` check), so a cascade, a `SET NULL` or an account deletion never scans a table.

### 3.4 Tables

All columns are `not null` unless marked `null`. All ids are `uuid default gen_random_uuid()` unless marked. `created_at` / `updated_at` are `timestamptz default now()`; `updated_at` is set by the functions, not by a trigger.

**`pro_config`** (switches and versions). `key text primary key`, `value jsonb`, `updated_at`. Seeded (`on conflict do nothing`): `pro_enabled` = **`false`**, `stylist_terms_version` = `"2026-10"`, `client_terms_version` = `"2026-10"`, `share_text_version` = `"2026-10"`, `min_account_age_hours` = `48`. Changed by the owner with `pro_set_enabled` (the switch; turning it **on** is refused until at least 50 content terms are loaded into `swap_blocked_terms`, the rule of `swap_set_community_enabled`) or the dashboard (versions). The row name `directory_enabled` is reserved for Phase 2 and is **not** seeded now.

**`pro_meta`** (one row). `id boolean primary key default true check (id)`, `last_janitor_at timestamptz null`. Seeded `(true)`. Every update uses `where id`.

**`pro_members`** (a person who has accepted something, and the sanctions that belong to the person). `user_id` pk -> `auth.users` cascade; `adult_confirmed_at null`; `stylist_terms_version null`, `stylist_terms_accepted_at null`; `client_terms_version null`, `client_terms_accepted_at null`; `suspended_at null`, `suspended_reason null` (<= 200 chars); **`stylist_approved_at null`** (probation lifted); **`invites_held_at null`** and **`invites_held_by null`** check in (`system`, `admin`) (a `system` hold releases itself after `hold_release_days`, an `admin` hold never does; `pro_invites_held()` is the one place that decides); **`stylist_removed_at null`**, **`stylist_removed_reason null`** (<= 200 chars); `created_at`, `updated_at`. Check: `(invites_held_at is null) = (invites_held_by is null)`. These columns live here and not on `pro_stylists` because `close_stylist_profile` deletes the profile row: a sanction or an approval stored there could be undone in two calls (close, then save). Created by the first `accept_pro_terms`. No date of birth is stored.

**`pro_stylists`** (the profile). `user_id` pk -> `auth.users` cascade; `display_name text` check `char_length between 2 and 40 and display_name = btrim(display_name)`; `headline text default ''` check `<= 80`; `bio text default ''` check `<= 500`; `services text[]` check `cardinality between 1 and 7` and every element in the closed list (`wardrobe_audit`, `personal_shopping`, `outfit_styling`, `color_analysis`, `event_styling`, `virtual_sessions`, `in_person_sessions`) enforced by the function and by a check using `services <@ array[...]`; `languages text[] default '{}'` check `cardinality <= 5` (each element two lowercase letters, enforced by the function); `rates_text text default ''` check `<= 120`; `accepting_clients boolean default true`; `created_at`, `updated_at` (approval, holds and removal are columns of `pro_members`, above). No email, phone, website, handle, address, location, photo, credential, rating, verified flag or count column exists, and none is ever added without its own migration, consent text and privacy review.

**`pro_invites`**. `stylist_id` -> `auth.users` cascade; `code text` unique, check `code ~ '^[0-9A-HJKMNP-TV-Z]{10}$'` (Crockford base32, 4.5); `label text null` check `<= 40` (the stylist's private reference, **never returned to the client**); `status text default 'live'` check in (`live`, `used`, `revoked`); `expires_at`; `client_ref uuid`; `created_at`; `used_at null`; `revoked_at null` (set by `revoke_pro_invite`; retention counts from it, 3.7). Unique `(stylist_id, client_ref)`. Index `(stylist_id, status)`. A live invite whose `expires_at` has passed is treated as expired by every function; the row is deleted by the janitor 30 days later.

**`pro_connections`**. `stylist_id uuid null` and `client_id uuid null`, both -> `auth.users` **on delete set null**; `stylist_label text null` check `<= 40` (copy of the stylist's display name, kept in step by `save_stylist_profile`, nulled when the stylist account is deleted); `client_alias text null` check `<= 30` (the name the client chose to show, nulled when the client account is deleted); `status text default 'active'` check in (`active`, `ended`); `ended_by text null` check in (`client`, `stylist`, `system`) (the role of whoever ended it or blocked; `system` for a suspension or a deleted account); `started_at`; `ended_at null`; `invite_id uuid null` -> `pro_invites` on delete set null; `shell_at timestamptz null` (set when a block turns the connection into a closed shell, 2.9; never cleared); `stylist_seen_message_id bigint default 0`; `client_seen_message_id bigint default 0` (read pointers; there are no read receipts); `last_activity_at`; `created_at`; `updated_at`. Checks: `(status = 'ended') = (ended_at is not null)`; `shell_at is null or status = 'ended'`; `stylist_id is distinct from client_id or stylist_id is null`. Unique partial index `pro_connections_one_active (stylist_id, client_id) where status = 'active'`. Indexes `(client_id, status)`, `(stylist_id, status)`, `(ended_at) where status = 'ended'`, `(invite_id) where invite_id is not null` (the janitor's invite deletes run the `ON DELETE SET NULL`).

**`pro_grants`** (what a client currently lets a stylist see). `connection_id` -> `pro_connections` cascade; `scope text` check in (`closet`); `item_mode text` check in (`all`, `selected`); `granted_at`; `expires_at`; `text_version text` (the consent text the client saw); primary key `(connection_id, scope)`. A row exists only while the grant is on; turning it off deletes the row (and writes an event).

**`pro_grant_items`** (the chosen pieces when `item_mode = 'selected'`). `connection_id` -> `pro_connections` cascade; `item_id` -> `clothing_items(id)` **cascade** (a deleted piece leaves the grant); primary key `(connection_id, item_id)`; index `(item_id)`. At most 500 rows per connection (function-enforced).

**`pro_grant_events`** (append-only log the client can read). `id bigint generated always as identity` pk; `connection_id` cascade; `scope`; `event text` check in (`granted`, `changed`, `renewed`, `revoked`, `expired`, `connection_ended`); `item_mode null`; `item_count int null`; `text_version null`; `created_at`. Index `(connection_id, id desc)`. Never updated.

**`pro_closet_views`** (counts only, shown to the client). `connection_id` cascade; `day date`; `pages int default 0`; `last_at`; primary key `(connection_id, day)`. Deleted 90 days after the day.

**`pro_recommendations`** (looks). `connection_id` cascade; `title text` check `char_length between 1 and 80 and title = btrim(title)`; `body text default ''` check `<= 1000`; `status text default 'draft'` check in (`draft`, `sent`, `viewed`, `implemented`); `sent_at null`, `viewed_at null`, `implemented_at null`; `client_rating smallint null` check `between 1 and 5`; `client_comment text null` check `<= 500`; `feedback_at null`; `client_ref uuid null`; `created_at`, `updated_at`. Checks: `(status = 'draft') = (sent_at is null)`. Unique `(connection_id, client_ref) where client_ref is not null`. Index `(connection_id, status, updated_at desc)`. There is no author column: the author is always the connection's stylist side.

**`pro_recommendation_items`**. `recommendation_id` cascade; `position smallint` check `between 1 and 12`; `item_id uuid null` -> `clothing_items(id)` **on delete set null**; `name text` check `<= 120` (a copy at the time of writing, `left(btrim(name), 120)`, because `clothing_items.name` has no length limit); `category text null` check `<= 40` (`left(category, 40)`); primary key `(recommendation_id, position)`; index `(item_id) where item_id is not null` (every deletion of a closet piece, by anyone, runs the `ON DELETE SET NULL`). Nothing else about the piece is copied.

**`pro_appointments`** (sessions). `connection_id` cascade; `proposed_by text` check in (`stylist`, `client`); `status text default 'proposed'` check in (`proposed`, `confirmed`, `declined`, `cancelled`, `expired`, `completed`); `starts_at timestamptz`; `duration_minutes smallint` check `between 15 and 480 and duration_minutes % 15 = 0`; `mode text` check in (`virtual`, `in_person`); `place text default ''` check `<= 120`; `note text default ''` check `<= 280`; `utc_offset_minutes smallint default 0` check `between -720 and 840 and utc_offset_minutes % 15 = 0` (the proposer's offset from UTC at the start, in minutes east of UTC: +60 for UTC+1. A display hint, so the other person can read the time on the proposer's clock. **Never a zone name**: `Europe/London` is a city, an offset is not); `client_ref uuid null`; `responded_at null`; `created_at`, `updated_at`. Unique `(connection_id, proposed_by, client_ref) where client_ref is not null`. Indexes `(connection_id, starts_at)` and `(starts_at) where status in ('proposed','confirmed')`. The end of a session is computed (`starts_at + duration_minutes * interval '1 minute'`), not stored.

**`pro_messages`**. `id bigint generated always as identity` pk; `connection_id` cascade; `sender_id uuid null` -> `auth.users` **cascade** (so a deleted person's messages go); `kind text` check in (`text`, `system`); `body text default ''` check `<= 500`; `code text null` (system line: `connected`, `ended`, `sharing_on`; system lines never count as unread or toward the badge); `client_ref uuid null`; `created_at`. Checks: `kind <> 'text' or (sender_id is not null and char_length(btrim(body)) between 1 and 500)`; `kind <> 'system' or code is not null`. Unique `(sender_id, client_ref) where client_ref is not null`. Indexes `(connection_id, id)` and `(sender_id) where sender_id is not null` (account deletion runs `DELETE ... WHERE sender_id`).

**`pro_rate_counters`**. `user_id` cascade, `bucket text`, `window_start timestamptz`, `n int default 0`, primary key `(user_id, bucket, window_start)`. Deleted after 2 days.

### 3.5 Existing objects that are touched

| Object | Change | Why it is safe for old builds |
| --- | --- | --- |
| The nine legacy pro tables | `revoke all` from `anon`, `authenticated`, `public` (file 1) | Nothing reachable uses them |
| `user_blocks` | `add column if not exists via_pro boolean not null default false`; the two client policies recreated as `... and not via_swap and not via_pro` | No existing row has `via_pro = true`; older builds see what they saw. Pro blocks are listed only by `list_pro_blocks()` under an opaque `ref` (the `ref` column and unique index already exist from swaps), so the old "Blocked people" list can never reveal a stylist's or client's account id |
| `content_reports` | Three `check` constraints dropped and re-added with **all existing values plus the pro ones** (6.4, Appendix B.7); no column added (`ref_type`, `ref_id`, `evidence`, `reviewed_at`, `outcome` exist from swaps) | `report_user()` and `report_swap_content()` keep working: every value they write stays allowed |
| `report_swap_content()` | Re-created in file 8 with the same signature, grants and behaviour; only its evidence is now built under a byte budget (4.6 group 9), because 30 long non-ASCII messages exceed the table's 20,000-byte check and make the report fail | Same arguments and results; nothing else about it changes. The evidence keys it writes today stay as they are (`messages[].from`, `id`, `body`, `code`, `at`, `flaggedMessageId`, `status`, `closedReason`, `pairKind`, `createdAt`, `items`; `s5_moderation_community` reads `from` and `flaggedMessageId`) |
| `supabase/audit.sql` | One new check that the nine legacy tables have no `anon`/`authenticated` grants, written as a `with` clause of its own and not added to `user_owned_tables` | The list of ten owner tables is unchanged (`qualityRatingsMigration.test.ts` pins it at ten names and still passes) |
| `supabase/config.toml` | One new block, `[functions.pro-photo]` with `verify_jwt = true` (stream PPH) | Additive; the other blocks are untouched |
| `user_blocks` (trigger) | `pro_on_block` after insert, never raises | Cannot make a block fail |
| `delete_user_account()`, `block_user()`, `report_user()`, `get_friend_closet()`, `find_user_by_email()` | **Not replaced** | A catalogue check asserts their sources are unchanged |

`find_user_by_email` is **never used** for pro. It confirms whether an email has an account and hands out an id; invites are codes, so a stylist cannot learn who is on SmartCloset.

### 3.6 What happens to the old tables (001 and the guide)

| Legacy table | Fate | Replaced by |
| --- | --- | --- |
| `stylist_profiles` | **Kept, locked.** Not dropped | `pro_stylists` |
| `stylist_clients` | Kept, locked | `pro_connections` (clients are always real accounts; no stylist-typed records) |
| `appointments` | Kept, locked | `pro_appointments` |
| `recommendations` | Kept, locked | `pro_recommendations`, `pro_recommendation_items` |
| `styling_recommendations` (hand-made on the live project) | Kept, locked | the same |
| `message_threads`, `messages` | Kept, locked | `pro_messages` (the thread is the connection) |
| `booking_requests` | Kept, locked | Phase 2 connection state `requested` |
| `stylist_reviews` | Kept, locked | Phase 2 |
| `public.profiles` (guide only; may not exist) | **Not touched.** Checked read-only (11.1). The server never treats `profiles.account_type` as proof of a role | |

**Summary: kept, all nine; altered, none (privileges only); replaced in function, all nine; dropped, none in this release** (the drop is the Phase 3 clean-up of 11.3).

The mismatch between `001_initial_schema.sql` and `documentation/SUPABASE_MIGRATION_GUIDE.md` (which define the same names differently) does not matter, because no pro function reads these tables. Whichever shape the live tables have, they are closed.

### 3.7 Retention (enforced by the upkeep job, stated in the policy as "about")

| What | Gone |
| --- | --- |
| A message | 180 days after it was sent; **30 days after its connection ended** |
| An ended connection and everything under it (looks, sessions, grant events, view counters) | 90 days after it ended |
| A used or revoked invite; an expired live one | 30 days after it was used, revoked or expired |
| Closet view counters | 90 days after the day |
| The content of a closed shell (messages, looks, sessions, view counters, grant events) | the moment of the block (2.9) |
| Rate counters | 2 days |
| An expired grant row | at the member's next read (an event is written) |
| A report and its evidence | with either account (existing rule), as for swaps |
| Everything of a member | when they delete their account (8) |

---

## 4. Server interface

This section is the contract between the database streams and the client streams. Names, argument names, return columns and error messages are fixed here; changing one after release breaks installed builds.

### 4.1 Conventions

- Every client function is `language plpgsql security definer set search_path = public`. The first statements are, in order: `uid := auth.uid()`, the gate (`pro_gate`), validation, the rate check, then the work. A raise rolls the whole call back, including its counter increment, so only successful actions are counted; the two invite-code lookups are the exception (below).
- Arguments are `p_`-prefixed and **named**; optional ones have defaults, required ones have none. No overloads.
- **Lists** return `returns table (...)` with snake_case columns (mapped by `proService.ts`). **Single objects** return `jsonb` with camelCase keys. Timestamps are ISO strings from `timestamptz`.
- Creating calls take a required `p_client_ref uuid` and are idempotent on it: a retry with the same ref returns the existing row. The app makes the ref once per attempt (`newClientRef()`) and reuses it on retry. A create is `insert ... on conflict (<columns>) where client_ref is not null do nothing` followed by a select of the existing row (the unique indexes on `client_ref` are partial, so the conflict target must repeat their predicate or Postgres refuses it), so a retry racing the original never surfaces a `23505`. **State changes are idempotent too**: asking for the state a row is already in returns success (confirm on a confirmed session, decline on a declined one, cancel on a cancelled one, send on a sent, viewed or implemented look); `appointment_closed` and `recommendation_locked` are raised only for a conflicting state. An `UPDATE` that touches no row where one was expected raises; it is never silent.
- A function that reads or changes a connection first finds the caller's side (`stylist` if `stylist_id = uid`, `client` if `client_id = uid`, else `pro_unavailable`), then applies the gate for that role. **Gate levels** (4.5): `safety` (signed in and not anonymous; nothing else), `member` (plus the switch and no suspension), `client`, `stylist_setup`, `stylist`. **Every way out uses only `safety`**: `end_pro_connection`, `block_pro_member`, `report_pro_content`, `list_pro_blocks`, `unblock_pro_member`, `export_my_pro_data`, `close_stylist_profile`, `get_pro_grant`, and `set_pro_grant` when `p_enabled = false`; so do the reads that describe a connection itself (`list_pro_connections`, `get_pro_connection`) and **every read of an ended connection's history** (thread, looks, sessions). They still require the caller to be a participant (for the invite forms, to hold the invite) and they ignore terms, the adult attestation, the kill switch, a suspension and the build's version: an old app, a stale terms version, a paused feature or a suspension can never trap a person who wants to stop sharing, leave, block, report or take their data. `set_pro_grant` with `p_enabled = false` never needs `p_text_version` and is not rate limited (withdrawing consent is as easy as giving it). When the role's own gate would refuse (switch off, suspended, terms stale, no stylist profile), `get_pro_connection` still answers, with `safetyOnly = true` and reduced `actions`, and `list_pro_connections` returns no message previews, so the app can show what is shared and offer Stop sharing, End, Report and Block.
- A connection with `shell_at` set (a block, 2.9) reads as a **closed shell**: status `ended`, label `Former stylist` or `Former client`, no profile, no messages, looks or sessions (they were deleted when the shell was set), all `actions` false. The decision is read from the stored column on every path (`list_pro_connections`, `get_pro_connection`, thread, looks, sessions, including the lists called without a connection), never recomputed from `user_blocks`, so unblocking changes nothing. Writes answer `connection_ended`.
- Reads that return lists run `pro_refresh(uid)` first (3.7, 4.5); it never raises.
- **Locking.** A write to a connection starts with `select ... from pro_connections where id = p_connection for update` and re-checks `status = 'active'` (a write that races an end, block or suspension is refused with `connection_ended` and never lands after it; grants, looks, sessions and messages are all connection writes). Functions that count a cap before inserting (`create_pro_invite`, `save_pro_recommendation` on create, `propose_pro_appointment`, `set_pro_grant`) first take `pro_lock_users(uid, uid)`, so two parallel calls from one person see each other's rows. Functions that change what a redeem decides on (`revoke_pro_invite`, `close_stylist_profile`, `set_stylist_accepting`, `save_stylist_profile`, and the admin hold, release, suspend, remove and restore) take `pro_lock_users(stylist, stylist)`; `redeem_pro_invite` takes `pro_lock_users(stylist, client)`, so a redeem can neither overtake nor interleave with them. **A block takes the same pair lock**: `block_pro_member` does, and so does the `pro_on_block` trigger (4.5), so a block made through Friends or Swaps cannot commit between a redeem's block check and its insert and leave an active connection between a blocked pair. Whichever comes second sees the other; there is no deadlock, because a redeem never holds a `user_blocks` row lock while it waits.
- **Failures that are results.** `preview_pro_invite` and `redeem_pro_invite` return `{ "valid": false, "error": "invite_invalid" }` and `{ "ok": false, "error": "invite_invalid" }` (HTTP 200) for every failure of the code itself, **after** the rate counter has been incremented, so failed lookups are counted: a `raise` would roll the increment back and the brute-force limit would only ever count valid codes. Everything else (gates, the rate limit, caps, text filters) raises. `proService` turns these two results into `ProError('invite_invalid')`.
- **Grants, per file.** Each migration ends with one `do` block over the functions it created, with a literal list: client functions of 4.6 get `revoke all on function ... from public, anon` then `grant execute ... to authenticated`; internal helpers and trigger functions (4.5) get `revoke all ... from public, anon, authenticated` (file 2: `pro_raise`, `pro_cfg`, `pro_limit`, `pro_rate_check`, `pro_text_ok`, `pro_require_text`, `pro_gate`, `pro_new_code`, `pro_norm_code`, `pro_clean_name`, `pro_name_ok`, `pro_clean_list`, `pro_clean_materials`, `pro_clean_season`, `pro_photo_path`, `pro_lock_users`, `pro_invites_held`, `pro_report_is_qualified`, `pro_can_read_closet`, `pro_end_connection`, `pro_end_between`, `pro_shell_connection`, `pro_on_block`, `pro_on_member_left`; file 3: `pro_refresh`; file 8: `pro_chat_evidence`); the admin functions, `pro_photo_source` and the views of 4.7 get `revoke ... from public, anon, authenticated` then `grant ... to service_role` (this includes `pro_janitor`). No pro function is granted to `authenticated` that the app does not call as an RPC. The Jest migration tests parse these lists and compare them with 4.6 and 4.7.

### 4.2 Config rows and switches

| Row (`pro_config`) | Seed | Effect |
| --- | --- | --- |
| `pro_enabled` | `false` | The kill switch, **off until the owner turns it on**. `false`: every client function except `get_pro_status`, `get_pro_badge` and the `safety` functions of 4.1 raises `pro_disabled`; `get_client_closet` and `pro_photo_source` refuse at once; nothing is deleted. The app shows "Professional features are paused" and a safety-only list (7.8). `pro_set_enabled(true)` raises (55000) until at least 50 content terms are in `swap_blocked_terms`; it is switched on at P6 and left on (11.1) |
| `stylist_terms_version` | `"2026-10"` | Must equal `PRO_STYLIST_TERMS_VERSION` in `proRules.ts` (Jest compares them) |
| `client_terms_version` | `"2026-10"` | `PRO_CLIENT_TERMS_VERSION` |
| `share_text_version` | `"2026-10"` | The version of the closet-sharing consent text; `set_pro_grant` refuses a stale one when enabling (never when disabling). `PRO_SHARE_TEXT_VERSION` |
| `min_account_age_hours` | `48` | Applies only to `create_pro_invite` (a stylist reaching other people). Clients may be brand new. For the two-phone walkthrough and the App Review demo accounts the lead sets it to `0` and back (11.1, P6, P7) |
| `directory_enabled` | *not seeded* | Reserved for Phase 2 (11.3) |

Switch: `select public.pro_set_enabled(false);` (service role, SQL editor). Bumping a terms version is a dashboard `update public.pro_config set value = '"2026-11"' where key = 'client_terms_version'` plus a new build whose `proRules.ts` carries the new text; between the two, every build shows "Update SmartCloset to keep using professional features" and records nothing (7.5); that screen still offers Stop sharing, End connection, Report and Block, which need no terms (4.1).

### 4.3 Limits: `pro_limit(name)`

One immutable `CASE` function, mirrored by `PRO_LIMITS` in `proRules.ts` and compared by `proRulesInStepWithSql.test.ts` (which regex-parses `when '(\w+)'\s+then (\d+)`, so keep that textual shape). Names ending `_min`, `_hour` or `_day` are rolling counters (fixed windows, `pro_rate_check`, which counts per person and bucket); the rest are plain caps. One exception: `closet_pages_connection_day` is a per-connection cap and `pro_rate_check` has no connection argument, so `get_client_closet` enforces it against the `pages` of that connection's `pro_closet_views` row for today, before its upsert.

| Name | Value | | Name | Value |
| --- | --- | --- | --- | --- |
| `terms_day` | 20 | | `stylist_clients` | 25 |
| `profile_day` | 6 | | `stylist_clients_probation` | 3 |
| `invite_day` | 5 | | `invites_live` | 10 |
| `invite_lookup_hour` | 10 | | `invites_live_probation` | 1 |
| `redeem_day` | 10 | | `invite_expiry_days` | 7 |
| `alias_day` | 10 | | `client_connections` | 5 |
| `end_day` | 30 | | `items_per_look` | 12 |
| `block_day` | 30 | | `grant_items_max` | 500 |
| `grant_day` | 60 | | `drafts_per_connection` | 30 |
| `closet_page_day` | 600 | | `appointments_open_per_connection` | 5 |
| `recommend_day` | 60 | | `appointment_lead_minutes` | 60 |
| `send_look_day` | 30 | | `appointment_max_days_ahead` | 180 |
| `feedback_day` | 60 | | `grant_days` | 90 |
| `appointment_day` | 20 | | `grant_warn_days` | 7 |
| `respond_day` | 60 | | `closet_page_size` | 60 |
| `message_min` | 6 | | `closet_pages_connection_day` | 200 |
| `message_hour` | 60 | | `reports_day` | 20 |
| `message_day` | 300 | | `reports_to_hold_stylist` | 2 |
| `message_retention_days` | 180 | | `report_window_days` | 14 |
| `ended_message_retention_days` | 30 | | `ended_connection_retention_days` | 90 |
| `churn_connections` | 10 | | `churn_hours` | 48 |
| `photo_day` | 3000 | | `hold_release_days` | 7 |
| `qualified_reporter_hours` | 48 | | `qualified_connection_hours` | 24 |
| `qualified_connection_messages` | 3 | | `evidence_bytes` | 18000 |
| `evidence_body_chars` | 300 | | | |

Column and text lengths are `check` constraints (3.4) and are compared by string match in the same test: display name 2-40, headline 80, bio 500, rates 120, alias 2-30, label 40, place 120, session note 280, message 500, look title 80, look body 1000, feedback comment 500, report details 500. The range of a session's offset from UTC (-720 to 840 minutes, in steps of 15) is compared the same way (`PRO_UTC_OFFSET_RANGE`).

### 4.4 Errors

PostgREST puts the `RAISE` text in `error.message`, `DETAIL` in `error.details` and `HINT` in `error.hint`. Raised through `pro_raise(msg, sqlstate, detail, hint)`.

| Message | SQLSTATE | Raised when |
| --- | --- | --- |
| `not_authenticated` | 28000 | no signed-in user |
| `pro_disabled`, `pro_suspended`, `account_too_new`, `stylist_profile_required`, `stylist_profile_removed`, `invites_held`, `closet_not_shared` | 42501 | the gates of 4.5, a stylist profile that a person removed (`save_stylist_profile`), and the closet rule of `get_client_closet` |
| `pro_terms_required` | 42501 | terms not accepted at the current version for the role needed (DETAIL = `stylist` or `client`) |
| `pro_unavailable` | 22023 | not found, not visible, not a participant, blocked, expired, gone |
| `connection_ended` | 22023 | a write to a connection that has ended (for any reason, including a block) |
| `invite_invalid` | 22023 | any failure of a code: unknown, expired, used, revoked, own, stylist held, removed or suspended, blocked pair. **Returned as a result, not raised, by `preview_pro_invite` and `redeem_pro_invite` (4.1)**; `proService` raises it from the result |
| `stylist_not_accepting` | 22023 | a valid code, but the stylist is not accepting clients or is at their cap |
| `adult_required`, `terms_version_mismatch`, `stale_consent_text` | 22023 | attestation missing; `accept_pro_terms` with a version other than the server's; `set_pro_grant` enabling with a stale share text version |
| `invalid_request` | 22023 | a bad enum value or a missing required argument (DETAIL = argument) |
| `invalid_profile`, `invalid_alias`, `invalid_message`, `invalid_recommendation`, `invalid_appointment`, `invalid_report` | 22023 | bad input (DETAIL = field; for `invalid_appointment` the field `utc_offset` is a session's offset from UTC outside -720 to 840 minutes or not a quarter hour) |
| `recommendation_locked`, `recommendation_empty`, `appointment_closed` | 22023 | editing or deleting a sent look; sending a look with no item and no note; acting on a session whose state does not allow it |
| `item_not_found` | 22023 | a piece in a grant is not the caller's closet piece (DETAIL = how many) |
| `item_not_shared` | 22023 | a piece in a look is not in the client's active grant (DETAIL = position) |
| `text_not_allowed` | 22023 | DETAIL = field (`display_name`, `headline`, `bio`, `rates`, `alias`, `place`, `note`, `title`, `body`, `comment`, `message`, `label`; **not** `details`: a report's details are never filtered); HINT = `payment`, `contact`, `content` or `name`. `content` also covers text that hides characters or reverses its own direction, and, in the stranger-facing fields, a claim of approval by SmartCloset; `name` is a reserved word in a display name or a client alias |
| `appointment_conflict` | 23505 | confirming a session that overlaps another confirmed session of the same stylist |
| `pro_rate_limited` (DETAIL = bucket), `invite_limit`, `client_connection_limit`, `draft_limit`, `appointment_open_limit`, `closet_page_limit`, `report_rate_limited` | 54000 | limits |

A call to a server that has no pro functions gives `PGRST202`; the app turns it into `not_deployed` ("Professional features aren't available yet in this version").

### 4.5 Internal helpers (not callable by app users)

| Helper | Signature | Behaviour |
| --- | --- | --- |
| `pro_raise` | `(p_msg text, p_state text, p_detail text default null, p_hint text default null) returns void` | Same shape as `swap_raise` (passes only options that are set) |
| `pro_cfg` | `(p_key text) returns jsonb` | `select value from pro_config where key = p_key` |
| `pro_limit` | `(p_name text) returns integer` | 4.3. Immutable; unknown name -> 0 |
| `pro_rate_check` | `(p_uid uuid, p_bucket text) returns void` | Same as `swap_rate_check`: window from the suffix, `insert ... on conflict do update` counter, raise `pro_rate_limited` (DETAIL = bucket) past the cap |
| `pro_text_ok` | `(p_text text, p_mode text default 'chat') returns text` | Folds with `swap_fold_text`, then maps the typographic apostrophes U+2018 and U+2019 to an ASCII apostrophe (an iPhone's smart punctuation must not defeat `cashier's check`), then returns null when fine, or `'payment'`, `'contact'`, `'content'`. Mode `chat`: scam and advance-fee phrases (gift card, western union, moneygram, wire transfer, bitcoin, crypto, cashier's cheque or check, itunes card, overpay, refund the difference) and `swap_blocked_terms`; ordinary payment talk and contact details are **allowed** (people who are connected). Mode `public`: all of `chat`, plus payment words (venmo, paypal, zelle, cash app, apple pay, deposit, bank transfer, send money), links, emails, `@handles`, phone numbers and messaging-app names (swap's `strict` set), where `signal` counts only as `on signal`, `signal me` or `signal app`, so "Signal-inspired palette" is a style note and passes; and **claims of approval by SmartCloset** (`smart closet` within 40 characters of `official`, `verified`, `approved`, `endorsed`, `certified`, `partner`, `authorized`, `affiliated`, `staff` or `employee`, in either order; a stylist's own outside credential such as "certified image consultant" does not name the app and passes), answered `content`. **Hidden characters (both modes):** folding removes a bidirectional override, so text written backwards behind U+202E would pass every filter above and still read forwards on the phone; when nothing else matched, text containing a soft hyphen, combining grapheme joiner, Arabic letter mark, Hangul or Khmer filler, zero-width space, left-to-right or right-to-left mark, a bidi embedding, override or isolate (U+202A-202E, U+2066-2069), a word joiner or other invisible operator (U+2060-206F), the Hangul filler U+3164 or U+FFA0, or a byte-order mark is answered `content`. The zero-width joiner and non-joiner and the variation selectors stay allowed, because emoji sequences and several scripts need them. The exact patterns are in Appendix B.3 |
| `pro_require_text` | `(p_text text, p_field text, p_mode text default 'chat') returns void` | Raises `text_not_allowed` (DETAIL field, HINT the hint) |
| `pro_gate` | `(p_uid uuid, p_need text) returns void` | `p_need` is `safety`, `member`, `client`, `stylist_setup` or `stylist`. Order: sign-in (`not_authenticated`; an **anonymous** token, `auth.jwt() ->> 'is_anonymous'` true, counts as not signed in); **`safety` returns here**; `pro_enabled` (`pro_disabled`), suspension (`pro_suspended`); then for anything but `member`: adult confirmed (`adult_required`); `client`: client terms at the current version (`pro_terms_required`, DETAIL `client`); `stylist_setup`: stylist terms current (DETAIL `stylist`); `stylist`: stylist terms current **and** a `pro_stylists` row (`stylist_profile_required`). Appendix B.1 |
| `pro_new_code` / `pro_norm_code` | `() returns text` / `(p_code text) returns text` | Ten Crockford base32 characters (`0123456789ABCDEFGHJKMNPQRSTVWXYZ`) built from the random bytes of `gen_random_uuid()` (bytes 0-5, 7 and 9-11, never the version and variant bytes 6 and 8), `byte % 32` (uniform, because 256 is divisible by 32); 50 bits. Normalise: remove spaces and hyphens, upper-case, map `O` to `0` and `I`, `L` to `1`. Shown as `XXXXX-XXXXX` |
| `pro_clean_name` | `(p_name text, p_min int, p_max int) returns text` | Trim, collapse inner whitespace, reject control and invisible characters (folded), enforce length; used for display name, alias, label |
| `pro_name_ok` | `(p_name text) returns boolean` | False when the folded name contains a whole word `smartcloset`, `smart closet`, `support`, `admin`, `administrator`, `official`, `verified`, `certified`, `moderator`, `staff` or has no letter (HINT `name`) |
| `pro_clean_list` | `(p_items text[], p_allowed text[], p_max int) returns text[]` | Distinct, order kept, all in the allowed set, count <= p_max, else null |
| `pro_clean_materials` / `pro_clean_season` | `(p jsonb) returns jsonb` | Pro's own copies of swap's cleaners of the same names, with the same bodies (at most 12 materials with a name of 40 characters, a percentage of 0-100 and a closed tier list; at most 6 season words of 12 characters), so that pro depends on no swap function (3.3 rule 9). Used by `get_client_closet` and by the look copy |
| `pro_invites_held` | `(p_uid uuid) returns boolean` | True when `pro_members.invites_held_at` is set and either `invites_held_by = 'admin'` or it was set less than `hold_release_days` (7) ago. **The one place a hold is decided**: `create_pro_invite`, `preview_pro_invite` and `redeem_pro_invite` call it, so a hold from reports or churn releases itself and an admin hold does not |
| `pro_report_is_qualified` | `(p_reporter uuid, p_reported uuid) returns boolean` | True when the reporter's `auth.users.created_at` is at least `qualified_reporter_hours` (48) old **and** some `pro_connections` row between the two (either direction, any status) lasted at least `qualified_connection_hours` (24; an active one counts from `started_at`) or carries at least `qualified_connection_messages` (3) text messages **sent by the reported person** (the reporter's own messages prove nothing: a throwaway account could write three to a stylist and skip the 24-hour dwell). Decided at report time and stored in the report's evidence (`evidence.qualified`), because a later block deletes the messages that proved it |
| `pro_chat_evidence` | `(p_connection uuid, p_reporter uuid, p_flagged bigint, p_qualified boolean) returns jsonb` | File 8. The evidence of a chat report: the last 30 messages with each body cut to `evidence_body_chars`, the flagged message always kept, shrunk until `pg_column_size` is within `evidence_bytes` (B.9). Used by `report_pro_content` |
| `pro_photo_path` | `(p_url text, p_uid uuid) returns text` | Same regex as `swap_item_photo_path`: the storage path `<uid>/<file>` inside `wardrobe-images` for a bucket URL owned by `p_uid`, else null |
| `pro_lock_users` | `(p_a uuid, p_b uuid) returns void` | Two `pg_advisory_xact_lock`s on `hashtextextended('pro:' \|\| id, 0)` in sorted order |
| `pro_can_read_closet` | `(p_stylist uuid, p_client uuid, p_connection uuid) returns boolean` | True only when `pro_enabled`, neither member is suspended, the connection is `active` with exactly these two ids, they are not blocked, and an unexpired `closet` grant exists. **The one place this is decided**; `get_client_closet`, `get_pro_recommendation`, `list_pro_recommendations` and `pro_photo_source` all call it |
| `pro_end_connection` | `(p_id uuid, p_by text) returns boolean` | If the connection is not already ended: set `status='ended'`, `ended_at`, `ended_by`; delete its grant and grant items (event `connection_ended`); cancel its `proposed` and `confirmed` future sessions; insert the system line `ended`; if the stylist has had `churn_connections` connections end within `churn_hours` of starting in the last 30 days **that the client ended** (`ended_by = 'client'`, blocks by the client included, while the client account still exists), set `pro_members.invites_held_at` with `invites_held_by = 'system'` (never for connections the stylist ended: removing junk redemptions of a leaked code is the documented remedy). Returns false if already ended. All statements have `WHERE` (B.5) |
| `pro_end_between` | `(p_blocker uuid, p_blocked uuid) returns void` | For every active connection between the two accounts, in either direction, calls `pro_end_connection(id, <the blocker's role in that connection>)`; then calls `pro_shell_connection(id)` for **every** connection between them, in any status. Used by `pro_on_block` and `block_pro_member` |
| `pro_shell_connection` | `(p_id uuid) returns void` | Sets `shell_at = now()` where it is null and, only when it was null, deletes the connection's messages, looks (their items cascade), sessions, view counters and grant events. The shell is stored, so nothing is recomputed from `user_blocks` later (B.5) |
| `pro_refresh` | `(p_uid uuid) returns void` | Lazy upkeep for one member. **Never raises**: its body, and its call to the janitor, are wrapped in `begin ... exception when others then raise warning`, because swap's upkeep once took every swap screen down with one bad statement. Calls `pro_janitor(false)`; expires the grants of the member's connections with one statement, `with gone as (delete from pro_grants where expires_at <= now() and connection_id in (...) returning connection_id, scope) insert into pro_grant_events (...) select ... 'expired' from gone` (two parallel refreshes write one event), and deletes the grant items of connections that no longer have a grant; sets their `proposed` sessions whose start has passed to `expired` and their `confirmed` sessions whose end has passed to `completed`; **repairs** what an account deletion left half done when `pro_on_member_left` failed: an `active` connection with a null side is ended as `system`, a connection whose client side is null has its looks, sessions, grant events and view counters deleted, a connection whose stylist side is null has its unsent drafts deleted, and a connection that is not `active` has no grant or grant items; and **what a block left half done when `pro_on_block` failed**: a connection that is still `active`, or not yet a closed shell, between two accounts of which one blocks the other is ended with the blocker's role and turned into a closed shell (under the pair lock of 4.1, so a redeem in flight finishes first and its connection is seen; a connection that already is a shell is left alone, so unblocking still changes nothing). Correctness never depends on a schedule |
| `pro_janitor` | `(p_force boolean default false) returns void` | `pg_try_advisory_xact_lock`, throttle 15 minutes via `update pro_meta set last_janitor_at = now() where id`, then the retention deletes of 3.7, each with a `WHERE` **and bounded** (`... where ctid in (select ctid from ... where <condition> limit 5000)`), so one sweep cannot reach the statement timeout (which `exception when others` does not trap); the whole body is wrapped so a failure is a warning and never fails a read. Granted to `service_role` so a daily call can be scheduled (optional) |

Triggers (all `security definer`, never raise: the body is wrapped in `begin ... exception when others then raise warning`):

| Trigger | On | Does |
| --- | --- | --- |
| `pro_on_block` | `user_blocks` after insert | `pro_lock_users(new.blocker_id, new.blocked_id)` first (the lock a redeem takes, 4.1), then `pro_end_between(new.blocker_id, new.blocked_id)`: ends every active connection between the pair and turns every connection between them into a closed shell. A block made in Friends or Swaps does the same. If the trigger fails (it swallows errors so that a block never fails), `pro_refresh` finishes the work at the next read of either person |
| `pro_on_member_left` | `pro_connections` after update of `stylist_id, client_id` `when ((old.client_id is not null and new.client_id is null) or (old.stylist_id is not null and new.stylist_id is null))` | Fired by the `ON DELETE SET NULL` of an account deletion. Ends the connection if active (`system`); nulls the leaver's label (`client_alias` or `stylist_label`); if the **client** left: deletes the connection's looks, sessions, grant events and view counters (`delete ... where connection_id = new.id`); if the **stylist** left: deletes the connection's unsent draft looks (`status = 'draft'`; the sent ones stay with the client); always deletes its grant and grant items; if both sides are null, deletes the connection row. The `WHEN` clause makes its own updates unable to re-fire it. If the trigger fails (it swallows errors so that a deletion never fails), `pro_refresh` repairs the connection at the next read of either person |

### 4.6 Client functions

Gates: `safety`, `member`, `client`, `stylist_setup`, `stylist` as in 4.1 and 4.5; "participant" means the caller is the connection's stylist or client, gated for that role (or by `safety` where 4.1 says so). "Writes" lists every statement that changes data, with its `WHERE`; a bare `insert` needs none. Every function that writes to a connection also takes the connection lock of 4.1 first.

#### Group 1: access and terms

**`get_pro_status()` -> jsonb.** Signed-in only (it must answer when the switch is off). Runs `pro_refresh`. Returns
```
{ "proEnabled": bool, "suspended": bool, "adultConfirmed": bool, "stylistRemoved": bool,
  "versions": { "stylistTerms": "2026-10", "clientTerms": "2026-10", "shareText": "2026-10" },
  "stylist": null | { "termsCurrent": bool, "accepting": bool, "approved": bool, "invitesHeld": bool,
                      "activeClients": int, "clientLimit": int, "liveInvites": int, "inviteLimit": int },
  "client":  { "termsCurrent": bool, "connections": int, "connectionLimit": int },
  "badge": int }
```
`stylist` is null when there is no profile; `stylistRemoved` is true while a person's removal stands (`save_stylist_profile` would answer `stylist_profile_removed`). Errors: `not_authenticated` only. Writes: those of `pro_refresh`.

**`get_pro_badge()` -> integer.** Never raises (0 on any failure or when the switch is off). Counts: connections with an unread **text** message from the other side (system lines never count) + sessions proposed to the caller that have not started + (as client) sent looks not yet viewed. No `pro_refresh`, no writes.

**`accept_pro_terms(p_role text, p_version text, p_adult boolean default false)` -> void.** Gate `member`. `p_role` is `stylist` or `client` (`invalid_request`). `p_version` must equal the server's version for that role (`terms_version_mismatch`; the app sends the version in its own build, never the server's value). If the adult attestation is not yet stored, `p_adult` must be true (`adult_required`). Limit `terms_day`. Writes: `insert into pro_members ... on conflict (user_id) do update set <role>_terms_version = ..., <role>_terms_accepted_at = now(), adult_confirmed_at = coalesce(pro_members.adult_confirmed_at, case when p_adult then now() end), updated_at = now()`.

#### Group 2: the stylist profile

**`get_my_stylist_profile()` -> jsonb or null.** Gate `member`. `{ displayName, headline, bio, services[], languages[], ratesText, accepting, approved, invitesHeld, createdAt }`; `approved` and `invitesHeld` are read from `pro_members` (`invitesHeld` through `pro_invites_held`).

**`save_stylist_profile(p_display_name text, p_headline text default '', p_bio text default '', p_services text[] default '{}', p_languages text[] default '{}', p_rates_text text default '', p_accepting boolean default true)` -> jsonb** (same shape as above). Gate `stylist_setup`; `pro_lock_users(uid, uid)` first. If `pro_members.stylist_removed_at` is set: `stylist_profile_removed` (HINT: email support). Validation: `pro_clean_name(display_name, 2, 40)` and `pro_name_ok` (`text_not_allowed` HINT `name`); services a non-empty subset of the closed list (`invalid_profile` DETAIL `services`); languages <= 5 two-letter codes (`invalid_profile` DETAIL `languages`); all four text fields through `pro_require_text(..., 'public')`, which also refuses a claim of approval by SmartCloset in the headline, bio and rates (HINT `content`, 4.5) and text that hides characters. Limit `profile_day`. **When the call creates the profile row** (not when it updates one) it first looks at the reports of the last `report_window_days`: if two or more different reporters whose reports carry `evidence.qualified = true` exist, it sets a `system` hold, so closing and re-creating the profile cannot shed a pending hold. It never touches `stylist_approved_at` or an existing hold. Writes: `insert into pro_stylists ... on conflict (user_id) do update set ... , updated_at = now()`; `update pro_connections set stylist_label = <name>, updated_at = now() where stylist_id = uid and status = 'active'`; `update pro_members set invites_held_at = now(), invites_held_by = 'system', updated_at = now() where user_id = uid and invites_held_at is null` (only on creation, only when the reports qualify).

**`set_stylist_accepting(p_accepting boolean)` -> void.** Gate `stylist`; `pro_lock_users(uid, uid)`. Writes: `update pro_stylists set accepting_clients = p_accepting, updated_at = now() where user_id = uid`.

**`close_stylist_profile()` -> void.** Gate `safety` (a person who is paused, suspended or out of date on terms can still close); `pro_lock_users(uid, uid)`. No profile: no-op. Else: `pro_end_connection(id, 'stylist')` for each active connection where `stylist_id = uid`; `delete from pro_invites where stylist_id = uid`; `delete from pro_stylists where user_id = uid`. The stylist's terms acceptance, **approval, any hold and any removal stay on `pro_members`**: closing never resets probation and never clears a sanction, so close-then-save cannot undo a hold (2.2).

#### Group 3: invites

**`create_pro_invite(p_client_ref uuid, p_label text default null)` -> jsonb** `{ inviteId, code, expiresAt, createdAt, status, connected }` (the shape of `ProInvite`: `status` is `live`, `connected` false). Gate `stylist`. Order of checks: `pro_lock_users(uid, uid)`; account age (`account_too_new`); `pro_invites_held(uid)` false (`invites_held`); the idempotent hit on `(stylist_id, client_ref)`; live invites below the cap (`invites_live`, or `invites_live_probation` while `stylist_approved_at` is null; `invite_limit`); rate `invite_day`; label through `pro_clean_name(label, 0, 40)` and `pro_require_text(label, 'label', 'chat')`. Expiry `invite_expiry_days`. The insert is `insert ... on conflict (stylist_id, client_ref) do nothing` (that conflict is the idempotent hit and returns the existing row), then `on conflict (code) do nothing` with a fresh code from `pro_new_code()`, retried up to five times when it inserts nothing (the two conflicts are told apart, so a code collision is never mistaken for a retry). The label is a private reference and is never returned to a client. Writes: `insert into pro_invites`.

**`list_my_pro_invites()` -> table `(invite_id uuid, code text, label text, status text, created_at timestamptz, expires_at timestamptz, used_at timestamptz, connected boolean)`.** Gate `stylist`. `status` is computed: `live` (live and not past expiry), `expired`, `used`, `revoked`. Live ones plus those from the last 30 days, newest first. `connected` is true when an active connection came from it.

**`revoke_pro_invite(p_invite uuid)` -> void.** Gate `stylist`; `pro_lock_users(uid, uid)` (a redeem that already holds the stylist lock finishes first; one that starts after sees `revoked`). Writes: `update pro_invites set status = 'revoked', revoked_at = now() where id = p_invite and stylist_id = uid and status = 'live'`; if no row matched and the invite is not the caller's, `pro_unavailable`; already revoked is a no-op.

**`preview_pro_invite(p_code text)` -> jsonb** `{ valid: true, inviteId, stylist: { name, headline, bio, services[], languages[], ratesText }, alreadyConnected: bool, clientTermsCurrent: bool }` or `{ valid: false, error: 'invite_invalid' }`. Gate `member` (no terms needed to look). Limit `invite_lookup_hour`, counted on **every** call, valid or not: the counter is incremented first, and a failed code **returns** the `valid: false` result instead of raising, so the increment commits (4.1) and the 11th lookup in an hour is refused whatever the code was (`pro_rate_limited`). Every failure of the code is the same result (unknown, expired, used, revoked, own, stylist held (`pro_invites_held`), removed or suspended, or a blocked pair); `stylist_not_accepting` is raised only when the code is valid and everything else is fine. A used code that created this caller's own connection previews with `alreadyConnected: true` **only while that connection is active**; once it has ended or become a closed shell the spent code answers like any other (`valid: false`). Reveals no email, phone or account id. **The preview records nothing about who looked**, so `inviteId` is a plain uuid that anyone holding it can report: an invite report is stored but never counts toward an automatic hold (group 9, 6.4). Writes: the counter.

**`redeem_pro_invite(p_code text, p_alias text)` -> jsonb** `{ ok: true, connectionId, alreadyConnected }` or `{ ok: false, error: 'invite_invalid' }`. Gate `client`. Limit `redeem_day`, counted on every call like the preview. **The order is fixed** (B.10), because the stylist whose lock is needed can only be found by reading the invite first: (1) read `stylist_id` from `pro_invites` by the normalised code and **decide nothing** (no row: return the invalid result); (2) `pro_lock_users(stylist, client)`; (3) **re-select the invite `for update`** and redo every check on that locked row: a used invite whose connection has `invite_id = inv.id and client_id = uid and status = 'active'` returns `{ ok: true, connectionId, alreadyConnected: true }` (a retry after a lost response; this test comes before the live test, because a used code would otherwise fail it; an ended or closed connection does not count, so a spent code then falls through to the checks below and answers the invalid result, as the preview does); otherwise the invite is `live` and unexpired, the stylist exists with a profile and is not removed or suspended, `pro_invites_held` is false, the stylist is accepting, is not the caller, and is not blocked with the caller, else the invalid result; `p_alias` through `pro_clean_name(.., 2, 30)` (`invalid_alias`), `pro_name_ok` (`text_not_allowed`, DETAIL `alias`, HINT `name`: a stylist reads the alias as the client's name, and a reserved word such as `SmartCloset Support` would impersonate the company to a stranger) and `pro_require_text(.., 'alias', 'public')`; the caller's active connections as client below `client_connections` (`client_connection_limit`); the stylist's active clients below `stylist_clients` or `stylist_clients_probation` (`stylist_not_accepting`); (4) if an active connection with this stylist already exists, return it with `alreadyConnected: true` and consume nothing; (5) `update pro_invites set status = 'used', used_at = now() where id = inv.id and status = 'live'` and, **if it matched no row, return the invalid result before anything is inserted**; (6) create the connection `active` with **no grant**, and the system line `connected`. Because every stylist-side function takes the same stylist lock (4.1), two clients redeeming one single-use code, or a redeem racing a revoke, a close, an accepting switch or an admin hold, cannot both succeed. Writes: `update pro_invites ...` as in (5); `insert into pro_connections (stylist_id, client_id, stylist_label, client_alias, invite_id, ...)`; `insert into pro_messages` (system).

#### Group 4: connections

**`list_pro_connections(p_as text default 'client')` -> table `(connection_id uuid, my_role text, other_label text, other_headline text, status text, ended_by text, started_at timestamptz, ended_at timestamptz, last_activity_at timestamptz, unread integer, attention boolean, next_appointment_at timestamptz, pending_appointments integer, closet_shared boolean, closet_expires_at timestamptz, last_message_preview text, last_message_at timestamptz)`.** `p_as` is `client` or `stylist` (`invalid_request`); gate `safety` plus participation (the list shows labels and states, and the history of ended connections stays readable under a pause, a suspension or stale terms, 4.1). `other_label` is the stylist's `stylist_label` or the client's `client_alias`, else `Former stylist` / `Former client`. `ended_by` is the role of whoever ended it, except that **a `system` ending is returned as the other person's role** (`stylist` in a client's list, `client` in a stylist's), exactly as `get_pro_connection` reads it as `them`: a suspension or a removal is a moderation decision and neither side learns it, and the label still being present must not distinguish it from a deleted account. `other_headline` is the stylist's current headline (client rows only). `last_message_preview` is the first 80 characters of the last text message, and null when the role's own gate would refuse (switch off, suspended, terms stale). `unread` and `attention` count text messages, sessions and looks only; system lines never count. A connection with `shell_at` appears as a closed shell (4.1). Newest activity first; ended rows after active ones.

**`get_pro_connection(p_connection uuid)` -> jsonb.** Participant; gate `safety` (4.1): it answers under a pause, a suspension and stale terms, with `safetyOnly = true`, `actions` all false except `canEnd` and `canStopSharing`, and no profile text.
```
{ "connectionId", "myRole": "client"|"stylist", "status", "endedBy": null|"me"|"them", "startedAt", "endedAt",
  "otherLabel", "myAlias": null|text,                                                       // client side only; the name this client chose to show
  "safetyOnly": bool,
  "stylist": null | { "name", "headline", "bio", "services": [], "languages": [], "ratesText" },   // client side only
  "closet": { "shared": bool, "itemMode": null|"all"|"selected", "itemCount": null|int, "expiresAt": null|ts,
              "expiresSoon": bool, "lastViewedAt": null|ts, "views30d": int },                     // lastViewedAt, views30d: client side only (0/null for the stylist)
  "counts": { "looks": int, "upcoming": int },
  "actions": { "canMessage", "canPropose", "canRecommend", "canEnd", "canViewCloset", "canShare", "canStopSharing", "canRename" } }
```
`endedBy` is `me` / `them` / null (never "system": a system ending reads as `them`). Writes: none (reads after `pro_refresh`).

**`end_pro_connection(p_connection uuid)` -> void.** Participant; gate `safety` (4.1: it works under a pause, a suspension, stale terms and any build). Limit `end_day`. Calls `pro_end_connection(p_connection, role)`. Already ended: no-op.

**`set_pro_alias(p_connection uuid, p_alias text)` -> void.** Client of an active connection. Limit `alias_day`; `invalid_alias`; `pro_name_ok` (`text_not_allowed`, DETAIL `alias`, HINT `name`); `pro_require_text(.., 'alias', 'public')`. Writes: `update pro_connections set client_alias = <alias>, updated_at = now() where id = p_connection and client_id = uid and status = 'active'`.

#### Group 5: sharing

**`get_pro_grant(p_connection uuid)` -> jsonb.** Participant; gate `safety` (a client must be able to see what is shared, and switch it off, from any build). Client: `{ scope: 'closet', enabled, itemMode, itemIds[] (when selected), grantedAt, expiresAt, expiresSoon, textVersion, lastViewedAt, views30d, events: [{ event, itemMode, itemCount, at }] (last 20) }`. Stylist: `{ scope: 'closet', enabled, itemMode, itemCount, expiresAt }` and nothing else (never why it is off). Writes: none.

**`set_pro_grant(p_connection uuid, p_scope text, p_enabled boolean, p_item_mode text default null, p_item_ids uuid[] default null, p_text_version text default null, p_renew boolean default false)` -> jsonb** (the client shape of `get_pro_grant`). Client of an active connection. **Disabling** (`p_enabled = false`): gate `safety`; it never needs `p_text_version`, is not rate limited, and works under the kill switch, a suspension, stale terms and any build; it deletes the grant and its items and appends a `revoked` event (only if a grant existed); it writes **no** system line and does not touch `last_activity_at` (the stylist is not told, 5.1); on an ended connection it is a no-op. **Enabling**: gate `client`; `p_scope` must be `closet` (`invalid_request`); `p_item_mode` is required and has no default, so the app must ask (`invalid_request`): `all` (which includes pieces added while sharing is on) or `selected`, which needs 1 to `grant_items_max` distinct ids, every one an owned, non-wishlist piece of the caller (`ci.user_id = uid and coalesce(ci.is_wishlist, false) = false`, else `item_not_found` with DETAIL the number that failed); `p_text_version` must equal `share_text_version` (`stale_consent_text`); limit `grant_day`; `pro_lock_users(uid, uid)` and then the connection lock. A new grant sets `expires_at = now() + grant_days`. Changing the mode or the pieces of an existing grant **keeps** its `expires_at`; only `p_renew = true` (the "Keep sharing" button, which also needs the current share text version) sets a new 90 days, so editing pieces can never silently renew consent. Events: `granted` the first time, `changed` after a change, `renewed` after a renewal, `revoked` when turned off. One neutral system line `sharing_on` is written only when sharing goes from off to on, and at most once per connection per 24 hours; changes, renewals, revocation and expiry write none, so a stylist cannot tell a revocation from an expiry (5.1); system lines never count as unread or toward the badge. Writes: `insert into pro_grants ... on conflict (connection_id, scope) do update set item_mode = excluded.item_mode, text_version = excluded.text_version, expires_at = case when p_renew then excluded.expires_at else pro_grants.expires_at end`; `delete from pro_grant_items where connection_id = p_connection`; `insert into pro_grant_items`; `delete from pro_grants where connection_id = p_connection and scope = 'closet'` (disable); `insert into pro_grant_events`; `insert into pro_messages` (system, first time only).

**`get_client_closet(p_connection uuid, p_offset integer default 0, p_limit integer default 60)` -> table `(item_id uuid, name text, category text, subcategory text, color text, brand text, season jsonb, pattern text, material text, materials jsonb, size text, condition text, has_photo boolean, total_count integer)`.** Stylist of an active connection; gate `stylist`. Allowed only if `pro_can_read_closet(...)`; otherwise `closet_not_shared` when the connection is active and unblocked but there is no live grant, else `pro_unavailable`. `p_limit` is clamped to 1..`closet_page_size`; `p_offset` >= 0 and is clamped to the last page when it points past the end (the app merges pages by `item_id`), so `total_count` is present whenever the grant has pieces. Rows: the client's `clothing_items` with `coalesce(is_wishlist, false) = false`, restricted to `pro_grant_items` when `item_mode = 'selected'`, ordered `date_added desc nulls last, id`. **Text is typed by the client and is unfiltered, so it is cleaned and capped:** `name` is `left(btrim(name), 120)`; `category`, `subcategory`, `color`, `brand`, `pattern`, `material`, `size` and `condition` are `left(btrim(x), 60)`; `season` goes through `pro_clean_season` and `materials` through `pro_clean_materials` (bounded jsonb). `pro_text_ok` is not applied to it (it is the client's own description of their own things); a stylist who is abused through piece names ends, blocks or reports (6.6). `has_photo` is `pro_photo_path(user_image, user_id) is not null`. **No photo path, link or account id is ever returned:** the image comes from the `pro-photo` function by connection and `item_id` (4.8); gallery photos, `retailer_image` and every other column are never served. **Never returned:** price, cost, estimated value, notes, tags, tag text, wear data, favourite, retailer, `date_added`, the gallery, wishlist rows. Limits: `closet_page_day` per user, and `closet_pages_connection_day` per connection per day (`closet_page_limit`). Writes: `insert into pro_closet_views (connection_id, day, pages, last_at) values (..., current_date, 1, now()) on conflict (connection_id, day) do update set pages = pro_closet_views.pages + 1, last_at = now()`.

**`pro_photo_source(p_uid uuid, p_connection uuid, p_item uuid)` -> text.** **Service role only** (listed with the sharing functions because it is part of their contract; it is not one of the 36 functions `authenticated` may execute): an app user who could call it would read a storage path, which carries the client's account id. Called by the `pro-photo` edge function (4.8) with the user id it read from the verified token. Returns the storage path `<client account id>/<file>` inside `wardrobe-images`, or null. It returns a path only when `p_uid` is the stylist of the active, non-shell connection `p_connection`, `pro_can_read_closet(p_uid, client, p_connection)` holds, the piece is that client's with `coalesce(is_wishlist, false) = false`, it is in the grant (`item_mode = 'all'`, or listed in `pro_grant_items`) and it has a cover photo (`pro_photo_path`). Every refusal returns null identically. Counts `photo_day` for `p_uid`, on success only (the function maps `pro_rate_limited` to HTTP 429). Writes: the counter.

#### Group 6: looks

**`save_pro_recommendation(p_connection uuid, p_id uuid default null, p_title text default null, p_body text default '', p_item_ids uuid[] default null, p_client_ref uuid default null)` -> jsonb** `{ id, status, updatedAt }`. Stylist of an active connection; gate `stylist`; `pro_lock_users(uid, uid)` and the connection lock first. Create (`p_id` null) requires `p_client_ref` (`invalid_request`) and is idempotent on `(connection, client_ref)` (`on conflict ... where client_ref is not null do nothing`, then a select); draft count below `drafts_per_connection` (`draft_limit`). Update (`p_id` given) only while `draft` (`recommendation_locked`). Title 1-80 trimmed (`invalid_recommendation` DETAIL `title`), body <= 1000, both through `pro_require_text(.., 'chat')`. **Items:** `p_item_ids` **null leaves the items unchanged** on an update (and means no items on a create), so a title-only edit of a draft cannot wipe them; an array, possibly empty, replaces them. At most `items_per_look` distinct ids (`invalid_recommendation` DETAIL `items`). Each piece must be **the client's own and in the active grant right now**: `ci.user_id = c.client_id and coalesce(ci.is_wishlist, false) = false and (c.item_mode = 'all' or ci.id in (select item_id from pro_grant_items where connection_id = c.id))`, else `item_not_shared` (DETAIL the position). For `item_mode = 'all'` there is no `pro_grant_items` row to join, so the ownership test is the guard: a piece id seen elsewhere (for instance in a friend's closet) cannot be copied. Names and categories are copied as `left(btrim(name), 120)` and `left(category, 40)`. Limit `recommend_day`. Writes: `insert into pro_recommendations`; `update pro_recommendations set ... where id = p_id and connection_id = p_connection and status = 'draft'`; `delete from pro_recommendation_items where recommendation_id = <id>` and `insert into pro_recommendation_items` (both only when `p_item_ids` is not null).

**`send_pro_recommendation(p_id uuid)` -> void.** Stylist of the look's active connection. Needs a title and at least one item or a non-empty body (`recommendation_empty`). Limit `send_look_day`. Idempotent: a look that is already `sent`, `viewed` or `implemented` returns success without writing. Writes: `update pro_recommendations set status = 'sent', sent_at = now(), updated_at = now() where id = p_id and status = 'draft' and connection_id in (select id from pro_connections where stylist_id = uid and status = 'active')` (no row and not already sent: `pro_unavailable`); `update pro_connections set last_activity_at = now(), updated_at = now() where id = <connection> and stylist_id = uid`.

**`delete_pro_recommendation(p_id uuid)` -> void.** Drafts only. Writes: `delete from pro_recommendations where id = p_id and status = 'draft' and connection_id in (select id from pro_connections where stylist_id = uid)`.

**`list_pro_recommendations(p_connection uuid, p_before timestamptz default null, p_limit integer default 20)` -> table `(rec_id uuid, status text, title text, item_count integer, cover_item_id uuid, cover_photo_path text, sent_at timestamptz, viewed_at timestamptz, updated_at timestamptz, client_rating smallint, is_new boolean)`.** Participant; the caller's role gate for an active connection, `safety` for an ended one (read-only, 4.1); a connection with `shell_at` returns no rows. The client sees only `status <> 'draft'`; the stylist sees all. `cover_item_id` is the first available item: for the client their own piece; for the stylist only while `pro_can_read_closet` holds **and the piece is currently in the grant**, else null. `cover_photo_path` is the **client's own** photo path (their own account folder, which they already hold) and is always null for a stylist. `is_new` is true for the client when `status = 'sent'`. Newest `updated_at` first; `p_limit` clamped 1..40.

**`get_pro_recommendation(p_id uuid)` -> jsonb** `{ id, connectionId, status, title, body, sentAt, viewedAt, implementedAt, items: [{ position, itemId, name, category, color, brand, hasPhoto, photoPath (client only), available }], feedback: null | { rating, comment, at }, actions: { canEdit, canSend, canDelete, canGiveFeedback, canMarkWorn } }`. Participant; the caller's role gate for an active connection, `safety` for an ended one; for a connection with `shell_at`, or for the client a draft: `pro_unavailable`. **Client:** items are joined live to their own closet (`available` false and the copied name when the piece is gone); they get `itemId` and `photoPath` (their own). **Stylist:** `itemId` is returned (it is the id they already received from `get_client_closet`, and reopening a draft needs it); `name` and `category` are the copies; `color`, `brand` and `hasPhoto` are returned **only while `pro_can_read_closet` holds and the piece is currently in the grant**, from the same query and cleaners as `get_client_closet`, and are null / false otherwise. So once the client revokes, narrows or ends, a stylist reads back nothing about a piece beyond what they wrote themselves. `photoPath` is never returned to a stylist. For the client, the first read of a `sent` look sets it `viewed`. Writes: `update pro_recommendations set status = 'viewed', viewed_at = now(), updated_at = now() where id = p_id and status = 'sent' and connection_id in (select id from pro_connections where client_id = uid)`.

**`give_recommendation_feedback(p_id uuid, p_rating integer default null, p_comment text default null, p_worn boolean default null)` -> void.** Client of an active connection (connection lock first); the look must be `sent`, `viewed` or `implemented` (a draft is `pro_unavailable`). At least one argument non-null (`invalid_request`); rating 1-5 (`invalid_request` DETAIL `rating`); comment <= 500 through `pro_require_text(.., 'comment', 'chat')`. `p_worn = true` sets `implemented`; `false` returns an `implemented` look to `viewed`. Limit `feedback_day`. Writes: `update pro_recommendations set client_rating = coalesce(p_rating, client_rating), client_comment = coalesce(p_comment, client_comment), feedback_at = now(), status = <...>, implemented_at = <...>, updated_at = now() where id = p_id and status in ('sent','viewed','implemented') and connection_id in (select id from pro_connections where client_id = uid and status = 'active')`.

#### Group 7: sessions

**`propose_pro_appointment(p_connection uuid, p_starts_at timestamptz, p_duration_minutes integer, p_mode text, p_place text default '', p_note text default '', p_utc_offset_minutes integer default 0, p_client_ref uuid default null)` -> jsonb** `{ appointmentId, status }`. Participant of an active connection. `p_client_ref` required (`invalid_request`); idempotent on `(connection, proposer role, client_ref)` (`on conflict ... where client_ref is not null do nothing`, then a select). `pro_lock_users(uid, uid)` and the connection lock come first, so parallel proposals cannot pass the same stale open-session count. Start at least `appointment_lead_minutes` ahead and at most `appointment_max_days_ahead` (`invalid_appointment` DETAIL `starts_at`); duration 15-480 in steps of 15 (DETAIL `duration`); mode `virtual` or `in_person` (DETAIL `mode`); `p_place` through `pro_require_text(.., 'place', 'public')` (a phone number, link or handle is refused; a street address is not detectable and is the people's own choice); `p_note` through `chat`; `p_utc_offset_minutes` is the proposer's offset from UTC at the start, in minutes east of UTC, from -720 to 840 in steps of 15 (`invalid_appointment` DETAIL `utc_offset`). It is all the other person learns about where the proposer is: **never a zone name**. Open (`proposed`) sessions on the connection below `appointments_open_per_connection` (`appointment_open_limit`). Limit `appointment_day`. Writes: `insert into pro_appointments`; `update pro_connections set last_activity_at = now(), updated_at = now() where id = p_connection`.

**`respond_pro_appointment(p_appointment uuid, p_action text)` -> void.** The participant who did **not** propose it, on an **active** connection (`connection_ended` otherwise; connection lock first); `p_action` is `confirm` or `decline` (`invalid_request`). The session must be `proposed` and not yet started (`appointment_closed`); asking for the state it is already in (confirm on a confirmed session, decline on a declined one) returns success. On `confirm`, under `pro_lock_users(stylist, client)`, the stylist must have no other confirmed session (in any of their connections) whose time range overlaps (`appointment_conflict`). Limit `respond_day`. Writes: `update pro_appointments set status = <confirmed|declined>, responded_at = now(), updated_at = now() where id = p_appointment and status = 'proposed' and starts_at > now() and proposed_by <> <the caller's role> and connection_id in (select id from pro_connections where status = 'active' and (stylist_id = uid or client_id = uid))`; no row matched and the session is not already in the requested state: `appointment_closed` (`pro_unavailable` if the caller may not see it).

**`cancel_pro_appointment(p_appointment uuid)` -> void.** Either participant, on an active connection (connection lock first). Cancelling a cancelled session returns success. Writes: `update pro_appointments set status = 'cancelled', updated_at = now() where id = p_appointment and status in ('proposed','confirmed') and starts_at > now() and connection_id in (select id from pro_connections where status = 'active' and (stylist_id = uid or client_id = uid))` (no row and not already cancelled: `appointment_closed`).

**`list_pro_appointments(p_connection uuid default null, p_scope text default 'upcoming')` -> table `(appointment_id uuid, connection_id uuid, other_label text, my_role text, status text, proposed_by text, starts_at timestamptz, duration_minutes smallint, mode text, place text, note text, utc_offset_minutes smallint, can_confirm boolean, can_decline boolean, can_cancel boolean, created_at timestamptz)`.** `p_scope`: `upcoming` (status `proposed` or `confirmed` and not yet ended, soonest first), `needs_me` (proposed by the other side, not started), `past` (everything else, newest first, 30 rows). With `p_connection` null: across all the caller's connections (a person who is both stylist and client sees both). Status is the effective status (a confirmed session past its end reads `completed`). Gate: the caller's role gate for active connections and `safety` for ended ones (4.1); a connection with `shell_at` contributes no rows.

#### Group 8: messages

**`send_pro_message(p_connection uuid, p_body text, p_client_ref uuid)` -> jsonb** `{ messageId, createdAt }`. Participant of an **active** connection (`connection_ended` otherwise), under the connection lock. Body trimmed, 1-500 characters (`invalid_message`), `pro_require_text(.., 'message', 'chat')`. Limits `message_min`, `message_hour`, `message_day`. Idempotent on `(sender, client_ref)`. Writes: `insert into pro_messages`; `update pro_connections set last_activity_at = now(), updated_at = now() where id = p_connection`.

**`get_pro_thread(p_connection uuid, p_after_id bigint default null, p_before_id bigint default null, p_limit integer default 50)` -> jsonb** `{ messages: [{ id, from: 'me'|'them'|'system', body, code, at }], hasMore, actions: { canSend } }`. Participant; the caller's role gate for an active connection, `safety` for an ended one (read-only until its messages are deleted); a connection with `shell_at` returns no messages. `p_limit` is clamped 1..100; giving both `p_after_id` and `p_before_id` is `invalid_request`. Without either: the **latest** `p_limit` messages in ascending order, `hasMore` = older ones exist. With `p_after_id`: the **oldest** `p_limit` messages newer than that id, ascending, `hasMore` = still newer ones exist (so an app that was in the background and missed more than one page pages forward without a gap). With `p_before_id`: the newest `p_limit` messages older than that id, ascending, `hasMore` = still older ones exist (the "Load earlier messages" row). Never returns the other side's account id, and no read receipts. Writes: `update pro_connections set client_seen_message_id = <max id returned> where id = p_connection and client_id = uid and client_seen_message_id < <max id returned>` (or `stylist_seen_message_id ... and stylist_id = uid`), so a poll that sees nothing new writes nothing.

#### Group 9: reports, blocks, data

**`report_pro_content(p_ref_type text, p_ref_id uuid, p_reason text, p_details text default null, p_message_id bigint default null)` -> void.** Gate `safety` (the caller must be a participant, or hold the invite id for an invite report). `p_ref_type`: `connection` (the other person: their profile, or a message when `p_message_id` is given; allowed on an ended or closed-shell connection, with profile evidence only where the messages are gone), `recommendation`, `appointment` (for a client a draft look is `pro_unavailable`), or `invite` (a stylist seen in a preview, before connecting; `p_ref_id` is the `inviteId` from `preview_pro_invite`). The reported person is **resolved on the server** from the reference (`pro_unavailable` if the caller may not see it). Reasons: `spam`, `harassment`, `inappropriate`, `impersonation`, `scam`, `unsafe`, `underage`, `false_credentials`, `data_misuse`, `unsafe_meeting`, `other` (`invalid_report`). Contexts written: `pro_profile` (connection or invite, no message), `pro_chat` (connection with a message), `pro_content` (recommendation, appointment). **The details are not filtered**: a person reporting a scam must be able to quote it ("he told me to pay with a gift card"), only moderators read them, and a way out must not refuse its user. They are cut to 500 characters and stripped of control characters; nothing about them can make a report fail. **Evidence is built under a byte budget.** The table's check is `pg_column_size(evidence) <= 20000` and a 500-character message of four-byte characters is 2,000 bytes on its own, so each message body is cut to `evidence_body_chars` (300) characters and the oldest messages are dropped, never the flagged one, until `pg_column_size(evidence) <= evidence_bytes` (18,000); the insert can therefore never reach the check (`pro_chat_evidence`, B.9). A profile report carries the stylist profile as it is now; a chat report the last 30 messages marked `reporter`, `reported` or `system` plus `flaggedMessageId`; a look or session its fields. The evidence also carries `qualified`, the boolean of `pro_report_is_qualified(reporter, reported)` (always false for an invite report). Shares the 20-a-day limit with `report_user()` (`report_rate_limited`). **Folding:** a repeat is folded only when it is the same report (same reporter, `ref_type`, `ref_id`, `coalesce(p_message_id, 0)` and `reason`, within 7 days); `underage`, `unsafe_meeting`, `unsafe` and `harassment` are never folded, so an escalation in a thread (another message, a more serious reason) always reaches evidence. **Effects:** (1) the report is stored. (2) When the reporter is the **client** of the connection and the reason is `harassment`, `data_misuse`, `unsafe_meeting` or `underage`, the reporter's own grant for that connection is deleted in the same transaction (grant items too, event `revoked`); the connection stays open until the person chooses to block or end it; the sheet says "We have stopped sharing your closet with them" and nothing tells the stylist. (3) **Automatic hold:** when at least `reports_to_hold_stylist` (2) different reporters whose reports carry `qualified = true` have reported the same person in `pro_*` contexts within `report_window_days`, that person's invites are held (`invites_held_at`, `invites_held_by = 'system'`), unless an admin hold already stands. Invite reports, and reports from people who never really worked with the stylist, reach the queue but never count. Writes: `insert into content_reports (reporter_id, reported_user_id, context, reason, details, ref_type, ref_id, evidence)`; `delete from pro_grant_items where connection_id = <c> and connection_id in (select id from pro_connections where client_id = uid)`; `delete from pro_grants where connection_id = <c> and scope = 'closet' and connection_id in (select id from pro_connections where client_id = uid)`; `insert into pro_grant_events`; `update pro_members set invites_held_at = now(), invites_held_by = 'system', updated_at = now() where user_id = <reported> and (invites_held_at is null or invites_held_by = 'system')`.

**`block_pro_member(p_connection uuid default null, p_invite uuid default null)` -> void.** Gate `safety`. Exactly one of the two arguments (`invalid_request`). With `p_connection`: the caller must be a participant and the other side is blocked. With `p_invite`: a client who previewed a code and wants that stylist gone before ever connecting; the stylist is resolved from the invite (any status) and blocked, so their later codes answer `invite_invalid` for this person. Limit `block_day`. Inserts `user_blocks (blocker_id, blocked_id, blocked_name, via_pro)` with `blocked_name` the other side's label (never an email), `on conflict (blocker_id, blocked_id) do nothing`; then, **as `block_swap_member` does, if `public.are_friends(uid, other)` it calls `public.block_user(other)`**, which deletes the `friend_requests` row (without that, an accepted friend who is also the stylist would keep the folder-wide `"friends can read wardrobe images"` read, which has no block check); then `pro_end_between(uid, other)` (the trigger also fires on a fresh insert; calling it again is a no-op), which ends every active connection between the two and turns every connection between them into a closed shell. The order matters: the pro row is inserted first, so the block stays `via_pro` and out of the old Friends list.

**`list_pro_blocks()` -> table `(ref uuid, label text, blocked_at timestamptz)`** where `via_pro`, newest first; gate `safety`. **`unblock_pro_member(p_ref uuid)` -> void:** gate `safety`; `delete from user_blocks where ref = p_ref and blocker_id = uid and via_pro`. Unblocking does not reconnect and does not change a closed shell.

**`export_my_pro_data()` -> jsonb.** Gate `safety` (a paused or suspended person can still take their data). Section 8.2.

### 4.7 Admin functions and views (service role only, SQL editor)

| Object | Signature | Does |
| --- | --- | --- |
| `pro_set_enabled` | `(p_on boolean) returns void` | `update pro_config set value = to_jsonb(p_on), updated_at = now() where key = 'pro_enabled'`. **Turning it on raises (55000, "load at least 50 content terms into swap_blocked_terms first")** while `select count(*) from swap_blocked_terms where kind = 'content'` is below 50: the rule of `swap_set_community_enabled` |
| `pro_admin_approve_stylist` | `(p_user uuid) returns void` | Takes `pro_lock_users(p_user, p_user)`; `update pro_members set stylist_approved_at = now(), updated_at = now() where user_id = p_user`; lifts the probation caps |
| `pro_admin_hold_stylist` / `pro_admin_release_stylist` | `(p_user uuid) returns void` | Both take the lock. Hold: `update pro_members set invites_held_at = now(), invites_held_by = 'admin', updated_at = now() where user_id = p_user` (an `admin` hold never releases itself; it also turns a `system` hold into one a person confirmed). Release: clears both columns (`where user_id = p_user`) |
| `pro_admin_suspend` | `(p_user uuid, p_reason text) returns void` | Takes the lock; upserts `pro_members.suspended_at`, `suspended_reason`; calls `pro_end_connection(id, 'system')` for every active connection where the user is either side |
| `pro_admin_unsuspend` | `(p_user uuid) returns void` | Clears the suspension; does not reconnect anything |
| `pro_admin_remove_stylist` | `(p_user uuid, p_reason text) returns void` | Takes the lock; ends the user's connections (`system`), deletes their invites and profile, **sets `pro_members.stylist_removed_at` and `stylist_removed_reason`** (so `save_stylist_profile` refuses until restored: removal cannot be undone by closing and re-creating the profile), marks their open reports handled with the reason |
| `pro_admin_restore_stylist` | `(p_user uuid) returns void` | Takes the lock; clears `stylist_removed_at` and `stylist_removed_reason` (`where user_id = p_user`); recreates no profile and no connection |
| `pro_report_backlog` | `(p_older_than interval default interval '4 hours') returns table (waiting integer, oldest_hours integer)` | Unreviewed `content_reports` with context `pro_profile`, `pro_chat` or `pro_content` |
| `pro_send_report_digest` | `(p_older_than interval default interval '4 hours') returns boolean` | Like `swap_send_report_digest`: numbers only, to the address in Vault under the name `swap_report_webhook` (**the owner's one alert channel**, so one webhook serves both features); the message says "SmartCloset professional accounts: N report(s) waiting, the oldest H hour(s). Open the pro_moderation_queue view." Returns false and does nothing where `pg_net`, Vault or the secret is missing |
| `pro_janitor` | `(p_force boolean default false) returns void` | 4.5. Optional daily `select public.pro_janitor(true)` |
| view `pro_moderation_queue` | | Unreviewed pro reports with `id, created_at, context, reason, details, ref_type, ref_id, reporter_id, reported_user_id, evidence, qualified, reviewed_at, outcome`, safety reasons (`underage`, `unsafe_meeting`, `unsafe`, `harassment`) first, then oldest first |
| view `pro_review_queue` | | Stylists with `pro_members.stylist_approved_at is null` and `stylist_removed_at is null`: `user_id, display_name, headline, bio, services, rates_text, created_at`, active client count; the owner reads the profile text and calls `pro_admin_approve_stylist` or `pro_admin_remove_stylist` |

### 4.8 Photos: the `pro-photo` edge function

A stylist never receives a storage path, a signed link or any string that carries the client's account id (a path is `<account id>/<file>`, and a signed link contains it). Photos reach a stylist through **one edge function**, `supabase/functions/pro-photo/index.ts` (stream PPH; `verify_jwt = true` in `supabase/config.toml`, so the platform checks the token's signature before any code runs):

- **Request:** `GET /functions/v1/pro-photo?c=<connection uuid>&i=<item uuid>` with the caller's `Authorization` and `apikey` headers. Both parameters are matched against a strict uuid pattern; anything else is a bare `404`.
- **Authorisation:** the function reads the user id from the verified token (`auth.getUser`, as `delete-account` does), then calls `pro_photo_source(p_uid, p_connection, p_item)` with the service key. `null` (every refusal: no grant, revoked, expired, ended, blocked, suspended, switched off, wrong piece, wishlist piece, no photo, not the caller's connection) is the same bare `404`; `pro_rate_limited` is `429`. The storage path never leaves the function.
- **Response:** the function downloads the object with the service key, refuses more than 5 MB (`413`), tells a PNG from a JPEG by its first bytes, removes the metadata with the code swap-media uses (`_shared/jpegMetadata.ts`, `_shared/pngMetadata.ts`: location, camera, thumbnails, comments, trailing data) and answers with the cleaned bytes, `Content-Type` `image/jpeg` or `image/png`, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff` and no file name. Any other format fails closed (`415`).
- **Logging:** fixed short error codes only; never an id, a path or bytes.

**Consequences.** Revoking, narrowing, ending, blocking, suspending or the switch stop the **next request** at once, because there is no link to outlive the grant; a photo already on the stylist's screen stays in memory until they leave the screen, and the app writes none of it to disk (the response says `no-store`). Location and camera details are removed from every photo a stylist is served, including photos uploaded long before this feature existed. No storage policy is added: the bucket, its owner policy and the friends policy (`"friends can read wardrobe images"`, folder-wide) are **not touched, not copied and not widened**, and a stylist who is also an accepted friend gets nothing extra from this feature (`block_pro_member` removes the friendship, 4.6). Nothing is written to storage and there is no pro bucket. Cost: one invocation per photo tile that scrolls into view, bounded by `closet_pages_connection_day` (200 pages) and `photo_day` (3000). Deploy: `supabase functions deploy pro-photo`, after the database push (11.1, P3). **Why not signed links:** a signed link names the object (`<client account id>/<file>`), so every closet page would hand the stylist the client's account id, which defeats the alias, and the original object keeps its metadata.

**The bucket still has to be private, for everyone's sake.** The guarantee above does not depend on it (a stylist is never given a path), but the privacy page and every client's own photos do. P0 and P3 (11.1) therefore make three checks **hard stops before `pro_enabled` may be set**: `storage.buckets.public` for `wardrobe-images` is false; an unauthenticated `GET` of an existing photo's `/object/public/` address does not return 200 and a signed-in user who is neither the owner nor an accepted friend is refused for another user's path; and the only policies on `storage.objects` that mention `wardrobe-images` are the owner policy and `"friends can read wardrobe images"` (storage policies are OR-ed and these ones were made by hand in the dashboard, so one more permissive policy would void everything). A fresh local stack lacks the hand-made policies, so the local API script cannot prove any of this for production; the same probes run against a branch that mirrors production (9.4).

### 4.9 Write statements: the `WHERE` checklist

Every `UPDATE` and `DELETE` in every migration, trigger and function carries a top-level `WHERE`, **including** the one-row tables. The complete list of statements is the "Writes" lines above plus these (each has the `WHERE` shown):

| Function | Statement | `WHERE` |
| --- | --- | --- |
| `pro_janitor` | `update pro_meta set last_janitor_at = now()` | `where id` |
| `pro_set_enabled` | `update pro_config set ...` | `where key = 'pro_enabled'` |
| `pro_janitor` | `delete from pro_messages` | `where ctid in (select m.ctid from pro_messages m join pro_connections c on c.id = m.connection_id where ((c.status = 'ended' and c.ended_at < now() - interval '30 days') or m.created_at < now() - interval '180 days') limit 5000)` |
| `pro_janitor` | `delete from pro_connections` | `where ctid in (select ctid from pro_connections where status = 'ended' and ended_at < now() - interval '90 days' limit 5000)` (children cascade) |
| `pro_janitor` | `delete from pro_invites` | `where ctid in (select ctid from pro_invites where (status = 'used' and used_at < now() - interval '30 days') or (status = 'revoked' and revoked_at < now() - interval '30 days') or expires_at < now() - interval '30 days' limit 5000)` |
| `pro_janitor` | `delete from pro_rate_counters`, `delete from pro_closet_views` | `where ctid in (select ctid from pro_rate_counters where window_start < now() - interval '2 days' limit 5000)`; `where ctid in (select ctid from pro_closet_views where day < current_date - 90 limit 5000)` |
| `pro_refresh` | expire grants (`with gone as (delete ... returning ...) insert into pro_grant_events`), delete orphaned grant items, expire and complete sessions, repair half-ended connections | `where expires_at <= now() and connection_id in (...)`; `where connection_id in (...) and not exists (select 1 from pro_grants g where g.connection_id = pro_grant_items.connection_id)`; `where status = 'proposed' and starts_at <= now() and connection_id in (...)`; `where status = 'confirmed' and starts_at + duration_minutes * interval '1 minute' < now() and connection_id in (...)`; the repairs: `where id in (...) and status = 'active' and (stylist_id is null or client_id is null)`, and `where connection_id in (select id from pro_connections where client_id is null and id in (...))` for the client-side deletes |
| `pro_end_connection` | `update pro_connections`; `delete from pro_grant_items`; `delete from pro_grants`; `update pro_appointments`; `update pro_members` (churn hold) | `where id = p_id and status = 'active'`; `where connection_id = p_id`; `where connection_id = p_id`; `where connection_id = p_id and status in ('proposed','confirmed') and starts_at > now()`; `where user_id = c.stylist_id and (invites_held_at is null or invites_held_by = 'system')` |
| `pro_shell_connection` | `update pro_connections`; `delete from pro_messages`, `pro_recommendations`, `pro_appointments`, `pro_closet_views`, `pro_grant_events` | `where id = p_id and shell_at is null`; each `where connection_id = p_id` (only when the first statement matched) |
| `pro_on_member_left` | `update pro_connections`; `delete from pro_recommendations`; `delete from pro_appointments`; `delete from pro_connections` | `where id = new.id`; `where connection_id = new.id`; `where connection_id = new.id`; `where id = new.id and stylist_id is null and client_id is null` |

Dynamic SQL (`execute format('update ...')`) is **not used** for `UPDATE` or `DELETE`, because the text scanner of `migrationSafeUpdate.test.ts` cannot see inside it. The two permitted uses of `execute format` are the row-security/revoke loop and the privileges block.

---

## 5. Privacy and consent

The principle: **connecting shares nothing.** A stylist sees only what the client has explicitly switched on, per connection, for a limited time, and the client can switch it off at any moment.

### 5.1 What the other person can see

| Data | The stylist sees | The client sees |
| --- | --- | --- |
| Name | The name the client chose for them (2-30 characters, filtered). Never the account name or email | The stylist's display name, headline, bio, services, languages, rates text (profile) |
| Account id, email, phone, location, friends, swaps | Never | Never |
| Where the other person is | Nothing beyond one number on a session: the proposer's offset from UTC at the start (for example UTC+1), so the time can be read on their clock. Never a zone name, a city or a region | The same, for sessions the stylist proposes |
| The closet | Only while a grant is active: for each shared piece, its cover photo, name, category, subcategory, colour, brand, season, pattern, material, materials, size, condition. All pieces (including pieces added while sharing is on; the consent says so) or only chosen pieces. Never the wishlist | Their own, as always |
| Photos | Only the cover photo of a shared piece, fetched through the `pro-photo` function with location and camera details removed. Never a storage path or a link | Their own, as always |
| Looks | The looks the stylist wrote and the client's rating, comment and "wore it"; **whether and when the client opened a look** (its `Viewed` state: the stylist's own look only) | Looks that were sent |
| The pieces in a look | The name and category copied when the look was written (nothing else about the piece), kept until the look or the connection is deleted, **even after sharing is switched off** | The same, joined live to their own closet |
| Sessions | The sessions of this connection | The same |
| Messages | The thread of this connection | The same |
| That the client viewed the closet | Nothing | Last viewed time and the number of closet pages viewed in the last 30 days |
| That a grant was revoked, changed or renewed rather than expired | Nothing: only "not shared". Turning sharing off writes no message and moves nothing in their list | The full event log |
| That sharing was turned on | A neutral line "Closet sharing is on." (at most once a day) | The same line |
| Why a connection ended | Nothing (only that it ended, and whether they ended it) | The same |

### 5.2 What is never shareable in this feature

Price paid, retail price, estimated value, private notes, ratings and rating notes, tag text, wear counts and history, the outfit calendar, favourites, retailer, the gallery photos beyond the cover, the face photo, body profile, skin tone, style quiz answers, colour season, weather and location, email, phone, friends, swaps, blocks, other connections, consents and AI usage, and any storage path or link to a photo. These are absent from every function's return list (a Jest test inspects them, 9.3). Nothing about them is added to a later scope without its own switch, consent text, migration and privacy review.

### 5.3 How consent is recorded

- **Per connection, per scope, on the server.** `pro_grants` holds the live grant: scope (`closet`), mode (`all` or `selected`), when it was given, when it ends (90 days), and the **version of the consent text the client saw** (`text_version`). `pro_grant_events` is an append-only log of every change (granted, changed, renewed, revoked, expired, connection ended).
- **Stale text is refused when enabling.** `set_pro_grant` with `p_enabled = true` requires the build's `PRO_SHARE_TEXT_VERSION` to equal the server's (`stale_consent_text`); the app then says "Update SmartCloset to change sharing" (that is, to turn sharing **on** or to renew it). Turning sharing **off** never needs a text version and works from any build, so an old app can always stop it (4.1). The app sends the version in its own build, never the server's value, so a client can only agree to text they were shown (the lesson of swap.md 6.3).
- **Terms and age** are recorded in `pro_members` against the version shown (`stylist_terms_version`, `client_terms_version`, `adult_confirmed_at`); no date of birth is stored.
- **Not tied to the other consents.** The ratings consent (`user_consents`) and the AI consent are unrelated and are not read by pro functions. Nothing in this feature is sent to an AI service, and a stylist cannot trigger one on a client's data.

### 5.4 Revocation and its limits

- **Immediately effective on the server.** Every `get_client_closet` call and every photo request re-checks the live grant (`pro_can_read_closet`, inside `pro_photo_source`). Turning sharing off, ending the connection, a block, a suspension and the global switch all stop the next read at once. There are no photo links to outlive the grant: a photo already on the stylist's screen stays there until they leave the screen, and the app keeps nothing on disk.
- **Cannot be taken back:** what a stylist already saw (they may remember or screenshot it), and the names of the pieces they used in looks they wrote (a look keeps only name and category of each piece, never a photo or any other field, and goes with the connection after 90 days). The consent screen says: "We can't take back what your stylist has already seen." and that a photo can show more than the clothes. The terms forbid copying, republishing, training AI on it or keeping it after the relationship ends. iOS does not let an app prevent screenshots; the terms say so.
- **Expiry.** A grant lasts 90 days. The client sees a banner for the last 7 days ("Your stylist's access ends on <date>. Keep sharing?") and renews by switching it on again. No notification is sent.

### 5.5 Device copies

Anything fetched about another person (a client's closet pages, photos, a thread) is held **in memory only**: never in AsyncStorage, never in the 24-hour signed-link cache of `imageUrls.ts` (which persists to disk), and never in Export Data. A stylist's photo is requested from the `pro-photo` function by connection and piece (`proPhotoUrls.ts` builds the request with the signed-in token; there is no link to cache); the response is `Cache-Control: no-store`, so the system URL cache keeps nothing, and the image view releases the bytes when the screen goes. There is no save, share or download of another person's photo in the app. `clearProPhotoCache()` runs on sign-out and account deletion (it clears the helper's small memo; there is nothing else to clear).

### 5.6 Retention after a connection ends, and on account deletion

Section 3.7 is the table; section 8 is the deletion behaviour. In one line: messages go 30 days after the end, everything else about the connection 90 days after, the closet grant immediately.

### 5.7 Third parties

None. No analytics, no SDK, no AI call, no Google Vision (the first release has no stylist or client photo upload). Counters hold numbers only and are deleted after 2 days. Function logs contain fixed strings, never content.

---

## 6. Safety and moderation

### 6.1 Adults only

- **Both roles are 18 and over.** To activate either role the person ticks a labelled "I am 18 or older" switch (and accepts that role's terms). The server stores `adult_confirmed_at` and the terms version. **No date of birth is collected.**
- **Enforced in the database, not the screen.** `pro_gate` refuses every function whose gate is `client`, `stylist_setup` or `stylist` until the attestation exists (`adult_required`). The `member` gate (signed in, switch on, not suspended) is used by status, badge, accepting terms, reading one's own profile and previewing a code. **Every way out uses the `safety` gate (signed in, nothing else, 4.1):** stopping sharing, ending, blocking, reporting, listing and removing blocks, closing a profile, export and reading ended history. So the kill switch, a suspension, stale terms or an old build can never lock anybody out of leaving, blocking, reporting, switching sharing off or taking their data. Guests have no session and cannot reach any of them; anonymous sign-ins are refused by every gate (and are off in the project, 11.1 P0).
- **No path for minors:** no parent-consent flow, no "style my child" profile. The client terms (A.2) and the sharing consent (A.3) say: do not share pieces whose photos show people, especially children; the sharing screen has no default (it asks "All my pieces" or "Only pieces I choose"), lists "Only pieces I choose" first, and the picker repeats the sentence. The first release has no photo scan, no AI and no per-piece review, so this rests on the written rule, the explicit choice and reports (6.6). The report reason `underage` exists; on a credible report the person suspends the pro membership (not the account) at once (`pro_admin_suspend`), which ends its connections, and keeps the evidence.
- Self-attestation is a weak signal and the document does not pretend otherwise. Where a state's app-store age law applies (Utah, Texas, Louisiana), use Apple's Declared Age Range API as an extra signal; the owner checks which of those laws are in force before release (11.1, P7).
- The age-rating questionnaire in App Store Connect already answers "user-generated content" and "messaging" yes (swaps); the owner re-reads the resulting tier on screen (11.1, P7).

### 6.2 Terms

Two versioned texts live in `src/config/proRules.ts` and are accepted server-side (`accept_pro_terms`): **stylist terms** and **client terms** (`PRO_STYLIST_TERMS_VERSION`, `PRO_CLIENT_TERMS_VERSION`, both `2026-10`; they must equal the `pro_config` rows). A new version asks every person again; a build that carries older text than the server shows "Update SmartCloset to keep using professional features" and records nothing, while still offering Stop sharing, End, Report and Block. They exist because Apple's standard end-user agreement says nothing about conduct between members. The sections are in Appendix A.1 and A.2. Both state, in plain words: independent professionals; SmartCloset does not check, vouch for, guarantee or insure anyone or any service; **no payments**; adults only; zero tolerance and a review aim of 24 hours; suspension rights; no services needing a licence (hair, makeup, skin, body-shaping, medical, dietary, weight-loss) through the app; what a stylist may do with a client's data; what happens to data when a connection ends or an account is deleted; the support address.

### 6.3 Filters

Server-side, at write time, on folded text (`swap_fold_text`: accents, wide letters and invisible characters removed, lower-case). Look-alike letters from other alphabets are not folded (the limit swap accepts); reports are the answer.

| Field | Mode | Refused |
| --- | --- | --- |
| Stylist display name, headline, bio, rates text | `public` | scam phrases, payment words, links, emails, @handles, phone numbers, messaging-app names, blocked terms, claims of approval by SmartCloset; the name also reserved words (`name`) |
| Client alias, session place | `public` | the same; the alias also reserved words (`name`), because a stylist reads it as the client's name |
| Invite label (private to the stylist) | `chat` | scam phrases, blocked terms |
| Messages, look title and body, feedback comment, session note | `chat` | scam and advance-fee phrases, blocked terms. Ordinary payment talk and contact details are **allowed** between connected adults |
| Report details | **none** | Nothing is refused: a person reporting a scam must be able to quote it, only moderators read it, and a way out must not refuse its user. Cut to 500 characters, control characters stripped |
| Every field above | both | Text that hides characters or reverses its own direction (a right-to-left override, an isolate, a zero-width space, a filler: 4.5), answered `content`. A claim of approval by SmartCloset ("official SmartCloset stylist", "verified by SmartCloset"), in the stranger-facing fields only, also `content` |
| Closet text a stylist sees (piece names, brand, colour, size and so on) | none; cleaned and capped (4.6) | Not run through `pro_text_ok`: it is the client's own description of their own things. A stylist abused through it ends, blocks or reports (6.6) |

The 50-term objectionable list (`swap_blocked_terms`) is shared with swaps and is loaded the same way (`docs/MODERATION.md`). **`pro_set_enabled(true)` refuses until at least 50 content terms are loaded** (the rule of `swap_set_community_enabled`), because a stylist and a client meet through a code and are effectively strangers: the list is live whenever the feature is, and the review notes (6.9) may claim it. The client app also warns (never blocks) on payment talk in a thread, with a one-tap Report, using `looksLikePaymentTalk`.

### 6.4 Reports

- **Where:** a "Report or block" menu on the stylist card (including in the invite preview), the thread header, every message from the other person (long-press), every look, every session, and, for a stylist, the shared closet (a flag in the header of the closet screen and a "Report or block" row on every piece: it reports the connection, since the server has no reference for a single piece). Both roles can report.
- **What:** `report_pro_content` (4.6, group 9). The reported person is **resolved on the server** from a connection, look, session or invite reference, so the app never holds the other person's account id and cannot probe ids (`pro_unavailable` if the caller may not see it). Reasons are the existing eight plus `underage`, `false_credentials`, `data_misuse`, `unsafe_meeting`.
- **Evidence** (built under a budget of 18,000 bytes, below the table's 20,000-byte check): the stylist profile as it is now; or the last 30 messages marked `reporter`, `reported` or `system` with the flagged message (each cut to 300 characters and the oldest dropped first, because 500 non-ASCII characters can be 2,000 bytes); or the look or session fields; plus `qualified` (below). Shared 20-a-day limit with `report_user`. A repeat is folded only when it is the same report (same reporter, reference, message and reason); serious reasons are never folded, so an escalation is never lost.
- **Never shown to the reported person.** Reports and evidence are deleted with either account (the existing rule).
- **Constraints widened** (file 8, with all existing values kept): `content_reports_context_check` gains `pro_profile`, `pro_chat`, `pro_content`; `content_reports_reason_check` gains the four reasons; `content_reports_ref_type_check` gains `connection`, `recommendation`, `appointment`, `invite`. `report_user()` is not touched and keeps its narrow lists.
- **Anti-brigading: only real relationships count.** An invite report needs only the `inviteId` that `preview_pro_invite` returns, and the server records nothing about who previewed (previewing is free, and a throwaway email account takes minutes to make). So an invite report is stored and read in the queue but **never counts toward the automatic hold**. Only a report from someone who really worked with the stylist counts: the reporter's account is at least 48 hours old and a connection between them, past or present, lasted at least 24 hours or carried at least 3 text messages **from the person reported** (`pro_report_is_qualified`, decided at report time and stored in the evidence as `qualified`, because a block deletes the messages that proved it). A stranger, or any number of throwaway accounts, therefore cannot hold a stylist's invites, whatever codes they obtain. Sign-up hygiene supports it: anonymous sign-ins are off and email confirmation is on (checked at P0), and every gate refuses an anonymous token.
- **Automatic action is small and reversible:** two **different qualified** reporters in `report_window_days` (14) hold the stylist's **new invites** and make their live codes unredeemable (`invites_held_at`, `invites_held_by = 'system'`; existing connections continue). The hold **releases itself after 7 days** unless a person confirms it (`pro_admin_hold_stylist`); a new qualifying pair sets it again. It never suspends or ends anything. A person decides everything else. The hold lives on the person (`pro_members`), so closing and re-creating the profile does not clear it, and `save_stylist_profile` re-checks the last 14 days of reports when it creates a profile.
- **A serious report also stops the reporter's own sharing.** When a client reports `harassment`, `data_misuse`, `unsafe_meeting` or `underage`, their closet grant for that connection is deleted in the same call, and the sheet says "We have stopped sharing your closet with them". The connection stays open until the person blocks or ends it; nothing tells the stylist.

### 6.5 Blocks

- **Block** is on every surface that has Report. It writes `user_blocks` with `via_pro = true` through `block_pro_member`, so the account id never reaches the blocker's own block list; the list the person sees is `list_pro_blocks()` under an opaque `ref`. It works from a connection and from an invite preview (a client who sees a stylist they do not want, before connecting, can block them). If the two are also friends, `block_pro_member` removes the friendship as well (as `block_swap_member` does), which also ends the folder-wide friends read of photos.
- **One global block table.** A block made in Friends, Swaps or Stylists applies to all three: `pro_on_block` ends any pro connection between the pair, and `redeem_pro_invite` / `preview_pro_invite` answer `invite_invalid` for a blocked pair.
- **Private.** The blocked person sees a closed shell (2.9), never the word "blocked". The shell is stored, so it stays the same if the blocker unblocks. They cannot reconnect by code while the block stands. Unblocking restores neither a connection nor any content.

### 6.6 Abuse cases and mitigations

| Attack | Mitigation | Residual |
| --- | --- | --- |
| **Invite spam**: a stylist floods people with codes | Codes are single use, 7 days, 5 created a day, 10 live (1 on probation); redeeming needs a signed-in adult who accepts the terms; no lookup by name, email or phone; two different reporters who really worked with the stylist hold new invites for 7 days | A stylist can still spam people reachable on another channel |
| **Stalking**: an ex or stranger poses as a stylist to reach a victim | Connecting shares nothing; the closet is a separate, explicit switch with a plain-language screen; no location (a session carries only its proposer's offset from UTC, never a zone name, a city or a region), email, phone, wear calendar, weather or friends are ever shared; grants end in 90 days; end and block in one tap; a blocked stylist sees only a neutral closed row; turning sharing off or changing it tells the stylist nothing; location and camera data are removed from every photo a stylist is served; no read receipts on messages, no typing or presence signals (a stylist does see whether and when a look was opened, which the privacy page says); no structured address fields | A victim deceived into granting the closet has shown their clothes; the consent screen wording is the mitigation |
| **Harassing or sexual messages** | Text only, 500 characters, 6 a minute, 60 an hour, 300 a day; Report and Block on every message; evidence kept; two qualified reporters hold invites; a person decides suspension; adults only | Clean-looking abuse is caught only by reports |
| **Fake stylist, stolen name, brand impersonation** | No directory, so no discovery; probation caps (3 clients, 1 live invite) until a person reads the profile (`pro_review_queue`); reserved-word name rule (also for a client's alias, which a stylist reads as a name) and a refusal of claims of approval by SmartCloset in the headline, bio and rates; no credentials, photo, website or handle fields; no badge of any kind; reports `impersonation` and `false_credentials`; a takedown route (support address) with a 24-hour target; `pro_admin_remove_stylist` | SmartCloset does not verify anyone, and every stylist-facing and client-facing screen says so |
| **Closet scraping** by a stylist onboarding many clients | Zero access until the client ticks it; selected pieces possible; 90 days; at most 200 closet pages a day per connection and 600 per stylist, and 3,000 photos a day per stylist; 25 active clients; ten connections that the clients end within 48 hours of starting, in 30 days, hold new invites automatically (a stylist who removes junk redemptions does not trigger it); client sees view counts; no download or share; memory only; terms forbid copying and AI training | Screenshots cannot be prevented, and revocation cannot recall what was seen |
| **A client will not pay** | SmartCloset is not a party, takes no money and arbitrates nothing; the stylist can end the connection, block, or report threats; stylists are told to agree terms and take payment before delivering work; there is no public list of "bad clients" (defamation and privacy exposure) | The payment risk is the stylist's; expect support mail |
| **Scam payment requests** (gift cards, crypto, wire, overpayment) | Refused in every text field; a "Never pay by gift card, crypto or wire. SmartCloset does not handle payments" line on the accepted-connection safety card | Off-platform scams by other channels |
| **Grooming, unsafe in-person meetings, minors** | 18+ attestation enforced server-side; text only; place field refuses contact details; a "Meeting safely" card on every in-person session; reasons `underage`, `unsafe_meeting`; safety reports read first; suspension of the pro membership | Self-attested age is weak; the person reviewing reports is the capacity limit, which is why there is no directory |
| **Ban evasion** by re-registering, or by closing and re-creating a profile | Suspension is a person's decision on the account's pro membership; removals, holds and approval live on `pro_members` and survive closing and re-creating the profile, and `save_stylist_profile` re-checks the last 14 days of reports; new accounts need 48 hours before they can create invites | A new email address. A deleted account takes its suspension and the reports about it with it (the existing rule), so a person reported for something serious can delete and re-register. A suppression record is open decision 7 and is **not** built in the first release |
| **Report brigading** to knock out a rival | 6.4: only reports from people who really worked with the stylist (an account at least 48 hours old and a connection of 24 hours or 3 messages **from the person reported**, so a throwaway account cannot qualify itself by writing to the stylist) count toward the automatic effect, which is a reversible hold on new invites that releases itself after 7 days; invite-preview reports never count; the 20-a-day report limit and refused anonymous sign-ins bound throwaway accounts | A stylist's own clients could collude (for at most 7 days at a time) |
| **Abuse through closet text** (a hostile client puts harassment, a number or a link in a piece name) | Closet text is cleaned and capped before a stylist sees it (name 120 and other fields 60 characters, bounded lists); the stylist can end, block or report (`harassment`) | Short abusive or contact text can still pass; the stylist's tools are report, block and end |
| **A photo that shows more than clothes** (faces, children, rooms, location) | Location and camera data are removed from every photo a stylist is served; the terms and the consent forbid sharing pieces whose photos show people, especially children, and say that a photo can show more than the clothes; the sharing choice has no default and the picker repeats the rule; sharing is off until chosen and ends in 90 days | The picture itself can still show a face or a room; there is no scan in the first release (reports and the written rule are the control) |
| **Code leaked and redeemed by a stranger** | Single use; the stylist sees every new connection and can end it; caps | The stylist must watch their list |
| **Bypass**: calling tables or functions directly with forged arguments | No privileges and no policies on pro tables; definer functions re-check everything; named parameters; the API script (9.4) tries every table and function as anon and as the wrong user | |
| **Enumeration**: using the app to learn who has an account | No email lookup; one `invite_invalid` result for every failure; 10 lookups an hour, failed ones counted too | |

### 6.7 Moderation operations

- **The queue** is the view `pro_moderation_queue`; **new stylists** are in `pro_review_queue`. Both are read in the Supabase SQL editor (service role). Order of reading: `underage`, `unsafe_meeting`, threats, then the rest.
- **Being told.** `pro_send_report_digest()` runs hourly and posts numbers only (how many, how old) to the webhook stored in Vault as `swap_report_webhook` (the one alert channel for both features). The 24-hour wording in the app and the notes is an aim, and is true only while that alert is verified to arrive (a real test report, 11.1 P5). Until then the lead rewords the aim in `proRules.ts` to "as soon as we can".
- **Actions:** `pro_admin_hold_stylist`, `pro_admin_release_stylist`, `pro_admin_approve_stylist`, `pro_admin_suspend`, `pro_admin_unsuspend`, `pro_admin_remove_stylist`, `pro_admin_restore_stylist`; mark a report handled with `update content_reports set reviewed_at = now(), outcome = '...' where id = '<report id>'`. A hold made by reports or churn releases itself after 7 days unless a person confirms it with `pro_admin_hold_stylist` (an admin hold never expires); a suspension and a removal are always a person's decision.
- **Switches:** `pro_set_enabled(false)` pauses the whole feature without a release; the safety actions (stop sharing, end, block, report, export) keep working while it is off.
- **`docs/MODERATION.md`** gains a section "Professional accounts" with this content (stream POL, 10): the queue views, the seven actions, the switch, the order of reading, the review of new stylists, what a report contains, that reports are deleted with either account, and that a retained suppression record, if the owner adopts one, changes the privacy page. The file is public (`docs/` is served by GitHub Pages) and contains no secret.

### 6.8 Public policy wording

**`docs/privacy.html`** (stream POL; published before the build, with one new "Last updated" date; the intro sentence "optionally connect with a personal stylist or friends and swap pieces of clothing with them" stays, because it is now true and `privacyPolicy.test.ts` requires it):

| Landmark | Change |
| --- | --- |
| Table row "Social & marketplace" | Rename to "Friends" and remove "appointments if you use the stylist marketplace" (there is no marketplace). POL updates the order and row-name assertions in `__tests__/docs/privacyPolicy.test.ts` in the same change |
| New table row, after "Clothing swaps (optional)" | "Working with a stylist (optional)". What: "If you become a stylist: your professional profile (display name, headline, bio, services, languages and rates you write), your invite codes, each with an optional private label that only you see, that you confirmed you are 18 or over and the version of the stylist terms you agreed to. If you work with a stylist: the name you choose to show them, the pieces of your closet you choose to share and when, looks, sessions (each with the offset from UTC of the device that proposed it) and messages exchanged with them, and the version of the client terms you agreed to." Why: "Letting you work with a stylist you choose" |
| New section after "Clothing swaps (optional)": **Working with a stylist (optional)** | Paragraphs: *Independent professionals* (stylists are independent; SmartCloset does not check or vouch for them and is not a party; no payments, ever); *Who can see what* (connecting shares nothing; the closet only if you switch it on, all pieces or the ones you pick, never the wishlist; the exact list of fields in 5.1; never prices, notes, tag text, wear history, body profile, skin tone, face photo, location (a session shows only the proposer's offset from UTC, a time and not a place), email or phone; a look keeps the name and category of each piece in it, and the stylist sees whether and when a look was opened; photos are sent without location or camera details, and a photo can show more than the clothes); *Your control* (switch off any time; it also ends after 90 days; we can't take back what a stylist already saw; you can see when your closet was last viewed and how many times); *Messages and sessions* (stored on our servers, not end-to-end encrypted, read only on a report or to run the service); *Age* (18 and over for stylists and clients; the time you confirmed is stored, not your date of birth); *How long we keep it* with the table of 3.7 (messages about 30 days after a connection ends, the rest about 90 days, invite codes 30 days, counters 2 days, reports with either account); *If you delete your account* (your side is deleted; for a client, the looks and sessions of the connection are deleted and the stylist keeps a "Former client" line with dates for about 90 days; for a stylist, the client keeps looks and session records for about 90 days labeled "Former stylist") |
| "Where your data is stored" | Add: "a stylist can see a client's closet pieces only while the client has switched sharing on; each photo is fetched through our server, which checks that sharing is still on and removes location and camera details before sending it" |
| "Usage limits" row | Add "limited stylist actions" to the sentence that lists the counted actions (counters for invite codes, lookups, closet pages, photos and messages; numbers only). POL keeps the `privacyPolicy.test.ts` text assertions in step |
| "Community & safety" | Add reports from stylists and clients, the evidence copy (last 30 messages or the item reported), and that blocking in one place applies to friends, swaps and stylists |
| "Delete your account" | Add "stylist profile, invites, connections, shared-closet settings, looks, sessions and messages" |
| "Children's privacy" | Add "Working with a stylist is for people 18 and over." |
| "How long we keep it" list | One line pointing to the stylist retention table |

**`ios/smartcloset/PrivacyInfo.xcprivacy` and the App Store Connect privacy label: no new data type.** The feature adds profile text and messages (already declared as Other User Content and Emails or Text Messages), the chosen name (Name), shared closet pieces (Photos or Videos, Other User Content), all linked, none for tracking, purpose App Functionality. No phone number or email is collected for it, no required-reason API is added, and `Info.plist` is unchanged (no calendar, contacts or push). The owner re-reads the label against 5.1 before submission. **Separately and already true today:** skin tone and body type are collected into `body_profiles` and are not covered by a specific declaration; that is out of scope here only because this feature does not share them, and becomes blocking the moment a Phase 2 scope does (11.3).

**Contact.** `SUPPORT_EMAIL` is a personal Gmail address. The terms, the guidelines and the privacy page publish it. The owner decides before release whether to use a role address (11.2, question 6).

### 6.9 App Review notes and mapping

Draft notes (App Store Connect, by hand; credentials entered there only): where the feature is (Home > Stylists, Settings > Professional); two demo accounts, a stylist (approved) and a client, already connected, with a few pieces shared and sample content marked as demo (an account created for the review could not create a code for its first 48 hours, so the reviewer is told to use the demo stylist and make a fresh code there; the lead may also set `min_account_age_hours` to 0 for the review period and back); the invite code flow; that nothing is shared on connecting; that every message, look, session and profile has **Report** and **Block**, and so does the shared closet a stylist browses (a flag in the header of the closet screen and a "Report or block" row on every piece), because a stylist reads photos and text a stranger typed and those photos get no automated safety check (guideline 1.2); the in-app terms and guidelines; that new reports are reviewed by a person with the aim of 24 hours and an hourly alert (only if verified, 11.1 P5); that the filtering is "scam and payment wording refused in every field the other person reads, and an objectionable-term list that must be loaded before the feature can be switched on"; the support address; "No payment is made in the app. Rates are text typed by the stylist. Services are real-world one-to-one styling consultations arranged and paid for outside the app. No app feature is unlocked by payment."; that the directory is not in this build.

| Guideline | How it is met |
| --- | --- |
| 1.2 user-generated content | Terms with zero tolerance; filtering (6.3; the 50-term list is a precondition of switching the feature on); report on profile, message, look, session; block; published contact; timely response with an alert; server kill switch |
| 3.1.1, 3.1.3(d), 3.1.3(e) | No payment, fee, commission, "paid" flag, price badge or unlock exists. If a fee for digital features (featured placement, pro tools) is ever charged, it is in-app purchase (3.1.1) and needs the Paid Applications Agreement first |
| 5.1.1 privacy, data minimisation, deletion | Nothing shared by default; fixed column lists, no storage path or account id, location and camera data removed from photos; policy updated first; account deletion removes both roles' data; export includes a pro section |
| 5.1.1(v) | **Release blocker independent of this feature:** Sign in with Apple token revocation is not implemented on account deletion (11.1, P8) |
| 5.1.2 | No third-party AI or data sharing; consent for the closet is explicit, versioned and revocable |
| 2.3.1 hidden features | The feature ships visible with demo accounts; the directory is described as not present, not hidden behind a switch |
| 4.x / developer account | The owner is an individual developer account: the seller name on the App Store is their legal name and they carry personal liability. Form an entity before any directory, fee or money (11.2, question 8) |

---

## 7. Client app

All screens and components are new files with a `Pro` prefix, written against the UI kit (`src/ui`: `Screen`, `Card`, `Text`, `Button`, `Badge`, `Avatar`, `EmptyState`, `Skeleton`, `Sheet`) and `useTheme()`, the way `FriendsScreen` and the swap screens are. The old screens are deleted, not patched (7.11); their layouts are visual references only.

### 7.1 What changes, at a glance

| Old (simulation, hidden) | New |
| --- | --- |
| Mode chosen on first run, stored on the device, three tab sets (`user`, `stylist`, `client`) | Roles come from the server. Two tab sets: `user` (unchanged) and `stylist` (new contents). A client is a connection reached from Home > Stylists |
| `stylistService`, `marketplaceService`, `messagingService`, `accountService` (AsyncStorage and direct table access) | `proService.ts` (RPCs only), `proErrors.ts`, `proPhotoUrls.ts`, `proEntry.ts`, `proFormat.ts`, `useProAccess`, `useProBadge`; `accountService.ts` shrinks to the device preference |
| 22 pro screens, about 10,200 lines | 12 new screens, 22 new components and one edge function (`pro-photo`) |
| Seeded fake stylists, ratings, bookings | Nothing seeded. Demo data removed; the old device-local stores are purged once |

### 7.2 Navigation

**Tab sets** (`ModeAwareTabs` in `App.tsx`):

| Key | Tabs | When |
| --- | --- | --- |
| `user` | `Home`, `Wardrobe`, `Outfits`, `Wishlist`, `Settings` (names pinned by `navigationRoutes.test.ts`; unchanged) | Always, unless the stylist workspace is active |
| `stylist` | `Clients` (`ProClientsStack`), `Schedule` (`ProScheduleStack`), `Messages` (`ProInboxStack`), `Settings` (`SettingsScreen`, label "Settings") | `PRO_MODES_ENABLED` and the saved mode is `stylist` **and** the server confirms an active stylist role |
| `client` | removed | |

Tab icons (Ionicons, as today): Clients `people-outline`, Schedule `calendar-outline`, Messages `chatbubbles-outline`, Settings `person-outline`. Every `Tab.Navigator` keeps `screenOptions={tabScreenOptions}` (`keyboardGuard.test.tsx`).

**Stacks and routes** (flat files in `src/screens`, each registered as `<Stack.Screen name="X" component={XScreen} options={{ headerShown: false }} />` on one line):

| Stack | Route | File | Params |
| --- | --- | --- | --- |
| `HomeStack` (after the four swap routes; replaces `StylistMarketplace`, `StylistProfileView`, `BookStylist`) | `ProHome` | `ProHomeScreen.tsx` | `{ open?: 'stylist_setup' \| 'redeem' }` |
| | `ProConnection` | `ProConnectionScreen.tsx` | `{ connectionId: string }` |
| | `ProShare` | `ProShareScreen.tsx` | `{ connectionId: string }` |
| | `ProRecommendation` | `ProRecommendationScreen.tsx` | `{ recId: string; connectionId: string }` |
| | `ProThread` | `ProThreadScreen.tsx` | `{ connectionId: string }` |
| `ProClientsStack` (stylist tab `Clients`) | `ProClients` (root) | `ProClientsScreen.tsx` | none |
| | `ProClientDetail` | `ProClientDetailScreen.tsx` | `{ connectionId: string }` |
| | `ProClientCloset` | `ProClientClosetScreen.tsx` | `{ connectionId: string }` |
| | `ProLookEditor` | `ProLookEditorScreen.tsx` | `{ connectionId: string; recId?: string }` |
| | `ProRecommendation`, `ProThread` | as above | as above |
| `ProScheduleStack` (tab `Schedule`) | `ProSchedule` (root), `ProThread` | `ProScheduleScreen.tsx` | none |
| `ProInboxStack` (tab `Messages`) | `ProInbox` (root), `ProThread` | `ProInboxScreen.tsx` | none |

Params are IDs only, never whole objects (the old screens passed stale objects). Types: `src/types/proRoutes.ts` (`ProHomeParams`, ...).

**Every `navigate()` the new code makes** (so `navigationRoutes.test.ts` resolves it without an exception):

| From | To | Form |
| --- | --- | --- |
| Home cell | `ProHome` | `navigate('ProHome')` (and `navigate('ProHome', { open })` from the onboarding intent) |
| `ProHome` row | `ProConnection` | `navigate('ProConnection', { connectionId })` |
| `ProConnection` | `ProShare`, `ProRecommendation`, `ProThread` | same stack |
| `ProShare` (empty closet) | `AddClothing` | `navigate('AddClothing')` (`HomeStack` registers it) |
| `ProClients` row | `ProClientDetail` | same stack |
| `ProClientDetail` | `ProClientCloset`, `ProLookEditor` (new or a draft), `ProRecommendation` (a sent look), `ProThread` | same stack |
| `ProSchedule` row | `ProThread` | same stack; and `navigate('Clients', { screen: 'ProClientDetail', params: { connectionId } })` (nested form, resolves in the stylist tab set) |
| `ProInbox` row | `ProThread` | same stack |
| Guest lines | `SignIn` | `navigate('SignIn')` (HomeStack has it) |

`ProRecommendation`, `ProThread`, `ProClientCloset` and `ProLookEditor` navigate nowhere except `goBack()` (`ProShare` navigates only to `AddClothing`, in its empty-closet state): a draft is always opened in the editor from `ProClientDetail`, so `ProRecommendation` has no route to the editor and registers cleanly in `HomeStack` too. **Shared components under `src/components` contain no `navigate()` call**; they take callbacks (the route audit reads each screen's imported components one level deep). `SettingsScreen` navigates nowhere (it has no `navigate()` today and keeps it that way): the Professional section uses sheets and the mode switch, not routes.

**Route-audit facts the integration pass must respect** (`__tests__/navigationRoutes.test.ts`): imports in `App.tsx` are exactly `import XScreen from './src/screens/XScreen';` (single quotes, no extension, flat `.tsx`), or a screen is silently unaudited; a stack is `const FooStack = () => {` ... a line that is exactly `};`; a `Tab.Screen` has `name="X" component={Y}` with a bare identifier; the property names `nav:` and `screen:` are read as navigation targets, so no pro code uses them for anything else; dynamic `navigate(variable)` forms are not used. Two guards count tab sets and change on purpose (INT-MODE edits them, 10): `navigationRoutes.test.ts` expects the keys `['stylist','user']` instead of `['client','stylist','user']`, and `keyboardGuard.test.tsx` expects at least 2 `Tab.Navigator`s with `screenOptions={tabScreenOptions}` instead of 3.

### 7.3 Account-type onboarding, Home, and the Settings section

**First-run prompt (`ProOnboardingScreen`).** Replaces the old `AccountTypeOnboardingScreen`, with the same mechanism: shown once per signed-in account per device while `PRO_MODES_ENABLED` is true (`hasCompletedModeOnboarding(uid)` reads the existing `@smartcloset_mode_onboarded_<uid>` flag; no new key). Rendered outside the providers, like today. Three choices, no "bit of both" (roles are additive and can be added later):

| Choice (title / subtitle) | Effect |
| --- | --- |
| **Just for me** / "Your closet, outfits and wishlist." | Marks onboarding complete. Nothing else |
| **I'm a stylist** / "Work with clients. You'll set up a short profile." | Marks complete; sets the in-memory intent `stylist` (`proEntry.ts`) |
| **I work with a stylist** / "You'll need a code from your stylist." | Marks complete; sets the intent `client` |

Footer line: "You can change this any time in Settings > Professional. Stylists are independent professionals; SmartCloset does not check or vouch for them." The screen takes `{ userName, onComplete(choice) }`. After the app opens, **Home** reads and clears the intent on focus (`takeProEntry()`) and navigates `ProHome` with `open: 'stylist_setup'` or `'redeem'`; `ProHome` opens the matching sheet and clears the param. Closing the sheet leaves the person with no role, and nothing is created. Existing users, who have no flag stored, see this prompt once after the flag is flipped.

**Home cell.** In the signed-in spread of `HomeScreen`'s cells, guarded by `PRO_MODES_ENABLED`: label **Stylists**, icon `color-wand-outline`, sub text from `useProBadge` ("N need you" or "Work with a stylist"), `onPress: () => navigation.navigate('ProHome')`. `useProBadge` is called **before** Home's own `useFocusEffect` (the Home tests keep only the last registered focus callback; swap learned this).

**Settings > Professional (`ProSettingsSection`, no props, no navigation).** Shown for signed-in users when `PRO_MODES_ENABLED` is true, directly after `<SwapSettingsSection />`. It reads `useProAccess({ refreshOn: 'mount' })` (no navigation hook, 7.5.2) and the mode context, renders nothing in `paused`, `not_deployed`, `guest`, and swallows read errors (Settings tests mock only `auth`):

| State | Rows |
| --- | --- |
| No stylist role | "Become a stylist" (opens `ProStylistProfileSheet`); "Connect with a stylist" (opens `ProRedeemSheet`) |
| Stylist role active, personal mode | "Open the Stylist workspace" (`switchMode('stylist')`); "Edit stylist profile" (opens the sheet); "Connect with a stylist" |
| Stylist role active, stylist mode | "Back to my closet" (`switchMode('user')`); "Edit stylist profile" |
| Any | "Blocked stylists and clients" (opens `ProBlockedSheet`); "Professional guidelines" (opens `ProGuidelinesSheet`) |
| Stylist role closing | "Stop being a stylist" (confirm: "Your clients will be disconnected and your profile and invite codes deleted"; calls `closeStylistProfile`) |

The old "Account Mode" card with three modes, the mode pill and the available-modes loading in `SettingsScreen` are removed. `ProHome` also shows a "Stylist workspace" card with the same mode switch, so the workspace can be reached without opening Settings.

**Mode rules.** Device preference `@smartcloset_current_mode` is `user` or `stylist` (anything else, including a stored `client`, reads as `user`). `AccountModeProvider` (kept at the same path, rewritten) loads the preference, calls `getProStatus()` once on mount and on app foreground (`AppState` `active`), and exposes `{ currentMode, switchMode, stylistAllowed, refreshRole }` where `currentMode = stylistAllowed && saved === 'stylist' ? 'stylist' : 'user'`. A suspended or closed stylist therefore falls back to the personal tabs on the next refresh. The provider swallows every failure (guest, offline, server without functions) as "not allowed" and logs nothing. Consumers must tolerate a mocked context that returns only `{ currentMode, switchMode }` (`swapIntegration.test.tsx` does), so `refreshRole?.()` and `stylistAllowed ?? false`.

### 7.4 Flags: what `PRO_MODES_ENABLED` means now

`src/config/features.ts` keeps `export const PRO_MODES_ENABLED` and its path, because six tests mock that module with a one-key factory (`{ PRO_MODES_ENABLED: false }`) and a new flag name would read `undefined` there. Its meaning is now **"this build contains the professional accounts feature and shows it"**: it gates the Home cell, the Settings section, the first-run prompt, the stylist tab set and the stored-mode honouring. It is the **build switch**; the **server switch** is `pro_enabled` (4.2). Both must be on for anything to appear.

- It stays `false` through the whole build (waves 0 to 3), so every existing suite exercises the unchanged app.
- It is flipped to `true` **last**, by the lead, in one commit, after the migrations are applied, the privacy page is published and the two-phone walkthrough has passed (11.1, P9). **Before that commit** the lead runs the whole `npx jest` run, `npm run typecheck` and `npm run lint` with the flag set to `true` in the working tree: six suites mock the flag (`AppModeGate`, `Settings`, `ratingsIntegration`, `settingsWardrobeFor`, `swapIntegration`, `accountMode`), but `App`, `HomeScreen`, `WishlistSeparation` and `homeWardrobeFor` read the real value, and the first-run prompt, the Home cell and the badge change what they render, so without this run the shipped configuration is never tested. That commit also changes the one assertion `accountMode.test.ts` has on the real value (`ships off` becomes `ships on`) and nothing else.
- The walkthrough (P6) needs a build that shows the feature. The lead makes an internal TestFlight build from a working tree with the one-line local edit `PRO_MODES_ENABLED = true`, distributes it to the testers only and discards the edit; the committed value stays `false` until P9, and every build that goes anywhere else until then is a flag-off build.
- The doc comment in `features.ts` is rewritten (INT-MODE) to say this; the old text about a simulation is deleted.

### 7.5 Contract files (stream PC0)

| File | What it is |
| --- | --- |
| `src/types/pro.ts` | Types only (7.5.1), plus `AccountMode = 'user' \| 'stylist'` |
| `src/types/proRoutes.ts` | Route param types of 7.2 |
| `src/config/proRules.ts` | `PRO_STYLIST_TERMS_VERSION`, `PRO_CLIENT_TERMS_VERSION`, `PRO_SHARE_TEXT_VERSION` (all `'2026-10'`); `PRO_LIMITS` (mirrors `pro_limit()`, 4.3); text lengths; `PRO_SERVICES` (id + label: `wardrobe_audit` "Wardrobe audit", `personal_shopping` "Personal shopping", `outfit_styling` "Outfit styling", `color_analysis` "Color analysis", `event_styling` "Event styling", `virtual_sessions` "Virtual sessions", `in_person_sessions` "In-person sessions"); `PRO_LANGUAGES` (code + label, about 20); `PRO_REPORT_REASONS`; `PRO_POLL_MS = 15000`; `PRO_PHOTO_TTL_SECONDS = 600`; `PRO_ALIAS_RANGE`; `PRO_NO_PAYMENT_LINE`; `PRO_INDEPENDENT_LINE`; the terms, guidelines, safety tips, quick replies, consent text and every message of Appendix A as exported constants; `looksLikePaymentTalk`; the paused, not-deployed and update-required messages |
| `src/services/proErrors.ts` | `ProError` (`code`, `detail`, `hint`), the `KNOWN` list of 4.4, `toProError(error)` (PostgREST `message`, `details`, `hint`; `PGRST202`, `42883`, 404, "could not find the function" give `not_deployed`; network failures give `offline`), `proErrorMessage(error, fallback)` (plain text, Appendix A.4, never a code, a status, or the words "block" or "report" for a neutral ending) |
| `src/services/proService.ts` | The only module screens call (7.6). Exports its row mappers and `PRO_RPC_COLUMNS` for the tests (9.3) |
| `src/services/proPhotoUrls.ts` | `proPhotoSource(connectionId, itemId)` returns `{ uri, headers }` for the `pro-photo` function (the project's functions address plus the two ids, with the signed-in user's token; null for a guest) and `clearProPhotoCache()` (clears the helper's memo). No signing, no storage path, nothing persisted |
| `src/services/proEntry.ts` | In-memory intent (`setProEntry('stylist' \| 'client')`, `takeProEntry()`, `resetProEntry()`); no storage |
| `src/utils/proFormat.ts` | `newClientRef()` (uuid v4), `formatSession(startsAtIso, utcOffsetMinutes, viewerTz?)` (a time in the viewer's zone, with the proposer's time and their offset from UTC in brackets when it differs from the viewer's at that moment: "Sat, Oct 24, 3:00 PM (11:00 PM their time, UTC+1)"; a zone name is never shown; falls back to the ISO local time if `Intl` is missing), `sessionWhen(appointment)` (the same, with the offset shown only when the other side proposed it), `deviceUtcOffsetMinutes(at)` (what a proposal sends: minutes east of UTC, rounded to a quarter hour and kept to -720..840), `utcOffsetLabel(minutes)`, `statusLabel(kind, status, mine)`, `closedExplanation(endedBy)`, `systemLineText(code)`, `groupCode(code)` (`XXXXX-XXXXX`), `normaliseCode(input)` (client-side mirror of `pro_norm_code`), `connectionTitle` |
| `src/hooks/useProAccess.ts` | 7.5.2 |
| `src/hooks/useProBadge.ts` | `useProBadge(enabled: boolean): number`; focus refresh; any failure is 0; never throws or logs |

#### 7.5.1 Types (the shapes the screens rely on)

```ts
export type AccountMode = 'user' | 'stylist';
export type ProRole = 'stylist' | 'client';
export type ProErrorCode = /* every message of 4.4 */ | 'not_deployed' | 'offline' | 'unknown';

export interface ProStatus {
  proEnabled: boolean; suspended: boolean; adultConfirmed: boolean; stylistRemoved: boolean;
  versions: { stylistTerms: string; clientTerms: string; shareText: string };
  stylist: null | { termsCurrent: boolean; accepting: boolean; approved: boolean; invitesHeld: boolean;
                    activeClients: number; clientLimit: number; liveInvites: number; inviteLimit: number };
  client: { termsCurrent: boolean; connections: number; connectionLimit: number };
  badge: number;
}
export interface StylistProfile { displayName: string; headline: string; bio: string; services: string[];
  languages: string[]; ratesText: string; accepting: boolean; approved: boolean; invitesHeld: boolean; createdAt: string }
export type StylistProfileInput = Pick<StylistProfile, 'displayName'|'headline'|'bio'|'services'|'languages'|'ratesText'|'accepting'>;
export interface ProInvite { id: string; code: string; label?: string; status: 'live'|'expired'|'used'|'revoked';
  createdAt: string; expiresAt: string; usedAt?: string; connected: boolean }
export interface InvitePreview { inviteId: string; alreadyConnected: boolean; clientTermsCurrent: boolean;
  stylist: { name: string; headline: string; bio: string; services: string[]; languages: string[]; ratesText: string } }
export interface ProConnectionSummary { id: string; myRole: ProRole; otherLabel: string; otherHeadline?: string;
  status: 'active'|'ended'; endedBy?: 'client'|'stylist'|'system'; startedAt: string; endedAt?: string;
  lastActivityAt: string; unread: number; attention: boolean; nextAppointmentAt?: string; pendingAppointments: number;
  closetShared: boolean; closetExpiresAt?: string; lastMessagePreview?: string; lastMessageAt?: string }
export interface ProConnectionDetail { id: string; myRole: ProRole; status: 'active'|'ended'; endedBy: null|'me'|'them';
  startedAt: string; endedAt?: string; otherLabel: string; myAlias: null | string; safetyOnly: boolean; stylist: null | InvitePreview['stylist'];
  closet: { shared: boolean; itemMode: null|'all'|'selected'; itemCount: null|number; expiresAt: null|string;
            expiresSoon: boolean; lastViewedAt: null|string; views30d: number };
  counts: { looks: number; upcoming: number };
  actions: { canMessage: boolean; canPropose: boolean; canRecommend: boolean; canEnd: boolean;
             canViewCloset: boolean; canShare: boolean; canStopSharing: boolean; canRename: boolean } }
export interface ProGrant { scope: 'closet'; enabled: boolean; itemMode: null|'all'|'selected'; itemIds?: string[];
  itemCount?: number; grantedAt?: string; expiresAt?: string; expiresSoon?: boolean; textVersion?: string;
  lastViewedAt?: string; views30d?: number; events?: { event: string; itemMode?: string; itemCount?: number; at: string }[] }
export interface ProClosetItem { id: string; name: string; category: string; subcategory?: string; color?: string;
  brand?: string; season?: unknown; pattern?: string; material?: string; materials?: unknown; size?: string;
  condition?: string; hasPhoto: boolean }
export interface ProLookSummary { id: string; status: 'draft'|'sent'|'viewed'|'implemented'; title: string; itemCount: number;
  coverItemId?: string; coverPhotoPath?: string /* the client's own, never a stylist's */; sentAt?: string; viewedAt?: string; updatedAt: string; clientRating?: number; isNew: boolean }
export interface ProLookDetail { id: string; connectionId: string; status: ProLookSummary['status']; title: string; body: string;
  sentAt?: string; viewedAt?: string; implementedAt?: string;
  items: { position: number; itemId?: string; name: string; category?: string; color?: string; brand?: string;
           hasPhoto: boolean; photoPath?: string /* client only */; available: boolean }[];
  feedback: null | { rating?: number; comment?: string; at: string };
  actions: { canEdit: boolean; canSend: boolean; canDelete: boolean; canGiveFeedback: boolean; canMarkWorn: boolean } }
export interface ProAppointment { id: string; connectionId: string; otherLabel: string; myRole: ProRole;
  status: 'proposed'|'confirmed'|'declined'|'cancelled'|'expired'|'completed'; proposedBy: ProRole;
  startsAt: string; durationMinutes: number; mode: 'virtual'|'in_person'; place: string; note: string; utcOffsetMinutes: number;
  canConfirm: boolean; canDecline: boolean; canCancel: boolean; createdAt: string }
export interface ProMessage { id: number; from: 'me'|'them'|'system'; body: string; code?: string; at: string }
export interface ProThread { messages: ProMessage[]; hasMore: boolean; canSend: boolean }
export interface ProBlock { ref: string; label: string; blockedAt: string }
export interface ProExport { settings: Record<string, unknown>; stylistProfile: StylistProfile | null;
  invites: { createdAt: string; expiresAt: string; status: string }[];
  connections: { role: ProRole; otherLabel: string; status: string; startedAt: string; endedAt?: string;
                 grantHistory?: unknown[]; looks: unknown[]; sessions: unknown[]; myMessages: { body: string; sentAt: string }[] }[] }
export type ProReportRefType = 'connection'|'recommendation'|'appointment'|'invite';
export type ProReportReason = 'spam'|'harassment'|'inappropriate'|'impersonation'|'scam'|'unsafe'
  |'underage'|'false_credentials'|'data_misuse'|'unsafe_meeting'|'other';
```

#### 7.5.2 `useProAccess`

Returns `{ access, refresh, acceptTerms, refreshFailed }`, takes an optional `{ refreshOn?: 'focus' | 'mount'; lazy?: boolean }` (default `'focus'`, not lazy) and exports the `ProAccess` type. `access.state`:

| State | Meaning | Screens show |
| --- | --- | --- |
| `loading` | first load | skeleton |
| `guest` | `not_authenticated` | "Sign in to work with a stylist" and a Sign in button |
| `paused` | `proEnabled` false or `pro_disabled` | "Professional features are paused" and the safety-only list (7.8) |
| `not_deployed` | `PGRST202` | "Professional features aren't available yet in this version" |
| `suspended` | `status.suspended` | "Professional features are paused on your account" with Email support; ended history, Export Data, End, Block, Report and Stop sharing stay available (safety gate, 4.1) |
| `ready` | the rest | `{ status, stylist: RoleAccess, client: RoleAccess }`, where `RoleAccess` is `'available'`, `'needs_terms'` (terms not current or adult not confirmed: open `ProTermsSheet`) or `'update_required'` (the server's terms version is not the one this build carries: "Update SmartCloset to keep using professional features"; **nothing that records consent is called**; Stop sharing, End, Report and Block stay available) |
| `error` | the **first** read failed (offline, say) and there is nothing to keep | `LoadError` with `refresh` |

**A failed re-read never takes away what a screen already has.** When a screen holds a `ready`, `paused` or `suspended` state and the next read fails for any reason but sign-out (`guest`), the switch (`paused`) or a server with no pro functions (`not_deployed`), the hook keeps that state and sets `refreshFailed` (cleared by the next good read). The rows on screen, and Stop sharing and End connection with them, therefore stay (7.8: "Refresh failed with data on screen"); `error` is only for a screen with nothing to keep. `lazy: true` makes the hook read nothing by itself (the state stays `loading` until `refresh()` is called): the sheets that screens mount while closed use it and read when they open, so a screen that hosts three sheets makes one status read and not four.

`acceptTerms(role, adult)` calls `acceptProTerms(role, adult)`, which sends **the build's** `PRO_*_TERMS_VERSION`, never a caller's or the server's, and then refreshes. It refuses (does nothing) unless the role is `needs_terms`. With `refreshOn: 'focus'` (the default) it refreshes on focus with `useFocusEffect`, like `useSwapAccess`, and so needs a navigation context. With `refreshOn: 'mount'` it refreshes in a plain `useEffect` and uses **no navigation hook**: `ProSettingsSection` and every sheet that can be mounted outside a screen's navigation context (`ProTermsSheet`, `ProRedeemSheet`, `ProStylistProfileSheet`) call it that way (a sheet also passes `lazy: true` and calls `refresh()` each time `visible` turns true, which is its only read), because `SettingsScreen`'s tests mock only `auth` and `jest.setup.js` has no global navigation mock (7.9).

### 7.6 `proService.ts`: functions

Every function throws `ProError('not_authenticated')` for a guest **before any network call** (`supabase.auth.getSession()`), and a `ProError` for any server error. None runs at import, none touches AsyncStorage, none opens a realtime channel. Every RPC is called as `call('rpc_name', { p_arg: value, ... })` on one logical statement with a literal argument object, so `proServiceInStepWithSql.test.ts` can parse the names (9.3). Optional arguments the caller did not give are **omitted**, not sent as `undefined`.

| TypeScript function | RPC (4.6) | Arguments sent (all named) | Returns |
| --- | --- | --- | --- |
| `getProStatus()` | `get_pro_status` | none | `ProStatus` |
| `getProBadge()` | `get_pro_badge` | none | `number` (0 on any failure; never throws) |
| `acceptProTerms(role, adult)` | `accept_pro_terms` | `p_role`, `p_version` (build constant), `p_adult` | `void` |
| `getMyStylistProfile()` | `get_my_stylist_profile` | none | `StylistProfile \| null` |
| `saveStylistProfile(input)` | `save_stylist_profile` | `p_display_name`, `p_headline`, `p_bio`, `p_services`, `p_languages`, `p_rates_text`, `p_accepting` | `StylistProfile` |
| `setStylistAccepting(on)` | `set_stylist_accepting` | `p_accepting` | `void` |
| `closeStylistProfile()` | `close_stylist_profile` | none | `void` |
| `createProInvite({ label?, clientRef })` | `create_pro_invite` | `p_client_ref`, `p_label` | `ProInvite` |
| `listMyProInvites()` | `list_my_pro_invites` | none | `ProInvite[]` |
| `revokeProInvite(id)` | `revoke_pro_invite` | `p_invite` | `void` |
| `previewProInvite(code)` | `preview_pro_invite` | `p_code` | `InvitePreview`; a `{ valid: false }` result is thrown as `ProError('invite_invalid')` |
| `redeemProInvite(code, alias)` | `redeem_pro_invite` | `p_code`, `p_alias` | `{ connectionId, alreadyConnected }`; an `{ ok: false }` result is thrown as `ProError('invite_invalid')` |
| `listProConnections(as)` | `list_pro_connections` | `p_as` | `ProConnectionSummary[]` |
| `getProConnection(id)` | `get_pro_connection` | `p_connection` | `ProConnectionDetail` |
| `endProConnection(id)` | `end_pro_connection` | `p_connection` | `void` |
| `setProAlias(id, alias)` | `set_pro_alias` | `p_connection`, `p_alias` | `void` |
| `getProGrant(id)` | `get_pro_grant` | `p_connection` | `ProGrant` |
| `setProGrant(id, { enabled, itemMode?, itemIds?, renew? })` | `set_pro_grant` | `p_connection`, `p_scope: 'closet'`, `p_enabled`, `p_item_mode` (required when enabling), `p_item_ids`, `p_text_version` (build constant, **only when enabling**; never sent when disabling), `p_renew` | `ProGrant` |
| `getClientCloset(id, { offset?, limit? })` | `get_client_closet` | `p_connection`, `p_offset`, `p_limit` | `{ items: ProClosetItem[]; total: number }` |
| `saveProLook({ connectionId, id?, title, body, itemIds?, clientRef? })` | `save_pro_recommendation` | `p_connection`, `p_id`, `p_title`, `p_body`, `p_item_ids` (**omitted when `itemIds` is undefined**: the items stay as they are), `p_client_ref` | `{ id, status, updatedAt }` |
| `sendProLook(id)` / `deleteProLook(id)` | `send_pro_recommendation` / `delete_pro_recommendation` | `p_id` | `void` |
| `listProLooks(connectionId, { before?, limit? })` | `list_pro_recommendations` | `p_connection`, `p_before`, `p_limit` | `ProLookSummary[]` |
| `getProLook(id)` | `get_pro_recommendation` | `p_id` | `ProLookDetail` |
| `giveLookFeedback(id, { rating?, comment?, worn? })` | `give_recommendation_feedback` | `p_id`, `p_rating`, `p_comment`, `p_worn` | `void` |
| `proposeProSession(input)` | `propose_pro_appointment` | `p_connection`, `p_starts_at`, `p_duration_minutes`, `p_mode`, `p_place`, `p_note`, `p_utc_offset_minutes` (this device's offset from UTC at the start, unless the input gives one; never a zone name), `p_client_ref` | `{ id, status }` |
| `respondProSession(id, action)` | `respond_pro_appointment` | `p_appointment`, `p_action` | `void` |
| `cancelProSession(id)` | `cancel_pro_appointment` | `p_appointment` | `void` |
| `listProSessions({ connectionId?, scope })` | `list_pro_appointments` | `p_connection`, `p_scope` | `ProAppointment[]` |
| `sendProMessage(connectionId, body, clientRef)` | `send_pro_message` | `p_connection`, `p_body`, `p_client_ref` | `{ id, at }` |
| `getProThread(connectionId, { afterId?, beforeId?, limit? })` | `get_pro_thread` | `p_connection`, `p_after_id`, `p_before_id`, `p_limit` | `ProThread` |
| `reportProContent({ refType, refId, reason, details?, messageId? })` | `report_pro_content` | `p_ref_type`, `p_ref_id`, `p_reason`, `p_details`, `p_message_id` | `void` |
| `blockProMember({ connectionId?, inviteId? })` / `listProBlocks()` / `unblockProMember(ref)` | `block_pro_member` / `list_pro_blocks` / `unblock_pro_member` | `p_connection` or `p_invite` / none / `p_ref` | `void` / `ProBlock[]` / `void` |
| `exportMyProData()` | `export_my_pro_data` | none | `ProExport` |

Mapping: tables come back snake_case and are mapped to the camelCase types above; jsonb results are already camelCase. Dates stay ISO strings. The service never returns an account id because none is ever sent. The row mappers are exported (`mapConnectionRow`, `mapLookRow`, `mapAppointmentRow`, `mapClosetRow`, `mapInviteRow`, `mapStatus`, ...) together with `PRO_RPC_COLUMNS`, a map from RPC name to the snake_case columns (tables) or camelCase keys (jsonb) its mapper reads; `proServiceInStepWithSql.test.ts` compares it with the SQL `returns table` lists, and the live Jest file feeds real responses through the mappers (9.3, 9.4), so a renamed column cannot break every screen with all suites green. `PRO_RPC_COLUMNS` lists only the top level of each jsonb answer, so a second map, `PRO_RPC_NESTED`, lists the keys one level down that the mappers also read (`closet.*`, `actions.*`, `counts.*`, `stylist.*`, `versions.*`, `client.*`, `items[].*`, `events[].*`, `messages[].*`, `feedback.*`): the in-step test finds each part in the SQL, built by one `jsonb_build_object` call with every one of those keys, and the live test checks real answers. Without it a renamed `closet.itemMode` would break a screen with every suite green.

### 7.7 Screens and components

Visual rules: new standalone screens use `Screen`, `Card`, `Text`, `Button`, `Badge`, `Avatar`, `EmptyState`, `Skeleton`, `Sheet` and `useTheme()`. Per-person menus (Report or block) are sibling `Pressable`s, never nested in a card. Every screen starts with `useProAccess()` and renders one plain state per non-`ready` state (the shared `ProAccessNotice` component of PUI1 draws it, so no screen file imports another). Lists load on focus with `useLoadable`/`LoadError` (full when nothing is on screen, banner when data is); every read has a request-sequence guard so a late answer is dropped. Every write that fails keeps its input and reuses its `clientRef` on retry. A signed-in `pro_terms_required` on a write opens `ProTermsSheet` and retries the same action after acceptance. In the states `paused`, `suspended`, `update_required` and `needs_terms`, `ProHomeScreen` and `ProConnectionScreen` render `ProAccessNotice` and then a **safety-only** version of their content (connections listed from `listProConnections`, with Stop sharing, End connection, Report or block, and read-only ended history), because those actions need no terms and no switch (4.1).

#### Shared parts (stream PUI1, `src/components`)

| Component | Props | Behaviour |
| --- | --- | --- |
| `ProPhoto` | `{ connectionId?: string; itemId?: string; ownPath?: string \| null; hasPhoto?: boolean; style?; accessibilityLabel? }` | With `connectionId` and `itemId` (a stylist viewing a client's piece) it asks `proPhotoSource` for the request and draws the image served by the `pro-photo` function; with `ownPath` (a client viewing their own piece) it uses the app's normal own-photo signing. A placeholder while loading, when `hasPhoto` is false, on a `404` or any error; on an image error it tries once more. It never shows or stores a path |
| `ProStatusBadge` | `{ kind: 'connection' \| 'look' \| 'session'; status: string; mine?: boolean }` | `Badge` with `statusLabel`, tone by status |
| `ProStylistCard` | `{ stylist: InvitePreview['stylist']; compact?: boolean }` | Name, headline, bio, service chips, languages, "Rates (set by the stylist)" and the lines `PRO_NO_PAYMENT_LINE` and `PRO_INDEPENDENT_LINE`. No rating, badge or photo |
| `ProItemTile` | `{ name; subtitle?; photo?: ReactNode; selected?; onPress?; accessibilityLabel }` | A square tile used by every grid; the photo is a `ProPhoto` element passed in, so the tile knows no path |
| `ProTermsSheet` | `{ visible; role: ProRole; needsAdult: boolean; onAccepted; onClose }` | Scrolling terms for the role (Appendix A.1, A.2), an "I am 18 or older" switch when `needsAdult`, "I agree" (calls `useProAccess({ refreshOn: 'mount' }).acceptTerms`), "Not now". `terms_version_mismatch` shows "The terms were updated. Please reopen." Opened only in `needs_terms`, never in `update_required` |
| `ProGuidelinesSheet` | `{ visible; onClose }` | `PRO_GUIDELINES`, `PRO_SAFETY_TIPS`, "Email support" (`SUPPORT_MAILTO`, alert fallback) |
| `ProSafetySheet` | `{ visible; refType: ProReportRefType; refId: string; label: string; messageId?: number; connectionId?: string; inviteId?: string; onClose; onBlocked }` | One `Sheet` with steps menu, reason (`PRO_REPORT_REASONS`), details (multiline 500, `keyboardDoneProps`, `KeyboardLift`, one `KeyboardDoneBar`, label "Report details"), reported, block (offered when `connectionId` or `inviteId` is given; an invite block needs no connection). Thanks text: "Thanks for letting us know. We review reports, aiming for within 24 hours. They won't be told it was you." After a client's report with a serious reason (`harassment`, `data_misuse`, `unsafe_meeting`, `underage`) the thanks step adds "We have stopped sharing your closet with them." Block text: "They won't be able to message you or see anything you share, and your connection ends. They won't be told." A session counter ignores results that arrive after dismissal. Errors via `proErrorMessage` |
| `ProBlockedSheet` | `{ visible; onClose }` | Lists `listProBlocks()` with Unblock; empty: "You haven't blocked any stylists or clients." |
| `ProAccessNotice` | `{ access: ProAccess; role?; onSignIn?(): void; onRefresh?(): void; onReadTerms?(): void; safetyNote?: string \| null }` | The one plain empty state for each non-`ready` state of 7.5.2 (`guest` with a Sign in button, `paused`, `not_deployed`, `suspended` with Email support, `update_required`), and `LoadError` for `error`; renders nothing for `ready` and `loading`. Its titles for the paused and suspended states are `PRO_PAUSED_MESSAGE` and `PRO_SUSPENDED_MESSAGE` (never retyped), and `safetyNote` is what those two states say about the safety actions: `PRO_SAFETY_ONLY_NOTE` by default, because most screens draw the safety-only list below the notice; the Schedule and Messages tabs list no connection, so they pass `PRO_SAFETY_ELSEWHERE_NOTE` ("... from the Clients tab"), and nothing promises a button that is not there |

#### Account entry (stream PUI2)

| File | Props | Behaviour |
| --- | --- | --- |
| `src/screens/ProOnboardingScreen.tsx` | `{ userName?: string; onComplete(choice: 'personal' \| 'stylist' \| 'client'): void }` | 7.3. Rendered outside `ThemeProvider` and `NavigationContainer` (as the old screen was), so it uses local styles and not `useTheme()` |
| `ProRedeemSheet` | `{ visible; onClose; onConnected(connectionId: string): void; opensConnection?: boolean; onReport(inviteId: string, label: string): void }` | Steps in one `Sheet`: (1) code field (single line, `autoCapitalize="characters"`, `returnKeyType="go"`, accepts a pasted `XXXXX-XXXXX`); (2) `previewProInvite` result in `ProStylistCard`, plus "Nothing is shared when you connect"; (3) `ProTermsSheet`-style client terms step if `clientTermsCurrent` is false; (4) "Name your stylist will see" (alias, 2-30, `returnKeyType="done"`, prefilled with the first word of the account name); (5) "Connect" (`redeemProInvite`); (6) done: "You're connected to <name>." with "Choose what to share" if `onConnected` navigates (prop `opensConnection`, default true; Settings passes false, and the step then offers only Done, which calls `onConnected`, so a button that would do nothing is never shown). `invite_invalid` shows "That code isn't valid or has expired. Ask your stylist for a new one." `stylist_not_accepting` shows "This stylist isn't taking new clients right now." On step 2 a "Report or block" row closes this sheet and calls `onReport(inviteId, label)`; the host (`ProHomeScreen` or `ProSettingsSection`) opens `ProSafetySheet` with `refType: 'invite'` and `inviteId`, because sheets are never nested. The sheet calls `useProAccess({ refreshOn: 'mount' })` |
| `ProStylistProfileSheet` | `{ visible; onClose; onSaved() }` | Steps: stylist terms (if `needs_terms`) then the form: display name, headline, bio (multiline, `keyboardDoneProps`), service chips (closed list), language chips, rates (single line, 120, helper text "Information only. Payment is arranged directly with your clients."; its placeholder suggests no amount and no currency, because the app takes no money and must not look as if it tracks any), "Accepting new clients" switch, and a live "How clients see this" preview using `ProStylistCard`. Text-filter errors show the field and the plain reason. Saving calls `saveStylistProfile` then `refreshRole()`; `stylist_profile_removed` shows "Your stylist profile was removed. Email support if you think this is a mistake." and no form. The sheet calls `useProAccess({ refreshOn: 'mount' })` |
| `ProSettingsSection` | none | 7.3. Uses `useProAccess({ refreshOn: 'mount' })`; hosts `ProRedeemSheet`, `ProStylistProfileSheet`, `ProBlockedSheet`, `ProGuidelinesSheet` and, for an invite report, `ProSafetySheet` |

#### Client side (stream PUI3)

| File | Props | Behaviour |
| --- | --- | --- |
| `ProHomeScreen` | route `ProHomeParams` | Header "Stylists" with a menu (guidelines, blocked list, email support). Sections: **Your stylists** (rows of `ProConnectionCard`: name, headline, a dot when `attention`, last message preview; ended connections under "Past", last 10 then "Show older"), **Connect with a stylist** button (opens `ProRedeemSheet`; on `onConnected` navigates `ProConnection`), **Stylist workspace** card (become a stylist, or open the workspace with `switchMode('stylist')`). Empty state: "No stylists yet. Ask your stylist for an invite code." Opens `open` param sheets and clears the param. Hosts `ProRedeemSheet` and, for an invite report, `ProSafetySheet`. In `paused`, `suspended`, `update_required` and `needs_terms` it shows `ProAccessNotice` and the safety-only list |
| `ProConnectionScreen` | `{ connectionId }` | Header with the stylist's name and an ellipsis (`ProSafetySheet`, `refType: 'connection'`). `ProStylistCard` (collapsed after the first visit). Sections: **What <name> can see** (summary of the grant with "Change" -> `ProShare`; shows last viewed and views in 30 days), **Looks** (`ProLookCard` list from `listProLooks`, paged 20, a dot on new ones -> `ProRecommendation`), **Sessions** (upcoming and `needs_me` from `listProSessions`, "Request a session" opens `ProAppointmentSheet` in `propose` mode), **Message** (-> `ProThread`), **End connection** (confirm: "You'll stop sharing with <name> and your connection ends. This can't be undone." then `endProConnection`), **Name shown to <name>** (rename, prefilled from `myAlias`). An ended connection shows `closedExplanation` and read-only sections. A "Meeting safely" card is shown collapsed. When `safetyOnly` is true only the sharing summary with **Stop sharing**, **End connection** and the Report or block menu are shown, under the notice |
| `ProShareScreen` | `{ connectionId }` | "What <name> can see". One switch "My closet" with the consent text (`PRO_SHARE_CONSENT`, with the lines "Pieces you've added from your wishlist are never shared", "We can't take back what your stylist has already seen", "Photos can show more than the clothes", "Sharing ends after 90 days unless you renew it"). **There is no default choice:** a segmented control lists "Only pieces I choose" (opens `ProItemPicker`) and "All my pieces" (hint `PRO_SHARE_ALL_HINT`: "Includes pieces you add while sharing is on."), both unselected, and "Share my closet" stays disabled until one is picked. The confirm step shows how many pieces are being shared right now. Also the 90-day expiry date, a 7-day warning banner with "Keep sharing" (sends `renew`), and the log of `events`. Turning on calls `setProGrant` with the build's `PRO_SHARE_TEXT_VERSION`; `stale_consent_text` shows "Update SmartCloset to change sharing". **Turning off** ("Stop sharing") confirms nothing, sends no text version, is offered in every access state including `update_required`, and acts at once. **Empty closet:** a person with no pieces sees "You have no pieces to share yet" and an "Add clothing" button (`navigate('AddClothing')`) |
| `ProConnectionCard` | `{ connection: ProConnectionSummary; onPress }` | Row with `Avatar` initials, label, headline or preview, dot when `attention`, `ProStatusBadge` when ended |
| `ProItemPicker` | `{ visible; selectedIds: string[]; onDone(ids: string[]): void; onClose }` | A grid of the person's **own** non-wishlist pieces (from `getOwnedClothingItems`, which is not capped at 200 as `getClothingItems` is, since a grant allows 500), the line `PRO_PICKER_REMINDER` ("Don't pick pieces whose photos show people, especially children."), multi-select up to 500, search by name, "Select all", count |

#### Stylist side (stream PUI4)

| File | Props | Behaviour |
| --- | --- | --- |
| `ProClientsScreen` | none | Root of the Clients tab. Header "Clients" with "Invite" (opens `ProInvitesSheet`) and "My profile" (opens `ProStylistProfileSheet`). A probation banner while not approved (`PRO_STYLIST_BANNER`: "New stylists start with a limit of 3 clients and 1 live invite."). `ProClientRow` list from `listProConnections('stylist')`: client alias, last activity, dot, a "Closet shared" chip. Empty: "No clients yet. Create an invite code and give it to your first client." |
| `ProClientDetailScreen` | `{ connectionId }` | Client alias (a `Former client` stub when ended); buttons **Message**, **Closet** (-> `ProClientCloset`; disabled with "<name> hasn't shared their closet" when `!canViewCloset`), **New look** (-> `ProLookEditor`); lists of looks (drafts first, a draft opens the editor, a sent look opens `ProRecommendation`) and sessions with "Propose a session" (`ProAppointmentSheet`); menu: Report or Block (`ProSafetySheet`), End connection |
| `ProClientClosetScreen` | `{ connectionId }` | `ProClosetGrid` of `getClientCloset` pages (60, `onEndReached`), a header with the count and the expiry date, and a flag in the header, "Report or block <name>", which opens `ProSafetySheet` for the connection (a block leaves the screen); the stylist is reading photos and text a stranger typed, so the way out is one tap away (App Review 1.2). `closet_not_shared` replaces the grid with the explanation. A tap on a tile opens `ProClosetItemSheet` (every field the server returned for that piece). Pages are merged by `item_id`. Nothing can be saved, shared or downloaded |
| `ProLookEditorScreen` | `{ connectionId; recId? }` | Title (single line, 80), note (multiline, 1000, `keyboardDoneProps`), the chosen pieces (up to 12, as tiles; **reopening a draft loads them from `getProLook`, which returns each `itemId` to the stylist**) with "Add pieces" (opens `ProClosetPicker`), **Save draft** (`saveProLook`, `clientRef` made once per screen open; `itemIds` is sent only when the pieces changed, so a title-only edit leaves them alone), **Send to <name>** (`sendProLook`, confirm), Delete draft. `item_not_shared` removes the offending tile and says why |
| `ProScheduleScreen` | none | Segments Upcoming, Needs response, Past (`listProSessions` with no connection); rows are `ProAppointmentRow`; a tap opens `ProAppointmentSheet`; "Open client" nested-navigates to the client |
| `ProInboxScreen` | none | `listProConnections('stylist')` filtered to those with a last message, newest first, unread dot; a tap -> `ProThread` |
| `ProClientRow` | `{ connection; onPress }` | Row component |
| `ProClosetGrid` | `{ items: ProClosetItem[]; onEndReached?; selectable?; selectedIds?; onToggle?(id); footer? }` | Two-column grid of `ProItemTile`; read-only unless `selectable` |
| `ProClosetPicker` | `{ visible; connectionId; selectedIds; max: number; onDone(items: ProClosetItem[]); onClose }` | Sheet over `ProClosetGrid` in selectable mode, paging with `getClientCloset` |
| `ProClosetItemSheet` | `{ visible; connectionId: string; item: ProClosetItem \| null; onClose; onReport?(): void }` | Read-only details of one shared piece: a large `ProPhoto`, then name, category, subcategory, colour, brand, size, condition, pattern, material, season and materials, whichever the server returned. No actions and nothing to copy out, except "Report or block" (`onReport`): the host closes this sheet, then opens `ProSafetySheet` (sheets are never nested) |
| `ProInvitesSheet` | `{ visible; onClose }` | Lists live and recent invites with the grouped code, expiry and status; "Create invite code" (optional private label, 40, `returnKeyType="done"`; `createProInvite` with a `clientRef` made once per open); Share (the system share sheet with plain text "Join me on SmartCloset. In the app, open Home > Stylists and enter this code: XXXXX-XXXXX. It works once and expires in 7 days."); Revoke. `invite_limit` and `invites_held` explained in plain words |

#### Shared work (stream PUI5)

| File | Props | Behaviour |
| --- | --- | --- |
| `ProThreadScreen` | `{ connectionId }` | Header with the other person's label and an ellipsis (`ProSafetySheet`, `refType: 'connection'`, `messageId` on long-press of the other side's message, `connectionId` for block). Loads on focus (the latest 50); polls every `PRO_POLL_MS` (15 s) only while focused and the app is active, asking for the messages after the last id (`afterId`, oldest first, paging forward while `hasMore`) and merging by id; a "Load earlier messages" row at the top uses `beforeId`; a request sequence drops out-of-order replies; system lines from `systemLineText`; the other person's messages show the payment-talk warning chip when `looksLikePaymentTalk` (never a block) with Report; quick replies from `PRO_QUICK_REPLIES`; a multiline composer (500, counter, "Send message") that keeps its text on failure and reuses the same `clientRef`; the composer is replaced by "This connection has ended" when `!canSend`. **The composer has its own accessory id**, `PRO_MESSAGE_ACCESSORY_ID = 'smartcloset-pro-message-done'` (exported), with exactly one `<KeyboardActionBar nativeID={PRO_MESSAGE_ACCESSORY_ID} label="Done" .../>` and no `<KeyboardDoneBar />`, because `ProSafetySheet`, opened from this screen, renders the shared Done bar and two accessory views with one id can leave the composer without its bar (the swap thread hazard, swap.md 7.5) |
| `ProRecommendationScreen` | `{ recId; connectionId }` | `getProLook`. Title, note, the pieces as `ProItemTile`s (with `ProPhoto`; a piece the person no longer has is shown with its name and "no longer in your closet"), `ProStatusBadge`. Client: marks viewed by opening; **Rate** (1-5 `RatingScale`-style buttons), **Comment** (multiline, 500; **its own accessory id**, `PRO_COMMENT_ACCESSORY_ID = 'smartcloset-pro-comment-done'` (exported), with exactly one `<KeyboardActionBar nativeID={PRO_COMMENT_ACCESSORY_ID} label="Done" .../>` and no `<KeyboardDoneBar />` in the file, because `ProSafetySheet`, opened from this screen, renders the shared Done bar and two accessory views with one id can leave the field without its bar), **I wore this** toggle (`giveLookFeedback`); Report/Block menu. Stylist (sent looks only): read view with the client's rating and comment, if any |
| `ProAppointmentSheet` | `{ visible; mode: 'propose' \| 'view'; connectionId?: string; appointment?: ProAppointment; onClose; onChanged(); onReport?(appointment: ProAppointment): void }` | `propose`: date and time (`@react-native-community/datetimepicker`), length chips (15 to 480), virtual or in person, place (single line, 120, "Where? e.g. a café name, or 'video call'"), note (multiline, 280, `keyboardDoneProps`), time-zone line ("Times are in your time zone (...). They see your offset from UTC (UTC-7), not a place. ..."), "Send request" (`clientRef` once per open). `view`: all fields in the viewer's time zone, **Confirm** and **Decline** only when `canConfirm`/`canDecline`, **Cancel** when `canCancel`, the "Meeting safely" card for in-person, the line "Payment, if any, is arranged directly between you and <name>. SmartCloset does not take payments." No link field and no tappable text. A "Report this request" row (view mode) calls `onReport`; the host screen closes the sheet and opens `ProSafetySheet` with `refType: 'appointment'` (sheets are never nested) |
| `ProAppointmentRow` | `{ appointment; onPress }` | Time (viewer zone, with the other person's offset from UTC when they proposed it), other label, mode icon, and `ProStatusBadge` **under** the text, not beside it: "Waiting for your answer" is wide, and beside the text it would leave the time and the name about 95pt on a 375pt screen |
| `ProLookCard` | `{ look: ProLookSummary; onPress }` | Cover tile, title, status, rating stars if any, "New" dot |

### 7.8 States

| State | What shows |
| --- | --- |
| Loading access / data | Skeleton rows or grid |
| Guest | Empty state "Sign in to work with a stylist" with Sign in (`navigate('SignIn')`); Home hides the cell |
| Switch off (`paused`) | "Professional features are paused" (`PRO_PAUSED_MESSAGE`) plus `PRO_SAFETY_ONLY_NOTE` and the safety-only list: each connection with Stop sharing, End, Report or block, and read-only ended history. Writes elsewhere show the same text |
| `not_deployed` | "Professional features aren't available yet in this version"; Home cell and Settings section stay quiet |
| Suspended | "Professional features are paused on your account" with Email support, `PRO_SAFETY_ONLY_NOTE` and the same safety-only list; Export Data still includes the pro section |
| `update_required` | "Update SmartCloset to keep using professional features"; nothing that records consent is called; the safety-only list is shown (Stop sharing, End, Report or block) |
| Terms or age missing | `ProTermsSheet` opens by itself; behind it an empty state "Read the terms to get started" and the safety-only list (Stop sharing, End, Report or block) |
| Stylist profile missing | The workspace cannot be opened (`stylistAllowed` false); Settings offers "Become a stylist" |
| No connections | "No stylists yet. Ask your stylist for an invite code." (client) / "No clients yet. Create an invite code and give it to your first client." (stylist) |
| Connection ended | `closedExplanation`: "You ended this connection." / "This connection has ended."; composer replaced; sections read-only; a blocked connection is a stored closed shell with no content, and a deleted-account connection keeps what was already delivered (8.1); both carry the label "Former stylist" / "Former client" |
| Closet not shared | Stylist: "<name> hasn't shared their closet. You can ask them in a message." (`proClosetNotShared(name)`; without a name, the wording of A.4; one spelling, with an ASCII apostrophe, in every screen) |
| Closet empty (client) | "You have no pieces to share yet" with Add clothing (`ProShareScreen`) |
| Grant expiring | Client banner 7 days before: "Your stylist's access ends on <date>. Keep sharing?" |
| Data load failed, nothing on screen | `LoadError` "Couldn't load ..." with Try again |
| Refresh failed with data on screen | `LoadError` banner above the list. A failed re-read of the access status does not replace the page either: `useProAccess` keeps the state it had and sets `refreshFailed` (7.5.2), so the list, Stop sharing and End connection stay |
| Offline write | A short alert from `proErrorMessage`; typed text kept; retry reuses the same `clientRef` |
| `pro_unavailable` | "This is no longer available." with Back |
| Rate limited | "You're going a bit fast. Please wait a moment." |
| Text refused | The field and the plain reason ("Links and contact details can't go in a profile", "That wording isn't allowed") |

### 7.9 Keyboard, accessibility and UI rules

- **Keyboard rules** (`keyboardGuard.test.tsx` is an AST scan of every `.tsx` in `src/screens` and `src/components`): a multiline or number-keyboard field spreads `keyboardDoneProps` and its file renders exactly one `<KeyboardDoneBar />`; every other field has `returnKeyType` or spreads `singleLineDoneProps`; sheets with fields use `KeyboardLift`; a screen with a composer uses `<Screen keyboardAvoiding>`. The thread composer and the look comment field are the two exceptions: each has its own accessory id (`PRO_MESSAGE_ACCESSORY_ID` in `ProThreadScreen`, `PRO_COMMENT_ACCESSORY_ID` in `ProRecommendationScreen`, both exported) with one `KeyboardActionBar` and no `KeyboardDoneBar` in that file, because `ProSafetySheet` renders the shared Done bar while either screen is mounted. Physical-phone check: type in the thread composer, open the report sheet from the thread menu, close it, and confirm the composer still shows its Done bar; do the same in the look comment field.
- **No module-scope network, storage or timers** in any new file; no `console.error` on a guest or failure path; no new AsyncStorage key; no navigation hook in a component mounted inside `SettingsScreen` (`ProSettingsSection` and the sheets it hosts call `useProAccess({ refreshOn: 'mount' })`, and `Settings.test.tsx` gets a case with the flag on and only `auth` mocked) and no `navigate()` in any component.
- **Copy** comes from `proRules.ts` and `proFormat.ts`; do not retype it. No "Book", "Pay", "Buy", "Checkout", "Deposit", "Premium", "Featured", "Verified", "Certified", "Top rated" or a price badge appears anywhere.
- **Accessibility labels the tests rely on:** `Go back`, `Stylists`, `Connect with a stylist`, `Invite code`, `Connect`, `Share my closet`, `All my pieces`, `Only pieces I choose`, `Message`, `Send message`, `Report or block <label>`, `Report details`, `Create invite code`, `Revoke`, `Propose a session`, `Confirm`, `Decline`, `Cancel session`, `Save draft`, `Send to <name>`, `I wore this`, `End connection`, `Open the Stylist workspace`, `Back to my closet`, `Become a stylist`, `Stop sharing`, `Keep sharing`, `Add clothing`, and the text of each quick reply.

### 7.10 What the integration passes change in shared files

Four serial passes after all streams have merged (10.3 has the order). Each edit is written at a landmark; line numbers are hints.

**INT-MODE: `App.tsx`, `SettingsScreen.tsx`, `AccountModeContext.tsx`, `accountService.ts`, `features.ts`**

| File | Change |
| --- | --- |
| `App.tsx` imports | Remove the imports of the 18 deleted screens and the parked three (`WardrobeEditScreen`, `LookbookScreen`, `CapsuleWardrobeScreen`) and `AccountTypeOnboardingScreen` (whose file INT-MODE also deletes: nothing imports it after this edit, and its mock in `AppModeGate.test.tsx` is rewritten here); add the 11 pro route screens and `ProOnboardingScreen`, each in the exact form of 7.2 |
| `App.tsx` stacks | Delete `StylistDashboardStack`, `ClientsStack`, `StylistMessagesStack`, `StylistRecommendationsStack`, `ClientDashboardStack`, `MyStylistStack`, `ClientMessagesStack`, `ClientAppointmentsStack`, `ClientRecommendationsStack`, `ClientMyStylistStack`; add `ProClientsStack`, `ProScheduleStack`, `ProInboxStack` |
| `App.tsx` `HomeStack` | Delete the `StylistMarketplace`, `StylistProfileView`, `BookStylist` routes; add `ProHome`, `ProConnection`, `ProShare`, `ProRecommendation`, `ProThread` directly after `SwapThread`, one line each |
| `App.tsx` `ModeAwareTabs` | Delete the `client` block; replace the `stylist` block with the four tabs of 7.2; keep `const currentMode = PRO_MODES_ENABLED ? savedMode : 'user'` |
| `App.tsx` startup | One effect calling `purgeLegacyProData()` (from `localData.ts`, stream PLD) at launch; the onboarding gate renders `ProOnboardingScreen` and `handleModeOnboardingComplete(choice)` stores the choice with `setProEntry` for `stylist` and `client` |
| `AccountModeContext.tsx` | Rewritten as in 7.3 (same path, same export names `AccountModeProvider`, `useAccountMode`) |
| `accountService.ts` | Reduced to `getCurrentMode`, `setCurrentMode`, `hasCompletedModeOnboarding`, `markModeOnboardingComplete` (same `@smartcloset_current_mode` and `@smartcloset_mode_onboarded_<uid>` key strings, typed with `AccountMode` from `src/types/pro.ts`, not `AccountType` from the `src/types/stylist.ts` that INT-CLEAN deletes). `setCurrentMode` writes the current-mode key only: today it also mirrors `@smartcloset_account_type`, a key PLD retires; everything else, `loadSampleAccountData` included, is deleted |
| `SettingsScreen.tsx` | Remove `AccountType`, the available-modes loading, `handleModeSwitch`, the mode pill and the "Account Mode" card; add `{isAuthenticated && PRO_MODES_ENABLED && <ProSettingsSection />}` after `<SwapSettingsSection />`; the delete-account alert and the Danger Zone note name the data: "... ratings, body profile, stylist and client data, swap listings, offers and messages, and any uploaded images ..." and "... swap listings and messages, stylist connections, and all uploaded images ..."; the dev-only "Reset Demo Data" alert drops "stylist clients, appointments, recommendations, booking requests" and the note under that button drops "stylist & client content" |
| `features.ts` | New doc comment (7.4); the value stays `false` |
| Tests | `navigationRoutes.test.ts` (expected keys `['stylist','user']`, and the `it.each` modes `['user','stylist']`); `keyboardGuard.test.tsx` (its "at least 3 `Tab.Navigator`s use `tabScreenOptions`" assertion becomes 2, because the `client` set is gone; every remaining navigator still must use it); `AppModeGate.test.tsx` rewritten (stand-ins for `HomeScreen`, `ProClientsScreen` and `ProOnboardingScreen`; cases: flag off opens Home even if `stylist` or `client` was saved and rewrites the stored mode to `user`; flag on shows the prompt once; flag on with a server-confirmed stylist and saved `stylist` opens the workspace; flag on with a saved `stylist` but no server role opens Home); `App.test.tsx` gains a case that mocks `PRO_MODES_ENABLED` as `true` and renders the prompt once; `accountMode.test.ts` rewritten for the smaller service; `Settings.test.tsx` (no Professional section when off; the section and no "Account Mode" when on, with only `auth` mocked, which proves `ProSettingsSection` uses no navigation hook); `ratingsIntegration.test.tsx` (assertions only: its delete-account strings follow the new Settings text); `swapIntegration.test.tsx` (line 279 anchors on `name="ProHome"` instead of `StylistMarketplace`; the mocked context returns `{ currentMode, switchMode }` and stays valid; the delete-account text assertions follow the new strings); new `__tests__/screens/proIntegration.test.tsx` (reads `App.tsx` as text: the five `HomeStack` routes exist once, in order, each on one line, after the four swap routes; the three stylist stacks exist; no legacy route remains; `AddClothing` still in exactly three stacks) |

**INT-HOME: `HomeScreen.tsx`.** `const proBadge = useProBadge(isAuthenticated && PRO_MODES_ENABLED);` placed before Home's `useFocusEffect`; the Stylists cell inside the signed-in spread after "Swap"; one focus effect that calls `takeProEntry()` and navigates `ProHome` with the matching `open`, **registered before Home's own `useFocusEffect` as well** (the Home suites mock `useFocusEffect` so that only the last callback registered is kept, and their refocus cases call it: a later one would stop `loadData` from running). Flag-on cases (the module mocked with `PRO_MODES_ENABLED: true`) go into `homePro.test.tsx`: the Stylists cell and its badge render, and the `homeWardrobeFor` and `WishlistSeparation` expectations still hold. Suites: `HomeScreen`, `homeWardrobeFor`, `WishlistSeparation`, `wardrobeTotalStrip`, `AppModeGate`, `App`.

**INT-ACCOUNT: `backupService.ts`, `accountDeletion.ts`, `authService.ts`.** `backupService` adds the optional `pro` section from `exportMyProData()` in a `try/catch` (omitted for a guest or a server without the function; on any other failure the section is `{ "unavailable": true }` and the Export Data summary says the stylist data could not be included, so the omission is never silent; the export never fails; **no version bump**: the file is at `1.1` (`BACKUP_VERSION`), bumped once when the swap and ratings sections were added, so this section joins `1.1`, and import ignores unknown sections); `accountDeletion.ts` and `authService.ts` call `clearProPhotoCache()` and `resetProEntry()` next to `clearSwapPhotoCache()`. Suites: `backupService`, `accountDeletion`, `authService`, plus new `backupProExport.test.ts`.

**INT-CLEAN: deletions and the test clean-up.** 7.11.

### 7.11 Legacy code: deleted, parked, kept

| Path | Fate | Notes |
| --- | --- | --- |
| `src/screens/{AddClient,AppointmentDetails,BookStylist,Chat,ClientAppointments,ClientDashboard,ClientDetails,ClientRecommendations,ClientsList,CreateAppointment,CreateRecommendation,MessagesList,MyStylist,RecommendationDetails,Recommendations,StylistDashboard,StylistMarketplace,StylistProfileView}Screen.tsx` | **Deleted** (INT-CLEAN) | 18 screens. Layouts are references |
| `src/screens/AccountTypeOnboardingScreen.tsx` | **Deleted** (INT-MODE) | Replaced by `ProOnboardingScreen.tsx`. Deleted in the same pass that removes its import, because INT-MODE shrinks `accountService.ts` and this screen imports `addAvailableMode` from it |
| `src/services/{stylistService,marketplaceService,messagingService}.ts`, `src/types/stylist.ts` | **Deleted** (INT-CLEAN) | |
| `src/screens/{WardrobeEdit,Lookbook,CapsuleWardrobe}Screen.tsx` | **Parked**: kept, registered in no navigator | They work on the signed-in person's own closet and are self-contained; Phase 2 points them at a client's shared closet or offers them to every user. `keyboardScreens.test.tsx` keeps the Lookbook case; `@smartcloset_lookbooks` stays a personal key |
| `src/services/seedDemoData.ts`, `storage.ts` (seed call), `sampleDataRefresh.ts` | Edited (PLD): no stylist, client, marketplace or messaging seeding, **and no import or call of `loadSampleAccountData`** (it lives in `accountService.ts`, which INT-MODE shrinks; without this edit the typecheck fails between INT-MODE and INT-CLEAN) | |
| `src/services/localData.ts` | Edited (PLD): `RETIRED_PRO_KEYS` and `purgeLegacyProData()` | Removes `@smartcloset_stylist_profile`, `_stylist_clients`, `_stylist_appointments`, `_stylist_recommendations`, `_stylist_notes`, `_stylist_listings`, `_stylist_reviews`, `_booking_requests`, `_client_accounts`, `_current_client`, `_message_threads`, `_messages`, `_notifications`, `_relationships`, `@smartcloset_user_profile`, `@smartcloset_account_type`, `@smartcloset_available_modes`. Keeps `@smartcloset_current_mode`. Idempotent, best-effort, never throws, no completion key |
| Tests touching deleted code | Edited by their owner: `localData.test.ts` (a fifth list `RETIRED` beside its four, `PERSONAL`, `GUEST`, `DEVICE_OR_PER_ACCOUNT` and `INTERNAL`; the retired keys move out of `PERSONAL` and `GUEST` into it, and the key-walking test accepts it) (PLD). `sampleData.test.ts` and `sampleDataRefresh.test.ts` import `sampleWishlistItems` from `seedDemoData.ts` and need no edit while PLD keeps that export (PLD runs them); `keyboardScreens.test.tsx` (INT-CLEAN: remove the cases and mocks of deleted screens and services, keep Lookbook, append the pro cases listed in 9.3) | |

---

## 8. Account deletion and data export

### 8.1 Deleting an account

`delete_user_account()`, `block_user()` and `report_user()` are **not replaced**. Foreign keys, two triggers and the janitor do the work, and `pro_refresh` repairs a connection if the trigger ever fails. `supabase/functions/delete-account` needs **no change**: the first release stores no pro file anywhere, so there is nothing to remove from storage. Local clean-up already wipes everything (`AsyncStorage.clear()`); the integration pass adds `clearProPhotoCache()` and `resetProEntry()` (INT-ACCOUNT).

What happens to each table when person X deletes their account (the existing function first deletes X's rows from eight legacy stylist tables by name, then deletes the `auth.users` row; its `clothing_items`, `stylist_profiles` and every other table that cascades are then removed by the foreign keys, and `pro_connections` is set to null by them, all in that one statement):

| Table | Result |
| --- | --- |
| `pro_members`, `pro_stylists`, `pro_invites`, `pro_rate_counters` | Rows of X deleted (cascade) |
| `pro_messages` | Messages X sent deleted (`sender_id` cascade). Messages the other person sent stay until the 30-day rule |
| `pro_connections` | X's side becomes null (`ON DELETE SET NULL`); `pro_on_member_left` then ends the connection if active (`ended_by = 'system'`), nulls X's label, deletes the connection's grant and grant items, and: **if X was the client**, deletes the connection's looks, sessions, grant events and view counters; **if X was the stylist**, deletes the stylist's unsent draft looks and leaves the sent ones for the client. If both sides are null, the row is deleted (everything under it cascades). If the trigger fails (it swallows errors so that a deletion never fails), `pro_refresh` finds the active connection with a null side at the next read of the other person and finishes the same work (4.5) |
| `pro_grant_items` | Rows for X's pieces cascade when the pieces are deleted |
| `pro_recommendation_items` | `item_id` set null for X's pieces; the copied name remains in a look the stylist wrote, until that look is deleted |
| `content_reports`, `user_blocks` | Existing cascades (reports and blocks are deleted with either account) |

What the other person keeps:

| X was | The other person has |
| --- | --- |
| The **client** | A stub in their client list, "Former client", with the start and end dates, for about 90 days. Nothing the client wrote, shared or rated. No messages from the client |
| The **stylist** | The connection labelled "Former stylist" for about 90 days after it ended, with the looks and session records already delivered and the messages the client sent (30 days). The stylist's messages and the looks they never sent are gone. The client is told this in the client terms before accepting |

Prove it with `p5_deletion.sql`, which calls the real function for each person in both orders and finds zero rows for the leaver in every `pro_*` table (9.2), and again through the real API layer by the API script (9.4).

### 8.2 Export Data

`export_my_pro_data()` (gate `safety`, so a paused or suspended person can still take their data) returns the caller's own data and never the other person's words, identity or closet:

```
{ "settings": { "adultConfirmedAt", "stylistTerms": { "version", "acceptedAt" }, "clientTerms": { ... }, "suspended": bool },
  "stylistProfile": { ...the profile... } | null,
  "invites": [ { "createdAt", "expiresAt", "status" } ],                       // never the code
  "connections": [ { "role", "otherLabel", "status", "startedAt", "endedAt",
                     "grantHistory": [ { "event", "itemMode", "itemCount", "textVersion", "at" } ],     // client side only
                     "looks": [ { "title", "body", "status", "items": ["name", ...], "sentAt", "feedback": { "rating", "comment" } } ],
                     "sessions": [ { "startsAt", "durationMinutes", "mode", "place", "note", "status", "utcOffsetMinutes" } ],
                     "myMessages": [ { "body", "sentAt" } ] } ] }
```
A stylist's export contains the looks they wrote, never anything from a client's closet. `backupService.exportData` merges it as the optional `pro` section inside `try/catch` (omitted for a guest or a server without the function; `{ "unavailable": true }` on any other failure, so the omission is never silent and the export never fails), without a version bump (7.10). Import ignores the section.

---

## 9. Test plan

Rule for everyone: **add new test files; do not edit existing test files except where section 7.10 or 10 says an integration pass, or the stream that owns a shared file, does.** Signed-in UI cannot be driven in the simulator (it cannot type passwords), so signed-in flows are Jest with mocked services; database behaviour is the rolled-back SQL scripts; the real API layer is the API script.

### 9.1 What is written where (names are fixed so merges do not collide)

| Layer | Where | Stream |
| --- | --- | --- |
| SQL behaviour scripts (rolled back) | `supabase/tests/pro/*.sql`, `scripts/run-pro-sql-tests.sh`, `supabase/tests/pro/race.sh` | PDB1, PDB2, PDB3 |
| API-level script (committing, local stack only) | `scripts/pro-api-checks.mjs` | PAPI |
| Edge function (source pins and behaviour with fakes) | `__tests__/functions/proPhotoFunction.test.ts`, `proPhotoBehaviour.test.ts` | PPH |
| Real RPC responses through the real mappers (skipped without a local stack) | `__tests__/live/proServiceLive.test.ts` | PAPI |
| Migration-text and in-step Jest tests | `__tests__/pro*.test.ts` | PDB1, PDB2, PDB3, PAPI |
| Client contract tests | `__tests__/services/pro*.test.ts`, `__tests__/utils/proFormat.test.ts`, `__tests__/hooks/usePro*.test.tsx`, `__tests__/config/proRules.test.ts` | PC0 |
| Component and screen tests | `__tests__/components/Pro*.test.tsx`, `__tests__/screens/Pro*.test.tsx` | PUI1-PUI5 |
| Integration and guard edits | 7.10 | INT-MODE, INT-HOME, INT-ACCOUNT, INT-CLEAN |

### 9.2 SQL behaviour scripts

Run with `scripts/run-pro-sql-tests.sh` (a clone of `run-swap-sql-tests.sh`): each scenario is `begin;` + `00_lib.sql` + `10_fixture_users.sql` + `20_fixture_closets.sql` + the scenario + `99_tail.sql`, which raises if any check failed, prints the count and `rollback`s. Against a database reached with `psql` when `PRO_TEST_DB_URL` is set; against the linked project only with `--linked` spelled out (it never runs a committing script). After any run against a real project, confirm `select to_regclass('t.log')` is null. **Direct SQL does not enforce the API's `WHERE` rule; these scripts cannot catch it. That is what 9.4 is for.** The scratch database's Supabase stub also defines `auth.jwt()` (the gate reads `is_anonymous` from it).

Fixtures: Ann (stylist, approved), Dee (stylist, on probation), Bea and Cat (clients, closets of eight pieces each including a wishlist piece, a piece with only a retailer image, and pieces with price, notes, tag text, wear data and a gallery, so a leak shows), Eve (a stranger with no pro rows), Gus (accepted nothing), Hal (an account created one hour ago), Ivy (an anonymous token) and a set of 50 content terms that scenarios load and roll back where they need them. `00_lib.sql` switches the feature on for its own transaction with a direct `update public.pro_config set value = 'true' where key = 'pro_enabled'`, because `pro_set_enabled(true)` refuses without 50 terms (p6 tests that refusal and the success after the terms are loaded). Impersonation by `set local role authenticated` plus `request.jwt.claims` (`t.as_user`), service paths by `t.as_service()`.

| Script | Stream | Covers |
| --- | --- | --- |
| `p1_profile_invite_connect` | PDB1 | Gates (guest, **anonymous token**, switch off, adult missing, wrong and stale terms version); profile validation (reserved words, length, control and zero-width characters, closed service list, languages, contact, link and payment wording refused in folded, wide and accented forms, **a typographic apostrophe in "cashier’s check" refused, "Signal-inspired palette" accepted in a bio**, rates text "From $80 per session" accepted); `stylist_label` kept in step; invite creation (account age, probation cap then approval cap, idempotent on `client_ref`, code shape, **the returned shape equals `ProInvite`**); listing shows codes to the owner only; revoke (sets `revoked_at`); expiry; **every preview failure returns the same `{ valid: false }` result and is counted, so the 11th lookup in an hour is rate limited whatever the codes were** (unknown, expired, used, revoked, own, held, removed, blocked); preview and connection outputs contain no email, phone or account id; redeem (terms and adult, alias filter, no grant on connect, **the same client redeeming the same code twice gets `alreadyConnected`**, another client gets the invalid result, 5-connection and stylist caps, not accepting); a hold from reports or churn **releases itself after 7 days** (the test moves `invites_held_at` back) and an admin hold does not; connection lists and details (including `myAlias` and `safetyOnly`); end by either side (idempotent, `ended_by`, grant gone, sessions cancelled); **closing the stylist profile and saving it again keeps probation, approval and a hold**; **a spent code answers `invite_invalid` to a preview and a redeem once its connection has ended or been blocked (and the same after the blocker unblocks), while the retry works as long as the connection is active**; **a reserved word is refused as a client alias at redeem and at rename**; **text behind a right-to-left override, an isolate or a zero-width space is refused while emoji sequences and the zero-width non-joiner pass, and a claim of approval by SmartCloset is refused in the headline, bio and rates and passes in chat**; `pro_report_is_qualified` counts only the reported person's messages; no date-dependent check (the seven-day expiry is compared in calendar days, so a daylight-saving change inside the week cannot fail it) |
| `p2_sharing` | PDB2 | No grant means `closet_not_shared`; `set_pro_grant` (stale text, all vs selected, **`p_item_mode` required**, other people's and wishlist pieces refused, 90-day expiry **kept when pieces change and renewed only with `p_renew`**, events appended, **`sharing_on` written once when sharing first turns on and never for a change, a renewal, a revocation or an expiry, never counted as unread, and the connection does not move in the stylist's list**); `get_client_closet` returns only the whitelisted columns (every fixture leak absent), **no photo path, link or string of the shape `<uuid>/<file>`**, never the wishlist, **text capped and cleaned (a 5,000-character name, a hostile materials array)**, paging and clamp (**an offset past the end returns the last page with `total_count`**), per-connection page cap; view counters visible to the client only; revocation, expiry (and the lazy `expired` event, written once under two parallel refreshes), end, block, suspension and `pro_disabled` each stop reads at once; **terms bump:** after the server's `client_terms_version` is bumped, the client's `set_pro_grant(false)`, `end_pro_connection` and `block_pro_member` still succeed (also with the switch off and with the client suspended) and the stylist's next `get_client_closet` fails; **`pro_photo_source` matrix:** a granted cover photo returns its path to the service role; an unshared piece, a wishlist piece, a piece without a photo, another client's piece, a stranger, a revoked, expired, ended, blocked, suspended or switched-off grant, an unknown connection and malformed ids all return null identically; an app user calling it is refused; a deleted piece leaves a selected grant |
| `p3_work` | PDB2 | Looks (draft idempotent, **a retry racing the original returns the same row**, items must be in the grant with the position in `item_not_shared`, **a piece id copied from a friend's closet is refused for `item_mode = 'all'`**, 12 cap, long names copied as 120 characters, filters, draft cap, edit only drafts, **a title-only edit with `p_item_ids` omitted keeps the items**, send needs content and is idempotent, sent locked, delete only drafts, **the client cannot read, rate or report a draft by its id**, viewing marks `viewed`, **after the client revokes, narrows or ends, `get_pro_recommendation` and `list_pro_recommendations` as the stylist return no field beyond the copied name and category (no `color`, `brand`, `hasPhoto`, cover item)**, feedback bounds and transitions, a stylist cannot give feedback, ended connections are read-only); sessions (lead time, horizon, duration steps, mode, **the offset from UTC: the extremes and a half-hour zone are stored as given, a quarter-hour offset beyond them, a non-quarter-hour and a null are refused**, place contact refusal, idempotent, open cap **under parallel proposals**, only the non-proposer answers **(the proposer cannot confirm their own request)**, **repeat confirm and repeat cancel return success**, **overlap conflict across two of one stylist's connections**, cancel rules, lazy expiry and completion, scopes, `can_*` flags); messages (idempotent, 500 cap, scam refused, contact allowed, 7th message in a minute refused, ended refused, **a message racing an end is refused and never lands after the `ended` line**, `after_id` returns the oldest newer page and `before_id` the newest older page, seen pointers written only when they advance, `me`/`them`/`system`, non-participants get `pro_unavailable`) |
| `p4_edges` | PDB3 | A block made through `block_user` (friends), a swap-style block (`via_swap`) and `block_pro_member` each end a pro connection both ways and turn it into a closed shell; **block, then unblock, and the blocked party's reads still return the identical shell (no content, same label)**; the shell never says blocked; **a client blocking a stylist who is also an accepted friend removes the friendship**; a block made from an invite preview; suspension ends and refuses, unsuspend restores nothing; **a block that the trigger did not finish (the trigger is switched off for the test) is finished by the next read of either person, with the blocker's role, as a closed shell, and a repaired shell is left alone when the block is lifted**; **no row of `list_pro_connections` ever says `system`**; **a suspended person, a person with the switch off, a stylist with stale terms or a closed profile can still read their ended history, end, block, report, export and stop sharing**; `close_stylist_profile`; a terms bump gates content reads and writes; churn hold (ten connections **the client** ended under 48 hours in 30 days, and **not** ten that the stylist ended); `pro_refresh` effects **and its repair of an active connection with a null side (the trigger disabled for the test)**; the janitor (messages at 30 and 180 days, connections at 90, **a code created 40 days ago and revoked just now is kept for 30 days**, counters at 2 days, throttle, idempotent, bounded) |
| `p5_deletion` | PDB3 | Real `delete_user_account()` for the client then the stylist, and the stylist then the client; stub labels; looks and sessions deleted when the client leaves, and, when the stylist leaves, the sent looks and sessions kept and the unsent drafts deleted (also by the repair when the trigger failed); messages by the leaver gone; zero rows for the leaver in every `pro_*` table (found by catalogue, not by a hand list); nothing left when both are gone; **a failure injected into `pro_on_member_left` (the trigger replaced by a failing one for the test) leaves an active connection with a null side that the next `pro_refresh` of the other person ends and clears** |
| `p6_moderation` | PDB3 | `report_pro_content` for each reference type; non-participants refused; the details are stored as written, a scam phrase or reversed text included, with control characters stripped; evidence (30 messages marked, flagged message valid only if sent by the other side, **30 messages of 500 four-byte characters fit the table's check, the flagged message is kept, bodies are cut to 300**); the 20-a-day limit shared with `report_user` and `report_swap_content`; **folding only of identical reports: message A then message B, or `spam` then `unsafe_meeting`, within 7 days give two rows, and the same report twice gives one**; **`report_swap_content` with the same 30 long messages no longer fails**; every old and new context, reason and ref type accepted by the widened constraints; **the hold: two different qualified reporters hold invites; two reporters who never worked with the stylist (account under 48 hours, connection under 24 hours and under 3 messages from the stylist) do not; two invite reports do not; one reporter twice does not; a hold changes `create_pro_invite`, `preview`, `redeem` and nothing else; a system hold ends after 7 days and an admin hold does not; close then save keeps the hold; remove then save is refused with `stylist_profile_removed`; restore allows it; creating a profile with two qualified reports in the last 14 days is held at once**; a client's serious report deletes that client's own grant and a stylist's report does not touch the client's; release; approve, suspend, unsuspend, remove, restore; views and admin functions are service-only; backlog; digest returns false and never raises without `pg_net`/Vault; **`pro_set_enabled(true)` refuses below 50 content terms and succeeds at 50**; `block_pro_member` row is `via_pro`, uses a label not an email, is hidden from the old blocked list and listed under an opaque `ref`; `report_user` still has its narrow lists; export has no other person's words or identity |
| `p7_catalog` | PDB3 | Row security on for all fifteen tables; no privilege for `anon`/`authenticated` on any table or sequence; **no policy on any pro table, and none on `storage.objects` that mentions a pro function**; the exact list of functions `authenticated` may execute (36, 4.6) and `service_role` (4.7 and `pro_photo_source`); `anon` none; `search_path` pinned on every pro function; every foreign key to `auth.users` cascades except the two on `pro_connections`; **every foreign key has an index whose leading column is the key column**; `user_blocks` policies contain `via_pro`; no pro function is overloaded; `block_user`, `report_user`, `delete_user_account` sources contain no `pro_`; the nine legacy tables have no `anon`/`authenticated` privilege; `pro_enabled` is seeded `false` |
| `p8_legacy_lockdown` | PDB1 | As `anon` and as an `authenticated` user, `select`, `insert`, `update`, `delete` on each existing legacy table fail with permission denied; `service_role` still reads; rows and policies untouched; the file is idempotent |
| `race.sh` | PDB2 | **Local database only** (commits its fixtures, refuses any non-local URL, like swap's): two sessions redeem one single-use invite at once (exactly one wins); **a redeem racing `revoke_pro_invite` (a revoked code is never redeemed); a redeem racing `close_stylist_profile` and `set_stylist_accepting(false)` (no active connection to a stylist without a profile or while not accepting); two clients and one code give one connection**; two sessions confirm overlapping sessions for one stylist (exactly one wins); **`set_pro_grant`, `send_pro_message` and `respond_pro_appointment` racing `end_pro_connection` (nothing lands after the end)**; **a Friends block (`block_user`) racing a redeem, in both orders: no active connection is left between the blocked pair** |

### 9.3 Jest

| File | Stream | What it proves |
| --- | --- | --- |
| `__tests__/services/proService.test.ts` | PC0 | Guests fail before any network call (an `it.each` over every function); a table of function -> RPC name -> **exact argument object** (named parameters); omitted optionals are not sent; terms and sharing always send the build's version constant whatever a caller tries to pass; mapping to camelCase **and the exported mappers over fixtures keyed by `PRO_RPC_COLUMNS`; `{ valid: false }` and `{ ok: false }` become `ProError('invite_invalid')`; `setProGrant` never sends `p_text_version` when disabling**; `getProBadge` never throws; `clientRef` reuse |
| `__tests__/services/proErrors.test.ts` | PC0 | Every code, `PGRST202` -> `not_deployed`, offline, detail and hint passed through; messages never contain a code, a status, or "block"/"report" for neutral endings; every code has a message |
| `__tests__/services/proPhotoUrls.test.ts`, `proEntry.test.ts` | PC0 | `proPhotoSource` builds the `pro-photo` request (functions address, the two ids, the user's token; null for a guest), contains no storage path and writes nothing to AsyncStorage; the entry intent is taken once and reset |
| `__tests__/utils/proFormat.test.ts` | PC0 | Code grouping and normalisation (matches the SQL), session time in two zones, status and closed wording, uuid shape |
| `__tests__/hooks/useProAccess.test.tsx`, `useProBadge.test.tsx` | PC0 | Each state; `update_required` for an older and a newer server and records nothing; `acceptTerms` sends the build constant; `refreshOn: 'mount'` renders with no navigation container; badge silent on failure |
| `__tests__/config/proRules.test.ts` | PC0 | Lists are closed and unique; no forbidden commerce word in any copy constant; terms have the sections of Appendix A; **the client terms and `PRO_SHARE_CONSENT` contain the sentences about people and children, about pieces added while sharing is on, and about photos showing more than the clothes** |
| `__tests__/proFoundationMigration.test.ts` | PDB1 | Files 1 to 5 exist in order; `pro_enabled` is seeded false; lockdown is revokes only; the fifteen tables have RLS and a revoke and no policy; seeds; no `UPDATE`/`DELETE` without `WHERE`; the held purge stays out of the migrations folder |
| `__tests__/proSharingWorkMigration.test.ts` | PDB2 | Files 6-7; the exact grant lists of their functions; `search_path` pinned; no storage policy in any pro file; `pro_photo_source` granted to `service_role` only; no private column in any `returns table` list or jsonb key list, and no string of the shape `<uuid>/<file>` except the two client-only names `cover_photo_path` and `photoPath`, which the test asserts are empty in every stylist-side call |
| `__tests__/proModerationMigration.test.ts` | PDB3 | File 8; `report_swap_content` re-created with the same signature and grants and an evidence budget; constraint lists are supersets of the swap ones; admin functions `service_role` only; views closed; digest never raises; `block_user`/`report_user`/`delete_user_account` not redefined |
| `__tests__/proRulesInStepWithSql.test.ts` | PDB3 | `PRO_LIMITS`, terms versions, text lengths, services list, report reasons equal what the SQL says (same `when '(\w+)'\s+then (\d+)` technique as swap) |
| `__tests__/proServiceInStepWithSql.test.ts` | PDB3 | Every RPC `proService.ts` calls exists in the migrations, with **the same set of parameter names** (`p_*`), and every client function in 4.6 is called by the service; no two functions share a name; **`PRO_RPC_COLUMNS` equals the `returns table` column lists in the migrations, and `PRO_RPC_NESTED` (the keys one level down that the mappers read) is found in the SQL, each part built by one `jsonb_build_object` call with all its keys** |
| `__tests__/proScripts.test.ts` | PDB3 | The runner's scenario list equals the files; scripts are executable; every scenario ends in `rollback`; only `race.sh` commits and it refuses non-local URLs (the cases swap tests: remote host, URL carrying its own host, non-URL, missing URL) |
| `__tests__/proApiChecksInStepWithService.test.ts` | PAPI | The API script calls every client function, with argument names the SQL declares |
| `__tests__/proMigrationFiles.test.ts` and `supabase/tests/pro/migrationFiles.ts` | PDB3 | **Every pro suite that reads the migrations as text finds its files by name through `migrationFiles.ts` (`proFile('foundation')`, `readPro('work')`, `proComesBefore('connections', 'sharing')`), never by digits**: the release renames the eight files (3.1, 11.1 P3) and `migrationVersions.test.ts` is the one test meant to need nothing else afterwards. This test proves the resolver against a copy of the folder under later versions, and fails if one of the five suites (`proFoundationMigration`, `proSharingWorkMigration`, `proModerationMigration`, `proRulesInStepWithSql`, `proServiceInStepWithSql`) writes a `\d{14}_pro_*.sql` name again. The API script and its in-step test already matched `^\d{14}_pro_` |
| `__tests__/migrationVersions.test.ts` (edit) | PDB1 | Adds the pro check: the eight pro files exist **by name** (`^\d{14}_pro_(lockdown_legacy_tables\|foundation\|upkeep\|profiles_invites\|connections\|sharing\|work\|moderation)\.sql$`), in that **relative order**, each later than every non-pro file in the folder, with **no hard-coded date range** (so it passes before and after the release rename of 3.1); the purge file is accepted only in release form (the test's `RELEASED` pattern gains `purge_legacy_pro_tables`, beside the two names it lists today); duplicates fail |
| `__tests__/functions/proPhotoFunction.test.ts` | PPH | Reads `supabase/functions/pro-photo/index.ts` as text (as `swapMediaFunction.test.ts` does): strict uuid checks on both parameters; the user id comes from the verified token; `pro_photo_source` is called before any download; the metadata strip comes before the response; `Cache-Control: private, no-store`; no logging of ids, paths or bytes; the path is never in the response; `[functions.pro-photo] verify_jwt = true` in `supabase/config.toml` |
| `__tests__/functions/proPhotoBehaviour.test.ts` | PPH | Runs the handler with fakes (as `swapMediaBehaviour.test.ts` does): every database refusal is the same bare `404`; `429` on a rate limit; a JPEG with GPS comes back without it; a PNG with a text chunk comes back without it; a file over 5 MB is `413`; an unsupported format is `415`; the response never contains the path |
| `__tests__/live/proServiceLive.test.ts` | PAPI | Skipped unless `PRO_LIVE_URL`, `PRO_LIVE_ANON_KEY` and `PRO_LIVE_SERVICE_KEY` point at a local stack; mocks `src/config/supabase` with a client for that stack and runs every exported mapper over real responses of the RPCs, so a renamed column or jsonb key fails here and not on a phone |
| Component and screen tests | PUI1-PUI5 | One file per component/screen. Every access state of 7.5.2; skeleton, empty, `LoadError` full and banner; keyboard: exactly one `KeyboardDoneBar` where `keyboardDoneProps` is used, the thread composer and the look comment field each have their own id equal to their `KeyboardActionBar` `nativeID` and no `KeyboardDoneBar`; `ProSafetySheet` ignores a result after dismissal and adds the "stopped sharing" line after a serious client report; `ProRedeemSheet` walks code, preview, terms, alias, connect and maps `invite_invalid`, `stylist_not_accepting`, `client_connection_limit`; `ProShareScreen` has no preselected choice, sends the build's text version when enabling and none when disabling, offers Stop sharing in `update_required`, shows `stale_consent_text` and the empty-closet state; `ProLookEditorScreen` removes a tile on `item_not_shared`; `ProThreadScreen` polling with fake timers merges by id and keeps text on failure; `ProAppointmentSheet` only shows Confirm/Decline when `canConfirm`/`canDecline`; no component calls `navigate()`; no screen renders a commerce word |
| Integration | 7.10 | `proIntegration.test.tsx`, `AppModeGate.test.tsx`, `Settings.test.tsx` (flag on, only `auth` mocked), `App.test.tsx` and `homePro.test.tsx` (flag-on cases), `ratingsIntegration.test.tsx`, `accountMode.test.ts`, `backupProExport.test.ts` (including the `unavailable` note), and the `keyboardScreens.test.tsx` cases (append, `doneId` for the thread and the look comment: `ProThread` `avoiding`, `ProRecommendation` `scroll`, `ProRedeemSheet` `lift`, `ProStylistProfileSheet` `lift`, `ProSafetySheet` through Report `lift`, `ProAppointmentSheet` `lift`, `ProLookEditor` `scroll`, `ProInvitesSheet` `lift`) |
| Policy | POL | `privacyPolicy.test.ts` (headings and rows in the new order, the new section and row present, no "marketplace" claim, the 18+ line in Children's privacy, the "Usage limits" row mentions limited stylist actions); `proPolicy.test.ts` (the page's retention table equals 3.7; the forbidden words list of the repository is absent from the page and from `MODERATION.md`) |

### 9.4 API-level checks (`scripts/pro-api-checks.mjs`, stream PAPI)

Why it exists: PostgREST rejects an `UPDATE` or `DELETE` without a `WHERE`, even inside a `SECURITY DEFINER` function, and direct SQL does not. Swap's upkeep job passed every SQL scenario and failed on every phone. The only test that sees this is a call through the real API layer with a real session.

- **Runtime:** Node 18 or later, `fetch`, **no new dependency**. Environment: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (from `supabase status -o env` on a local stack). **It refuses any URL that is not `localhost`/`127.0.0.1`** (it creates users and commits data, like `race.sh`); a Supabase branch or a second project is the only other acceptable target, never production. `--dry-run` makes no network call: it prints the plan and checks its own function and argument names against the migration files, so an agent stream can finish and test it without Docker.
- **Users:** four fixture users created with the Auth admin API (`POST /auth/v1/admin/users`, `email_confirm: true`), signed in with `POST /auth/v1/token?grant_type=password` to mint access tokens (stylist Ann, client Bea, second client Cat, stranger Eve). Clothing rows and a test photo `wardrobe-images/<Bea id>/test.jpg` are inserted with the service key.
- **Checks, in order:**
  1. **Canary.** `PATCH /rest/v1/pro_meta` with the service key and no filter must fail with "UPDATE requires a WHERE clause". If it succeeds, the script stops: the guard is not active in this environment and the run proves nothing.
  2. **Every pro table and every legacy table** as `anon` and as Ann: `GET`, `POST`, `PATCH`, `DELETE` all refused (permission denied or 401/403). Count asserted equals 15 + 9 tables.
  3. **Every client function** as `anon` is refused; as Ann/Bea with a happy-path call that uses the **same argument names `proService.ts` sends**: terms, profile, invite, preview, redeem, connections, grant (all and selected), closet pages, looks (save, send, list, get, feedback), sessions (propose, confirm, cancel, list), messages (send twice with one `client_ref`, thread with `after_id`), report (also with a thread of 30 messages of 500 four-byte characters), block, list and unblock blocks, end, export, badge, status. Every response is checked for the expected keys and the **absence of forbidden keys** (account ids, email, phone, price, notes).
  4. **Janitor and refresh through the API:** `pro_refresh` runs inside `get_pro_status`/list calls (must succeed); `pro_janitor(true)` as the service key succeeds, as a user is refused.
  5. **Error codes:** about 30 expected failures (wrong terms version, stale share text, an unshared item in a look, an overlapping confirm, an ended-connection message, a rate-limited preview, a foreign connection id) checked by `error.message`, **plus the two code results:** twelve invalid codes in a row give twelve `{ valid: false }` answers (HTTP 200) and twelve counter increments, and the lookups after the tenth are rate limited.
  6. **Photos:** `pro_photo_source` called with the service key for the matrix of p2 (the path for a granted piece, null otherwise) and refused with a user token. With `supabase functions serve pro-photo` running, Ann's `GET /functions/v1/pro-photo?c=<connection>&i=<item>` for Bea's shared piece is 200 with image bytes (a geotagged JPEG fixture comes back with no GPS block, a PNG fixture with a text chunk comes back without it) and `Cache-Control: no-store`; an unshared piece is 404; after Bea revokes it is 404; after the connection ends 404; as Eve 404; without a token 401; neither the body nor the headers contain Bea's account id or a storage path. **Friend and stylist:** with Ann and Bea accepted friends, Bea blocks Ann through `block_pro_member`; the `friend_requests` row is gone and Ann's storage read of Bea's folder is refused. **Bucket probes (the release run, on the branch that mirrors production, 11.1 P3-P4):** `storage.buckets.public` is false for `wardrobe-images`; an unauthenticated `GET /storage/v1/object/public/wardrobe-images/<existing path>` is not 200; a signed-in user who is neither the owner nor an accepted friend is refused for another user's path; `pg_policies` for `storage.objects` lists only the owner policy and the friends policy for the bucket. A fresh local stack lacks the hand-made policies, so these probes are skipped there and reported as skipped.
  7. **Admin:** each admin function with the service key succeeds; with a user token is refused.
  8. **Account deletion through the API layer:** `delete_user_account` called through PostgREST as a fixture client (then, on a fresh pair, as a fixture stylist, and the reverse order), asserting zero rows for the leaver in every `pro_*` table and the other side's labelled stub, because `pro_on_member_left` swallows its errors and a missing `WHERE` inside it would fail silently.
  9. **Cleanup:** deletes the fixture users through the admin API and removes the test rows; prints a summary; exits non-zero on any failure.
- It is run on the local stack by **the lead** (gate P4: agent streams cannot run Docker, BUILD-PLAN.md decision 18), after the SQL scenarios, and again before each release against a branch that mirrors production. PAPI is done when the script is written, `--dry-run` is clean and its in-step test passes. It is not part of CI (it needs `supabase start`).

### 9.5 Existing suites to run

After each stream: its own tests, then the guards (seconds): `npx jest __tests__/navigationRoutes.test.ts __tests__/screens/keyboardGuard.test.tsx __tests__/addItemHeader.test.ts __tests__/migrationSafeUpdate.test.ts __tests__/migrationVersions.test.ts`; `npm run typecheck`; `npx tsc --noEmit --skipLibCheck` (what CI runs); `npm run lint`.

After each integration pass, in addition: `App`, `AppModeGate`, `HomeScreen`, `homeWardrobeFor`, `WishlistSeparation`, `wardrobeTotalStrip`, `Settings`, `settingsWardrobeFor`, `swapIntegration`, `ratingsIntegration`, `ItemDetails*`, `localData`, `backupService`, `accountDeletion`, `authService`, `privacyPolicy`, `privacyManifest`, `qualityRatingsMigration` (it requires `supabase/audit.sql` to still list the four legacy tables), and finally the whole `npx jest` run (and, before P9, once more with the flag set to `true`, 7.4).

### 9.6 Manual walkthrough on two real phones (TestFlight, gate P6)

A is a stylist, B is a client, C is a stranger. In order:

1. A: first-run prompt > "I'm a stylist" > stylist terms and the 18+ switch > profile (a link in the bio is refused with a plain reason) > save. A opens Settings > Professional and switches to the Stylist workspace and back.
2. The lead sets `min_account_age_hours` to 0 (`update public.pro_config set value = '0' where key = 'min_account_age_hours'`) so fresh accounts can create a code, and restores 48 afterwards. A: Clients > Invite > create a code > share. Check the probation banner. B (fresh account, never touched Stylists): Home > Stylists > Connect > enter the code, **see the preview and the "Nothing is shared when you connect" line** > client terms > name > Connect. A sees B in Clients.
3. A: Closet shows "B hasn't shared their closet". B: Share > My closet (nothing is preselected and the button stays disabled until a choice is made) > Only pieces I choose > pick three > confirm. A: Closet shows exactly those three, with photos. B: sees "last viewed".
4. A: new look from two of the three pieces > Save draft > Send. B: the dot on Home; opens the look; rates it; "I wore this". A sees the rating.
5. A: propose a session tomorrow, virtual. B: confirm. Propose an overlapping one from A's second client (second phone or simulator) and see the conflict message.
6. Messages both ways; the 15-second refresh; a gift-card sentence is refused; a phone number is allowed; long-press a message > Report.
7. B turns sharing off: A's closet screen says "not shared" immediately; a photo A had open stays until A leaves the screen, and reopening shows placeholders. B turns it on again, then A ends the connection: B's screen reads "This connection has ended."; C's phone and A's phone show nothing of B's closet. **Then:** the lead bumps `client_terms_version` on the server; B's app says "Update SmartCloset to keep using professional features" and still offers Stop sharing, End connection and Report or block; restore the version. The lead also calls `pro_set_enabled(false)`: B's screen shows the pause notice and the safety-only list and Stop sharing still works; then `pro_set_enabled(true)`. **Photo check:** upload a geotagged JPEG and a PNG with Exif through the build, share them, fetch each from the `pro-photo` function with A's token (curl) and run `exiftool` on the bytes: no GPS or camera fields.
8. B blocks A from the connection menu: A's phone shows a closed row labelled "Former client", never "blocked". Confirm B's old "Blocked people" list (Friends) does **not** list A, and Settings > Professional > Blocked does. Then B unblocks A, and A's row is unchanged (the same closed shell; no content returns).
9. Connect A to a new client D with a fresh code (one look sent, one message each way). Delete D's account: A's list shows "Former client" with dates and A's look for D is gone. Delete A's account: nothing remains. Check the Supabase rows in the dashboard.
10. On a physical iPhone: type in the thread composer, open the report sheet from the thread menu, close it, and confirm the composer still shows its Done bar; do the same in the comment field of a look (open Report from its menu, close it).
11. Review the report in the `pro_moderation_queue` view; confirm the hourly digest message arrived (gate P5).

---

## 10. Build plan: waves, streams, file ownership, integration passes

Streams share one working tree and **must not commit**; the lead merges. A stream edits only the files it owns. To use another stream's file it imports it through the contract in sections 4 and 7 and mocks it in its own tests; it never copies or edits it. Waves 0 to 2 only **add** files, apart from four edits that cannot break another stream (the data edits of PLD, the privacy page, the moderation runbook and the policy test by POL, the migration-version guard by PDB1, `supabase/audit.sql` by PDB3, the one `[functions.pro-photo]` block of `supabase/config.toml` by PPH), so no stream can break another; everything that replaces or deletes existing code is in the serial integration passes of wave 3.

### 10.1 Waves

| Wave | Streams | Starts when | Notes |
| --- | --- | --- | --- |
| **W0** | **PC0** (client contract) | now | Small and fast: types, route names, error codes, service signatures, rules and copy. Everything in W1 that touches the client imports it |
| **W1** | PDB1, PDB2, PDB3, PPH, PLD, POL, PUI1, PUI2, PUI3, PUI4, PUI5 | PC0 merged (the database, photo-function, data and policy streams depend only on this document and may start with W0) | Eleven streams in parallel. Contact points below |
| **W2** | PAPI | PDB1, PDB2, PDB3, PPH merged | The API script and the live mapper test. Their first run on a local stack is the lead's gate P4 |
| **W3** | INT-MODE, then INT-HOME, then INT-ACCOUNT, then INT-CLEAN (serial) | W1 merged (W2 may run alongside) | Each pass starts from the tree the previous one leaves |
| **W4** | the lead | all merged, suites green | Section 11 |

Contact points inside W1 (nothing else is shared):

| Contact | What to do |
| --- | --- |
| PDB1, PDB2, PDB3 | Tables are all created in file 2 (PDB1), together with the upkeep of file 3 and the invite and connection functions of files 4-5, the fixtures and the runner, so PDB1's scenarios (`p1`, `p8`) run on their own. Files 6-7 (PDB2) and 8 (PDB3) add functions only. PDB2 and PDB3 code against the table definitions of 3.4 and the helper signatures of 4.5, then apply all eight files on one scratch database before saying done. PDB3's catalogue and in-step tests read the others' files; they run last |
| PPH | Codes against the `pro_photo_source(p_uid, p_connection, p_item)` signature of 4.6 and mocks the database in its behaviour test; PDB2 owns the SQL. It imports `supabase/functions/_shared/jpegMetadata.ts` and `pngMetadata.ts` and edits neither |
| PUI1 to PUI5 | Components are used through the props in 7.7 and mocked with `jest.mock`; a typecheck error that comes only from a file that does not exist yet is not that stream's to fix (report it) |
| PUI2 and PUI4 | `ProStylistProfileSheet` (PUI2) is opened from `ProClientsScreen` (PUI4); `ProInvitesSheet` (PUI4) is not used by PUI2 |
| PUI3 and PUI5 | `ProAppointmentSheet`, `ProLookCard` (PUI5) are used by PUI3/PUI4 screens |
| PC0 and everyone | If a signature in 7.6 is wrong or missing, the stream tells the lead; it does not change it locally |

### 10.2 Streams and file ownership

No path appears in two rows (checked mechanically at the end of this section). "Tests" are the files named in 9.3 for that stream.

| Stream | Owns | Needs | Done when |
| --- | --- | --- | --- |
| **PC0** Contract | `src/types/pro.ts`, `src/types/proRoutes.ts`, `src/config/proRules.ts`, `src/services/proErrors.ts`, `src/services/proService.ts`, `src/services/proPhotoUrls.ts`, `src/services/proEntry.ts`, `src/utils/proFormat.ts`, `src/hooks/useProAccess.ts`, `src/hooks/useProBadge.ts`; tests `__tests__/services/proService.test.ts`, `__tests__/services/proErrors.test.ts`, `__tests__/services/proPhotoUrls.test.ts`, `__tests__/services/proEntry.test.ts`, `__tests__/utils/proFormat.test.ts`, `__tests__/hooks/useProAccess.test.tsx`, `__tests__/hooks/useProBadge.test.tsx`, `__tests__/config/proRules.test.ts` | this document; Appendix A (copy verbatim) | Files exist with the signatures of 4.6 and 7.5-7.6; their tests and `npm run typecheck` pass; no module-scope side effects; the argument names equal 4.6 |
| **PDB1** Database A | `supabase/migrations/20261023000000_pro_lockdown_legacy_tables.sql`, `20261023000100_pro_foundation.sql`, `20261023000200_pro_upkeep.sql`, `20261023000300_pro_profiles_invites.sql`, `20261023000400_pro_connections.sql`; `supabase/held/purge_legacy_pro_tables.sql`; `supabase/tests/pro/00_lib.sql`, `10_fixture_users.sql`, `20_fixture_closets.sql`, `99_tail.sql`, `p1_profile_invite_connect.sql`, `p8_legacy_lockdown.sql`; `scripts/run-pro-sql-tests.sh`; `__tests__/proFoundationMigration.test.ts`; `__tests__/migrationVersions.test.ts` (edit: the pro check by name and order, and the purge file in release form) | this document | The five files apply twice cleanly on a scratch PostgreSQL 16 loaded with every existing migration plus a stub of Supabase's roles, `auth.users`, `auth.uid()`, `auth.jwt()`, default grants and `storage.buckets`/`storage.objects` with row security (reuse the role, `auth.users`, `auth.uid()` and grant parts of `supabase/checks/local_stub.sql`, which has no `auth.jwt()` and no `storage` schema (existing migrations insert into `storage.buckets` and create policies on `storage.objects`, so both must exist before they run), and not its stand-in `clothing_items`, `friend_requests`, `get_friend_closet` and `material_usage_stats`: the real ones come from the migrations, and a stand-in created first would make `001_initial_schema.sql` skip the real table; the stub is a scratch file in each stream's own temp directory, not a repository file); `p1` and `p8` pass **on their own, with no file of PDB2 or PDB3**. The real-stack checks of swap.md section 10 (1) to (6) are not run here: streams cannot run Docker (BUILD-PLAN.md decision 18), so they are the lead's gate P4 |
| **PDB2** Database B | `supabase/migrations/20261023000500_pro_sharing.sql`, `20261023000600_pro_work.sql`; `supabase/tests/pro/p2_sharing.sql`, `p3_work.sql`, `race.sh`; `__tests__/proSharingWorkMigration.test.ts` | PDB1's files (tables, helpers, upkeep, fixtures) | As PDB1 for its files; `p2`, `p3` pass on the scratch database; `race.sh` passes on the scratch database (a local PostgreSQL, not the Supabase stack) |
| **PDB3** Database C | `supabase/migrations/20261023000700_pro_moderation.sql`; `supabase/tests/pro/p4_edges.sql`, `p5_deletion.sql`, `p6_moderation.sql`, `p7_catalog.sql`; `supabase/audit.sql` (one added check); `__tests__/proModerationMigration.test.ts`, `__tests__/proRulesInStepWithSql.test.ts`, `__tests__/proServiceInStepWithSql.test.ts`, `__tests__/proScripts.test.ts`, `__tests__/proMigrationFiles.test.ts`, `supabase/tests/pro/migrationFiles.ts` | PDB1, PDB2 merged for the final run | All eight files apply twice; `p1` to `p8` pass together; the swap SQL suites and `swapMigrations.test.ts` still pass after file 8 replaces `report_swap_content`; the in-step tests pass against PC0's files; `qualityRatingsMigration.test.ts` still passes |
| **PPH** Photo function | `supabase/functions/pro-photo/index.ts`; `supabase/config.toml` (one added block, `[functions.pro-photo]` with `verify_jwt = true`, and nothing else); `__tests__/functions/proPhotoFunction.test.ts`, `__tests__/functions/proPhotoBehaviour.test.ts` | this document (4.6 `pro_photo_source`, 4.8); `supabase/functions/_shared/jpegMetadata.ts` and `pngMetadata.ts` (read-only, imported) | The two tests pass and `npm run typecheck` passes; the function is written to the pins of 9.3 and is deployed only by the lead (11.1, P3) |
| **PLD** Legacy data | `src/services/localData.ts` (`RETIRED_PRO_KEYS`, `purgeLegacyProData()`, the retired keys leave `RESET_ONLY_KEYS`), `__tests__/services/localData.test.ts` (a fifth list); `src/services/seedDemoData.ts`, `src/services/storage.ts` (the seed lines only), `src/services/sampleDataRefresh.ts` (no stylist, client, marketplace or messaging seeding, and no import or call of `loadSampleAccountData`, which lives in the account service that INT-MODE shrinks); `__tests__/data/sampleData.test.ts`, `__tests__/services/sampleDataRefresh.test.ts` | nothing | The legacy services still compile (they are deleted in INT-CLEAN); `localData`, `sampleData`, `sampleDataRefresh`, `storage*` suites pass; no new `@smartcloset` key |
| **POL** Policy | `docs/privacy.html`, `docs/MODERATION.md`; `__tests__/docs/privacyPolicy.test.ts` (edit), `__tests__/docs/proPolicy.test.ts`. (`ios/smartcloset/PrivacyInfo.xcprivacy` and `Info.plist` are **not** changed; POL confirms by re-reading 6.8) | the owner's answers to 11.2 questions 5 to 7 (or their defaults) | The page and runbook say 5 and 6.7-6.8 and nothing false on the day; `privacyPolicy`, `proPolicy`, `privacyManifest` pass |
| **PUI1** Shared parts | `src/components/ProPhoto.tsx`, `ProStatusBadge.tsx`, `ProStylistCard.tsx`, `ProItemTile.tsx`, `ProTermsSheet.tsx`, `ProGuidelinesSheet.tsx`, `ProSafetySheet.tsx`, `ProBlockedSheet.tsx`, `ProAccessNotice.tsx`; their tests in `__tests__/components/` | PC0 | Props as 7.7; guards pass |
| **PUI2** Account entry | `src/screens/ProOnboardingScreen.tsx`, `src/components/ProRedeemSheet.tsx`, `ProStylistProfileSheet.tsx`, `ProSettingsSection.tsx`; tests | PC0 (PUI1 mocked) | As 7.3 and 7.7; the Settings section renders nothing and logs nothing when `supabase` is mocked to `auth` only |
| **PUI3** Client side | `src/screens/ProHomeScreen.tsx`, `ProConnectionScreen.tsx`, `ProShareScreen.tsx`; `src/components/ProConnectionCard.tsx`, `ProItemPicker.tsx`; tests | PC0 (PUI1, PUI2, PUI5 mocked) | As 7.7 |
| **PUI4** Stylist side | `src/screens/ProClientsScreen.tsx`, `ProClientDetailScreen.tsx`, `ProClientClosetScreen.tsx`, `ProLookEditorScreen.tsx`, `ProScheduleScreen.tsx`, `ProInboxScreen.tsx`; `src/components/ProClientRow.tsx`, `ProClosetGrid.tsx`, `ProClosetPicker.tsx`, `ProClosetItemSheet.tsx`, `ProInvitesSheet.tsx`; tests | PC0 (PUI1, PUI2, PUI5 mocked) | As 7.7 |
| **PUI5** Shared work | `src/screens/ProThreadScreen.tsx` (exports `PRO_MESSAGE_ACCESSORY_ID`), `ProRecommendationScreen.tsx` (exports `PRO_COMMENT_ACCESSORY_ID`); `src/components/ProAppointmentSheet.tsx`, `ProAppointmentRow.tsx`, `ProLookCard.tsx`; tests | PC0 (PUI1 mocked) | As 7.7 |
| **PAPI** API script | `scripts/pro-api-checks.mjs`, `__tests__/proApiChecksInStepWithService.test.ts`, `__tests__/live/proServiceLive.test.ts` | PDB1-3 and PPH merged | The script is written with a `--dry-run` mode, its in-step static test passes, and the live Jest file skips cleanly without its environment variables. **The first run on a local stack is the lead's gate P4**, with its report |
| **INT-MODE** Mode, navigation, Settings | `App.tsx`, `src/screens/SettingsScreen.tsx`, `src/context/AccountModeContext.tsx`, `src/services/accountService.ts`, `src/config/features.ts`; **deletes `src/screens/AccountTypeOnboardingScreen.tsx`**; `__tests__/navigationRoutes.test.ts`, `__tests__/screens/keyboardGuard.test.tsx` (one number), `__tests__/AppModeGate.test.tsx`, `__tests__/services/accountMode.test.ts`, `__tests__/screens/Settings.test.tsx`, `__tests__/screens/swapIntegration.test.tsx`, `__tests__/screens/ratingsIntegration.test.tsx` (assertions only), `__tests__/App.test.tsx` (a flag-on case); new `__tests__/screens/proIntegration.test.tsx`, `__tests__/context/AccountModeContext.test.tsx` | W1 merged | The 7.10 INT-MODE table is applied; the flag is still `false`; the guards and the suites of 9.5 pass |
| **INT-HOME** Home | `src/screens/HomeScreen.tsx`; new `__tests__/screens/homePro.test.tsx` | INT-MODE | 7.10; Home suites pass, including the flag-on cases |
| **INT-ACCOUNT** Account services | `src/services/backupService.ts`, `src/services/accountDeletion.ts`, `src/services/authService.ts`; new `__tests__/services/backupProExport.test.ts`; the existing suites of those three files (assertions added only) | INT-MODE | 7.10; suites pass |
| **INT-CLEAN** Clean-up | Deletes the files of 7.11 (the onboarding screen was already deleted by INT-MODE); `__tests__/screens/keyboardScreens.test.tsx` (remove the cases and mocks of deleted code, append the pro cases of 9.3) | INT-MODE, INT-HOME, INT-ACCOUNT | No reference to a deleted module remains (`grep`); typecheck, lint, the whole `npx jest` pass; `git status` shows the deletions |

**Ownership check at merge:** every path in the "Owns" column above appears in exactly one row (run `grep -o` for backticked paths over the second cell of each row only, resolving a bare file name against the directory before it, and sort for duplicates; it was run on this table when the document was reconciled with the repository and found none); `package.json`, `package-lock.json`, `jest.config.js`, `jest.setup.js`, `tsconfig*.json`, `ios/**`, `supabase/config.toml` (except PPH's one block), `supabase/functions/**` (except `pro-photo/`, owned by PPH), `supabase/checks/**`, `src/ui/**`, `src/components/KeyboardSafe.tsx`, `src/components/KeyboardLift.tsx`, `src/components/LoadError.tsx`, `src/hooks/useLoadable.ts`, `src/config/communityGuidelines.ts`, `src/config/legal.ts` are owned by nobody and are not edited (new files import or read them only). Nothing else a stream must touch is unowned. No new dependency, no new AsyncStorage key, one new edge function (`pro-photo`), no native change.

### 10.3 Integration pass rules

- One pass at a time, in the order INT-MODE, INT-HOME, INT-ACCOUNT, INT-CLEAN. A pass starts from the tree the previous pass left and runs `patch --dry-run`-style checks by re-reading the landmarks of 7.10 against the real file.
- INT-MODE leaves the flag `false`; it is flipped only by the lead (11.1, P9).
- Between INT-MODE and INT-CLEAN both the old and the new code compile. INT-MODE removes exactly one file, `AccountTypeOnboardingScreen.tsx`, together with its only import (nothing else uses what `accountService.ts` loses, once PLD has removed the `loadSampleAccountData` import from `seedDemoData.ts`); INT-CLEAN removes the rest, each with every reference.
- After each pass: the guards, the pass's suites, `npm run typecheck`, `npx tsc --noEmit --skipLibCheck`, `npm run lint` (9.5).
- A pass may make a minimal edit to an existing test file that fails only because of that pass's own change, and says which in its report; the files named in 10.2 are the ones expected.

### 10.4 Rules of engagement

- No stream runs `git add`, `commit`, `stash`, `checkout`, `reset` or `push`, `supabase db push`, `supabase functions deploy`, `supabase secrets`, or anything that changes the live project or an outside service. The database streams run SQL on a scratch PostgreSQL 16 with a Supabase stub (own temp data directory and free port, UTF-8 locale). `supabase start` needs Docker, which streams do not have (BUILD-PLAN.md decision 18), so the first run on a local Supabase stack, and every check that needs it, is the lead's gate P4. They never run the committing scripts (`race.sh`, the API script) against anything but a local database.
- No file or message in the repository names an AI assistant or its maker (a repository rule, `quality-ratings.md` 1.4); the policy tests scan for it.
- New `.tsx` files in `src/screens` and `src/components` are flat, follow the keyboard rules, have no module-scope side effects and never call `console.error` on a guest or failure path.
- Typecheck with `npm run typecheck` and the CI form `npx tsc --noEmit --skipLibCheck`.

---

## 11. Release checklist and open decisions for the owner

### 11.1 Release checklist (the lead's acts, in order)

Before anything: every wave and pass merged; `npm run typecheck`, `npm run lint`, `npx tsc --noEmit --skipLibCheck` and the whole `npx jest` run green; `PRO_MODES_ENABLED` is `false`.

| Gate | What | Done when |
| --- | --- | --- |
| **P0 Read-only checks on the linked project** | In the SQL editor: `select t, to_regclass('public.' \|\| t) is not null from unnest(array['stylist_profiles','stylist_clients','appointments','recommendations','styling_recommendations','message_threads','messages','booking_requests','stylist_reviews','profiles']) t;` then, for each that exists, `select count(*)`; `select tablename, policyname, cmd, roles from pg_policies where schemaname = 'public' and tablename in (<the nine>);` `select grantee, table_name, privilege_type from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon','authenticated') and table_name in (<the nine>);` `select extname from pg_extension where extname in ('pg_cron','pg_net','supabase_vault');` `select id, public from storage.buckets where id = 'wardrobe-images';` `select pg_get_functiondef('public.delete_user_account'::regproc);` `select policyname, cmd, roles, qual from pg_policies where schemaname = 'storage' and tablename = 'objects';` **`supabase migration list`** (the remote head: the eight pro files must end up later than it, 3.1). From a shell: an unauthenticated `curl -s -o /dev/null -w '%{http_code}'` of the `/object/public/` address of one existing photo, and a signed-in test user who is neither the owner nor a friend asking for another user's photo path. In the dashboard: whether email confirmation is required and whether **anonymous sign-ins are off**; the backup retention period. By the owner: which shipped builds still contain the pre-2026-10-04 Stylist and Client screens | The answers are written down. **Hard stops** (nothing below goes on until fixed): the bucket is public; the unauthenticated address returns 200 or the stranger gets the photo; any permissive policy on `storage.objects` that mentions `wardrobe-images` other than the owner policy and `friends can read wardrobe images`; anonymous sign-ins on; email confirmation off (unless the owner accepts that in writing). Any legacy row count above zero goes to question 3 of 11.2 before P3 |
| **P1 Lock the legacy tables (optional, early)** | To close today's exposure before the feature is ready, push file 1 **alone**: re-version **only file 1** by the recipe of 3.1 (`v` from the remote head) in a checkout that contains only that file of the eight (a plain `db push` applies every pending file in the folder); `supabase db push --dry-run` lists exactly that file. Verify with a test user: `GET /rest/v1/stylist_profiles` fails. **Then, before anything else is pushed, re-version files 2-8** to `v+1` ... `v+7`: the remote head is now file 1's version, and a later file with an older version would be skipped by `db push` | Read-only verification passes. The later full push lists the other seven, all later than the remote head |
| **P2 Policy** | POL merged; `docs/privacy.html` published on GitHub Pages and the live URL read against 6.8 and 5.1; `docs/MODERATION.md` in place; App Store Connect privacy label re-read against 5.1 (no new type expected) | The page makes no statement that is false on the day |
| **P3 Database and function** | **Re-version** the eight files by the recipe of 3.1 in one commit (`v = max(now, newest local or remote version + 1)`, then `v` ... `v+7`, same order; skip file 1 if P1 already pushed it) and run `npx jest __tests__/migrationVersions.test.ts` **alone**: it is the one test the rename can break, because every other pro suite finds the eight files by name (`supabase/tests/pro/migrationFiles.ts`, 9.3), `proMigrationFiles.test.ts` proves that against a renamed copy, and the whole-suite run required before P9 therefore stays green after the rename. `supabase db push --dry-run` lists **exactly the pending pro files of 3.1** (eight, or seven if P1 pushed file 1) in order and nothing else (a held file that was moved, or a stray file, stops the release; never `--include-all` without reading the dry run). Then `supabase db push`. Then `scripts/run-pro-sql-tests.sh p7_catalog p8_legacy_lockdown` against the project (they roll back) and `select to_regclass('t.log')` is null. Re-run the bucket and policy checks of P0: they stay hard stops until the switch is on. Confirm `select value from pro_config where key = 'pro_enabled'` is `false`. Then `supabase functions deploy pro-photo`: an unauthenticated request to it is 401, and a request with a user token for a made-up connection is 404 | Applied before any build containing the feature is distributed. The switch is still off |
| **P4 Scripts (the lead, on a local stack)** | On a local stack after `supabase db reset`: the whole SQL suite, `race.sh`, then `node scripts/pro-api-checks.mjs` (with `supabase functions serve pro-photo` running) and the live Jest file `__tests__/live/proServiceLive.test.ts`; the same API script once more against a Supabase branch that mirrors production, including the bucket and policy probes of 9.4 check 6. The first run of anything that needs Docker is here, and its report is kept | All pass, including the canary |
| **P5 Alerts and the term list** | Load at least 50 reviewed content terms into `swap_blocked_terms` (the method of `docs/MODERATION.md`). Schedule `select cron.schedule('pro-report-digest', '11 * * * *', $$ select public.pro_send_report_digest(); $$);` (and, optionally, `select cron.schedule('pro-janitor', '23 3 * * *', $$ select public.pro_janitor(true); $$);`). Prove the alert with a real test report: file one from a test account, then `select public.pro_send_report_digest(interval '0 seconds');` returns true and the message arrives; mark the report handled | The 24-hour aim in `proRules.ts` stays only if the alert arrived; otherwise reword it to "as soon as we can" before the build. `pro_set_enabled(true)` can now succeed |
| **P6 Switch on and two-phone walkthrough** | After P0 to P5 have passed: `select public.pro_set_enabled(true);`. Make an internal TestFlight build that shows the feature (7.4: a local one-line flag edit, distributed to the testers only and then discarded). Set `min_account_age_hours` to 0 for the walkthrough and back to 48 after. Run 9.6. If any step fails: `select public.pro_set_enabled(false);` | Every step passes. The switch stays on from here (App Review needs the server live); that is safe because every gate, filter and limit is live and the alert has been proved |
| **P7 App Store Connect, by hand** | Review notes (6.9) with two demo accounts already connected (approve the demo stylist with `pro_admin_approve_stylist`; make that account older than 48 hours or set `min_account_age_hours` to 0 for the review period, and tell the reviewer to create a fresh code there, because a code made at submission would be dead after 7 days); read the age-rating tier on screen; check whether a state age-verification law applies on release day (Utah, Texas, Louisiana: Texas's was challenged in court, check its status) and, if so, add Apple's Declared Age Range signal first; confirm the EU trader declaration matches the owner's individual status | Entered |
| **P8 Pre-existing blocker** | Sign in with Apple token revocation on account deletion (guideline 5.1.1(v)) is not implemented anywhere in `authService`, `accountDeletion` or `delete-account`. It is independent of this feature and applies to the app as it stands; it should be fixed before any new build goes to review | Implemented and tested, or the owner accepts the review risk in writing |
| **P9 Flip and release** | With `PRO_MODES_ENABLED = true` in the working tree, run `npm run typecheck`, `npm run lint`, `npx tsc --noEmit --skipLibCheck` and the **whole `npx jest` run** (7.4: this is the only time the shipped configuration is tested), and fix what fails in its owning test. Then one commit: `PRO_MODES_ENABLED = true` and the `ships on` assertion in `accountMode.test.ts`. Confirm `pro_enabled` is true on the server, and rehearse the kill switch on a test project (`pro_set_enabled(false)` then `true`). Build, TestFlight, then App Review | |

### 11.2 Open decisions (genuine product decisions; the default is taken until the owner says otherwise)

| # | Decision | Default taken | Effect if changed |
| --- | --- | --- | --- |
| 1 | First release **without** the public directory, reviews and client-initiated requests | Yes (1.3) | A directory first means the gates of 11.3 come before the build and a person must staff the queue |
| 2 | Who reads reports and the new-stylist queue, and where the hourly alert goes | The owner; the existing swap webhook in Vault (`swap_report_webhook`) | Without an alert the 24-hour wording is dropped (P5) |
| 3 | If P0 finds rows in the legacy tables: purge them? | Not purged; only locked. If any row holds a third party's name, email or phone, purge with the held file after the owner's yes | Rows with personal data left in locked tables stay a liability |
| 4 | Looks and sessions are deleted 90 days after a connection ends | Yes | "Until the client deletes them" needs a retention line on the page and a rule for what happens when the stylist leaves |
| 5 | Show a stylist's rates as free text with the no-payment line | Yes | "No rates at all" removes `rates_text` (a migration and a screen field) |
| 6 | Support address shown to stylists and clients | Keep `SUPPORT_EMAIL` (a personal Gmail) until the owner supplies a role address | The address is public in the terms, guidelines and policy |
| 7 | Keep a minimal suppression record for safety suspensions (hashed sign-in identifier, reason code, date, 24 months) so a suspended or reported stylist cannot re-register at once | **No, not in the first release.** Nothing in sections 3 and 4 builds it; holds, removals and suspensions are kept on the person while the account exists | If yes: a later migration adds a table written by `pro_admin_suspend` and by a deletion trigger, a retention job and a line in the privacy page (24 months is a legal judgement for the owner). If no (the default): a person suspended or reported for something serious can delete the account, lose the reports about it (the existing rule) and re-register under another email; new accounts wait 48 hours before they can create a code |
| 8 | Account type for a feature with in-person services | Ship invite-only as the current individual developer account; form an entity and enroll as an organization before any directory, fee or handling of money | The seller name shown on the App Store is the owner's legal name and the owner carries personal liability |
| 9 | Allow sharing the body profile and skin tone | Not in the first release; each is its own Phase 2 switch with its own consent screen, label entry and review | Needs `SensitiveInfo`/`OtherDataTypes` declared first |
| 10 | The new-stylist caps (3 clients and 1 live invite on probation; 25 and 10 once approved) | As written | `pro_limit` rows and `proRules.ts` |
| 11 | The invite share text has no App Store link (the app has no store URL constant) | Plain text with the code | Provide a link to add it |
| 12 | Publish the stylist and client terms as a web page next to the privacy page | In-app only | A new page and a link |
| 13 | Closet photos reach stylists through a server function that checks every view and removes location and camera data | Yes (4.8) | The alternatives are no photos for stylists in the first release (details only), or direct signed links (rejected: they hand the stylist the client's account id) |
| 14 | A hold on a stylist's invites that came from reports or churn releases itself after 7 days unless the owner confirms it | Yes | A longer period, or never (every hold waits for the owner, which a rival could exploit and which stops real stylists while the owner is away) |
| 15 | The sharing choice has no default: the client must pick "Only pieces I choose" or "All my pieces" | Yes (6.1) | A preselected "All my pieces" is quicker but puts more private photos in front of a stylist by accident |

### 11.3 After the first release (not built; what each needs first)

| Phase | Adds | Gates |
| --- | --- | --- |
| 2: directory | `directory_enabled` (default false), a stylist opt-in to be listed, `list_stylists` (fixed columns, opaque handle, block-aware, rate limited, hides unapproved and suspended), client requests (`requested` state, stylist accepts) | A person who staffs the queue; photo safety check that fails closed; a city or region field (declared in the privacy label as coarse location or physical address); counsel on EU marketplace duties (DSA trader traceability, DAC7) and the entity of 11.2 question 8; a term list of at least 50 reviewed terms loaded |
| 2: reviews | Reviews tied to a completed session, one per connection, a stylist reply that cannot edit or hide the review | Consumer-review law reviewed by counsel (FTC 16 CFR 465, EU rules); label for "verified" avoided |
| 2: more scopes | Body profile, skin tone, style profile, outfits, each its own `pro_grants.scope` | Label (`SensitiveInfo`/`OtherDataTypes`), consent text, second confirmation screen, privacy page |
| 3: media and push | Photos in looks, a `pro-media` edge function (metadata strip, fail-closed safety check), push reminders | `aps-environment` entitlement and device identifier in the label, the metadata pipeline of swap-media |
| 3: clean-up | Drop the nine legacy tables | A migration that first redefines `delete_user_account()` without them, with a deletion scenario in the same change |
| Fees for digital features | Featured placement, pro tools | In-app purchase only (3.1.1), Paid Applications Agreement, an entity |

### 11.4 Switches and rollback

`select public.pro_set_enabled(false);` pauses everything and stops closet reads at once (no release); stop sharing, end, block, report and export keep working. `pro_admin_hold_stylist` stops one stylist's new invites; `pro_admin_suspend` stops a person. The build flag is a one-line change and a new build. The lockdown of the legacy tables is never rolled back.

---

## Appendix A: copy

Everything a person reads, in one place. Stream PC0 copies these into `src/config/proRules.ts` and `src/services/proErrors.ts` verbatim (a test checks every constant exists and that none contains a commerce word: Book, Pay now, Buy, Checkout, Deposit, Premium, Featured, Verified, Certified, Top rated). `SUPPORT_EMAIL` is substituted where `<support email>` appears. Spelling follows the app: US English.

### A.1 Stylist terms (`PRO_STYLIST_TERMS`, version `2026-10`)

1. **You are independent.** You offer styling services as an independent professional. SmartCloset does not employ you, check your identity or qualifications, recommend you, guarantee your work or insure anyone. You are responsible for your services and for following the law where you work, including any license your work needs. Do not offer hair, makeup, skin, body-shaping, medical, dietary or weight-loss services through SmartCloset.
2. **Adults, and honesty.** You are 18 or older. Your profile is true and is about you. Do not pretend to be another person, a business you do not run, or someone employed or approved by a shop, a brand or SmartCloset. SmartCloset does not verify, certify or rank anyone, so do not say it does.
3. **Your clients' information.** A client decides what you can see and can stop it at any moment. Use what you see only to help that client. Do not copy it, share it, republish it, sell it, use it to train any model, or keep it after the relationship ends. Do not contact a client outside the arrangements you made with them. Screenshots are covered by this rule. A photo can show more than clothes: if you see people, children or private details in one, do not keep, copy or share it, and report it if it worries you.
4. **No payments in SmartCloset.** SmartCloset does not take payments, hold money or add fees. The rates in your profile are information you write. Agree payment with your client yourself, outside the app. Never ask for gift cards, cryptocurrency or wire transfers, and do not pressure anyone.
5. **Conduct.** Be respectful. No harassment, threats, sexual content, hate or anything illegal or objectionable. We do not tolerate it. If you meet a client in person, choose a public place and follow the safety tips.
6. **Reports and enforcement.** Anyone you work with can report you. We review reports, aiming for within 24 hours. We may pause your invites, suspend or remove your stylist profile or your account, and limit the number of clients while you are new. Suspending someone is always a person's decision.
7. **Ending, and deleting.** Either of you can end a connection at any time. If you close your stylist profile, your clients are disconnected and keep the looks and session records you already sent for about 90 days. If you delete your account, they keep them for the same time, labeled "Former stylist".
8. **Contact.** Questions or urgent concerns: <support email>.

### A.2 Client terms (`PRO_CLIENT_TERMS`, version `2026-10`)

1. **Independent professionals.** Stylists on SmartCloset are independent. SmartCloset does not check, recommend, guarantee or insure them or their advice, and is not a party to anything you arrange with them.
2. **You decide what to share.** Connecting shares nothing. You can let your stylist see your closet (never your wishlist) for 90 days: all your pieces, including any you add while sharing is on, or only ones you choose. Do not share pieces whose photos show people, especially children; a photo can show more than the clothes. Turn it off at any time and they lose access straight away. We can't take back what they have already seen. Your stylist has agreed to use what they see only to help you.
3. **No payments.** SmartCloset takes no payment. Any fee is agreed directly with your stylist. Never pay by gift card, cryptocurrency or wire transfer.
4. **Adults only.** You are 18 or older.
5. **Conduct and safety.** Be respectful. Report anything that worries you, and block anyone. If you meet in person, choose a public place, tell someone where you are going, and leave if you feel uncomfortable. In an emergency, call your local emergency number.
6. **When it ends.** Either of you can end a connection. Sharing stops at once. The looks and sessions stay in your list for about 90 days (messages about 30) and are then deleted. If your stylist deletes their account you keep what they already sent for the same time, labeled "Former stylist". If you delete your account, the looks and sessions of your connections are deleted. If you block a stylist, the looks, sessions and messages of that connection are deleted straight away.
7. **Reports and enforcement.** We do not tolerate harassment or objectionable content. We review reports, aiming for within 24 hours, and may suspend accounts.
8. **Contact.** Questions or urgent concerns: <support email>.

### A.3 Other constants

| Constant | Text |
| --- | --- |
| `PRO_NO_PAYMENT_LINE` | Payment is arranged directly between you and your stylist. SmartCloset does not take payments, add fees or guarantee any service. |
| `PRO_INDEPENDENT_LINE` | Stylists are independent professionals. SmartCloset does not check or vouch for them. |
| `PRO_SHARE_CONSENT` (version `2026-10`; the text was settled before the first release, so the version is not bumped, and any later change bumps it) | Let <name> see my closet. They will see the photo, name, type, color, brand, season, pattern, material, size and condition of the pieces you share. If you choose all your pieces, this includes pieces you add while sharing is on. Photos can show more than the clothes, so don't share pieces whose photos show people, especially children, or rooms and other private details. They won't see your wishlist, what you paid, your notes, tags, how often you wear things, or anything else. Sharing ends after 90 days unless you renew it, and you can turn it off at any time. We can't take back what your stylist has already seen. |
| `PRO_SHARE_ALL_HINT` | Includes pieces you add while sharing is on. |
| `PRO_PICKER_REMINDER` | Don't pick pieces whose photos show people, especially children. |
| `PRO_STYLIST_BANNER` | New stylists start with a limit of 3 clients and 1 live invite. |
| `PRO_SAFETY_ONLY_NOTE` | You can still stop sharing, end a connection, report or block while this is paused. |
| `PRO_SAFETY_ELSEWHERE_NOTE` | You can still stop sharing, end a connection, report or block from the Clients tab. (For the Schedule and Messages tabs, which list no connection.) |
| `proClosetNotShared(name?)` | `<name> hasn't shared their closet. You can ask them in a message.` Without a name: `They haven't shared their closet. You can ask them in a message.` (the same words as the `closet_not_shared` message of A.4, in one spelling with an ASCII apostrophe; `PRO_CLOSET_ASK_HINT` is the second sentence) |
| `PRO_SHARING_STOPPED_NOTE` | We have stopped sharing your closet with them. |
| `PRO_CONNECT_NOTE` | Nothing is shared when you connect. You choose what to share afterwards. |
| `PRO_GUIDELINES` (rules) | Be yourself. Don't impersonate anyone or claim approval you don't have. / No harassment, hate, sexual content, violence or anything illegal, in names, notes or messages. / Keep it about styling. Don't ask for or send money by gift card, cryptocurrency or wire. / Only share what's yours. Don't copy or pass on what a client shares. / Report anything that worries you. Reports are private. |
| `PRO_GUIDELINES_ENFORCEMENT` | We review reports and may pause invites, remove content or suspend accounts that break these rules. You can report or block anyone from their profile, a message, a look or a session. Blocking is private; they aren't told. |
| `PRO_SAFETY_TIPS` ("Meeting safely") | Meet in a public place for a first session. / Tell a friend where you're going and when. / Keep your address private until you trust the person. / Never pay by gift card, cryptocurrency or wire transfer. SmartCloset doesn't handle payments. / Leave if anything feels wrong. In danger, call your local emergency number. |
| `PRO_QUICK_REPLIES` | Thanks! / Sounds good / Can we find another time? / I'll update my closet |
| `PRO_PAUSED_MESSAGE` | Professional features are paused for now. |
| `PRO_NOT_DEPLOYED_MESSAGE` | Professional features aren't available yet in this version. |
| `PRO_UPDATE_REQUIRED_MESSAGE` | Update SmartCloset to keep using professional features. |
| `PRO_SERVER_BEHIND_MESSAGE` | Professional features are being updated. Please try again soon. |
| `PRO_SUSPENDED_MESSAGE` | Professional features are paused on your account. |
| System lines (`systemLineText`) | `connected`: You're connected. `ended`: This connection has ended. `sharing_on`: Closet sharing is on. |
| Closed wording (`closedExplanation`) | You ended this connection. / This connection has ended. |
| Report thanks | Thanks for letting us know. We review reports, aiming for within 24 hours. They won't be told it was you. |
| Block explanation | They won't be able to message you or see anything you share, and your connection ends. They won't be told. |
| Report reasons (`PRO_REPORT_REASONS`) | `spam` Spam or unwanted contact; `harassment` Harassment or bullying; `inappropriate` Inappropriate or offensive content; `impersonation` Pretending to be someone else; `false_credentials` Claiming approval or qualifications they don't have; `scam` Asking for money or a scam; `unsafe` Something unsafe; `unsafe_meeting` An unsafe in-person meeting; `underage` Seems to be under 18; `data_misuse` Misusing my information; `other` Something else |

### A.4 Error messages (`proErrorMessage`)

| Code | Text |
| --- | --- |
| `not_authenticated` | Sign in to work with a stylist. |
| `pro_disabled` | Professional features are paused for now. |
| `pro_suspended` | Professional features are paused on your account. |
| `pro_terms_required` | Please read and accept the terms to continue. |
| `adult_required` | Please confirm that you are 18 or older. |
| `account_too_new` | Your account is too new to create invite codes. Please try again in a day or two. |
| `stylist_profile_required` | Set up your stylist profile first. |
| `stylist_profile_removed` | Your stylist profile was removed. Email support if you think this is a mistake. |
| `invites_held` | Your invites are paused while we review your profile. Email support if you think this is a mistake. |
| `pro_unavailable` | This is no longer available. |
| `connection_ended` | This connection has ended. |
| `closet_not_shared` | They haven't shared their closet. You can ask them in a message. |
| `invite_invalid` | That code isn't valid or has expired. Ask your stylist for a new one. |
| `stylist_not_accepting` | This stylist isn't taking new clients right now. |
| `terms_version_mismatch` | The terms were updated. Please reopen and read them again. |
| `stale_consent_text` | Update SmartCloset to change sharing. |
| `invalid_request`, `unknown` | Something went wrong. Please try again. |
| `invalid_profile` | Check your profile and try again. (DETAIL `services`: Choose at least one service. `display_name`: Choose a name of 2 to 40 characters.) |
| `invalid_alias` | Choose a name of 2 to 30 characters. |
| `invalid_message` | Write a message of up to 500 characters. |
| `invalid_recommendation` | Check the title and the pieces and try again. |
| `recommendation_locked` | A look that has been sent can't be changed. |
| `recommendation_empty` | Add a note or at least one piece first. |
| `invalid_appointment` | Check the date, time and length and try again. |
| `appointment_closed` | That session can't be changed any more. |
| `appointment_conflict` | That time overlaps another confirmed session. |
| `item_not_found` | One of those pieces isn't in your closet any more. |
| `item_not_shared` | That piece isn't shared with you. |
| `text_not_allowed` | HINT `payment`: Payment wording isn't allowed here. `contact`: Links and contact details can't go here. `content`: That wording isn't allowed. `name`: Choose a different name. |
| `invalid_report` | Choose a reason. |
| `pro_rate_limited` | You're going a bit fast. Please wait a moment. |
| `invite_limit` | You have too many live invite codes. Revoke one or wait for one to expire. |
| `client_connection_limit` | You're connected to as many stylists as you can be. End one first. |
| `draft_limit` | You have too many drafts for this client. Delete one first. |
| `appointment_open_limit` | There are too many open requests. Wait for answers first. |
| `closet_page_limit` | You've looked at a lot of pieces today. Try again tomorrow. |
| `report_rate_limited` | You've sent several reports today. Please try again tomorrow. |
| `not_deployed` | Professional features aren't available yet in this version. |
| `offline` | You seem to be offline. Please try again. |

---

## Appendix B: normative SQL sketches

These are the shapes that engineers must not reinterpret. They compile and ran once on a scratch database (see "Status and provenance"), but were never part of a build; each stream compiles and tests its own, and may tighten but not loosen them. Statements not shown follow the same rules. Every `UPDATE` and `DELETE` has a `WHERE`.

### B.1 Raise helper and gate

```sql
create or replace function public.pro_raise(p_msg text, p_state text, p_detail text default null, p_hint text default null)
returns void language plpgsql set search_path = public as $$
begin
  if p_detail is null and p_hint is null then
    raise exception '%', p_msg using errcode = p_state;
  elsif p_hint is null then
    raise exception '%', p_msg using errcode = p_state, detail = p_detail;
  else
    raise exception '%', p_msg using errcode = p_state, detail = coalesce(p_detail, ''), hint = p_hint;
  end if;
end $$;

-- p_need: 'safety' (signed in only), 'member', 'client', 'stylist_setup' or 'stylist'.
create or replace function public.pro_gate(p_uid uuid, p_need text)
returns void language plpgsql stable security definer set search_path = public as $$
declare
  m public.pro_members;
begin
  -- An anonymous token is not a signed-in person. 'safety' (every way out) checks nothing more than that.
  if p_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then perform public.pro_raise('not_authenticated', '28000'); end if;
  if p_need = 'safety' then return; end if;
  if not coalesce((public.pro_cfg('pro_enabled'))::boolean, false) then perform public.pro_raise('pro_disabled', '42501'); end if;
  select * into m from public.pro_members where user_id = p_uid;
  if found and m.suspended_at is not null then perform public.pro_raise('pro_suspended', '42501'); end if;
  if p_need = 'member' then return; end if;
  if not found or m.adult_confirmed_at is null then perform public.pro_raise('adult_required', '22023'); end if;
  if p_need = 'client'
     and m.client_terms_version is distinct from (public.pro_cfg('client_terms_version') #>> '{}') then
    perform public.pro_raise('pro_terms_required', '42501', 'client');
  end if;
  if p_need in ('stylist_setup', 'stylist')
     and m.stylist_terms_version is distinct from (public.pro_cfg('stylist_terms_version') #>> '{}') then
    perform public.pro_raise('pro_terms_required', '42501', 'stylist');
  end if;
  if p_need = 'stylist' and not exists (select 1 from public.pro_stylists s where s.user_id = p_uid) then
    perform public.pro_raise('stylist_profile_required', '42501');
  end if;
end $$;
```

### B.2 Invite codes

```sql
-- Ten Crockford base32 symbols from the random bytes of a v4 uuid, skipping byte 6 (version) and byte 8 (variant),
-- which are not fully random. byte % 32 is uniform because 256 is divisible by 32. 50 bits.
create or replace function public.pro_new_code()
returns text language plpgsql volatile set search_path = public as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  b   bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  pos int[] := array[0, 1, 2, 3, 4, 5, 7, 9, 10, 11];
  i   int;
  out text := '';
begin
  foreach i in array pos loop
    out := out || substr(alphabet, (get_byte(b, i) % 32) + 1, 1);
  end loop;
  return out;
end $$;

create or replace function public.pro_norm_code(p_code text)
returns text language sql immutable set search_path = public as $$
  select translate(upper(regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g')), 'OIL', '011');
$$;
```

### B.3 Text filter (`pro_text_ok`)

```sql
create or replace function public.pro_text_ok(p_text text, p_mode text default 'chat')
returns text language plpgsql stable security definer set search_path = public as $$
declare
  t      text := public.swap_fold_text(p_text);
  -- folding removes a bidirectional override, so backwards text would pass every filter below and still read forwards:
  -- invisible and direction-changing characters are refused last, so a phrase keeps its own hint. The zero-width joiner
  -- and non-joiner and the variation selectors stay allowed (emoji sequences, several scripts).
  hidden boolean := coalesce(p_text ~ '[\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u200b\u200e\u200f\u202a-\u202e\u2060-\u206f\u3164\ufeff\uffa0]', false);
begin
  t := replace(replace(t, chr(8217), ''''), chr(8216), '''');        -- smart apostrophes from an iPhone keyboard
  if t = '' then return case when hidden then 'content' end; end if;
  if t ~ '(gift ?card|giftcard|western union|moneygram|wire transfer|bitcoin|\mcrypto\M|cashier''?s cheque|cashier''?s check|itunes card|overpayment|refund the difference)' then
    return 'payment';
  end if;
  if p_mode = 'public' then
    if t ~ '(\mvenmo\M|paypal|\mzelle\M|cash ?app|apple pay|send (me )?(the )?money|\mdeposit\M|bank transfer)' then
      return 'payment';
    end if;
    if t ~ '(https?://|www\.|\.com\M|\.net\M|\.org\M|\.io\M|\.me/)'
       or t ~ '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}'
       or t ~ '(^|\s)@[a-z0-9_.]{3,}'
       or t ~ '(\+?[0-9]{1,3}[ .-]?)?\(?[0-9]{3}\)?[ .-]?[0-9]{3}[ .-]?[0-9]{4}'
       or t ~ '\+[0-9][0-9 .-]{8,}[0-9]'
       or t ~ '(\mwhatsapp\M|\mtelegram\M|\msnapchat\M|\minstagram\M|\mon signal\M|\msignal (me|app)\M|\mwechat\M|\mdiscord\M|text me|call me|\mdm me\M)' then
      return 'contact';
    end if;
    -- a claim of approval by SmartCloset (the app vouches for nobody); a stylist's own outside credential does not name the app
    if t ~ 'smart[ ._-]*closet.{0,40}\m(official|verified|approved|endorsed|certified|partner|authorized|authorised|affiliated|staff|employee)\M'
       or t ~ '\m(official|verified|approved|endorsed|certified|partner|authorized|authorised|affiliated|staff|employee)\M.{0,40}smart[ ._-]*closet' then
      return 'content';
    end if;
  end if;
  if exists (select 1 from public.swap_blocked_terms b where b.kind = 'content' and t ~ ('\m' || b.term || '\M')) then
    return 'content';
  end if;
  if hidden then return 'content'; end if;
  return null;
end $$;
```
Mode `chat` allows contact details and ordinary payment talk between connected adults; `public` is the stranger-facing set, with the claims check. Both read `swap_blocked_terms` and both refuse hidden characters.

### B.4 Blocks and the member-left trigger

```sql
alter table public.user_blocks add column if not exists via_pro boolean not null default false;

drop policy if exists "Users can view their own blocks" on public.user_blocks;
create policy "Users can view their own blocks" on public.user_blocks
  for select to authenticated using (auth.uid() = blocker_id and not via_swap and not via_pro);
drop policy if exists "Users can remove their own blocks" on public.user_blocks;
create policy "Users can remove their own blocks" on public.user_blocks
  for delete to authenticated using (auth.uid() = blocker_id and not via_swap and not via_pro);

create or replace function public.pro_on_block() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    -- the pair lock a redeem takes: a block cannot commit between a redeem's block check and its insert
    perform public.pro_lock_users(new.blocker_id, new.blocked_id);
    perform public.pro_end_between(new.blocker_id, new.blocked_id);
  exception when others then
    raise warning 'pro_on_block: %', sqlerrm;      -- a block must never fail because of this feature
  end;
  return new;
end $$;
drop trigger if exists pro_on_block on public.user_blocks;
create trigger pro_on_block after insert on public.user_blocks
  for each row execute function public.pro_on_block();

create or replace function public.pro_on_member_left() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.status = 'active' then
      perform public.pro_end_connection(new.id, 'system');
    end if;
    if old.client_id is not null and new.client_id is null then
      update public.pro_connections set client_alias = null, updated_at = now() where id = new.id;
      delete from public.pro_recommendations where connection_id = new.id;
      delete from public.pro_appointments    where connection_id = new.id;
      delete from public.pro_grant_events    where connection_id = new.id;
      delete from public.pro_closet_views    where connection_id = new.id;
    end if;
    if old.stylist_id is not null and new.stylist_id is null then
      update public.pro_connections set stylist_label = null, updated_at = now() where id = new.id;
      delete from public.pro_recommendations where connection_id = new.id and status = 'draft';   -- the client keeps only what was sent
    end if;
    delete from public.pro_grant_items where connection_id = new.id;
    delete from public.pro_grants      where connection_id = new.id;
    delete from public.pro_connections where id = new.id and stylist_id is null and client_id is null;
  exception when others then
    raise warning 'pro_on_member_left: %', sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists pro_on_member_left on public.pro_connections;
create trigger pro_on_member_left after update of stylist_id, client_id on public.pro_connections
  for each row
  when ((old.client_id is not null and new.client_id is null) or (old.stylist_id is not null and new.stylist_id is null))
  execute function public.pro_on_member_left();
```
The inner updates change other columns only, so the `WHEN` clause cannot fire the trigger again. If either body swallows an error, `pro_refresh` repairs the connection at the next read of either person (4.5).

### B.5 Ending a connection

```sql
create or replace function public.pro_end_connection(p_id uuid, p_by text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  c public.pro_connections;
begin
  update public.pro_connections
     set status = 'ended', ended_at = now(), ended_by = p_by, updated_at = now()
   where id = p_id and status = 'active'
  returning * into c;
  if not found then return false; end if;

  insert into public.pro_grant_events (connection_id, scope, event)
    select g.connection_id, g.scope, 'connection_ended' from public.pro_grants g where g.connection_id = p_id;
  delete from public.pro_grant_items where connection_id = p_id;
  delete from public.pro_grants      where connection_id = p_id;
  update public.pro_appointments set status = 'cancelled', updated_at = now()
   where connection_id = p_id and status in ('proposed', 'confirmed') and starts_at > now();
  insert into public.pro_messages (connection_id, kind, code) values (p_id, 'system', 'ended');

  -- Many short connections that the CLIENT ended in a month: hold new invites until a person looks.
  -- Connections the stylist ended do not count (removing junk redemptions of a leaked code is the remedy).
  -- The hold lives on pro_members, which close_stylist_profile does not delete.
  if c.stylist_id is not null and (
       select count(*) from public.pro_connections x
        where x.stylist_id = c.stylist_id and x.status = 'ended'
          and x.ended_by = 'client' and x.client_id is not null
          and x.ended_at > now() - interval '30 days'
          and x.ended_at - x.started_at < make_interval(hours => public.pro_limit('churn_hours'))
     ) >= public.pro_limit('churn_connections') then
    update public.pro_members set invites_held_at = now(), invites_held_by = 'system', updated_at = now()
     where user_id = c.stylist_id and (invites_held_at is null or invites_held_by = 'system');
  end if;
  return true;
end $$;

-- The closed shell: stored, with its content deleted. Called for every connection between a blocker and the blocked.
create or replace function public.pro_shell_connection(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.pro_connections set shell_at = now(), updated_at = now() where id = p_id and shell_at is null;
  if not found then return; end if;                                  -- already a shell: nothing more to delete
  delete from public.pro_messages        where connection_id = p_id;
  delete from public.pro_recommendations where connection_id = p_id; -- items cascade
  delete from public.pro_appointments    where connection_id = p_id;
  delete from public.pro_closet_views    where connection_id = p_id;
  delete from public.pro_grant_events    where connection_id = p_id;
end $$;
```

### B.6 The one closet-access rule, and the photo source

```sql
create or replace function public.pro_can_read_closet(p_stylist uuid, p_client uuid, p_connection uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((public.pro_cfg('pro_enabled'))::boolean, false)
     and not exists (select 1 from public.pro_members m
                      where m.user_id in (p_stylist, p_client) and m.suspended_at is not null)
     and not public.is_blocked_between(p_stylist, p_client)
     and exists (select 1
                   from public.pro_connections c
                   join public.pro_grants g on g.connection_id = c.id and g.scope = 'closet' and g.expires_at > now()
                  where c.id = p_connection and c.status = 'active'
                    and c.stylist_id = p_stylist and c.client_id = p_client);
$$;

-- Called only by the pro-photo edge function, with the user id it read from the verified token. Service role only.
create or replace function public.pro_photo_source(p_uid uuid, p_connection uuid, p_item uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  c    public.pro_connections;
  path text;
begin
  select * into c from public.pro_connections
   where id = p_connection and stylist_id = p_uid and status = 'active' and shell_at is null;
  if not found or not public.pro_can_read_closet(c.stylist_id, c.client_id, c.id) then return null; end if;
  select public.pro_photo_path(ci.user_image, ci.user_id) into path
    from public.clothing_items ci
   where ci.id = p_item and ci.user_id = c.client_id and coalesce(ci.is_wishlist, false) = false
     and (exists (select 1 from public.pro_grants g where g.connection_id = c.id and g.scope = 'closet' and g.item_mode = 'all')
          or exists (select 1 from public.pro_grant_items gi where gi.connection_id = c.id and gi.item_id = ci.id));
  if path is null then return null; end if;                          -- every refusal looks the same
  perform public.pro_rate_check(p_uid, 'photo_day');                 -- counted on success only; the function maps the raise to 429
  return path;
end $$;
revoke all on function public.pro_photo_source(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.pro_photo_source(uuid, uuid, uuid) to service_role;
```
`get_client_closet` selects only the columns of 4.6 from `clothing_items`, joins the same grant rule, applies the cleaners and `left()` caps of 4.6, and never `select *`. The path returned by `pro_photo_source` goes to the edge function only; no function an app user can call returns a storage path to a stylist.

### B.7 Report constraints (file 8)

```sql
alter table public.content_reports drop constraint if exists content_reports_context_check;
alter table public.content_reports add constraint content_reports_context_check
  check (context in ('friend_request', 'friend_closet', 'profile', 'swap_listing', 'swap_chat',
                     'pro_profile', 'pro_chat', 'pro_content'));
alter table public.content_reports drop constraint if exists content_reports_reason_check;
alter table public.content_reports add constraint content_reports_reason_check
  check (reason in ('spam', 'harassment', 'inappropriate', 'impersonation', 'scam', 'not_as_described', 'unsafe', 'other',
                    'underage', 'false_credentials', 'data_misuse', 'unsafe_meeting'));
alter table public.content_reports drop constraint if exists content_reports_ref_type_check;
alter table public.content_reports add constraint content_reports_ref_type_check
  check (ref_type is null or ref_type in ('listing', 'swap', 'message', 'connection', 'recommendation', 'appointment', 'invite'));
```
The lists must stay supersets of the ones above in `20261015000400_swap_moderation.sql` and `20261015000100_swap_foundation.sql`; `proModerationMigration.test.ts` asserts it. (A re-run of the swap files after this one would narrow them again; `db push` and `db reset` apply each file once, in order.)

### B.8 The janitor

```sql
create or replace function public.pro_janitor(p_force boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not pg_try_advisory_xact_lock(hashtextextended('pro_janitor', 0)) then return; end if;
  if not p_force and exists (select 1 from public.pro_meta where last_janitor_at > now() - interval '15 minutes') then return; end if;
  begin                                                  -- a sweep must never fail the read that triggered it
    update public.pro_meta set last_janitor_at = now() where id;          -- one row: WHERE id, or the API refuses it

    delete from public.pro_messages where ctid in (
      select m.ctid from public.pro_messages m join public.pro_connections c on c.id = m.connection_id
       where (c.status = 'ended' and c.ended_at < now() - make_interval(days => public.pro_limit('ended_message_retention_days')))
          or m.created_at < now() - make_interval(days => public.pro_limit('message_retention_days'))
       limit 5000);
    delete from public.pro_connections where ctid in (
      select ctid from public.pro_connections
       where status = 'ended' and ended_at < now() - make_interval(days => public.pro_limit('ended_connection_retention_days'))
       limit 5000);
    delete from public.pro_invites where ctid in (
      select ctid from public.pro_invites
       where (status = 'used' and used_at < now() - interval '30 days')
          or (status = 'revoked' and revoked_at < now() - interval '30 days')
          or expires_at < now() - interval '30 days'
       limit 5000);
    delete from public.pro_rate_counters where ctid in (select ctid from public.pro_rate_counters where window_start < now() - interval '2 days' limit 5000);
    delete from public.pro_closet_views  where ctid in (select ctid from public.pro_closet_views  where day < current_date - 90 limit 5000);
  exception when others then
    raise warning 'pro_janitor: %', sqlerrm;             -- bounded deletes, because query_canceled is not trapped here
  end;
end $$;
```


### B.9 Evidence under a byte budget (file 8)

```sql
-- The last n messages (bodies cut), the flagged message always included, shrunk until it fits the table's check.
create or replace function public.pro_chat_evidence(p_connection uuid, p_reporter uuid, p_flagged bigint, p_qualified boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  n  int := 30;
  ev jsonb;
begin
  loop
    select jsonb_build_object(
             'messages', coalesce(jsonb_agg(jsonb_build_object(
                'id', t.id,
                'who', case when t.kind = 'system' then 'system' when t.sender_id = p_reporter then 'reporter' else 'reported' end,
                'body', left(t.body, public.pro_limit('evidence_body_chars')),
                'at', t.created_at) order by t.id), '[]'::jsonb),
             'flaggedMessageId', p_flagged, 'qualified', p_qualified)
      into ev
      from (select m.* from public.pro_messages m
             where m.connection_id = p_connection
               and (m.id = p_flagged
                    or m.id in (select id from public.pro_messages where connection_id = p_connection order by id desc limit n))
             order by m.id) t;
    exit when pg_column_size(ev) <= public.pro_limit('evidence_bytes') or n <= 1;
    n := greatest(1, n - 3);
  end loop;
  return ev;
end $$;
```
`report_swap_content` gets the same treatment in file 8: its evidence is built under the same two numbers (18,000 bytes, 300 characters), written as literals in that function because swap must not depend on a pro function, and its signature, grants and every other behaviour are unchanged. That includes the evidence keys it writes today: its message objects keep `id`, `from`, `body`, `code` and `at` (not the `who` that `pro_chat_evidence` writes), because `s5_moderation_community` reads `from`; every other key of its listing and swap evidence stays as it is (3.5).

### B.10 Redeeming a code: the order that matters (file 4)

```sql
-- redeem_pro_invite, in the order that makes it race-free. Failures of the code RETURN; they do not raise.
perform public.pro_gate(uid, 'client');
perform public.pro_rate_check(uid, 'redeem_day');                       -- every call counts; the returns below commit it
norm := public.pro_norm_code(p_code);
select stylist_id into sid from public.pro_invites where code = norm;   -- 1. read only: decide nothing here
if sid is null then return jsonb_build_object('ok', false, 'error', 'invite_invalid'); end if;
perform public.pro_lock_users(sid, uid);                                -- 2. the same lock every stylist-side function takes
select * into inv from public.pro_invites where code = norm for update; -- 3. the locked row decides
if not found then return jsonb_build_object('ok', false, 'error', 'invite_invalid'); end if;   -- deleted since step 1
select id into existing from public.pro_connections where invite_id = inv.id and client_id = uid and status = 'active';
if found then return jsonb_build_object('ok', true, 'connectionId', existing, 'alreadyConnected', true); end if;   -- a retry, while the connection lasts
if inv.status <> 'live' or inv.expires_at <= now() or sid = uid
   or not exists (select 1 from public.pro_stylists s where s.user_id = sid)
   or exists (select 1 from public.pro_members m where m.user_id = sid and (m.suspended_at is not null or m.stylist_removed_at is not null))
   or public.pro_invites_held(sid) or public.is_blocked_between(sid, uid)
   or not (select accepting_clients from public.pro_stylists where user_id = sid)
then return jsonb_build_object('ok', false, 'error', 'invite_invalid'); end if;
-- ... alias (pro_clean_name, then pro_name_ok: a reserved word is text_not_allowed / alias / name), client_connections cap, stylist_clients cap (these raise) ...
update public.pro_invites set status = 'used', used_at = now() where id = inv.id and status = 'live';   -- 4.
if not found then return jsonb_build_object('ok', false, 'error', 'invite_invalid'); end if;            --    nothing inserted yet
insert into public.pro_connections (stylist_id, client_id, stylist_label, client_alias, invite_id) values (...) returning id into cid;
insert into public.pro_messages (connection_id, kind, code) values (cid, 'system', 'connected');
return jsonb_build_object('ok', true, 'connectionId', cid, 'alreadyConnected', false);
```
`revoke_pro_invite`, `close_stylist_profile`, `set_stylist_accepting`, `save_stylist_profile` and the admin hold, release, suspend, remove and restore take `pro_lock_users(stylist, stylist)`, which is the same advisory lock, so none of them can interleave with step 3 to 6.

---

## Review notes

Three critics reviewed the first revision (about 60 findings, two blockers). Every blocker and every major finding is applied, and so are the minor ones that were cheap. The items below were applied in a different way from the suggested fix, or not applied, and say why.

1. **Photo paths and the client's account id (blocker).** The critics offered two fixes. This document takes the first: an edge function, `pro-photo`, so that a stylist is never given a path or a link. The second (accept the id and add a trigger on `friend_requests` that refuses pairs with a connection) only hides one consequence, writes a rule into the friends feature's table, makes the alias promise false, and does nothing for the metadata finding. The function closes both findings with one component and reuses swap-media's strippers. The cost is one invocation per photo tile that scrolls into view (bounded by 200 pages a day per connection and 3,000 photos a day per stylist), a new stream (PPH) and a deploy step (P3). Open decision 13 lets the owner choose "no photos for stylists in the first release" instead.
2. **Name of the weak gate.** The findings call it `member_safe` in one place and `safety` in another. This document uses one name, `safety`.
3. **A table of invite previews (major, optional fix).** Not added. An invite report can still be filed by anyone who holds the uuid, which costs only queue noise: such a report never counts toward a hold and is bounded by the 20-a-day limit. A `pro_invite_previews` table would be a sixteenth table that does not stop a throwaway account from previewing the same code. The other fix the critics offered, counting only reporters who really worked with the stylist, is what is built (6.4).
4. **What a hold does to codes already issued.** The critics offered "they still work for 7 days" or "the hold releases itself after 7 days". The second is built. During a hold the stylist's live codes stay unredeemable, because a stylist reported by two people who really worked with them is exactly the case in which more people should not connect.
5. **The closed shell and a deleted account.** The claim that the two look the same is dropped instead of made true. Making a deleted stylist's account hide the looks already delivered would change the client terms (A.2, item 6) and a behaviour the owner has not asked for. What is kept is the promise that can be kept: the shell is stored, its content is deleted at block time, nothing says "blocked", and unblocking changes nothing.
6. **A suppression record and evidence kept after deletion (finding on open decision 7).** Not built. Keeping unreviewed safety reports for 90 days after the reported account is deleted means changing the cascade of `content_reports`, an existing rule that the privacy page states ("reports are deleted with either account") and that friends and swaps share. The default of decision 7 is changed to No, the sentence that relied on it is gone from 6.6, and the residual risk is written down there. The owner can reverse it.
7. **`report_swap_content` has the same evidence bug.** It is fixed inside file 8 so that the release stays eight files, rather than in a separate swap migration. It is the one existing function this release replaces; the swap SQL suites run after it, and the caveat that re-running the earlier swap files would restore the old body is in 3.3, rule 10.
8. **Swap's cleaners.** Pro gets its own copies (`pro_clean_materials`, `pro_clean_season`) instead of calling swap's, to keep rule 9 of 3.3 (no pro dependency on a swap function) and the independence of the two catalogue tests.
9. **Reading history while suspended.** Reads of an ended connection use the `safety` gate for everyone, so the promise of 7.8 holds without a special case; reads of active connections keep their role gates. An admin suspension ends all of a person's connections, so this exposes nothing that was not already theirs.
10. **The walkthrough needs the server on.** TestFlight builds point at production, so P6 switches `pro_enabled` on before App Review instead of testing against a branch. What remains exposed (a person with API skills calling the functions while the switch is on and no public build shows the screens) is the ordinary state of a launched feature, and every gate, filter, limit and alert is in place by then (P0 to P5).
11. **Bumping the consent text.** The findings ask for a bump of `share_text_version` after the text changed. The feature has not shipped, so the text is settled at `2026-10`; any later change bumps it.
12. **Tab badges.** The sentence promising them was removed from 1.1 instead of building them; Home carries the one badge.
13. **Blocking before connecting.** Done by giving `block_pro_member` an optional `p_invite` argument instead of adding a second function, so the list of client functions stays at 36 and no function is overloaded.
14. **Streams and Docker.** Accepted as written: no stream is asked to run `supabase start` any more. The first run on a local stack, and everything that needs it, is the lead's gate P4.
15. **A block made in Friends or Swaps against a redeem in flight (review, major).** `pro_on_block` did not take the pair lock that `redeem_pro_invite` and `block_pro_member` take, so a block that committed between a redeem's block check and its insert left an active connection between a blocked pair, which nothing repaired. The trigger now takes `pro_lock_users(blocker, blocked)` first (no deadlock: a redeem never holds a `user_blocks` row lock while it waits), and `pro_refresh` finishes any connection that is still active, or not yet a shell, between a blocked pair, with the blocker's role and under the same lock, so a swallowed trigger failure is repaired at the next read. `race.sh` gained the `block` scenario (a Friends block against a redeem, in both orders), and `p4_edges` the repair.
16. **`list_pro_connections` returned `ended_by = 'system'` (review, major).** With the other person's label still present, `system` told a stylist's client (or the stylist) that the other side was suspended or removed, while a deleted account shows no label. The list now maps `system` to the other person's role, exactly as `get_pro_connection` reads it as `them`. The client needed no change.
17. **Five Jest suites named the working migration files (review, major).** They failed with ENOENT after the release rename, which the design says only `migrationVersions.test.ts` should notice. They now find the files by name through `supabase/tests/pro/migrationFiles.ts`, and `proMigrationFiles.test.ts` proves it against a renamed copy of the folder and fails if a suite writes a `\d{14}_pro_*.sql` name again. The helper lives outside `__tests__` because Jest treats every file there as a suite.
18. **A failed re-read of the access status replaced a page that had data (review, major).** The fix is in the hook, once, and not in eleven screens: a failure that is not sign-out, the switch or a missing server keeps the state the screen has and sets `refreshFailed`. The screens' own data banners still say when their lists could not be refreshed; no extra banner was added for the status alone.
19. **Where the other person is (review, major).** The privacy page said a stylist never sees a client's location, but a session carried the proposer's IANA zone name, shown as a city. The preferred fix was taken: the session carries a number, the proposer's offset from UTC at the start, and the app shows "(11:00 PM their time, UTC+1)". An offset is still a coarse hint of where someone is, so the page now says exactly that: a time, not a place, with no city or region. `formatSession` compares offsets at the moment of the session, so daylight saving is right on both sides.
20. **A stylist's unsent drafts survived their account for up to 90 days (review, major).** Invisible to everyone, but the page promised that clients keep only what was sent. `pro_on_member_left` (and the repair in `pro_refresh`) now deletes the drafts of a connection whose stylist left; the sent looks stay. `p5_deletion` pins the new count.
21. **The smaller findings of the same review.** Report details are no longer put through the text filters (a victim cannot quote a scam otherwise; only moderators read them), and are stripped of control characters instead of refused. `pro_report_is_qualified` counts only the reported person's messages. Hidden and direction-changing characters are refused by `pro_text_ok` itself, last, with the hint `content`, and not field by field with `invalid_*` errors: one place, every field that uses it, an existing message in the app, and a phrase keeps its own hint. The zero-width joiner and non-joiner and the variation selectors are exempt, because the review's own list (the class of `pro_clean_name`) would have refused every emoji sequence in a message. A claim of approval by SmartCloset is refused in the stranger-facing fields with the hint `content` (the hint `name` would read "Choose a different name" under a bio). A spent code counts as "already connected" only while its connection is active, in both functions. A client alias goes through `pro_name_ok` like a display name (an alias with no letter is refused too). `PRO_RPC_NESTED` closes the gap in `PRO_RPC_COLUMNS`. The access notice takes its titles from `proRules.ts`, and the closet-not-shared line is spelled once. The appointment row puts its status under the text. The three sheets that screens mount while closed read when they open. The rates field suggests no amount. Settings' connect sheet offers only Done. The Schedule and Messages tabs point to the Clients tab. Stylist terms item 7 separates closing the profile from deleting the account. The privacy page names the view receipt, the copied piece names, the invite label and the offset from UTC. The closet a stylist browses has Report or block (6.4, 6.9).
22. **A date-dependent check in `p1`.** "The invite lasts seven days" compared an interval, which gains an hour when a daylight-saving change falls inside the week (it did on 2026-10-25 in a zone that changes on 1 November). The check now compares calendar days in the session zone, which is what the function computes.
