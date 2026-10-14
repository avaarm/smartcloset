/**
 * The brand strip (documentation/design/quality-ratings.md, 3.4 and 6.2): one line that appears only when the
 * server says `ok`, waits 600 ms after the brand text stops changing (Add/Edit item), needs two characters of
 * normalised brand, and is silent about everything else. With brand insights off it renders null and touches
 * neither the session, the network nor the console.
 */
import 'react-native';
import React from 'react';
import renderer, { act } from 'react-test-renderer';

let mockInsightsOn = true;
jest.mock('../../src/config/ratingFlags', () => ({
  get RATINGS_ENABLED() {
    return mockInsightsOn;
  },
  get BRAND_INSIGHTS_ENABLED() {
    return mockInsightsOn;
  },
  TAG_SCAN_ENABLED: false,
  TAG_MODEL_FALLBACK_ENABLED: false,
  TAG_OCR_FEATURE: 'TEXT_DETECTION',
  ratingsActive: () => mockInsightsOn,
  brandInsightsActive: () => mockInsightsOn,
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

// Each test either scripts the answer or lets the real service run against the supabase mock above.
jest.mock('../../src/services/brandInsightService', () => {
  const actual = jest.requireActual('../../src/services/brandInsightService');
  return { ...actual, loadBrandInsight: jest.fn() };
});

import BrandInsightStrip from '../../src/components/BrandInsightStrip';
import * as insightService from '../../src/services/brandInsightService';

const loadBrandInsight = insightService.loadBrandInsight as jest.Mock;
const realInsight = jest.requireActual('../../src/services/brandInsightService');

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

const okInsight = (score: number) => ({
  state: 'ok' as const,
  value: { status: 'ok' as const, nBucket: '10-24' as const, score, asOf: '2026-10-14', item: {}, brand: {}, traits: [], slices: [] },
});

let errorSpy: jest.SpyInstance;

beforeEach(() => {
  jest.useFakeTimers();
  mockInsightsOn = true;
  mockGetSession.mockReset().mockResolvedValue({ data: { session: { user: { id: 'u1' } } }, error: null });
  mockRpc.mockReset().mockResolvedValue({ data: null, error: null });
  loadBrandInsight.mockReset().mockResolvedValue(okInsight(4.1));
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  expect(errorSpy).not.toHaveBeenCalled();
  errorSpy.mockRestore();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

type StripProps = React.ComponentProps<typeof BrandInsightStrip>;

const mount = async (props: Partial<StripProps> = {}) => {
  const onOpen = jest.fn();
  const all: StripProps = { brand: 'Zara', onOpen, variant: 'details', ...props };
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<BrandInsightStrip {...all} />);
  });
  const update = async (next: Partial<StripProps>) => {
    await act(async () => {
      tree.update(<BrandInsightStrip {...all} {...next} />);
    });
  };
  const wait = async (ms: number) => {
    await act(async () => {
      jest.advanceTimersByTime(ms);
    });
  };
  const text = () => flatten(tree.toJSON());
  const strip = (label: string) =>
    tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
  return { tree, onOpen, update, wait, text, strip };
};

describe('BrandInsightStrip', () => {
  describe('with brand insights off', () => {
    it('renders null and touches neither the session, the network nor the console', async () => {
      mockInsightsOn = false;
      const { tree, wait } = await mount({ variant: 'add' });
      await wait(5000);
      expect(tree.toJSON()).toBeNull();
      expect(mockGetSession).not.toHaveBeenCalled();
      expect(mockRpc).not.toHaveBeenCalled();
      expect(loadBrandInsight).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('does the same through the real service', async () => {
      mockInsightsOn = false;
      loadBrandInsight.mockImplementation(realInsight.loadBrandInsight);
      const { tree, wait } = await mount();
      await wait(5000);
      expect(tree.toJSON()).toBeNull();
      expect(mockGetSession).not.toHaveBeenCalled();
      expect(mockRpc).not.toHaveBeenCalled();
    });
  });

  describe('the line', () => {
    it('reads "Members rate {brand} {score} overall" with one decimal', async () => {
      const { text } = await mount({ brand: 'Zara' });
      expect(text()).toContain('Members rate Zara 4.1 overall');
    });

    it('shows a whole score with its decimal', async () => {
      loadBrandInsight.mockResolvedValue(okInsight(4));
      const { text } = await mount();
      expect(text()).toContain('Members rate Zara 4.0 overall');
    });

    it('is a button labelled "{brand} brand report" that opens the brand as typed', async () => {
      const { strip, onOpen } = await mount({ brand: '  Zara  ' });
      const found = strip('Zara brand report');
      expect(found.length).toBeGreaterThan(0);
      expect(found[0].props.accessibilityRole).toBe('button');
      await act(async () => {
        found[0].props.onPress();
      });
      expect(onOpen).toHaveBeenCalledTimes(1);
      expect(onOpen).toHaveBeenCalledWith('Zara');
    });

    it('names the brand exactly as typed, whatever its casing', async () => {
      const { text } = await mount({ brand: 'ZARA' });
      expect(text()).toContain('Members rate ZARA 4.1 overall');
      expect(loadBrandInsight).toHaveBeenCalledWith('ZARA');
    });

    it('contains none of the strings the host screens forbid', async () => {
      const { text } = await mount({ brand: 'Zara' });
      const shown = text();
      expect(shown).not.toMatch(/Brand:|Color: |Material: /);
      expect(shown.startsWith('From ')).toBe(false);
    });

    it('works in both variants', async () => {
      const details = await mount({ variant: 'details' });
      expect(details.text()).toContain('Members rate Zara');
      const add = await mount({ variant: 'add' });
      await add.wait(600);
      expect(add.text()).toContain('Members rate Zara');
    });
  });

  describe('waiting for the typing to stop (variant add)', () => {
    it('asks once, 600 ms after the last change', async () => {
      const { text, wait } = await mount({ variant: 'add' });
      await wait(599);
      expect(loadBrandInsight).not.toHaveBeenCalled();
      expect(text()).toBe('');
      await wait(1);
      expect(loadBrandInsight).toHaveBeenCalledTimes(1);
      expect(loadBrandInsight).toHaveBeenCalledWith('Zara');
      expect(text()).toContain('Members rate Zara 4.1 overall');
    });

    it('turns several quick edits into one lookup of the latest text', async () => {
      const { update, wait } = await mount({ variant: 'add', brand: 'Z' });
      await update({ brand: 'Za' });
      await wait(300);
      await update({ brand: 'Zar' });
      await wait(300);
      await update({ brand: 'Zara' });
      await wait(599);
      expect(loadBrandInsight).not.toHaveBeenCalled();
      await wait(1);
      expect(loadBrandInsight).toHaveBeenCalledTimes(1);
      expect(loadBrandInsight).toHaveBeenCalledWith('Zara');
    });

    it('steps aside as soon as the text stops matching the brand it was read for', async () => {
      const { update, wait, text } = await mount({ variant: 'add' });
      await wait(600);
      expect(text()).toContain('Members rate Zara');
      loadBrandInsight.mockResolvedValue(okInsight(3.2));
      await update({ brand: 'Zaras' });
      expect(text()).toBe('');
      await wait(600);
      expect(text()).toContain('Members rate Zaras 3.2 overall');
    });

    it('keeps the line when only the casing or the spaces change', async () => {
      const { update, text } = await mount({ variant: 'details' });
      expect(text()).toContain('Members rate Zara');
      await update({ brand: ' zara ' });
      expect(text()).toContain('Members rate zara');
    });

    it('looks up a details strip at once', async () => {
      const { wait } = await mount({ variant: 'details' });
      expect(loadBrandInsight).toHaveBeenCalledTimes(1);
      await wait(5000);
      expect(loadBrandInsight).toHaveBeenCalledTimes(1);
    });
  });

  describe('minimum length', () => {
    it.each(['', '   ', 'Z', '.', '!!', '--', ' é '])('makes no lookup and shows nothing for %j', async brand => {
      // "é" folds to "e": one character, still too short.
      const { text, wait } = await mount({ brand, variant: 'add' });
      await wait(2000);
      expect(loadBrandInsight).not.toHaveBeenCalled();
      expect(text()).toBe('');
    });

    it('reads "&" as "and", as the server does', async () => {
      const { wait } = await mount({ brand: '&', variant: 'add' });
      await wait(600);
      expect(loadBrandInsight).toHaveBeenCalledWith('&');
    });

    it('looks up two characters of normalised brand', async () => {
      const { wait, text } = await mount({ brand: 'H&M', variant: 'add' });
      await wait(600);
      expect(loadBrandInsight).toHaveBeenCalledWith('H&M');
      expect(text()).toContain('Members rate H&M 4.1 overall');
    });

    it('counts the normalised text, not the typed length', async () => {
      const { wait } = await mount({ brand: ' - A - ', variant: 'add' });
      await wait(2000);
      expect(loadBrandInsight).not.toHaveBeenCalled();
    });

    it('stops showing a score when the text becomes too short', async () => {
      const { update, text, wait } = await mount({ brand: 'Zara', variant: 'add' });
      await wait(600);
      expect(text()).toContain('Members rate');
      await update({ brand: 'Z' });
      expect(text()).toBe('');
      await wait(2000);
      expect(loadBrandInsight).toHaveBeenCalledTimes(1);
    });

    it('treats a missing brand as empty', async () => {
      const { text, wait } = await mount({ brand: undefined as unknown as string, variant: 'add' });
      await wait(2000);
      expect(text()).toBe('');
      expect(loadBrandInsight).not.toHaveBeenCalled();
    });
  });

  describe('silent unless the server says ok', () => {
    const quiet: Array<[string, unknown]> = [
      ['not enough ratings', { state: 'ok', value: { status: 'insufficient' } }],
      ['paused', { state: 'ok', value: { status: 'unavailable' } }],
      ['a guest', { state: 'guest' }],
      ['a server without the function', { state: 'unavailable' }],
      ['offline', { state: 'offline' }],
      ['a daily limit', { state: 'error', message: 'You’ve looked at a lot of brands today. Please come back tomorrow.' }],
      ['an unexplained error', { state: 'error' }],
    ];

    it.each(quiet)('shows nothing for %s', async (_name, answer) => {
      loadBrandInsight.mockResolvedValue(answer);
      const { tree, wait } = await mount({ variant: 'add' });
      await wait(600);
      expect(tree.toJSON()).toBeNull();
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('shows nothing when the service itself rejects', async () => {
      loadBrandInsight.mockRejectedValue(new Error('boom'));
      const { tree, wait } = await mount({ variant: 'add' });
      await wait(600);
      expect(tree.toJSON()).toBeNull();
    });

    it('shows nothing for a guest, through the real service, without a network call', async () => {
      loadBrandInsight.mockImplementation(realInsight.loadBrandInsight);
      mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
      const { tree, wait } = await mount({ variant: 'add' });
      await wait(600);
      expect(tree.toJSON()).toBeNull();
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('shows nothing when the server is offline, through the real service', async () => {
      loadBrandInsight.mockImplementation(realInsight.loadBrandInsight);
      mockRpc.mockResolvedValue({ data: null, error: { message: 'Network request failed' } });
      realInsight.clearBrandInsightCache();
      const { tree, wait } = await mount({ brand: 'Offlinebrand', variant: 'add' });
      await wait(600);
      expect(mockRpc).toHaveBeenCalledTimes(1);
      expect(tree.toJSON()).toBeNull();
    });

    it('reads a real ok answer through the real service', async () => {
      loadBrandInsight.mockImplementation(realInsight.loadBrandInsight);
      realInsight.clearBrandInsightCache();
      mockRpc.mockResolvedValue({
        data: { status: 'ok', n_bucket: '25-99', score: 3.7, as_of: '2026-10-14', item: { feel: 4 } },
        error: null,
      });
      const { text, wait } = await mount({ brand: 'Realbrand', variant: 'add' });
      await wait(600);
      expect(mockRpc).toHaveBeenCalledWith('get_brand_insight', { p_brand: 'Realbrand' });
      expect(text()).toContain('Members rate Realbrand 3.7 overall');
    });

    it('removes the line when a later answer is not ok', async () => {
      const { update, text, wait } = await mount({ variant: 'add' });
      await wait(600);
      expect(text()).toContain('Members rate');
      loadBrandInsight.mockResolvedValue({ state: 'ok', value: { status: 'insufficient' } });
      await update({ brand: 'Other' });
      await wait(600);
      expect(text()).toBe('');
    });
  });

  describe('lifetime', () => {
    it('sets nothing and logs nothing when the answer arrives after unmount', async () => {
      let resolve!: (value: unknown) => void;
      loadBrandInsight.mockReturnValue(new Promise(r => { resolve = r; }));
      const { tree, wait } = await mount({ variant: 'details' });
      await act(async () => {
        tree.unmount();
      });
      await act(async () => {
        resolve(okInsight(4.1));
      });
      await wait(2000);
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('cancels the wait when it unmounts before the lookup', async () => {
      const { tree, wait } = await mount({ variant: 'add' });
      await act(async () => {
        tree.unmount();
      });
      await wait(2000);
      expect(loadBrandInsight).not.toHaveBeenCalled();
    });

    it('ignores an answer for text that has been replaced', async () => {
      let first!: (value: unknown) => void;
      loadBrandInsight
        .mockReturnValueOnce(new Promise(r => { first = r; }))
        .mockResolvedValue(okInsight(2.5));
      const { update, text, wait } = await mount({ brand: 'Zara', variant: 'details' });
      await update({ brand: 'Mango' });
      expect(text()).toContain('Members rate Mango 2.5 overall');
      await act(async () => {
        first(okInsight(4.9));
      });
      expect(text()).toContain('Members rate Mango 2.5 overall');
      expect(text()).not.toContain('4.9');
      await wait(1000);
    });
  });
});
