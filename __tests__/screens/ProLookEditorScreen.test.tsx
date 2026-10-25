import 'react-native';
import React from 'react';
import fs from 'fs';
import path from 'path';
import { Alert } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import type { ReactTestInstance } from 'react-test-renderer';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
let mockParams: any = { connectionId: 'conn-1' };
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
const mockGetLook = jest.fn();
const mockSave = jest.fn();
const mockSend = jest.fn();
const mockDelete = jest.fn();
jest.mock('../../src/services/proService', () => ({
  getProStatus: (...a: any[]) => mockStatus(...a),
  acceptProTerms: (...a: any[]) => mockAccept(...a),
  getProConnection: (...a: any[]) => mockConnection(...a),
  getProLook: (...a: any[]) => mockGetLook(...a),
  saveProLook: (...a: any[]) => mockSave(...a),
  sendProLook: (...a: any[]) => mockSend(...a),
  deleteProLook: (...a: any[]) => mockDelete(...a),
}));

// The shimmer animation never stops on its own; a plain marker keeps the tests quiet and finite.
jest.mock('../../src/ui/Skeleton', () => {
  const R = require('react');
  const Skeleton = (props: any) => R.createElement('Skeleton', props);
  return { __esModule: true, default: Skeleton, Skeleton };
});
const marker = (name: string) => {
  const R = require('react');
  return { __esModule: true, default: (props: any) => R.createElement(name, props) };
};
jest.mock('../../src/components/ProPhoto', () => marker('ProPhoto'));
jest.mock('../../src/components/ProAccessNotice', () => marker('ProAccessNotice'));
jest.mock('../../src/components/ProTermsSheet', () => marker('ProTermsSheet'));
jest.mock('../../src/components/ProClosetPicker', () => marker('ProClosetPicker'));

import ProLookEditorScreen from '../../src/screens/ProLookEditorScreen';
import { ProError } from '../../src/services/proErrors';
import { KEYBOARD_DONE_ID } from '../../src/components/KeyboardSafe';
import { PRO_CLIENT_TERMS_VERSION, PRO_SHARE_TEXT_VERSION, PRO_STYLIST_TERMS_VERSION, proClosetNotShared } from '../../src/config/proRules';
import type { ProClosetItem, ProConnectionDetail, ProLookDetail, ProStatus } from '../../src/types/pro';

const flatten = (node: any): string =>
  !node ? '' : typeof node === 'string' ? node : Array.isArray(node) ? node.map(flatten).join(' ') : flatten(node.children);

const status = (over: Partial<ProStatus> = {}, termsCurrent = true): ProStatus => ({
  proEnabled: true,
  suspended: false,
  adultConfirmed: true,
  stylistRemoved: false,
  versions: { stylistTerms: PRO_STYLIST_TERMS_VERSION, clientTerms: PRO_CLIENT_TERMS_VERSION, shareText: PRO_SHARE_TEXT_VERSION },
  stylist: { termsCurrent, accepting: true, approved: true, invitesHeld: false, activeClients: 1, clientLimit: 25, liveInvites: 0, inviteLimit: 10 },
  client: { termsCurrent: true, connections: 0, connectionLimit: 5 },
  badge: 0,
  ...over,
});

const detail = (over: Partial<ProConnectionDetail> = {}, canViewCloset = true): ProConnectionDetail => ({
  id: 'conn-1',
  myRole: 'stylist',
  status: 'active',
  endedBy: null,
  startedAt: '2026-10-01T10:00:00Z',
  otherLabel: 'Ana',
  myAlias: null,
  safetyOnly: false,
  stylist: null,
  closet: { shared: true, itemMode: 'all', itemCount: 4, expiresAt: '2027-01-15T10:00:00Z', expiresSoon: false, lastViewedAt: null, views30d: 0 },
  counts: { looks: 0, upcoming: 0 },
  actions: {
    canMessage: true, canPropose: true, canRecommend: true, canEnd: true, canViewCloset,
    canShare: false, canStopSharing: false, canRename: false,
  },
  ...over,
});

const piece = (id: string, over: Partial<ProClosetItem> = {}): ProClosetItem => ({
  id,
  name: `Piece ${id}`,
  category: 'tops',
  hasPhoto: true,
  ...over,
});

const draft = (over: Partial<ProLookDetail> = {}): ProLookDetail => ({
  id: 'draft-1',
  connectionId: 'conn-1',
  status: 'draft',
  title: 'Autumn layers',
  body: 'Warm and easy.',
  items: [
    { position: 2, itemId: 'p2', name: 'Piece p2', category: 'tops', color: 'navy', brand: 'Zara', hasPhoto: true, available: true },
    { position: 1, itemId: 'p1', name: 'Piece p1', category: 'outerwear', hasPhoto: false, available: true },
    { position: 3, name: 'A piece with no id', hasPhoto: false, available: false },
  ],
  feedback: null,
  actions: { canEdit: true, canSend: true, canDelete: true, canGiveFeedback: false, canMarkWorn: false },
  ...over,
});

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
    tree = renderer.create(<ProLookEditorScreen />);
  });
  mounted.push(tree);
  const text = () => flatten(tree.toJSON());
  const byLabel = (label: string) =>
    outermost(tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function'));
  const has = (label: string) => byLabel(label).length > 0;
  const press = async (label: string) => {
    const nodes = byLabel(label);
    if (nodes.length === 0) throw new Error(`nothing to press labelled "${label}"`);
    await act(async () => {
      nodes[0].props.onPress();
    });
  };
  const field = (label: string) =>
    tree.root.find(n => n.props.accessibilityLabel === label && typeof n.props.onChangeText === 'function');
  const type = async (label: string, value: string) => {
    await act(async () => {
      field(label).props.onChangeText(value);
    });
  };
  const marked = (name: string) => tree.root.findAllByType(name as any);
  /** Picks pieces in the picker, the way the sheet hands them back. */
  const pick = async (items: ProClosetItem[]) => {
    await act(async () => {
      marked('ProClosetPicker')[0].props.onDone(items);
    });
  };
  return { tree, text, byLabel, has, press, field, type, marked, pick };
};

/** Runs the button of the last Alert. */
const confirmAlert = async (buttonText: string) => {
  const call = (Alert.alert as jest.Mock).mock.calls.at(-1);
  const button = call[2].find((b: any) => b.text === buttonText);
  await act(async () => {
    await button.onPress();
  });
};

let errorSpy: jest.SpyInstance;
beforeEach(() => {
  mockParams = { connectionId: 'conn-1' };
  mockNavigate.mockReset();
  mockGoBack.mockReset();
  mockStatus.mockReset().mockResolvedValue(status());
  mockAccept.mockReset().mockResolvedValue(undefined);
  mockConnection.mockReset().mockResolvedValue(detail());
  mockGetLook.mockReset().mockResolvedValue(draft());
  mockSave.mockReset().mockResolvedValue({ id: 'draft-1', status: 'draft', updatedAt: '2026-10-24T10:00:00Z' });
  mockSend.mockReset().mockResolvedValue(undefined);
  mockDelete.mockReset().mockResolvedValue(undefined);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  act(() => {
    mounted.splice(0).forEach(t => t.unmount());
  });
  expect(errorSpy).not.toHaveBeenCalled();
  jest.restoreAllMocks();
});

describe('ProLookEditorScreen: a new look', () => {
  it('opens empty, with the client\'s name on the Send button', async () => {
    const { has, text, field } = await mount();
    expect(text()).toContain('New look');
    expect(field('Look title').props.value).toBe('');
    expect(field('Look note').props.value).toBe('');
    expect(has('Add pieces')).toBe(true);
    expect(has('Save draft')).toBe(true);
    expect(has('Send to Ana')).toBe(true);
    expect(has('Delete draft')).toBe(false);
    expect(mockGetLook).not.toHaveBeenCalled();
  });

  it('limits the title and the note to what the server accepts', async () => {
    const { field } = await mount();
    expect(field('Look title').props.maxLength).toBe(80);
    expect(field('Look note').props.maxLength).toBe(1000);
  });

  it('counts what was typed', async () => {
    const { type, text } = await mount();
    await type('Look title', 'Autumn');
    await type('Look note', 'Warm');
    expect(text()).toContain('6/80');
    expect(text()).toContain('4/1000');
  });

  describe('saving a draft', () => {
    it('needs a title, and asks nothing of the server without one', async () => {
      const { press, text } = await mount();
      await press('Save draft');
      expect(text()).toContain('Give the look a title.');
      expect(mockSave).not.toHaveBeenCalled();
    });

    it('creates the draft with the connection, the text and a reference, and says it is saved', async () => {
      const { press, type, text, has } = await mount();
      await type('Look title', '  Autumn layers  ');
      await type('Look note', 'Warm and easy.');
      await press('Save draft');
      expect(mockSave).toHaveBeenCalledTimes(1);
      const input = mockSave.mock.calls[0][0];
      expect(input).toMatchObject({ connectionId: 'conn-1', title: 'Autumn layers', body: 'Warm and easy.' });
      expect(input.id).toBeUndefined();
      expect(input.itemIds).toBeUndefined();
      expect(input.clientRef).toMatch(/^[0-9a-f-]{36}$/);
      expect(text()).toContain('Draft saved.');
      expect(has('Delete draft')).toBe(true);
    });

    it('edits the draft by its id afterwards, with no reference and without touching the pieces', async () => {
      const { press, type } = await mount();
      await type('Look title', 'Autumn');
      await press('Save draft');
      await type('Look title', 'Autumn layers');
      await press('Save draft');
      const second = mockSave.mock.calls[1][0];
      expect(second.id).toBe('draft-1');
      expect(second.clientRef).toBeUndefined();
      expect(second.itemIds).toBeUndefined();
    });

    it('keeps what was typed when saving fails, and the retry uses the same reference', async () => {
      mockSave.mockRejectedValueOnce(new ProError('offline'));
      const { press, type, field, text } = await mount();
      await type('Look title', 'Autumn');
      await type('Look note', 'Warm');
      await press('Save draft');
      expect(text()).toContain('You seem to be offline. Please try again.');
      expect(field('Look title').props.value).toBe('Autumn');
      expect(field('Look note').props.value).toBe('Warm');
      await press('Save draft');
      expect(mockSave.mock.calls[1][0].clientRef).toBe(mockSave.mock.calls[0][0].clientRef);
      expect(mockSave.mock.calls[1][0].id).toBeUndefined();
      expect(text()).toContain('Draft saved.');
    });

    it.each([
      ['draft_limit', 'You have too many drafts for this client. Delete one first.'],
      ['text_not_allowed', 'That wording isn\'t allowed.'],
      ['pro_rate_limited', 'You\'re going a bit fast. Please wait a moment.'],
      ['connection_ended', 'This connection has ended.'],
    ] as const)('says %s in plain words', async (code, words) => {
      mockSave.mockRejectedValue(new ProError(code));
      const { press, type, text } = await mount();
      await type('Look title', 'Autumn');
      await press('Save draft');
      expect(text()).toContain(words);
    });

    it('saves once for two quick taps', async () => {
      const slow = deferred<{ id: string; status: string; updatedAt: string }>();
      mockSave.mockReturnValue(slow.promise);
      const { press, type } = await mount();
      await type('Look title', 'Autumn');
      await press('Save draft');
      await press('Save draft');
      expect(mockSave).toHaveBeenCalledTimes(1);
      await act(async () => {
        slow.resolve({ id: 'draft-1', status: 'draft', updatedAt: 'x' });
      });
    });
  });

  describe('pieces', () => {
    it('opens the picker with what is in the look, the most a look can hold, and the connection', async () => {
      const { press, marked } = await mount();
      expect(marked('ProClosetPicker')[0].props.visible).toBe(false);
      await press('Add pieces');
      expect(marked('ProClosetPicker')[0].props).toMatchObject({
        visible: true,
        connectionId: 'conn-1',
        selectedIds: [],
        selectedItems: [],
        max: 12,
      });
    });

    it('shows the pieces the picker hands back, each with its photo asked for by connection and piece', async () => {
      const { press, pick, text, marked } = await mount();
      await press('Add pieces');
      await pick([piece('p1', { name: 'Navy blazer', brand: 'Zara', color: 'navy' }), piece('p2')]);
      expect(marked('ProClosetPicker')[0].props.visible).toBe(false);
      expect(text()).toContain('Navy blazer');
      expect(text()).toContain('Zara · Navy');
      expect(text()).toContain('2 of 12');
      expect(marked('ProPhoto').map(p => p.props)).toEqual([
        expect.objectContaining({ connectionId: 'conn-1', itemId: 'p1', hasPhoto: true }),
        expect.objectContaining({ connectionId: 'conn-1', itemId: 'p2', hasPhoto: true }),
      ]);
    });

    it('sends the pieces with the first save, and again only after they change', async () => {
      const { press, pick, type } = await mount();
      await type('Look title', 'Autumn');
      await press('Add pieces');
      await pick([piece('p1'), piece('p2')]);
      await press('Save draft');
      expect(mockSave.mock.calls[0][0].itemIds).toEqual(['p1', 'p2']);
      await type('Look title', 'Autumn layers');
      await press('Save draft');
      expect(mockSave.mock.calls[1][0].itemIds).toBeUndefined();
      await press('Remove Piece p1');
      await press('Save draft');
      expect(mockSave.mock.calls[2][0].itemIds).toEqual(['p2']);
      await press('Save draft');
      expect(mockSave.mock.calls[3][0].itemIds).toBeUndefined();
    });

    it('clears the pieces on the server when the last one is removed from a saved draft', async () => {
      const { press, pick, type } = await mount();
      await type('Look title', 'Autumn');
      await press('Add pieces');
      await pick([piece('p1')]);
      await press('Save draft');
      await press('Remove Piece p1');
      await press('Save draft');
      expect(mockSave.mock.calls[1][0].itemIds).toEqual([]);
    });

    it('does not count picking the same pieces again as a change', async () => {
      const { press, pick, type } = await mount();
      await type('Look title', 'Autumn');
      await press('Add pieces');
      await pick([piece('p1')]);
      await press('Save draft');
      await press('Add pieces');
      await pick([piece('p1')]);
      await press('Save draft');
      expect(mockSave.mock.calls[1][0].itemIds).toBeUndefined();
    });

    it('stops at 12 pieces and says so', async () => {
      const { press, pick, text, byLabel } = await mount();
      await press('Add pieces');
      await pick(Array.from({ length: 12 }, (_, i) => piece(`p${i}`)));
      expect(byLabel('Add pieces')[0].props.disabled).toBe(true);
      expect(text()).toContain('A look can hold up to 12 pieces.');
    });

    it('disables Add pieces and says why when the closet is not shared', async () => {
      mockConnection.mockResolvedValue(detail({}, false));
      const { byLabel, text } = await mount();
      expect(byLabel('Add pieces')[0].props.disabled).toBe(true);
      expect(text()).toContain(proClosetNotShared('Ana'));
    });

    it('takes a piece that is no longer shared off the look, says why, and sends the list again', async () => {
      mockSave.mockRejectedValueOnce(new ProError('item_not_shared', 'item_not_shared', '2'));
      const { press, pick, type, text, has } = await mount();
      await type('Look title', 'Autumn');
      await press('Add pieces');
      await pick([piece('p1'), piece('p2', { name: 'Red scarf' }), piece('p3')]);
      await press('Save draft');
      expect(has('Remove Red scarf')).toBe(false);
      expect(has('Remove Piece p1')).toBe(true);
      expect(has('Remove Piece p3')).toBe(true);
      expect(text()).toContain('Red scarf was taken off this look.');
      expect(text()).toContain('That piece isn\'t shared with you.');
      await press('Save draft');
      expect(mockSave.mock.calls[1][0].itemIds).toEqual(['p1', 'p3']);
    });

    it('takes nothing off the look when the whole closet stopped being shared, and says so', async () => {
      mockSave.mockRejectedValueOnce(new ProError('item_not_shared', 'item_not_shared', '1'));
      const { press, pick, type, text, has, byLabel } = await mount();
      await type('Look title', 'Autumn');
      await press('Add pieces');
      await pick([piece('p1'), piece('p2')]);
      mockConnection.mockResolvedValue(detail({}, false));
      await press('Save draft');
      expect(has('Remove Piece p1')).toBe(true);
      expect(has('Remove Piece p2')).toBe(true);
      expect(text()).toContain('They haven\'t shared their closet. You can ask them in a message.');
      expect(byLabel('Add pieces')[0].props.disabled).toBe(true);
    });

    it('says the plain reason when it cannot tell which piece', async () => {
      mockSave.mockRejectedValueOnce(new ProError('item_not_shared'));
      const { press, pick, type, text, has } = await mount();
      await type('Look title', 'Autumn');
      await press('Add pieces');
      await pick([piece('p1')]);
      await press('Save draft');
      expect(text()).toContain('That piece isn\'t shared with you.');
      expect(has('Remove Piece p1')).toBe(true);
    });
  });

  describe('sending', () => {
    it('needs a title, and a note or a piece', async () => {
      const { press, type, text } = await mount();
      await press('Send to Ana');
      expect(text()).toContain('Give the look a title.');
      await type('Look title', 'Autumn');
      await press('Send to Ana');
      expect(text()).toContain('Add a note or at least one piece first.');
      expect(Alert.alert).not.toHaveBeenCalled();
      expect(mockSave).not.toHaveBeenCalled();
    });

    it('asks first, then saves and sends the look and leaves', async () => {
      const { press, type } = await mount();
      await type('Look title', 'Autumn');
      await type('Look note', 'Warm');
      await press('Send to Ana');
      expect(Alert.alert).toHaveBeenCalledWith('Send to Ana', expect.stringContaining('can’t change it after it is sent'), expect.any(Array));
      expect(mockSave).not.toHaveBeenCalled();
      await confirmAlert('Send');
      expect(mockSave).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledWith('draft-1');
      expect(mockGoBack).toHaveBeenCalledTimes(1);
    });

    it('can be cancelled', async () => {
      const { press, type } = await mount();
      await type('Look title', 'Autumn');
      await type('Look note', 'Warm');
      await press('Send to Ana');
      const call = (Alert.alert as jest.Mock).mock.calls.at(-1);
      expect(call[2].find((b: any) => b.text === 'Cancel').style).toBe('cancel');
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('keeps the look when sending fails, and the retry only sends', async () => {
      mockSend.mockRejectedValueOnce(new ProError('offline'));
      const { press, type, text, field } = await mount();
      await type('Look title', 'Autumn');
      await type('Look note', 'Warm');
      await press('Send to Ana');
      await confirmAlert('Send');
      expect(text()).toContain('You seem to be offline. Please try again.');
      expect(mockGoBack).not.toHaveBeenCalled();
      expect(field('Look note').props.value).toBe('Warm');
      await press('Send to Ana');
      await confirmAlert('Send');
      expect(mockSave).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(mockGoBack).toHaveBeenCalledTimes(1);
    });

    it('does not send when saving first fails', async () => {
      mockSave.mockRejectedValueOnce(new ProError('text_not_allowed', 'text_not_allowed', 'body', 'payment'));
      const { press, type, text } = await mount();
      await type('Look title', 'Autumn');
      await type('Look note', 'Pay by gift card');
      await press('Send to Ana');
      await confirmAlert('Send');
      expect(text()).toContain('Payment wording isn\'t allowed here.');
      expect(mockSend).not.toHaveBeenCalled();
      expect(mockGoBack).not.toHaveBeenCalled();
    });

    it('sends a draft nobody changed without saving it again', async () => {
      mockParams = { connectionId: 'conn-1', recId: 'draft-1' };
      const { press } = await mount();
      await press('Send to Ana');
      await confirmAlert('Send');
      expect(mockSave).not.toHaveBeenCalled();
      expect(mockSend).toHaveBeenCalledWith('draft-1');
    });
  });

  describe('the terms', () => {
    it('opens the terms when a write needs them, and tries the same write again once they are accepted', async () => {
      mockSave.mockRejectedValueOnce(new ProError('pro_terms_required', 'pro_terms_required', 'stylist'));
      const { press, type, marked } = await mount();
      await type('Look title', 'Autumn');
      await press('Save draft');
      expect(marked('ProTermsSheet')[0].props).toMatchObject({ visible: true, role: 'stylist', needsAdult: false });
      await act(async () => {
        marked('ProTermsSheet')[0].props.onAccepted();
      });
      expect(marked('ProTermsSheet')[0].props.visible).toBe(false);
      expect(mockSave).toHaveBeenCalledTimes(2);
      expect(mockSave.mock.calls[1][0].clientRef).toBe(mockSave.mock.calls[0][0].clientRef);
    });

    it('does not try again when the terms sheet is dismissed', async () => {
      mockSave.mockRejectedValueOnce(new ProError('pro_terms_required', 'pro_terms_required', 'stylist'));
      const { press, type, marked } = await mount();
      await type('Look title', 'Autumn');
      await press('Save draft');
      await act(async () => {
        marked('ProTermsSheet')[0].props.onClose();
      });
      expect(mockSave).toHaveBeenCalledTimes(1);
    });
  });

  describe('leaving', () => {
    it('goes back at once when nothing was typed', async () => {
      const { press } = await mount();
      await press('Go back');
      expect(mockGoBack).toHaveBeenCalledTimes(1);
      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it('asks before throwing away what was typed', async () => {
      const { press, type } = await mount();
      await type('Look title', 'Autumn');
      await press('Go back');
      expect(Alert.alert).toHaveBeenCalledWith('Discard your changes?', expect.any(String), expect.any(Array));
      expect(mockGoBack).not.toHaveBeenCalled();
      await confirmAlert('Discard');
      expect(mockGoBack).toHaveBeenCalledTimes(1);
    });

    it('goes back at once after the draft was saved', async () => {
      const { press, type } = await mount();
      await type('Look title', 'Autumn');
      await press('Save draft');
      await press('Go back');
      expect(mockGoBack).toHaveBeenCalledTimes(1);
    });
  });
});

describe('ProLookEditorScreen: a draft that is reopened', () => {
  beforeEach(() => {
    mockParams = { connectionId: 'conn-1', recId: 'draft-1' };
  });

  it('reads the look and the connection, and fills the form', async () => {
    const { field, text, has } = await mount();
    expect(mockGetLook).toHaveBeenCalledWith('draft-1');
    expect(text()).toContain('Edit look');
    expect(field('Look title').props.value).toBe('Autumn layers');
    expect(field('Look note').props.value).toBe('Warm and easy.');
    expect(has('Delete draft')).toBe(true);
    expect(has('Send to Ana')).toBe(true);
  });

  it('gets the pieces back in order from the ids the server returned, and skips one with no id', async () => {
    const { marked, text, has } = await mount();
    expect(marked('ProPhoto').map(p => p.props.itemId)).toEqual(['p1', 'p2']);
    expect(text()).toContain('2 of 12');
    expect(text()).not.toContain('A piece with no id');
    expect(has('Remove Piece p1')).toBe(true);
  });

  it('hands the picker the pieces it holds', async () => {
    const { press, marked } = await mount();
    await press('Add pieces');
    expect(marked('ProClosetPicker')[0].props.selectedIds).toEqual(['p1', 'p2']);
    expect(marked('ProClosetPicker')[0].props.selectedItems.map((i: ProClosetItem) => i.id)).toEqual(['p1', 'p2']);
  });

  it('leaves the pieces alone when only the title changes', async () => {
    const { press, type } = await mount();
    await type('Look title', 'Autumn layers, again');
    await press('Save draft');
    const input = mockSave.mock.calls[0][0];
    expect(input).toMatchObject({ connectionId: 'conn-1', id: 'draft-1', title: 'Autumn layers, again' });
    expect(input.itemIds).toBeUndefined();
    expect(input.clientRef).toBeUndefined();
  });

  it('sends the pieces when one is removed', async () => {
    const { press } = await mount();
    await press('Remove Piece p2');
    await press('Save draft');
    expect(mockSave.mock.calls[0][0].itemIds).toEqual(['p1']);
  });

  it('deletes the draft after asking, and leaves', async () => {
    const { press } = await mount();
    await press('Delete draft');
    expect(Alert.alert).toHaveBeenCalledWith('Delete draft', expect.any(String), expect.any(Array));
    expect(mockDelete).not.toHaveBeenCalled();
    await confirmAlert('Delete draft');
    expect(mockDelete).toHaveBeenCalledWith('draft-1');
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('keeps the draft and says why when deleting fails', async () => {
    mockDelete.mockRejectedValue(new ProError('recommendation_locked'));
    const { press, text } = await mount();
    await press('Delete draft');
    await confirmAlert('Delete draft');
    expect(text()).toContain('A look that has been sent can\'t be changed.');
    expect(mockGoBack).not.toHaveBeenCalled();
  });

  it('shows a skeleton while the look is read, never an empty form', async () => {
    mockGetLook.mockReturnValue(new Promise(() => {}));
    const { tree, has } = await mount();
    expect(tree.root.findAllByType('Skeleton' as any).length).toBeGreaterThan(0);
    expect(has('Save draft')).toBe(false);
  });

  it('refuses a look that has already been sent', async () => {
    mockGetLook.mockResolvedValue(draft({ status: 'sent', actions: { canEdit: false, canSend: false, canDelete: false, canGiveFeedback: false, canMarkWorn: false } }));
    const { text, has } = await mount();
    expect(text()).toContain('A look that has been sent can\'t be changed.');
    expect(has('Save draft')).toBe(false);
  });

  it('says this is no longer available for a look that is gone', async () => {
    mockGetLook.mockRejectedValue(new ProError('pro_unavailable'));
    const { text, press } = await mount();
    expect(text()).toContain('This is no longer available.');
    await press('Back');
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('shows Try again when the look cannot be read, and reads it again', async () => {
    mockGetLook.mockRejectedValueOnce(new ProError('offline')).mockResolvedValueOnce(draft());
    const { text, press, field } = await mount();
    expect(text()).toContain('Couldn’t load this look');
    await press('Try again to load your look');
    expect(field('Look title').props.value).toBe('Autumn layers');
  });

  it('says the connection has ended, and offers no form', async () => {
    mockConnection.mockResolvedValue(detail({ status: 'ended', endedBy: 'them' }));
    const { text, has } = await mount();
    expect(text()).toContain('This connection has ended.');
    expect(has('Save draft')).toBe(false);
  });
});

describe('ProLookEditorScreen: access', () => {
  it('shows a skeleton while access is read, and reads nothing yet', async () => {
    mockStatus.mockReturnValue(new Promise(() => {}));
    const { tree } = await mount();
    expect(tree.root.findAllByType('Skeleton' as any).length).toBeGreaterThan(0);
    expect(mockConnection).not.toHaveBeenCalled();
  });

  it.each([
    ['guest', () => mockStatus.mockRejectedValue(new ProError('not_authenticated'))],
    ['paused', () => mockStatus.mockResolvedValue(status({ proEnabled: false }))],
    ['suspended', () => mockStatus.mockResolvedValue(status({ suspended: true }))],
  ] as const)('shows only the notice for %s', async (state, arrange) => {
    arrange();
    const { marked, has } = await mount();
    expect(marked('ProAccessNotice')[0].props.access.state).toBe(state);
    expect(marked('ProAccessNotice')[0].props.role).toBe('stylist');
    expect(has('Save draft')).toBe(false);
    expect(mockConnection).not.toHaveBeenCalled();
  });

  it('shows the notice when this build is older than the server', async () => {
    mockStatus.mockResolvedValue(status({ versions: { stylistTerms: '2099-01', clientTerms: PRO_CLIENT_TERMS_VERSION, shareText: PRO_SHARE_TEXT_VERSION } }));
    const { marked, has } = await mount();
    expect(marked('ProAccessNotice')).toHaveLength(1);
    expect(has('Save draft')).toBe(false);
  });

  it('offers the terms when they are not accepted, and opens the form once they are', async () => {
    mockStatus.mockResolvedValue(status({ adultConfirmed: false }, false));
    const { marked, has } = await mount();
    expect(has('Save draft')).toBe(false);
    await act(async () => {
      marked('ProAccessNotice')[0].props.onReadTerms();
    });
    expect(marked('ProTermsSheet')[0].props).toMatchObject({ visible: true, role: 'stylist', needsAdult: true });
    mockStatus.mockResolvedValue(status());
    await act(async () => {
      marked('ProTermsSheet')[0].props.onAccepted();
    });
    expect(has('Save draft')).toBe(true);
  });
});

describe('ProLookEditorScreen: the keyboard and the source', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/screens/ProLookEditorScreen.tsx'), 'utf8');

  it('gives the note the Done bar and the title a Return key', async () => {
    const { field } = await mount();
    expect(field('Look note').props.multiline).toBe(true);
    expect(field('Look note').props.inputAccessoryViewID).toBe(KEYBOARD_DONE_ID);
    expect(field('Look title').props.returnKeyType).toBe('next');
  });

  it('renders the Done bar exactly once', () => {
    expect((source.match(/<KeyboardDoneBar\b/g) ?? []).length).toBe(1);
  });

  it('navigates nowhere except back', () => {
    expect(source).not.toMatch(/\.navigate\(/);
  });

  it('stores nothing and has no commerce wording', () => {
    expect(source).not.toMatch(/AsyncStorage|console\.error/);
    expect(source).not.toMatch(/\b(Book|Buy|Checkout|Deposit|Premium|Featured|Verified|Certified|Top rated)\b/);
  });
});
