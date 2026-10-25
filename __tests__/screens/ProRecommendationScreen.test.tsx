import 'react-native';
import React from 'react';
import fs from 'fs';
import path from 'path';
import { Alert, InputAccessoryView, RefreshControl, ScrollView, Switch, TextInput } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import type { ReactTestInstance } from 'react-test-renderer';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
let mockParams: any = { recId: 'r1', connectionId: 'c1' };
jest.mock('@react-navigation/native', () => {
  const { useEffect } = require('react');
  return {
    useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
    useRoute: () => ({ params: mockParams }),
    useFocusEffect: (cb: () => void) => useEffect(cb, [cb]),
  };
});

const mockStatus = jest.fn();
const mockAccept = jest.fn();
const mockConnection = jest.fn();
const mockLook = jest.fn();
const mockFeedback = jest.fn();
jest.mock('../../src/services/proService', () => ({
  getProStatus: (...a: any[]) => mockStatus(...a),
  acceptProTerms: (...a: any[]) => mockAccept(...a),
  getProConnection: (...a: any[]) => mockConnection(...a),
  getProLook: (...a: any[]) => mockLook(...a),
  giveLookFeedback: (...a: any[]) => mockFeedback(...a),
}));

// The shimmer animation never stops on its own; a plain marker keeps the tests quiet and finite.
jest.mock('../../src/ui/Skeleton', () => {
  const R = require('react');
  const Skeleton = (props: any) => R.createElement('Skeleton', props);
  return { __esModule: true, default: Skeleton, Skeleton };
});
// Markers that keep the props they were given.
jest.mock('../../src/components/ProPhoto', () => {
  const R = require('react');
  const ProPhoto = (props: any) => R.createElement('ProPhoto', props);
  return { __esModule: true, default: ProPhoto, ProPhoto };
});
jest.mock('../../src/components/ProSafetySheet', () => {
  const R = require('react');
  return { __esModule: true, default: (props: any) => R.createElement('ProSafetySheet', props) };
});
jest.mock('../../src/components/ProTermsSheet', () => {
  const R = require('react');
  return { __esModule: true, default: (props: any) => R.createElement('ProTermsSheet', props) };
});
jest.mock('../../src/components/ProAccessNotice', () => {
  const R = require('react');
  return { __esModule: true, default: (props: any) => R.createElement('ProAccessNotice', props) };
});

import ProRecommendationScreen, { PRO_COMMENT_ACCESSORY_ID } from '../../src/screens/ProRecommendationScreen';
import { KEYBOARD_DONE_ID } from '../../src/components/KeyboardSafe';
import { ProError } from '../../src/services/proErrors';
import {
  PRO_CLIENT_TERMS_VERSION,
  PRO_PAUSED_MESSAGE,
  PRO_SHARE_TEXT_VERSION,
  PRO_STYLIST_TERMS_VERSION,
  PRO_SUSPENDED_MESSAGE,
  PRO_UPDATE_REQUIRED_MESSAGE,
} from '../../src/config/proRules';
import type { ProConnectionDetail, ProLookDetail, ProStatus } from '../../src/types/pro';

const flatten = (node: any): string =>
  !node ? '' : typeof node === 'string' ? node : Array.isArray(node) ? node.map(flatten).join(' ') : flatten(node.children);

const status = (over: Partial<ProStatus> = {}): ProStatus => ({
  proEnabled: true,
  suspended: false,
  adultConfirmed: true,
  stylistRemoved: false,
  versions: { stylistTerms: PRO_STYLIST_TERMS_VERSION, clientTerms: PRO_CLIENT_TERMS_VERSION, shareText: PRO_SHARE_TEXT_VERSION },
  stylist: null,
  client: { termsCurrent: true, connections: 1, connectionLimit: 5 },
  badge: 0,
  ...over,
});

const connection = (over: Partial<ProConnectionDetail> = {}): ProConnectionDetail => ({
  id: 'c1',
  myRole: 'client',
  status: 'active',
  endedBy: null,
  startedAt: '2026-10-01T10:00:00Z',
  otherLabel: 'Ann',
  myAlias: 'Bea',
  safetyOnly: false,
  stylist: null,
  closet: { shared: true, itemMode: 'all', itemCount: 8, expiresAt: null, expiresSoon: false, lastViewedAt: null, views30d: 0 },
  counts: { looks: 1, upcoming: 0 },
  actions: {
    canMessage: true, canPropose: true, canRecommend: false, canEnd: true,
    canViewCloset: false, canShare: true, canStopSharing: true, canRename: true,
  },
  ...over,
});

const coat = { position: 0, itemId: 'i1', name: 'Camel coat', category: 'outerwear', color: 'camel', hasPhoto: true, photoPath: 'me/coat.jpg', available: true };
const knit = { position: 1, itemId: 'i2', name: 'Grey knit', category: 'tops', hasPhoto: false, available: true };

const clientActions = { canEdit: false, canSend: false, canDelete: false, canGiveFeedback: true, canMarkWorn: true };
const readOnly = { canEdit: false, canSend: false, canDelete: false, canGiveFeedback: false, canMarkWorn: false };

const look = (over: Partial<ProLookDetail> = {}): ProLookDetail => ({
  id: 'r1',
  connectionId: 'c1',
  status: 'sent',
  title: 'Autumn layers',
  body: 'Try the camel coat over the grey knit.',
  sentAt: '2026-10-20T10:00:00Z',
  items: [coat, knit],
  feedback: null,
  actions: clientActions,
  ...over,
});

const stylistSide = () => {
  mockConnection.mockResolvedValue(connection({ myRole: 'stylist', otherLabel: 'Bea' }));
  const stripped = { ...coat, photoPath: undefined };
  mockLook.mockResolvedValue(look({ items: [stripped, knit], actions: readOnly }));
};

/** Pressable shows up as two instances (memo and forwardRef) and Button wraps one; keep the outermost of each chain. */
const outermost = (nodes: ReactTestInstance[]) =>
  nodes.filter(n => {
    for (let p = n.parent; p; p = p.parent) if (nodes.includes(p)) return false;
    return true;
  });

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const mounted: renderer.ReactTestRenderer[] = [];
const mount = async () => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<ProRecommendationScreen />);
  });
  mounted.push(tree);
  const out = () => flatten(tree.toJSON());
  const byLabel = (label: string) =>
    outermost(tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function'));
  const press = async (label: string) => {
    const nodes = byLabel(label);
    if (nodes.length === 0) throw new Error(`nothing to press labelled "${label}"`);
    await act(async () => {
      nodes[0].props.onPress();
    });
  };
  const has = (label: string) => byLabel(label).length > 0;
  const comment = () => tree.root.findAllByType(TextInput)[0];
  const typeComment = async (value: string) => {
    await act(async () => {
      comment().props.onChangeText(value);
    });
  };
  const worn = () => tree.root.findAllByType(Switch)[0];
  const photos = () => tree.root.findAllByType('ProPhoto' as any);
  const safety = () => tree.root.findByType('ProSafetySheet' as any);
  const terms = () => tree.root.findAllByType('ProTermsSheet' as any);
  const notice = () => tree.root.findAllByType('ProAccessNotice' as any);
  /** The state of one mark of the rating: the Pressable that carries a state. */
  const mark = (score: number) =>
    tree.root.find(n => n.props.accessibilityLabel === `Rating, ${score} of 5` && n.props.accessibilityState !== undefined);
  return { tree, out, byLabel, press, has, comment, typeComment, worn, photos, safety, terms, notice, mark };
};

let alertSpy: jest.SpyInstance;
let errorSpy: jest.SpyInstance;

beforeEach(() => {
  mockParams = { recId: 'r1', connectionId: 'c1' };
  mockNavigate.mockReset();
  mockGoBack.mockReset();
  mockStatus.mockReset().mockResolvedValue(status());
  mockAccept.mockReset().mockResolvedValue(undefined);
  mockConnection.mockReset().mockResolvedValue(connection());
  mockLook.mockReset().mockResolvedValue(look());
  mockFeedback.mockReset().mockResolvedValue(undefined);
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach(t => t.unmount());
  });
  expect(errorSpy).not.toHaveBeenCalled();
  jest.restoreAllMocks();
});

describe('ProRecommendationScreen: what the client sees', () => {
  it('shows the title, the note, when it was sent, who from, and the pieces', async () => {
    const { out } = await mount();
    expect(out()).toContain('Ann');
    expect(out()).toContain('Autumn layers');
    expect(out()).toContain('Try the camel coat over the grey knit.');
    expect(out()).toContain('Sent ');
    expect(out()).toContain('Camel coat');
    expect(out()).toContain('outerwear, camel');
    expect(out()).toContain('Grey knit');
    expect(mockLook).toHaveBeenCalledWith('r1');
    expect(mockConnection).toHaveBeenCalledWith('c1');
  });

  it('shows a look that was sent as New to the client, and a viewed one as Viewed', async () => {
    expect((await mount()).out()).toContain('New');
    mockLook.mockResolvedValue(look({ status: 'viewed' }));
    expect((await mount()).out()).toContain('Viewed');
  });

  it('draws each piece with the client\'s own photo path, and a placeholder for one with no photo', async () => {
    const { photos } = await mount();
    expect(photos()).toHaveLength(2);
    expect(photos()[0].props).toMatchObject({ ownPath: 'me/coat.jpg', hasPhoto: true });
    expect(photos()[0].props.connectionId).toBeUndefined();
    expect(photos()[1].props).toMatchObject({ ownPath: null, hasPhoto: false });
  });

  it('shows a piece the client no longer has with its name and says so', async () => {
    mockLook.mockResolvedValue(look({ items: [{ ...coat, available: false, hasPhoto: false, photoPath: undefined }, knit] }));
    const { out, photos } = await mount();
    expect(out()).toContain('Camel coat');
    expect(out()).toContain('No longer in your closet');
    expect(photos()[0].props.hasPhoto).toBe(false);
  });

  it('says so for a look with a note and no pieces', async () => {
    mockLook.mockResolvedValue(look({ items: [] }));
    const { out, photos } = await mount();
    expect(out()).toContain('This look has no pieces, only a note.');
    expect(photos()).toHaveLength(0);
  });

  it('goes back from the header', async () => {
    const { press } = await mount();
    await press('Go back');
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('shows a skeleton until the look arrives', async () => {
    mockLook.mockReturnValue(new Promise(() => {}));
    const { tree, out } = await mount();
    expect(tree.root.findAllByType('Skeleton' as any).length).toBeGreaterThan(0);
    expect(out()).not.toContain('Autumn layers');
  });

  it('says where the connection stands when it has ended, and takes the controls away', async () => {
    mockConnection.mockResolvedValue(connection({ status: 'ended', endedBy: 'me' }));
    mockLook.mockResolvedValue(look({ actions: readOnly, feedback: { rating: 4, comment: 'Lovely', at: '2026-10-21T10:00:00Z' } }));
    const { out, tree, has } = await mount();
    expect(out()).toContain('You ended this connection.');
    expect(out()).toContain('Your feedback');
    expect(out()).toContain('Lovely');
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
    expect(tree.root.findAllByType(Switch)).toHaveLength(0);
    expect(has('Save comment')).toBe(false);
    expect(has('Rating, 3 of 5')).toBe(false);
  });

  it('uses the neutral line when the other person ended it', async () => {
    mockConnection.mockResolvedValue(connection({ status: 'ended', endedBy: 'them' }));
    mockLook.mockResolvedValue(look({ actions: readOnly }));
    const { out } = await mount();
    expect(out()).toContain('This connection has ended.');
    expect(out().toLowerCase()).not.toContain('block');
  });

  it('has no commerce wording', async () => {
    const { out } = await mount();
    expect(out()).not.toMatch(/\b(book|pay now|buy|checkout|deposit|premium|featured|verified|certified|top rated)\b/i);
  });
});

describe('ProRecommendationScreen: giving feedback', () => {
  it('rates with one tap, saves it alone, and shows what the server now holds', async () => {
    const { press, mark } = await mount();
    mockLook.mockResolvedValue(look({ status: 'viewed', feedback: { rating: 4, at: '2026-10-21T10:00:00Z' } }));
    await press('Rating, 4 of 5');
    expect(mockFeedback).toHaveBeenCalledTimes(1);
    expect(mockFeedback).toHaveBeenCalledWith('r1', { rating: 4 });
    expect(mockLook).toHaveBeenCalledTimes(2);
    expect(mark(4).props.accessibilityState).toMatchObject({ selected: true });
    expect(mark(3).props.accessibilityState).toMatchObject({ selected: false });
  });

  it('starts with no rating chosen', async () => {
    const { mark } = await mount();
    for (const score of [1, 2, 3, 4, 5]) expect(mark(score).props.accessibilityState).toMatchObject({ selected: false });
  });

  it('shows a rating that was given earlier', async () => {
    mockLook.mockResolvedValue(look({ status: 'viewed', feedback: { rating: 2, at: '2026-10-21T10:00:00Z' } }));
    const { mark } = await mount();
    expect(mark(2).props.accessibilityState).toMatchObject({ selected: true });
  });

  it('saves a comment with its own button, trimmed, and only once it has changed', async () => {
    const { press, typeComment, comment, byLabel } = await mount();
    const disabled = () => byLabel('Save comment')[0].props.accessibilityState?.disabled;
    expect(disabled()).toBe(true);
    await typeComment('  Loved the coat  ');
    expect(disabled()).toBe(false);
    mockLook.mockResolvedValue(look({ status: 'viewed', feedback: { comment: 'Loved the coat', at: '2026-10-21T10:00:00Z' } }));
    await press('Save comment');
    expect(mockFeedback).toHaveBeenCalledWith('r1', { comment: 'Loved the coat' });
    expect(comment().props.value).toBe('Loved the coat');
    expect(disabled()).toBe(true);
  });

  it('shows the comment that was saved earlier in the field', async () => {
    mockLook.mockResolvedValue(look({ status: 'viewed', feedback: { comment: 'Loved the coat', at: '2026-10-21T10:00:00Z' } }));
    const { comment } = await mount();
    expect(comment().props.value).toBe('Loved the coat');
  });

  it('lets the person clear a comment', async () => {
    mockLook.mockResolvedValue(look({ status: 'viewed', feedback: { comment: 'Loved the coat', at: '2026-10-21T10:00:00Z' } }));
    const { press, typeComment } = await mount();
    await typeComment('');
    await press('Save comment');
    expect(mockFeedback).toHaveBeenCalledWith('r1', { comment: '' });
  });

  it('does not overwrite words being typed when the look is read again', async () => {
    const { typeComment, comment, tree } = await mount();
    await typeComment('Half a thought');
    mockLook.mockResolvedValue(look({ feedback: { rating: 5, at: '2026-10-21T10:00:00Z' } }));
    await act(async () => {
      await tree.root.findByType(RefreshControl).props.onRefresh();
    });
    expect(comment().props.value).toBe('Half a thought');
  });

  it('is a multiline field of 500 characters with a counter', async () => {
    const { comment, typeComment, out } = await mount();
    expect(comment().props.multiline).toBe(true);
    expect(comment().props.maxLength).toBe(500);
    expect(comment().props.accessibilityLabel).toBe('Comment');
    expect(out()).toContain('0/500');
    await typeComment('Lovely');
    expect(out()).toContain('6/500');
  });

  it('marks the look as worn from the switch and takes the mark off again', async () => {
    const { worn, out } = await mount();
    expect(worn().props.accessibilityLabel).toBe('I wore this');
    expect(worn().props.value).toBe(false);
    mockLook.mockResolvedValue(look({ status: 'implemented' }));
    await act(async () => {
      worn().props.onValueChange(true);
    });
    expect(mockFeedback).toHaveBeenLastCalledWith('r1', { worn: true });
    expect(worn().props.value).toBe(true);
    expect(out()).toContain('You wore it');

    mockLook.mockResolvedValue(look({ status: 'viewed' }));
    await act(async () => {
      worn().props.onValueChange(false);
    });
    expect(mockFeedback).toHaveBeenLastCalledWith('r1', { worn: false });
    expect(worn().props.value).toBe(false);
  });

  it('shows no switch when the server does not allow marking it worn', async () => {
    mockLook.mockResolvedValue(look({ actions: { ...clientActions, canMarkWorn: false } }));
    const { tree } = await mount();
    expect(tree.root.findAllByType(Switch)).toHaveLength(0);
  });

  it('does one thing at a time', async () => {
    const slow = deferred<void>();
    mockFeedback.mockReturnValue(slow.promise);
    const { press, worn } = await mount();
    await press('Rating, 5 of 5');
    await press('Rating, 3 of 5');
    await act(async () => {
      worn().props.onValueChange(true);
    });
    expect(mockFeedback).toHaveBeenCalledTimes(1);
    await act(async () => {
      slow.resolve();
    });
  });

  it('keeps the typed comment and says why when saving fails', async () => {
    mockFeedback.mockRejectedValueOnce({ message: 'Network request failed' });
    const { press, typeComment, comment } = await mount();
    await typeComment('Loved the coat');
    await press('Save comment');
    expect(alertSpy).toHaveBeenCalledWith("Couldn't do that", 'You seem to be offline. Please try again.');
    expect(comment().props.value).toBe('Loved the coat');
    mockFeedback.mockResolvedValue(undefined);
    await press('Save comment');
    expect(mockFeedback).toHaveBeenCalledTimes(2);
  });

  it('explains a comment the server refuses, in plain words', async () => {
    mockFeedback.mockRejectedValueOnce(new ProError('text_not_allowed', 'text_not_allowed', 'comment', 'content'));
    const { press, typeComment, comment } = await mount();
    await typeComment('something not allowed');
    await press('Save comment');
    expect(alertSpy).toHaveBeenCalledWith("Couldn't do that", "That wording isn't allowed.");
    expect(comment().props.value).toBe('something not allowed');
  });

  it('never shows a raw error', async () => {
    mockFeedback.mockRejectedValueOnce(new Error('relation "pro_recommendations" exploded'));
    const { press } = await mount();
    await press('Rating, 2 of 5');
    expect(alertSpy).toHaveBeenCalledWith("Couldn't do that", "Couldn't save your rating. Please try again.");
  });

  it('reloads and says so when the connection ended meanwhile', async () => {
    mockFeedback.mockRejectedValueOnce(new ProError('connection_ended'));
    const { press, out } = await mount();
    mockConnection.mockResolvedValue(connection({ status: 'ended', endedBy: 'them' }));
    mockLook.mockResolvedValue(look({ actions: readOnly }));
    await press('Rating, 4 of 5');
    expect(alertSpy).toHaveBeenCalledWith("Couldn't do that", 'This connection has ended.');
    expect(out()).toContain('This connection has ended.');
  });
});

describe('ProRecommendationScreen: what the stylist sees', () => {
  it('shows the look as sent, with the client\'s feedback, and nothing to fill in', async () => {
    stylistSide();
    mockLook.mockResolvedValue(
      look({ items: [{ ...coat, photoPath: undefined }, knit], actions: readOnly, feedback: { rating: 5, comment: 'Perfect fit', at: '2026-10-21T10:00:00Z' } }),
    );
    const { out, tree } = await mount();
    expect(out()).toContain('Bea');
    expect(out()).toContain('Autumn layers');
    expect(out()).toContain('Sent');
    expect(out()).toContain('Feedback from Bea');
    expect(out()).toContain('Perfect fit');
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
    expect(tree.root.findAllByType(Switch)).toHaveLength(0);
    expect(tree.root.findAllByType(InputAccessoryView)).toHaveLength(0);
  });

  it('asks the photo function for each piece, by connection and piece, and never passes a path', async () => {
    stylistSide();
    const { photos } = await mount();
    expect(photos()[0].props).toMatchObject({ connectionId: 'c1', itemId: 'i1', hasPhoto: true });
    expect(photos()[0].props.ownPath).toBeUndefined();
    expect(photos()[1].props).toMatchObject({ connectionId: 'c1', itemId: 'i2', hasPhoto: false });
  });

  it('never passes on or shows a storage path, even if one arrives in the answer', async () => {
    mockConnection.mockResolvedValue(connection({ myRole: 'stylist', otherLabel: 'Bea' }));
    mockLook.mockResolvedValue(look({ items: [{ ...coat, photoPath: 'client-account-id/coat.jpg' }, knit], actions: readOnly }));
    const { photos, out } = await mount();
    expect(photos()[0].props.ownPath).toBeUndefined();
    expect(out()).not.toContain('client-account-id');
    expect(JSON.stringify(photos().map(p => p.props))).not.toContain('client-account-id');
  });

  it('shows a piece that is no longer available by its name only', async () => {
    stylistSide();
    mockLook.mockResolvedValue(look({ items: [{ ...coat, available: false, hasPhoto: false, photoPath: undefined, category: undefined, color: undefined } as any, knit], actions: readOnly }));
    const { out } = await mount();
    expect(out()).toContain('Camel coat');
    expect(out()).toContain('No longer available');
    expect(out()).not.toContain('your closet');
  });

  it('says "They wore it" once the client has marked it worn', async () => {
    stylistSide();
    mockLook.mockResolvedValue(look({ status: 'implemented', actions: readOnly, items: [] }));
    expect((await mount()).out()).toContain('They wore it');
  });

  it('shows a draft as a draft', async () => {
    stylistSide();
    mockLook.mockResolvedValue(look({ status: 'draft', sentAt: undefined, actions: { ...readOnly, canEdit: true, canSend: true, canDelete: true } }));
    const { out } = await mount();
    expect(out()).toContain('Draft');
    expect(out()).not.toContain('Sent ');
  });

  it('shows no feedback card when the client has given none', async () => {
    stylistSide();
    const { out } = await mount();
    expect(out()).not.toContain('Feedback from');
  });
});

describe('ProRecommendationScreen: keeping it fresh', () => {
  it('reloads by pull to refresh and shows a failed refresh as a banner over the look', async () => {
    const { tree, out } = await mount();
    mockLook.mockRejectedValueOnce({ message: 'Network request failed' });
    await act(async () => {
      await tree.root.findByType(RefreshControl).props.onRefresh();
    });
    expect(out()).toContain("Couldn't load your look");
    expect(out()).toContain('Autumn layers');
  });

  it('ignores a slow answer that was asked for before one it already showed', async () => {
    const slow = deferred<ProLookDetail>();
    const { tree, out } = await mount();
    mockLook.mockReturnValueOnce(slow.promise);
    let first!: Promise<void>;
    await act(async () => {
      first = tree.root.findByType(RefreshControl).props.onRefresh();
    });
    // A second pull asked later and answered first.
    mockLook.mockResolvedValueOnce(look({ title: 'Newest look' }));
    await act(async () => {
      await tree.root.findByType(RefreshControl).props.onRefresh();
    });
    expect(out()).toContain('Newest look');
    await act(async () => {
      slow.resolve(look({ title: 'Stale look' }));
      await first;
    });
    expect(out()).toContain('Newest look');
    expect(out()).not.toContain('Stale look');
  });
});

describe('ProRecommendationScreen: states of the look itself', () => {
  it('shows "This is no longer available." with a way back when the look is gone', async () => {
    mockLook.mockRejectedValue(new ProError('pro_unavailable'));
    const { out, press } = await mount();
    expect(out()).toContain('This is no longer available.');
    await press('Back');
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('shows the same when the connection is gone', async () => {
    mockConnection.mockRejectedValue(new ProError('pro_unavailable'));
    expect((await mount()).out()).toContain('This is no longer available.');
  });

  it('shows the same when it is opened without ids', async () => {
    mockParams = { recId: 'r1' };
    const { out } = await mount();
    expect(out()).toContain('This is no longer available.');
    expect(mockLook).not.toHaveBeenCalled();
  });

  it('shows the load error with Try again when the look cannot be loaded at all', async () => {
    mockLook.mockRejectedValueOnce({ message: 'Network request failed' });
    const { out, press } = await mount();
    expect(out()).toContain("Couldn't load your look");
    await press('Try again to load your look');
    expect(out()).toContain('Autumn layers');
  });

  it('shows a draft the client cannot see as gone, the way the server does', async () => {
    mockLook.mockRejectedValue(new ProError('pro_unavailable'));
    const { out, tree } = await mount();
    expect(out()).toContain('This is no longer available.');
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
  });
});

describe('ProRecommendationScreen: reporting and blocking', () => {
  it('opens the safety sheet for the look from the header menu', async () => {
    const { press, safety } = await mount();
    expect(safety().props.visible).toBe(false);
    await press('Report or block Ann');
    expect(safety().props).toMatchObject({ visible: true, refType: 'recommendation', refId: 'r1', label: 'Ann', connectionId: 'c1' });
  });

  it('leaves the look after a block', async () => {
    const { press, safety } = await mount();
    await press('Report or block Ann');
    await act(async () => {
      safety().props.onBlocked();
    });
    expect(safety().props.visible).toBe(false);
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('closes the sheet without leaving', async () => {
    const { press, safety } = await mount();
    await press('Report or block Ann');
    await act(async () => {
      safety().props.onClose();
    });
    expect(safety().props.visible).toBe(false);
    expect(mockGoBack).not.toHaveBeenCalled();
  });

  it('keeps the menu on a look of an ended connection', async () => {
    mockConnection.mockResolvedValue(connection({ status: 'ended', endedBy: 'them' }));
    mockLook.mockResolvedValue(look({ actions: readOnly }));
    expect((await mount()).has('Report or block Ann')).toBe(true);
  });

  it('is there for the stylist too', async () => {
    stylistSide();
    const { press, safety } = await mount();
    await press('Report or block Bea');
    expect(safety().props).toMatchObject({ refType: 'recommendation', refId: 'r1', label: 'Bea', connectionId: 'c1' });
  });
});

describe('ProRecommendationScreen: keyboard', () => {
  it('gives the comment field its own accessory bar, not the shared Done bar', async () => {
    const { tree, comment } = await mount();
    const bars = tree.root.findAllByType(InputAccessoryView);
    expect(bars).toHaveLength(1);
    expect(bars[0].props.nativeID).toBe(PRO_COMMENT_ACCESSORY_ID);
    expect(comment().props.inputAccessoryViewID).toBe(PRO_COMMENT_ACCESSORY_ID);
    expect(PRO_COMMENT_ACCESSORY_ID).toBe('smartcloset-pro-comment-done');
    expect(PRO_COMMENT_ACCESSORY_ID).not.toBe(KEYBOARD_DONE_ID);
    expect(comment().props.inputAccessoryViewID).not.toBe(KEYBOARD_DONE_ID);
  });

  it('labels the bar "Done"', async () => {
    const { tree } = await mount();
    const done = outermost(tree.root.findAll(n => n.props.accessibilityLabel === 'Done' && typeof n.props.onPress === 'function'));
    expect(done).toHaveLength(1);
  });

  it('has exactly one KeyboardActionBar and no KeyboardDoneBar in the source', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../src/screens/ProRecommendationScreen.tsx'), 'utf8');
    expect(source.match(/<KeyboardActionBar\b/g)).toHaveLength(1);
    expect(source).toMatch(/<KeyboardActionBar nativeID=\{PRO_COMMENT_ACCESSORY_ID\} label="Done"/);
    expect(source).toMatch(/inputAccessoryViewID=\{PRO_COMMENT_ACCESSORY_ID\}/);
    expect(source).not.toMatch(/<KeyboardDoneBar\b/);
    expect(source).not.toMatch(/keyboardDoneProps/);
  });

  it('scrolls the field above the keyboard: it sits in a keyboard-safe scroll view', async () => {
    const { comment } = await mount();
    const above: ReactTestInstance[] = [];
    for (let n = comment().parent; n; n = n.parent) above.push(n);
    const scroll = above.find(a => a.type === ScrollView);
    expect(scroll?.props.automaticallyAdjustKeyboardInsets).toBe(true);
    expect(scroll?.props.keyboardShouldPersistTaps).toBe('handled');
  });
});

describe('ProRecommendationScreen: who can use it', () => {
  it('asks a guest to sign in, reads nothing and offers no route of its own', async () => {
    mockStatus.mockRejectedValue(new ProError('not_authenticated'));
    const { notice } = await mount();
    expect(notice()[0].props.access.state).toBe('guest');
    expect(notice()[0].props.onSignIn).toBeUndefined();
    expect(mockLook).not.toHaveBeenCalled();
    expect(mockConnection).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('says professional features are not available on a server without them', async () => {
    mockStatus.mockRejectedValue({ message: 'x', code: 'PGRST202' });
    const { notice } = await mount();
    expect(notice()[0].props.access.state).toBe('not_deployed');
    expect(mockLook).not.toHaveBeenCalled();
  });

  it('shows the load error when the access check itself fails, and carries on after Try again', async () => {
    mockStatus.mockRejectedValueOnce({ message: 'Network request failed' });
    const { notice, out } = await mount();
    expect(notice()[0].props.access.state).toBe('error');
    expect(mockLook).not.toHaveBeenCalled();
    await act(async () => {
      await notice()[0].props.onRefresh();
    });
    expect(out()).toContain('Autumn layers');
  });

  it('does not read a look on an active connection while paused: the server refuses and the notice says paused', async () => {
    mockStatus.mockResolvedValue(status({ proEnabled: false }));
    mockLook.mockRejectedValue(new ProError('pro_disabled'));
    const { notice, out } = await mount();
    expect(notice()[0].props.access.state).toBe('paused');
    expect(out()).not.toContain('Autumn layers');
  });

  it('still reads a look on an ended connection while paused, with a note, and keeps the menu', async () => {
    mockStatus.mockResolvedValue(status({ proEnabled: false }));
    mockConnection.mockResolvedValue(connection({ status: 'ended', endedBy: 'them' }));
    mockLook.mockResolvedValue(look({ actions: readOnly }));
    const { out, has, tree } = await mount();
    expect(out()).toContain('Autumn layers');
    expect(out()).toContain(PRO_PAUSED_MESSAGE);
    expect(has('Report or block Ann')).toBe(true);
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
  });

  it('keeps an ended look readable for a suspended person, with a notice', async () => {
    mockStatus.mockResolvedValue(status({ suspended: true }));
    mockConnection.mockResolvedValue(connection({ status: 'ended', endedBy: 'them' }));
    mockLook.mockResolvedValue(look({ actions: readOnly }));
    const { out } = await mount();
    expect(out()).toContain(PRO_SUSPENDED_MESSAGE);
    expect(out()).toContain('Autumn layers');
  });

  it('keeps the menu when a suspended person\'s active look is refused', async () => {
    mockStatus.mockResolvedValue(status({ suspended: true }));
    mockLook.mockRejectedValue(new ProError('pro_suspended'));
    const { notice, has } = await mount();
    expect(notice()[0].props.access.state).toBe('suspended');
    expect(has('Report or block Ann')).toBe(true);
  });

  describe('terms', () => {
    const needsTerms = () => status({ client: { termsCurrent: false, connections: 1, connectionLimit: 5 } });

    it('hands the notice what it needs to offer the terms, then loads the look once they are accepted', async () => {
      mockStatus.mockResolvedValue(needsTerms());
      mockLook.mockRejectedValueOnce(new ProError('pro_terms_required', 'pro_terms_required', 'client'));
      const { notice, terms, out } = await mount();
      expect(notice()[0].props).toMatchObject({ role: 'client' });
      expect(notice()[0].props.access).toMatchObject({ state: 'ready', client: 'needs_terms' });
      await act(async () => {
        notice()[0].props.onReadTerms();
      });
      expect(terms()[0].props).toMatchObject({ visible: true, role: 'client', needsAdult: false });
      mockStatus.mockResolvedValue(status());
      await act(async () => {
        terms()[0].props.onAccepted();
      });
      expect(terms()).toHaveLength(0);
      expect(out()).toContain('Autumn layers');
    });

    it('opens the terms when feedback needs them, and repeats the same feedback once they are accepted', async () => {
      mockFeedback.mockRejectedValueOnce(new ProError('pro_terms_required', 'pro_terms_required', 'client'));
      const { press, terms } = await mount();
      await press('Rating, 4 of 5');
      expect(alertSpy).not.toHaveBeenCalled();
      expect(terms()).toHaveLength(1);
      await act(async () => {
        terms()[0].props.onAccepted();
      });
      expect(mockFeedback).toHaveBeenCalledTimes(2);
      expect(mockFeedback).toHaveBeenLastCalledWith('r1', { rating: 4 });
      expect(terms()).toHaveLength(0);
    });

    it('drops the feedback when the terms are closed', async () => {
      mockFeedback.mockRejectedValueOnce(new ProError('pro_terms_required', 'pro_terms_required', 'client'));
      const { press, terms } = await mount();
      await press('Rating, 4 of 5');
      await act(async () => {
        terms()[0].props.onClose();
      });
      expect(terms()).toHaveLength(0);
      expect(mockFeedback).toHaveBeenCalledTimes(1);
    });

    it('asks for an update, and opens no terms, when this build\'s terms are not the server\'s', async () => {
      mockStatus.mockResolvedValue(status({ versions: { stylistTerms: PRO_STYLIST_TERMS_VERSION, clientTerms: '2099-01', shareText: PRO_SHARE_TEXT_VERSION } }));
      mockFeedback.mockRejectedValueOnce(new ProError('pro_terms_required', 'pro_terms_required', 'client'));
      const { press, terms } = await mount();
      await press('Rating, 4 of 5');
      expect(terms()).toHaveLength(0);
      expect(alertSpy).toHaveBeenCalledWith("Couldn't do that", PRO_UPDATE_REQUIRED_MESSAGE);
      expect(mockAccept).not.toHaveBeenCalled();
    });
  });
});

describe('ProRecommendationScreen: the source', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/screens/ProRecommendationScreen.tsx'), 'utf8');

  it('navigates nowhere but back', () => {
    expect(source).not.toMatch(/\.navigate\(/);
    expect(source).not.toMatch(/\b(?:nav|screen):\s*'/);
    expect(source).toMatch(/navigation\.goBack\(\)/);
  });

  it('uses no storage key, no console.error and no module-scope side effects of its own', () => {
    expect(source).not.toMatch(/AsyncStorage|@smartcloset_/);
    expect(source).not.toMatch(/console\.error/);
    expect(source).not.toMatch(/^(?:setInterval|setTimeout|fetch)\(/m);
  });

  it('asks the photo function for a stylist\'s pieces by connection and piece id', () => {
    expect(source).toMatch(/connectionId=\{connectionId\} itemId=\{item\.itemId\}/);
  });
});
