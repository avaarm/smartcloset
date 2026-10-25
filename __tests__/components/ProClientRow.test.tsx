import 'react-native';
import React from 'react';
import fs from 'fs';
import path from 'path';
import { Pressable } from 'react-native';
import renderer, { act } from 'react-test-renderer';

import ProClientRow from '../../src/components/ProClientRow';
import type { ProConnectionSummary } from '../../src/types/pro';

type Props = React.ComponentProps<typeof ProClientRow>;

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};

const connection = (over: Partial<ProConnectionSummary> = {}): ProConnectionSummary => ({
  id: 'c1',
  myRole: 'stylist',
  otherLabel: 'Ana',
  status: 'active',
  startedAt: '2026-10-01T10:00:00Z',
  lastActivityAt: '2026-10-20T10:00:00Z',
  unread: 0,
  attention: false,
  pendingAppointments: 0,
  closetShared: false,
  ...over,
});

const render = (over: Partial<Props> = {}) => {
  const props: Props = { connection: connection(), onPress: jest.fn(), ...over };
  const tree = renderer.create(<ProClientRow {...props} />);
  const text = () => flatten(tree.toJSON());
  const row = () => tree.root.findAll(n => n.type === Pressable && typeof n.props.onPress === 'function')[0];
  const dots = () => tree.root.findAll(n => n.props.testID === 'pro-client-dot' && typeof n.type === 'string');
  return { tree, props, text, row, dots };
};

describe('ProClientRow', () => {
  it('shows the name the client chose and when the connection was last active', () => {
    const { text } = render();
    expect(text()).toContain('Ana');
    expect(text()).toContain('Last activity');
  });

  it('shows the last message instead of the activity line when there is one', () => {
    const { text } = render({ connection: connection({ lastMessagePreview: 'See you at 3', lastMessageAt: '2026-10-21T10:00:00Z' }) });
    expect(text()).toContain('See you at 3');
    expect(text()).not.toContain('Last activity');
  });

  it('marks a client whose closet is shared, and only an open connection', () => {
    expect(render({ connection: connection({ closetShared: true }) }).text()).toContain('Closet shared');
    expect(render({ connection: connection({ closetShared: false }) }).text()).not.toContain('Closet shared');
    expect(render({ connection: connection({ closetShared: true, status: 'ended', endedBy: 'client' }) }).text()).not.toContain('Closet shared');
  });

  it('puts a dot on a client with something new, and only on that one', () => {
    expect(render({ connection: connection({ attention: true }) }).dots()).toHaveLength(1);
    expect(render({ connection: connection({ attention: false }) }).dots()).toHaveLength(0);
    expect(render({ connection: connection({ attention: true }) }).row().props.accessibilityLabel).toBe('Open Ana, new activity');
    expect(render().row().props.accessibilityLabel).toBe('Open Ana');
  });

  describe('an ended connection', () => {
    it('reads the neutral line, whoever ended it, with an Ended badge', () => {
      const byClient = render({ connection: connection({ status: 'ended', endedBy: 'client', endedAt: '2026-10-22T10:00:00Z' }) });
      expect(byClient.text()).toContain('Ended');
      expect(byClient.text()).toContain('This connection has ended.');
      expect(byClient.text()).not.toContain('You ended');
      const bySystem = render({ connection: connection({ status: 'ended', endedBy: 'system' }) });
      expect(bySystem.text()).toContain('This connection has ended.');
    });

    it('tells the stylist who ended it that they did', () => {
      const { text } = render({ connection: connection({ status: 'ended', endedBy: 'stylist' }) });
      expect(text()).toContain('You ended this connection.');
    });

    it('keeps the server\'s label for a client who is gone and never says "blocked"', () => {
      const { text } = render({ connection: connection({ otherLabel: 'Former client', status: 'ended', endedBy: 'system' }) });
      expect(text()).toContain('Former client');
      expect(text().toLowerCase()).not.toContain('block');
    });

    it('falls back to "Former client" when the label is empty', () => {
      expect(render({ connection: connection({ otherLabel: '', status: 'ended', endedBy: 'system' }) }).text()).toContain('Former client');
    });
  });

  describe('the inbox variant', () => {
    it('leads with the message, marks unread messages, and leaves out the sharing chip', () => {
      const { text, dots, row } = render({
        variant: 'inbox',
        connection: connection({ unread: 2, closetShared: true, lastMessagePreview: 'Is blue ok?', lastMessageAt: '2026-10-21T10:00:00Z' }),
      });
      expect(text()).toContain('Is blue ok?');
      expect(text()).not.toContain('Closet shared');
      expect(dots()).toHaveLength(1);
      expect(row().props.accessibilityLabel).toBe('Open messages with Ana, unread');
    });

    it('has no dot when everything was read, and ignores the client list\'s "attention" flag', () => {
      const { dots, row } = render({ variant: 'inbox', connection: connection({ unread: 0, attention: true, lastMessagePreview: 'ok' }) });
      expect(dots()).toHaveLength(0);
      expect(row().props.accessibilityLabel).toBe('Open messages with Ana');
    });
  });

  it('is one button that calls onPress, with no navigation of its own', async () => {
    const { row, props } = render();
    expect(row().props.accessibilityRole).toBe('button');
    await act(async () => {
      row().props.onPress();
    });
    expect(props.onPress).toHaveBeenCalledTimes(1);
    const source = fs.readFileSync(path.resolve(__dirname, '../../src/components/ProClientRow.tsx'), 'utf8');
    expect(source).not.toMatch(/navigate\(|useNavigation/);
  });
});
