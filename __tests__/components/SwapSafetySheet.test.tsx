import 'react-native';
import React from 'react';
import fs from 'fs';
import path from 'path';
import { InputAccessoryView, TextInput } from 'react-native';
import renderer, { act } from 'react-test-renderer';

const mockReport = jest.fn();
const mockBlock = jest.fn();
jest.mock('../../src/services/swapService', () => ({
  reportSwapContent: (...a: any[]) => mockReport(...a),
  blockSwapMember: (...a: any[]) => mockBlock(...a),
}));

import SwapSafetySheet from '../../src/components/SwapSafetySheet';
import { KeyboardLift } from '../../src/components/KeyboardLift';
import { KEYBOARD_DONE_ID } from '../../src/components/KeyboardSafe';
import { SWAP_REPORT_REASONS } from '../../src/config/swapRules';
import { SwapError } from '../../src/services/swapErrors';

type Props = React.ComponentProps<typeof SwapSafetySheet>;

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};

const base = (over: Partial<Props> = {}): Props => ({
  visible: true,
  refType: 'listing',
  refId: 'l1',
  label: 'Velvet Otter',
  onClose: jest.fn(),
  onBlocked: jest.fn(),
  ...over,
});

const render = async (over: Partial<Props> = {}) => {
  const props = base(over);
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<SwapSafetySheet {...props} />);
  });
  const update = async (next: Partial<Props>) => {
    await act(async () => {
      tree.update(<SwapSafetySheet {...props} {...next} />);
    });
  };
  const text = () => flatten(tree.toJSON());
  const press = async (label: string) => {
    const node = tree.root.find(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
    await act(async () => {
      node.props.onPress();
    });
  };
  const type = async (value: string) => {
    const input = tree.root.find(n => n.props.accessibilityLabel === 'Report details' && n.props.onChangeText);
    await act(async () => {
      input.props.onChangeText(value);
    });
  };
  return { tree, text, press, type, update, props };
};

/** A promise the test settles by hand, to model a request that is still in flight. */
const deferred = () => {
  let resolve!: (v?: unknown) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const THANKS = 'Thanks for letting us know. We review reports, aiming for within 24 hours. They won’t be told it was you.';
const BLOCK_TEXT = 'They won’t be able to see your pieces or message you, and any open swaps with them end. They won’t be told.';

beforeEach(() => {
  mockReport.mockReset().mockResolvedValue(undefined);
  mockBlock.mockReset().mockResolvedValue(undefined);
});

describe('SwapSafetySheet', () => {
  it('offers Report and Block, and never Remove friend', async () => {
    const { text, tree } = await render();
    expect(text()).toContain('Velvet Otter');
    expect(text()).toContain('Report');
    expect(text()).toContain('Block');
    expect(text()).not.toContain('Remove');
    expect(tree.root.findAll(n => n.props.accessibilityLabel === 'Remove friend')).toHaveLength(0);
  });

  it('lists every swap report reason, and only those', async () => {
    const { text, press } = await render();
    await press('Report');
    for (const r of SWAP_REPORT_REASONS) expect(text()).toContain(r.label);
    expect(text()).toContain('Asks for money or steers me off the app');
    expect(text()).toContain('Not as described');
  });

  it('walks reason -> details -> thanks and sends the report about the listing', async () => {
    const { text, press, type } = await render();
    await press('Report');
    await press('Not as described');
    await type('Stained, the photo hid it');
    await press('Submit report');

    expect(mockReport).toHaveBeenCalledTimes(1);
    expect(mockReport).toHaveBeenCalledWith({
      refType: 'listing',
      refId: 'l1',
      reason: 'not_as_described',
      details: 'Stained, the photo hid it',
      messageId: undefined,
    });
    expect(text()).toContain(THANKS);
    expect(mockBlock).not.toHaveBeenCalled();
  });

  it('reports a single message of a swap with its id', async () => {
    const { press } = await render({ refType: 'swap', refId: 's9', label: 'Bea', messageId: 42 });
    await press('Report');
    await press('Asks for money or steers me off the app');
    await press('Submit report');
    expect(mockReport).toHaveBeenCalledWith({
      refType: 'swap',
      refId: 's9',
      reason: 'scam',
      details: '',
      messageId: 42,
    });
  });

  it('offers to block after a report, and that goes through the same confirmation', async () => {
    const { text, press } = await render();
    await press('Report');
    await press('Spam or unwanted messages');
    await press('Submit report');
    await press('Block Velvet Otter');
    expect(text()).toContain('Block Velvet Otter?');
    expect(mockBlock).not.toHaveBeenCalled();
  });

  it('shows the failure in plain words and stays on the details step', async () => {
    mockReport.mockRejectedValue(new SwapError('report_rate_limited'));
    const { text, press } = await render();
    await press('Report');
    await press('Harassment or bullying');
    await press('Submit report');
    expect(text()).toContain('You’ve sent a lot of reports today. Please try again tomorrow.');
    expect(text()).toContain('Submit report');
    expect(text()).not.toContain('Thanks for letting us know');
  });

  it('runs errors through swapErrorMessage: offline, unexpected, and never a raw message', async () => {
    mockReport.mockRejectedValueOnce({ message: 'Network request failed' });
    const { text, press } = await render();
    await press('Report');
    await press('Something else');
    await press('Submit report');
    expect(text()).toContain('You seem to be offline. Check your connection and try again.');

    mockReport.mockRejectedValueOnce(new Error('relation "swap_reports" exploded'));
    await press('Submit report');
    expect(text()).toContain('Couldn’t send your report. Please try again.');
    expect(text()).not.toContain('exploded');

    mockReport.mockResolvedValueOnce(undefined);
    await press('Submit report');
    expect(text()).toContain(THANKS);
  });

  it('asks before blocking, then blocks the listing and tells the screen', async () => {
    const { text, press, props } = await render();
    await press('Block');
    expect(text()).toContain('Block Velvet Otter?');
    expect(text()).toContain(BLOCK_TEXT);
    expect(mockBlock).not.toHaveBeenCalled();

    await press('Block');
    expect(mockBlock).toHaveBeenCalledWith('listing', 'l1');
    expect(props.onBlocked).toHaveBeenCalledTimes(1);
    expect(mockReport).not.toHaveBeenCalled();
  });

  it('blocks from a swap by the swap reference', async () => {
    const { press, props } = await render({ refType: 'swap', refId: 's9', label: 'Bea' });
    await press('Block');
    await press('Block');
    expect(mockBlock).toHaveBeenCalledWith('swap', 's9');
    expect(props.onBlocked).toHaveBeenCalled();
  });

  it('keeps the sheet open and explains when blocking fails', async () => {
    mockBlock.mockRejectedValue(new SwapError('swap_unavailable'));
    const { text, press, props } = await render();
    await press('Block');
    await press('Block');
    expect(text()).toContain('That piece or swap is no longer available.');
    expect(props.onBlocked).not.toHaveBeenCalled();
  });

  it('Cancel closes without calling anything', async () => {
    const { press, props } = await render();
    await press('Cancel');
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(mockReport).not.toHaveBeenCalled();
    expect(mockBlock).not.toHaveBeenCalled();
  });

  describe('a result that arrives after the sheet moved on', () => {
    it('does not tell the screen about a block that finishes after the sheet was dismissed', async () => {
      const pending = deferred();
      mockBlock.mockReturnValue(pending.promise);
      const { press, update, props } = await render();
      await press('Block');
      await press('Block');
      expect(mockBlock).toHaveBeenCalledTimes(1);

      await update({ visible: false });
      await act(async () => {
        pending.resolve();
      });
      expect(props.onBlocked).not.toHaveBeenCalled();
    });

    it('does not turn a different thing into "thanks" when an old report finishes', async () => {
      const pending = deferred();
      mockReport.mockReturnValue(pending.promise);
      const { text, press, update } = await render();
      await press('Report');
      await press('Spam or unwanted messages');
      await press('Submit report');

      await update({ refId: 'l2', label: 'Bea' });
      expect(text()).toContain('Bea');
      await act(async () => {
        pending.resolve();
      });
      expect(text()).not.toContain('Thanks for letting us know');
      expect(text()).toContain('Block');
    });

    it('does not show an old failure on a reopened sheet', async () => {
      const pending = deferred();
      mockReport.mockReturnValue(pending.promise);
      const { text, press, update } = await render();
      await press('Report');
      await press('Spam or unwanted messages');
      await press('Submit report');

      await update({ visible: false });
      await update({ visible: true });
      // Back on the same step the old request was made from, so a stray result would show.
      await press('Report');
      await press('Spam or unwanted messages');
      await act(async () => {
        pending.reject(new SwapError('report_rate_limited'));
      });
      expect(text()).not.toContain('You’ve sent a lot of reports today');
      expect(text()).toContain('Submit report');
    });
  });

  it('starts again from the menu, with nothing left over, when reopened', async () => {
    const { text, press, type, update, tree } = await render();
    await press('Report');
    await press('Unsafe or no-show meetup');
    await type('Did not show up');
    await update({ visible: false });
    await update({ visible: true });
    expect(text()).toContain('Report');
    expect(text()).not.toContain('Unsafe or no-show meetup');

    await press('Report');
    await press('Unsafe or no-show meetup');
    const field = tree.root.findAllByType(TextInput)[0];
    expect(field.props.value).toBe('');
  });

  describe('keyboard', () => {
    const toDetails = async () => {
      const r = await render();
      expect(r.tree.root.findAllByType(InputAccessoryView)).toHaveLength(0);
      await r.press('Report');
      await r.press('Something else');
      return r;
    };

    it('gives the details field the shared Done bar, exactly once', async () => {
      const { tree } = await toDetails();
      const fields = tree.root.findAllByType(TextInput);
      expect(fields).toHaveLength(1);
      expect(fields[0].props.multiline).toBe(true);
      expect(fields[0].props.inputAccessoryViewID).toBe(KEYBOARD_DONE_ID);
      expect(fields[0].props.accessibilityLabel).toBe('Report details');
      expect(fields[0].props.maxLength).toBe(500);

      const bars = tree.root.findAllByType(InputAccessoryView);
      expect(bars).toHaveLength(1);
      expect(bars[0].props.nativeID).toBe(KEYBOARD_DONE_ID);
    });

    it('lifts the field above the keyboard', async () => {
      const { tree } = await toDetails();
      const field = tree.root.findAllByType(TextInput)[0];
      let above = field.parent;
      let lifted = false;
      while (above) {
        if (above.type === KeyboardLift) lifted = true;
        above = above.parent;
      }
      expect(lifted).toBe(true);
    });

    it('leaves the Done bar out of the steps that have no field', async () => {
      const { tree, press } = await toDetails();
      await press('Submit report');
      expect(tree.root.findAllByType(InputAccessoryView)).toHaveLength(0);
    });

    it('renders the shared bar in the source once (the guard counts it)', () => {
      const source = fs.readFileSync(path.resolve(__dirname, '../../src/components/SwapSafetySheet.tsx'), 'utf8');
      expect(source.match(/<KeyboardDoneBar\b/g)).toHaveLength(1);
    });
  });

  it('calls the swap service only, never the friends one, and holds no member id', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../src/components/SwapSafetySheet.tsx'), 'utf8');
    expect(source).not.toMatch(/friendService|reportUser|blockUser|userId/);
    expect(source).toMatch(/reportSwapContent/);
    expect(source).toMatch(/blockSwapMember/);
  });
});
