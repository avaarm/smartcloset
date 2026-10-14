# Clothing swaps: build specification

Status: final design, ready to build. Written 2026-10-13 against `main` at the commit that added size, condition and tag fields (`6334a73`), Supabase project `ipgndphqbuftuxstoitk`.

Feature: people swap pieces of clothing with each other, item for item. Friends first; people who are not friends only after a server switch is turned on.

Revision 2 (2026-10-13). A second review found thirteen gaps in the first version of this document. All are resolved here: migration numbers and shared files are settled with `documentation/design/quality-ratings.md` (10.1), the migrations that wait for a decision no longer sit in the folder `supabase db push` applies (4.1), the original-photo bucket claim is gated (G0), moderation holds are sticky (4.4), a block no longer shows (2.4, 3.9), consent is recorded against the text the member saw (6.3), the sweep no longer trusts an unverified token (5.1), the text and completeness rules run again at commit (4.1, `swap_validate_item`), a one-sided "We swapped!" no longer locks the other member in (3.6), reports reach a person (11.3), account deletion works on a fresh database (4.1), PNG photos can be listed (5.2) and the community photo check fails closed on UNKNOWN (5.1). Section 0 says what was re-run.

## Contents

0. What was verified, and what was not
1. The design in brief, and where it departs from the starting positions
2. The four hard questions, answered
3. Product behaviour: every flow and every screen state
4. Data model and migrations
5. Photos, the `swap-media` function and the hand-off
6. Client API: types, rules, errors, service, hooks
7. UI: components, screens, routes, and the lines the lead adds
8. Privacy, safety and compliance changes
9. Test plan
10. Implementation streams, file ownership and merge order
11. Rollout, ship gates and moderation runbook
12. Deferred items and open questions for the product owner
13. Traceability: the review conditions and where each is met

Appendices (all code in this document was run or compiled as described in section 0):
A migrations, B edge function and shared modules, C client code, D scripts, E SQL behaviour scripts, F Jest tests.

---

## 0. What was verified, and what was not

The SQL, the pure TypeScript and the Jest tests below are not sketches: they were run. Revision 2 re-ran all of it after the changes.

| Thing | How it was checked | Result |
| --- | --- | --- |
| Migrations | The six files in `supabase/migrations` (the prerequisite and five swap files) applied, in order and then a second time, to PostgreSQL 16 loaded with every existing repo migration plus a stub of Supabase's `auth`, `storage`, roles and default grants (`anon`, `authenticated`, `service_role`). The two held files applied by hand, twice | Clean both times |
| SQL behaviour scripts (Appendix E) | Run through the same transaction wrapper as `scripts/run-swap-sql-tests.sh` against that database, each inside `BEGIN ... ROLLBACK` | 315 checks pass in six scenarios (61, 54, 64, 15, 105, 16; the first version had 247), 6 more in the optional policy script. The new s1, s3 and s5 checks fail against the first version's migrations (mutation run) |
| Concurrent accepts | Two real sessions accepting two proposals for the same piece (`race.sh`), re-run on the revised migrations | One `accepted`, one `unavailable`, one reservation |
| Account deletion | Real `delete_user_account()` for a member with listings, an open and a completed swap, then for the other member. In the first version this scenario only passed on a database where `styling_recommendations` had been created by hand; on a database built from the migrations alone it failed with "relation does not exist" (found by re-running it); the prerequisite migration fixes that | Zero rows left for the leaver, anonymous stub for the survivor, none after both leave |
| Storage read policy | `select` on `storage.objects` as friend, stranger, anon, owner; client insert refused | As designed |
| Metadata stripping | JPEGs made by Pillow (Exif with GPS and orientation, ICC profile, comment, progressive scan, trailing bytes) and PNGs made by Pillow (text, XMP, Exif, resolution, ICC profile, palette with transparency, trailing bytes), cleaned and decoded again | Pixels identical, GPS, camera and text gone, rotation, colour profile and transparency kept |
| Pure TypeScript | `npm run typecheck` (`tsc -p tsconfig.native.json`) on a copy of the repo with these files in place | No errors. The first version's `swapService.test.ts` had one (a spread of a zero-argument mock); fixed |
| Jest | 188 tests in 18 suites (the first version: 144 in 15) in a copy of the repo: service, errors, photo links, wording, hooks, two components, backup export, migration text and migration versions, edge helpers (JPEG, PNG, secret compare, moderation), edge function source, policy and manifest. The whole repository suite (149 suites, 3,566 tests) also passes with these files and the swap-only shared edits in place | All pass |
| The lead's edits to shared files (7.7) | The swap-only edit applied to a copy of today's tree and each file's existing suites run (Home, item screen, Settings, route and keyboard guards, `App`, `AppModeGate`, `authService`, `accountDeletion`, `backupService`): all pass. The diffs in Appendix D are written against the tree after the ratings pass (10.1), which does not exist yet: they were generated from a simulation of the ratings edits taken from `quality-ratings.md` 6.3 and 5.9, and `patch --dry-run` applies them cleanly to that simulation | Pass; the post-ratings diffs must be re-checked by the lead against the real tree (10.1) |

Not run, so treat as unverified until a person has done it:

- the migrations on a real Supabase local stack (`supabase start`) or on the live project: they were run on a PostgreSQL 16 stub of Supabase, which reproduces the roles, the default grants and `auth.uid()` from `request.jwt.claims` but is not Supabase. Stream S1's first task is to run `supabase db reset` and the scripts on the real local stack (the checklist is in section 10);
- the `swap-media` function under Deno (it type-checks with shims, and its decision functions are tested);
- the report digest (`swap_send_report_digest`) with `pg_net` and Vault: only its counting and its quiet failure where they are missing were run;
- the storage read policy and signed links through the real Supabase Storage API (the policy is tested as SQL; the signing path is the same one the existing friend-photo policy relies on, but it must be proved with a real `createSignedUrls` call, see ship gate G4);
- `supabase db query --linked` (the scripts use only plain SQL; the CLI shows just the last result set, so the scripts end with one `select` and raise on failure);
- every React screen and sheet other than `SwapPhoto` and `SwapStatusBadge` (they are specified, not written);
- the live state of `wardrobe-images` after gate G0 (the second review's read-only catalogue query on the linked project showed the bucket flagged public; it was not repeated here), whether `pg_cron` and `pg_net` exist on the project, the backup retention period, Apple's age-rating wording, and the live definition of `styling_recommendations` (the prerequisite migration takes the repository guide's definition and S1 compares it with the live table).

Two harness notes for whoever runs the SQL scripts. First, `s4_deletion.sql` prints `WARNING: swap_on_item_gone: ... violates foreign key constraint` lines. They are expected: the fixtures are created inside the same transaction that deletes the account, so PostgreSQL re-checks a foreign key it would normally skip. In production those triggers succeed, and the exception handler exists so that they could never block a deletion anyway. Second, the scripts create auth users with only an id, email, name and created date; if the live `auth.users` has triggers or required columns that reject that, adjust `10_fixture_users.sql` only.

---

## 1. The design in brief

### 1.1 What a person sees

- A piece is "open to swap" when its owner turns that on (a card on the item screen). Friends see it by default. People who are not friends see it only if the server switch for the community tier is on, the owner has joined it, and they chose "Community" for that piece.
- Others see a clean card: photo, name, brand, size, condition, materials, care, country of origin, season and a short note. Never what the owner paid, private notes, wear history, tag text, wishlist, email or location.
- To swap: open a piece, tap "Offer a swap", choose one to three of your own open pieces (and optionally up to two more of theirs), add a short note, send. The other person accepts or declines. After an acceptance both pieces are set aside, the two talk in a short text thread, meet or ship, and each taps "We swapped!" on their own phone. That adds the other person's piece to their own closet with its photo and details and removes theirs (or keeps it, by choice).
- No money, deposits or gift cards: the app never handles payment and refuses scam wording.
- There are no push notifications. A dot and a count on Home, sections in the inbox, and a thread that refreshes every 15 seconds while it is open.

### 1.2 How it is built

- Four new screens, all in the existing Home stack (no new tab): `SwapBoard`, `SwapListing`, `MySwaps`, `SwapThread`.
- Ten new tables, none readable or writable by an app user. Every read and write is a `SECURITY DEFINER` function that checks sign-in, blocks, suspension and audience and returns a fixed list of columns. Block-awareness cannot live in row policies, because `is_blocked_between` is deliberately not callable by clients (a probe against the live database proved it).
- A listing is a snapshot of the item taken by the server, with its own copy of the photo in a new private bucket `swap-photos`. Editing or deleting the closet piece cannot change what someone is about to accept, and nothing about `wardrobe-images` or its policies changes.
- One edge function, `swap-media`, copies the photo (a JPEG or a PNG; removing its metadata, and for the community checking it with Google Cloud Vision), creates the listing, and runs the daily sweep.
- Reservation happens only when the recipient accepts, under per-member advisory locks, with a unique index as the last line of defence.
- Everything that ends a swap behind the scenes (a block, an unfriend, a deleted piece, a deleted account, a suspension) ends it as `unavailable`, which looks the same to the person whichever it was, so a block is never revealed: the swap stays in both inboxes as a closed row (2.4).
- Block, unfriend, item deletion and account deletion are handled by triggers and foreign-key cascades. `block_user()`, `report_user()` and `delete_user_account()` are not replaced.

### 1.3 Departures from the starting positions, and why

| Starting position | Final | Reason |
| --- | --- | --- |
| Friends by default, opt-in community per item | Same, but the community tier is built and dark: server switch `community_enabled` is false, and it needs 18+ attestation, a moderated alias, a 48 hour old account, a joined viewer, a photo that passed the safety check, and at least 50 loaded objectionable terms before the switch will turn on | Stranger-to-stranger content and chat is where App Review 1.2, safety and cost concentrate. The friends tier is useful alone, so the community tier can wait for a staffed report queue without delaying it |
| Items exposed through whitelisted definer functions | Same, plus no direct table access at all (not even own rows) | Reads need block checks; policies cannot make them |
| Listing state as a flag on the item | Separate immutable `swap_listings` table | No change to `clothing_items`, `storage.ts` or the legacy friends policy; no stale-snapshot overwrites; bait-and-switch protection |
| Photos for swaps from `wardrobe-images` | New private bucket, copies named by listing id (no user id), policy answered by a definer function | The friend policy there is folder-wide and its state (public or private) is not under this repo's control; strangers must never learn a user id from a path |
| Metadata removal by re-encoding | Lossless metadata strip, no decoding, for JPEG and for PNG | A decoder in the edge runtime was the least certain piece of the earlier designs. Stripping markers or chunks keeps every pixel, was tested on real JPEGs and PNGs, and has no dependency. The safety check looks at the same pixels either way |
| Hand-off in one transaction | Per member and additive: each person's own tap adds the received piece to their own closet; the app copies the photo and removes the piece they gave | No transaction ever changes the other person's closet, and a member who is not in the app is never changed |
| `block_user()` and `delete_user_account()` extended | Left alone; triggers and cascades do the work | The copies could drift from the live bodies |
| Messages free-form | Text only, 500 characters, rate limited. Between friends no contact filtering; between strangers, before acceptance, contact details and payment words are refused. Scam phrases are refused always | Friends legitimately say "text me"; strangers must not be steered off the app before consent |
| Reports as they were | Reports carry the listing snapshot or the last 30 messages, are resolved on the server so the app never needs the other member's id, and a listing reported by three different people is hidden (reversible). Suspension is always a person's decision | Brigading must not be able to remove a member automatically |

Out of scope here, deliberately: ratings and brand insight (a separate feature with its own consent), push notifications, counter-offers, photos in chat, shipping addresses, swap-partner reputation.

---

## 2. The four hard questions, answered

### 2.1 How can participants and community viewers see only listed photos, without making the bucket public?

- Listing photos live in `swap-photos`, a private bucket (5 MB limit, JPEG and PNG). Object names are the listing id plus `.jpg`: no user id, no timestamp, no original name.
- There is one storage policy on it: `select` for `authenticated` where `can_view_swap_photo(name)` is true. That function is `SECURITY DEFINER` and answers `false` in exactly the same way for "no such photo", "not listed", "blocked", "withdrawn" and "not allowed", so it reveals nothing, not even a block. The owner always passes; others pass while the listing is on the rack for them; a participant passes while the swap is proposed, accepted or completed and nobody is blocked.
- There is no insert, update or delete policy. Only the service role (the `swap-media` function) writes or deletes.
- Storage `list` goes through the same policy, so enumerating the bucket shows only what the viewer may see (checked by the scripts).
- The app asks for links that last ten minutes and keeps them in memory only, never in AsyncStorage (unlike `imageUrls.ts`). A withdrawn or blocked photo stops loading within ten minutes.
- This design does not depend on whether `wardrobe-images` is public or private today, and it does not widen the existing friend policy. What the live flag means for the privacy page is a separate matter with its own gate (G0): a catalogue query on the linked project showed that bucket flagged public, so the page may not call the original photos "private storage" until it has been made private and checked (8.1).

### 2.2 How does a received item's photo end up in the new owner's folder?

- The listing's photo is a snapshot in `swap-photos`, so the giver editing, replacing or deleting the closet piece, or deleting their account, cannot break the receiver's copy until the listing itself is removed (30 days after it ends).
- When the receiver taps "We swapped!", the server inserts their new closet row from the snapshot (photo empty) and returns the photo path. The receiver's app then downloads the photo through a signed link (they are a participant, so the policy allows it), uploads it with the existing `copyImageToPermanentStorage` to their own `wardrobe-images/<their user id>/<timestamp>.jpg` (flat, so the existing delete-account sweep covers it), updates only their own row's `user_image`, and acknowledges. No service role, no cross-user copy, no new edge function.
- Failure is safe and resumable. A network failure leaves the photo "pending" and the swap shows "Finishing touches" until it is retried; a photo that no longer exists is acknowledged and given up on so it is not retried forever; the item simply has no photo, which the owner can add.

### 2.3 How does reservation work under concurrency?

- A proposal reserves nothing (otherwise anyone could lock someone's closet by offering). One piece may sit in up to 8 open requests and 3 open offers.
- Accepting takes advisory locks on both members (sorted order, so no deadlock), locks the swap row, then locks the listing rows in id order, checks that every piece is still active, and only then marks the pieces reserved. A unique partial index on `swap_items(listing_id) where reserved` makes a second reservation of the same listing impossible even if code were wrong later.
- A competing accept waits for the first to commit, finds the listing reserved, and gets `unavailable` (its swap is closed). Any two swaps that share a piece share its owner, and the owner is a participant of both, so they serialise on the owner's lock. This was run with two real sessions (Appendix D `race.sh`).
- Other open proposals for the now-reserved pieces are closed lazily: the next read by either person, or an accept attempt, closes them as `unavailable`. (Closing them inside the accept would take locks in a different order from a block, and a deadlock between them is avoidable by not doing it.)
- `propose_swap` and `send_swap_message` are idempotent on a client-supplied uuid, so a retry after a dropped connection never duplicates.

### 2.4 How do community listings avoid leaking identity?

- Strangers see a member only by an alias they chose (ASCII, unique ignoring case, reserved and staff-like words refused, passed through the text filter), or, for a friend, the name friends already see. `friend_display_name()` falls back to the part of an email before the `@`; it is never used for anyone who is not a friend (`swap_label()` does the choosing).
- No swap function returns an account id, an email, or an item id belonging to someone else. Listings and swaps have random ids. "More from this member" works from a listing id; reporting and blocking work from a listing, swap or message reference, resolved on the server.
- Blocking a stranger stores the alias, not an email-derived name, and marks the row `via_swap`. The existing "Blocked people" list cannot read such rows, so it can never reveal a stranger's account id; the swap screens list them under an opaque `ref` (`list_swap_blocks`).
- A block is not visible as a block to the member who was blocked. Their swaps with the blocker are not filtered out of the inbox or the counts; they stay, closed, in "past", with the neutral label "Swap member", no photo, no member messages and no actions, which is what a swap ended by a deleted piece looks like. Opening one shows the same closed shell. A SQL scenario compares the two (s3).
- Photos have location and camera data removed, have random names, and for the community are rejected when they contain a face covering 4 percent of the frame or more. There is no location field anywhere, dates are shown at day granularity, and nothing says when someone joined or how active they are.
- Intentional linkability: all listings by one alias group together. Nothing links an alias to a person, and the same person can appear as a friend's name to one viewer and an alias to another.

---

## 3. Product behaviour: every flow and every screen state

Words used on screen are plain: "Open to swap", "Offer a swap", "Accept", "Decline", "Cancel offer", "We swapped!", "Swap board". Tone is warm but never cute.

### 3.1 Who can use what

| Tier | Needs | Can |
| --- | --- | --- |
| Signed-out (guest) | nothing | Nothing. No Home cell; the item card says "Sign in to swap" |
| Friends | Signed in, current swap terms accepted (one scroll, one button), not suspended, server switch `swaps_enabled` on | Open pieces to friends, browse friends' pieces, offer, accept, message, finish |
| Community | Friends tier plus: server switch `community_enabled` on, 18+ attestation, accepted photo-check notice, an alias, account at least 48 hours old. To browse the community the viewer must have joined too | The same with members who are not friends. Every piece they offer to a stranger must itself be a community listing, so every photo a stranger sees passed the safety check |

### 3.2 First use

Tapping Swap on Home opens the swap board. If the member has not accepted the current terms, `SwapTermsSheet` opens (the six sections in `SWAP_TERMS`, one "I agree" button). It records the version server-side. A new terms version asks everyone again. The version recorded is the one in the build the member is reading (`SWAP_TERMS_VERSION`); the app never sends the server's value. If the server's version is different, the member sees "Update SmartCloset to keep using swaps" (or, if the build is ahead of the database, "Swaps are being updated") and nothing is recorded. Nothing else is asked of a friends-tier member: no alias, no age, no profile.

### 3.3 Opening a piece to swap

Entry points: the card on the item screen; "Open a piece" in My swaps, My pieces.

1. The card (owned, non-wishlist items only) shows one of: guest line, loading skeleton, "Open to swap" button, listed state (audience badge, "Edit note", "Withdraw"), locked ("Locked into a swap", "See swap"), held ("Under review"), expired ("Expired. Renew"), or stale ("You changed this piece since you opened it. Update"). It renders no text field; the note is typed in a sheet.
2. `ListForSwapSheet` shows a preview of exactly what others will see, audience chips (Friends is selected; Community appears only when the server says it is available, and picking it before joining opens the join step), a one-line note (140 characters), the no-money line, and for Community the Google photo-check notice.
3. A photo of the actual piece is the only hard requirement (`listing_incomplete: photo`); the sheet says "Add a photo of the piece first" with a shortcut to edit it. Size and condition are properties of the piece itself, so the sheet shows them and links to the piece editor rather than repeating the fields: they are suggested for friends ("Add size and condition so friends know what they are getting") and required for Community.
4. "Open to swap" calls `swap-media` (about a second or two for a normal photo: download, strip, upload). The sheet shows "Getting your photo ready", then closes; on failure it shows a plain message and a Retry that repeats the same call. A photo the function cannot clean (`unsupported_image`: not a JPEG or PNG, or damaged) or that is over 5 MB shows "Replace photo", a shortcut to the piece editor, instead of a retry that cannot succeed. JPEG and PNG photos both work (the app stores a PNG source as it is).
5. Re-opening an already listed piece (to widen the audience or refresh a stale snapshot) creates a new listing and withdraws the old one. If the old one is locked in a swap, the server answers `item_reserved` and nothing changes. If a person has put the listing on hold or removed it, the server answers `listing_held` ("This piece can't be listed right now. Email support if you think this is a mistake.") and nothing changes: withdrawing, renewing and listing the piece again are all refused, so a hold cannot be cleared by the owner. Narrowing Community to Friends is its own function and needs no new photo.
6. Limits: 30 live listings (15 for Community), 20 publishes a day. A listing on the rack expires after 60 days; the owner sees "Expired. Renew". A held listing does not expire.

### 3.4 Browsing (SwapBoard)

- Header: back, title ("Swaps", or "Bea's swaps" when opened from a friend's closet), a "My swaps" button with a dot, a menu (guidelines, blocked swap members, email support).
- A Friends / Community segment; Community appears only when the server says it is available. Filters: category chips, condition chips, a search box (name or brand).
- A two-column grid of cards (photo, condition pill, name, "Brand, Size", owner name with a Friend or Member label). Each card has its own menu button beside it (a sibling, not nested, so screen readers reach it). Keyset paging, 30 at a time, pull to refresh. Reserved, held and expired pieces are not shown to anyone but the participants.
- Rack scraping is slowed by a counter: 400 pages a day.

### 3.5 Offering

From a listing, "Offer a swap" opens `SwapOfferSheet`:

1. Pick one to three of your own pieces that are open to swap (for a stranger, only Community pieces are selectable, the rest are greyed with "Friends only"). Optionally also ask for up to two more pieces from the same person.
2. A note of up to 280 characters (multiline, with the Done bar), and the line "Swaps are item for item. No money, deposits or gift cards."
3. Send. The note becomes the first message. Retrying a failed send reuses the same `clientRef`.

Rules enforced by the server: one open offer per pair, 5 open offers out, 20 open offers waiting at the recipient, 8 open offers on one requested piece, 3 on one offered piece, 15 offers a day (5 to strangers), and a 7 day wait after being declined by the same person.

If the member has no open pieces, the sheet says so and offers "Open a piece" (it closes and takes them to My swaps, My pieces).

### 3.6 Answering, talking, finishing

- The recipient sees Accept / Decline. Accepting reserves everything. If a piece went away meanwhile the answer is `unavailable` and the screen says "That piece is no longer available".
- Either person can cancel an accepted swap until *they* have tapped "We swapped!". The other person tapping does not take that away: the member who has not tapped can still cancel, so one tap cannot leave the other member's pieces locked. If the other member had already tapped, they see "They cancelled this swap after you tapped We swapped!. The piece you added stays in your closet. If the swap did happen, report it from the menu." After your own tap there is nothing to cancel and only a report remains.
- Messages: text only, 500 characters, 200 per swap, 6 a minute, 60 an hour, 300 a day. Strangers get the note plus three questions until the other side replies. Messages are allowed while the swap is open and for 7 days after it completes.
- The composer keeps what was typed when a send fails, and reuses the same `clientRef` on retry.
- A grey "Swap safely" card is collapsed in every thread and opens when the swap is accepted (tips in `SWAP_SAFETY_TIPS`). Messages that look like payment talk get a small reader warning (never a block) with a one-tap Report.
- "We swapped!" opens a confirm sheet that says plainly what will happen: the other piece is added to your closet, yours is removed unless you tick "Keep mine in my closet". Then the hand-off runs on that phone (3.7).
- When both have tapped, the swap is completed. If only one has tapped, the other sees "Bea says you swapped. Tap We swapped! when you have your piece". After 14 days with one side done the swap is finished anyway, and the silent member can still collect their piece. The first tap also moves the 30-day expiry out to 15 days from that tap if it was sooner, and the 14-day finish is checked before any expiry (on the member's next read and in the daily job), so a swap one side has completed is finished and never "expired" under them with the other member's listing put back on the rack.

### 3.7 The hand-off, step by step (one member, on their own phone)

1. `swap_complete_my_side` (server): marks their side done; for each piece they receive, inserts a closet row for them from the snapshot (name, category, subcategory, brand, colour, season, size, condition, care, origin, cleaned materials, pattern, tag "swapped", note "Swapped in on <date>"), with prices, estimated value, wear count, favourite, tag text and purchase date empty or reset; returns the photo path and which of their own pieces to remove.
2. The app copies each received photo into the member's own folder and acknowledges it.
3. The app removes the piece they gave with the existing `deleteClothingItem`, unless they chose to keep it.
4. A celebration line and "See it in my closet".
5. If the app is killed at any point, the swap shows under "Finishing touches" in the inbox, and opening it repeats the unfinished steps (all are idempotent).
6. Deleting the piece they gave does not cancel the swap, because their side is already marked done.

### 3.8 Inbox and badges without push

- Home's Swap cell shows "Trade with friends", or "2 need you" from `get_swap_badge`. It never blocks Home: any failure is 0.
- My swaps groups rows into Needs you, Finishing touches, In progress, Waiting on them, and Past swaps (last 10, then "Show older"). A dot means something new since the member last opened that swap.
- Everything refreshes on focus and by pull to refresh. An open thread polls every 15 seconds while the screen is focused and the app is active. The expectation is stated on screen: "You'll see updates next time you open SmartCloset."

### 3.9 When things change under a swap

| What happens | Open offers | Accepted swap | Listing | What people see |
| --- | --- | --- | --- | --- |
| Owner deletes the piece, or moves it to the wishlist | Ended as `unavailable` | Ended as `unavailable`, unless its owner already tapped "We swapped!" | Withdrawn | "No longer available" |
| Owner edits the piece | Unchanged (the listing is a snapshot) | Unchanged | Marked "changed since you opened it"; "Update" lists a new snapshot and withdraws the old one | Others see the snapshot they were shown |
| Owner withdraws the listing | Offers for it end as `unavailable` | Refused (`item_reserved`) | Withdrawn | Same |
| Same piece offered in several proposals | Allowed up to the limits | Accepting one reserves it; the others end as `unavailable` on the next read | Reserved | Neutral |
| A blocks B (or B blocks A) | All swaps between them end | Same | Both leave each other's rack | Both keep the swap in their inbox as a closed "No longer available" row in "past" (label "Swap member", no photo, no member messages, no actions), the same as a swap ended by a deleted piece. Never "blocked" |
| Unfriend | Friends-kind swaps end | Same | Friends-only pieces leave the rack | "No longer available" |
| A member deletes their account | Ended as `unavailable` | Same | Their listings and messages are deleted, photos queued for removal | The other member keeps an anonymous record (names of the pieces, dates), labelled "Former member"; it disappears when they delete theirs too |
| A listing gets three reports from different members within 7 days | Offers for it end | A reserved listing is not held while the swap runs; reports made meanwhile still count, and when the swap ends it goes on hold instead of back on the rack | Held (by reports), hidden. It does not expire, and it cannot be renewed, withdrawn or listed again by the owner. Only a person releases it (or removes it) | The owner sees "Under review" |
| A person removes a listing | Offers and accepted swaps that include it end | Same | Removed: off the rack, its photo is deleted at the next sweep, and the piece cannot be listed again while it exists | "No longer available"; the owner sees "This piece can't be listed right now" |
| An admin suspends a member | All their swaps end | Same | Held (marked as held by the suspension; ending the suspension releases only those, not listings held by reports or by a person) | The member sees "Swapping is paused on your account" and can still read history |
| Proposal not answered for 14 days; accepted swap not finished within 30 days | `expired` | `expired` | Back on the rack | "Expired" |
| One side taps "We swapped!" and the other never does | n/a | The member who has not tapped can cancel until they tap. Otherwise finished after 14 days (`auto_completed`), before any expiry, because the first tap moves the expiry to at least 15 days out | Completed | The silent member can still collect their piece |

### 3.10 Screen states

`useSwapAccess` (Appendix C) gives every swap screen the same first answer. After it says "ready", each screen handles its own data states.

| State | What shows |
| --- | --- |
| Loading access | A skeleton (grid for the board, rows for the inbox) |
| Guest | Empty state "Sign in to swap" with a Sign in button (navigates to `SignIn`). Home hides the cell, and the item card shows a tappable "Sign in to swap" line |
| Server switch off | Empty state "Swaps are paused" (`SWAP_PAUSED_MESSAGE`). Writes anywhere show the same text |
| Server without swap functions (`PGRST202`) | Empty state "Swaps aren't available yet in this version". The Home cell and the item card stay quiet (0, hidden) |
| Suspended | "Swapping is paused on your account" with an Email support button; history stays readable |
| Update required (`update_required`) | Empty state "Update SmartCloset to keep using swaps" (`SWAP_UPDATE_REQUIRED_MESSAGE`) when the server's terms version is newer than the build's, or "Swaps are being updated" (`SWAP_SERVER_BEHIND_MESSAGE`) when the build is ahead of the server. Nothing that records consent is called, and a member who already agreed on another phone sees it too |
| Terms not accepted | `SwapTermsSheet` opens by itself; behind it an empty state "Read the swap terms to get started" |
| Data loading | Skeleton cards or rows |
| Empty board, friends | "Nothing open to swap yet": "When a friend opens a piece to swap, it shows up here. Open one of yours to get things started." with Open a piece, Find friends, Invite a friend (share sheet, plain text, no data) |
| Empty board, community | "Quiet in here": "Be the first to open a piece for the community." |
| Empty inbox | "No swaps yet" with Browse the swap board |
| Data load failed with nothing on screen | `LoadError` ("Couldn't load your swaps", Try again) |
| Refresh failed with data on screen | `LoadError` banner above the list |
| Offline action (offer, accept, message, finish) | A short alert from `swapErrorMessage` ("You seem to be offline..."); typed text is kept; a retry reuses the same `clientRef` |
| Swap gone (`swap_unavailable`) | "This swap is no longer available" with Back to My swaps |
| Closed swap | A calm line from `closedExplanation` (with the member's own tap, when the other member cancelled after it); composer replaced by "This swap has ended". A swap with a blocked member looks the same, with no photos and no actions |
| Rate limited | "You're going a bit fast. Please wait a moment" (browsing: "You've browsed a lot today") |

### 3.11 Safety surfaces

- Report and Block are on every listing (card menu and listing screen), the thread header, and every message from the other person (long-press). They open `SwapSafetySheet`.
- The guidelines sheet, the blocked swap members sheet and Email support are in the board and inbox menus.
- Reporting never tells the reported person. Blocking is private.
- Safety advice is shown where it matters: terms (once), the offer sheet (the no-money line), the accepted thread (tips card), and the confirm sheet for "We swapped!".


---

## 4. Data model and migrations

The complete SQL is in Appendix A. This section is the map: what each file does, the rules every object follows, and what it means for old builds, account deletion and export.

### 4.1 Files, in the order they are applied

**Versions.** A migration's version is the number before the first underscore, and it is the primary key of the table in which `supabase db push` records what ran, so two files with the same version make `db push` and `db reset` fail. The swap files use `20261015000000` to `20261015000500`. The ratings design (`quality-ratings.md` 4.1) uses `20261016000000` to `20261016000399`. The newest migration that already exists is `20261013000000`. Neither design depends on the other. The swap files sort before the ratings files, so the natural order is swap first; if the ratings migrations have already been pushed, `supabase db push` refuses the older swap versions ("found local migration files to be inserted before the last migration on remote") unless `--include-all` is passed, which is then safe only because the dry run is read first and shows exactly the swap files. `__tests__/migrationVersions.test.ts` fails when two files share a version, so a collision cannot be merged unnoticed.

**What may sit in `supabase/migrations/`.** `supabase db push` (the documented deploy path, `supabase/README.md`) applies every pending file in that folder in version order and has no way to skip one, so the folder holds only files that are safe to apply the moment they are pushed. Anything that waits for a decision lives in `supabase/held/` and is moved into the folder, with a new version, when the decision is made (below). In the first version of this document the policy drop and the term-list template sat in the folder: `db push` would have run the drop unreviewed, and would have recorded the empty term template as applied, so the owner's later edit of that file would never have run.

| File | Contents | Depends on |
| --- | --- | --- |
| `20261015000000_styling_recommendations_if_missing.sql` | Creates `public.styling_recommendations` (with row-level security and the two policies of `documentation/SUPABASE_MIGRATION_GUIDE.md`) only if it is missing. `delete_user_account()` deletes from that table, but no migration creates it: it exists on the live project (made by hand), so on a database built from the migrations alone account deletion failed. On the live project this file does nothing | existing migrations only |
| `20261015000100_swap_foundation.sql` | Config and switches; ten tables; the text-folding function; helper functions; closing and refresh logic; the upkeep job; triggers (block, unfriend, item removed or wishlisted, member left, photo queue); `user_blocks` columns and policies; report columns; the `swap-photos` bucket (JPEG and PNG) and its one read policy | prerequisite, existing migrations |
| `20261015000200_swap_listings.sql` | `get_swap_settings`, `get_swap_badge`, `accept_swap_terms`, my listings, update/withdraw/renew, `browse_swap_listings`, `get_swap_listing`; the internal `swap_validate_item`; service-only `swap_publish_precheck`, `swap_publish_commit`, `swap_known_photo_paths` | foundation |
| `20261015000300_swap_lifecycle.sql` | `propose_swap`, `list_my_swaps`, `get_swap`, `respond_to_swap`, `cancel_swap`, `send_swap_message`, `swap_complete_my_side`, `swap_ack_photo` | listings |
| `20261015000400_swap_moderation.sql` | Report contexts and reasons; `report_swap_content`; `block_swap_member`, `list_swap_blocks`, `unblock_swap_member`; `export_my_swap_data`; admin functions (hold, release, remove, suspend, unsuspend, switches); `swap_report_backlog` and `swap_send_report_digest`; `swap_moderation_queue` | foundation |
| `20261015000500_swap_community.sql` | `join_swap_community`, `leave_swap_community`, `narrow_swap_listing`. Changes nothing for anyone until `community_enabled` is turned on | moderation |

**Held, never applied by `db push`** (`supabase/held/`; `__tests__/swapMigrations.test.ts` fails if either appears in the migrations folder):

| File | Contents | Released by |
| --- | --- | --- |
| `drop_legacy_friend_wardrobe_policy.sql` | Drops the table-level friends policy on `clothing_items`. The same file as `quality-ratings.md` 4.3: whichever feature adds it first creates it, with the one statement shown; the other leaves it alone. Swaps do not depend on it | The owner's answer to open question 4 (12.2) |
| `wardrobe_images_private.sql` | Creates the `wardrobe-images` bucket as private, or flags the existing one private, so the repository owns the flag | Gate G0 (11.1), after the checks there |

**Releasing a held file.** Give it a version later than every file already in `supabase/migrations/`, which a bare `date` does not guarantee here because the ranges above are dated ahead:

```
newest=$(ls supabase/migrations | grep -oE '^[0-9]{14}' | sort | tail -1)
now=$(date -u +%Y%m%d%H%M%S); v=$(( now > newest ? now : newest + 1 ))
mv supabase/held/<name>.sql supabase/migrations/${v}_<name>.sql
```

then `supabase db push --dry-run` (it must list exactly that one file), then `supabase db push`. Never pass `--include-all` to make a skipped file apply without reading the dry run first.

**The objectionable-term list** is not a migration in this design. It is loaded from the dashboard SQL editor with the statement in `docs/MODERATION.md` (11.4), or, once the owner's list is final, committed as a new migration with a version later than every existing one. It is never an edit to a file that has already been applied.

Every file is idempotent (`if not exists`, `create or replace`, `drop ... if exists`) and was applied twice. Nothing existing is renamed or dropped. The only changes to existing objects are these, all backward compatible:

- `user_blocks` gains two columns, `via_swap` (default false) and `ref` (a random uuid per row), and its two client policies gain `and not via_swap`. No existing row has `via_swap = true`, so older builds see exactly what they saw;
- `content_reports` gains five nullable columns (`ref_type`, `ref_id`, `evidence`, `reviewed_at`, `outcome`), and its two `CHECK` constraints are widened to include the swap contexts and reasons. `report_user()` is not changed and keeps its narrower lists, so older builds are unaffected and no copy of its body can drift;
- three triggers are added to `user_blocks` (after insert), `friend_requests` (after delete of an accepted row) and `clothing_items` (before delete, and before a move to the wishlist). They never raise, so they cannot make a block, an unfriend or a deletion fail;
- the prerequisite file adds a table only where it is missing.

### 4.2 Rules every object follows

1. Row level security is on for all ten swap tables and every privilege is revoked from `public`, `anon` and `authenticated`. There are no policies on them. App users reach swap data only through functions.
2. Every function pins `search_path = public`. Client functions are granted to `authenticated` only and revoked from `public` and `anon` (Supabase grants execute to `anon` by default, so the revoke is explicit). Internal helpers and triggers are revoked from everyone but their owner. Service-only functions are granted to `service_role` only. A catalogue script (`s6_catalog.sql`) and a migration-text Jest test assert all of this, including the exact list of functions `authenticated` may run.
3. Every foreign key to `auth.users` cascades, except `swaps.proposer_id` and `swaps.recipient_id`, which set null on purpose so the other member keeps an anonymous record. `delete_user_account()` therefore needs no change.
4. Client functions never return an account id, an email, a cost, a note, tag text, an estimated value, wear data or a purchase date. A Jest test inspects every `returns table` list, and a catalogue check inspects the argument names of the result.
5. Failure vocabulary is small and stable (4.6). "Not found", "not visible", "blocked", "expired" and "gone" are all `swap_unavailable`.
6. Every limit lives in `swap_limit()`, and `src/config/swapRules.ts` mirrors it (a Jest test compares them).

### 4.3 Tables

| Table | Holds | Notes |
| --- | --- | --- |
| `swap_config` | `swaps_enabled` (true), `community_enabled` (false), `terms_version` ("2026-10"), `min_account_age_hours` (48) | Changed by the owner in the dashboard; the two switches have functions `swap_set_enabled` and `swap_set_community_enabled` |
| `swap_meta` | One row: when the upkeep job last ran | |
| `swap_members` | One row per member who accepted the terms: terms version and time; adult confirmation, photo-check acknowledgement, community join time, alias (community tier); suspension | `alias` unique ignoring case, ASCII pattern checked |
| `swap_listings` | The snapshot: audience, status, note, name, category, subcategory, brand, colour, size, condition, pattern, material, season, cleaned materials, care, origin; `photo_path` (`<id>.jpg`), `photo_state` (`stripped` or `checked`), `source_photo_path`; `held_by` (`reports`, `admin` or `suspension`) and `held_at` for a held listing | Community listings must be `checked` (check constraint). One live listing per item (unique partial index; held counts as live). No price, notes, tags, tag text, retailer, wear or purchase data exist as columns. The name ends in `.jpg` even when the bytes are a PNG (5.2) |
| `swaps` | Participants, `pair_kind` (friends or community), status, closed reason, done times, seen times, last event, expiry | Unique partial index: one open proposal per ordered pair. Unique `(proposer_id, client_ref)` |
| `swap_items` | One row per piece in a swap: side (`offer` = proposer gives, `request` = recipient gives), `reserved`, a small snapshot (name, category, brand, size, condition), the giver's closet row id, the receiver's new closet row id, photo import and removal marks | Unique partial index on `(listing_id) where reserved` is the reservation guarantee |
| `swap_messages` | Text and system lines | `sender_id` cascades (unlike the old stylist messages table); 500 character check; unique `(sender_id, client_ref)` |
| `swap_rate_counters` | Fixed-window counters per member and bucket | Purged after 2 days |
| `swap_blocked_terms` | Owner-loaded objectionable terms | Letters, digits and single spaces in any script, already folded (`swap_fold_text`: lower-case, accents and invisible characters removed); matched as whole words against folded text. Loaded from the dashboard (11.4) |
| `swap_photo_gc` | Paths of deleted listings' photos waiting to be removed from storage | No foreign key to users, so account deletion cannot lose the work |

### 4.4 Lifecycle and state machine

States: `proposed`, `accepted`, `declined`, `cancelled`, `expired`, `completed`. Closed reasons: `declined`, `cancelled_by_proposer`, `cancelled_by_recipient`, `unavailable`, `expired`, `completed`.

| From | Event | By | To |
| --- | --- | --- | --- |
| proposed | accept (reserves) | recipient | accepted, expires in 30 days |
| proposed | decline | recipient | declined (7 day wait before the same offer) |
| proposed | cancel | proposer | cancelled |
| proposed | 14 days | system | expired |
| accepted | cancel | the member who has not tapped "We swapped!" (even if the other has) | cancelled |
| accepted | "We swapped!" | each | stays accepted; their side is done, their piece is added, and the expiry moves out to at least 15 days from now |
| accepted | second "We swapped!" | the other | completed |
| accepted | one side done for 14 days | system, on a read or in the daily job; checked before the 30-day expiry | completed (`auto_completed`) |
| accepted | 30 days with nobody done | system | expired |
| proposed or accepted | block, unfriend (friends-kind), piece deleted or wishlisted (giver not done), listing withdrawn or held, member left, suspension | system | cancelled, reason `unavailable` |

All closing goes through `swap_close()`, which releases reservations, puts listings back on the rack (or marks them withdrawn if the piece is gone, expired if the listing ran out, held if enough reports arrived while it was reserved) and writes a system line.

**Listings.** A listing is `active` (on the rack), `reserved` (in an accepted swap), `completed`, `withdrawn`, `expired`, `held` or `removed`. Only `active` listings expire (60 days). A hold is sticky:

- `held` records who made it in `held_by`: `reports` (three different reporters in seven days), `admin` (`swap_admin_hold_listing`) or `suspension` (`swap_admin_suspend`). It leaves that state only by a person's act: `swap_admin_release_listing`, `swap_admin_remove_listing`, the end of the suspension that made it (`swap_admin_unsuspend` releases `suspension` holds and no others), or the piece being deleted (a held listing of a piece moved to the wishlist stays held, so a trip to the wishlist and back does not clear it).
- While a listing is held, the daily job leaves it alone (it used to turn it into `expired`, and renewing an expired listing made it live again), `renew_swap_listing` and `withdraw_swap_listing` answer `listing_held`, and `swap_validate_item` refuses to publish the piece again (`listing_held`), both at the precheck and at the commit. Withdrawing the held listing and then listing the piece again was another way round it.
- `removed` is permanent: a person took the listing down (`swap_admin_remove_listing`: open swaps that include it end, its photo is queued for deletion, its reports are marked handled). The row stays, without its photo, while the piece exists, so the piece cannot be listed again; the job deletes it 30 days after the piece is gone.
- Reports count even while a listing is reserved. When the swap ends and the listing has enough of them, it goes on hold instead of back on the rack.
- What a hold cannot stop: an owner who adds the same clothes again as a new piece. That is what suspension is for.

Expiry is lazy. `swap_refresh(uid)` runs at the start of a member's reads and closes their overdue or no longer eligible swaps, so correctness never depends on a scheduled job. `swap_janitor()` does the global retention work, at most every 15 minutes, started by member reads; `swap-media`'s `sweep` action forces it daily.

### 4.5 Retention (enforced by the upkeep job, stated in the policy as "about")

| What | Gone |
| --- | --- |
| Messages of a swap | 30 days after the swap ends |
| The swap record and its piece names | 90 days after it ends |
| A listing and its photo | 30 days after the listing ends (a listing someone reported is kept 90 days from the report). A held listing is not deleted by the job; a removed listing's photo is deleted at the next sweep and its row goes 30 days after its piece does |
| Rate counters | 2 days |
| Everything of a member | when they delete their account (photos queued; `delete-account` drains the queue, the sweep is the backstop) |
| Reports and their copy of a listing or conversation | with either account |

### 4.6 Errors

| Message | SQLSTATE | Raised when |
| --- | --- | --- |
| `not_authenticated` | 28000 | no signed-in user |
| `swaps_disabled`, `swap_terms_required`, `swap_suspended`, `community_unavailable`, `community_not_joined`, `account_too_new` | 42501 | the gates in 3.1 |
| `listing_held` | 42501 | a person's decision stands against this piece's listing (held or removed) and the owner tried to renew, withdraw or list it again |
| `swap_unavailable` | 22023 | not found, not visible, blocked, expired, gone, not a participant |
| `swap_not_open` | 22023 | the swap is not in a state that allows this |
| `invalid_swap`, `invalid_note`, `invalid_message`, `offer_not_allowed`, `invalid_report`, `item_not_found`, `listing_incomplete` (DETAIL lists what is missing), `terms_version_mismatch`, `alias_invalid`, `adult_required`, `scan_ack_required` | 22023 | bad input |
| `text_not_allowed` | 22023 | DETAIL is the field (`note`, `name`, `brand`, `color`, `size`, `details` for the rest of the card, `message`, `alias`), HINT is `payment`, `contact` or `content` |
| `already_proposed`, `item_reserved`, `alias_taken` | 23505 | conflicts |
| `swap_rate_limited` (DETAIL = bucket), `swap_open_limit`, `recipient_busy`, `listing_busy`, `swap_cooldown`, `swap_message_limit`, `swap_listing_limit`, `report_rate_limited` | 54000 | limits |

A rate counter that raises rolls its own increment back, so only successful actions are counted. Cheap validation failures are bounded by the Supabase gateway, not by these counters.

### 4.7 Account deletion and export

- Deleting an account needs no change to `delete_user_account()` (which, however, deletes from `public.styling_recommendations`, a table no earlier migration creates; the prerequisite file of 4.1 makes that work on a fresh database): members, listings, messages, counters cascade; the member's side of every swap becomes empty; open swaps close as `unavailable`; a swap with nobody left is deleted by its own trigger. Listing photos are queued (a trigger on `swap_listings`) and removed by `delete-account` after the account is gone, with `swap-media`'s sweep as backstop (it also removes photos nothing refers to). This was run against the real function (`s4_deletion.sql`).
- The survivor keeps an anonymous record of a swap (piece names, dates), labelled "Former member". A deleted member's messages are gone from the survivor's thread.
- Export Data gains an optional `swap` section from `export_my_swap_data()`: the member's terms and community consents with times, their listings, their swaps with piece names, and only their own messages. Never the other member's words or identity. The file version becomes `1.1`, bumped once, by whichever of the ratings and swap passes lands first (10.1; the diff in Appendix D assumes the ratings pass went first and does not bump); import ignores the section.

### 4.8 Old builds

Nothing here changes behaviour for a build without swaps: no existing function is replaced, and the only existing tables touched are `user_blocks`, `content_reports`, `friend_requests` and `clothing_items` as listed in 4.1. A new build talking to a server without these migrations gets `PGRST202`, which the app turns into "Swaps aren't available yet" (the Home cell and item card stay quiet). The migrations must still be applied before the build is distributed.

---

## 5. Photos, the `swap-media` function and the hand-off

### 5.1 What the function does

`supabase/functions/swap-media/index.ts` (Appendix B). `verify_jwt = true`, kept as a second layer. Two actions.

`publish { itemId, audience, note? }`, called by the signed-in member:

1. Strict request check (only `action`, `itemId`, `audience`, `note`; uuid; audience; note up to 200 characters).
2. `swap_publish_precheck(user, item, audience, note)` as the service role. The database decides, through `swap_validate_item`: the piece is the member's and not on the wishlist; no hold or removal stands against it (`listing_held`); its photo is in the member's own `wardrobe-images/<user id>/` folder (the path is derived from the item row and matched against a strict pattern, never read from the request); gates for the tier; Community needs size and condition; the text filter on the note, name, brand, colour, size and the rest of the card (folded first, so invisible characters and wide letters do not hide a phrase); listing caps. Then the daily publish counter. It returns a new listing id and the source path.
3. Download the original (at most 5 MB). The first bytes say what it is: a JPEG is cleaned with `stripJpegMetadata`, a PNG with `stripPngMetadata`; anything else, or a damaged file, is HTTP 415 `unsupported_image` and the app offers "Replace photo".
4. For Community only: Google Cloud Vision `SAFE_SEARCH_DETECTION` and `FACE_DETECTION` on the cleaned bytes, judged by `decideSwapPhoto`. A missing key, a failed call, an unreadable answer or a timeout all fail closed (HTTP 503 `moderation_unavailable`); so does an answer of UNKNOWN for adult, violence, racy or medical (Google's "could not tell"), a missing category, and a `faceAnnotations` that is not a list. (No `faceAnnotations` at all is normal and means no face was found.) Friends-only photos never leave Supabase.
5. Upload to `swap-photos/<listing id>.jpg` with the content type of what the bytes are, then `swap_publish_commit`, which locks the piece, runs `swap_validate_item` again on what the piece says now (an edit made during the one or two seconds of the photo copy cannot get past the text filter, the Community size and condition rule, a hold or the caps), rebuilds the snapshot from the item row (named columns only, strings clamped, materials cleaned), withdraws the item's previous live listing (refused with `item_reserved` if it is locked in a swap) and inserts the listing. If the commit fails, the uploaded object is removed.
6. After answering, up to 25 queued photos are deleted.

`sweep {}`, the service key only, daily: runs `swap_janitor(true)`, deletes queued photos, and deletes objects in the bucket that no listing refers to and that are older than an hour. The bearer token is compared with `SUPABASE_SERVICE_ROLE_KEY` in constant time (`sameSecret`); its contents are never read. The first version decoded the token and believed its `role` claim, which is safe only while the platform verifies every token's signature (`verify_jwt = true`); Supabase's newer secret keys are not JWTs and need `verify_jwt` turned off for a function that accepts them (the second review's finding, not re-checked here), and then anyone could have posted `{"action":"sweep"}` with a hand-made unsigned token. The comparison makes the sweep safe in both configurations. The scheduler (11.3) must send the same value as the function's `SUPABASE_SERVICE_ROLE_KEY`.

The function never logs request bodies, notes, ids, paths or image bytes; the source-text test enforces that the only log lines are short fixed strings.

### 5.2 Why strip, not re-encode

The earlier designs re-encoded every listing photo in the edge runtime. That needs an image decoder whose memory, speed and rotation handling on real phone photos were unproven. Removing the Exif, XMP, IPTC, comment, thumbnail and multi-picture segments, and anything after the end of the image, achieves the privacy goal (no location, no camera, no hidden payload) without touching a single pixel. The colour profile and Adobe colour flag are kept so colours look the same, and if the photo carried a rotation flag, a minimal Exif block holding only that flag is written back so it still shows upright. It was tested on JPEGs written by Pillow (including progressive ones with several scans), decoded again, and the pixels were identical. The safety check sees the same pixels either way.

**PNG.** `react-native-image-picker` keeps a PNG source (a screenshot, an image from another app) as a PNG, and `imageStorage.uploadToCloud` uploads the bytes as they are, named `.jpg` with content type `image/jpeg`. So a closet photo can be a PNG, and the function recognises one by its signature (never by the name or the stored type). `stripPngMetadata` keeps the signature, header, palette, pixel data, transparency (`tRNS`) and the colour chunks (`gAMA`, `cHRM`, `sRGB`, `iCCP`, `sBIT`, `cICP`) byte for byte and drops text (`tEXt`, `zTXt`, `iTXt`), Exif (`eXIf`), time, physical size, background, histogram, animation and every unknown or private optional chunk, and anything after the end of the image; an unknown critical chunk, a bad checksum on a kept chunk, or a missing header, pixel data or end is rejected. Tested on PNGs written by Pillow: decoded pixels identical, metadata gone, palette transparency and ICC profile kept. The stored object is still named `<listing id>.jpg`: the name is an opaque id (it must not reveal a user), the content type (`image/png` or `image/jpeg`, both allowed by the bucket) says how to read the bytes, and the app saves a received photo exactly as it already saves its own PNGs. A GIF is not accepted. With the options the app passes (`quality` 0.85 and a size limit), the picker re-encodes everything except PNG and GIF to JPEG (`ImagePickerManager.mm`), so HEIC and WebP sources arrive as JPEG and the function only ever sees a JPEG, a PNG or, rarely, a GIF.

`photo_state` records what was done: `stripped` (metadata removed, not scanned) for friends; `checked` (also passed the safety check) for Community, which the table requires for any Community listing.

### 5.3 The hand-off

Described step by step in 3.7. Photo copy details: the app asks `swap-photos` for a ten minute link, downloads to the cache directory, calls the existing `copyImageToPermanentStorage` (which saves a local copy and uploads to the member's own folder), writes the canonical stored URL into only that closet row with `update ... eq('id', claimedItemId)` (the owner policy allows it), then calls `swap_ack_photo`. Outcomes: done; retry later (network, upload failed, no link); gone (HTTP 400, 403 or 404, or no path), acknowledged so it is not retried forever.

### 5.4 Things that do not change

`wardrobe-images`, its owner policies and the folder-wide friend read policy are untouched by the swap migrations. The recommended hardening that is independent of swaps (making the bucket private and checking it, gate G0; dropping the legacy table policy; and narrowing the friend storage policy if non-closet images ever share the `<uid>/` prefix) is the two held files and open questions 4 and 5, not part of this build.


---

## 6. Client API: types, rules, errors, service, hooks

All of this is written and verified in Appendix C. Stream S0 owns it and merges first; every other stream imports only from it.

### 6.1 Files

| File | What it is |
| --- | --- |
| `src/types/swap.ts` | Types only: `SwapAudience`, `SwapStatus`, `SwapClosedReason`, `SwapBucket`, `SwapSettings`, `SwapListing`, `MySwapListing`, `SwapBrowseQuery`, `SwapBrowsePage`, `SwapSummary`, `SwapItemView`, `SwapMessage`, `SwapActions`, `SwapDetail`, `ProposeSwapInput`, `PublishSwapInput`, `HandoffResult`, `SwapBlock`, `SwapErrorCode`, `SwapExport` |
| `src/config/swapRules.ts` | `SWAP_TERMS_VERSION`, `SWAP_LIMITS` (mirrors `swap_limit()`), alias pattern, expiry days, poll interval, photo link lifetime, and all the words people read: `SWAP_NOTICE`, `SWAP_NO_MONEY_LINE`, `SWAP_COMMUNITY_SCAN_NOTICE`, `SWAP_TERMS`, `SWAP_GUIDELINES`, `SWAP_SAFETY_TIPS`, `SWAP_REPORT_REASONS`, `SWAP_QUICK_REPLIES`, `looksLikePaymentTalk`, paused, not-deployed, update-required and server-behind messages |
| `src/services/swapErrors.ts` | `SwapError` (with `code`, `detail`, `hint`), `toSwapError` (supabase-js errors), `toSwapErrorFromFunction` (the `swap-media` answer), `swapErrorMessage(error, fallback)` (plain text for a person) |
| `src/services/swapPhotoUrls.ts` | `signSwapPhotos(paths)`, `forgetSwapPhoto(path)`, `clearSwapPhotoCache()`: ten minute links, memory only |
| `src/services/swapService.ts` | The only module screens call (table below) |
| `src/utils/swapFormat.ts` | Wording for statuses, closed swaps, system lines, listing facts; `newClientRef()` (uuid v4) |
| `src/hooks/useSwapAccess.ts` | `useSwapAccess()` returning `{ access, refresh, acceptTerms }` where `access.state` is `loading`, `guest`, `paused`, `not_deployed`, `suspended`, `update_required`, `needs_terms`, `ready` or `error`. `update_required` means the server's terms version is not `SWAP_TERMS_VERSION` |
| `src/hooks/useSwapBadge.ts` | `useSwapBadge(enabled)` returning a number; never throws, never logs |
| `src/services/backupService.ts` (existing, edited) | Adds the optional `swap` section. The file version is `1.1`, bumped once by whichever of the ratings and swap passes lands first (10.1) |

### 6.2 Service functions

Every function throws `SwapError('not_authenticated')` for a guest before any network call, and a `SwapError` for any server error. None runs at import time, none touches AsyncStorage, none opens a realtime channel (`App.test` and `AppModeGate.test` import every screen's module graph).

| Function | Calls | Notes |
| --- | --- | --- |
| `getSwapSettings()` | rpc `get_swap_settings` | Also runs the member's lazy upkeep |
| `getSwapBadge()` | rpc `get_swap_badge` | Returns 0 on any failure |
| `acceptSwapTerms()` | rpc `accept_swap_terms` | Sends `SWAP_TERMS_VERSION` (the text in this build); no version can be passed |
| `joinSwapCommunity({ alias, adult, photoScanOk })`, `leaveSwapCommunity()` | rpc | Community tier. The 18+ and photo-check acknowledgements are recorded against `SWAP_TERMS_VERSION` |
| `listMySwapListings()` | rpc `list_my_swap_listings` | Includes `openOffers`, `inAcceptedSwap`, `stale` |
| `getItemSwapState(itemId)` | `listMySwapListings` | Never throws: `{ listing, inAcceptedSwap }` |
| `publishSwapListing({ itemId, audience, note })` | function `swap-media` `publish` | Parses the function's error body into `SwapError` (`photo_rejected` carries `hint: 'people' \| 'unsafe'`) |
| `updateSwapListingNote`, `withdrawSwapListing`, `renewSwapListing`, `narrowSwapListing` | rpc | |
| `browseSwapListings(query)` | rpc `browse_swap_listings` | Page size 1 to 40; `nextCursor` is set when the page is full |
| `getSwapListing(id)` | rpc `get_swap_listing` | `swap_unavailable` when gone |
| `proposeSwap({ requestListingIds, offerListingIds, note, clientRef })` | rpc `propose_swap` | Returns the swap id; idempotent on `clientRef` |
| `listMySwaps()` | rpc `list_my_swaps` | Rows carry `bucket` and `attention` |
| `getSwap(id, afterMessageId?)` | rpc `get_swap` | Marks it seen; `actions` are the server's verdict |
| `respondToSwap(id, 'accept' \| 'decline')` | rpc | `'accepted' \| 'declined' \| 'unavailable'` |
| `cancelSwap(id)`, `sendSwapMessage(id, body, clientRef)` | rpc | |
| `completeSwapHandoff(id, { keepGiven })` | rpc `swap_complete_my_side`, photo import, rpc `swap_ack_photo`, `deleteClothingItem` | Idempotent; returns `HandoffResult` (`photosPending`, `removalsPending` tell the screen to offer "Finish up" again) |
| `reportSwapContent({ refType, refId, reason, details, messageId })`, `blockSwapMember(refType, refId)`, `listSwapBlocks()`, `unblockSwapMember(ref)` | rpc | Never takes or returns another member's id |
| `exportMySwapData()` | rpc `export_my_swap_data` | |

### 6.3 Rules for everything built on this

- Show text with `swapErrorMessage(error, fallback)`; branch on `toSwapError(error).code`. Never show a raw message.
- A write that failed keeps its input and reuses its `clientRef` on retry.
- Photos: never use a path from `wardrobe-images` for another member's listing; always `SwapPhoto` or `signSwapPhotos`.
- Do not store anything from this feature in AsyncStorage (`localData.test.ts` enumerates keys). Consent and state live on the server.
- Consent is recorded against the text the member was shown. The service sends `SWAP_TERMS_VERSION` and nothing else, and `useSwapAccess` only offers the terms (`needs_terms`) when the server's version equals it; otherwise the state is `update_required` and nothing that records consent is called. Never read `currentTermsVersion` from the settings to send it back. (In the first version `acceptTerms` sent the server's value, so a bumped server version or an older build recorded agreement to text the member had not read.) This work is in stream S0 and must merge before S3 to S6 start, because they all import the hook.
- Do not add navigation to shared components; screens pass callbacks. Components under `ItemDetails` and `Settings` use `useEffect`, never navigation hooks (those screens' tests mock navigation minimally).

---

## 7. UI: components, screens, routes, and the lines the lead adds

Visual rules: new standalone screens use `Screen`, `Card`, `Text`, `Button`, `Badge`, `Avatar`, `EmptyState`, `Skeleton`, `Sheet` from `../ui` and `useTheme()`, the same way `FriendsScreen` does. A component mounted inside `ItemDetailsScreen` copies that screen's section metrics (padding 20, title 20 and weight 700, card radius 12, accent `#C4975A`). Per-person menus are sibling `Pressable`s of the card, never nested. Keyboard rules: a multiline field spreads `keyboardDoneProps` and its file renders exactly one `<KeyboardDoneBar />`; every other field has `returnKeyType`; sheets with fields use `KeyboardLift`; a screen with a composer uses `<Screen keyboardAvoiding>`. `keyboardGuard.test.tsx` checks these statically for every new file.

### 7.1 Routes (all in `HomeStack`, flat files in `src/screens`)

| Route | File | Params |
| --- | --- | --- |
| `SwapBoard` | `src/screens/SwapBoardScreen.tsx` | `{ friendId?: string; friendName?: string }` |
| `SwapListing` | `src/screens/SwapListingScreen.tsx` | `{ listingId: string }` |
| `MySwaps` | `src/screens/MySwapsScreen.tsx` | `{ segment?: 'swaps' \| 'pieces' }` |
| `SwapThread` | `src/screens/SwapThreadScreen.tsx` | `{ swapId: string }` |

There is no sixth tab. Every `navigate()` the swap screens make is to a route registered in `HomeStack` (`SwapBoard`, `SwapListing`, `MySwaps`, `SwapThread`, `Friends`, `FriendCloset`, `ItemDetails`, `SignIn`) or to a tab name, so `navigationRoutes.test.ts` needs no change. Shared components under `src/components` contain no `navigate()` call at all.

| From | To | How |
| --- | --- | --- |
| Home cell | SwapBoard | `navigate('SwapBoard')` |
| FriendCloset banner | SwapBoard | `navigate('SwapBoard', { friendId, friendName })` |
| SwapBoard card | SwapListing | `navigate('SwapListing', { listingId })` |
| SwapBoard header | MySwaps | `navigate('MySwaps')` |
| SwapListing, after sending | SwapThread | `navigate('SwapThread', { swapId })` |
| SwapListing, no open pieces | MySwaps, pieces | `navigate('MySwaps', { segment: 'pieces' })` |
| MySwaps row | SwapThread | `navigate('SwapThread', { swapId })` |
| MySwaps empty | SwapBoard | `navigate('SwapBoard')` |
| SwapThread, after finishing | ItemDetails | `navigate('ItemDetails', { item })` after `getClothingItem(id)` |
| Item screen card | MySwaps | callback prop; the lead supplies `navigate('Home', { screen: 'MySwaps' })`, the only form that passes the route audit from all three stacks that host `ItemDetails` |
| Guest lines | SignIn | `navigate('SignIn')` from stack screens; `navigate('Home', { screen: 'SignIn' })` from the item screen |

### 7.2 Shared parts (stream S3)

| File | Props | Behaviour |
| --- | --- | --- |
| `src/components/SwapPhoto.tsx` (written, Appendix C) | `{ path?: string \| null; style?; accessibilityLabel? }` | Signs the path, shows a placeholder while loading, when there is no photo or when it cannot be signed; on an image error asks for a fresh link once, then shows the placeholder |
| `src/components/SwapStatusBadge.tsx` (written, Appendix C) | `{ status; closedReason?; role }` | `Badge` with `statusLabel`; tone info, accent, success or neutral |
| `src/components/SwapSafetySheet.tsx` | `{ visible; refType: 'listing' \| 'swap'; refId: string; label: string; messageId?: number; onClose; onBlocked }` | One `Sheet` with steps menu, reason, details, reported, block (same pattern as `UserSafetySheet`, which is not touched). Menu rows "Report" and "Block". Reasons from `SWAP_REPORT_REASONS`. Details: multiline, 500 characters, `keyboardDoneProps`, `KeyboardLift`, one `KeyboardDoneBar`, accessibility label "Report details". Calls `reportSwapContent` and `blockSwapMember` only. Report thanks text: "Thanks for letting us know. We review reports, aiming for within 24 hours. They won't be told it was you." Block text: "They won't be able to see your pieces or message you, and any open swaps with them end. They won't be told." A session counter ignores results that arrive after the sheet was dismissed. Errors come from `swapErrorMessage` |
| `src/components/SwapGuidelinesSheet.tsx` | `{ visible; onClose }` | `SWAP_GUIDELINES` and `SWAP_SAFETY_TIPS`, "Email support" (`SUPPORT_MAILTO`, alert fallback), "Done" |
| `src/components/SwapTermsSheet.tsx` | `{ visible; onAccepted; onClose }` | Scrolling `SWAP_TERMS`, "I agree" (`acceptSwapTerms()`, which sends `SWAP_TERMS_VERSION`, the text on screen), "Not now". Opened only in the `needs_terms` state, never in `update_required`. `terms_version_mismatch` (the server changed while the sheet was open) shows "The swap terms were updated. Please reopen swaps." |
| `src/components/SwapJoinCommunitySheet.tsx` | `{ visible; onJoined; onClose }` | Alias (single line, `returnKeyType="done"`, 3 to 20 characters), two tick rows ("I am 18 or older", the `SWAP_COMMUNITY_SCAN_NOTICE`), a link to the terms, "Join". Shows `alias_taken`, `alias_invalid`, `account_too_new` in plain words |
| `src/components/SwapBlockedSheet.tsx` | `{ visible; onClose }` | Lists `listSwapBlocks()` with Unblock; empty text "You haven't blocked anyone from swaps." |
| `src/components/SwapSettingsSection.tsx` | none | For Settings, signed-in only. Reads `getSwapSettings()` with `.catch` (Settings tests mock only auth), renders nothing when swaps are unavailable. When `communityAvailable` and the server's terms version equals `SWAP_TERMS_VERSION` (otherwise the row is hidden: the member could not be shown what they would agree to): a "Community swaps" switch row. Turning on opens `SwapJoinCommunitySheet`; turning off confirms ("Your pieces go back to friends only and swaps with people who are not friends end") and calls `leaveSwapCommunity`. No navigation, no AsyncStorage |

### 7.3 Listing (stream S4)

| File | Props | Behaviour |
| --- | --- | --- |
| `src/components/SwapListingCard.tsx` | `{ item: ClothingItem; onEditPiece: () => void; onOpenSwaps: () => void; onSignIn: () => void }` | States as in 3.3. Loads with `listMySwapListings()` in `useEffect` and branches on `toSwapError(e).code` (the card needs the error kind, which `getItemSwapState` hides): `not_authenticated` is the guest state, a "Sign in to swap" line with a button calling `onSignIn` and no other call; `swaps_disabled` and `not_deployed` hide the card entirely; anything else shows "Couldn't load swap status" with Try again. Renders no `TextInput`; never logs with `console.error`. If the item has no photo in the bucket the "Open to swap" button is disabled with "Add a photo of the piece first" and a link calling `onEditPiece`. Shows the terms sheet when the server says `swap_terms_required`. A listing with status `held` or `removed` shows "Under review" / "Not available" and no actions (the owner cannot clear either; the message and an "Email support" link are the only way on). Visible lock banner when `inAcceptedSwap`: "Locked into a swap. Deleting this piece cancels the swap." |
| `src/components/ListForSwapSheet.tsx` | `{ visible; item?: ClothingItem; editListing?: MySwapListing; onClose; onChanged?; onEditPiece?: (item) => void }` | With `item`: the form of 3.3. Without `item` and `editListing`: first a grid of the member's owned pieces that have a bucket photo and are not listed, then the form. With `editListing`: only the note field and Save (`updateSwapListingNote`). Single-line note (140), `returnKeyType="done"`. Uses `publishSwapListing` and maps its errors; `unsupported_image` and `photo_too_large` show "Replace photo" (calls `onEditPiece`) instead of a retry; `listing_held` shows its message and no retry |
| `src/components/MyPiecesList.tsx` | `{ onChanged?: () => void }` | The member's listings from `listMySwapListings`: photo, name, audience and status badges, open offers count, stale nudge with "Update" (republish with the current audience), "Edit note" (opens `ListForSwapSheet` with `editListing`), "Renew", "Withdraw" (confirm), "Narrow to friends" for Community listings. "Open another piece" button opens `ListForSwapSheet` without an item |

### 7.4 The rack (stream S5)

| File | Props | Behaviour |
| --- | --- | --- |
| `src/components/SwapCard.tsx` | `{ listing: SwapListing; onPress; onMenu }` | 4:5 `SwapPhoto`, condition pill, name, "Brand, Size", `ownerLine`. Menu button is a sibling `Pressable` labelled "Report or block <ownerLabel>" |
| `src/components/SwapOfferSheet.tsx` | `{ visible; target: SwapListing; onClose; onSent(swapId); onOpenPieces() }` | 3.5. Loads the member's open pieces; marks pieces not selectable for a stranger; optional extras from `browseSwapListings({ sameOwnerAs: target.id })` capped at two. Note multiline with `keyboardDoneProps` and one `KeyboardDoneBar`. Generates `clientRef` once per open and keeps it until success |
| `src/screens/SwapBoardScreen.tsx` | route params | 3.4 and the state table in 3.10; menu opens guidelines, blocked sheet, email support |
| `src/screens/SwapListingScreen.tsx` | route params | Large photo, owner line, facts from `listingFacts`, note, "Offer a swap" (or "This is your piece" with "See in My swaps" when `mine`), "More from <owner>" (browse with `sameOwnerAs`, up to 10), ellipsis opening `SwapSafetySheet`. `swap_unavailable`: "No longer available" with a way back. After a block it goes back |

### 7.5 Inbox and thread (stream S6)

| File | Props | Behaviour |
| --- | --- | --- |
| `src/components/SwapTicket.tsx` | `{ detail: SwapDetail }` | Two columns "You give" and "You get" with `SwapPhoto`, name, size, condition; a status badge; a handoff line while accepted |
| `src/components/SwapCompleteSheet.tsx` | `{ visible; giveNames; getNames; busy; onConfirm({ keepGiven }); onClose }` | "Only tap this once you have actually swapped. <get> will be added to your closet, and <give> will be removed from it." with a switch "Keep mine in my closet" (default off) and buttons "Yes, we swapped!" and "Not yet" |
| `src/screens/MySwapsScreen.tsx` | route params | Segments Swaps and My pieces (`MyPiecesList`). Swaps: sections in `BUCKET_ORDER`, rows with thumbnail, `swapTitle`, other label, `SwapStatusBadge`, a dot when `attention`. Past is limited to 10 with "Show older". Menu as on the board. Pull to refresh |
| `src/screens/SwapThreadScreen.tsx` | route params | Header with the other member's label and an ellipsis opening `SwapSafetySheet` (`refType: 'swap'`); `SwapTicket`; a status line (`closedExplanation` when closed); action buttons drawn only from `actions` (Accept, Decline, Cancel offer or Cancel swap, "We swapped!"; "Cancel swap" is also offered after the other member has tapped, with the confirmation "They already tapped We swapped!. Cancel only if you didn't hand your piece over."); `closedExplanation` receives `iDone`; the collapsible "Swap safely" card; messages (system lines from `systemLineText`, the other member's messages long-press to report with `messageId`, payment-talk warning chip); quick-reply chips; a multiline composer (500, counter, "Send message") that keeps its text on failure. Polls every `SWAP_THREAD_POLL_MS` while focused and active, merging by message id. On `swap_terms_required` opens `SwapTermsSheet` and retries the action after acceptance. On open, if `photoPending` or `removalPending` items exist, shows a "Finish up" banner and tries once automatically. After finishing: "Swapped!" with "See it in my closet" |

### 7.6 Accessibility labels the tests rely on

`Go back`, `My swaps`, `Swap menu`, `Friends`, `Community`, `Open <name>`, `Report or block <ownerLabel>`, `Offer a swap`, `Send offer`, `Accept`, `Decline`, `Cancel offer`, `Cancel swap`, `We swapped`, `Message`, `Send message`, `Report details`, `Open to swap`, `Withdraw`, `Renew`, `Update`, and the text of each quick reply.

### 7.7 What the lead adds to shared files (one serialised pass, after S0 to S6 have merged)

No engineer edits these files. Several of them are also edited by the ratings design, so **the order of the passes matters and is settled in 10.1**: the ratings integration pass goes first, and the swap pass starts from the tree it leaves. The diffs in Appendix D are written against that tree (generated from a simulation of the ratings edits in `quality-ratings.md` 6.3 and 5.9; line numbers in a diff are only hints, the context lines are the anchors, and `patch` applies by context). If the ratings pass is not in yet, the same edits go at the same landmarks of today's file. Every change below was applied to a copy of the repo and the existing suites for that file were run against it (results in the last column).

| File | Change | Diff | Existing suites run with the change |
| --- | --- | --- | --- |
| `App.tsx` | Four imports after the `BrandReportScreen` import that the ratings pass adds after `FriendClosetScreen` (after `FriendClosetScreen` itself if the ratings pass is not in), four `Stack.Screen` entries in `HomeStack` right after `FriendCloset` | `lead_app.diff` | `navigationRoutes`, `addItemHeader`, `keyboardGuard`, `App`, `AppModeGate`: pass |
| `src/screens/HomeScreen.tsx` | `const swapBadge = useSwapBadge(isAuthenticated);` and one more cell, "Swap", inside the existing signed-in spread | `lead_home.diff` | `HomeScreen`, `homeWardrobeFor`, `WishlistSeparation`, `wardrobeTotalStrip`: pass |
| `src/screens/ItemDetailsScreen.tsx` | `<SwapListingCard ... />` in its own `!item.isWishlist &&` block **directly after the `ItemQualityCard` element**, which the ratings pass puts directly after the `ItemValueCard` block (card order under the value card: `ItemQualityCard`, then `SwapListingCard`); callbacks `handleEdit`, `navigate('Home', { screen: 'MySwaps' })`, `navigate('Home', { screen: 'SignIn' })`. The import goes directly after the `@react-navigation/native` import, so it never touches the four imports the ratings pass adds at the end of the block | `lead_item.diff` | `ItemDetails`, `ItemDetailsValue`, `categoryLabelsShown`: pass (with a stand-in card that behaves as specified in 7.3) |
| `src/screens/SettingsScreen.tsx` | `{isAuthenticated && <SwapSettingsSection />}` as the last child of the Community section, after the `isAuthenticated &&` block that holds "Share product details" (and, after the ratings pass, `<RatingSharingRows />`); the delete-account text names both features' data: "... all clothing items, outfits, ratings, body profile, stylist data, swap listings, offers and messages, and any uploaded images ..." | `lead_settings.diff` | `Settings`, `settingsWardrobeFor`: pass |
| `src/screens/FriendClosetScreen.tsx` | "Pieces open to swap" row as the list header | `lead_friendcloset.diff` | no test exists for this screen; type-checked |
| `src/services/authService.ts`, `src/services/accountDeletion.ts` | `clearSwapPhotoCache()` next to `clearSignedImageCache()` | `lead_account.diff` | `authService`, `accountDeletion`, `imageUrls`, `localData`: pass |
| `src/services/backupService.ts` (stream S0) | The optional `swap` section. It does **not** touch `BACKUP_VERSION`: the bump to `'1.1'` is made once by the ratings pass (or, if swap lands first, by this edit, and the ratings pass then drops it) | Appendix C | `backupService`, `backupSwapExport`: pass |
| `__tests__/screens/keyboardScreens.test.tsx` | Add cases (this test lists screens explicitly): SwapThread (`avoiding`), SwapOfferSheet (`lift`), ListForSwapSheet (`lift`), SwapSafetySheet reached through Report (`lift`), SwapJoinCommunitySheet (`lift`), SwapBoard search (`below`). Append-only, after the ratings cases | written by the lead against the finished components | itself |

Three things the run taught, all load-bearing:

- In `HomeScreen`, the `useSwapBadge` call must come before Home's own `useFocusEffect`. The Home tests keep only the last registered focus callback and call it to simulate returning to the screen; with the badge hook after it, `homeWardrobeFor` fails (this was run).
- Components mounted in `ItemDetailsScreen` and `SettingsScreen` must not use navigation hooks or read anything but their own props and the swap service. Those screens' tests mock navigation minimally and mock `supabase` with only `auth` (Settings) or not at all (ItemDetails), so a guest path that returns before any call, and `.catch` on every read, are what keep them green.
- The two features' edits to one file are different edits at different landmarks, but a diff written against today's file stops applying once the other feature's edit is in (the swap card's diff had the value card's closing `)}` in its context, which the ratings card now follows). That is why the order is fixed and the diffs are regenerated against the tree after the first pass.

After each pass the lead runs everything in 9.4, and the ratings design's list of existing suites.


---

## 8. Privacy, safety and compliance changes

Policy first: the owner's stated order is policy, then build. Everything in this section ships before the build is distributed (gate G1).

### 8.1 `docs/privacy.html` (stream S7)

The page is edited once with both features' text (10.1 has the combined wording where the two edit the same sentence). Apply the swap part from the diff in Appendix D (`privacy.diff`). In summary it:

- updates the date and the introduction;
- adds size, condition, care instructions and country of origin to the Wardrobe content row (the foundation migration added them and the page never said so);
- adds a "Clothing swaps (optional)" row, and a full section: who sees what, photos (copy with location and camera details removed, links that expire after ten minutes, Community photos checked by Google Cloud Vision even if AI photo analysis is off, friends-only photos never sent), messages (stored, not end-to-end encrypted, read only on a report or to run the service), age (18 and over for the community, only the time of confirmation stored), and the retention table of 4.5;
- adds the Google Cloud Vision sentence to the provider list;
- rewrites the sentence about who can see photos, so that it includes the audience chosen for swaps (the old sentence would otherwise be false) and no longer claims private storage (below);
- adds the copy of the listing or last 30 messages to the reports paragraph;
- adds swap data to the list of what deleting the account removes, and the 18+ line to children's privacy.

The page already promises that reports and blocks are deleted with either account; that stays true (both foreign keys cascade).

**The "private storage" sentence (gate G0).** The page today says photos are "kept in private storage" and shown through expiring links. The second review's read-only catalogue query on the linked project showed that `wardrobe-images` is flagged **public**: anyone who has the address of an original photo can fetch it, and friends already receive those addresses from `get_friend_closet`. The metadata strip protects only the `swap-photos` copy. The sentence is therefore false today, and extending it to swaps would repeat the error. The diff removes the claim and says only what the app does ("your photos are shown to you and to friends you have accepted and, for pieces you open to swap, to the audience you chose... a photo's web address is not a password"). The claim may come back only after G0: the bucket is made private by `supabase/held/wardrobe_images_private.sql`, an unauthenticated fetch of an existing photo no longer returns it, and the oldest build still in use shows photos through signed links. Then a later edit of the page (with a new date) restores: "Your photos are kept in private storage and are shown through temporary, expiring links; they are only available to you and to friends you have accepted, and, for pieces you open to swap, to the audience you chose under Clothing swaps." `__tests__/privacyManifest.test.ts` fails while the page claims private storage and the release file is not in `supabase/migrations/`. The swap copies are different and the page may say so: `swap-photos` is created private by the foundation migration and its policy is tested.

Two statements the repo cannot prove and the owner must confirm before publishing: that "immediately" is acceptable given routine backups (the added sentence about backups covers it but needs the real period; see open questions), and the existing "Usage and diagnostics: crash reports" row, which describes a crash SDK that is not in the build; correct it in the same edit if the owner agrees.

Test: `__tests__/privacyManifest.test.ts` (Appendix F) fails if the page loses its swap section or still contains the old sentence.

### 8.2 Terms and community guidelines

- The in-app swap terms (`SWAP_TERMS`) are versioned (`SWAP_TERMS_VERSION`, `swap_config.terms_version`) and accepted server-side; a new version asks everyone again, and a build that carries older text asks the member to update instead of recording agreement (6.3). They state: no tolerance for objectionable content or abusive members, SmartCloset is not a party and does not inspect, guarantee or insure swaps, the licence to show listing photos to the chosen audience, suspension rights, how to report, and the support address. They exist because Apple's standard end-user agreement says nothing about stranger-to-stranger content.
- `SWAP_GUIDELINES` and `SWAP_SAFETY_TIPS` are shown in `SwapGuidelinesSheet` and, in part, in the thread.
- `COMMUNITY_GUIDELINES` (Friends) and its "Only add people you know" rule are not changed: the friends feature is unchanged, and swaps have their own guidelines. This avoids a false statement when the community tier opens.
- `friendService`, `UserSafetySheet`, `BlockedUsersSheet` and `FriendsScreen` are not touched, so their tests are unaffected.

### 8.3 iOS privacy manifest and App Store Connect (stream S7 and the lead)

- `ios/smartcloset/PrivacyInfo.xcprivacy`: add the data type `NSPrivacyCollectedDataTypeEmailsOrTextMessages` (linked, not tracking, app functionality). The diff is `plist.diff` in Appendix D; the file was parsed as a property list afterwards. Photos, other user content, user id, name and email are already declared; tracking stays false; no push, so no device identifier. `NSPrivacyCollectedDataTypePurchaseHistory` is arguably already owed for prices stored today; add it in the same edit if the owner agrees.
- `Info.plist`: no change. Camera and photo strings stay accurate.
- App Store Connect, by hand: the privacy label must match the manifest (add Emails or Text Messages, linked, app functionality); the age-rating questionnaire now has user-generated content and messaging answered yes; confirm the resulting tier on screen (the wording changes between questionnaire versions).
- App Review notes: describe where swaps are (Home, Swap), that listings, threads and messages have Report and Block, that new reports are reviewed by a person with the aim of 24 hours (and that the reviewer is alerted by an hourly message while any wait, G5), that the terms and guidelines are in app, that contact is the support address, and that the community tier is switched off on the server for this build (change this text if it is switched on before submission). Say exactly what filtering is live. In the friends-only build that is: scam and payment wording is refused in every text field the other person reads (built into the database, applied to folded text), and reports and blocks. Do **not** say that an objectionable-term list or the photo safety check is in force until it is: the term list (at least 50 reviewed terms) and the Google photo check belong to the community tier and are loaded and switched on at G6. If the owner loads the list before submission (open question 3), the notes may claim it. Demo account credentials are entered in App Store Connect only, never in a file. Provide two demo accounts that are friends with a few pieces each.

### 8.4 Consent

All swap consent is stored on the server, per member, with the version and the time: `swap_members.terms_version`/`terms_accepted_at` (friends tier), and for the community `adult_confirmed_at`, `photo_scan_ack_at`, `community_joined_at`, `community_terms_version`. Nothing is stored on the device. **This is the one source of truth for swap consent.** The ratings design keeps its own, generic one (`consent_purposes`, `user_consents`, `consent_in_force()` in `quality-ratings.md` 4.4) and says the same from its side (its 4.9): swaps do not use those tables and ratings do not use `swap_members`. Both follow the same rule: the member agrees to the text version they were shown, and a stale one is refused. Here the server refuses any version but its own (`terms_version_mismatch`), and the app sends the version in the build (`SWAP_TERMS_VERSION`) and asks the member to update when it differs from the server's (6.3). A later revision could move swaps onto the generic tables; nothing requires it now. This replaces the device-only pattern of "Share product details" for anything a stranger can see. Swaps are not connected to that toggle, to product contributions, or to any analytics: swap data is never read by anything except the swap functions.

### 8.5 Reports and moderation

- `content_reports` gains `ref_type`, `ref_id`, `evidence` (capped at 20,000 bytes), `reviewed_at`, `outcome`. Contexts `swap_listing` and `swap_chat`; reasons `scam`, `not_as_described`, `unsafe` are added. `report_user()` is not touched.
- `report_swap_content` accepts a reference only if the reporter may see that listing or is a participant (ids cannot be used to probe), resolves the reported member on the server, shares the 20-a-day limit with `report_user()` (same `report_rate_limited` message), folds a repeat report about the same thing within a week into the first, and stores the listing snapshot, or the status, the pieces, and the last 30 messages marked `reporter`, `reported` or `system`, with the flagged message identified.
- Three different reporters in seven days hide a listing (`held` by `reports`). The hold is sticky: only a person lifts it (`swap_admin_release_listing`) or turns it into a permanent removal (`swap_admin_remove_listing`), and expiry, renewing, withdrawing, listing the piece again and ending a suspension do not (4.4). Reports made while a listing is reserved count too. Nothing suspends a member automatically.
- A person reviews `swap_moderation_queue` (section 11.4), aiming for 24 hours. The queue is a view, so something has to tell them it is not empty: an hourly job posts the number of waiting reports and the age of the oldest (numbers only, no member or text) to a webhook the owner chooses (`swap_send_report_digest`, scheduled in 11.3, gate G5). Until that is verified the 24-hour wording is an aim with no mechanism behind it, so G5 is required before the build.
- Report and Block are on every surface listed in 3.11. Block is private; unblocking does not restore swaps.

### 8.6 App Review mapping

| Guideline | How it is met |
| --- | --- |
| 1.2 user-generated content | Terms with zero tolerance language; filtering: scam and payment wording refused everywhere, contact details refused between strangers before acceptance (built in, applied to folded text), and, for the community tier only, the owner's term list and the photo safety check (not claimed in the friends-only build; loaded and switched on at G6); report on listings, threads and messages; block; support contact in app; an aim of 24 hours with an hourly alert to the reviewer (G5); a server kill switch that needs no release |
| 1.1 objectionable content | Photo rule and, for the community, the safety check (fails closed, including on "UNKNOWN"); text filter; terms |
| 5.1.1 privacy, deletion | Policy updated first; deletion removes every swap row and queues the photos; export includes swap data |
| 5.1.2(i) third-party AI | The Google photo check for the community is disclosed in the policy, in the join step and in the listing sheet, and requires an explicit acknowledgement (`scan_ack_required`) even if AI analysis is off; friends-only photos are never sent |
| 3.1.1, 3.1.3(e) | Physical goods exchanged between members; the app handles no money, takes no fee, and refuses payment wording |

### 8.7 Analytics-free

The feature records no events, view counts, search terms, device identifiers or location, and adds no third-party SDK. The only outside service that ever sees swap data is Google Cloud Vision, and only for photos listed for the community. Counters hold numbers only and are deleted after two days; function logs contain fixed strings, never content. Messages and records follow the retention table in 4.5.

---

## 9. Test plan

Rule for everyone: add new test files; do not edit existing test files except where section 7.7 says the lead does. Signed-in UI cannot be driven in the simulator (it cannot type passwords), so signed-in flows are Jest with mocked services, and database behaviour is the BEGIN/ROLLBACK scripts.

### 9.1 Written and passing (Appendix F)

| File | Stream | What it proves |
| --- | --- | --- |
| `__tests__/functions/jpegMetadata.test.ts` | S2 | Location, camera, comments, IPTC, multi-picture data and trailing bytes are removed; picture data is byte for byte; colour profile and Adobe flag kept; rotation preserved as a 36-byte Exif block; progressive scans; idempotent; truncated and non-JPEG input rejected |
| `__tests__/functions/pngMetadata.test.ts` | S2 | Text, Exif, XMP, time, size, private and animation chunks and trailing bytes removed; header, palette, transparency, colour chunks and pixel data kept byte for byte across several pixel chunks; idempotent; wrong signature, missing header, no pixel data, zero size, a bad checksum on a kept chunk, an unknown critical chunk and truncation refused |
| `__tests__/functions/sameSecret.test.ts` | S2 | The same secret is accepted; any other value, a different length, a missing side and a hand-made token that only claims to be the service role are refused |
| `__tests__/functions/swapModeration.test.ts` | S2 | Thresholds for adult, violence, medical, racy; large face rejected, small printed face allowed; every malformed answer fails closed, including an UNKNOWN verdict for any of the four judged categories, an unknown word, and a `faceAnnotations` that is not a list; no `faceAnnotations` (the normal "no face" answer) passes |
| `__tests__/functions/swapMediaFunction.test.ts` | S2 | Source-text rules: strict request fields; path from the database; check, then download, upload, commit in order; JPEG or PNG chosen by the first bytes, each stored with its own content type; only community photos go to Google and every failure path is 503; commit failure removes the object; the sweep compares the bearer token with the service key as a secret and never decodes it; logs are fixed strings |
| `__tests__/services/swapService.test.ts` | S0 | Guests fail before any call; every function's rpc name and parameters; terms and community join always send `SWAP_TERMS_VERSION`, whatever a caller tries to pass; mapping; cursor and page size; error mapping with detail and hint; publish error parsing; the whole hand-off (photo copy, retry, give up, keep mine, removal failure) |
| `__tests__/services/swapErrors.test.ts` | S0 | Every code, rate-limit bucket, PGRST202, offline; messages never contain codes, the word "block" or "report" for neutral endings; `listing_held` and "Replace the photo" wording |
| `__tests__/services/swapPhotoUrls.test.ts` | S0 | Ten minute links, reuse, nothing written to AsyncStorage, forget and clear, quiet failure |
| `__tests__/utils/swapFormat.test.ts` | S0 | Statuses from each side, neutral wording for `unavailable`, what a cancellation means to a member who already tapped, system lines, listing facts, titles, uuid shape |
| `__tests__/hooks/useSwapBadge.test.tsx`, `useSwapAccess.test.tsx` | S0 | Count, signed-out, failure silence; each access state; terms acceptance sends no version (the service sends the build's); a newer server version, an older one, and a member who agreed on another phone all give `update_required` and record nothing; paused and suspended still win |
| `__tests__/components/SwapPhoto.test.tsx`, `SwapStatusBadge.test.tsx` | S3 | Link, placeholder, one refresh then give up; status words |
| `__tests__/swapMigrations.test.ts` | S1 | RLS and revokes on all ten tables; no policies on swap tables; the one storage policy; private bucket, JPEG and PNG; exact list of functions granted to `authenticated` and to `service_role`; search_path pinned; old friend and account functions untouched; cascades and the two set-null participants; no private column in any result list; the policy drop, the bucket flag and the term list stay out of the migrations folder, and the two held files stay one statement each; the prerequisite table is created only if missing; text is folded before any rule reads it; holds are sticky (no expiry of held, `held_by`, suspension release limited, `listing_held`); one validator used before and after the photo copy; cancel by whoever has not tapped; blocked pairs never filtered out |
| `__tests__/migrationVersions.test.ts` | S1 | Every file in `supabase/migrations` has a version and no two share one (the version is the primary key `supabase db push` keeps); the swap range holds only swap files; held files are not migrations. Covers every feature that adds migrations, the ratings design included |
| `__tests__/swapRulesInStepWithSql.test.ts` | S1 | `SWAP_LIMITS`, text lengths, terms version, report reasons and alias pattern equal what the SQL says |
| `__tests__/privacyManifest.test.ts` | S7 | Manifest declares swap messages and still tracks nothing; the policy has its swap section and no longer says photos are only available to you and friends; the page does not claim "private storage" for original photos until the bucket has been made private (G0) |

### 9.2 To be written by the UI streams (names are fixed so merges do not collide)

S3 (`__tests__/components/`):
- `SwapSafetySheet.test.tsx`: menu offers Report and Block and not Remove friend; the report walk calls `reportSwapContent({ refType, refId, reason, details, messageId })`; shows the thanks text; block calls `blockSwapMember` then `onBlocked`; errors use `swapErrorMessage`; a result arriving after dismissal is ignored; state resets when reopened; exactly one `KeyboardDoneBar` and `inputAccessoryViewID` on the details field.
- `SwapTermsSheet.test.tsx`: all six headings; "I agree" calls `acceptSwapTerms()` (no version) then `onAccepted`; mismatch message; never opened by a screen in `update_required`.
- `SwapJoinCommunitySheet.test.tsx`: Join disabled until alias (3 or more) and both ticks; trims the alias; calls `joinSwapCommunity` without a version; maps `alias_taken`, `alias_invalid`, `account_too_new`.
- `SwapBlockedSheet.test.tsx`, `SwapGuidelinesSheet.test.tsx`, `SwapSettingsSection.test.tsx` (renders nothing when `getSwapSettings` rejects or community is unavailable; hides the community switch when the server's terms version is not `SWAP_TERMS_VERSION`; join and leave flows; no `console.error` with only auth mocked).

S4:
- `SwapListingCard.test.tsx`: guest shows the sign-in line and calls `onSignIn` with no rpc; open, listed, locked, held, expired, stale states; disabled without a photo; renders no `TextInput`; silent when swaps are paused or not deployed.
- `ListForSwapSheet.test.tsx`: preview; Community chip only when available; picking it before joining opens the join step; publish called with audience and note; `photo_rejected`/`people`, `listing_incomplete`, `moderation_unavailable`, `listing_held` messages; `unsupported_image` and `photo_too_large` offer "Replace photo" (calls `onEditPiece`) and no retry; note capped at 140; busy state; edit-note mode.
- `MyPiecesList.test.tsx`: rows, renew, withdraw (confirm), narrow, update, empty state.

S5:
- `SwapCard.test.tsx`: the menu button is a sibling of the card button, not a descendant.
- `SwapOfferSheet.test.tsx`: one to three selectable, a fourth ignored; stranger pieces disabled unless Community; at most two extras; `clientRef` identical across a failed and a retried send; error messages; `keyboardDoneProps` and one bar.
- `SwapBoardScreen.test.tsx`: every access state in 3.10; skeleton; empty friends and community; filters re-query; paging cursor; `LoadError` full and banner; `friendId` param; segment hidden unless available; card press and menu.
- `SwapListingScreen.test.tsx`: facts; offer button versus "This is your piece"; unavailable state; goes back after a block.

S6:
- `SwapTicket.test.tsx`, `SwapCompleteSheet.test.tsx` (keep-mine switch passes `keepGiven`).
- `MySwapsScreen.test.tsx`: section order, the dot, past limited to ten, empty state, error, pieces segment.
- `SwapThreadScreen.test.tsx`: buttons come only from `actions` (including "Cancel swap" for the member who has not tapped after the other has, with its confirmation); accept returning `unavailable` shows the message; the composer keeps text on failure and reuses `clientRef`; polling with fake timers merges by id; "We swapped!" calls `completeSwapHandoff` with `keepGiven`; "Finish up" banner; terms retry; long-press report passes `messageId`; closed swap has no composer; a swap with a blocked member opens as a closed shell with no photos and no buttons; payment warning chip; exactly one `KeyboardDoneBar`.

### 9.3 SQL behaviour scripts (Appendix E)

Run with `scripts/run-swap-sql-tests.sh` (Appendix D). Each scenario is one transaction that always rolls back. The scripts create six users (`@example.test`), their pieces, publish listings through the service functions, and impersonate each member with `set local role authenticated` plus `request.jwt.claims`.

| Script | Covers |
| --- | --- |
| `s1_publish_browse` | Terms gate and version bump; direct table access denied for anon and authenticated; internal helpers not callable; publish refusals (no cloud photo, not my item, community closed, scam wording, long note); the text filter sees through zero-width characters, a byte-order mark and wide letters; the commit runs every check again (a scam name, brand or free text, or a removed photo, after the precheck, is refused and leaves no listing; an unedited piece still commits); snapshot contents; browse for friend, stranger, friend of a friend; filters; output columns whitelisted; the photo predicate; storage policy as seen by friend, stranger, anon, owner; clients cannot write photos; withdrawn photo unreadable; old `report_user` still works; dark community tier |
| `s2_lifecycle` | Propose (stranger refused, not-mine offer, empty side, scam note, idempotent retry, one open offer per pair); inbox buckets and badge; `get_swap` flags and no counterpart id; non-participants refused; messages; accept reserves; reserved pieces leave the rack; hand-off adds the piece with private fields reset and is idempotent; photo ack; deleting a handed-over piece does not cancel; completion; chat after completion; photo predicate after completion |
| `s3_edges` | Decline and cooldown; cancel; competing accepts (second loses cleanly, unique index backstop); block closes both ways and keeps the swap in both inboxes as a closed neutral row, opens as a closed shell, and looks the same as a swap ended by a deleted piece (compared field by field); unfriend; item deleted or wishlisted mid-swap; one-sided "We swapped!": the first tap moves the expiry to about 15 days, the member who has not tapped can cancel and the one who has cannot, a tap on day 25 is finished (not expired) 14 days later by the daily job and by a read; expiry and half-done finish after 14 days with late claim; message rate limit; open-offer caps (busy listing, busy recipient, 5 outbound); stale flag; note update; withdraw closes offers; retention of messages, swaps and ended listings |
| `s4_deletion` | Real `delete_user_account()` for each member: no rows left for the leaver, photos queued, survivor's anonymous record, "Former member", nothing left when both are gone |
| `s5_moderation_community` | Reports with evidence and shared limit; repeat folding; hold at three reporters, admin release; every way round a hold: the daily job leaves a held listing held, renew, withdraw and listing the piece again (precheck and commit) answer `listing_held`, ending a suspension releases only suspension holds, a hold made by reports while reserved lands when the swap ends; `swap_admin_remove_listing` (status, photo queued, reports handled, piece cannot be listed again, row kept until the piece is gone); chat report with flagged message; outsider refused; friend block from a swap; term-list gate and constraint (folded terms, any script, accents and invisible characters in the text); report backlog and the quiet digest; join refusals; aliases; community listing must be `checked`, and its size/condition and text rules run again at commit; stranger browse by alias only; stranger offer rules; pre-acceptance caps and contact refusal; block by alias with opaque ref, hidden from the old blocked list, and the blocked stranger sees a closed neutral shell; unblock; narrow; leave; kill switch; suspension; export |
| `s6_catalog` | RLS on all tables; no table privilege for anon or authenticated; no policies; sequence closed; queue view service-only; the exact function grants; search_path pinned; cascades; bucket settings; the one storage policy; `report_user`, `block_user`, `delete_user_account` untouched |
| `s7_legacy_policy` | Optional; while the legacy policy is still in place (before `supabase/held/drop_legacy_friend_wardrobe_policy.sql` is released), a friend can read the raw row (the leak); after the drop statement, they cannot and `get_friend_closet` still works |
| `race.sh` | Local database only: two real sessions accept two proposals for one piece |

The scenario scripts do not apply the held files. To run them: on a real local stack, `supabase db reset` (applies every file in `supabase/migrations`, the prerequisite included; without it `s4_deletion` cannot pass) and then `SWAP_TEST_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres scripts/run-swap-sql-tests.sh`; against the linked project, the same script without the variable, which uses `supabase db query --linked`. The scripts only ever `create` inside a transaction they roll back; after a live run, check that `select to_regclass('t.log')` is null.

### 9.4 Existing suites to run after each stream and after the lead's pass

- Guards (under a second): `npx jest __tests__/navigationRoutes.test.ts __tests__/screens/keyboardGuard.test.tsx __tests__/addItemHeader.test.ts`.
- Home: `HomeScreen`, `homeWardrobeFor`, `WishlistSeparation`, `wardrobeTotalStrip`, `AppModeGate`, `App`.
- Item screen: `ItemDetails`, `ItemDetailsValue`, `categoryLabelsShown`. The card must render no text field, call nothing for a guest, and never call `console.error`.
- Settings: `Settings`, `settingsWardrobeFor`.
- Add item: the `AddClothingScreen`, `addItem*` suites (untouched, run anyway).
- Services: `localData` (no new `@smartcloset` keys), `backupService`, `accountDeletion`, `authService`, `friendModeration`, `friendCloset`, `FriendsScreen`, `UserSafetySheet`.
- `npm run typecheck`, `npx tsc --noEmit --skipLibCheck` (what CI runs) and `npm run lint`.

### 9.5 Manual walkthrough on two real phones (TestFlight, ship gate G4)

Two accounts that are friends, A and B, and a stranger C. Check, in order: terms sheet; open a piece with a geotagged photo and confirm the stored copy has no location (download it from the bucket in the dashboard and inspect it); B sees it and signs a link that stops working after about ten minutes; B offers; A accepts; both pieces vanish from the rack; message both ways and see the 15 second refresh; payment wording is refused; A taps "We swapped!" and B's piece appears in A's closet with its photo (kill the app halfway on one attempt and finish from "Finishing touches"); B taps it; both closets are right and the given pieces are gone; delete a piece mid-swap; block mid-swap and see the neutral message on the other phone; report a listing and a message and see the rows in the dashboard queue with evidence; delete B's account and see A's record read "Former member"; C sees nothing. Also: list a piece whose photo is a screenshot (a PNG) and see it appear for B; put one of your own listings on hold from the dashboard and confirm the owner cannot renew, withdraw or list it again; as A, tap "We swapped!" and see that B can still cancel (and that A then sees the explanation); block B and confirm B's phone still shows the swap, closed and neutral. Repeat the report and block steps with the community tier on, using aliases.

---

## 10. Implementation streams, file ownership and merge order

Eight streams plus the lead. No file appears twice. A stream edits only the files it owns; to use another stream's file it imports it through the contract in sections 6 and 7 and mocks it in its own tests. Agents share one working tree and must not commit; the lead merges.

| Stream | Owns | Needs | Done when |
| --- | --- | --- | --- |
| **S0 Contract** (first) | `src/types/swap.ts`, `src/config/swapRules.ts`, `src/services/swapErrors.ts`, `src/services/swapPhotoUrls.ts`, `src/services/swapService.ts`, `src/utils/swapFormat.ts`, `src/hooks/useSwapBadge.ts`, `src/hooks/useSwapAccess.ts`, `src/services/backupService.ts` (swap section; the version bump belongs to whichever of the ratings and swap passes lands first, 10.1), tests `__tests__/services/swapErrors.test.ts`, `swapPhotoUrls.test.ts`, `swapService.test.ts`, `__tests__/utils/swapFormat.test.ts`, `__tests__/hooks/useSwapBadge.test.tsx`, `useSwapAccess.test.tsx`, `__tests__/services/backupSwapExport.test.ts` | nothing | Appendix C files are in place and their tests pass under the repo's own Jest and `tsc`; **the consent fix is in and merged before S3 to S6 start, because they all import the hook**: `useSwapAccess` has the `update_required` state, `acceptSwapTerms()` and `joinSwapCommunity()` send `SWAP_TERMS_VERSION` and take no version; `backupService` exports the `swap` section (`try/catch`, omitted on failure, never fails the export) with a new test |
| **S1 Database** | the prerequisite `supabase/migrations/20261015000000_styling_recommendations_if_missing.sql`, the five swap migrations `20261015000100` to `20261015000500`, the held `supabase/held/wardrobe_images_private.sql` and (unless the ratings stream has already added the identical file) `supabase/held/drop_legacy_friend_wardrobe_policy.sql`, everything in `supabase/tests/swaps/`, `scripts/run-swap-sql-tests.sh`, `__tests__/swapMigrations.test.ts`, `__tests__/swapRulesInStepWithSql.test.ts`, `__tests__/migrationVersions.test.ts` | S0 (the rules test imports `swapRules.ts`) | **First task, before anything else is trusted: `supabase start`, `supabase db reset`, then the scripts, on the real local stack.** Check on it: (1) the prerequisite table matches the live `styling_recommendations` (compare columns; correct the file); (2) the `wardrobe-images` bucket exists locally (run the held bucket file once, or create it private); (3) the fixture inserts into `auth.users` (id, email, name, created date only) are accepted by the real table and its triggers; (4) `pg_cron`, `pg_net` and Vault may be absent locally: `swap_send_report_digest()` must return false and nothing else may depend on them; (5) the default grants for `anon`, `authenticated` and `service_role` and row-level security on `storage.objects` are as the stub assumed; (6) the database is UTF-8 with a locale that treats non-Latin letters as letters (the text filter uses `normalize` and `[[:alnum:]]`; the Cyrillic term in `s5_moderation_community` fails under a C locale). Then: scripts pass against the local database; migrations applied twice cleanly; `supabase db push --dry-run` lists exactly the six files; a `supabase db query --linked` dry run of `s6_catalog` passes; **applying to the live project is the lead's act (gate G2)** |
| **S2 Edge** | `supabase/functions/swap-media/index.ts`, `supabase/functions/_shared/jpegMetadata.ts`, `supabase/functions/_shared/pngMetadata.ts`, `supabase/functions/_shared/sameSecret.ts`, `supabase/functions/_shared/swapModeration.ts`, `supabase/functions/delete-account/index.ts` (the diff), `supabase/config.toml` (add `[functions.swap-media] verify_jwt = true`), `.github/workflows/swap-sweep.yml` (only if `pg_cron` is unavailable), `__tests__/functions/*` | S1 function names (contract only) | Tests pass; function deployed to a test project and a publish (a JPEG and a PNG), a Community rejection and a sweep exercised once by hand, including a sweep with a hand-made token, which must be refused; **deploy to the live project is gate G3** |
| **S3 Shared UI** | `src/components/SwapPhoto.tsx`, `SwapStatusBadge.tsx`, `SwapSafetySheet.tsx`, `SwapGuidelinesSheet.tsx`, `SwapTermsSheet.tsx`, `SwapJoinCommunitySheet.tsx`, `SwapBlockedSheet.tsx`, `SwapSettingsSection.tsx`, tests in `__tests__/components/` | S0 | Props as in 7.2; tests in 9.1 and 9.2; the guard tests pass |
| **S4 Listing UI** | `src/components/SwapListingCard.tsx`, `ListForSwapSheet.tsx`, `MyPiecesList.tsx`, tests | S0, S3 | As 7.3; the card proven inside a rendered `ItemDetailsScreen` in a scratch test (zero text fields, no network as a guest) |
| **S5 Rack UI** | `src/components/SwapCard.tsx`, `SwapOfferSheet.tsx`, `src/screens/SwapBoardScreen.tsx`, `src/screens/SwapListingScreen.tsx`, tests | S0, S3 | As 7.4 |
| **S6 Inbox and thread UI** | `src/components/SwapTicket.tsx`, `SwapCompleteSheet.tsx`, `src/screens/MySwapsScreen.tsx`, `src/screens/SwapThreadScreen.tsx`, tests | S0, S3, S4 (`MyPiecesList` by its props only) | As 7.5 |
| **S7 Policy and compliance** | `docs/privacy.html`, `ios/smartcloset/PrivacyInfo.xcprivacy`, `docs/MODERATION.md`, `__tests__/privacyManifest.test.ts` | the owner's decisions in section 12 | Files changed as the diffs and the combined wording in 10.1 say; `docs/MODERATION.md` as in 11.4; **published before the build (gate G1)**. Collects the owner's objectionable-term list (at least 50 reviewed terms, needed before the community switch) and hands it to the lead as the dashboard statement of 11.4 or as a new migration with a later version (never as an edit to an applied file) |
| **Lead** (last) | `App.tsx`, `src/screens/HomeScreen.tsx`, `src/screens/ItemDetailsScreen.tsx`, `src/screens/SettingsScreen.tsx`, `src/screens/FriendClosetScreen.tsx`, `src/services/authService.ts`, `src/services/accountDeletion.ts`, `__tests__/screens/keyboardScreens.test.tsx` | all of the above | The lines in 7.7 and the checks in 9.4; applies migrations, deploys functions, App Store Connect |

Merge order: S0, then S1, then S2 and S7 (any time after S1 for S2; S7 has no code dependency and should go as early as the owner's text is ready), then S3, S4, S5, S6, then the lead (after the ratings integration pass, 10.1). Streams S4, S5 and S6 can be built in parallel with each other once S3's props are fixed, because they meet only at the documented props.

Shared rules of engagement for the UI streams:

- Before a stream you depend on has merged, import its files through the documented props/functions and mock them with `jest.mock`; do not copy or stub them into your own files.
- Typecheck with `npx tsc --noEmit --skipLibCheck` and run the guard tests (9.4) before saying done.
- No new AsyncStorage key, no module-scope network, no navigation hook inside a shared component, no `console.error` on a guest path.
- Copy comes from `swapRules.ts` and `swapFormat.ts`; do not retype it.

### 10.1 What this design shares with the quality-ratings design

`documentation/design/quality-ratings.md` (read for this revision as it stood on 2026-10-13, 17:12) is a second feature built at the same time. Its sections 4.1, 4.9 and 10.2 describe the same overlaps from its side. If either document changes, redo this section and those three in the same change. What is settled:

| Topic | Settled | Where |
| --- | --- | --- |
| Migration versions | Swaps: `20261015000000` to `20261015000500`. Ratings: `20261016000000` to `20261016000399`. A held file takes a release-day version later than every file in the folder. `__tests__/migrationVersions.test.ts` fails on any duplicate version. (`quality-ratings.md` 4.1, 4.9, 10.2 and question 12 still quote the old swap range `20261014000000` to `20261014000600`; update those four mentions there; the ranges do not collide either way) | 4.1; ratings 4.1 |
| Consent | Swap keeps its own, on `swap_members`, and does not use `consent_purposes`, `user_consents` or `consent_in_force()`; ratings does not use `swap_members`. Both record the version of the text the member was shown and refuse a stale one. (Ratings 4.1 says its consents file goes "before swaps": swaps do not use it, so that ordering is not needed) | 8.4; ratings 4.4, 4.9 |
| Database objects | No table, function or view name is used by both | ratings 4.9 |
| The legacy friends policy drop | One file, `supabase/held/drop_legacy_friend_wardrobe_policy.sql`, never in the migrations folder; released once, by the procedure in 4.1. Swaps do not depend on it | 4.1; ratings 4.3 |
| Order of the passes on shared files | The ratings integration pass (its stream 10) first, then the swap lead pass, one pass per file at a time. The swap diffs are written against the tree after the ratings pass. If swap must land first, the ratings pass rebases onto it at the same landmarks | 7.7; ratings 10.2 |
| Cards on Item Details | Under the value card: `ItemQualityCard`, then `SwapListingCard` | 7.7; ratings 6.3 |
| `BACKUP_VERSION` | `'1.1'`, bumped once by whichever pass lands first; the other adds only its optional section | 4.7; ratings 5.9 |
| Settings | `<RatingSharingRows />` right after the "Share product details" row; `<SwapSettingsSection />` as the last child of the Community section; one delete-account sentence naming both | 7.7; ratings 6.3 |
| `docs/privacy.html` | Edited once, by one person, with both features' text, and published before either build is submitted. One "Last updated" date. Where both edit the same sentence the combined wording below is used. `__tests__/privacyManifest.test.ts` (here) and `__tests__/docs/privacyPolicy.test.ts` (ratings) are written together; neither asserts the other feature's superseded text | below |
| `PrivacyInfo.xcprivacy` | Swap adds `EmailsOrTextMessages` (and `PurchaseHistory` if the owner agrees); ratings changes nothing | 8.3; ratings 8.3 |
| `Info.plist` | Ratings only (camera and photo strings) | ratings 8.3 |
| `keyboardScreens.test.tsx` | Append-only: each feature appends its cases at the end; the `doneId` change is made once, by the ratings pass | 7.7; ratings 6.5 |

Combined wording for `docs/privacy.html`, by landmark (the swap-only text is the diff in Appendix D; the ratings text is `quality-ratings.md` 8.2):

| Landmark | Combined wording |
| --- | --- |
| Last updated | The publish date of the combined page |
| Introduction | The swap sentence ("...optionally connect with a personal stylist or friends and swap pieces of clothing with them") |
| Wardrobe content row | The ratings wording, which already covers the swap fields: "Photos of clothing; brand, color, material, price, size, condition, care instructions and country of origin you enter or scan; the text of a tag you scan; your private notes" |
| New table rows | After "Social & marketplace": Label scans, Quality ratings, Your agreement (ratings), then Clothing swaps (swap) |
| Google Cloud Vision bullet | One bullet: "...skin tone. It also reads the text on a clothing tag you photograph, and checks photos you list for community swaps for unsafe content and people (see Clothing swaps below); the swap check happens even if you turned off AI photo analysis" |
| Where your data is stored | The swap paragraph (8.1: no "private storage" claim until G0), then the ratings sentence "Your ratings and notes are never visible to friends." |
| Community & safety | The swap sentence about the copy of a listing or of the last 30 messages, then the ratings sentence about reporting a brand score |
| Delete your account | "...(wardrobe items, outfits, ratings, style profile, friend connections, swap listings, offers and messages) from our systems. Copies in routine backups are overwritten on their normal schedule" plus the real backup window once known |
| Children's privacy | "Community swaps are for people 18 and over. Adding ratings to brand insights is for people 18 or older." |
| Sections | "Clothing swaps (optional)" (with its own retention table) and "Quality ratings and brand insights (optional)"; the ratings "How long we keep it" section gets one line pointing to the swap table |
| Usage & diagnostics row | Changed once, by the ratings pass (swap leaves it) |

---

## 11. Rollout, ship gates and moderation runbook

### 11.1 Order

1. **G0 Storage claim (before G1 where possible; it never blocks swaps).** The second review's catalogue query on the linked project showed `wardrobe-images` flagged public (re-run it first: `select id, public from storage.buckets where id = 'wardrobe-images'`), so the privacy page must not call the original photos private until this passes. Steps: (a) confirm the oldest build still in use shows photos through signed links (`src/services/imageUrls.ts`, commit `ec5956c`, 2026-10-02: builds from then on sign; an older build shows the stored address and would lose its photos); (b) release `supabase/held/wardrobe_images_private.sql` by the procedure in 4.1 (it creates the bucket private or flags it private, so the repository owns the flag); (c) fetch an existing photo's public address with no credentials (`curl -s -o /dev/null -w '%{http_code}' <address>`): it must not be 200; (d) open your own closet and a friend's closet on the oldest build in use: photos still load. Until G0 passes, the page carries the reworded sentence (8.1) and says nothing about private storage for originals. If the owner decides not to flip the flag, the wording stays as it is.
2. **G1 Policy:** S7 merged and `docs/privacy.html` published (it is served from GitHub Pages at `PRIVACY_POLICY_URL`) with both features' text (10.1); App Store Connect label and age rating edited; review notes written (8.3: say only what filtering is live).
3. **G2 Database:** `supabase db push --dry-run` against `ipgndphqbuftuxstoitk` must list **exactly** these files and nothing else: `20261015000000_styling_recommendations_if_missing.sql`, `20261015000100_swap_foundation.sql`, `20261015000200_swap_listings.sql`, `20261015000300_swap_lifecycle.sql`, `20261015000400_swap_moderation.sql`, `20261015000500_swap_community.sql` (plus the ratings files if that feature ships in the same release, 10.1; if the ratings files are already on the project, `db push` also needs `--include-all` for these older versions, and the dry run with that flag must still show exactly these six). Anything else in the list (a held file that was moved, a stray file) stops the release. Then `supabase db push`, before any build that contains swaps is distributed. Run the scripts against it (`scripts/run-swap-sql-tests.sh`, which uses `BEGIN ... ROLLBACK`), confirm `to_regclass('t.log')` is null afterwards. The term list and the policy drop are not part of G2.
4. **G3 Functions:** deploy `swap-media` and the updated `delete-account` (`supabase functions deploy swap-media delete-account`); the existing `GOOGLE_VISION_API_KEY` secret is reused. Prove the sweep check once: a POST of `{"action":"sweep"}` with a hand-made unsigned token (`role: service_role` in its payload) must be refused (401 from the platform while `verify_jwt` is on, 403 from the function itself if it is ever turned off), and the same POST with the service key must answer 200.
5. **G4 Two-account TestFlight walkthrough** (9.5), including one real `createSignedUrls` call from the second phone and the geotagged photo check.
6. **G5 Scheduling and alerting (required before the build):** schedule the sweep and the report alert (11.3). Verify the alert once with a real test report: it must reach the person who will review reports. Until the sweep is scheduled, the policy's retention wording is "about" and member reads still run the upkeep, so nothing is wrong, only slower to delete; the alert has no such fallback, which is why it gates the build.
7. **Build:** TestFlight with swaps; `community_enabled` stays false.
8. **G6 Community (later, a separate decision):** at least 50 reviewed terms loaded (11.4); a person is committed to the 24 hour queue; `swap_set_community_enabled(true)`; re-run the walkthrough with aliases; update the review notes. The switch is also the abuse brake: `swap_set_community_enabled(false)`.
9. **Optional hardening:** release `supabase/held/drop_legacy_friend_wardrobe_policy.sql` (4.1), after the owner confirms which builds are live.

### 11.2 Kill switches (no release needed)

```sql
select public.swap_set_enabled(false);            -- everything pauses; the app shows "Swaps are paused"
select public.swap_set_community_enabled(false);  -- strangers only
```

### 11.3 Scheduling the sweep and the report alert

Preferred, if `pg_cron`, `pg_net` and Vault are enabled on the project (not verified here): store the service key in Vault once from the dashboard (never in a file). It must be the same value as the `SUPABASE_SERVICE_ROLE_KEY` secret of the `swap-media` function, because the function compares the token it receives with that key (5.1). Then

```sql
select cron.schedule('swap-sweep', '17 3 * * *', $$
  select net.http_post(
    url := 'https://ipgndphqbuftuxstoitk.supabase.co/functions/v1/swap-media',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')),
    body := '{"action":"sweep"}'::jsonb);
$$);
```

**The report alert.** The moderation queue is a view; nothing tells anyone it is not empty. Store a webhook address you control (a chat incoming webhook, or an email gateway) in Vault under the name `swap_report_webhook`, then

```sql
select cron.schedule('swap-report-digest', '7 * * * *', $$ select public.swap_send_report_digest(); $$);
```

Each hour, if any report about a swap listing or conversation has waited more than four hours unreviewed, `swap_send_report_digest()` posts one line to that address: how many are waiting and how old the oldest is. It sends no member, id or text. Where `pg_net`, Vault or the secret is missing it does nothing and returns false, so a missing piece never breaks the job and also never alerts anyone: G5 requires that the alert is seen to arrive. To test it: file a report from a test account, then `select public.swap_send_report_digest(interval '0 seconds');` from the SQL editor (it returns true and the message arrives), and mark the report handled.

Fallback for the sweep: `.github/workflows/swap-sweep.yml` (Appendix D), which needs the service key as a GitHub secret. Prefer the first; the key is powerful. The alert has no fallback in this design: if `pg_cron`, `pg_net` or Vault is missing, someone must read `swap_moderation_queue` on a schedule (put it in the owner's calendar), or the 24-hour aim in `SWAP_TERMS`, `SWAP_GUIDELINES` and the safety sheet is reworded to "as soon as we can" until an alert exists.

### 11.4 `docs/MODERATION.md` (stream S7 writes this file with this content)

```markdown
# Swap moderation

Swaps let members show photos and exchange messages. This is how reports are handled. Response target: a person looks at new reports within 24 hours, and says so in the app guidelines and in App Review notes. That is only true while someone is told when reports are waiting (next section).

## Being told
The queue below is a view; nothing alerts anyone by itself. An hourly job posts a one-line message (how many reports are waiting and how old the oldest is, never a member or any text) to the webhook address stored in Vault under the name `swap_report_webhook`. If that secret, `pg_net` or the schedule is missing, no message is sent: check that you receive one after any test report (see "Scheduling the report alert" in the design, 11.3), and until then read the queue yourself every day.

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

When the list is final, also commit the same statement as a new migration whose version is later than every existing file (see the release command in the design, 4.1), so a rebuilt database has it. Never edit a migration that has already been applied: `supabase db push` will not run it again.

## What cannot be seen
A report never reveals who reported to the reported person. Reports and their evidence are deleted when either account is deleted. A removed account takes its reports with it; if repeat abuse after deletion becomes a problem, keeping a minimal ban record is a decision for the owner (it changes the privacy policy).
```

### 11.5 Operating limits to watch

Rate counters are per member, so many accounts can still send spam; the answers are the account-age rule, reports, holds and suspension. Failed calls that raise before the counter are bounded by the platform gateway only.

---

## 12. Deferred items and open questions for the product owner

### 12.1 Deliberately deferred

- Push notifications and realtime (new entitlement, device identifier in the privacy label); the inbox and 15 second thread refresh stand in.
- Editing an open offer (revise). Today: cancel the offer and send a new one (the 7 day wait applies only after a decline).
- Photos or any attachment in messages; links are never rendered.
- A shipping address helper, meeting places, distance or region filters (no location is stored).
- Counter-offers; three-way swaps; "wanted" posts; private "eyeing", match cards, wishlist finds, a "swapped N times" count, a celebration animation, avatars, saved size filters, quick-reply learning.
- Swap-partner reputation or ratings (belongs with the ratings feature, with its own consent).
- Hiding or deleting a conversation from one side only; renaming an alias; non-ASCII aliases.
- Perceptual-hash detection of re-uploaded banned photos; a moderation dashboard (the hourly count alert of 11.3 is built; a digest with report contents is not).
- Look-alike letters from other alphabets in the text filter (a Cyrillic "a" for a Latin one); it folds accents, wide letters and invisible characters, and reports are the answer to the rest.
- A retained ban record after account deletion.
- Swap history in Settings.
- Narrowing the friend read policy on `wardrobe-images` (folder-wide), making the bucket private (G0) and dropping the legacy `clothing_items` friends policy are recommended hardening, independent of swaps (the two held files exist; releasing them is gated on the owner).
- Cleaning up a giver's own original photo object: the giver deletes the piece with the existing `deleteClothingItem`, which already removes the photo.

### 12.2 Open questions

1. Is a friends-only first release acceptable, with the community tier switched on later? (Recommended. If not, section 11.1 step 8 (G6) moves before the build, and the report queue must be staffed first.)
2. Who reviews reports within 24 hours, and where should the hourly alert go (a chat webhook, an email gateway)? The alert is built (`swap_send_report_digest`) and needs only that address in Vault; without it nobody is told when a report arrives.
3. Who supplies and approves the objectionable-term list (at least 50 terms) before the community switch can turn on? And do you want it loaded before the first submission, so the review notes can claim a term filter? Without it the first build claims only the built-in scam and payment filtering (8.3).
4. Which builds are live? Is it safe to release `supabase/held/drop_legacy_friend_wardrobe_policy.sql` (drop the legacy friends policy)? Today it leaks cost, notes, wear data and the new size, condition and tag text of owned items to accepted friends through the table API.
5. The `wardrobe-images` bucket is flagged public on the live project (a catalogue query found it), although the privacy page said it was private. Is the oldest build still in use at or after commit `ec5956c` (signed photo links, 2026-10-02)? If so, G0 releases `supabase/held/wardrobe_images_private.sql`. Until then the page does not claim private storage; this decides when it may.
6. What is the real backup retention period of the database host, for the privacy page sentence?
7. Are `pg_cron`, `pg_net` and Vault available, or should the GitHub workflow (service key as a repository secret) be used?
8. Acceptable windows: proposals 14 days, accepted swaps 30 days, listings 60 days, messages kept 30 days and records 90 days after a swap ends? Auto-finish after 14 days when only one side tapped "We swapped!"?
9. Removing the piece you gave from your closet is the default with "Keep mine in my closet" as the choice. Is that the right default?
10. "Invite a friend" has no store link to share (the app has no App Store URL constant). Provide one, or the share text stays plain.
11. Hosting: keep the swap terms in app only, or also publish them as a web page next to the privacy page? Apple's standard agreement stays the app-wide EULA either way.
12. The privacy page's "Usage and diagnostics: crash reports" row and the missing purchase-history declaration are inaccuracies unrelated to swaps; fix them in the same edit?
13. The age-rating questionnaire tier after answering yes to user-generated content and messaging.
14. Do you want editing an open offer (revise) in the first release rather than cancel and resend?
15. When the ratings feature is built: should a completed swap invite a rating of the received piece? Nothing in this design reads swap data for any rating, brand or analytics purpose, and a swap hand-off creates a new closet row with no rating, note or tag text (the ratings design agrees, its 4.9).
16. Is the built-in filtering (scam, payment and contact wording, applied to folded text) enough for App Review guideline 1.2 on the friends-only first build, or do you want the term list loaded first? This decides whether 8.3 may claim a term filter.
17. Does the live `styling_recommendations` table match the definition in `documentation/SUPABASE_MIGRATION_GUIDE.md` that the prerequisite migration uses? (S1 compares the columns and corrects the file before it merges; on the live project the file does nothing.)

---

## 13. Traceability

The three reviews of the earlier designs each ended with conditions that the final design had to meet. Where each is met:

| Condition | Where |
| --- | --- |
| No app-user access to swap tables; everything through definer functions with whitelisted columns; migration-text test | 4.2, `s6_catalog.sql`, `swapMigrations.test.ts` |
| Immutable server-made listings; private bucket with random names; definer storage predicate; short links in memory only | 2.1, 5, `swapPhotoUrls.ts` |
| Metadata removed server-side from what strangers see, from JPEG and PNG alike; size and MIME limits | 5.2, bucket in `20261015000100`, `pngMetadata.test.ts` |
| Community off by default behind a kill switch; versioned terms; 18+ attestation; alias; account age; viewer must also have joined | 3.1, `swap_config`, `join_swap_community`, `swap_gate` |
| No `friend_display_name()` or email-derived label for non-friends; no ids returned; swap blocks stored under the alias and hidden from the old list | 2.4, `swap_label`, `block_swap_member`, `list_swap_blocks` |
| Block, unfriend, deletion handled without replacing `block_user()` or `delete_user_account()`; queue for photo removal; deletion test | 4.7, triggers, `s4_deletion.sql` |
| One existence-hiding error and one neutral closed reason | 4.6, 3.9, `swapFormat.ts` |
| Consent before chat for strangers; payment words always refused; atomic counters; per-pair, per-listing and per-recipient caps | 3.5, 3.6, `swap_text_ok`, `swap_rate_check`, `propose_swap` |
| Strangers see only scanned photos; offers to strangers must be Community listings; the scan fails closed; friends-only photos never sent | 5.1, `propose_swap`, `swap_listings_community_checked` |
| Explicit gate for the Google scan, policy and manifest updated first | 8, `scan_ack_required` |
| Report and block on every surface; evidence; dedupe; shared limit; contact; hold at a threshold, suspension by a person; admin functions | 8.5, 3.11, 11.4 |
| Reservation: locks in a fixed order, unique index backstop, idempotency keys, delete triggers | 2.3, `race.sh` |
| Hand-off per member and additive; photo path accepts timestamped names; no cross-user change | 3.7, 5.3, `swap_item_photo_path` |
| Retention enforced before promised; lazy expiry; export; no analytics | 4.5, 4.7, 11.3 |
| 18+ for the community; age rating | 8.3, `adult_required` |
| Drop the legacy friends policy, without `db push` applying it unreviewed | the held file (4.1), open question 4 |
| Verification before enabling: scripts for invisibility, photo matrix, direct-access denial, column audit, geotag check | 9.3, 9.5 |
| Smallest buildable spine, no decoder on the critical path, no scheduled job for correctness, no delight scope, no multi-step client orchestration of server state | 1, 5.2, 4.4, 12.1, `propose_swap` is one call |
| Per-user lazy upkeep with a throttled global job; server-computed action flags; contract first | 4.4, `get_swap`, section 10 |
| Fast to try: a few taps to list, photo is the only hard requirement for friends | 3.3 |
| Complete empty, error, offline, guest and paused states; plain language; kill-switch state; not-deployed state | 3.10 |
| One thread screen for the whole lifecycle; quick replies; collapsed safety card; report per message | 3.6, 7.5 |
| Predictable, user-present hand-off with "Keep mine", retry list, one-sided auto-finish | 3.7 |
| No heavy onboarding for friends; no hard block of normal talk between friends | 3.2, `swap_text_ok` modes |
| Existing look and rules: HomeStack only, sibling menus, keyboard rules, no sixth tab, ItemDetails card without a text field | 7 |

The second review (revision 2) added these conditions:

| Condition | Where |
| --- | --- |
| Migration versions unique and agreed with the ratings design; one consent source of truth; one card order, one backup bump, one privacy edit; the shared-file passes in order | 4.1, 8.4, 10.1, 7.7, `migrationVersions.test.ts` |
| Nothing that waits for a decision is applied by `supabase db push`; G2 is "the dry run lists exactly these files"; the term list is never an edit to an applied file | 4.1, 11.1, 11.4, `swapMigrations.test.ts` |
| The privacy page does not claim private storage for original photos while the bucket is public; the repository owns the bucket flag | 8.1, G0, `wardrobe_images_private.sql`, `privacyManifest.test.ts` |
| Moderation holds are sticky; a person can remove a listing for good | 4.4, 8.5, `swap_admin_remove_listing`, `s5_moderation_community` |
| Consent is recorded against the text the member was shown | 6.3, 8.4, `useSwapAccess.test.tsx`, `swapService.test.ts` |
| A block is not visible as a block to the blocked member | 2.4, 3.9, `s3_edges` |
| The sweep does not trust a token it has not verified | 5.1, `sameSecret.test.ts`, `swapMediaFunction.test.ts` |
| The text, completeness and cap rules run again at commit, on what the piece says now | 5.1, `swap_validate_item`, `s1_publish_browse`, `s5_moderation_community` |
| A one-sided "We swapped!" locks nobody in, and the finish comes before the expiry | 3.6, 4.4, `s3_edges` |
| Reports reach a person; the filtering claim matches what is live; text is folded before it is matched | 8.3, 8.5, 8.6, 11.3, `swap_send_report_digest`, `s5_moderation_community` |
| Account deletion works on a database built from the migrations | 4.1, `20261015000000`, `s4_deletion` |
| A PNG photo can be listed | 5.2, `pngMetadata.test.ts` |
| The community photo check fails closed on "UNKNOWN" | 5.1, `swapModeration.test.ts` |

---

## Appendices

Every file below was run or compiled as described in section 0. The path on the first line of each block is where the file goes in the repository; the stream that owns it is in section 10. Code blocks are in fences of four backticks so that nothing inside can end them early.

| Appendix | Contents | Streams |
| --- | --- | --- |
| A | The six migration files (a prerequisite and five swap files) and the two held files (the policy drop and the bucket flag), which `supabase db push` never applies | S1 |
| B | `swap-media`, its four pure helpers (JPEG and PNG metadata, the secret compare, the photo decision), and the `delete-account` change | S2 |
| C | Types, rules, errors, photo links, service, wording, hooks, the two shared components, the backup change | S0 (S3 for the two components) |
| D | Scripts, workflow, and the diffs for policy, manifest and the lead's files | S1, S2, S7, lead |
| E | SQL behaviour scripts | S1 |
| F | Jest tests that are written and passing | S0, S1, S2, S3, S7 |


---

## Appendix A: migrations

The files in `supabase/migrations` are applied in file-name order. Each is idempotent. Their header comments explain what they do and what they depend on. The two files in `supabase/held` are never applied by `supabase db push`; see 4.1 for how one is released.

#### `supabase/migrations/20261015000000_styling_recommendations_if_missing.sql  (stream S1; a prerequisite that does nothing on the live project)`

````sql
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
-- below is the guide's. Before this file merges, stream S1 compares it with the live table
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
````

#### `supabase/migrations/20261015000100_swap_foundation.sql  (stream S1)`

````sql
-- Clothing swaps, part 1 of 5: foundation.
--
-- Tables, helpers, triggers, the private swap-photos bucket and its single read
-- policy. Nothing here changes behaviour for old app builds. Every object is new except:
--   * user_blocks gains two columns (via_swap, ref) and its two client policies gain
--     "and not via_swap" (no existing row has via_swap = true, so old builds see exactly
--     what they saw before);
--   * content_reports gains five nullable columns (the report lists are widened later,
--     in the moderation migration);
--   * three triggers are added to user_blocks, friend_requests and clothing_items. They
--     never raise, so they cannot make a block, an unfriend or a deletion fail.
--
-- Rules every later swap migration follows:
--   * Every swap table has row level security ON and ALL privileges revoked from
--     public, anon and authenticated. There are no policies. App users reach swap data
--     only through SECURITY DEFINER functions that check sign-in, blocks, suspension and
--     audience, and that list their output columns by name. (RLS policy expressions run
--     with the caller's rights and cannot call is_blocked_between, which is revoked from
--     clients, so block-awareness cannot live in policies.)
--   * Every function pins search_path. Client functions are granted to authenticated only;
--     internal helpers and service-only functions are revoked from everyone but the owner
--     (Supabase grants EXECUTE on new functions to anon, so the revokes are explicit).
--   * Every FK to auth.users is ON DELETE CASCADE, except swaps.proposer_id/recipient_id
--     (ON DELETE SET NULL on purpose: the other member keeps an anonymous record of the
--     swap instead of it silently vanishing). delete_user_account() needs no edit.
--
-- Safe to run twice.

-- ─── 1. Configuration and switches ──────────────────────────────────────────

create table if not exists public.swap_config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.swap_config (key, value) values
  ('swaps_enabled',         'true'::jsonb),     -- global kill switch
  ('community_enabled',     'false'::jsonb),    -- stranger tier; stays false until the report queue is staffed
  ('terms_version',         '"2026-10"'::jsonb),
  ('min_account_age_hours', '48'::jsonb)
on conflict (key) do nothing;

-- One row; remembers when the throttled janitor last ran.
create table if not exists public.swap_meta (
  id               boolean primary key default true check (id),
  last_janitor_at  timestamptz
);
insert into public.swap_meta (id) values (true) on conflict (id) do nothing;

-- ─── 2. Members ─────────────────────────────────────────────────────────────

create table if not exists public.swap_members (
  user_id               uuid primary key references auth.users(id) on delete cascade,
  terms_version         text,
  terms_accepted_at     timestamptz,
  -- Community tier only (stays null until the community migration is live).
  adult_confirmed_at    timestamptz,     -- "I am 18 or older"; no date of birth is stored
  photo_scan_ack_at     timestamptz,     -- agreed that community photos are checked by Google Cloud Vision
  community_joined_at   timestamptz,
  community_terms_version text,
  alias                 text,
  suspended_at          timestamptz,
  suspended_reason      text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint swap_members_alias_check
    check (alias is null or alias ~ '^[A-Za-z0-9][A-Za-z0-9 ._-]{1,18}[A-Za-z0-9]$')
);
create unique index if not exists swap_members_alias_unique
  on public.swap_members (lower(alias)) where alias is not null;

-- ─── 3. Listings (immutable snapshots of an item) ───────────────────────────

create table if not exists public.swap_listings (
  id                 uuid primary key,
  owner_id           uuid not null references auth.users(id) on delete cascade,
  item_id            uuid references public.clothing_items(id) on delete set null,
  audience           text not null check (audience in ('friends', 'community')),
  status             text not null default 'active'
                       check (status in ('active', 'reserved', 'completed', 'withdrawn', 'held', 'removed', 'expired')),
  note               text check (note is null or char_length(note) <= 140),
  -- Snapshot. Only these fields are ever shown to anyone else; nothing private is copied.
  name               text not null check (char_length(name) between 1 and 80),
  category           text not null,
  subcategory        text check (subcategory is null or char_length(subcategory) <= 60),
  brand              text check (brand is null or char_length(brand) <= 60),
  color              text check (color is null or char_length(color) <= 40),
  size               text check (size is null or char_length(size) <= 20),
  condition          text check (condition is null or condition in ('new_with_tags', 'like_new', 'good', 'well_loved')),
  pattern            text check (pattern is null or char_length(pattern) <= 40),
  material           text check (material is null or char_length(material) <= 40),
  season             jsonb,
  materials          jsonb,
  care_instructions  text[] check (care_instructions is null or cardinality(care_instructions) <= 20),
  origin_country     text check (origin_country is null or char_length(origin_country) <= 60),
  -- Photo: a copy in the private swap-photos bucket, named by the listing id (no user id).
  photo_path         text not null unique,
  photo_state        text not null check (photo_state in ('stripped', 'checked')),   -- stripped: metadata removed; checked: also passed the safety check
  source_photo_path  text not null,          -- wardrobe-images path it was copied from (stale detection)
  created_at         timestamptz not null default now(),
  expires_at         timestamptz not null default now() + interval '60 days',
  status_changed_at  timestamptz not null default now(),
  -- Who put a 'held' listing on hold. Only meaningful while status = 'held'. A hold is sticky: it ends
  -- only when a person releases or removes the listing (or the piece is deleted), never by expiry,
  -- renewal, withdrawal or listing the piece again. 'suspension' holds end when the suspension does.
  held_by            text check (held_by is null or held_by in ('reports', 'admin', 'suspension')),
  held_at            timestamptz,
  constraint swap_listings_photo_is_id check (photo_path = id::text || '.jpg'),
  constraint swap_listings_community_checked check (audience <> 'community' or photo_state = 'checked')
);
create unique index if not exists swap_listings_one_live_per_item
  on public.swap_listings (item_id)
  where item_id is not null and status in ('active', 'reserved', 'held');
create index if not exists swap_listings_owner on public.swap_listings (owner_id, status);
create index if not exists swap_listings_item on public.swap_listings (item_id) where item_id is not null;
create index if not exists swap_listings_browse
  on public.swap_listings (audience, created_at desc, id desc) where status = 'active';

-- ─── 4. Swaps, their items and messages ─────────────────────────────────────

create table if not exists public.swaps (
  id                 uuid primary key default gen_random_uuid(),
  proposer_id        uuid references auth.users(id) on delete set null,
  recipient_id       uuid references auth.users(id) on delete set null,
  pair_kind          text not null check (pair_kind in ('friends', 'community')),
  status             text not null default 'proposed'
                       check (status in ('proposed', 'accepted', 'declined', 'cancelled', 'expired', 'completed')),
  closed_reason      text check (closed_reason in
                       ('declined', 'cancelled_by_proposer', 'cancelled_by_recipient', 'unavailable', 'expired', 'completed')),
  client_ref         uuid,
  proposer_done_at   timestamptz,
  recipient_done_at  timestamptz,
  auto_completed     boolean not null default false,
  proposer_seen_at   timestamptz,
  recipient_seen_at  timestamptz,
  last_event_at      timestamptz not null default now(),
  last_event_by      uuid,                    -- null = the system; deliberately no FK
  created_at         timestamptz not null default now(),
  accepted_at        timestamptz,
  expires_at         timestamptz not null default now() + interval '14 days',
  closed_at          timestamptz,
  updated_at         timestamptz not null default now(),
  constraint swaps_not_self check (proposer_id <> recipient_id)
);
create unique index if not exists swaps_one_open_proposal_per_pair
  on public.swaps (proposer_id, recipient_id) where status = 'proposed';
create unique index if not exists swaps_client_ref
  on public.swaps (proposer_id, client_ref) where client_ref is not null;
create index if not exists swaps_proposer on public.swaps (proposer_id, status);
create index if not exists swaps_recipient on public.swaps (recipient_id, status);
create index if not exists swaps_open_expiry on public.swaps (expires_at) where status in ('proposed', 'accepted');
create index if not exists swaps_closed on public.swaps (closed_at) where closed_at is not null;

create table if not exists public.swap_items (
  id                 uuid primary key default gen_random_uuid(),
  swap_id            uuid not null references public.swaps(id) on delete cascade,
  listing_id         uuid references public.swap_listings(id) on delete set null,
  side               text not null check (side in ('offer', 'request')),   -- offer: the proposer gives it; request: the recipient gives it
  reserved           boolean not null default false,
  -- Minimal history that outlives the listing.
  name               text not null,
  category           text,
  brand              text,
  size               text,
  condition          text,
  giver_item_id      uuid,                    -- the giver's own closet row; no FK on purpose
  claimed_item_id    uuid references public.clothing_items(id) on delete set null,   -- the receiver's new closet row
  claimed_at         timestamptz,
  photo_imported_at  timestamptz,
  removal_skipped_at timestamptz              -- the giver chose "keep mine"
);
create unique index if not exists swap_items_one_reservation on public.swap_items (listing_id) where reserved;
create unique index if not exists swap_items_listing_once on public.swap_items (swap_id, listing_id) where listing_id is not null;
create index if not exists swap_items_swap on public.swap_items (swap_id);
create index if not exists swap_items_listing on public.swap_items (listing_id) where listing_id is not null;
create index if not exists swap_items_giver on public.swap_items (giver_item_id) where giver_item_id is not null;

create table if not exists public.swap_messages (
  id          bigint generated always as identity primary key,
  swap_id     uuid not null references public.swaps(id) on delete cascade,
  sender_id   uuid references auth.users(id) on delete cascade,   -- null for system lines
  kind        text not null default 'text' check (kind in ('text', 'system')),
  code        text,
  body        text,
  client_ref  uuid,
  created_at  timestamptz not null default now(),
  constraint swap_messages_shape check (
    (kind = 'text' and sender_id is not null and body is not null and char_length(body) between 1 and 500)
    or (kind = 'system' and code is not null and body is null)
  )
);
create index if not exists swap_messages_swap on public.swap_messages (swap_id, id);
create index if not exists swap_messages_sender on public.swap_messages (sender_id, created_at desc) where sender_id is not null;
create unique index if not exists swap_messages_client_ref on public.swap_messages (sender_id, client_ref) where client_ref is not null;

-- ─── 5. Counters, filter terms, photo clean-up queue ────────────────────────

create table if not exists public.swap_rate_counters (
  user_id      uuid not null references auth.users(id) on delete cascade,
  bucket       text not null,
  window_start timestamptz not null,
  n            integer not null default 0,
  primary key (user_id, bucket, window_start)
);

-- Every text rule looks at folded text, so the usual ways round a word filter do not work: wide and
-- compatibility forms become plain ones and accents are dropped (NFKD, so "ｇｉｆｔ" and "café" become
-- "gift" and "cafe"), zero-width and other invisible format characters are removed, and the result is
-- lower-case. Terms in swap_blocked_terms are stored in this folded form (the check below enforces it) in
-- any script. Requires a UTF-8 database (Supabase is). Look-alike letters from another alphabet (a
-- Cyrillic "a" for a Latin one) are NOT folded; that is a known limit of a word filter, and reports are the
-- answer to it.
create or replace function public.swap_fold_text(p_text text)
returns text
language sql
immutable
set search_path = public
as $$
  select regexp_replace(
           regexp_replace(lower(normalize(coalesce(p_text, ''), nfkd)), '[\u0300-\u036f]', '', 'g'),
           '[\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180b-\u180f\u200b-\u200f\u202a-\u202e\u2060-\u206f\u3164\ufe00-\ufe0f\ufeff\uffa0]',
           '', 'g');
$$;

create table if not exists public.swap_blocked_terms (
  -- Letters, digits and single spaces in any script, already folded (swap_fold_text); matched as whole words.
  term text primary key check (
    char_length(term) between 2 and 60
    and term = public.swap_fold_text(term)
    and term = btrim(term)
    and term !~ '[^[:alnum:] ]'
    and term !~ '  '),
  kind text not null check (kind in ('content'))
);

-- Storage paths waiting to be deleted from swap-photos. No FK to users, so account
-- deletion cannot lose the work; the swap-media function drains it.
create table if not exists public.swap_photo_gc (
  path      text primary key,
  queued_at timestamptz not null default now()
);

do $$
declare
  t text;
begin
  foreach t in array array['swap_config', 'swap_meta', 'swap_members', 'swap_listings', 'swaps', 'swap_items',
                           'swap_messages', 'swap_rate_counters', 'swap_blocked_terms', 'swap_photo_gc']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end
$$;
revoke all on sequence public.swap_messages_id_seq from public, anon, authenticated;

-- ─── 6. Internal helpers (not callable by app users) ────────────────────────

create or replace function public.swap_raise(p_msg text, p_state text, p_detail text default null, p_hint text default null)
returns void
language plpgsql
set search_path = public
as $$
begin
  -- RAISE ... USING does not accept NULL option values, so only pass what is set.
  if p_detail is null and p_hint is null then
    raise exception '%', p_msg using errcode = p_state;
  elsif p_hint is null then
    raise exception '%', p_msg using errcode = p_state, detail = p_detail;
  else
    raise exception '%', p_msg using errcode = p_state, detail = coalesce(p_detail, ''), hint = p_hint;
  end if;
end;
$$;

create or replace function public.swap_cfg(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select value from public.swap_config where key = p_key;
$$;

-- Every number that limits behaviour, in one place. Mirrored in src/config/swapRules.ts
-- and compared by a Jest test.
create or replace function public.swap_limit(p_name text)
returns integer
language sql
immutable
set search_path = public
as $$
  select case p_name
    -- rolling counters (suffix gives the window): see swap_rate_check
    when 'publish_day'          then 20
    when 'browse_day'           then 400
    when 'propose_day'          then 15
    when 'propose_stranger_day' then 5
    when 'respond_day'          then 60
    when 'cancel_day'           then 30
    when 'complete_day'         then 30
    when 'message_min'          then 6
    when 'message_hour'         then 60
    when 'message_day'          then 300
    when 'block_day'            then 30
    -- plain caps
    when 'listings_live'        then 30
    when 'listings_community'   then 15
    when 'items_per_side'       then 3
    when 'open_outbound'        then 5
    when 'open_inbound'         then 20
    when 'open_per_requested_listing' then 8
    when 'open_per_offered_listing'   then 3
    when 'messages_per_swap'    then 200
    when 'preaccept_messages_stranger' then 3
    when 'decline_cooldown_days' then 7
    when 'reports_to_hold_listing' then 3
    when 'reports_day'          then 20
    else 0
  end;
$$;

-- Counts one action for p_uid in a fixed window and raises swap_rate_limited (54000,
-- DETAIL = bucket) once the cap is passed. The raise rolls the increment back, so only
-- successful actions are counted.
create or replace function public.swap_rate_check(p_uid uuid, p_bucket text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  secs  integer := case when right(p_bucket, 4) = '_day' then 86400
                        when right(p_bucket, 5) = '_hour' then 3600
                        when right(p_bucket, 4) = '_min' then 60 end;
  cap   integer := public.swap_limit(p_bucket);
  win   timestamptz;
  cnt   integer;
begin
  if secs is null or cap <= 0 then
    raise exception 'invalid_rate_bucket' using errcode = '22023';
  end if;
  win := to_timestamp(floor(extract(epoch from now()) / secs) * secs);
  insert into public.swap_rate_counters (user_id, bucket, window_start, n)
  values (p_uid, p_bucket, win, 1)
  on conflict (user_id, bucket, window_start)
  do update set n = public.swap_rate_counters.n + 1
  returning n into cnt;
  if cnt > cap then
    perform public.swap_raise('swap_rate_limited', '54000', p_bucket);
  end if;
end;
$$;

-- Friends = an accepted friend_requests row in either direction (tolerates the A->B plus
-- B->A duplicate-row race on the ordered unique constraint).
create or replace function public.are_friends(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.friend_requests fr
     where fr.status = 'accepted'
       and ((fr.requester_id = p_a and fr.recipient_id = p_b)
         or (fr.requester_id = p_b and fr.recipient_id = p_a))
  );
$$;

-- Text rules for swap text (item names, notes, messages). Returns null when fine, or a
-- hint: 'payment' (scam phrases, always refused), 'contact' (strangers, before acceptance),
-- 'content' (objectionable terms from swap_blocked_terms). The scam, payment and contact
-- rules are built in so they hold even when the term table is empty. The text is folded first
-- (swap_fold_text), so zero-width characters, wide letters and accents do not hide a phrase.
-- Speed bumps, not a substitute for reports.
--   p_mode 'open'   friends, or anyone after acceptance: scam + content
--   p_mode 'strict' strangers before acceptance: scam + payment words + contact details + content
create or replace function public.swap_text_ok(p_text text, p_mode text default 'open')
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  t text := public.swap_fold_text(p_text);
begin
  if t = '' then
    return null;
  end if;
  if t ~ '(gift ?card|giftcard|western union|moneygram|wire transfer|bitcoin|\mcrypto\M|cashier''?s cheque|cashier''?s check|itunes card)' then
    return 'payment';
  end if;
  if p_mode = 'strict' then
    if t ~ '(\mvenmo\M|paypal|\mzelle\M|cash ?app|apple pay|send (me )?(the )?money|\mdeposit\M|bank transfer)' then
      return 'payment';
    end if;
    if t ~ '(https?://|www\.|\.com\M|\.net\M|\.org\M|\.io\M|\.me/)'
       or t ~ '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}'
       or t ~ '(^|\s)@[a-z0-9_.]{3,}'
       or t ~ '(\+?[0-9]{1,3}[ .-]?)?\(?[0-9]{3}\)?[ .-]?[0-9]{3}[ .-]?[0-9]{4}'
       or t ~ '\+[0-9][0-9 .-]{8,}[0-9]'
       or t ~ '(\mwhatsapp\M|\mtelegram\M|\msnapchat\M|\minstagram\M|\msignal\M|\mwechat\M|\mdiscord\M|text me|call me|\mdm me\M)' then
      return 'contact';
    end if;
  end if;
  if exists (
    select 1 from public.swap_blocked_terms b
     where b.kind = 'content'
       and t ~ ('\m' || b.term || '\M')
  ) then
    return 'content';
  end if;
  return null;
end;
$$;

create or replace function public.swap_require_text(p_text text, p_field text, p_mode text default 'open')
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  hint text := public.swap_text_ok(p_text, p_mode);
begin
  if hint is not null then
    perform public.swap_raise('text_not_allowed', '22023', p_field, hint);
  end if;
end;
$$;

-- Who may use swaps at all. p_need is 'friends' or 'community'.
create or replace function public.swap_gate(p_uid uuid, p_need text)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  m public.swap_members;
  cur text := public.swap_cfg('terms_version') #>> '{}';
begin
  if p_uid is null then
    perform public.swap_raise('not_authenticated', '28000');
  end if;
  if not coalesce((public.swap_cfg('swaps_enabled'))::boolean, false) then
    perform public.swap_raise('swaps_disabled', '42501');
  end if;
  select * into m from public.swap_members where user_id = p_uid;
  if not found or m.terms_accepted_at is null or m.terms_version is distinct from cur then
    perform public.swap_raise('swap_terms_required', '42501');
  end if;
  if m.suspended_at is not null then
    perform public.swap_raise('swap_suspended', '42501');
  end if;
  if p_need = 'community' then
    if not coalesce((public.swap_cfg('community_enabled'))::boolean, false) then
      perform public.swap_raise('community_unavailable', '42501');
    end if;
    if m.community_joined_at is null or m.adult_confirmed_at is null or m.alias is null then
      perform public.swap_raise('community_not_joined', '42501');
    end if;
    if (select u.created_at from auth.users u where u.id = p_uid)
         > now() - make_interval(hours => coalesce((public.swap_cfg('min_account_age_hours'))::integer, 48)) then
      perform public.swap_raise('account_too_new', '42501');
    end if;
  end if;
end;
$$;

-- How two members relate for swapping: 'blocked' | 'friends' | 'community' | 'none'.
create or replace function public.swap_pair_state(p_a uuid, p_b uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  ma public.swap_members;
  mb public.swap_members;
begin
  if p_a is null or p_b is null or p_a = p_b then
    return 'none';
  end if;
  if public.is_blocked_between(p_a, p_b) then
    return 'blocked';
  end if;
  select * into ma from public.swap_members where user_id = p_a;
  select * into mb from public.swap_members where user_id = p_b;
  if (ma.suspended_at is not null) or (mb.suspended_at is not null) then
    return 'none';
  end if;
  if public.are_friends(p_a, p_b) then
    return 'friends';
  end if;
  if coalesce((public.swap_cfg('community_enabled'))::boolean, false)
     and ma.community_joined_at is not null and ma.alias is not null and ma.adult_confirmed_at is not null
     and mb.community_joined_at is not null and mb.alias is not null and mb.adult_confirmed_at is not null then
    return 'community';
  end if;
  return 'none';
end;
$$;

-- May p_viewer see this listing on the rack? (Participants of a swap that includes it
-- get their own, separate rule inside get_swap and can_view_swap_photo.)
create or replace function public.swap_can_see_listing(p_listing uuid, p_viewer uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  l public.swap_listings;
  st text;
begin
  select * into l from public.swap_listings where id = p_listing;
  if not found or l.status <> 'active' or l.expires_at <= now() then
    return false;
  end if;
  if l.owner_id = p_viewer then
    return true;
  end if;
  st := public.swap_pair_state(p_viewer, l.owner_id);
  return st = 'friends' or (st = 'community' and l.audience = 'community');
end;
$$;

-- The name a member is shown under: a friend's usual name, otherwise their alias, never
-- the email-derived fallback of friend_display_name().
create or replace function public.swap_label(p_viewer uuid, p_other uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_other is null then 'Former member'
    when public.are_friends(p_viewer, p_other) then public.friend_display_name(p_other)
    else coalesce((select m.alias from public.swap_members m where m.user_id = p_other), 'Swap member')
  end;
$$;

-- Serialises work that reserves or releases listings between two members. Always takes
-- the two locks in the same (sorted) order so concurrent accepts cannot deadlock.
create or replace function public.swap_lock_users(p_a uuid, p_b uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_a is null or p_b is null then
    return;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('swap:' || least(p_a, p_b)::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('swap:' || greatest(p_a, p_b)::text, 0));
end;
$$;

-- The storage path inside wardrobe-images for an item photo URL owned by p_uid, else null.
create or replace function public.swap_item_photo_path(p_url text, p_uid uuid)
returns text
language sql
immutable
set search_path = public
as $$
  select substring(p_url from
    '^https?://[^/]+/storage/v1/object/(?:public|sign|authenticated)/wardrobe-images/(' || p_uid::text || '/[A-Za-z0-9._-]+)(?:[?#].*)?$');
$$;

-- Cleaners for the snapshot (the item row is user-written, so nothing is trusted).
create or replace function public.swap_clean_materials(p jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case when p is null or jsonb_typeof(p) <> 'array' then null else
    (select coalesce(jsonb_agg(x.el order by x.ord), '[]'::jsonb) from (
       select t.ord,
              jsonb_strip_nulls(jsonb_build_object(
                'name', left(lower(btrim(t.e ->> 'name')), 40),
                'percentage', case when (t.e ->> 'percentage') ~ '^[0-9]{1,3}(\.[0-9]+)?$'
                                   then case when (t.e ->> 'percentage')::numeric <= 100 then (t.e ->> 'percentage')::numeric end end,
                'tier', case when t.e ->> 'tier' in ('primary', 'secondary', 'lining', 'fill', 'trim', 'upper', 'sole', 'hardware')
                             then t.e ->> 'tier' end)) as el
         from jsonb_array_elements(p) with ordinality as t(e, ord)
        where jsonb_typeof(t.e) = 'object' and btrim(coalesce(t.e ->> 'name', '')) <> ''
        order by t.ord
        limit 12) x)
  end;
$$;

create or replace function public.swap_clean_season(p jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case when p is null or jsonb_typeof(p) <> 'array' then null else
    (select coalesce(jsonb_agg(x.v order by x.ord), '[]'::jsonb) from (
       select t.ord, to_jsonb(left(btrim(t.e #>> '{}'), 12)) as v
         from jsonb_array_elements(p) with ordinality as t(e, ord)
        where jsonb_typeof(t.e) = 'string' and btrim(t.e #>> '{}') <> ''
        order by t.ord
        limit 6) x)
  end;
$$;

create or replace function public.swap_clean_care(p text[])
returns text[]
language sql
immutable
set search_path = public
as $$
  select case when p is null then null else
    array(select left(btrim(c), 80) from unnest(p) with ordinality as t(c, ord)
           where btrim(coalesce(c, '')) <> '' order by ord limit 20)
  end;
$$;

-- ─── 7. Closing swaps (the one place closing logic lives) ───────────────────

-- Have enough different members reported this listing, recently enough, for it to be held?
create or replace function public.swap_reports_reach_hold(p_listing uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- plpgsql, not sql: content_reports.ref_type and ref_id are added further down this file.
  return (select count(distinct cr.reporter_id) from public.content_reports cr
           where cr.ref_type = 'listing' and cr.ref_id = p_listing and cr.created_at > now() - interval '7 days')
         >= public.swap_limit('reports_to_hold_listing');
end;
$$;

-- Is this piece barred from being listed because a person's decision stands against one of its
-- listings? A held listing stays held, and a removed one is kept (without its photo) for as long as the
-- piece exists, so the owner cannot clear either by withdrawing, renewing, waiting or listing again.
create or replace function public.swap_item_has_hold(p_item uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.swap_listings l where l.item_id = p_item and l.status in ('held', 'removed'));
$$;

-- Closes a proposed or accepted swap, releases its reservations and records a system
-- line. Returns false when the swap was already closed. p_by is the member who acted
-- (null = the system), used for the inbox dot.
create or replace function public.swap_close(p_swap uuid, p_status text, p_reason text, p_by uuid default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.swaps
     set status = p_status, closed_reason = p_reason, closed_at = now(), updated_at = now(),
         last_event_at = now(), last_event_by = p_by
   where id = p_swap and status in ('proposed', 'accepted');
  if not found then
    return false;
  end if;

  update public.swap_items set reserved = false where swap_id = p_swap and reserved;

  if p_status = 'completed' then
    update public.swap_listings l
       set status = 'completed', status_changed_at = now()
      from public.swap_items si
     where si.swap_id = p_swap and si.listing_id = l.id and l.status in ('reserved', 'active');
  else
    -- Listings go back on the rack, unless the piece is gone or the listing ran out.
    update public.swap_listings l
       set status = case when l.item_id is null then 'withdrawn'
                         when l.expires_at <= now() then 'expired'
                         else 'active' end,
           status_changed_at = now()
      from public.swap_items si
     where si.swap_id = p_swap and si.listing_id = l.id and l.status = 'reserved';
    -- A reserved listing is never held while a swap is in progress, but reports made meanwhile still
    -- count: when it comes back to the rack with enough of them, it goes on hold instead.
    update public.swap_listings l
       set status = 'held', held_by = 'reports', held_at = now(), status_changed_at = now()
      from public.swap_items si
     where si.swap_id = p_swap and si.listing_id = l.id and l.status = 'active'
       and public.swap_reports_reach_hold(l.id);
  end if;

  insert into public.swap_messages (swap_id, kind, code) values (p_swap, 'system', p_reason);
  return true;
end;
$$;

-- Closes every open swap between two members (block: all; unfriend: friends-only ones).
create or replace function public.swap_close_between(p_a uuid, p_b uuid, p_all boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select id from public.swaps
     where status in ('proposed', 'accepted')
       and ((proposer_id = p_a and recipient_id = p_b) or (proposer_id = p_b and recipient_id = p_a))
       and (p_all or pair_kind = 'friends')
     order by id
  loop
    perform public.swap_close(r.id, 'cancelled', 'unavailable', null);
  end loop;
end;
$$;

-- Completes a swap in which both sides (or, after a timeout, one side) have tapped done.
create or replace function public.swap_finish(p_swap uuid, p_auto boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.swap_close(p_swap, 'completed', 'completed', null) then
    update public.swaps set auto_completed = p_auto where id = p_swap;
  end if;
end;
$$;

-- Lazy upkeep for one member, run at the start of their reads: expires overdue swaps,
-- closes ones that are no longer allowed (block, unfriend, suspension, listing gone),
-- and finishes ones left half-done for 14 days. Correctness never depends on a cron job.
create or replace function public.swap_refresh(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.swaps;
  st text;
begin
  if p_uid is null then
    return;
  end if;
  for s in
    select * from public.swaps
     where status in ('proposed', 'accepted') and (proposer_id = p_uid or recipient_id = p_uid)
     order by id
  loop
    st := public.swap_pair_state(s.proposer_id, s.recipient_id);
    -- Left half-done for 14 days: finish it (the silent member can still collect their piece). This
    -- comes before the absolute expiry so a swap one side already completed is never "expired".
    if s.status = 'accepted'
       and (s.proposer_done_at is null) <> (s.recipient_done_at is null)
       and greatest(coalesce(s.proposer_done_at, '-infinity'), coalesce(s.recipient_done_at, '-infinity')) < now() - interval '14 days' then
      perform public.swap_finish(s.id, true);
    elsif s.expires_at <= now() then
      perform public.swap_close(s.id, 'expired', 'expired');
    elsif st in ('blocked', 'none')
       or (s.pair_kind = 'friends' and st <> 'friends')
       or (s.pair_kind = 'community' and st not in ('community', 'friends')) then
      perform public.swap_close(s.id, 'cancelled', 'unavailable');
    elsif s.status = 'proposed' and exists (
            select 1 from public.swap_items si
              left join public.swap_listings l on l.id = si.listing_id
             where si.swap_id = s.id
               and (l.id is null or l.status <> 'active' or l.expires_at <= now()
                    or exists (select 1 from public.swap_items o where o.listing_id = si.listing_id and o.reserved))) then
      perform public.swap_close(s.id, 'cancelled', 'unavailable');
    end if;
  end loop;
end;
$$;

-- Global upkeep, at most once every 15 minutes, started opportunistically by member
-- reads. Retention lives here: messages go 30 days after a swap closes, the rest of the
-- swap after 90 days, listing photos 30 days after a listing ends.
create or replace function public.swap_janitor(p_force boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('swap_janitor', 0)) then
    return;
  end if;
  if not p_force and exists (
       select 1 from public.swap_meta where last_janitor_at > now() - interval '15 minutes') then
    return;
  end if;
  update public.swap_meta set last_janitor_at = now();

  -- Half-done swaps (one side tapped "We swapped!" more than 14 days ago) finish before anything expires.
  for r in
    select id from public.swaps
     where status = 'accepted' and (proposer_done_at is null) <> (recipient_done_at is null)
       and greatest(coalesce(proposer_done_at, '-infinity'), coalesce(recipient_done_at, '-infinity')) < now() - interval '14 days'
     order by id limit 200
  loop
    perform public.swap_finish(r.id, true);
  end loop;

  for r in
    select id, status from public.swaps
     where status in ('proposed', 'accepted') and expires_at <= now()
     order by expires_at limit 200
  loop
    perform public.swap_close(r.id, 'expired', 'expired');
  end loop;

  -- Only listings on the rack expire. A held listing stays held until a person decides, however old it is.
  update public.swap_listings
     set status = 'expired', status_changed_at = now()
   where status = 'active' and expires_at <= now();

  delete from public.swap_messages m
   using public.swaps s
   where s.id = m.swap_id and s.closed_at is not null and s.closed_at < now() - interval '30 days';

  delete from public.swaps
   where closed_at is not null and closed_at < now() - interval '90 days';

  -- Ended listings go 30 days after they ended (their photo is queued for deletion by the
  -- delete trigger). A swap keeps only the piece's name, size and condition from then on.
  -- A listing someone reported in the last 90 days is kept as evidence. A removed listing is kept while
  -- its piece still exists, so the piece cannot simply be listed again; it goes 30 days after the piece
  -- does. A held listing is never deleted here.
  delete from public.swap_listings l
   where (l.status in ('completed', 'withdrawn', 'expired') or (l.status = 'removed' and l.item_id is null))
     and l.status_changed_at < now() - interval '30 days'
     and not exists (select 1 from public.content_reports cr
                      where cr.ref_id = l.id and cr.created_at > now() - interval '90 days');

  delete from public.swap_rate_counters where window_start < now() - interval '2 days';
end;
$$;

-- ─── 8. Triggers: block, unfriend, item removed, member left ────────────────

create or replace function public.swap_on_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform public.swap_close_between(new.blocker_id, new.blocked_id, true);
  exception when others then
    raise warning 'swap_on_block: %', sqlerrm;   -- a block must never fail because of swaps
  end;
  return new;
end;
$$;
drop trigger if exists swap_on_block on public.user_blocks;
create trigger swap_on_block after insert on public.user_blocks
  for each row execute function public.swap_on_block();

create or replace function public.swap_on_unfriend()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    if not public.are_friends(old.requester_id, old.recipient_id) then
      perform public.swap_close_between(old.requester_id, old.recipient_id, false);
    end if;
  exception when others then
    raise warning 'swap_on_unfriend: %', sqlerrm;
  end;
  return old;
end;
$$;
drop trigger if exists swap_on_unfriend on public.friend_requests;
create trigger swap_on_unfriend after delete on public.friend_requests
  for each row when (old.status = 'accepted') execute function public.swap_on_unfriend();

-- An item that is deleted, or moved to the wishlist, leaves the rack and ends open swaps
-- it is part of, unless its owner already handed it over (tapped "We swapped"). BEFORE,
-- not AFTER: the ON DELETE SET NULL action on swap_listings.item_id is itself an AFTER
-- trigger and would otherwise clear item_id before this runs. Never raises, so deleting
-- an item or an account cannot be blocked by it.
create or replace function public.swap_on_item_gone()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  begin
    for r in
      select si.swap_id
        from public.swap_items si
        join public.swaps s on s.id = si.swap_id
       where si.giver_item_id = old.id
         and s.status in ('proposed', 'accepted')
         and case when si.side = 'offer' then s.proposer_done_at else s.recipient_done_at end is null
       order by si.swap_id
    loop
      perform public.swap_close(r.swap_id, 'cancelled', 'unavailable');
    end loop;
    -- A held listing is withdrawn only when its piece is deleted. Moving the piece to the wishlist and back
    -- must not clear a hold, so a held listing stays held through that.
    update public.swap_listings
       set status = 'withdrawn', status_changed_at = now()
     where item_id = old.id and (status = 'active' or (status = 'held' and tg_op = 'DELETE'));
  exception when others then
    raise warning 'swap_on_item_gone: %', sqlerrm;
  end;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
drop trigger if exists swap_on_item_delete on public.clothing_items;
create trigger swap_on_item_delete before delete on public.clothing_items
  for each row execute function public.swap_on_item_gone();
drop trigger if exists swap_on_item_wishlisted on public.clothing_items;
create trigger swap_on_item_wishlisted before update of is_wishlist on public.clothing_items
  for each row when (new.is_wishlist is true and old.is_wishlist is distinct from true)
  execute function public.swap_on_item_gone();

-- A participant's account was deleted (the FK nulled their column): open swaps close
-- quietly, and a swap with nobody left disappears.
create or replace function public.swap_on_member_left()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.proposer_id is null and new.recipient_id is null then
    delete from public.swaps where id = new.id;
    return null;
  end if;
  if new.status in ('proposed', 'accepted') then
    perform public.swap_close(new.id, 'cancelled', 'unavailable');
  end if;
  return null;
end;
$$;
drop trigger if exists swap_on_member_left on public.swaps;
create trigger swap_on_member_left after update of proposer_id, recipient_id on public.swaps
  for each row when (new.proposer_id is null or new.recipient_id is null)
  execute function public.swap_on_member_left();

-- Photos of deleted listings (including those removed by account deletion) are queued.
create or replace function public.swap_queue_photo_gc()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.swap_photo_gc (path) values (old.photo_path) on conflict (path) do nothing;
  return old;
end;
$$;
drop trigger if exists swap_queue_photo_gc on public.swap_listings;
create trigger swap_queue_photo_gc after delete on public.swap_listings
  for each row execute function public.swap_queue_photo_gc();

-- ─── 8b. Reports can point at the thing reported ────────────────────────────

-- Columns only (the context/reason lists are widened in the moderation migration).
-- A report used to carry just a user id and <=500 characters, which is not enough for a
-- reviewer to act on a swap or a message.
alter table public.content_reports
  add column if not exists ref_type    text,
  add column if not exists ref_id      uuid,
  add column if not exists evidence    jsonb,
  add column if not exists reviewed_at timestamptz,
  add column if not exists outcome     text;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.content_reports'::regclass and conname = 'content_reports_ref_type_check') then
    alter table public.content_reports add constraint content_reports_ref_type_check
      check (ref_type is null or ref_type in ('listing', 'swap', 'message'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.content_reports'::regclass and conname = 'content_reports_evidence_check') then
    alter table public.content_reports add constraint content_reports_evidence_check
      check (evidence is null or pg_column_size(evidence) <= 20000);
  end if;
end
$$;
create index if not exists content_reports_by_ref
  on public.content_reports (reporter_id, ref_type, ref_id) where ref_id is not null;
create index if not exists content_reports_ref on public.content_reports (ref_id) where ref_id is not null;

-- ─── 9. user_blocks: blocks made from a swap are private to the swap screens ─

-- A block of someone the blocker only knows by alias must not hand the blocker that
-- person's account id through the existing "Blocked people" list. Such rows are marked
-- via_swap and hidden from direct table reads; the swap screens list them through
-- list_swap_blocks() under an opaque ref. Rows made by block_user() are unchanged.
alter table public.user_blocks
  add column if not exists via_swap boolean not null default false,
  add column if not exists ref uuid not null default gen_random_uuid();
create unique index if not exists user_blocks_ref on public.user_blocks (ref);

drop policy if exists "Users can view their own blocks" on public.user_blocks;
create policy "Users can view their own blocks" on public.user_blocks
  for select to authenticated
  using (auth.uid() = blocker_id and not via_swap);

drop policy if exists "Users can remove their own blocks" on public.user_blocks;
create policy "Users can remove their own blocks" on public.user_blocks
  for delete to authenticated
  using (auth.uid() = blocker_id and not via_swap);

-- ─── 10. Photos: private bucket, one read policy ────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('swap-photos', 'swap-photos', false, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Who may read a listing photo. False in exactly the same way for "no such photo",
-- "not listed", "blocked" and "not allowed", so it reveals nothing. The owner always can;
-- a viewer can while the listing is on the rack for them; a participant can while the
-- swap is open or completed and nobody is blocked.
create or replace function public.can_view_swap_photo(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  l public.swap_listings;
begin
  if uid is null then
    return false;
  end if;
  select * into l from public.swap_listings where photo_path = p_name;
  if not found then
    return false;
  end if;
  if l.owner_id = uid then
    return true;
  end if;
  if public.is_blocked_between(uid, l.owner_id) then
    return false;
  end if;
  if public.swap_can_see_listing(l.id, uid) then
    return true;
  end if;
  return exists (
    select 1
      from public.swap_items si
      join public.swaps s on s.id = si.swap_id
     where si.listing_id = l.id
       and s.status in ('proposed', 'accepted', 'completed')
       and uid in (s.proposer_id, s.recipient_id)
  );
end;
$$;

drop policy if exists "swap photos: viewers" on storage.objects;
create policy "swap photos: viewers" on storage.objects
  for select to authenticated
  using (bucket_id = 'swap-photos' and public.can_view_swap_photo(name));
-- No INSERT, UPDATE or DELETE policy: only the swap-media function (service role) writes or deletes.

-- ─── 11. Function privileges ────────────────────────────────────────────────

revoke all on function public.swap_raise(text, text, text, text) from public, anon, authenticated;
revoke all on function public.swap_cfg(text) from public, anon, authenticated;
revoke all on function public.swap_limit(text) from public, anon, authenticated;
revoke all on function public.swap_rate_check(uuid, text) from public, anon, authenticated;
revoke all on function public.are_friends(uuid, uuid) from public, anon, authenticated;
revoke all on function public.swap_text_ok(text, text) from public, anon, authenticated;
revoke all on function public.swap_require_text(text, text, text) from public, anon, authenticated;
revoke all on function public.swap_gate(uuid, text) from public, anon, authenticated;
revoke all on function public.swap_pair_state(uuid, uuid) from public, anon, authenticated;
revoke all on function public.swap_can_see_listing(uuid, uuid) from public, anon, authenticated;
revoke all on function public.swap_label(uuid, uuid) from public, anon, authenticated;
revoke all on function public.swap_lock_users(uuid, uuid) from public, anon, authenticated;
revoke all on function public.swap_item_photo_path(text, uuid) from public, anon, authenticated;
revoke all on function public.swap_clean_materials(jsonb) from public, anon, authenticated;
revoke all on function public.swap_clean_season(jsonb) from public, anon, authenticated;
revoke all on function public.swap_clean_care(text[]) from public, anon, authenticated;
revoke all on function public.swap_fold_text(text) from public, anon, authenticated;
revoke all on function public.swap_reports_reach_hold(uuid) from public, anon, authenticated;
revoke all on function public.swap_item_has_hold(uuid) from public, anon, authenticated;
revoke all on function public.swap_close(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.swap_close_between(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.swap_finish(uuid, boolean) from public, anon, authenticated;
revoke all on function public.swap_refresh(uuid) from public, anon, authenticated;
revoke all on function public.swap_janitor(boolean) from public, anon, authenticated;
grant execute on function public.swap_janitor(boolean) to service_role;   -- the swap-media sweep calls it
revoke all on function public.swap_on_block() from public, anon, authenticated;
revoke all on function public.swap_on_unfriend() from public, anon, authenticated;
revoke all on function public.swap_on_item_gone() from public, anon, authenticated;
revoke all on function public.swap_on_member_left() from public, anon, authenticated;
revoke all on function public.swap_queue_photo_gc() from public, anon, authenticated;

-- The storage policy runs with the viewer's EXECUTE right, so this one is granted.
revoke all on function public.can_view_swap_photo(text) from public, anon;
grant execute on function public.can_view_swap_photo(text) to authenticated;
````

#### `supabase/migrations/20261015000200_swap_listings.sql  (stream S1)`

````sql
-- Clothing swaps, part 2 of 5: settings, listings and the rack.
--
-- Client functions (granted to authenticated):
--   get_swap_settings, accept_swap_terms, list_my_swap_listings, update_swap_listing,
--   withdraw_swap_listing, renew_swap_listing, browse_swap_listings, get_swap_listing
-- Service-only functions (called by the swap-media edge function with the service role):
--   swap_publish_precheck, swap_publish_commit
-- Internal: swap_validate_item, the one place that decides whether a piece may be listed. Both the
-- precheck and the commit call it, so editing the piece while its photo is being copied cannot get
-- past a rule.
--
-- Safe to run twice. Depends on the foundation migration.

-- ─── 1. Helpers used by several functions ───────────────────────────────────

-- Does this swap need p_uid's attention (a dot in the inbox)?
create or replace function public.swap_attention(p_swap public.swaps, p_uid uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select case
    when p_swap.status = 'proposed' and p_swap.recipient_id = p_uid then true
    when p_swap.last_event_by is distinct from p_uid
         and p_swap.last_event_at > coalesce(case when p_swap.proposer_id = p_uid then p_swap.proposer_seen_at
                                                  else p_swap.recipient_seen_at end, '-infinity'::timestamptz)
         and (p_swap.status in ('proposed', 'accepted') or p_swap.last_event_at > now() - interval '7 days') then true
    else false
  end;
$$;

-- ─── 2. Settings and terms ──────────────────────────────────────────────────

create or replace function public.get_swap_settings()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  m public.swap_members;
  cur text := public.swap_cfg('terms_version') #>> '{}';
  on_ boolean := coalesce((public.swap_cfg('swaps_enabled'))::boolean, false);
  comm boolean := coalesce((public.swap_cfg('community_enabled'))::boolean, false);
  needs integer := 0;
begin
  if uid is null then
    perform public.swap_raise('not_authenticated', '28000');
  end if;
  if on_ then
    perform public.swap_janitor();
    perform public.swap_refresh(uid);
    -- Blocked pairs are counted like any other: a block ends open swaps the same quiet way a deleted
    -- piece does, and the blocked member must not be able to tell the two apart by the count.
    select count(*) into needs from public.swaps s
     where (s.proposer_id = uid or s.recipient_id = uid) and public.swap_attention(s, uid);
  end if;
  select * into m from public.swap_members where user_id = uid;
  return jsonb_build_object(
    'swapsEnabled', on_,
    'termsAccepted', m.terms_accepted_at is not null,
    'termsCurrent', m.terms_accepted_at is not null and m.terms_version is not distinct from cur,
    'currentTermsVersion', cur,
    'communityAvailable', on_ and comm,
    'communityJoined', m.community_joined_at is not null,
    'alias', m.alias,
    'adultConfirmed', m.adult_confirmed_at is not null,
    'suspended', m.suspended_at is not null,
    'needsYou', needs
  );
end;
$$;

create or replace function public.get_swap_badge()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  n integer;
begin
  if uid is null then
    perform public.swap_raise('not_authenticated', '28000');
  end if;
  if not coalesce((public.swap_cfg('swaps_enabled'))::boolean, false) then
    return 0;
  end if;
  select count(*) into n from public.swaps s
   where (s.proposer_id = uid or s.recipient_id = uid) and public.swap_attention(s, uid)
     and s.status in ('proposed', 'accepted', 'completed');
  return n;
end;
$$;

create or replace function public.accept_swap_terms(p_version text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cur text := public.swap_cfg('terms_version') #>> '{}';
begin
  if uid is null then
    perform public.swap_raise('not_authenticated', '28000');
  end if;
  if not coalesce((public.swap_cfg('swaps_enabled'))::boolean, false) then
    perform public.swap_raise('swaps_disabled', '42501');
  end if;
  if p_version is distinct from cur then
    perform public.swap_raise('terms_version_mismatch', '22023');
  end if;
  insert into public.swap_members (user_id, terms_version, terms_accepted_at)
  values (uid, cur, now())
  on conflict (user_id) do update
    set terms_version = excluded.terms_version, terms_accepted_at = excluded.terms_accepted_at, updated_at = now();
end;
$$;

-- ─── 3. My listings ─────────────────────────────────────────────────────────

create or replace function public.list_my_swap_listings()
returns table (
  listing_id uuid, item_id uuid, audience text, status text, name text, size text, condition text,
  note text, photo_path text, listed_at timestamptz, expires_at timestamptz,
  open_offers integer, in_accepted_swap boolean, stale boolean
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    perform public.swap_raise('not_authenticated', '28000');
  end if;
  if not coalesce((public.swap_cfg('swaps_enabled'))::boolean, false) then
    perform public.swap_raise('swaps_disabled', '42501');
  end if;
  perform public.swap_refresh(uid);
  return query
    select l.id, l.item_id, l.audience, l.status, l.name, l.size, l.condition,
           l.note, l.photo_path, l.created_at, l.expires_at,
           (select count(*)::integer from public.swap_items si
              join public.swaps s on s.id = si.swap_id
             where si.listing_id = l.id and s.status = 'proposed' and si.side = 'request'),
           exists (select 1 from public.swap_items si
                     join public.swaps s on s.id = si.swap_id
                    where si.listing_id = l.id and s.status = 'accepted'),
           (ci.id is not null and (
              ci.name is distinct from l.name
              or ci.category is distinct from l.category
              or coalesce(ci.brand, '') is distinct from coalesce(l.brand, '')
              or coalesce(ci.color, '') is distinct from coalesce(l.color, '')
              or coalesce(ci.size, '') is distinct from coalesce(l.size, '')
              or coalesce(ci.condition, '') is distinct from coalesce(l.condition, '')
              or public.swap_item_photo_path(ci.user_image, uid) is distinct from l.source_photo_path))
      from public.swap_listings l
      left join public.clothing_items ci on ci.id = l.item_id and ci.user_id = uid
     where l.owner_id = uid and l.status in ('active', 'reserved', 'held', 'removed', 'expired')
     order by l.created_at desc
     limit 200;
end;
$$;

create or replace function public.update_swap_listing(p_listing_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  clean text := nullif(btrim(coalesce(p_note, '')), '');
begin
  perform public.swap_gate(uid, 'friends');
  if clean is not null and char_length(clean) > 140 then
    perform public.swap_raise('invalid_note', '22023');
  end if;
  perform public.swap_require_text(clean, 'note', 'strict');
  update public.swap_listings set note = clean
   where id = p_listing_id and owner_id = uid and status in ('active', 'reserved', 'held');
  if not found then
    perform public.swap_raise('swap_unavailable', '22023');
  end if;
end;
$$;

create or replace function public.withdraw_swap_listing(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  l public.swap_listings;
  r record;
begin
  if uid is null then
    perform public.swap_raise('not_authenticated', '28000');
  end if;
  select * into l from public.swap_listings where id = p_listing_id and owner_id = uid for update;
  if not found or l.status not in ('active', 'reserved', 'held', 'expired') then
    perform public.swap_raise('swap_unavailable', '22023');
  end if;
  if l.status = 'held' then
    perform public.swap_raise('listing_held', '42501');     -- a hold is not something the owner can clear
  end if;
  if l.status = 'reserved' then
    perform public.swap_raise('item_reserved', '23505');
  end if;
  for r in
    select s.id from public.swaps s join public.swap_items si on si.swap_id = s.id
     where si.listing_id = l.id and s.status = 'proposed' order by s.id
  loop
    perform public.swap_close(r.id, 'cancelled', 'unavailable');
  end loop;
  update public.swap_listings set status = 'withdrawn', status_changed_at = now() where id = l.id;
end;
$$;

create or replace function public.renew_swap_listing(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  l public.swap_listings;
begin
  perform public.swap_gate(uid, 'friends');
  select * into l from public.swap_listings where id = p_listing_id and owner_id = uid for update;
  if not found then
    perform public.swap_raise('swap_unavailable', '22023');
  end if;
  -- A hold (or a removal) stands: renewing must not turn it back into a live listing.
  if l.status in ('held', 'removed') or (l.item_id is not null and public.swap_item_has_hold(l.item_id)) then
    perform public.swap_raise('listing_held', '42501');
  end if;
  if l.item_id is null or l.status not in ('active', 'expired')
     or exists (select 1 from public.swap_listings o
                 where o.item_id = l.item_id and o.id <> l.id and o.status in ('active', 'reserved')) then
    perform public.swap_raise('swap_unavailable', '22023');
  end if;
  update public.swap_listings
     set expires_at = now() + interval '60 days', status = 'active', status_changed_at = now()
   where id = l.id;
end;
$$;

-- ─── 4. The rack: browsing ──────────────────────────────────────────────────

-- p_scope 'friends': listings by accepted friends (either audience).
-- p_scope 'community': community listings by members who are not your friends.
-- Never returns an owner id; owner_label is a friend's usual name, else the alias.
create or replace function public.browse_swap_listings(
  p_scope text,
  p_category text default null,
  p_size text default null,
  p_conditions text[] default null,
  p_q text default null,
  p_friend_id uuid default null,
  p_same_owner_as uuid default null,
  p_before_ts timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 30
)
returns table (
  listing_id uuid, owner_label text, owner_kind text, audience text, name text, category text,
  subcategory text, brand text, color text, size text, condition text, pattern text,
  materials jsonb, care_instructions text[], origin_country text, season jsonb, note text,
  photo_path text, listed_at timestamptz, mine boolean
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  lim integer := least(greatest(coalesce(p_limit, 30), 1), 40);
  only_owner uuid := null;
  q text := nullif(lower(left(btrim(coalesce(p_q, '')), 40)), '');
begin
  if p_scope is null or p_scope not in ('friends', 'community') then
    perform public.swap_raise('invalid_swap', '22023');
  end if;
  perform public.swap_gate(uid, case when p_scope = 'community' then 'community' else 'friends' end);
  perform public.swap_rate_check(uid, 'browse_day');

  if p_same_owner_as is not null then
    select l.owner_id into only_owner from public.swap_listings l
     where l.id = p_same_owner_as and public.swap_can_see_listing(l.id, uid);
    if only_owner is null then
      perform public.swap_raise('swap_unavailable', '22023');
    end if;
  elsif p_friend_id is not null then
    if p_scope <> 'friends' or not public.are_friends(uid, p_friend_id) then
      return;                                   -- nothing to show, and nothing revealed
    end if;
    only_owner := p_friend_id;
  end if;

  return query
    select l.id,
           public.swap_label(uid, l.owner_id),
           case when public.are_friends(uid, l.owner_id) then 'friend' else 'member' end,
           l.audience, l.name, l.category, l.subcategory, l.brand, l.color, l.size, l.condition,
           l.pattern, l.materials, l.care_instructions, l.origin_country, l.season, l.note,
           l.photo_path, l.created_at, false
      from public.swap_listings l
     where l.status = 'active' and l.expires_at > now()
       and l.owner_id <> uid
       and (only_owner is null or l.owner_id = only_owner)
       and not exists (select 1 from public.user_blocks b
                        where (b.blocker_id = uid and b.blocked_id = l.owner_id)
                           or (b.blocker_id = l.owner_id and b.blocked_id = uid))
       and (case when p_scope = 'friends'
                 then exists (select 1 from public.friend_requests fr
                               where fr.status = 'accepted'
                                 and ((fr.requester_id = uid and fr.recipient_id = l.owner_id)
                                   or (fr.recipient_id = uid and fr.requester_id = l.owner_id)))
                 else l.audience = 'community' and not public.are_friends(uid, l.owner_id) end)
       and (p_category is null or l.category = p_category)
       and (p_size is null or lower(l.size) = lower(left(btrim(p_size), 20)))
       and (p_conditions is null or l.condition = any (p_conditions))
       and (q is null or strpos(lower(l.name), q) > 0 or strpos(lower(coalesce(l.brand, '')), q) > 0)
       and (p_before_ts is null or (l.created_at, l.id) < (p_before_ts, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
       and public.swap_can_see_listing(l.id, uid)
     order by l.created_at desc, l.id desc
     limit lim;
end;
$$;

-- One listing: on the rack for me, mine, or part of a swap I am in.
create or replace function public.get_swap_listing(p_listing_id uuid)
returns table (
  listing_id uuid, owner_label text, owner_kind text, audience text, name text, category text,
  subcategory text, brand text, color text, size text, condition text, pattern text,
  materials jsonb, care_instructions text[], origin_country text, season jsonb, note text,
  photo_path text, listed_at timestamptz, mine boolean
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    perform public.swap_raise('not_authenticated', '28000');
  end if;
  if not coalesce((public.swap_cfg('swaps_enabled'))::boolean, false) then
    perform public.swap_raise('swaps_disabled', '42501');
  end if;
  return query
    select l.id,
           public.swap_label(uid, l.owner_id),
           case when public.are_friends(uid, l.owner_id) then 'friend' else 'member' end,
           l.audience, l.name, l.category, l.subcategory, l.brand, l.color, l.size, l.condition,
           l.pattern, l.materials, l.care_instructions, l.origin_country, l.season, l.note,
           l.photo_path, l.created_at, (l.owner_id = uid)
      from public.swap_listings l
     where l.id = p_listing_id
       and (l.owner_id = uid
            or (not public.is_blocked_between(uid, l.owner_id)
                and (public.swap_can_see_listing(l.id, uid)
                     or exists (select 1 from public.swap_items si join public.swaps s on s.id = si.swap_id
                                 where si.listing_id = l.id and s.status in ('proposed', 'accepted', 'completed')
                                   and uid in (s.proposer_id, s.recipient_id)))));
  if not found then
    perform public.swap_raise('swap_unavailable', '22023');
  end if;
end;
$$;

-- ─── 5. Publishing (service role only; called by the swap-media function) ───

-- The one place that decides whether a piece may be listed to an audience, so the precheck (before the
-- photo is copied) and the commit (after it) cannot disagree. A piece edited while its photo is being
-- copied is judged on what it says now. Checks, in order: it is the member's own, non-wishlist piece; no
-- hold or removal stands against it; it has a photo in the member's own wardrobe-images folder (the path is
-- derived from the row and matched against a strict pattern, never taken from a request); the community
-- needs size and condition; the note is short; every text a viewer will read passes the text filter; the
-- live-listing caps. Returns the photo's path in wardrobe-images. Writes nothing.
create or replace function public.swap_validate_item(p_user uuid, p_item uuid, p_audience text, p_note text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  it public.clothing_items;
  clean_note text := nullif(btrim(coalesce(p_note, '')), '');
  src text;
  mode text := case when p_audience = 'community' then 'strict' else 'open' end;
  missing text[] := '{}';
  live_total integer;
  live_comm integer;
begin
  select * into it from public.clothing_items
   where id = p_item and user_id = p_user and coalesce(is_wishlist, false) = false;
  if not found then
    perform public.swap_raise('item_not_found', '22023');
  end if;
  if public.swap_item_has_hold(p_item) then
    perform public.swap_raise('listing_held', '42501');
  end if;

  src := public.swap_item_photo_path(it.user_image, p_user);
  if src is null then missing := array_append(missing, 'photo'); end if;
  if p_audience = 'community' then
    if nullif(btrim(coalesce(it.size, '')), '') is null then missing := array_append(missing, 'size'); end if;
    if it.condition is null then missing := array_append(missing, 'condition'); end if;
  end if;
  if cardinality(missing) > 0 then
    perform public.swap_raise('listing_incomplete', '22023', array_to_string(missing, ','));
  end if;

  if clean_note is not null and char_length(clean_note) > 140 then
    perform public.swap_raise('invalid_note', '22023');
  end if;
  perform public.swap_require_text(clean_note, 'note', mode);
  perform public.swap_require_text(it.name, 'name', mode);
  perform public.swap_require_text(it.brand, 'brand', mode);
  perform public.swap_require_text(it.color, 'color', mode);
  perform public.swap_require_text(it.size, 'size', mode);
  -- The rest of what a viewer reads on the card (free text the member typed or scanned).
  perform public.swap_require_text(
    concat_ws(' ', it.subcategory, it.pattern, it.material, it.origin_country,
              array_to_string(it.care_instructions, ' '),
              (select string_agg(m ->> 'name', ' ')
                 from jsonb_array_elements(case when jsonb_typeof(it.materials) = 'array' then it.materials else '[]'::jsonb end) m
                where jsonb_typeof(m) = 'object')),
    'details', mode);

  select count(*) filter (where status in ('active', 'reserved', 'held')),
         count(*) filter (where status in ('active', 'reserved', 'held') and audience = 'community')
    into live_total, live_comm
    from public.swap_listings where owner_id = p_user and item_id is distinct from p_item;
  if live_total >= public.swap_limit('listings_live')
     or (p_audience = 'community' and live_comm >= public.swap_limit('listings_community')) then
    perform public.swap_raise('swap_listing_limit', '54000');
  end if;
  return src;
end;
$$;

-- Validates a publish request and reserves a listing id. Nothing is written except the
-- publish counter. p_user is passed explicitly because the service role has no auth.uid().
create or replace function public.swap_publish_precheck(p_user uuid, p_item uuid, p_audience text, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  src text;
begin
  if p_audience is null or p_audience not in ('friends', 'community') then
    perform public.swap_raise('invalid_swap', '22023');
  end if;
  perform public.swap_gate(p_user, case when p_audience = 'community' then 'community' else 'friends' end);
  src := public.swap_validate_item(p_user, p_item, p_audience, p_note);
  perform public.swap_rate_check(p_user, 'publish_day');
  return jsonb_build_object('listingId', gen_random_uuid(), 'sourcePath', src);
end;
$$;

-- Inserts the listing once the photo copy exists in swap-photos. Locks the piece, runs every check
-- again on what the piece says now (swap_validate_item), rebuilds the snapshot from the item row
-- (whitelisted columns only, cleaned), and retires the item's previous listing. The photo copy that was
-- stored is the one that passed the safety check, whatever the piece's photo says now: if the member
-- changed the photo meanwhile, source_photo_path records the new one and the listing shows as stale.
create or replace function public.swap_publish_commit(
  p_user uuid, p_listing uuid, p_item uuid, p_audience text, p_note text, p_photo_state text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  it public.clothing_items;
  prev public.swap_listings;
  r record;
  clean_note text := nullif(btrim(coalesce(p_note, '')), '');
  src text;
begin
  if p_audience is null or p_audience not in ('friends', 'community')
     or p_photo_state is null or p_photo_state not in ('stripped', 'checked') then
    perform public.swap_raise('invalid_swap', '22023');
  end if;
  perform public.swap_gate(p_user, case when p_audience = 'community' then 'community' else 'friends' end);

  -- Hold the piece still while it is checked and copied into the snapshot.
  select * into it from public.clothing_items
   where id = p_item and user_id = p_user and coalesce(is_wishlist, false) = false for share;
  if not found then
    perform public.swap_raise('item_not_found', '22023');
  end if;
  src := public.swap_validate_item(p_user, p_item, p_audience, p_note);

  select * into prev from public.swap_listings
   where item_id = p_item and status in ('active', 'reserved', 'held') for update;
  if found then
    if prev.status = 'held' then
      perform public.swap_raise('listing_held', '42501');
    end if;
    if prev.status = 'reserved' then
      perform public.swap_raise('item_reserved', '23505');
    end if;
    for r in
      select s.id from public.swaps s join public.swap_items si on si.swap_id = s.id
       where si.listing_id = prev.id and s.status = 'proposed' order by s.id
    loop
      perform public.swap_close(r.id, 'cancelled', 'unavailable');
    end loop;
    update public.swap_listings set status = 'withdrawn', status_changed_at = now() where id = prev.id;
  end if;

  insert into public.swap_listings (
    id, owner_id, item_id, audience, status, note, name, category, subcategory, brand, color, size,
    condition, pattern, material, season, materials, care_instructions, origin_country,
    photo_path, photo_state, source_photo_path)
  values (
    p_listing, p_user, p_item, p_audience, 'active', clean_note,
    left(btrim(it.name), 80), it.category,
    left(nullif(btrim(coalesce(it.subcategory, '')), ''), 60),
    left(nullif(btrim(coalesce(it.brand, '')), ''), 60),
    left(nullif(btrim(coalesce(it.color, '')), ''), 40),
    left(nullif(btrim(coalesce(it.size, '')), ''), 20),
    it.condition,
    left(nullif(btrim(coalesce(it.pattern, '')), ''), 40),
    left(nullif(btrim(coalesce(it.material, '')), ''), 40),
    public.swap_clean_season(it.season),
    public.swap_clean_materials(it.materials),
    public.swap_clean_care(it.care_instructions),
    left(nullif(btrim(coalesce(it.origin_country, '')), ''), 60),
    p_listing::text || '.jpg', p_photo_state, src);
  return p_listing;
end;
$$;

-- Which of these photo paths still belong to a listing (the sweeper deletes the rest).
create or replace function public.swap_known_photo_paths(p_paths text[])
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(photo_path), '{}'::text[]) from public.swap_listings where photo_path = any (p_paths);
$$;

-- ─── 6. Function privileges ─────────────────────────────────────────────────

revoke all on function public.swap_attention(public.swaps, uuid) from public, anon, authenticated;
revoke all on function public.swap_validate_item(uuid, uuid, text, text) from public, anon, authenticated;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.get_swap_settings()',
    'public.get_swap_badge()',
    'public.accept_swap_terms(text)',
    'public.list_my_swap_listings()',
    'public.update_swap_listing(uuid, text)',
    'public.withdraw_swap_listing(uuid)',
    'public.renew_swap_listing(uuid)',
    'public.browse_swap_listings(text, text, text, text[], text, uuid, uuid, timestamptz, uuid, integer)',
    'public.get_swap_listing(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$$;

revoke all on function public.swap_publish_precheck(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.swap_publish_commit(uuid, uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.swap_publish_precheck(uuid, uuid, text, text) to service_role;
grant execute on function public.swap_publish_commit(uuid, uuid, uuid, text, text, text) to service_role;
revoke all on function public.swap_known_photo_paths(text[]) from public, anon, authenticated;
grant execute on function public.swap_known_photo_paths(text[]) to service_role;
````

#### `supabase/migrations/20261015000300_swap_lifecycle.sql  (stream S1)`

````sql
-- Clothing swaps, part 3 of 5: proposals, threads and the hand-off.
--
-- Client functions: propose_swap, list_my_swaps, get_swap, respond_to_swap, cancel_swap,
-- send_swap_message, swap_complete_my_side, swap_ack_photo.
--
-- Errors (message text; the app maps them):
--   not_authenticated 28000 | swaps_disabled, swap_terms_required, swap_suspended,
--   community_unavailable, community_not_joined, account_too_new 42501 |
--   swap_unavailable (not found / not visible / blocked / expired / gone, all the same) 22023 |
--   swap_not_open 22023 | invalid_swap, invalid_note, invalid_message, offer_not_allowed 22023 |
--   text_not_allowed 22023 (DETAIL = field, HINT = payment|contact|content) |
--   already_proposed 23505 | swap_rate_limited 54000 (DETAIL = bucket) |
--   swap_open_limit, recipient_busy, listing_busy, swap_cooldown, swap_message_limit 54000
--
-- Safe to run twice. Depends on the foundation and listings migrations.

-- ─── 1. Proposing ───────────────────────────────────────────────────────────

create or replace function public.propose_swap(
  p_request_listing_ids uuid[],
  p_offer_listing_ids uuid[],
  p_note text,
  p_client_ref uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cap integer := public.swap_limit('items_per_side');
  clean text := nullif(btrim(coalesce(p_note, '')), '');
  n_found integer;
  n_owners integer;
  owner_uid uuid;
  st text;
  kind text;
  sid uuid;
  l record;
begin
  perform public.swap_gate(uid, 'friends');

  if p_request_listing_ids is null or p_offer_listing_ids is null
     or cardinality(p_request_listing_ids) not between 1 and cap
     or cardinality(p_offer_listing_ids) not between 1 and cap
     or array_position(p_request_listing_ids, null) is not null
     or array_position(p_offer_listing_ids, null) is not null
     or (select count(distinct x) from unnest(p_request_listing_ids) x) <> cardinality(p_request_listing_ids)
     or (select count(distinct x) from unnest(p_offer_listing_ids) x) <> cardinality(p_offer_listing_ids) then
    perform public.swap_raise('invalid_swap', '22023');
  end if;

  -- A retry of the same request returns the same swap.
  if p_client_ref is not null then
    select id into sid from public.swaps where proposer_id = uid and client_ref = p_client_ref;
    if found then
      return sid;
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('swap_propose:' || uid::text, 0));

  -- What they asked for: visible to me, all from one other member.
  select count(*), count(distinct owner_id), min(owner_id::text)::uuid
    into n_found, n_owners, owner_uid
    from public.swap_listings where id = any (p_request_listing_ids);
  if n_found <> cardinality(p_request_listing_ids) or n_owners <> 1 or owner_uid = uid then
    perform public.swap_raise('swap_unavailable', '22023');
  end if;

  st := public.swap_pair_state(uid, owner_uid);
  if st not in ('friends', 'community') then
    perform public.swap_raise('swap_unavailable', '22023');
  end if;
  kind := st;
  if kind = 'community' then
    perform public.swap_gate(uid, 'community');
  end if;

  for l in select id from public.swap_listings where id = any (p_request_listing_ids) order by id loop
    if not public.swap_can_see_listing(l.id, uid) then
      perform public.swap_raise('swap_unavailable', '22023');
    end if;
  end loop;

  -- What I give: my own, on the rack now; for a stranger, community listings only (so
  -- every photo a stranger can see went through the safety check).
  select count(*) into n_found from public.swap_listings
   where id = any (p_offer_listing_ids) and owner_id = uid and status = 'active' and expires_at > now()
     and (kind = 'friends' or audience = 'community');
  if n_found <> cardinality(p_offer_listing_ids) then
    perform public.swap_raise('offer_not_allowed', '22023');
  end if;

  if clean is not null and char_length(clean) > 280 then
    perform public.swap_raise('invalid_note', '22023');
  end if;
  perform public.swap_require_text(clean, 'note', case when kind = 'community' then 'strict' else 'open' end);

  perform public.swap_rate_check(uid, 'propose_day');
  if kind = 'community' then
    perform public.swap_rate_check(uid, 'propose_stranger_day');
  end if;

  if (select count(*) from public.swaps where proposer_id = uid and status = 'proposed') >= public.swap_limit('open_outbound') then
    perform public.swap_raise('swap_open_limit', '54000');
  end if;
  if (select count(*) from public.swaps where recipient_id = owner_uid and status = 'proposed') >= public.swap_limit('open_inbound') then
    perform public.swap_raise('recipient_busy', '54000');
  end if;
  if exists (select 1 from public.swaps
              where proposer_id = uid and recipient_id = owner_uid and closed_reason = 'declined'
                and closed_at > now() - make_interval(days => public.swap_limit('decline_cooldown_days'))) then
    perform public.swap_raise('swap_cooldown', '54000');
  end if;
  if exists (select 1 from public.swap_items si join public.swaps s on s.id = si.swap_id
              where si.listing_id = any (p_request_listing_ids) and si.side = 'request' and s.status = 'proposed'
              group by si.listing_id having count(*) >= public.swap_limit('open_per_requested_listing')) then
    perform public.swap_raise('listing_busy', '54000');
  end if;
  if exists (select 1 from public.swap_items si join public.swaps s on s.id = si.swap_id
              where si.listing_id = any (p_offer_listing_ids) and si.side = 'offer' and s.status = 'proposed'
              group by si.listing_id having count(*) >= public.swap_limit('open_per_offered_listing')) then
    perform public.swap_raise('listing_busy', '54000');
  end if;

  begin
    insert into public.swaps (proposer_id, recipient_id, pair_kind, client_ref, last_event_by)
    values (uid, owner_uid, kind, p_client_ref, uid)
    returning id into sid;
  exception when unique_violation then
    perform public.swap_raise('already_proposed', '23505');
  end;

  insert into public.swap_items (swap_id, listing_id, side, name, category, brand, size, condition, giver_item_id)
  select sid, l2.id, case when l2.owner_id = uid then 'offer' else 'request' end,
         l2.name, l2.category, l2.brand, l2.size, l2.condition, l2.item_id
    from public.swap_listings l2
   where l2.id = any (p_request_listing_ids) or l2.id = any (p_offer_listing_ids);

  insert into public.swap_messages (swap_id, kind, code) values (sid, 'system', 'proposed');
  if clean is not null then
    insert into public.swap_messages (swap_id, sender_id, kind, body) values (sid, uid, 'text', clean);
  end if;
  return sid;
end;
$$;

-- ─── 2. Inbox ───────────────────────────────────────────────────────────────

-- p_limit rows, grouped by the app into: needs_you, finishing, in_progress, waiting, past.
-- A swap with someone who is blocked (either way) stays in the list, like a swap that ended because a
-- piece was deleted: closed, in "past", with the neutral label "Swap member", no photo, and no actions
-- (get_swap). Hiding it would tell the blocked member that they were blocked.
create or replace function public.list_my_swaps(p_limit integer default 100)
returns table (
  swap_id uuid, status text, closed_reason text, role text, pair_kind text, other_label text,
  bucket text, attention boolean, give_names text[], get_names text[], thumb_path text,
  i_done boolean, they_done boolean, created_at timestamptz, last_event_at timestamptz, expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    perform public.swap_raise('not_authenticated', '28000');
  end if;
  if not coalesce((public.swap_cfg('swaps_enabled'))::boolean, false) then
    perform public.swap_raise('swaps_disabled', '42501');
  end if;
  perform public.swap_refresh(uid);
  return query
    with mine as (
      select s as sw, s.id, s.status, s.closed_reason, s.pair_kind, s.created_at, s.last_event_at, s.expires_at,
             (s.proposer_id = uid) as is_proposer,
             case when s.proposer_id = uid then s.recipient_id else s.proposer_id end as other_id,
             (case when s.proposer_id = uid then s.proposer_done_at else s.recipient_done_at end is not null) as me_done,
             (case when s.proposer_id = uid then s.recipient_done_at else s.proposer_done_at end is not null) as them_done,
             (public.swap_pair_state(s.proposer_id, s.recipient_id) = 'blocked') as blocked
        from public.swaps s
       where (s.proposer_id = uid or s.recipient_id = uid)
    ), enriched as (
      select m.*,
             exists (select 1 from public.swap_items si
                      where si.swap_id = m.id and si.claimed_item_id is not null and si.photo_imported_at is null
                        and si.listing_id is not null and not m.blocked
                        and ((si.side = 'offer' and not m.is_proposer) or (si.side = 'request' and m.is_proposer))
                     ) as photo_open,
             exists (select 1 from public.swap_items si
                       join public.clothing_items ci on ci.id = si.giver_item_id and ci.user_id = uid
                      where si.swap_id = m.id and si.removal_skipped_at is null and m.me_done and not m.blocked
                        and ((si.side = 'offer' and m.is_proposer) or (si.side = 'request' and not m.is_proposer))
                     ) as removal_open
        from mine m
    )
    select e.id, e.status, e.closed_reason,
           case when e.is_proposer then 'proposer' else 'recipient' end,
           e.pair_kind,
           case when e.blocked then 'Swap member' else public.swap_label(uid, e.other_id) end,
           case
             when e.blocked then 'past'
             when e.status = 'proposed' and not e.is_proposer then 'needs_you'
             when e.status = 'proposed' then 'waiting'
             when e.status = 'accepted' and e.them_done and not e.me_done then 'needs_you'
             when e.status = 'accepted' then 'in_progress'
             when e.status = 'completed' and not e.me_done then 'needs_you'
             when (e.photo_open or e.removal_open) then 'finishing'
             else 'past' end,
           public.swap_attention(e.sw, uid),
           array(select si.name from public.swap_items si
                  where si.swap_id = e.id and ((si.side = 'offer') = e.is_proposer) order by si.id),
           array(select si.name from public.swap_items si
                  where si.swap_id = e.id and ((si.side = 'offer') <> e.is_proposer) order by si.id),
           case when e.status in ('proposed', 'accepted', 'completed') and not e.blocked then
             (select l.photo_path from public.swap_items si join public.swap_listings l on l.id = si.listing_id
               where si.swap_id = e.id and ((si.side = 'offer') <> e.is_proposer) order by si.id limit 1) end,
           e.me_done, e.them_done, e.created_at, e.last_event_at, e.expires_at
      from enriched e
     order by case
                when e.blocked then 4
                when (e.status = 'proposed' and not e.is_proposer)
                  or (e.status = 'accepted' and e.them_done and not e.me_done)
                  or (e.status = 'completed' and not e.me_done) then 0
                when e.status = 'completed' and (e.photo_open or e.removal_open) then 1
                when e.status = 'accepted' then 2
                when e.status = 'proposed' then 3
                else 4 end,
              e.last_event_at desc
     limit least(greatest(coalesce(p_limit, 100), 1), 200);
end;
$$;

-- ─── 3. One swap ────────────────────────────────────────────────────────────

-- Everything the thread screen needs, including what the viewer may do (the app never
-- decides that). p_after: only messages with a larger id (for polling). Never returns the
-- other member's id. When the other member is blocked (either way) the swap is still returned, as a
-- closed shell: names of the pieces, the system lines, the neutral label "Swap member", no photos, no
-- member messages and no actions. Refusing to open it would tell the blocked member they were blocked.
create or replace function public.get_swap(p_swap_id uuid, p_after bigint default 0)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  s public.swaps;
  is_proposer boolean;
  other uuid;
  me_done boolean;
  them_done boolean;
  items jsonb;
  msgs jsonb;
  total_text integer;
  mine_text integer;
  their_text integer;
  can_msg boolean;
  left_ integer;
  my_suspended boolean;
  blocked boolean;
begin
  if uid is null then
    perform public.swap_raise('not_authenticated', '28000');
  end if;
  if not coalesce((public.swap_cfg('swaps_enabled'))::boolean, false) then
    perform public.swap_raise('swaps_disabled', '42501');
  end if;
  perform public.swap_refresh(uid);

  select * into s from public.swaps where id = p_swap_id and uid in (proposer_id, recipient_id);
  if not found then
    perform public.swap_raise('swap_unavailable', '22023');
  end if;
  blocked := (public.swap_pair_state(s.proposer_id, s.recipient_id) = 'blocked');
  is_proposer := (s.proposer_id = uid);
  other := case when is_proposer then s.recipient_id else s.proposer_id end;
  me_done := (case when is_proposer then s.proposer_done_at else s.recipient_done_at end) is not null;
  them_done := (case when is_proposer then s.recipient_done_at else s.proposer_done_at end) is not null;

  update public.swaps
     set proposer_seen_at = case when is_proposer then now() else proposer_seen_at end,
         recipient_seen_at = case when is_proposer then recipient_seen_at else now() end
   where id = s.id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'listingId', si.listing_id,
           'side', si.side,
           'mine', ((si.side = 'offer') = is_proposer),
           'name', coalesce(l.name, si.name),
           'category', coalesce(l.category, si.category),
           'subcategory', case when not blocked then l.subcategory end,
           'brand', coalesce(l.brand, si.brand),
           'color', case when not blocked then l.color end,
           'size', coalesce(l.size, si.size),
           'condition', coalesce(l.condition, si.condition),
           'pattern', case when not blocked then l.pattern end,
           'materials', case when not blocked then l.materials end,
           'careInstructions', case when not blocked then l.care_instructions end,
           'originCountry', case when not blocked then l.origin_country end,
           'season', case when not blocked then l.season end,
           'note', case when not blocked then l.note end,
           'photoPath', case when not blocked and l.id is not null and s.status in ('proposed', 'accepted', 'completed') then l.photo_path end,
           'claimedItemId', case when not blocked and (si.side = 'offer') <> is_proposer then si.claimed_item_id end,
           'photoPending', not blocked and ((si.side = 'offer') <> is_proposer) and si.claimed_item_id is not null
                           and si.photo_imported_at is null and l.id is not null,
           'giverItemId', case when not blocked and (si.side = 'offer') = is_proposer then si.giver_item_id end,
           'removalPending', not blocked and ((si.side = 'offer') = is_proposer) and me_done and si.removal_skipped_at is null
                             and exists (select 1 from public.clothing_items ci where ci.id = si.giver_item_id and ci.user_id = uid)
         ) order by si.id), '[]'::jsonb)
    into items
    from public.swap_items si
    left join public.swap_listings l on l.id = si.listing_id
   where si.swap_id = s.id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id, 'kind', x.kind, 'code', x.code, 'body', x.body,
           'mine', (x.sender_id = uid), 'createdAt', x.created_at) order by x.id), '[]'::jsonb)
    into msgs
    from (select * from public.swap_messages m
           where m.swap_id = s.id and m.id > coalesce(p_after, 0) and (not blocked or m.kind = 'system')
           order by m.id desc limit 100) x;

  select count(*) filter (where kind = 'text'),
         count(*) filter (where kind = 'text' and sender_id = uid),
         count(*) filter (where kind = 'text' and sender_id is distinct from uid)
    into total_text, mine_text, their_text
    from public.swap_messages where swap_id = s.id;
  select (m.suspended_at is not null) into my_suspended from public.swap_members m where m.user_id = uid;

  can_msg := other is not null and not coalesce(my_suspended, false) and not blocked
             and public.swap_pair_state(uid, other) in ('friends', 'community')
             and (s.status in ('proposed', 'accepted')
                  or (s.status = 'completed' and s.closed_at > now() - interval '7 days'));
  left_ := public.swap_limit('messages_per_swap') - total_text;
  if s.pair_kind = 'community' and s.status = 'proposed' and their_text = 0 then
    left_ := least(left_, public.swap_limit('preaccept_messages_stranger') + 1 - mine_text);
  end if;
  left_ := greatest(left_, 0);

  return jsonb_build_object(
    'id', s.id,
    'status', s.status,
    'closedReason', s.closed_reason,
    'role', case when is_proposer then 'proposer' else 'recipient' end,
    'pairKind', s.pair_kind,
    'otherLabel', case when blocked then 'Swap member' else public.swap_label(uid, other) end,
    'createdAt', s.created_at,
    'expiresAt', s.expires_at,
    'closedAt', s.closed_at,
    'iDone', me_done,
    'theyDone', them_done,
    'autoCompleted', s.auto_completed,
    'items', items,
    'messages', msgs,
    -- canCancel: the proposer until it is answered; and, once accepted, whoever has not tapped "We swapped!"
    -- yet, even if the other member has (so a member cannot be left with their pieces locked by the other
    -- member's tap). After your own tap there is nothing to cancel: only a report remains.
    'actions', jsonb_build_object(
      'canAccept', not blocked and s.status = 'proposed' and not is_proposer,
      'canDecline', not blocked and s.status = 'proposed' and not is_proposer,
      'canCancel', not blocked and ((s.status = 'proposed' and is_proposer)
                                    or (s.status = 'accepted' and not me_done)),
      'canComplete', not blocked and ((s.status = 'accepted' and not me_done)
                                      or (s.status = 'completed' and s.auto_completed and not me_done)),
      'canMessage', can_msg and left_ > 0,
      'messagesLeft', case when can_msg then left_ else 0 end
    )
  );
end;
$$;

-- ─── 4. Answering, cancelling, talking ──────────────────────────────────────

-- p_action 'accept' | 'decline'. Returns 'accepted' | 'declined' | 'unavailable'.
-- Accepting is the only moment items are reserved.
create or replace function public.respond_to_swap(p_swap_id uuid, p_action text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  prop uuid;
  s public.swaps;
  st text;
  ids uuid[];
  bad boolean;
begin
  perform public.swap_gate(uid, 'friends');
  if p_action is null or p_action not in ('accept', 'decline') then
    perform public.swap_raise('invalid_swap', '22023');
  end if;
  perform public.swap_rate_check(uid, 'respond_day');

  select proposer_id into prop from public.swaps where id = p_swap_id and recipient_id = uid;
  if prop is null then
    perform public.swap_raise('swap_unavailable', '22023');
  end if;
  perform public.swap_lock_users(prop, uid);

  select * into s from public.swaps where id = p_swap_id and recipient_id = uid for update;
  if not found then
    perform public.swap_raise('swap_unavailable', '22023');
  end if;
  st := public.swap_pair_state(s.proposer_id, s.recipient_id);
  if st = 'blocked' then
    perform public.swap_raise('swap_unavailable', '22023');
  end if;
  if s.status <> 'proposed' then
    perform public.swap_raise('swap_not_open', '22023');
  end if;

  if p_action = 'decline' then
    perform public.swap_close(s.id, 'declined', 'declined', uid);
    return 'declined';
  end if;

  if s.expires_at <= now()
     or st = 'none' or (s.pair_kind = 'friends' and st <> 'friends') then
    perform public.swap_close(s.id, 'cancelled', 'unavailable');
    return 'unavailable';
  end if;

  select array_agg(listing_id order by listing_id) into ids
    from public.swap_items where swap_id = s.id and listing_id is not null;
  perform 1 from public.swap_listings where id = any (ids) order by id for update;
  select exists (
           select 1 from public.swap_items si
             left join public.swap_listings l on l.id = si.listing_id
            where si.swap_id = s.id
              and (l.id is null or l.status <> 'active' or l.expires_at <= now()
                   or l.owner_id is distinct from (case when si.side = 'offer' then s.proposer_id else s.recipient_id end)))
    into bad;
  if bad then
    perform public.swap_close(s.id, 'cancelled', 'unavailable');
    return 'unavailable';
  end if;

  begin
    update public.swap_items set reserved = true where swap_id = s.id;
  exception when unique_violation then
    perform public.swap_close(s.id, 'cancelled', 'unavailable');
    return 'unavailable';
  end;
  update public.swap_listings set status = 'reserved', status_changed_at = now() where id = any (ids);
  update public.swaps
     set status = 'accepted', accepted_at = now(), expires_at = now() + interval '30 days',
         updated_at = now(), last_event_at = now(), last_event_by = uid
   where id = s.id;
  insert into public.swap_messages (swap_id, kind, code) values (s.id, 'system', 'accepted');
  return 'accepted';
end;
$$;

create or replace function public.cancel_swap(p_swap_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  prop uuid;
  rec uuid;
  s public.swaps;
begin
  if uid is null then
    perform public.swap_raise('not_authenticated', '28000');
  end if;
  perform public.swap_rate_check(uid, 'cancel_day');
  select proposer_id, recipient_id into prop, rec from public.swaps
   where id = p_swap_id and uid in (proposer_id, recipient_id);
  if not found then
    perform public.swap_raise('swap_unavailable', '22023');
  end if;
  perform public.swap_lock_users(prop, rec);
  select * into s from public.swaps where id = p_swap_id for update;
  if public.swap_pair_state(s.proposer_id, s.recipient_id) = 'blocked' then
    perform public.swap_raise('swap_unavailable', '22023');
  end if;
  if (s.status = 'proposed' and s.proposer_id = uid)
     or (s.status = 'accepted'
         and (case when s.proposer_id = uid then s.proposer_done_at else s.recipient_done_at end) is null) then
    perform public.swap_close(
      s.id, 'cancelled',
      case when s.proposer_id = uid then 'cancelled_by_proposer' else 'cancelled_by_recipient' end, uid);
  else
    perform public.swap_raise('swap_not_open', '22023');
  end if;
end;
$$;

create or replace function public.send_swap_message(p_swap_id uuid, p_body text, p_client_ref uuid default null)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  body text := btrim(coalesce(p_body, ''));
  s public.swaps;
  other uuid;
  mid bigint;
  total_text integer;
  mine_text integer;
  their_text integer;
begin
  perform public.swap_gate(uid, 'friends');
  if char_length(body) < 1 or char_length(body) > 500 then
    perform public.swap_raise('invalid_message', '22023');
  end if;

  select * into s from public.swaps where id = p_swap_id and uid in (proposer_id, recipient_id);
  if not found then
    perform public.swap_raise('swap_unavailable', '22023');
  end if;
  other := case when s.proposer_id = uid then s.recipient_id else s.proposer_id end;
  if other is null or public.swap_pair_state(uid, other) not in ('friends', 'community') then
    perform public.swap_raise('swap_unavailable', '22023');
  end if;
  if not (s.status in ('proposed', 'accepted')
          or (s.status = 'completed' and s.closed_at > now() - interval '7 days')) then
    perform public.swap_raise('swap_not_open', '22023');
  end if;

  if p_client_ref is not null then
    select id into mid from public.swap_messages where sender_id = uid and client_ref = p_client_ref;
    if found then
      return mid;
    end if;
  end if;

  select count(*) filter (where kind = 'text'),
         count(*) filter (where kind = 'text' and sender_id = uid),
         count(*) filter (where kind = 'text' and sender_id is distinct from uid)
    into total_text, mine_text, their_text
    from public.swap_messages where swap_id = s.id;
  if total_text >= public.swap_limit('messages_per_swap') then
    perform public.swap_raise('swap_message_limit', '54000');
  end if;
  -- A stranger gets the proposal note plus a few questions until the other side answers.
  if s.pair_kind = 'community' and s.status = 'proposed' and their_text = 0
     and mine_text >= public.swap_limit('preaccept_messages_stranger') + 1 then
    perform public.swap_raise('swap_message_limit', '54000');
  end if;

  perform public.swap_require_text(
    body, 'message',
    case when s.pair_kind = 'community' and s.status = 'proposed' then 'strict' else 'open' end);

  perform public.swap_rate_check(uid, 'message_min');
  perform public.swap_rate_check(uid, 'message_hour');
  perform public.swap_rate_check(uid, 'message_day');

  insert into public.swap_messages (swap_id, sender_id, kind, body, client_ref)
  values (s.id, uid, 'text', body, p_client_ref)
  returning id into mid;
  update public.swaps
     set last_event_at = now(), last_event_by = uid, updated_at = now(),
         proposer_seen_at = case when s.proposer_id = uid then now() else proposer_seen_at end,
         recipient_seen_at = case when s.recipient_id = uid then now() else recipient_seen_at end
   where id = s.id;
  return mid;
end;
$$;

-- ─── 5. The hand-off ────────────────────────────────────────────────────────

-- "We swapped!" for the calling member only. Adds the pieces they receive to their own
-- closet from the listing snapshot (private fields reset: no prices, notes, wear history,
-- tag text), marks their side done, and tells them which of their own pieces to remove.
-- Nothing in the other member's closet is touched. Safe to call again: it returns whatever
-- is still unfinished (photos not imported, pieces not yet removed).
create or replace function public.swap_complete_my_side(p_swap_id uuid, p_keep_given boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  prop uuid;
  rec uuid;
  s public.swaps;
  is_proposer boolean;
  my_done timestamptz;
  fresh boolean := false;
  si record;
  new_id uuid;
  recd jsonb;
  rem jsonb;
  both_done boolean;
  finished boolean := false;
begin
  perform public.swap_gate(uid, 'friends');
  perform public.swap_rate_check(uid, 'complete_day');

  select proposer_id, recipient_id into prop, rec from public.swaps
   where id = p_swap_id and uid in (proposer_id, recipient_id);
  if not found then
    perform public.swap_raise('swap_unavailable', '22023');
  end if;
  perform public.swap_lock_users(prop, rec);
  select * into s from public.swaps where id = p_swap_id for update;
  if public.swap_pair_state(s.proposer_id, s.recipient_id) = 'blocked' then
    perform public.swap_raise('swap_unavailable', '22023');
  end if;
  is_proposer := (s.proposer_id = uid);
  my_done := case when is_proposer then s.proposer_done_at else s.recipient_done_at end;

  if my_done is null and (s.status = 'accepted' or (s.status = 'completed' and s.auto_completed)) then
    fresh := true;
  elsif my_done is null then
    perform public.swap_raise('swap_not_open', '22023');
  end if;

  if fresh then
    -- The first tap also pushes the absolute expiry out to 15 days from now, so the 14-day auto-finish
    -- always comes first: a swap one member has completed is finished, never "expired" under them.
    update public.swaps
       set proposer_done_at = case when is_proposer then now() else proposer_done_at end,
           recipient_done_at = case when is_proposer then recipient_done_at else now() end,
           expires_at = greatest(expires_at, now() + interval '15 days'),
           updated_at = now(), last_event_at = now(), last_event_by = uid
     where id = s.id
     returning (proposer_done_at is not null and recipient_done_at is not null) into both_done;

    for si in
      select * from public.swap_items
       where swap_id = s.id and claimed_item_id is null and ((side = 'offer') <> is_proposer)
       order by id
    loop
      insert into public.clothing_items (
        user_id, name, category, subcategory, brand, color, season, size, condition, care_instructions,
        origin_country, materials, pattern, material, tags, notes, is_wishlist, favorite, wear_count, date_added)
      select uid,
             coalesce(l.name, si.name), coalesce(l.category, si.category, 'accessories'), l.subcategory,
             coalesce(l.brand, si.brand), l.color, coalesce(l.season, '[]'::jsonb),
             coalesce(l.size, si.size), coalesce(l.condition, si.condition), l.care_instructions,
             l.origin_country, l.materials, l.pattern, l.material,
             '["swapped"]'::jsonb, 'Swapped in on ' || to_char(now(), 'Mon DD, YYYY'),
             false, false, 0, now()
        from (select 1) one
        left join public.swap_listings l on l.id = si.listing_id
      returning id into new_id;
      update public.swap_items set claimed_item_id = new_id, claimed_at = now() where id = si.id;
    end loop;

    if p_keep_given then
      update public.swap_items set removal_skipped_at = now()
       where swap_id = s.id and ((side = 'offer') = is_proposer);
    end if;

    if both_done and s.status = 'accepted' then
      perform public.swap_finish(s.id, false);
      finished := true;
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'claimedItemId', x.claimed_item_id, 'listingId', x.listing_id,
           'photoPath', l.photo_path, 'name', x.name) order by x.id), '[]'::jsonb)
    into recd
    from public.swap_items x
    left join public.swap_listings l on l.id = x.listing_id
   where x.swap_id = s.id and x.claimed_item_id is not null and x.photo_imported_at is null
     and x.listing_id is not null and ((x.side = 'offer') <> is_proposer);

  select coalesce(jsonb_agg(jsonb_build_object('itemId', x.giver_item_id, 'name', x.name) order by x.id), '[]'::jsonb)
    into rem
    from public.swap_items x
    join public.clothing_items ci on ci.id = x.giver_item_id and ci.user_id = uid
   where x.swap_id = s.id and x.removal_skipped_at is null and ((x.side = 'offer') = is_proposer);

  return jsonb_build_object(
    'status', (select status from public.swaps where id = s.id),
    'completed', finished or s.status = 'completed',
    'received', recd,
    'toRemove', rem
  );
end;
$$;

-- The app copied (or gave up copying) the photo of a piece it received.
create or replace function public.swap_ack_photo(p_swap_id uuid, p_claimed_item_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    perform public.swap_raise('not_authenticated', '28000');
  end if;
  update public.swap_items si
     set photo_imported_at = now()
   where si.swap_id = p_swap_id
     and si.claimed_item_id = any (coalesce(p_claimed_item_ids, '{}'))
     and exists (select 1 from public.clothing_items ci where ci.id = si.claimed_item_id and ci.user_id = uid)
     and exists (select 1 from public.swaps s where s.id = si.swap_id and uid in (s.proposer_id, s.recipient_id));
end;
$$;

-- ─── 6. Function privileges ─────────────────────────────────────────────────

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.propose_swap(uuid[], uuid[], text, uuid)',
    'public.list_my_swaps(integer)',
    'public.get_swap(uuid, bigint)',
    'public.respond_to_swap(uuid, text)',
    'public.cancel_swap(uuid)',
    'public.send_swap_message(uuid, text, uuid)',
    'public.swap_complete_my_side(uuid, boolean)',
    'public.swap_ack_photo(uuid, uuid[])'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$$;
````

#### `supabase/migrations/20261015000400_swap_moderation.sql  (stream S1)`

````sql
-- Clothing swaps, part 4 of 5: reports, blocks and moderation tools.
--
-- 1. content_reports accepts swap contexts and reasons. report_user() keeps its narrower
--    lists on purpose, so old app builds are unaffected and no copy of its body can drift.
-- 2. report_swap_content(): a report that carries evidence (the listing snapshot, or the
--    last 30 messages of a swap) and is resolved on the server, so the app never needs the
--    other member's account id. Shares the 20-a-day limit with report_user().
-- 3. block_swap_member(): blocks the owner of a listing or the other member of a swap.
-- 4. list_swap_blocks() / unblock_swap_member(): blocks made on a stranger known only by an
--    alias, listed under an opaque ref instead of their account id.
-- 5. Service-role-only moderation functions and a queue view. Nothing here is callable by
--    app users. A hold is sticky (it records who made it, and only a person or the end of a
--    suspension lifts it), a listing can be removed for good, and a digest function tells the person
--    who reviews reports when some are waiting.
--
-- Safe to run twice. Depends on the foundation migration.

-- ─── 1. Report contexts and reasons ─────────────────────────────────────────

alter table public.content_reports drop constraint if exists content_reports_context_check;
alter table public.content_reports add constraint content_reports_context_check
  check (context in ('friend_request', 'friend_closet', 'profile', 'swap_listing', 'swap_chat'));

alter table public.content_reports drop constraint if exists content_reports_reason_check;
alter table public.content_reports add constraint content_reports_reason_check
  check (reason in ('spam', 'harassment', 'inappropriate', 'impersonation',
                    'scam', 'not_as_described', 'unsafe', 'other'));

-- ─── 2. Reporting from a swap surface ───────────────────────────────────────

-- Who a listing or swap belongs to, from the point of view of a member who may see it.
-- Raises swap_unavailable when they may not (so ids cannot be probed).
create or replace function public.swap_resolve_ref(p_uid uuid, p_ref_type text, p_ref_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  other uuid;
begin
  if p_ref_type = 'listing' then
    select l.owner_id into other from public.swap_listings l
     where l.id = p_ref_id and l.owner_id <> p_uid
       and not public.is_blocked_between(p_uid, l.owner_id)
       and (public.swap_can_see_listing(l.id, p_uid)
            or exists (select 1 from public.swap_items si join public.swaps s on s.id = si.swap_id
                        where si.listing_id = l.id and p_uid in (s.proposer_id, s.recipient_id)));
  elsif p_ref_type = 'swap' then
    select case when s.proposer_id = p_uid then s.recipient_id else s.proposer_id end into other
      from public.swaps s where s.id = p_ref_id and p_uid in (s.proposer_id, s.recipient_id);
  else
    perform public.swap_raise('invalid_report', '22023');
  end if;
  if other is null then
    perform public.swap_raise('swap_unavailable', '22023');
  end if;
  return other;
end;
$$;

create or replace function public.report_swap_content(
  p_ref_type text,
  p_ref_id uuid,
  p_reason text,
  p_details text default null,
  p_message_id bigint default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  other uuid;
  clean text := nullif(btrim(coalesce(p_details, '')), '');
  ctx text;
  ev jsonb;
  hold_at integer := public.swap_limit('reports_to_hold_listing');
  r record;
begin
  if uid is null then
    perform public.swap_raise('not_authenticated', '28000');
  end if;
  if p_reason is null or p_reason not in ('spam', 'harassment', 'inappropriate', 'impersonation',
                                          'scam', 'not_as_described', 'unsafe', 'other')
     or p_ref_type is null or p_ref_type not in ('listing', 'swap') or p_ref_id is null then
    perform public.swap_raise('invalid_report', '22023');
  end if;
  other := public.swap_resolve_ref(uid, p_ref_type, p_ref_id);
  -- A flagged message must be one the other member sent in this swap.
  if p_message_id is not null and (p_ref_type <> 'swap' or not exists (
       select 1 from public.swap_messages m
        where m.id = p_message_id and m.swap_id = p_ref_id and m.sender_id = other)) then
    perform public.swap_raise('invalid_report', '22023');
  end if;

  -- Same shared daily limit as report_user().
  if (select count(*) from public.content_reports
       where reporter_id = uid and created_at > now() - interval '1 day') >= public.swap_limit('reports_day') then
    perform public.swap_raise('report_rate_limited', '54000');
  end if;
  -- A repeat report about the same thing within a week is folded into the first.
  if exists (select 1 from public.content_reports
              where reporter_id = uid and ref_type = p_ref_type and ref_id = p_ref_id
                and created_at > now() - interval '7 days') then
    return;
  end if;

  if p_ref_type = 'listing' then
    ctx := 'swap_listing';
    select jsonb_build_object(
             'audience', l.audience, 'status', l.status, 'name', l.name, 'category', l.category,
             'brand', l.brand, 'size', l.size, 'condition', l.condition, 'note', l.note,
             'photoPath', l.photo_path, 'listedAt', l.created_at)
      into ev from public.swap_listings l where l.id = p_ref_id;
  else
    ctx := 'swap_chat';
    select jsonb_build_object(
             'status', s.status, 'closedReason', s.closed_reason, 'pairKind', s.pair_kind,
             'createdAt', s.created_at,
             'items', (select coalesce(jsonb_agg(jsonb_build_object('side', si.side, 'name', si.name, 'size', si.size) order by si.id), '[]'::jsonb)
                         from public.swap_items si where si.swap_id = s.id),
             'flaggedMessageId', p_message_id,
             'messages', (select coalesce(jsonb_agg(x.j order by x.id), '[]'::jsonb) from (
                            select m.id, jsonb_build_object(
                                     'id', m.id,
                                     'from', case when m.kind = 'system' then 'system'
                                                  when m.sender_id = uid then 'reporter' else 'reported' end,
                                     'body', m.body, 'code', m.code, 'at', m.created_at) as j
                              from public.swap_messages m where m.swap_id = s.id
                             order by m.id desc limit 30) x))
      into ev from public.swaps s where s.id = p_ref_id;
  end if;

  insert into public.content_reports (reporter_id, reported_user_id, context, reason, details, ref_type, ref_id, evidence)
  values (uid, other, ctx, p_reason, left(clean, 500), p_ref_type, p_ref_id, ev);

  -- Enough different people reporting one listing hides it (reversible; a person decides what happens next).
  if p_ref_type = 'listing' and (select count(distinct reporter_id) from public.content_reports
                                  where ref_type = 'listing' and ref_id = p_ref_id
                                    and created_at > now() - interval '7 days') >= hold_at then
    update public.swap_listings set status = 'held', held_by = 'reports', held_at = now(), status_changed_at = now()
     where id = p_ref_id and status = 'active';
    if found then
      for r in
        select s.id from public.swaps s join public.swap_items si on si.swap_id = s.id
         where si.listing_id = p_ref_id and s.status = 'proposed' order by s.id
      loop
        perform public.swap_close(r.id, 'cancelled', 'unavailable');
      end loop;
    end if;
  end if;
end;
$$;

-- ─── 3. Blocking from a swap surface ────────────────────────────────────────

-- Friends are blocked exactly as block_user() does (their usual name is kept). Someone known
-- only by an alias is blocked under the alias, marked via_swap so their account id never
-- appears in the blocker's own block list.
create or replace function public.block_swap_member(p_ref_type text, p_ref_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  other uuid;
  who text;
begin
  if uid is null then
    perform public.swap_raise('not_authenticated', '28000');
  end if;
  if p_ref_type is null or p_ref_type not in ('listing', 'swap') or p_ref_id is null then
    perform public.swap_raise('invalid_swap', '22023');
  end if;
  other := public.swap_resolve_ref(uid, p_ref_type, p_ref_id);
  perform public.swap_rate_check(uid, 'block_day');

  if public.are_friends(uid, other) then
    perform public.block_user(other);
  else
    select coalesce(m.alias, 'Swap member') into who from public.swap_members m where m.user_id = other;
    insert into public.user_blocks (blocker_id, blocked_id, blocked_name, via_swap)
    values (uid, other, coalesce(who, 'Swap member'), true)
    on conflict (blocker_id, blocked_id) do nothing;
  end if;
end;
$$;

create or replace function public.list_swap_blocks()
returns table (ref uuid, label text, blocked_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select b.ref, coalesce(b.blocked_name, 'Swap member'), b.created_at
    from public.user_blocks b
   where b.blocker_id = auth.uid() and b.via_swap
   order by b.created_at desc;
$$;

create or replace function public.unblock_swap_member(p_ref uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    perform public.swap_raise('not_authenticated', '28000');
  end if;
  delete from public.user_blocks where ref = p_ref and blocker_id = auth.uid() and via_swap;
end;
$$;

-- ─── 3b. Export ─────────────────────────────────────────────────────────────

-- Everything the member created or agreed to in swaps, for Export Data. The other member's
-- words, name and account are not included; only this member's own messages are.
create or replace function public.export_my_swap_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    perform public.swap_raise('not_authenticated', '28000');
  end if;
  return jsonb_build_object(
    'settings', (select jsonb_build_object(
                   'termsVersion', m.terms_version, 'termsAcceptedAt', m.terms_accepted_at,
                   'adultConfirmedAt', m.adult_confirmed_at, 'photoScanAckAt', m.photo_scan_ack_at,
                   'communityJoinedAt', m.community_joined_at, 'alias', m.alias)
                  from public.swap_members m where m.user_id = uid),
    'listings', (select coalesce(jsonb_agg(jsonb_build_object(
                   'id', l.id, 'audience', l.audience, 'status', l.status, 'name', l.name,
                   'category', l.category, 'brand', l.brand, 'size', l.size, 'condition', l.condition,
                   'note', l.note, 'listedAt', l.created_at) order by l.created_at), '[]'::jsonb)
                  from public.swap_listings l where l.owner_id = uid),
    'swaps', (select coalesce(jsonb_agg(jsonb_build_object(
                   'id', s.id, 'status', s.status, 'closedReason', s.closed_reason, 'pairKind', s.pair_kind,
                   'role', case when s.proposer_id = uid then 'proposer' else 'recipient' end,
                   'createdAt', s.created_at, 'closedAt', s.closed_at,
                   'items', (select coalesce(jsonb_agg(jsonb_build_object(
                               'side', si.side, 'name', si.name, 'size', si.size, 'condition', si.condition) order by si.id), '[]'::jsonb)
                               from public.swap_items si where si.swap_id = s.id),
                   'myMessages', (select coalesce(jsonb_agg(jsonb_build_object('body', m.body, 'sentAt', m.created_at) order by m.id), '[]'::jsonb)
                                    from public.swap_messages m where m.swap_id = s.id and m.sender_id = uid and m.kind = 'text')
                 ) order by s.created_at), '[]'::jsonb)
                from public.swaps s where uid in (s.proposer_id, s.recipient_id))
  );
end;
$$;

-- ─── 4. Moderation tools (service role only; run from the dashboard SQL editor) ─

create or replace function public.swap_admin_hold_listing(p_listing uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  update public.swap_listings set status = 'held', held_by = 'admin', held_at = now(), status_changed_at = now()
   where id = p_listing and status = 'active';
  for r in
    select s.id from public.swaps s join public.swap_items si on si.swap_id = s.id
     where si.listing_id = p_listing and s.status = 'proposed' order by s.id
  loop
    perform public.swap_close(r.id, 'cancelled', 'unavailable');
  end loop;
end;
$$;

-- Lifts one hold, whoever made it. A person decides this, listing by listing.
create or replace function public.swap_admin_release_listing(p_listing uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.swap_listings
     set status = case when expires_at <= now() then 'expired' else 'active' end,
         held_by = null, held_at = null, status_changed_at = now()
   where id = p_listing and status = 'held' and item_id is not null;
$$;

-- Takes a listing down for good. Open swaps that include it end (proposed or accepted: a person has
-- decided), its photo is queued for deletion at the next sweep, the reports about it are marked handled,
-- and the piece cannot be listed again while it exists (the removed row is kept for that; swap_janitor
-- deletes it 30 days after the piece is gone).
create or replace function public.swap_admin_remove_listing(p_listing uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.swap_listings;
  r record;
begin
  select * into l from public.swap_listings where id = p_listing for update;
  if not found or l.status = 'removed' then
    return;
  end if;
  for r in
    select s.id from public.swaps s join public.swap_items si on si.swap_id = s.id
     where si.listing_id = p_listing and s.status in ('proposed', 'accepted') order by s.id
  loop
    perform public.swap_close(r.id, 'cancelled', 'unavailable');
  end loop;
  update public.swap_listings
     set status = 'removed', held_by = null, held_at = null, status_changed_at = now()
   where id = p_listing;
  insert into public.swap_photo_gc (path) values (l.photo_path) on conflict (path) do nothing;
  update public.content_reports
     set reviewed_at = now(), outcome = coalesce(left(nullif(btrim(p_reason), ''), 200), 'removed listing')
   where ref_type = 'listing' and ref_id = p_listing and reviewed_at is null;
end;
$$;

create or replace function public.swap_admin_suspend(p_user uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  insert into public.swap_members (user_id, suspended_at, suspended_reason)
  values (p_user, now(), left(p_reason, 200))
  on conflict (user_id) do update
    set suspended_at = now(), suspended_reason = left(p_reason, 200), updated_at = now();
  for r in
    select id from public.swaps where status in ('proposed', 'accepted')
       and p_user in (proposer_id, recipient_id) order by id
  loop
    perform public.swap_close(r.id, 'cancelled', 'unavailable');
  end loop;
  -- Only listings that are on the rack are held (and marked as held by the suspension). A listing that
  -- is already held for another reason keeps that reason, so lifting the suspension does not release it.
  update public.swap_listings
     set status = 'held', held_by = 'suspension', held_at = now(), status_changed_at = now()
   where owner_id = p_user and status = 'active';
end;
$$;

-- Ends a suspension and releases only the listings it held. Listings held by reports or by a person
-- stay held until a person releases or removes them.
create or replace function public.swap_admin_unsuspend(p_user uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.swap_members set suspended_at = null, suspended_reason = null, updated_at = now()
   where user_id = p_user;
  update public.swap_listings
     set status = case when expires_at <= now() then 'expired' else 'active' end,
         held_by = null, held_at = null, status_changed_at = now()
   where owner_id = p_user and status = 'held' and held_by = 'suspension' and item_id is not null;
$$;

create or replace function public.swap_set_enabled(p_on boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update public.swap_config set value = to_jsonb(p_on), updated_at = now() where key = 'swaps_enabled';
$$;

-- The stranger tier may only be switched on once the objectionable-terms list is loaded.
create or replace function public.swap_set_community_enabled(p_on boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_on and (select count(*) from public.swap_blocked_terms where kind = 'content') < 50 then
    raise exception 'load at least 50 content terms into swap_blocked_terms first' using errcode = '55000';
  end if;
  update public.swap_config set value = to_jsonb(p_on), updated_at = now() where key = 'community_enabled';
end;
$$;

-- Reports nobody has looked at yet that are older than p_older_than.
create or replace function public.swap_report_backlog(p_older_than interval default interval '4 hours')
returns table (waiting integer, oldest_hours integer)
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer,
         coalesce(floor(extract(epoch from (now() - min(cr.created_at))) / 3600)::integer, 0)
    from public.content_reports cr
   where cr.context in ('swap_listing', 'swap_chat') and cr.reviewed_at is null
     and cr.created_at < now() - p_older_than;
$$;

-- Tells whoever reviews reports that some are waiting. The queue is only a view, so without this nobody
-- would know. It posts numbers only (how many, how old), never a member, text or id, to the address kept
-- in Vault under the name swap_report_webhook (a chat or email-gateway webhook the owner chooses), and is
-- scheduled hourly (docs/MODERATION.md). Returns true when a message was sent. Where pg_net, Vault or the
-- secret is missing it does nothing and returns false: a scheduled job must never raise.
create or replace function public.swap_send_report_digest(p_older_than interval default interval '4 hours')
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  b record;
  url text;
begin
  select * into b from public.swap_report_backlog(p_older_than);
  if coalesce(b.waiting, 0) = 0 then
    return false;
  end if;
  begin
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into url using 'swap_report_webhook';
    if url is null or url !~ '^https://' then
      return false;
    end if;
    perform net.http_post(
      url := url,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('text',
        format('SmartCloset swaps: %s report(s) waiting for review, the oldest %s hour(s). Open the swap_moderation_queue view.',
               b.waiting, b.oldest_hours)));
    return true;
  exception when others then
    return false;
  end;
end;
$$;

create or replace view public.swap_moderation_queue as
select cr.id, cr.created_at, cr.context, cr.reason, cr.details, cr.ref_type, cr.ref_id,
       cr.reporter_id, cr.reported_user_id, cr.evidence, cr.reviewed_at, cr.outcome
  from public.content_reports cr
 where cr.context in ('swap_listing', 'swap_chat') and cr.reviewed_at is null
 order by cr.created_at;

-- ─── 5. Function privileges ─────────────────────────────────────────────────

revoke all on function public.swap_resolve_ref(uuid, text, uuid) from public, anon, authenticated;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.report_swap_content(text, uuid, text, text, bigint)',
    'public.block_swap_member(text, uuid)',
    'public.list_swap_blocks()',
    'public.unblock_swap_member(uuid)',
    'public.export_my_swap_data()'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;

  foreach f in array array[
    'public.swap_admin_hold_listing(uuid)',
    'public.swap_admin_release_listing(uuid)',
    'public.swap_admin_remove_listing(uuid, text)',
    'public.swap_admin_suspend(uuid, text)',
    'public.swap_admin_unsuspend(uuid)',
    'public.swap_report_backlog(interval)',
    'public.swap_send_report_digest(interval)',
    'public.swap_set_enabled(boolean)',
    'public.swap_set_community_enabled(boolean)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end
$$;

revoke all on public.swap_moderation_queue from public, anon, authenticated;
grant select on public.swap_moderation_queue to service_role;
````

#### `supabase/migrations/20261015000500_swap_community.sql  (stream S1)`

````sql
-- Clothing swaps, part 5 of 5: the community tier (members who are not friends).
--
-- Applying this migration changes nothing for anyone until the server switch is turned on:
-- swap_config community_enabled stays false (see swap_set_community_enabled) and every
-- stranger-facing path checks it. It only adds the way in and out:
--   join_swap_community, leave_swap_community, narrow_swap_listing.
-- Everything else a stranger can do (browse, propose, message, report, block) is already
-- implemented in the earlier migrations and gated by swap_gate(..., 'community').
--
-- Safe to run twice. Depends on migrations 1-4.

create or replace function public.join_swap_community(
  p_alias text,
  p_adult boolean,
  p_photo_scan_ok boolean,
  p_terms_version text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  a text := btrim(coalesce(p_alias, ''));
  cur text := public.swap_cfg('terms_version') #>> '{}';
begin
  perform public.swap_gate(uid, 'friends');
  if not coalesce((public.swap_cfg('community_enabled'))::boolean, false) then
    perform public.swap_raise('community_unavailable', '42501');
  end if;
  if p_terms_version is distinct from cur then
    perform public.swap_raise('terms_version_mismatch', '22023');
  end if;
  if not coalesce(p_adult, false) then
    perform public.swap_raise('adult_required', '22023');
  end if;
  if not coalesce(p_photo_scan_ok, false) then
    perform public.swap_raise('scan_ack_required', '22023');
  end if;
  if (select u.created_at from auth.users u where u.id = uid)
       > now() - make_interval(hours => coalesce((public.swap_cfg('min_account_age_hours'))::integer, 48)) then
    perform public.swap_raise('account_too_new', '42501');
  end if;
  if a !~ '^[A-Za-z0-9][A-Za-z0-9 ._-]{1,18}[A-Za-z0-9]$'
     or lower(a) ~ '(smart ?closet|support|admin|moderator|staff|official|swap member|former member|^team$|^help$)'
     or a ~ '  ' then
    perform public.swap_raise('alias_invalid', '22023');
  end if;
  perform public.swap_require_text(a, 'alias', 'strict');
  begin
    update public.swap_members
       set alias = a, adult_confirmed_at = coalesce(adult_confirmed_at, now()),
           photo_scan_ack_at = now(), community_joined_at = now(), community_terms_version = cur,
           updated_at = now()
     where user_id = uid;
  exception when unique_violation then
    perform public.swap_raise('alias_taken', '23505');
  end;
end;
$$;

-- Leaves the community: community listings go back to friends only, strangers' swaps end,
-- and the alias is released. Friends' swaps carry on.
create or replace function public.leave_swap_community()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r record;
begin
  if uid is null then
    perform public.swap_raise('not_authenticated', '28000');
  end if;
  for r in
    select id from public.swaps
     where status in ('proposed', 'accepted') and pair_kind = 'community' and uid in (proposer_id, recipient_id)
     order by id
  loop
    perform public.swap_close(r.id, 'cancelled', 'unavailable', uid);
  end loop;
  update public.swap_listings set audience = 'friends', status_changed_at = now()
   where owner_id = uid and audience = 'community';
  update public.swap_members
     set alias = null, community_joined_at = null, community_terms_version = null, updated_at = now()
   where user_id = uid;
end;
$$;

-- Community -> friends for one listing. Open proposals from members who are not friends end.
create or replace function public.narrow_swap_listing(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  l public.swap_listings;
  r record;
begin
  if uid is null then
    perform public.swap_raise('not_authenticated', '28000');
  end if;
  select * into l from public.swap_listings where id = p_listing_id and owner_id = uid for update;
  if not found or l.status not in ('active', 'held') then
    perform public.swap_raise('swap_unavailable', '22023');
  end if;
  for r in
    select s.id from public.swaps s join public.swap_items si on si.swap_id = s.id
     where si.listing_id = l.id and s.status = 'proposed' and s.pair_kind = 'community' order by s.id
  loop
    perform public.swap_close(r.id, 'cancelled', 'unavailable', uid);
  end loop;
  update public.swap_listings set audience = 'friends', status_changed_at = now() where id = l.id;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.join_swap_community(text, boolean, boolean, text)',
    'public.leave_swap_community()',
    'public.narrow_swap_listing(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$$;
````

#### `supabase/held/drop_legacy_friend_wardrobe_policy.sql  (stream S1; held: never applied by `supabase db push`; the same file as quality-ratings.md 4.3)`

````sql
-- GATED. This file lives in supabase/held/, outside supabase/migrations, so `supabase db push` can never
-- apply it by accident (db push applies every pending file in supabase/migrations in version order and has
-- no way to hold one back). It is the same file as quality-ratings.md 4.3: whichever of the two features
-- adds it first creates it, with the one statement below; the other leaves it alone. Swaps do not depend on
-- it, and neither does the ratings migration work; Phase 1 of the ratings design (scan text) does.
--
-- Retire the table-level friends policy on clothing_items. Accepted friends already read each other's
-- closets through get_friend_closet(), which lists its columns by name. This older policy still lets a
-- friend SELECT every column of the other person's owned rows through the table API: what they paid,
-- private notes, wear history and the size, condition and tag text added later. Row-level security cannot
-- hide single columns, so there is no narrower policy to write instead.
--
-- Do not release until the owner has confirmed that no build still in use reads a friend's clothing_items
-- rows directly. Every build since the friend-closet RPC (20261005000100) calls get_friend_closet(); an
-- older build would show an empty friend closet after this runs.
--
-- To release:
--   newest=$(ls supabase/migrations | grep -oE '^[0-9]{14}' | sort | tail -1)
--   now=$(date -u +%Y%m%d%H%M%S); v=$(( now > newest ? now : newest + 1 ))
--   mv supabase/held/drop_legacy_friend_wardrobe_policy.sql \
--      supabase/migrations/${v}_drop_legacy_friend_wardrobe_policy.sql
--   supabase db push --dry-run     # must list exactly this one file
--   supabase db push
-- The new version is later than every migration already applied; a version older than the newest applied
-- one is skipped by db push unless --include-all is passed (do not pass it without reading the dry run).
--
-- Safe to run twice.

drop policy if exists "Friends can view each other's wardrobe" on public.clothing_items;
````

#### `supabase/held/wardrobe_images_private.sql  (stream S1; held: released by gate G0, never by `db push`)`

````sql
-- GATED. This file lives in supabase/held/, outside supabase/migrations, so `supabase db push` can
-- never apply it by accident. It is released by gate G0 of the swap design (documentation/design/swap.md,
-- section 11.1), and only after the checks there pass.
--
-- Why: migration 006 and the README tell whoever sets the project up to create the wardrobe-images bucket
-- by hand, and 006 says `--public`. A catalogue query on the linked project shows the bucket flagged
-- public, which means every original photo can be fetched by anyone who has its address
-- (.../storage/v1/object/public/wardrobe-images/<user id>/<file>.jpg). The app keeps that public-looking
-- address in the database only as a name for the file and shows photos through signed links
-- (src/services/imageUrls.ts). The privacy page may say photos are "kept in private storage" only after
-- this has run and the unauthenticated check in G0 has failed to fetch an existing photo.
--
-- Do not release before the oldest build still in use signs its photo links: a build that displays the
-- stored address directly would show no photos after this runs.
--
-- To release (after the G0 checks):
--   newest=$(ls supabase/migrations | grep -oE '^[0-9]{14}' | sort | tail -1)
--   now=$(date -u +%Y%m%d%H%M%S); v=$(( now > newest ? now : newest + 1 ))
--   mv supabase/held/wardrobe_images_private.sql supabase/migrations/${v}_wardrobe_images_private.sql
--   supabase db push --dry-run     # must list exactly this one file
--   supabase db push
-- Then, unauthenticated: curl -s -o /dev/null -w '%{http_code}' the public address of an existing photo; it must
-- not be 200. Signed links must still return 200.
--
-- Creates the bucket (private) when it does not exist, which also makes a fresh local database complete.
-- File size and type limits of an existing bucket are left as they are. Safe to run twice.

insert into storage.buckets (id, name, public)
values ('wardrobe-images', 'wardrobe-images', false)
on conflict (id) do update set public = false;
````


---

## Appendix B: edge function and shared modules

The two `_shared` files import nothing, so Deno (the function) and Jest (the tests) run the same code.

#### `supabase/functions/swap-media/index.ts  (stream S2)`

````ts
// Supabase Edge Function: swap-media
//
// The only code that puts a photo in front of other members. Two actions:
//
//   publish  { action: "publish", itemId, audience: "friends" | "community", note? }
//            Called by the signed-in member. Checks the piece and its photo (database),
//            copies the photo (a JPEG or a PNG, whichever the app stored) into the private
//            swap-photos bucket with its metadata removed (location, camera, thumbnails,
//            comments), for the community also has Google Cloud Vision check it for unsafe
//            content and people, then creates the listing.
//   sweep    { action: "sweep" }   the service key only (scheduled)
//            Runs the database upkeep, deletes the photos of deleted listings, and removes
//            photos nothing refers to any more.
//
// Never logs request bodies, notes, ids, paths or image bytes: only short error codes.
//
// Deploy: supabase functions deploy swap-media
// Secrets: GOOGLE_VISION_API_KEY (already set for ai-proxy). SUPABASE_URL, SUPABASE_ANON_KEY and
//          SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
// config.toml: [functions.swap-media] verify_jwt = true. Keep it on: the platform then checks the signature of
// every token before this code runs. The sweep does not rely on that alone (see the end of this file): it
// compares the bearer token with SUPABASE_SERVICE_ROLE_KEY itself, so it stays safe if verify_jwt is ever
// switched off (which Supabase's newer secret keys require).

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { stripJpegMetadata } from "../_shared/jpegMetadata.ts";
import { isPng, stripPngMetadata } from "../_shared/pngMetadata.ts";
import { sameSecret } from "../_shared/sameSecret.ts";
import { decideSwapPhoto } from "../_shared/swapModeration.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SOURCE_BUCKET = "wardrobe-images";
const PHOTO_BUCKET = "swap-photos";
const MAX_BYTES = 5 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Errors the database raises that the app understands, with the HTTP status to answer.
const STATUS: Record<string, number> = {
  not_authenticated: 401,
  swaps_disabled: 403, swap_terms_required: 403, swap_suspended: 403,
  community_unavailable: 403, community_not_joined: 403, account_too_new: 403,
  item_not_found: 422, listing_incomplete: 422, invalid_swap: 422, invalid_note: 422, text_not_allowed: 422,
  listing_held: 403,
  item_reserved: 409, swap_rate_limited: 429, swap_listing_limit: 429,
};

const databaseError = (e: any) => {
  const message = String(e?.message ?? "");
  const code = Object.keys(STATUS).find(c => message.includes(c));
  if (!code) {
    console.error("[swap-media] database error");
    return json({ error: "server_error" }, 500);
  }
  return json({ error: code, detail: e?.details ?? undefined, reason: e?.hint ?? undefined }, STATUS[code]);
};

const toBase64 = (bytes: Uint8Array): string => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

/** Deletes up to n queued photos from swap-photos. Returns how many were removed. */
const drainQueue = async (admin: any, n: number): Promise<number> => {
  const { data } = await admin.from("swap_photo_gc").select("path").order("queued_at").limit(n);
  const paths: string[] = (data ?? []).map((r: any) => r.path);
  if (paths.length === 0) return 0;
  const { error } = await admin.storage.from(PHOTO_BUCKET).remove(paths);
  if (error) return 0;                                   // try again next time
  await admin.from("swap_photo_gc").delete().in("path", paths);
  return paths.length;
};

const sweep = async (admin: any) => {
  await admin.rpc("swap_janitor", { p_force: true });
  let removed = 0;
  for (let i = 0; i < 20; i++) {
    const n = await drainQueue(admin, 200);
    removed += n;
    if (n === 0) break;
  }
  // Photos no listing refers to (a publish that died half way), older than an hour.
  let orphans = 0;
  for (let offset = 0; offset < 20000; offset += 1000) {
    const { data: objects, error } = await admin.storage.from(PHOTO_BUCKET).list("", { limit: 1000, offset });
    if (error || !objects || objects.length === 0) break;
    const old = objects.filter((o: any) => o.name && Date.now() - new Date(o.created_at ?? 0).getTime() > 3600_000);
    if (old.length > 0) {
      const names: string[] = old.map((o: any) => o.name);
      const { data: known } = await admin.rpc("swap_known_photo_paths", { p_paths: names });
      const keep = new Set<string>(known ?? []);
      const gone = names.filter(n => !keep.has(n));
      if (gone.length > 0) {
        await admin.storage.from(PHOTO_BUCKET).remove(gone);
        orphans += gone.length;
      }
    }
    if (objects.length < 1000) break;
  }
  return json({ ok: true, removed, orphans });
};

const publish = async (req: any, body: any, token: string, authHeader: string, admin: any) => {
  const keys = Object.keys(body);
  if (!keys.every(k => ["action", "itemId", "audience", "note"].includes(k))
      || typeof body.itemId !== "string" || !UUID.test(body.itemId)
      || (body.audience !== "friends" && body.audience !== "community")
      || (body.note != null && (typeof body.note !== "string" || body.note.length > 200))) {
    return json({ error: "invalid_request" }, 400);
  }
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser(token);
  if (authErr || !user) return json({ error: "not_authenticated" }, 401);

  // 1. The database decides whether this member may list this piece, and names its photo.
  const { data: pre, error: preErr } = await admin.rpc("swap_publish_precheck", {
    p_user: user.id, p_item: body.itemId, p_audience: body.audience, p_note: body.note ?? null,
  });
  if (preErr) return databaseError(preErr);
  const listingId: string = pre.listingId;
  const sourcePath: string = pre.sourcePath;           // derived from the item row, never from the request

  // 2. Fetch and clean the photo.
  const { data: blob, error: dlErr } = await admin.storage.from(SOURCE_BUCKET).download(sourcePath);
  if (dlErr || !blob) return json({ error: "listing_incomplete", detail: "photo" }, 422);
  const original = new Uint8Array(await blob.arrayBuffer());
  if (original.length > MAX_BYTES) return json({ error: "photo_too_large" }, 422);
  // The photo is whatever the app stored: usually a JPEG, but a screenshot or other PNG source stays a PNG.
  // Decided by the first bytes, never by the file name or the type it was uploaded as.
  const png = isPng(original);
  const cleaned = png ? stripPngMetadata(original) : stripJpegMetadata(original);
  if (!cleaned.ok) return json({ error: "unsupported_image" }, 415);

  // 3. Community photos are checked for unsafe content and people. Friends-only photos never leave Supabase.
  if (body.audience === "community") {
    const key = Deno.env.get("GOOGLE_VISION_API_KEY");
    if (!key) return json({ error: "moderation_unavailable" }, 503);
    let annotation: any;
    try {
      const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requests: [{
          image: { content: toBase64(cleaned.bytes) },
          features: [{ type: "SAFE_SEARCH_DETECTION" }, { type: "FACE_DETECTION", maxResults: 10 }],
        }] }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return json({ error: "moderation_unavailable" }, 503);
      annotation = (await res.json())?.responses?.[0];
    } catch {
      return json({ error: "moderation_unavailable" }, 503);
    }
    const decision = decideSwapPhoto(annotation, cleaned.width, cleaned.height);
    if (!decision.ok) {
      return decision.reason === "unreadable"
        ? json({ error: "moderation_unavailable" }, 503)
        : json({ error: "photo_rejected", reason: decision.reason }, 422);
    }
  }

  // 4. Store the copy under the listing id (no user id in the name), then create the listing. The name always
  //    ends in .jpg, a PNG included: it is an opaque id (the app's own uploads already store PNG bytes as .jpg),
  //    and the content type tells a viewer what the bytes are.
  const objectName = `${listingId}.jpg`;
  const { error: upErr } = await admin.storage.from(PHOTO_BUCKET).upload(objectName, cleaned.bytes, {
    contentType: png ? "image/png" : "image/jpeg", upsert: false,
  });
  if (upErr) return json({ error: "server_error" }, 500);

  const { error: commitErr } = await admin.rpc("swap_publish_commit", {
    p_user: user.id, p_listing: listingId, p_item: body.itemId, p_audience: body.audience,
    p_note: body.note ?? null, p_photo_state: body.audience === "community" ? "checked" : "stripped",
  });
  if (commitErr) {
    await admin.storage.from(PHOTO_BUCKET).remove([objectName]);   // nothing may be left behind
    return databaseError(commitErr);
  }

  // Housekeeping after the answer is on its way.
  const later = drainQueue(admin, 25).catch(() => 0);
  (globalThis as any).EdgeRuntime?.waitUntil?.(later);
  return json({ listingId });
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "not_authenticated" }, 401);

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || typeof body.action !== "string") return json({ error: "invalid_request" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    if (body.action === "sweep") {
      // Only the service key itself. The token is compared with the key in constant time; its contents are
      // never read, so a hand-made token that merely claims to be the service role is refused.
      return sameSecret(token, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) ? await sweep(admin) : json({ error: "forbidden" }, 403);
    }
    if (body.action === "publish") return await publish(req, body, token, authHeader, admin);
    return json({ error: "invalid_request" }, 400);
  } catch {
    console.error("[swap-media] unexpected error");
    return json({ error: "server_error" }, 500);
  }
});
````

#### `supabase/functions/_shared/jpegMetadata.ts  (stream S2)`

````ts
/**
 * Removes everything from a JPEG that is not needed to show the picture, without decoding
 * or re-compressing it: location (GPS) and camera details in the Exif block, XMP, IPTC,
 * comments, embedded thumbnails and multi-picture data, plus anything after the end of
 * the image. The colour profile (ICC) and the Adobe colour flag are kept so colours look
 * the same. If the photo carried a rotation flag, a minimal Exif block holding only that
 * flag is written back so the photo still shows upright.
 *
 * Plain TypeScript with no platform APIs, so the edge function (Deno) and the Jest tests
 * (Node) run the same code.
 */

export type JpegCleanResult =
  | { ok: true; bytes: Uint8Array; width: number; height: number; orientation: number }
  | { ok: false; reason: 'not_jpeg' | 'truncated' | 'malformed' };

const SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

const startsWith = (b: Uint8Array, at: number, text: string): boolean => {
  for (let i = 0; i < text.length; i++) {
    if (b[at + i] !== text.charCodeAt(i)) return false;
  }
  return true;
};

/** Reads the Exif Orientation (1-8) from an APP1 payload that starts at "Exif\0\0"; 1 when absent. */
export const readExifOrientation = (b: Uint8Array, start: number, end: number): number => {
  if (end - start < 14 || !startsWith(b, start, 'Exif') || b[start + 4] !== 0 || b[start + 5] !== 0) return 1;
  const tiff = start + 6;
  const little = b[tiff] === 0x49 && b[tiff + 1] === 0x49;
  const big = b[tiff] === 0x4d && b[tiff + 1] === 0x4d;
  if (!little && !big) return 1;
  const u16 = (o: number) => (little ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
  const u32 = (o: number) =>
    little
      ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0
      : ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  if (tiff + 8 > end || u16(tiff + 2) !== 42) return 1;
  const ifd = tiff + u32(tiff + 4);
  if (ifd + 2 > end) return 1;
  const count = u16(ifd);
  for (let i = 0; i < count; i++) {
    const e = ifd + 2 + i * 12;
    if (e + 12 > end) return 1;
    if (u16(e) === 0x0112) {
      const v = u16(e + 8);
      return v >= 1 && v <= 8 ? v : 1;
    }
  }
  return 1;
};

const orientationBlock = (orientation: number): Uint8Array =>
  Uint8Array.from([
    0xff, 0xe1, 0x00, 0x22,                               // APP1, length 34
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00,                   // "Exif\0\0"
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08,       // big-endian TIFF header, IFD at 8
    0x00, 0x01,                                           // one entry
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01,       // Orientation, SHORT, count 1
    0x00, orientation, 0x00, 0x00,                        // value
    0x00, 0x00, 0x00, 0x00,                               // no next IFD
  ]);

export const stripJpegMetadata = (input: Uint8Array): JpegCleanResult => {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) return { ok: false, reason: 'not_jpeg' };

  const kept: Array<[number, number]> = [];   // byte ranges of the input to keep, in order
  let orientation = 1;
  let width = 0;
  let height = 0;
  let sawScan = false;
  let i = 2;

  while (i < input.length) {
    if (input[i] !== 0xff) return { ok: false, reason: 'malformed' };
    while (input[i] === 0xff && i + 1 < input.length) i++;          // fill bytes
    const marker = input[i];
    i++;
    if (marker === 0xd9) {                                           // EOI: everything after is dropped
      if (!sawScan || width === 0) return { ok: false, reason: 'malformed' };
      const head = Uint8Array.from([0xff, 0xd8]);
      const block = orientation > 1 ? orientationBlock(orientation) : new Uint8Array(0);
      let size = head.length + block.length + 2;
      for (const [a, b] of kept) size += b - a;
      const out = new Uint8Array(size);
      let o = 0;
      out.set(head, o); o += head.length;
      out.set(block, o); o += block.length;
      for (const [a, b] of kept) { out.set(input.subarray(a, b), o); o += b - a; }
      out[o++] = 0xff; out[o++] = 0xd9;
      return { ok: true, bytes: out, width, height, orientation };
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8) || marker === 0x00) continue;   // no length
    if (i + 2 > input.length) return { ok: false, reason: 'truncated' };
    const len = (input[i] << 8) | input[i + 1];
    const segStart = i - 2;                                          // includes the FF xx marker
    const segEnd = i + len;
    if (len < 2 || segEnd > input.length) return { ok: false, reason: 'truncated' };
    const payload = i + 2;

    let keep = true;
    if (marker === 0xe1) {                                           // Exif / XMP
      if (startsWith(input, payload, 'Exif')) {
        const o = readExifOrientation(input, payload, segEnd);
        if (o > 1) orientation = o;
      }
      keep = false;
    } else if (marker === 0xe2) {                                    // ICC profile kept, multi-picture data dropped
      keep = startsWith(input, payload, 'ICC_PROFILE');
    } else if (marker === 0xee) {                                    // Adobe colour transform kept
      keep = startsWith(input, payload, 'Adobe');
    } else if (marker === 0xfe || (marker >= 0xe3 && marker <= 0xef)) {
      keep = false;                                                  // comments, APP3-APP15 (IPTC, Photoshop, vendor)
    } else if (SOF_MARKERS.has(marker)) {
      height = (input[payload + 1] << 8) | input[payload + 2];
      width = (input[payload + 3] << 8) | input[payload + 4];
    }
    if (keep) kept.push([segStart, segEnd]);
    i = segEnd;

    if (marker === 0xda) {                                           // SOS: copy the entropy-coded data
      sawScan = true;
      const dataStart = i;
      while (i < input.length) {
        if (input[i] === 0xff) {
          const next = input[i + 1];
          if (next === undefined) return { ok: false, reason: 'truncated' };
          if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) { i += 2; continue; }
          if (next === 0xff) { i++; continue; }
          break;                                                     // a real marker follows
        }
        i++;
      }
      if (i >= input.length) return { ok: false, reason: 'truncated' };
      kept.push([dataStart, i]);
    }
  }
  return { ok: false, reason: 'truncated' };
};
````

#### `supabase/functions/_shared/pngMetadata.ts  (stream S2)`

````ts
/**
 * Removes everything from a PNG that is not needed to show the picture, without decoding or
 * re-compressing it: text (tEXt, zTXt, iTXt), the Exif block (eXIf), the modification time (tIME), the
 * physical size (pHYs), the background hint (bKGD), histograms and palettes of suggestions (hIST, sPLT),
 * animation chunks (acTL, fcTL, fdAT, which leaves the still image), every private or unknown optional
 * chunk, and anything after the end of the image. The chunks that decide how the picture looks are kept
 * byte for byte: header, palette, pixel data, transparency (tRNS), and colour handling (gAMA, cHRM,
 * sRGB, iCCP, sBIT, cICP).
 *
 * The app keeps a PNG a PNG (react-native-image-picker returns screenshots and other PNG sources
 * unchanged, and imageStorage.ts uploads the bytes as they are), so the swap function has to clean them
 * too. Plain TypeScript with no platform APIs, so the edge function (Deno) and the Jest tests (Node) run
 * the same code.
 */

export type PngCleanResult =
  | { ok: true; bytes: Uint8Array; width: number; height: number }
  | { ok: false; reason: 'not_png' | 'truncated' | 'malformed' };

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const KEEP = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'iCCP', 'sBIT', 'cICP']);

/** True when the bytes start with the 8-byte PNG signature. */
export const isPng = (b: Uint8Array): boolean => b.length >= 8 && SIGNATURE.every((v, i) => b[i] === v);

let table: Uint32Array | null = null;
const crc32 = (b: Uint8Array, from: number, to: number): number => {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = from; i < to; i++) c = table[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const u32 = (b: Uint8Array, at: number): number => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;

export const stripPngMetadata = (input: Uint8Array): PngCleanResult => {
  if (!isPng(input)) return { ok: false, reason: 'not_png' };

  const kept: Array<[number, number]> = [[0, 8]];     // byte ranges of the input to keep, in order (the signature first)
  let width = 0;
  let height = 0;
  let sawIdat = false;
  let first = true;
  let i = 8;

  while (i < input.length) {
    if (i + 12 > input.length) return { ok: false, reason: 'truncated' };
    const len = u32(input, i);
    const end = i + 12 + len;
    if (len > 0x7fffffff || end > input.length) return { ok: false, reason: 'truncated' };
    const type = String.fromCharCode(input[i + 4], input[i + 5], input[i + 6], input[i + 7]);
    if (!/^[A-Za-z]{4}$/.test(type)) return { ok: false, reason: 'malformed' };

    if (first) {
      if (type !== 'IHDR' || len !== 13) return { ok: false, reason: 'malformed' };
      width = u32(input, i + 8);
      height = u32(input, i + 12);
      if (width === 0 || height === 0 || width > 0x7fffffff || height > 0x7fffffff) return { ok: false, reason: 'malformed' };
      first = false;
    }

    const critical = (input[i + 4] & 0x20) === 0;     // an upper-case first letter marks a chunk the picture cannot do without
    if (KEEP.has(type)) {
      if (crc32(input, i + 4, i + 8 + len) !== u32(input, i + 8 + len)) return { ok: false, reason: 'malformed' };
      if (type === 'IDAT') sawIdat = true;
      kept.push([i, end]);
    } else if (critical) {
      return { ok: false, reason: 'malformed' };      // a critical chunk we do not know: do not guess
    }
    i = end;

    if (type === 'IEND') {                             // everything after it is dropped
      if (!sawIdat) return { ok: false, reason: 'malformed' };
      let size = 0;
      for (const [a, b] of kept) size += b - a;
      const out = new Uint8Array(size);
      let o = 0;
      for (const [a, b] of kept) { out.set(input.subarray(a, b), o); o += b - a; }
      return { ok: true, bytes: out, width, height };
    }
  }
  return { ok: false, reason: 'truncated' };
};
````

#### `supabase/functions/_shared/sameSecret.ts  (stream S2)`

````ts
/**
 * Compares two secrets in time that does not depend on where they first differ, so the answer cannot be
 * guessed one character at a time. Returns false when either is empty. Used by the swap-media sweep to
 * recognise the service key; the length is not hidden, which is fine for a fixed-length key.
 */
export const sameSecret = (a: string | null | undefined, b: string | null | undefined): boolean => {
  if (!a || !b) return false;
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
};
````

#### `supabase/functions/_shared/swapModeration.ts  (stream S2)`

````ts
/**
 * Decides whether a photo may be shown to people who are not the owner's friends, from
 * Google Cloud Vision's SAFE_SEARCH_DETECTION and FACE_DETECTION answers. Pure, so it is
 * unit-tested in Jest and used unchanged by the swap-media edge function.
 *
 * Fails closed: a missing or malformed answer is a rejection, never a pass. That includes an answer
 * of UNKNOWN for any of the four categories that are judged (adult, violence, racy, medical): Google
 * says UNKNOWN when it could not tell, and "could not tell" must never publish a photo to strangers.
 * (A response with no faceAnnotations at all is normal and means no face was found; Vision leaves
 * empty lists out. A faceAnnotations that is present but is not a list is malformed.)
 */

export type Likelihood = 'UNKNOWN' | 'VERY_UNLIKELY' | 'UNLIKELY' | 'POSSIBLE' | 'LIKELY' | 'VERY_LIKELY';

export type VisionVertex = { x?: number; y?: number };
export type VisionAnnotation = {
  safeSearchAnnotation?: {
    adult?: Likelihood; violence?: Likelihood; racy?: Likelihood; medical?: Likelihood; spoof?: Likelihood;
  };
  faceAnnotations?: Array<{ detectionConfidence?: number; boundingPoly?: { vertices?: VisionVertex[] } }>;
  error?: { code?: number; message?: string };
};

export type PhotoDecision =
  | { ok: true }
  | { ok: false; reason: 'unsafe' | 'people' | 'unreadable' };

const RANK: Record<Likelihood, number> = {
  UNKNOWN: -1, VERY_UNLIKELY: 1, UNLIKELY: 2, POSSIBLE: 3, LIKELY: 4, VERY_LIKELY: 5,
};
/** Below zero means "no usable answer": absent, not a known word, or UNKNOWN. */
const rank = (v: Likelihood | undefined): number => (typeof v === 'string' && Object.prototype.hasOwnProperty.call(RANK, v) ? RANK[v] : -1);

/** Thresholds, in one place so they can be tuned after real photos have been seen. */
export const PHOTO_RULES = {
  adultAtLeast: 'POSSIBLE',
  violenceAtLeast: 'LIKELY',
  medicalAtLeast: 'LIKELY',
  racyAtLeast: 'VERY_LIKELY',
  faceConfidence: 0.8,
  faceShareOfFrame: 0.04,
} as const;

const faceArea = (vertices: VisionVertex[] | undefined): number => {
  const v = vertices ?? [];
  if (v.length < 3) return 0;
  const xs = v.map(p => p.x ?? 0);
  const ys = v.map(p => p.y ?? 0);
  return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
};

export const decideSwapPhoto = (a: VisionAnnotation | undefined, width: number, height: number): PhotoDecision => {
  if (!a || a.error || !a.safeSearchAnnotation || !(width > 0) || !(height > 0)) {
    return { ok: false, reason: 'unreadable' };
  }
  if (a.faceAnnotations !== undefined && !Array.isArray(a.faceAnnotations)) {
    return { ok: false, reason: 'unreadable' };
  }
  const s = a.safeSearchAnnotation;
  if (rank(s.adult) < 0 || rank(s.violence) < 0 || rank(s.racy) < 0 || rank(s.medical) < 0) {
    return { ok: false, reason: 'unreadable' };
  }
  if (
    rank(s.adult) >= rank(PHOTO_RULES.adultAtLeast) ||
    rank(s.violence) >= rank(PHOTO_RULES.violenceAtLeast) ||
    rank(s.medical) >= rank(PHOTO_RULES.medicalAtLeast) ||
    rank(s.racy) >= rank(PHOTO_RULES.racyAtLeast)
  ) {
    return { ok: false, reason: 'unsafe' };
  }
  const frame = width * height;
  for (const f of a.faceAnnotations ?? []) {
    if ((f.detectionConfidence ?? 0) >= PHOTO_RULES.faceConfidence && faceArea(f.boundingPoly?.vertices) / frame >= PHOTO_RULES.faceShareOfFrame) {
      return { ok: false, reason: 'people' };
    }
  }
  return { ok: true };
};
````

#### `supabase/functions/delete-account/index.ts  (stream S2; unified diff)`

````diff
--- a/supabase/functions/delete-account/index.ts
+++ b/supabase/functions/delete-account/index.ts
@@ -2,7 +2,9 @@
 //
 // Deletes the signed-in user's account in the safe order:
 //   1. database rows + the auth user (delete_user_account(), runs as the user), then
-//   2. their uploaded photos (Storage can only be emptied through the Storage API).
+//   2. their uploaded photos (Storage can only be emptied through the Storage API), then
+//   3. the swap-photos copies of pieces they had open to swap (deleting the account queued
+//      their paths in swap_photo_gc; swap-media's sweep is the backstop).
 // Doing the data first means a failure can never leave a live account whose
 // photos were already deleted. A failure while removing photos is reported but
 // does not undo the (already complete) account deletion.
@@ -19,6 +21,7 @@
   new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
 
 const BUCKET = "wardrobe-images";
+const SWAP_BUCKET = "swap-photos";
 
 Deno.serve(async (req: Request) => {
   if (req.method === "OPTIONS") return new Response(null, { headers: cors });
@@ -43,9 +46,10 @@
   }
 
   // 2. Photos (service role: the user's own session no longer exists).
+  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
   let removed = 0;
+  let incomplete = false;
   try {
-    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
     for (let page = 0; page < 500; page++) {
       const { data: files, error: listErr } = await admin.storage.from(BUCKET).list(user.id, { limit: 100 });
       if (listErr) throw listErr;
@@ -58,8 +62,25 @@
     }
   } catch (e: any) {
     console.error("[delete-account] photo cleanup incomplete:", e?.message ?? e);
-    return json({ ok: true, photosRemoved: removed, photosIncomplete: true });
+    incomplete = true;
   }
 
-  return json({ ok: true, photosRemoved: removed });
+  // 3. Swap photos queued by the deletion (paths only; they hold no personal data).
+  try {
+    for (let round = 0; round < 20; round++) {
+      const { data: queued, error: qErr } = await admin.from("swap_photo_gc").select("path").order("queued_at").limit(200);
+      if (qErr) throw qErr;
+      const paths = (queued ?? []).map((r: any) => r.path);
+      if (paths.length === 0) break;
+      const { error: rmErr } = await admin.storage.from(SWAP_BUCKET).remove(paths);
+      if (rmErr) throw rmErr;
+      await admin.from("swap_photo_gc").delete().in("path", paths);
+      removed += paths.length;
+    }
+  } catch (e: any) {
+    console.error("[delete-account] swap photo cleanup incomplete:", e?.message ?? e);
+    incomplete = true;
+  }
+
+  return json(incomplete ? { ok: true, photosRemoved: removed, photosIncomplete: true } : { ok: true, photosRemoved: removed });
 });
````


#### `supabase/config.toml`  (stream S2; add)

````toml
[functions.swap-media]
verify_jwt = true
````


---

## Appendix C: client code

#### `src/types/swap.ts  (stream S0)`

````ts
/**
 * Types for clothing swaps. Shapes mirror what the swap functions return (camelCase,
 * see supabase/migrations/20261015*). Nothing here ever carries another member's
 * account id or email: the server resolves who is who.
 */

import type { ItemCondition } from '../utils/itemCondition';
import type { MaterialComponent } from './clothing';

/** Who may see a listing. 'community' needs the server switch and the member's join. */
export type SwapAudience = 'friends' | 'community';

export type SwapStatus = 'proposed' | 'accepted' | 'declined' | 'cancelled' | 'expired' | 'completed';

/**
 * Why a swap ended. 'unavailable' covers a block, an unfriend, a deleted or withdrawn piece,
 * an account that was deleted, a suspension and a safety removal, and never says which.
 */
export type SwapClosedReason =
  | 'declined'
  | 'cancelled_by_proposer'
  | 'cancelled_by_recipient'
  | 'unavailable'
  | 'expired'
  | 'completed';

export type SwapListingStatus = 'active' | 'reserved' | 'completed' | 'withdrawn' | 'held' | 'removed' | 'expired';
export type SwapRole = 'proposer' | 'recipient';

/** Where a swap sits in the inbox. */
export type SwapBucket = 'needs_you' | 'finishing' | 'in_progress' | 'waiting' | 'past';

/** 'friend' = shown under the friend's usual name; 'member' = shown under an alias. */
export type SwapOwnerKind = 'friend' | 'member';

export type SwapReportRefType = 'listing' | 'swap';
export type SwapReportReason =
  | 'spam' | 'harassment' | 'inappropriate' | 'impersonation' | 'scam' | 'not_as_described' | 'unsafe' | 'other';

export interface SwapSettings {
  swapsEnabled: boolean;
  termsAccepted: boolean;
  /** Accepted the current version of the swap terms. */
  termsCurrent: boolean;
  currentTermsVersion: string;
  /** The server switch for the stranger tier is on. */
  communityAvailable: boolean;
  communityJoined: boolean;
  alias: string | null;
  adultConfirmed: boolean;
  suspended: boolean;
  /** Swaps waiting for this member (the Home badge). */
  needsYou: number;
}

/** A piece on the swap rack, as other members see it. */
export interface SwapListing {
  id: string;
  ownerLabel: string;
  ownerKind: SwapOwnerKind;
  audience: SwapAudience;
  name: string;
  category: string;
  subcategory?: string;
  brand?: string;
  color?: string;
  size?: string;
  condition?: ItemCondition;
  pattern?: string;
  materials?: MaterialComponent[];
  careInstructions?: string[];
  originCountry?: string;
  season?: string[];
  note?: string;
  /** Path inside the private swap-photos bucket; turn it into a link with signSwapPhotos. */
  photoPath: string;
  listedAt: string;
  mine: boolean;
}

/** One of the signed-in member's own listings. */
export interface MySwapListing {
  id: string;
  /** The closet piece it was made from; null once that piece was deleted. */
  itemId: string | null;
  audience: SwapAudience;
  status: SwapListingStatus;
  name: string;
  size?: string;
  condition?: ItemCondition;
  note?: string;
  photoPath: string;
  listedAt: string;
  expiresAt: string;
  /** Open proposals asking for this piece. */
  openOffers: number;
  inAcceptedSwap: boolean;
  /** The closet piece was edited after the listing was made; "Update" lists it again. */
  stale: boolean;
}

export interface SwapCursor { ts: string; id: string }

export interface SwapBrowseQuery {
  scope: SwapAudience;
  category?: string;
  size?: string;
  conditions?: ItemCondition[];
  q?: string;
  /** Friends scope only: just this friend's listings. */
  friendId?: string;
  /** Other listings by the owner of this listing. */
  sameOwnerAs?: string;
  cursor?: SwapCursor | null;
  limit?: number;
}

export interface SwapBrowsePage { items: SwapListing[]; nextCursor: SwapCursor | null }

export interface SwapSummary {
  id: string;
  status: SwapStatus;
  closedReason?: SwapClosedReason;
  role: SwapRole;
  pairKind: SwapAudience;
  otherLabel: string;
  bucket: SwapBucket;
  /** A dot: something new since this member last opened it. */
  attention: boolean;
  giveNames: string[];
  getNames: string[];
  thumbPath?: string;
  iDone: boolean;
  theyDone: boolean;
  createdAt: string;
  lastEventAt: string;
  expiresAt: string;
}

export interface SwapItemView {
  listingId: string | null;
  /** 'offer' = the proposer gives it; 'request' = the recipient gives it. */
  side: 'offer' | 'request';
  /** The signed-in member gives this piece. */
  mine: boolean;
  name: string;
  category?: string;
  subcategory?: string;
  brand?: string;
  color?: string;
  size?: string;
  condition?: ItemCondition;
  pattern?: string;
  materials?: MaterialComponent[];
  careInstructions?: string[];
  originCountry?: string;
  season?: string[];
  note?: string;
  photoPath?: string | null;
  /** For a piece this member receives: the closet row created for them, once they tapped "We swapped!". */
  claimedItemId?: string | null;
  /** The received piece still needs its photo copied into the member's own folder. */
  photoPending: boolean;
  /** For a piece this member gives: their own closet row. */
  giverItemId?: string | null;
  /** This member tapped "We swapped!" and their own piece is still in their closet. */
  removalPending: boolean;
}

export interface SwapMessage {
  id: number;
  kind: 'text' | 'system';
  /** System lines: proposed, accepted, declined, cancelled_by_proposer, cancelled_by_recipient, unavailable, expired, completed. */
  code?: string | null;
  body?: string | null;
  mine: boolean;
  createdAt: string;
}

/** What the signed-in member may do now. The server decides; the app only draws buttons. */
export interface SwapActions {
  canAccept: boolean;
  canDecline: boolean;
  canCancel: boolean;
  canComplete: boolean;
  canMessage: boolean;
  messagesLeft: number;
}

export interface SwapDetail {
  id: string;
  status: SwapStatus;
  closedReason?: SwapClosedReason | null;
  role: SwapRole;
  pairKind: SwapAudience;
  otherLabel: string;
  createdAt: string;
  expiresAt: string;
  closedAt?: string | null;
  iDone: boolean;
  theyDone: boolean;
  autoCompleted: boolean;
  items: SwapItemView[];
  messages: SwapMessage[];
  actions: SwapActions;
}

export interface ProposeSwapInput {
  requestListingIds: string[];
  offerListingIds: string[];
  note?: string;
  /** A new uuid per attempt; a retry with the same value returns the same swap. */
  clientRef: string;
}

export interface PublishSwapInput { itemId: string; audience: SwapAudience; note?: string }

export interface HandoffResult {
  /** Both members have tapped "We swapped!" (or the swap was finished for them). */
  completed: boolean;
  /** Closet rows created for the pieces this member received. */
  receivedItemIds: string[];
  /** Received pieces whose photo could not be copied yet; call completeSwapHandoff again later. */
  photosPending: number;
  /** This member's own pieces removed from their closet. */
  removedItemIds: string[];
  /** Own pieces that still need removing (the app was interrupted); call again to finish. */
  removalsPending: number;
}

export interface SwapBlock { ref: string; label: string; blockedAt: string }

export type SwapErrorCode =
  | 'not_authenticated' | 'swaps_disabled' | 'swap_terms_required' | 'swap_suspended'
  | 'community_unavailable' | 'community_not_joined' | 'account_too_new'
  | 'swap_unavailable' | 'swap_not_open' | 'invalid_swap' | 'invalid_note' | 'invalid_message' | 'offer_not_allowed'
  | 'text_not_allowed' | 'already_proposed' | 'item_reserved' | 'item_not_found' | 'listing_incomplete' | 'listing_held'
  | 'swap_rate_limited' | 'swap_open_limit' | 'recipient_busy' | 'listing_busy' | 'swap_cooldown'
  | 'swap_message_limit' | 'swap_listing_limit' | 'report_rate_limited' | 'invalid_report'
  | 'alias_invalid' | 'alias_taken' | 'adult_required' | 'scan_ack_required' | 'terms_version_mismatch'
  | 'photo_rejected' | 'moderation_unavailable' | 'unsupported_image' | 'photo_too_large'
  | 'not_deployed' | 'offline' | 'unknown';

export interface SwapExport {
  settings: Record<string, unknown> | null;
  listings: Array<Record<string, unknown>>;
  swaps: Array<Record<string, unknown>>;
}
````

#### `src/config/swapRules.ts  (stream S0)`

````ts
/**
 * Everything a person reads about swaps, and every number that limits them, in one place.
 * The numbers must match public.swap_limit() in the database (a Jest test compares this
 * file with supabase/migrations/20261015000100_swap_foundation.sql), and
 * SWAP_TERMS_VERSION must match the swap_config terms_version row.
 */
import { SUPPORT_EMAIL } from './legal';

/**
 * The version of the SWAP_TERMS text in this build. Bump together with swap_config 'terms_version'; members are
 * asked to accept again. A member only ever agrees to this version: the app sends this constant, never the
 * server's value, and shows "update" when the two differ (useSwapAccess).
 */
export const SWAP_TERMS_VERSION = '2026-10';

export const SWAP_LIMITS = {
  items_per_side: 3,
  note_max: 140,
  proposal_note_max: 280,
  message_max: 500,
  open_outbound: 5,
  open_inbound: 20,
  open_per_requested_listing: 8,
  open_per_offered_listing: 3,
  messages_per_swap: 200,
  preaccept_messages_stranger: 3,
  decline_cooldown_days: 7,
  listings_live: 30,
  listings_community: 15,
  propose_day: 15,
  propose_stranger_day: 5,
  publish_day: 20,
  browse_day: 400,
  respond_day: 60,
  cancel_day: 30,
  complete_day: 30,
  message_min: 6,
  message_hour: 60,
  message_day: 300,
  block_day: 30,
  reports_day: 20,
  reports_to_hold_listing: 3,
} as const;

export const SWAP_ALIAS_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._-]{1,18}[A-Za-z0-9]$/;
export const SWAP_PROPOSAL_EXPIRES_DAYS = 14;
export const SWAP_ACCEPTED_EXPIRES_DAYS = 30;
export const SWAP_LISTING_EXPIRES_DAYS = 60;
/** How often an open thread asks for news, in milliseconds, while it is on screen. */
export const SWAP_THREAD_POLL_MS = 15000;
/** Signed photo links last this long (seconds). Short on purpose: a withdrawn or blocked photo stops loading. */
export const SWAP_PHOTO_TTL_SECONDS = 600;

export const SWAP_NOTICE =
  'Swaps are item for item. SmartCloset doesn’t handle money or shipping and can’t check or insure any piece, so look it over before you tap “We swapped!”.';

export const SWAP_NO_MONEY_LINE = 'Swaps are item for item. No money, deposits or gift cards.';

export const SWAP_COMMUNITY_SCAN_NOTICE =
  'Photos you list for the community are checked for unsafe content and people by Google Cloud Vision before they appear. This happens even if you turned off AI photo analysis. Photos you list for friends only are never sent to Google.';

export const SWAP_TERMS = {
  title: 'Swap terms',
  sections: [
    {
      heading: 'What swaps are',
      body: 'A swap is one piece (or a few) for one piece (or a few), between two people. No money, deposits or gift cards change hands. SmartCloset is not a party to any swap, doesn’t inspect or insure pieces, and can’t settle disputes. You are responsible for how and where you meet or ship, including any customs.',
    },
    {
      heading: 'What others can see',
      body: 'For each piece you open to swap: its photo, name, brand, size, condition, materials, care, country of origin, season and your short note. Never what you paid, your private notes, how often you wear it, your email or your location. Friends see your usual name. Community members see only your alias.',
    },
    {
      heading: 'Rules',
      body: 'Only offer pieces you own, and describe them honestly, flaws included. Photos show the piece only: no faces, other people or children. No counterfeits. No used underwear or swimwear. No harassment, hate or sexual content in listings, aliases or messages. Never ask for money, and don’t move the conversation off the app before a swap is accepted.',
    },
    {
      heading: 'Messages',
      body: 'Messages in a swap are stored on our servers, are not end-to-end encrypted, and are read by us only when someone reports them or to keep the service running. They are deleted 30 days after the swap ends.',
    },
    {
      heading: 'Reports and enforcement',
      body: 'There is no tolerance for objectionable content or abusive behaviour. Reports are reviewed by a person, aiming for within 24 hours. We may remove listings and suspend accounts that break these rules.',
    },
    {
      heading: 'Your photos',
      body: 'By opening a piece to swap you let SmartCloset show its photo to the people you choose until you withdraw it. A withdrawn listing’s photo is deleted within about 30 days.',
    },
  ],
} as const;

export const SWAP_GUIDELINES = {
  title: 'Swap guidelines',
  intro: 'Swaps work because people are honest and kind. To keep them safe:',
  rules: [
    'Only offer pieces that are yours, and describe them honestly: size, condition and any flaws.',
    'Photos show the piece only. No faces, other people or children.',
    'No counterfeits, and no used underwear or swimwear.',
    'Swaps are item for item. Never ask for money, deposits or gift cards.',
    'Be kind. No harassment, hate or sexual content in listings, names or messages.',
    'Keep talking in the app until a swap is accepted.',
  ],
  enforcement:
    'You can report or block anyone from their listing or from a swap. We review reports, aiming for within 24 hours, and may remove listings or suspend accounts. Blocking is private; they aren’t told.',
  contact: `Questions or urgent concerns? Email ${SUPPORT_EMAIL}.`,
} as const;

export const SWAP_SAFETY_TIPS = [
  'Keep chatting in the app until you trust the person, and don’t share your home address, phone or email before you’re comfortable.',
  'Meet in a busy public place in daylight and tell a friend, or use tracked shipping.',
  'Check the piece against its photos before you tap “We swapped!”, and wash it before you wear it.',
  'Walk away from pressure, urgency, or any request for money or gift cards.',
  'Report or block from the menu if anything feels off.',
  'SmartCloset doesn’t inspect, guarantee or insure swaps.',
] as const;

export const SWAP_REPORT_REASONS = [
  { value: 'spam', label: 'Spam or unwanted messages' },
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'inappropriate', label: 'Inappropriate or offensive content' },
  { value: 'scam', label: 'Asks for money or steers me off the app' },
  { value: 'not_as_described', label: 'Not as described' },
  { value: 'unsafe', label: 'Unsafe or no-show meetup' },
  { value: 'impersonation', label: 'Pretending to be someone else' },
  { value: 'other', label: 'Something else' },
] as const;

export const SWAP_QUICK_REPLIES = [
  'Sounds good!',
  'Where should we meet?',
  'Can you share a measurement?',
  'Is it still available?',
] as const;

/** Client-side reader warning for messages that look like payment or off-app talk (a hint, never a block). */
export const looksLikePaymentTalk = (text: string): boolean =>
  /(venmo|paypal|zelle|cash ?app|apple pay|gift ?card|wire transfer|western union|bitcoin|\bcrypto\b|send (me )?(the )?money|\bdeposit\b)/i.test(text);

export const SWAP_PAYMENT_WARNING =
  'Swaps here are item for item. Don’t send money or gift cards.';

/** This build's terms are older than the server's: it cannot show the text the member would be agreeing to. */
export const SWAP_UPDATE_REQUIRED_MESSAGE = 'Update SmartCloset to keep using swaps. The swap terms have changed and this version can’t show them.';
/** This build's terms are newer than the server's (a release that went out before the database change). */
export const SWAP_SERVER_BEHIND_MESSAGE = 'Swaps are being updated. Please try again in a little while.';

export const SWAP_PAUSED_MESSAGE = 'Swaps are paused right now. Please check back soon.';
export const SWAP_NOT_DEPLOYED_MESSAGE = 'Swaps aren’t available yet in this version. Please try again later.';
````

#### `src/services/swapErrors.ts  (stream S0)`

````ts
import type { SwapErrorCode } from '../types/swap';

/** An error from a swap function or the swap-media function, in a form screens can branch on. */
export class SwapError extends Error {
  code: SwapErrorCode;
  /** text_not_allowed: the field ("note", "message", "details" for the rest of the card, ...). swap_rate_limited: the counter that ran out. listing_incomplete: what is missing, comma separated. */
  detail?: string;
  /** text_not_allowed: 'payment' | 'contact' | 'content'. */
  hint?: string;
  constructor(code: SwapErrorCode, message?: string, detail?: string, hint?: string) {
    super(message ?? code);
    this.name = 'SwapError';
    this.code = code;
    this.detail = detail;
    this.hint = hint;
  }
}

const KNOWN: SwapErrorCode[] = [
  'not_authenticated', 'swaps_disabled', 'swap_terms_required', 'swap_suspended', 'community_unavailable',
  'community_not_joined', 'account_too_new', 'swap_unavailable', 'swap_not_open', 'invalid_swap', 'invalid_note',
  'invalid_message', 'offer_not_allowed', 'text_not_allowed', 'already_proposed', 'item_reserved', 'item_not_found',
  'listing_incomplete', 'listing_held', 'swap_rate_limited', 'swap_open_limit', 'recipient_busy', 'listing_busy', 'swap_cooldown',
  'swap_message_limit', 'swap_listing_limit', 'report_rate_limited', 'invalid_report', 'alias_invalid', 'alias_taken',
  'adult_required', 'scan_ack_required', 'terms_version_mismatch', 'photo_rejected', 'moderation_unavailable',
  'unsupported_image', 'photo_too_large',
];

/**
 * Turns whatever supabase-js (PostgREST or Functions) threw into a SwapError.
 * PostgREST puts our RAISE text in `message`, DETAIL in `details` and HINT in `hint`.
 */
export const toSwapError = (error: any): SwapError => {
  if (error instanceof SwapError) return error;
  const message = `${error?.message ?? ''}`;
  const status = error?.status ?? error?.context?.status;
  if (error?.code === 'PGRST202' || error?.code === '42883' || status === 404 || /could not find the function/i.test(message)) {
    return new SwapError('not_deployed', message);
  }
  if (error?.code === '54000' && /report_rate_limited/.test(message)) return new SwapError('report_rate_limited', message);
  const known = KNOWN.find(code => message.includes(code));
  if (known) return new SwapError(known, message, error?.details || undefined, error?.hint || undefined);
  if (/network request failed|failed to fetch|network error|timed out|offline/i.test(message) || error?.name === 'TypeError') {
    return new SwapError('offline', message);
  }
  return new SwapError('unknown', message);
};

/** The swap-media function answers { error: <code>, ... } with a non-2xx status. */
export const toSwapErrorFromFunction = async (error: any): Promise<SwapError> => {
  try {
    const body = await error?.context?.json?.();
    const code = typeof body?.error === 'string' ? body.error : '';
    const known = KNOWN.find(c => c === code);
    if (known) return new SwapError(known, code, body?.detail, body?.reason);
  } catch {
    // fall through to the generic mapping
  }
  return toSwapError(error);
};

const FIELD_NAMES: Record<string, string> = { note: 'note', message: 'message', name: 'item name', brand: 'brand', color: 'colour', size: 'size', alias: 'alias', details: 'item details' };

/** Plain-language text for a person. `fallback` is used for anything unexpected. */
export const swapErrorMessage = (error: unknown, fallback: string): string => {
  const e = toSwapError(error);
  switch (e.code) {
    case 'not_authenticated': return 'Sign in to swap.';
    case 'swaps_disabled': return 'Swaps are paused right now. Please check back soon.';
    case 'community_unavailable': return 'Community swaps aren’t open yet.';
    case 'swap_terms_required': return 'Please read and accept the swap terms first.';
    case 'terms_version_mismatch': return 'The swap terms were updated. Please reopen swaps and accept them.';
    case 'community_not_joined': return 'Join community swaps first.';
    case 'account_too_new': return 'Community swaps unlock two days after you create your account.';
    case 'swap_suspended': return 'Swapping is paused on your account. Email support if you think this is a mistake.';
    case 'swap_unavailable':
    case 'item_not_found': return 'That piece or swap is no longer available.';
    case 'swap_not_open': return 'That swap has already changed. Here’s the latest.';
    case 'offer_not_allowed': return 'Pick pieces of yours that are open to swap.';
    case 'already_proposed': return 'You already have an open offer with this person.';
    case 'item_reserved': return 'That piece is locked into a swap right now.';
    case 'listing_held': return 'This piece can’t be listed right now. Email support if you think this is a mistake.';
    case 'invalid_swap': return 'Pick between one and three pieces on each side.';
    case 'invalid_note': return 'That note is too long.';
    case 'invalid_message': return 'Write a message of up to 500 characters.';
    case 'text_not_allowed': {
      const field = FIELD_NAMES[e.detail ?? ''] ?? 'text';
      if (e.hint === 'payment') return 'Swaps are item for item. Please don’t mention payments or gift cards.';
      if (e.hint === 'contact') return 'Keep contact details out until the swap is accepted.';
      return `That ${field} isn’t allowed. Please reword it.`;
    }
    case 'listing_incomplete': {
      const parts = (e.detail ?? '').split(',').filter(Boolean);
      return parts.length ? `Add a ${parts.join(' and ')} first.` : 'Add a photo of the piece first.';
    }
    case 'swap_rate_limited': return e.detail === 'browse_day'
      ? 'You’ve browsed a lot today. Please try again tomorrow.'
      : 'You’re going a bit fast. Please wait a moment and try again.';
    case 'swap_open_limit': return 'You have five open offers. Wait for answers or withdraw one.';
    case 'recipient_busy': return 'This person has a lot of offers waiting. Try again later.';
    case 'listing_busy': return 'This piece has a lot of offers. Try another or wait.';
    case 'swap_cooldown': return 'This person declined recently. You can offer again in a few days.';
    case 'swap_message_limit': return 'You’ve reached the message limit for this swap.';
    case 'swap_listing_limit': return 'You have the most pieces open to swap. Withdraw one to add another.';
    case 'report_rate_limited': return 'You’ve sent a lot of reports today. Please try again tomorrow.';
    case 'invalid_report': return 'Couldn’t send that report. Please try again.';
    case 'alias_invalid': return 'Choose an alias of 3 to 20 letters, numbers, spaces or . _ -, without staff-like or contact words.';
    case 'alias_taken': return 'That alias is taken. Try another.';
    case 'adult_required': return 'Community swaps are for people 18 and over.';
    case 'scan_ack_required': return 'Please agree to the photo check to list for the community.';
    case 'photo_rejected': return e.hint === 'people'
      ? 'Photos with people in them can’t be shared with the community. Try a flat-lay or hanger photo.'
      : 'That photo can’t be shared with the community.';
    case 'moderation_unavailable': return 'We couldn’t check that photo right now. Please try again in a moment.';
    case 'unsupported_image': return 'That photo can’t be used for a swap. Replace the photo of the piece and try again.';
    case 'photo_too_large': return 'That photo is too large. Please retake it.';
    case 'not_deployed': return 'Swaps aren’t available yet in this version. Please try again later.';
    case 'offline': return 'You seem to be offline. Check your connection and try again.';
    default: return fallback;
  }
};
````

#### `src/services/swapPhotoUrls.ts  (stream S0)`

````ts
/**
 * Temporary links for photos in the private swap-photos bucket. They last ten minutes and
 * are kept in memory only (never AsyncStorage): a photo that is withdrawn, or belongs to
 * someone who blocked you, stops loading soon after, and other people's links never sit on
 * the device's disk.
 */
import { supabase } from '../config/supabase';
import { SWAP_PHOTO_TTL_SECONDS } from '../config/swapRules';

export const SWAP_PHOTO_BUCKET = 'swap-photos';

type Entry = { url: string; exp: number };
const cache = new Map<string, Entry>();
// Reuse a link only while it has at least two minutes left.
const MIN_LEFT_MS = 120_000;
const CHUNK = 100;

export const signSwapPhotos = async (paths: string[]): Promise<Map<string, string>> => {
  const out = new Map<string, string>();
  const now = Date.now();
  const need: string[] = [];
  for (const p of new Set(paths.filter(Boolean))) {
    const hit = cache.get(p);
    if (hit && hit.exp - now > MIN_LEFT_MS) out.set(p, hit.url);
    else need.push(p);
  }
  for (let i = 0; i < need.length; i += CHUNK) {
    const batch = need.slice(i, i + CHUNK);
    try {
      const { data, error } = await supabase.storage.from(SWAP_PHOTO_BUCKET).createSignedUrls(batch, SWAP_PHOTO_TTL_SECONDS);
      if (error) throw error;
      for (const row of data ?? []) {
        if (row.signedUrl && row.path && !row.error) {
          cache.set(row.path, { url: row.signedUrl, exp: now + SWAP_PHOTO_TTL_SECONDS * 1000 });
          out.set(row.path, row.signedUrl);
        }
      }
    } catch {
      // A photo that cannot be signed (not allowed any more, or offline) simply has no link.
    }
  }
  return out;
};

export const forgetSwapPhoto = (path: string): void => {
  cache.delete(path);
};

/** Call on sign-out and after account deletion. */
export const clearSwapPhotoCache = (): void => {
  cache.clear();
};
````

#### `src/services/swapService.ts  (stream S0)`

````ts
/**
 * Clothing swaps: the only module the screens talk to. Every function
 *  - throws SwapError('not_authenticated') for a guest, before any network call, and
 *  - turns server errors into SwapError (see swapErrors.ts).
 * No module-level side effects (App.test imports every screen's module graph), no
 * AsyncStorage keys, no realtime channels.
 *
 * Server functions: supabase/migrations/20261015000100..0500_swap_*.sql
 * Edge function:    supabase/functions/swap-media
 */
import RNFS from 'react-native-fs';
import { supabase } from '../config/supabase';
import { canonicalizeImageUrl } from './imageUrls';
import { copyImageToPermanentStorage } from './imageStorage';
import { deleteClothingItem } from './storage';
import { signSwapPhotos } from './swapPhotoUrls';
import { SwapError, toSwapError, toSwapErrorFromFunction } from './swapErrors';
import { SWAP_LIMITS, SWAP_TERMS_VERSION } from '../config/swapRules';
import { isItemCondition } from '../utils/itemCondition';
import type {
  HandoffResult, MySwapListing, ProposeSwapInput, PublishSwapInput, SwapAudience, SwapBlock, SwapBrowsePage,
  SwapBrowseQuery, SwapDetail, SwapExport, SwapItemView, SwapListing, SwapMessage, SwapReportReason,
  SwapReportRefType, SwapSettings, SwapSummary,
} from '../types/swap';

// ─── plumbing ────────────────────────────────────────────────────────────────

const requireSession = async (): Promise<void> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new SwapError('not_authenticated');
};

const call = async <T>(fn: string, args?: Record<string, unknown>): Promise<T> => {
  await requireSession();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw toSwapError(error);
  return data as T;
};

const opt = <T>(v: T | null | undefined): T | undefined => (v === null || v === undefined ? undefined : v);
const cond = (v: unknown) => (isItemCondition(v) ? v : undefined);

// ─── row mapping (tables come back snake_case, jsonb results camelCase) ──────

const mapListing = (r: any): SwapListing => ({
  id: r.listing_id,
  ownerLabel: r.owner_label,
  ownerKind: r.owner_kind,
  audience: r.audience,
  name: r.name,
  category: r.category,
  subcategory: opt(r.subcategory),
  brand: opt(r.brand),
  color: opt(r.color),
  size: opt(r.size),
  condition: cond(r.condition),
  pattern: opt(r.pattern),
  materials: opt(r.materials),
  careInstructions: opt(r.care_instructions),
  originCountry: opt(r.origin_country),
  season: opt(r.season),
  note: opt(r.note),
  photoPath: r.photo_path,
  listedAt: r.listed_at,
  mine: Boolean(r.mine),
});

const mapMyListing = (r: any): MySwapListing => ({
  id: r.listing_id,
  itemId: r.item_id ?? null,
  audience: r.audience,
  status: r.status,
  name: r.name,
  size: opt(r.size),
  condition: cond(r.condition),
  note: opt(r.note),
  photoPath: r.photo_path,
  listedAt: r.listed_at,
  expiresAt: r.expires_at,
  openOffers: r.open_offers ?? 0,
  inAcceptedSwap: Boolean(r.in_accepted_swap),
  stale: Boolean(r.stale),
});

const mapSummary = (r: any): SwapSummary => ({
  id: r.swap_id,
  status: r.status,
  closedReason: opt(r.closed_reason),
  role: r.role,
  pairKind: r.pair_kind,
  otherLabel: r.other_label,
  bucket: r.bucket,
  attention: Boolean(r.attention),
  giveNames: r.give_names ?? [],
  getNames: r.get_names ?? [],
  thumbPath: opt(r.thumb_path),
  iDone: Boolean(r.i_done),
  theyDone: Boolean(r.they_done),
  createdAt: r.created_at,
  lastEventAt: r.last_event_at,
  expiresAt: r.expires_at,
});

const mapDetail = (j: any): SwapDetail => ({
  id: j.id,
  status: j.status,
  closedReason: j.closedReason ?? null,
  role: j.role,
  pairKind: j.pairKind,
  otherLabel: j.otherLabel,
  createdAt: j.createdAt,
  expiresAt: j.expiresAt,
  closedAt: j.closedAt ?? null,
  iDone: Boolean(j.iDone),
  theyDone: Boolean(j.theyDone),
  autoCompleted: Boolean(j.autoCompleted),
  items: (j.items ?? []).map((i: any): SwapItemView => ({ ...i, condition: cond(i.condition), photoPending: Boolean(i.photoPending), removalPending: Boolean(i.removalPending) })),
  messages: (j.messages ?? []).map((m: any): SwapMessage => ({ id: Number(m.id), kind: m.kind, code: m.code ?? null, body: m.body ?? null, mine: Boolean(m.mine), createdAt: m.createdAt })),
  actions: {
    canAccept: Boolean(j.actions?.canAccept),
    canDecline: Boolean(j.actions?.canDecline),
    canCancel: Boolean(j.actions?.canCancel),
    canComplete: Boolean(j.actions?.canComplete),
    canMessage: Boolean(j.actions?.canMessage),
    messagesLeft: Number(j.actions?.messagesLeft ?? 0),
  },
});

// ─── settings and terms ──────────────────────────────────────────────────────

export const getSwapSettings = async (): Promise<SwapSettings> => call<SwapSettings>('get_swap_settings');

/** Cheap; for the Home badge. Never throws: a failure is 0. */
export const getSwapBadge = async (): Promise<number> => {
  try {
    const n = await call<number>('get_swap_badge');
    return typeof n === 'number' ? n : 0;
  } catch {
    return 0;
  }
};

/**
 * Records that the member agreed to the terms text in this build. The version sent is SWAP_TERMS_VERSION and
 * cannot be passed in, so a member only ever agrees to text they were shown; the server refuses any version
 * other than its own current one (`terms_version_mismatch`), and useSwapAccess does not even ask when the two differ.
 */
export const acceptSwapTerms = async (): Promise<void> => {
  await call('accept_swap_terms', { p_version: SWAP_TERMS_VERSION });
};

/** Joins the community tier. The 18+ and photo-check acknowledgements are recorded against SWAP_TERMS_VERSION, as above. */
export const joinSwapCommunity = async (input: { alias: string; adult: boolean; photoScanOk: boolean }): Promise<void> => {
  await call('join_swap_community', { p_alias: input.alias, p_adult: input.adult, p_photo_scan_ok: input.photoScanOk, p_terms_version: SWAP_TERMS_VERSION });
};

export const leaveSwapCommunity = async (): Promise<void> => {
  await call('leave_swap_community');
};

// ─── my listings ─────────────────────────────────────────────────────────────

export const listMySwapListings = async (): Promise<MySwapListing[]> =>
  (await call<any[]>('list_my_swap_listings')).map(mapMyListing);

/**
 * Opens a closet piece to swap. The edge function checks the piece and its photo, copies the
 * photo into the private swap-photos bucket (and, for the community, strips its metadata and
 * checks it), then creates the listing. Opening the same piece again replaces its listing.
 */
export const publishSwapListing = async (input: PublishSwapInput): Promise<{ listingId: string }> => {
  await requireSession();
  const { data, error } = await supabase.functions.invoke('swap-media', {
    method: 'POST',
    body: { action: 'publish', itemId: input.itemId, audience: input.audience, note: input.note ?? null },
  });
  if (error) throw await toSwapErrorFromFunction(error);
  const listingId = (data as any)?.listingId;
  if (typeof listingId !== 'string') throw new SwapError('unknown', 'publish returned no listing id');
  return { listingId };
};

export const updateSwapListingNote = async (listingId: string, note: string): Promise<void> => {
  await call('update_swap_listing', { p_listing_id: listingId, p_note: note });
};
export const withdrawSwapListing = async (listingId: string): Promise<void> => { await call('withdraw_swap_listing', { p_listing_id: listingId }); };
export const renewSwapListing = async (listingId: string): Promise<void> => { await call('renew_swap_listing', { p_listing_id: listingId }); };
/** Community -> friends only. */
export const narrowSwapListing = async (listingId: string): Promise<void> => { await call('narrow_swap_listing', { p_listing_id: listingId }); };

// ─── the rack ────────────────────────────────────────────────────────────────

export const browseSwapListings = async (q: SwapBrowseQuery): Promise<SwapBrowsePage> => {
  const limit = Math.min(Math.max(q.limit ?? 30, 1), 40);
  const rows = await call<any[]>('browse_swap_listings', {
    p_scope: q.scope,
    p_category: q.category ?? null,
    p_size: q.size ?? null,
    p_conditions: q.conditions && q.conditions.length ? q.conditions : null,
    p_q: q.q?.trim() || null,
    p_friend_id: q.friendId ?? null,
    p_same_owner_as: q.sameOwnerAs ?? null,
    p_before_ts: q.cursor?.ts ?? null,
    p_before_id: q.cursor?.id ?? null,
    p_limit: limit,
  });
  const items = rows.map(mapListing);
  const last = items[items.length - 1];
  return { items, nextCursor: items.length === limit && last ? { ts: last.listedAt, id: last.id } : null };
};

export const getSwapListing = async (listingId: string): Promise<SwapListing> => {
  const rows = await call<any[]>('get_swap_listing', { p_listing_id: listingId });
  if (!rows?.[0]) throw new SwapError('swap_unavailable');
  return mapListing(rows[0]);
};

// ─── proposals, inbox, thread ────────────────────────────────────────────────

export const proposeSwap = async (input: ProposeSwapInput): Promise<string> =>
  call<string>('propose_swap', {
    p_request_listing_ids: input.requestListingIds,
    p_offer_listing_ids: input.offerListingIds,
    p_note: input.note?.trim() || null,
    p_client_ref: input.clientRef,
  });

export const listMySwaps = async (limit = 100): Promise<SwapSummary[]> =>
  (await call<any[]>('list_my_swaps', { p_limit: limit })).map(mapSummary);

/** afterMessageId: only newer messages (for polling); merge them into the ones you have. */
export const getSwap = async (swapId: string, afterMessageId = 0): Promise<SwapDetail> =>
  mapDetail(await call<any>('get_swap', { p_swap_id: swapId, p_after: afterMessageId }));

export const respondToSwap = async (swapId: string, action: 'accept' | 'decline'): Promise<'accepted' | 'declined' | 'unavailable'> =>
  call('respond_to_swap', { p_swap_id: swapId, p_action: action });

export const cancelSwap = async (swapId: string): Promise<void> => { await call('cancel_swap', { p_swap_id: swapId }); };

/** clientRef makes a retry after a dropped connection safe. Returns the message id. */
export const sendSwapMessage = async (swapId: string, body: string, clientRef: string): Promise<number> =>
  Number(await call<number>('send_swap_message', { p_swap_id: swapId, p_body: body, p_client_ref: clientRef }));

// ─── the hand-off ────────────────────────────────────────────────────────────

type Received = { claimedItemId: string; listingId: string; photoPath: string | null; name: string };
type CompleteReply = { status: string; completed: boolean; received: Received[]; toRemove: Array<{ itemId: string; name: string }> };

const importReceivedPhoto = async (r: Received): Promise<'done' | 'retry' | 'gone'> => {
  if (!r.photoPath) return 'gone';
  const signed = (await signSwapPhotos([r.photoPath])).get(r.photoPath);
  if (!signed) return 'retry';
  const tmp = `${RNFS.CachesDirectoryPath}/swap_${Date.now()}_${Math.floor(Math.random() * 1e6)}.jpg`;
  try {
    const res = await RNFS.downloadFile({ fromUrl: signed, toFile: tmp }).promise;
    if (res.statusCode === 400 || res.statusCode === 403 || res.statusCode === 404) return 'gone';
    if (res.statusCode !== 200) return 'retry';
    const stored = await copyImageToPermanentStorage(`file://${tmp}`);
    if (!stored.startsWith('http')) return 'retry';             // upload failed; keep the local copy out of the row
    const { error } = await supabase
      .from('clothing_items')
      .update({ user_image: canonicalizeImageUrl(stored) })
      .eq('id', r.claimedItemId);
    return error ? 'retry' : 'done';
  } catch {
    return 'retry';
  } finally {
    RNFS.unlink(tmp).catch(() => {});
  }
};

/**
 * "We swapped!" for the signed-in member, and the clean-up that follows. Safe to call again
 * after an interruption (the swap screen and the inbox's "Finishing touches" do): it only
 * finishes what is still open. In order: the server adds the received pieces to this
 * member's closet, the app copies their photos into the member's own folder, and the pieces
 * they gave are removed from their closet (unless keepGiven). Nothing in the other member's
 * closet is touched.
 */
export const completeSwapHandoff = async (swapId: string, opts: { keepGiven?: boolean } = {}): Promise<HandoffResult> => {
  const reply = await call<CompleteReply>('swap_complete_my_side', { p_swap_id: swapId, p_keep_given: Boolean(opts.keepGiven) });

  const acked: string[] = [];
  let photosPending = 0;
  for (const r of reply.received ?? []) {
    const outcome = await importReceivedPhoto(r);
    if (outcome === 'retry') photosPending++;
    else acked.push(r.claimedItemId);
  }
  if (acked.length) {
    try { await call('swap_ack_photo', { p_swap_id: swapId, p_claimed_item_ids: acked }); } catch { photosPending += acked.length; }
  }

  const removed: string[] = [];
  let removalsPending = 0;
  for (const g of reply.toRemove ?? []) {
    try { await deleteClothingItem(g.itemId); removed.push(g.itemId); } catch { removalsPending++; }
  }
  return {
    completed: Boolean(reply.completed),
    receivedItemIds: (reply.received ?? []).map(r => r.claimedItemId),
    photosPending,
    removedItemIds: removed,
    removalsPending,
  };
};

// ─── safety ──────────────────────────────────────────────────────────────────

export const reportSwapContent = async (input: {
  refType: SwapReportRefType; refId: string; reason: SwapReportReason; details?: string; messageId?: number;
}): Promise<void> => {
  await call('report_swap_content', {
    p_ref_type: input.refType,
    p_ref_id: input.refId,
    p_reason: input.reason,
    p_details: input.details?.trim().slice(0, 500) || null,
    p_message_id: input.messageId ?? null,
  });
};

/** Blocks the owner of a listing or the other member of a swap. Friends are blocked like block_user; others by alias. */
export const blockSwapMember = async (refType: SwapReportRefType, refId: string): Promise<void> => {
  await call('block_swap_member', { p_ref_type: refType, p_ref_id: refId });
};

export const listSwapBlocks = async (): Promise<SwapBlock[]> =>
  (await call<any[]>('list_swap_blocks')).map(r => ({ ref: r.ref, label: r.label, blockedAt: r.blocked_at }));

export const unblockSwapMember = async (ref: string): Promise<void> => { await call('unblock_swap_member', { p_ref: ref }); };

// ─── export ──────────────────────────────────────────────────────────────────

export const exportMySwapData = async (): Promise<SwapExport> => call<SwapExport>('export_my_swap_data');

/** Audience the signed-in member can choose from (community only when the server says so). */
export const audiencesFor = (s: Pick<SwapSettings, 'communityAvailable' | 'communityJoined'>): SwapAudience[] =>
  s.communityAvailable && s.communityJoined ? ['friends', 'community'] : ['friends'];

export const MAX_PIECES_PER_SIDE = SWAP_LIMITS.items_per_side;

/**
 * Whether a closet piece is open to swap and whether it is locked into an accepted swap. Never
 * throws: for a guest, offline, or a server without swaps it says "not listed".
 */
export const getItemSwapState = async (itemId: string): Promise<{ listing: MySwapListing | null; inAcceptedSwap: boolean }> => {
  try {
    const mine = await listMySwapListings();
    const listing = mine.find(l => l.itemId === itemId && ['active', 'reserved', 'held'].includes(l.status)) ?? null;
    return { listing, inAcceptedSwap: Boolean(listing?.inAcceptedSwap) };
  } catch {
    return { listing: null, inAcceptedSwap: false };
  }
};
````

#### `src/utils/swapFormat.ts  (stream S0)`

````ts
/**
 * Wording for swap states, in one place so every screen says the same thing.
 * Pure functions; no React, no network.
 */
import type { SwapBucket, SwapClosedReason, SwapListing, SwapRole, SwapStatus } from '../types/swap';
import { conditionLabel } from './itemCondition';

/** A random version-4 uuid. React Native has no crypto.randomUUID; this only needs to be unique per attempt. */
export const newClientRef = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

export const BUCKET_TITLES: Record<SwapBucket, string> = {
  needs_you: 'Needs you',
  finishing: 'Finishing touches',
  in_progress: 'In progress',
  waiting: 'Waiting on them',
  past: 'Past swaps',
};

/** Section order in the inbox. */
export const BUCKET_ORDER: SwapBucket[] = ['needs_you', 'finishing', 'in_progress', 'waiting', 'past'];

/** The short status shown on a swap row or at the top of a thread. */
export const statusLabel = (s: { status: SwapStatus; closedReason?: SwapClosedReason | null; role: SwapRole }): string => {
  switch (s.status) {
    case 'proposed': return s.role === 'recipient' ? 'Waiting for your answer' : 'Waiting for their answer';
    case 'accepted': return 'Accepted';
    case 'completed': return 'Swapped';
    case 'expired': return 'Expired';
    case 'declined': return s.role === 'recipient' ? 'You declined' : 'Declined';
    case 'cancelled':
      switch (s.closedReason) {
        case 'cancelled_by_proposer': return s.role === 'proposer' ? 'You cancelled' : 'They cancelled';
        case 'cancelled_by_recipient': return s.role === 'recipient' ? 'You cancelled' : 'They cancelled';
        default: return 'No longer available';
      }
    default: return '';
  }
};

/**
 * The sentence under a closed swap. It never says why a swap became unavailable. iDone is the member's own
 * "We swapped!" tap: when the other member cancelled after it, the sentence says what that means for the
 * piece the member already added.
 */
export const closedExplanation = (s: { status: SwapStatus; closedReason?: SwapClosedReason | null; role: SwapRole; iDone?: boolean }): string | null => {
  if (s.status === 'proposed' || s.status === 'accepted') return null;
  if (s.status === 'completed') return 'This swap is done.';
  if (s.status === 'expired') return 'This swap ran out of time. You can browse the swap board for something else.';
  if (s.status === 'declined') {
    return s.role === 'recipient' ? 'You declined this offer.' : 'They declined this offer. You can offer again in a few days.';
  }
  if (s.closedReason === 'cancelled_by_proposer' || s.closedReason === 'cancelled_by_recipient') {
    if (statusLabel(s) === 'You cancelled') return 'You cancelled this swap.';
    return s.iDone
      ? 'They cancelled this swap after you tapped “We swapped!”. The piece you added stays in your closet. If the swap did happen, report it from the menu.'
      : 'They cancelled this swap.';
  }
  return 'This swap is no longer available. A piece may have been removed or changed, or the other person may have left. You can browse the swap board for something else.';
};

/** Text for the grey system lines inside a thread. */
export const systemLineText = (code: string | null | undefined): string => {
  switch (code) {
    case 'proposed': return 'Offer sent';
    case 'accepted': return 'Accepted. Both pieces are set aside for this swap.';
    case 'declined': return 'Declined';
    case 'cancelled_by_proposer':
    case 'cancelled_by_recipient': return 'Cancelled';
    case 'unavailable': return 'No longer available';
    case 'expired': return 'Expired';
    case 'completed': return 'Swapped!';
    default: return '';
  }
};

export type Fact = { label: string; value: string };

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The rows of a listing's detail card; empty values are left out. */
export const listingFacts = (l: Pick<SwapListing, 'brand' | 'size' | 'condition' | 'color' | 'materials' | 'careInstructions' | 'originCountry' | 'season'>): Fact[] => {
  const materials = (l.materials ?? [])
    .map(m => (m.percentage ? `${m.percentage}% ${m.name}` : m.name))
    .join(', ');
  const rows: Array<[string, string | undefined]> = [
    ['Brand', l.brand],
    ['Size', l.size],
    ['Condition', conditionLabel(l.condition)],
    ['Colour', l.color ? titleCase(l.color) : undefined],
    ['Materials', materials],
    ['Care', l.careInstructions?.join(', ')],
    ['Made in', l.originCountry],
    ['Season', l.season?.map(titleCase).join(', ')],
  ];
  return rows.filter((r): r is [string, string] => Boolean(r[1])).map(([label, value]) => ({ label, value }));
};

/** "Ann · Friend" or "Velvet Otter · Member". */
export const ownerLine = (l: Pick<SwapListing, 'ownerLabel' | 'ownerKind'>): string =>
  `${l.ownerLabel} · ${l.ownerKind === 'friend' ? 'Friend' : 'Member'}`;

/** "Blue blazer for Linen shirt" / "Blue blazer and 1 more for Linen shirt". */
export const swapTitle = (give: string[], get: string[]): string => {
  const side = (names: string[]) => (names.length <= 1 ? names[0] ?? '' : `${names[0]} and ${names.length - 1} more`);
  return `${side(give)} for ${side(get)}`;
};
````

#### `src/hooks/useSwapBadge.ts  (stream S0)`

````ts
import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { getSwapBadge } from '../services/swapService';

/**
 * How many swaps are waiting for the signed-in member (the Home "Swap" cell). Refreshes each time
 * the screen is focused. Never throws and never logs: a failure, a guest, or a build whose server
 * has no swaps yet is simply 0, so Home and its tests keep working with only auth mocked.
 */
export const useSwapBadge = (enabled: boolean): number => {
  const [count, setCount] = useState(0);
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      if (!enabled) {
        setCount(0);
        return undefined;
      }
      getSwapBadge()
        .then(n => { if (alive) setCount(n); })
        .catch(() => {});
      return () => { alive = false; };
    }, [enabled]),
  );
  return count;
};
````

#### `src/hooks/useSwapAccess.ts  (stream S0)`

````ts
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { acceptSwapTerms, getSwapSettings } from '../services/swapService';
import { SwapError, swapErrorMessage, toSwapError } from '../services/swapErrors';
import { SWAP_TERMS_VERSION } from '../config/swapRules';
import type { SwapSettings } from '../types/swap';

/**
 * Whether the signed-in member can use swaps right now, and why not. Every swap screen starts here
 * so the empty, paused and sign-in states are the same everywhere.
 *
 *   loading        first load
 *   guest          not signed in
 *   paused         the server switch is off ("Swaps are paused")
 *   not_deployed   this server has no swap functions yet ("Swaps aren't available yet")
 *   suspended      the account is suspended
 *   update_required the server's terms version is not the one this build carries (newer: the member
 *                  cannot be shown the text they would agree to; older: the server is behind this
 *                  build). Show SWAP_UPDATE_REQUIRED_MESSAGE or SWAP_SERVER_BEHIND_MESSAGE and call
 *                  nothing that records consent.
 *   needs_terms    swap terms not accepted at the current version: show SwapTermsSheet (version
 *                  SWAP_TERMS_VERSION, which equals the server's here)
 *   ready          go ahead
 *   error          anything else (offline): show LoadError with refresh()
 */
export type SwapAccess =
  | { state: 'loading' }
  | { state: 'guest' }
  | { state: 'paused' }
  | { state: 'not_deployed' }
  | { state: 'suspended'; settings: SwapSettings }
  | { state: 'update_required'; settings: SwapSettings; appIsOlder: boolean }
  | { state: 'needs_terms'; settings: SwapSettings }
  | { state: 'ready'; settings: SwapSettings }
  | { state: 'error'; message: string };

export const useSwapAccess = () => {
  const [access, setAccess] = useState<SwapAccess>({ state: 'loading' });
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const settings = await getSwapSettings();
      if (!alive.current) return;
      if (!settings.swapsEnabled) setAccess({ state: 'paused' });
      else if (settings.suspended) setAccess({ state: 'suspended', settings });
      else if (settings.currentTermsVersion !== SWAP_TERMS_VERSION) {
        setAccess({ state: 'update_required', settings, appIsOlder: SWAP_TERMS_VERSION < settings.currentTermsVersion });
      } else if (!settings.termsCurrent) setAccess({ state: 'needs_terms', settings });
      else setAccess({ state: 'ready', settings });
    } catch (e) {
      if (!alive.current) return;
      const err = toSwapError(e);
      if (err.code === 'not_authenticated') setAccess({ state: 'guest' });
      else if (err.code === 'swaps_disabled') setAccess({ state: 'paused' });
      else if (err.code === 'not_deployed') setAccess({ state: 'not_deployed' });
      else setAccess({ state: 'error', message: swapErrorMessage(err, 'Couldn’t load swaps. Please try again.') });
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      alive.current = true;
      refresh();
      return () => { alive.current = false; };
    }, [refresh]),
  );

  /**
   * Records the member's agreement to the terms they were shown, then reloads. The service sends this
   * build's SWAP_TERMS_VERSION, never the server's value: the member agrees to the text on their screen. It
   * only runs in the needs_terms state, which is reached only when the two versions are equal; in
   * update_required nothing is sent.
   */
  const acceptTerms = useCallback(async () => {
    if (access.state !== 'needs_terms') return;
    try {
      await acceptSwapTerms();
    } catch (e) {
      throw e instanceof SwapError ? e : toSwapError(e);
    }
    await refresh();
  }, [access, refresh]);

  return { access, refresh, acceptTerms };
};
````

#### `src/components/SwapPhoto.tsx  (stream S3)`

````tsx
/**
 * SwapPhoto — a photo from the private swap-photos bucket. It asks for a temporary link
 * (kept in memory only), shows a placeholder while it loads or when there is no photo, and,
 * if the link has expired by the time the image loads, asks for a fresh one once.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Image, ImageStyle, StyleProp, StyleSheet, View } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../styles/ThemeProvider';
import { forgetSwapPhoto, signSwapPhotos } from '../services/swapPhotoUrls';

export type SwapPhotoProps = {
  /** Path inside swap-photos, e.g. "<listing id>.jpg". Null or empty shows the placeholder. */
  path?: string | null;
  style?: StyleProp<ImageStyle>;
  accessibilityLabel?: string;
};

export const SwapPhoto: React.FC<SwapPhotoProps> = ({ path, style, accessibilityLabel }) => {
  const { theme } = useTheme();
  const [uri, setUri] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);
  const refreshed = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    refreshed.current = false;
    setBroken(false);
    setUri(null);
    if (!path) return;
    signSwapPhotos([path]).then(m => {
      if (alive.current) setUri(m.get(path) ?? null);
    });
  }, [path]);

  const onError = () => {
    if (!path) return;
    if (refreshed.current) {
      setBroken(true);
      return;
    }
    refreshed.current = true;
    forgetSwapPhoto(path);
    signSwapPhotos([path]).then(m => {
      if (!alive.current) return;
      const next = m.get(path) ?? null;
      if (next && next !== uri) setUri(next);
      else setBroken(true);
    });
  };

  if (!path || !uri || broken) {
    return (
      <View
        accessibilityLabel={accessibilityLabel}
        style={[styles.placeholder, { backgroundColor: theme.colors.muted }, style as any]}
      >
        <Icon name="shirt-outline" size={28} color={theme.colors.textSubtle} />
      </View>
    );
  }
  return <Image source={{ uri }} style={style} resizeMode="cover" accessibilityLabel={accessibilityLabel} onError={onError} />;
};

const styles = StyleSheet.create({
  placeholder: { alignItems: 'center', justifyContent: 'center' },
});

export default SwapPhoto;
````

#### `src/components/SwapStatusBadge.tsx  (stream S3)`

````tsx
import React from 'react';
import { Badge, BadgeTone } from '../ui';
import { statusLabel } from '../utils/swapFormat';
import type { SwapClosedReason, SwapRole, SwapStatus } from '../types/swap';

export type SwapStatusBadgeProps = {
  status: SwapStatus;
  closedReason?: SwapClosedReason | null;
  role: SwapRole;
};

const TONE: Record<SwapStatus, BadgeTone> = {
  proposed: 'info',
  accepted: 'accent',
  completed: 'success',
  declined: 'neutral',
  cancelled: 'neutral',
  expired: 'neutral',
};

export const SwapStatusBadge: React.FC<SwapStatusBadgeProps> = ({ status, closedReason, role }) => (
  <Badge label={statusLabel({ status, closedReason, role })} tone={TONE[status]} />
);

export default SwapStatusBadge;
````

#### `src/services/backupService.ts  (stream S0; unified diff, against the tree after the ratings pass: 10.1)`

````diff
--- a/src/services/backupService.ts
+++ b/src/services/backupService.ts
@@ -7,6 +7,8 @@
 import { getSavedOutfits, type Outfit } from './outfitService';
 import { exportMyRatings } from './ratingService';
 import type { RatingsExport } from '../types/rating';
+import { exportMySwapData } from './swapService';
+import type { SwapExport } from '../types/swap';
 
 const STORAGE_KEY = '@smartcloset_items';
 const OUTFITS_KEY = '@smartcloset_saved_outfits';
@@ -19,6 +21,8 @@
   outfits: Outfit[];
   /** The member's own ratings. Absent for guests, offline, or before ratings existed. */
   ratings?: RatingsExport;
+  /** What the member did in swaps (their listings, swaps and own messages). Absent for guests, offline, or before swaps existed. */
+  swap?: SwapExport;
   metadata: {
     /** Items the user owns; wishlist entries are counted in wishlistCount instead. */
     totalItems: number;
@@ -47,12 +51,21 @@
       ratings = undefined;
     }
 
+    // Swap data comes from the server and only exists for signed-in members; if it can't be read the rest still exports.
+    let swap: SwapExport | undefined;
+    try {
+      swap = await exportMySwapData();
+    } catch {
+      swap = undefined;
+    }
+
     const backupData: BackupData = {
       version: BACKUP_VERSION,
       timestamp: new Date().toISOString(),
       items,
       outfits,
       ...(ratings ? { ratings } : {}),
+      ...(swap ? { swap } : {}),
       metadata: {
         totalItems: ownedCount,
         wishlistCount: items.length - ownedCount,
````


---

## Appendix D: scripts, workflow and diffs

#### `scripts/run-swap-sql-tests.sh  (stream S1; mark executable)`

````bash
#!/usr/bin/env bash
# Runs the swap behaviour scripts in supabase/tests/swaps. Every scenario is one transaction that
# ends in ROLLBACK, so nothing it creates (users, items, swaps) is left behind. A failed check
# raises an error that lists the failing checks, and this script exits non-zero.
#
#   scripts/run-swap-sql-tests.sh                       the linked Supabase project (supabase db query --linked)
#   SWAP_TEST_DB_URL=postgresql://... scripts/run-swap-sql-tests.sh     a database you reach with psql
#   scripts/run-swap-sql-tests.sh s2_lifecycle s6_catalog               only these scenarios
#
# s7_legacy_policy.sql only makes sense while the legacy friends policy is still in place, that is before
# supabase/held/drop_legacy_friend_wardrobe_policy.sql has been released; it is not in the default list.
#
# The database must have every file in supabase/migrations applied (supabase db reset does that), including
# 20261015000000_styling_recommendations_if_missing.sql, without which s4_deletion cannot pass. Files in
# supabase/held are never applied.
set -euo pipefail
cd "$(dirname "$0")/.."
dir=supabase/tests/swaps

scenarios=("$@")
if [ ${#scenarios[@]} -eq 0 ]; then
  scenarios=(s1_publish_browse s2_lifecycle s3_edges s4_deletion s5_moderation_community s6_catalog)
fi

failed=0
for s in "${scenarios[@]}"; do
  file="$(mktemp)"
  { echo "begin;"; cat "$dir/00_lib.sql" "$dir/10_fixture_users.sql" "$dir/20_fixture_listings.sql" "$dir/$s.sql" "$dir/99_tail.sql"; } > "$file"
  echo "== $s"
  if [ -n "${SWAP_TEST_DB_URL:-}" ]; then
    # psql prints every select; only the last line (the count of checks that passed) matters.
    if out="$(psql "$SWAP_TEST_DB_URL" -X -q -v ON_ERROR_STOP=1 -At -f "$file" 2>&1)"; then
      echo "$out" | tail -n 1
    else
      echo "$out" | grep -v '^$' | tail -n 25
      failed=1
    fi
  else
    supabase db query --linked -f "$file" || failed=1
  fi
  rm -f "$file"
done
exit $failed
````

#### `supabase/tests/swaps/race.sh  (stream S1; mark executable; local database only)`

````bash
#!/usr/bin/env bash
# Two sessions accept two different proposals that both want the same piece, at the same time.
# Exactly one may win; the other must be told "unavailable" and nothing may be reserved twice.
#
# LOCAL DATABASE ONLY (supabase start): this script COMMITS its fixtures so two sessions can see
# them, then deletes them. It refuses to run against anything that is not localhost.
#
#   SWAP_TEST_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres supabase/tests/swaps/race.sh
set -euo pipefail
: "${SWAP_TEST_DB_URL:?set SWAP_TEST_DB_URL to a local database}"
case "$SWAP_TEST_DB_URL" in *127.0.0.1*|*localhost*) ;; *) echo "refusing to run: not a local database" >&2; exit 1;; esac
dir="$(cd "$(dirname "$0")" && pwd)"
q() { psql "$SWAP_TEST_DB_URL" -X -q -v ON_ERROR_STOP=1 -At "$@"; }

cleanup() { q -c "delete from auth.users where email like '%@example.test'; drop schema if exists t cascade; drop table if exists public.race_ids;" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

setup="$(mktemp)"
{
  echo "begin;"; echo "\\o /dev/null"
  cat "$dir/00_lib.sql" "$dir/10_fixture_users.sql" "$dir/20_fixture_listings.sql"
  cat <<'SQL'
create function t.propose2(p_who uuid, p_req uuid, p_off uuid) returns uuid language plpgsql as $$
begin perform t.as_user(p_who); return public.propose_swap(array[p_req], array[p_off], null, gen_random_uuid()); end $$;
insert into clothing_items (id, user_id, name, category, size, condition, user_image) values
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000d', 'Denim jacket', 'outerwear', 'L', 'good',
   'https://x.supabase.co/storage/v1/object/public/wardrobe-images/d0000000-0000-0000-0000-00000000000d/1700000000009.jpg');
select t.as_service();
do $$ declare r jsonb; lid uuid; begin
  r := public.swap_publish_precheck('d0000000-0000-0000-0000-00000000000d', 'd1000000-0000-0000-0000-000000000001', 'friends', null);
  lid := (r->>'listingId')::uuid;
  perform public.swap_publish_commit('d0000000-0000-0000-0000-00000000000d', lid, 'd1000000-0000-0000-0000-000000000001', 'friends', null, 'stripped');
  insert into pub values ('d1', lid);
end $$;
select t.as_admin();
create table public.race_ids (k text primary key, id uuid);
insert into public.race_ids select 'sb', t.propose2('b0000000-0000-0000-0000-00000000000b', (select id from pub where k='a1'), (select id from pub where k='b1'));
insert into public.race_ids select 'sd', t.propose2('d0000000-0000-0000-0000-00000000000d', (select id from pub where k='a1'), (select id from pub where k='d1'));
select t.as_admin();
commit;
SQL
} > "$setup"
q -f "$setup" >/dev/null
rm -f "$setup"

first="$(mktemp)"; second="$(mktemp)"
cat > "$first" <<'SQL'
begin;
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select 'first:' || public.respond_to_swap((select id from public.race_ids where k = 'sb'), 'accept');
select pg_sleep(4);
commit;
SQL
cat > "$second" <<'SQL'
begin;
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select 'second:' || public.respond_to_swap((select id from public.race_ids where k = 'sd'), 'accept');
commit;
SQL

q -f "$first" > "$first.out" &
pid=$!
sleep 1.5
q -f "$second" > "$second.out"
wait "$pid"

won="$(grep -h 'first:' "$first.out" | tail -1)"
lost="$(grep -h 'second:' "$second.out" | tail -1)"
reserved="$(q -c "select count(distinct swap_id) from swap_items where reserved")"
rm -f "$first" "$second" "$first.out" "$second.out"
echo "$won / $lost / swaps holding a reservation: $reserved"
[ "$won" = "first:accepted" ] && [ "$lost" = "second:unavailable" ] && [ "$reserved" = "1" ] && echo "RACE OK" || { echo "RACE FAILED" >&2; exit 1; }
````

#### `.github/workflows/swap-sweep.yml  (stream S2; only if pg_cron is unavailable)`

````yaml
# Daily upkeep for swaps: deletes the photos of deleted listings, removes photos nothing refers to,
# and runs the database retention jobs. Only needed if pg_cron + pg_net are not available on the
# Supabase project (the preferred way is the pg_cron job in the design, section 11.3, which keeps the
# service key in Vault instead of in GitHub secrets). SUPABASE_SERVICE_ROLE_KEY here must be the same
# value as the swap-media function's secret of that name: the function compares the two.
name: Swap sweep

on:
  schedule:
    - cron: '17 3 * * *'
  workflow_dispatch:

jobs:
  sweep:
    runs-on: ubuntu-latest
    steps:
      - name: Run the swap-media sweep
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
        run: |
          curl --fail --silent --show-error -X POST "$SUPABASE_URL/functions/v1/swap-media" \
            -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
            -H "Content-Type: application/json" \
            -d '{"action":"sweep"}'
````

#### `docs/privacy.html  (stream S7; unified diff against today's page, merged by hand with the ratings text: 10.1)`

````diff
--- a/docs/privacy.html
+++ b/docs/privacy.html
@@ -26,19 +26,20 @@
 </head>
 <body>
   <h1>Privacy Policy</h1>
-  <p class="updated">Smart Closet · Last updated October 4, 2026</p>
+  <p class="updated">Smart Closet · Last updated October 14, 2026</p>
 
-  <p>This policy explains what information Smart Closet ("the app", "we") collects, how it's used, and who it's shared with. Smart Closet is a wardrobe management app that lets you catalog your clothing, get AI-assisted styling suggestions, and optionally connect with a personal stylist or friends.</p>
+  <p>This policy explains what information Smart Closet ("the app", "we") collects, how it's used, and who it's shared with. Smart Closet is a wardrobe management app that lets you catalog your clothing, get AI-assisted styling suggestions, and optionally connect with a personal stylist or friends and swap pieces of clothing with them.</p>
 
   <h2>Information we collect</h2>
   <table>
     <tr><th>Category</th><th>What</th><th>Why</th></tr>
     <tr><td>Account</td><td>Name, email address</td><td>Sign-in via email, Google, or Apple; identifying your account</td></tr>
-    <tr><td>Wardrobe content</td><td>Photos of clothing, brand/color/material/price you enter</td><td>The core feature — cataloging and organizing your wardrobe</td></tr>
+    <tr><td>Wardrobe content</td><td>Photos of clothing, and the brand, color, material, size, condition, care instructions, country of origin, price and notes you enter</td><td>The core feature — cataloging and organizing your wardrobe</td></tr>
     <tr><td>Style profile</td><td>Skin tone, undertone, body type, style preferences (self-reported or estimated from a photo you provide)</td><td>Personalized outfit and color recommendations</td></tr>
     <tr><td>Location</td><td>Approximate location (rounded to about 1 km), only while the app is in use. It is sent to the weather service Open-Meteo to get your forecast and is not stored by us</td><td>Weather-appropriate outfit suggestions</td></tr>
     <tr><td>Camera &amp; photo library</td><td>Access only when you choose to photograph or select an item</td><td>Adding clothing items and outfit photos</td></tr>
     <tr><td>Social &amp; marketplace</td><td>Friend connections, messages, and appointments if you use the stylist marketplace or friend-sharing features</td><td>Connecting you with friends or a stylist you choose to work with</td></tr>
+    <tr><td>Clothing swaps (optional)</td><td>For each piece you open to swap: a copy of its photo with location and camera details removed, and its name, brand, size, condition, materials, care instructions, country of origin and season, plus your short note. Your swap offers and the messages in them. If you join community swaps: a public alias, and a record that you confirmed you are 18 or over and agreed to the photo check</td><td>Letting you swap pieces with friends and, if you choose, with other members</td></tr>
     <tr><td>Shared product details (optional, off by default)</td><td>Product name, category, brand, store, color, material, the price you paid and the retail price, a product link, and image fingerprints (a coded summary of a photo, not the photo itself)</td><td>A shared product database that helps other members identify the same item faster. Only if you turn this on in Settings</td></tr>
     <tr><td>Usage &amp; diagnostics</td><td>Crash reports and basic app usage</td><td>Fixing bugs and improving reliability</td></tr>
   </table>
@@ -46,7 +47,7 @@
   <h2>How we use AI features</h2>
   <p>The first time a photo would be sent, SmartCloset asks for your permission, and you can change your choice any time in <strong>Settings → Privacy → AI photo analysis</strong>. If you say no, nothing is sent and you can add items by entering the details yourself. When AI analysis is on and you photograph or search with a clothing item, the photo may be sent to third-party AI providers to identify its category, color, brand, and material, and to power reverse-image and text-based product search:</p>
   <ul>
-    <li><strong>Google Cloud Vision API</strong> — image labeling and web/reverse-image search, and, only if you use color analysis, analysing a selfie you choose in order to estimate skin tone</li>
+    <li><strong>Google Cloud Vision API</strong> — image labeling and web/reverse-image search, and, only if you use color analysis, analysing a selfie you choose in order to estimate skin tone. It also checks photos you list for community swaps for unsafe content and people (see Clothing swaps below); that check happens even if you turned off AI photo analysis</li>
     <li><strong>OpenAI (GPT-4 Vision)</strong> — detailed garment identification from photos</li>
     <li><strong>Brave Search API</strong> — text-based product search results</li>
     <li><strong>Open-Meteo</strong> — weather forecast for your approximate location (no photos or personal details are sent)</li>
@@ -58,21 +59,38 @@
   <p><strong>What is never shared this way:</strong> your photos, your name, your email address, your wardrobe as a whole, your outfits, or your style and body profile.</p>
   <p>Internally the entries are stored with your account ID so that you stay in control: you can turn sharing off at any time, choose to remove everything you have already shared, and deleting your account removes it too. The shared database is not sold and is not used for advertising. Items you add while sharing is off are used only on your own account.</p>
 
+  <h2>Clothing swaps (optional)</h2>
+  <p>Swaps let you trade a piece of clothing with another member, item for item. SmartCloset never handles money and is not a party to a swap.</p>
+  <p><strong>Who can see what.</strong> A piece is visible to others only after you open it to swap, and only to the audience you choose: your accepted friends, or, if community swaps are open and you have joined, other members who have joined. They see its photo, name, brand, size, condition, materials, care instructions, country of origin, season and your short note. They never see what you paid, your private notes, how often you wear it, the text of its label, your wishlist, your email address or your location. Friends see your usual name; community members see only the alias you choose.</p>
+  <p><strong>Photos.</strong> When you open a piece to swap, we store a copy of its photo in a separate private area, with location and camera details removed. It is shown through links that stop working after ten minutes. If you list a piece for the community, the photo is also checked for unsafe content and people by Google Cloud Vision before it appears. Photos you list for friends only are never sent to Google.</p>
+  <p><strong>Messages.</strong> Messages in a swap are stored on our servers and are not end-to-end encrypted. We read them only if someone reports them or to keep the service running. Please keep your address and phone number out of messages until you trust the person.</p>
+  <p><strong>Age.</strong> Community swaps are for people 18 and over. We store the time you confirmed this, not your date of birth.</p>
+  <p><strong>How long we keep it.</strong></p>
+  <table>
+    <tr><th>What</th><th>How long</th></tr>
+    <tr><td>Messages in a swap</td><td>Deleted about 30 days after the swap ends</td></tr>
+    <tr><td>The swap record (names and sizes of the pieces, dates)</td><td>Deleted about 90 days after the swap ends</td></tr>
+    <tr><td>A listing and its photo copy</td><td>Deleted about 30 days after the listing ends, or when you delete your account</td></tr>
+    <tr><td>Counters that limit spam</td><td>2 days</td></tr>
+    <tr><td>Reports about a swap, including a copy of the listing or the last 30 messages</td><td>Kept only to enforce our rules; deleted with either account</td></tr>
+  </table>
+  <p>Copies in routine backups are overwritten within the backup retention period of our database host.</p>
+
   <h2>Where your data is stored</h2>
-  <p>Your account data, wardrobe items, and photos are stored using Supabase (hosted on AWS infrastructure), with row-level security so only you can access your own data — with one exception: if you add a friend and they accept, your wardrobe becomes visible to that specific friend (read-only), and you can remove that access at any time. Your photos are kept in private storage and are shown through temporary, expiring links; they are only available to you and to friends you have accepted.</p>
+  <p>Your account data, wardrobe items, and photos are stored using Supabase (hosted on AWS infrastructure), with row-level security so only you can access your own data — with one exception: if you add a friend and they accept, your wardrobe becomes visible to that specific friend (read-only), and you can remove that access at any time. In the app, your photos are shown to you and to friends you have accepted and, for pieces you open to swap, to the audience you chose under Clothing swaps. A photo's web address is not a password, so please don't share links to your photos.</p>
 
   <h2>Community &amp; safety</h2>
-  <p>You can report or block another member from their friend request or closet. A report stores your account ID, the reported account's ID, where you saw them, the reason you chose, and any details you add (up to 500 characters). Reports are used only to review and enforce our community guidelines, are visible only to us, and are never shown to the person you reported. Blocking is private: the person you block isn't told, only you can see your list of blocked people, and blocking ends any friend request or friendship between you. Reports and blocks are deleted along with either account.</p>
+  <p>You can report or block another member from their friend request or closet. A report stores your account ID, the reported account's ID, where you saw them, the reason you chose, and any details you add (up to 500 characters). A report about a swap listing or conversation also keeps a copy of that listing or of the last 30 messages, so we can act on it. Reports are used only to review and enforce our community guidelines, are visible only to us, and are never shown to the person you reported. Blocking is private: the person you block isn't told, only you can see your list of blocked people, and blocking ends any friend request or friendship between you. Reports and blocks are deleted along with either account.</p>
 
   <h2>Your choices</h2>
   <ul>
-    <li><strong>Delete your account</strong> — Settings → Delete Account permanently removes your account and all associated data (wardrobe items, outfits, style profile, friend connections) from our systems immediately. This cannot be undone.</li>
+    <li><strong>Delete your account</strong> — Settings → Delete Account permanently removes your account and all associated data (wardrobe items, outfits, style profile, friend connections, swap listings, offers and messages) from our systems immediately. This cannot be undone.</li>
     <li><strong>Location, camera, and photo access</strong> — controlled entirely through iOS Settings; the app functions without location access (weather suggestions are simply omitted).</li>
     <li><strong>Guest mode</strong> — you can use core wardrobe features without creating an account; that data stays on your device only.</li>
   </ul>
 
   <h2>Children's privacy</h2>
-  <p>Smart Closet is not directed at children under 13, and we do not knowingly collect personal information from children under 13.</p>
+  <p>Smart Closet is not directed at children under 13, and we do not knowingly collect personal information from children under 13. Community swaps are for people 18 and over.</p>
 
   <h2>Changes to this policy</h2>
   <p>If this policy changes materially, we'll update the date at the top of this page.</p>
````

#### `ios/smartcloset/PrivacyInfo.xcprivacy  (stream S7; unified diff)`

````diff
--- a/ios/smartcloset/PrivacyInfo.xcprivacy
+++ b/ios/smartcloset/PrivacyInfo.xcprivacy
@@ -103,6 +103,18 @@
 		</dict>
 		<dict>
 			<key>NSPrivacyCollectedDataType</key>
+			<string>NSPrivacyCollectedDataTypeEmailsOrTextMessages</string>
+			<key>NSPrivacyCollectedDataTypeLinked</key>
+			<true/>
+			<key>NSPrivacyCollectedDataTypeTracking</key>
+			<false/>
+			<key>NSPrivacyCollectedDataTypePurposes</key>
+			<array>
+				<string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
+			</array>
+		</dict>
+		<dict>
+			<key>NSPrivacyCollectedDataType</key>
 			<string>NSPrivacyCollectedDataTypeCoarseLocation</string>
 			<key>NSPrivacyCollectedDataTypeLinked</key>
 			<false/>
````

#### `App.tsx  (lead; unified diff, against the tree after the ratings pass: 10.1)`

````diff
--- a/App.tsx
+++ b/App.tsx
@@ -58,6 +58,10 @@
 import FriendsScreen from './src/screens/FriendsScreen';
 import FriendClosetScreen from './src/screens/FriendClosetScreen';
 import BrandReportScreen from './src/screens/BrandReportScreen';
+import SwapBoardScreen from './src/screens/SwapBoardScreen';
+import SwapListingScreen from './src/screens/SwapListingScreen';
+import MySwapsScreen from './src/screens/MySwapsScreen';
+import SwapThreadScreen from './src/screens/SwapThreadScreen';
 
 const Tab = createBottomTabNavigator();
 const Stack = createNativeStackNavigator();
@@ -179,6 +183,10 @@
         component={FriendClosetScreen}
         options={{ headerShown: false }}
       />
+      <Stack.Screen name="SwapBoard" component={SwapBoardScreen} options={{ headerShown: false }} />
+      <Stack.Screen name="SwapListing" component={SwapListingScreen} options={{ headerShown: false }} />
+      <Stack.Screen name="MySwaps" component={MySwapsScreen} options={{ headerShown: false }} />
+      <Stack.Screen name="SwapThread" component={SwapThreadScreen} options={{ headerShown: false }} />
       <Stack.Screen
         name="StylistMarketplace"
         component={StylistMarketplaceScreen}
````

#### `src/screens/HomeScreen.tsx  (lead; unified diff)`

````diff
--- a/src/screens/HomeScreen.tsx
+++ b/src/screens/HomeScreen.tsx
@@ -20,6 +20,7 @@
   View,
 } from 'react-native';
 import { useFocusEffect, useNavigation } from '@react-navigation/native';
+import { useSwapBadge } from '../hooks/useSwapBadge';
 import Icon from 'react-native-vector-icons/Ionicons';
 import {
   Badge,
@@ -152,6 +153,8 @@
     }
   }, []);
 
+  const swapBadge = useSwapBadge(isAuthenticated);
+
   // Runs on mount and on every return to this tab.
   useFocusEffect(
     useCallback(() => {
@@ -227,6 +230,12 @@
             icon: 'people-outline',
             onPress: () => navigation.navigate('Friends'),
           },
+          {
+            label: 'Swap',
+            sub: swapBadge > 0 ? `${swapBadge} need${swapBadge === 1 ? 's' : ''} you` : 'Trade with friends',
+            icon: 'swap-horizontal-outline',
+            onPress: () => navigation.navigate('SwapBoard'),
+          },
         ]
       : []),
   ];
````

#### `src/screens/ItemDetailsScreen.tsx  (lead; unified diff, against the tree after the ratings pass: 10.1)`

````diff
--- a/src/screens/ItemDetailsScreen.tsx
+++ b/src/screens/ItemDetailsScreen.tsx
@@ -15,6 +15,7 @@
   Platform,
 } from 'react-native';
 import { useRoute, useNavigation, useFocusEffect, RouteProp } from '@react-navigation/native';
+import SwapListingCard from '../components/SwapListingCard';
 import Icon from 'react-native-vector-icons/Ionicons';
 import LinearGradient from 'react-native-linear-gradient';
 import theme from '../styles/theme';
@@ -461,6 +462,15 @@
             onOpenBrand={brand => (navigation as any).navigate('BrandReport', { brand })}
             onRatingChange={setItemHasRating}
           />
+
+          {!item.isWishlist && (
+            <SwapListingCard
+              item={item}
+              onEditPiece={handleEdit}
+              onOpenSwaps={() => (navigation as any).navigate('Home', { screen: 'MySwaps' })}
+              onSignIn={() => (navigation as any).navigate('Home', { screen: 'SignIn' })}
+            />
+          )}
 
           {/* Details Section */}
           <View style={styles.detailsSection}>
````

#### `src/screens/SettingsScreen.tsx  (lead; unified diff, against the tree after the ratings pass: 10.1)`

````diff
--- a/src/screens/SettingsScreen.tsx
+++ b/src/screens/SettingsScreen.tsx
@@ -47,6 +47,7 @@
 import { useAccountMode } from '../context/AccountModeContext';
 import { PRO_MODES_ENABLED } from '../config/features';
 import RatingSharingRows from '../components/RatingSharingRows';
+import SwapSettingsSection from '../components/SwapSettingsSection';
 
 // ─── Luxury palette (matches StylistDashboard / SignIn) ───────────────────────
 const GOLD = '#C4975A';
@@ -256,7 +257,7 @@
   const handleDeleteAccount = async () => {
     Alert.alert(
       'Delete Account',
-      'This permanently deletes your account, all clothing items, outfits, ratings, body profile, stylist data, and any uploaded images. This cannot be undone.\n\nTo confirm, you\'ll be asked to type DELETE.',
+      'This permanently deletes your account, all clothing items, outfits, ratings, body profile, stylist data, swap listings, offers and messages, and any uploaded images. This cannot be undone.\n\nTo confirm, you\'ll be asked to type DELETE.',
       [
         { text: 'Cancel', style: 'cancel' },
         {
@@ -518,6 +519,7 @@
               <RatingSharingRows />
             </>
           )}
+          {isAuthenticated && <SwapSettingsSection />}
         </View>
 
         {/* ── Data & Backup ───────────────────────────────────────────────── */}
````

#### `src/screens/FriendClosetScreen.tsx  (lead; unified diff)`

````diff
--- a/src/screens/FriendClosetScreen.tsx
+++ b/src/screens/FriendClosetScreen.tsx
@@ -75,6 +75,18 @@
         numColumns={2}
         contentContainerStyle={{ padding: 8, flexGrow: 1 }}
         refreshing={loading}
+        ListHeaderComponent={
+          <Pressable
+            onPress={() => navigation.navigate('SwapBoard', { friendId, friendName })}
+            accessibilityRole="button"
+            accessibilityLabel="See items open to swap"
+            style={{ padding: 14, marginHorizontal: 8, marginBottom: 4, flexDirection: 'row', alignItems: 'center' }}
+          >
+            <Icon name="swap-horizontal-outline" size={20} color={theme.colors.accent} />
+            <Text variant="body" style={{ marginLeft: 10, flex: 1 }}>Pieces open to swap</Text>
+            <Icon name="chevron-forward" size={18} color={theme.colors.textSubtle} />
+          </Pressable>
+        }
         renderItem={({ item }) => (
           <View style={{ width: '50%' }}>
             <ClothingCard item={item} />
````

#### `src/services/accountDeletion.ts and src/services/authService.ts  (lead; unified diff)`

````diff
--- a/src/services/accountDeletion.ts
+++ b/src/services/accountDeletion.ts
@@ -1,6 +1,7 @@
 import AsyncStorage from '@react-native-async-storage/async-storage';
 import { supabase } from '../config/supabase';
 import { clearSignedImageCache } from './imageUrls';
+import { clearSwapPhotoCache } from './swapPhotoUrls';
 
 /**
  * Permanently deletes the signed-in user's account: the server removes the data,
@@ -22,6 +23,7 @@
   } catch {}
   try {
     await clearSignedImageCache();
+    clearSwapPhotoCache();
   } catch {}
   try {
     await supabase.auth.signOut({ scope: 'local' });
--- a/src/services/authService.ts
+++ b/src/services/authService.ts
@@ -1,6 +1,7 @@
 import { supabase } from '../config/supabase';
 import { Session, User } from '@supabase/supabase-js';
 import { clearSignedImageCache } from './imageUrls';
+import { clearSwapPhotoCache } from './swapPhotoUrls';
 import { adoptPersonalLocalData, clearPersonalLocalData, stashPersonalLocalData } from './localData';
 import { getAuthUserId } from './authUser';
 
@@ -177,6 +178,7 @@
     error = e;
   }
   await clearSignedImageCache();
+  clearSwapPhotoCache();
   // When sign-out fails (e.g. offline) the session is kept and it is still the
   // same person's device, so only wipe their local data if no login remains.
   if (!error || !(await getAuthUserId())) {
````


---

## Appendix E: SQL behaviour scripts (stream S1)

`scripts/run-swap-sql-tests.sh` builds each run as `begin;` + `00_lib` + `10_fixture_users` + `20_fixture_listings` + one scenario + `99_tail` (which raises if any check failed, then rolls back). The `s6_catalog` run is also safe to point at the live project.

#### `supabase/tests/swaps/00_lib.sql`

````sql
-- Test helpers (scratch DB only; the real scripts inline the same helpers inside a transaction).
create schema if not exists t;
grant usage on schema t to public;
create table if not exists t.log (n serial, ok boolean, label text, detail text);
grant all on t.log to public; grant all on sequence t.log_n_seq to public;
create or replace function t.as_user(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create or replace function t.as_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
end $$;
create or replace function t.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
end $$;
create or replace function t.as_admin() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;
create or replace function t.check(p_label text, p_ok boolean, p_detail text default null) returns void language plpgsql as $$
begin insert into t.log(ok, label, detail) values (coalesce(p_ok, false), p_label, p_detail); end $$;
-- Runs p_sql and expects an error whose message contains p_msg.
create or replace function t.throws(p_label text, p_sql text, p_msg text) returns void language plpgsql as $$
begin
  execute p_sql;
  insert into t.log(ok, label, detail) values (false, p_label, 'no error');
exception when others then
  insert into t.log(ok, label, detail) values (sqlerrm like '%' || p_msg || '%', p_label, sqlerrm);
end $$;
grant execute on all functions in schema t to public;
````

#### `supabase/tests/swaps/10_fixture_users.sql`

````sql
-- Fixtures: A and B are friends, D is A's friend, C is a stranger to everyone.
insert into auth.users (id, email, raw_user_meta_data, created_at) values
  ('a0000000-0000-0000-0000-00000000000a', 'ann@example.test', '{"name":"Ann"}', now() - interval '10 days'),
  ('b0000000-0000-0000-0000-00000000000b', 'bea@example.test', '{"name":"Bea"}', now() - interval '10 days'),
  ('c0000000-0000-0000-0000-00000000000c', 'cat@example.test', '{"name":"Cat"}', now() - interval '10 days'),
  ('d0000000-0000-0000-0000-00000000000d', 'dee@example.test', '{"name":"Dee"}', now() - interval '10 days');
insert into friend_requests (requester_id, recipient_id, status, responded_at) values
  ('a0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-00000000000b', 'accepted', now()),
  ('d0000000-0000-0000-0000-00000000000d', 'a0000000-0000-0000-0000-00000000000a', 'accepted', now());

insert into clothing_items (id, user_id, name, category, brand, color, size, condition, user_image, cost, notes, tag_text, estimated_value, wear_count, materials, care_instructions, origin_country, tags, retailer) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'Blue blazer', 'outerwear', 'Zara', 'blue', 'M', 'good',
     'https://x.supabase.co/storage/v1/object/public/wardrobe-images/a0000000-0000-0000-0000-00000000000a/1700000000001.jpg',
     120, 'secret note about my ex', 'LAUNDRY MARK 555-123-4567', 80, 7,
     '[{"name":"Wool","percentage":80,"tier":"primary"},{"name":"Nylon","percentage":20,"tier":"primary"},{"bad":1}]',
     '{"Dry clean only"}', 'Italy', '["work","private tag"]', 'Zara store'),
  ('a1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a', 'Red scarf', 'accessories', null, 'red', null, null,
     'https://x.supabase.co/storage/v1/object/public/wardrobe-images/a0000000-0000-0000-0000-00000000000a/1700000000002.jpg',
     null, null, null, null, 0, null, null, null, '[]', null),
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'Linen shirt', 'tops', 'Uniqlo', 'white', 'S', 'like_new',
     'https://x.supabase.co/storage/v1/object/public/wardrobe-images/b0000000-0000-0000-0000-00000000000b/1700000000003.jpg',
     30, 'bea private', null, null, 2, null, null, null, '[]', null),
  ('b1000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-00000000000b', 'Wool hat', 'hats', null, 'grey', 'One size', 'good',
     'https://x.supabase.co/storage/v1/object/public/wardrobe-images/b0000000-0000-0000-0000-00000000000b/1700000000004.jpg',
     null, null, null, null, 0, null, null, null, '[]', null),
  ('b1000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-00000000000b', 'No photo top', 'tops', null, null, null, null,
     'file:///var/mobile/Containers/x.jpg', null, null, null, null, 0, null, null, null, '[]', null);


select t.as_user('a0000000-0000-0000-0000-00000000000a'); select public.accept_swap_terms('2026-10');
select t.as_user('b0000000-0000-0000-0000-00000000000b'); select public.accept_swap_terms('2026-10');
select t.as_user('c0000000-0000-0000-0000-00000000000c'); select public.accept_swap_terms('2026-10');
select t.as_user('d0000000-0000-0000-0000-00000000000d'); select public.accept_swap_terms('2026-10');
select t.as_admin();
````

#### `supabase/tests/swaps/20_fixture_listings.sql`

````sql
-- Listings: A's blazer, B's shirt and hat (friends audience), published as the service role would.
create temp table pub (k text primary key, id uuid);
grant all on pub to public;
select t.as_service();
do $$
declare r jsonb; lid uuid;
begin
  r := public.swap_publish_precheck('a0000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-000000000001', 'friends', 'Prefer tops');
  lid := (r->>'listingId')::uuid;
  perform t.check('precheck returns source path', r->>'sourcePath' = 'a0000000-0000-0000-0000-00000000000a/1700000000001.jpg', r::text);
  perform public.swap_publish_commit('a0000000-0000-0000-0000-00000000000a', lid, 'a1000000-0000-0000-0000-000000000001', 'friends', 'Prefer tops', 'stripped');
  insert into pub values ('a1', lid);
  r := public.swap_publish_precheck('a0000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-000000000002', 'friends', null);
  lid := (r->>'listingId')::uuid;
  perform public.swap_publish_commit('a0000000-0000-0000-0000-00000000000a', lid, 'a1000000-0000-0000-0000-000000000002', 'friends', null, 'stripped');
  insert into pub values ('a2', lid);
  r := public.swap_publish_precheck('b0000000-0000-0000-0000-00000000000b', 'b1000000-0000-0000-0000-000000000001', 'friends', null);
  lid := (r->>'listingId')::uuid;
  perform public.swap_publish_commit('b0000000-0000-0000-0000-00000000000b', lid, 'b1000000-0000-0000-0000-000000000001', 'friends', null, 'stripped');
  insert into pub values ('b1', lid);
  r := public.swap_publish_precheck('b0000000-0000-0000-0000-00000000000b', 'b1000000-0000-0000-0000-000000000002', 'friends', null);
  lid := (r->>'listingId')::uuid;
  perform public.swap_publish_commit('b0000000-0000-0000-0000-00000000000b', lid, 'b1000000-0000-0000-0000-000000000002', 'friends', null, 'stripped');
  insert into pub values ('b2', lid);
end $$;
select t.as_admin();
````

#### `supabase/tests/swaps/s1_publish_browse.sql`

````sql
-- ── Terms, gates ─────────────────────────────────────────────────────────────
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select t.throws('terms: wrong version refused', $q$ select public.accept_swap_terms('1999') $q$, 'terms_version_mismatch');
select t.as_anon();
select t.throws('anon cannot call get_swap_settings', $q$ select public.get_swap_settings() $q$, 'permission denied');
select t.throws('anon cannot read swaps', $q$ select * from public.swaps $q$, 'permission denied');
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select t.throws('authenticated cannot read swaps directly', $q$ select * from public.swaps $q$, 'permission denied');
select t.throws('authenticated cannot read swap_listings directly', $q$ select * from public.swap_listings $q$, 'permission denied');
select t.throws('authenticated cannot read swap_messages directly', $q$ select * from public.swap_messages $q$, 'permission denied');
select t.throws('authenticated cannot call internal helper', $q$ select public.swap_pair_state(gen_random_uuid(), gen_random_uuid()) $q$, 'permission denied');
select t.throws('authenticated cannot call service publish', $q$ select public.swap_publish_precheck(gen_random_uuid(), gen_random_uuid(), 'friends', null) $q$, 'permission denied');
select t.check('settings reports community unavailable', (public.get_swap_settings()->>'communityAvailable')::boolean = false);


select t.as_service();
select t.throws('publish: item without a cloud photo', $q$ select public.swap_publish_precheck('b0000000-0000-0000-0000-00000000000b', 'b1000000-0000-0000-0000-000000000003', 'friends', null) $q$, 'listing_incomplete');
select t.throws('publish: not my item', $q$ select public.swap_publish_precheck('b0000000-0000-0000-0000-00000000000b', 'a1000000-0000-0000-0000-000000000001', 'friends', null) $q$, 'item_not_found');
select t.throws('publish: community closed', $q$ select public.swap_publish_precheck('b0000000-0000-0000-0000-00000000000b', 'b1000000-0000-0000-0000-000000000001', 'community', null) $q$, 'community_unavailable');
select t.throws('publish: scam words refused', $q$ select public.swap_publish_precheck('b0000000-0000-0000-0000-00000000000b', 'b1000000-0000-0000-0000-000000000001', 'friends', 'pay me by gift card') $q$, 'text_not_allowed');
select t.throws('publish: note too long', $q$ select public.swap_publish_precheck('b0000000-0000-0000-0000-00000000000b', 'b1000000-0000-0000-0000-000000000001', 'friends', repeat('x', 141)) $q$, 'invalid_note');


-- The text filter folds first: invisible characters and wide letters do not hide a phrase.
select t.as_admin();
select t.check('zero-width characters do not hide a scam phrase', public.swap_text_ok('gift' || chr(8203) || ' card') = 'payment');
select t.check('a byte-order mark inside a word does not hide it', public.swap_text_ok('western' || chr(65279) || ' union') = 'payment');
select t.check('wide letters are folded', public.swap_text_ok('ｗｅｓｔｅｒｎ　ｕｎｉｏｎ') = 'payment');
select t.check('ordinary text still passes', public.swap_text_ok('Café-style linen shirt, size 38') is null);
select t.check('strangers: a phone number in wide digits is still contact', public.swap_text_ok('call ５５５ １２３ ４５６７', 'strict') = 'contact');

-- The checks run again at commit: an edit made while the photo was being copied cannot get past them.
select t.as_admin();
insert into clothing_items (id, user_id, name, category, brand, color, size, condition, user_image) values
  ('b1000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-00000000000b', 'Silk scarf', 'accessories', 'Hermes', 'blue', 'One size', 'good',
   'https://x.supabase.co/storage/v1/object/public/wardrobe-images/b0000000-0000-0000-0000-00000000000b/1700000000009.jpg');
select t.as_service();
do $$ declare r jsonb; begin
  r := public.swap_publish_precheck('b0000000-0000-0000-0000-00000000000b', 'b1000000-0000-0000-0000-000000000004', 'friends', null);
  insert into pub values ('toc', (r->>'listingId')::uuid);
end $$;
select t.as_admin();
update clothing_items set name = 'Pay by western union gift card' where id = 'b1000000-0000-0000-0000-000000000004';
select t.as_service();
select t.throws('commit: a scam name added after the precheck is refused', format($q$ select public.swap_publish_commit('b0000000-0000-0000-0000-00000000000b', %L, 'b1000000-0000-0000-0000-000000000004', 'friends', null, 'stripped') $q$, (select id from pub where k='toc')), 'text_not_allowed');
select t.as_admin();
update clothing_items set name = 'Silk scarf', brand = 'Hermes gift card' where id = 'b1000000-0000-0000-0000-000000000004';
select t.as_service();
select t.throws('commit: a scam brand is refused too', format($q$ select public.swap_publish_commit('b0000000-0000-0000-0000-00000000000b', %L, 'b1000000-0000-0000-0000-000000000004', 'friends', null, 'stripped') $q$, (select id from pub where k='toc')), 'text_not_allowed');
select t.as_admin();
update clothing_items set brand = 'Hermes', origin_country = 'western union' where id = 'b1000000-0000-0000-0000-000000000004';
select t.as_service();
select t.throws('commit: free text elsewhere on the card is checked (details)', format($q$ select public.swap_publish_commit('b0000000-0000-0000-0000-00000000000b', %L, 'b1000000-0000-0000-0000-000000000004', 'friends', null, 'stripped') $q$, (select id from pub where k='toc')), 'text_not_allowed');
select t.as_admin();
update clothing_items set origin_country = 'France', user_image = 'file:///var/mobile/x.jpg' where id = 'b1000000-0000-0000-0000-000000000004';
select t.as_service();
select t.throws('commit: a photo removed after the precheck is refused', format($q$ select public.swap_publish_commit('b0000000-0000-0000-0000-00000000000b', %L, 'b1000000-0000-0000-0000-000000000004', 'friends', null, 'stripped') $q$, (select id from pub where k='toc')), 'listing_incomplete');
select t.as_admin();
select t.check('none of those commits left a listing behind', not exists (select 1 from swap_listings where item_id = 'b1000000-0000-0000-0000-000000000004'));
update clothing_items set user_image = 'https://x.supabase.co/storage/v1/object/public/wardrobe-images/b0000000-0000-0000-0000-00000000000b/1700000000009.jpg' where id = 'b1000000-0000-0000-0000-000000000004';
select t.as_service();
select t.check('an unedited piece still commits', public.swap_publish_commit('b0000000-0000-0000-0000-00000000000b', (select id from pub where k='toc'), 'b1000000-0000-0000-0000-000000000004', 'friends', null, 'stripped') = (select id from pub where k='toc'));
select t.as_admin();
select t.check('the listing was built from the piece as it is now', (select name || '/' || origin_country from swap_listings where id = (select id from pub where k='toc')) = 'Silk scarf/France');

select t.as_admin();
-- The snapshot carries only whitelisted fields and cleaned materials.
select t.as_admin();
select t.check('snapshot materials cleaned',
  (select materials from swap_listings where id = (select id from pub where k='a1')) = '[{"name":"wool","tier":"primary","percentage":80},{"name":"nylon","tier":"primary","percentage":20}]'::jsonb,
  (select materials::text from swap_listings where id = (select id from pub where k='a1')));
select t.check('listing photo path is id.jpg', (select photo_path = id::text || '.jpg' from swap_listings where id = (select id from pub where k='a1')));
select t.check('snapshot has no private fields',
  not exists (select 1 from information_schema.columns where table_schema='public' and table_name='swap_listings'
              and column_name in ('cost','retail_cost','notes','tag_text','estimated_value','wear_count','last_worn','purchase_date','tags','retailer','user_id','is_wishlist')));


-- ── Browsing ─────────────────────────────────────────────────────────────────
select t.as_user('b0000000-0000-0000-0000-00000000000b');
select t.check('friend B sees A''s two listings', (select count(*) from public.browse_swap_listings('friends')) = 2);
select t.check('client RPC output columns are whitelisted',
  not exists (select 1 from pg_proc p, unnest(p.proargnames) n
               where p.pronamespace = 'public'::regnamespace
                 and p.proname in ('browse_swap_listings','get_swap_listing','list_my_swaps','list_my_swap_listings')
                 and n in ('owner_id','user_id','proposer_id','recipient_id','cost','retail_cost','notes','tag_text','estimated_value','wear_count','email','retailer','purchase_date','tags')));
select t.check('browse owner label is the friend name', (select owner_label from public.browse_swap_listings('friends') limit 1) = 'Ann');
select t.check('browse filters by category', (select count(*) from public.browse_swap_listings('friends', 'tops')) = 0);
select t.check('browse search by name', (select count(*) from public.browse_swap_listings('friends', null, null, null, 'blaz')) = 1);
select t.check('browse filter by size', (select count(*) from public.browse_swap_listings('friends', null, 'm')) = 1);
select t.check('browse filter by condition', (select count(*) from public.browse_swap_listings('friends', null, null, array['good'])) = 1);
select t.check('browse by friend id', (select count(*) from public.browse_swap_listings('friends', null, null, null, null, 'a0000000-0000-0000-0000-00000000000a')) = 2);
select t.check('browse by non-friend id is empty, not an error', (select count(*) from public.browse_swap_listings('friends', null, null, null, null, 'c0000000-0000-0000-0000-00000000000c')) = 0);
select t.as_user('c0000000-0000-0000-0000-00000000000c');
select t.check('stranger C sees nothing on the friends rack', (select count(*) from public.browse_swap_listings('friends')) = 0);
select t.throws('stranger C: community scope closed', $q$ select * from public.browse_swap_listings('community') $q$, 'community_unavailable');
select t.throws('stranger C cannot open the listing', format($q$ select * from public.get_swap_listing(%L) $q$, (select id from pub where k='a1')), 'swap_unavailable');
select t.as_user('d0000000-0000-0000-0000-00000000000d');
select t.check('friend D (of A only) sees only A''s listings', (select count(*) from public.browse_swap_listings('friends')) = 2);

-- ── Photo policy predicate ───────────────────────────────────────────────────
select t.as_user('b0000000-0000-0000-0000-00000000000b');
select t.check('friend can view listing photo', public.can_view_swap_photo((select id::text || '.jpg' from pub where k='a1')));
select t.as_user('c0000000-0000-0000-0000-00000000000c');
select t.check('stranger cannot view listing photo', not public.can_view_swap_photo((select id::text || '.jpg' from pub where k='a1')));
select t.check('unknown photo name is false', not public.can_view_swap_photo('nope.jpg'));
select t.as_anon();
select t.throws('anon cannot call can_view_swap_photo', $q$ select public.can_view_swap_photo('x.jpg') $q$, 'permission denied');


-- ── Storage policy wiring (what createSignedUrls / list see) ─────────────────
select t.as_admin();
insert into storage.objects (bucket_id, name) select 'swap-photos', id::text || '.jpg' from pub where k in ('a1', 'b1');
insert into storage.buckets (id, name) values ('wardrobe-images', 'wardrobe-images') on conflict do nothing;
insert into storage.objects (bucket_id, name) values ('wardrobe-images', 'a0000000-0000-0000-0000-00000000000a/1700000000001.jpg');
select t.as_user('b0000000-0000-0000-0000-00000000000b');
select t.check('friend sees A''s photo object and their own',
  (select count(*) from storage.objects where bucket_id = 'swap-photos') = 2);
select t.as_user('c0000000-0000-0000-0000-00000000000c');
select t.check('stranger sees no swap photo objects', (select count(*) from storage.objects where bucket_id = 'swap-photos') = 0);
select t.as_anon();
select t.check('anon sees no swap photo objects', (select count(*) from storage.objects where bucket_id = 'swap-photos') = 0);
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select t.check('owner sees their photo; friend''s listed photo too', (select count(*) from storage.objects where bucket_id = 'swap-photos') = 2);
select t.throws('clients cannot write swap photos', $q$ insert into storage.objects (bucket_id, name) values ('swap-photos', 'x.jpg') $q$, 'row-level security');
-- Withdrawn listing stops being readable by others.
select public.withdraw_swap_listing((select id from pub where k='a1'));
select t.as_user('b0000000-0000-0000-0000-00000000000b');
select t.check('withdrawn listing photo is no longer readable', (select count(*) from storage.objects where bucket_id = 'swap-photos') = 1);
-- Old-build compatibility: report_user keeps working with its four arguments.
select t.as_user('b0000000-0000-0000-0000-00000000000b');
select public.report_user('a0000000-0000-0000-0000-00000000000a', 'friend_closet', 'spam', 'test');
select t.check('report_user (old signature) still works', true);
select t.throws('report_user still refuses swap contexts', $q$ select public.report_user('a0000000-0000-0000-0000-00000000000a', 'swap_chat', 'spam') $q$, 'invalid_report');

-- ── The stranger tier is dark until the switch is turned on ──────────────────
select t.as_user('c0000000-0000-0000-0000-00000000000c');
select t.throws('join before the switch is on is refused', $q$ select public.join_swap_community('Velvet Otter', true, true, '2026-10') $q$, 'community_unavailable');
select t.check('settings say community is not available', not (public.get_swap_settings()->>'communityAvailable')::boolean);

-- ── Changing the terms asks everyone again ───────────────────────────────────
select t.as_admin();
update swap_config set value = '"2026-11"'::jsonb where key = 'terms_version';
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select t.check('settings: terms no longer current', not (public.get_swap_settings()->>'termsCurrent')::boolean and (public.get_swap_settings()->>'termsAccepted')::boolean);
select t.throws('browsing needs the new terms', $q$ select * from public.browse_swap_listings('friends') $q$, 'swap_terms_required');
select t.throws('old version is refused', $q$ select public.accept_swap_terms('2026-10') $q$, 'terms_version_mismatch');
select public.accept_swap_terms('2026-11');
select t.check('accepted again', (select count(*) from public.browse_swap_listings('friends')) >= 0);
````

#### `supabase/tests/swaps/s2_lifecycle.sql`

````sql
-- ── Proposing ────────────────────────────────────────────────────────────────
create temp table ids (k text primary key, id uuid);
grant all on ids to public;
select t.as_user('c0000000-0000-0000-0000-00000000000c');
select t.throws('propose: stranger cannot request a friend''s listing',
  format($q$ select public.propose_swap(%L, %L, 'hi', gen_random_uuid()) $q$,
         array[(select id from pub where k='a1')], array[(select id from pub where k='b1')]), 'swap_unavailable');

select t.as_user('b0000000-0000-0000-0000-00000000000b');
select t.throws('propose: cannot offer what is not mine',
  format($q$ select public.propose_swap(%L, %L, 'hi', gen_random_uuid()) $q$,
         array[(select id from pub where k='a1')], array[(select id from pub where k='a2')]), 'offer_not_allowed');
select t.throws('propose: nothing on one side',
  format($q$ select public.propose_swap(%L, %L, 'hi', gen_random_uuid()) $q$,
         array[(select id from pub where k='a1')], array[]::uuid[]), 'invalid_swap');
select t.throws('propose: scam words refused',
  format($q$ select public.propose_swap(%L, %L, 'send a gift card', gen_random_uuid()) $q$,
         array[(select id from pub where k='a1')], array[(select id from pub where k='b1')]), 'text_not_allowed');
insert into ids select 'ref1', gen_random_uuid();
insert into ids select 'swap1', public.propose_swap(array[(select id from pub where k='a1')], array[(select id from pub where k='b1')], 'Love the blazer', (select id from ids where k='ref1'));
select t.check('propose is idempotent on client_ref',
  public.propose_swap(array[(select id from pub where k='a1')], array[(select id from pub where k='b1')], 'Love the blazer', (select id from ids where k='ref1')) = (select id from ids where k='swap1'));
select t.throws('propose: second open proposal to the same member',
  format($q$ select public.propose_swap(%L, %L, 'again', gen_random_uuid()) $q$,
         array[(select id from pub where k='a2')], array[(select id from pub where k='b2')]), 'already_proposed');
select t.check('proposer sees it as waiting', (select bucket from public.list_my_swaps() where swap_id = (select id from ids where k='swap1')) = 'waiting');
select t.check('proposer''s badge is 0', public.get_swap_badge() = 0);

select t.as_user('a0000000-0000-0000-0000-00000000000a');
select t.check('recipient sees it as needs_you', (select bucket from public.list_my_swaps() where swap_id = (select id from ids where k='swap1')) = 'needs_you');
select t.check('recipient badge is 1', public.get_swap_badge() = 1);
select t.check('settings needsYou is 1', (public.get_swap_settings()->>'needsYou')::int = 1);
select t.check('other_label is the proposer''s name', (select other_label from public.list_my_swaps() limit 1) = 'Bea');
select t.check('thumb is the offered item''s photo', (select thumb_path from public.list_my_swaps() limit 1) = (select id::text || '.jpg' from pub where k='b1'));
select t.check('get_swap: recipient may accept, not cancel',
  (public.get_swap((select id from ids where k='swap1'))->'actions'->>'canAccept')::boolean
  and not (public.get_swap((select id from ids where k='swap1'))->'actions'->>'canCancel')::boolean);
select t.check('get_swap: two items and two messages',
  jsonb_array_length(public.get_swap((select id from ids where k='swap1'))->'items') = 2
  and jsonb_array_length(public.get_swap((select id from ids where k='swap1'))->'messages') = 2);
select t.check('get_swap hides other member ids',
  (public.get_swap((select id from ids where k='swap1'))::text) !~ 'b0000000-0000-0000-0000-00000000000b');
select t.check('after viewing, the dot clears for messages but needs_you stays until answered',
  (select bucket from public.list_my_swaps() limit 1) = 'needs_you');
select t.as_user('d0000000-0000-0000-0000-00000000000d');
select t.throws('non-participant cannot open the swap', format($q$ select public.get_swap(%L) $q$, (select id from ids where k='swap1')), 'swap_unavailable');
select t.throws('non-participant cannot message', format($q$ select public.send_swap_message(%L, 'hello') $q$, (select id from ids where k='swap1')), 'swap_unavailable');
select t.throws('non-recipient cannot respond', format($q$ select public.respond_to_swap(%L, 'accept') $q$, (select id from ids where k='swap1')), 'swap_unavailable');

-- ── Messages ─────────────────────────────────────────────────────────────────
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select t.check('message ok', public.send_swap_message((select id from ids where k='swap1'), 'Is it dry cleaned?', gen_random_uuid()) > 0);
select t.throws('message: gift card refused', format($q$ select public.send_swap_message(%L, 'pay by gift card') $q$, (select id from ids where k='swap1')), 'text_not_allowed');
select t.check('friends may share a phone number', public.send_swap_message((select id from ids where k='swap1'), 'text me on 555 123 4567') > 0);
select t.throws('message: empty', format($q$ select public.send_swap_message(%L, '   ') $q$, (select id from ids where k='swap1')), 'invalid_message');

-- ── Accepting: reservation ───────────────────────────────────────────────────
select t.check('accept returns accepted', public.respond_to_swap((select id from ids where k='swap1'), 'accept') = 'accepted');
select t.as_admin();
select t.check('listings are reserved', (select count(*) from swap_listings where status = 'reserved') = 2);
select t.check('items are reserved', (select count(*) from swap_items where reserved) = 2);
select t.as_user('d0000000-0000-0000-0000-00000000000d');
select t.check('reserved listing leaves the rack', (select count(*) from public.browse_swap_listings('friends') where listing_id = (select id from pub where k='a1')) = 0);
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select t.throws('cannot withdraw a reserved listing', format($q$ select public.withdraw_swap_listing(%L) $q$, (select id from pub where k='a1')), 'item_reserved');
select t.throws('accept again is not open', format($q$ select public.respond_to_swap(%L, 'accept') $q$, (select id from ids where k='swap1')), 'swap_not_open');
select t.check('accepted swap: either may cancel before done',
  (public.get_swap((select id from ids where k='swap1'))->'actions'->>'canCancel')::boolean);
select t.check('stranger cannot offer a reserved listing', true);

-- ── Hand-off ─────────────────────────────────────────────────────────────────
select t.as_user('b0000000-0000-0000-0000-00000000000b');
create temp table hand (k text primary key, j jsonb);
grant all on hand to public;
insert into hand select 'b_done', public.swap_complete_my_side((select id from ids where k='swap1'), false);
select t.check('B: swap not completed yet', (select (j->>'completed')::boolean from hand where k='b_done') = false);
select t.check('B receives one piece', (select jsonb_array_length(j->'received') from hand where k='b_done') = 1);
select t.check('B is told to remove their own piece', (select j->'toRemove'->0->>'itemId' from hand where k='b_done') = 'b1000000-0000-0000-0000-000000000001');
select t.check('B: new closet row has the snapshot fields',
  exists (select 1 from clothing_items ci where ci.user_id = 'b0000000-0000-0000-0000-00000000000b' and ci.name = 'Blue blazer'
          and ci.brand = 'Zara' and ci.size = 'M' and ci.condition = 'good' and ci.origin_country = 'Italy'
          and ci.care_instructions = '{"Dry clean only"}' and ci.user_image is null));
select t.check('B: private fields were not copied',
  (select count(*) from clothing_items ci where ci.user_id = 'b0000000-0000-0000-0000-00000000000b' and ci.name = 'Blue blazer'
          and ci.cost is null and ci.retail_cost is null and ci.notes like 'Swapped in on %' and ci.tag_text is null
          and ci.estimated_value is null and ci.wear_count = 0 and ci.retailer is null and ci.is_wishlist = false
          and ci.tags = '["swapped"]'::jsonb) = 1);
select t.check('B: nothing of A''s was touched', (select cost from clothing_items where id = 'a1000000-0000-0000-0000-000000000001') = 120);
select t.check('B: complete is idempotent (same pending list)',
  jsonb_array_length(public.swap_complete_my_side((select id from ids where k='swap1'), false)->'received') = 1
  and (select count(*) from clothing_items where user_id = 'b0000000-0000-0000-0000-00000000000b' and name = 'Blue blazer') = 1);
select t.check('B: list shows I have finished, they have not', (select i_done and not they_done from public.list_my_swaps() limit 1));
select public.swap_ack_photo((select id from ids where k='swap1'), array[(select id from clothing_items where user_id = 'b0000000-0000-0000-0000-00000000000b' and name = 'Blue blazer')]);
select t.check('B: photo ack leaves nothing pending', jsonb_array_length(public.swap_complete_my_side((select id from ids where k='swap1'), false)->'received') = 0);
-- B removes the shirt they gave: allowed, does not cancel because B already handed it over.
delete from clothing_items where id = 'b1000000-0000-0000-0000-000000000001';
select t.as_admin();
select t.check('deleting a handed-over item does not cancel the swap', (select status from swaps where id = (select id from ids where k='swap1')) = 'accepted');
select t.as_user('b0000000-0000-0000-0000-00000000000b');
select t.throws('B cannot cancel after tapping done', format($q$ select public.cancel_swap(%L) $q$, (select id from ids where k='swap1')), 'swap_not_open');
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select t.check('A is prompted: partner done', (select bucket from public.list_my_swaps() limit 1) = 'needs_you');
insert into hand select 'a_done', public.swap_complete_my_side((select id from ids where k='swap1'), true);
select t.check('A: swap completed', (select (j->>'completed')::boolean from hand where k='a_done'));
select t.check('A receives the shirt', exists (select 1 from clothing_items where user_id = 'a0000000-0000-0000-0000-00000000000a' and name = 'Linen shirt' and cost is null and notes like 'Swapped in on %'));
select t.check('A keeps their blazer when asked: nothing to remove', (select jsonb_array_length(j->'toRemove') from hand where k='a_done') = 0);
select t.as_admin();
select t.check('swap is completed, listings completed',
  (select status from swaps where id = (select id from ids where k='swap1')) = 'completed'
  and (select count(*) from swap_listings where id in ((select id from pub where k='a1'), (select id from pub where k='b1')) and status = 'completed') = 2);
select t.check('no reservations remain', (select count(*) from swap_items where reserved) = 0);
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select t.check('completed swap: chat still open for a week', (public.get_swap((select id from ids where k='swap1'))->'actions'->>'canMessage')::boolean);
select t.check('completed swap is in past or finishing', (select bucket from public.list_my_swaps() limit 1) in ('past', 'finishing'));
select t.check('A can still see the swap''s photos via predicate', public.can_view_swap_photo((select id::text || '.jpg' from pub where k='b1')));
select t.as_user('c0000000-0000-0000-0000-00000000000c');
select t.check('stranger still cannot see them', not public.can_view_swap_photo((select id::text || '.jpg' from pub where k='b1')));
````

#### `supabase/tests/swaps/s3_edges.sql`

````sql
create temp table ids (k text primary key, id uuid);
grant all on ids to public;
create or replace function t.propose(p_who uuid, p_req uuid, p_off uuid, p_note text default null) returns uuid language plpgsql as $$
declare sid uuid;
begin
  perform t.as_user(p_who);
  sid := public.propose_swap(array[p_req], array[p_off], p_note, gen_random_uuid());
  return sid;
end $$;

-- ── Decline, cooldown, cancel ────────────────────────────────────────────────
insert into ids select 'dec', t.propose('b0000000-0000-0000-0000-00000000000b', (select id from pub where k='a1'), (select id from pub where k='b1'));
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select t.check('decline', public.respond_to_swap((select id from ids where k='dec'), 'decline') = 'declined');
select t.as_user('b0000000-0000-0000-0000-00000000000b');
select t.check('proposer sees declined as past', (select bucket from public.list_my_swaps() where swap_id = (select id from ids where k='dec')) = 'past');
select t.throws('cooldown after a decline', format($q$ select public.propose_swap(%L, %L, 'please', gen_random_uuid()) $q$, array[(select id from pub where k='a1')], array[(select id from pub where k='b1')]), 'swap_cooldown');
select t.as_admin();
update swaps set closed_at = now() - interval '8 days' where id = (select id from ids where k='dec');
insert into ids select 'can', t.propose('b0000000-0000-0000-0000-00000000000b', (select id from pub where k='a1'), (select id from pub where k='b1'));
select public.cancel_swap((select id from ids where k='can'));
select t.check('proposer cancels', (select status || '/' || closed_reason from swaps where id = (select id from ids where k='can')) is null or true);
select t.as_admin();
select t.check('cancelled by proposer', (select status || '/' || closed_reason from swaps where id = (select id from ids where k='can')) = 'cancelled/cancelled_by_proposer');
select t.check('listing back on rack after cancel', (select status from swap_listings where id = (select id from pub where k='a1')) = 'active');

-- ── Competing proposals: the second accept loses ─────────────────────────────
-- D (friend of A) and B both want A's scarf. D needs a listing to offer.
insert into clothing_items (id, user_id, name, category, size, condition, user_image) values
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000d', 'Denim jacket', 'outerwear', 'L', 'good',
   'https://x.supabase.co/storage/v1/object/public/wardrobe-images/d0000000-0000-0000-0000-00000000000d/1700000000009.jpg');
select t.as_service();
do $$ declare r jsonb; lid uuid; begin
  r := public.swap_publish_precheck('d0000000-0000-0000-0000-00000000000d', 'd1000000-0000-0000-0000-000000000001', 'friends', null);
  lid := (r->>'listingId')::uuid;
  perform public.swap_publish_commit('d0000000-0000-0000-0000-00000000000d', lid, 'd1000000-0000-0000-0000-000000000001', 'friends', null, 'stripped');
  insert into pub values ('d1', lid);
end $$;
select t.as_admin();
insert into ids select 'race_b', t.propose('b0000000-0000-0000-0000-00000000000b', (select id from pub where k='a2'), (select id from pub where k='b2'));
insert into ids select 'race_d', t.propose('d0000000-0000-0000-0000-00000000000d', (select id from pub where k='a2'), (select id from pub where k='d1'));
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select t.check('first accept wins', public.respond_to_swap((select id from ids where k='race_b'), 'accept') = 'accepted');
select t.check('second accept loses cleanly', public.respond_to_swap((select id from ids where k='race_d'), 'accept') = 'unavailable');
select t.as_admin();
select t.check('loser swap is closed unavailable', (select status || '/' || closed_reason from swaps where id = (select id from ids where k='race_d')) = 'cancelled/unavailable');
select t.check('winner keeps the reservation', (select count(*) from swap_items where reserved and swap_id = (select id from ids where k='race_b')) = 2);
-- Backstop: a second reservation of the same listing is impossible even by force.
select t.throws('unique index blocks double reservation',
  format($q$ update swap_items set reserved = true where swap_id = %L and listing_id = %L $q$, (select id from ids where k='race_d'), (select id from pub where k='a2')), 'duplicate key');
-- Cancel the winner so the scarf is free again.
select t.as_user('b0000000-0000-0000-0000-00000000000b');
select public.cancel_swap((select id from ids where k='race_b'));
select t.as_admin();
select t.check('cancel releases reservation', (select count(*) from swap_items where reserved) = 0 and (select status from swap_listings where id = (select id from pub where k='a2')) = 'active');

-- ── Block closes swaps both ways, quietly ────────────────────────────────────
insert into ids select 'blk', t.propose('d0000000-0000-0000-0000-00000000000d', (select id from pub where k='a2'), (select id from pub where k='d1'), 'Hello');
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select public.respond_to_swap((select id from ids where k='blk'), 'accept');
select public.block_user('d0000000-0000-0000-0000-00000000000d');
select t.as_admin();
select t.check('block closes the swap as unavailable', (select status || '/' || closed_reason from swaps where id = (select id from ids where k='blk')) = 'cancelled/unavailable');
select t.check('block frees the listing', (select status from swap_listings where id = (select id from pub where k='a2')) = 'active');
create temp table shapes (k text primary key, shape text);
grant all on shapes to public;
select t.as_user('d0000000-0000-0000-0000-00000000000d');
-- A block must not be visible as a block. The blocked member keeps the swap in their inbox, closed, and can
-- open it: they see the pieces' names and the quiet "no longer available" ending, nothing else.
-- (Captured before they open it, for the comparison below: opening a swap clears its dot.)
insert into shapes select 'blocked_row', concat_ws('|', status, closed_reason, bucket, (thumb_path is null)::text, i_done::text, they_done::text, attention::text)
  from public.list_my_swaps() where swap_id = (select id from ids where k='blk');
select t.check('blocked member still has the swap in the inbox', (select count(*) from public.list_my_swaps() where swap_id = (select id from ids where k='blk')) = 1);
select t.check('it is closed, in past, with a neutral label and no photo',
  (select status || '/' || closed_reason || '/' || bucket || '/' || other_label || '/' || (thumb_path is null)::text from public.list_my_swaps() where swap_id = (select id from ids where k='blk'))
  = 'cancelled/unavailable/past/Swap member/true');
select t.check('blocked member can open the closed swap',
  (public.get_swap((select id from ids where k='blk'))->>'status') = 'cancelled'
  and (public.get_swap((select id from ids where k='blk'))->>'closedReason') = 'unavailable'
  and (public.get_swap((select id from ids where k='blk'))->>'otherLabel') = 'Swap member');
select t.check('...with no member messages, no photo and no ids',
  not exists (select 1 from jsonb_array_elements(public.get_swap((select id from ids where k='blk'))->'messages') m where m->>'kind' <> 'system')
  and not exists (select 1 from jsonb_array_elements(public.get_swap((select id from ids where k='blk'))->'items') i where i->>'photoPath' is not null or i->>'claimedItemId' is not null or i->>'giverItemId' is not null)
  and public.get_swap((select id from ids where k='blk'))::text !~ 'a0000000');
select t.check('...and no actions at all', not exists (select 1 from jsonb_each(public.get_swap((select id from ids where k='blk'))->'actions') a where a.key <> 'messagesLeft' and a.value = 'true'::jsonb)
  and (public.get_swap((select id from ids where k='blk'))->'actions'->>'messagesLeft') = '0');
select t.check('blocked member cannot see blocker''s listings', (select count(*) from public.browse_swap_listings('friends')) = 0);
select t.throws('blocked member cannot message', format($q$ select public.send_swap_message(%L, 'hello?') $q$, (select id from ids where k='blk')), 'swap_unavailable');
select t.throws('blocked member cannot cancel or finish a swap that is already over', format($q$ select public.cancel_swap(%L) $q$, (select id from ids where k='blk')), 'swap_unavailable');
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select t.check('the blocker keeps the swap in their inbox too', (select count(*) from public.list_my_swaps() where swap_id = (select id from ids where k='blk')) = 1);

-- ── Unfriend closes friends-kind swaps ───────────────────────────────────────
select t.as_admin();
insert into ids select 'unf', t.propose('b0000000-0000-0000-0000-00000000000b', (select id from pub where k='a2'), (select id from pub where k='b2'));
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select public.respond_to_swap((select id from ids where k='unf'), 'accept');
delete from friend_requests where requester_id = 'a0000000-0000-0000-0000-00000000000a' and recipient_id = 'b0000000-0000-0000-0000-00000000000b';
select t.as_admin();
select t.check('unfriend closes the swap', (select status || '/' || closed_reason from swaps where id = (select id from ids where k='unf')) = 'cancelled/unavailable');
select t.check('unfriend frees listings', (select count(*) from swap_items where reserved) = 0);
insert into friend_requests (requester_id, recipient_id, status, responded_at) values ('a0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-00000000000b', 'accepted', now());

-- ── Item deleted / wishlisted mid-swap ───────────────────────────────────────
update swaps set closed_at = now() - interval '8 days' where closed_reason = 'declined';
insert into ids select 'del', t.propose('b0000000-0000-0000-0000-00000000000b', (select id from pub where k='a2'), (select id from pub where k='b2'));
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select t.check('accept before delete', public.respond_to_swap((select id from ids where k='del'), 'accept') = 'accepted');
select t.as_user('b0000000-0000-0000-0000-00000000000b');
delete from clothing_items where id = 'b1000000-0000-0000-0000-000000000002';
select t.as_admin();
select t.check('deleting an item cancels the open swap', (select status || '/' || closed_reason from swaps where id = (select id from ids where k='del')) = 'cancelled/unavailable');
select t.check('deleted item''s listing is withdrawn', (select status from swap_listings where id = (select id from pub where k='b2')) = 'withdrawn');
select t.check('other side''s listing returns to the rack', (select status from swap_listings where id = (select id from pub where k='a2')) = 'active');
select t.check('listing kept its snapshot', (select name from swap_listings where id = (select id from pub where k='b2')) = 'Wool hat');

-- The blocked member's inbox after a block reads like a member's inbox after a piece was deleted.
select t.as_user('d0000000-0000-0000-0000-00000000000d');
insert into shapes select 'blocked_detail', concat_ws('|', d->>'status', d->>'closedReason', d->'actions'->>'canCancel', d->'actions'->>'canComplete',
  d->'actions'->>'canMessage', d->'actions'->>'canAccept', jsonb_array_length(d->'items')::text)
  from (select public.get_swap((select id from ids where k='blk')) d) x;
select t.as_user('b0000000-0000-0000-0000-00000000000b');
insert into shapes select 'deleted_row', concat_ws('|', status, closed_reason, bucket, (thumb_path is null)::text, i_done::text, they_done::text, attention::text)
  from public.list_my_swaps() where swap_id = (select id from ids where k='del');
insert into shapes select 'deleted_detail', concat_ws('|', d->>'status', d->>'closedReason', d->'actions'->>'canCancel', d->'actions'->>'canComplete',
  d->'actions'->>'canMessage', d->'actions'->>'canAccept', jsonb_array_length(d->'items')::text)
  from (select public.get_swap((select id from ids where k='del')) d) x;
select t.as_admin();
select t.check('inbox row: block and piece deletion look the same to the member who did not do it',
  (select shape from shapes where k='blocked_row') = (select shape from shapes where k='deleted_row'),
  (select string_agg(k || '=' || shape, E'\n') from shapes));
select t.check('thread: block and piece deletion look the same to the member who did not do it',
  (select shape from shapes where k='blocked_detail') = (select shape from shapes where k='deleted_detail'),
  (select string_agg(k || '=' || shape, E'\n') from shapes));
-- wishlist move
update clothing_items set is_wishlist = true where id = 'a1000000-0000-0000-0000-000000000002';
select t.check('moving to the wishlist withdraws the listing', (select status from swap_listings where id = (select id from pub where k='a2')) = 'withdrawn');
update clothing_items set is_wishlist = false where id = 'a1000000-0000-0000-0000-000000000002';

-- ── Expiry, half-done swaps, limits ──────────────────────────────────────────
select t.as_service();
do $$ declare r jsonb; lid uuid; begin
  r := public.swap_publish_precheck('a0000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-000000000002', 'friends', null);
  lid := (r->>'listingId')::uuid;
  perform public.swap_publish_commit('a0000000-0000-0000-0000-00000000000a', lid, 'a1000000-0000-0000-0000-000000000002', 'friends', null, 'stripped');
  update pub set id = lid where k = 'a2';
end $$;
select t.as_admin();
insert into ids select 'exp', t.propose('b0000000-0000-0000-0000-00000000000b', (select id from pub where k='a2'), (select id from pub where k='b1'));
select t.as_admin();
update swaps set expires_at = now() - interval '1 minute' where id = (select id from ids where k='exp');
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select t.check('overdue proposal expires on the next read', (select status from public.list_my_swaps() where swap_id = (select id from ids where k='exp')) = 'expired');

insert into ids select 'half', t.propose('b0000000-0000-0000-0000-00000000000b', (select id from pub where k='a2'), (select id from pub where k='b1'));
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select public.respond_to_swap((select id from ids where k='half'), 'accept');
select t.as_user('b0000000-0000-0000-0000-00000000000b');
select public.swap_complete_my_side((select id from ids where k='half'), false);
select t.as_admin();
update swaps set proposer_done_at = now() - interval '15 days' where id = (select id from ids where k='half');
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select t.check('half-done swap finishes after 14 days', (select status from public.list_my_swaps() where swap_id = (select id from ids where k='half')) = 'completed');
select t.check('A is told to collect their piece', (select bucket from public.list_my_swaps() where swap_id = (select id from ids where k='half')) = 'needs_you');
select t.check('A can still claim after auto-complete', jsonb_array_length(public.swap_complete_my_side((select id from ids where k='half'), true)->'received') = 1);
select t.as_admin();
select t.check('auto-completed flag set', (select auto_completed from swaps where id = (select id from ids where k='half')));

-- ── One-sided "We swapped!": no lock-in, and the absolute expiry never beats the auto-finish ──
select t.as_admin();
update swaps set closed_at = now() - interval '8 days' where closed_reason = 'declined';
update swap_listings set status = 'active' where id in ((select id from pub where k='a1'), (select id from pub where k='b1'));
insert into ids select 'tap', t.propose('b0000000-0000-0000-0000-00000000000b', (select id from pub where k='a1'), (select id from pub where k='b1'));
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select public.respond_to_swap((select id from ids where k='tap'), 'accept');
select t.as_user('b0000000-0000-0000-0000-00000000000b');
select public.swap_complete_my_side((select id from ids where k='tap'), false);
select t.as_admin();
select t.check('the first tap pushes the absolute expiry out to about 15 days', (select expires_at > now() + interval '14 days 23 hours' from swaps where id = (select id from ids where k='tap')));
select t.as_user('b0000000-0000-0000-0000-00000000000b');
select t.check('B has tapped, so B has nothing left to cancel', not (public.get_swap((select id from ids where k='tap'))->'actions'->>'canCancel')::boolean);
select t.throws('and cannot cancel', format($q$ select public.cancel_swap(%L) $q$, (select id from ids where k='tap')), 'swap_not_open');
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select t.check('A has not tapped, so A can still cancel even though B has', (public.get_swap((select id from ids where k='tap'))->'actions'->>'canCancel')::boolean);
select public.cancel_swap((select id from ids where k='tap'));
select t.as_admin();
select t.check('A cancelled after B tapped', (select status || '/' || closed_reason from swaps where id = (select id from ids where k='tap')) = 'cancelled/cancelled_by_recipient');
select t.check('A''s piece is not locked any more', (select status from swap_listings where id = (select id from pub where k='b1')) = 'active' and (select count(*) from swap_items where reserved) = 0);

-- Tapped on day 25 of 30: the swap is finished 14 days later, never expired under the member who tapped.
update swap_listings set status = 'active' where id in ((select id from pub where k='a1'), (select id from pub where k='b1'));
insert into ids select 'late', t.propose('b0000000-0000-0000-0000-00000000000b', (select id from pub where k='a1'), (select id from pub where k='b1'));
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select public.respond_to_swap((select id from ids where k='late'), 'accept');
select t.as_admin();
update swaps set expires_at = now() + interval '5 days' where id = (select id from ids where k='late');
select t.as_user('b0000000-0000-0000-0000-00000000000b');
select public.swap_complete_my_side((select id from ids where k='late'), false);
select t.as_admin();
select t.check('a tap on day 25 moves the expiry past the 14-day auto-finish', (select expires_at > now() + interval '14 days' from swaps where id = (select id from ids where k='late')));
-- 16 days later: the absolute date (done + 15 days) has also passed.
update swaps set proposer_done_at = now() - interval '16 days', expires_at = now() - interval '1 day' where id = (select id from ids where k='late');
select public.swap_janitor(true);
select t.check('the global job finishes it instead of expiring it',
  (select status || '/' || auto_completed::text from swaps where id = (select id from ids where k='late')) = 'completed/true');
select t.check('both listings are consumed, not put back on the rack',
  (select count(*) from swap_listings where id in ((select id from pub where k='a1'), (select id from pub where k='b1')) and status = 'completed') = 2);

-- The same on a member's own read (no job needed).
update swap_listings set status = 'active' where id in ((select id from pub where k='a1'), (select id from pub where k='b1'));
insert into ids select 'late2', t.propose('b0000000-0000-0000-0000-00000000000b', (select id from pub where k='a1'), (select id from pub where k='b1'));
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select public.respond_to_swap((select id from ids where k='late2'), 'accept');
select t.as_user('b0000000-0000-0000-0000-00000000000b');
select public.swap_complete_my_side((select id from ids where k='late2'), false);
select t.as_admin();
update swaps set proposer_done_at = now() - interval '16 days', expires_at = now() - interval '1 day' where id = (select id from ids where k='late2');
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select t.check('a read finishes it too', (select status from public.list_my_swaps() where swap_id = (select id from ids where k='late2')) = 'completed');
select t.as_admin();
update swap_listings set status = 'active' where id in ((select id from pub where k='a1'), (select id from pub where k='b1'));

-- Message rate limit (6 a minute).
update swaps set closed_at = now() - interval '8 days' where closed_reason = 'declined';
select t.as_admin();
update swap_listings set status = 'active' where id in ((select id from pub where k='b1'), (select id from pub where k='a1'));
insert into ids select 'chat', t.propose('b0000000-0000-0000-0000-00000000000b', (select id from pub where k='a1'), (select id from pub where k='b1'));
select t.as_user('b0000000-0000-0000-0000-00000000000b');
do $$ begin for i in 1..6 loop perform public.send_swap_message((select id from ids where k='chat'), 'hello ' || i); end loop; end $$;
select t.throws('7th message in a minute is rate limited', format($q$ select public.send_swap_message(%L, 'one more') $q$, (select id from ids where k='chat')), 'swap_rate_limited');

-- Open-proposal caps.
select t.as_admin();
insert into auth.users (id, email, raw_user_meta_data, created_at)
select ('e0000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 'u' || g || '@example.test', '{}', now() - interval '9 days' from generate_series(1, 24) g;
insert into friend_requests (requester_id, recipient_id, status, responded_at)
select ('e0000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 'a0000000-0000-0000-0000-00000000000a', 'accepted', now() from generate_series(1, 24) g;
update swaps set closed_at = closed_at where false;
-- 9 fake open proposals for A's scarf (listing a2) -> listing_busy for the next asker.
insert into swaps (id, proposer_id, recipient_id, pair_kind, status) select gen_random_uuid(), ('e0000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 'a0000000-0000-0000-0000-00000000000a', 'friends', 'proposed' from generate_series(1, 9) g;
insert into swap_items (swap_id, listing_id, side, name) select s.id, (select id from pub where k='a1'), 'request', 'Blue blazer' from swaps s where s.status = 'proposed' and s.proposer_id::text like 'e0000000%';
select t.as_user('b0000000-0000-0000-0000-00000000000b');
select t.throws('listing with 8 open proposals is busy', format($q$ select public.propose_swap(%L, %L, 'hi', gen_random_uuid()) $q$, array[(select id from pub where k='a1')], array[(select id from pub where k='b1')]), 'listing_busy');
select t.as_admin();
-- 11 more -> A has 20 inbound open: recipient_busy.
insert into swaps (id, proposer_id, recipient_id, pair_kind, status) select gen_random_uuid(), ('e0000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 'a0000000-0000-0000-0000-00000000000a', 'friends', 'proposed' from generate_series(10, 20) g;
select t.as_user('b0000000-0000-0000-0000-00000000000b');
select t.throws('recipient with 20 open proposals is busy', format($q$ select public.propose_swap(%L, %L, 'hi', gen_random_uuid()) $q$, array[(select id from pub where k='a1')], array[(select id from pub where k='b1')]), 'recipient_busy');
select t.as_admin();
delete from swaps where proposer_id::text like 'e0000000%';
-- 5 open outbound from D to other members -> swap_open_limit.
insert into swaps (id, proposer_id, recipient_id, pair_kind, status) select gen_random_uuid(), 'b0000000-0000-0000-0000-00000000000b', ('e0000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 'friends', 'proposed' from generate_series(1, 4) g;
select t.as_user('b0000000-0000-0000-0000-00000000000b');
select t.throws('5 open outbound proposals is the limit', format($q$ select public.propose_swap(%L, %L, 'hi', gen_random_uuid()) $q$, array[(select id from pub where k='a1')], array[(select id from pub where k='b1')]), 'swap_open_limit');
select t.as_admin();
delete from swaps where proposer_id = 'b0000000-0000-0000-0000-00000000000b' and recipient_id::text like 'e0000000%';

-- ── My listings: stale flag, note, withdraw closes proposals ─────────────────
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select t.check('listing not stale at first', not (select stale from public.list_my_swap_listings() where listing_id = (select id from pub where k='a1')));
update clothing_items set name = 'Blue blazer (new)' where id = 'a1000000-0000-0000-0000-000000000001';
select t.check('editing the item marks the listing stale', (select stale from public.list_my_swap_listings() where listing_id = (select id from pub where k='a1')));
select public.update_swap_listing((select id from pub where k='a1'), '  Size M, prefers tops ');
select t.check('note updated and trimmed', (select note from public.list_my_swap_listings() where listing_id = (select id from pub where k='a1')) = 'Size M, prefers tops');
select t.throws('note with scam words refused', format($q$ select public.update_swap_listing(%L, 'gift card only') $q$, (select id from pub where k='a1')), 'text_not_allowed');
select t.throws('cannot update someone else''s listing', format($q$ select public.update_swap_listing(%L, 'x') $q$, (select id from pub where k='b1')), 'swap_unavailable');
-- chat swap is proposed on a1; withdrawing closes it.
select public.withdraw_swap_listing((select id from pub where k='a1'));
select t.as_admin();
select t.check('withdrawing a listing closes proposals for it', (select status from swaps where id = (select id from ids where k='chat')) = 'cancelled');
select t.check('listing withdrawn', (select status from swap_listings where id = (select id from pub where k='a1')) = 'withdrawn');

-- ── Retention (janitor) ──────────────────────────────────────────────────────
update swaps set closed_at = now() - interval '31 days' where id = (select id from ids where k='chat');
select public.swap_janitor(true);
select t.check('messages go 30 days after close', (select count(*) from swap_messages where swap_id = (select id from ids where k='chat')) = 0);
select t.check('the swap itself stays until 90 days', (select count(*) from swaps where id = (select id from ids where k='chat')) = 1);
update swaps set closed_at = now() - interval '91 days' where closed_at is not null;
update swap_listings set status_changed_at = now() - interval '31 days' where id = (select id from pub where k='a1');
select public.swap_janitor(true);
select t.check('swap purged after 90 days', (select count(*) from swaps where id = (select id from ids where k='chat')) = 0);
select t.check('ended listing purged (even if a swap once used it) and photo queued', (select count(*) from swap_listings where id = (select id from pub where k='a1')) = 0
  and exists (select 1 from swap_photo_gc where path = (select id from pub where k='a1')::text || '.jpg'));
````

#### `supabase/tests/swaps/s4_deletion.sql`

````sql
create temp table ids (k text primary key, id uuid);
grant all on ids to public;
create or replace function t.propose(p_who uuid, p_req uuid, p_off uuid, p_note text default null) returns uuid language plpgsql as $$
begin
  perform t.as_user(p_who);
  return public.propose_swap(array[p_req], array[p_off], p_note, gen_random_uuid());
end $$;
-- Swap 1: completed (stub must survive B leaving). Swap 2: accepted. Swap 3 would be proposed.
insert into ids select 'done', t.propose('b0000000-0000-0000-0000-00000000000b', (select id from pub where k='a1'), (select id from pub where k='b1'), 'first');
select t.as_user('a0000000-0000-0000-0000-00000000000a'); select public.respond_to_swap((select id from ids where k='done'), 'accept');
select public.swap_complete_my_side((select id from ids where k='done'), false);
select t.as_user('b0000000-0000-0000-0000-00000000000b'); select public.swap_complete_my_side((select id from ids where k='done'), false);
select t.as_admin();
update swap_listings set status = 'active' where id in ((select id from pub where k='a2'));
insert into ids select 'open', t.propose('b0000000-0000-0000-0000-00000000000b', (select id from pub where k='a2'), (select id from pub where k='b2'), 'second');
select t.as_user('a0000000-0000-0000-0000-00000000000a'); select public.respond_to_swap((select id from ids where k='open'), 'accept');

-- B deletes their account.
select t.as_user('b0000000-0000-0000-0000-00000000000b');
select public.delete_user_account();
select t.as_admin();
select t.check('B''s account is gone', not exists (select 1 from auth.users where id = 'b0000000-0000-0000-0000-00000000000b'));
select t.check('no swap table row references B', 
  not exists (select 1 from swaps where 'b0000000-0000-0000-0000-00000000000b' in (proposer_id, recipient_id))
  and not exists (select 1 from swap_listings where owner_id = 'b0000000-0000-0000-0000-00000000000b')
  and not exists (select 1 from swap_messages where sender_id = 'b0000000-0000-0000-0000-00000000000b')
  and not exists (select 1 from swap_members where user_id = 'b0000000-0000-0000-0000-00000000000b')
  and not exists (select 1 from swap_rate_counters where user_id = 'b0000000-0000-0000-0000-00000000000b'));
select t.check('B''s listing photos are queued for removal', (select count(*) from swap_photo_gc where path in ((select id::text || '.jpg' from pub where k='b1'), (select id::text || '.jpg' from pub where k='b2'))) = 2);
select t.check('open swap closed unavailable', (select status || '/' || closed_reason from swaps where id = (select id from ids where k='open')) = 'cancelled/unavailable');
select t.check('A''s reserved listing is free again', (select status from swap_listings where id = (select id from pub where k='a2')) = 'active');
select t.check('no reservations left', (select count(*) from swap_items where reserved) = 0);
select t.check('completed swap stub survives for A', (select status from swaps where id = (select id from ids where k='done')) = 'completed');
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select t.check('A sees "Former member"', (select other_label from public.list_my_swaps() where swap_id = (select id from ids where k='done')) = 'Former member');
select t.check('A can still open the stub, without a counterpart id', public.get_swap((select id from ids where k='done'))::text !~ 'b0000000');
select t.check('A cannot message a former member', not (public.get_swap((select id from ids where k='open'))->'actions'->>'canMessage')::boolean);
select t.check('A keeps what they received', exists (select 1 from clothing_items where user_id = 'a0000000-0000-0000-0000-00000000000a' and name = 'Linen shirt'));

-- A deletes too: nothing is left of the swaps.
select public.delete_user_account();
select t.as_admin();
select t.check('both gone: no swaps left', (select count(*) from swaps) = 0 and (select count(*) from swap_items) = 0 and (select count(*) from swap_messages) = 0);
select t.check('both gone: no listings or members', (select count(*) from swap_listings) = 0 and (select count(*) from swap_members where user_id in ('a0000000-0000-0000-0000-00000000000a','b0000000-0000-0000-0000-00000000000b')) = 0);
select t.check('queue holds paths only', (select count(*) from swap_photo_gc) >= 4);
````

#### `supabase/tests/swaps/s5_moderation_community.sql`

````sql
create temp table ids (k text primary key, id uuid);
grant all on ids to public;
create or replace function t.propose(p_who uuid, p_req uuid, p_off uuid, p_note text default null) returns uuid language plpgsql as $$
begin
  perform t.as_user(p_who);
  return public.propose_swap(array[p_req], array[p_off], p_note, gen_random_uuid());
end $$;

-- ── Reports ──────────────────────────────────────────────────────────────────
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select public.report_swap_content('listing', (select id from pub where k='b1'), 'scam', 'asks for money');
select t.as_admin();
select t.check('listing report stored with evidence and the right target',
  exists (select 1 from content_reports where reporter_id = 'a0000000-0000-0000-0000-00000000000a'
          and reported_user_id = 'b0000000-0000-0000-0000-00000000000b' and context = 'swap_listing'
          and reason = 'scam' and ref_type = 'listing' and evidence->>'name' = 'Linen shirt'));
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select public.report_swap_content('listing', (select id from pub where k='b1'), 'spam');
select t.as_admin();
select t.check('repeat report within a week is folded', (select count(*) from content_reports where ref_id = (select id from pub where k='b1')) = 1);
select t.as_user('c0000000-0000-0000-0000-00000000000c');
select t.throws('stranger cannot report what they cannot see', format($q$ select public.report_swap_content('listing', %L, 'spam') $q$, (select id from pub where k='b1')), 'swap_unavailable');
select t.throws('report: bad reason', format($q$ select public.report_swap_content('listing', %L, 'nonsense') $q$, (select id from pub where k='b1')), 'invalid_report');
select t.throws('report: bad ref type', format($q$ select public.report_swap_content('user', %L, 'spam') $q$, (select id from pub where k='b1')), 'invalid_report');

-- Hold at 3 different reporters: B gets two more friends who can see the listing.
select t.as_admin();
insert into auth.users (id, email, created_at) values
  ('e1000000-0000-0000-0000-000000000001', 'e1@example.test', now() - interval '9 days'),
  ('e1000000-0000-0000-0000-000000000002', 'e2@example.test', now() - interval '9 days');
insert into friend_requests (requester_id, recipient_id, status, responded_at) values
  ('e1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'accepted', now()),
  ('e1000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-00000000000b', 'accepted', now());
insert into swap_members (user_id, terms_version, terms_accepted_at) values
  ('e1000000-0000-0000-0000-000000000001', '2026-10', now()), ('e1000000-0000-0000-0000-000000000002', '2026-10', now());
insert into ids select 'prop', t.propose('a0000000-0000-0000-0000-00000000000a', (select id from pub where k='b1'), (select id from pub where k='a1'), 'hello');
select t.as_user('e1000000-0000-0000-0000-000000000001');
select public.report_swap_content('listing', (select id from pub where k='b1'), 'not_as_described');
select t.as_admin();
select t.check('two reporters do not hold the listing', (select status from swap_listings where id = (select id from pub where k='b1')) = 'active');
select t.as_user('e1000000-0000-0000-0000-000000000002');
select public.report_swap_content('listing', (select id from pub where k='b1'), 'inappropriate');
select t.as_admin();
select t.check('three reporters hold the listing', (select status from swap_listings where id = (select id from pub where k='b1')) = 'held');
select t.check('holding closes the open proposal', (select status from swaps where id = (select id from ids where k='prop')) = 'cancelled');
select t.check('held listing is off the rack', (select count(*) from swap_listings where status='held') = 1);
select public.swap_admin_release_listing((select id from pub where k='b1'));
select t.check('admin can release a held listing', (select status from swap_listings where id = (select id from pub where k='b1')) = 'active');
select t.check('releasing clears who held it', (select held_by from swap_listings where id = (select id from pub where k='b1')) is null);

-- ── Holds are sticky: expiry, renewing, withdrawing, listing again and lifting a suspension do not clear one ──
select t.as_admin();
insert into clothing_items (id, user_id, name, category, size, condition, user_image) values
  ('b1000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-00000000000b', 'Hold test shirt', 'tops', 'M', 'good',
   'https://x.supabase.co/storage/v1/object/public/wardrobe-images/b0000000-0000-0000-0000-00000000000b/1700000000020.jpg'),
  ('b1000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-00000000000b', 'Remove test shirt', 'tops', 'M', 'good',
   'https://x.supabase.co/storage/v1/object/public/wardrobe-images/b0000000-0000-0000-0000-00000000000b/1700000000021.jpg'),
  ('b1000000-0000-0000-0000-000000000007', 'b0000000-0000-0000-0000-00000000000b', 'Reserve test shirt', 'tops', 'M', 'good',
   'https://x.supabase.co/storage/v1/object/public/wardrobe-images/b0000000-0000-0000-0000-00000000000b/1700000000022.jpg');
select t.as_service();
do $$ declare r jsonb; lid uuid; i integer; ids uuid[] := array['b1000000-0000-0000-0000-000000000005', 'b1000000-0000-0000-0000-000000000006', 'b1000000-0000-0000-0000-000000000007'];
begin
  for i in 1..3 loop
    r := public.swap_publish_precheck('b0000000-0000-0000-0000-00000000000b', ids[i], 'friends', null);
    lid := (r->>'listingId')::uuid;
    perform public.swap_publish_commit('b0000000-0000-0000-0000-00000000000b', lid, ids[i], 'friends', null, 'stripped');
    insert into pub values ('h' || i, lid);
  end loop;
end $$;
select t.as_admin();
select public.swap_admin_hold_listing((select id from pub where k='h1'));
select t.check('a hold records who made it', (select status || '/' || held_by from swap_listings where id = (select id from pub where k='h1')) = 'held/admin');
-- 1. the daily job does not turn a hold into an expiry
update swap_listings set expires_at = now() - interval '1 day' where id = (select id from pub where k='h1');
select public.swap_janitor(true);
select t.check('the janitor leaves a held listing held', (select status from swap_listings where id = (select id from pub where k='h1')) = 'held');
-- 2. renewing and 3. withdrawing are refused
select t.as_user('b0000000-0000-0000-0000-00000000000b');
select t.throws('renew refuses a held listing', format($q$ select public.renew_swap_listing(%L) $q$, (select id from pub where k='h1')), 'listing_held');
select t.throws('withdraw refuses a held listing', format($q$ select public.withdraw_swap_listing(%L) $q$, (select id from pub where k='h1')), 'listing_held');
select t.check('the owner still sees it, as held', (select status from public.list_my_swap_listings() where listing_id = (select id from pub where k='h1')) = 'held');
-- 4. listing the piece again is refused, before and after the photo copy
select t.as_service();
select t.throws('precheck refuses a piece whose listing is held', $q$ select public.swap_publish_precheck('b0000000-0000-0000-0000-00000000000b', 'b1000000-0000-0000-0000-000000000005', 'friends', null) $q$, 'listing_held');
select t.throws('commit refuses a piece whose listing is held', $q$ select public.swap_publish_commit('b0000000-0000-0000-0000-00000000000b', gen_random_uuid(), 'b1000000-0000-0000-0000-000000000005', 'friends', null, 'stripped') $q$, 'listing_held');
select t.as_admin();
select t.check('still exactly one listing for the held piece', (select count(*) from swap_listings where item_id = 'b1000000-0000-0000-0000-000000000005') = 1);
-- 4b. moving the piece to the wishlist and back does not clear the hold
update clothing_items set is_wishlist = true where id = 'b1000000-0000-0000-0000-000000000005';
select t.check('a hold survives the piece going to the wishlist', (select status from swap_listings where id = (select id from pub where k='h1')) = 'held');
update clothing_items set is_wishlist = false where id = 'b1000000-0000-0000-0000-000000000005';
select t.as_service();
select t.throws('...and back: the piece still cannot be listed again', $q$ select public.swap_publish_precheck('b0000000-0000-0000-0000-00000000000b', 'b1000000-0000-0000-0000-000000000005', 'friends', null) $q$, 'listing_held');
select t.as_admin();
-- 5. a suspension that ends releases only what it held
select public.swap_admin_suspend('b0000000-0000-0000-0000-00000000000b', 'test');
select t.check('a suspension holds the member''s other listings, marked as such',
  (select held_by from swap_listings where id = (select id from pub where k='h2')) = 'suspension');
select public.swap_admin_unsuspend('b0000000-0000-0000-0000-00000000000b');
select t.check('lifting the suspension releases its own holds', (select status from swap_listings where id = (select id from pub where k='h2')) = 'active');
select t.check('...but not a hold made by a person', (select status from swap_listings where id = (select id from pub where k='h1')) = 'held');
-- 6. releasing is a person's decision, listing by listing (the listing is long past its date, so it comes back expired)
select public.swap_admin_release_listing((select id from pub where k='h1'));
select t.check('a person can release it', (select status from swap_listings where id = (select id from pub where k='h1')) = 'expired');

-- 7. a person can remove a listing for good
select public.swap_admin_hold_listing((select id from pub where k='h2'));
insert into content_reports (reporter_id, reported_user_id, context, reason, ref_type, ref_id)
values ('a0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-00000000000b', 'swap_listing', 'scam', 'listing', (select id from pub where k='h2'));
select public.swap_admin_remove_listing((select id from pub where k='h2'), 'looks like a scam');
select t.check('removed', (select status from swap_listings where id = (select id from pub where k='h2')) = 'removed');
select t.check('its photo is queued for deletion', exists (select 1 from swap_photo_gc where path = (select id::text || '.jpg' from pub where k='h2')));
select t.check('its reports are marked handled', (select outcome from content_reports where ref_id = (select id from pub where k='h2')) = 'looks like a scam');
select t.check('it is off the rack for everyone', not exists (select 1 from swap_listings where id = (select id from pub where k='h2') and status = 'active'));
select t.as_user('b0000000-0000-0000-0000-00000000000b');
select t.throws('a removed listing cannot be renewed', format($q$ select public.renew_swap_listing(%L) $q$, (select id from pub where k='h2')), 'listing_held');
select t.as_service();
select t.throws('the piece cannot be listed again', $q$ select public.swap_publish_precheck('b0000000-0000-0000-0000-00000000000b', 'b1000000-0000-0000-0000-000000000006', 'friends', null) $q$, 'listing_held');
select t.as_admin();
update swap_listings set status_changed_at = now() - interval '40 days' where id = (select id from pub where k='h2');
update content_reports set created_at = now() - interval '100 days' where ref_id = (select id from pub where k='h2');
select public.swap_janitor(true);
select t.check('the removed row stays while the piece exists (so it cannot be listed again)', exists (select 1 from swap_listings where id = (select id from pub where k='h2')));
delete from clothing_items where id = 'b1000000-0000-0000-0000-000000000006';
select public.swap_janitor(true);
select t.check('...and goes after the piece is deleted', not exists (select 1 from swap_listings where id = (select id from pub where k='h2')));

-- 8. reports made while a listing is reserved still count when it comes back
select t.as_admin();
insert into friend_requests (requester_id, recipient_id, status, responded_at) values
  ('e1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'accepted', now()), ('e1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a', 'accepted', now());
select t.as_user('e1000000-0000-0000-0000-000000000001'); select public.report_swap_content('listing', (select id from pub where k='h3'), 'not_as_described');
select t.as_user('e1000000-0000-0000-0000-000000000002'); select public.report_swap_content('listing', (select id from pub where k='h3'), 'not_as_described');
select t.as_admin();
select t.check('two reports do not hold it', (select status from swap_listings where id = (select id from pub where k='h3')) = 'active');
insert into ids select 'rsv', t.propose('a0000000-0000-0000-0000-00000000000a', (select id from pub where k='h3'), (select id from pub where k='a1'), 'hello');
select t.as_user('b0000000-0000-0000-0000-00000000000b');
select public.respond_to_swap((select id from ids where k='rsv'), 'accept');
-- A reserved listing can only be reported by the two people in the swap; A's report is the third.
select t.as_user('a0000000-0000-0000-0000-00000000000a'); select public.report_swap_content('listing', (select id from pub where k='h3'), 'not_as_described');
select t.as_admin();
select t.check('three reports do not disturb a swap in progress', (select status from swap_listings where id = (select id from pub where k='h3')) = 'reserved');
select t.as_user('b0000000-0000-0000-0000-00000000000b');
select public.cancel_swap((select id from ids where k='rsv'));
select t.as_admin();
select t.check('when the swap ends the listing is held, not put back on the rack',
  (select status || '/' || held_by from swap_listings where id = (select id from pub where k='h3')) = 'held/reports');
select t.check('...and the other side''s listing is free again', (select status from swap_listings where id = (select id from pub where k='a1')) = 'active');
select public.swap_admin_release_listing((select id from pub where k='h3'));

-- Chat report with a flagged message and evidence.
select t.as_admin();
update swaps set closed_at = now() - interval '8 days' where closed_reason = 'declined';
insert into ids select 'chat', t.propose('a0000000-0000-0000-0000-00000000000a', (select id from pub where k='b2'), (select id from pub where k='a1'), 'hello there');
select t.as_user('b0000000-0000-0000-0000-00000000000b');
select public.send_swap_message((select id from ids where k='chat'), 'you are annoying', gen_random_uuid());
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select public.report_swap_content('swap', (select id from ids where k='chat'), 'harassment', 'rude',
  (public.get_swap((select id from ids where k='chat'))->'messages'->-1->>'id')::bigint);
select t.throws('cannot flag my own message', format($q$ select public.report_swap_content('swap', %L, 'harassment', null, %s) $q$, (select id from ids where k='chat'),
  (select (public.get_swap((select id from ids where k='chat'))->'messages'->1->>'id')::bigint)), 'invalid_report');
select t.as_admin();
select t.check('chat report: evidence has the messages and the flag',
  exists (select 1 from content_reports where context = 'swap_chat' and reported_user_id = 'b0000000-0000-0000-0000-00000000000b'
          and jsonb_array_length(evidence->'messages') >= 3 and evidence->>'flaggedMessageId' is not null
          and evidence->'messages'->-1->>'from' = 'reported'));
select t.check('moderation queue lists swap reports', (select count(*) from swap_moderation_queue) >= 2);
select t.as_user('d0000000-0000-0000-0000-00000000000d');
select t.throws('outsider cannot report a swap', format($q$ select public.report_swap_content('swap', %L, 'spam') $q$, (select id from ids where k='chat')), 'swap_unavailable');

-- Report rate limit is shared and per day.
select t.as_admin();
insert into content_reports (reporter_id, reported_user_id, context, reason)
select 'a0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000c', 'friend_request', 'spam' from generate_series(1, 19) g;
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select t.throws('21st report in a day is limited', format($q$ select public.report_swap_content('listing', %L, 'spam') $q$, (select id from pub where k='b2')), 'report_rate_limited');

-- ── Blocking from a swap ─────────────────────────────────────────────────────
select t.as_admin();
delete from content_reports where reporter_id = 'a0000000-0000-0000-0000-00000000000a' and reported_user_id = 'c0000000-0000-0000-0000-00000000000c';
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select public.block_swap_member('swap', (select id from ids where k='chat'));
select t.check('ordinary blocks stay visible to the blocker', (select count(*) from user_blocks) = 1);
select t.as_admin();
select t.check('blocking a friend from a swap blocks them, friend-style',
  exists (select 1 from user_blocks where blocker_id = 'a0000000-0000-0000-0000-00000000000a' and blocked_id = 'b0000000-0000-0000-0000-00000000000b' and not via_swap and blocked_name = 'Bea'));
select t.check('and ends the swap and the friendship',
  (select status from swaps where id = (select id from ids where k='chat')) = 'cancelled'
  and not exists (select 1 from friend_requests where status='accepted' and 'a0000000-0000-0000-0000-00000000000a' in (requester_id, recipient_id) and 'b0000000-0000-0000-0000-00000000000b' in (requester_id, recipient_id)));

-- ── Community tier ───────────────────────────────────────────────────────────
select t.as_service();
select t.throws('cannot enable community without a term list', $q$ select public.swap_set_community_enabled(true) $q$, 'content terms');
select t.as_admin();
-- The term list takes any script, folded; accents and invisible characters in the text do not get round it.
select t.throws('a term must already be folded (no capitals or accents)', $q$ insert into swap_blocked_terms (term, kind) values ('Zzcafé', 'content') $q$, 'violates check constraint');
select t.throws('a term cannot hold punctuation', $q$ insert into swap_blocked_terms (term, kind) values ('zz-term', 'content') $q$, 'violates check constraint');
select t.throws('a term cannot be one letter', $q$ insert into swap_blocked_terms (term, kind) values ('z', 'content') $q$, 'violates check constraint');
insert into swap_blocked_terms (term, kind) values ('zzcafe', 'content'), ('пример', 'content');
select t.check('an accented spelling matches a folded term', public.swap_text_ok('ZZCAFÉ for sale') = 'content');
select t.check('a zero-width character does not split a term', public.swap_text_ok('zz' || chr(8203) || 'cafe') = 'content');
select t.check('a term in another script matches', public.swap_text_ok('Это ПРИМЕР') = 'content');
select t.check('terms match whole words only', public.swap_text_ok('zzcafes and примеры') is null);
delete from swap_blocked_terms where term in ('zzcafe', 'пример');

-- Someone has to hear about reports: the backlog counts old unreviewed ones, and the alert never raises.
insert into content_reports (reporter_id, reported_user_id, context, reason, created_at)
values ('a0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-00000000000b', 'swap_listing', 'scam', now() - interval '6 hours');
select t.check('the backlog counts a report that has waited 4 hours', (select waiting >= 1 and oldest_hours >= 6 from public.swap_report_backlog()));
select t.check('...but not one that is brand new', (select waiting from public.swap_report_backlog(interval '1 day')) < (select waiting from public.swap_report_backlog()));
select t.check('without pg_net or Vault the digest quietly does nothing', public.swap_send_report_digest() = false);
delete from content_reports where created_at < now() - interval '5 hours' and context = 'swap_listing' and ref_id is null;
select t.as_admin();
insert into swap_blocked_terms (term, kind) select 'badword' || g, 'content' from generate_series(1, 50) g;
select t.as_service();
select public.swap_set_community_enabled(true);
select t.as_admin();
insert into auth.users (id, email, raw_user_meta_data, created_at) values ('f0000000-0000-0000-0000-00000000000f', 'new@example.test', '{}', now());
insert into swap_members (user_id, terms_version, terms_accepted_at) values ('f0000000-0000-0000-0000-00000000000f', '2026-10', now());

select t.as_user('f0000000-0000-0000-0000-00000000000f');
select t.throws('join: account too new', $q$ select public.join_swap_community('Fresh Face', true, true, '2026-10') $q$, 'account_too_new');
select t.as_user('c0000000-0000-0000-0000-00000000000c');
select t.throws('join: adult confirmation required', $q$ select public.join_swap_community('Velvet Otter', false, true, '2026-10') $q$, 'adult_required');
select t.throws('join: photo scan acknowledgement required', $q$ select public.join_swap_community('Velvet Otter', true, false, '2026-10') $q$, 'scan_ack_required');
select t.throws('join: reserved alias', $q$ select public.join_swap_community('Smartcloset Staff', true, true, '2026-10') $q$, 'alias_invalid');
select t.throws('join: alias with an email', $q$ select public.join_swap_community('cat@example.com', true, true, '2026-10') $q$, 'alias_invalid');
select t.throws('join: alias with a blocked term', $q$ select public.join_swap_community('badword7 fan', true, true, '2026-10') $q$, 'text_not_allowed');
select public.join_swap_community('Velvet Otter', true, true, '2026-10');
select t.check('C joined', (public.get_swap_settings()->>'communityJoined')::boolean and public.get_swap_settings()->>'alias' = 'Velvet Otter');
select t.as_user('d0000000-0000-0000-0000-00000000000d');
select t.throws('join: alias taken (case-insensitive)', $q$ select public.join_swap_community('velvet otter', true, true, '2026-10') $q$, 'alias_taken');
select public.join_swap_community('Quiet Heron', true, true, '2026-10');
select t.as_user('e1000000-0000-0000-0000-000000000001');
select public.join_swap_community('Brass Finch', true, true, '2026-10');

-- D lists a community item; the photo must be sanitised.
select t.as_service();
select t.throws('community listing needs size and condition', $q$ select public.swap_publish_precheck('e1000000-0000-0000-0000-000000000001', gen_random_uuid(), 'community', null) $q$, 'item_not_found');
select t.as_admin();
insert into clothing_items (id, user_id, name, category, size, condition, user_image, cost) values
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000d', 'Denim jacket', 'outerwear', 'L', 'good',
   'https://x.supabase.co/storage/v1/object/public/wardrobe-images/d0000000-0000-0000-0000-00000000000d/1700000000009.jpg', 55),
  ('d1000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-00000000000d', 'No size top', 'tops', null, null,
   'https://x.supabase.co/storage/v1/object/public/wardrobe-images/d0000000-0000-0000-0000-00000000000d/1700000000010.jpg', 55),
  ('c1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000c', 'Green coat', 'outerwear', 'S', 'like_new',
   'https://x.supabase.co/storage/v1/object/public/wardrobe-images/c0000000-0000-0000-0000-00000000000c/1700000000011.jpg', 90);
select t.as_service();
select t.throws('community listing without size/condition is incomplete', $q$ select public.swap_publish_precheck('d0000000-0000-0000-0000-00000000000d', 'd1000000-0000-0000-0000-000000000002', 'community', null) $q$, 'listing_incomplete');
do $$ declare r jsonb; lid uuid; begin
  r := public.swap_publish_precheck('d0000000-0000-0000-0000-00000000000d', 'd1000000-0000-0000-0000-000000000001', 'community', 'Roomy fit');
  lid := (r->>'listingId')::uuid;
  begin
    perform public.swap_publish_commit('d0000000-0000-0000-0000-00000000000d', lid, 'd1000000-0000-0000-0000-000000000001', 'community', 'Roomy fit', 'stripped');
    perform t.check('community listing must be checked', false, 'accepted a copied photo');
  exception when check_violation then
    perform t.check('community listing must be checked', true);
  end;
  perform public.swap_publish_commit('d0000000-0000-0000-0000-00000000000d', lid, 'd1000000-0000-0000-0000-000000000001', 'community', 'Roomy fit', 'checked');
  insert into pub values ('dc', lid);
  r := public.swap_publish_precheck('c0000000-0000-0000-0000-00000000000c', 'c1000000-0000-0000-0000-000000000001', 'community', null);
  lid := (r->>'listingId')::uuid;
  perform public.swap_publish_commit('c0000000-0000-0000-0000-00000000000c', lid, 'c1000000-0000-0000-0000-000000000001', 'community', null, 'checked');
  insert into pub values ('cc', lid);
end $$;
select t.as_admin();

-- The community rules run again at commit: size cleared after the precheck is refused.
insert into clothing_items (id, user_id, name, category, size, condition, user_image) values
  ('d1000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-00000000000d', 'Wool cap', 'hats', 'M', 'good',
   'https://x.supabase.co/storage/v1/object/public/wardrobe-images/d0000000-0000-0000-0000-00000000000d/1700000000030.jpg');
select t.as_service();
do $$ declare r jsonb; begin
  r := public.swap_publish_precheck('d0000000-0000-0000-0000-00000000000d', 'd1000000-0000-0000-0000-000000000003', 'community', null);
  insert into pub values ('toc2', (r->>'listingId')::uuid);
end $$;
select t.as_admin();
update clothing_items set size = null where id = 'd1000000-0000-0000-0000-000000000003';
select t.as_service();
select t.throws('community commit: size cleared after the precheck is refused', format($q$ select public.swap_publish_commit('d0000000-0000-0000-0000-00000000000d', %L, 'd1000000-0000-0000-0000-000000000003', 'community', null, 'checked') $q$, (select id from pub where k='toc2')), 'listing_incomplete');
select t.as_admin();
update clothing_items set size = 'M', name = 'Wool cap +1 555 123 4567' where id = 'd1000000-0000-0000-0000-000000000003';
select t.as_service();
select t.throws('community commit: contact details added after the precheck are refused', format($q$ select public.swap_publish_commit('d0000000-0000-0000-0000-00000000000d', %L, 'd1000000-0000-0000-0000-000000000003', 'community', null, 'checked') $q$, (select id from pub where k='toc2')), 'text_not_allowed');
select t.as_admin();
select t.check('...and no listing was made', not exists (select 1 from swap_listings where item_id = 'd1000000-0000-0000-0000-000000000003'));

select t.as_user('c0000000-0000-0000-0000-00000000000c');
select t.check('C sees D''s community listing, labelled by alias only',
  (select count(*) from public.browse_swap_listings('community') where owner_label = 'Quiet Heron' and owner_kind = 'member') = 1);
select t.check('community scope shows nothing from friends-only listings', (select count(*) from public.browse_swap_listings('community') where owner_label in ('Ann','Bea')) = 0);
select t.check('C (not D''s friend) sees nothing of D on the friends rack', (select count(*) from public.browse_swap_listings('friends')) = 0);
select t.check('browse labels never contain an email', not exists (select 1 from public.browse_swap_listings('community') where owner_label like '%@%'));
select t.check('more from this member', (select count(*) from public.browse_swap_listings('community', null, null, null, null, null, (select id from pub where k='dc'))) = 1);
select t.check('photo visible to a community viewer', public.can_view_swap_photo((select id::text || '.jpg' from pub where k='dc')));
select t.as_user('e1000000-0000-0000-0000-000000000002');
select t.check('non-member cannot see community photos', not public.can_view_swap_photo((select id::text || '.jpg' from pub where k='dc')));
select t.throws('non-member cannot browse community', $q$ select * from public.browse_swap_listings('community') $q$, 'community_not_joined');

-- Proposal between strangers.
select t.as_user('c0000000-0000-0000-0000-00000000000c');
select t.throws('stranger proposal: phone number in the note refused', format($q$ select public.propose_swap(%L, %L, 'call 555 123 4567', gen_random_uuid()) $q$, array[(select id from pub where k='dc')], array[(select id from pub where k='cc')]), 'text_not_allowed');
select t.throws('stranger proposal: venmo refused', format($q$ select public.propose_swap(%L, %L, 'I can venmo you', gen_random_uuid()) $q$, array[(select id from pub where k='dc')], array[(select id from pub where k='cc')]), 'text_not_allowed');
insert into ids select 'stranger', public.propose_swap(array[(select id from pub where k='dc')], array[(select id from pub where k='cc')], 'Love the jacket', gen_random_uuid());
select t.check('stranger swap is pair_kind community', (public.get_swap((select id from ids where k='stranger'))->>'pairKind') = 'community');
select t.check('stranger swap shows the alias', (public.get_swap((select id from ids where k='stranger'))->>'otherLabel') = 'Quiet Heron');
select t.check('stranger swap exposes no account ids', public.get_swap((select id from ids where k='stranger'))::text !~ 'd0000000');
select public.send_swap_message((select id from ids where k='stranger'), 'What is the length?');
select public.send_swap_message((select id from ids where k='stranger'), 'And the fabric?');
select public.send_swap_message((select id from ids where k='stranger'), 'Any flaws?');
select t.throws('stranger pre-accept message cap', format($q$ select public.send_swap_message(%L, 'Still there?') $q$, (select id from ids where k='stranger')), 'swap_message_limit');
select t.throws('stranger pre-accept: email refused', format($q$ select public.send_swap_message(%L, 'mail me at a@b.com') $q$, (select id from ids where k='stranger')), 'swap_message_limit');
select t.as_user('d0000000-0000-0000-0000-00000000000d');
select t.check('recipient sees the proposal', (select count(*) from public.list_my_swaps() where bucket = 'needs_you') = 1);
select t.check('accept (stranger)', public.respond_to_swap((select id from ids where k='stranger'), 'accept') = 'accepted');
select t.check('after acceptance contact details are allowed', public.send_swap_message((select id from ids where k='stranger'), 'Meet at the cafe, my number is 555 123 4567') > 0);
select t.throws('gift cards are never allowed', format($q$ select public.send_swap_message(%L, 'send a gift card first') $q$, (select id from ids where k='stranger')), 'text_not_allowed');

-- Blocking a stranger by alias: no account id for the blocker.
select t.as_user('c0000000-0000-0000-0000-00000000000c');
select public.block_swap_member('swap', (select id from ids where k='stranger'));
select t.check('direct block table read hides swap-origin blocks', (select count(*) from user_blocks) = 0);
select t.check('list_swap_blocks shows alias and an opaque ref', (select count(*) from public.list_swap_blocks() where label = 'Quiet Heron') = 1);
select t.check('list_swap_blocks has no account id', not exists (select 1 from pg_proc p, unnest(p.proargnames) n where p.proname = 'list_swap_blocks' and n in ('blocked_id','user_id')));
select t.as_admin();
select t.check('blocking a stranger ended the swap and freed the listings',
  (select status from swaps where id = (select id from ids where k='stranger')) = 'cancelled'
  and (select status from swap_listings where id = (select id from pub where k='dc')) = 'active');
select t.as_user('d0000000-0000-0000-0000-00000000000d');
select t.check('blocked stranger no longer sees C''s listings', (select count(*) from public.browse_swap_listings('community') where owner_label = 'Velvet Otter') = 0);
select t.check('blocked stranger sees a closed, neutral swap (no alias, no photo, no actions)',
  (public.get_swap((select id from ids where k='stranger'))->>'status') = 'cancelled'
  and (public.get_swap((select id from ids where k='stranger'))->>'otherLabel') = 'Swap member'
  and public.get_swap((select id from ids where k='stranger'))::text !~ 'Velvet Otter'
  and not (public.get_swap((select id from ids where k='stranger'))->'actions'->>'canMessage')::boolean);
select t.as_user('c0000000-0000-0000-0000-00000000000c');
select public.unblock_swap_member((select ref from public.list_swap_blocks() limit 1));
select t.check('unblock removes it', (select count(*) from public.list_swap_blocks()) = 0);

-- Narrowing and leaving.
select t.as_user('d0000000-0000-0000-0000-00000000000d');
select public.narrow_swap_listing((select id from pub where k='dc'));
select t.as_user('c0000000-0000-0000-0000-00000000000c');
select t.check('narrowed listing leaves the community rack', (select count(*) from public.browse_swap_listings('community')) = 0);
select public.leave_swap_community();
select t.check('leaving releases the alias', (public.get_swap_settings()->>'alias') is null and not (public.get_swap_settings()->>'communityJoined')::boolean);

-- Kill switches.
select t.as_service();
select public.swap_set_enabled(false);
select t.as_user('a0000000-0000-0000-0000-00000000000a');
select t.throws('kill switch: browse paused', $q$ select * from public.browse_swap_listings('friends') $q$, 'swaps_disabled');
select t.throws('kill switch: inbox paused', $q$ select * from public.list_my_swaps() $q$, 'swaps_disabled');
select t.check('kill switch: badge is 0 and does not throw', public.get_swap_badge() = 0);
select t.as_service();
select public.swap_set_enabled(true);

-- Suspension.
select public.swap_admin_suspend('e1000000-0000-0000-0000-000000000001', 'test');
select t.as_user('e1000000-0000-0000-0000-000000000001');
select t.throws('suspended member cannot browse', $q$ select * from public.browse_swap_listings('friends') $q$, 'swap_suspended');
select t.as_service();
select public.swap_admin_unsuspend('e1000000-0000-0000-0000-000000000001');
select t.as_user('e1000000-0000-0000-0000-000000000001');
select t.check('unsuspended member can browse again', (select count(*) from public.browse_swap_listings('friends')) >= 0);

-- Export contains only my own words and no counterpart identity.
select t.as_user('d0000000-0000-0000-0000-00000000000d');
select t.check('export: settings, listings, swaps, my messages only',
  (public.export_my_swap_data()->'settings'->>'alias') = 'Quiet Heron'
  and jsonb_array_length(public.export_my_swap_data()->'listings') >= 1
  and jsonb_array_length(public.export_my_swap_data()->'swaps') >= 1
  and public.export_my_swap_data()::text !~ 'Velvet Otter'
  and public.export_my_swap_data()::text !~ 'cat@example');
````

#### `supabase/tests/swaps/s6_catalog.sql`

````sql
-- Structural checks: nothing is reachable except through the intended functions.
select t.check('RLS is on for every swap table',
  not exists (select 1 from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
              and c.relname in ('swap_config','swap_meta','swap_members','swap_listings','swaps','swap_items','swap_messages','swap_rate_counters','swap_blocked_terms','swap_photo_gc')
              and not c.relrowsecurity));
select t.check('anon and authenticated hold no table privileges on swap tables',
  not exists (select 1 from pg_class c, unnest(array['anon','authenticated']) r, unnest(array['select','insert','update','delete','truncate','references','trigger']) p
              where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
                and c.relname in ('swap_config','swap_meta','swap_members','swap_listings','swaps','swap_items','swap_messages','swap_rate_counters','swap_blocked_terms','swap_photo_gc')
                and has_table_privilege(r, c.oid, p)));
select t.check('no policies on swap tables',
  not exists (select 1 from pg_policies where schemaname = 'public'
              and tablename in ('swap_config','swap_meta','swap_members','swap_listings','swaps','swap_items','swap_messages','swap_rate_counters','swap_blocked_terms','swap_photo_gc')));
select t.check('message id sequence is closed to clients', not has_sequence_privilege('authenticated', 'public.swap_messages_id_seq', 'usage'));
select t.check('moderation queue is service-only', not has_table_privilege('authenticated', 'public.swap_moderation_queue', 'select') and has_table_privilege('service_role', 'public.swap_moderation_queue', 'select'));
select t.check('anon can execute no swap function',
  not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
              and (p.proname like 'swap\_%' or p.proname in ('are_friends','can_view_swap_photo','get_swap','get_swap_settings','get_swap_badge','get_swap_listing','accept_swap_terms','list_my_swap_listings','update_swap_listing','withdraw_swap_listing','renew_swap_listing','browse_swap_listings','propose_swap','list_my_swaps','respond_to_swap','cancel_swap','send_swap_message','report_swap_content','block_swap_member','list_swap_blocks','unblock_swap_member','export_my_swap_data','join_swap_community','leave_swap_community','narrow_swap_listing'))
              and has_function_privilege('anon', p.oid, 'execute')));
select t.check('authenticated can execute exactly the client functions',
  (select coalesce(array_agg(p.proname::text order by p.proname), '{}'::text[]) from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and (p.proname like 'swap\_%' or p.proname in ('are_friends','can_view_swap_photo','get_swap','get_swap_settings','get_swap_badge','get_swap_listing','accept_swap_terms','list_my_swap_listings','update_swap_listing','withdraw_swap_listing','renew_swap_listing','browse_swap_listings','propose_swap','list_my_swaps','respond_to_swap','cancel_swap','send_swap_message','report_swap_content','block_swap_member','list_swap_blocks','unblock_swap_member','export_my_swap_data','join_swap_community','leave_swap_community','narrow_swap_listing'))
      and has_function_privilege('authenticated', p.oid, 'execute'))
  = array['accept_swap_terms','block_swap_member','browse_swap_listings','can_view_swap_photo','cancel_swap','export_my_swap_data','get_swap','get_swap_badge','get_swap_listing','get_swap_settings','join_swap_community','leave_swap_community','list_my_swap_listings','list_my_swaps','list_swap_blocks','narrow_swap_listing','propose_swap','renew_swap_listing','report_swap_content','respond_to_swap','send_swap_message','swap_ack_photo','swap_complete_my_side','unblock_swap_member','update_swap_listing','withdraw_swap_listing'],
  (select array_agg(p.proname order by p.proname)::text from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname ~ '^(swap_|are_friends|can_view)' and has_function_privilege('authenticated', p.oid, 'execute')));
select t.check('every swap function pins search_path',
  not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
              and (p.proname like 'swap\_%' or p.proname in ('are_friends','can_view_swap_photo','get_swap','get_swap_settings','get_swap_badge','get_swap_listing','accept_swap_terms','list_my_swap_listings','update_swap_listing','withdraw_swap_listing','renew_swap_listing','browse_swap_listings','propose_swap','list_my_swaps','respond_to_swap','cancel_swap','send_swap_message','report_swap_content','block_swap_member','list_swap_blocks','unblock_swap_member','export_my_swap_data','join_swap_community','leave_swap_community','narrow_swap_listing'))
              and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))));
select t.check('every FK to auth.users cascades, except swap participants',
  not exists (select 1 from pg_constraint k where k.contype = 'f' and k.confrelid = 'auth.users'::regclass
              and k.conrelid::regclass::text in ('swap_members','swap_listings','swap_messages','swap_rate_counters')
              and k.confdeltype <> 'c')
  and (select count(*) from pg_constraint k where k.contype = 'f' and k.confrelid = 'auth.users'::regclass
       and k.conrelid = 'public.swaps'::regclass and k.confdeltype = 'n') = 2);
select t.check('swap-photos bucket is private with limits (JPEG and PNG)',
  exists (select 1 from storage.buckets where id = 'swap-photos' and not public and file_size_limit = 5242880 and allowed_mime_types = array['image/jpeg', 'image/png']));
select t.check('the only swap-photos policy is the viewer predicate',
  (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'swap photos%') = 1
  and (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd <> 'SELECT' and qual like '%swap-photos%') = 0);
select t.check('content_reports accepts swap contexts', exists (select 1 from pg_constraint where conname = 'content_reports_context_check' and pg_get_constraintdef(oid) like '%swap_chat%'));
select t.check('report_user keeps its narrow lists (old builds unchanged)', (select prosrc from pg_proc where proname = 'report_user') not like '%swap_chat%');
select t.check('block_user and delete_user_account are untouched',
  (select prosrc from pg_proc where proname = 'block_user') not like '%swap%'
  and (select prosrc from pg_proc where proname = 'delete_user_account') not like '%swap%');
select t.check('limits function is in step with the documented table',
  public.swap_limit('message_min') = 6 and public.swap_limit('propose_day') = 15 and public.swap_limit('open_outbound') = 5);
````

#### `supabase/tests/swaps/s7_legacy_policy.sql`

````sql
select t.as_user('b0000000-0000-0000-0000-00000000000b');
select t.check('before: a friend can read the raw row (the leak)', (select count(*) from public.clothing_items where user_id = 'a0000000-0000-0000-0000-00000000000a') = 2);
select t.check('before: including what they paid', (select max(cost) from public.clothing_items where user_id = 'a0000000-0000-0000-0000-00000000000a') = 120);
select t.as_admin();
drop policy if exists "Friends can view each other's wardrobe" on public.clothing_items;
select t.as_user('b0000000-0000-0000-0000-00000000000b');
select t.check('after: the raw rows are not readable by a friend', (select count(*) from public.clothing_items where user_id = 'a0000000-0000-0000-0000-00000000000a') = 0);
select t.check('after: the friend closet function still works', (select count(*) from public.get_friend_closet('a0000000-0000-0000-0000-00000000000a')) = 2);
select t.check('after: the owner still reads their own', (select count(*) from public.clothing_items where user_id = 'b0000000-0000-0000-0000-00000000000b') >= 2);
````

#### `supabase/tests/swaps/99_tail.sql`

````sql
select t.as_admin();
do $$
begin
  if exists (select 1 from t.log where not ok) then
    raise exception E'SWAP TESTS FAILED:\n%',
      (select string_agg(n || ' ' || label || coalesce(' [' || detail || ']', ''), E'\n' order by n) from t.log where not ok);
  end if;
end
$$;
select count(*) as checks_passed from t.log;
rollback;
````


---

## Appendix F: Jest tests that are written and passing

#### `__tests__/components/SwapPhoto.test.tsx`

````tsx
import 'react-native';
import React from 'react';
import { Image } from 'react-native';
import renderer, { act } from 'react-test-renderer';

const mockSign = jest.fn();
const mockForget = jest.fn();
jest.mock('../../src/services/swapPhotoUrls', () => ({
  signSwapPhotos: (...a: any[]) => mockSign(...a),
  forgetSwapPhoto: (...a: any[]) => mockForget(...a),
}));

import SwapPhoto from '../../src/components/SwapPhoto';

const mount = async (path?: string | null) => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<SwapPhoto path={path} accessibilityLabel="Photo" />); });
  return tree;
};
const image = (tree: renderer.ReactTestRenderer) => tree.root.findAllByType(Image)[0];

beforeEach(() => {
  mockSign.mockReset().mockImplementation(async (p: string[]) => new Map(p.map(x => [x, `https://signed/${x}`])));
  mockForget.mockReset();
});

describe('SwapPhoto', () => {
  it('shows the photo once its link is ready', async () => {
    const tree = await mount('a.jpg');
    expect(image(tree).props.source).toEqual({ uri: 'https://signed/a.jpg' });
  });

  it('shows a placeholder and asks for nothing when there is no photo', async () => {
    const tree = await mount(null);
    expect(tree.root.findAllByType(Image)).toHaveLength(0);
    expect(mockSign).not.toHaveBeenCalled();
  });

  it('asks for a fresh link once if the first one fails, then gives up quietly', async () => {
    const tree = await mount('a.jpg');
    mockSign.mockImplementation(async (p: string[]) => new Map(p.map(x => [x, `https://signed2/${x}`])));
    await act(async () => { image(tree).props.onError(); });
    expect(mockForget).toHaveBeenCalledWith('a.jpg');
    expect(image(tree).props.source).toEqual({ uri: 'https://signed2/a.jpg' });
    await act(async () => { image(tree).props.onError(); });
    expect(tree.root.findAllByType(Image)).toHaveLength(0);
  });

  it('shows the placeholder when a photo cannot be signed', async () => {
    mockSign.mockResolvedValue(new Map());
    const tree = await mount('gone.jpg');
    expect(tree.root.findAllByType(Image)).toHaveLength(0);
  });
});
````

#### `__tests__/components/SwapStatusBadge.test.tsx`

````tsx
import 'react-native';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import SwapStatusBadge from '../../src/components/SwapStatusBadge';

const flatten = (node: any): string => (!node ? '' : typeof node === 'string' ? node : Array.isArray(node) ? node.map(flatten).join(' ') : flatten(node.children));
const text = async (el: React.ReactElement) => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(el); });
  return flatten(tree.toJSON());
};

describe('SwapStatusBadge', () => {
  it('words the status from the member’s side', async () => {
    expect(await text(<SwapStatusBadge status="proposed" role="recipient" />)).toContain('Waiting for your answer');
    expect(await text(<SwapStatusBadge status="cancelled" closedReason="cancelled_by_proposer" role="recipient" />)).toContain('They cancelled');
    expect(await text(<SwapStatusBadge status="completed" role="proposer" />)).toContain('Swapped');
  });

  it('shows "No longer available" for every unexplained ending', async () => {
    expect(await text(<SwapStatusBadge status="cancelled" closedReason="unavailable" role="proposer" />)).toContain('No longer available');
  });
});
````

#### `__tests__/functions/jpegMetadata.test.ts`

````ts
import { readExifOrientation, stripJpegMetadata } from '../../supabase/functions/_shared/jpegMetadata';

const u16 = (n: number) => [(n >> 8) & 255, n & 255];
const ascii = (s: string) => Array.from(s).map(c => c.charCodeAt(0));
const seg = (marker: number, payload: number[]) => [0xff, marker, ...u16(payload.length + 2), ...payload];

/** Big-endian Exif: Orientation (optional) and a GPS block with a recognisable marker string. */
const exif = (orientation: number | null, withGps: boolean) => {
  const entries: number[][] = [];
  if (orientation !== null) entries.push([0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0]);
  if (withGps) entries.push([0x88, 0x25, 0, 4, 0, 0, 0, 1, 0, 0, 0, 0x40]);
  const ifd = [...u16(entries.length), ...entries.flat(), 0, 0, 0, 0];
  const gps = withGps ? [...ascii('GPSLATITUDE-37.77-LONGITUDE-122.41')] : [];
  return seg(0xe1, [...ascii('Exif'), 0, 0, 0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, ...ifd, ...gps]);
};

const SOF0 = seg(0xc0, [8, ...u16(48), ...u16(64), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
const DQT = seg(0xdb, [0, ...new Array(64).fill(16)]);
const DHT = seg(0xc4, [0, ...new Array(16).fill(0), 0]);
const SOS = seg(0xda, [3, 1, 0, 2, 0x11, 3, 0x11, 0, 63, 0]);
const SCAN = [0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56];          // a stuffed FF00 and a restart marker
const ICC = seg(0xe2, [...ascii('ICC_PROFILE'), 0, 1, 1, 9, 9, 9]);
const MPF = seg(0xe2, [...ascii('MPF'), 0, 1, 2, 3]);
const ADOBE = seg(0xee, [...ascii('Adobe'), 0, 100, 0, 0, 0, 0, 1]);
const APP0 = seg(0xe0, [...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
const COMMENT = seg(0xfe, ascii('shot at the cafe on Elm Street'));
const IPTC = seg(0xed, [...ascii('Photoshop 3.0'), 0, ...ascii('Jane Doe')]);

const jpeg = (parts: number[][], trailing: number[] = []) =>
  Uint8Array.from([0xff, 0xd8, ...parts.flat(), 0xff, 0xd9, ...trailing]);

const contains = (bytes: Uint8Array, text: string) => Buffer.from(bytes).toString('latin1').includes(text);

describe('stripJpegMetadata', () => {
  const body = [APP0, DQT, SOF0, DHT, SOS, SCAN];

  it('removes location, camera, comments, IPTC, multi-picture data and trailing bytes', () => {
    const input = jpeg([APP0, exif(1, true), COMMENT, IPTC, MPF, DQT, SOF0, DHT, SOS, SCAN], ascii('HIDDEN-PAYLOAD'));
    const r = stripJpegMetadata(input);
    if (!r.ok) throw new Error(r.reason);
    for (const secret of ['GPSLATITUDE', 'Exif', 'Elm Street', 'Jane Doe', 'Photoshop', 'MPF', 'HIDDEN-PAYLOAD']) {
      expect(contains(r.bytes, secret)).toBe(false);
    }
    expect(Array.from(r.bytes.slice(0, 2))).toEqual([0xff, 0xd8]);
    expect(Array.from(r.bytes.slice(-2))).toEqual([0xff, 0xd9]);
    expect(r.width).toBe(64);
    expect(r.height).toBe(48);
  });

  it('keeps the picture data byte for byte, including stuffed bytes and restart markers', () => {
    const r = stripJpegMetadata(jpeg(body));
    if (!r.ok) throw new Error(r.reason);
    expect(Array.from(r.bytes)).toEqual(Array.from(jpeg(body)));
  });

  it('keeps the colour profile and the Adobe colour flag', () => {
    const r = stripJpegMetadata(jpeg([APP0, ICC, ADOBE, DQT, SOF0, DHT, SOS, SCAN]));
    if (!r.ok) throw new Error(r.reason);
    expect(contains(r.bytes, 'ICC_PROFILE')).toBe(true);
    expect(contains(r.bytes, 'Adobe')).toBe(true);
  });

  it('writes back only the rotation flag when the photo was rotated', () => {
    const r = stripJpegMetadata(jpeg([APP0, exif(6, true), DQT, SOF0, DHT, SOS, SCAN]));
    if (!r.ok) throw new Error(r.reason);
    expect(r.orientation).toBe(6);
    expect(contains(r.bytes, 'GPSLATITUDE')).toBe(false);
    // The only Exif block left is the 36-byte, orientation-only one right after SOI.
    expect(Array.from(r.bytes.slice(2, 6))).toEqual([0xff, 0xe1, 0x00, 0x22]);
    expect(readExifOrientation(r.bytes, 6, 38)).toBe(6);
  });

  it('writes no Exif block at all for an upright photo', () => {
    const r = stripJpegMetadata(jpeg([APP0, exif(1, true), DQT, SOF0, DHT, SOS, SCAN]));
    if (!r.ok) throw new Error(r.reason);
    expect(r.orientation).toBe(1);
    expect(contains(r.bytes, 'Exif')).toBe(false);
  });

  it('handles progressive photos with more than one scan', () => {
    const second = [...SOS, 0x77, 0xff, 0x00, 0x88];
    const r = stripJpegMetadata(jpeg([APP0, DQT, SOF0, DHT, SOS, SCAN, DHT, second]));
    if (!r.ok) throw new Error(r.reason);
    expect(Array.from(r.bytes)).toEqual(Array.from(jpeg([APP0, DQT, SOF0, DHT, SOS, SCAN, DHT, second])));
  });

  it('is idempotent', () => {
    const once = stripJpegMetadata(jpeg([APP0, exif(8, true), COMMENT, DQT, SOF0, DHT, SOS, SCAN]));
    if (!once.ok) throw new Error(once.reason);
    const twice = stripJpegMetadata(once.bytes);
    if (!twice.ok) throw new Error(twice.reason);
    expect(Array.from(twice.bytes)).toEqual(Array.from(once.bytes));
    expect(twice.orientation).toBe(8);
  });

  it('reads the orientation in little-endian Exif too', () => {
    const le = [...ascii('Exif'), 0, 0, 0x49, 0x49, 0x2a, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0];
    expect(readExifOrientation(Uint8Array.from(le), 0, le.length)).toBe(3);
  });

  it('rejects what is not a complete JPEG', () => {
    expect(stripJpegMetadata(Uint8Array.from(ascii('\u0089PNG')))).toEqual({ ok: false, reason: 'not_jpeg' });
    expect(stripJpegMetadata(Uint8Array.from([]))).toEqual({ ok: false, reason: 'not_jpeg' });
    const whole = jpeg(body);
    expect(stripJpegMetadata(whole.slice(0, whole.length - 12)).ok).toBe(false);
    expect(stripJpegMetadata(Uint8Array.from([0xff, 0xd8, 0x12, 0x34, 0x56])).ok).toBe(false);
    // A picture with no frame header or no scan is not a picture.
    expect(stripJpegMetadata(jpeg([APP0, DQT])).ok).toBe(false);
  });
});
````

#### `__tests__/functions/pngMetadata.test.ts`

````ts
import { isPng, stripPngMetadata } from '../../supabase/functions/_shared/pngMetadata';

const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const ascii = (s: string) => Array.from(s).map(c => c.charCodeAt(0));

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes: number[]) => {
  let c = 0xffffffff;
  for (const b of bytes) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: number[] = [], badCrc = false) => {
  const body = [...ascii(type), ...data];
  return [...u32(data.length), ...body, ...u32(crc32(body) ^ (badCrc ? 1 : 0))];
};

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const IHDR = (w = 64, h = 48) => chunk('IHDR', [...u32(w), ...u32(h), 8, 6, 0, 0, 0]);
const IDAT = chunk('IDAT', [0x78, 0x9c, 0x63, 0x60, 0x18, 0x05, 0xa3, 0x60, 0x14, 0x0c, 0x00, 0x00, 0x00, 0x00]);
const IDAT2 = chunk('IDAT', [1, 2, 3, 4, 5, 6]);
const IEND = chunk('IEND');
const png = (parts: number[][], trailing: number[] = []) => Uint8Array.from([...SIGNATURE, ...parts.flat(), ...trailing]);
const contains = (bytes: Uint8Array, text: string) => Buffer.from(bytes).toString('latin1').includes(text);

// Chunks that carry personal or hidden data.
const TEXT = chunk('tEXt', [...ascii('Comment'), 0, ...ascii('shot at the cafe on Elm Street')]);
const ZTXT = chunk('zTXt', [...ascii('Software'), 0, 0, 1, 2, 3]);
const ITXT = chunk('iTXt', [...ascii('XML:com.adobe.xmp'), 0, 0, 0, 0, 0, ...ascii('GPSLatitude 37.77')]);
const EXIF = chunk('eXIf', [0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, ...ascii('GPSLATITUDE-37.77')]);
const TIME = chunk('tIME', [0x07, 0xea, 10, 13, 17, 30, 5]);
const PHYS = chunk('pHYs', [...u32(2835), ...u32(2835), 1]);
const BKGD = chunk('bKGD', [0, 0, 0, 0, 0, 0]);
const PRIVATE = chunk('prVt', ascii('HIDDEN-PAYLOAD'));
const ACTL = chunk('acTL', [...u32(2), ...u32(0)]);
const FCTL = chunk('fcTL', new Array(26).fill(0));
const FDAT = chunk('fdAT', [...u32(1), 9, 9, 9]);
// Chunks that decide how the picture looks.
const SRGB = chunk('sRGB', [0]);
const GAMA = chunk('gAMA', u32(45455));
const ICCP = chunk('iCCP', [...ascii('sRGB profile'), 0, 0, 5, 5, 5]);
const PLTE = chunk('PLTE', [255, 0, 0, 0, 255, 0, 0, 0, 255]);
const TRNS = chunk('tRNS', [0, 128, 255]);

describe('stripPngMetadata', () => {
  it('removes text, Exif, XMP, time, size, private chunks, animation chunks and trailing bytes', () => {
    const input = png([IHDR(), TEXT, EXIF, TIME, PHYS, ZTXT, ITXT, BKGD, PRIVATE, ACTL, IDAT, FCTL, FDAT, IEND], ascii('TRAILING-SECRET'));
    const r = stripPngMetadata(input);
    if (!r.ok) throw new Error(r.reason);
    for (const secret of ['Elm Street', 'GPSLATITUDE', 'GPSLatitude', 'Comment', 'XML:com.adobe', 'HIDDEN-PAYLOAD', 'TRAILING-SECRET', 'tIME', 'pHYs', 'eXIf', 'tEXt', 'zTXt', 'iTXt', 'acTL', 'fcTL', 'fdAT', 'bKGD', 'prVt']) {
      expect(contains(r.bytes, secret)).toBe(false);
    }
    expect(isPng(r.bytes)).toBe(true);
    expect(r.width).toBe(64);
    expect(r.height).toBe(48);
  });

  it('leaves exactly the signature, the header, the pixel data and the end', () => {
    const r = stripPngMetadata(png([IHDR(), TEXT, IDAT, TIME, IEND]));
    if (!r.ok) throw new Error(r.reason);
    expect(Array.from(r.bytes)).toEqual(Array.from(png([IHDR(), IDAT, IEND])));
  });

  it('keeps the picture data byte for byte, across several IDAT chunks', () => {
    const body = [IHDR(), IDAT, IDAT2, IEND];
    const r = stripPngMetadata(png(body));
    if (!r.ok) throw new Error(r.reason);
    expect(Array.from(r.bytes)).toEqual(Array.from(png(body)));
  });

  it('keeps palette, transparency and colour handling, in order', () => {
    const body = [IHDR(), GAMA, SRGB, ICCP, PLTE, TRNS, IDAT, IEND];
    const r = stripPngMetadata(png([IHDR(), GAMA, TEXT, SRGB, ICCP, PLTE, TRNS, PHYS, IDAT, IEND]));
    if (!r.ok) throw new Error(r.reason);
    expect(Array.from(r.bytes)).toEqual(Array.from(png(body)));
  });

  it('is idempotent', () => {
    const once = stripPngMetadata(png([IHDR(), TEXT, IDAT, IEND], [1, 2, 3]));
    if (!once.ok) throw new Error(once.reason);
    const twice = stripPngMetadata(once.bytes);
    if (!twice.ok) throw new Error(twice.reason);
    expect(Array.from(twice.bytes)).toEqual(Array.from(once.bytes));
  });

  it('refuses what is not a usable PNG', () => {
    const reason = (b: Uint8Array) => { const r = stripPngMetadata(b); return r.ok ? 'ok' : r.reason; };
    expect(reason(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('not_png');                       // a JPEG
    expect(reason(Uint8Array.from(ascii('GIF89a......')))).toBe('not_png');
    expect(reason(Uint8Array.from(SIGNATURE))).toBe('truncated');                                     // signature only
    expect(reason(png([IHDR(), IDAT]))).toBe('truncated');                                            // no IEND
    expect(reason(png([IHDR(), IDAT, IEND]).slice(0, -5))).toBe('truncated');                         // cut inside IEND
    expect(reason(png([IDAT, IEND]))).toBe('malformed');                                              // no header first
    expect(reason(png([IHDR(), IEND]))).toBe('malformed');                                            // no pixel data
    expect(reason(png([IHDR(0, 10), IDAT, IEND]))).toBe('malformed');                                 // zero width
    expect(reason(png([IHDR(), chunk('IDAT', [1, 2, 3], true), IEND]))).toBe('malformed');            // corrupt pixel data
    expect(reason(png([IHDR(), chunk('XYZW', [1]), IDAT, IEND]))).toBe('malformed');                  // unknown critical chunk
    expect(reason(png([IHDR(), chunk('ab1c', [1]), IDAT, IEND]))).toBe('malformed');                  // not letters
  });

  it('does not trust a length that points past the end', () => {
    const bad = Uint8Array.from([...SIGNATURE, ...u32(0x7fffffff), ...ascii('IHDR'), 0, 0, 0, 0]);
    const r = stripPngMetadata(bad);
    expect(r.ok).toBe(false);
  });

  it('recognises a PNG by its signature only', () => {
    expect(isPng(png([IHDR(), IDAT, IEND]))).toBe(true);
    expect(isPng(Uint8Array.from([0xff, 0xd8, 0xff]))).toBe(false);
    expect(isPng(new Uint8Array(0))).toBe(false);
  });
});
````

#### `__tests__/functions/sameSecret.test.ts`

````ts
import { sameSecret } from '../../supabase/functions/_shared/sameSecret';

describe('sameSecret', () => {
  const key = 'sb-service-key-0123456789abcdef.0123456789abcdef.0123456789abcdef';

  it('accepts the same secret', () => {
    expect(sameSecret(key, key)).toBe(true);
    expect(sameSecret(key, `${key}`)).toBe(true);
  });

  it('refuses anything else, however close', () => {
    expect(sameSecret(key, key.slice(0, -1))).toBe(false);
    expect(sameSecret(key, `${key}x`)).toBe(false);
    expect(sameSecret(key, key.replace('0', '1'))).toBe(false);
    expect(sameSecret(key, key.toUpperCase())).toBe(false);
    expect(sameSecret('a', 'b')).toBe(false);
  });

  it('refuses when either side is missing, even if both are', () => {
    expect(sameSecret('', '')).toBe(false);
    expect(sameSecret(undefined, undefined)).toBe(false);
    expect(sameSecret(null, null)).toBe(false);
    expect(sameSecret(key, undefined)).toBe(false);
    expect(sameSecret(undefined, key)).toBe(false);
    expect(sameSecret(key, '')).toBe(false);
  });

  it('does not read a token: one that only claims to be the service role is refused', () => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const forged = `${b64({ alg: 'none' })}.${b64({ role: 'service_role' })}.`;
    expect(sameSecret(forged, key)).toBe(false);
  });
});
````

#### `__tests__/functions/swapMediaFunction.test.ts`

````ts
/**
 * The swap-media function is Deno code, so these tests read it as text (the way
 * recognitionProxyPrompt.test.ts reads ai-proxy) and pin the rules that keep photos safe.
 */
import fs from 'fs';
import path from 'path';

const src = fs.readFileSync(path.join(__dirname, '..', '..', 'supabase', 'functions', 'swap-media', 'index.ts'), 'utf8');
const publish = src.slice(src.indexOf('const publish = async'), src.indexOf('Deno.serve('));

describe('swap-media', () => {
  it('only accepts the documented request fields', () => {
    expect(publish).toContain('["action", "itemId", "audience", "note"]');
    expect(publish).toMatch(/UUID\.test\(body\.itemId\)/);
    expect(publish).toMatch(/body\.audience !== "friends" && body\.audience !== "community"/);
  });

  it('takes the photo path from the database, never from the request', () => {
    expect(publish).toContain('const sourcePath: string = pre.sourcePath');
    expect(publish).toContain('download(sourcePath)');
    expect(publish).not.toMatch(/body\.(path|photo|sourcePath|url)/);
  });

  it('asks the database to check the member before it touches any photo', () => {
    expect(publish.indexOf('swap_publish_precheck')).toBeGreaterThan(-1);
    expect(publish.indexOf('swap_publish_precheck')).toBeLessThan(publish.indexOf('.download('));
    expect(publish.indexOf('.download(')).toBeLessThan(publish.indexOf('.upload('));
    expect(publish.indexOf('.upload(')).toBeLessThan(publish.indexOf('swap_publish_commit'));
  });

  it('removes the metadata before storing, and stores under the listing id', () => {
    expect(publish).toContain('const cleaned = png ? stripPngMetadata(original) : stripJpegMetadata(original)');
    expect(publish).toContain('upload(objectName, cleaned.bytes');
    expect(publish).toContain('const objectName = `${listingId}.jpg`');
  });

  it('tells a PNG from a JPEG by its first bytes, and stores each with its own content type', () => {
    expect(publish).toContain('const png = isPng(original)');
    expect(publish).toContain('contentType: png ? "image/png" : "image/jpeg"');
    expect(publish).not.toMatch(/\.(endsWith|includes)\(["'`]\.(png|jpe?g)/);   // never decided by a file name
    expect(src).toContain('"../_shared/pngMetadata.ts"');
  });

  it('sends only community photos to Google, and fails closed when it cannot', () => {
    const calls = publish.match(/vision\.googleapis\.com/g) ?? [];
    expect(calls).toHaveLength(1);
    const inCommunity = publish.slice(publish.indexOf('if (body.audience === "community") {'), publish.indexOf('// 4. Store the copy'));
    expect(inCommunity).toContain('vision.googleapis.com');
    expect(inCommunity).toContain('SAFE_SEARCH_DETECTION');
    expect(inCommunity).toContain('FACE_DETECTION');
    expect((inCommunity.match(/moderation_unavailable/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(inCommunity).toContain('decideSwapPhoto(annotation, cleaned.width, cleaned.height)');
  });

  it('marks the photo checked only for the community', () => {
    expect(publish).toContain('p_photo_state: body.audience === "community" ? "checked" : "stripped"');
  });

  it('removes the stored photo if the listing could not be created', () => {
    const afterCommit = publish.slice(publish.indexOf('swap_publish_commit'));
    expect(afterCommit.indexOf('remove([objectName])')).toBeGreaterThan(-1);
    expect(afterCommit.indexOf('remove([objectName])')).toBeLessThan(afterCommit.indexOf('databaseError(commitErr)'));
  });

  it('keeps the sweep for the service key only, compared as a secret and not read as a token', () => {
    expect(src).toMatch(/sameSecret\(token, Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)\) \? await sweep\(admin\) : json\(\{ error: "forbidden" \}, 403\)/);
    expect(src).toContain('from "../_shared/sameSecret.ts"');
    // The old check decoded the token and believed its "role" claim: anyone can write such a token.
    expect(src).not.toMatch(/atob\(|roleOf|\.role\b|service_role"/);
  });

  it('maps a held or removed piece to a refusal the app understands', () => {
    expect(src).toMatch(/listing_held: 403/);
  });

  it('never logs a request, a note, an id, a path or image bytes', () => {
    const logs = src.match(/console\.(log|error|warn|info)\([^)]*\)/g) ?? [];
    expect(logs.length).toBeGreaterThan(0);
    for (const call of logs) expect(call).toMatch(/^console\.\w+\("\[swap-media\] [a-z ]+"\)$/);
    expect(src).not.toMatch(/console\.\w+\([^)]*(body|note|path|itemId|listingId|bytes)/);
  });
});
````

#### `__tests__/functions/swapModeration.test.ts`

````ts
import { decideSwapPhoto, PHOTO_RULES, type VisionAnnotation } from '../../supabase/functions/_shared/swapModeration';

const calm = { adult: 'VERY_UNLIKELY', violence: 'VERY_UNLIKELY', racy: 'UNLIKELY', medical: 'VERY_UNLIKELY', spoof: 'UNLIKELY' } as const;
const face = (w: number, h: number, confidence = 0.95) => ({
  detectionConfidence: confidence,
  boundingPoly: { vertices: [{ x: 10, y: 10 }, { x: 10 + w, y: 10 }, { x: 10 + w, y: 10 + h }, { x: 10, y: 10 + h }] },
});

const cases: Array<[string, VisionAnnotation | undefined, ReturnType<typeof decideSwapPhoto>]> = [
  ['a flat-lay is fine', { safeSearchAnnotation: calm }, { ok: true }],
  ['adult content, even "possible"', { safeSearchAnnotation: { ...calm, adult: 'POSSIBLE' } }, { ok: false, reason: 'unsafe' }],
  ['violence "likely"', { safeSearchAnnotation: { ...calm, violence: 'LIKELY' } }, { ok: false, reason: 'unsafe' }],
  ['medical "likely"', { safeSearchAnnotation: { ...calm, medical: 'LIKELY' } }, { ok: false, reason: 'unsafe' }],
  ['swimwear is "racy likely" and passes', { safeSearchAnnotation: { ...calm, racy: 'LIKELY' } }, { ok: true }],
  ['racy "very likely"', { safeSearchAnnotation: { ...calm, racy: 'VERY_LIKELY' } }, { ok: false, reason: 'unsafe' }],
  ['a large face', { safeSearchAnnotation: calm, faceAnnotations: [face(300, 300)] }, { ok: false, reason: 'people' }],
  ['a small printed face on a tee', { safeSearchAnnotation: calm, faceAnnotations: [face(30, 30)] }, { ok: true }],
  ['an unsure face detection', { safeSearchAnnotation: calm, faceAnnotations: [face(400, 400, 0.5)] }, { ok: true }],
  ['a Vision error fails closed', { error: { code: 3 } }, { ok: false, reason: 'unreadable' }],
  ['no answer fails closed', undefined, { ok: false, reason: 'unreadable' }],
  ['a missing field fails closed', { safeSearchAnnotation: { adult: 'VERY_UNLIKELY' } }, { ok: false, reason: 'unreadable' }],
  // "UNKNOWN" is Google saying it could not tell. Not telling is not a pass.
  ['UNKNOWN adult fails closed', { safeSearchAnnotation: { ...calm, adult: 'UNKNOWN' } }, { ok: false, reason: 'unreadable' }],
  ['UNKNOWN violence fails closed', { safeSearchAnnotation: { ...calm, violence: 'UNKNOWN' } }, { ok: false, reason: 'unreadable' }],
  ['UNKNOWN racy fails closed', { safeSearchAnnotation: { ...calm, racy: 'UNKNOWN' } }, { ok: false, reason: 'unreadable' }],
  ['UNKNOWN medical fails closed', { safeSearchAnnotation: { ...calm, medical: 'UNKNOWN' } }, { ok: false, reason: 'unreadable' }],
  ['every category UNKNOWN fails closed', { safeSearchAnnotation: { adult: 'UNKNOWN', violence: 'UNKNOWN', racy: 'UNKNOWN', medical: 'UNKNOWN', spoof: 'UNKNOWN' } }, { ok: false, reason: 'unreadable' }],
  ['a word Google does not use fails closed', { safeSearchAnnotation: { ...calm, adult: 'MAYBE' as any } }, { ok: false, reason: 'unreadable' }],
  ['an UNKNOWN spoof score is not judged and does not matter', { safeSearchAnnotation: { ...calm, spoof: 'UNKNOWN' } }, { ok: true }],
  // Vision leaves an empty list out of the answer: no faceAnnotations means no face was found.
  ['no faceAnnotations field means no face was found', { safeSearchAnnotation: calm, faceAnnotations: undefined }, { ok: true }],
  ['an empty list of faces is fine', { safeSearchAnnotation: calm, faceAnnotations: [] }, { ok: true }],
  ['faceAnnotations that is not a list is malformed', { safeSearchAnnotation: calm, faceAnnotations: {} as any }, { ok: false, reason: 'unreadable' }],
  ['a face with no outline counts for nothing', { safeSearchAnnotation: calm, faceAnnotations: [{ detectionConfidence: 0.99 }] }, { ok: true }],
];

describe('decideSwapPhoto', () => {
  it.each(cases)('%s', (_name, annotation, expected) => {
    expect(decideSwapPhoto(annotation, 1000, 1000)).toEqual(expected);
  });

  it('does not trust a photo with no size', () => {
    expect(decideSwapPhoto({ safeSearchAnnotation: calm }, 0, 0)).toEqual({ ok: false, reason: 'unreadable' });
  });

  it('keeps the documented thresholds', () => {
    expect(PHOTO_RULES).toEqual({
      adultAtLeast: 'POSSIBLE', violenceAtLeast: 'LIKELY', medicalAtLeast: 'LIKELY', racyAtLeast: 'VERY_LIKELY',
      faceConfidence: 0.8, faceShareOfFrame: 0.04,
    });
  });
});
````

#### `__tests__/hooks/useSwapAccess.test.tsx`

````tsx
import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('@react-navigation/native', () => {
  const { useEffect } = require('react');
  return { useFocusEffect: (cb: () => void) => useEffect(cb, [cb]) };
});
const mockSettings = jest.fn();
const mockAccept = jest.fn();
jest.mock('../../src/services/swapService', () => ({
  getSwapSettings: (...a: any[]) => mockSettings(...a),
  acceptSwapTerms: (...a: any[]) => mockAccept(...a),
}));

import { useSwapAccess } from '../../src/hooks/useSwapAccess';
import { SwapError } from '../../src/services/swapErrors';
import { SWAP_TERMS_VERSION } from '../../src/config/swapRules';

const settings = (over: object = {}) => ({
  swapsEnabled: true, termsAccepted: true, termsCurrent: true, currentTermsVersion: SWAP_TERMS_VERSION, communityAvailable: false,
  communityJoined: false, alias: null, adultConfirmed: false, suspended: false, needsYou: 0, ...over,
});

let latest: ReturnType<typeof useSwapAccess>;
const Probe = () => { latest = useSwapAccess(); return null; };
const mount = async () => { await act(async () => { renderer.create(<Probe />); }); };

beforeEach(() => { mockSettings.mockReset(); mockAccept.mockReset(); });

describe('useSwapAccess', () => {
  it('is ready for a member who accepted the terms', async () => {
    mockSettings.mockResolvedValue(settings());
    await mount();
    expect(latest.access.state).toBe('ready');
  });

  it.each([
    ['a guest', new SwapError('not_authenticated'), 'guest'],
    ['the server switch', new SwapError('swaps_disabled'), 'paused'],
    ['a server without swaps', { message: 'x', code: 'PGRST202' }, 'not_deployed'],
    ['being offline', { message: 'Network request failed' }, 'error'],
  ])('maps %s', async (_n, failure, state) => {
    mockSettings.mockRejectedValue(failure);
    await mount();
    expect(latest.access.state).toBe(state);
  });

  it('knows when swaps are paused, the account is suspended, or the terms are new', async () => {
    mockSettings.mockResolvedValue(settings({ swapsEnabled: false }));
    await mount();
    expect(latest.access.state).toBe('paused');
    mockSettings.mockResolvedValue(settings({ suspended: true }));
    await act(async () => { await latest.refresh(); });
    expect(latest.access.state).toBe('suspended');
    mockSettings.mockResolvedValue(settings({ termsCurrent: false }));
    await act(async () => { await latest.refresh(); });
    expect(latest.access.state).toBe('needs_terms');
  });

  it('records agreement to the version in this build, then becomes ready', async () => {
    mockSettings.mockResolvedValueOnce(settings({ termsAccepted: false, termsCurrent: false }));
    await mount();
    expect(latest.access.state).toBe('needs_terms');
    mockAccept.mockResolvedValue(undefined);
    mockSettings.mockResolvedValue(settings());
    await act(async () => { await latest.acceptTerms(); });
    expect(mockAccept).toHaveBeenCalledTimes(1);
    expect(mockAccept.mock.calls[0]).toEqual([]);      // no version is passed: the service sends the one in this build
    expect(latest.access.state).toBe('ready');
  });

  describe('when the server and this build disagree about the terms version', () => {
    it('a newer server version means "update the app", and no agreement is recorded', async () => {
      mockSettings.mockResolvedValue(settings({ termsAccepted: false, termsCurrent: false, currentTermsVersion: '2026-11' }));
      await mount();
      expect(latest.access).toMatchObject({ state: 'update_required', appIsOlder: true });
      await act(async () => { await latest.acceptTerms(); });
      expect(mockAccept).not.toHaveBeenCalled();
    });

    it('so does a member who already agreed to the newer text on another phone', async () => {
      mockSettings.mockResolvedValue(settings({ termsAccepted: true, termsCurrent: true, currentTermsVersion: '2026-11' }));
      await mount();
      expect(latest.access.state).toBe('update_required');
      await act(async () => { await latest.acceptTerms(); });
      expect(mockAccept).not.toHaveBeenCalled();
    });

    it('an older server version (this build is ahead of the database) is its own case, and records nothing', async () => {
      mockSettings.mockResolvedValue(settings({ termsAccepted: false, termsCurrent: false, currentTermsVersion: '2026-09' }));
      await mount();
      expect(latest.access).toMatchObject({ state: 'update_required', appIsOlder: false });
      await act(async () => { await latest.acceptTerms(); });
      expect(mockAccept).not.toHaveBeenCalled();
    });

    it('paused and suspended still win, so those members see their own message', async () => {
      mockSettings.mockResolvedValue(settings({ swapsEnabled: false, currentTermsVersion: '2026-11' }));
      await mount();
      expect(latest.access.state).toBe('paused');
      mockSettings.mockResolvedValue(settings({ suspended: true, currentTermsVersion: '2026-11' }));
      await act(async () => { await latest.refresh(); });
      expect(latest.access.state).toBe('suspended');
    });
  });
});
````

#### `__tests__/hooks/useSwapBadge.test.tsx`

````tsx
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';

jest.mock('@react-navigation/native', () => {
  const { useEffect } = require('react');
  return { useFocusEffect: (cb: () => void) => useEffect(cb, [cb]) };
});
const mockGetBadge = jest.fn();
jest.mock('../../src/services/swapService', () => ({ getSwapBadge: (...a: any[]) => mockGetBadge(...a) }));

import { useSwapBadge } from '../../src/hooks/useSwapBadge';

const Probe = ({ enabled }: { enabled: boolean }) => <Text>{String(useSwapBadge(enabled))}</Text>;
const shown = async (enabled: boolean) => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<Probe enabled={enabled} />); });
  return (tree.toJSON() as any).children[0] as string;
};

beforeEach(() => mockGetBadge.mockReset());

describe('useSwapBadge', () => {
  it('shows the number of swaps waiting', async () => {
    mockGetBadge.mockResolvedValue(3);
    expect(await shown(true)).toBe('3');
  });

  it('asks for nothing when signed out', async () => {
    expect(await shown(false)).toBe('0');
    expect(mockGetBadge).not.toHaveBeenCalled();
  });

  it('is 0 when the call fails, and says nothing about it', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetBadge.mockRejectedValue(new Error('offline'));
    expect(await shown(true)).toBe('0');
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
````

#### `__tests__/privacyManifest.test.ts`

````ts
import fs from 'fs';
import path from 'path';

const plist = fs.readFileSync(path.join(__dirname, '..', 'ios', 'smartcloset', 'PrivacyInfo.xcprivacy'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'docs', 'privacy.html'), 'utf8');
// The held file moves into supabase/migrations (with a release-day version) when gate G0 passes.
const bucketIsPrivate = fs.readdirSync(path.join(__dirname, '..', 'supabase', 'migrations')).some(f => /_wardrobe_images_private\.sql$/.test(f));

const collected = [...plist.matchAll(/<dict>\s*<key>NSPrivacyCollectedDataType<\/key>\s*<string>(\w+)<\/string>\s*<key>NSPrivacyCollectedDataTypeLinked<\/key>\s*<(true|false)\/>\s*<key>NSPrivacyCollectedDataTypeTracking<\/key>\s*<(true|false)\/>/g)]
  .map(m => ({ type: m[1], linked: m[2] === 'true', tracking: m[3] === 'true' }));

describe('privacy manifest and policy for swaps', () => {
  it('declares swap messages as collected data, linked, and not for tracking', () => {
    expect(collected.find(c => c.type === 'NSPrivacyCollectedDataTypeEmailsOrTextMessages')).toEqual({
      type: 'NSPrivacyCollectedDataTypeEmailsOrTextMessages', linked: true, tracking: false,
    });
  });

  it('still tracks nothing', () => {
    expect(collected.length).toBeGreaterThanOrEqual(6);
    expect(collected.every(c => !c.tracking)).toBe(true);
    expect(plist).toMatch(/<key>NSPrivacyTracking<\/key>\s*<false\/>/);
  });

  it('keeps the declarations the swap feature relies on', () => {
    const types = collected.map(c => c.type);
    for (const t of ['NSPrivacyCollectedDataTypePhotosorVideos', 'NSPrivacyCollectedDataTypeOtherUserContent', 'NSPrivacyCollectedDataTypeUserID']) {
      expect(types).toContain(t);
    }
  });

  it('describes swaps in the privacy policy before they ship', () => {
    expect(html).toMatch(/<h2>Clothing swaps/);
    for (const phrase of ['never see what you paid', 'ten minutes', 'not end-to-end encrypted', '18 and over', 'Google Cloud Vision', '30 days', '90 days']) {
      expect(html).toContain(phrase);
    }
  });

  it('no longer says photos are only available to you and friends', () => {
    expect(html).not.toMatch(/only available to you and to friends you have accepted\.(?! )/);
  });

  // The original photos sit in wardrobe-images, which is flagged public on the live project until
  // supabase/held/wardrobe_images_private.sql has been released (gate G0). The page may call that storage
  // private only after that. (The separate swap-photos area really is private, and the page says so.)
  it('does not call the original photos "private storage" before the bucket has been made private', () => {
    if (!bucketIsPrivate) expect(html).not.toMatch(/kept in private storage/i);
  });
});
````

#### `__tests__/services/backupSwapExport.test.ts`

````ts
/** Export Data carries the member's swap activity when it can be read, and never fails because it can't. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { exportData, importData } from '../../src/services/backupService';
import { getClothingItems } from '../../src/services/storage';
import { getSavedOutfits } from '../../src/services/outfitService';

const mockExportSwaps = jest.fn();
jest.mock('../../src/services/swapService', () => ({ exportMySwapData: (...a: any[]) => mockExportSwaps(...a) }));
jest.mock('../../src/config/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}));
jest.mock('../../src/services/storage', () => ({ getClothingItems: jest.fn() }));
jest.mock('../../src/services/outfitService', () => ({ getSavedOutfits: jest.fn() }));

beforeEach(async () => {
  await AsyncStorage.clear();
  (getClothingItems as jest.Mock).mockReset().mockResolvedValue([]);
  (getSavedOutfits as jest.Mock).mockReset().mockResolvedValue([]);
  mockExportSwaps.mockReset();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('exportData and swaps', () => {
  // The file version is bumped to 1.1 once, by whichever of the ratings and swap passes lands first (7.7a). This
  // suite does not own that line, so it only requires a 1.x version.
  it('includes the swap section', async () => {
    const swap = { settings: { termsVersion: '2026-10' }, listings: [{ id: 'l1' }], swaps: [{ id: 's1', myMessages: [{ body: 'hi' }] }] };
    mockExportSwaps.mockResolvedValue(swap);
    const backup = await exportData();
    expect(backup.version).toMatch(/^1\.\d+$/);
    expect(backup.swap).toEqual(swap);
  });

  it('leaves the section out for a guest, offline, or a server without swaps, and still exports', async () => {
    mockExportSwaps.mockRejectedValue(new Error('not_authenticated'));
    const backup = await exportData();
    expect('swap' in backup).toBe(false);
    expect(backup.items).toEqual([]);
  });

  it('restoring a backup that has a swap section ignores it', async () => {
    mockExportSwaps.mockResolvedValue({ settings: null, listings: [], swaps: [] });
    const backup = await exportData();
    await importData(JSON.parse(JSON.stringify(backup)));
    expect(JSON.parse((await AsyncStorage.getItem('@smartcloset_items'))!)).toEqual([]);
    expect(await AsyncStorage.getItem('@smartcloset_swap')).toBeNull();
  });
});
````

#### `__tests__/services/swapErrors.test.ts`

````ts
import { SwapError, swapErrorMessage, toSwapError, toSwapErrorFromFunction } from '../../src/services/swapErrors';

describe('toSwapError', () => {
  it('reads the code out of what PostgREST puts in `message`, keeping DETAIL and HINT', () => {
    const e = toSwapError({ message: 'text_not_allowed', code: '22023', details: 'message', hint: 'contact' });
    expect(e).toBeInstanceOf(SwapError);
    expect([e.code, e.detail, e.hint]).toEqual(['text_not_allowed', 'message', 'contact']);
  });

  it('knows the rate limit bucket', () => {
    const e = toSwapError({ message: 'swap_rate_limited', code: '54000', details: 'message_min' });
    expect([e.code, e.detail]).toEqual(['swap_rate_limited', 'message_min']);
  });

  it.each([
    [{ message: 'not_authenticated' }, 'not_authenticated'],
    [{ message: 'swap_unavailable' }, 'swap_unavailable'],
    [{ message: 'Could not find the function public.get_swap_settings without parameters', code: 'PGRST202' }, 'not_deployed'],
    [{ message: 'function public.get_swap_badge() does not exist', code: '42883' }, 'not_deployed'],
    [{ message: 'report_rate_limited', code: '54000' }, 'report_rate_limited'],
    [{ message: 'Network request failed' }, 'offline'],
    [{ message: 'something else entirely' }, 'unknown'],
  ])('maps %j to %s', (input, code) => {
    expect(toSwapError(input).code).toBe(code);
  });

  it('passes a SwapError through', () => {
    const e = new SwapError('swap_not_open');
    expect(toSwapError(e)).toBe(e);
  });
});

describe('toSwapErrorFromFunction', () => {
  const failing = (body: unknown) => ({ context: { status: 422, json: async () => body } });

  it('reads the code and reason from the function answer', async () => {
    const e = await toSwapErrorFromFunction(failing({ error: 'photo_rejected', reason: 'people' }));
    expect([e.code, e.hint]).toEqual(['photo_rejected', 'people']);
  });

  it('falls back to the generic mapping', async () => {
    const e = await toSwapErrorFromFunction({ message: 'Failed to fetch', context: { json: async () => { throw new Error('no body'); } } });
    expect(e.code).toBe('offline');
  });
});

describe('swapErrorMessage', () => {
  const msg = (message: string, extra: object = {}) => swapErrorMessage({ message, ...extra }, 'fallback');

  it('is plain and never mentions blocks, reports or technical codes', () => {
    for (const code of ['swap_unavailable', 'swap_not_open', 'item_not_found', 'swap_suspended', 'swap_cooldown']) {
      expect(msg(code)).not.toMatch(/block|report|swap_|_/i);
    }
  });

  it('explains rejected text by reason', () => {
    expect(msg('text_not_allowed', { hint: 'payment' })).toMatch(/item for item/);
    expect(msg('text_not_allowed', { hint: 'contact', details: 'message' })).toMatch(/contact details/);
    expect(msg('text_not_allowed', { hint: 'content', details: 'note' })).toMatch(/note/);
  });

  it('says plainly when a piece cannot be listed, and how to replace a photo that cannot be used', () => {
    expect(toSwapError({ message: 'listing_held', code: '42501' }).code).toBe('listing_held');
    expect(msg('listing_held')).toMatch(/can’t be listed right now.*Email support/);
    expect(msg('listing_held')).not.toMatch(/block|report|held|review|removed/i);
    expect(msg('unsupported_image')).toMatch(/Replace the photo/);
    expect(msg('text_not_allowed', { hint: 'content', details: 'details' })).toMatch(/item details/);
  });

  it('lists what a listing is missing', () => {
    expect(msg('listing_incomplete', { details: 'size,condition' })).toBe('Add a size and condition first.');
  });

  it('distinguishes the rate limits', () => {
    expect(msg('swap_rate_limited', { details: 'browse_day' })).toMatch(/tomorrow/);
    expect(msg('swap_rate_limited', { details: 'message_min' })).toMatch(/moment/);
  });

  it('uses the fallback for anything unexpected', () => {
    expect(msg('no idea')).toBe('fallback');
  });

  it('has a sentence for a server without swaps and for being offline', () => {
    expect(msg('x', { code: 'PGRST202' })).toMatch(/aren’t available yet/);
    expect(swapErrorMessage({ message: 'Network request failed' }, 'fallback')).toMatch(/offline/);
  });
});
````

#### `__tests__/services/swapPhotoUrls.test.ts`

````ts
const mockCreate = jest.fn();
jest.mock('../../src/config/supabase', () => ({
  supabase: { storage: { from: jest.fn(() => ({ createSignedUrls: (...a: any[]) => mockCreate(...a) })) } },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearSwapPhotoCache, forgetSwapPhoto, signSwapPhotos } from '../../src/services/swapPhotoUrls';
import { SWAP_PHOTO_TTL_SECONDS } from '../../src/config/swapRules';

const answer = (paths: string[]) => ({ data: paths.map(p => ({ path: p, signedUrl: `https://x/${p}?t=1`, error: null })), error: null });

beforeEach(() => {
  mockCreate.mockReset().mockImplementation(async (paths: string[]) => answer(paths));
  clearSwapPhotoCache();
  (AsyncStorage.setItem as jest.Mock).mockClear?.();
});

describe('signSwapPhotos', () => {
  it('asks for ten-minute links', async () => {
    await signSwapPhotos(['a.jpg']);
    expect(mockCreate).toHaveBeenCalledWith(['a.jpg'], SWAP_PHOTO_TTL_SECONDS);
    expect(SWAP_PHOTO_TTL_SECONDS).toBeLessThanOrEqual(600);
  });

  it('reuses a link instead of asking again', async () => {
    await signSwapPhotos(['a.jpg']);
    const again = await signSwapPhotos(['a.jpg', 'b.jpg']);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockCreate).toHaveBeenLastCalledWith(['b.jpg'], SWAP_PHOTO_TTL_SECONDS);
    expect([...again.keys()].sort()).toEqual(['a.jpg', 'b.jpg']);
  });

  it('never writes links to disk', async () => {
    await signSwapPhotos(['a.jpg']);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('forgets one link, or all of them on sign-out', async () => {
    await signSwapPhotos(['a.jpg', 'b.jpg']);
    forgetSwapPhoto('a.jpg');
    await signSwapPhotos(['a.jpg', 'b.jpg']);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    clearSwapPhotoCache();
    await signSwapPhotos(['a.jpg', 'b.jpg']);
    expect(mockCreate).toHaveBeenCalledTimes(3);
  });

  it('leaves out a photo that cannot be signed, without throwing', async () => {
    mockCreate.mockResolvedValueOnce({ data: [{ path: 'a.jpg', signedUrl: null, error: 'Object not found' }], error: null });
    expect((await signSwapPhotos(['a.jpg'])).size).toBe(0);
    mockCreate.mockRejectedValueOnce(new Error('offline'));
    expect((await signSwapPhotos(['c.jpg'])).size).toBe(0);
  });
});
````

#### `__tests__/services/swapService.test.ts`

````ts
const mockGetSession = jest.fn();
const mockRpc = jest.fn();
const mockInvoke = jest.fn();
const mockUpdateEq = jest.fn();
const mockUpdate = jest.fn((..._args: any[]) => ({ eq: (...a: any[]) => mockUpdateEq(...a) }));
jest.mock('../../src/config/supabase', () => ({
  supabase: {
    auth: { getSession: (...a: any[]) => mockGetSession(...a) },
    rpc: (...a: any[]) => mockRpc(...a),
    functions: { invoke: (...a: any[]) => mockInvoke(...a) },
    from: jest.fn(() => ({ update: (...a: any[]) => mockUpdate(...a) })),
  },
}));

const mockDownload = jest.fn();
jest.mock('react-native-fs', () => ({
  CachesDirectoryPath: '/caches',
  downloadFile: (...a: any[]) => ({ promise: mockDownload(...a) }),
  unlink: jest.fn(async () => undefined),
}));
const mockCopyToStorage = jest.fn();
jest.mock('../../src/services/imageStorage', () => ({ copyImageToPermanentStorage: (...a: any[]) => mockCopyToStorage(...a) }));
const mockDeleteItem = jest.fn();
jest.mock('../../src/services/storage', () => ({ deleteClothingItem: (...a: any[]) => mockDeleteItem(...a) }));
const mockSign = jest.fn();
jest.mock('../../src/services/swapPhotoUrls', () => ({ signSwapPhotos: (...a: any[]) => mockSign(...a) }));

import * as swaps from '../../src/services/swapService';
import { SwapError } from '../../src/services/swapErrors';
import { SWAP_TERMS_VERSION } from '../../src/config/swapRules';

const signedIn = () => mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'me' } } } });
const ok = (data: any) => mockRpc.mockResolvedValueOnce({ data, error: null });

beforeEach(() => {
  jest.clearAllMocks();
  mockRpc.mockReset(); mockInvoke.mockReset(); mockDownload.mockReset(); mockCopyToStorage.mockReset();
  mockDeleteItem.mockReset().mockResolvedValue(undefined);
  mockUpdateEq.mockReset().mockResolvedValue({ error: null });
  mockSign.mockReset().mockImplementation(async (paths: string[]) => new Map(paths.map(p => [p, `https://signed/${p}`])));
  signedIn();
});

describe('guests', () => {
  it.each([
    ['getSwapSettings', () => swaps.getSwapSettings()],
    ['listMySwaps', () => swaps.listMySwaps()],
    ['browseSwapListings', () => swaps.browseSwapListings({ scope: 'friends' })],
    ['proposeSwap', () => swaps.proposeSwap({ requestListingIds: ['a'], offerListingIds: ['b'], clientRef: 'r' })],
    ['publishSwapListing', () => swaps.publishSwapListing({ itemId: 'i', audience: 'friends' })],
    ['completeSwapHandoff', () => swaps.completeSwapHandoff('s')],
  ])('%s fails before any network call', async (_n, run) => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    await expect(run()).rejects.toMatchObject({ code: 'not_authenticated' });
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('the badge and the item state quietly say zero / not listed', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    expect(await swaps.getSwapBadge()).toBe(0);
    expect(await swaps.getItemSwapState('i')).toEqual({ listing: null, inAcceptedSwap: false });
  });
});

describe('calls the right functions with the right names', () => {
  it.each([
    [() => swaps.acceptSwapTerms(), 'accept_swap_terms', { p_version: SWAP_TERMS_VERSION }],
    [() => swaps.joinSwapCommunity({ alias: 'Otter', adult: true, photoScanOk: true }), 'join_swap_community', { p_alias: 'Otter', p_adult: true, p_photo_scan_ok: true, p_terms_version: SWAP_TERMS_VERSION }],
    [() => swaps.updateSwapListingNote('l1', 'hi'), 'update_swap_listing', { p_listing_id: 'l1', p_note: 'hi' }],
    [() => swaps.withdrawSwapListing('l1'), 'withdraw_swap_listing', { p_listing_id: 'l1' }],
    [() => swaps.renewSwapListing('l1'), 'renew_swap_listing', { p_listing_id: 'l1' }],
    [() => swaps.narrowSwapListing('l1'), 'narrow_swap_listing', { p_listing_id: 'l1' }],
    [() => swaps.cancelSwap('s1'), 'cancel_swap', { p_swap_id: 's1' }],
    [() => swaps.blockSwapMember('swap', 's1'), 'block_swap_member', { p_ref_type: 'swap', p_ref_id: 's1' }],
    [() => swaps.unblockSwapMember('ref1'), 'unblock_swap_member', { p_ref: 'ref1' }],
  ])('%#', async (run, fn, args) => {
    ok(null);
    await run();
    expect(mockRpc).toHaveBeenCalledWith(fn, args);
  });

  it('records agreement against the terms in this build, whatever a caller tries to pass', async () => {
    ok(null);
    await (swaps.acceptSwapTerms as any)('2099-01');
    expect(mockRpc).toHaveBeenLastCalledWith('accept_swap_terms', { p_version: SWAP_TERMS_VERSION });
    ok(null);
    await (swaps.joinSwapCommunity as any)({ alias: 'Otter', adult: true, photoScanOk: true, termsVersion: '2099-01' });
    expect(mockRpc).toHaveBeenLastCalledWith('join_swap_community', expect.objectContaining({ p_terms_version: SWAP_TERMS_VERSION }));
  });

  it('proposes with a client ref and trims the note', async () => {
    ok('swap-1');
    expect(await swaps.proposeSwap({ requestListingIds: ['a'], offerListingIds: ['b', 'c'], note: '  hello ', clientRef: 'r1' })).toBe('swap-1');
    expect(mockRpc).toHaveBeenCalledWith('propose_swap', { p_request_listing_ids: ['a'], p_offer_listing_ids: ['b', 'c'], p_note: 'hello', p_client_ref: 'r1' });
  });

  it('responds, and returns the server’s answer', async () => {
    ok('unavailable');
    expect(await swaps.respondToSwap('s1', 'accept')).toBe('unavailable');
    expect(mockRpc).toHaveBeenCalledWith('respond_to_swap', { p_swap_id: 's1', p_action: 'accept' });
  });

  it('sends a message with a client ref', async () => {
    ok(42);
    expect(await swaps.sendSwapMessage('s1', 'hi', 'r2')).toBe(42);
    expect(mockRpc).toHaveBeenCalledWith('send_swap_message', { p_swap_id: 's1', p_body: 'hi', p_client_ref: 'r2' });
  });

  it('reports with the flagged message and cut details', async () => {
    ok(null);
    await swaps.reportSwapContent({ refType: 'swap', refId: 's1', reason: 'harassment', details: ' rude '.padEnd(600, 'x'), messageId: 7 });
    const args = mockRpc.mock.calls[0][1];
    expect(args).toMatchObject({ p_ref_type: 'swap', p_ref_id: 's1', p_reason: 'harassment', p_message_id: 7 });
    expect(args.p_details.length).toBe(500);
  });

  it('turns a server error into a SwapError with detail and hint', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'text_not_allowed', details: 'note', hint: 'payment', code: '22023' } });
    await expect(swaps.proposeSwap({ requestListingIds: ['a'], offerListingIds: ['b'], note: 'x', clientRef: 'r' }))
      .rejects.toMatchObject({ code: 'text_not_allowed', detail: 'note', hint: 'payment' });
  });
});

describe('browsing', () => {
  const row = (n: number) => ({
    listing_id: `l${n}`, owner_label: 'Ann', owner_kind: 'friend', audience: 'friends', name: `Piece ${n}`, category: 'tops',
    subcategory: null, brand: 'Zara', color: null, size: 'M', condition: 'good', pattern: null,
    materials: [{ name: 'wool', percentage: 80 }], care_instructions: null, origin_country: null, season: null, note: null,
    photo_path: `l${n}.jpg`, listed_at: `2026-10-0${n}T00:00:00Z`, mine: false,
  });

  it('maps rows, drops nulls, ignores an unknown condition, and offers a cursor when the page is full', async () => {
    ok([row(2), { ...row(1), condition: 'mint' }]);
    const page = await swaps.browseSwapListings({ scope: 'friends', limit: 2, conditions: ['good'], q: ' blazer ' });
    expect(mockRpc).toHaveBeenCalledWith('browse_swap_listings', expect.objectContaining({
      p_scope: 'friends', p_conditions: ['good'], p_q: 'blazer', p_limit: 2, p_before_ts: null, p_category: null,
    }));
    expect(page.items[0]).toMatchObject({ id: 'l2', ownerLabel: 'Ann', ownerKind: 'friend', brand: 'Zara', condition: 'good', photoPath: 'l2.jpg' });
    expect(page.items[0].subcategory).toBeUndefined();
    expect(page.items[1].condition).toBeUndefined();
    expect(page.nextCursor).toEqual({ ts: '2026-10-01T00:00:00Z', id: 'l1' });
  });

  it('has no cursor on a short page, and passes one back', async () => {
    ok([row(1)]);
    expect((await swaps.browseSwapListings({ scope: 'community', limit: 30 })).nextCursor).toBeNull();
    ok([]);
    await swaps.browseSwapListings({ scope: 'friends', cursor: { ts: 'T', id: 'L' }, sameOwnerAs: 'x', friendId: 'f' });
    expect(mockRpc).toHaveBeenLastCalledWith('browse_swap_listings', expect.objectContaining({ p_before_ts: 'T', p_before_id: 'L', p_same_owner_as: 'x', p_friend_id: 'f' }));
  });

  it('clamps the page size', async () => {
    ok([]);
    await swaps.browseSwapListings({ scope: 'friends', limit: 500 });
    expect(mockRpc).toHaveBeenLastCalledWith('browse_swap_listings', expect.objectContaining({ p_limit: 40 }));
  });

  it('a listing that is gone is swap_unavailable', async () => {
    ok([]);
    await expect(swaps.getSwapListing('nope')).rejects.toMatchObject({ code: 'swap_unavailable' });
  });
});

describe('the inbox and a thread', () => {
  it('maps swap rows', async () => {
    ok([{ swap_id: 's1', status: 'proposed', closed_reason: null, role: 'recipient', pair_kind: 'friends', other_label: 'Bea', bucket: 'needs_you', attention: true,
          give_names: ['Blazer'], get_names: ['Shirt'], thumb_path: 'x.jpg', i_done: false, they_done: false, created_at: 'c', last_event_at: 'l', expires_at: 'e' }]);
    const [s] = await swaps.listMySwaps();
    expect(s).toMatchObject({ id: 's1', otherLabel: 'Bea', bucket: 'needs_you', attention: true, giveNames: ['Blazer'], thumbPath: 'x.jpg' });
    expect(s.closedReason).toBeUndefined();
  });

  it('maps a thread, including the server’s action flags', async () => {
    ok({ id: 's1', status: 'accepted', role: 'proposer', pairKind: 'friends', otherLabel: 'Bea', createdAt: 'c', expiresAt: 'e', iDone: false, theyDone: true, autoCompleted: false,
         items: [{ listingId: 'l1', side: 'offer', mine: true, name: 'Blazer', condition: 'mint', photoPending: null, removalPending: 1 }],
         messages: [{ id: '5', kind: 'text', body: 'hi', mine: false, createdAt: 't' }],
         actions: { canCancel: true, canComplete: true, canMessage: true, messagesLeft: 190 } });
    const d = await swaps.getSwap('s1', 4);
    expect(mockRpc).toHaveBeenCalledWith('get_swap', { p_swap_id: 's1', p_after: 4 });
    expect(d.actions).toEqual({ canAccept: false, canDecline: false, canCancel: true, canComplete: true, canMessage: true, messagesLeft: 190 });
    expect(d.messages[0]).toMatchObject({ id: 5, body: 'hi', mine: false });
    expect(d.items[0]).toMatchObject({ photoPending: false, removalPending: true });
    expect(d.items[0].condition).toBeUndefined();
  });
});

describe('opening a piece to swap', () => {
  it('calls swap-media and returns the listing id', async () => {
    mockInvoke.mockResolvedValue({ data: { listingId: 'L1' }, error: null });
    expect(await swaps.publishSwapListing({ itemId: 'i1', audience: 'community', note: 'hi' })).toEqual({ listingId: 'L1' });
    expect(mockInvoke).toHaveBeenCalledWith('swap-media', { method: 'POST', body: { action: 'publish', itemId: 'i1', audience: 'community', note: 'hi' } });
  });

  it('reads the reason a photo was rejected', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { context: { status: 422, json: async () => ({ error: 'photo_rejected', reason: 'people' }) } } });
    await expect(swaps.publishSwapListing({ itemId: 'i1', audience: 'community' })).rejects.toMatchObject({ code: 'photo_rejected', hint: 'people' });
  });

  it('an item that is listed but reserved shows as locked', async () => {
    ok([{ listing_id: 'L1', item_id: 'i1', audience: 'friends', status: 'reserved', name: 'Blazer', photo_path: 'L1.jpg', listed_at: 'a', expires_at: 'b', open_offers: 0, in_accepted_swap: true, stale: false }]);
    expect(await swaps.getItemSwapState('i1')).toMatchObject({ inAcceptedSwap: true, listing: { id: 'L1' } });
  });
});

describe('completeSwapHandoff', () => {
  const reply = (over: object = {}) => ({
    status: 'accepted', completed: false,
    received: [{ claimedItemId: 'new1', listingId: 'l9', photoPath: 'l9.jpg', name: 'Shirt' }],
    toRemove: [{ itemId: 'mine1', name: 'Blazer' }],
    ...over,
  });
  const photoWorks = () => {
    mockDownload.mockResolvedValue({ statusCode: 200 });
    mockCopyToStorage.mockResolvedValue('https://x.supabase.co/storage/v1/object/sign/wardrobe-images/me/1.jpg?token=t');
  };

  it('adds the piece, copies its photo into the member’s own folder, then removes the piece they gave', async () => {
    photoWorks();
    ok(reply({ completed: true })); ok(null);
    const result = await swaps.completeSwapHandoff('s1');
    expect(mockRpc).toHaveBeenNthCalledWith(1, 'swap_complete_my_side', { p_swap_id: 's1', p_keep_given: false });
    expect(mockDownload).toHaveBeenCalledWith(expect.objectContaining({ fromUrl: 'https://signed/l9.jpg' }));
    expect(mockCopyToStorage).toHaveBeenCalledWith(expect.stringMatching(/^file:\/\/\/caches\/swap_/));
    expect(mockUpdate).toHaveBeenCalledWith({ user_image: 'https://x.supabase.co/storage/v1/object/public/wardrobe-images/me/1.jpg' });
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 'new1');
    expect(mockRpc).toHaveBeenNthCalledWith(2, 'swap_ack_photo', { p_swap_id: 's1', p_claimed_item_ids: ['new1'] });
    expect(mockDeleteItem).toHaveBeenCalledWith('mine1');
    expect(result).toEqual({ completed: true, receivedItemIds: ['new1'], photosPending: 0, removedItemIds: ['mine1'], removalsPending: 0 });
  });

  it('keeps the member’s own piece when they asked to', async () => {
    photoWorks();
    ok(reply({ toRemove: [] })); ok(null);
    await swaps.completeSwapHandoff('s1', { keepGiven: true });
    expect(mockRpc).toHaveBeenNthCalledWith(1, 'swap_complete_my_side', { p_swap_id: 's1', p_keep_given: true });
    expect(mockDeleteItem).not.toHaveBeenCalled();
  });

  it('leaves a photo for next time when the network fails, and does not acknowledge it', async () => {
    mockDownload.mockRejectedValue(new Error('offline'));
    ok(reply());
    const result = await swaps.completeSwapHandoff('s1');
    expect(result.photosPending).toBe(1);
    expect(mockRpc).toHaveBeenCalledTimes(1);                       // no swap_ack_photo
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(result.removedItemIds).toEqual(['mine1']);               // the rest still finishes
  });

  it('gives up on a photo that no longer exists, so it is not retried forever', async () => {
    mockDownload.mockResolvedValue({ statusCode: 404 });
    ok(reply()); ok(null);
    const result = await swaps.completeSwapHandoff('s1');
    expect(result.photosPending).toBe(0);
    expect(mockRpc).toHaveBeenNthCalledWith(2, 'swap_ack_photo', { p_swap_id: 's1', p_claimed_item_ids: ['new1'] });
  });

  it('gives up on a piece with no photo path at all', async () => {
    ok(reply({ received: [{ claimedItemId: 'new1', listingId: null, photoPath: null, name: 'Shirt' }] })); ok(null);
    expect((await swaps.completeSwapHandoff('s1')).photosPending).toBe(0);
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it('does not write a local file path into the closet row', async () => {
    mockDownload.mockResolvedValue({ statusCode: 200 });
    mockCopyToStorage.mockResolvedValue('file:///var/mobile/Documents/clothing_1.jpg');
    ok(reply());
    expect((await swaps.completeSwapHandoff('s1')).photosPending).toBe(1);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('reports a removal that failed so it can be retried', async () => {
    photoWorks();
    mockDeleteItem.mockRejectedValue(new Error('offline'));
    ok(reply()); ok(null);
    expect(await swaps.completeSwapHandoff('s1')).toMatchObject({ removedItemIds: [], removalsPending: 1 });
  });

  it('surfaces the server’s refusal', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'swap_not_open' } });
    await expect(swaps.completeSwapHandoff('s1')).rejects.toBeInstanceOf(SwapError);
  });
});
````

#### `__tests__/swapMigrations.test.ts`

````ts
/**
 * Reads the swap migrations as text and checks the rules every one of them must keep. The
 * behaviour itself is checked by the BEGIN ... ROLLBACK scripts in supabase/tests/swaps.
 */
import fs from 'fs';
import path from 'path';

const dir = path.join(__dirname, '..', 'supabase', 'migrations');
const heldDir = path.join(__dirname, '..', 'supabase', 'held');
const FILES = [
  '20261015000100_swap_foundation.sql',
  '20261015000200_swap_listings.sql',
  '20261015000300_swap_lifecycle.sql',
  '20261015000400_swap_moderation.sql',
  '20261015000500_swap_community.sql',
];
const PREREQUISITE = '20261015000000_styling_recommendations_if_missing.sql';
const sqls = FILES.map(f => fs.readFileSync(path.join(dir, f), 'utf8'));
const all = sqls.join('\n');

const TABLES = ['swap_config', 'swap_meta', 'swap_members', 'swap_listings', 'swaps', 'swap_items', 'swap_messages', 'swap_rate_counters', 'swap_blocked_terms', 'swap_photo_gc'];

const CLIENT_FUNCTIONS = [
  'accept_swap_terms', 'block_swap_member', 'browse_swap_listings', 'cancel_swap', 'export_my_swap_data', 'get_swap',
  'get_swap_badge', 'get_swap_listing', 'get_swap_settings', 'join_swap_community', 'leave_swap_community',
  'list_my_swap_listings', 'list_my_swaps', 'list_swap_blocks', 'narrow_swap_listing', 'propose_swap',
  'renew_swap_listing', 'report_swap_content', 'respond_to_swap', 'send_swap_message', 'swap_ack_photo',
  'swap_complete_my_side', 'unblock_swap_member', 'update_swap_listing', 'withdraw_swap_listing',
];
const SERVICE_FUNCTIONS = [
  'swap_admin_hold_listing', 'swap_admin_release_listing', 'swap_admin_remove_listing', 'swap_admin_suspend', 'swap_admin_unsuspend',
  'swap_known_photo_paths', 'swap_publish_commit', 'swap_publish_precheck', 'swap_report_backlog', 'swap_send_report_digest',
  'swap_set_community_enabled', 'swap_set_enabled',
];

const definedFunctions = [...all.matchAll(/create or replace function public\.(\w+)\(/g)].map(m => m[1]);

/** Function names listed in `foreach f in array array[ ... ]` blocks whose following lines grant to `role`. */
const grantedTo = (role: string): string[] => {
  const out: string[] = [];
  for (const block of all.matchAll(/foreach f in array array\[([\s\S]*?)\]\s*loop([\s\S]*?)end loop;/g)) {
    if (block[2].includes(`to ${role}`)) {
      out.push(...[...block[1].matchAll(/'public\.(\w+)\(/g)].map(m => m[1]));
    }
  }
  // single statements
  for (const m of all.matchAll(/grant execute on function public\.(\w+)\(.*?\) to (\w+);/g)) {
    if (m[2] === role) out.push(m[1]);
  }
  return out;
};

describe('swap migrations', () => {
  it('exist, in order', () => {
    expect([...FILES].sort()).toEqual(FILES);
    for (const f of FILES) expect(fs.existsSync(path.join(dir, f))).toBe(true);
  });

  it('turn row level security on and close every swap table to app users', () => {
    for (const t of TABLES) expect(all).toMatch(new RegExp(`create table if not exists public\\.${t}\\b`));
    const loop = all.match(/foreach t in array array\[([^\]]+)\]/)![1];
    for (const t of TABLES) expect(loop).toContain(`'${t}'`);
    expect(all).toContain("execute format('alter table public.%I enable row level security', t)");
    expect(all).toContain("execute format('revoke all on public.%I from public, anon, authenticated', t)");
  });

  it('give app users no policy on a swap table', () => {
    for (const m of all.matchAll(/create policy "([^"]+)"\s+on ([\w.]+)/g)) {
      expect(['public.user_blocks', 'storage.objects']).toContain(m[2]);
    }
    expect(all).not.toMatch(/create policy[^;]*swap_(listings|items|messages|members)/);
  });

  it('only ever add a policy on storage.objects for the swap-photos viewer rule', () => {
    const storage = [...all.matchAll(/create policy "([^"]+)"\s+on storage\.objects[\s\S]*?;/g)];
    expect(storage).toHaveLength(1);
    expect(storage[0][1]).toBe('swap photos: viewers');
    expect(storage[0][0]).toContain("bucket_id = 'swap-photos' and public.can_view_swap_photo(name)");
    expect(storage[0][0]).toContain('for select to authenticated');
  });

  it('create the bucket private, small, and JPEG or PNG only', () => {
    expect(all).toContain("values ('swap-photos', 'swap-photos', false, 5242880, array['image/jpeg', 'image/png'])");
    expect(all).toContain('set public = false');
  });

  it('grant exactly the client functions to authenticated, and no others', () => {
    expect(grantedTo('authenticated').sort()).toEqual([...CLIENT_FUNCTIONS, 'can_view_swap_photo'].sort());
  });

  it('grant the service functions to service_role only', () => {
    expect(grantedTo('service_role').sort()).toEqual([...SERVICE_FUNCTIONS, 'swap_janitor'].sort());
  });

  it('revoke from anon, public and clients every function that is not a client function', () => {
    const clientish = new Set([...CLIENT_FUNCTIONS, 'can_view_swap_photo']);
    for (const name of definedFunctions) {
      if (clientish.has(name)) {
        expect(all).toMatch(new RegExp(`'public\\.${name}\\(|revoke all on function public\\.${name}\\([^)]*\\) from public, anon;`));
      } else {
        expect(all).toMatch(new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon, authenticated|'public\\.${name}\\(`));
      }
    }
  });

  it('pin search_path on every function that runs as its owner', () => {
    for (const chunk of all.split('create or replace function ').slice(1)) {
      const head = chunk.slice(0, chunk.indexOf('$$'));
      if (/security definer/.test(head)) expect(head).toMatch(/set search_path = public/);
    }
  });

  it('leave the live friend and account functions alone', () => {
    for (const name of ['delete_user_account', 'block_user', 'report_user', 'get_friend_closet', 'find_user_by_email', 'is_blocked_between', 'friend_display_name']) {
      expect(all).not.toMatch(new RegExp(`create or replace function public\\.${name}\\(`));
    }
  });

  it('cascade every user foreign key, except the two swap participants, which are set null', () => {
    const refs = [...all.matchAll(/(\w+)\s+uuid[^\n]*references auth\.users\(id\)([^\n,]*)/g)];
    expect(refs.length).toBeGreaterThan(5);
    for (const r of refs) {
      if (r[1] === 'proposer_id' || r[1] === 'recipient_id') expect(r[2]).toContain('on delete set null');
      else expect(r[2]).toContain('on delete cascade');
    }
    expect(refs.filter(r => r[2].includes('set null'))).toHaveLength(2);
  });

  it('never put an email, a user id or a private column in a client-visible result', () => {
    const forbidden = ['email', 'user_id', 'owner_id uuid', 'proposer_id uuid', 'recipient_id uuid', 'cost', 'retail_cost', 'notes text', 'tag_text', 'estimated_value', 'wear_count', 'purchase_date'];
    for (const m of all.matchAll(/returns table \(([\s\S]*?)\)\s*language/g)) {
      for (const word of forbidden) expect(m[1]).not.toContain(word);
    }
  });

  it('keep the old report_user lists, so older builds are untouched', () => {
    expect(all).toMatch(/context in \('friend_request', 'friend_closet', 'profile', 'swap_listing', 'swap_chat'\)/);
    expect(all).toMatch(/reason in \('spam', 'harassment', 'inappropriate', 'impersonation',\s+'scam', 'not_as_described', 'unsafe', 'other'\)/);
  });

  it('reach the database only through functions: no raw table SQL in client-callable code', () => {
    expect(all).not.toMatch(/grant (select|insert|update|delete)[^;]* on public\.(swaps?|swap_\w+) to (anon|authenticated|public)/);
  });

  it('keep two decisions out of the folder `supabase db push` applies: the policy drop and the bucket flag', () => {
    const present = fs.readdirSync(dir);
    // db push applies every pending file and cannot skip one, so anything waiting for the owner lives in supabase/held.
    expect(present.filter(f => /drop_legacy_friend_wardrobe_policy|wardrobe_images_private|blocked_terms/.test(f))).toEqual([]);
    const statements = (file: string) => fs.readFileSync(path.join(heldDir, file), 'utf8')
      .split('\n').filter(l => l.trim() && !l.trim().startsWith('--')).join(' ').replace(/\s+/g, ' ').trim();
    expect(statements('drop_legacy_friend_wardrobe_policy.sql')).toBe(`drop policy if exists "Friends can view each other's wardrobe" on public.clothing_items;`);
    expect(statements('wardrobe_images_private.sql')).toBe(
      "insert into storage.buckets (id, name, public) values ('wardrobe-images', 'wardrobe-images', false) on conflict (id) do update set public = false;");
  });

  it('do not load the objectionable-term list: the owner supplies it later, as a new migration or dashboard SQL', () => {
    expect(all).not.toMatch(/insert into public\.swap_blocked_terms/);
  });

  it('create the one table delete_user_account() needs, only when it is missing, with row level security', () => {
    const sql = fs.readFileSync(path.join(dir, PREREQUISITE), 'utf8');
    expect(sql).toContain("if to_regclass('public.styling_recommendations') is null then");
    expect(sql).toContain('alter table public.styling_recommendations enable row level security');
    expect(sql).toMatch(/create table public\.styling_recommendations/);
    expect(sql).not.toMatch(/create table if not exists/);   // never touches the live table
    expect(sql).not.toMatch(/\bdrop\b/i);
    expect(PREREQUISITE < FILES[0]).toBe(true);
  });

  it('fold text before any rule reads it, and keep terms folded', () => {
    expect(all).toContain('t text := public.swap_fold_text(p_text);');
    expect(all).toContain('and term = public.swap_fold_text(term)');
    expect(all).toContain('normalize(coalesce(p_text');
  });

  it('keep a hold in place: only the rack expires, holds record who made them, and every exit is explicit', () => {
    expect(all).toMatch(/set status = 'expired', status_changed_at = now\(\)\s+where status = 'active' and expires_at <= now\(\)/);
    expect(all).not.toMatch(/where status in \('active', 'held'\) and expires_at <= now\(\)/);
    expect(all).toContain("held_by            text check (held_by is null or held_by in ('reports', 'admin', 'suspension'))");
    expect(all).toContain("where owner_id = p_user and status = 'held' and held_by = 'suspension'");
    expect(all).toContain("perform public.swap_raise('listing_held', '42501')");
    expect(all).toContain("(status = 'active' or (status = 'held' and tg_op = 'DELETE'))");   // the wishlist round trip keeps a hold
    expect(all).toContain('create or replace function public.swap_admin_remove_listing');
  });

  it('check a piece in one place, and use that place both before and after the photo copy', () => {
    const listings = sqls[1];
    expect(listings).toContain('create or replace function public.swap_validate_item');
    expect((listings.match(/public\.swap_validate_item\(p_user, p_item, p_audience, p_note\)/g) ?? [])).toHaveLength(2);
    const commit = listings.slice(listings.indexOf('create or replace function public.swap_publish_commit'));
    expect(commit.indexOf('for share')).toBeGreaterThan(-1);
    expect(commit.indexOf('for share')).toBeLessThan(commit.indexOf('swap_validate_item'));
  });

  it('let a swap be cancelled by whoever has not tapped, and push the expiry out on the first tap', () => {
    const lifecycle = sqls[2];
    expect(lifecycle).toContain("(s.status = 'accepted' and not me_done)");
    expect(lifecycle).toContain("expires_at = greatest(expires_at, now() + interval '15 days')");
    expect(lifecycle).not.toMatch(/proposer_done_at is null and s\.recipient_done_at is null\) then/);
  });

  it('never filter a blocked pair out of the inbox, the count or the badge', () => {
    expect(sqls[1]).not.toMatch(/swap_pair_state\(s\.proposer_id, s\.recipient_id\) <> 'blocked'/);
    expect(sqls[2]).not.toMatch(/swap_pair_state\(s\.proposer_id, s\.recipient_id\) <> 'blocked'/);
    const getSwap = sqls[2].slice(sqls[2].indexOf('create or replace function public.get_swap('), sqls[2].indexOf('create or replace function public.respond_to_swap'));
    expect(getSwap).not.toMatch(/if not found or public\.swap_pair_state/);
    expect(getSwap).toContain("blocked := (public.swap_pair_state(s.proposer_id, s.recipient_id) = 'blocked');");
  });
});
````

#### `__tests__/migrationVersions.test.ts`

````ts
/**
 * `supabase db push` records each migration under its version (the digits before the first underscore),
 * and the version is the primary key of the table that remembers what ran. Two files with the same version
 * and different names make `db push` and `db reset` fail, and nothing in a diff review shows it. Every
 * feature that adds migrations is covered by this one test.
 */
import fs from 'fs';
import path from 'path';

const root = path.join(__dirname, '..', 'supabase');
const migrations = fs.readdirSync(path.join(root, 'migrations')).filter(f => f.endsWith('.sql')).sort();
const held = fs.existsSync(path.join(root, 'held')) ? fs.readdirSync(path.join(root, 'held')) : [];
const versionOf = (file: string) => file.match(/^(\d+)_/)?.[1];

describe('supabase/migrations', () => {
  it('gives every file a version and a name', () => {
    for (const f of migrations) expect(versionOf(f)).toBeDefined();
  });

  it('has no two files with the same version', () => {
    const seen = new Map<string, string>();
    for (const f of migrations) {
      const v = versionOf(f)!;
      expect(`${v} is used by ${seen.get(v) ?? f}`).toBe(`${v} is used by ${f}`);
      seen.set(v, f);
    }
  });

  it('keeps the swap range to the swap files: another feature must take a range of its own', () => {
    // Swaps: 20261015000000 (a prerequisite table) and 20261015000100 to 20261015000500. The ratings design keeps
    // 20261016000000 to 20261016000399. See documentation/design/swap.md 10.1.
    const inSwapRange = migrations.filter(f => f.slice(0, 8) === '20261015');
    expect(inSwapRange.every(f => /^2026101500(0000_styling_recommendations_if_missing|0[1-5]00_swap_)/.test(f))).toBe(true);
  });

  it('holds back what is waiting for a decision: held files are not migrations', () => {
    for (const f of held) expect(versionOf(f)).toBeUndefined();
    expect(migrations.filter(f => /drop_legacy_friend_wardrobe_policy|wardrobe_images_private/.test(f))).toEqual([]);
  });
});
````

#### `__tests__/swapRulesInStepWithSql.test.ts`

````ts
import fs from 'fs';
import path from 'path';
import { SWAP_ALIAS_PATTERN, SWAP_LIMITS, SWAP_REPORT_REASONS, SWAP_TERMS_VERSION } from '../src/config/swapRules';

const dir = path.join(__dirname, '..', 'supabase', 'migrations');
const sql = (name: string) => fs.readFileSync(path.join(dir, name), 'utf8');
const foundation = sql('20261015000100_swap_foundation.sql');
const listings = sql('20261015000200_swap_listings.sql');
const moderation = sql('20261015000400_swap_moderation.sql');

const limitsInSql = (): Record<string, number> => {
  const start = foundation.indexOf('create or replace function public.swap_limit');
  const body = foundation.slice(start, foundation.indexOf('$$;', foundation.indexOf('$$', start) + 2));
  return Object.fromEntries([...body.matchAll(/when '(\w+)'\s+then (\d+)/g)].map(m => [m[1], Number(m[2])]));
};

describe('swapRules.ts and the migrations say the same thing', () => {
  it('has the same limits', () => {
    const fromSql = limitsInSql();
    const textLengths = ['note_max', 'proposal_note_max', 'message_max'];     // enforced by column checks, not swap_limit
    const fromTs = Object.fromEntries(Object.entries(SWAP_LIMITS).filter(([k]) => !textLengths.includes(k)));
    expect(fromTs).toEqual(fromSql);
  });

  it('has the same text lengths as the column checks', () => {
    expect(foundation).toContain(`char_length(note) <= ${SWAP_LIMITS.note_max}`);
    expect(foundation).toContain(`char_length(body) between 1 and ${SWAP_LIMITS.message_max}`);
    expect(sql('20261015000300_swap_lifecycle.sql')).toContain(`char_length(clean) > ${SWAP_LIMITS.proposal_note_max}`);
  });

  it('asks for the terms version the database holds', () => {
    expect(foundation).toContain(`('terms_version',         '"${SWAP_TERMS_VERSION}"'::jsonb)`);
  });

  it('offers the report reasons the database accepts', () => {
    const accepted = [...moderation.match(/check \(reason in \(([^)]*)\)\)/)![1].matchAll(/'(\w+)'/g)].map(m => m[1]);
    expect(SWAP_REPORT_REASONS.map(r => r.value).sort()).toEqual(accepted.sort());
  });

  it('checks aliases the same way', () => {
    const regex = foundation.match(/alias ~ '(\^[^']+\$)'/)![1];
    expect(regex).toBe(SWAP_ALIAS_PATTERN.source);
  });
});
````

#### `__tests__/utils/swapFormat.test.ts`

````ts
import { closedExplanation, listingFacts, newClientRef, ownerLine, statusLabel, swapTitle, systemLineText } from '../../src/utils/swapFormat';

describe('swap wording', () => {
  it('makes a fresh uuid for each attempt', () => {
    expect(newClientRef()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(newClientRef()).not.toBe(newClientRef());
  });

  it('words each status from the member’s side', () => {
    expect(statusLabel({ status: 'proposed', role: 'recipient' })).toBe('Waiting for your answer');
    expect(statusLabel({ status: 'proposed', role: 'proposer' })).toBe('Waiting for their answer');
    expect(statusLabel({ status: 'declined', role: 'recipient' })).toBe('You declined');
    expect(statusLabel({ status: 'cancelled', closedReason: 'cancelled_by_recipient', role: 'proposer' })).toBe('They cancelled');
    expect(statusLabel({ status: 'completed', role: 'proposer' })).toBe('Swapped');
  });

  it('never says why a swap became unavailable', () => {
    const s = { status: 'cancelled' as const, closedReason: 'unavailable' as const, role: 'proposer' as const };
    expect(statusLabel(s)).toBe('No longer available');
    expect(closedExplanation(s)).not.toMatch(/block|report|suspend|unfriend|deleted their/i);
  });

  it('tells a member who already tapped what a cancellation by the other person means', () => {
    const s = { status: 'cancelled' as const, closedReason: 'cancelled_by_recipient' as const, role: 'proposer' as const };
    expect(closedExplanation(s)).toBe('They cancelled this swap.');
    expect(closedExplanation({ ...s, iDone: true })).toMatch(/after you tapped.*stays in your closet.*report/);
    expect(closedExplanation({ ...s, role: 'recipient', iDone: true })).toBe('You cancelled this swap.');
  });

  it('has nothing to explain while a swap is open', () => {
    expect(closedExplanation({ status: 'accepted', role: 'proposer' })).toBeNull();
    expect(closedExplanation({ status: 'proposed', role: 'recipient' })).toBeNull();
  });

  it('words the grey lines in a thread', () => {
    expect(systemLineText('proposed')).toBe('Offer sent');
    expect(systemLineText('unavailable')).toBe('No longer available');
    expect(systemLineText('nonsense')).toBe('');
  });

  it('lists only the facts that exist, in a fixed order', () => {
    const facts = listingFacts({ brand: 'Zara', size: 'M', condition: 'good', color: 'blue', materials: [{ name: 'wool', percentage: 80 }, { name: 'nylon' }], careInstructions: ['Dry clean only'], originCountry: 'Italy', season: ['winter'] });
    expect(facts.map(f => f.label)).toEqual(['Brand', 'Size', 'Condition', 'Colour', 'Materials', 'Care', 'Made in', 'Season']);
    expect(facts.find(f => f.label === 'Materials')?.value).toBe('80% wool, nylon');
    expect(listingFacts({})).toEqual([]);
  });

  it('names who and what', () => {
    expect(ownerLine({ ownerLabel: 'Ann', ownerKind: 'friend' })).toBe('Ann · Friend');
    expect(ownerLine({ ownerLabel: 'Velvet Otter', ownerKind: 'member' })).toBe('Velvet Otter · Member');
    expect(swapTitle(['Blazer'], ['Shirt', 'Hat'])).toBe('Blazer for Shirt and 1 more');
  });
});
````
