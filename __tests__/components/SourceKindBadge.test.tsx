/**
 * The Retail / Resale / Marketplace label on a result card is 10pt text on a pale
 * background, so it needs WCAG AA contrast for small text (4.5:1).
 */
import 'react-native';
import React from 'react';
import { Text } from 'react-native';
import renderer from 'react-test-renderer';
import SourceKindBadge, { BADGE_TONES } from '../../src/components/SourceKindBadge';
import type { SourceKind } from '../../src/services/retailerDomains';

const channel = (v: number): number => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex: string): number => {
  const n = parseInt(hex.replace('#', ''), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
};

/** WCAG 2.x contrast ratio between two #RRGGBB colours. */
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('contrast helper', () => {
  it('matches the WCAG reference values', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#FFFFFF')).toBeCloseTo(4.48, 1);
    expect(contrast('#16A34A', '#DCFCE7')).toBeCloseTo(3.0, 1); // the old retail text
  });
});

describe('SourceKindBadge', () => {
  it.each(['retail', 'resale', 'marketplace'] as SourceKind[])('%s text is readable at 4.5:1 or better', kind => {
    const tone = BADGE_TONES[kind]!;
    expect(contrast(tone.color, tone.background)).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ['retail', 'Retail'],
    ['resale', 'Resale'],
    ['marketplace', 'Marketplace'],
  ] as Array<[SourceKind, string]>)('draws %s with the colours that were checked', (kind, label) => {
    const tree = renderer.create(<SourceKindBadge kind={kind} />);
    const text = tree.root.findByType(Text);
    expect(text.props.children).toBe(label);
    const colour = ([] as any[]).concat(text.props.style).find(s => s?.color)?.color;
    expect(colour).toBe(BADGE_TONES[kind]!.color);
    const box = tree.root.findAll(n => (n.type as unknown) === 'View')[0];
    const background = ([] as any[]).concat(box.props.style).find(s => s?.backgroundColor)?.backgroundColor;
    expect(background).toBe(BADGE_TONES[kind]!.background);
  });

  it.each(['unknown', 'social'] as SourceKind[])('says nothing about a %s site', kind => {
    const tree = renderer.create(<SourceKindBadge kind={kind} />);
    expect(tree.toJSON()).toBeNull();
  });
});
