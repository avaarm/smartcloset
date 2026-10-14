import 'react-native';
import React from 'react';
import { Alert, Linking } from 'react-native';
import renderer, { act } from 'react-test-renderer';

import SwapGuidelinesSheet from '../../src/components/SwapGuidelinesSheet';
import { SWAP_GUIDELINES, SWAP_SAFETY_TIPS } from '../../src/config/swapRules';
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '../../src/config/legal';

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};

const render = async (visible = true) => {
  const onClose = jest.fn();
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<SwapGuidelinesSheet visible={visible} onClose={onClose} />);
  });
  const text = () => flatten(tree.toJSON());
  const press = async (label: string) => {
    const node = tree.root.find(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
    await act(async () => {
      await node.props.onPress();
    });
  };
  return { tree, text, press, onClose };
};

let openURL: jest.SpyInstance;
let alert: jest.SpyInstance;
beforeEach(() => {
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as any);
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => {
  openURL.mockRestore();
  alert.mockRestore();
});

describe('SwapGuidelinesSheet', () => {
  it('shows the swap guidelines: title, intro, every rule and how enforcement works', async () => {
    const { text } = await render();
    expect(text()).toContain(SWAP_GUIDELINES.title);
    expect(text()).toContain(SWAP_GUIDELINES.intro);
    for (const rule of SWAP_GUIDELINES.rules) expect(text()).toContain(rule);
    expect(text()).toContain(SWAP_GUIDELINES.enforcement);
    expect(text()).toContain(SWAP_GUIDELINES.contact);
  });

  it('shows every safety tip', async () => {
    const { text } = await render();
    for (const tip of SWAP_SAFETY_TIPS) expect(text()).toContain(tip);
  });

  it('shows nothing while closed', async () => {
    const { text } = await render(false);
    expect(text()).toBe('');
  });

  it('opens the support email', async () => {
    const { press } = await render();
    await press('Email support');
    expect(openURL).toHaveBeenCalledWith(SUPPORT_MAILTO);
    expect(alert).not.toHaveBeenCalled();
  });

  it('gives the address in an alert when no mail app can open', async () => {
    openURL.mockRejectedValue(new Error('no mail app'));
    const { press } = await render();
    await press('Email support');
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0][0]).toBe('Could not open Mail');
    expect(alert.mock.calls[0][1]).toContain(SUPPORT_EMAIL);
  });

  it('closes with Done', async () => {
    const { press, onClose } = await render();
    await press('Done');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
