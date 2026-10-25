import 'react-native';
import React from 'react';
import fs from 'fs';
import path from 'path';
import { Image, Pressable } from 'react-native';
import renderer from 'react-test-renderer';

import ProStylistCard from '../../src/components/ProStylistCard';
import { PRO_INDEPENDENT_LINE, PRO_NO_PAYMENT_LINE } from '../../src/config/proRules';
import type { InvitePreview } from '../../src/types/pro';

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};

const stylist = (over: Partial<InvitePreview['stylist']> = {}): InvitePreview['stylist'] => ({
  name: 'Ana Lee',
  headline: 'Wardrobe edits for busy people',
  bio: 'I help you wear what you already own.',
  services: ['wardrobe_audit', 'virtual_sessions'],
  languages: ['en', 'hy'],
  ratesText: 'From 80 per session',
  ...over,
});

const render = (props: React.ComponentProps<typeof ProStylistCard>) => {
  const tree = renderer.create(<ProStylistCard {...props} />);
  return { tree, text: flatten(tree.toJSON()) };
};

describe('ProStylistCard', () => {
  it('shows the profile the stylist wrote, in words', () => {
    const { text } = render({ stylist: stylist() });
    expect(text).toContain('Ana Lee');
    expect(text).toContain('Wardrobe edits for busy people');
    expect(text).toContain('I help you wear what you already own.');
    expect(text).toContain('Wardrobe audit');
    expect(text).toContain('Virtual sessions');
    expect(text).toContain('Languages: English, Armenian');
    expect(text).toContain('Rates (set by the stylist)');
    expect(text).toContain('From 80 per session');
  });

  it('always carries the payment line and the independence line', () => {
    const { text } = render({ stylist: stylist() });
    expect(text).toContain(PRO_NO_PAYMENT_LINE);
    expect(text).toContain(PRO_INDEPENDENT_LINE);
    expect(text).toContain(
      'Payment is arranged directly between you and your stylist. SmartCloset does not take payments, add fees or guarantee any service.',
    );
    expect(text).toContain('Stylists are independent professionals. SmartCloset does not check or vouch for them.');
  });

  it('leaves out what the stylist did not write, but not the two lines', () => {
    const { text } = render({ stylist: stylist({ headline: '', bio: '', services: [], languages: [], ratesText: '  ' }) });
    expect(text).not.toContain('Rates (set by the stylist)');
    expect(text).not.toContain('Languages');
    expect(text).toContain('Ana Lee');
    expect(text).toContain(PRO_NO_PAYMENT_LINE);
    expect(text).toContain(PRO_INDEPENDENT_LINE);
  });

  it('shows words for the ids it knows and nothing for ids it does not', () => {
    const { text } = render({ stylist: stylist({ services: ['outfit_styling', 'hair_cutting'], languages: ['fr', 'zz'] }) });
    expect(text).toContain('Outfit styling');
    expect(text).not.toContain('hair_cutting');
    expect(text).toContain('Languages: French');
    expect(text).not.toContain('zz');
  });

  it('has no rating, badge, photo, link or button of any kind', () => {
    const { tree, text } = render({ stylist: stylist() });
    expect(tree.root.findAllByType(Image)).toHaveLength(0);
    expect(tree.root.findAllByType(Pressable)).toHaveLength(0);
    expect(text).not.toMatch(/\b(stars?|rated|rating|verified|certified|featured|premium|top rated|approved)\b/i);
  });

  it('collapses to name, headline and the independence line, with no rates and so no payment line', () => {
    const { text } = render({ stylist: stylist(), compact: true });
    expect(text).toContain('Ana Lee');
    expect(text).toContain('Wardrobe edits for busy people');
    expect(text).toContain(PRO_INDEPENDENT_LINE);
    expect(text).not.toContain('I help you wear');
    expect(text).not.toContain('Wardrobe audit');
    expect(text).not.toContain('Rates (set by the stylist)');
    expect(text).not.toContain('From 80 per session');
    expect(text).not.toContain(PRO_NO_PAYMENT_LINE);
  });

  it('draws what it is given as plain text', () => {
    const { text } = render({ stylist: stylist({ bio: 'see https://example.com or write to me@example.com' }) });
    expect(text).toContain('see https://example.com or write to me@example.com');
    const source = fs.readFileSync(path.resolve(__dirname, '../../src/components/ProStylistCard.tsx'), 'utf8');
    expect(source).not.toMatch(/Linking|dataDetector|onPress|navigate\(/);
  });
});
