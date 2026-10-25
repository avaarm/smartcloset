import 'react-native';
import React from 'react';
import fs from 'fs';
import path from 'path';
import { InputAccessoryView, Platform, Pressable, TextInput } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import type { ReactTestInstance } from 'react-test-renderer';

const mockPropose = jest.fn();
const mockRespond = jest.fn();
const mockCancel = jest.fn();
jest.mock('../../src/services/proService', () => ({
  proposeProSession: (...a: any[]) => mockPropose(...a),
  respondProSession: (...a: any[]) => mockRespond(...a),
  cancelProSession: (...a: any[]) => mockCancel(...a),
}));

import ProAppointmentSheet, { durationText } from '../../src/components/ProAppointmentSheet';
import { KeyboardLift } from '../../src/components/KeyboardLift';
import { KEYBOARD_DONE_ID } from '../../src/components/KeyboardSafe';
import { PRO_DURATION, PRO_LIMITS, PRO_SAFETY_TIPS, PRO_TEXT_LIMITS } from '../../src/config/proRules';
import { ProError } from '../../src/services/proErrors';
import { sessionWhen } from '../../src/utils/proFormat';
import type { ProAppointment } from '../../src/types/pro';

type Props = React.ComponentProps<typeof ProAppointmentSheet>;

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};

const NOW = Date.parse('2026-10-24T10:07:00Z');
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const appointment = (over: Partial<ProAppointment> = {}): ProAppointment => ({
  id: 'a1',
  connectionId: 'c1',
  otherLabel: 'Bea',
  myRole: 'stylist',
  status: 'proposed',
  proposedBy: 'client',
  startsAt: '2026-11-03T15:00:00Z',
  durationMinutes: 90,
  mode: 'virtual',
  place: '',
  note: '',
  utcOffsetMinutes: 0,
  canConfirm: true,
  canDecline: true,
  canCancel: true,
  createdAt: '2026-10-24T10:00:00Z',
  ...over,
});

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const base = (over: Partial<Props> = {}): Props => ({
  visible: true,
  mode: 'propose',
  connectionId: 'c1',
  onClose: jest.fn(),
  onChanged: jest.fn(),
  ...over,
});

const mounted: renderer.ReactTestRenderer[] = [];
const render = async (over: Partial<Props> = {}) => {
  const props = base(over);
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<ProAppointmentSheet {...props} />);
  });
  mounted.push(tree);
  const update = async (next: Partial<Props>) => {
    await act(async () => {
      tree.update(<ProAppointmentSheet {...props} {...next} />);
    });
  };
  const text = () => flatten(tree.toJSON());
  const byLabel = (label: string) =>
    tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
  const has = (label: string) => byLabel(label).length > 0;
  /** The accessibility state of a chip (the Pressable under the Choice, which is where the state lives). */
  const stateOf = (label: string) =>
    tree.root.find(n => n.props.accessibilityLabel === label && n.props.accessibilityState !== undefined).props.accessibilityState;
  const press = async (label: string) => {
    const nodes = byLabel(label);
    if (nodes.length === 0) throw new Error(`nothing to press labelled "${label}"`);
    await act(async () => {
      nodes[0].props.onPress();
    });
  };
  const field = (label: string): ReactTestInstance =>
    tree.root.find(n => n.type === TextInput && n.props.accessibilityLabel === label);
  const type = async (label: string, value: string) => {
    await act(async () => {
      field(label).props.onChangeText(value);
    });
  };
  const pickers = () => tree.root.findAllByType('DateTimePicker' as any);
  const sendDisabled = () =>
    tree.root.findAll(n => n.props.accessibilityLabel === 'Send request' && n.props.accessibilityState !== undefined)
      .every(n => n.props.accessibilityState.disabled === true);
  return { tree, props, update, text, byLabel, has, stateOf, press, field, type, pickers, sendDisabled };
};

let nowSpy: jest.SpyInstance;

beforeEach(() => {
  nowSpy = jest.spyOn(Date, 'now').mockReturnValue(NOW);
  mockPropose.mockReset().mockResolvedValue({ id: 'a9', status: 'proposed' });
  mockRespond.mockReset().mockResolvedValue(undefined);
  mockCancel.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach(t => t.unmount());
  });
  nowSpy.mockRestore();
});

describe('ProAppointmentSheet, propose', () => {
  it('asks for a date and a time, a length, how it is held, a place and a note', async () => {
    const { text, has, field, pickers } = await render();
    expect(text()).toContain('Propose a session');
    expect(pickers().map(p => p.props.mode)).toEqual(['date', 'time']);
    expect(has('15 minutes')).toBe(true);
    expect(has('480 minutes')).toBe(true);
    expect(has('Virtual')).toBe(true);
    expect(has('In person')).toBe(true);
    expect(field('Place').props.placeholder).toBe("Where? e.g. a café name, or 'video call'");
    expect(field('Session note')).toBeTruthy();
    expect(text()).toContain('Send request');
  });

  it('starts about a day ahead on a quarter hour, with an hour in a virtual session selected', async () => {
    const { pickers, stateOf } = await render();
    const start: Date = pickers()[0].props.value;
    expect(start.getTime()).toBeGreaterThanOrEqual(NOW + DAY);
    expect(start.getTime()).toBeLessThan(NOW + DAY + 16 * MINUTE);
    expect(start.getMinutes() % 15).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(stateOf('60 minutes')).toMatchObject({ selected: true });
    expect(stateOf('Virtual')).toMatchObject({ selected: true });
    expect(stateOf('In person')).toMatchObject({ selected: false });
  });

  it('offers only lengths the server accepts', async () => {
    const { tree } = await render();
    const chips = tree.root.findAll(n => n.type === Pressable && n.props.accessibilityRole === 'radio' && /minutes$/.test(n.props.accessibilityLabel ?? ''));
    const minutes = chips.map(c => parseInt(c.props.accessibilityLabel, 10));
    expect(minutes.length).toBeGreaterThan(4);
    for (const m of minutes) {
      expect(m).toBeGreaterThanOrEqual(PRO_DURATION.min);
      expect(m).toBeLessThanOrEqual(PRO_DURATION.max);
      expect(m % PRO_DURATION.step).toBe(0);
    }
    expect(new Set(minutes).size).toBe(minutes.length);
  });

  it('sends the request with named choices and a clientRef, then tells the host and closes', async () => {
    const { press, type, props } = await render();
    await type('Place', '  Cafe Roma  ');
    await type('Session note', ' Bring two coats ');
    await press('90 minutes');
    await press('In person');
    await press('Send request');
    expect(mockPropose).toHaveBeenCalledTimes(1);
    const sent = mockPropose.mock.calls[0][0];
    expect(sent).toMatchObject({ connectionId: 'c1', durationMinutes: 90, mode: 'in_person', place: 'Cafe Roma', note: 'Bring two coats' });
    expect(sent.startsAt).toBeInstanceOf(Date);
    expect(sent.clientRef).toMatch(UUID);
    expect(props.onChanged).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('sends a virtual hour with no place or note as they stand', async () => {
    const { press } = await render();
    await press('Send request');
    expect(mockPropose.mock.calls[0][0]).toMatchObject({ durationMinutes: 60, mode: 'virtual', place: '', note: '' });
  });

  it('keeps everything typed when a send fails, explains why, and reuses the same clientRef on retry', async () => {
    mockPropose.mockRejectedValueOnce(new ProError('text_not_allowed', 'text_not_allowed', 'place', 'contact'));
    const { press, type, text, field, props } = await render();
    await type('Place', 'call 555 0100');
    await type('Session note', 'See you there');
    await press('120 minutes');
    await press('Send request');
    expect(text()).toContain("Links and contact details can't go here.");
    expect(field('Place').props.value).toBe('call 555 0100');
    expect(field('Session note').props.value).toBe('See you there');
    expect(props.onChanged).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();

    await type('Place', 'Cafe Roma');
    await press('Send request');
    expect(mockPropose).toHaveBeenCalledTimes(2);
    expect(mockPropose.mock.calls[1][0].clientRef).toBe(mockPropose.mock.calls[0][0].clientRef);
    expect(mockPropose.mock.calls[1][0]).toMatchObject({ durationMinutes: 120, place: 'Cafe Roma', note: 'See you there' });
    expect(props.onChanged).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['an offline phone', { message: 'Network request failed' }, 'You seem to be offline. Please try again.'],
    ['too many open requests', new ProError('appointment_open_limit'), 'There are too many open requests. Wait for answers first.'],
    ['a server-side time check', new ProError('invalid_appointment', 'invalid_appointment', 'starts_at'), 'Check the date, time and length and try again.'],
    ['anything unexpected', new Error('relation "pro_appointments" exploded'), "Couldn't send your request. Please try again."],
  ])('says %s in plain words and never shows a raw error', async (_name, failure, words) => {
    mockPropose.mockRejectedValueOnce(failure);
    const { press, text } = await render();
    await press('Send request');
    expect(text()).toContain(words);
    expect(text()).not.toMatch(/exploded|relation|invalid_appointment|PGRST/);
  });

  it('makes a new clientRef for the next opening', async () => {
    const { press, update } = await render();
    await press('Send request');
    await update({ visible: false });
    await update({ visible: true });
    await press('Send request');
    expect(mockPropose.mock.calls[1][0].clientRef).not.toBe(mockPropose.mock.calls[0][0].clientRef);
  });

  it('resets the form when it opens again', async () => {
    const { type, press, update, field, stateOf } = await render();
    await type('Place', 'Cafe Roma');
    await press('In person');
    await press('15 minutes');
    await update({ visible: false });
    await update({ visible: true });
    expect(field('Place').props.value).toBe('');
    expect(stateOf('Virtual')).toMatchObject({ selected: true });
    expect(stateOf('60 minutes')).toMatchObject({ selected: true });
  });

  it('sends once while a request is in flight, and says nothing if the sheet was closed meanwhile', async () => {
    const slow = deferred<{ id: string; status: string }>();
    mockPropose.mockReturnValue(slow.promise);
    const { press, update, props } = await render();
    await press('Send request');
    await press('Send request');
    expect(mockPropose).toHaveBeenCalledTimes(1);
    await update({ visible: false });
    await act(async () => {
      slow.resolve({ id: 'a9', status: 'proposed' });
    });
    expect(props.onChanged).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('cannot be closed by Close while a request is in flight', async () => {
    const slow = deferred<{ id: string; status: string }>();
    mockPropose.mockReturnValue(slow.promise);
    const { press, props, tree } = await render();
    await press('Send request');
    await press('Close');
    expect(props.onClose).not.toHaveBeenCalled();
    await act(async () => {
      slow.resolve({ id: 'a9', status: 'proposed' });
    });
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(tree).toBeTruthy();
  });

  it('closes from Close without sending anything', async () => {
    const { press, props } = await render();
    await press('Close');
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(mockPropose).not.toHaveBeenCalled();
  });

  describe('the time', () => {
    it('takes a new date and keeps the time of day, and a new time and keeps the date', async () => {
      const { pickers, press } = await render();
      const first: Date = pickers()[0].props.value;
      const target = new Date(first.getTime() + 3 * DAY);
      await act(async () => {
        pickers()[0].props.onChange({ type: 'set' }, target);
      });
      const afterDate: Date = pickers()[0].props.value;
      expect(afterDate.getDate()).toBe(target.getDate());
      expect(afterDate.getHours()).toBe(first.getHours());
      expect(afterDate.getMinutes()).toBe(first.getMinutes());

      const evening = new Date(afterDate);
      evening.setHours(19, 45, 30, 500);
      await act(async () => {
        pickers()[1].props.onChange({ type: 'set' }, evening);
      });
      const afterTime: Date = pickers()[1].props.value;
      expect(afterTime.getDate()).toBe(afterDate.getDate());
      expect(afterTime.getHours()).toBe(19);
      expect(afterTime.getMinutes()).toBe(45);
      expect(afterTime.getSeconds()).toBe(0);

      await press('Send request');
      expect(mockPropose.mock.calls[0][0].startsAt.getTime()).toBe(afterTime.getTime());
    });

    it('limits the date picker to the lead time and the horizon the server enforces', async () => {
      const { pickers } = await render();
      const datePicker = pickers()[0];
      expect(datePicker.props.minimumDate.getTime()).toBe(NOW + PRO_LIMITS.appointment_lead_minutes * MINUTE);
      expect(datePicker.props.maximumDate.getTime()).toBe(NOW + PRO_LIMITS.appointment_max_days_ahead * DAY);
    });

    it('will not send a start that is too soon, and says so', async () => {
      const { pickers, sendDisabled, press, text } = await render();
      await act(async () => {
        pickers()[1].props.onChange({ type: 'set' }, new Date(NOW + 10 * MINUTE));
      });
      // The date is still tomorrow, so move it to today as well.
      await act(async () => {
        pickers()[0].props.onChange({ type: 'set' }, new Date(NOW));
      });
      expect(sendDisabled()).toBe(true);
      expect(text()).toContain(`at least ${PRO_LIMITS.appointment_lead_minutes} minutes from now`);
      await press('Send request');
      expect(mockPropose).not.toHaveBeenCalled();
    });

    it('does not send a start beyond the horizon', async () => {
      const { pickers, press, text } = await render();
      await act(async () => {
        pickers()[0].props.onChange({ type: 'set' }, new Date(NOW + (PRO_LIMITS.appointment_max_days_ahead + 5) * DAY));
      });
      await press('Send request');
      expect(mockPropose).not.toHaveBeenCalled();
      expect(text()).toContain(`within ${PRO_LIMITS.appointment_max_days_ahead} days`);
    });

    it('names the time zone the times are in', async () => {
      const { text } = await render();
      expect(text()).toMatch(/Times are in your time zone \(.+\)\./);
    });

    it('says what the other person learns: an offset from UTC, not a place', async () => {
      const { text } = await render();
      expect(text()).toMatch(/They see your offset from UTC \(UTC([+-]\d{1,2}(:\d{2})?)?\), not a place\./);
    });
  });

  describe('on Android', () => {
    const original = Platform.OS;
    beforeEach(() => {
      (Platform as any).OS = 'android';
    });
    afterEach(() => {
      (Platform as any).OS = original;
    });

    it('shows the date and the time as buttons and opens one picker at a time', async () => {
      const { pickers, press, has } = await render();
      expect(pickers()).toHaveLength(0);
      expect(has('Choose date')).toBe(true);
      expect(has('Choose time')).toBe(true);
      await press('Choose date');
      expect(pickers().map(p => p.props.mode)).toEqual(['date']);
      const target = new Date(pickers()[0].props.value.getTime() + 2 * DAY);
      await act(async () => {
        pickers()[0].props.onChange({ type: 'set' }, target);
      });
      expect(pickers()).toHaveLength(0);
      await press('Send request');
      expect(mockPropose.mock.calls[0][0].startsAt.getDate()).toBe(target.getDate());
    });

    it('leaves the start as it was when the dialog is dismissed', async () => {
      const { pickers, press } = await render();
      await press('Choose time');
      const before = pickers()[0].props.value.getTime();
      await act(async () => {
        pickers()[0].props.onChange({ type: 'dismissed' }, new Date(NOW + 2 * DAY));
      });
      expect(pickers()).toHaveLength(0);
      await press('Send request');
      expect(mockPropose.mock.calls[0][0].startsAt.getTime()).toBe(before);
    });
  });

  it('cannot be sent without a connection to send it to', async () => {
    const { sendDisabled, press } = await render({ connectionId: undefined });
    expect(sendDisabled()).toBe(true);
    await press('Send request');
    expect(mockPropose).not.toHaveBeenCalled();
  });

  describe('keyboard', () => {
    it('lifts both fields above the keyboard', async () => {
      const { tree } = await render();
      const inputs = tree.root.findAllByType(TextInput);
      expect(inputs).toHaveLength(2);
      for (const input of inputs) {
        const above: ReactTestInstance[] = [];
        for (let n = input.parent; n; n = n.parent) above.push(n);
        expect(above.some(a => a.type === KeyboardLift)).toBe(true);
      }
    });

    it('gives the single-line place a Return key that closes the keyboard and the note the Done bar', async () => {
      const { field, tree } = await render();
      expect(field('Place').props.returnKeyType).toBe('done');
      expect(field('Place').props.blurOnSubmit).not.toBe(false);
      expect(field('Place').props.multiline).toBeFalsy();
      expect(field('Session note').props.multiline).toBe(true);
      expect(field('Session note').props.inputAccessoryViewID).toBe(KEYBOARD_DONE_ID);
      const bars = tree.root.findAllByType(InputAccessoryView);
      expect(bars).toHaveLength(1);
      expect(bars[0].props.nativeID).toBe(KEYBOARD_DONE_ID);
    });

    it('holds the lengths the table holds', async () => {
      const { field, type, text } = await render();
      expect(field('Place').props.maxLength).toBe(PRO_TEXT_LIMITS.place);
      expect(field('Session note').props.maxLength).toBe(PRO_TEXT_LIMITS.session_note);
      await type('Session note', 'Hello');
      expect(text()).toContain(`5/${PRO_TEXT_LIMITS.session_note}`);
    });

    it('renders the shared Done bar once in the source', () => {
      const source = fs.readFileSync(path.resolve(__dirname, '../../src/components/ProAppointmentSheet.tsx'), 'utf8');
      expect(source.match(/<KeyboardDoneBar\b/g)).toHaveLength(1);
    });
  });

  it('has no fee, price, paid flag or link field, and no commerce wording', async () => {
    const { text, tree } = await render();
    expect(text()).not.toMatch(/\b(fee|price|paid|invoice|meeting link|link)\b/i);
    expect(text()).not.toMatch(/\b(book|pay now|buy|checkout|deposit|premium|featured|verified|certified|top rated)\b/i);
    expect(tree.root.findAllByType(TextInput).map(i => i.props.accessibilityLabel)).toEqual(['Place', 'Session note']);
  });
});

describe('ProAppointmentSheet, view', () => {
  const view = (a: ProAppointment, over: Partial<Props> = {}) =>
    render({ mode: 'view', connectionId: undefined, appointment: a, ...over });

  it('shows every field, the time in the viewer\'s zone, and the status', async () => {
    const a = appointment({ mode: 'in_person', place: 'Cafe Roma', note: 'Bring two coats', durationMinutes: 90 });
    const { text } = await view(a);
    expect(text()).toContain('Bea');
    expect(text()).toContain(sessionWhen(a));
    expect(text()).toContain('1 h 30 min');
    expect(text()).toContain('In person');
    expect(text()).toContain('Cafe Roma');
    expect(text()).toContain('Bring two coats');
    expect(text()).toContain('Waiting for your answer');
  });

  it('leaves out a place and a note that are empty', async () => {
    const { text } = await view(appointment());
    expect(text()).not.toContain('Where');
    expect(text()).not.toContain('Note');
  });

  it('shows the payment line, naming the other person', async () => {
    const { text } = await view(appointment());
    expect(text()).toContain('Payment, if any, is arranged directly between you and Bea. SmartCloset does not take payments.');
  });

  describe('Confirm, Decline and Cancel', () => {
    it('are drawn only for the answers the server allows', async () => {
      const all = await view(appointment());
      expect(['Confirm', 'Decline', 'Cancel session'].filter(all.has)).toEqual(['Confirm', 'Decline', 'Cancel session']);

      const none = await view(appointment({ canConfirm: false, canDecline: false, canCancel: false, status: 'completed' }));
      expect(['Confirm', 'Decline', 'Cancel session'].filter(none.has)).toEqual([]);

      const mine = await view(appointment({ canConfirm: false, canDecline: false, canCancel: true, proposedBy: 'stylist' }));
      expect(['Confirm', 'Decline', 'Cancel session'].filter(mine.has)).toEqual(['Cancel session']);

      const confirmOnly = await view(appointment({ canDecline: false, canCancel: false }));
      expect(['Confirm', 'Decline', 'Cancel session'].filter(confirmOnly.has)).toEqual(['Confirm']);
    });

    it('confirm answers the session, tells the host and closes', async () => {
      const { press, props } = await view(appointment());
      await press('Confirm');
      expect(mockRespond).toHaveBeenCalledWith('a1', 'confirm');
      expect(props.onChanged).toHaveBeenCalledTimes(1);
      expect(props.onClose).toHaveBeenCalledTimes(1);
    });

    it('decline answers the session', async () => {
      const { press, props } = await view(appointment());
      await press('Decline');
      expect(mockRespond).toHaveBeenCalledWith('a1', 'decline');
      expect(props.onClose).toHaveBeenCalledTimes(1);
    });

    it('cancel cancels the session', async () => {
      const { press, props } = await view(appointment());
      await press('Cancel session');
      expect(mockCancel).toHaveBeenCalledWith('a1');
      expect(mockRespond).not.toHaveBeenCalled();
      expect(props.onChanged).toHaveBeenCalledTimes(1);
    });

    it('answers once while a request is in flight', async () => {
      const slow = deferred<void>();
      mockRespond.mockReturnValue(slow.promise);
      const { press, props } = await view(appointment());
      await press('Confirm');
      await press('Decline');
      await press('Confirm');
      expect(mockRespond).toHaveBeenCalledTimes(1);
      await act(async () => {
        slow.resolve();
      });
      expect(props.onClose).toHaveBeenCalledTimes(1);
    });

    it('says a clash with another confirmed session in words, and keeps the buttons', async () => {
      mockRespond.mockRejectedValueOnce(new ProError('appointment_conflict'));
      const { press, text, has, props } = await view(appointment());
      await press('Confirm');
      expect(text()).toContain('That time overlaps another confirmed session.');
      expect(has('Confirm')).toBe(true);
      expect(has('Decline')).toBe(true);
      expect(props.onChanged).not.toHaveBeenCalled();
      expect(props.onClose).not.toHaveBeenCalled();
    });

    it.each([
      ['a session that was answered meanwhile', new ProError('appointment_closed'), "That session can't be changed any more."],
      ['a session that is gone', new ProError('pro_unavailable'), 'This is no longer available.'],
      ['a connection that ended', new ProError('connection_ended'), 'This connection has ended.'],
    ])('takes the buttons away and asks the host to reload after %s', async (_name, failure, words) => {
      mockRespond.mockRejectedValueOnce(failure);
      const { press, text, has, props } = await view(appointment());
      await press('Confirm');
      expect(text()).toContain(words);
      expect(['Confirm', 'Decline', 'Cancel session'].some(has)).toBe(false);
      expect(props.onChanged).toHaveBeenCalledTimes(1);
      expect(props.onClose).not.toHaveBeenCalled();
    });

    it('does not show a raw error for anything unexpected', async () => {
      mockCancel.mockRejectedValueOnce(new Error('relation "pro_appointments" exploded'));
      const { press, text } = await view(appointment());
      await press('Cancel session');
      expect(text()).toContain("Couldn't update the session. Please try again.");
      expect(text()).not.toContain('exploded');
    });
  });

  describe('meeting safely', () => {
    it('is shown for an in-person session, with every tip', async () => {
      const { text } = await view(appointment({ mode: 'in_person' }));
      expect(text()).toContain('Meeting safely');
      for (const tip of PRO_SAFETY_TIPS) expect(text()).toContain(tip);
    });

    it('is not shown for a virtual one', async () => {
      const { text } = await view(appointment({ mode: 'virtual' }));
      expect(text()).not.toContain('Meeting safely');
    });
  });

  describe('reporting', () => {
    it('hands the session to the host, which closes this sheet and opens the report sheet', async () => {
      const a = appointment();
      const onReport = jest.fn();
      const { press, props } = await view(a, { onReport });
      await press('Report this request');
      expect(onReport).toHaveBeenCalledTimes(1);
      expect(onReport).toHaveBeenCalledWith(a);
      expect(props.onClose).not.toHaveBeenCalled();
    });

    it('offers no report row when the host gave no way to report', async () => {
      const { has } = await view(appointment());
      expect(has('Report this request')).toBe(false);
    });
  });

  it('closes from Close', async () => {
    const { press, props } = await view(appointment());
    await press('Close');
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('has no text field and nothing tappable in its text: no link, no fee, no paid flag', async () => {
    const { tree, text } = await view(appointment({ place: 'video call', note: 'https://example.com/join' }));
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
    expect(tree.root.findAllByType(InputAccessoryView)).toHaveLength(0);
    const texts = tree.root.findAll(n => n.type === ('Text' as any));
    expect(texts.length).toBeGreaterThan(5);
    expect(texts.every(t => typeof t.props.onPress !== 'function' && !t.props.dataDetectorType)).toBe(true);
    expect(text()).not.toMatch(/\b(fee|price|paid|invoice)\b/i);
    expect(text()).not.toMatch(/\b(book|pay now|buy|checkout|deposit|premium|featured|verified|certified|top rated)\b/i);
  });

  it('draws nothing inside the sheet when there is no session to show', async () => {
    const { has, text } = await render({ mode: 'view', appointment: undefined });
    expect(['Confirm', 'Decline', 'Cancel session', 'Report this request'].some(has)).toBe(false);
    expect(text()).toContain('Session');
  });

  it('holds no navigation', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../src/components/ProAppointmentSheet.tsx'), 'utf8');
    expect(source).not.toMatch(/navigate\(|useNavigation/);
  });
});

describe('durationText', () => {
  it('reads minutes, hours and both', () => {
    expect(durationText(15)).toBe('15 min');
    expect(durationText(60)).toBe('1 h');
    expect(durationText(90)).toBe('1 h 30 min');
    expect(durationText(480)).toBe('8 h');
  });
});
