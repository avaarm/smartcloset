import 'react-native';
import React from 'react';
import renderer, { act } from 'react-test-renderer';

// The photo component asks for signed links; here it is a marker that keeps the path it was given.
jest.mock('../../src/components/SwapPhoto', () => {
  const R = require('react');
  const SwapPhoto = (props: any) => R.createElement('SwapPhoto', props);
  return { __esModule: true, default: SwapPhoto, SwapPhoto };
});

import SwapTicket, { handoffLine } from '../../src/components/SwapTicket';
import type { SwapDetail, SwapItemView } from '../../src/types/swap';

const flatten = (node: any): string =>
  !node ? '' : typeof node === 'string' ? node : Array.isArray(node) ? node.map(flatten).join(' ') : flatten(node.children);

const item = (over: Partial<SwapItemView> = {}): SwapItemView => ({
  listingId: 'l1',
  side: 'offer',
  mine: true,
  name: 'Blue blazer',
  size: 'M',
  condition: 'good',
  photoPath: 'mine.jpg',
  photoPending: false,
  removalPending: false,
  ...over,
});

const detail = (over: Partial<SwapDetail> = {}): SwapDetail => ({
  id: 's1',
  status: 'accepted',
  closedReason: null,
  role: 'proposer',
  pairKind: 'friends',
  otherLabel: 'Bea',
  createdAt: '2026-10-01T10:00:00Z',
  expiresAt: '2026-10-31T10:00:00Z',
  closedAt: null,
  iDone: false,
  theyDone: false,
  autoCompleted: false,
  items: [
    item(),
    item({ listingId: 'l2', side: 'request', mine: false, name: 'Linen shirt', size: 'S', condition: 'like_new', photoPath: 'theirs.jpg' }),
  ],
  messages: [],
  actions: { canAccept: false, canDecline: false, canCancel: true, canComplete: true, canMessage: true, messagesLeft: 100 },
  ...over,
});

const mount = async (d: SwapDetail) => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<SwapTicket detail={d} />);
  });
  return tree;
};

describe('SwapTicket', () => {
  it('shows what the member gives and what they get, in two columns', async () => {
    const tree = await mount(detail());
    const text = flatten(tree.toJSON());
    expect(text).toContain('You give');
    expect(text).toContain('You get');
    expect(text.indexOf('You give')).toBeLessThan(text.indexOf('Blue blazer'));
    expect(text.indexOf('Blue blazer')).toBeLessThan(text.indexOf('You get'));
    expect(text.indexOf('You get')).toBeLessThan(text.indexOf('Linen shirt'));
    expect(text).toContain('Size M · Good');
    expect(text).toContain('Size S · Like new');
  });

  it('gives each piece its own photo path', async () => {
    const tree = await mount(detail());
    const photos = tree.root.findAllByType('SwapPhoto' as any);
    expect(photos.map(p => p.props.path)).toEqual(['mine.jpg', 'theirs.jpg']);
    expect(photos[0].props.accessibilityLabel).toBe('Photo of Blue blazer');
  });

  it('draws several pieces on a side', async () => {
    const tree = await mount(
      detail({
        items: [
          item(),
          item({ listingId: 'l3', name: 'Wool scarf', size: undefined, condition: undefined, photoPath: 'scarf.jpg' }),
          item({ listingId: 'l2', side: 'request', mine: false, name: 'Linen shirt', photoPath: 'theirs.jpg' }),
        ],
      }),
    );
    const text = flatten(tree.toJSON());
    expect(text).toContain('Blue blazer');
    expect(text).toContain('Wool scarf');
    // A piece with no size or condition shows just its name.
    expect(text).not.toContain('Size undefined');
  });

  it('shows the status from the member’s side', async () => {
    expect(flatten((await mount(detail())).toJSON())).toContain('Accepted');
    expect(flatten((await mount(detail({ status: 'proposed', role: 'recipient' }))).toJSON())).toContain('Waiting for your answer');
    expect(
      flatten((await mount(detail({ status: 'cancelled', closedReason: 'cancelled_by_recipient', role: 'proposer' }))).toJSON()),
    ).toContain('They cancelled');
    expect(flatten((await mount(detail({ status: 'completed' }))).toJSON())).toContain('Swapped');
  });

  it('shows the placeholder, not a photo, when the server sends no path (a closed swap or a blocked member)', async () => {
    const tree = await mount(
      detail({
        status: 'cancelled',
        closedReason: 'unavailable',
        otherLabel: 'Swap member',
        items: [item({ photoPath: null }), item({ side: 'request', mine: false, name: 'Linen shirt', photoPath: undefined })],
      }),
    );
    const photos = tree.root.findAllByType('SwapPhoto' as any);
    expect(photos).toHaveLength(2);
    expect(photos.every(p => !p.props.path)).toBe(true);
    expect(flatten(tree.toJSON())).toContain('No longer available');
  });

  describe('hand-off line', () => {
    it('tells the member what to do while the swap is accepted', async () => {
      const text = flatten((await mount(detail())).toJSON());
      expect(text).toContain('When you have your piece, tap “We swapped!”.');
    });

    it('says when the other member already tapped', async () => {
      const text = flatten((await mount(detail({ theyDone: true }))).toJSON());
      expect(text).toContain('Bea says you swapped. Tap “We swapped!” when you have your piece.');
    });

    it('says when the member is the one waiting', async () => {
      const text = flatten((await mount(detail({ iDone: true }))).toJSON());
      expect(text).toContain('You tapped “We swapped!”. Waiting for Bea to do the same.');
    });

    it('is only there while accepted', () => {
      for (const status of ['proposed', 'declined', 'cancelled', 'expired', 'completed'] as const) {
        expect(handoffLine({ status, iDone: false, theyDone: false, otherLabel: 'Bea' })).toBeNull();
      }
      expect(handoffLine({ status: 'accepted', iDone: true, theyDone: true, otherLabel: 'Bea' })).toBeNull();
    });
  });

  it('takes no actions of its own: no buttons and no calls', async () => {
    const tree = await mount(detail());
    expect(tree.root.findAll(n => typeof n.props.onPress === 'function')).toHaveLength(0);
  });
});
