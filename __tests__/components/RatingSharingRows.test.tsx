/**
 * The rating rows in Settings > Community (documentation/design/quality-ratings.md, 3.5): nothing at all with
 * ratings off, only "Delete all my ratings" while brand insights are off, and the switch plus the two actions
 * when they are on. The off-flow alert has three choices, the actions are always there, and the component
 * copes with the Settings test's supabase mock, which only has auth.getSession.
 */
import 'react-native';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Alert, Switch, TextInput } from 'react-native';

let mockRatingsOn = true;
let mockInsightsOn = true;
jest.mock('../../src/config/ratingFlags', () => ({
  get RATINGS_ENABLED() {
    return mockRatingsOn;
  },
  get BRAND_INSIGHTS_ENABLED() {
    return mockInsightsOn;
  },
  TAG_SCAN_ENABLED: false,
  TAG_MODEL_FALLBACK_ENABLED: false,
  TAG_OCR_FEATURE: 'TEXT_DETECTION',
  ratingsActive: () => mockRatingsOn,
  brandInsightsActive: () => mockRatingsOn && mockInsightsOn,
  tagScanActive: () => false,
}));

const mockGetSession = jest.fn();
const mockRpc = jest.fn();
const mockFrom = jest.fn();
let mockAuthOnly = false;
jest.mock('../../src/config/supabase', () => ({
  supabase: {
    auth: { getSession: (...args: unknown[]) => mockGetSession(...args) },
    get rpc() {
      return mockAuthOnly ? undefined : mockRpc;
    },
    get from() {
      return mockAuthOnly ? undefined : mockFrom;
    },
  },
}));

// Each service function is a spy that defaults to the real one, so a test either scripts it or lets the real
// code run against the supabase mock above.
jest.mock('../../src/services/consentService', () => {
  const actual = jest.requireActual('../../src/services/consentService');
  return { ...actual, getConsent: jest.fn(), setConsent: jest.fn() };
});
jest.mock('../../src/services/ratingService', () => {
  const actual = jest.requireActual('../../src/services/ratingService');
  return {
    ...actual,
    loadMyRatingCounts: jest.fn(),
    withdrawContributions: jest.fn(),
    deleteAllMyRatings: jest.fn(),
  };
});

import RatingSharingRows from '../../src/components/RatingSharingRows';
import { useRatingConsent, type RatingConsentApi } from '../../src/components/RatingConsentSheet';
import { RATINGS_POLICY_VERSION } from '../../src/config/ratingVocabulary';
import * as consentService from '../../src/services/consentService';
import * as ratingService from '../../src/services/ratingService';

const realConsent = jest.requireActual('../../src/services/consentService');
const realRatings = jest.requireActual('../../src/services/ratingService');

const getConsent = consentService.getConsent as jest.Mock;
const setConsent = consentService.setConsent as jest.Mock;
const loadMyRatingCounts = ratingService.loadMyRatingCounts as jest.Mock;
const withdrawContributions = ratingService.withdrawContributions as jest.Mock;
const deleteAllMyRatings = ratingService.deleteAllMyRatings as jest.Mock;

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

const status = (over: Record<string, unknown> = {}) => ({
  purpose: 'share_ratings',
  granted: false,
  policyVersion: null,
  decidedAt: null,
  adultConfirmedAt: null,
  requiresAdult: true,
  currentVersion: RATINGS_POLICY_VERSION,
  needsReconsent: false,
  ...over,
});

const consentIs = (over: Record<string, unknown> = {}) =>
  getConsent.mockResolvedValue({ state: 'ok', value: status(over) });

let errorSpy: jest.SpyInstance;
let alertSpy: jest.SpyInstance;
// Consent hosts register for announcements while mounted, so a test must not leave its trees behind.
const trees: renderer.ReactTestRenderer[] = [];

beforeEach(() => {
  mockRatingsOn = true;
  mockInsightsOn = true;
  mockAuthOnly = false;
  mockGetSession.mockReset().mockResolvedValue({ data: { session: { user: { id: 'u1' } } }, error: null });
  mockRpc.mockReset().mockResolvedValue({ data: null, error: null });
  mockFrom.mockReset();
  getConsent.mockReset();
  setConsent.mockReset().mockResolvedValue(undefined);
  loadMyRatingCounts.mockReset().mockResolvedValue({ state: 'ok', value: { items: 0, brands: 0, notContributing: 0 } });
  withdrawContributions.mockReset().mockResolvedValue(undefined);
  deleteAllMyRatings.mockReset().mockResolvedValue(undefined);
  consentIs();
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(async () => {
  while (trees.length) {
    const tree = trees.pop()!;
    await act(async () => {
      tree.unmount();
    });
  }
  expect(errorSpy).not.toHaveBeenCalled();
  errorSpy.mockRestore();
  alertSpy.mockRestore();
  jest.restoreAllMocks();
});

const render = async () => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<RatingSharingRows />);
  });
  trees.push(tree);
  const text = () => flatten(tree.toJSON());
  const pressable = (label: string) =>
    tree.root.find(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
  const has = (label: string) =>
    tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function').length > 0;
  const press = async (label: string) => {
    const node = pressable(label);
    await act(async () => {
      node.props.onPress();
    });
  };
  const toggle = () =>
    tree.root.find(
      n => n.props.accessibilityLabel === 'Add my ratings to brand insights' && typeof n.props.onValueChange === 'function',
    );
  const flip = async (value: boolean) => {
    const node = toggle();
    await act(async () => {
      node.props.onValueChange(value);
    });
  };
  /** The buttons of the alert the last call opened. */
  const lastAlert = () => {
    const call = alertSpy.mock.calls[alertSpy.mock.calls.length - 1];
    return { title: call[0] as string, message: call[1] as string, buttons: (call[2] ?? []) as any[] };
  };
  const choose = async (buttonText: string) => {
    const button = lastAlert().buttons.find(b => b.text === buttonText);
    if (!button) {
      throw new Error(`no "${buttonText}" button`);
    }
    await act(async () => {
      await button.onPress?.();
    });
  };
  return { tree, text, pressable, has, press, toggle, flip, lastAlert, choose };
};

describe('RatingSharingRows with ratings off', () => {
  it('renders nothing and touches nothing', async () => {
    mockRatingsOn = false;
    const { tree } = await render();
    expect(tree.toJSON()).toBeNull();
    expect(mockGetSession).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
    expect(getConsent).not.toHaveBeenCalled();
    expect(loadMyRatingCounts).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('stays dark when only the brand-insights flag is on', async () => {
    mockRatingsOn = false;
    mockInsightsOn = true;
    const { tree } = await render();
    expect(tree.toJSON()).toBeNull();
    expect(getConsent).not.toHaveBeenCalled();
  });
});

describe('RatingSharingRows while only private ratings are on', () => {
  beforeEach(() => {
    mockInsightsOn = false;
  });

  it('shows only "Delete all my ratings", and reads nothing from the server', async () => {
    const { has, text, tree } = await render();
    expect(has('Delete all my ratings')).toBe(true);
    expect(has('Remove what I’ve added')).toBe(false);
    expect(tree.root.findAllByType(Switch)).toHaveLength(0);
    expect(text()).not.toContain('Add my ratings to brand insights');
    expect(getConsent).not.toHaveBeenCalled();
    expect(loadMyRatingCounts).not.toHaveBeenCalled();
    expect(mockGetSession).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('asks first, then deletes every rating and says so', async () => {
    const { press, lastAlert, choose } = await render();
    await press('Delete all my ratings');
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(lastAlert().title).toBe('Delete all your ratings?');
    expect(lastAlert().buttons.map(b => b.text)).toEqual(['Cancel', 'Delete all']);
    expect(deleteAllMyRatings).not.toHaveBeenCalled();

    await choose('Delete all');
    expect(deleteAllMyRatings).toHaveBeenCalledTimes(1);
    expect(lastAlert().title).toBe('Ratings deleted');
  });

  it('deletes nothing when the person cancels', async () => {
    const { press, choose } = await render();
    await press('Delete all my ratings');
    await choose('Cancel');
    expect(deleteAllMyRatings).not.toHaveBeenCalled();
  });

  it('reports a failed delete with the sentence the service gave', async () => {
    deleteAllMyRatings.mockRejectedValue(new Error('Couldn’t remove that. Check your connection and try again.'));
    const { press, choose, lastAlert } = await render();
    await press('Delete all my ratings');
    await choose('Delete all');
    expect(lastAlert()).toMatchObject({
      title: 'Couldn’t save that',
      message: 'Couldn’t remove that. Check your connection and try again.',
    });
  });
});

describe('RatingSharingRows with brand insights on', () => {
  it('lists the switch, "Remove what I’ve added" and "Delete all my ratings" in that order', async () => {
    const { text, has } = await render();
    const body = text();
    expect(body.indexOf('Add my ratings to brand insights')).toBeGreaterThanOrEqual(0);
    expect(body.indexOf('Remove what I’ve added')).toBeGreaterThan(body.indexOf('Add my ratings to brand insights'));
    expect(body.indexOf('Delete all my ratings')).toBeGreaterThan(body.indexOf('Remove what I’ve added'));
    expect(body).toContain(
      'Off by default. Includes your star ratings and the feel, comfort and fit choices you pick, never your name, photos or notes.',
    );
    expect(has('Remove what I’ve added')).toBe(true);
    expect(has('Delete all my ratings')).toBe(true);
  });

  it('holds no text field', async () => {
    const { tree } = await render();
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
  });

  describe('the switch', () => {
    it('reads off until the person agrees, and on once they have', async () => {
      const off = await render();
      expect(off.toggle().props.value).toBe(false);

      consentIs({ granted: true, policyVersion: RATINGS_POLICY_VERSION });
      const on = await render();
      expect(on.toggle().props.value).toBe(true);
    });

    it('is disabled only until the state has loaded', async () => {
      let release!: (value: unknown) => void;
      getConsent.mockReturnValue(new Promise(resolve => (release = resolve)));
      const { toggle } = await render();
      expect(toggle().props.disabled).toBe(true);
      expect(toggle().props.value).toBe(false);
      await act(async () => {
        release({ state: 'ok', value: status({ granted: true }) });
      });
      expect(toggle().props.disabled).toBe(false);
      expect(toggle().props.value).toBe(true);
    });

    it('reads off and stays usable when the state could not be loaded, so a tap tries again', async () => {
      getConsent.mockResolvedValue({ state: 'offline' });
      const { toggle, flip, text } = await render();
      expect(toggle().props.value).toBe(false);
      expect(toggle().props.disabled).toBe(false);
      await flip(true);
      expect(text()).toContain('Add your ratings to brand insights?');
    });

    it('reads off for an agreement to older wording, and turning it on offers the same sheet', async () => {
      consentIs({ granted: true, policyVersion: 'ratings-2025-01', needsReconsent: true });
      const { toggle, flip, text } = await render();
      expect(toggle().props.value).toBe(false);
      await flip(true);
      expect(text()).toContain('Add your ratings to brand insights?');
    });

    it('opens the consent sheet when turned on, and shows on after the person agrees', async () => {
      const { toggle, flip, text, tree } = await render();
      expect(text()).not.toContain('Add your ratings to brand insights?');
      await flip(true);
      expect(text()).toContain('Add your ratings to brand insights?');

      const adult = tree.root.find(
        n => n.props.accessibilityLabel === 'I’m 18 or older' && typeof n.props.onValueChange === 'function',
      );
      await act(async () => {
        adult.props.onValueChange(true);
      });
      const agree = tree.root.find(n => n.props.accessibilityLabel === 'Add new ratings' && typeof n.props.onPress === 'function');
      await act(async () => {
        agree.props.onPress();
      });
      expect(setConsent).toHaveBeenCalledWith('share_ratings', true, {
        policyVersion: RATINGS_POLICY_VERSION,
        adult: true,
        includeExisting: false,
      });
      expect(toggle().props.value).toBe(true);
      expect(text()).not.toContain('Add your ratings to brand insights?');
    });

    it('turning it off asks with exactly three choices', async () => {
      consentIs({ granted: true });
      const { flip, lastAlert } = await render();
      await flip(false);
      expect(alertSpy).toHaveBeenCalledTimes(1);
      expect(lastAlert().title).toBe('Stop adding your ratings?');
      expect(lastAlert().buttons.map(b => b.text)).toEqual(['Cancel', 'Stop adding', 'Stop and delete my ratings']);
      expect(lastAlert().buttons.map(b => b.style)).toEqual(['cancel', undefined, 'destructive']);
      expect(setConsent).not.toHaveBeenCalled();
    });

    it('Cancel changes nothing', async () => {
      consentIs({ granted: true });
      const { flip, choose, toggle } = await render();
      await flip(false);
      await choose('Cancel');
      expect(setConsent).not.toHaveBeenCalled();
      expect(deleteAllMyRatings).not.toHaveBeenCalled();
      expect(toggle().props.value).toBe(true);
    });

    it('"Stop adding" withdraws the agreement, keeps the ratings and reads the new state', async () => {
      consentIs({ granted: true });
      const { flip, choose, toggle } = await render();
      setConsent.mockImplementation(async () => consentIs({ granted: false }));
      await flip(false);
      await choose('Stop adding');
      expect(setConsent).toHaveBeenCalledWith('share_ratings', false, { policyVersion: RATINGS_POLICY_VERSION });
      expect(deleteAllMyRatings).not.toHaveBeenCalled();
      expect(getConsent).toHaveBeenCalledTimes(2);
      expect(toggle().props.value).toBe(false);
      expect(alertSpy).toHaveBeenCalledTimes(1);
    });

    it('"Stop and delete my ratings" withdraws first, then deletes', async () => {
      consentIs({ granted: true });
      const { flip, choose, toggle, lastAlert } = await render();
      const order: string[] = [];
      setConsent.mockImplementation(async () => {
        order.push('withdraw');
        consentIs({ granted: false });
      });
      deleteAllMyRatings.mockImplementation(async () => {
        order.push('delete');
      });
      await flip(false);
      await choose('Stop and delete my ratings');
      expect(order).toEqual(['withdraw', 'delete']);
      expect(toggle().props.value).toBe(false);
      expect(lastAlert().title).not.toBe('Stopped, but not deleted');
    });

    it('does not delete anything when the agreement could not be withdrawn', async () => {
      consentIs({ granted: true });
      const { flip, choose, toggle, lastAlert } = await render();
      setConsent.mockRejectedValue(new Error('You’ve made a lot of changes today. Please try again tomorrow.'));
      await flip(false);
      await choose('Stop and delete my ratings');
      expect(deleteAllMyRatings).not.toHaveBeenCalled();
      expect(lastAlert()).toMatchObject({
        title: 'Couldn’t save that',
        message: 'You’ve made a lot of changes today. Please try again tomorrow.',
      });
      expect(toggle().props.value).toBe(true);
    });

    it('says plainly when sharing stopped but the delete failed', async () => {
      consentIs({ granted: true });
      const { flip, choose, toggle, lastAlert } = await render();
      setConsent.mockImplementation(async () => consentIs({ granted: false }));
      deleteAllMyRatings.mockRejectedValue(new Error('offline'));
      await flip(false);
      await choose('Stop and delete my ratings');
      expect(lastAlert().title).toBe('Stopped, but not deleted');
      expect(lastAlert().message).toContain('no longer count toward brand insights');
      expect(lastAlert().message).toContain('Delete all my ratings');
      expect(toggle().props.value).toBe(false);
    });

    it('is disabled while a change is running', async () => {
      consentIs({ granted: true });
      const { flip, toggle } = await render();
      let release!: () => void;
      setConsent.mockReturnValue(new Promise<void>(resolve => (release = resolve)));
      await flip(false);
      let running!: Promise<void>;
      const button = (alertSpy.mock.calls[0][2] as any[]).find(b => b.text === 'Stop adding');
      await act(async () => {
        running = Promise.resolve(button.onPress());
        await Promise.resolve();
      });
      expect(toggle().props.disabled).toBe(true);
      await act(async () => {
        release();
        await running;
      });
      expect(toggle().props.disabled).toBe(false);
    });
  });

  describe('"Remove what I’ve added"', () => {
    it('is there whether or not the switch is on', async () => {
      const off = await render();
      expect(off.has('Remove what I’ve added')).toBe(true);
      consentIs({ granted: true });
      const on = await render();
      expect(on.has('Remove what I’ve added')).toBe(true);
    });

    it('is there even when the state could not be loaded', async () => {
      getConsent.mockResolvedValue({ state: 'error' });
      const { has } = await render();
      expect(has('Remove what I’ve added')).toBe(true);
    });

    it('stops every contribution, leaves the agreement alone and tells the person', async () => {
      consentIs({ granted: true });
      const { press, lastAlert, toggle } = await render();
      await press('Remove what I’ve added');
      expect(withdrawContributions).toHaveBeenCalledTimes(1);
      expect(setConsent).not.toHaveBeenCalled();
      expect(deleteAllMyRatings).not.toHaveBeenCalled();
      expect(lastAlert().title).toBe('Removed');
      expect(toggle().props.value).toBe(true);
    });

    it('can be done twice', async () => {
      const { press } = await render();
      await press('Remove what I’ve added');
      await press('Remove what I’ve added');
      expect(withdrawContributions).toHaveBeenCalledTimes(2);
    });

    it('reports a failure with the friendly sentence', async () => {
      withdrawContributions.mockRejectedValue(
        new Error('Couldn’t stop sharing your ratings. Check your connection and try again.'),
      );
      const { press, lastAlert } = await render();
      await press('Remove what I’ve added');
      expect(lastAlert()).toMatchObject({
        title: 'Couldn’t save that',
        message: 'Couldn’t stop sharing your ratings. Check your connection and try again.',
      });
    });

    it('ignores a second press while the first is running', async () => {
      let release!: () => void;
      withdrawContributions.mockReturnValue(new Promise<void>(resolve => (release = resolve)));
      const { tree, pressable } = await render();
      const node = pressable('Remove what I’ve added');
      await act(async () => {
        node.props.onPress();
        node.props.onPress();
      });
      expect(withdrawContributions).toHaveBeenCalledTimes(1);
      expect(
        tree.root.find(n => n.props.accessibilityLabel === 'Remove what I’ve added' && n.props.disabled === true),
      ).toBeTruthy();
      await act(async () => {
        release();
      });
      expect(withdrawContributions).toHaveBeenCalledTimes(1);
    });
  });

  describe('"Delete all my ratings"', () => {
    it('asks first, deletes, and reads the state again', async () => {
      const { press, choose, lastAlert } = await render();
      await press('Delete all my ratings');
      expect(deleteAllMyRatings).not.toHaveBeenCalled();
      expect(lastAlert().buttons.map(b => b.text)).toEqual(['Cancel', 'Delete all']);
      await choose('Delete all');
      expect(deleteAllMyRatings).toHaveBeenCalledTimes(1);
      expect(getConsent).toHaveBeenCalledTimes(2);
      expect(lastAlert().title).toBe('Ratings deleted');
    });

    it('keeps the answer to the consent question', async () => {
      consentIs({ granted: true });
      const { press, choose, toggle } = await render();
      await press('Delete all my ratings');
      await choose('Delete all');
      expect(setConsent).not.toHaveBeenCalled();
      expect(toggle().props.value).toBe(true);
    });
  });

  it('shows nothing when the consent functions are not on the server yet', async () => {
    getConsent.mockResolvedValue({ state: 'unavailable' });
    const { tree } = await render();
    expect(tree.toJSON()).toBeNull();
  });

  it('copes with a supabase mock that only has auth.getSession (the Settings tests use one)', async () => {
    mockAuthOnly = true;
    getConsent.mockImplementation(realConsent.getConsent);
    loadMyRatingCounts.mockImplementation(realRatings.loadMyRatingCounts);
    withdrawContributions.mockImplementation(realRatings.withdrawContributions);
    deleteAllMyRatings.mockImplementation(realRatings.deleteAllMyRatings);
    setConsent.mockImplementation(realConsent.setConsent);

    const { toggle, text, press, lastAlert, choose } = await render();
    expect(text()).toContain('Add my ratings to brand insights');
    expect(toggle().props.value).toBe(false);
    expect(toggle().props.disabled).toBe(false);

    // The actions fail politely instead of throwing.
    await press('Remove what I’ve added');
    expect(lastAlert().title).toBe('Couldn’t save that');
    await press('Delete all my ratings');
    await choose('Delete all');
    expect(lastAlert().title).toBe('Couldn’t save that');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('does not set state after it is unmounted while the state is still loading', async () => {
    let release!: (value: unknown) => void;
    getConsent.mockReturnValue(new Promise(resolve => (release = resolve)));
    const { tree } = await render();
    await act(async () => {
      tree.unmount();
    });
    await act(async () => {
      release({ state: 'ok', value: status({ granted: true }) });
    });
  });
});

// ─── The answer is shared between screens, and a failed read never changes a known one ─────

/** Another screen that uses the consent hook (an item card, the brand report), mounted next to Settings. */
const mountHost = async () => {
  const box: { current: RatingConsentApi | null } = { current: null };
  const Host = () => {
    box.current = useRatingConsent();
    return box.current.sheet;
  };
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<Host />);
  });
  trees.push(tree);
  const api = () => box.current as RatingConsentApi;
  const agree = async () => {
    let answer!: Promise<boolean>;
    await act(async () => {
      answer = api().requestConsent();
    });
    const adult = tree.root.find(
      n => n.props.accessibilityLabel === 'I’m 18 or older' && typeof n.props.onValueChange === 'function',
    );
    await act(async () => {
      adult.props.onValueChange(true);
    });
    const button = tree.root.find(n => n.props.accessibilityLabel === 'Add new ratings' && typeof n.props.onPress === 'function');
    await act(async () => {
      button.props.onPress();
    });
    return answer;
  };
  return { tree, api, agree };
};

describe('the switch and other screens that hold the same answer', () => {
  it('turns on when another screen records the agreement, without reading again', async () => {
    const rows = await render();
    expect(rows.toggle().props.value).toBe(false);
    const host = await mountHost();
    expect(getConsent).toHaveBeenCalledTimes(2);

    await expect(host.agree()).resolves.toBe(true);
    expect(setConsent).toHaveBeenCalledTimes(1);
    expect(rows.toggle().props.value).toBe(true);
    expect(rows.toggle().props.disabled).toBe(false);
    expect(getConsent).toHaveBeenCalledTimes(2);
  });

  it('turns another screen off when Settings withdraws, without reading again', async () => {
    consentIs({ granted: true });
    const host = await mountHost();
    const rows = await render();
    expect(host.api().granted).toBe(true);
    expect(rows.toggle().props.value).toBe(true);

    setConsent.mockImplementation(async () => consentIs({ granted: false }));
    await rows.flip(false);
    await rows.choose('Stop adding');
    expect(setConsent).toHaveBeenCalledWith('share_ratings', false, { policyVersion: RATINGS_POLICY_VERSION });
    expect(rows.toggle().props.value).toBe(false);
    expect(host.api().granted).toBe(false);
    // Only Settings reads again after its own change; the other screen is told, not asked.
    expect(getConsent).toHaveBeenCalledTimes(3);
  });

  it('tells the other screen about the withdrawal even when the delete that came with it fails', async () => {
    consentIs({ granted: true });
    const host = await mountHost();
    const rows = await render();
    deleteAllMyRatings.mockRejectedValue(new Error('offline'));
    await rows.flip(false);
    await rows.choose('Stop and delete my ratings');
    expect(rows.lastAlert().title).toBe('Stopped, but not deleted');
    expect(host.api().granted).toBe(false);
  });

  it('says nothing to the other screen when the withdrawal did not save', async () => {
    consentIs({ granted: true });
    const host = await mountHost();
    const rows = await render();
    setConsent.mockRejectedValue(new Error('Couldn’t save that. Check your connection and try again.'));
    await rows.flip(false);
    await rows.choose('Stop and delete my ratings');
    expect(rows.lastAlert().title).toBe('Couldn’t save that');
    expect(host.api().granted).toBe(true);
    expect(rows.toggle().props.value).toBe(true);
  });

  it('is usable and on when the news arrives while its first read is still on its way', async () => {
    let release!: (value: unknown) => void;
    getConsent.mockReturnValueOnce(new Promise(resolve => (release = resolve)));
    const rows = await render();
    expect(rows.toggle().props.disabled).toBe(true);

    consentIs();
    const host = await mountHost();
    await expect(host.agree()).resolves.toBe(true);
    expect(rows.toggle().props.value).toBe(true);
    expect(rows.toggle().props.disabled).toBe(false);

    // The first read finally answers with what was true before the agreement; it must not win.
    await act(async () => {
      release({ state: 'ok', value: status({ granted: false }) });
    });
    expect(rows.toggle().props.value).toBe(true);
    expect(rows.toggle().props.disabled).toBe(false);
  });
});

describe('when the read after a change fails', () => {
  const offline = () => getConsent.mockResolvedValue({ state: 'offline' });

  it('keeps the switch on when the change did not save', async () => {
    consentIs({ granted: true });
    const { flip, choose, toggle, lastAlert } = await render();
    setConsent.mockRejectedValue(new Error('Couldn’t save that. Check your connection and try again.'));
    offline();
    await flip(false);
    await choose('Stop adding');
    expect(lastAlert().title).toBe('Couldn’t save that');
    expect(toggle().props.value).toBe(true);
    expect(toggle().props.disabled).toBe(false);
  });

  it('keeps the switch on when the error comes back as an error rather than offline', async () => {
    consentIs({ granted: true });
    const { flip, choose, toggle } = await render();
    setConsent.mockRejectedValue(new Error('nope'));
    getConsent.mockResolvedValue({ state: 'error' });
    await flip(false);
    await choose('Stop adding');
    expect(toggle().props.value).toBe(true);
  });

  it('reads off after "Stop adding" saved, because the saved withdrawal is known', async () => {
    consentIs({ granted: true });
    const { flip, choose, toggle } = await render();
    offline();
    await flip(false);
    await choose('Stop adding');
    expect(setConsent).toHaveBeenCalledWith('share_ratings', false, { policyVersion: RATINGS_POLICY_VERSION });
    expect(toggle().props.value).toBe(false);
    expect(alertSpy).toHaveBeenCalledTimes(1);
  });

  it('reads off after "Stop and delete my ratings" saved, with or without the delete', async () => {
    consentIs({ granted: true });
    const { flip, choose, toggle, lastAlert } = await render();
    offline();
    await flip(false);
    await choose('Stop and delete my ratings');
    expect(toggle().props.value).toBe(false);
    expect(lastAlert().title).not.toBe('Stopped, but not deleted');

    consentIs({ granted: true });
    const failing = await render();
    deleteAllMyRatings.mockRejectedValue(new Error('offline'));
    offline();
    await failing.flip(false);
    await failing.choose('Stop and delete my ratings');
    expect(failing.lastAlert().title).toBe('Stopped, but not deleted');
    expect(failing.toggle().props.value).toBe(false);
  });

  it('keeps the switch on after "Remove what I’ve added", which leaves the agreement alone', async () => {
    consentIs({ granted: true });
    const { press, toggle, lastAlert } = await render();
    offline();
    await press('Remove what I’ve added');
    expect(withdrawContributions).toHaveBeenCalledTimes(1);
    expect(lastAlert().title).toBe('Removed');
    expect(toggle().props.value).toBe(true);
  });

  it('keeps the switch on after "Delete all my ratings"', async () => {
    consentIs({ granted: true });
    const { press, choose, toggle, lastAlert } = await render();
    offline();
    await press('Delete all my ratings');
    await choose('Delete all');
    expect(lastAlert().title).toBe('Ratings deleted');
    expect(toggle().props.value).toBe(true);
  });

  it('still follows the server when the read works', async () => {
    consentIs({ granted: true });
    const { press, toggle } = await render();
    consentIs({ granted: false });
    await press('Remove what I’ve added');
    expect(toggle().props.value).toBe(false);
  });

  it('still reads off and stays usable when the very first read fails', async () => {
    offline();
    const { toggle } = await render();
    expect(toggle().props.value).toBe(false);
    expect(toggle().props.disabled).toBe(false);
  });
});
