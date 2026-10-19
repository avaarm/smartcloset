import 'react-native';
import React, { useState } from 'react';
import { AccessibilityInfo, InteractionManager, Pressable, TextInput } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import type { MaterialComponent } from '../../src/types';
import type { TagReadResult } from '../../src/types/tag';
import { parseTagText } from '../../src/utils/tagParser';
import { CARE_PHRASES } from '../../src/utils/careNames';

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
jest.mock('../../src/config/supabase', () => ({
  supabase: {
    auth: { getSession: (...a: unknown[]) => mockGetSession(...a) },
    rpc: (...a: unknown[]) => mockRpc(...a),
  },
}));

const mockEnsureConsent = jest.fn();
jest.mock('../../src/services/aiConsent', () => ({
  ensureAiConsent: (...a: unknown[]) => mockEnsureConsent(...a),
  AI_CONSENT_ERROR: 'ai_consent_required',
}));

const mockPick = jest.fn();
const mockReadTag = jest.fn();
jest.mock('../../src/services/tagReader', () => ({
  MAX_TAG_PHOTOS: 3,
  pickTagPhoto: (...a: unknown[]) => mockPick(...a),
  readTag: (...a: unknown[]) => mockReadTag(...a),
}));
jest.mock('../../src/platform/fileSystem', () => ({
  discardTempImage: jest.fn(async () => undefined),
  readImageAsBase64: jest.fn(),
}));

import ScanTagSection, {
  CARE_EMPTY_NOTE,
  FILLED_NOTE,
  SCAN_FORM_CARD_AFTER,
  SCAN_FORM_CARD_BEFORE,
  SCAN_FORM_CARD_NOTHING,
  SCAN_FORM_CARD_TITLE,
  ScanTagFormCard,
  tagSummary,
  useTagFields,
  type TagFieldsApi,
} from '../../src/components/ScanTagSection';
import TagReviewSheet from '../../src/components/TagReviewSheet';

const CLEAN = parseTagText('100% COTTON\nMADE IN BANGLADESH\nMACHINE WASH COLD\nTUMBLE DRY LOW\nSIZE M');
const BRAND = parseTagText('EVERLANE\n100% COTTON');
const ok = (read: ReturnType<typeof parseTagText>): TagReadResult => ({ ok: true, read });

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};

let errorSpy: jest.SpyInstance;

beforeEach(() => {
  mockFlags.on = true;
  mockGetSession.mockReset().mockResolvedValue({ data: { session: null } });
  mockRpc.mockReset();
  mockEnsureConsent.mockReset().mockResolvedValue(true);
  mockPick.mockReset().mockResolvedValue({ status: 'ok', uri: 'file:///cache/one.jpg' });
  mockReadTag.mockReset().mockResolvedValue(ok(CLEAN));
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  // The screen's slide-in is over by the time a test looks.
  jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation(((task: () => void) => {
    task();
    return { then: jest.fn(), done: jest.fn(), cancel: jest.fn() };
  }) as never);
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  expect(errorSpy).not.toHaveBeenCalled();
  jest.restoreAllMocks();
});

// ─── useTagFields ───────────────────────────────────────────────────────────

type EditItem = Parameters<typeof useTagFields>[0];

const mountHook = async (editItem?: EditItem) => {
  const box: { api: TagFieldsApi; item: EditItem } = { api: undefined as unknown as TagFieldsApi, item: editItem };
  const Probe = ({ item }: { item: EditItem }) => {
    box.api = useTagFields(item);
    return null;
  };
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<Probe item={editItem} />);
  });
  const act2 = async (fn: (api: TagFieldsApi) => void) => {
    await act(async () => {
      fn(box.api);
    });
  };
  const update = async (item: EditItem) => {
    await act(async () => {
      tree.update(<Probe item={item} />);
    });
  };
  return { box, act: act2, update };
};

describe('useTagFields', () => {
  it('starts empty for a new item and sends nothing on save', async () => {
    const { box } = await mountHook();
    expect(box.api).toMatchObject({ careInstructions: [], originCountry: '', tagText: '', filledFromTag: false });
    expect(box.api.toItemFields()).toEqual({});
    expect(Object.keys(box.api.toItemFields())).toEqual([]);
  });

  it('starts from the stored item', async () => {
    const { box } = await mountHook({ careInstructions: ['Hand wash'], originCountry: ' Peru ', tagText: 'RN 12345' });
    expect(box.api).toMatchObject({ careInstructions: ['Hand wash'], originCountry: 'Peru', tagText: 'RN 12345', filledFromTag: false });
    expect(box.api.toItemFields()).toEqual({ careInstructions: ['Hand wash'], originCountry: 'Peru', tagText: 'RN 12345' });
  });

  it('sends the list, the trimmed country and the text when they have something', async () => {
    const { box, act: run } = await mountHook();
    await run(api => api.setCareInstructions(['Hand wash', 'Line dry']));
    await run(api => api.setOriginCountry('  Italy '));
    await run(api => api.setTagText('100% COTTON'));
    expect(box.api.toItemFields()).toEqual({ careInstructions: ['Hand wash', 'Line dry'], originCountry: 'Italy', tagText: '100% COTTON' });
  });

  it('clears with [] and "" only what was there when the item loaded', async () => {
    const { box, act: run } = await mountHook({ careInstructions: ['Hand wash'], originCountry: 'Peru', tagText: 'old' });
    await run(api => api.setCareInstructions([]));
    await run(api => api.setOriginCountry('   '));
    await run(api => api.setTagText(''));
    expect(box.api.toItemFields()).toEqual({ careInstructions: [], originCountry: '', tagText: '' });
  });

  it('leaves alone what was empty at load and still is', async () => {
    const { box, act: run } = await mountHook({ careInstructions: ['Hand wash'] });
    await run(api => api.setOriginCountry('Peru'));
    await run(api => api.setOriginCountry(''));
    await run(api => api.setTagText('x'));
    await run(api => api.setTagText(''));
    expect(box.api.toItemFields()).toEqual({ careInstructions: ['Hand wash'] });
  });

  it('takes the stored item once and ignores a later change of it', async () => {
    const { box, update } = await mountHook({ originCountry: 'Peru' });
    await update({ originCountry: 'Chile', careInstructions: ['Hand wash'] });
    expect(box.api.originCountry).toBe('Peru');
    expect(box.api.careInstructions).toEqual([]);
  });

  it('notes a scan, until the note is dismissed', async () => {
    const { box, act: run } = await mountHook({ tagText: 'stored' });
    expect(box.api.filledFromTag).toBe(false);
    await run(api => api.setTagText('RN 12345'));
    expect(box.api.filledFromTag).toBe(true);
    await run(api => api.dismissNote());
    expect(box.api.filledFromTag).toBe(false);
    expect(box.api.tagText).toBe('RN 12345');
  });

  it('drops blank and repeated care lines from the stored item', async () => {
    const { box } = await mountHook({ careInstructions: ['Hand wash', ' ', 'hand wash', 'Line dry'] });
    expect(box.api.careInstructions).toEqual(['Hand wash', 'Line dry']);
  });
});

// ─── The section ────────────────────────────────────────────────────────────

type HostState = { tag: TagFieldsApi; materials: MaterialComponent[]; size: string; brand: string };

const mount = async (
  opts: { editItem?: EditItem; materials?: MaterialComponent[]; size?: string; brand?: string; guest?: boolean; autoOpen?: boolean } = {},
) => {
  const latest: { state: HostState } = { state: undefined as unknown as HostState };
  const Host = () => {
    const tag = useTagFields(opts.editItem);
    const [materials, setMaterials] = useState<MaterialComponent[]>(opts.materials ?? []);
    const [size, setSize] = useState(opts.size ?? '');
    const [brand, setBrand] = useState(opts.brand ?? '');
    latest.state = { tag, materials, size, brand };
    return (
      <ScanTagSection
        tag={tag}
        category="tops"
        materials={materials}
        onMaterialsChange={setMaterials}
        size={size}
        onSizeChange={setSize}
        brand={brand}
        onBrandChange={setBrand}
        isGuest={!!opts.guest}
        autoOpen={opts.autoOpen}
      />
    );
  };
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<Host />);
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
  const fields = () => tree.root.findAllByType(TextInput);
  return { tree, latest, text, byLabel, press, fields };
};

describe('ScanTagSection', () => {
  it('shows the Scan tag button, the Made in field and the care row', async () => {
    const { text, byLabel, fields } = await mount();
    expect(byLabel('Scan tag')).toHaveLength(1);
    expect(text()).toContain('Fill in materials, care and country from the tag.');
    expect(text()).toContain('Made in');
    expect(text()).toContain('Care instructions (0)');
    expect(fields()).toHaveLength(1);
  });

  it('has one text field, a single-line "Made in" with a Done key and no number pad', async () => {
    const { fields } = await mount();
    const [field] = fields();
    expect(field.props.placeholder).toBe('Country of origin');
    expect(field.props.accessibilityLabel).toBe('Made in');
    expect(field.props.returnKeyType).toBe('done');
    expect(field.props.blurOnSubmit).toBe(true);
    expect(field.props.multiline).toBeUndefined();
    expect(field.props.keyboardType).toBeUndefined();
    expect(field.props.maxLength).toBe(60);
  });

  it('shows what is stored and lets the person type a country', async () => {
    const { fields, latest } = await mount({ editItem: { originCountry: 'Peru' } });
    expect(fields()[0].props.value).toBe('Peru');
    await act(async () => {
      fields()[0].props.onChangeText('Chile');
    });
    expect(latest.state.tag.originCountry).toBe('Chile');
    await act(async () => {
      fields()[0].props.onChangeText('x'.repeat(100));
    });
    expect(latest.state.tag.originCountry).toHaveLength(60);
  });

  it('tells a guest to sign in, and the button does nothing', async () => {
    const { text, byLabel, press } = await mount({ guest: true });
    expect(text()).toContain('Sign in to scan tags.');
    expect(byLabel('Scan tag')[0].props.accessibilityState.disabled).toBe(true);
    await press('Scan tag');
    expect(mockEnsureConsent).not.toHaveBeenCalled();
    // Typing everything by hand still works.
    expect((await mount({ guest: true })).fields()).toHaveLength(1);
  });

  it('renders nothing, and touches nothing, with the flag off', async () => {
    mockFlags.on = false;
    const { tree } = await mount({ autoOpen: true });
    expect(tree.toJSON()).toBeNull();
    expect(mockGetSession).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockEnsureConsent).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('opens the scan straight away when asked to', async () => {
    const { text } = await mount({ autoOpen: true });
    expect(mockEnsureConsent).toHaveBeenCalledTimes(1);
    expect(text()).toContain('Take photo');
  });
});

describe('ScanTagSection: care instructions', () => {
  it('opens to the 24 care phrases and counts what is picked', async () => {
    const { tree, text, press, byLabel, latest } = await mount();
    expect(CARE_PHRASES).toHaveLength(24);
    await press('Care instructions (0)');
    for (const phrase of CARE_PHRASES) expect(text()).toContain(phrase);
    expect(byLabel('Care instructions (0)')[0].props.accessibilityState.expanded).toBe(true);

    const choose = async (phrase: string) => {
      await act(async () => {
        tree.root.findAllByType(Pressable).find(n => n.props.accessibilityLabel === phrase)!.props.onPress();
      });
    };
    await choose('Hand wash');
    await choose('Line dry');
    expect(text()).toContain('Care instructions (2)');
    expect(latest.state.tag.careInstructions).toEqual(['Hand wash', 'Line dry']);
    await choose('Hand wash');
    expect(text()).toContain('Care instructions (1)');
    expect(latest.state.tag.careInstructions).toEqual(['Line dry']);
  });

  it('shows the chosen phrases as chips when closed, and removes one with a tap', async () => {
    const { text, press, latest, byLabel } = await mount({ editItem: { careInstructions: ['Hand wash', 'Line dry'] } });
    expect(text()).toContain('Care instructions (2)');
    expect(text()).toContain('Hand wash');
    expect(text()).toContain('Line dry');
    expect(byLabel('Remove Hand wash')).toHaveLength(1);
    await press('Remove Hand wash');
    expect(latest.state.tag.careInstructions).toEqual(['Line dry']);
    expect(text()).toContain('Care instructions (1)');
    expect(text()).not.toContain('Hand wash');
  });

  it('keeps a line the person typed earlier, which is not one of the 24, and lets it be removed', async () => {
    const { press, text, latest } = await mount({ editItem: { careInstructions: ['Iron on a towel'] } });
    expect(text()).toContain('Iron on a towel');
    await press('Care instructions (1)');
    expect(text()).toContain('Iron on a towel');
    await press('Iron on a towel');
    expect(latest.state.tag.careInstructions).toEqual([]);
  });
});

describe('ScanTagSection: after a scan', () => {
  const scan = async (m: Awaited<ReturnType<typeof mount>>) => {
    await m.press('Scan tag');
    await m.press('Take photo');
  };

  it('fills the form with the ticked rows, notes it, and keeps the transcription', async () => {
    const m = await mount();
    await scan(m);
    await m.press('Use these');

    expect(m.latest.state.materials).toEqual([{ name: 'cotton', tier: 'primary', percentage: 100 }]);
    expect(m.latest.state.size).toBe('M');
    expect(m.latest.state.tag.originCountry).toBe('Bangladesh');
    expect(m.latest.state.tag.careInstructions).toEqual(['Machine wash cold', 'Tumble dry low']);
    expect(m.latest.state.tag.tagText).toBe(CLEAN.transcription);
    expect(m.text()).toContain(FILLED_NOTE);
    expect(FILLED_NOTE).toBe('Filled from the tag. Check the numbers.');
    expect(m.fields()[0].props.value).toBe('Bangladesh');
    expect(m.text()).toContain('Care instructions (2)');
  });

  it('merges care with what was there, and never touches a size or materials the person has', async () => {
    const m = await mount({
      editItem: { careInstructions: ['Hand wash', 'Machine wash cold'] },
      materials: [{ name: 'wool', percentage: 100, tier: 'primary' }],
      size: 'L',
    });
    await scan(m);
    await m.press('Use these');
    expect(m.latest.state.tag.careInstructions).toEqual(['Hand wash', 'Machine wash cold', 'Tumble dry low']);
    expect(m.latest.state.materials).toEqual([{ name: 'wool', percentage: 100, tier: 'primary' }]);
    expect(m.latest.state.size).toBe('L');
  });

  it('keeps a country the person typed unless they tick the scanned one', async () => {
    const m = await mount({ editItem: { originCountry: 'Peru' } });
    await scan(m);
    await m.press('Use these');
    expect(m.latest.state.tag.originCountry).toBe('Peru');
    expect(m.fields()[0].props.value).toBe('Peru');
  });

  it('replaces typed materials only when Replace is chosen', async () => {
    const m = await mount({ materials: [{ name: 'wool', percentage: 100, tier: 'primary' }] });
    await scan(m);
    await m.press('Replace');
    await m.press('Use these');
    expect(m.latest.state.materials).toEqual([{ name: 'cotton', tier: 'primary', percentage: 100 }]);
  });

  it('puts a suggested brand into an empty Brand field once ticked', async () => {
    mockReadTag.mockResolvedValue(ok(BRAND));
    const m = await mount();
    await scan(m);
    await m.press('Use brand');
    await m.press('Use these');
    expect(m.latest.state.brand).toBe('Everlane');
  });

  it('stores the tag text without a note when nothing was ticked', async () => {
    const m = await mount();
    await scan(m);
    for (const row of ['Use fabric', 'Use care', 'Use made in', 'Use size']) await m.press(row);
    await m.press('Use these');
    expect(m.latest.state.tag.tagText).toBe(CLEAN.transcription);
    expect(m.text()).not.toContain(FILLED_NOTE);
    expect(m.latest.state.materials).toEqual([]);
    expect(m.latest.state.size).toBe('');
  });

  it('puts nothing in the form when the scan is cancelled', async () => {
    const m = await mount();
    await scan(m);
    await m.press('Cancel');
    expect(m.latest.state.tag.tagText).toBe('');
    expect(m.latest.state.materials).toEqual([]);
    expect(m.text()).not.toContain(FILLED_NOTE);
  });

  it('lets the note be dismissed', async () => {
    const m = await mount();
    await scan(m);
    await m.press('Use these');
    expect(m.text()).toContain(FILLED_NOTE);
    await m.press('Dismiss note');
    expect(m.text()).not.toContain(FILLED_NOTE);
    expect(m.latest.state.tag.tagText).toBe(CLEAN.transcription);
  });

  it('sends what a scan filled in with the item on save', async () => {
    const m = await mount({ editItem: { originCountry: 'Peru' } });
    await scan(m);
    // A country the person typed is only replaced when they tick it.
    await m.press('Use made in');
    await m.press('Use these');
    expect(m.latest.state.tag.toItemFields()).toEqual({
      careInstructions: ['Machine wash cold', 'Tumble dry low'],
      originCountry: 'Bangladesh',
      tagText: CLEAN.transcription,
    });
  });
});

// ─── The care instructions can be seen to be editable ───────────────────────

describe('ScanTagSection: editing the care instructions', () => {
  it('shows an Edit action in the care row, which turns into Done while the list is open', async () => {
    const { text, press } = await mount();
    expect(text()).toContain('Edit');
    expect(text()).not.toContain('Done');
    await press('Care instructions (0)');
    expect(text()).toContain('Done');
    expect(text()).not.toContain('Edit');
  });

  it('says what to do when there are none yet, and stops saying it once one is added', async () => {
    const { text, press } = await mount();
    expect(text()).toContain(CARE_EMPTY_NOTE);
    expect(CARE_EMPTY_NOTE).toContain('Tap Edit');
    await press('Care instructions (0)');
    expect(text()).not.toContain(CARE_EMPTY_NOTE);
    await press('Hand wash');
    await press('Care instructions (1)');
    expect(text()).not.toContain(CARE_EMPTY_NOTE);
    expect(text()).toContain('Hand wash');
  });

  it('tells a screen reader what the care row does', async () => {
    const { byLabel, press } = await mount();
    expect(byLabel('Care instructions (0)')[0].props.accessibilityHint).toMatch(/add or remove washing instructions/);
    await press('Care instructions (0)');
    expect(byLabel('Care instructions (0)')[0].props.accessibilityHint).toBe('Closes the list');
  });
});

// ─── Without its own scan button (the card at the top does the scanning) ─────

describe('ScanTagSection without a scan button', () => {
  const mountPlain = async () => {
    const latest: { tag: TagFieldsApi } = { tag: undefined as unknown as TagFieldsApi };
    const Host = () => {
      const tag = useTagFields({ originCountry: 'Peru' });
      latest.tag = tag;
      return (
        <ScanTagSection
          tag={tag}
          materials={[]}
          onMaterialsChange={() => {}}
          size=""
          onSizeChange={() => {}}
          brand=""
          onBrandChange={() => {}}
          isGuest={false}
          showScanButton={false}
        />
      );
    };
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Host />);
    });
    return { tree, text: () => flatten(tree.toJSON()), latest };
  };

  it('keeps the Made in field and the care row, and has no Scan tag button or helper', async () => {
    const { tree, text } = await mountPlain();
    expect(tree.root.findAllByType(Pressable).filter(n => n.props.accessibilityLabel === 'Scan tag')).toHaveLength(0);
    expect(text()).not.toContain('Fill in materials, care and country from the tag.');
    expect(text()).toContain('Made in');
    expect(text()).toContain('Care instructions (0)');
    expect(tree.root.findAllByType(TextInput)[0].props.value).toBe('Peru');
    expect(tree.root.findAllByType(TagReviewSheet)).toHaveLength(0);
  });

  it('starts no scan of its own', async () => {
    mockFlags.on = true;
    await mountPlain();
    expect(mockEnsureConsent).not.toHaveBeenCalled();
  });
});

// ─── The card at the top of the form ────────────────────────────────────────

describe('tagSummary', () => {
  it('lists the size, the fabric, the number of care lines and the country', () => {
    const tag = { careInstructions: ['Hand wash', 'Line dry'], originCountry: ' Peru ' };
    const materials: MaterialComponent[] = [
      { name: 'cotton', percentage: 60, tier: 'primary' },
      { name: 'polyester', percentage: 40, tier: 'primary' },
    ];
    expect(tagSummary(tag, ' M ', materials)).toBe('Size M · 60% cotton, 40% polyester · 2 care instructions · Made in Peru');
  });

  it('says "1 care instruction" for one, and leaves out what is empty', () => {
    expect(tagSummary({ careInstructions: ['Hand wash'], originCountry: '' }, '', [])).toBe('1 care instruction');
    expect(tagSummary({ careInstructions: [], originCountry: '' }, '', [])).toBe('');
    expect(tagSummary({ careInstructions: [], originCountry: '' }, 'S', [{ name: 'wool', tier: 'primary' }])).toBe('Size S · wool');
  });
});

describe('ScanTagFormCard', () => {
  // The card and the section below it share one tag state, like the Add screen: one scanner, one review sheet.
  const mountCard = async (
    opts: { editItem?: EditItem; materials?: MaterialComponent[]; size?: string; brand?: string; guest?: boolean; autoOpen?: boolean; withSection?: boolean } = {},
  ) => {
    const latest: { state: HostState } = { state: undefined as unknown as HostState };
    const Host = () => {
      const tag = useTagFields(opts.editItem);
      const [materials, setMaterials] = useState<MaterialComponent[]>(opts.materials ?? []);
      const [size, setSize] = useState(opts.size ?? '');
      const [brand, setBrand] = useState(opts.brand ?? '');
      latest.state = { tag, materials, size, brand };
      const shared = {
        tag,
        category: 'tops',
        materials,
        onMaterialsChange: setMaterials,
        size,
        onSizeChange: setSize,
        brand,
        onBrandChange: setBrand,
        isGuest: !!opts.guest,
      };
      return (
        <>
          <ScanTagFormCard {...shared} autoOpen={opts.autoOpen} />
          {opts.withSection ? <ScanTagSection {...shared} showScanButton={false} /> : null}
        </>
      );
    };
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Host />);
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
    return { tree, latest, text, byLabel, press };
  };

  it('asks to scan the tag and washing instructions, and before a scan says to take a photo', async () => {
    const { text, byLabel } = await mountCard();
    expect(SCAN_FORM_CARD_TITLE).toBe('Scan the tag & washing instructions');
    expect(text()).toContain(SCAN_FORM_CARD_TITLE);
    expect(text()).toContain(SCAN_FORM_CARD_BEFORE);
    expect(SCAN_FORM_CARD_BEFORE).toBe('Take a photo of the tag');
    expect(text()).not.toContain(SCAN_FORM_CARD_AFTER);
    const [card] = byLabel('Scan the tag and washing instructions');
    expect(card.props.accessibilityRole).toBe('button');
    expect(card.props.accessibilityState.disabled).toBe(false);
  });

  it('starts the scan from a tap: consent first, then the one review sheet', async () => {
    const { press, tree, text } = await mountCard({ withSection: true });
    await press('Scan the tag and washing instructions');
    expect(mockEnsureConsent).toHaveBeenCalledTimes(1);
    expect(text()).toContain('Take photo');
    expect(tree.root.findAllByType(TagReviewSheet)).toHaveLength(1);
  });

  it('opens the scan straight away when asked to, as the link on Item Details does', async () => {
    const { text, tree } = await mountCard({ autoOpen: true, withSection: true });
    expect(mockEnsureConsent).toHaveBeenCalledTimes(1);
    expect(text()).toContain('Take photo');
    expect(tree.root.findAllByType(TagReviewSheet)).toHaveLength(1);
  });

  it('fills the shared form after a scan, then says it was read with what it read', async () => {
    const m = await mountCard({ withSection: true });
    await m.press('Scan the tag and washing instructions');
    await m.press('Take photo');
    await m.press('Use these');

    expect(m.latest.state.size).toBe('M');
    expect(m.latest.state.tag.originCountry).toBe('Bangladesh');
    expect(m.latest.state.tag.careInstructions).toEqual(['Machine wash cold', 'Tumble dry low']);

    expect(m.text()).toContain(SCAN_FORM_CARD_AFTER);
    expect(SCAN_FORM_CARD_AFTER).toBe('Read from the tag');
    expect(m.text()).not.toContain(SCAN_FORM_CARD_BEFORE);
    expect(m.text()).toContain('Size M · 100% cotton · 2 care instructions · Made in Bangladesh');
    expect(m.text()).toContain('Scan again');
    expect(m.byLabel('Rescan the tag and washing instructions')).toHaveLength(1);
    // The section below shows the same state for checking and editing.
    expect(m.text()).toContain(FILLED_NOTE);
    expect(m.text()).toContain('Care instructions (2)');
  });

  it('says it was read for an item that already has tag text, and says when nothing was filled in', async () => {
    const stored = await mountCard({
      editItem: { tagText: '100% wool', careInstructions: ['Hand wash'] },
      size: 'S',
      materials: [{ name: 'wool', percentage: 100, tier: 'primary' }],
    });
    expect(stored.text()).toContain(SCAN_FORM_CARD_AFTER);
    expect(stored.text()).toContain('Size S · 100% wool · 1 care instruction');

    const bare = await mountCard({ editItem: { tagText: 'RN 12345' } });
    expect(bare.text()).toContain(SCAN_FORM_CARD_AFTER);
    expect(bare.text()).toContain(SCAN_FORM_CARD_NOTHING);
  });

  it('leaves a guest the same sign-in explanation as the scan button, and the card does nothing', async () => {
    const { text, byLabel, press } = await mountCard({ guest: true });
    expect(text()).toContain('Sign in to scan tags.');
    expect(text()).not.toContain('Take a photo of the tag');
    expect(byLabel('Scan the tag and washing instructions')[0].props.accessibilityState.disabled).toBe(true);
    await press('Scan the tag and washing instructions');
    expect(mockEnsureConsent).not.toHaveBeenCalled();
  });

  it('renders nothing, and touches nothing, with the flag off', async () => {
    mockFlags.on = false;
    const { tree } = await mountCard({ autoOpen: true });
    expect(tree.toJSON()).toBeNull();
    expect(mockEnsureConsent).not.toHaveBeenCalled();
  });
});
