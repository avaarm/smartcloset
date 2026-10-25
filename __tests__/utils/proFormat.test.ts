import {
  closedExplanation, connectionTitle, deviceTimeZone, deviceUtcOffsetMinutes, endedByViewer, formatSession, groupCode, isCompleteCode, isUuid,
  newClientRef, normaliseCode, sessionWhen, statusLabel, systemLineText, utcOffsetLabel,
} from '../../src/utils/proFormat';

describe('newClientRef', () => {
  it('makes a fresh version-4 uuid for each attempt', () => {
    expect(newClientRef()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(newClientRef()).not.toBe(newClientRef());
  });

  it('is a uuid the pro-photo function and the server would accept', () => {
    expect(isUuid(newClientRef())).toBe(true);
    expect(isUuid('3F2A6C1E-8B1D-4C53-9E0A-1D2F3A4B5C6D')).toBe(true);
    for (const bad of ['', 'x', '3f2a6c1e8b1d4c539e0a1d2f3a4b5c6d', '3f2a6c1e-8b1d-4c53-9e0a-1d2f3a4b5c6d\n', null, undefined, 42]) {
      expect(isUuid(bad)).toBe(false);
    }
  });
});

describe('invite codes', () => {
  // The same cases as public.pro_norm_code(): remove spaces and hyphens, upper-case, O -> 0, I and L -> 1.
  it.each([
    ['abcde-fghjk', 'ABCDEFGHJK'],
    ['ABCDE FGHJK', 'ABCDEFGHJK'],
    ['  abcde - fghjk  ', 'ABCDEFGHJK'],
    ['oOiIlL', '001111'],
    ['A-B C\tD\nE', 'ABCDE'],
    ['0123456789', '0123456789'],
    ['', ''],
  ])('reads %j as %j', (input, out) => {
    expect(normaliseCode(input)).toBe(out);
  });

  it('is idempotent, as the server’s is, so a code can be sent normalised', () => {
    for (const input of ['abcde-fghjk', 'o1l0-IiLl', '  x ']) {
      expect(normaliseCode(normaliseCode(input))).toBe(normaliseCode(input));
    }
  });

  it('is safe for input that is not text', () => {
    expect(normaliseCode(undefined as any)).toBe('');
    expect(normaliseCode(null as any)).toBe('');
  });

  it('shows a code as XXXXX-XXXXX, grouping a partial one as far as it goes', () => {
    expect(groupCode('ABCDEFGHJK')).toBe('ABCDE-FGHJK');
    expect(groupCode('abcde-fghjk')).toBe('ABCDE-FGHJK');
    expect(groupCode('abcdefg')).toBe('ABCDE-FG');
    expect(groupCode('abcde')).toBe('ABCDE');
    expect(groupCode('abc')).toBe('ABC');
    expect(groupCode('')).toBe('');
  });

  it('knows a whole code from a partial or a malformed one (the alphabet has no I, L, O or U)', () => {
    expect(isCompleteCode('ABCDE-FGHJK')).toBe(true);
    expect(isCompleteCode('abcde fghjk')).toBe(true);
    expect(isCompleteCode('0123456789')).toBe(true);
    expect(isCompleteCode('oiloiloilo')).toBe(true);        // read as 0 and 1
    expect(isCompleteCode('ABCDE-FGHJ')).toBe(false);
    expect(isCompleteCode('ABCDE-FGHJKM')).toBe(false);
    expect(isCompleteCode('ABCDE-FGHJU')).toBe(false);
    expect(isCompleteCode('ABCDE-FGHJ!')).toBe(false);
    expect(isCompleteCode('')).toBe(false);
  });
});

describe('formatSession', () => {
  const START = '2026-10-24T22:00:00Z';   // 3:00 PM in Los Angeles (UTC-7), 11:00 PM in London (BST, UTC+1), 11:00 AM next day in Auckland (UTC+13)
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-01T12:00:00Z') });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('writes the time in the viewer’s zone when the proposer’s offset is the same', () => {
    expect(formatSession(START, -420, 'America/Los_Angeles', 'en-US')).toBe('Sat, Oct 24, 3:00 PM');
  });

  it('shows the proposer’s time and their offset from UTC in brackets when the offsets differ', () => {
    expect(formatSession(START, 60, 'America/Los_Angeles', 'en-US')).toBe('Sat, Oct 24, 3:00 PM (11:00 PM their time, UTC+1)');
  });

  it('adds the weekday to the proposer’s time when it falls on another day', () => {
    expect(formatSession(START, 780, 'America/Los_Angeles', 'en-US')).toBe('Sat, Oct 24, 3:00 PM (Sun 11:00 AM their time, UTC+13)');
    expect(formatSession('2026-10-25T04:00:00Z', -420, 'Europe/London', 'en-US')).toBe('Sun, Oct 25, 4:00 AM (Sat 9:00 PM their time, UTC-7)');
  });

  it('writes a negative and a half-hour offset', () => {
    expect(formatSession(START, -180, 'America/Los_Angeles', 'en-US')).toBe('Sat, Oct 24, 3:00 PM (7:00 PM their time, UTC-3)');
    expect(formatSession(START, 330, 'America/Los_Angeles', 'en-US')).toBe('Sat, Oct 24, 3:00 PM (Sun 3:30 AM their time, UTC+5:30)');
  });

  it('says nothing about a place: only the offset travels, never a zone name', () => {
    const text = formatSession(START, 60, 'America/Los_Angeles', 'en-US');
    expect(text).not.toMatch(/London|Paris|Europe|America|Asia| in [A-Z][a-z]+\)/);
  });

  it('shows the same moment differently to two viewers, and each in their own zone', () => {
    const a = formatSession(START, 60, 'America/Los_Angeles', 'en-US');
    const b = formatSession(START, 60, 'Europe/London', 'en-US');
    expect(a).not.toBe(b);
    expect(b).toBe('Sat, Oct 24, 11:00 PM');
  });

  it('compares offsets at the moment of the session, so daylight saving is right on both sides', () => {
    // 25 Oct 2026 04:00 UTC: London has just gone back to UTC+0, Los Angeles is still UTC-7
    expect(formatSession('2026-10-25T04:00:00Z', 0, 'Europe/London', 'en-US')).toBe('Sun, Oct 25, 4:00 AM');
    expect(formatSession('2026-10-25T04:00:00Z', 60, 'Europe/London', 'en-US')).toBe('Sun, Oct 25, 4:00 AM (5:00 AM their time, UTC+1)');
  });

  it('uses no odd spaces, so strings compare and wrap predictably', () => {
    expect(formatSession(START, 60, 'America/Los_Angeles', 'en-US')).not.toMatch(/[\u00a0\u202f]/);
  });

  it('uses this device’s zone when none is given, and does not mention the proposer’s offset when it is the same', () => {
    const own = deviceUtcOffsetMinutes(START);
    expect(formatSession(START, own, undefined, 'en-US')).toBe(formatSession(START, null, undefined, 'en-US'));
    expect(formatSession(START, own, undefined, 'en-US')).not.toContain('their time');
  });

  it('shows no proposer offset when there is none to show', () => {
    expect(formatSession(START, null, 'America/Los_Angeles', 'en-US')).toBe('Sat, Oct 24, 3:00 PM');
    expect(formatSession(START, undefined, 'America/Los_Angeles', 'en-US')).toBe('Sat, Oct 24, 3:00 PM');
    expect(formatSession(START, Number.NaN, 'America/Los_Angeles', 'en-US')).toBe('Sat, Oct 24, 3:00 PM');
  });

  it('falls back to the viewer’s own clock when the viewer’s zone name is not valid, without the proposer’s offset', () => {
    expect(formatSession(START, 0, 'Not/AZone', 'en-US')).toMatch(/^[A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2} [AP]M$/);
  });

  it('falls back to the ISO-style local time when Intl is missing', () => {
    const real = global.Intl;
    (global as any).Intl = undefined;
    try {
      expect(formatSession(START, 60, 'America/Los_Angeles')).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
      expect(deviceTimeZone()).toBe('UTC');
    } finally {
      (global as any).Intl = real;
    }
  });

  it('returns what it was given when it is not a date', () => {
    expect(formatSession('soon', 0, 'UTC')).toBe('soon');
    expect(formatSession('', 0, 'UTC')).toBe('');
  });
});

describe('sessionWhen', () => {
  const base = { startsAt: '2026-10-24T22:00:00Z', utcOffsetMinutes: 60 };

  it('shows the other person’s offset when they proposed it', () => {
    expect(sessionWhen({ ...base, proposedBy: 'client', myRole: 'stylist' }, 'America/Los_Angeles', 'en-US'))
      .toBe('Sat, Oct 24, 3:00 PM (11:00 PM their time, UTC+1)');
  });

  it('shows nothing extra for a session the viewer proposed', () => {
    expect(sessionWhen({ ...base, proposedBy: 'stylist', myRole: 'stylist' }, 'America/Los_Angeles', 'en-US')).toBe('Sat, Oct 24, 3:00 PM');
  });
});

describe('utcOffsetLabel', () => {
  it('writes the offset the way people say it', () => {
    expect(utcOffsetLabel(0)).toBe('UTC');
    expect(utcOffsetLabel(60)).toBe('UTC+1');
    expect(utcOffsetLabel(-480)).toBe('UTC-8');
    expect(utcOffsetLabel(330)).toBe('UTC+5:30');
    expect(utcOffsetLabel(345)).toBe('UTC+5:45');
    expect(utcOffsetLabel(-210)).toBe('UTC-3:30');
    expect(utcOffsetLabel(840)).toBe('UTC+14');
  });
});

describe('deviceUtcOffsetMinutes', () => {
  const withOffset = (behindUtc: number, fn: () => void) => {
    const spy = jest.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(behindUtc);
    try {
      fn();
    } finally {
      spy.mockRestore();
    }
  };

  it('is minutes east of UTC: London in summer is +60, Los Angeles in summer is -420', () => {
    withOffset(-60, () => expect(deviceUtcOffsetMinutes('2026-07-01T12:00:00Z')).toBe(60));
    withOffset(420, () => expect(deviceUtcOffsetMinutes('2026-07-01T12:00:00Z')).toBe(-420));
    withOffset(0, () => expect(deviceUtcOffsetMinutes()).toBe(0));
  });

  it('keeps a quarter hour and rounds anything odder to one, as the server only takes quarter hours', () => {
    withOffset(-345, () => expect(deviceUtcOffsetMinutes()).toBe(345));
    withOffset(-44, () => expect(deviceUtcOffsetMinutes()).toBe(45));
    withOffset(-330, () => expect(deviceUtcOffsetMinutes()).toBe(330));
  });

  it('stays inside the range of real zones', () => {
    withOffset(-900, () => expect(deviceUtcOffsetMinutes()).toBe(840));
    withOffset(900, () => expect(deviceUtcOffsetMinutes()).toBe(-720));
  });

  it('is 0 for a date that is not one', () => {
    expect(deviceUtcOffsetMinutes('soon')).toBe(0);
  });

  it('is a whole quarter hour in range on the real device zone', () => {
    const v = deviceUtcOffsetMinutes();
    expect(Math.abs(v % 15)).toBe(0);
    expect(v).toBeGreaterThanOrEqual(-720);
    expect(v).toBeLessThanOrEqual(840);
  });
});

describe('deviceTimeZone', () => {
  it('is a zone name', () => {
    expect(deviceTimeZone()).toMatch(/^[A-Za-z0-9_+/-]+$/);
  });
});

describe('statusLabel', () => {
  it('words a session from the viewer’s side', () => {
    expect(statusLabel('session', 'proposed', true)).toBe('Waiting for their answer');
    expect(statusLabel('session', 'proposed', false)).toBe('Waiting for your answer');
    expect(statusLabel('session', 'confirmed', true)).toBe('Confirmed');
    expect(statusLabel('session', 'declined', false)).toBe('You declined');
    expect(statusLabel('session', 'declined', true)).toBe('Declined');
    expect(statusLabel('session', 'cancelled', false)).toBe('Cancelled');
    expect(statusLabel('session', 'expired', false)).toBe('Expired');
    expect(statusLabel('session', 'completed', false)).toBe('Completed');
  });

  it('words a look for its author and for the person it was sent to', () => {
    expect(statusLabel('look', 'draft', true)).toBe('Draft');
    expect(statusLabel('look', 'sent', true)).toBe('Sent');
    expect(statusLabel('look', 'sent', false)).toBe('New');
    expect(statusLabel('look', 'viewed', true)).toBe('Viewed');
    expect(statusLabel('look', 'implemented', true)).toBe('They wore it');
    expect(statusLabel('look', 'implemented', false)).toBe('You wore it');
  });

  it('words a connection', () => {
    expect(statusLabel('connection', 'active', false)).toBe('Connected');
    expect(statusLabel('connection', 'ended', true)).toBe('Ended');
  });

  it('shows nothing for a status it does not know, never a code', () => {
    expect(statusLabel('session', 'on_hold', true)).toBe('');
    expect(statusLabel('look', '', true)).toBe('');
    expect(statusLabel('connection', 'closed_shell', true)).toBe('');
    expect(statusLabel('nonsense' as any, 'active', true)).toBe('');
  });

  it('has no commerce wording and no code in anything it says', () => {
    const all = [
      ...['proposed', 'confirmed', 'declined', 'cancelled', 'expired', 'completed'].flatMap(s => [statusLabel('session', s, true), statusLabel('session', s, false)]),
      ...['draft', 'sent', 'viewed', 'implemented'].flatMap(s => [statusLabel('look', s, true), statusLabel('look', s, false)]),
      ...['active', 'ended'].map(s => statusLabel('connection', s, false)),
    ];
    for (const text of all) {
      expect(text).not.toMatch(/_/);
      expect(text).not.toMatch(/\b(book|pay|buy|checkout|deposit|premium|featured|verified|certified|top rated|block)/i);
    }
  });
});

describe('closedExplanation', () => {
  it('tells the person who ended it, and everyone else the same neutral line', () => {
    expect(closedExplanation('me')).toBe('You ended this connection.');
    expect(closedExplanation('them')).toBe('This connection has ended.');
    expect(closedExplanation(null)).toBe('This connection has ended.');
    expect(closedExplanation(undefined)).toBe('This connection has ended.');
  });

  it('never says why, and never uses the word "blocked"', () => {
    for (const who of ['me', 'them', null] as const) {
      expect(closedExplanation(who)).not.toMatch(/block|report|suspend|delet|remov/i);
    }
  });

  it('reads a summary row’s endedBy from the viewer’s side; a system ending is "them"', () => {
    expect(endedByViewer({ myRole: 'client', endedBy: 'client' })).toBe('me');
    expect(endedByViewer({ myRole: 'client', endedBy: 'stylist' })).toBe('them');
    expect(endedByViewer({ myRole: 'stylist', endedBy: 'stylist' })).toBe('me');
    expect(endedByViewer({ myRole: 'stylist', endedBy: 'system' })).toBe('them');
    expect(endedByViewer({ myRole: 'stylist', endedBy: undefined })).toBeNull();
  });
});

describe('systemLineText', () => {
  it('words the grey lines in a thread', () => {
    expect(systemLineText('connected')).toBe("You're connected.");
    expect(systemLineText('ended')).toBe('This connection has ended.');
    expect(systemLineText('sharing_on')).toBe('Closet sharing is on.');
  });

  it('says nothing for a code it does not know', () => {
    expect(systemLineText('nonsense')).toBe('');
    expect(systemLineText('')).toBe('');
    expect(systemLineText(null)).toBe('');
    expect(systemLineText(undefined)).toBe('');
  });
});

describe('connectionTitle', () => {
  it('is the other person’s label', () => {
    expect(connectionTitle({ otherLabel: 'Ann Lee', myRole: 'client' })).toBe('Ann Lee');
    expect(connectionTitle({ otherLabel: ' Maya L ', myRole: 'stylist' })).toBe('Maya L');
  });

  it('is the neutral label of the person who left when the server sent none', () => {
    expect(connectionTitle({ otherLabel: '', myRole: 'client' })).toBe('Former stylist');
    expect(connectionTitle({ otherLabel: null, myRole: 'stylist' })).toBe('Former client');
    expect(connectionTitle({ otherLabel: '  ' })).toBe('Connection');
    expect(connectionTitle({})).toBe('Connection');
  });
});
