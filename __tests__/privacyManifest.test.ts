/**
 * The privacy manifest and the privacy page as the clothing swaps need them. The page and the manifest
 * are shared with the ratings feature (one edit, one publish, owner: POL); the ratings side is in
 * __tests__/docs/privacyPolicy.test.ts and __tests__/config/privacyManifest.test.ts, and none of these
 * files asserts text the other feature replaced.
 */
import fs from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');
const plist = fs.readFileSync(path.join(root, 'ios', 'smartcloset', 'PrivacyInfo.xcprivacy'), 'utf8');
const html = fs.readFileSync(path.join(root, 'docs', 'privacy.html'), 'utf8');
const swapRules = fs.readFileSync(path.join(root, 'src', 'config', 'swapRules.ts'), 'utf8');
const text = html.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
// The held file moves into supabase/migrations (with a release-day version) when gate G0 passes.
const bucketIsPrivate = fs.readdirSync(path.join(root, 'supabase', 'migrations')).some(f => /_wardrobe_images_private\.sql$/.test(f));

const collected = [...plist.matchAll(/<dict>\s*<key>NSPrivacyCollectedDataType<\/key>\s*<string>(\w+)<\/string>\s*<key>NSPrivacyCollectedDataTypeLinked<\/key>\s*<(true|false)\/>\s*<key>NSPrivacyCollectedDataTypeTracking<\/key>\s*<(true|false)\/>/g)]
  .map(m => ({ type: m[1], linked: m[2] === 'true', tracking: m[3] === 'true' }));

describe('privacy manifest and policy for swaps', () => {
  it('declares swap messages as collected data, linked, and not for tracking', () => {
    expect(collected.find(c => c.type === 'NSPrivacyCollectedDataTypeEmailsOrTextMessages')).toEqual({
      type: 'NSPrivacyCollectedDataTypeEmailsOrTextMessages', linked: true, tracking: false,
    });
  });

  it('declares purchase history too: the app stores the prices people paid', () => {
    expect(collected.find(c => c.type === 'NSPrivacyCollectedDataTypePurchaseHistory')).toEqual({
      type: 'NSPrivacyCollectedDataTypePurchaseHistory', linked: true, tracking: false,
    });
  });

  it('still tracks nothing', () => {
    expect(collected.length).toBeGreaterThanOrEqual(8);
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
      expect(text).toContain(phrase);
    }
  });

  it('says the photo link lifetime the app really uses', () => {
    const seconds = Number(swapRules.match(/SWAP_PHOTO_TTL_SECONDS\s*=\s*(\d+)/)?.[1]);
    expect(seconds).toBe(600); // if this changes, change "ten minutes" on the page in the same edit
  });

  it('keeps the community tier conditional, so the page is true while it is switched off', () => {
    expect(text).toMatch(/if community swaps are open and you have joined/);
    expect(text).toMatch(/community swaps\) are opened separately and may not be available yet/);
  });

  it('tells people about the community photo check, and that friends-only photos never leave', () => {
    expect(text).toContain('even if you turned off AI photo analysis');
    expect(text).toContain('Photos you list for friends only are never sent to Google');
  });

  it('no longer says photos are only available to you and friends', () => {
    expect(html).not.toMatch(/only available to you and to friends you have accepted\.(?! )/);
  });

  // The original photos sit in wardrobe-images, which is flagged public on the live project until
  // supabase/held/wardrobe_images_private.sql has been released (gate G0). The page may call any photo
  // storage private only after that, so it uses no such wording at all for the original photos or the
  // swap copies (the separate swap-photos area really is private, but the page does not need to say so).
  it('does not call photo storage "private" before the bucket has been made private', () => {
    if (!bucketIsPrivate) {
      expect(text).not.toMatch(/private (storage|area|bucket|folder)/i);
      expect(text).not.toMatch(/temporary, expiring links/i);
    }
  });
});
