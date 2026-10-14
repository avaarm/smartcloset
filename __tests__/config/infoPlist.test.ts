/**
 * The permission prompts in Info.plist are shown to people by iOS and read by App Review. They must say
 * what the app does with the camera and the photo library (including clothing tags, quality-ratings.md 8.3),
 * and a new permission must not arrive without the privacy page and manifest being looked at.
 */
import fs from 'fs';
import path from 'path';

const plist = fs.readFileSync(path.join(__dirname, '..', '..', 'ios', 'smartcloset', 'Info.plist'), 'utf8');

const usage: Record<string, string> = {};
for (const m of plist.matchAll(/<key>(NS\w+UsageDescription)<\/key>\s*<string>([^<]*)<\/string>/g)) usage[m[1]] = m[2];

describe('Info.plist', () => {
  it('is balanced XML with the standard plist header', () => {
    expect(plist.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    for (const tag of ['dict', 'array']) {
      expect((plist.match(new RegExp(`<${tag}>`, 'g')) ?? []).length).toBe((plist.match(new RegExp(`</${tag}>`, 'g')) ?? []).length);
    }
    expect((plist.match(/<key>/g) ?? []).length).toBe((plist.match(/<\/key>/g) ?? []).length);
  });

  it('says the camera also photographs care labels', () => {
    expect(usage.NSCameraUsageDescription).toBe('SmartCloset uses your camera to photograph clothing items and their care labels, and add them to your wardrobe.');
  });

  it('says the photo library also supplies care-label photos', () => {
    expect(usage.NSPhotoLibraryUsageDescription).toBe('SmartCloset accesses your photo library so you can add clothing images and care-label photos to your wardrobe.');
  });

  it('leaves the other prompts as they were', () => {
    expect(usage.NSLocationWhenInUseUsageDescription).toBe('SmartCloset uses your location to provide weather-appropriate outfit suggestions.');
    expect(usage.NSPhotoLibraryAddUsageDescription).toBe('SmartCloset only saves a photo to your library if you ask it to.');
  });

  it('asks for no permission the privacy page does not explain', () => {
    // Camera, photo library (read and add) and approximate location are described on docs/privacy.html.
    // A new key here (contacts, microphone, tracking, notifications text...) needs the page, the manifest and
    // the App Store label reviewed first; add it to this list when that is done.
    expect(Object.keys(usage).sort()).toEqual([
      'NSCameraUsageDescription',
      'NSLocationWhenInUseUsageDescription',
      'NSPhotoLibraryAddUsageDescription',
      'NSPhotoLibraryUsageDescription',
    ]);
    expect(plist).not.toContain('NSUserTrackingUsageDescription');
  });

  it('gives every prompt a sentence a person can read', () => {
    for (const [key, value] of Object.entries(usage)) {
      expect(`${key}: ${value.trim().length > 20}`).toBe(`${key}: true`);
      expect(value.endsWith('.')).toBe(true);
    }
  });
});
