import 'react-native';
import React from 'react';
import fs from 'fs';
import path from 'path';
import { Pressable } from 'react-native';
import renderer, { act } from 'react-test-renderer';

import ProAppointmentRow from '../../src/components/ProAppointmentRow';
import { sessionWhen } from '../../src/utils/proFormat';
import type { ProAppointment } from '../../src/types/pro';

type Props = React.ComponentProps<typeof ProAppointmentRow>;

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};

const appointment = (over: Partial<ProAppointment> = {}): ProAppointment => ({
  id: 'a1',
  connectionId: 'c1',
  otherLabel: 'Bea',
  myRole: 'stylist',
  status: 'proposed',
  proposedBy: 'client',
  startsAt: '2026-11-03T15:00:00Z',
  durationMinutes: 60,
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

const render = (over: Partial<Props> = {}) => {
  const props: Props = { appointment: appointment(), onPress: jest.fn(), ...over };
  const tree = renderer.create(<ProAppointmentRow {...props} />);
  const text = () => flatten(tree.toJSON());
  const row = () => tree.root.findAll(n => n.type === Pressable && typeof n.props.onPress === 'function')[0];
  return { tree, props, text, row };
};

describe('ProAppointmentRow', () => {
  it('shows the time in the viewer\'s zone, who it is with and how it is held', () => {
    const a = appointment({ utcOffsetMinutes: 0 });
    const { text } = render({ appointment: a });
    expect(text()).toContain(sessionWhen(a));
    expect(text()).toContain('Bea');
    expect(text()).toContain('Virtual');
  });

  it('shows the proposer\'s offset from UTC when it differs from the viewer\'s, as sessionWhen does, and no zone name', () => {
    const a = appointment({ utcOffsetMinutes: 540, startsAt: '2026-11-03T15:00:00Z' });
    const { text } = render({ appointment: a });
    expect(text()).toContain(sessionWhen(a));
    expect(text()).not.toMatch(/Tokyo|Asia/);
  });

  it('shows no offset for a session the viewer proposed', () => {
    const a = appointment({ utcOffsetMinutes: 540, proposedBy: 'stylist', myRole: 'stylist' });
    expect(render({ appointment: a }).text()).not.toContain('their time');
  });

  it('says where it stands, from the viewer\'s side', () => {
    expect(render({ appointment: appointment({ status: 'proposed', proposedBy: 'client', myRole: 'stylist' }) }).text()).toContain('Waiting for your answer');
    expect(render({ appointment: appointment({ status: 'proposed', proposedBy: 'stylist', myRole: 'stylist' }) }).text()).toContain('Waiting for their answer');
    expect(render({ appointment: appointment({ status: 'confirmed' }) }).text()).toContain('Confirmed');
    expect(render({ appointment: appointment({ status: 'declined', proposedBy: 'client', myRole: 'stylist' }) }).text()).toContain('You declined');
  });

  it('puts the status under the text, not beside it, so a long status cannot squeeze the time and the name on a small screen', () => {
    const { tree } = render({ appointment: appointment({ status: 'proposed', proposedBy: 'client', myRole: 'stylist' }) });
    const json: any = tree.toJSON();
    expect(json.children).toHaveLength(2);                                // the icon and one text column
    expect(flatten(json.children[1])).toContain('Waiting for your answer'); // the status is in that column
  });

  it('marks an in-person session', () => {
    expect(render({ appointment: appointment({ mode: 'in_person' }) }).text()).toContain('In person');
  });

  it('is one button that reads out the person, the time, the way and the status', () => {
    const a = appointment({ status: 'confirmed' });
    const { row } = render({ appointment: a });
    expect(row().props.accessibilityRole).toBe('button');
    expect(row().props.accessibilityLabel).toBe(`Bea, ${sessionWhen(a)}, Virtual, Confirmed`);
  });

  it('calls onPress and holds no navigation of its own', async () => {
    const { row, props } = render();
    await act(async () => {
      row().props.onPress();
    });
    expect(props.onPress).toHaveBeenCalledTimes(1);
    const source = fs.readFileSync(path.resolve(__dirname, '../../src/components/ProAppointmentRow.tsx'), 'utf8');
    expect(source).not.toMatch(/navigate\(|useNavigation/);
  });

  it('names a session with someone whose account is gone by the stub label the server keeps', () => {
    const { text } = render({ appointment: appointment({ otherLabel: '' }) });
    expect(text()).toContain('Former client');
  });

  it('has no commerce wording and no price', () => {
    const { text } = render({ appointment: appointment({ place: 'Cafe Roma', note: 'Bring a few coats' }) });
    expect(text()).not.toMatch(/\b(book|pay now|buy|checkout|deposit|premium|featured|verified|certified|top rated)\b/i);
    expect(text()).not.toMatch(/[$€£]/);
  });
});
