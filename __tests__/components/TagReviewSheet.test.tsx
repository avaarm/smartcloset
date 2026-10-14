import 'react-native';
import React from 'react';
import { AccessibilityInfo, Pressable, TextInput } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import type { TagRead, TagReadFailure } from '../../src/types/tag';
import { parseTagText } from '../../src/utils/tagParser';
import TagReviewSheet, {
  COACH_TEXT,
  FAILURE_MESSAGES,
  FLIP_HINT,
  RETAKE_HINT,
  type TagReviewSheetProps,
} from '../../src/components/TagReviewSheet';
import type { TagApplyChoice, TagCurrentValues } from '../../src/components/tagApply';

const CLEAN = parseTagText('100% COTTON\nMADE IN BANGLADESH\nRN 12345\nMACHINE WASH COLD\nTUMBLE DRY LOW\nSIZE M');
const AMBER = parseTagText('55% COTTON 40% POLYESTER\nMADE IN ATLANTIS');
const SET = parseTagText('TOP: 100% COTTON\nBOTTOM: 100% POLYESTER');
const SCRAMBLED = parseTagText('70% COTTON 20% POLYESTER 5% NYLON 4% SILK');
const BRAND = parseTagText('EVERLANE\n100% COTTON');
const FABRIC_ONLY = parseTagText('100% COTTON');
const NO_FABRIC = parseTagText('MADE IN ITALY\nSIZE 40');

const EMPTY: TagCurrentValues = { materials: [], size: '', brand: '', originCountry: '', careInstructions: [] };

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};

type Overrides = Partial<TagReviewSheetProps>;

type Handlers = 'onTake' | 'onChoose' | 'onTypeInstead' | 'onScanAnother' | 'onApply' | 'onClose';
type RenderedProps = Omit<TagReviewSheetProps, Handlers> & Record<Handlers, jest.Mock>;

const baseProps = (over: Overrides = {}): RenderedProps => ({
  visible: true,
  phase: 'result',
  read: CLEAN as TagRead | null,
  failure: null as TagReadFailure | null,
  current: EMPTY,
  onTake: jest.fn(),
  onChoose: jest.fn(),
  onTypeInstead: jest.fn(),
  onScanAnother: jest.fn(),
  onApply: jest.fn(),
  onClose: jest.fn(),
  ...(over as Partial<RenderedProps>),
});

const render = async (over: Overrides = {}) => {
  const props = baseProps(over);
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<TagReviewSheet {...props} />);
  });
  const text = () => flatten(tree.toJSON());
  const byLabel = (label: string) => tree.root.findAllByType(Pressable).filter(n => n.props.accessibilityLabel === label);
  const node = (label: string) => {
    const found = byLabel(label);
    if (found.length !== 1) throw new Error(`expected one "${label}", found ${found.length}`);
    return found[0];
  };
  const press = async (label: string) => {
    await act(async () => {
      node(label).props.onPress();
    });
  };
  const checked = (label: string) => !!node(label).props.accessibilityState?.checked;
  const rerender = async (next: Overrides) => {
    Object.assign(props, next);
    await act(async () => {
      tree.update(<TagReviewSheet {...props} />);
    });
  };
  const applied = (): TagApplyChoice => props.onApply.mock.calls[props.onApply.mock.calls.length - 1][0];
  return { tree, props, text, node, byLabel, press, checked, rerender, applied };
};

let errorSpy: jest.SpyInstance;

beforeEach(() => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  expect(errorSpy).not.toHaveBeenCalled();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('TagReviewSheet: coach', () => {
  it('coaches before the camera opens, and offers the three ways forward', async () => {
    const { text, press, props } = await render({ phase: 'coach', read: null });
    expect(text()).toContain('Scan the tag');
    expect(text()).toContain(COACH_TEXT);
    expect(COACH_TEXT).toContain('Flatten the tag, fill the frame, use good light and avoid glare.');
    expect(COACH_TEXT).toContain('you can scan up to 3');
    await press('Take photo');
    await press('Choose from library');
    await press('Type it instead');
    expect(props.onTake).toHaveBeenCalledTimes(1);
    expect(props.onChoose).toHaveBeenCalledTimes(1);
    expect(props.onTypeInstead).toHaveBeenCalledTimes(1);
  });

  it('offers a way back to the result only when asked, and keeps Type it instead last', async () => {
    const plain = await render({ phase: 'coach', read: null });
    expect(plain.byLabel('Back to results')).toHaveLength(0);

    const onBack = jest.fn();
    const back = await render({ phase: 'coach', read: null, onBack });
    const labels = back.tree.root
      .findAllByType(Pressable)
      .map(n => n.props.accessibilityLabel)
      .filter(Boolean);
    expect(labels.slice(-2)).toEqual(['Back to results', 'Type it instead']);
    await back.press('Back to results');
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(back.props.onTypeInstead).not.toHaveBeenCalled();
  });

  it('shows a notice under the coaching when there is one', async () => {
    const { text } = await render({ phase: 'coach', read: null, notice: 'Camera access is off.' });
    expect(text()).toContain('Camera access is off.');
  });

  it('draws good and bad framing with views, not images', async () => {
    const { text, tree } = await render({ phase: 'coach', read: null });
    expect(text()).toContain('Fill the frame');
    expect(text()).toContain('Too far away');
    expect(tree.root.findAll(n => (n.type as unknown) === 'Image')).toHaveLength(0);
  });
});

describe('TagReviewSheet: reading', () => {
  it('says it is reading, and what it is doing during the optional second step', async () => {
    const reading = await render({ phase: 'reading', read: null });
    expect(reading.text()).toContain('Reading the tag...');
    const sorting = await render({ phase: 'reading', read: null, step: 'structuring' });
    expect(sorting.text()).toContain('Sorting out the fabric lines...');
  });

  it('lets the person back out', async () => {
    const { press, props } = await render({ phase: 'reading', read: null });
    await press('Cancel');
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});

describe('TagReviewSheet: failures', () => {
  const reasons = Object.keys(FAILURE_MESSAGES) as TagReadFailure[];

  it('uses the exact sentence for every reason', () => {
    expect(FAILURE_MESSAGES).toEqual({
      no_text: 'We couldn’t find any text. Move closer, flatten the tag and add light.',
      too_small: 'The tag looks small or blurry. Fill the frame and try again.',
      offline: 'No connection. You can type the details instead.',
      signed_out: 'Sign in to scan tags.',
      consent: 'AI reading is turned off. You can type the details instead, or turn it on in Settings.',
      daily_limit: 'You’ve scanned a lot today. Type it in, or try again tomorrow.',
      failed: 'We couldn’t read that one. Try again, or type it in.',
    });
  });

  it.each(reasons)('%s ends in its sentence and Type it instead', async reason => {
    const { text, press, props } = await render({ phase: 'failed', read: null, failure: reason });
    expect(text()).toContain(FAILURE_MESSAGES[reason]);
    await press('Type it instead');
    expect(props.onTypeInstead).toHaveBeenCalledTimes(1);
  });

  it('offers a way back to the result for every reason when asked, and not otherwise', async () => {
    for (const reason of reasons) {
      const plain = await render({ phase: 'failed', read: null, failure: reason });
      expect(plain.byLabel('Back to results')).toHaveLength(0);

      const onBack = jest.fn();
      const back = await render({ phase: 'failed', read: null, failure: reason, onBack });
      const labels = back.tree.root
        .findAllByType(Pressable)
        .map(n => n.props.accessibilityLabel)
        .filter(Boolean);
      expect(labels.slice(-2)).toEqual(['Back to results', 'Type it instead']);
      await back.press('Back to results');
      expect(onBack).toHaveBeenCalledTimes(1);
    }
  });

  it('offers another photo where one can help, and not where it cannot', async () => {
    for (const reason of ['no_text', 'too_small', 'offline', 'failed'] as TagReadFailure[]) {
      const { byLabel } = await render({ phase: 'failed', read: null, failure: reason });
      expect(byLabel('Take photo')).toHaveLength(1);
      expect(byLabel('Choose from library')).toHaveLength(1);
    }
    for (const reason of ['signed_out', 'consent', 'daily_limit'] as TagReadFailure[]) {
      const { byLabel } = await render({ phase: 'failed', read: null, failure: reason });
      expect(byLabel('Take photo')).toHaveLength(0);
      expect(byLabel('Choose from library')).toHaveLength(0);
    }
  });

  it('gives the flat-table and side-light hints only where a better photo helps', async () => {
    const poor = await render({ phase: 'failed', read: null, failure: 'too_small' });
    expect(poor.text()).toContain(RETAKE_HINT);
    expect(RETAKE_HINT).toContain('Press it flat on a table');
    expect(RETAKE_HINT).toContain('Try side light, no flash');
    const limit = await render({ phase: 'failed', read: null, failure: 'daily_limit' });
    expect(limit.text()).not.toContain(RETAKE_HINT);
  });

  it('shows the words that were found, open', async () => {
    const { text } = await render({ phase: 'failed', read: null, failure: 'too_small', transcription: '100% C0TT0N' });
    expect(text()).toContain('As read');
    expect(text()).toContain('100% C0TT0N');
  });

  it('shows no words box when nothing was found', async () => {
    const { text } = await render({ phase: 'failed', read: null, failure: 'no_text' });
    expect(text()).not.toContain('As read');
  });

  it('falls back to the general sentence for an unknown failure', async () => {
    const { text } = await render({ phase: 'failed', read: null, failure: null });
    expect(text()).toContain(FAILURE_MESSAGES.failed);
  });
});

describe('TagReviewSheet: result rows', () => {
  it('shows Read rows ticked, with the numbers as read and the sum', async () => {
    const { text, checked } = await render();
    expect(text()).toContain('What the tag says');
    expect(text()).toContain('Shell');
    expect(text()).toContain('100% Cotton');
    expect(text()).toContain('Adds up to 100');
    expect(text()).toContain('Bangladesh');
    expect(text()).toContain('Machine wash cold');
    expect(checked('Use fabric')).toBe(true);
    expect(checked('Use care')).toBe(true);
    expect(checked('Use made in')).toBe(true);
    expect(checked('Use size')).toBe(true);
    expect(checked('Use brand')).toBe(false);
  });

  it('names each status in words, not colour alone', async () => {
    const { node } = await render();
    expect(node('Use fabric').props.accessibilityValue).toEqual({ text: 'Read' });
    expect(node('Use brand').props.accessibilityValue).toEqual({ text: 'Not found' });
    const amber = await render({ read: AMBER });
    expect(amber.node('Use fabric').props.accessibilityValue).toEqual({ text: 'Check' });
    const words = amber.text();
    expect(words).toContain('Check');
    expect(words).toContain('Not found');
  });

  it('leaves a Check row unticked, says why, and lets the person tick it', async () => {
    const { text, checked, press, applied, props } = await render({ read: AMBER });
    expect(text()).toContain('Adds up to 95');
    expect(text()).toContain('Not sure about this one. Tick it to use it, then fix it in the form.');
    expect(checked('Use fabric')).toBe(false);
    expect(checked('Use made in')).toBe(false);

    await press('Use fabric');
    expect(checked('Use fabric')).toBe(true);
    await press('Use these');
    expect(applied().materials).toEqual([
      { name: 'cotton', tier: 'primary', percentage: 55 },
      { name: 'polyester', tier: 'primary', percentage: 40 },
    ]);
    expect(props.onApply).toHaveBeenCalledTimes(1);
  });

  it('applies only the ticked rows, and always the transcription', async () => {
    const { press, applied } = await render();
    await press('Use care');
    await press('Use these');
    const choice = applied();
    expect(choice.materials).toEqual([{ name: 'cotton', tier: 'primary', percentage: 100 }]);
    expect(choice.careInstructions).toBeUndefined();
    expect(choice.originCountry).toBe('Bangladesh');
    expect(choice.size).toBe('M');
    expect(choice.tagText).toBe(CLEAN.transcription);
    expect(choice.tagText).toContain('RN 12345');

    const none = await render();
    for (const row of ['Use fabric', 'Use care', 'Use made in', 'Use size']) await none.press(row);
    await none.press('Use these');
    expect(none.applied()).toEqual({ tagText: CLEAN.transcription });
  });

  it('disables the fabric row for a tag of more than one garment, and says to type it in', async () => {
    const { text, node, applied, press } = await render({ read: SET });
    expect(text()).toContain('This tag lists more than one garment or only part of the fabric. Type the fabric in below.');
    expect(node('Use fabric').props.accessibilityState).toMatchObject({ checked: false, disabled: true });
    // Only the row is disabled here: what each garment says is still shown.
    expect(text()).toContain('100% Cotton');
    expect(text()).toContain('100% Polyester');
    await press('Use fabric');
    await press('Use these');
    expect(applied().materials).toBeUndefined();
  });

  it('shows only the words, open, when the fabric cannot be read reliably', async () => {
    const { text, node } = await render({ read: SCRAMBLED });
    expect(text()).toContain('We couldn’t read the fabric reliably. Type it in below.');
    expect(node('Use fabric').props.accessibilityState.disabled).toBe(true);
    expect(text()).toContain(SCRAMBLED.transcription);
    // No fibre, percentage or "Adds up to" line: the numbers are not to be trusted (design 7.15).
    expect(text()).not.toContain('70% Cotton');
    expect(text()).not.toContain('20% Polyester');
    expect(text()).not.toContain('Adds up to');
  });

  it('shows no per-section numbers either when sections are scrambled', async () => {
    const sectioned = parseTagText('SHELL 70% COTTON 20% POLYESTER LINING 5% NYLON 4% SILK 1% WOOL');
    const { text, node } = await render({ read: sectioned });
    expect(text()).toContain('We couldn’t read the fabric reliably. Type it in below.');
    expect(node('Use fabric').props.accessibilityState.disabled).toBe(true);
    expect(text()).toContain(sectioned.transcription);
    expect(text()).not.toContain('Shell');
    expect(text()).not.toContain('Lining');
    expect(text()).not.toContain('70% Cotton');
    expect(text()).not.toContain('Adds up to');
  });

  it('says so when the tag only shows symbols', async () => {
    const { text } = await render({ read: { ...NO_FABRIC, flags: ['symbols_only'] } });
    expect(text()).toContain('This tag only shows symbols, which we can’t read yet.');
  });

  it('says nothing is ticked for a hard-to-read tag', async () => {
    const hard = parseTagText('100% COTTON', { ocr: { meanConfidence: 0.3 } });
    const { text, checked } = await render({ read: hard });
    expect(text()).toContain('The tag was hard to read');
    expect(checked('Use fabric')).toBe(false);
  });

  it('suggests flipping the tag over only when fabric or care is missing', async () => {
    expect((await render({ read: NO_FABRIC })).text()).toContain(FLIP_HINT);
    expect((await render({ read: CLEAN })).text()).not.toContain(FLIP_HINT);
    expect((await render({ read: FABRIC_ONLY })).text()).toContain(FLIP_HINT);
    expect((await render({ read: NO_FABRIC, canScanAnother: false })).text()).not.toContain(FLIP_HINT);
  });

  it('marks rows with nothing found as Not found and disabled', async () => {
    const { node } = await render({ read: NO_FABRIC });
    expect(node('Use fabric').props.accessibilityState.disabled).toBe(true);
    expect(node('Use care').props.accessibilityState.disabled).toBe(true);
    expect(node('Use made in').props.accessibilityState.disabled).toBe(false);
  });
});

describe('TagReviewSheet: what a scan may replace', () => {
  const MINE = { ...EMPTY, materials: [{ name: 'cotton', percentage: 60, tier: 'primary' as const }, { name: 'polyester', percentage: 40, tier: 'primary' as const }] };

  it('asks before replacing materials the person already filled in, and keeps theirs by default', async () => {
    const { text, checked, press, applied } = await render({ current: MINE });
    expect(text()).toContain('You have: 60% cotton, 40% polyester. Tag says: 100% cotton.');
    expect(checked('Use fabric')).toBe(true);
    expect((await render({ current: MINE })).node('Keep mine').props.accessibilityState.selected).toBe(true);
    await press('Use these');
    expect(applied().materials).toBeUndefined();
  });

  it('replaces them once Replace is chosen', async () => {
    const { press, applied, node } = await render({ current: MINE });
    await press('Replace');
    expect(node('Replace').props.accessibilityState.selected).toBe(true);
    expect(node('Keep mine').props.accessibilityState.selected).toBe(false);
    await press('Use these');
    expect(applied().materials).toEqual([{ name: 'cotton', tier: 'primary', percentage: 100 }]);
    await press('Keep mine');
    await press('Use these');
    expect(applied().materials).toBeUndefined();
  });

  it('does not ask when the form has no materials, or one seeded without a percentage', async () => {
    const empty = await render();
    expect(empty.byLabel('Replace')).toHaveLength(0);
    const seeded = await render({ current: { ...EMPTY, materials: [{ name: 'cotton', tier: 'primary' }] } });
    expect(seeded.byLabel('Replace')).toHaveLength(0);
    await seeded.press('Use these');
    expect(seeded.applied().materials).toEqual([{ name: 'cotton', tier: 'primary', percentage: 100 }]);
  });

  it('leaves a size the person typed alone', async () => {
    const { text, node, applied, press } = await render({ current: { ...EMPTY, size: 'L' } });
    expect(text()).toContain('Your size stays as L.');
    expect(node('Use size').props.accessibilityState.disabled).toBe(true);
    await press('Use these');
    expect(applied().size).toBeUndefined();
  });

  it('offers a brand only as a suggestion, only for an empty Brand field', async () => {
    const offered = await render({ read: BRAND });
    expect(offered.text()).toContain('Looks like Everlane. Use it?');
    expect(offered.checked('Use brand')).toBe(false);
    await offered.press('Use brand');
    await offered.press('Use these');
    expect(offered.applied().brand).toBe('Everlane');

    const kept = await render({ read: BRAND, current: { ...EMPTY, brand: 'Uniqlo' } });
    expect(kept.text()).toContain('Your brand stays as Uniqlo.');
    expect(kept.node('Use brand').props.accessibilityState.disabled).toBe(true);
    await kept.press('Use these');
    expect(kept.applied().brand).toBeUndefined();
  });

  it('does not tick a country over one the person already typed', async () => {
    const { checked, press, applied } = await render({ current: { ...EMPTY, originCountry: 'Peru' } });
    expect(checked('Use made in')).toBe(false);
    await press('Use made in');
    await press('Use these');
    expect(applied().originCountry).toBe('Bangladesh');
  });

  it('merges care into the existing list, and lets a phrase be removed first', async () => {
    const { press, applied, text } = await render({ current: { ...EMPTY, careInstructions: ['Hand wash', 'Machine wash cold'] } });
    expect(text()).toContain('Tumble dry low');
    await press('Remove Tumble dry low');
    await press('Use these');
    expect(applied().careInstructions).toEqual(['Hand wash', 'Machine wash cold']);

    const all = await render({ current: { ...EMPTY, careInstructions: ['Hand wash'] } });
    await all.press('Use these');
    expect(all.applied().careInstructions).toEqual(['Hand wash', 'Machine wash cold', 'Tumble dry low']);
  });
});

describe('TagReviewSheet: the rest of the sheet', () => {
  it('keeps what was read in a closed box that opens', async () => {
    const { text, press } = await render();
    expect(text()).toContain('As read');
    expect(text()).not.toContain('RN 12345');
    await press('As read');
    expect(text()).toContain('RN 12345');
    await press('As read');
    expect(text()).not.toContain('RN 12345');
  });

  it('offers Scan another side, and stops offering it after the third photo', async () => {
    const more = await render();
    await more.press('Scan another side');
    expect(more.props.onScanAnother).toHaveBeenCalledTimes(1);
    const last = await render({ canScanAnother: false });
    expect(last.byLabel('Scan another side')).toHaveLength(0);
    expect(last.byLabel('Use these')).toHaveLength(1);
  });

  it('closes from Cancel and from the corner, and nothing is applied', async () => {
    const { press, props } = await render();
    await press('Cancel');
    await press('Close');
    expect(props.onClose).toHaveBeenCalledTimes(2);
    expect(props.onApply).not.toHaveBeenCalled();
  });

  it('starts a fresh set of ticks for a new read', async () => {
    const { press, checked, rerender } = await render({ read: AMBER });
    await press('Use fabric');
    expect(checked('Use fabric')).toBe(true);
    await rerender({ read: CLEAN });
    expect(checked('Use fabric')).toBe(true);
    await rerender({ read: AMBER });
    expect(checked('Use fabric')).toBe(false);
  });

  it('renders nothing while closed, and has no text field in any phase', async () => {
    const closed = await render({ visible: false });
    expect(closed.text()).toBe('');
    for (const over of [
      { phase: 'coach' as const, read: null },
      { phase: 'reading' as const, read: null },
      { phase: 'failed' as const, read: null, failure: 'no_text' as const },
      { phase: 'result' as const, read: CLEAN },
      { phase: 'result' as const, read: AMBER, current: { ...EMPTY, size: 'M', brand: 'Zara' } },
    ]) {
      const { tree } = await render(over);
      expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
    }
  });

  it('never shows the strings the form tests ban', async () => {
    const seen: string[] = [];
    for (const over of [
      { phase: 'coach' as const, read: null },
      { phase: 'result' as const, read: CLEAN, current: { ...EMPTY, brand: 'Zara' } },
      { phase: 'result' as const, read: BRAND },
      { phase: 'result' as const, read: AMBER },
      { phase: 'failed' as const, read: null, failure: 'failed' as const },
    ]) {
      const { tree, press } = await render(over);
      if (over.phase === 'result') await press('As read');
      seen.push(flatten(tree.toJSON()));
    }
    for (const words of seen) {
      expect(words).not.toMatch(/Brand:|Color: |Material: /);
    }
  });
});

describe('TagReviewSheet: rows appear one after another', () => {
  const opacityOf = (tree: renderer.ReactTestRenderer) =>
    tree.root
      .findAll(n => typeof n.type === 'string' && n.props.importantForAccessibility !== undefined && n.props.accessibilityElementsHidden !== undefined)
      .map(n => ((Array.isArray(n.props.style) ? n.props.style.flat(Infinity) : [n.props.style]) as any[]).some(s => s && s.opacity === 0));

  it('shows every row at once when the person asked for less motion', async () => {
    const { tree } = await render();
    expect(opacityOf(tree)).toEqual([false, false, false, false, false]);
  });

  it('reveals the rows 60 ms apart otherwise', async () => {
    jest.useFakeTimers();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    const props = baseProps();
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<TagReviewSheet {...props} />);
    });
    expect(opacityOf(tree)).toEqual([false, true, true, true, true]);
    await act(async () => {
      jest.advanceTimersByTime(59);
    });
    expect(opacityOf(tree)).toEqual([false, true, true, true, true]);
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(opacityOf(tree)).toEqual([false, false, true, true, true]);
    await act(async () => {
      jest.advanceTimersByTime(180);
    });
    expect(opacityOf(tree)).toEqual([false, false, false, false, false]);
  });

  it('stops when the sheet goes away', async () => {
    jest.useFakeTimers();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    const props = baseProps();
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<TagReviewSheet {...props} />);
    });
    await act(async () => {
      tree.unmount();
    });
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
