import 'react-native';
import React from 'react';
import { Image } from 'react-native';
import renderer, { act, ReactTestInstance } from 'react-test-renderer';

const mockSign = jest.fn();
jest.mock('../../src/services/swapPhotoUrls', () => ({
  signSwapPhotos: (...a: any[]) => mockSign(...a),
  forgetSwapPhoto: jest.fn(),
}));

import SwapCard from '../../src/components/SwapCard';
import type { SwapListing } from '../../src/types/swap';

type Props = React.ComponentProps<typeof SwapCard>;

const listing = (over: Partial<SwapListing> = {}): SwapListing => ({
  id: 'l1',
  ownerLabel: 'Ann',
  ownerKind: 'friend',
  audience: 'friends',
  name: 'Blue blazer',
  category: 'outerwear',
  brand: 'Zara',
  size: 'M',
  condition: 'like_new',
  photoPath: 'l1.jpg',
  listedAt: '2026-10-01T00:00:00Z',
  mine: false,
  ...over,
});

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};

const render = async (over: Partial<Props> = {}) => {
  const props: Props = { listing: listing(), onPress: jest.fn(), onMenu: jest.fn(), ...over };
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<SwapCard {...props} />);
  });
  const button = (label: string) =>
    tree.root.find(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
  return { tree, props, text: () => flatten(tree.toJSON()), button };
};

const ancestors = (node: ReactTestInstance): ReactTestInstance[] => {
  const out: ReactTestInstance[] = [];
  for (let p = node.parent; p; p = p.parent) out.push(p);
  return out;
};

beforeEach(() => {
  mockSign.mockReset().mockImplementation(async (paths: string[]) => new Map(paths.map(p => [p, `https://signed/${p}`])));
});

describe('SwapCard', () => {
  it('shows the photo, condition, name, "Brand, Size" and who is offering it', async () => {
    const { text, tree } = await render();
    expect(text()).toContain('Blue blazer');
    expect(text()).toContain('Zara, M');
    expect(text()).toContain('Like new');
    expect(text()).toContain('Ann · Friend');
    expect(tree.root.findAllByType(Image)[0].props.source).toEqual({ uri: 'https://signed/l1.jpg' });
  });

  it('labels a stranger as a member under their alias', async () => {
    const { text } = await render({ listing: listing({ ownerLabel: 'Velvet Otter', ownerKind: 'member' }) });
    expect(text()).toContain('Velvet Otter · Member');
  });

  it('leaves out the details line and the condition pill when they are not known', async () => {
    const { text } = await render({ listing: listing({ brand: undefined, size: undefined, condition: undefined }) });
    expect(text()).toContain('Blue blazer');
    expect(text()).not.toContain(',');
    expect(text()).not.toContain('Like new');
  });

  it('shows just the brand or just the size when only one is known', async () => {
    expect((await render({ listing: listing({ size: undefined }) })).text()).toContain('Zara');
    const sizeOnly = await render({ listing: listing({ brand: undefined }) });
    expect(sizeOnly.text()).toContain('M');
    expect(sizeOnly.text()).not.toContain('Zara');
  });

  it('opens the piece from the card and the menu from its own button', async () => {
    const { button, props } = await render();
    await act(async () => {
      button('Open Blue blazer').props.onPress();
    });
    expect(props.onPress).toHaveBeenCalledTimes(1);
    expect(props.onMenu).not.toHaveBeenCalled();

    await act(async () => {
      button('Report or block Ann').props.onPress();
    });
    expect(props.onMenu).toHaveBeenCalledTimes(1);
    expect(props.onPress).toHaveBeenCalledTimes(1);
  });

  it('keeps the menu button a sibling of the card button, not a descendant', async () => {
    const { button } = await render();
    const card = button('Open Blue blazer');
    const menu = button('Report or block Ann');

    // Neither button contains the other, so a screen reader can reach both.
    expect(card.findAll(n => n === menu)).toHaveLength(0);
    expect(menu.findAll(n => n === card)).toHaveLength(0);
    expect(ancestors(menu)).not.toContain(card);
    expect(ancestors(card)).not.toContain(menu);
    expect(card.findAll(n => n.props.accessibilityLabel === 'Report or block Ann')).toHaveLength(0);
    // They hang off the same parent.
    expect(card.parent).toBe(menu.parent);
  });

  it('names the menu button after the offering member', async () => {
    const { button } = await render({ listing: listing({ ownerLabel: 'Velvet Otter', ownerKind: 'member' }) });
    expect(button('Report or block Velvet Otter').props.accessibilityRole).toBe('button');
  });

  it('reads the details to a screen reader after the name', async () => {
    const { button } = await render();
    expect(button('Open Blue blazer').props.accessibilityValue).toEqual({ text: 'Zara, M. Like new. Ann · Friend' });
  });
});
