import 'react-native';
import React from 'react';
import { Alert, Pressable, TextInput } from 'react-native';
import renderer, { act } from 'react-test-renderer';

const mockFlags = { on: true };
jest.mock('../../src/config/ratingFlags', () => ({
  tagScanActive: () => mockFlags.on,
  ratingsActive: () => false,
  brandInsightsActive: () => false,
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

import ItemLabelBlock, {
  CLEAR_ERROR,
  CLEAR_MESSAGE,
  CLEAR_TITLE,
  TAG_TEXT_HELPER,
  type ItemLabelBlockProps,
} from '../../src/components/ItemLabelBlock';

const FULL: ItemLabelBlockProps['item'] = {
  size: 'M',
  condition: 'like_new',
  careInstructions: ['Machine wash cold', 'Tumble dry low'],
  originCountry: 'Bangladesh',
  tagText: '100% COTTON\nMADE IN BANGLADESH\nRN 12345',
};

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};

let errorSpy: jest.SpyInstance;
let alertSpy: jest.SpyInstance;

beforeEach(() => {
  mockFlags.on = true;
  mockGetSession.mockReset();
  mockRpc.mockReset();
  mockFrom.mockReset();
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  expect(errorSpy).not.toHaveBeenCalled();
  jest.restoreAllMocks();
});

const mount = async (item: ItemLabelBlockProps['item'] = FULL, onClearTagText: () => Promise<void> = jest.fn(async () => undefined)) => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<ItemLabelBlock item={item} onClearTagText={onClearTagText} />);
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
  /** Presses the button of the confirmation that was asked for. */
  const answer = async (buttonText: string, settle = true) => {
    const buttons = alertSpy.mock.calls[alertSpy.mock.calls.length - 1][2] as Array<{ text: string; onPress?: () => unknown }>;
    const button = buttons.find(b => b.text === buttonText)!;
    await act(async () => {
      // A clear that is still running is left running; the test settles it later.
      if (settle) await button.onPress?.();
      else button.onPress?.();
    });
  };
  return { tree, text, byLabel, press, answer, onClearTagText };
};

describe('ItemLabelBlock: when it shows', () => {
  it('shows nothing with the flag off, and asks for nothing', async () => {
    mockFlags.on = false;
    const { tree } = await mount();
    expect(tree.toJSON()).toBeNull();
    expect(mockGetSession).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('shows nothing for an item with no label details', async () => {
    expect((await mount({})).tree.toJSON()).toBeNull();
    expect((await mount({ size: '  ', careInstructions: [], originCountry: '', tagText: ' ' })).tree.toJSON()).toBeNull();
    expect((await mount({ condition: 'unheard_of' as never })).tree.toJSON()).toBeNull();
  });

  it('shows nothing for a wishlist piece, which is not owned', async () => {
    expect((await mount({ ...FULL, isWishlist: true })).tree.toJSON()).toBeNull();
  });

  it('shows with any single detail', async () => {
    for (const item of [{ size: 'M' }, { condition: 'good' as const }, { careInstructions: ['Hand wash'] }, { originCountry: 'Peru' }, { tagText: 'RN 12345' }]) {
      expect((await mount(item)).text()).toContain('Label');
    }
  });
});

describe('ItemLabelBlock: the rows', () => {
  it('shows size, condition, care and country', async () => {
    const { text } = await mount();
    expect(text()).toContain('Label');
    expect(text()).toContain('Size');
    expect(text()).toContain('M');
    expect(text()).toContain('Condition');
    expect(text()).toContain('Like new');
    expect(text()).toContain('Care');
    expect(text()).toContain('Machine wash cold');
    expect(text()).toContain('Tumble dry low');
    expect(text()).toContain('Made in');
    expect(text()).toContain('Bangladesh');
  });

  it('gives each care phrase its own line', async () => {
    const { tree } = await mount();
    const lines = tree.root.findAll(n => (n.type as unknown) === 'Text' && (n.props.children === 'Machine wash cold' || n.props.children === 'Tumble dry low'));
    expect(lines).toHaveLength(2);
  });

  it('leaves out a row with no value', async () => {
    const { text } = await mount({ size: 'S', careInstructions: [], originCountry: '   ' });
    expect(text()).toContain('Size');
    expect(text()).not.toContain('Condition');
    expect(text()).not.toContain('Care');
    expect(text()).not.toContain('Made in');
    expect(text()).not.toContain('Tag text');
  });

  it('shows the existing condition label, and nothing for an unknown condition', async () => {
    expect((await mount({ condition: 'new_with_tags' })).text()).toContain('New with tags');
    expect((await mount({ condition: 'well_loved', size: 'S' })).text()).toContain('Well loved');
    expect((await mount({ condition: 'zzz' as never, size: 'S' })).text()).not.toContain('Condition');
  });

  it('has no text field, and no string the item screens ban', async () => {
    const { tree, text, press } = await mount();
    await press('Tag text');
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
    const words = text();
    expect(words).not.toMatch(/Brand:|Color: |Material: /);
    const lines = tree.root.findAll(n => (n.type as unknown) === 'Text').map(n => flatten(n.props.children).trim());
    for (const line of lines) expect(line.startsWith('From ')).toBe(false);
  });
});

describe('ItemLabelBlock: tag text', () => {
  it('keeps the tag text closed, with its helper line', async () => {
    const { text, byLabel } = await mount();
    expect(text()).toContain('Tag text');
    expect(text()).toContain(TAG_TEXT_HELPER);
    expect(TAG_TEXT_HELPER).toBe('What was read from the tag. Only you can see it.');
    expect(text()).not.toContain('RN 12345');
    expect(byLabel('Clear tag text')).toHaveLength(0);
    expect(byLabel('Tag text')[0].props.accessibilityState.expanded).toBe(false);
  });

  it('opens to show the stored text as plain text, and closes again', async () => {
    const { text, press, byLabel } = await mount();
    await press('Tag text');
    expect(text()).toContain('100% COTTON');
    expect(text()).toContain('RN 12345');
    expect(byLabel('Clear tag text')).toHaveLength(1);
    await press('Tag text');
    expect(text()).not.toContain('RN 12345');
  });

  it('shows the tag text even when it is the only detail', async () => {
    const { text, press } = await mount({ tagText: 'RN 12345' });
    await press('Tag text');
    expect(text()).toContain('RN 12345');
  });
});

describe('ItemLabelBlock: clearing the tag text', () => {
  it('asks first, in words that say what stays', async () => {
    const { press, onClearTagText } = await mount();
    await press('Tag text');
    await press('Clear tag text');
    expect(alertSpy).toHaveBeenCalledTimes(1);
    const [title, message, buttons] = alertSpy.mock.calls[0];
    expect(title).toBe('Clear the tag text?');
    expect(title).toBe(CLEAR_TITLE);
    expect(message).toBe(
      'The materials, care and country you saved stay as they are. This piece will no longer count in the fabric breakdown of brand insights.',
    );
    expect(message).toBe(CLEAR_MESSAGE);
    expect(buttons.map((b: { text: string }) => b.text)).toEqual(['Cancel', 'Clear tag text']);
    expect(buttons[0].style).toBe('cancel');
    expect(buttons[1].style).toBe('destructive');
    expect(onClearTagText).not.toHaveBeenCalled();
  });

  it('clears nothing when the person says Cancel', async () => {
    const { press, answer, onClearTagText, text } = await mount();
    await press('Tag text');
    await press('Clear tag text');
    await answer('Cancel');
    expect(onClearTagText).not.toHaveBeenCalled();
    expect(text()).toContain('RN 12345');
  });

  it('waits for the clear, then closes the text', async () => {
    let finish!: () => void;
    const onClear = jest.fn(() => new Promise<void>(resolve => (finish = resolve)));
    const { press, answer, text, byLabel } = await mount(FULL, onClear);
    await press('Tag text');
    await press('Clear tag text');
    await answer('Clear tag text', false);
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(byLabel('Clear tag text')[0].props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    await act(async () => {
      finish();
    });
    expect(text()).not.toContain('RN 12345');
    expect(text()).not.toContain(CLEAR_ERROR);
    expect(byLabel('Clear tag text')).toHaveLength(0);
  });

  it('says so when the clear fails, keeps the text, and allows another try', async () => {
    const onClear = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
    const { press, answer, text } = await mount(FULL, onClear);
    await press('Tag text');
    await press('Clear tag text');
    await answer('Clear tag text');
    expect(text()).toContain('Couldn’t clear that. Please try again.');
    expect(CLEAR_ERROR).toBe('Couldn’t clear that. Please try again.');
    expect(text()).toContain('RN 12345');

    await press('Clear tag text');
    await answer('Clear tag text');
    expect(onClear).toHaveBeenCalledTimes(2);
    expect(text()).not.toContain(CLEAR_ERROR);
  });

  it('does not ask twice while a clear is running', async () => {
    let finish!: () => void;
    const onClear = jest.fn(() => new Promise<void>(resolve => (finish = resolve)));
    const { press, answer, byLabel } = await mount(FULL, onClear);
    await press('Tag text');
    await press('Clear tag text');
    await answer('Clear tag text', false);
    // A second confirmation, answered while the first is still running, does nothing more.
    await act(async () => {
      byLabel('Clear tag text')[0].props.onPress();
    });
    await answer('Clear tag text', false);
    expect(onClear).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish();
    });
  });

  it('sets nothing after it is gone', async () => {
    let finish!: () => void;
    const onClear = jest.fn(() => new Promise<void>(resolve => (finish = resolve)));
    const { tree, press, answer } = await mount(FULL, onClear);
    await press('Tag text');
    await press('Clear tag text');
    await answer('Clear tag text', false);
    await act(async () => {
      tree.unmount();
    });
    await act(async () => {
      finish();
    });
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
