import 'react-native';
import React from 'react';
import fs from 'fs';
import path from 'path';
import { Pressable } from 'react-native';
import renderer, { act } from 'react-test-renderer';

// A marker that keeps the props it was given: the card only decides which photo to ask for.
jest.mock('../../src/components/ProPhoto', () => {
  const R = require('react');
  const ProPhoto = (props: any) => R.createElement('ProPhoto', props);
  return { __esModule: true, default: ProPhoto, ProPhoto };
});

import ProLookCard from '../../src/components/ProLookCard';
import type { ProLookSummary } from '../../src/types/pro';

type Props = React.ComponentProps<typeof ProLookCard>;

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};

const look = (over: Partial<ProLookSummary> = {}): ProLookSummary => ({
  id: 'r1',
  status: 'sent',
  title: 'Autumn layers',
  itemCount: 3,
  updatedAt: '2026-10-20T10:00:00Z',
  isNew: false,
  ...over,
});

/** The dot, counted once: host elements only (a View shows up as a component and as the host view under it). */
const dots = (tree: renderer.ReactTestRenderer) =>
  tree.root.findAll(n => typeof n.type === 'string' && n.props.importantForAccessibility === 'no-hide-descendants');

const render = (over: Partial<Props> = {}) => {
  const props: Props = { look: look(), onPress: jest.fn(), ...over };
  const tree = renderer.create(<ProLookCard {...props} />);
  const text = () => flatten(tree.toJSON());
  const card = () => tree.root.findAll(n => n.type === Pressable && typeof n.props.onPress === 'function')[0];
  const photo = () => tree.root.findByType('ProPhoto' as any);
  return { tree, props, text, card, photo };
};

describe('ProLookCard', () => {
  it('shows the title, the number of pieces and the status', () => {
    const { text } = render({ look: look({ itemCount: 3 }), mine: true });
    expect(text()).toContain('Autumn layers');
    expect(text()).toContain('3 pieces');
    expect(text()).toContain('Sent');
  });

  it('says "1 piece" for one piece and has a name for a look with none', () => {
    const { text } = render({ look: look({ itemCount: 1, title: '  ' }) });
    expect(text()).toContain('1 piece');
    expect(text()).not.toContain('1 pieces');
    expect(text()).toContain('Untitled look');
  });

  it('calls onPress and holds no navigation of its own', async () => {
    const { card, props } = render();
    await act(async () => {
      card().props.onPress();
    });
    expect(props.onPress).toHaveBeenCalledTimes(1);
    const source = fs.readFileSync(path.resolve(__dirname, '../../src/components/ProLookCard.tsx'), 'utf8');
    expect(source).not.toMatch(/navigate\(|useNavigation/);
  });

  it('is one button that reads out the title, the status and the pieces', () => {
    const { card } = render({ look: look({ clientRating: 4 }), mine: true });
    expect(card().props.accessibilityRole).toBe('button');
    expect(card().props.accessibilityLabel).toBe('Autumn layers, Sent, 3 pieces, Rating 4 of 5');
  });

  describe('the "New" dot', () => {
    it('shows for a look that is new to the client, and the status reads New', () => {
      const { text, tree } = render({ look: look({ isNew: true, coverPhotoPath: 'a/b.jpg' }) });
      expect(text()).toContain('New');
      expect(dots(tree)).toHaveLength(1);
    });

    it('is absent once the look has been seen', () => {
      const { tree } = render({ look: look({ status: 'viewed', isNew: false }) });
      expect(dots(tree)).toHaveLength(0);
    });
  });

  describe('whose look it is', () => {
    it('reads "Sent" for the stylist who wrote it and "New" for the client, worked out from the summary', () => {
      expect(render({ look: look({ status: 'sent', isNew: false }) }).text()).toContain('Sent');
      expect(render({ look: look({ status: 'sent', isNew: true }) }).text()).toContain('New');
    });

    it('treats a draft as the stylist\'s', () => {
      expect(render({ look: look({ status: 'draft' }) }).text()).toContain('Draft');
    });

    it('says who wore it by the viewer, from the summary or from mine', () => {
      const worn = look({ status: 'implemented', coverPhotoPath: 'a/b.jpg' });
      expect(render({ look: worn }).text()).toContain('You wore it');
      expect(render({ look: look({ status: 'implemented' }) }).text()).toContain('They wore it');
      expect(render({ look: worn, mine: true }).text()).toContain('They wore it');
      expect(render({ look: look({ status: 'implemented' }), mine: false }).text()).toContain('You wore it');
    });
  });

  describe('the rating', () => {
    it('shows the client\'s rating as marks that cannot be pressed', () => {
      const { tree } = render({ look: look({ clientRating: 4 }) });
      const marks = tree.root.findAll(n => typeof n.props.accessibilityLabel === 'string' && /Rating, \d of 5/.test(n.props.accessibilityLabel));
      expect(marks).toHaveLength(0);
      expect(tree.root.findAll(n => n.props.accessibilityLabel === 'Rating').length).toBeGreaterThan(0);
    });

    it('shows nothing for a look with no rating, and ignores a rating outside 1 to 5', () => {
      expect(render({ look: look() }).tree.root.findAll(n => n.props.accessibilityLabel === 'Rating')).toHaveLength(0);
      expect(render({ look: look({ clientRating: 9 }) }).tree.root.findAll(n => n.props.accessibilityLabel === 'Rating')).toHaveLength(0);
    });
  });

  describe('the cover', () => {
    it('uses the client\'s own photo path', () => {
      const { photo } = render({ look: look({ coverPhotoPath: 'me/cover.jpg', coverItemId: 'i1' }), connectionId: 'c1' });
      expect(photo().props).toMatchObject({ ownPath: 'me/cover.jpg', hasPhoto: true });
      expect(photo().props.connectionId).toBeUndefined();
      expect(photo().props.itemId).toBeUndefined();
    });

    it('asks the photo function for a stylist\'s card when it is told the connection', () => {
      const { photo } = render({ look: look({ coverItemId: 'i1' }), connectionId: 'c1' });
      expect(photo().props).toMatchObject({ connectionId: 'c1', itemId: 'i1', hasPhoto: true });
      expect(photo().props.ownPath).toBeNull();
    });

    it('is a placeholder when there is neither a path nor the connection', () => {
      const a = render({ look: look({ coverItemId: 'i1' }) });
      expect(a.photo().props.hasPhoto).toBe(false);
      const b = render({ look: look() , connectionId: 'c1' });
      expect(b.photo().props.hasPhoto).toBe(false);
    });
  });

  it('has no commerce wording', () => {
    const { text } = render({ look: look({ clientRating: 5, isNew: true, coverPhotoPath: 'a.jpg' }) });
    expect(text()).not.toMatch(/\b(book|pay now|buy|checkout|deposit|premium|featured|verified|certified|top rated)\b/i);
  });
});
