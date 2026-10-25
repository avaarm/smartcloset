/**
 * Wording and small formatters for professional accounts, in one place so every screen says the same thing.
 * Pure functions; no React, no network, no storage. The text itself lives in config/proRules.ts (Appendix A).
 */
import {
  PRO_CLOSED_BY_ME,
  PRO_CLOSED_BY_THEM,
  PRO_SYSTEM_LINES,
  PRO_UTC_OFFSET_RANGE,
} from '../config/proRules';
import type { ProAppointment, ProConnectionSummary, ProRole } from '../types/pro';

/** A random version-4 uuid. React Native has no crypto.randomUUID; this only needs to be unique per attempt. */
export const newClientRef = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

/** A uuid in the shape the server and the pro-photo function accept (any version, any case). */
export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

// ─── invite codes ────────────────────────────────────────────────────────────

/** Ten Crockford base32 characters (no I, L, O, U), as public.pro_new_code() makes them. */
const CODE_SHAPE = /^[0-9A-HJKMNP-TV-Z]{10}$/;

/**
 * What a person typed or pasted, as the server will read it: spaces and hyphens removed, upper-cased, and
 * O read as 0, I and L as 1 (the client-side mirror of public.pro_norm_code()).
 */
export const normaliseCode = (input: string): string =>
  `${input ?? ''}`
    .replace(/[\s-]/g, '')
    .toUpperCase()
    .replace(/[OIL]/g, c => (c === 'O' ? '0' : '1'));

/** The code the way it is shown and typed: XXXXX-XXXXX (a partial code is grouped as far as it goes). */
export const groupCode = (code: string): string => {
  const n = normaliseCode(code);
  return n.length > 5 ? `${n.slice(0, 5)}-${n.slice(5)}` : n;
};

/** True when the input is a whole code (the Connect button's switch). */
export const isCompleteCode = (input: string): boolean => CODE_SHAPE.test(normaliseCode(input));

// ─── times ───────────────────────────────────────────────────────────────────

/** This device's IANA zone name, or UTC when it cannot be read. */
export const deviceTimeZone = (): string => {
  try {
    const tz = new Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof tz === 'string' && tz ? tz : 'UTC';
  } catch {
    return 'UTC';
  }
};

// Newer Intl builds put a narrow no-break space before AM/PM; a plain space reads the same and compares simply.
const plain = (s: string) => s.replace(/[  ]/g, ' ');

const pad = (n: number) => `${n}`.padStart(2, '0');

/** The ISO-style local time, for devices with no Intl: 2026-10-24 15:00. */
const localStamp = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

const dayKey = (d: Date, timeZone: string, locale?: string) =>
  new Intl.DateTimeFormat(locale, { timeZone, year: 'numeric', month: 'numeric', day: 'numeric' }).format(d);

/** The UTC offset of a zone at an instant, in minutes east of UTC (+60 for UTC+1). Null when Intl cannot say. */
const zoneOffsetMinutes = (date: Date, timeZone: string): number | null => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    }).formatToParts(date);
    const n = (type: string) => Number(parts.find(p => p.type === type)?.value);
    const asUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour') % 24, n('minute'), n('second'));
    const minutes = Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
    return Number.isFinite(minutes) ? minutes : null;
  } catch {
    return null;
  }
};

/**
 * This device's offset from UTC at an instant, in minutes east of UTC (+60 for UTC+1), rounded to a quarter hour and
 * kept to the range of real zones (-12:00 to +14:00), which is what the server accepts. This number, and not the zone's
 * name, is what a session carries to the other person: a name such as Europe/London is a city, an offset is not.
 */
export const deviceUtcOffsetMinutes = (at: Date | string = new Date()): number => {
  const date = at instanceof Date ? at : new Date(at);
  const raw = Number.isNaN(date.getTime()) ? 0 : -date.getTimezoneOffset();
  const quarter = Math.round(raw / 15) * 15;
  return (Math.min(PRO_UTC_OFFSET_RANGE.max, Math.max(PRO_UTC_OFFSET_RANGE.min, quarter))) || 0;   // never -0
};

/** UTC, UTC+1, UTC-8, UTC+5:30. */
export const utcOffsetLabel = (minutes: number): string => {
  if (!minutes) return 'UTC';
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${minutes < 0 ? '-' : '+'}${h}${m ? `:${pad(m)}` : ''}`;
};

/**
 * A session start as the viewer should read it: the time in the viewer's own zone, and, when the proposer's clock was
 * at a different offset from UTC, their local time with that offset in brackets ("Fri, Oct 24, 3:00 PM (11:00 PM their
 * time, UTC+1)"). Only the offset travels between the two people, never a zone name or a place. `utcOffsetMinutes` is
 * the proposer's, or null/undefined when there is nothing to show (the viewer proposed it). `viewerTz` defaults to this
 * device's zone. Falls back to the ISO-style local time when Intl is missing or a zone name is not valid. `locale`
 * defaults to the device's.
 */
export const formatSession = (startsAtIso: string, utcOffsetMinutes: number | null | undefined, viewerTz?: string, locale?: string): string => {
  const date = new Date(startsAtIso);
  if (Number.isNaN(date.getTime())) return `${startsAtIso}`;
  const viewer = viewerTz || deviceTimeZone();
  const inZone = (timeZone: string | undefined) => {
    const sameYear = new Intl.DateTimeFormat(locale, { timeZone, year: 'numeric' }).format(date)
      === new Intl.DateTimeFormat(locale, { timeZone, year: 'numeric' }).format(new Date());
    return plain(new Intl.DateTimeFormat(locale, {
      timeZone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      ...(sameYear ? {} : { year: 'numeric' }),
      hour: 'numeric',
      minute: '2-digit',
    }).format(date));
  };
  let main: string;
  try {
    main = inZone(viewer);
  } catch {
    try {
      main = inZone(undefined);   // a viewer zone this device does not know: its own clock
    } catch {
      return localStamp(date);    // no Intl at all
    }
  }
  if (typeof utcOffsetMinutes !== 'number' || !Number.isFinite(utcOffsetMinutes)) return main;
  try {
    const own = viewerTz ? zoneOffsetMinutes(date, viewer) : -date.getTimezoneOffset();
    if (own === null || own === utcOffsetMinutes) return main;
    // The proposer's wall clock is the instant shifted by their offset, read as UTC.
    const shifted = new Date(date.getTime() + utcOffsetMinutes * 60000);
    const viewerDay = dayKey(date, viewer, locale);
    const theirDay = dayKey(shifted, 'UTC', locale);
    const theirs = plain(new Intl.DateTimeFormat(locale, {
      timeZone: 'UTC',
      ...(viewerDay === theirDay ? {} : { weekday: 'short' }),
      hour: 'numeric',
      minute: '2-digit',
    }).format(shifted));
    return `${main} (${theirs} their time, ${utcOffsetLabel(utcOffsetMinutes)})`;
  } catch {
    return main;
  }
};

/** A session as the viewer reads it: the other person's offset is shown only when the other person proposed it. */
export const sessionWhen = (
  a: Pick<ProAppointment, 'startsAt' | 'utcOffsetMinutes' | 'proposedBy' | 'myRole'>,
  viewerTz?: string,
  locale?: string,
): string => formatSession(a.startsAt, a.proposedBy === a.myRole ? null : a.utcOffsetMinutes, viewerTz, locale);

// ─── words ───────────────────────────────────────────────────────────────────

export type ProStatusKind = 'connection' | 'session' | 'look';

/**
 * The short status on a row or at the top of a screen. `mine` says whose move the status is:
 *   session     the viewer proposed it
 *   look        the viewer is the stylist who wrote it
 *   connection  not used
 * Anything unexpected is an empty string, so a new server value shows nothing instead of a code.
 */
export const statusLabel = (kind: ProStatusKind, status: string, mine: boolean): string => {
  switch (kind) {
    case 'session':
      switch (status) {
        case 'proposed': return mine ? 'Waiting for their answer' : 'Waiting for your answer';
        case 'confirmed': return 'Confirmed';
        case 'declined': return mine ? 'Declined' : 'You declined';
        case 'cancelled': return 'Cancelled';
        case 'expired': return 'Expired';
        case 'completed': return 'Completed';
        default: return '';
      }
    case 'look':
      switch (status) {
        case 'draft': return 'Draft';
        case 'sent': return mine ? 'Sent' : 'New';
        case 'viewed': return 'Viewed';
        case 'implemented': return mine ? 'They wore it' : 'You wore it';
        default: return '';
      }
    case 'connection':
      switch (status) {
        case 'active': return 'Connected';
        case 'ended': return 'Ended';
        default: return '';
      }
    default: return '';
  }
};

/**
 * The sentence under an ended connection. The person who ended it reads "You ended this connection."; everyone
 * else, including a connection a suspension, a deleted account or a closed shell ended, reads the same neutral
 * line. It never says why, and never uses the word "blocked".
 */
export const closedExplanation = (endedBy?: 'me' | 'them' | null): string =>
  endedBy === 'me' ? PRO_CLOSED_BY_ME : PRO_CLOSED_BY_THEM;

/** A summary row's endedBy ('client' | 'stylist' | 'system') as the viewer reads it: 'me', 'them', or null while it is open. */
export const endedByViewer = (c: Pick<ProConnectionSummary, 'myRole' | 'endedBy'>): 'me' | 'them' | null => {
  if (!c.endedBy) return null;
  return c.endedBy === c.myRole ? 'me' : 'them';
};

/** Text for the grey system lines inside a thread. */
export const systemLineText = (code: string | null | undefined): string => {
  switch (code) {
    case 'connected': return PRO_SYSTEM_LINES.connected;
    case 'ended': return PRO_SYSTEM_LINES.ended;
    case 'sharing_on': return PRO_SYSTEM_LINES.sharing_on;
    default: return '';
  }
};

/** The heading of a connection: the other person's label, which the server keeps as "Former stylist" / "Former client" when they are gone. */
export const connectionTitle = (c: { otherLabel?: string | null; myRole?: ProRole }): string => {
  const label = c.otherLabel?.trim();
  if (label) return label;
  if (c.myRole === 'client') return 'Former stylist';
  if (c.myRole === 'stylist') return 'Former client';
  return 'Connection';
};
