/**
 * ItemLabelBlock, "About this piece": size, style, condition, washing instructions and country, always shown. A row
 * with nothing yet is a prompt that opens Edit item; a wishlist piece shows size and style only; the care,
 * country and tag text rows follow the tag scanning flag.
 */
import 'react-native';
import React from 'react';
import { Alert, Pressable, Text, TextInput } from 'react-native';
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
  ABOUT_TITLE,
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

const mount = async (
  item: ItemLabelBlockProps['item'] = FULL,
  onClearTagText: () => Promise<void> = jest.fn(async () => undefined),
  onEdit?: () => void,
) => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<ItemLabelBlock item={item} onClearTagText={onClearTagText} onEdit={onEdit} />);
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

const PROMPTS = ['Add size', 'Add style', 'Add condition', 'Add washing instructions', 'Add country'];

describe('ItemLabelBlock: when it shows', () => {
  it('always shows, titled "About this piece", even for an item with nothing filled in', async () => {
    const { text } = await mount({});
    expect(ABOUT_TITLE).toBe('About this piece');
    expect(text()).toContain('About this piece');
    for (const label of ['Size', 'Style', 'Condition', 'Washing instructions', 'Made in']) {
      expect(text()).toContain(label);
    }
  });

  it('shows the same for an item whose details are blank or unknown', async () => {
    const { text } = await mount({ size: '  ', careInstructions: [], originCountry: '', tagText: ' ', condition: 'unheard_of' as never });
    expect(text()).toContain('About this piece');
    for (const prompt of PROMPTS) expect(text()).toContain(prompt);
  });

  it('shows the title as a header', async () => {
    const { tree } = await mount();
    const headers = tree.root.findAllByType(Text).filter(n => n.props.accessibilityRole === 'header');
    expect(headers.map(n => flatten(n.props.children))).toEqual(['About this piece']);
  });
});

describe('ItemLabelBlock: the rows', () => {
  it('shows size, style, condition, care and country', async () => {
    const { text } = await mount({ ...FULL, tags: ['casual', 'vintage', 'summer'] });
    expect(text()).toContain('Size');
    expect(text()).toContain('M');
    expect(text()).toContain('Style');
    expect(text()).toContain('Casual');
    expect(text()).toContain('Vintage');
    expect(text()).toContain('Condition');
    expect(text()).toContain('Like new');
    expect(text()).toContain('Washing instructions');
    expect(text()).toContain('Machine wash cold');
    expect(text()).toContain('Tumble dry low');
    expect(text()).toContain('Made in');
    expect(text()).toContain('Bangladesh');
    for (const prompt of PROMPTS) expect(text()).not.toContain(prompt);
  });

  it('shows only the style words, not the person’s other tags', async () => {
    const { text } = await mount({ tags: ['boho', 'summer', 'gift'] });
    expect(text()).toContain('Boho');
    expect(text()).not.toContain('summer');
    expect(text()).not.toContain('gift');
    expect(text()).not.toContain('Add style');
  });

  it('gives each care phrase its own line', async () => {
    const { tree } = await mount();
    const lines = tree.root.findAll(n => (n.type as unknown) === 'Text' && (n.props.children === 'Machine wash cold' || n.props.children === 'Tumble dry low'));
    expect(lines).toHaveLength(2);
  });

  it('shows a prompt in place of each empty row, and nothing for the rows that are filled', async () => {
    const { text } = await mount({ size: 'S', careInstructions: [], originCountry: '   ' });
    expect(text()).toContain('S');
    expect(text()).not.toContain('Add size');
    expect(text()).toContain('Add style');
    expect(text()).toContain('Add condition');
    expect(text()).toContain('Add washing instructions');
    expect(text()).toContain('Add country');
    expect(text()).not.toContain('Tag text');
  });

  it('shows the existing condition label, and a prompt for an unknown condition', async () => {
    expect((await mount({ condition: 'new_with_tags' })).text()).toContain('New with tags');
    expect((await mount({ condition: 'well_loved', size: 'S' })).text()).toContain('Well loved');
    expect((await mount({ condition: 'zzz' as never, size: 'S' })).text()).toContain('Add condition');
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

describe('ItemLabelBlock: the prompts', () => {
  it('are buttons that open Edit item, each named for what it adds', async () => {
    const onEdit = jest.fn();
    const { byLabel, press } = await mount({}, undefined, onEdit);
    for (const prompt of PROMPTS) {
      expect(byLabel(prompt)).toHaveLength(1);
      expect(byLabel(prompt)[0].props.accessibilityRole).toBe('button');
    }
    await press('Add size');
    await press('Add style');
    await press('Add washing instructions');
    expect(onEdit).toHaveBeenCalledTimes(3);
  });

  it('are plain words when nothing can be opened', async () => {
    const { byLabel, text } = await mount({});
    expect(byLabel('Add size')).toHaveLength(0);
    expect(text()).toContain('Add size');
  });

  it('are gone once the row is filled in', async () => {
    const { byLabel } = await mount(FULL, undefined, jest.fn());
    expect(byLabel('Add size')).toHaveLength(0);
    expect(byLabel('Add washing instructions')).toHaveLength(0);
    // Style is the one row FULL leaves empty.
    expect(byLabel('Add style')).toHaveLength(1);
  });
});

describe('ItemLabelBlock: a wishlist piece', () => {
  it('shows size and style only: it is not worn, cared for or tagged yet', async () => {
    const { text, byLabel } = await mount({ ...FULL, tags: ['elegant'], isWishlist: true }, undefined, jest.fn());
    expect(text()).toContain('About this piece');
    expect(text()).toContain('Size');
    expect(text()).toContain('Elegant');
    for (const gone of ['Condition', 'Washing instructions', 'Made in', 'Tag text', 'Bangladesh', 'Machine wash cold']) {
      expect(text()).not.toContain(gone);
    }
    expect(byLabel('Add condition')).toHaveLength(0);
  });

  it('still asks for a missing size and style', async () => {
    const { byLabel } = await mount({ isWishlist: true }, undefined, jest.fn());
    expect(byLabel('Add size')).toHaveLength(1);
    expect(byLabel('Add style')).toHaveLength(1);
  });
});

describe('ItemLabelBlock: with tag scanning off', () => {
  beforeEach(() => {
    mockFlags.on = false;
  });

  it('keeps size, style and condition, and drops the rows that only a scan fills', async () => {
    const { text, byLabel } = await mount({ ...FULL, tags: ['sporty'] }, undefined, jest.fn());
    expect(text()).toContain('About this piece');
    expect(text()).toContain('M');
    expect(text()).toContain('Sporty');
    expect(text()).toContain('Like new');
    for (const gone of ['Washing instructions', 'Made in', 'Tag text', 'Machine wash cold', 'Bangladesh']) {
      expect(text()).not.toContain(gone);
    }
    expect(byLabel('Add washing instructions')).toHaveLength(0);
    expect(mockGetSession).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
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
