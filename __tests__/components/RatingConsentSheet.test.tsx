/**
 * The consent sheet and its hook (documentation/design/quality-ratings.md, 3.5 and 6.2): the agree buttons wait
 * for the 18+ switch, the "past ratings" button only exists when there are some, errors (including a build with
 * older wording than the server's) stay inside the sheet, and the hook reports a stale agreement as not agreed.
 */
import 'react-native';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Alert, Linking, Modal, Switch, TextInput } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const mockGetSession = jest.fn();
const mockRpc = jest.fn();
jest.mock('../../src/config/supabase', () => ({
  supabase: {
    auth: { getSession: (...args: unknown[]) => mockGetSession(...args) },
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

const mockGetConsent = jest.fn();
const mockSetConsent = jest.fn();
jest.mock('../../src/services/consentService', () => ({
  getConsent: (...args: unknown[]) => mockGetConsent(...args),
  setConsent: (...args: unknown[]) => mockSetConsent(...args),
}));

const mockLoadCounts = jest.fn();
jest.mock('../../src/services/ratingService', () => ({
  loadMyRatingCounts: (...args: unknown[]) => mockLoadCounts(...args),
}));

import RatingConsentSheet, {
  RatingConsentSheet as NamedRatingConsentSheet,
  announceConsent,
  useRatingConsent,
  type RatingConsentApi,
} from '../../src/components/RatingConsentSheet';
import { RATING_GUIDELINES } from '../../src/config/ratingGuidelines';
import { RATINGS_POLICY_VERSION } from '../../src/config/ratingVocabulary';
import { PRIVACY_POLICY_URL } from '../../src/config/legal';

const actualConsent = jest.requireActual('../../src/services/consentService');

type SheetProps = React.ComponentProps<typeof RatingConsentSheet>;

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
  granted: null,
  policyVersion: null,
  decidedAt: null,
  adultConfirmedAt: null,
  requiresAdult: true,
  currentVersion: RATINGS_POLICY_VERSION,
  needsReconsent: false,
  ...over,
});

const counts = (notContributing: number) => ({
  state: 'ok' as const,
  value: { items: notContributing, brands: 0, notContributing },
});

let errorSpy: jest.SpyInstance;
let alertSpy: jest.SpyInstance;
// Hosts register for announcements while they are mounted, so a test must not leave its trees behind.
const hookTrees: renderer.ReactTestRenderer[] = [];

beforeEach(() => {
  mockGetSession.mockReset().mockResolvedValue({ data: { session: { user: { id: 'u1' } } }, error: null });
  mockRpc.mockReset().mockResolvedValue({ data: null, error: null });
  mockGetConsent.mockReset().mockResolvedValue({ state: 'ok', value: status() });
  mockSetConsent.mockReset().mockResolvedValue(undefined);
  mockLoadCounts.mockReset().mockResolvedValue(counts(0));
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(async () => {
  while (hookTrees.length) {
    const tree = hookTrees.pop()!;
    await act(async () => {
      tree.unmount();
    });
  }
  // A state update after a test ends, or a failure path that logs, would show up here.
  expect(errorSpy).not.toHaveBeenCalled();
  errorSpy.mockRestore();
  alertSpy.mockRestore();
  jest.restoreAllMocks();
});

// ─── The sheet on its own ────────────────────────────────────────────────────

const renderSheet = async (props: Partial<SheetProps> = {}) => {
  const onAgree = jest.fn();
  const onNotNow = jest.fn();
  let tree!: renderer.ReactTestRenderer;
  const element = (over: Partial<SheetProps>) => (
    <RatingConsentSheet
      visible
      requiresAdult
      pastRatings={0}
      busy={false}
      error={null}
      onAgree={onAgree}
      onNotNow={onNotNow}
      {...props}
      {...over}
    />
  );
  await act(async () => {
    tree = renderer.create(element({}));
  });
  const text = () => flatten(tree.toJSON());
  const pressable = (label: string) =>
    tree.root.find(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
  const press = async (label: string) => {
    const node = pressable(label);
    await act(async () => {
      node.props.onPress();
    });
  };
  const adultSwitch = () =>
    tree.root.find(n => n.props.accessibilityLabel === 'I’m 18 or older' && typeof n.props.onValueChange === 'function');
  const setAdult = async (value: boolean) => {
    const node = adultSwitch();
    await act(async () => {
      node.props.onValueChange(value);
    });
  };
  const rerender = async (over: Partial<SheetProps>) => {
    await act(async () => {
      tree.update(element(over));
    });
  };
  return { tree, text, pressable, press, adultSwitch, setAdult, rerender, onAgree, onNotNow };
};

describe('RatingConsentSheet', () => {
  it('is exported both ways', () => {
    expect(NamedRatingConsentSheet).toBe(RatingConsentSheet);
  });

  it('says what is shared, with the exact strings the tests of other streams rely on', async () => {
    const { text } = await renderSheet();
    expect(text()).toContain('Add your ratings to brand insights?');
    expect(text()).toContain('I’m 18 or older');
    expect(text()).toContain('Add new ratings');
    expect(text()).toContain('Not now');
    expect(text()).toContain('never your name, photos or notes');
    expect(text()).toContain('at least 10 established members');
    expect(text()).toContain('You can stop any time in Settings.');
    expect(text()).toContain('Scores others have already seen can’t be recalled.');
    expect(text()).toContain('How this works');
  });

  it('keeps both agree buttons disabled until the 18+ switch is on', async () => {
    const { pressable, setAdult, press, onAgree } = await renderSheet({ pastRatings: 3 });
    expect(pressable('Add new ratings').props.disabled).toBe(true);
    expect(pressable('Add new and past ratings (3)').props.disabled).toBe(true);
    expect(pressable('Not now').props.disabled).toBe(false);

    // Even if a press got through, nothing is sent.
    await press('Add new ratings');
    expect(onAgree).not.toHaveBeenCalled();

    await setAdult(true);
    expect(pressable('Add new ratings').props.disabled).toBe(false);
    expect(pressable('Add new and past ratings (3)').props.disabled).toBe(false);

    await setAdult(false);
    expect(pressable('Add new ratings').props.disabled).toBe(true);
  });

  it('does not ask for the 18+ answer when the server does not require it', async () => {
    const { tree, pressable, text, onAgree, press } = await renderSheet({ requiresAdult: false });
    expect(tree.root.findAllByType(Switch)).toHaveLength(0);
    expect(text()).not.toContain('I’m 18 or older');
    expect(pressable('Add new ratings').props.disabled).toBe(false);
    await press('Add new ratings');
    expect(onAgree).toHaveBeenCalledWith({ includeExisting: false });
  });

  it('offers "Add new and past ratings (N)" only when N is above 0', async () => {
    const none = await renderSheet({ pastRatings: 0 });
    expect(none.text()).not.toContain('past ratings');

    const some = await renderSheet({ pastRatings: 7 });
    expect(some.text()).toContain('Add new and past ratings (7)');
  });

  it('tells the host whether past ratings are included', async () => {
    const { setAdult, press, onAgree } = await renderSheet({ pastRatings: 2 });
    await setAdult(true);
    await press('Add new ratings');
    expect(onAgree).toHaveBeenLastCalledWith({ includeExisting: false });
    await press('Add new and past ratings (2)');
    expect(onAgree).toHaveBeenLastCalledWith({ includeExisting: true });
  });

  it('gives the three buttons the same weight', async () => {
    const { tree, setAdult } = await renderSheet({ pastRatings: 2 });
    await setAdult(true);
    // Button renders the variant into its background; equal weight means no one of them is the filled one.
    const styleOf = (label: string) => {
      const node = tree.root.find(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
      const style = typeof node.props.style === 'function' ? node.props.style({ pressed: false }) : node.props.style;
      return JSON.stringify(style);
    };
    expect(styleOf('Not now')).toBe(styleOf('Add new ratings'));
    expect(styleOf('Add new ratings')).toBe(styleOf('Add new and past ratings (2)'));
  });

  it('shows an error inside the sheet, including the older-wording message', async () => {
    const { text, tree } = await renderSheet({ error: 'Please update SmartCloset to change this.' });
    expect(text()).toContain('Please update SmartCloset to change this.');
    const alertNode = tree.root.find(n => n.props.accessibilityRole === 'alert' && typeof n.props.children === 'string');
    expect(alertNode.props.children).toBe('Please update SmartCloset to change this.');
  });

  it('blocks every way out while a save is in progress', async () => {
    const { tree, pressable, onNotNow, adultSwitch } = await renderSheet({ busy: true, pastRatings: 1 });
    expect(pressable('Not now').props.disabled).toBe(true);
    expect(pressable('Add new ratings').props.disabled).toBe(true);
    expect(pressable('Add new and past ratings (1)').props.disabled).toBe(true);
    expect(adultSwitch().props.disabled).toBe(true);
    await act(async () => {
      tree.root.findByType(Modal).props.onRequestClose();
    });
    expect(onNotNow).not.toHaveBeenCalled();
  });

  it('closes with Not now, the back button and the backdrop when idle', async () => {
    const { tree, press, onNotNow } = await renderSheet();
    await press('Not now');
    expect(onNotNow).toHaveBeenCalledTimes(1);
    await act(async () => {
      tree.root.findByType(Modal).props.onRequestClose();
    });
    expect(onNotNow).toHaveBeenCalledTimes(2);
  });

  it('has a collapsed "Rating guidelines" row that lists the four rules', async () => {
    const { text, press, pressable } = await renderSheet();
    expect(RATING_GUIDELINES.rules).toHaveLength(4);
    expect(text()).toContain('Rating guidelines');
    RATING_GUIDELINES.rules.forEach(rule => expect(text()).not.toContain(rule));
    expect(pressable('Rating guidelines').props.accessibilityState).toEqual({ expanded: false });

    await press('Rating guidelines');
    RATING_GUIDELINES.rules.forEach(rule => expect(text()).toContain(rule));
    expect(pressable('Rating guidelines').props.accessibilityState).toEqual({ expanded: true });

    await press('Rating guidelines');
    RATING_GUIDELINES.rules.forEach(rule => expect(text()).not.toContain(rule));
  });

  it('opens the privacy page from "How this works", and survives a link that will not open', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
    const { press } = await renderSheet();
    await press('How this works');
    expect(open).toHaveBeenCalledWith(PRIVACY_POLICY_URL);
    expect(alertSpy).not.toHaveBeenCalled();

    open.mockRejectedValueOnce(new Error('no browser'));
    await press('How this works');
    expect(alertSpy).toHaveBeenCalledTimes(1);

    open.mockImplementationOnce(() => {
      throw new Error('sync failure');
    });
    await press('How this works');
    expect(alertSpy).toHaveBeenCalledTimes(2);
  });

  it('starts clean each time it opens: the 18+ answer and the guidelines are not carried over', async () => {
    const { adultSwitch, setAdult, press, rerender, pressable, text } = await renderSheet();
    await setAdult(true);
    await press('Rating guidelines');
    expect(adultSwitch().props.value).toBe(true);
    expect(text()).toContain(RATING_GUIDELINES.rules[0]);

    await rerender({ visible: false });
    expect(text()).toBe('');
    await rerender({ visible: true });
    expect(adultSwitch().props.value).toBe(false);
    expect(pressable('Add new ratings').props.disabled).toBe(true);
    expect(text()).not.toContain(RATING_GUIDELINES.rules[0]);
  });

  it('renders nothing while closed and never holds a text field', async () => {
    const closed = await renderSheet({ visible: false });
    expect(closed.text()).toBe('');
    const open = await renderSheet();
    expect(open.tree.root.findAllByType(TextInput)).toHaveLength(0);
  });
});

// ─── The hook ────────────────────────────────────────────────────────────────

const renderHook = async () => {
  const box: { current: RatingConsentApi | null } = { current: null };
  const Host = () => {
    box.current = useRatingConsent();
    return box.current.sheet;
  };
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<Host />);
  });
  hookTrees.push(tree);
  const api = () => box.current as RatingConsentApi;
  const text = () => flatten(tree.toJSON());
  const pressable = (label: string) =>
    tree.root.find(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
  const press = async (label: string) => {
    const node = pressable(label);
    await act(async () => {
      node.props.onPress();
    });
  };
  const confirmAdult = async () => {
    const node = tree.root.find(
      n => n.props.accessibilityLabel === 'I’m 18 or older' && typeof n.props.onValueChange === 'function',
    );
    await act(async () => {
      node.props.onValueChange(true);
    });
  };
  // Resolves once the sheet is on screen; the person's answer is the `answer` promise inside the result.
  const request = async () => {
    let answer!: Promise<boolean>;
    await act(async () => {
      answer = api().requestConsent();
    });
    return { answer };
  };
  // The whole path of one person agreeing in this host; the answer is wrapped so awaiting this does not wait for it.
  const agree = async () => {
    const { answer } = await request();
    await confirmAdult();
    await press('Add new ratings');
    return { answer };
  };
  return { tree, api, text, press, pressable, confirmAdult, request, agree };
};

describe('useRatingConsent', () => {
  it('reads the answer and the past-rating count from the server when it mounts', async () => {
    mockGetConsent.mockResolvedValue({
      state: 'ok',
      value: status({ granted: true, policyVersion: RATINGS_POLICY_VERSION, requiresAdult: false }),
    });
    mockLoadCounts.mockResolvedValue(counts(2));
    const { api } = await renderHook();
    expect(mockGetConsent).toHaveBeenCalledWith('share_ratings');
    expect(mockLoadCounts).toHaveBeenCalledTimes(1);
    expect(api().granted).toBe(true);
    expect(api().needsReconsent).toBe(false);
    expect(api().available).toBe(true);
    expect(api().requiresAdult).toBe(false);
    expect(api().loading).toBe(false);
  });

  it('is unknown, but asks the 18+ question, while it loads', async () => {
    let release!: (value: unknown) => void;
    mockGetConsent.mockReturnValue(new Promise(resolve => (release = resolve)));
    const { api } = await renderHook();
    expect(api().granted).toBeNull();
    expect(api().loading).toBe(true);
    expect(api().available).toBe(true);
    expect(api().requiresAdult).toBe(true);
    await act(async () => {
      release({ state: 'ok', value: status({ granted: false }) });
    });
    expect(api().granted).toBe(false);
    expect(api().loading).toBe(false);
  });

  it('reports not agreed (false) for a person who has not decided or who said no', async () => {
    const { api } = await renderHook();
    expect(api().granted).toBe(false);

    mockGetConsent.mockResolvedValue({ state: 'ok', value: status({ granted: false }) });
    await act(async () => {
      await api().refresh();
    });
    expect(api().granted).toBe(false);
  });

  it('is unknown (null) for a guest, offline or an error, and reports a missing server function', async () => {
    for (const state of ['guest', 'offline', 'error'] as const) {
      mockGetConsent.mockResolvedValue({ state });
      const { api } = await renderHook();
      expect(api().granted).toBeNull();
      expect(api().available).toBe(true);
      expect(api().loading).toBe(false);
    }
    mockGetConsent.mockResolvedValue({ state: 'unavailable' });
    const missing = await renderHook();
    expect(missing.api().granted).toBeNull();
    expect(missing.api().available).toBe(false);
  });

  it('treats a purpose the server does not know like a missing function', async () => {
    mockGetConsent.mockResolvedValue({ state: 'ok', value: null });
    const { api } = await renderHook();
    expect(api().granted).toBeNull();
    expect(api().available).toBe(false);
  });

  it('survives reads that throw or return nothing', async () => {
    mockGetConsent.mockRejectedValue(new Error('boom'));
    mockLoadCounts.mockReturnValue(undefined);
    const { api } = await renderHook();
    expect(api().granted).toBeNull();
    expect(api().loading).toBe(false);
  });

  it('counts an agreement to older wording as not agreed and offers the same sheet again', async () => {
    mockGetConsent.mockResolvedValue({
      state: 'ok',
      value: status({ granted: true, policyVersion: 'ratings-2025-01', needsReconsent: true }),
    });
    const { api, text, confirmAdult, press, request } = await renderHook();
    expect(api().granted).toBe(false);
    expect(api().needsReconsent).toBe(true);
    expect(text()).toBe('');

    const { answer } = await request();
    expect(text()).toContain('Add your ratings to brand insights?');

    await confirmAdult();
    await press('Add new ratings');
    await expect(answer).resolves.toBe(true);
    expect(api().granted).toBe(true);
    expect(api().needsReconsent).toBe(false);
    expect(text()).toBe('');
  });

  it('records the agreement with the bundled wording version and the 18+ confirmation', async () => {
    const { api, confirmAdult, press, request } = await renderHook();
    const { answer } = await request();
    await confirmAdult();
    await press('Add new ratings');
    await expect(answer).resolves.toBe(true);
    expect(mockSetConsent).toHaveBeenCalledTimes(1);
    expect(mockSetConsent).toHaveBeenCalledWith('share_ratings', true, {
      policyVersion: RATINGS_POLICY_VERSION,
      adult: true,
      includeExisting: false,
    });
    expect(api().granted).toBe(true);
    // Showing the new state needs no second read that could fail.
    expect(mockGetConsent).toHaveBeenCalledTimes(1);
  });

  it('adds past ratings only through the second button, and then has none left to offer', async () => {
    mockLoadCounts.mockResolvedValue(counts(4));
    const { text, confirmAdult, press, request } = await renderHook();
    const { answer } = await request();
    expect(text()).toContain('Add new and past ratings (4)');
    await confirmAdult();
    await press('Add new and past ratings (4)');
    await expect(answer).resolves.toBe(true);
    expect(mockSetConsent).toHaveBeenCalledWith('share_ratings', true, {
      policyVersion: RATINGS_POLICY_VERSION,
      adult: true,
      includeExisting: true,
    });

    // The server has now added them, so there is nothing left to offer when the sheet is asked for again.
    mockLoadCounts.mockResolvedValue(counts(0));
    const { answer: again } = await request();
    expect(text()).not.toContain('past ratings');
    expect(text()).toContain('Add your ratings to brand insights?');
    await act(async () => {});
    await press('Not now');
    await expect(again).resolves.toBe(false);
  });

  it('refreshes the past-rating count each time the sheet opens', async () => {
    mockLoadCounts.mockResolvedValue(counts(0));
    const { text, request, press } = await renderHook();
    mockLoadCounts.mockResolvedValue(counts(5));
    const { answer } = await request();
    expect(text()).toContain('Add new and past ratings (5)');
    await press('Not now');
    await expect(answer).resolves.toBe(false);
  });

  it('"Not now" records nothing and the sheet does not come back by itself', async () => {
    const { api, text, press, request } = await renderHook();
    const setItem = jest.spyOn(AsyncStorage, 'setItem');
    const { answer } = await request();
    expect(text()).toContain('Add your ratings to brand insights?');
    await press('Not now');
    await expect(answer).resolves.toBe(false);
    expect(text()).toBe('');
    expect(mockSetConsent).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(api().granted).toBe(false);

    await act(async () => {
      await api().refresh();
    });
    expect(text()).toBe('');
  });

  it('shares one answer between two requests made while the sheet is open', async () => {
    const { api, press, confirmAdult } = await renderHook();
    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    await act(async () => {
      first = api().requestConsent();
      second = api().requestConsent();
    });
    expect(second).toBe(first);
    await confirmAdult();
    await press('Add new ratings');
    await expect(first).resolves.toBe(true);
    expect(mockSetConsent).toHaveBeenCalledTimes(1);
  });

  it('keeps the sheet open and shows the friendly error when saving fails, then lets the person retry', async () => {
    mockSetConsent.mockRejectedValueOnce(new Error('Please update SmartCloset to change this.'));
    const { api, text, press, confirmAdult, request } = await renderHook();
    const { answer } = await request();
    let settled = false;
    answer.then(() => {
      settled = true;
    });
    await confirmAdult();
    await press('Add new ratings');
    expect(text()).toContain('Please update SmartCloset to change this.');
    expect(text()).toContain('Add your ratings to brand insights?');
    expect(settled).toBe(false);
    expect(api().granted).toBe(false);

    await press('Add new ratings');
    await expect(answer).resolves.toBe(true);
    expect(text()).toBe('');
  });

  it('falls back to a plain sentence when the failure carries no message', async () => {
    mockSetConsent.mockRejectedValueOnce('nope');
    const { text, press, confirmAdult, request } = await renderHook();
    const { answer } = await request();
    await confirmAdult();
    await press('Add new ratings');
    expect(text()).toContain('Couldn’t save that. Check your connection and try again.');
    await press('Not now');
    await expect(answer).resolves.toBe(false);
  });

  it('shows the older-wording message from the real consent service when the server refuses the version', async () => {
    mockSetConsent.mockImplementation(actualConsent.setConsent);
    mockRpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'stale_consent_text' } });
    const { text, press, confirmAdult, request } = await renderHook();
    const { answer } = await request();
    await confirmAdult();
    await press('Add new ratings');
    expect(mockRpc).toHaveBeenCalledWith('set_consent', {
      p_purpose: 'share_ratings',
      p_granted: true,
      p_policy_version: RATINGS_POLICY_VERSION,
      p_adult: true,
      p_include_existing: false,
    });
    expect(text()).toContain('Please update SmartCloset to change this.');
    expect(text()).not.toContain('stale_consent_text');
    await press('Not now');
    await expect(answer).resolves.toBe(false);
  });

  it('turns the other server refusals into one plain sentence inside the sheet', async () => {
    mockSetConsent.mockImplementation(actualConsent.setConsent);
    const cases: Array<[{ code: string; message: string }, string]> = [
      [{ code: '54000', message: 'rate_limited' }, 'You’ve made a lot of changes today. Please try again tomorrow.'],
      [{ code: '42883', message: 'function public.set_consent does not exist' }, 'This isn’t available yet.'],
      [{ code: '22023', message: 'adult_required' }, 'You need to confirm you’re 18 or older.'],
      [{ code: '08006', message: 'Network request failed' }, 'Couldn’t save that. Check your connection and try again.'],
    ];
    for (const [rpcError, sentence] of cases) {
      mockRpc.mockResolvedValue({ data: null, error: rpcError });
      const { text, press, confirmAdult, request } = await renderHook();
      const { answer } = await request();
      await confirmAdult();
      await press('Add new ratings');
      expect(text()).toContain(sentence);
      expect(text()).not.toContain(rpcError.message);
      await press('Not now');
      await expect(answer).resolves.toBe(false);
    }
  });

  it('ignores a slow first read that finishes after the person has agreed', async () => {
    let release!: (value: unknown) => void;
    mockGetConsent.mockReturnValue(new Promise(resolve => (release = resolve)));
    const { api, press, confirmAdult, request } = await renderHook();
    const { answer } = await request();
    await confirmAdult();
    await press('Add new ratings');
    await expect(answer).resolves.toBe(true);
    // The dropped read was the one that would have ended "loading"; the agreement has to end it instead.
    expect(api().loading).toBe(false);
    await act(async () => {
      release({ state: 'ok', value: status({ granted: false }) });
    });
    expect(api().granted).toBe(true);
    expect(api().loading).toBe(false);
  });

  it('says so inside the sheet when the server function is missing', async () => {
    mockGetConsent.mockResolvedValue({ state: 'unavailable' });
    const { api, text, press, request } = await renderHook();
    expect(api().available).toBe(false);
    const { answer } = await request();
    expect(text()).toContain('This isn’t available yet.');
    await press('Not now');
    await expect(answer).resolves.toBe(false);
    expect(text()).toBe('');
  });

  it('follows the server about whether the 18+ confirmation applies', async () => {
    mockGetConsent.mockResolvedValue({ state: 'ok', value: status({ requiresAdult: false }) });
    const { api, text, press, request } = await renderHook();
    expect(api().requiresAdult).toBe(false);
    const { answer } = await request();
    expect(text()).not.toContain('I’m 18 or older');
    await press('Add new ratings');
    await expect(answer).resolves.toBe(true);
  });

  it('refresh() reads again and reports the new answer', async () => {
    const { api } = await renderHook();
    expect(api().granted).toBe(false);
    mockGetConsent.mockResolvedValue({ state: 'ok', value: status({ granted: true }) });
    await act(async () => {
      await api().refresh();
    });
    expect(mockGetConsent).toHaveBeenCalledTimes(2);
    expect(api().granted).toBe(true);
  });

  it('lets a waiting caller go when the screen is left with the sheet open, without touching state', async () => {
    const { tree, api } = await renderHook();
    let answer!: Promise<boolean>;
    await act(async () => {
      answer = api().requestConsent();
    });
    await act(async () => {
      tree.unmount();
    });
    await expect(answer).resolves.toBe(false);
    expect(mockSetConsent).not.toHaveBeenCalled();
  });

  it('does not set state after unmount when the first read is still on its way', async () => {
    let release!: (value: unknown) => void;
    mockGetConsent.mockReturnValue(new Promise(resolve => (release = resolve)));
    const { tree } = await renderHook();
    await act(async () => {
      tree.unmount();
    });
    await act(async () => {
      release({ state: 'ok', value: status({ granted: true }) });
    });
    // The afterEach hook fails the test if that update logged through console.error.
  });

  it('never holds a text field and never calls the network itself', async () => {
    const { tree, request, press } = await renderHook();
    const { answer } = await request();
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
    await press('Not now');
    await answer;
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockGetSession).not.toHaveBeenCalled();
  });
});

// ─── One answer for every screen ─────────────────────────────────────────────

describe('useRatingConsent across screens', () => {
  const olderWording = () =>
    mockGetConsent.mockResolvedValue({
      state: 'ok',
      value: status({ granted: true, policyVersion: 'ratings-2025-01', needsReconsent: true }),
    });

  it('tells every other mounted host when one agrees, without another read', async () => {
    olderWording();
    const agreeing = await renderHook();
    const watching = await renderHook();
    expect(watching.api().granted).toBe(false);
    expect(watching.api().needsReconsent).toBe(true);
    expect(mockGetConsent).toHaveBeenCalledTimes(2);

    const { answer } = await agreeing.agree();
    await expect(answer).resolves.toBe(true);
    expect(agreeing.api().granted).toBe(true);
    expect(watching.api().granted).toBe(true);
    expect(watching.api().needsReconsent).toBe(false);
    expect(watching.api().loading).toBe(false);
    expect(mockGetConsent).toHaveBeenCalledTimes(2);
  });

  it('passes the news on even when the screen that saved it was left while the save ran', async () => {
    let finish!: () => void;
    mockSetConsent.mockReturnValue(new Promise<void>(resolve => (finish = resolve)));
    const agreeing = await renderHook();
    const watching = await renderHook();
    const { answer } = await agreeing.agree();
    await act(async () => {
      agreeing.tree.unmount();
    });
    await expect(answer).resolves.toBe(false);
    expect(watching.api().granted).toBe(false);

    await act(async () => {
      finish();
    });
    expect(watching.api().granted).toBe(true);
  });

  it('does not announce an agreement that failed to save', async () => {
    mockSetConsent.mockRejectedValue(new Error('Please update SmartCloset to change this.'));
    const agreeing = await renderHook();
    const watching = await renderHook();
    const { answer } = await agreeing.request();
    await agreeing.confirmAdult();
    await agreeing.press('Add new ratings');
    expect(watching.api().granted).toBe(false);
    await agreeing.press('Not now');
    await expect(answer).resolves.toBe(false);
  });

  it('announceConsent also passes on a withdrawal, again without a read', async () => {
    mockGetConsent.mockResolvedValue({ state: 'ok', value: status({ granted: true }) });
    const host = await renderHook();
    expect(host.api().granted).toBe(true);
    await act(async () => {
      announceConsent(false);
    });
    expect(host.api().granted).toBe(false);
    expect(host.api().needsReconsent).toBe(false);
    expect(mockGetConsent).toHaveBeenCalledTimes(1);
  });

  it('ends "loading" and drops the late old answer when the news arrives during the first read', async () => {
    let release!: (value: unknown) => void;
    mockGetConsent.mockReturnValueOnce(new Promise(resolve => (release = resolve)));
    const host = await renderHook();
    expect(host.api().loading).toBe(true);

    await act(async () => {
      announceConsent(true);
    });
    expect(host.api().granted).toBe(true);
    expect(host.api().loading).toBe(false);

    await act(async () => {
      release({ state: 'ok', value: status({ granted: false }) });
    });
    expect(host.api().granted).toBe(true);
    expect(host.api().loading).toBe(false);
  });

  it('stops listening when the host is unmounted, and announcing with nobody mounted does nothing', async () => {
    const { tree } = await renderHook();
    await act(async () => {
      tree.unmount();
    });
    await act(async () => {
      announceConsent(true);
    });
    // The afterEach hook fails the test if a state update was logged through console.error.
    expect(() => announceConsent(false)).not.toThrow();
  });
});

describe('useRatingConsent refresh with keepKnown', () => {
  const agreed = () => mockGetConsent.mockResolvedValue({ state: 'ok', value: status({ granted: true }) });

  it('keeps the answer already shown when the read fails offline or with an error', async () => {
    agreed();
    const { api } = await renderHook();
    expect(api().granted).toBe(true);
    for (const state of ['offline', 'error'] as const) {
      mockGetConsent.mockResolvedValue({ state });
      await act(async () => {
        await api().refresh({ keepKnown: true });
      });
      expect(api().granted).toBe(true);
      expect(api().available).toBe(true);
      expect(api().loading).toBe(false);
    }
  });

  it('keeps a known "not agreed" too', async () => {
    const { api } = await renderHook();
    expect(api().granted).toBe(false);
    mockGetConsent.mockResolvedValue({ state: 'offline' });
    await act(async () => {
      await api().refresh({ keepKnown: true });
    });
    expect(api().granted).toBe(false);
  });

  it('still follows the server when the read works', async () => {
    agreed();
    const { api } = await renderHook();
    mockGetConsent.mockResolvedValue({ state: 'ok', value: status({ granted: false }) });
    await act(async () => {
      await api().refresh({ keepKnown: true });
    });
    expect(api().granted).toBe(false);
  });

  it('a plain refresh() after a failed read still reports unknown (the brand report relies on this)', async () => {
    agreed();
    const { api } = await renderHook();
    expect(api().granted).toBe(true);
    mockGetConsent.mockResolvedValue({ state: 'offline' });
    await act(async () => {
      await api().refresh();
    });
    expect(api().granted).toBeNull();
    expect(api().available).toBe(true);
  });

  it('is only switched on by exactly keepKnown: true', async () => {
    agreed();
    const { api } = await renderHook();
    mockGetConsent.mockResolvedValue({ state: 'offline' });
    await act(async () => {
      // A host that hands refresh straight to a press handler passes an event object.
      await (api().refresh as (arg?: unknown) => Promise<void>)({ nativeEvent: {} });
    });
    expect(api().granted).toBeNull();
  });

  it('does not hide a guest or a missing server function', async () => {
    agreed();
    const { api } = await renderHook();
    mockGetConsent.mockResolvedValue({ state: 'guest' });
    await act(async () => {
      await api().refresh({ keepKnown: true });
    });
    expect(api().granted).toBeNull();

    agreed();
    await act(async () => {
      await api().refresh();
    });
    expect(api().granted).toBe(true);
    mockGetConsent.mockResolvedValue({ state: 'unavailable' });
    await act(async () => {
      await api().refresh({ keepKnown: true });
    });
    expect(api().granted).toBeNull();
    expect(api().available).toBe(false);
  });

  it('keeps nothing on the first load: a failure while nothing is known is still unknown', async () => {
    let release!: (value: unknown) => void;
    mockGetConsent.mockReturnValueOnce(new Promise(resolve => (release = resolve)));
    const { api } = await renderHook();
    expect(api().loading).toBe(true);
    mockGetConsent.mockResolvedValue({ state: 'offline' });
    await act(async () => {
      await api().refresh({ keepKnown: true });
    });
    expect(api().granted).toBeNull();
    expect(api().loading).toBe(false);
    expect(api().available).toBe(true);
    await act(async () => {
      release({ state: 'ok', value: status({ granted: true }) });
    });
    expect(api().granted).toBeNull();
  });
});
