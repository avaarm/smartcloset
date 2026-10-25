import 'react-native';
import React from 'react';
import { Alert, Linking } from 'react-native';
import renderer, { act } from 'react-test-renderer';

import ProGuidelinesSheet from '../../src/components/ProGuidelinesSheet';
import {
  PRO_GUIDELINES,
  PRO_GUIDELINES_ENFORCEMENT,
  PRO_GUIDELINES_TITLE,
  PRO_INDEPENDENT_LINE,
  PRO_SAFETY_TIPS,
  PRO_SAFETY_TIPS_TITLE,
} from '../../src/config/proRules';
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '../../src/config/legal';

type Props = React.ComponentProps<typeof ProGuidelinesSheet>;

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};

const render = async (over: Partial<Props> = {}) => {
  const props: Props = { visible: true, onClose: jest.fn(), ...over };
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<ProGuidelinesSheet {...props} />);
  });
  const press = async (label: string) => {
    const node = tree.root.find(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
    await act(async () => {
      await node.props.onPress();
    });
  };
  return { tree, text: () => flatten(tree.toJSON()), press, props };
};

describe('ProGuidelinesSheet', () => {
  it('shows the five rules, the enforcement line and the safety tips', async () => {
    const { text } = await render();
    expect(text()).toContain(PRO_GUIDELINES_TITLE);
    expect(PRO_GUIDELINES).toHaveLength(5);
    for (const rule of PRO_GUIDELINES) expect(text()).toContain(rule);
    expect(text()).toContain(PRO_GUIDELINES_ENFORCEMENT);
    expect(text()).toContain(PRO_SAFETY_TIPS_TITLE);
    for (const tip of PRO_SAFETY_TIPS) expect(text()).toContain(tip);
    expect(text()).toContain(PRO_INDEPENDENT_LINE);
  });

  it('says plainly that reports are private and that nothing is paid for in the app', async () => {
    const { text } = await render();
    expect(text()).toContain('Report anything that worries you. Reports are private.');
    expect(text()).toContain("SmartCloset doesn't handle payments");
  });

  it('shows nothing while closed', async () => {
    const { text } = await render({ visible: false });
    expect(text()).toBe('');
  });

  it('opens the mail app for Email support', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as any);
    const { press } = await render();
    await press('Email support');
    expect(open).toHaveBeenCalledWith(SUPPORT_MAILTO);
    open.mockRestore();
  });

  it('shows the address when the mail app cannot be opened', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no mail'));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { press } = await render();
    await press('Email support');
    expect(alert).toHaveBeenCalledWith('Could not open Mail', `You can reach us at ${SUPPORT_EMAIL}.`);
    open.mockRestore();
    alert.mockRestore();
  });

  it('closes with Done', async () => {
    const { press, props } = await render();
    await press('Done');
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
