import 'react-native';
import React from 'react';
import renderer from 'react-test-renderer';

import ProStatusBadge from '../../src/components/ProStatusBadge';
import { statusLabel } from '../../src/utils/proFormat';

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};

const text = (props: React.ComponentProps<typeof ProStatusBadge>) =>
  flatten(renderer.create(<ProStatusBadge {...props} />).toJSON());

const backgroundOf = (props: React.ComponentProps<typeof ProStatusBadge>): string => {
  const json: any = renderer.create(<ProStatusBadge {...props} />).toJSON();
  const styles = ([] as any[]).concat(json.props.style).flat(Infinity).filter(Boolean);
  return Object.assign({}, ...styles).backgroundColor;
};

describe('ProStatusBadge', () => {
  it('reads the wording of statusLabel for every kind', () => {
    expect(text({ kind: 'session', status: 'confirmed' })).toBe('Confirmed');
    expect(text({ kind: 'session', status: 'proposed', mine: true })).toBe('Waiting for their answer');
    expect(text({ kind: 'session', status: 'proposed', mine: false })).toBe('Waiting for your answer');
    expect(text({ kind: 'look', status: 'draft', mine: true })).toBe('Draft');
    expect(text({ kind: 'look', status: 'sent', mine: true })).toBe('Sent');
    expect(text({ kind: 'look', status: 'sent', mine: false })).toBe('New');
    expect(text({ kind: 'look', status: 'implemented', mine: false })).toBe('You wore it');
    expect(text({ kind: 'connection', status: 'ended' })).toBe('Ended');
    expect(text({ kind: 'connection', status: 'active' })).toBe('Connected');
  });

  it('is the same label for every status and kind as the formatter gives', () => {
    const statuses = ['proposed', 'confirmed', 'declined', 'cancelled', 'expired', 'completed', 'draft', 'sent', 'viewed', 'implemented', 'active', 'ended'];
    for (const kind of ['session', 'look', 'connection'] as const) {
      for (const status of statuses) {
        for (const mine of [true, false]) {
          const expected = statusLabel(kind, status, mine);
          expect(text({ kind, status, mine })).toBe(expected);
        }
      }
    }
  });

  it('draws nothing for a status this build does not know, never a raw code', () => {
    const json = renderer.create(<ProStatusBadge kind="session" status="rescheduled" />).toJSON();
    expect(json).toBeNull();
    expect(renderer.create(<ProStatusBadge kind="look" status="" />).toJSON()).toBeNull();
  });

  it('colours a status by what it asks of the person', () => {
    const waitingForYou = backgroundOf({ kind: 'session', status: 'proposed', mine: false });
    const waitingForThem = backgroundOf({ kind: 'session', status: 'proposed', mine: true });
    const cancelled = backgroundOf({ kind: 'session', status: 'cancelled' });
    const completed = backgroundOf({ kind: 'session', status: 'completed' });
    expect(waitingForYou).not.toBe(waitingForThem);
    expect(cancelled).not.toBe(completed);
    expect(backgroundOf({ kind: 'look', status: 'sent', mine: false })).not.toBe(backgroundOf({ kind: 'look', status: 'viewed', mine: false }));
    expect(backgroundOf({ kind: 'connection', status: 'active' })).not.toBe(backgroundOf({ kind: 'connection', status: 'ended' }));
  });
});
