/**
 * Professional accounts: a person can be a stylist, and/or the client of a stylist,
 * between two real people on two real phones (documentation/design/pro-accounts.md).
 *
 * This flag means "this build contains the feature and shows it". It is the build
 * switch; the server switch is `pro_enabled` in `pro_config` (seeded off), and both
 * must be on for anything to appear.
 *
 * While false:
 *  - Home has no Stylists cell and Settings has no Professional section,
 *  - the first-run "How will you use the app?" prompt is skipped,
 *  - the Stylist workspace tab set cannot be opened, and a device that last saved the
 *    stylist mode is returned to the personal mode on launch, so nobody is stranded
 *    in an unreachable one.
 *
 * While true, the stylist mode is honoured only while the server confirms an active
 * stylist role (AccountModeContext).
 *
 * It is flipped to true last, in one commit, after the migrations are applied, the
 * privacy page is published and the two-phone walkthrough has passed.
 */
export const PRO_MODES_ENABLED = true;
