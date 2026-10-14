/**
 * The brand report screen (documentation/design/quality-ratings.md, 3.4): every state of its table, sections
 * that are only there when the server sent their numbers, the four member-count phrases and nothing more exact,
 * the "Something look wrong?" flow with its mail fallback, and the person's own "Your take" card with the
 * rating sheet behind it. The services, the consent hook and RatingScale are replaced; the sheet is the real one.
 */
import 'react-native';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Alert, Linking, Platform } from 'react-native';

let mockBrand: unknown = 'Zara';
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack, navigate: jest.fn() }),
  useRoute: () => ({ params: { brand: mockBrand } }),
}));

jest.mock('../../src/config/ratingFlags', () => ({
  RATINGS_ENABLED: true,
  BRAND_INSIGHTS_ENABLED: true,
  TAG_SCAN_ENABLED: false,
  TAG_MODEL_FALLBACK_ENABLED: false,
  TAG_OCR_FEATURE: 'TEXT_DETECTION',
  ratingsActive: () => true,
  brandInsightsActive: () => true,
  tagScanActive: () => false,
}));

const mockGetSession = jest.fn();
const mockRpc = jest.fn();
jest.mock('../../src/config/supabase', () => ({
  supabase: {
    auth: { getSession: (...args: unknown[]) => mockGetSession(...args) },
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

jest.mock('../../src/services/brandInsightService', () => ({
  loadBrandInsight: jest.fn(),
  reportBrandInsight: jest.fn(),
}));
jest.mock('../../src/services/ratingService', () => ({
  loadMyBrandSummary: jest.fn(),
  saveBrandRating: jest.fn(),
  deleteBrandRating: jest.fn(),
}));

const mockConsent = {
  granted: true as boolean | null,
  needsReconsent: false,
  available: true,
  requiresAdult: true,
  loading: false,
  refresh: jest.fn(),
  requestConsent: jest.fn(),
  sheet: null as React.ReactElement | null,
};
jest.mock('../../src/components/RatingConsentSheet', () => ({
  __esModule: true,
  default: () => null,
  useRatingConsent: () => mockConsent,
}));

jest.mock(
  '../../src/components/RatingScale',
  () => {
    const mockReact = require('react');
    return {
      __esModule: true,
      default: (props: Record<string, unknown>) => mockReact.createElement('MockRatingScale', props),
    };
  },
);

import BrandReportScreen from '../../src/screens/BrandReportScreen';
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '../../src/config/legal';
import { BUCKET_LABELS } from '../../src/config/ratingVocabulary';
import * as insightService from '../../src/services/brandInsightService';
import * as ratingService from '../../src/services/ratingService';
import type { BrandInsightOk, BrandRating, MyBrandSummary } from '../../src/types/rating';

const loadBrandInsight = insightService.loadBrandInsight as jest.Mock;
const reportBrandInsight = insightService.reportBrandInsight as jest.Mock;
const loadMyBrandSummary = ratingService.loadMyBrandSummary as jest.Mock;
const saveBrandRating = ratingService.saveBrandRating as jest.Mock;
const deleteBrandRating = ratingService.deleteBrandRating as jest.Mock;

const flatten = (node: any): string => {
  if (!node) {
    return '';
  }
  if (typeof node === 'string') {
    return node;
  }
  if (Array.isArray(node)) {
    return node.map(flatten).join(' ');
  }
  return flatten(node.children);
};

/** Each piece of text on its own, so words from neighbouring elements are never read as one phrase. */
const leaves = (node: any): string[] => {
  if (!node) {
    return [];
  }
  if (typeof node === 'string') {
    return [node];
  }
  if (Array.isArray(node)) {
    return node.flatMap(leaves);
  }
  return leaves(node.children);
};

const insight = (over: Partial<BrandInsightOk> = {}): BrandInsightOk => ({
  status: 'ok',
  nBucket: '10-24',
  score: 4.1,
  asOf: '2026-10-14',
  item: {},
  brand: {},
  traits: [],
  slices: [],
  ...over,
});
const okInsight = (over: Partial<BrandInsightOk> = {}) => ({ state: 'ok' as const, value: insight(over) });

const FULL: Partial<BrandInsightOk> = {
  item: {
    feel: 4.4,
    comfort: 4.2,
    holdsUp: 3.9,
    wouldBuyAgainPct: 75,
    fit: { runsSmall: 10, trueToSize: 70, runsLarge: 20 },
  },
  brand: { quality: 4.0, fitConsistency: 3.5, value: 3.8 },
  traits: [
    { group: 'touch', tag: 'soft', pct: 70 },
    { group: 'comfort', tag: 'breathable', pct: 55 },
  ],
  slices: [
    { kind: 'material', key: 'cotton', nBucket: '10-24', overall: 4.4, feel: 4.5, holdsUp: 4.1 },
    { kind: 'material', key: 'polyester', nBucket: '10-24', overall: 3.2 },
    { kind: 'category', key: 'tops', nBucket: '10-24', overall: 4.0, feel: 4.2 },
  ],
};

const summary = (over: Partial<MyBrandSummary> = {}): MyBrandSummary => ({
  itemsRated: 4,
  avgOverall: 3.8,
  brandRating: null,
  canRateBrand: true,
  ...over,
});
const okSummary = (over: Partial<MyBrandSummary> = {}) => ({ state: 'ok' as const, value: summary(over) });

const rated = (over: Partial<BrandRating> = {}): BrandRating => ({
  brandLabel: 'Zara',
  overall: 4,
  quality: 3,
  fitConsistency: null,
  value: 5,
  contributed: false,
  updatedAt: '2026-10-14T10:00:00Z',
  ...over,
});

const SECTION_TITLES = ['On the pieces', 'How it fits', 'On the brand', 'People say', 'By fabric', 'By type'];
const FOOTER = 'Members’ opinions, not verified. Based on ratings from members who chose to share them. Updated about once a day.';

let errorSpy: jest.SpyInstance;
let alertSpy: jest.SpyInstance;
let openUrlSpy: jest.SpyInstance;
const realOS = Platform.OS;
const mounted: renderer.ReactTestRenderer[] = [];

beforeEach(() => {
  mockBrand = 'Zara';
  mockGoBack.mockReset();
  mockGetSession.mockReset().mockResolvedValue({ data: { session: { user: { id: 'u1' } } }, error: null });
  mockRpc.mockReset().mockResolvedValue({ data: null, error: null });
  loadBrandInsight.mockReset().mockResolvedValue(okInsight());
  reportBrandInsight.mockReset().mockResolvedValue(undefined);
  loadMyBrandSummary.mockReset().mockResolvedValue(okSummary());
  saveBrandRating.mockReset().mockResolvedValue({ contributed: false, blocked: null });
  deleteBrandRating.mockReset().mockResolvedValue(undefined);
  mockConsent.granted = true;
  mockConsent.sheet = null;
  mockConsent.refresh.mockReset().mockResolvedValue(undefined);
  mockConsent.requestConsent.mockReset().mockResolvedValue(true);
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  openUrlSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
});

afterEach(() => {
  Platform.OS = realOS;
  mounted.splice(0).forEach(tree => {
    try {
      tree.unmount();
    } catch {
      // already gone
    }
  });
  expect(errorSpy).not.toHaveBeenCalled();
  errorSpy.mockRestore();
  alertSpy.mockRestore();
  openUrlSpy.mockRestore();
  jest.restoreAllMocks();
});

const render = async () => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<BrandReportScreen />);
  });
  mounted.push(tree);
  const text = () => flatten(tree.toJSON());
  const pieces = () => leaves(tree.toJSON());
  const pressables = (label: string) =>
    tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
  const has = (label: string) => pressables(label).length > 0;
  const press = async (label: string) => {
    const found = pressables(label);
    if (found.length === 0) {
      throw new Error(`no button labelled ${label}`);
    }
    await act(async () => {
      found[0].props.onPress();
    });
  };
  const scale = (label: string) =>
    tree.root.findAll(n => (n.type as unknown) === 'MockRatingScale' && n.props.accessibilityLabel === label)[0];
  const rerender = async () => {
    await act(async () => {
      tree.update(<BrandReportScreen />);
    });
  };
  return { tree, text, pieces, press, has, scale, rerender };
};

const lastAlert = () => alertSpy.mock.calls[alertSpy.mock.calls.length - 1];

describe('BrandReportScreen', () => {
  describe('a guest', () => {
    it('is asked to sign in and has a way back, with no network call', async () => {
      loadBrandInsight.mockResolvedValue({ state: 'guest' });
      loadMyBrandSummary.mockResolvedValue({ state: 'guest' });
      const { text, press, has } = await render();
      expect(text()).toContain('Sign in to see what members say about brands.');
      expect(text()).not.toContain('Your take');
      expect(has('Rate Zara')).toBe(false);
      expect(mockRpc).not.toHaveBeenCalled();
      await press('Go back');
      expect(mockGoBack).toHaveBeenCalledTimes(1);
    });
  });

  describe('loading', () => {
    it('shows skeleton blocks and no numbers, then the report', async () => {
      let finish!: (value: unknown) => void;
      loadBrandInsight.mockReturnValue(new Promise(resolve => { finish = resolve; }));
      const { tree, text, has } = await render();
      expect(tree.root.findAll(n => n.props.accessibilityRole === 'progressbar').length).toBeGreaterThan(0);
      expect(text()).not.toContain('Your take');
      expect(text()).not.toContain('Not enough ratings');
      expect(has('Go back')).toBe(true);
      await act(async () => {
        finish(okInsight());
      });
      expect(tree.root.findAll(n => n.props.accessibilityRole === 'progressbar')).toHaveLength(0);
      expect(text()).toContain('4.1');
    });

    it('asks both questions at once', async () => {
      await render();
      expect(loadBrandInsight).toHaveBeenCalledTimes(1);
      expect(loadBrandInsight).toHaveBeenCalledWith('Zara');
      expect(loadMyBrandSummary).toHaveBeenCalledTimes(1);
      expect(loadMyBrandSummary).toHaveBeenCalledWith('Zara');
    });
  });

  describe('offline or an error', () => {
    it('offers Try again and still shows the Your take card', async () => {
      loadBrandInsight.mockResolvedValue({ state: 'offline' });
      const { text, has } = await render();
      expect(text()).toContain('Couldn’t load what members say');
      expect(has('Try again to load your brand report')).toBe(true);
      expect(text()).toContain('Your take');
      expect(has('Rate Zara')).toBe(true);
      expect(text()).not.toContain('Not enough ratings');
      expect(text()).not.toContain(FOOTER);
    });

    it('loads again on Try again', async () => {
      loadBrandInsight.mockResolvedValueOnce({ state: 'offline' }).mockResolvedValue(okInsight());
      const { text, press } = await render();
      await press('Try again to load your brand report');
      expect(loadBrandInsight).toHaveBeenCalledTimes(2);
      expect(loadMyBrandSummary).toHaveBeenCalledTimes(2);
      expect(text()).toContain('4.1');
      expect(text()).not.toContain('Couldn’t load what members say');
    });

    it('treats an unexplained error the same way', async () => {
      loadBrandInsight.mockResolvedValue({ state: 'error', message: 'Couldn’t load what members say.' });
      const { has } = await render();
      expect(has('Try again to load your brand report')).toBe(true);
    });

    it('says the daily limit in its own words, without a retry that cannot help', async () => {
      loadBrandInsight.mockResolvedValue({
        state: 'error',
        message: 'You’ve looked at a lot of brands today. Please come back tomorrow.',
      });
      const { text, has } = await render();
      expect(text()).toContain('You’ve looked at a lot of brands today. Please come back tomorrow.');
      expect(has('Try again to load your brand report')).toBe(false);
      expect(text()).toContain('Your take');
    });

    it('shows the rating card with its own retry when only that failed', async () => {
      loadMyBrandSummary.mockResolvedValueOnce({ state: 'offline' }).mockResolvedValue(okSummary());
      const { text, press, has } = await render();
      expect(text()).toContain('4.1');
      expect(has('Try again to load your rating')).toBe(true);
      await press('Try again to load your rating');
      expect(has('Rate Zara')).toBe(true);
      expect(loadBrandInsight).toHaveBeenCalledTimes(1);
    });

    it('says one thing, not two retries, when both failed', async () => {
      loadBrandInsight.mockResolvedValue({ state: 'offline' });
      loadMyBrandSummary.mockResolvedValue({ state: 'offline' });
      const { text, has } = await render();
      expect(has('Try again to load your brand report')).toBe(true);
      expect(has('Try again to load your rating')).toBe(false);
      expect(text()).toContain('Couldn’t load your rating.');
    });

    it('does not crash when a service returns nothing usable', async () => {
      loadBrandInsight.mockResolvedValue(undefined);
      loadMyBrandSummary.mockRejectedValue(new Error('boom'));
      const { has } = await render();
      expect(has('Try again to load your brand report')).toBe(true);
    });
  });

  describe('paused', () => {
    it('says so when the server switch is off, and keeps Your take', async () => {
      loadBrandInsight.mockResolvedValue({ state: 'ok', value: { status: 'unavailable' } });
      const { text, has } = await render();
      expect(text()).toContain('Brand scores are paused right now.');
      expect(text()).toContain('Your take');
      expect(has('Rate Zara')).toBe(true);
      expect(text()).not.toContain(FOOTER);
    });

    it('says so when the server has no such function, and hides the rating part', async () => {
      loadBrandInsight.mockResolvedValue({ state: 'unavailable' });
      loadMyBrandSummary.mockResolvedValue({ state: 'unavailable' });
      const { text, has } = await render();
      expect(text()).toContain('Brand scores are paused right now.');
      expect(text()).not.toContain('Your take');
      expect(has('Rate Zara')).toBe(false);
    });
  });

  describe('not enough ratings', () => {
    it('says only that, with Your take, and shows no number or hint of how close it is', async () => {
      loadBrandInsight.mockResolvedValue({ state: 'ok', value: { status: 'insufficient' } });
      loadMyBrandSummary.mockResolvedValue(okSummary({ itemsRated: 0, avgOverall: null }));
      const { text, has } = await render();
      expect(text()).toContain('Not enough ratings yet. Add yours.');
      expect(text()).toContain('Your take');
      expect(has('Rate Zara')).toBe(true);
      expect(text()).not.toMatch(/\d/);
      expect(text()).not.toMatch(/members|close|almost/i);
      expect(text()).not.toContain(FOOTER);
      expect(has('Something look wrong?')).toBe(false);
    });
  });

  describe('a score that is ready', () => {
    it('shows the brand as it was given, the score to one decimal and the basis', async () => {
      mockBrand = '  Zara ';
      const { text } = await render();
      expect(text()).toContain('Zara');
      expect(text()).toContain('4.1');
      expect(text()).toContain('Based on 10 to 24 members');
    });

    it('shows a whole score with its decimal', async () => {
      loadBrandInsight.mockResolvedValue(okInsight({ score: 4 }));
      const { text } = await render();
      expect(text()).toContain('4.0');
    });

    it('never shows a name the server sent, only the brand that was asked for', async () => {
      const hostile = { ...okInsight().value, brandLabel: 'EVIL NAME', brand_label: 'EVIL NAME', name: 'EVIL NAME' };
      loadBrandInsight.mockResolvedValue({ state: 'ok', value: hostile });
      const { text } = await render();
      expect(text()).not.toContain('EVIL NAME');
      expect(text()).toContain('Zara');
    });

    it.each(Object.entries(BUCKET_LABELS))('says "%s" in words for its member bucket', async (bucket, label) => {
      loadBrandInsight.mockResolvedValue(okInsight({ nBucket: bucket as BrandInsightOk['nBucket'] }));
      const { text } = await render();
      expect(text()).toContain(label);
    });

    it('shows no exact member count, whatever the bucket', async () => {
      loadBrandInsight.mockResolvedValue(okInsight({ ...FULL, nBucket: '100+' }));
      const { text, pieces } = await render();
      expect(text()).toContain('Based on 100 or more members');
      for (const piece of pieces()) {
        expect(piece).not.toMatch(/\d+\s*(members|people|ratings|reviews|raters|voters)\b/i);
        expect(piece).not.toMatch(/\bn\s*=/i);
      }
    });

    it('shows nothing the server did not mean to send (counts, ids, names) even if they arrive', async () => {
      const extras = { count: 137, n: 137, members: 137, memberCount: 137, userId: 'u-9', itemIds: ['i-1'], note: 'private note' };
      loadBrandInsight.mockResolvedValue({ state: 'ok', value: { ...okInsight(FULL).value, ...extras } });
      const { text } = await render();
      expect(text()).not.toContain('137');
      expect(text()).not.toContain('u-9');
      expect(text()).not.toContain('i-1');
      expect(text()).not.toContain('private note');
    });

    it('has the footer and the report link', async () => {
      const { text, has } = await render();
      expect(text()).toContain(FOOTER);
      expect(has('Something look wrong?')).toBe(true);
    });

    describe('with everything the server can send', () => {
      beforeEach(() => {
        loadBrandInsight.mockResolvedValue(okInsight(FULL));
      });

      it('shows every section with its rows', async () => {
        const { text } = await render();
        const shown = text();
        for (const title of SECTION_TITLES) {
          expect(shown).toContain(title);
        }
        for (const row of ['Feel', 'Comfort', 'Holding up', 'Would buy again', 'Quality', 'Size consistency', 'Value']) {
          expect(shown).toContain(row);
        }
        for (const number of ['4.4', '4.2', '3.9', '4.0', '3.5', '3.8']) {
          expect(shown).toContain(number);
        }
        expect(shown).toContain('75%');
      });

      it('shows the fit as three shares', async () => {
        const { text } = await render();
        expect(text()).toContain('Runs small');
        expect(text()).toContain('10%');
        expect(text()).toContain('True to size');
        expect(text()).toContain('70%');
        expect(text()).toContain('Runs large');
        expect(text()).toContain('20%');
      });

      it('shows what people say as chips with percentages', async () => {
        const { text } = await render();
        expect(text()).toContain('Soft 70%');
        expect(text()).toContain('Breathable 55%');
      });

      it('shows fabrics and types with their scores', async () => {
        const { text } = await render();
        const shown = text();
        expect(shown).toContain('Cotton');
        expect(shown).toContain('Polyester');
        expect(shown).toContain('Tops');
        expect(shown).toContain('Feel 4.5');
        expect(shown).toContain('Holding up 4.1');
        expect(shown).toContain('Feel 4.2');
        expect(shown.indexOf('By fabric')).toBeLessThan(shown.indexOf('Cotton'));
        expect(shown.indexOf('By type')).toBeLessThan(shown.indexOf('Tops'));
      });

      it('puts Your take after the report and the footer last', async () => {
        const { text } = await render();
        const shown = text();
        expect(shown.indexOf('By type')).toBeLessThan(shown.indexOf('Your take'));
        expect(shown.indexOf('Your take')).toBeLessThan(shown.indexOf('Members’ opinions'));
      });

      it('has none of the strings the other screens forbid', async () => {
        const { text } = await render();
        expect(text()).not.toMatch(/Brand:|Color: |Material: /);
        expect(text().startsWith('From ')).toBe(false);
      });

      it('shows at most the rows the service allows', async () => {
        const slices = Array.from({ length: 6 }, (_v, i) => ({
          kind: 'material' as const,
          key: `fibre${i}`,
          nBucket: '10-24' as const,
          overall: 3 + i / 10,
        }));
        loadBrandInsight.mockResolvedValue(okInsight({ ...FULL, slices }));
        const { text } = await render();
        expect(text()).toContain('Fibre5');
        expect(text()).not.toContain('Cotton');
      });

      it('makes a readable name of a key', async () => {
        loadBrandInsight.mockResolvedValue(
          okInsight({ slices: [{ kind: 'category', key: 'knit_tops', nBucket: '25-99', overall: 4 }] }),
        );
        const { text } = await render();
        expect(text()).toContain('Knit tops');
      });
    });

    describe('sections are only there when the server sent their numbers', () => {
      const without = async (over: Partial<BrandInsightOk>, absent: string[], present: string[] = []) => {
        loadBrandInsight.mockResolvedValue(okInsight(over));
        const { text } = await render();
        for (const title of absent) {
          expect(text()).not.toContain(title);
        }
        for (const title of present) {
          expect(text()).toContain(title);
        }
        return text();
      };

      it('shows only the hero, Your take and the footer for a bare score', async () => {
        const shown = await without({}, SECTION_TITLES);
        expect(shown).toContain('4.1');
        expect(shown).toContain('Your take');
        expect(shown).toContain('Members’ opinions');
      });

      it('shows On the pieces with only the rows that came', async () => {
        const shown = await without(
          { item: { feel: 4.4 } },
          ['How it fits', 'On the brand', 'People say', 'By fabric', 'By type', 'Comfort', 'Holding up', 'Would buy again'],
          ['On the pieces', 'Feel'],
        );
        expect(shown).toContain('4.4');
      });

      it('shows On the pieces for a lone would-buy-again percentage', async () => {
        await without({ item: { wouldBuyAgainPct: 60 } }, ['How it fits', 'Feel'], ['On the pieces', 'Would buy again', '60%']);
      });

      it('shows How it fits only with a fit split', async () => {
        await without({ item: { feel: 4 } }, ['How it fits', 'Runs small'], ['On the pieces']);
        await without(
          { item: { fit: { runsSmall: 5, trueToSize: 80, runsLarge: 15 } } },
          ['On the pieces'],
          ['How it fits', 'True to size', '80%'],
        );
      });

      it('shows On the brand with only the rows that came', async () => {
        const shown = await without({ brand: { value: 3.8 } }, ['Quality', 'Size consistency', 'On the pieces'], ['On the brand', 'Value']);
        expect(shown).toContain('3.8');
      });

      it('shows People say only when there are chips', async () => {
        await without({ traits: [] }, ['People say']);
        await without({ traits: [{ group: 'touch', tag: 'silky', pct: 40 }] }, [], ['People say', 'Silky 40%']);
      });

      it('shows each slice section on its own', async () => {
        await without(
          { slices: [{ kind: 'material', key: 'wool', nBucket: '10-24', overall: 4 }] },
          ['By type'],
          ['By fabric', 'Wool'],
        );
        await without(
          { slices: [{ kind: 'category', key: 'shoes', nBucket: '10-24', overall: 4 }] },
          ['By fabric'],
          ['By type', 'Shoes'],
        );
      });
    });

    describe('a score below the usual number of members', () => {
      it('shows only the hero and its basis, even if more arrives', async () => {
        loadBrandInsight.mockResolvedValue(okInsight({ ...FULL, nBucket: 'under_10', score: 3.5 }));
        const { text } = await render();
        const shown = text();
        expect(shown).toContain('3.5');
        expect(shown).toContain('Based on fewer than 10 members');
        for (const title of SECTION_TITLES) {
          expect(shown).not.toContain(title);
        }
        expect(shown).not.toContain('Soft 70%');
        expect(shown).toContain('Your take');
      });
    });
  });

  describe('Something look wrong?', () => {
    it('offers the three reasons', async () => {
      const { press } = await render();
      await press('Something look wrong?');
      const [title, message, buttons, options] = lastAlert();
      expect(title).toBe('Something look wrong?');
      expect(typeof message).toBe('string');
      expect(buttons.map((b: any) => b.text)).toEqual(['Looks manipulated', 'Looks inaccurate', 'Something else', 'Cancel']);
      expect(buttons[3].style).toBe('cancel');
      expect(options).toEqual({ cancelable: true });
    });

    it('leaves out Cancel on Android, which shows three buttons and closes on a tap outside', async () => {
      Platform.OS = 'android';
      const { press } = await render();
      await press('Something look wrong?');
      expect(lastAlert()[2].map((b: any) => b.text)).toEqual(['Looks manipulated', 'Looks inaccurate', 'Something else']);
    });

    it.each([
      ['Looks manipulated', 'looks_manipulated'],
      ['Looks inaccurate', 'inaccurate'],
      ['Something else', 'other'],
    ])('sends "%s" as %s and says thanks', async (label, reason) => {
      const { press } = await render();
      await press('Something look wrong?');
      const choice = lastAlert()[2].find((b: any) => b.text === label);
      await act(async () => {
        choice.onPress();
      });
      expect(reportBrandInsight).toHaveBeenCalledTimes(1);
      expect(reportBrandInsight).toHaveBeenCalledWith('Zara', reason);
      expect(lastAlert()[0]).toBe('Thanks. We’ll take a look.');
    });

    it('sends nothing until a reason is chosen', async () => {
      const { press } = await render();
      await press('Something look wrong?');
      expect(reportBrandInsight).not.toHaveBeenCalled();
    });

    it('sends one report when the reason is chosen twice', async () => {
      let finish!: () => void;
      reportBrandInsight.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
      const { press } = await render();
      await press('Something look wrong?');
      const choice = lastAlert()[2][0];
      await act(async () => {
        choice.onPress();
        choice.onPress();
      });
      expect(reportBrandInsight).toHaveBeenCalledTimes(1);
      await act(async () => {
        finish();
      });
    });

    it('says why it failed and offers to email support', async () => {
      reportBrandInsight.mockRejectedValue(new Error('You’ve sent a lot of reports today. Please try again tomorrow.'));
      const { press } = await render();
      await press('Something look wrong?');
      await act(async () => {
        lastAlert()[2][1].onPress();
      });
      const [title, message, buttons] = lastAlert();
      expect(title).toBe('Couldn’t send that');
      expect(message).toBe('You’ve sent a lot of reports today. Please try again tomorrow.');
      expect(buttons.map((b: any) => b.text)).toEqual(['Email us', 'OK']);
      expect(openUrlSpy).not.toHaveBeenCalled();
      await act(async () => {
        buttons[0].onPress();
      });
      expect(openUrlSpy).toHaveBeenCalledWith(SUPPORT_MAILTO);
    });

    it('tells where to write when the mail app cannot be opened', async () => {
      reportBrandInsight.mockRejectedValue(new Error('This isn’t available yet.'));
      openUrlSpy.mockRejectedValue(new Error('no mail app'));
      const { press } = await render();
      await press('Something look wrong?');
      await act(async () => {
        lastAlert()[2][0].onPress();
      });
      await act(async () => {
        lastAlert()[2][0].onPress();
      });
      expect(openUrlSpy).toHaveBeenCalledWith(SUPPORT_MAILTO);
      expect(lastAlert()[0]).toBe('Couldn’t open mail');
      expect(lastAlert()[1]).toContain(SUPPORT_EMAIL);
    });

    it('copes with a mail link that throws at once', async () => {
      reportBrandInsight.mockRejectedValue(new Error('x'));
      openUrlSpy.mockImplementation(() => {
        throw new Error('sync failure');
      });
      const { press } = await render();
      await press('Something look wrong?');
      await act(async () => {
        lastAlert()[2][0].onPress();
      });
      await act(async () => {
        lastAlert()[2][0].onPress();
      });
      expect(lastAlert()[0]).toBe('Couldn’t open mail');
    });

    it('can be used again after a failure', async () => {
      reportBrandInsight.mockRejectedValueOnce(new Error('x')).mockResolvedValue(undefined);
      const { press } = await render();
      await press('Something look wrong?');
      await act(async () => {
        lastAlert()[2][0].onPress();
      });
      await press('Something look wrong?');
      await act(async () => {
        lastAlert()[2][0].onPress();
      });
      expect(reportBrandInsight).toHaveBeenCalledTimes(2);
      expect(lastAlert()[0]).toBe('Thanks. We’ll take a look.');
    });
  });

  describe('Your take', () => {
    it('shows the average of the person’s own pieces and the Rate button', async () => {
      const { text, has } = await render();
      expect(text()).toContain('Your take');
      expect(text()).toContain('Your Zara pieces: 3.8 across 4 rated');
      expect(has('Rate Zara')).toBe(true);
      expect(has('Edit your rating of Zara')).toBe(false);
    });

    it('says when none of their pieces are rated yet', async () => {
      loadMyBrandSummary.mockResolvedValue(okSummary({ itemsRated: 0, avgOverall: null }));
      const { text } = await render();
      expect(text()).toContain('You haven’t rated any Zara pieces yet.');
      expect(text()).not.toContain('across');
    });

    it('explains the owner rule instead of offering a button', async () => {
      loadMyBrandSummary.mockResolvedValue(okSummary({ itemsRated: 0, avgOverall: null, canRateBrand: false }));
      const { text, has } = await render();
      expect(text()).toContain('Rate Zara once you own something from it.');
      expect(has('Rate Zara')).toBe(false);
    });

    it('shows their own brand rating, kept private, with a way to edit it', async () => {
      loadMyBrandSummary.mockResolvedValue(okSummary({ brandRating: rated(), canRateBrand: true }));
      const { text, has } = await render();
      expect(text()).toContain('Your rating');
      expect(text()).toContain('Overall');
      expect(text()).toContain('Quality');
      expect(text()).toContain('Value');
      expect(text()).not.toContain('Size consistency Size');
      expect(text()).toContain('Private to you');
      expect(has('Edit your rating of Zara')).toBe(true);
      expect(has('Rate Zara')).toBe(false);
    });

    it('says when their rating counts toward brand insights', async () => {
      loadMyBrandSummary.mockResolvedValue(okSummary({ brandRating: rated({ contributed: true }) }));
      const { text } = await render();
      expect(text()).toContain('Counts toward brand insights');
      expect(text()).not.toContain('Private to you');
    });

    it('keeps a rated brand editable even when they no longer own anything of it', async () => {
      loadMyBrandSummary.mockResolvedValue(okSummary({ brandRating: rated(), canRateBrand: true, itemsRated: 0, avgOverall: null }));
      const { has } = await render();
      expect(has('Edit your rating of Zara')).toBe(true);
    });
  });

  describe('rating the brand', () => {
    const open = async () => {
      const screen = await render();
      await screen.press('Rate Zara');
      return screen;
    };

    it('opens the sheet from the Rate button, with the consent state and request of the hook', async () => {
      mockConsent.granted = false;
      const { tree, scale } = await open();
      expect(scale('Overall rating')).toBeDefined();
      expect(scale('Overall rating').props.value).toBeNull();
      const { default: Sheet } = jest.requireActual('../../src/components/RateBrandSheet');
      const sheet = tree.root.findByType(Sheet);
      expect(sheet.props.visible).toBe(true);
      expect(sheet.props.brand).toBe('Zara');
      expect(sheet.props.consentGranted).toBe(false);
      expect(sheet.props.onRequestConsent).toBe(mockConsent.requestConsent);
      expect(sheet.props.initial).toBeNull();
    });

    it('keeps the sheet closed until asked', async () => {
      const { tree } = await render();
      const { default: Sheet } = jest.requireActual('../../src/components/RateBrandSheet');
      expect(tree.root.findByType(Sheet).props.visible).toBe(false);
    });

    it('opens an existing rating for editing with its stored values', async () => {
      loadMyBrandSummary.mockResolvedValue(okSummary({ brandRating: rated() }));
      const screen = await render();
      await screen.press('Edit your rating of Zara');
      expect(screen.scale('Overall rating').props.value).toBe(4);
      expect(screen.scale('Quality').props.value).toBe(3);
      expect(screen.scale('Value').props.value).toBe(5);
      expect(screen.has('Remove rating')).toBe(true);
    });

    it('saves, closes the sheet and reads the person’s summary again', async () => {
      saveBrandRating.mockResolvedValue({ contributed: true, blocked: null });
      loadMyBrandSummary.mockResolvedValueOnce(okSummary()).mockResolvedValue(
        okSummary({ brandRating: rated({ contributed: true }) }),
      );
      const screen = await open();
      await act(async () => {
        screen.scale('Overall rating').props.onChange(4);
      });
      await screen.press('Save');
      expect(saveBrandRating).toHaveBeenCalledWith('Zara', {
        overall: 4,
        quality: null,
        fitConsistency: null,
        value: null,
        contribute: true,
      });
      const { default: Sheet } = jest.requireActual('../../src/components/RateBrandSheet');
      expect(screen.tree.root.findByType(Sheet).props.visible).toBe(false);
      expect(loadMyBrandSummary).toHaveBeenCalledTimes(2);
      expect(loadBrandInsight).toHaveBeenCalledTimes(1);
      expect(screen.text()).toContain('Counts toward brand insights');
      expect(screen.has('Edit your rating of Zara')).toBe(true);
    });

    it('says quietly when the rating was kept private because nothing of the brand is worn', async () => {
      saveBrandRating.mockResolvedValue({ contributed: false, blocked: 'not_worn' });
      const screen = await open();
      await act(async () => {
        screen.scale('Overall rating').props.onChange(4);
      });
      await screen.press('Save');
      expect(screen.text()).toContain('Saved privately. Brand insights count brands you have worn something from.');
    });

    it('then tells the sheet nothing of the brand is worn, so its switch is off with the reason', async () => {
      saveBrandRating.mockResolvedValue({ contributed: false, blocked: 'not_worn' });
      const screen = await open();
      await act(async () => {
        screen.scale('Overall rating').props.onChange(4);
      });
      await screen.press('Save');
      const { default: Sheet } = jest.requireActual('../../src/components/RateBrandSheet');
      expect(screen.tree.root.findByType(Sheet).props.hasWornPiece).toBe(false);
    });

    it('forgets that when a later save counts', async () => {
      saveBrandRating
        .mockResolvedValueOnce({ contributed: false, blocked: 'not_worn' })
        .mockResolvedValueOnce({ contributed: true, blocked: null });
      const screen = await open();
      await act(async () => {
        screen.scale('Overall rating').props.onChange(4);
      });
      await screen.press('Save');
      await screen.press('Rate Zara');
      await act(async () => {
        screen.scale('Overall rating').props.onChange(4);
      });
      await screen.press('Save');
      const { default: Sheet } = jest.requireActual('../../src/components/RateBrandSheet');
      expect(screen.tree.root.findByType(Sheet).props.hasWornPiece).toBeUndefined();
    });

    it('says quietly when the agreement was out of date, and reads it again', async () => {
      saveBrandRating.mockResolvedValue({ contributed: false, blocked: 'no_consent' });
      const screen = await open();
      await act(async () => {
        screen.scale('Overall rating').props.onChange(4);
      });
      await screen.press('Save');
      expect(screen.text()).toContain('Saved privately. Agree to brand insights first to add it.');
      expect(mockConsent.refresh).toHaveBeenCalledTimes(1);
    });

    it('clears the quiet line when the sheet is opened again', async () => {
      saveBrandRating.mockResolvedValue({ contributed: false, blocked: 'no_consent' });
      loadMyBrandSummary.mockResolvedValue(okSummary({ brandRating: rated() }));
      const screen = await render();
      await screen.press('Edit your rating of Zara');
      await screen.press('Save');
      expect(screen.text()).toContain('Saved privately.');
      await screen.press('Edit your rating of Zara');
      expect(screen.text()).not.toContain('Saved privately.');
    });

    it('says nothing extra after a plain private save', async () => {
      const screen = await open();
      await act(async () => {
        screen.scale('Overall rating').props.onChange(4);
      });
      await screen.press('Save');
      expect(screen.text()).not.toContain('Saved privately');
    });

    it('removes the rating after a confirmation and reads the summary again', async () => {
      loadMyBrandSummary.mockResolvedValueOnce(okSummary({ brandRating: rated() })).mockResolvedValue(okSummary());
      const screen = await render();
      await screen.press('Edit your rating of Zara');
      await screen.press('Remove rating');
      await act(async () => {
        lastAlert()[2][1].onPress();
      });
      expect(deleteBrandRating).toHaveBeenCalledWith('Zara');
      expect(loadMyBrandSummary).toHaveBeenCalledTimes(2);
      expect(screen.has('Rate Zara')).toBe(true);
      const { default: Sheet } = jest.requireActual('../../src/components/RateBrandSheet');
      expect(screen.tree.root.findByType(Sheet).props.visible).toBe(false);
    });

    it('closes the sheet on Cancel and changes nothing', async () => {
      const screen = await open();
      await screen.press('Cancel');
      const { default: Sheet } = jest.requireActual('../../src/components/RateBrandSheet');
      expect(screen.tree.root.findByType(Sheet).props.visible).toBe(false);
      expect(saveBrandRating).not.toHaveBeenCalled();
      expect(loadMyBrandSummary).toHaveBeenCalledTimes(1);
    });

    it('renders the consent sheet of the hook once', async () => {
      mockConsent.sheet = React.createElement('MockConsentSheet');
      const { tree } = await render();
      expect(tree.root.findAll(n => (n.type as unknown) === 'MockConsentSheet')).toHaveLength(1);
    });

    it('has no sheet for a brand it cannot rate', async () => {
      loadMyBrandSummary.mockResolvedValue({ state: 'unavailable' });
      const { tree } = await render();
      const { default: Sheet } = jest.requireActual('../../src/components/RateBrandSheet');
      expect(tree.root.findAllByType(Sheet)).toHaveLength(0);
    });
  });

  describe('which brand', () => {
    it('loads again when the route brand changes', async () => {
      const { rerender, text } = await render();
      mockBrand = 'Mango';
      loadBrandInsight.mockResolvedValue(okInsight({ score: 2.4 }));
      await rerender();
      expect(loadBrandInsight).toHaveBeenLastCalledWith('Mango');
      expect(loadMyBrandSummary).toHaveBeenLastCalledWith('Mango');
      expect(text()).toContain('Mango');
      expect(text()).toContain('2.4');
    });

    it.each([undefined, null, '', '   ', 'A', '!!', 42])('shows a plain line and no rating for the brand %j', async brand => {
      mockBrand = brand;
      const { text, has, tree } = await render();
      expect(text()).toContain('There’s nothing to show for this brand yet.');
      expect(text()).not.toContain('Your take');
      expect(has('Go back')).toBe(true);
      const { default: Sheet } = jest.requireActual('../../src/components/RateBrandSheet');
      expect(tree.root.findAllByType(Sheet)).toHaveLength(0);
    });
  });

  describe('lifetime', () => {
    it('does nothing after an unmount while the first load is on its way', async () => {
      let finish!: (value: unknown) => void;
      loadBrandInsight.mockReturnValue(new Promise(resolve => { finish = resolve; }));
      const { tree } = await render();
      await act(async () => {
        tree.unmount();
      });
      await act(async () => {
        finish(okInsight());
      });
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('lets the newest load win over a slower older one', async () => {
      let slow!: (value: unknown) => void;
      loadBrandInsight
        .mockReturnValueOnce(new Promise(resolve => { slow = resolve; }))
        .mockResolvedValue(okInsight({ score: 2.2 }));
      const { rerender, text } = await render();
      mockBrand = 'Mango';
      await rerender();
      await act(async () => {
        slow(okInsight({ score: 4.9 }));
      });
      expect(text()).toContain('2.2');
      expect(text()).not.toContain('4.9');
    });
  });
});
