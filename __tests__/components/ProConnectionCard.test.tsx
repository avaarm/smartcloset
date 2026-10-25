import 'react-native';
import React from 'react';
import fs from 'fs';
import path from 'path';
import renderer, { act } from 'react-test-renderer';
import ProConnectionCard from '../../src/components/ProConnectionCard';
import type { ProConnectionSummary } from '../../src/types/pro';

const connection = (over: Partial<ProConnectionSummary> = {}): ProConnectionSummary => ({
  id: 'c1',
  myRole: 'client',
  otherLabel: 'Maya Chen',
  otherHeadline: 'Capsule wardrobes and color',
  status: 'active',
  startedAt: '2026-10-01T10:00:00Z',
  lastActivityAt: '2026-10-20T10:00:00Z',
  unread: 0,
  attention: false,
  pendingAppointments: 0,
  closetShared: false,
  ...over,
});

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};

const render = async (c: ProConnectionSummary, onPress = jest.fn()) => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<ProConnectionCard connection={c} onPress={onPress} />);
  });
  const button = () => tree.root.find(n => typeof n.props.onPress === 'function' && n.props.accessibilityRole === 'button');
  const dots = () => tree.root.findAll(n => n.props.testID === 'pro-connection-dot');
  return { tree, onPress, text: () => flatten(tree.toJSON()), button, dots };
};

describe('ProConnectionCard', () => {
  it('shows the label, the headline and the last message', async () => {
    const { text } = await render(connection({ lastMessagePreview: 'See you Thursday' }));
    expect(text()).toContain('Maya Chen');
    expect(text()).toContain('Capsule wardrobes and color');
    expect(text()).toContain('See you Thursday');
  });

  it('is one button that opens the connection', async () => {
    const { button, onPress } = await render(connection());
    expect(button().props.accessibilityLabel).toBe('Open Maya Chen');
    await act(async () => {
      button().props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('shows a dot when something needs the person, and says so to a screen reader', async () => {
    const quiet = await render(connection());
    expect(quiet.dots()).toHaveLength(0);
    const busy = await render(connection({ attention: true, unread: 2 }));
    expect(busy.dots().length).toBeGreaterThan(0);
    const value = busy.button().props.accessibilityValue.text;
    expect(value).toContain('Needs your attention');
    expect(value).toContain('2 unread messages');
  });

  it('says "1 unread message" in the singular', async () => {
    const { button } = await render(connection({ attention: true, unread: 1 }));
    expect(button().props.accessibilityValue.text).toContain('1 unread message');
    expect(button().props.accessibilityValue.text).not.toContain('messages');
  });

  it('shows an Ended badge and who ended it, and no preview, once the connection is over', async () => {
    const mine = await render(connection({ status: 'ended', endedBy: 'client', endedAt: '2026-10-10T00:00:00Z', lastMessagePreview: 'old news' }));
    expect(mine.text()).toContain('Ended');
    expect(mine.text()).toContain('You ended this connection.');
    expect(mine.text()).not.toContain('old news');

    const theirs = await render(connection({ status: 'ended', endedBy: 'stylist', endedAt: '2026-10-10T00:00:00Z' }));
    expect(theirs.text()).toContain('This connection has ended.');
    const system = await render(connection({ status: 'ended', endedBy: 'system', endedAt: '2026-10-10T00:00:00Z' }));
    expect(system.text()).toContain('This connection has ended.');
  });

  it('uses the server label for a stylist who is gone and never says blocked', async () => {
    const { text } = await render(connection({ otherLabel: 'Former stylist', otherHeadline: undefined, status: 'ended', endedBy: 'client' }));
    expect(text()).toContain('Former stylist');
    expect(text().toLowerCase()).not.toContain('block');
  });

  it('falls back to "Former stylist" when the label is empty', async () => {
    const { text } = await render(connection({ otherLabel: '  ' }));
    expect(text()).toContain('Former stylist');
  });

  it('is plain text: no rating, no approval mark, no price', async () => {
    const { text } = await render(connection({ attention: true }));
    expect(text()).not.toMatch(/verified|certified|featured|top rated|premium|\$/i);
  });
});

describe('ProConnectionCard source', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/components/ProConnectionCard.tsx'), 'utf8');

  it('contains no navigation call and no console.error', () => {
    expect(source).not.toMatch(/\bnavigate\s*\(/);
    expect(source).not.toMatch(/useNavigation/);
    expect(source).not.toMatch(/console\.error/);
  });
});
