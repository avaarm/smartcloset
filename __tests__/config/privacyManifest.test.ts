/**
 * The iOS privacy manifest as a whole: shape, tracking and purposes, and the data types the quality
 * ratings feature depends on. Swap's own additions (messages, purchase history) are asserted in
 * __tests__/privacyManifest.test.ts. Neither file pins how many data types there are, so a later
 * feature can add one without editing a test, as long as it uses a name Apple knows.
 */
import fs from 'fs';
import path from 'path';

const plist = fs.readFileSync(path.join(__dirname, '..', '..', 'ios', 'smartcloset', 'PrivacyInfo.xcprivacy'), 'utf8');

// Apple's identifiers for NSPrivacyCollectedDataType. A misspelt one is not an error in Xcode; the label
// just silently lacks the type. Add a name here when a new type is declared on purpose.
const APPLE_TYPES = [
  'Name', 'EmailAddress', 'PhoneNumber', 'PhysicalAddress', 'OtherUserContactInfo', 'Health', 'Fitness',
  'PaymentInfo', 'CreditInfo', 'OtherFinancialInfo', 'PreciseLocation', 'CoarseLocation', 'SensitiveInfo',
  'Contacts', 'EmailsOrTextMessages', 'PhotosorVideos', 'AudioData', 'GameplayContent', 'CustomerSupport',
  'OtherUserContent', 'BrowsingHistory', 'SearchHistory', 'UserID', 'DeviceID', 'PurchaseHistory',
  'ProductInteraction', 'AdvertisingData', 'OtherUsageData', 'CrashData', 'PerformanceData',
  'OtherDiagnosticData', 'EnvironmentScanning', 'Hands', 'Head', 'OtherDataTypes',
].map(n => `NSPrivacyCollectedDataType${n}`);

const section = plist.split('<key>NSPrivacyCollectedDataTypes</key>')[1]?.split('<key>NSPrivacyTracking</key>')[0] ?? '';
const entries = [...section.matchAll(/<dict>([\s\S]*?)<\/dict>/g)].map(m => {
  const body = m[1];
  return {
    type: body.match(/<key>NSPrivacyCollectedDataType<\/key>\s*<string>(\w+)<\/string>/)?.[1],
    linked: body.match(/<key>NSPrivacyCollectedDataTypeLinked<\/key>\s*<(true|false)\/>/)?.[1],
    tracking: body.match(/<key>NSPrivacyCollectedDataTypeTracking<\/key>\s*<(true|false)\/>/)?.[1],
    purposes: [...(body.match(/<key>NSPrivacyCollectedDataTypePurposes<\/key>\s*<array>([\s\S]*?)<\/array>/)?.[1] ?? '').matchAll(/<string>(\w+)<\/string>/g)].map(p => p[1]),
  };
});

describe('PrivacyInfo.xcprivacy', () => {
  it('is balanced XML with the standard plist header', () => {
    expect(plist.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(plist).toContain('<plist version="1.0">');
    for (const tag of ['dict', 'array']) {
      expect((plist.match(new RegExp(`<${tag}>`, 'g')) ?? []).length).toBe((plist.match(new RegExp(`</${tag}>`, 'g')) ?? []).length);
    }
    const keys = (plist.match(/<key>/g) ?? []).length;
    expect(keys).toBe((plist.match(/<\/key>/g) ?? []).length);
  });

  it('does not track anyone', () => {
    expect(plist).toMatch(/<key>NSPrivacyTracking<\/key>\s*<false\/>/);
    expect(plist).not.toContain('NSPrivacyTrackingDomains');
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) expect(e.tracking).toBe('false');
  });

  it('declares every collected type once, with a name Apple knows, a linked flag and a purpose', () => {
    const types = entries.map(e => e.type);
    expect(types.every(Boolean)).toBe(true);
    expect(new Set(types).size).toBe(types.length);
    for (const e of entries) {
      expect(APPLE_TYPES).toContain(e.type);
      expect(['true', 'false']).toContain(e.linked);
      expect(e.purposes.length).toBeGreaterThan(0);
    }
  });

  it('uses the data only to run the app: no analytics, advertising or personalisation purpose', () => {
    // Ratings are never used for the developer's own analysis (quality-ratings.md 8.3). If that ever changes,
    // the privacy page and the App Store label change first and this test with them.
    for (const e of entries) expect(e.purposes).toEqual(['NSPrivacyCollectedDataTypePurposeAppFunctionality']);
  });

  it('declares what quality ratings and tag scans rely on, as linked data that is not tracked', () => {
    for (const t of ['NSPrivacyCollectedDataTypeOtherUserContent', 'NSPrivacyCollectedDataTypePhotosorVideos', 'NSPrivacyCollectedDataTypeUserID']) {
      const e = entries.find(x => x.type === t);
      expect(e).toBeDefined();
      expect(e!.linked).toBe('true');
      expect(e!.tracking).toBe('false');
    }
  });

  it('keeps the required-reason API declarations', () => {
    for (const category of ['UserDefaults', 'FileTimestamp', 'SystemBootTime', 'DiskSpace']) {
      expect(plist).toContain(`NSPrivacyAccessedAPICategory${category}`);
    }
  });
});
