# Build plan: clothing swaps and quality ratings with tag scanning

Status: final, 2026-10-13. This file runs two build specifications together:

- `documentation/design/swap.md` (clothing swaps)
- `documentation/design/quality-ratings.md` (quality ratings, brand insights and tag scanning)

Both documents were reconciled against each other and against the repository at commit `e0eae15`. Where this file and a spec differ, this file wins, and the spec has been edited to say the same thing (section 7 lists what changed). The specs stay the contract for everything else: their SQL, TypeScript and test code were run before they were written down, so streams copy it as written and only tighten it.

## 1. Names

| Build name | What it is | Spec name |
| --- | --- | --- |
| Q0 to Q7 | The ratings build streams | ratings streams 0 to 7 |
| (not built) | The optional `openai-tag` proxy route | ratings stream 8 |
| POL | The one policy and compliance stream, for both features | ratings stream 9 and swap S7 |
| A | Ratings integration pass on shared screens | ratings stream 10 |
| SW0 to SW6 | The swap build streams | swap S0 to S6 |
| B | Swap integration pass on shared screens | swap "Lead" |
| the lead | The person who applies migrations, deploys, publishes, runs App Store Connect and flips flags. Not a build stream | |

## 2. Decisions

1. **Migration versions.** Ratings: `20261014000000` to `20261014000399` (three files: `20261014000000_ratings_hardening.sql`, `20261014000200_consents_and_quota.sql`, `20261014000300_quality_ratings.sql`). Swap: `20261015000000` to `20261015000500` (six files: the prerequisite `20261015000000_styling_recommendations_if_missing.sql`, then `20261015000100_swap_foundation.sql`, `...200_swap_listings.sql`, `...300_swap_lifecycle.sql`, `...400_swap_moderation.sql`, `...500_swap_community.sql`). The newest existing migration is `20261013000000`. Both documents, every file name, comment, shell loop and test text in them now say this.
2. **One push.** The nine files go in a single `supabase db push`, in version order (ratings first). `--include-all` is never needed in that order. It would be needed (after reading the dry run) only if swap were pushed alone first and ratings later. The SQL of the two features does not depend on each other: both orders were applied, twice each, to one scratch database, and both features' scripts pass on it.
3. **Held files.** `supabase/held/drop_legacy_friend_wardrobe_policy.sql` has exactly one copy and one owner, Q0 (its text is `quality-ratings.md` 4.3). Swap keeps none; its tests only read it. `supabase/held/wardrobe_images_private.sql` is SW1's. Neither is moved by any stream; the owner releases them (release procedure: `swap.md` 4.1, `quality-ratings.md` 4.1). A released file keeps its name behind a 14-digit release-day version, leaves `supabase/held/`, and never exists in both places.
4. **Version guard.** `__tests__/migrationVersions.test.ts` is Q0's, one file for both features (text: `swap.md` Appendix F). It checks unique versions, each feature's numeric range, held files, and accepts a released held file only in the release form. It checks ranges numerically, so later alias or term-list migrations dated 2026-10-14 or 2026-10-15 are fine.
5. **`BACKUP_VERSION` and `backupService.ts`.** SW0 (wave 1) makes the bump to `'1.1'` and adds the swap section, against today's file (diff in `swap.md` Appendix C, applied and tested). Pass A later adds only the ratings section, above the swap lines, and never touches the version (landmarks in `quality-ratings.md` 5.9).
6. **POL is the only editor** of `docs/privacy.html`, `ios/smartcloset/PrivacyInfo.xcprivacy`, `ios/smartcloset/Info.plist` and `docs/MODERATION.md`, and the only author of the four privacy tests (`__tests__/privacyManifest.test.ts`, `__tests__/docs/privacyPolicy.test.ts`, `__tests__/config/privacyManifest.test.ts`, `__tests__/config/infoPlist.test.ts`). The combined wording is the table in `swap.md` 10.1; it wins over both feature lists and over the Appendix D diff where they differ (the diff already carries it). Rules for the page:
   - It is published once, before either build is submitted, with one "Last updated" date.
   - It makes no statement that is false on the day it is published: no "private storage" claim for original photos until gate G0 has passed, no "visible only to you" for scanned tag text while the legacy friends policy is still held (the fallback sentence of `quality-ratings.md` 8.2 is used and the page is edited again when the drop is released), no mention of OpenAI receiving tag text (Phase 4 is not built).
   - The manifest gains `EmailsOrTextMessages` and `PurchaseHistory` (linked, not tracking, app functionality). The "Usage and diagnostics: crash reports" row is corrected or removed (the build has no crash SDK).
   - The two manifest tests do not pin an exact number of data types.
7. **Integration passes.** A (ratings) runs first, then B (swap), one pass per file at a time. B's diffs for `App.tsx`, the item screen and Settings are generated against a simulation of pass A and must be re-checked with `patch --dry-run` against the real tree after A. Card order under the value card: `ItemQualityCard`, then `SwapListingCard`. Settings: A turns the "Share product details" block into a fragment and adds `<RatingSharingRows />`; B adds `<SwapSettingsSection />` last in the Community section. Two Settings strings name the data and each is edited by both passes in turn: the delete-account alert and the Danger Zone note (exact texts in `quality-ratings.md` 10.2).
8. **Keyboard.** Pass A adds the optional `doneId` to `keyboardScreens.test.tsx` once; pass B appends its cases. The swap thread composer uses its own accessory id (`SWAP_MESSAGE_ACCESSORY_ID`, a `KeyboardActionBar`), because `SwapSafetySheet` opens from that screen and renders a `KeyboardDoneBar` with the shared id (`swap.md` 7.5). The other sheets in both specs are Modals that mount nothing while closed, so no screen has two accessory views with one id on screen at once.
9. **Single-owner shared files.** `supabase/audit.sql`: Q1 only, ratings tables only. Swap's tables have RLS on and no policies by design, so the audit's "no policies" check would flag them; they are covered by `s6_catalog.sql` and `swapMigrations.test.ts` and must never be added to its list. `supabase/config.toml`: SW2 only (`[functions.swap-media] verify_jwt = true`). `supabase/functions/delete-account/index.ts`: SW2 only. `AddClothingScreen.tsx`: A only. `HomeScreen.tsx`, `FriendClosetScreen.tsx`, `authService.ts`, `accountDeletion.ts`: B only. `package.json`, `package-lock.json`, `jest.config.js`, `tsconfig*.json`: nobody; there are no new dependencies and no new AsyncStorage keys in either feature.
10. **Stream 8 is not built.** `TAG_MODEL_FALLBACK_ENABLED` stays false and nobody edits `supabase/functions/ai-proxy/index.ts`. Q7 still builds `tagModel.ts` and its test (the client falls back to the local result on `400 unknown provider`). Q0's `aiProxyConsentGate.test.ts` does not need an `openai-tag` key in the proxy. `TAG_OCR_FEATURE` stays `'TEXT_DETECTION'`.
11. **Things that need the owner's photographs or a live call are not built.** The sealed real-tag set (`__tests__/fixtures/tags/gate/*`, `FROZEN.json`) and `__tests__/fixtures/tags/_shape.json` (Spike 0 needs a live Vision call) are not created; Q6's corpus test is `todo` while `TAG_SCAN_ENABLED` is false and fails if the flag is turned on without them.
12. **Flags and switches at hand-over.** Ratings: `TAG_SCAN_ENABLED`, `RATINGS_ENABLED`, `BRAND_INSIGHTS_ENABLED`, `TAG_MODEL_FALLBACK_ENABLED` all `false`. Swap: server rows as the migrations set them (`swaps_enabled` true, `community_enabled` false, `terms_version` `2026-10`, `min_account_age_hours` 48). No stream turns anything on. If the lead wants a dark deploy, `select public.swap_set_enabled(false);` after the push.
13. **What agents cannot do.** No stream runs `git add/commit/stash/checkout/reset/push`, `supabase db push`, `supabase functions deploy`, `supabase secrets`, or anything that changes the live project or an outside service. SQL behaviour scripts run on a scratch local PostgreSQL 16 (own temp data directory and free port, `LC_ALL=en_US.UTF-8`, stopped afterwards). Deno is not installed: edge code is type-checked with shims. SW1's "first task" (`supabase start`, `supabase db reset`, the scripts on the real local stack) cannot be done in this environment: SW1 runs the scripts on scratch PostgreSQL 16 and lists the real-stack checks (1) to (6) of `swap.md` section 10 in its report for the lead.
14. **Release order** is section 5: apply migrations, publish the privacy page, deploy `swap-media`, build, flip.

## 3. Streams, waves and ownership

### 3.1 Waves

| Wave | Streams | Starts when |
| --- | --- | --- |
| W1 | Q0, SW0, POL | now. No dependencies between them |
| W2 | Q1, Q2, Q6, SW1, SW2 | W1 merged |
| W3 | Q5, Q7, SW3 | W2 merged |
| W4 | Q3, Q4, SW4, SW5, SW6 | W3 merged |
| Pass A | Ratings integration | W4 merged |
| Pass B | Swap integration | Pass A merged |

Streams inside a wave run in parallel on the same tree. Their contact points:

| Contact | What to do |
| --- | --- |
| Q6 and Q1 (W2) | Q6's `canonicalFibre` parity test reads Q1's migration text (`supabase/migrations/20261014000300_quality_ratings.sql`). Q6 writes it last. If Q1's file is not there yet, Q6 reports that one test as blocked on Q1 (never skips it silently); Q1 runs it when it finishes, and pass A re-runs it |
| SW2 and SW1 (W2) | Function names only (the contract in the spec); no file is shared |
| Q4 and Q3 (W4) | Q4 imports `RatingScale` from Q3. Mock it in tests; a typecheck error that comes only from the file not existing yet is not Q4's: report it |
| SW6 and SW4 (W4) | SW6 uses `MyPiecesList` by its documented props only and mocks it. SW5 and SW6 do not import each other |
| Everyone | A file owned by another stream is used through the signature in the spec and mocked; it is never copied or edited |

### 3.2 What each stream owns

Test files not listed by name are the ones the spec's test section names for that stream, in `__tests__/components/` for components, `__tests__/screens/` for screens, and the folder shown for the rest.

| Stream | Feature | Owns | Spec |
| --- | --- | --- | --- |
| **Q0** Foundation | ratings | `src/config/ratingFlags.ts`, `src/config/ratingVocabulary.ts`, `src/types/rating.ts`, `src/types/tag.ts`, `src/utils/brandKey.ts`, `src/utils/brandNames.ts` (edit), `src/services/rpcErrors.ts`, `src/services/consentService.ts`, `src/services/aiConsent.ts` (edit), `src/services/aiProxy.ts` (edit); `supabase/migrations/20261014000000_ratings_hardening.sql`, `supabase/migrations/20261014000200_consents_and_quota.sql`; `supabase/held/drop_legacy_friend_wardrobe_policy.sql` (and its release form); tests `__tests__/utils/brandKey.test.ts`, `__tests__/utils/brandNames.test.ts` (edit), `__tests__/fixtures/brandKeys.json`, `__tests__/config/ratingFlags.test.ts`, `__tests__/services/aiConsent.test.ts` (edit), `aiConsentLevels.test.ts`, `aiProxyConsentGate.test.ts`, `rpcErrors.test.ts`, `consentService.test.ts`, `__tests__/ratingsHardeningMigration.test.ts`, `__tests__/consentsAndQuotaMigration.test.ts`, `__tests__/migrationVersions.test.ts`. Not created in this build: `__tests__/fixtures/tags/gate/*`, `FROZEN.json` | ratings 2.2, 4.1 to 4.4, 5.1 to 5.4, 7.2, 9.2; swap Appendix F (version guard) |
| **SW0** Contract | swap | `src/types/swap.ts`, `src/config/swapRules.ts`, `src/services/swapErrors.ts`, `src/services/swapPhotoUrls.ts`, `src/services/swapService.ts`, `src/utils/swapFormat.ts`, `src/hooks/useSwapBadge.ts`, `src/hooks/useSwapAccess.ts`, `src/services/backupService.ts` (the whole Appendix C diff: swap section and `'1.1'`); tests `__tests__/services/swapErrors.test.ts`, `swapPhotoUrls.test.ts`, `swapService.test.ts`, `backupSwapExport.test.ts`, `__tests__/utils/swapFormat.test.ts`, `__tests__/hooks/useSwapBadge.test.tsx`, `useSwapAccess.test.tsx` | swap 6, Appendix C |
| **POL** Policy | both | `docs/privacy.html`, `ios/smartcloset/PrivacyInfo.xcprivacy`, `ios/smartcloset/Info.plist` (two strings), `docs/MODERATION.md` (content: `swap.md` 11.4); tests `__tests__/privacyManifest.test.ts`, `__tests__/docs/privacyPolicy.test.ts`, `__tests__/config/privacyManifest.test.ts`, `__tests__/config/infoPlist.test.ts` | swap 8, 10.1, 11.4, Appendix D; ratings 8.2, 8.3 |
| **Q1** Ratings database | ratings | `supabase/migrations/20261014000300_quality_ratings.sql`; `supabase/checks/quality_ratings_scenarios.sql`, `quality_ratings_audit.sql`, `quality_ratings_leak_check.sql`, `brand_key_parity.sql`, `local_stub.sql`, `populated_seed.sql`, `populated_cleanup.sql`; `supabase/audit.sql` (add `item_ratings`, `brand_ratings`, `user_consents`); `__tests__/qualityRatingsMigration.test.ts` | ratings 4.5 to 4.13, 9.2, 9.3 |
| **Q2** Rating services | ratings | `src/services/ratingService.ts`, `src/services/brandInsightService.ts` and their two tests | ratings 5.5, 5.6 |
| **Q6** Tag parser | ratings | `src/utils/textFold.ts`, `materialNames.ts`, `countries.ts`, `careNames.ts`, `tagParser.ts`, `tagGrounding.ts`, `tagTranscription.ts`, `src/utils/itemValue.ts` (edit: canonical fallback only), `src/components/MaterialsEditor.tsx` (edit: suggestions only); `__tests__/scripts/recordTagFixture.test.ts`; `__tests__/fixtures/tags/synthetic.json`, `dev/*`; tests `tagParser`, `tagGrounding`, `materialNames`, `careNames`, `countries`, `tagTranscription`, `textFold`, `itemValueCanonical`, `tagParserCorpus` under `__tests__/utils/` | ratings 7.3 to 7.13 |
| **SW1** Swap database | swap | `supabase/migrations/20261015000000_styling_recommendations_if_missing.sql`, `20261015000100_swap_foundation.sql`, `20261015000200_swap_listings.sql`, `20261015000300_swap_lifecycle.sql`, `20261015000400_swap_moderation.sql`, `20261015000500_swap_community.sql`; `supabase/held/wardrobe_images_private.sql`; everything in `supabase/tests/swaps/` (including `race.sh`); `scripts/run-swap-sql-tests.sh`; `__tests__/swapMigrations.test.ts`, `__tests__/swapRulesInStepWithSql.test.ts`. Not SW1's: the policy-drop file and `migrationVersions.test.ts` (Q0) | swap 4, Appendix A, D, E |
| **SW2** Swap edge | swap | `supabase/functions/swap-media/index.ts`, `supabase/functions/_shared/jpegMetadata.ts`, `pngMetadata.ts`, `sameSecret.ts`, `swapModeration.ts`; `supabase/functions/delete-account/index.ts` (the diff); `supabase/config.toml` (add the `swap-media` section); `.github/workflows/swap-sweep.yml` only if `pg_cron` is found missing (default: not created); `__tests__/functions/*` | swap 5, Appendix B |
| **Q5** Consent UI | ratings | `src/components/RatingConsentSheet.tsx`, `RatingSharingRows.tsx`, `src/config/ratingGuidelines.ts` and their two tests | ratings 3.5, 6.2 |
| **Q7** Tag capture and UI | ratings | `src/services/tagReader.ts`, `tagModel.ts`; `src/platform/fileSystem.native.ts` (add `discardTempImage`), `fileSystem.web.ts`, `fileSystem.ts`; `src/components/ScanTagSection.tsx`, `ScanTagButton.tsx`, `TagReviewSheet.tsx`, `ItemLabelBlock.tsx`; their tests and `__tests__/platform/fileSystemDiscard.test.ts` | ratings 3.2, 6.4, 7 |
| **SW3** Shared swap UI | swap | `src/components/SwapPhoto.tsx`, `SwapStatusBadge.tsx`, `SwapSafetySheet.tsx`, `SwapGuidelinesSheet.tsx`, `SwapTermsSheet.tsx`, `SwapJoinCommunitySheet.tsx`, `SwapBlockedSheet.tsx`, `SwapSettingsSection.tsx` and their tests | swap 7.2, Appendix C, F |
| **Q3** Rating UI | ratings | `src/components/RatingScale.tsx`, `RateItemSheet.tsx`, `ItemQualityCard.tsx` and their tests | ratings 3.3, 6.2 |
| **Q4** Brand report | ratings | `src/screens/BrandReportScreen.tsx`, `src/components/RateBrandSheet.tsx`, `BrandInsightStrip.tsx` and their tests | ratings 3.4, 6.2 |
| **SW4** Listing UI | swap | `src/components/SwapListingCard.tsx`, `ListForSwapSheet.tsx`, `MyPiecesList.tsx` and their tests | swap 7.3 |
| **SW5** Rack UI | swap | `src/components/SwapCard.tsx`, `SwapOfferSheet.tsx`, `src/screens/SwapBoardScreen.tsx`, `SwapListingScreen.tsx` and their tests | swap 7.4 |
| **SW6** Inbox and thread UI | swap | `src/components/SwapTicket.tsx`, `SwapCompleteSheet.tsx`, `src/screens/MySwapsScreen.tsx`, `SwapThreadScreen.tsx` (exports `SWAP_MESSAGE_ACCESSORY_ID`) and their tests | swap 7.5 |
| **Pass A** | ratings | `App.tsx` (import, `BrandReport` in the three stacks), `src/screens/ItemDetailsScreen.tsx`, `AddClothingScreen.tsx`, `SettingsScreen.tsx`, `src/services/backupService.ts` (ratings section only), `__tests__/screens/keyboardScreens.test.tsx` (`RateItemSheet` case, `doneId`), `__tests__/services/backupService.test.ts`, `__tests__/screens/ratingsIntegration.test.tsx` | ratings 5.9, 6.3, 10.2 |
| **Pass B** | swap | `App.tsx` (four imports, four `HomeStack` routes), `src/screens/HomeScreen.tsx`, `ItemDetailsScreen.tsx` (the card), `SettingsScreen.tsx` (the section and the two strings), `FriendClosetScreen.tsx`, `src/services/authService.ts`, `accountDeletion.ts`, `__tests__/screens/keyboardScreens.test.tsx` (appended cases) | swap 7.7, Appendix D |

### 3.3 Every file with more than one writer

| File | Order and owners | Notes |
| --- | --- | --- |
| `src/services/backupService.ts` | SW0 (wave 1: bump and swap section), then pass A (ratings section) | The existing `backupService.test.ts` passes with SW0's diff (checked) |
| `App.tsx` | Pass A, then pass B | Only the import block is shared |
| `src/screens/ItemDetailsScreen.tsx` | Pass A, then pass B | Quality card first, swap card second |
| `src/screens/SettingsScreen.tsx` | Pass A, then pass B | Fragment, then last child; two strings edited in turn |
| `__tests__/screens/keyboardScreens.test.tsx` | Pass A (`doneId` and the `RateItemSheet` case), then pass B (append) | Append-only |
| `docs/privacy.html`, `PrivacyInfo.xcprivacy`, `Info.plist`, `docs/MODERATION.md`, the four privacy tests | POL only | Both features' text; section 2, decision 6 |
| `supabase/held/drop_legacy_friend_wardrobe_policy.sql` | Q0 only | Read by SW1's test |
| `__tests__/migrationVersions.test.ts` | Q0 only | Covers both ranges |
| `supabase/audit.sql` | Q1 only | Swap tables are never added |
| `supabase/config.toml`, `delete-account/index.ts` | SW2 only | Ratings adds nothing |
| `HomeScreen.tsx`, `FriendClosetScreen.tsx`, `authService.ts`, `accountDeletion.ts` | Pass B only | |
| `AddClothingScreen.tsx` | Pass A only | |
| `package.json`, `package-lock.json`, `jest.config.js`, `tsconfig*.json`, `supabase/README.md`, `src/config/communityGuidelines.ts`, `src/config/legal.ts` | Nobody | |

A mechanical check of both documents' section 10 tables found no concrete path in two rows other than the intentional ones above: the POL files (one stream, listed in both documents), the pass A and pass B files, `backupService.ts`, and the two Q0 files that SW1's row names only to say they are not its own.

### 3.4 Names that could have collided

| Kind | Result |
| --- | --- |
| Tables, functions, views, triggers, policies, indexes, types | Every `create` name in both documents' SQL was compared with each other and with the repository's migrations: nothing in common. The two policies swap re-creates on `user_blocks` replace the existing ones by name on purpose. Shared existing tables: `user_blocks`, `content_reports` and `friend_requests` are touched by swap only; `clothing_items` gets swap's triggers and no ratings change |
| Storage | `swap-photos` bucket and the policy `swap photos: viewers` are swap's; the `wardrobe-images` public flag has its own held file (SW1) |
| Routes | Ratings: `BrandReport` in `WardrobeStack`, `HomeStack` and `WishlistStack`. Swap: `SwapBoard`, `SwapListing`, `MySwaps`, `SwapThread` in `HomeStack` only. None exists in `App.tsx` today, and every `navigate()` the specs add is a literal the route audit (`navigationRoutes.test.ts`) can resolve |
| AsyncStorage | No new key in either feature (`localData.test.ts` enforces it). The existing `@smartcloset_ai_consent_v1:<uid>` gains one more stored value (`granted_tags`), Q0 |
| Config and switches | `[functions.swap-media]` (SW2) is the only `config.toml` change. Ratings flags live in `src/config/ratingFlags.ts` (Q0), never in `features.ts`. Server rows `swap_config`, `rating_settings` and `consent_purposes` are separate |
| Jest files | No path is written by two streams. The privacy tests with similar names are all POL's |
| Screen labels the tests rely on | No label is shared between the two features' cards on the item screen (`Edit` and `Remove` against `Edit note`, `Withdraw`, `Renew`, `Update`). `Done` and `Not now` appear only in separate Modals |

## 4. What a stream runs before it reports

Everyone:

```
cd /Users/armenuhi/Programming/smartcloset
npx jest <the stream's own test files>
npx jest __tests__/screens/keyboardGuard.test.tsx __tests__/navigationRoutes.test.ts __tests__/addItemHeader.test.ts
npm run typecheck
```

Errors in files a stream does not own (other streams are mid-work) are not its to fix; it mentions them. New `.tsx` files in `src/screens` and `src/components` are flat, have no module-scope network or storage access (the launch smoke tests import every screen with `supabase` mocked to `auth` only), never call `console.error` on a guest or failure path, and satisfy the keyboard rules (`src/components/KeyboardSafe.tsx`).

Extra, by stream:

| Stream | Also |
| --- | --- |
| Q0 | `aiConsent`, `brandNames`, `recognitionProxyPrompt`, `searchProxyLimits` existing suites |
| Q1 | The scenario script on a scratch PostgreSQL 16, empty and then after `populated_seed.sql` (`ALL PASSED | t` both times), leak check zeros, parity 0 mismatches, audit read (ratings 9.3). The scenarios need the policy drop applied by hand on the scratch database |
| SW0 | `backupService`, `localData` (no new `@smartcloset` keys) |
| SW1 | `scripts/run-swap-sql-tests.sh` on a scratch PostgreSQL 16 with a Supabase stub; migrations applied twice. Expected counts: 61, 54, 64, 15, 105, 16 (and 6 in the optional policy script) |
| SW2 | Edge code type-checked with shims; the Jest source-text and helper tests |
| POL | The four privacy tests together; `plutil -lint` on the manifest; `patch --dry-run` of the Appendix D diffs |
| Pass A | The suites in `quality-ratings.md` 9.2 ("Existing suites that must still pass"), every flag off, then with flags mocked on in `ratingsIntegration.test.tsx` |
| Pass B | `swap.md` 9.4: `HomeScreen`, `homeWardrobeFor`, `WishlistSeparation`, `wardrobeTotalStrip`, `AppModeGate`, `App`, `ItemDetails`, `ItemDetailsValue`, `categoryLabelsShown`, `Settings`, `settingsWardrobeFor`, `addItem*`, `localData`, `backupService`, `accountDeletion`, `authService`, `friendModeration`, `friendCloset`, `FriendsScreen`, `UserSafetySheet`; and `patch --dry-run` of each diff before applying |

## 5. Release order (the lead's acts)

Before anything: every wave and both passes merged; `npm run typecheck`, `npm run lint`, `npx tsc --noEmit --skipLibCheck` and the whole `npx jest` run are green; all four rating flags are `false`.

1. **Apply migrations (swap gate G2).** First read-only catalogue checks on the linked project: `select id, public from storage.buckets where id = 'wardrobe-images'`; the columns of `styling_recommendations` against `documentation/SUPABASE_MIGRATION_GUIDE.md` (the prerequisite file does nothing on the live project, but the guide's definition is what a fresh database gets); whether `pg_cron`, `pg_net` and Vault exist; the backup retention period. Then `supabase db push --dry-run`: it must list exactly these nine files in this order and nothing else: `20261014000000_ratings_hardening.sql`, `20261014000200_consents_and_quota.sql`, `20261014000300_quality_ratings.sql`, `20261015000000_styling_recommendations_if_missing.sql`, `20261015000100_swap_foundation.sql`, `20261015000200_swap_listings.sql`, `20261015000300_swap_lifecycle.sql`, `20261015000400_swap_moderation.sql`, `20261015000500_swap_community.sql`. Then `supabase db push`. After it: the three read-only ratings checks (`quality_ratings_audit.sql`, `brand_key_parity.sql`, `quality_ratings_leak_check.sql`) and `scripts/run-swap-sql-tests.sh s6_catalog` (rolls back; confirm `to_regclass('t.log')` is null). The ratings scenario script and `populated_seed.sql` are never run on the live project. Nothing in `supabase/held/` moves.
2. **Publish the privacy page (swap gate G1).** POL's page is on the branch GitHub Pages serves (`PRIVACY_POLICY_URL`); open the live URL and read it against section 2, decision 6. By hand in App Store Connect: privacy label (Emails or Text Messages, Purchase History, both linked, app functionality), the age-rating questionnaire (user-generated content and messaging: yes) and its resulting tier, and review notes that claim only the filtering that is live (`swap.md` 8.3).
3. **Deploy `swap-media` (swap gate G3).** `supabase functions deploy swap-media delete-account`; the existing `GOOGLE_VISION_API_KEY` secret is reused. Prove the sweep refusal once with a hand-made token, and the success with the service key. Then schedule the daily sweep and the hourly report alert and prove the alert arrives with a real test report (swap gate G5, which gates the build).
4. **Build.** One TestFlight build with all code in it and the flags as handed over. Two-account walkthrough on real phones (swap gate G4, `swap.md` 9.5), including the thread composer's Done bar after closing the report sheet. Ratings has nothing visible with its flags off.
5. **Flip.**
   - Swap: `community_enabled` stays false until swap gate G6 (50 reviewed terms loaded, a person committed to the 24-hour queue, then `select public.swap_set_community_enabled(true);` and the walkthrough again with aliases). The kill switches need no release: `swap_set_enabled(false)`, `swap_set_community_enabled(false)`.
   - Ratings: a flag is a source constant, so each flip is a one-line edit of `src/config/ratingFlags.ts` and a new build, after that phase's gates (`quality-ratings.md` 8.1): Phase 1 `TAG_SCAN_ENABLED` needs the legacy friends policy drop released and `legacy_friend_policy_present = 0`, the real-tag gate (120 tags, sealed 40) passed, the privacy page re-published with the "visible only to you" sentence. Phase 2 `RATINGS_ENABLED` needs the ratings text on the page (it is in the first publish) and the export check. Phase 3 `BRAND_INSIGHTS_ENABLED` needs the scenarios `ALL PASSED` on a scratch or branch database built from the same migrations, counsel's review, the email-confirmation answer, and owner questions R1 to R5 answered. Phase 4 is not built.
6. **Optional hardening, any time after step 1, each its own decision:** gate G0 (release `wardrobe_images_private.sql` after the checks in `swap.md` 11.1, then POL re-publishes the page with the "private storage" sentence) and release of the legacy policy drop (only after the owner confirms no build in use reads a friend's `clothing_items` rows directly).

## 6. Owner questions and the default taken

The builds do not wait for these. "S" is `swap.md` 12.2, "R" is `quality-ratings.md` 11.2. Two questions are the same in both documents (S6 = R8, S12 = R9).

| Question | Default taken | Blocks / effect |
| --- | --- | --- |
| S1 Friends-only first release | Yes. Community stays dark | G6 only |
| S2 Who reviews reports within 24 hours, where does the hourly alert go | The owner reviews; the alert address (a webhook or mail gateway, stored in Vault) must exist before the build. App copy keeps the "aim of 24 hours" as written | Gate G5 blocks the build. If there is no alert by build day, the lead rewords the 24-hour aim in `swapRules.ts` to "as soon as we can" (SW0's file) before the build |
| S3 Who supplies the objectionable-term list; load it before first submission | Not loaded. Review notes claim only the built-in scam, payment and contact filtering | Community switch refuses until 50 terms |
| S4 / R1 Which builds are live; release the legacy friends policy drop | Not released. The file stays held | Phase 1 (tag scan) stays off; the page uses the fallback "Label scans" sentence |
| S5 `wardrobe-images` is flagged public | Gate G0 not run. The page makes no "private storage" claim | Optional hardening in step 6 |
| S6 / R8 Real backup retention period | No number on the page: "overwritten on their normal schedule" | |
| S7 `pg_cron`, `pg_net`, Vault available | Assumed yes, verified in step 1 and at G5. The GitHub sweep workflow is not built | If missing: SW2 adds the workflow, and the owner reads the report queue daily |
| S8 Windows (14, 30, 60 days; 30 and 90 day retention; 14-day auto-finish) | As written | |
| S9 Remove the piece you gave by default | Yes, with "Keep mine in my closet" | |
| S10 App Store link for "Invite a friend" | None; plain share text | |
| S11 Terms as a web page too | In-app only | |
| S12 / R9 Privacy page inaccuracies: crash-reports row, missing purchase-history and text-message declarations | Fix both in POL's single edit; declare `EmailsOrTextMessages` and `PurchaseHistory` | The owner updates the App Store Connect label to match |
| S13 Age-rating tier | The owner reads it on screen in App Store Connect after answering | Nothing in the repository |
| S14 Editing an open offer | No: cancel and resend | |
| S15 Should a completed swap invite a rating | No. Nothing reads swap data for ratings | |
| S16 Is built-in filtering enough for App Review 1.2 on the friends-only build | Yes, and the notes claim nothing more | |
| S17 Does the live `styling_recommendations` match the guide | Use the guide's definition; the lead compares columns read-only in step 1 | The file does nothing on the live project |
| R2 Adult confirmation for ratings | On | |
| R3 Will aggregates ever be shared outside the app | No; the page says so | A yes changes the page and the label first |
| R4 Starting threshold | 10 | |
| R5 Does the project enforce email confirmation | Unknown | Blocks `BRAND_INSIGHTS_ENABLED` |
| R6 120 real tags and a second checker | Not supplied | `TAG_SCAN_ENABLED` stays off |
| R7 Text model step (Phase 4) | No-go; stream 8 not built | |
| R10 Counsel review of brand-level ratings | Required before Phase 3 | `BRAND_INSIGHTS_ENABLED` stays off |
| R11 Rating survives the item | No: it is deleted with it | |
| R12 Migration ranges | Settled: section 2, decision 1 | |
| R13 The 31 seeded brand aliases | Ship as written; review before Phase 3 | |

## 7. What was reconciled

Conflicts found between the two documents, or between them and the repository, and how each was settled. The edits are in the two documents.

| # | Conflict | Resolution |
| --- | --- | --- |
| 1 | Migration ranges disagreed: swap said ratings used `20261016...`; ratings used `20261016...` itself and still quoted swap as `20261014000000` to `20261014000600` (4.1, 4.9, 10.2, question 12) | Ratings `20261014000000` to `...399`, swap `20261015000000` to `...500`, in both documents and in every file name, comment, shell loop and test text. The push-order narrative flipped: ratings files sort first, both are pushed together |
| 2 | Ratings 4.9 said swap carried `20261014000600_drop_legacy_friend_wardrobe_policy.sql` in `supabase/migrations/`; swap had since moved it to `supabase/held/` | Statement replaced by the single-copy rule |
| 3 | The policy-drop file had two owners ("whichever feature adds it first") and two different texts | Q0 only; swap's Appendix A entry is a pointer; SW1 neither creates nor edits it |
| 4 | Swap's `swapMigrations.test.ts` and `migrationVersions.test.ts` failed when a held file entered the migrations folder in any form, but ratings requires releasing the drop before Phase 1 and swap's own gate G0 and privacy test release the bucket file. Ratings' "later than every other file" clause could not stay true once alias or term-list migrations exist. The swap range check used the date prefix | Tests accept exactly one copy, held or in release form `<14 digits>_<name>.sql`; ranges checked numerically; the ratings clause became "above `20261013000000` and shaped like a release". Each case was run (release, second copy, unversioned copy, stray file in a range, duplicate version, later alias migration) |
| 5 | `migrationVersions.test.ts` was owned by SW1 (wave 2) but guards both features | Q0 (wave 1) |
| 6 | Both documents said `BACKUP_VERSION` is bumped by "whichever lands first"; swap's diff assumed ratings first, while the plan puts SW0 in wave 1 | SW0 bumps. Appendix C diff regenerated against today's file (applied cleanly); ratings 5.9 gives pass A its landmarks; the export test now requires `'1.1'` |
| 7 | `docs/privacy.html`, `PrivacyInfo.xcprivacy` and `Info.plist` had two owners (S7, ratings stream 9); the swap diff and the combined-wording table disagreed on the wardrobe row, the Google bullet, the deletion bullet ("immediately" against "overwritten on their normal schedule") and the children's line | POL only. The diff now carries the combined wording; section order and the example date are stated |
| 8 | The "visible only to you" sentence for scanned tag text is true only after the legacy policy drop, but the page is published once, before the drop | The sentence follows the drop's state on the publish day (fallback by default); the page is re-edited when the drop is released; the ratings policy test checks the matching sentence |
| 9 | Ratings question 9 inverted which privacy-label type swap adds; `PurchaseHistory` was "if the owner agrees" | Corrected; default: declare both; swap's manifest diff, test (at least 8 types) and App Store Connect note updated; the manifest diff passes `plutil -lint` |
| 10 | Two manifest tests and two page tests for the same files, in two documents | POL writes all four together; neither pins a type count or the other feature's superseded text |
| 11 | Settings: ratings named two strings (delete alert and Danger Zone note); swap's diff changed only the alert; swap's diff context also assumed a fragment ratings did not mention | Both passes edit both strings; swap diff gained the Danger Zone hunk (applied to a simulation of pass A); ratings 6.3 says the block becomes a fragment |
| 12 | `keyboardScreens.test.tsx`: both append, ratings alone adds `doneId` | Pass A first, pass B appends |
| 13 | Not between documents: the swap thread screen would show a composer `KeyboardDoneBar` and open `SwapSafetySheet` (another bar, same id), the hazard ratings 6.2 describes for the item screen | Composer gets its own id; test and device check updated |
| 14 | Different stream numbering (0 to 10, S0 to S7, "Lead") | Section 1 names; both tables rewritten with waves; stream 8 not built (its test dropped, the consent-gate test independent of the route, no OpenAI tag text on the page, no sealed tag set or `_shape.json`) |
| 15 | `supabase/audit.sql` was edited by ratings only, but its "no policies" check would flag swap's policy-less tables if anyone added them | Q1 only; written as a rule in both documents |
| 16 | Same-wave dependencies the old merge order hid (Q6 on Q1's SQL, Q4 on Q3, SW6 on SW4, SW2 on SW1) | Section 3.1 |
| 17 | Swap's gate order (policy before database) against the lead's order (migrations, page, functions, build) | The lead's order, with a note in swap 11.1; the G2 file list is now nine files |
| 18 | Swap's SW1 "first task" needs `supabase start` | Not possible here: scratch PostgreSQL 16 plus a stub; real-stack checks go to the lead |
| 19 | Ratings' `local_stub.sql` called a five-column `get_friend_closet()` "as on the live project" (the repository's migration `20261006000000` returns sixteen columns and checks blocks) | Wording corrected; the combined run used the repository's function |
| 20 | Swap's expectation that the ratings consents file goes "before swaps" | Dropped: swaps do not use it |

Repository spot checks, all as the documents say: `friend_requests` (migration 007), `user_blocks`, `content_reports` and its two inline `CHECK`s (so the constraint names `content_reports_context_check` and `content_reports_reason_check` that swap drops and re-adds are the auto-generated ones), `report_user`, `block_user`, `is_blocked_between`, `friend_display_name` (all in `20261006000000`), `delete_user_account()` including its use of `styling_recommendations` (from `20261002000000`, with no migration creating the table), `get_friend_closet`, the `ClothingItem` fields `size`, `condition`, `careInstructions`, `originCountry`, `tagText` and their mapping in `storage.ts` (`tagText: ''` clears), `KeyboardSafe.tsx` exports (`KEYBOARD_DONE_ID`, `keyboardDoneProps`, `singleLineDoneProps`, `KeyboardDoneBar`, `KeyboardActionBar`, `KeyboardSafeScrollView`, `KeyboardSafeView`; `KeyboardLift` is its own file), `src/utils/brandNames.ts` (`canonicalBrand`, `brandFromText`), `imageStorage.ts` (private `uploadToCloud` names photos `<user id>/<timestamp>.jpg` with type `image/jpeg`; exported `copyImageToPermanentStorage`, `removeCloudImages`), `imageUrls.ts`, the route audit's parser (the specs' `navigate` forms pass it), commits `ec5956c` and `6334a73`, the 6 data types now in the manifest, `Badge` tones, `LoadError` in `src/components`. Nothing in either spec contradicts the repository.

## 8. Checks the lead still owes

- B's diffs for `App.tsx`, the item screen and Settings: `patch --dry-run` against the real tree after pass A.
- The real-stack checks of `swap.md` section 10, SW1 items (1) to (6).
- Spike 0 (a live Vision call) and the owner's tag photographs, before `TAG_SCAN_ENABLED`.
- The physical-phone keyboard checks: `quality-ratings.md` 9.4 item 6 and the thread composer (`swap.md` 9.5).
- Where `docs/MODERATION.md` lives. The path is the plan's (POL writes it there), but `docs/` is what GitHub Pages serves (`privacy.html` is published from it, and there is no Pages workflow in `.github/workflows`, so Pages is set up in the repository's settings, which could not be read from here). If Pages serves the folder as it is, the runbook (admin function names, the Vault secret name, how the filter works) becomes a public page. The file holds no secret, but if the lead would rather not publish it, `documentation/MODERATION.md` is the alternative; only the path in `swap.md` 10, 11.4 and this file changes.
- Everything in section 5 and every answer in section 6 that is not the default.
