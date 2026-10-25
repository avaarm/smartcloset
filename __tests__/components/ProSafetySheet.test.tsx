import 'react-native';
import React from 'react';
import fs from 'fs';
import path from 'path';
import { InputAccessoryView, Pressable, TextInput } from 'react-native';
import renderer, { act } from 'react-test-renderer';

const mockReport = jest.fn();
const mockBlock = jest.fn();
const mockConnection = jest.fn();
jest.mock('../../src/services/proService', () => ({
  reportProContent: (...a: any[]) => mockReport(...a),
  blockProMember: (...a: any[]) => mockBlock(...a),
  getProConnection: (...a: any[]) => mockConnection(...a),
}));

import ProSafetySheet from '../../src/components/ProSafetySheet';
import { KeyboardLift } from '../../src/components/KeyboardLift';
import { KEYBOARD_DONE_ID } from '../../src/components/KeyboardSafe';
import { PRO_REPORT_REASONS } from '../../src/config/proRules';
import { ProError } from '../../src/services/proErrors';

type Props = React.ComponentProps<typeof ProSafetySheet>;

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};

const base = (over: Partial<Props> = {}): Props => ({
  visible: true,
  refType: 'connection',
  refId: 'c1',
  label: 'Ana Lee',
  connectionId: 'c1',
  onClose: jest.fn(),
  onBlocked: jest.fn(),
  ...over,
});

const render = async (over: Partial<Props> = {}) => {
  const props = base(over);
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<ProSafetySheet {...props} />);
  });
  const update = async (next: Partial<Props>) => {
    await act(async () => {
      tree.update(<ProSafetySheet {...props} {...next} />);
    });
  };
  const text = () => flatten(tree.toJSON());
  const has = (label: string) =>
    tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function').length > 0;
  const press = async (label: string) => {
    const node = tree.root.find(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
    await act(async () => {
      node.props.onPress();
    });
  };
  const type = async (value: string) => {
    const input = tree.root.find(n => n.props.accessibilityLabel === 'Report details' && n.props.onChangeText);
    await act(async () => {
      input.props.onChangeText(value);
    });
  };
  return { tree, text, has, press, type, update, props };
};

const deferred = () => {
  let resolve!: (v?: unknown) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const THANKS = "Thanks for letting us know. We review reports, as soon as we can. They won't be told it was you.";
const BLOCK_TEXT = "They won't be able to message you or see anything you share, and your connection ends. They won't be told.";
const STOPPED = 'We have stopped sharing your closet with them.';

const connectionAs = (myRole: 'client' | 'stylist') => ({ id: 'c1', myRole });

beforeEach(() => {
  mockReport.mockReset().mockResolvedValue(undefined);
  mockBlock.mockReset().mockResolvedValue(undefined);
  mockConnection.mockReset().mockResolvedValue(connectionAs('client'));
});

describe('ProSafetySheet, the menu', () => {
  it('offers Report and Block for a connection, and never Remove', async () => {
    const { text, has } = await render();
    expect(text()).toContain('Ana Lee');
    expect(has('Report')).toBe(true);
    expect(has('Block')).toBe(true);
    expect(text()).not.toContain('Remove');
  });

  it('offers Block for an invite that was previewed, with no connection', async () => {
    const { has } = await render({ refType: 'invite', refId: 'i1', connectionId: undefined, inviteId: 'i1' });
    expect(has('Report')).toBe(true);
    expect(has('Block')).toBe(true);
  });

  it('goes straight to the reasons, with no Block, when there is nothing to block from', async () => {
    const { text, has, press, props } = await render({ refType: 'recommendation', refId: 'r1', connectionId: undefined });
    expect(has('Block')).toBe(false);
    expect(text()).toContain('Report Ana Lee');
    expect(text()).toContain('Something else');
    await press('Back');
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('Cancel closes without calling anything', async () => {
    const { press, props } = await render();
    await press('Cancel');
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(mockReport).not.toHaveBeenCalled();
    expect(mockBlock).not.toHaveBeenCalled();
  });
});

describe('ProSafetySheet, reporting', () => {
  it('lists every report reason, and only those', async () => {
    const { text, press, tree } = await render();
    await press('Report');
    expect(PRO_REPORT_REASONS).toHaveLength(11);
    for (const r of PRO_REPORT_REASONS) expect(text()).toContain(r.label);
    expect(text()).toContain('An unsafe in-person meeting');
    expect(text()).toContain('Seems to be under 18');
    expect(text()).toContain('Misusing my information');
    const rows = tree.root.findAllByType(Pressable).filter(n => PRO_REPORT_REASONS.some(r => r.label === n.props.accessibilityLabel));
    expect(rows).toHaveLength(11);
  });

  it('walks reason -> details -> thanks and sends the report about the connection', async () => {
    const { text, press, type } = await render();
    await press('Report');
    await press('Asking for money or a scam');
    await type('Asked me to pay by gift card');
    await press('Submit report');

    expect(mockReport).toHaveBeenCalledTimes(1);
    expect(mockReport).toHaveBeenCalledWith({
      refType: 'connection',
      refId: 'c1',
      reason: 'scam',
      details: 'Asked me to pay by gift card',
      messageId: undefined,
    });
    expect(text()).toContain(THANKS);
    expect(mockBlock).not.toHaveBeenCalled();
  });

  it('reports a single message with its id', async () => {
    const { press } = await render({ messageId: 42 });
    await press('Report');
    await press('Harassment or bullying');
    await press('Submit report');
    expect(mockReport).toHaveBeenCalledWith({
      refType: 'connection',
      refId: 'c1',
      reason: 'harassment',
      details: '',
      messageId: 42,
    });
  });

  it('reports a look, a session or an invite by its own reference', async () => {
    for (const [refType, refId] of [['recommendation', 'r9'], ['appointment', 'a9'], ['invite', 'i9']] as const) {
      mockReport.mockClear();
      const { press, has } = await render({ refType, refId, connectionId: undefined, inviteId: refType === 'invite' ? refId : undefined });
      // An invite can be blocked, so it starts at a menu; a look or a session has nothing to block from.
      if (has('Report')) await press('Report');
      await press('Something else');
      await press('Submit report');
      expect(mockReport).toHaveBeenCalledWith({ refType, refId, reason: 'other', details: '', messageId: undefined });
    }
  });

  it('offers to block after a report, through the same confirmation', async () => {
    const { text, press } = await render();
    await press('Report');
    await press('Spam or unwanted contact');
    await press('Submit report');
    await press('Block Ana Lee');
    expect(text()).toContain('Block Ana Lee?');
    expect(mockBlock).not.toHaveBeenCalled();
  });

  it('shows the failure in plain words and stays on the details step', async () => {
    mockReport.mockRejectedValue(new ProError('report_rate_limited'));
    const { text, press } = await render();
    await press('Report');
    await press('Harassment or bullying');
    await press('Submit report');
    expect(text()).toContain("You've sent several reports today. Please try again tomorrow.");
    expect(text()).toContain('Submit report');
    expect(text()).not.toContain('Thanks for letting us know');
  });

  it('runs errors through proErrorMessage: offline, unavailable, unexpected, and never a raw message', async () => {
    mockReport.mockRejectedValueOnce({ message: 'Network request failed' });
    const { text, press } = await render();
    await press('Report');
    await press('Something else');
    await press('Submit report');
    expect(text()).toContain('You seem to be offline. Please try again.');

    mockReport.mockRejectedValueOnce(new ProError('pro_unavailable'));
    await press('Submit report');
    expect(text()).toContain('This is no longer available.');

    mockReport.mockRejectedValueOnce(new Error('relation "content_reports" exploded'));
    await press('Submit report');
    expect(text()).toContain("Couldn't send your report. Please try again.");
    expect(text()).not.toContain('exploded');

    mockReport.mockResolvedValueOnce(undefined);
    await press('Submit report');
    expect(text()).toContain(THANKS);
  });

  it('does not log a failure', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockReport.mockRejectedValue(new ProError('not_authenticated'));
    const { press, text } = await render();
    await press('Report');
    await press('Something else');
    await press('Submit report');
    expect(text()).toContain('Sign in to work with a stylist.');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('ProSafetySheet, "we have stopped sharing"', () => {
  const SERIOUS = ['harassment', 'data_misuse', 'unsafe_meeting', 'underage'] as const;
  const labelOf = (value: string) => PRO_REPORT_REASONS.find(r => r.value === value)!.label;

  it.each(SERIOUS)('is added after a client reports for %s', async reason => {
    const { text, press } = await render();
    await press('Report');
    await press(labelOf(reason));
    await press('Submit report');
    expect(mockConnection).toHaveBeenCalledWith('c1');
    expect(text()).toContain(THANKS);
    expect(text()).toContain(STOPPED);
  });

  it.each(['spam', 'inappropriate', 'impersonation', 'false_credentials', 'scam', 'unsafe', 'other'])(
    'is not added, and nothing is asked, for %s',
    async reason => {
      const { text, press } = await render();
      await press('Report');
      await press(labelOf(reason));
      await press('Submit report');
      expect(mockConnection).not.toHaveBeenCalled();
      expect(text()).toContain(THANKS);
      expect(text()).not.toContain(STOPPED);
    },
  );

  it('is not added after a stylist reports', async () => {
    mockConnection.mockResolvedValue(connectionAs('stylist'));
    const { text, press } = await render();
    await press('Report');
    await press(labelOf('harassment'));
    await press('Submit report');
    expect(mockConnection).toHaveBeenCalledTimes(1);
    expect(text()).not.toContain(STOPPED);
  });

  it('is left out, quietly, when the role cannot be learned', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockConnection.mockRejectedValue(new ProError('pro_unavailable'));
    const { text, press } = await render();
    await press('Report');
    await press(labelOf('underage'));
    await press('Submit report');
    expect(text()).toContain(THANKS);
    expect(text()).not.toContain(STOPPED);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('asks about the connection being reported when no connection id was given', async () => {
    const { text, press } = await render({ refType: 'connection', refId: 'c7', connectionId: undefined });
    await press(labelOf('data_misuse'));
    await press('Submit report');
    expect(mockConnection).toHaveBeenCalledWith('c7');
    expect(text()).toContain(STOPPED);
  });

  it('asks nothing, and says nothing, for an invite report: nothing was shared yet', async () => {
    const { text, press } = await render({ refType: 'invite', refId: 'i1', connectionId: undefined, inviteId: 'i1' });
    await press('Report');
    await press(labelOf('underage'));
    await press('Submit report');
    expect(mockConnection).not.toHaveBeenCalled();
    expect(text()).not.toContain(STOPPED);
  });

  it('is not added to a sheet that was dismissed before the answer came', async () => {
    const pending = deferred();
    mockConnection.mockReturnValue(pending.promise);
    const { text, press, update } = await render();
    await press('Report');
    await press(labelOf('harassment'));
    await press('Submit report');
    await update({ visible: false });
    await update({ visible: true });
    await act(async () => { pending.resolve(connectionAs('client')); });
    expect(text()).not.toContain(STOPPED);
  });
});

describe('ProSafetySheet, blocking', () => {
  it('asks before blocking, then blocks from the connection and tells the screen', async () => {
    const { text, press, props } = await render();
    await press('Block');
    expect(text()).toContain('Block Ana Lee?');
    expect(text()).toContain(BLOCK_TEXT);
    expect(mockBlock).not.toHaveBeenCalled();

    await press('Block');
    expect(mockBlock).toHaveBeenCalledWith({ connectionId: 'c1' });
    expect(props.onBlocked).toHaveBeenCalledTimes(1);
    expect(mockReport).not.toHaveBeenCalled();
  });

  it('blocks from an invite with no connection', async () => {
    const { press, props } = await render({ refType: 'invite', refId: 'i1', connectionId: undefined, inviteId: 'i1' });
    await press('Block');
    await press('Block');
    expect(mockBlock).toHaveBeenCalledWith({ inviteId: 'i1' });
    expect(props.onBlocked).toHaveBeenCalled();
  });

  it('blocks from the connection when it is given both', async () => {
    const { press } = await render({ inviteId: 'i1' });
    await press('Block');
    await press('Block');
    expect(mockBlock).toHaveBeenCalledWith({ connectionId: 'c1' });
  });

  it('keeps the sheet open and explains when blocking fails', async () => {
    mockBlock.mockRejectedValue(new ProError('pro_unavailable'));
    const { text, press, props } = await render();
    await press('Block');
    await press('Block');
    expect(text()).toContain('This is no longer available.');
    expect(props.onBlocked).not.toHaveBeenCalled();
  });

  it('uses its own words for an unexpected failure', async () => {
    mockBlock.mockRejectedValue(new Error('boom'));
    const { text, press } = await render();
    await press('Block');
    await press('Block');
    expect(text()).toContain("Couldn't block this person. Please try again.");
    expect(text()).not.toContain('boom');
  });
});

describe('ProSafetySheet, a result that arrives after the sheet moved on', () => {
  it('does not tell the screen about a block that finishes after the sheet was dismissed', async () => {
    const pending = deferred();
    mockBlock.mockReturnValue(pending.promise);
    const { press, update, props } = await render();
    await press('Block');
    await press('Block');
    expect(mockBlock).toHaveBeenCalledTimes(1);

    await update({ visible: false });
    await act(async () => { pending.resolve(); });
    expect(props.onBlocked).not.toHaveBeenCalled();
  });

  it('does not turn a different thing into "thanks" when an old report finishes', async () => {
    const pending = deferred();
    mockReport.mockReturnValue(pending.promise);
    const { text, press, update } = await render();
    await press('Report');
    await press('Spam or unwanted contact');
    await press('Submit report');

    await update({ refId: 'c2', connectionId: 'c2', label: 'Bea' });
    expect(text()).toContain('Bea');
    await act(async () => { pending.resolve(); });
    expect(text()).not.toContain('Thanks for letting us know');
    expect(text()).toContain('Block');
  });

  it('does not show an old failure on a reopened sheet', async () => {
    const pending = deferred();
    mockReport.mockReturnValue(pending.promise);
    const { text, press, update } = await render();
    await press('Report');
    await press('Spam or unwanted contact');
    await press('Submit report');

    await update({ visible: false });
    await update({ visible: true });
    // Back on the same step the old request was made from, so a stray result would show.
    await press('Report');
    await press('Spam or unwanted contact');
    await act(async () => { pending.reject(new ProError('report_rate_limited')); });
    expect(text()).not.toContain('several reports today');
    expect(text()).toContain('Submit report');
  });

  it('starts again from the menu, with nothing left over, when reopened', async () => {
    const { text, press, type, update, tree } = await render();
    await press('Report');
    await press('An unsafe in-person meeting');
    await type('Wanted to meet at my home');
    await update({ visible: false });
    await update({ visible: true });
    expect(text()).toContain('Report');
    expect(text()).not.toContain('An unsafe in-person meeting');

    await press('Report');
    await press('An unsafe in-person meeting');
    expect(tree.root.findAllByType(TextInput)[0].props.value).toBe('');
  });
});

describe('ProSafetySheet, keyboard', () => {
  const toDetails = async () => {
    const r = await render();
    expect(r.tree.root.findAllByType(InputAccessoryView)).toHaveLength(0);
    await r.press('Report');
    await r.press('Something else');
    return r;
  };

  it('gives the details field the shared Done bar, exactly once', async () => {
    const { tree } = await toDetails();
    const fields = tree.root.findAllByType(TextInput);
    expect(fields).toHaveLength(1);
    expect(fields[0].props.multiline).toBe(true);
    expect(fields[0].props.inputAccessoryViewID).toBe(KEYBOARD_DONE_ID);
    expect(fields[0].props.accessibilityLabel).toBe('Report details');
    expect(fields[0].props.maxLength).toBe(500);

    const bars = tree.root.findAllByType(InputAccessoryView);
    expect(bars).toHaveLength(1);
    expect(bars[0].props.nativeID).toBe(KEYBOARD_DONE_ID);
  });

  it('lifts the field above the keyboard', async () => {
    const { tree } = await toDetails();
    const field = tree.root.findAllByType(TextInput)[0];
    let above = field.parent;
    let lifted = false;
    while (above) {
      if (above.type === KeyboardLift) lifted = true;
      above = above.parent;
    }
    expect(lifted).toBe(true);
  });

  it('shows the character count', async () => {
    const { text, type } = await toDetails();
    expect(text()).toContain('0/500');
    await type('abc');
    expect(text()).toContain('3/500');
  });

  it('leaves the Done bar out of the steps that have no field', async () => {
    const { tree, press } = await toDetails();
    await press('Submit report');
    expect(tree.root.findAllByType(InputAccessoryView)).toHaveLength(0);
  });

  it('renders the shared bar in the source once (the guard counts it)', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../src/components/ProSafetySheet.tsx'), 'utf8');
    expect(source.match(/<KeyboardDoneBar\b/g)).toHaveLength(1);
  });
});

describe('ProSafetySheet, how it is built', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/components/ProSafetySheet.tsx'), 'utf8');

  it('calls the pro service only, never the friends or swap ones, and holds no person id', () => {
    expect(source).not.toMatch(/friendService|swapService|reportUser|blockUser|userId|reportedUserId/);
    expect(source).toMatch(/reportProContent/);
    expect(source).toMatch(/blockProMember/);
  });

  it('contains no navigation', () => {
    expect(source).not.toMatch(/navigate\(|useNavigation/);
  });
});
