import 'react-native';
import React from 'react';
import { AccessibilityInfo, InteractionManager, Pressable, TextInput } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import type { TagReadResult } from '../../src/types/tag';
import { parseTagText } from '../../src/utils/tagParser';

const mockFlags = { on: true };
jest.mock('../../src/config/ratingFlags', () => ({
  tagScanActive: () => mockFlags.on,
  ratingsActive: () => false,
  brandInsightsActive: () => false,
  TAG_SCAN_ENABLED: false,
  TAG_MODEL_FALLBACK_ENABLED: false,
  TAG_OCR_FEATURE: 'TEXT_DETECTION',
}));

const mockGetSession = jest.fn();
const mockRpc = jest.fn();
const mockFrom = jest.fn();
jest.mock('../../src/config/supabase', () => ({
  supabase: {
    auth: { getSession: (...a: unknown[]) => mockGetSession(...a) },
    rpc: (...a: unknown[]) => mockRpc(...a),
    from: (...a: unknown[]) => mockFrom(...a),
  },
}));

const mockEnsureConsent = jest.fn();
jest.mock('../../src/services/aiConsent', () => ({
  ensureAiConsent: (...a: unknown[]) => mockEnsureConsent(...a),
  AI_CONSENT_ERROR: 'ai_consent_required',
}));

const mockGetAuthUserId = jest.fn();
jest.mock('../../src/services/authUser', () => ({
  getAuthUserId: (...a: unknown[]) => mockGetAuthUserId(...a),
}));

const mockPick = jest.fn();
const mockReadTag = jest.fn();
jest.mock('../../src/services/tagReader', () => ({
  MAX_TAG_PHOTOS: 3,
  pickTagPhoto: (...a: unknown[]) => mockPick(...a),
  readTag: (...a: unknown[]) => mockReadTag(...a),
}));

const mockDiscard = jest.fn();
jest.mock('../../src/platform/fileSystem', () => ({
  discardTempImage: (...a: unknown[]) => mockDiscard(...a),
  readImageAsBase64: jest.fn(),
}));

import ScanTagButton, {
  applyTagRead,
  CAMERA_DENIED_NOTICE,
  GUEST_SCAN_MESSAGE,
  SCAN_HELPER,
  ScanTagLink,
  type TagCurrentValues,
  type TagTicks,
} from '../../src/components/ScanTagButton';
import { FAILURE_MESSAGES } from '../../src/components/TagReviewSheet';

const CLEAN = parseTagText('100% COTTON\nMADE IN BANGLADESH\nMACHINE WASH COLD\nTUMBLE DRY LOW\nSIZE M');
const AMBER = parseTagText('55% COTTON 40% POLYESTER');
const SIDE = parseTagText('MADE IN ITALY\nSIZE 40');

const EMPTY: TagCurrentValues = { materials: [], size: '', brand: '', originCountry: '', careInstructions: [] };
const ALL: TagTicks = { fabric: true, care: true, origin: true, size: true, brand: true };
const NONE: TagTicks = { fabric: false, care: false, origin: false, size: false, brand: false };

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};

describe('applyTagRead', () => {
  it('fills the form with what is ticked and nothing else', () => {
    const choice = applyTagRead(CLEAN, { ...NONE, origin: true, size: true }, EMPTY, { replaceMaterials: false });
    expect(choice).toEqual({ originCountry: 'Bangladesh', size: 'M', tagText: CLEAN.transcription });
    expect(Object.keys(applyTagRead(CLEAN, NONE, EMPTY, { replaceMaterials: false }))).toEqual(['tagText']);
  });

  it('fills materials when the form has none, or one entry without a percentage', () => {
    const fabric = { ...NONE, fabric: true };
    const expected = [{ name: 'cotton', tier: 'primary', percentage: 100 }];
    expect(applyTagRead(CLEAN, fabric, EMPTY, { replaceMaterials: false }).materials).toEqual(expected);
    const seeded = { ...EMPTY, materials: [{ name: 'wool', tier: 'primary' as const }] };
    expect(applyTagRead(CLEAN, fabric, seeded, { replaceMaterials: false }).materials).toEqual(expected);
  });

  it('keeps materials the person filled in unless they chose Replace', () => {
    const fabric = { ...NONE, fabric: true };
    const typed = { ...EMPTY, materials: [{ name: 'wool', percentage: 100, tier: 'primary' as const }] };
    expect(applyTagRead(CLEAN, fabric, typed, { replaceMaterials: false }).materials).toBeUndefined();
    expect(applyTagRead(CLEAN, fabric, typed, { replaceMaterials: true }).materials).toEqual([
      { name: 'cotton', tier: 'primary', percentage: 100 },
    ]);
    const two = { ...EMPTY, materials: [{ name: 'wool', tier: 'primary' as const }, { name: 'silk', tier: 'lining' as const }] };
    expect(applyTagRead(CLEAN, fabric, two, { replaceMaterials: false }).materials).toBeUndefined();
  });

  it('rounds each group to whole numbers that add up to exactly 100 (largest remainder)', () => {
    const decimal = parseTagText('97,5% Baumwolle\n2,5% Elastan');
    const choice = applyTagRead(decimal, { ...NONE, fabric: true }, EMPTY, { replaceMaterials: false });
    expect(choice.materials).toEqual([
      { name: 'cotton', tier: 'primary', percentage: 98 },
      { name: 'elastane', tier: 'primary', percentage: 2 },
    ]);
    const three = parseTagText('33,4% COTTON\n33,3% POLYESTER\n33,3% VISCOSE');
    const parts = applyTagRead(three, { ...NONE, fabric: true }, EMPTY, { replaceMaterials: false }).materials!;
    expect(parts.map(m => m.percentage)).toEqual([34, 33, 33]);
    expect(parts.reduce((n, m) => n + (m.percentage ?? 0), 0)).toBe(100);
  });

  it('puts each part on its tier', () => {
    const down = parseTagText('SHELL: 100% NYLON\nLINING: 100% POLYESTER\nFILL: 80% DOWN 20% FEATHERS');
    const materials = applyTagRead(down, { ...NONE, fabric: true }, EMPTY, { replaceMaterials: false }).materials!;
    expect(materials.map(m => [m.name, m.tier, m.percentage])).toEqual([
      ['nylon', 'primary', 100],
      ['polyester', 'lining', 100],
      ['down', 'fill', 80],
      ['feathers', 'fill', 20],
    ]);
  });

  it('uses a Check fabric row once it is ticked, but never a disabled one', () => {
    const fabric = { ...NONE, fabric: true };
    expect(applyTagRead(AMBER, fabric, EMPTY, { replaceMaterials: false }).materials).toHaveLength(2);
    const set = parseTagText('TOP: 100% COTTON\nBOTTOM: 100% POLYESTER');
    expect(applyTagRead(set, fabric, EMPTY, { replaceMaterials: true }).materials).toBeUndefined();
    const partial = { ...CLEAN, flags: ['partial' as const] };
    expect(applyTagRead(partial, fabric, EMPTY, { replaceMaterials: true }).materials).toBeUndefined();
    const scrambled = parseTagText('70% COTTON 20% POLYESTER 5% NYLON 4% SILK');
    expect(applyTagRead(scrambled, fabric, EMPTY, { replaceMaterials: true }).materials).toBeUndefined();
  });

  it('fills Size only into an empty Size field', () => {
    expect(applyTagRead(CLEAN, ALL, EMPTY, { replaceMaterials: false }).size).toBe('M');
    expect(applyTagRead(CLEAN, ALL, { ...EMPTY, size: 'L' }, { replaceMaterials: false }).size).toBeUndefined();
    expect(applyTagRead(CLEAN, ALL, { ...EMPTY, size: '   ' }, { replaceMaterials: false }).size).toBe('M');
  });

  it('offers a brand only from the neck label at 0.8 or more, and only into an empty Brand field', () => {
    const everlane = parseTagText('EVERLANE\n100% COTTON');
    expect(applyTagRead(everlane, ALL, EMPTY, { replaceMaterials: false }).brand).toBe('Everlane');
    expect(applyTagRead(everlane, ALL, { ...EMPTY, brand: 'Zara' }, { replaceMaterials: false }).brand).toBeUndefined();
    expect(applyTagRead(everlane, { ...ALL, brand: false }, EMPTY, { replaceMaterials: false }).brand).toBeUndefined();
    const weak = { ...everlane, brand: { ...everlane.brand, confidence: 0.79 } };
    expect(applyTagRead(weak, ALL, EMPTY, { replaceMaterials: false }).brand).toBeUndefined();
    const careTag = { ...everlane, brand: { ...everlane.brand, whereSeen: 'care_tag' as const } };
    expect(applyTagRead(careTag, ALL, EMPTY, { replaceMaterials: false }).brand).toBeUndefined();
    expect(applyTagRead(CLEAN, ALL, EMPTY, { replaceMaterials: false }).brand).toBeUndefined();
  });

  it('merges care into the list without repeats, at most 20 lines of 80 characters', () => {
    const merged = applyTagRead(CLEAN, ALL, { ...EMPTY, careInstructions: ['Hand wash', 'machine wash cold'] }, { replaceMaterials: false });
    expect(merged.careInstructions).toEqual(['Hand wash', 'machine wash cold', 'Tumble dry low']);

    const long = Array.from({ length: 19 }, (_, i) => `Line ${i}`);
    const capped = applyTagRead(CLEAN, ALL, { ...EMPTY, careInstructions: long }, { replaceMaterials: false });
    expect(capped.careInstructions).toHaveLength(20);

    const wide = applyTagRead(CLEAN, ALL, { ...EMPTY, careInstructions: ['x'.repeat(120)] }, { replaceMaterials: false });
    expect(wide.careInstructions![0]).toHaveLength(80);
  });

  it('fills Made in when ticked, over a country that was there', () => {
    expect(applyTagRead(CLEAN, ALL, { ...EMPTY, originCountry: 'Peru' }, { replaceMaterials: false }).originCountry).toBe('Bangladesh');
    expect(applyTagRead(CLEAN, { ...ALL, origin: false }, EMPTY, { replaceMaterials: false }).originCountry).toBeUndefined();
    expect(applyTagRead(SIDE, ALL, EMPTY, { replaceMaterials: false })).toMatchObject({ originCountry: 'Italy', size: '40' });
  });

  it('always replaces the stored tag text with the latest transcription', () => {
    expect(applyTagRead(CLEAN, NONE, EMPTY, { replaceMaterials: false }).tagText).toBe(CLEAN.transcription);
    expect(applyTagRead(SIDE, ALL, EMPTY, { replaceMaterials: false }).tagText).toBe(SIDE.transcription);
  });
});

// ─── The button ─────────────────────────────────────────────────────────────

type Props = React.ComponentProps<typeof ScanTagButton>;

const mount = async (over: Partial<Props> = {}) => {
  const onApply = jest.fn();
  const props: Props = { onApply, current: EMPTY, category: 'tops', ...over };
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<ScanTagButton {...props} />);
  });
  const text = () => flatten(tree.toJSON());
  const byLabel = (label: string) => tree.root.findAllByType(Pressable).filter(n => n.props.accessibilityLabel === label);
  const press = async (label: string) => {
    const found = byLabel(label);
    if (found.length !== 1) throw new Error(`expected one "${label}", found ${found.length}`);
    await act(async () => {
      await found[0].props.onPress();
    });
  };
  const rerender = async (next: Partial<Props>) => {
    Object.assign(props, next);
    await act(async () => {
      tree.update(<ScanTagButton {...props} />);
    });
  };
  return { tree, props, onApply, text, byLabel, press, rerender };
};

const ok = (read: ReturnType<typeof parseTagText>): TagReadResult => ({ ok: true, read });

let errorSpy: jest.SpyInstance;

beforeEach(() => {
  mockFlags.on = true;
  mockGetSession.mockReset().mockResolvedValue({ data: { session: null } });
  mockRpc.mockReset();
  mockFrom.mockReset();
  mockEnsureConsent.mockReset().mockResolvedValue(true);
  mockGetAuthUserId.mockReset().mockResolvedValue('user-1');
  mockPick.mockReset().mockResolvedValue({ status: 'ok', uri: 'file:///cache/one.jpg' });
  mockReadTag.mockReset().mockResolvedValue(ok(CLEAN));
  mockDiscard.mockReset().mockResolvedValue(undefined);
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  // The screen's slide-in is over by the time a test looks.
  jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation(((task: () => void) => {
    task();
    return { then: jest.fn(), done: jest.fn(), cancel: jest.fn() };
  }) as never);
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  // Nothing in a scan, finished or abandoned, may log an error (a late state update would show up here).
  expect(errorSpy).not.toHaveBeenCalled();
  jest.restoreAllMocks();
});

describe('ScanTagButton: the button', () => {
  it('shows Scan tag with its helper line', async () => {
    const { text, byLabel } = await mount();
    expect(text()).toContain('Scan tag');
    expect(text()).toContain(SCAN_HELPER);
    expect(SCAN_HELPER).toBe('Fill in materials, care and country from the tag.');
    expect(byLabel('Scan tag')).toHaveLength(1);
  });

  it('is disabled for a guest, who is told to sign in, and asks for nothing', async () => {
    const { text, byLabel, press } = await mount({ guest: true });
    expect(text()).toContain(GUEST_SCAN_MESSAGE);
    expect(text()).not.toContain(SCAN_HELPER);
    expect(byLabel('Scan tag')[0].props.accessibilityState.disabled).toBe(true);
    await press('Scan tag');
    expect(mockEnsureConsent).not.toHaveBeenCalled();
    expect(text()).not.toContain('Take photo');
  });

  it('is disabled while the form says so', async () => {
    const { byLabel, press, text } = await mount({ disabled: true });
    expect(byLabel('Scan tag')[0].props.accessibilityState.disabled).toBe(true);
    await press('Scan tag');
    expect(mockEnsureConsent).not.toHaveBeenCalled();
    expect(text()).not.toContain('Take photo');
  });

  it('renders nothing and does nothing with the flag off, even for autoOpen', async () => {
    mockFlags.on = false;
    const { tree } = await mount({ autoOpen: true });
    expect(tree.toJSON()).toBeNull();
    expect(mockEnsureConsent).not.toHaveBeenCalled();
    expect(mockGetSession).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockGetAuthUserId).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe('ScanTagButton: the scan', () => {
  it('asks for the AI permission first, then coaches', async () => {
    const { press, text } = await mount();
    await press('Scan tag');
    expect(mockEnsureConsent).toHaveBeenCalledTimes(1);
    expect(mockEnsureConsent).toHaveBeenCalledWith();
    expect(text()).toContain('Flatten the tag, fill the frame');
    expect(text()).toContain('Take photo');
    expect(mockPick).not.toHaveBeenCalled();
  });

  it('stops with the consent message when the permission is declined', async () => {
    mockEnsureConsent.mockResolvedValue(false);
    const { press, text, byLabel } = await mount();
    await press('Scan tag');
    expect(text()).toContain(FAILURE_MESSAGES.consent);
    expect(byLabel('Take photo')).toHaveLength(0);
    await press('Type it instead');
    expect(text()).not.toContain(FAILURE_MESSAGES.consent);
  });

  it('treats an error from the permission step as a decline', async () => {
    mockEnsureConsent.mockRejectedValue(new Error('boom'));
    const { press, text } = await mount();
    await press('Scan tag');
    expect(text()).toContain(FAILURE_MESSAGES.consent);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('takes a photo, reads it, shows the rows, and hands the ticked ones to the form', async () => {
    const { tree, press, text, onApply } = await mount({ category: 'shoes' });
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
    await press('Scan tag');
    await press('Take photo');
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);

    expect(mockPick).toHaveBeenCalledWith('camera');
    expect(mockReadTag).toHaveBeenCalledTimes(1);
    expect(mockReadTag.mock.calls[0][0]).toEqual(['file:///cache/one.jpg']);
    expect(mockReadTag.mock.calls[0][1]).toMatchObject({ category: 'shoes' });
    expect(mockReadTag.mock.calls[0][1].prior).toBeUndefined();
    expect(text()).toContain('What the tag says');
    expect(text()).toContain('Bangladesh');

    await press('Use these');
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0][0]).toEqual({
      materials: [{ name: 'cotton', tier: 'primary', percentage: 100 }],
      careInstructions: ['Machine wash cold', 'Tumble dry low'],
      originCountry: 'Bangladesh',
      size: 'M',
      tagText: CLEAN.transcription,
    });
    expect(text()).not.toContain('What the tag says');
  });

  it('reads a library photo the same way', async () => {
    const { press, onApply } = await mount();
    await press('Scan tag');
    await press('Choose from library');
    expect(mockPick).toHaveBeenCalledWith('library');
    await press('Use these');
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it('hands over nothing when the person cancels', async () => {
    const { press, onApply, text } = await mount();
    await press('Scan tag');
    await press('Take photo');
    await press('Cancel');
    expect(onApply).not.toHaveBeenCalled();
    expect(text()).not.toContain('What the tag says');
  });

  it('goes back to the coaching when the camera is cancelled', async () => {
    mockPick.mockResolvedValue({ status: 'cancelled' });
    const { press, text } = await mount();
    await press('Scan tag');
    await press('Take photo');
    expect(mockReadTag).not.toHaveBeenCalled();
    expect(text()).toContain('Take photo');
    expect(text()).not.toContain('Reading the tag...');
  });

  it('says what to do when the camera is off or missing', async () => {
    mockPick.mockResolvedValue({ status: 'denied' });
    const { press, text } = await mount();
    await press('Scan tag');
    await press('Take photo');
    expect(text()).toContain(CAMERA_DENIED_NOTICE);
    mockPick.mockResolvedValue({ status: 'unavailable' });
    await press('Take photo');
    expect(text()).toContain('We couldn’t open the camera.');
    expect(mockReadTag).not.toHaveBeenCalled();
  });

  it('shows the failure with what was found, and lets the person retake or type', async () => {
    mockReadTag.mockResolvedValueOnce({ ok: false, reason: 'too_small', transcription: '100% C0TT0N' });
    const { press, text, onApply } = await mount();
    await press('Scan tag');
    await press('Take photo');
    expect(text()).toContain(FAILURE_MESSAGES.too_small);
    expect(text()).toContain('100% C0TT0N');

    mockReadTag.mockResolvedValueOnce(ok(CLEAN));
    await press('Take photo');
    expect(text()).toContain('What the tag says');
    await press('Use these');
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it('shows a general failure when the reading itself throws', async () => {
    mockReadTag.mockRejectedValueOnce(new Error('boom'));
    const { press, text } = await mount();
    await press('Scan tag');
    await press('Take photo');
    expect(text()).toContain(FAILURE_MESSAGES.failed);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('closes from Type it instead without applying anything', async () => {
    mockReadTag.mockResolvedValueOnce({ ok: false, reason: 'no_text' });
    const { press, text, onApply } = await mount();
    await press('Scan tag');
    await press('Take photo');
    await press('Type it instead');
    expect(onApply).not.toHaveBeenCalled();
    expect(text()).not.toContain(FAILURE_MESSAGES.no_text);
  });
});

describe('ScanTagButton: another side', () => {
  it('reads the next photo together with the earlier text, and stops after three photos', async () => {
    mockReadTag
      .mockResolvedValueOnce(ok(CLEAN))
      .mockResolvedValueOnce(ok(SIDE))
      .mockResolvedValueOnce(ok(parseTagText('EVERLANE\nSIZE 8')));
    const { press, byLabel, text } = await mount();
    await press('Scan tag');
    await press('Take photo');

    await press('Scan another side');
    expect(text()).toContain('Take photo');
    await press('Take photo');
    expect(mockReadTag.mock.calls[1][1].prior).toEqual({ text: CLEAN.transcription, photos: 1, lowLegibility: false });

    await press('Scan another side');
    await press('Choose from library');
    expect(mockReadTag.mock.calls[2][1].prior).toEqual({ text: SIDE.transcription, photos: 2, lowLegibility: false });
    expect(byLabel('Scan another side')).toHaveLength(0);
    expect(byLabel('Use these')).toHaveLength(1);
  });

  it('remembers a low-legibility read for the next photo', async () => {
    mockReadTag.mockResolvedValueOnce(ok(parseTagText('100% COTTON', { ocr: { meanConfidence: 0.2 } }))).mockResolvedValueOnce(ok(SIDE));
    const { press } = await mount();
    await press('Scan tag');
    await press('Take photo');
    await press('Scan another side');
    await press('Take photo');
    expect(mockReadTag.mock.calls[1][1].prior.lowLegibility).toBe(true);
  });

  it('keeps the earlier photos when the next one fails, and a retry merges them', async () => {
    mockReadTag
      .mockResolvedValueOnce(ok(CLEAN))
      .mockResolvedValueOnce({ ok: false, reason: 'no_text' })
      .mockResolvedValueOnce(ok(SIDE));
    const { press, text } = await mount();
    await press('Scan tag');
    await press('Take photo');
    await press('Scan another side');
    await press('Take photo');
    expect(text()).toContain(FAILURE_MESSAGES.no_text);
    await press('Take photo');
    expect(mockReadTag.mock.calls[2][1].prior).toMatchObject({ text: CLEAN.transcription, photos: 1 });
  });

  it('starts every new scan from nothing', async () => {
    mockReadTag.mockResolvedValue(ok(CLEAN));
    const { press } = await mount();
    await press('Scan tag');
    await press('Take photo');
    await press('Cancel');
    await press('Scan tag');
    await press('Take photo');
    expect(mockReadTag.mock.calls[1][1].prior).toBeUndefined();
  });
});

describe('ScanTagButton: getting back to the first read', () => {
  const firstThenAnother = async () => {
    const view = await mount();
    await view.press('Scan tag');
    await view.press('Take photo');
    await view.press('Scan another side');
    return view;
  };

  const expectFirstReadApplied = async (view: Awaited<ReturnType<typeof mount>>) => {
    expect(view.text()).toContain('What the tag says');
    expect(view.byLabel('Use these')).toHaveLength(1);
    expect(view.byLabel('Scan another side')).toHaveLength(1);
    await view.press('Use these');
    expect(view.onApply).toHaveBeenCalledTimes(1);
    const choice = view.onApply.mock.calls[0][0];
    expect(choice.originCountry).toBe('Bangladesh');
    expect(choice.tagText).toBe(CLEAN.transcription);
  };

  it('goes back to the first read after the next photo could not be read', async () => {
    mockReadTag.mockResolvedValueOnce(ok(CLEAN)).mockResolvedValueOnce({ ok: false, reason: 'no_text' });
    const view = await firstThenAnother();
    await view.press('Take photo');
    expect(view.text()).toContain(FAILURE_MESSAGES.no_text);
    expect(view.byLabel('Take photo')).toHaveLength(1);
    expect(view.byLabel('Choose from library')).toHaveLength(1);
    expect(view.byLabel('Back to results')).toHaveLength(1);
    expect(view.byLabel('Type it instead')).toHaveLength(1);
    await view.press('Back to results');
    expect(view.text()).not.toContain(FAILURE_MESSAGES.no_text);
    await expectFirstReadApplied(view);
  });

  it('goes back to the first read after the camera was cancelled on the next photo', async () => {
    const view = await firstThenAnother();
    mockPick.mockResolvedValueOnce({ status: 'cancelled' });
    await view.press('Take photo');
    expect(mockReadTag).toHaveBeenCalledTimes(1);
    expect(view.text()).toContain('Flatten the tag, fill the frame');
    expect(view.byLabel('Back to results')).toHaveLength(1);
    await view.press('Back to results');
    await expectFirstReadApplied(view);
  });

  it('goes back to the first read after the next reading threw', async () => {
    mockReadTag.mockResolvedValueOnce(ok(CLEAN)).mockRejectedValueOnce(new Error('boom'));
    const view = await firstThenAnother();
    await view.press('Take photo');
    expect(view.text()).toContain(FAILURE_MESSAGES.failed);
    await view.press('Back to results');
    await expectFirstReadApplied(view);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('goes back even when the failure is one a new photo cannot fix', async () => {
    mockReadTag.mockResolvedValueOnce(ok(CLEAN)).mockResolvedValueOnce({ ok: false, reason: 'daily_limit' });
    const view = await firstThenAnother();
    await view.press('Take photo');
    expect(view.text()).toContain(FAILURE_MESSAGES.daily_limit);
    expect(view.byLabel('Take photo')).toHaveLength(0);
    await view.press('Back to results');
    await expectFirstReadApplied(view);
  });

  it('shows the first photo’s words, not the merged text of the failed one', async () => {
    mockReadTag
      .mockResolvedValueOnce(ok(CLEAN))
      .mockResolvedValueOnce({ ok: false, reason: 'too_small', transcription: `${CLEAN.transcription}\nBLURRY MERGED WORDS` });
    const view = await firstThenAnother();
    await view.press('Take photo');
    expect(view.text()).toContain('BLURRY MERGED WORDS');
    await view.press('Back to results');
    await view.press('As read');
    expect(view.text()).toContain(CLEAN.transcription);
    expect(view.text()).not.toContain('BLURRY MERGED WORDS');
    await view.press('Use these');
    expect(view.onApply.mock.calls[0][0].tagText).toBe(CLEAN.transcription);
  });

  it('keeps counting from the first photo when another side is scanned after going back', async () => {
    mockReadTag
      .mockResolvedValueOnce(ok(CLEAN))
      .mockResolvedValueOnce({ ok: false, reason: 'no_text' })
      .mockResolvedValueOnce(ok(SIDE));
    const view = await firstThenAnother();
    await view.press('Take photo');
    await view.press('Back to results');
    await view.press('Scan another side');
    await view.press('Take photo');
    expect(mockReadTag.mock.calls[2][1].prior).toEqual({ text: CLEAN.transcription, photos: 1, lowLegibility: false });
    expect(view.text()).toContain('What the tag says');
  });

  it('has no way back before any photo was read', async () => {
    mockReadTag.mockResolvedValueOnce({ ok: false, reason: 'no_text' });
    const view = await mount();
    await view.press('Scan tag');
    expect(view.byLabel('Back to results')).toHaveLength(0);
    await view.press('Take photo');
    expect(view.text()).toContain(FAILURE_MESSAGES.no_text);
    expect(view.byLabel('Back to results')).toHaveLength(0);
  });

  it('has no way back in a new scan, nor when the permission is declined', async () => {
    mockReadTag.mockResolvedValue(ok(CLEAN));
    const view = await mount();
    await view.press('Scan tag');
    await view.press('Take photo');
    await view.press('Scan another side');
    expect(view.byLabel('Back to results')).toHaveLength(1);
    await view.press('Close');
    await view.press('Scan tag');
    expect(view.text()).toContain('Flatten the tag, fill the frame');
    expect(view.byLabel('Back to results')).toHaveLength(0);

    await view.press('Take photo');
    await view.press('Scan another side');
    await view.press('Close');
    mockEnsureConsent.mockResolvedValue(false);
    await view.press('Scan tag');
    expect(view.text()).toContain(FAILURE_MESSAGES.consent);
    expect(view.byLabel('Back to results')).toHaveLength(0);
  });
});

describe('ScanTagButton: timing', () => {
  it('shows the reading state while the reading runs, and ignores a second tap', async () => {
    let finish!: (r: TagReadResult) => void;
    mockReadTag.mockReturnValueOnce(new Promise<TagReadResult>(resolve => (finish = resolve)));
    const { press, text, byLabel } = await mount();
    await press('Scan tag');
    await act(async () => {
      byLabel('Take photo')[0].props.onPress();
    });
    expect(text()).toContain('Reading the tag...');
    expect(byLabel('Take photo')).toHaveLength(0);
    await act(async () => {
      finish(ok(CLEAN));
    });
    expect(text()).toContain('What the tag says');
    expect(mockPick).toHaveBeenCalledTimes(1);
  });

  it('shows the optional second step when the reader reports it', async () => {
    let report!: (phase: 'reading' | 'structuring') => void;
    let finish!: (r: TagReadResult) => void;
    mockReadTag.mockImplementationOnce((_uris: string[], opts: any) => {
      report = opts.onProgress;
      return new Promise<TagReadResult>(resolve => (finish = resolve));
    });
    const { press, text, byLabel } = await mount();
    await press('Scan tag');
    await act(async () => {
      byLabel('Take photo')[0].props.onPress();
    });
    await act(async () => {
      report('structuring');
    });
    expect(text()).toContain('Sorting out the fabric lines...');
    await act(async () => {
      finish(ok(CLEAN));
    });
  });

  it('drops an answer that arrives after the sheet was closed', async () => {
    let finish!: (r: TagReadResult) => void;
    mockReadTag.mockReturnValueOnce(new Promise<TagReadResult>(resolve => (finish = resolve)));
    const { press, text, byLabel, onApply } = await mount();
    await press('Scan tag');
    await act(async () => {
      byLabel('Take photo')[0].props.onPress();
    });
    await press('Cancel');
    await act(async () => {
      finish(ok(CLEAN));
    });
    expect(text()).not.toContain('What the tag says');
    expect(onApply).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('throws away a photo taken after the sheet was closed', async () => {
    let take!: (r: unknown) => void;
    mockPick.mockReturnValueOnce(new Promise(resolve => (take = resolve)));
    const { press, byLabel } = await mount();
    await press('Scan tag');
    await act(async () => {
      byLabel('Take photo')[0].props.onPress();
    });
    await press('Close');
    await act(async () => {
      take({ status: 'ok', uri: 'file:///cache/late.jpg' });
    });
    expect(mockReadTag).not.toHaveBeenCalled();
    expect(mockDiscard).toHaveBeenCalledWith('file:///cache/late.jpg');
  });

  it('sets nothing after it is gone', async () => {
    let finish!: (r: TagReadResult) => void;
    mockReadTag.mockReturnValueOnce(new Promise<TagReadResult>(resolve => (finish = resolve)));
    const { press, byLabel, tree } = await mount();
    await press('Scan tag');
    await act(async () => {
      byLabel('Take photo')[0].props.onPress();
    });
    await act(async () => {
      tree.unmount();
    });
    await act(async () => {
      finish(ok(CLEAN));
    });
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe('ScanTagButton: opening straight into the scan', () => {
  it('starts the scan once when asked to', async () => {
    const { text, rerender } = await mount({ autoOpen: true });
    expect(mockEnsureConsent).toHaveBeenCalledTimes(1);
    expect(text()).toContain('Take photo');
    await rerender({ current: { ...EMPTY, size: 'M' } });
    expect(mockEnsureConsent).toHaveBeenCalledTimes(1);
  });

  it('waits for the screen to finish sliding in, and gives up when it is gone first', async () => {
    const tasks: Array<() => void> = [];
    const cancel = jest.fn();
    (InteractionManager.runAfterInteractions as jest.Mock).mockImplementation((task: () => void) => {
      tasks.push(task);
      return { then: jest.fn(), done: jest.fn(), cancel };
    });
    const { tree, text } = await mount({ autoOpen: true });
    expect(mockEnsureConsent).not.toHaveBeenCalled();
    expect(text()).not.toContain('Take photo');
    await act(async () => {
      tasks[0]();
    });
    expect(mockEnsureConsent).toHaveBeenCalledTimes(1);
    expect(text()).toContain('Take photo');

    mockEnsureConsent.mockClear();
    const second = await mount({ autoOpen: true });
    await act(async () => {
      second.tree.unmount();
    });
    expect(cancel).toHaveBeenCalled();
    expect(mockEnsureConsent).not.toHaveBeenCalled();
    tree.unmount();
  });

  it('does not start for a guest or a disabled button', async () => {
    await mount({ autoOpen: true, guest: true });
    await mount({ autoOpen: true, disabled: true });
    expect(mockEnsureConsent).not.toHaveBeenCalled();
  });

  it('does not start without autoOpen', async () => {
    await mount();
    expect(mockEnsureConsent).not.toHaveBeenCalled();
  });
});

// ─── The link on Item Details ───────────────────────────────────────────────

describe('ScanTagLink', () => {
  const mountLink = async (hasTag: boolean) => {
    const onPress = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<ScanTagLink hasTag={hasTag} onPress={onPress} />);
    });
    return { tree, onPress, text: () => flatten(tree.toJSON()) };
  };

  it('offers to scan the tag, or to rescan it when there is one', async () => {
    expect((await mountLink(false)).text()).toBe('Scan the tag');
    expect((await mountLink(true)).text()).toBe('Rescan the tag');
  });

  it('opens the scan when pressed', async () => {
    const { tree, onPress } = await mountLink(false);
    const link = tree.root.findAllByType(Pressable).find(n => n.props.accessibilityLabel === 'Scan the tag')!;
    expect(link.props.accessibilityRole).toBe('link');
    await act(async () => {
      link.props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders nothing for a guest', async () => {
    mockGetAuthUserId.mockResolvedValue(null);
    expect((await mountLink(false)).tree.toJSON()).toBeNull();
  });

  it('renders nothing, and asks nothing, with the flag off', async () => {
    mockFlags.on = false;
    const { tree } = await mountLink(true);
    expect(tree.toJSON()).toBeNull();
    expect(mockGetAuthUserId).not.toHaveBeenCalled();
    expect(mockGetSession).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('shows nothing when the sign-in check fails, and sets nothing after it is gone', async () => {
    mockGetAuthUserId.mockRejectedValueOnce(new Error('boom'));
    expect((await mountLink(false)).tree.toJSON()).toBeNull();

    let resolve!: (id: string) => void;
    mockGetAuthUserId.mockReturnValueOnce(new Promise<string>(r => (resolve = r)));
    const { tree } = await mountLink(false);
    await act(async () => {
      tree.unmount();
    });
    await act(async () => {
      resolve('user-1');
    });
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
