/**
 * Stylist and Client modes (client lists, bookings, the stylist marketplace,
 * messaging) are a simulation: their data lives in AsyncStorage on this device,
 * nothing is shared between accounts, and there is no payment. Offering them as
 * real features would mislead people, so they stay off until a real backend
 * exists.
 *
 * While false:
 *  - the first-run "How will you use the app?" prompt is skipped,
 *  - Settings has no account-mode switcher,
 *  - a device that last saved the stylist or client mode is returned to the
 *    personal mode on launch, so nobody is stranded in an unreachable one.
 *
 * The stylist/client screens and navigators are still compiled in, but nothing
 * can open them.
 */
export const PRO_MODES_ENABLED = false;
