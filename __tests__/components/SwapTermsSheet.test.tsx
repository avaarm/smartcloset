import 'react-native';
import React from 'react';
import fs from 'fs';
import path from 'path';
import renderer, { act } from 'react-test-renderer';

const mockAccept = jest.fn();
const mockRpc = jest.fn();
jest.mock('../../src/config/supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) },
    rpc: (...a: any[]) => mockRpc(...a),
  },
}));
jest.mock('../../src/services/swapService', () => ({
  ...jest.requireActual('../../src/services/swapService'),
  acceptSwapTerms: (...a: any[]) => mockAccept(...a),
}));

import SwapTermsSheet from '../../src/components/SwapTermsSheet';
import { SWAP_TERMS, SWAP_TERMS_VERSION } from '../../src/config/swapRules';
import { SwapError } from '../../src/services/swapErrors';

type Props = React.ComponentProps<typeof SwapTermsSheet>;

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};

const render = async (over: Partial<Props> = {}) => {
  const props: Props = { visible: true, onAccepted: jest.fn(), onClose: jest.fn(), ...over };
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<SwapTermsSheet {...props} />);
  });
  const update = async (next: Partial<Props>) => {
    await act(async () => {
      tree.update(<SwapTermsSheet {...props} {...next} />);
    });
  };
  const text = () => flatten(tree.toJSON());
  const button = (label: string) =>
    tree.root.find(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
  const press = async (label: string) => {
    const node = button(label);
    await act(async () => {
      node.props.onPress();
    });
  };
  return { tree, text, press, button, update, props };
};

const deferred = () => {
  let resolve!: (v?: unknown) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

beforeEach(() => {
  mockAccept.mockReset().mockResolvedValue(undefined);
  mockRpc.mockReset().mockResolvedValue({ data: null, error: null });
});

describe('SwapTermsSheet', () => {
  it('shows the title and all six sections of the terms', async () => {
    const { text } = await render();
    expect(SWAP_TERMS.sections).toHaveLength(6);
    expect(text()).toContain('Swap terms');
    for (const section of SWAP_TERMS.sections) {
      expect(text()).toContain(section.heading);
      expect(text()).toContain(section.body);
    }
    for (const heading of [
      'What swaps are',
      'What others can see',
      'Rules',
      'Messages',
      'Reports and enforcement',
      'Your photos',
    ]) {
      expect(text()).toContain(heading);
    }
  });

  it('shows nothing while it is closed', async () => {
    const { text } = await render({ visible: false });
    expect(text()).toBe('');
  });

  it('records the agreement with no version, then tells the screen', async () => {
    const { press, props } = await render();
    await press('I agree');
    expect(mockAccept).toHaveBeenCalledTimes(1);
    // The service sends SWAP_TERMS_VERSION; the sheet has no version to pass.
    expect(mockAccept).toHaveBeenCalledWith();
    expect(props.onAccepted).toHaveBeenCalledTimes(1);
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('"Not now" closes without recording anything', async () => {
    const { press, props } = await render();
    await press('Not now');
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(mockAccept).not.toHaveBeenCalled();
    expect(props.onAccepted).not.toHaveBeenCalled();
  });

  it('says the terms were updated when the server changed under it, and stops offering to agree', async () => {
    mockAccept.mockRejectedValue(new SwapError('terms_version_mismatch'));
    const { text, press, button, props } = await render();
    await press('I agree');
    expect(text()).toContain('The swap terms were updated. Please reopen swaps.');
    expect(props.onAccepted).not.toHaveBeenCalled();
    expect(button('I agree').props.accessibilityState.disabled).toBe(true);

    await press('I agree');
    expect(mockAccept).toHaveBeenCalledTimes(1);
  });

  it('shows other failures in plain words and lets the member try again', async () => {
    mockAccept.mockRejectedValueOnce({ message: 'Network request failed' });
    const { text, press, props } = await render();
    await press('I agree');
    expect(text()).toContain('You seem to be offline. Check your connection and try again.');
    expect(props.onAccepted).not.toHaveBeenCalled();

    mockAccept.mockRejectedValueOnce(new Error('permission denied for table swap_members'));
    await press('I agree');
    expect(text()).toContain('Couldn’t save your agreement. Please try again.');
    expect(text()).not.toContain('permission denied');

    await press('I agree');
    expect(props.onAccepted).toHaveBeenCalledTimes(1);
    expect(text()).not.toContain('Couldn’t save your agreement');
  });

  it('does not record twice while a request is in flight', async () => {
    const pending = deferred();
    mockAccept.mockReturnValue(pending.promise);
    const { press, props } = await render();
    await press('I agree');
    await press('I agree');
    expect(mockAccept).toHaveBeenCalledTimes(1);
    await act(async () => {
      pending.resolve();
    });
    expect(props.onAccepted).toHaveBeenCalledTimes(1);
  });

  it('ignores an answer that arrives after the sheet was closed', async () => {
    const pending = deferred();
    mockAccept.mockReturnValue(pending.promise);
    const { press, update, props } = await render();
    await press('I agree');
    await update({ visible: false });
    await act(async () => {
      pending.resolve();
    });
    expect(props.onAccepted).not.toHaveBeenCalled();
  });

  it('starts clean when reopened after a version mismatch', async () => {
    mockAccept.mockRejectedValueOnce(new SwapError('terms_version_mismatch'));
    const { text, press, button, update } = await render();
    await press('I agree');
    await update({ visible: false });
    await update({ visible: true });
    expect(text()).not.toContain('The swap terms were updated');
    expect(button('I agree').props.accessibilityState.disabled).toBe(false);
  });

  it('is built to be opened only by a screen in the needs_terms state', () => {
    const code = fs
      .readFileSync(path.resolve(__dirname, '../../src/components/SwapTermsSheet.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    // It takes no version and reads none: what is on screen is this build's SWAP_TERMS, and the
    // service sends the matching SWAP_TERMS_VERSION. The state check belongs to the screens (useSwapAccess).
    expect(code).not.toMatch(/currentTermsVersion|useSwapAccess|p_version|SWAP_TERMS_VERSION/);
    expect(code).toMatch(/acceptSwapTerms\(\)/);
  });

  describe('with the real service behind it', () => {
    beforeEach(() => {
      mockAccept.mockImplementation(jest.requireActual('../../src/services/swapService').acceptSwapTerms);
    });

    it('sends the version of the text on screen, and only that', async () => {
      const { press, props } = await render();
      await press('I agree');
      expect(mockRpc).toHaveBeenCalledTimes(1);
      expect(mockRpc).toHaveBeenCalledWith('accept_swap_terms', { p_version: SWAP_TERMS_VERSION });
      expect(props.onAccepted).toHaveBeenCalledTimes(1);
    });

    it('turns the server refusing a different version into the "terms were updated" message', async () => {
      mockRpc.mockResolvedValue({ data: null, error: { message: 'terms_version_mismatch', code: '22023' } });
      const { text, press, props } = await render();
      await press('I agree');
      expect(text()).toContain('The swap terms were updated. Please reopen swaps.');
      expect(props.onAccepted).not.toHaveBeenCalled();
    });
  });
});
