#!/usr/bin/env node
/**
 * Professional accounts: checks through the real API layer (documentation/design/pro-accounts.md 9.4).
 *
 * Why it exists: PostgREST rejects an UPDATE or DELETE without a WHERE, even inside a SECURITY DEFINER function, and
 * direct SQL does not. The swap upkeep job passed every SQL scenario and failed on every phone. The SQL scenarios of
 * supabase/tests/pro cannot see that; a call through the API with a real session can.
 *
 * It COMMITS data (users, closet rows, a test photo, reports) and then removes it, so it only runs against a local
 * Supabase stack (`supabase start`, and `supabase functions serve pro-photo` for the photo checks). It refuses any
 * other address: a Supabase branch that mirrors production is the only other acceptable target, and only when the
 * host is spelled out in PRO_API_ALLOW_REMOTE. The production project is always refused.
 *
 *   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/pro-api-checks.mjs
 *   eval "$(supabase status -o env | sed 's/^/export /')" && SUPABASE_URL=$API_URL ... (ANON_KEY and SERVICE_ROLE_KEY work too)
 *
 *   --dry-run     no network call, no environment needed: prints the plan and checks every function name, argument name,
 *                 grant, table and constant this script uses against the migration files, so it can be finished and
 *                 tested without Docker. Exits 1 on any mismatch.
 *   --json        with --dry-run: the plan and the findings as JSON (the Jest in-step test reads this)
 *   --migrations  with --dry-run: another folder of migrations (the Jest test uses a doctored copy)
 *   --verbose     print every passing check
 *   --keep        leave the fixture users and rows in place (the switches are still put back)
 *   --require-photo-function   a pro-photo function that cannot be reached is a failure, not a skipped group
 *
 * Environment: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY. Optional: PRO_API_DB_URL (a local database
 * URL; only used to list the policies on storage.objects for the release run), PRO_API_ALLOW_REMOTE (see above).
 *
 * Each run creates ten fixture accounts and signs them in; the local auth service allows 30 sign-ins per five minutes,
 * so wait between runs if it ever answers 429.
 *
 * The script changes three settings while it runs (the server switch pro_enabled, min_account_age_hours so that
 * fixture accounts can create a code, and for one check a terms version) and puts all of them back, and it tops
 * swap_blocked_terms up to 50 terms for pro_set_enabled(true) and removes the ones it added.
 *
 * Reading guide. Everything between the two "steps" markers is the plan: each call to ok, fails, refused or result
 * names one function and passes a literal object of p_ arguments, so --dry-run can read the calls out of this file and
 * compare them with the SQL (and __tests__/proApiChecksInStepWithService.test.ts compares them with proService.ts).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const REPO = path.resolve(path.dirname(SELF), '..');
const DEFAULT_MIGRATIONS = path.join(REPO, 'supabase', 'migrations');

// The project this must never touch. Spelled out only here, in the guard.
const PRODUCTION_REF = 'ipgndphqbuftuxstoitk';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

// The versions of this build's texts (src/config/proRules.ts); the in-step test compares them with proRules.ts and the SQL.
export const STYLIST_TERMS_VERSION = '2026-10';
export const CLIENT_TERMS_VERSION = '2026-10';
export const SHARE_TEXT_VERSION = '2026-10';

const UUID0 = '00000000-0000-4000-8000-000000000000';

// ─── What the plan covers ────────────────────────────────────────────────────

/**
 * The fifteen pro tables and the nine legacy stylist tables (3.4, 3.6). `key` is a column that exists in the table
 * and `value` the text of a filter on it that matches nothing: a PATCH or DELETE needs a filter, or the API layer
 * would refuse it for that reason and not for the missing privilege this check is after.
 */
export const PRO_TABLES = [
  { name: 'pro_config', key: 'key', value: 'api_check' },
  { name: 'pro_meta', key: 'id', value: 'true', json: true },
  { name: 'pro_members', key: 'user_id', value: UUID0 },
  { name: 'pro_stylists', key: 'user_id', value: UUID0 },
  { name: 'pro_invites', key: 'id', value: UUID0 },
  { name: 'pro_connections', key: 'id', value: UUID0 },
  { name: 'pro_grants', key: 'connection_id', value: UUID0 },
  { name: 'pro_grant_items', key: 'connection_id', value: UUID0 },
  { name: 'pro_grant_events', key: 'connection_id', value: UUID0 },
  { name: 'pro_closet_views', key: 'connection_id', value: UUID0 },
  { name: 'pro_recommendations', key: 'id', value: UUID0 },
  { name: 'pro_recommendation_items', key: 'recommendation_id', value: UUID0 },
  { name: 'pro_appointments', key: 'id', value: UUID0 },
  { name: 'pro_messages', key: 'connection_id', value: UUID0 },
  { name: 'pro_rate_counters', key: 'user_id', value: UUID0 },
];
export const LEGACY_TABLES = [
  'stylist_profiles', 'stylist_clients', 'appointments', 'recommendations', 'styling_recommendations',
  'message_threads', 'messages', 'booking_requests', 'stylist_reviews',
].map(name => ({ name, key: 'id', value: UUID0 }));

/**
 * Every function of 4.6 with the smallest argument object that names every required parameter. Used to prove that
 * anon is refused each one, and by --dry-run, which compares the names with the SQL. Values are well formed (a uuid
 * where a uuid goes) so the refusal is for the missing privilege and not for a malformed value.
 */
export const CLIENT_PROBES = {
  get_pro_status: {},
  get_pro_badge: {},
  accept_pro_terms: { p_role: 'client', p_version: CLIENT_TERMS_VERSION, p_adult: false },
  get_my_stylist_profile: {},
  save_stylist_profile: { p_display_name: 'Probe Person' },
  set_stylist_accepting: { p_accepting: true },
  close_stylist_profile: {},
  create_pro_invite: { p_client_ref: UUID0 },
  list_my_pro_invites: {},
  revoke_pro_invite: { p_invite: UUID0 },
  preview_pro_invite: { p_code: 'AAAAAAAAAA' },
  redeem_pro_invite: { p_code: 'AAAAAAAAAA', p_alias: 'Probe Person' },
  list_pro_connections: {},
  get_pro_connection: { p_connection: UUID0 },
  end_pro_connection: { p_connection: UUID0 },
  set_pro_alias: { p_connection: UUID0, p_alias: 'Probe Person' },
  get_pro_grant: { p_connection: UUID0 },
  set_pro_grant: { p_connection: UUID0, p_scope: 'closet', p_enabled: false },
  get_client_closet: { p_connection: UUID0 },
  save_pro_recommendation: { p_connection: UUID0 },
  send_pro_recommendation: { p_id: UUID0 },
  delete_pro_recommendation: { p_id: UUID0 },
  list_pro_recommendations: { p_connection: UUID0 },
  get_pro_recommendation: { p_id: UUID0 },
  give_recommendation_feedback: { p_id: UUID0, p_rating: 5 },
  propose_pro_appointment: { p_connection: UUID0, p_starts_at: '2030-01-01T10:00:00Z', p_duration_minutes: 60, p_mode: 'virtual' },
  respond_pro_appointment: { p_appointment: UUID0, p_action: 'confirm' },
  cancel_pro_appointment: { p_appointment: UUID0 },
  list_pro_appointments: {},
  send_pro_message: { p_connection: UUID0, p_body: 'probe', p_client_ref: UUID0 },
  get_pro_thread: { p_connection: UUID0 },
  report_pro_content: { p_ref_type: 'connection', p_ref_id: UUID0, p_reason: 'spam' },
  block_pro_member: { p_connection: UUID0 },
  list_pro_blocks: {},
  unblock_pro_member: { p_ref: UUID0 },
  export_my_pro_data: {},
};

/**
 * What an app user must be refused: the admin functions and pro_photo_source (service role only, 4.7), and a
 * handful of the internal helpers (4.5), which are revoked from everyone but the owner. The targets are an id that
 * exists nowhere, so a grant that was left open by mistake would change nothing.
 */
export const SERVICE_ONLY_PROBES = {
  pro_photo_source: { p_uid: UUID0, p_connection: UUID0, p_item: UUID0 },
  pro_janitor: { p_force: false },
  pro_set_enabled: { p_on: true },
  pro_admin_approve_stylist: { p_user: UUID0 },
  pro_admin_hold_stylist: { p_user: UUID0 },
  pro_admin_release_stylist: { p_user: UUID0 },
  pro_admin_suspend: { p_user: UUID0, p_reason: 'probe' },
  pro_admin_unsuspend: { p_user: UUID0 },
  pro_admin_remove_stylist: { p_user: UUID0, p_reason: 'probe' },
  pro_admin_restore_stylist: { p_user: UUID0 },
  pro_report_backlog: {},
  pro_send_report_digest: {},
};
export const HELPER_PROBES = {
  pro_gate: { p_uid: UUID0, p_need: 'safety' },
  pro_refresh: { p_uid: UUID0 },
  pro_cfg: { p_key: 'pro_enabled' },
  pro_limit: { p_name: 'terms_day' },
  pro_text_ok: { p_text: 'probe' },
  pro_rate_check: { p_uid: UUID0, p_bucket: 'terms_day' },
  pro_end_connection: { p_id: UUID0, p_by: 'system' },
  pro_end_between: { p_blocker: UUID0, p_blocked: UUID0 },
  pro_shell_connection: { p_id: UUID0 },
  pro_can_read_closet: { p_stylist: UUID0, p_client: UUID0, p_connection: UUID0 },
  pro_lock_users: { p_a: UUID0, p_b: UUID0 },
};
export const VIEWS = ['pro_moderation_queue', 'pro_review_queue'];

/**
 * The keys an answer has: the camelCase keys of a jsonb object, or the snake_case columns of a row. proService.ts
 * reads these (PRO_RPC_COLUMNS), and the in-step test compares the two lists; the table-returning ones are also
 * compared with the SQL by --dry-run. A "name:variant" key is another shape the same function answers with.
 */
export const SHAPES = {
  get_pro_status: ['proEnabled', 'suspended', 'adultConfirmed', 'stylistRemoved', 'versions', 'stylist', 'client', 'badge'],
  get_my_stylist_profile: ['displayName', 'headline', 'bio', 'services', 'languages', 'ratesText', 'accepting', 'approved', 'invitesHeld', 'createdAt'],
  save_stylist_profile: ['displayName', 'headline', 'bio', 'services', 'languages', 'ratesText', 'accepting', 'approved', 'invitesHeld', 'createdAt'],
  create_pro_invite: ['inviteId', 'code', 'expiresAt', 'createdAt', 'status', 'connected'],
  list_my_pro_invites: ['invite_id', 'code', 'label', 'status', 'created_at', 'expires_at', 'used_at', 'connected'],
  preview_pro_invite: ['valid', 'inviteId', 'stylist', 'alreadyConnected', 'clientTermsCurrent'],
  'preview_pro_invite:invalid': ['valid', 'error'],
  redeem_pro_invite: ['ok', 'connectionId', 'alreadyConnected'],
  'redeem_pro_invite:invalid': ['ok', 'error'],
  list_pro_connections: [
    'connection_id', 'my_role', 'other_label', 'other_headline', 'status', 'ended_by', 'started_at', 'ended_at',
    'last_activity_at', 'unread', 'attention', 'next_appointment_at', 'pending_appointments', 'closet_shared',
    'closet_expires_at', 'last_message_preview', 'last_message_at',
  ],
  get_pro_connection: [
    'connectionId', 'myRole', 'status', 'endedBy', 'startedAt', 'endedAt', 'otherLabel', 'myAlias', 'safetyOnly',
    'stylist', 'closet', 'counts', 'actions',
  ],
  get_pro_grant: ['scope', 'enabled', 'itemMode', 'itemIds', 'itemCount', 'grantedAt', 'expiresAt', 'expiresSoon', 'textVersion', 'lastViewedAt', 'views30d', 'events'],
  'get_pro_grant:stylist': ['scope', 'enabled', 'itemMode', 'itemCount', 'expiresAt'],
  set_pro_grant: ['scope', 'enabled', 'itemMode', 'itemIds', 'itemCount', 'grantedAt', 'expiresAt', 'expiresSoon', 'textVersion', 'lastViewedAt', 'views30d', 'events'],
  get_client_closet: [
    'item_id', 'name', 'category', 'subcategory', 'color', 'brand', 'season', 'pattern', 'material', 'materials',
    'size', 'condition', 'has_photo', 'total_count',
  ],
  save_pro_recommendation: ['id', 'status', 'updatedAt'],
  list_pro_recommendations: [
    'rec_id', 'status', 'title', 'item_count', 'cover_item_id', 'cover_photo_path', 'sent_at', 'viewed_at',
    'updated_at', 'client_rating', 'is_new',
  ],
  get_pro_recommendation: ['id', 'connectionId', 'status', 'title', 'body', 'sentAt', 'viewedAt', 'implementedAt', 'items', 'feedback', 'actions'],
  propose_pro_appointment: ['appointmentId', 'status'],
  list_pro_appointments: [
    'appointment_id', 'connection_id', 'other_label', 'my_role', 'status', 'proposed_by', 'starts_at',
    'duration_minutes', 'mode', 'place', 'note', 'utc_offset_minutes', 'can_confirm', 'can_decline', 'can_cancel', 'created_at',
  ],
  send_pro_message: ['messageId', 'createdAt'],
  get_pro_thread: ['messages', 'hasMore', 'actions'],
  list_pro_blocks: ['ref', 'label', 'blocked_at'],
  export_my_pro_data: ['settings', 'stylistProfile', 'invites', 'connections'],
  pro_report_backlog: ['waiting', 'oldest_hours'],
};

// What a response to a person must never carry (3.3 rule 4): the key names, compared without case or punctuation.
// A name that is also an ordinary word of the feature (note, name, place) is not in the list.
const FORBIDDEN_KEYS = new Set([
  'email', 'phone', 'price', 'cost', 'notes', 'tags', 'tagtext', 'estimatedvalue', 'wearcount', 'lastworn', 'favorite',
  'favourite', 'retailer', 'retailerimage', 'userimage', 'images', 'userid', 'clientid', 'stylistid', 'ownerid',
  'blockerid', 'blockedid', 'reporterid', 'reporteduserid', 'senderid', 'accountid', 'storagepath', 'photourl', 'imageurl',
]);
// The only two path-carrying names (3.3 rule 4): the client's own photo path, returned to the client and to nobody else.
const PATH_KEYS = new Set(['coverphotopath', 'photopath']);
const PATH_SHAPE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9._-]+/i;

// ─── The address this may talk to ────────────────────────────────────────────

/**
 * A local stack, or (spelled out in PRO_API_ALLOW_REMOTE, over https) a branch that mirrors production. The host is
 * read from the parsed URL, never searched for in the text, so "localhost" in a password or a path lets nothing
 * through; credentials, a path, a query and a fragment are refused outright.
 */
export function checkTarget(rawUrl, env = {}) {
  if (!rawUrl) return { ok: false, reason: 'SUPABASE_URL is not set' };
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'SUPABASE_URL is not a URL' };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, reason: 'SUPABASE_URL must be http or https' };
  if (u.username || u.password) return { ok: false, reason: 'SUPABASE_URL must not carry credentials' };
  if (u.search || u.hash || (u.pathname && u.pathname !== '/')) return { ok: false, reason: 'SUPABASE_URL must be an address only' };
  const host = u.hostname;
  if (host.includes(PRODUCTION_REF)) return { ok: false, reason: 'that is the production project; this script commits data' };
  if (LOCAL_HOSTS.has(host)) return { ok: true, url: u.origin, local: true };
  if (env.PRO_API_ALLOW_REMOTE && env.PRO_API_ALLOW_REMOTE === host && u.protocol === 'https:') {
    return { ok: true, url: u.origin, local: false };
  }
  return {
    ok: false,
    reason: `${host} is not a local address (this script commits data: use the local stack; a branch that mirrors production needs PRO_API_ALLOW_REMOTE=<its host>)`,
  };
}

// ─── Photo fixtures ──────────────────────────────────────────────────────────

const be16 = n => Buffer.from([(n >> 8) & 0xff, n & 0xff]);
const be32 = n => Buffer.from([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);

/**
 * A JPEG a phone could have made, as far as the metadata goes: Exif with a camera make and a GPS position, a comment,
 * and bytes after the end of the image. Its picture data is one scan that is not decodable (the function removes
 * metadata without decoding, so only the segment structure has to be right).
 */
export function buildGeotaggedJpeg() {
  const rational = (a, b) => Buffer.concat([be32(a), be32(b)]);
  const entry = (tag, type, count, value) => Buffer.concat([be16(tag), be16(type), be32(count), value]);
  const pad4 = b => Buffer.concat([b, Buffer.alloc(4 - b.length)]);
  const make = Buffer.from('TestCam\0');                             // 8 bytes, stored after the two IFDs
  const gpsAt = 8 + 2 + 2 * 12 + 4 + make.length;                    // IFD 0 (two entries) and the make string come first
  const latAt = gpsAt + 2 + 4 * 12 + 4;
  const lonAt = latAt + 24;
  const ifd0 = Buffer.concat([
    be16(2),
    entry(0x010f, 2, make.length, be32(8 + 2 + 2 * 12 + 4)),         // Make
    entry(0x8825, 4, 1, be32(gpsAt)),                                // pointer to the GPS block
    be32(0),
  ]);
  const gps = Buffer.concat([
    be16(4),
    entry(1, 2, 2, pad4(Buffer.from('N\0'))),                        // latitude reference
    entry(2, 5, 3, be32(latAt)),                                     // latitude, degrees minutes seconds
    entry(3, 2, 2, pad4(Buffer.from('W\0'))),                        // longitude reference
    entry(4, 5, 3, be32(lonAt)),
    be32(0),
  ]);
  const coords = Buffer.concat([
    rational(51, 1), rational(30, 1), rational(26, 1),
    rational(0, 1), rational(7, 1), rational(39, 1),
  ]);
  const tiff = Buffer.concat([Buffer.from('MM'), be16(42), be32(8), ifd0, make, gps, coords]);
  const exif = Buffer.concat([Buffer.from('Exif\0\0'), tiff]);
  const segment = (marker, payload) => Buffer.concat([Buffer.from([0xff, marker]), be16(payload.length + 2), payload]);
  const comment = Buffer.from('private note: taken at home');
  const sof = Buffer.from([8, 0, 1, 0, 1, 1, 1, 0x11, 0]);           // 8 bit, 1 x 1, one component
  const sos = Buffer.from([1, 1, 0, 0, 63, 0]);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    segment(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0')),
    segment(0xe1, exif),
    segment(0xfe, comment),
    segment(0xc0, sof),
    segment(0xda, sos),
    Buffer.from([0x3f, 0x80, 0x00]),                                 // one byte of "picture" data, a stuffed zero
    Buffer.from([0xff, 0xd9]),
    Buffer.from('TRAILING-PRIVATE-DATA'),
  ]);
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = buf => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const pngChunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  return Buffer.concat([be32(data.length), body, be32(crc32(body))]);
};

/** A one-pixel PNG with a text chunk, a modification time and bytes after the end. */
export function buildTextPng() {
  const ihdr = Buffer.concat([be32(1), be32(1), Buffer.from([8, 0, 0, 0, 0])]);
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('tEXt', Buffer.from('Comment\0private note: taken at home')),
    pngChunk('tIME', Buffer.from([0x07, 0xea, 10, 23, 12, 0, 0])),
    pngChunk('IDAT', zlib.deflateSync(Buffer.from([0, 128]))),
    pngChunk('IEND', Buffer.alloc(0)),
    Buffer.from('TRAILING-PRIVATE-DATA'),
  ]);
}

/** What is left in a JPEG that a stylist should not be given: [] for a clean one, else short names. */
export function jpegFindings(bytes) {
  const found = [];
  const b = Buffer.from(bytes);
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return ['not a JPEG'];
  let i = 2;
  let sawEnd = false;
  while (i < b.length) {
    if (b[i] !== 0xff) { found.push('garbage between segments'); break; }
    while (b[i] === 0xff && i + 1 < b.length) i++;
    const marker = b[i];
    i++;
    if (marker === 0xd9) {
      sawEnd = true;
      if (i < b.length) found.push('bytes after the end of the image');
      break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8) || marker === 0x00) continue;
    const len = (b[i] << 8) | b[i + 1];
    const payload = b.subarray(i + 2, i + len);
    if (marker === 0xe1) {
      // The cleaner may write back one 34-byte Exif block that holds only the rotation flag; anything else is metadata.
      const rotationOnly = len === 34 && payload.length === 32 && payload.readUInt16BE(14) === 0x0112;
      if (!rotationOnly) found.push(payload.subarray(0, 4).toString('latin1') === 'Exif' ? 'Exif' : 'XMP');
    } else if (marker === 0xfe) found.push('comment');
    else if (marker >= 0xe3 && marker <= 0xef && marker !== 0xee) found.push(`APP${marker - 0xe0}`);
    else if (marker === 0xe2 && payload.subarray(0, 11).toString('latin1') !== 'ICC_PROFILE') found.push('APP2 data');
    i += len;
    if (marker === 0xda) {
      while (i < b.length && !(b[i] === 0xff && b[i + 1] !== 0x00 && !(b[i + 1] >= 0xd0 && b[i + 1] <= 0xd7))) i++;
    }
  }
  if (!sawEnd) found.push('no end of image');
  return found;
}

const PNG_KEPT = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'iCCP', 'sBIT', 'cICP']);
/** The same for a PNG: any chunk the cleaner keeps nobody's metadata in is fine; anything else, or bytes after IEND, is not. */
export function pngFindings(bytes) {
  const found = [];
  const b = Buffer.from(bytes);
  if (b.length < 8 || !b.subarray(0, 8).equals(PNG_SIGNATURE)) return ['not a PNG'];
  let i = 8;
  let sawEnd = false;
  while (i + 12 <= b.length) {
    const len = b.readUInt32BE(i);
    const type = b.subarray(i + 4, i + 8).toString('latin1');
    if (!PNG_KEPT.has(type)) found.push(`${type} chunk`);
    i += 12 + len;
    if (type === 'IEND') { sawEnd = true; break; }
  }
  if (!sawEnd) found.push('no IEND');
  else if (i < b.length) found.push('bytes after IEND');
  return found;
}

// ─── Reading this file and the migrations (--dry-run) ────────────────────────

const matchParen = (text, open) => {
  let depth = 0;
  let quote = false;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (quote) { if (ch === "'") quote = false; continue; }
    if (ch === "'") quote = true;
    else if (ch === '(') depth++;
    else if (ch === ')') { depth--; if (depth === 0) return i; }
  }
  return -1;
};
const splitTop = (text, sep) => {
  const parts = [];
  let depth = 0;
  let quote = false;
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) { if (ch === "'") quote = false; continue; }
    if (ch === "'") quote = true;
    else if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === sep && depth === 0) { parts.push(text.slice(from, i)); from = i + 1; }
  }
  parts.push(text.slice(from));
  return parts;
};
const stripSqlComments = sql => sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');

/** Every `create [or replace] function public.NAME(...)`: its parameters (name, whether it has a default) and, for a table result, its columns. */
export function parseSqlFunctions(sql, file = '') {
  const text = stripSqlComments(sql);
  const out = [];
  const re = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z_0-9]+)\s*\(/gi;
  let m;
  while ((m = re.exec(text))) {
    const open = re.lastIndex - 1;
    const close = matchParen(text, open);
    if (close < 0) continue;
    const params = splitTop(text.slice(open + 1, close), ',')
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => {
        const [name] = s.split(/\s+/);
        return { name, hasDefault: /\bdefault\b/i.test(s) || /\s=\s/.test(s) };
      });
    const rest = text.slice(close + 1, close + 1500);
    const table = /^\s*returns\s+table\s*\(/i.exec(rest);
    let columns = null;
    if (table) {
      const tOpen = close + 1 + table[0].length - 1;
      const tClose = matchParen(text, tOpen);
      columns = splitTop(text.slice(tOpen + 1, tClose), ',').map(s => s.trim().split(/\s+/)[0]).filter(Boolean);
    }
    out.push({ name: m[1], params, columns, file });
  }
  return out;
}

/** Who may execute what, from the privilege blocks of the migrations: a `do` block over a literal list, or a plain grant. */
export function parseSqlGrants(sql) {
  const text = stripSqlComments(sql);
  const grants = new Map();
  const add = (fn, roles) => {
    if (!grants.has(fn)) grants.set(fn, new Set());
    for (const r of roles) grants.get(fn).add(r);
  };
  const roleList = s => s.split(',').map(r => r.trim()).filter(Boolean);
  for (const block of text.match(/\bdo\s+\$\$[\s\S]*?\$\$\s*;/gi) || []) {
    const names = [...block.matchAll(/'public\.([a-z_0-9]+)\(/g)].map(x => x[1]);
    const g = /grant\s+execute\s+on\s+function\s+%s\s+to\s+([a-z_,\s]+?)\s*'/i.exec(block);
    if (g) for (const n of names) add(n, roleList(g[1]));
  }
  for (const m of text.matchAll(/grant\s+execute\s+on\s+function\s+public\.([a-z_0-9]+)\s*\([^)]*\)\s+to\s+([a-z_,\s]+?)\s*;/gi)) {
    add(m[1], roleList(m[2]));
  }
  return grants;
}

/** `create table [if not exists] [public.]NAME (...)` to the names of its columns. */
export function parseSqlTables(sql) {
  const text = stripSqlComments(sql);
  const tables = new Map();
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_0-9]+)\s*\(/gi;
  let m;
  while ((m = re.exec(text))) {
    const open = re.lastIndex - 1;
    const close = matchParen(text, open);
    if (close < 0) continue;
    const cols = splitTop(text.slice(open + 1, close), ',')
      .map(s => s.trim())
      .filter(s => s && !/^(constraint|primary|unique|check|foreign|exclude|like)\b/i.test(s))
      .map(s => s.split(/\s+/)[0].replace(/"/g, ''));
    if (!tables.has(m[1])) tables.set(m[1], cols);
  }
  return tables;
}

// A mini reader for the plan. It understands strings, template strings and nesting, so the arguments of a call can be
// read without running it.
function skipString(text, i) {
  const quote = text[i];
  let j = i + 1;
  while (j < text.length) {
    if (text[j] === '\\') { j += 2; continue; }
    if (quote === '`' && text[j] === '$' && text[j + 1] === '{') { j = skipBalanced(text, j + 1); continue; }
    if (text[j] === quote) return j + 1;
    j++;
  }
  return j;
}
function skipBalanced(text, open) {
  const close = { '{': '}', '(': ')', '[': ']' }[text[open]];
  let depth = 0;
  for (let i = open; i < text.length; ) {
    const ch = text[i];
    if (ch === "'" || ch === '"' || ch === '`') { i = skipString(text, i); continue; }
    if (ch === '{' || ch === '(' || ch === '[') depth++;
    else if (ch === '}' || ch === ')' || ch === ']') { depth--; if (depth === 0 && ch === close) return i + 1; }
    i++;
  }
  return text.length;
}
function stripJsComments(src) {
  let out = '';
  for (let i = 0; i < src.length; ) {
    const ch = src[i];
    if (ch === "'" || ch === '"' || ch === '`') { const j = skipString(src, i); out += src.slice(i, j); i = j; continue; }
    if (ch === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (ch === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2); i = i < 0 ? src.length : i + 2; continue; }
    out += ch;
    i++;
  }
  return out;
}
/** The keys of an object literal: `{ a: 1, 'b': f(x), c }` gives a, b, c. */
function literalKeys(text, open) {
  const end = skipBalanced(text, open) - 1;
  const keys = [];
  let i = open + 1;
  while (i < end) {
    while (i < end && /[\s,]/.test(text[i])) i++;
    if (i >= end) break;
    if (text.startsWith('...', i)) return { error: 'a spread in the arguments', keys };
    let key;
    if (text[i] === "'" || text[i] === '"') {
      const j = skipString(text, i);
      key = text.slice(i + 1, j - 1);
      i = j;
    } else {
      const m = /^[A-Za-z_$][\w$]*/.exec(text.slice(i, i + 80));
      if (!m) return { error: 'an argument key that is not a plain name', keys };
      key = m[0];
      i += key.length;
    }
    while (i < end && /\s/.test(text[i])) i++;
    keys.push(key);
    if (text[i] === ':') {
      i++;
      while (i < end && text[i] !== ',') {
        if (text[i] === "'" || text[i] === '"' || text[i] === '`') i = skipString(text, i);
        else if (text[i] === '{' || text[i] === '(' || text[i] === '[') i = skipBalanced(text, i);
        else i++;
      }
    } else if (text[i] !== ',' && i < end) {
      return { error: 'a method in the arguments', keys };
    }
  }
  return { keys };
}

// The markers are whole lines, so the text of these two patterns (which sits inside a line of code) is never mistaken for one.
const PLAN_BEGIN_LINE = /^[ \t]*\/\/ ---- steps begin ----[ \t]*$/m;
const PLAN_END_LINE = /^[ \t]*\/\/ ---- steps end ----[ \t]*$/m;
const PLAN_HELPERS = ['ok', 'fails', 'refused', 'result'];
const NON_USER_ACTORS = new Set(['anon', 'service']);

/**
 * Reads the calls out of this file: between the two markers, every ok(), fails(), refused() and result() names its
 * actor, one function by a literal and, when it has arguments, a literal object. Anything else is reported as a
 * problem, so a call that is computed (and therefore cannot be compared with the SQL) cannot slip in.
 */
export function readPlan(source) {
  const begin = PLAN_BEGIN_LINE.exec(source);
  const end = PLAN_END_LINE.exec(source);
  if (!begin || !end || end.index < begin.index) return { calls: [], groups: [], problems: ['the plan markers are missing'] };
  const text = stripJsComments(source.slice(begin.index + begin[0].length, end.index));
  const calls = [];
  const problems = [];
  const groups = [];
  for (const g of text.matchAll(/\bgroup\(\s*'([^']+)'/g)) groups.push({ name: g[1], at: g.index });
  const re = new RegExp(`(?<![\\w$.])(${PLAN_HELPERS.join('|')})\\(`, 'g');
  let m;
  while ((m = re.exec(text))) {
    const at = m.index;
    const open = at + m[0].length - 1;
    const after = text.slice(open + 1, open + 400);
    const head = /^\s*([A-Za-z_$][\w$]*)\s*,\s*'([a-z0-9_]+)'\s*(,\s*\{|,\s*undefined|\)|,)?/.exec(after);
    if (!head) {
      problems.push(`${m[1]}( near "${after.slice(0, 40).replace(/\s+/g, ' ')}" does not start with an actor and a literal function name`);
      continue;
    }
    const call = { helper: m[1], actor: head[1], fn: head[2], args: [], group: '' };
    const tail = head[3] || '';
    if (/^,\s*\{/.test(tail)) {
      const brace = open + 1 + head[0].lastIndexOf('{');
      const read = literalKeys(text, brace);
      if (read.error) problems.push(`${call.fn}: ${read.error}`);
      call.args = read.keys;
    } else if (tail === ',') {
      problems.push(`${call.fn}: the arguments are not a literal object`);
    }
    for (const g of groups) if (g.at < at) call.group = g.name;
    calls.push(call);
  }
  return { calls, groups: groups.map(g => g.name), problems };
}

function readMigrations(dir) {
  const files = fs.readdirSync(dir).filter(f => /^\d{14}_pro_.*\.sql$/.test(f)).sort();
  const functions = new Map();
  const duplicates = [];
  const grants = new Map();
  const tables = new Map();
  let sqlAll = '';
  for (const f of files) {
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    sqlAll += `\n${sql}`;
    for (const fn of parseSqlFunctions(sql, f)) {
      if (functions.has(fn.name)) duplicates.push(fn.name);
      functions.set(fn.name, fn);
    }
    for (const [fn, roles] of parseSqlGrants(sql)) {
      if (!grants.has(fn)) grants.set(fn, new Set());
      for (const r of roles) grants.get(fn).add(r);
    }
  }
  // Tables come from the foundation and from the first schema (the nine legacy tables).
  for (const f of fs.readdirSync(dir).filter(x => /\.sql$/.test(x)).sort()) {
    if (!/^001_|_pro_foundation|_styling_recommendations_if_missing/.test(f)) continue;
    for (const [t, cols] of parseSqlTables(fs.readFileSync(path.join(dir, f), 'utf8'))) if (!tables.has(t)) tables.set(t, cols);
  }
  return { files, functions, duplicates, grants, tables, sqlAll };
}

/**
 * --dry-run. Reads this file and the migrations and compares them. Returns { findings: [{ ok, what }], plan }.
 */
export function dryRunReport(migrationsDir = DEFAULT_MIGRATIONS) {
  const source = fs.readFileSync(SELF, 'utf8');
  const plan = readPlan(source);
  const findings = [];
  const add = (ok, what) => findings.push({ ok: Boolean(ok), what });
  const mig = readMigrations(migrationsDir);

  const oddGroups = plan.groups.filter(g => /[\\"`]$/.test(g) || g.length < 8);
  if (oddGroups.length) plan.problems.push(`group names must be plain text without quotes: ${oddGroups.join(' | ')}`);
  add(plan.problems.length === 0, plan.problems.length === 0
    ? `${plan.calls.length} calls in ${plan.groups.length} groups were read from the plan`
    : `the plan has calls that cannot be read: ${plan.problems.join('; ')}`);
  add(mig.files.length > 0, `${mig.files.length} pro migration files read from ${path.relative(REPO, migrationsDir) || migrationsDir}`);
  add(mig.duplicates.length === 0, mig.duplicates.length === 0 ? 'no function is overloaded' : `overloaded or defined twice: ${[...new Set(mig.duplicates)].join(', ')}`);

  // Which functions an app user can execute, and which only the service role can.
  const grantedTo = role => [...mig.grants].filter(([, roles]) => roles.has(role)).map(([fn]) => fn).sort();
  const clientFns = Object.keys(CLIENT_PROBES).sort();
  const authenticated = grantedTo('authenticated');
  const missingClient = clientFns.filter(f => !authenticated.includes(f));
  // report_swap_content is the one existing function file 8 re-creates; its grant is repeated there and it is swap's, not pro's.
  const extraClient = authenticated.filter(f => !clientFns.includes(f) && f !== 'report_swap_content');
  add(missingClient.length === 0, missingClient.length === 0
    ? `all ${clientFns.length} client functions of 4.6 are granted to authenticated`
    : `not granted to authenticated (or not written yet): ${missingClient.join(', ')}`);
  add(extraClient.length === 0, extraClient.length === 0
    ? 'authenticated may execute nothing else'
    : `granted to authenticated but not in 4.6, so never called by this script: ${extraClient.join(', ')}`);
  const serviceFns = grantedTo('service_role');
  const missingService = Object.keys(SERVICE_ONLY_PROBES).filter(f => !serviceFns.includes(f));
  add(missingService.length === 0, missingService.length === 0
    ? `all ${Object.keys(SERVICE_ONLY_PROBES).length} service-role functions are granted to service_role`
    : `not granted to service_role (or not written yet): ${missingService.join(', ')}`);
  const openToUsers = Object.keys(SERVICE_ONLY_PROBES).filter(f => authenticated.includes(f) || (mig.grants.get(f) || new Set()).has('anon'));
  add(openToUsers.length === 0, openToUsers.length === 0
    ? 'no service-role function is granted to authenticated or anon'
    : `granted to app users: ${openToUsers.join(', ')}`);
  const helperProblems = Object.keys(HELPER_PROBES).filter(f => !mig.functions.has(f) || authenticated.includes(f));
  add(helperProblems.length === 0, helperProblems.length === 0
    ? `${Object.keys(HELPER_PROBES).length} internal helpers exist and none is granted to authenticated`
    : `internal helpers missing or open: ${helperProblems.join(', ')}`);

  // Every name this script sends exists, with the arguments it sends, and every required argument is sent.
  const problems = [];
  const checkArgs = (label, fn, args) => {
    const def = mig.functions.get(fn);
    if (!def) { problems.push(`${label}: ${fn} is not defined in the migrations`); return; }
    const declared = new Set(def.params.map(p => p.name));
    for (const a of args) {
      if (!a.startsWith('p_')) problems.push(`${label}: ${fn} gets an argument "${a}" without the p_ prefix`);
      else if (!declared.has(a)) problems.push(`${label}: ${fn} has no argument ${a} (it has ${[...declared].join(', ') || 'none'})`);
    }
    for (const p of def.params) if (!p.hasDefault && !args.includes(p.name)) problems.push(`${label}: ${fn} needs ${p.name} and the call does not send it`);
  };
  for (const c of plan.calls) checkArgs(`${c.actor} ${c.fn} (${c.group})`, c.fn, c.args);
  for (const [fn, args] of Object.entries({ ...CLIENT_PROBES, ...SERVICE_ONLY_PROBES, ...HELPER_PROBES })) checkArgs(`probe ${fn}`, fn, Object.keys(args));
  add(problems.length === 0, problems.length === 0 ? 'every function and argument name matches the SQL, and every required argument is sent' : problems.join('\n      '));

  // Who is allowed to be called as whom.
  const roleProblems = [];
  for (const c of plan.calls) {
    const roles = mig.grants.get(c.fn) || new Set();
    if (c.helper === 'refused') {
      const who = c.actor === 'anon' ? 'anon' : 'authenticated';
      if (roles.has(who)) roleProblems.push(`${c.actor} is expected to be refused ${c.fn}, which ${who} may execute`);
      continue;
    }
    if (!NON_USER_ACTORS.has(c.actor) && !roles.has('authenticated')) roleProblems.push(`${c.actor} calls ${c.fn}, which authenticated may not execute`);
    if (c.actor === 'service' && !roles.has('service_role')) roleProblems.push(`service calls ${c.fn}, which service_role may not execute`);
    if (c.actor === 'anon' && c.helper !== 'refused') roleProblems.push(`anon is expected to succeed at ${c.fn}`);
  }
  add(roleProblems.length === 0, roleProblems.length === 0 ? 'every call is made by someone who may execute it' : roleProblems.join('\n      '));

  // Coverage: every client function succeeds at least once for a signed-in person; every service-role function is called.
  const succeeded = new Set(plan.calls.filter(c => c.helper === 'ok' || c.helper === 'result').filter(c => !NON_USER_ACTORS.has(c.actor)).map(c => c.fn));
  const uncovered = clientFns.filter(f => !succeeded.has(f));
  add(uncovered.length === 0, uncovered.length === 0
    ? `all ${clientFns.length} client functions are called by a signed-in person`
    : `client functions this script never calls: ${uncovered.join(', ')}`);
  const serviceCalled = new Set(plan.calls.filter(c => c.actor === 'service').map(c => c.fn));
  const serviceUncovered = Object.keys(SERVICE_ONLY_PROBES).filter(f => !serviceCalled.has(f));
  add(serviceUncovered.length === 0, serviceUncovered.length === 0
    ? 'every service-role function is called with the service key'
    : `service-role functions this script never calls: ${serviceUncovered.join(', ')}`);

  // Table-returning functions: the row keys this script expects are the SQL's columns.
  const shapeProblems = [];
  for (const [key, keys] of Object.entries(SHAPES)) {
    const def = mig.functions.get(key.split(':')[0]);
    if (!def || !def.columns || key.includes(':')) continue;
    if (JSON.stringify([...def.columns].sort()) !== JSON.stringify([...keys].sort())) shapeProblems.push(`${key}: the SQL returns (${def.columns.join(', ')})`);
  }
  add(shapeProblems.length === 0, shapeProblems.length === 0 ? 'the row keys expected from table-returning functions are the SQL columns' : shapeProblems.join('\n      '));

  // Tables.
  const proNames = [...mig.tables.keys()].filter(t => /^pro_/.test(t)).sort();
  const listed = PRO_TABLES.map(t => t.name).sort();
  add(listed.length === 15 && JSON.stringify(proNames) === JSON.stringify(listed), JSON.stringify(proNames) === JSON.stringify(listed)
    ? `the ${listed.length} pro tables are the ones the foundation creates`
    : `pro tables differ: the migrations create ${proNames.join(', ')}; this script lists ${listed.join(', ')}`);
  const lockdownFile = fs.readdirSync(migrationsDir).find(f => /_pro_lockdown_legacy_tables\.sql$/.test(f));
  let lockdownList = [];
  if (lockdownFile) {
    const lockdown = stripSqlComments(fs.readFileSync(path.join(migrationsDir, lockdownFile), 'utf8'));
    const arr = /foreach\s+t\s+in\s+array\s+array\[([\s\S]*?)\]/i.exec(lockdown);
    if (arr) lockdownList = [...arr[1].matchAll(/'([a-z_]+)'/g)].map(x => x[1]).sort();
  }
  const legacyListed = LEGACY_TABLES.map(t => t.name).sort();
  add(legacyListed.length === 9 && JSON.stringify(lockdownList) === JSON.stringify(legacyListed), JSON.stringify(lockdownList) === JSON.stringify(legacyListed)
    ? `the ${legacyListed.length} legacy tables are the ones the lockdown file revokes`
    : `legacy tables differ: the lockdown file lists ${lockdownList.join(', ') || 'nothing'}; this script lists ${legacyListed.join(', ')}`);
  const keyProblems = [];
  for (const t of [...PRO_TABLES, ...LEGACY_TABLES]) {
    const cols = mig.tables.get(t.name);
    if (!cols) keyProblems.push(`${t.name}: no create table found`);
    else if (!cols.includes(t.key)) keyProblems.push(`${t.name}: no column ${t.key} (it has ${cols.join(', ')})`);
  }
  add(keyProblems.length === 0, keyProblems.length === 0 ? 'every table has the key column its write checks filter on' : keyProblems.join('\n      '));

  // Constants.
  const seeds = Object.fromEntries([...mig.sqlAll.matchAll(/\('([a-z_]+_version)',\s*'"([^"]+)"'::jsonb\)/g)].map(x => [x[1], x[2]]));
  const versionProblems = [];
  for (const [k, v] of [['stylist_terms_version', STYLIST_TERMS_VERSION], ['client_terms_version', CLIENT_TERMS_VERSION], ['share_text_version', SHARE_TEXT_VERSION]]) {
    if (seeds[k] !== v) versionProblems.push(`${k}: the migrations seed ${seeds[k] ?? 'nothing'}, this script sends ${v}`);
  }
  add(versionProblems.length === 0, versionProblems.length === 0 ? 'the terms and share-text versions equal the seeded ones' : versionProblems.join('\n      '));
  add(/\('pro_enabled',\s*'false'::jsonb\)/.test(mig.sqlAll), 'pro_enabled is seeded false, so a push turns nothing on');

  const byGroup = {};
  for (const c of plan.calls) byGroup[c.group || '(none)'] = (byGroup[c.group || '(none)'] || 0) + 1;
  return { findings, plan: { groups: plan.groups, calls: plan.calls, byGroup }, migrations: mig.files };
}

function dryRun(opts) {
  const dir = opts.migrations ? path.resolve(opts.migrations) : DEFAULT_MIGRATIONS;
  let report;
  try {
    report = dryRunReport(dir);
  } catch (e) {
    console.error(`dry run could not read ${dir}: ${e.message}`);
    return 2;
  }
  const failed = report.findings.filter(f => !f.ok);
  if (opts.json) {
    console.log(JSON.stringify({ clean: failed.length === 0, findings: report.findings, plan: report.plan, migrations: report.migrations }, null, 2));
    return failed.length === 0 ? 0 : 1;
  }
  console.log('pro-api-checks --dry-run (no network call)');
  console.log(`plan: ${report.plan.calls.length} calls in ${report.plan.groups.length} groups (calls named in the plan; a group may also use the table API and the probe lists)`);
  for (const g of report.plan.groups) console.log(`  ${String(report.plan.byGroup[g] || 0).padStart(3)}  ${g}`);
  console.log(`probes: ${Object.keys(CLIENT_PROBES).length} client functions as anon; ${Object.keys(SERVICE_ONLY_PROBES).length} service-role and ${Object.keys(HELPER_PROBES).length} internal functions as a signed-in person; ${PRO_TABLES.length + LEGACY_TABLES.length} tables x 4 requests x 2 roles`);
  console.log('checks:');
  for (const f of report.findings) console.log(`  ${f.ok ? 'ok  ' : 'FAIL'} ${f.what}`);
  console.log(failed.length === 0 ? 'dry run clean' : `dry run found ${failed.length} problem(s)`);
  return failed.length === 0 ? 0 : 1;
}

// ─── The run ─────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = { dryRun: false, json: false, verbose: false, keep: false, requirePhotoFunction: false, migrations: '', help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--verbose') opts.verbose = true;
    else if (a === '--keep') opts.keep = true;
    else if (a === '--require-photo-function') opts.requirePhotoFunction = true;
    else if (a === '--migrations') opts.migrations = argv[++i] || '';
    else if (a === '--help' || a === '-h') opts.help = true;
    else { console.error(`unknown option: ${a}`); opts.bad = true; }
  }
  return opts;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const uuid = () => crypto.randomUUID();
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const randomCode = () => Array.from(crypto.randomBytes(10), b => CROCKFORD[b % 32]).join('');
const daysFromNow = n => new Date(Date.now() + n * 86400e3);
const RUN = crypto.randomBytes(3).toString('hex');

const state = {
  url: '', anon: '', service: '', opts: {}, users: [], calls: 0, initial: null, termsAdded: [], uploaded: [],
  photoFunction: 'unknown', cleaning: false, interrupted: false,
};
const report = { passed: 0, failed: [], skipped: [] };
let currentGroup = '';

class Abort extends Error {}      // a step failed and is already recorded; the group stops
class Fatal extends Error {}      // nothing after this means anything

const errText = err => (err ? `${err.message || ''}${err.details ? ` [${err.details}]` : ''}${err.hint ? ` {${err.hint}}` : ''}` : '');
function check(label, cond, detail = '') {
  if (state.interrupted) return Boolean(cond);        // the run is being wound up: what the rest of it says means nothing
  if (cond) {
    report.passed++;
    if (state.opts.verbose) console.log(`   ok   ${label}`);
    return true;
  }
  report.failed.push(`${currentGroup}: ${label}`);
  console.log(`   FAIL ${label}${detail ? ` -- ${detail}` : ''}`);
  return false;
}
function skipped(label, why) {
  if (state.interrupted) return;
  report.skipped.push(`${label} (${why})`);
  console.log(`   skip ${label}: ${why}`);
}
async function group(name, fn) {
  if (state.interrupted) return;
  currentGroup = name;
  console.log(`== ${name}`);
  try {
    await fn();
  } catch (e) {
    if (state.interrupted) return;
    if (e instanceof Fatal) throw e;
    if (e instanceof Abort) console.log('   (the rest of this group is skipped)');
    else {
      report.failed.push(`${name}: unexpected error`);
      console.log(`   FAIL unexpected error -- ${e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e)}`);
    }
  }
}

// ─── HTTP ────────────────────────────────────────────────────────────────────

/** A person (or anon, or the service role). Tokens are filled in by signUp(). */
const shell = (name, kind = 'user') => ({ name, kind, id: '', email: '', password: '', token: '' });
const anon = shell('anon', 'anon');
const service = shell('service', 'service');

// A key printed by the CLI is a JWT and goes in both headers. A key of the newer opaque kind is not a token: it goes in apikey only.
const isJwt = key => /^[\w-]+\.[\w-]+\.[\w-]+$/.test(key);
function headersFor(actor, extra = {}) {
  if (actor.kind === 'anon') return isJwt(state.anon) ? { apikey: state.anon, Authorization: `Bearer ${state.anon}`, ...extra } : { apikey: state.anon, ...extra };
  if (actor.kind === 'service') return isJwt(state.service) ? { apikey: state.service, Authorization: `Bearer ${state.service}`, ...extra } : { apikey: state.service, ...extra };
  return { apikey: state.anon, Authorization: `Bearer ${actor.token}`, ...extra };
}

async function send(method, pathname, { actor = service, query = '', body, bytes, headers = {}, timeout = 45000 } = {}) {
  const url = `${state.url}${pathname}${query ? `?${query}` : ''}`;
  const init = { method, headers: headersFor(actor, headers), signal: AbortSignal.timeout(timeout) };
  for (const k of Object.keys(init.headers)) if (init.headers[k] === null) delete init.headers[k];   // null: send no such header
  if (bytes !== undefined) init.body = bytes;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers['Content-Type'] = 'application/json';
  }
  let res;
  try {
    res = await fetch(url, init);
  } catch (e) {
    return { status: 0, body: null, bytes: Buffer.alloc(0), headers: new Headers(), err: { message: `network: ${e && e.message}` } };
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const type = res.headers.get('content-type') || '';
  let parsed = null;
  if (buf.length && /json/i.test(type)) {
    try { parsed = JSON.parse(buf.toString('utf8')); } catch { parsed = null; }
  }
  const out = { status: res.status, body: parsed, bytes: buf, headers: res.headers, type };
  if (res.status >= 400) {
    out.err = parsed && typeof parsed === 'object' ? parsed : { message: buf.toString('utf8').slice(0, 300) };
  }
  return out;
}

/** One RPC, as PostgREST sees it: named arguments in the body. Nothing is asserted here. */
async function rpcRaw(actor, fn, args) {
  state.calls++;
  return send('POST', `/rest/v1/rpc/${fn}`, { actor, body: args === undefined ? {} : args });
}
const isRefusal = res => res.status === 401 || res.status === 403 || res.err?.code === '42501' || res.err?.code === 'PGRST205';

/** Table writes through the API layer. A PATCH or DELETE without a filter is refused here, before it is sent. */
async function rest(method, table, { actor = service, query = '', body, prefer = 'return=representation' } = {}) {
  if ((method === 'PATCH' || method === 'DELETE') && !query) throw new Error(`${method} ${table} without a filter`);
  return send(method, `/rest/v1/${table}`, { actor, query, body, headers: { Prefer: prefer } });
}
const bareWrite = (method, table, body) => send(method, `/rest/v1/${table}`, { actor: service, body, headers: { Prefer: 'return=minimal' } });
const rowsOf = res => (Array.isArray(res.body) ? res.body : []);

// ─── Assertions ──────────────────────────────────────────────────────────────

function expectKeys(label, value, keys) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return check(`${label}: answers an object`, false, `got ${JSON.stringify(value)?.slice(0, 80)}`);
  const got = Object.keys(value).sort();
  const want = [...keys].sort();
  return check(`${label}: keys`, JSON.stringify(got) === JSON.stringify(want),
    `extra ${got.filter(k => !want.includes(k)).join(',') || '-'}, missing ${want.filter(k => !got.includes(k)).join(',') || '-'}`);
}

/** What a response must never carry: an account id or email of anyone in this run, a storage path, a private column. */
export function findLeaks(body, { ids = [], mails = [], allowPaths = false } = {}) {
  const found = new Set();
  const walk = (v, where) => {
    if (v === null || v === undefined) return;
    if (Array.isArray(v)) { for (const x of v) walk(x, where); return; }
    if (typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        const norm = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        const present = x !== null && x !== undefined && x !== '';
        if (present && FORBIDDEN_KEYS.has(norm)) found.add(`the key ${k}`);
        if (present && PATH_KEYS.has(norm) && !allowPaths) found.add(`the key ${k} (a photo path)`);
        walk(x, k);
      }
      return;
    }
    if (typeof v === 'string') {
      const low = v.toLowerCase();
      const isPath = PATH_SHAPE.test(v);
      for (const id of ids) if (low.includes(id) && !(allowPaths && isPath)) found.add(`an account id in ${where || 'the value'}`);
      for (const m of mails) if (low.includes(m)) found.add(`an email in ${where || 'the value'}`);
      if (isPath && !allowPaths) found.add(`a storage path in ${where || 'the value'}`);
    }
  };
  walk(body, '');
  return [...found];
}
const leaksIn = (body, { allowPaths = false } = {}) => findLeaks(body, {
  ids: state.users.map(u => u.id.toLowerCase()).filter(Boolean),
  mails: state.users.map(u => u.email.toLowerCase()).filter(Boolean),
  allowPaths,
});

/** The answer must be a success; keys are checked against SHAPES (opts.shape names another shape), and the answer is scanned for leaks. */
async function ok(actor, fn, args, opts = {}) {
  const res = await rpcRaw(actor, fn, args);
  const label = `${actor.name}: ${fn}${opts.label ? ` (${opts.label})` : ''}`;
  if (res.status < 200 || res.status >= 300) {
    check(label, false, `HTTP ${res.status} ${errText(res.err)}`);
    throw new Abort(label);
  }
  check(label, true);
  const shape = opts.shape === false ? null : SHAPES[opts.shape || fn];
  if (shape && res.body !== null) {
    if (Array.isArray(res.body)) {
      const want = JSON.stringify([...shape].sort());
      const odd = res.body.find(row => JSON.stringify(Object.keys(row ?? {}).sort()) !== want);
      if (res.body.length) check(`${label}: every row has the keys of ${opts.shape || fn}`, odd === undefined, `one row has ${Object.keys(odd ?? {}).join(',')}`);
    } else expectKeys(label, res.body, shape);
  }
  if (actor.kind === 'user') {
    const leaks = leaksIn(res.body, { allowPaths: Boolean(opts.allowPaths) });
    if (leaks.length) check(`${label}: nothing private in the answer`, false, leaks.join('; '));
  }
  return res.body;
}

/** The call must fail with this message (and detail, hint) of 4.4. */
async function fails(actor, fn, args, want, opts = {}) {
  const w = typeof want === 'string' ? { message: want } : want;
  const res = await rpcRaw(actor, fn, args);
  const label = `${actor.name}: ${fn} fails with ${w.message}${w.detail ? ` (${w.detail})` : ''}${opts.label ? ` [${opts.label}]` : ''}`;
  if (res.status < 400) { check(label, false, `it succeeded (HTTP ${res.status})`); return null; }
  const e = res.err || {};
  const same = w.contains ? String(e.message || '').includes(w.contains) : e.message === w.message;
  const good = same && (w.detail === undefined || e.details === w.detail) && (w.hint === undefined || e.hint === w.hint);
  check(label, good, `HTTP ${res.status} ${errText(e)}`);
  return e;
}

/** The call must be turned away for lack of privilege (not for a missing function: that would be a different failure). */
async function refused(actor, fn, args) {
  const res = await rpcRaw(actor, fn, args);
  check(`${actor.name} is refused ${fn}`, res.status >= 400 && res.status !== 404 && isRefusal(res), `HTTP ${res.status} ${errText(res.err)}`);
  return res;
}

/** The raw answer, for a check that is not "it worked" or "it failed with X" (the two invite lookups answer failures as results). */
async function result(actor, fn, args, opts = {}) {
  const res = await rpcRaw(actor, fn, args);
  if (res.status >= 200 && res.status < 300 && actor.kind === 'user') {
    const leaks = leaksIn(res.body, { allowPaths: Boolean(opts.allowPaths) });
    if (leaks.length) check(`${actor.name}: ${fn}: nothing private in the answer`, false, leaks.join('; '));
  }
  return res;
}

async function alignToWindow(seconds, needSeconds) {
  const into = (Date.now() / 1000) % seconds;
  if (seconds - into < needSeconds) {
    console.log(`   (waiting ${Math.ceil(seconds - into + 1)}s for a fresh ${seconds}s counter window)`);
    await sleep((seconds - into + 1) * 1000);
  }
}

// ─── Accounts, settings and fixtures ─────────────────────────────────────────

async function signUp(actor) {
  actor.email = `pro-api-${RUN}-${actor.name}@example.test`;
  actor.password = `Pw-${crypto.randomBytes(9).toString('base64url')}`;
  const made = await send('POST', '/auth/v1/admin/users', {
    actor: service,
    body: { email: actor.email, password: actor.password, email_confirm: true, user_metadata: { name: actor.name } },
  });
  if (made.status >= 300 || !made.body?.id) throw new Fatal(`could not create the fixture account ${actor.name}: HTTP ${made.status} ${errText(made.err)}`);
  actor.id = made.body.id;
  state.users.push(actor);
  const tok = await send('POST', '/auth/v1/token', { actor: anon, query: 'grant_type=password', body: { email: actor.email, password: actor.password } });
  if (tok.status >= 300 || !tok.body?.access_token) throw new Fatal(`could not sign in ${actor.name}: HTTP ${tok.status} ${errText(tok.err)}`);
  actor.token = tok.body.access_token;
  return actor;
}

async function readConfig() {
  const res = await rest('GET', 'pro_config', { query: 'select=key,value' });
  const cfg = Object.fromEntries(rowsOf(res).map(r => [r.key, r.value]));
  if (res.status !== 200 || !('pro_enabled' in cfg)) throw new Fatal(`cannot read pro_config (HTTP ${res.status}); are the pro migrations applied?`);
  return cfg;
}
async function setConfig(key, value) {
  const res = await rest('PATCH', 'pro_config', { query: `key=eq.${key}`, body: { value } });
  if (res.status >= 300 || rowsOf(res).length !== 1) throw new Fatal(`could not set ${key}: HTTP ${res.status} ${errText(res.err)}`);
}
/** The switch, set the way the owner sets it. Used by the clean-up as well as by the plan. */
async function setSwitch(on) {
  const res = await rpcRaw(service, 'pro_set_enabled', { p_on: on });
  return res.status >= 200 && res.status < 300;
}
async function countContentTerms() {
  const res = await rest('GET', 'swap_blocked_terms', { query: 'select=term&kind=eq.content', prefer: 'count=exact' });
  return rowsOf(res).length;
}
async function topUpTerms(n) {
  const rows = Array.from({ length: n }, (_, i) => ({ term: `apicheck${RUN}x${i}`, kind: 'content' }));
  const res = await rest('POST', 'swap_blocked_terms', { body: rows });
  if (res.status >= 300) throw new Fatal(`could not load content terms: HTTP ${res.status} ${errText(res.err)}`);
  state.termsAdded.push(...rows.map(r => r.term));
}

const photoUrl = (owner, file) => `${state.url}/storage/v1/object/public/wardrobe-images/${owner.id}/${file}`;
async function upload(owner, file, bytes, type) {
  const objectPath = `${owner.id}/${file}`;
  const res = await send('POST', `/storage/v1/object/wardrobe-images/${objectPath}`, {
    actor: service, bytes, headers: { 'Content-Type': type, 'x-upsert': 'true' },
  });
  if (res.status >= 300) throw new Fatal(`could not store the test photo: HTTP ${res.status} ${errText(res.err)}`);
  state.uploaded.push(objectPath);
}
async function ensureBucket() {
  const have = await send('GET', '/storage/v1/bucket/wardrobe-images', { actor: service });
  if (have.status === 200) return;
  const made = await send('POST', '/storage/v1/bucket', { actor: service, body: { id: 'wardrobe-images', name: 'wardrobe-images', public: false } });
  if (made.status >= 300) throw new Fatal(`wardrobe-images does not exist and could not be created: HTTP ${made.status} ${errText(made.err)}`);
}
async function addItems(owner, items) {
  // One request per row: a bulk insert needs every object to carry the same keys (PostgREST answers 400 "All object
  // keys must match"), and the closet rows differ (a photo on some, none on others).
  const ids = {};
  for (const item of items) {
    const res = await rest('POST', 'clothing_items', { body: { user_id: owner.id, category: 'tops', ...item } });
    if (res.status >= 300) throw new Fatal(`could not add closet rows for ${owner.name}: HTTP ${res.status} ${errText(res.err)}`);
    for (const r of rowsOf(res)) ids[r.name] = r.id;
  }
  return ids;
}

/** The photo function. A GET the way the app makes it. */
const photoRequest = (actor, c, i, opts = {}) => send('GET', '/functions/v1/pro-photo', {
  actor: opts.noToken ? anon : actor,
  query: opts.raw ?? `c=${c}&i=${i}`,
  headers: opts.noToken ? { Authorization: null } : {},
});

async function cleanup() {
  if (state.cleaning) return;                          // an interrupt and the end of the run can both ask
  const opts = state.opts;
  state.cleaning = true;
  currentGroup = 'clean-up';
  console.log('== clean-up');
  if (state.initial) {
    // Each setting on its own: one that cannot be put back must not leave the others changed.
    for (const key of ['min_account_age_hours', 'client_terms_version', 'stylist_terms_version', 'share_text_version']) {
      try {
        await setConfig(key, state.initial[key]);
      } catch (e) {
        console.log(`   FAIL could not put ${key} back: ${e.message}`);
        report.failed.push(`clean-up: ${key}`);
      }
    }
    const wasOn = state.initial.pro_enabled === true;
    check(`the server switch is put back (${wasOn ? 'it was on' : 'it was off'})`, await setSwitch(wasOn));
    console.log('   settings put back');
  }
  if (state.termsAdded.length) {
    const res = await rest('DELETE', 'swap_blocked_terms', { query: `term=in.(${state.termsAdded.join(',')})`, prefer: 'return=minimal' });
    console.log(`   ${state.termsAdded.length} content terms removed (HTTP ${res.status})`);
  }
  if (opts.keep) {
    console.log(`   --keep: ${state.users.length} accounts and their rows are left in place (emails pro-api-${RUN}-*@example.test)`);
    return;
  }
  if (state.uploaded.length) {
    await send('DELETE', '/storage/v1/object/wardrobe-images', { actor: service, body: { prefixes: state.uploaded } });
  }
  let removed = 0;
  for (const u of state.users) {
    if (!u.id) continue;
    const res = await send('DELETE', `/auth/v1/admin/users/${u.id}`, { actor: service });
    if (res.status < 300 || res.status === 404) removed++;
    else console.log(`   could not remove ${u.name}: HTTP ${res.status}`);
  }
  console.log(`   ${removed} of ${state.users.length} fixture accounts removed (their rows go with them)`);
  // Nothing of the run may remain: the members table is where every account that accepted a text is recorded.
  const ids = state.users.map(u => u.id).filter(Boolean);
  if (ids.length) {
    const left = await rest('GET', 'pro_members', { query: `select=user_id&user_id=in.(${ids.join(',')})` });
    check('no fixture row is left in pro_members', rowsOf(left).length === 0, `${rowsOf(left).length} left`);
  }
}

// ─── The checks ──────────────────────────────────────────────────────────────

const near = (iso, when, tolerance) => Math.abs(new Date(iso).getTime() - new Date(when).getTime()) <= tolerance;
const probeRefused = async (actor, fn, args) => {
  const res = await rpcRaw(actor, fn, args);
  check(`${actor.name} is refused ${fn}`, res.status >= 400 && res.status !== 404 && isRefusal(res), `HTTP ${res.status} ${errText(res.err)}`);
};
const deleteAccount = async actor => {
  const res = await rpcRaw(actor, 'delete_user_account', {});
  return check(`${actor.name}: delete_user_account through the API`, res.status >= 200 && res.status < 300, `HTTP ${res.status} ${errText(res.err)}`);
};
// A day and hour in the future, in UTC: a session is proposed for it.
const inDays = (days, hour = 10, minute = 0) => {
  const d = new Date(Date.now() + days * 86400e3);
  d.setUTCHours(hour, minute, 0, 0);
  return d.toISOString();
};
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

async function runChecks(opts) {
  const ann = shell('ann');
  const bea = shell('bea');
  const cat = shell('cat');
  const eve = shell('eve');
  const dee = shell('dee');
  const gus = shell('gus');
  const xan = shell('xan');
  const yui = shell('yui');
  const zed = shell('zed');
  const wyn = shell('wyn');
  const S = {};                                    // values carried from one group to the next

  // ---- steps begin ----

  await group('canary: the API layer refuses a bare UPDATE and a bare DELETE', async () => {
    const upd = await bareWrite('PATCH', 'pro_meta', { last_janitor_at: null });
    const del = await bareWrite('DELETE', 'pro_rate_counters');
    const refusedBare = r => r.status === 400 && /requires a WHERE clause/i.test(JSON.stringify(r.body ?? ''));
    if (upd.status < 300 || del.status < 300) {
      throw new Fatal(`the guard against writes without a WHERE is not active here (a bare ${upd.status < 300 ? 'UPDATE' : 'DELETE'} succeeded), so this run would prove nothing`);
    }
    if (!refusedBare(upd) || !refusedBare(del)) {
      throw new Fatal(`the canary is inconclusive (UPDATE: HTTP ${upd.status} ${errText(upd.err)}; DELETE: HTTP ${del.status} ${errText(del.err)}). Is the service key right?`);
    }
    check('a bare UPDATE is refused with "UPDATE requires a WHERE clause"', true);
    check('a bare DELETE is refused with "DELETE requires a WHERE clause"', true);
  });

  await group('setup: accounts, switches and fixture closets', async () => {
    for (const a of [ann, bea, cat, eve]) await signUp(a);
    state.initial = await readConfig();
    const terms = await countContentTerms();
    if (terms < 50) {
      await fails(service, 'pro_set_enabled', { p_on: true }, { message: 'load at least 50 content terms into swap_blocked_terms first' });
      await topUpTerms(50 - terms);
    } else {
      skipped('pro_set_enabled(true) refused below 50 content terms', `${terms} terms are already loaded on this stack`);
    }
    await ok(service, 'pro_set_enabled', { p_on: true });
    await setConfig('min_account_age_hours', 0);
    const cfg = await readConfig();
    check('the server switch is on and fixture accounts may create a code', cfg.pro_enabled === true && cfg.min_account_age_hours === 0);
    check('the server holds the versions of this build', cfg.stylist_terms_version === STYLIST_TERMS_VERSION && cfg.client_terms_version === CLIENT_TERMS_VERSION && cfg.share_text_version === SHARE_TEXT_VERSION,
      `${cfg.stylist_terms_version} ${cfg.client_terms_version} ${cfg.share_text_version}`);
    await ensureBucket();
    S.bea = await addItems(bea, [
      { name: 'Blue blazer', category: 'outerwear', brand: 'Zara', color: 'blue', cost: 120, notes: 'private note about my ex', favorite: true, retailer: 'Zara store', wear_count: 7, user_image: photoUrl(bea, 'test.jpg') },
      { name: 'Red scarf', category: 'accessories', color: 'red', user_image: photoUrl(bea, 'test.png') },
      { name: 'Linen shirt', category: 'tops', color: 'white', user_image: photoUrl(bea, 'third.jpg') },
      { name: 'Retailer-only top', category: 'tops', retailer_image: 'https://shop.example.test/img/retailer.jpg' },
      { name: 'Wishlist coat', category: 'outerwear', is_wishlist: true, user_image: photoUrl(bea, 'wish.jpg') },
    ]);
    S.cat = await addItems(cat, [{ name: 'Cat jacket', category: 'outerwear', user_image: photoUrl(cat, 'test.jpg') }]);
    Object.assign(S, { blazer: S.bea['Blue blazer'], scarf: S.bea['Red scarf'], shirt: S.bea['Linen shirt'], retail: S.bea['Retailer-only top'], wish: S.bea['Wishlist coat'], jacket: S.cat['Cat jacket'] });
    check('the fixture pieces were stored', Object.values(S).filter(v => typeof v === 'string').length >= 6);
    await upload(bea, 'test.jpg', buildGeotaggedJpeg(), 'image/jpeg');
    await upload(bea, 'test.png', buildTextPng(), 'image/png');
    await upload(cat, 'test.jpg', buildGeotaggedJpeg(), 'image/jpeg');
  });

  await group('every pro table and every legacy table is closed to anon and to a signed-in person', async () => {
    let probed = 0;
    for (const t of [...PRO_TABLES, ...LEGACY_TABLES]) {
      const exists = await rest('GET', t.name, { query: 'select=*&limit=1' });
      if (!check(`${t.name} exists (the service role reads it)`, exists.status === 200, `HTTP ${exists.status} ${errText(exists.err)}`)) continue;
      probed++;
      const keyValue = 'json' in t ? t.json : t.value;
      for (const who of [anon, ann]) {
        const tries = [
          ['GET', 'select=*&limit=1', undefined],
          ['POST', '', {}],
          ['PATCH', `${t.key}=eq.${t.value}`, { [t.key]: keyValue }],
          ['DELETE', `${t.key}=eq.${t.value}`, undefined],
        ];
        for (const [method, query, body] of tries) {
          const res = await rest(method, t.name, { actor: who, query, body, prefer: 'return=minimal' });
          check(`${who.name} cannot ${method} ${t.name}`, isRefusal(res), `HTTP ${res.status} ${errText(res.err)}`);
        }
      }
    }
    check('24 tables were probed (15 pro and 9 legacy)', probed === 24 && PRO_TABLES.length === 15 && LEGACY_TABLES.length === 9, `${probed} probed`);
  });

  await group('the photo bucket is private, and a stranger cannot read a photo', async () => {
    const bucket = await send('GET', '/storage/v1/bucket/wardrobe-images', { actor: service });
    check('wardrobe-images is not a public bucket', bucket.status === 200 && bucket.body?.public === false, `HTTP ${bucket.status} public=${bucket.body?.public}`);
    const open = await send('GET', `/storage/v1/object/public/wardrobe-images/${bea.id}/test.jpg`, { actor: anon });
    check('the public address of an existing photo does not serve it', open.status !== 200, `HTTP ${open.status}`);
    const stranger = await send('GET', `/storage/v1/object/authenticated/wardrobe-images/${bea.id}/test.jpg`, { actor: eve });
    check('a signed-in person who is neither the owner nor a friend is refused', stranger.status !== 200, `HTTP ${stranger.status}`);
    const dbUrl = process.env.PRO_API_DB_URL;
    if (!dbUrl) {
      skipped('the policies on storage.objects that name wardrobe-images', 'PRO_API_DB_URL is not set (release run on a branch that mirrors production)');
    } else {
      const target = (() => { try { return new URL(dbUrl); } catch { return null; } })();
      const allowed = target && (LOCAL_HOSTS.has(target.hostname) || (process.env.PRO_API_ALLOW_REMOTE && target.hostname === process.env.PRO_API_ALLOW_REMOTE));
      if (!allowed) {
        check('PRO_API_DB_URL points at the target', false, 'it is not a local address and not PRO_API_ALLOW_REMOTE');
      } else {
        const sql = "select policyname || '|' || cmd || '|' || array_to_string(roles, ',') || '|' || (coalesce(qual, '') ilike '%auth.uid()%')::text from pg_policies where schemaname = 'storage' and tablename = 'objects' and (coalesce(qual, '') ilike '%wardrobe-images%' or coalesce(with_check, '') ilike '%wardrobe-images%') order by 1";
        const r = spawnSync('psql', [dbUrl, '-X', '-A', '-t', '-c', sql], { encoding: 'utf8' });
        if (r.status !== 0) {
          check('the policies on storage.objects could be listed', false, (r.stderr || '').slice(0, 200));
        } else {
          const policies = r.stdout.split('\n').filter(Boolean).map(l => l.split('|'));
          console.log(`   policies naming wardrobe-images: ${policies.map(p => `${p[0]} (${p[1]})`).join('; ') || 'none'}`);
          const friends = 'friends can read wardrobe images';
          const reads = policies.filter(p => (p[1] === 'SELECT' || p[1] === 'ALL') && p[0] !== friends);
          check('no policy lets anon or the public read the bucket', policies.every(p => !/\b(anon|public)\b/.test(p[2])), policies.map(p => `${p[0]}:${p[2]}`).join(' '));
          check('apart from the friends policy, at most one policy reads the bucket and it is about the owner', reads.length <= 1 && reads.every(p => p[3] === 'true'), reads.map(p => p[0]).join(', '));
        }
      }
    }
  });

  await group('anon is refused every client function; a signed-in person is refused the service-role ones', async () => {
    let n = 0;
    for (const [fn, args] of Object.entries(CLIENT_PROBES)) { await probeRefused(anon, fn, args); n++; }
    check(`anon was refused all ${Object.keys(CLIENT_PROBES).length} client functions`, n === Object.keys(CLIENT_PROBES).length && n === 36, `${n}`);
    for (const [fn, args] of Object.entries(SERVICE_ONLY_PROBES)) {
      await probeRefused(ann, fn, args);
      await probeRefused(anon, fn, args);
    }
    for (const [fn, args] of Object.entries(HELPER_PROBES)) await probeRefused(ann, fn, args);
  });

  await group('failed invite lookups are counted, so the brute-force limit is real', async () => {
    await alignToWindow(3600, 40);
    for (let i = 1; i <= 12; i++) {
      const res = await result(eve, 'preview_pro_invite', { p_code: randomCode() });
      if (i <= 10) {
        check(`lookup ${i} of an unknown code answers a result, not an error`, res.status === 200 && res.body?.valid === false && res.body?.error === 'invite_invalid', `HTTP ${res.status} ${JSON.stringify(res.body)}`);
        if (i === 1) expectKeys('the invalid preview result', res.body, SHAPES['preview_pro_invite:invalid']);
      } else {
        check(`lookup ${i} is refused: pro_rate_limited (invite_lookup_hour)`, res.status >= 400 && res.err?.message === 'pro_rate_limited' && res.err?.details === 'invite_lookup_hour', `HTTP ${res.status} ${errText(res.err)}`);
      }
    }
    const counter = await rest('GET', 'pro_rate_counters', { query: `select=n&user_id=eq.${eve.id}&bucket=eq.invite_lookup_hour` });
    const total = rowsOf(counter).reduce((sum, r) => sum + r.n, 0);
    check('the counter holds the ten lookups that answered (a raise would have rolled them back to zero)', total === 10, `n=${total}`);
  });

  await group('terms and the stylist profile', async () => {
    const st0 = await ok(ann, 'get_pro_status');
    check('a new account has no professional role', st0.proEnabled === true && st0.adultConfirmed === false && st0.suspended === false && st0.stylist === null && st0.client.termsCurrent === false);
    check('the server states the versions of this build', st0.versions.stylistTerms === STYLIST_TERMS_VERSION && st0.versions.clientTerms === CLIENT_TERMS_VERSION && st0.versions.shareText === SHARE_TEXT_VERSION);
    check('the badge starts at zero', (await ok(ann, 'get_pro_badge')) === 0);
    await fails(ann, 'save_stylist_profile', { p_display_name: 'Ann Styles', p_services: ['outfit_styling'] }, 'adult_required');
    await fails(ann, 'accept_pro_terms', { p_role: 'stylist', p_version: '2026-09', p_adult: true }, 'terms_version_mismatch');
    await fails(ann, 'accept_pro_terms', { p_role: 'stylist', p_version: STYLIST_TERMS_VERSION, p_adult: false }, 'adult_required');
    await fails(ann, 'accept_pro_terms', { p_role: 'seller', p_version: STYLIST_TERMS_VERSION, p_adult: true }, { message: 'invalid_request', detail: 'role' });
    await ok(ann, 'accept_pro_terms', { p_role: 'stylist', p_version: STYLIST_TERMS_VERSION, p_adult: true });
    check('there is no profile yet', (await ok(ann, 'get_my_stylist_profile')) === null);
    await fails(ann, 'save_stylist_profile', { p_display_name: 'Ann Styles', p_bio: 'Visit www.annstyles.com for more', p_services: ['outfit_styling'] }, { message: 'text_not_allowed', detail: 'bio', hint: 'contact' });
    await fails(ann, 'save_stylist_profile', { p_display_name: 'Official Support', p_services: ['outfit_styling'] }, { message: 'text_not_allowed', detail: 'display_name', hint: 'name' });
    await fails(ann, 'save_stylist_profile', { p_display_name: 'Ann Styles', p_services: ['astrology'] }, { message: 'invalid_profile', detail: 'services' });
    await fails(ann, 'save_stylist_profile', { p_display_name: 'Ann Styles', p_services: ['outfit_styling'], p_languages: ['english'] }, { message: 'invalid_profile', detail: 'languages' });
    const saved = await ok(ann, 'save_stylist_profile', {
      p_display_name: 'Ann Styles', p_headline: 'Wardrobe edits and capsule closets', p_bio: 'Ten years of styling people for work and for weekends.',
      p_services: ['wardrobe_audit', 'outfit_styling', 'virtual_sessions'], p_languages: ['en', 'fr'], p_rates_text: 'From $80 per session', p_accepting: true,
    });
    check('the saved profile reads back, on probation, accepting, not held', saved.displayName === 'Ann Styles' && saved.approved === false && saved.accepting === true && saved.invitesHeld === false && saved.languages.join() === 'en,fr');
    const mine = await ok(ann, 'get_my_stylist_profile');
    check('get_my_stylist_profile says the same', mine.displayName === saved.displayName && mine.ratesText === 'From $80 per session');
    const st1 = await ok(ann, 'get_pro_status');
    check('status shows the stylist on probation (3 clients, 1 live code)', st1.stylist?.termsCurrent === true && st1.stylist.approved === false && st1.stylist.clientLimit === 3 && st1.stylist.inviteLimit === 1 && st1.stylist.activeClients === 0 && st1.stylist.liveInvites === 0);
  });

  await group('invite codes: create, retry, cap, list, revoke, preview', async () => {
    S.ref1 = uuid();
    const inv1 = await ok(ann, 'create_pro_invite', { p_client_ref: S.ref1, p_label: 'for Bea' });
    check('the code is ten Crockford characters', /^[0-9A-HJKMNP-TV-Z]{10}$/.test(inv1.code), inv1.code);
    check('a new code is live, not connected, and lasts seven days', inv1.status === 'live' && inv1.connected === false && near(inv1.expiresAt, daysFromNow(7), 90 * 60e3));
    const again = await ok(ann, 'create_pro_invite', { p_client_ref: S.ref1 });
    check('the same client_ref returns the same code (a retry after a lost answer)', again.code === inv1.code && again.inviteId === inv1.inviteId);
    await fails(ann, 'create_pro_invite', { p_client_ref: uuid() }, 'invite_limit');
    const listed = await ok(ann, 'list_my_pro_invites');
    check('the owner sees the code with the private label', listed.length === 1 && listed[0].code === inv1.code && listed[0].label === 'for Bea' && listed[0].status === 'live' && listed[0].connected === false);
    await fails(ann, 'revoke_pro_invite', { p_invite: uuid() }, 'pro_unavailable');
    await ok(ann, 'revoke_pro_invite', { p_invite: inv1.inviteId });
    await ok(ann, 'revoke_pro_invite', { p_invite: inv1.inviteId });
    const afterRevoke = await ok(ann, 'list_my_pro_invites');
    check('a revoked code is listed as revoked', afterRevoke.find(r => r.invite_id === inv1.inviteId)?.status === 'revoked');
    const dead = await result(bea, 'preview_pro_invite', { p_code: inv1.code });
    check('a revoked code previews as the one invalid result', dead.status === 200 && dead.body?.valid === false && dead.body?.error === 'invite_invalid', JSON.stringify(dead.body));

    S.inv2 = await ok(ann, 'create_pro_invite', { p_client_ref: uuid(), p_label: 'for Bea' });
    await ok(ann, 'set_stylist_accepting', { p_accepting: false });
    await fails(bea, 'preview_pro_invite', { p_code: S.inv2.code }, 'stylist_not_accepting');
    await ok(ann, 'set_stylist_accepting', { p_accepting: true });
    const grouped = `${S.inv2.code.slice(0, 5)}-${S.inv2.code.slice(5)}`.toLowerCase();
    const pre = await ok(bea, 'preview_pro_invite', { p_code: grouped });
    check('a code typed in lower case with a hyphen previews', pre.valid === true && pre.inviteId === S.inv2.inviteId);
    expectKeys('the stylist card of a preview', pre.stylist, ['name', 'headline', 'bio', 'services', 'languages', 'ratesText']);
    check('the preview shows who the stylist is and that terms are not yet accepted', pre.stylist.name === 'Ann Styles' && pre.alreadyConnected === false && pre.clientTermsCurrent === false);

    await fails(bea, 'redeem_pro_invite', { p_code: S.inv2.code, p_alias: 'Bea B' }, 'adult_required');
    await ok(bea, 'accept_pro_terms', { p_role: 'client', p_version: CLIENT_TERMS_VERSION, p_adult: true });
    await fails(bea, 'redeem_pro_invite', { p_code: S.inv2.code, p_alias: 'B' }, 'invalid_alias');
    // Digits only: refused as not a name (a name needs a letter) before the contact filter looks at it; with letters it is "contact" (below).
    await fails(bea, 'redeem_pro_invite', { p_code: S.inv2.code, p_alias: '555-123-4567' }, { message: 'text_not_allowed', detail: 'alias', hint: 'name' });
    await fails(bea, 'redeem_pro_invite', { p_code: S.inv2.code, p_alias: 'SmartCloset Support' }, { message: 'text_not_allowed', detail: 'alias', hint: 'name' });
    const red = await ok(bea, 'redeem_pro_invite', { p_code: S.inv2.code, p_alias: 'Bea B' });
    check('redeeming connects', red.ok === true && red.alreadyConnected === false && typeof red.connectionId === 'string');
    S.connB = red.connectionId;
    const redAgain = await ok(bea, 'redeem_pro_invite', { p_code: S.inv2.code, p_alias: 'Bea B' });
    check('redeeming again answers the same connection (a retry after a lost answer)', redAgain.alreadyConnected === true && redAgain.connectionId === S.connB);

    await ok(cat, 'accept_pro_terms', { p_role: 'client', p_version: CLIENT_TERMS_VERSION, p_adult: true });
    const taken = await result(cat, 'redeem_pro_invite', { p_code: S.inv2.code, p_alias: 'Cat C' });
    check('another person redeeming a used code gets the invalid result, not an error', taken.status === 200 && taken.body?.ok === false && taken.body?.error === 'invite_invalid', JSON.stringify(taken.body));
    expectKeys('the invalid redeem result', taken.body, SHAPES['redeem_pro_invite:invalid']);
    const takenPreview = await result(cat, 'preview_pro_invite', { p_code: S.inv2.code });
    check('a used code previews as invalid to anyone else', takenPreview.status === 200 && takenPreview.body?.valid === false);

    S.inv3 = await ok(ann, 'create_pro_invite', { p_client_ref: uuid(), p_label: 'for Cat' });
    const redCat = await ok(cat, 'redeem_pro_invite', { p_code: S.inv3.code, p_alias: 'Cat C' });
    S.connC = redCat.connectionId;
    check('the second client connects with her own code', typeof S.connC === 'string' && S.connC !== S.connB);
    const invites = await ok(ann, 'list_my_pro_invites');
    check('the used codes show as connected', invites.filter(r => r.status === 'used' && r.connected === true).length === 2);
    const st = await ok(ann, 'get_pro_status');
    check('the stylist has two active clients and no live code', st.stylist.activeClients === 2 && st.stylist.liveInvites === 0);
    const stBea = await ok(bea, 'get_pro_status');
    check('the client has one connection', stBea.client.connections === 1 && stBea.client.termsCurrent === true && stBea.client.connectionLimit === 5);
  });

  await group('connections: lists, details, the name a client shows', async () => {
    const asClient = await ok(bea, 'list_pro_connections');
    check('the client sees the stylist by name and headline, active, nothing shared, nothing unread',
      asClient.length === 1 && asClient[0].connection_id === S.connB && asClient[0].my_role === 'client' && asClient[0].other_label === 'Ann Styles'
      && asClient[0].other_headline === 'Wardrobe edits and capsule closets' && asClient[0].status === 'active' && asClient[0].closet_shared === false
      && asClient[0].unread === 0 && asClient[0].attention === false, JSON.stringify(asClient));
    const notStylist = await ok(bea, 'list_pro_connections', { p_as: 'stylist' });
    check('a person who is not a stylist has no stylist list', notStylist.length === 0);
    await fails(bea, 'list_pro_connections', { p_as: 'owner' }, { message: 'invalid_request', detail: 'as' });
    const asStylist = await ok(ann, 'list_pro_connections', { p_as: 'stylist' });
    check('the stylist sees the chosen names, not the accounts', asStylist.map(r => r.other_label).sort().join() === 'Bea B,Cat C');

    const detailB = await ok(bea, 'get_pro_connection', { p_connection: S.connB });
    check('the client side of the connection', detailB.myRole === 'client' && detailB.status === 'active' && detailB.myAlias === 'Bea B' && detailB.safetyOnly === false
      && detailB.stylist?.name === 'Ann Styles' && detailB.closet.shared === false && detailB.actions.canShare === true && detailB.actions.canMessage === true
      && detailB.actions.canViewCloset === false && detailB.actions.canRecommend === false);
    const detailA = await ok(ann, 'get_pro_connection', { p_connection: S.connB });
    check('the stylist side of the connection', detailA.myRole === 'stylist' && detailA.stylist === null && detailA.myAlias === null && detailA.otherLabel === 'Bea B'
      && detailA.actions.canRecommend === true && detailA.actions.canShare === false && detailA.actions.canViewCloset === false);
    await fails(cat, 'get_pro_connection', { p_connection: S.connB }, 'pro_unavailable');
    await fails(ann, 'get_pro_connection', { p_connection: uuid() }, 'pro_unavailable');

    await ok(bea, 'set_pro_alias', { p_connection: S.connB, p_alias: 'Bea Bee' });
    const renamed = await ok(ann, 'list_pro_connections', { p_as: 'stylist' });
    check('the stylist sees the new name', renamed.some(r => r.connection_id === S.connB && r.other_label === 'Bea Bee'));
    await fails(bea, 'set_pro_alias', { p_connection: S.connB, p_alias: 'call me on 555-123-4567' }, { message: 'text_not_allowed', detail: 'alias', hint: 'contact' });
    await fails(bea, 'set_pro_alias', { p_connection: uuid(), p_alias: 'Someone' }, 'pro_unavailable');
  });

  await group('sharing: nothing at first, then only what the client chooses', async () => {
    await fails(ann, 'get_client_closet', { p_connection: S.connB }, 'closet_not_shared');
    const g0 = await ok(ann, 'get_pro_grant', { p_connection: S.connB }, { shape: 'get_pro_grant:stylist' });
    check('the stylist is told nothing is shared', g0.enabled === false && g0.itemMode === null);
    const b0 = await ok(bea, 'get_pro_grant', { p_connection: S.connB });
    check('the client sees nothing shared and no history', b0.enabled === false && Array.isArray(b0.events) && b0.events.length === 0);

    await fails(bea, 'set_pro_grant', { p_connection: S.connB, p_scope: 'closet', p_enabled: true, p_text_version: SHARE_TEXT_VERSION }, { message: 'invalid_request', detail: 'item_mode' });
    await fails(bea, 'set_pro_grant', { p_connection: S.connB, p_scope: 'wardrobe', p_enabled: true, p_item_mode: 'all', p_text_version: SHARE_TEXT_VERSION }, { message: 'invalid_request', detail: 'scope' });
    await fails(bea, 'set_pro_grant', { p_connection: S.connB, p_scope: 'closet', p_enabled: true, p_item_mode: 'all', p_text_version: '2026-09' }, 'stale_consent_text');
    await fails(bea, 'set_pro_grant', { p_connection: S.connB, p_scope: 'closet', p_enabled: true, p_item_mode: 'selected', p_item_ids: [], p_text_version: SHARE_TEXT_VERSION }, { message: 'invalid_request', detail: 'item_ids' });
    await fails(bea, 'set_pro_grant', { p_connection: S.connB, p_scope: 'closet', p_enabled: true, p_item_mode: 'selected', p_item_ids: [S.blazer, S.wish], p_text_version: SHARE_TEXT_VERSION }, { message: 'item_not_found', detail: '1' });
    await fails(bea, 'set_pro_grant', { p_connection: S.connB, p_scope: 'closet', p_enabled: true, p_item_mode: 'selected', p_item_ids: [S.jacket], p_text_version: SHARE_TEXT_VERSION }, { message: 'item_not_found', detail: '1' });
    await fails(cat, 'set_pro_grant', { p_connection: S.connB, p_scope: 'closet', p_enabled: true, p_item_mode: 'all', p_text_version: SHARE_TEXT_VERSION }, 'pro_unavailable');

    const on = await ok(bea, 'set_pro_grant', { p_connection: S.connB, p_scope: 'closet', p_enabled: true, p_item_mode: 'selected', p_item_ids: [S.blazer, S.scarf], p_text_version: SHARE_TEXT_VERSION });
    check('two chosen pieces are shared for about ninety days', on.enabled === true && on.itemMode === 'selected' && on.itemCount === 2 && on.itemIds.length === 2 && near(on.expiresAt, daysFromNow(90), 90 * 60e3) && on.textVersion === SHARE_TEXT_VERSION, JSON.stringify(on));
    check('the history starts with "granted"', on.events[0]?.event === 'granted' && on.events[0].itemCount === 2);
    S.expiry = on.expiresAt;
    const g1 = await ok(ann, 'get_pro_grant', { p_connection: S.connB }, { shape: 'get_pro_grant:stylist' });
    check('the stylist sees that two pieces are shared, and until when, and nothing else', g1.enabled === true && g1.itemCount === 2 && g1.itemMode === 'selected' && g1.expiresAt === S.expiry);

    const page = await ok(ann, 'get_client_closet', { p_connection: S.connB });
    check('the closet shows exactly the two chosen pieces', page.length === 2 && page.map(r => r.name).sort().join() === 'Blue blazer,Red scarf' && page.every(r => r.total_count === 2 && r.has_photo === true), JSON.stringify(page.map(r => r.name)));
    const blazerRow = page.find(r => r.name === 'Blue blazer');
    check('the piece carries its details and nothing private', blazerRow.brand === 'Zara' && blazerRow.color === 'blue' && !/private note|Zara store/.test(JSON.stringify(page)));
    const first = await ok(ann, 'get_client_closet', { p_connection: S.connB, p_offset: 0, p_limit: 1 });
    const second = await ok(ann, 'get_client_closet', { p_connection: S.connB, p_offset: 1, p_limit: 1 });
    check('paging gives each piece once', first.length === 1 && second.length === 1 && first[0].item_id !== second[0].item_id && first[0].total_count === 2);
    const past = await ok(ann, 'get_client_closet', { p_connection: S.connB, p_offset: 99, p_limit: 1 });
    check('an offset past the end moves to the last page and still says the total', past.length === 1 && past[0].total_count === 2);
    const wide = await ok(ann, 'get_client_closet', { p_connection: S.connB, p_offset: 0, p_limit: 5000 });
    check('a huge page size is clamped, not refused', wide.length === 2);

    const seenByClient = await ok(bea, 'get_pro_connection', { p_connection: S.connB });
    const seenByStylist = await ok(ann, 'get_pro_connection', { p_connection: S.connB });
    check('the client is told the closet was viewed; the stylist is not told how often', seenByClient.closet.lastViewedAt !== null && seenByClient.closet.views30d >= 1 && seenByStylist.closet.lastViewedAt === null && seenByStylist.closet.views30d === 0);
    check('the stylist can now open the closet', seenByStylist.actions.canViewCloset === true && seenByClient.actions.canStopSharing === true);

    const all = await ok(bea, 'set_pro_grant', { p_connection: S.connB, p_scope: 'closet', p_enabled: true, p_item_mode: 'all', p_text_version: SHARE_TEXT_VERSION });
    check('changing the choice keeps the original expiry and writes "changed"', all.itemMode === 'all' && all.expiresAt === S.expiry && all.events[0].event === 'changed');
    const everything = await ok(ann, 'get_client_closet', { p_connection: S.connB });
    check('"all" is every piece that is not on the wishlist', everything.length === 4 && !everything.some(r => r.name === 'Wishlist coat') && everything.find(r => r.name === 'Retailer-only top')?.has_photo === false, JSON.stringify(everything.map(r => r.name)));
    const renewed = await ok(bea, 'set_pro_grant', { p_connection: S.connB, p_scope: 'closet', p_enabled: true, p_item_mode: 'all', p_text_version: SHARE_TEXT_VERSION, p_renew: true });
    check('only an explicit renewal sets a new ninety days', new Date(renewed.expiresAt) > new Date(S.expiry) && renewed.events[0].event === 'renewed');
    const back = await ok(bea, 'set_pro_grant', { p_connection: S.connB, p_scope: 'closet', p_enabled: true, p_item_mode: 'selected', p_item_ids: [S.blazer, S.scarf], p_text_version: SHARE_TEXT_VERSION });
    check('back to two chosen pieces', back.itemMode === 'selected' && back.itemCount === 2);
    S.expiry = back.expiresAt;
    await fails(ann, 'get_client_closet', { p_connection: S.connC }, 'closet_not_shared');
    await fails(cat, 'get_client_closet', { p_connection: S.connC }, { message: 'pro_terms_required', detail: 'stylist' });
  });

  await group('looks: draft, send, read, rate', async () => {
    S.lookRef = uuid();
    const draft = await ok(ann, 'save_pro_recommendation', { p_connection: S.connB, p_title: 'Autumn work look', p_body: 'Layer the blazer over a plain shirt.', p_item_ids: [S.blazer, S.scarf], p_client_ref: S.lookRef });
    check('a new look is a draft', draft.status === 'draft' && typeof draft.id === 'string');
    S.lookId = draft.id;
    const retry = await ok(ann, 'save_pro_recommendation', { p_connection: S.connB, p_title: 'Autumn work look', p_body: 'Layer the blazer over a plain shirt.', p_item_ids: [S.blazer, S.scarf], p_client_ref: S.lookRef });
    check('a retry with the same client_ref returns the same draft', retry.id === S.lookId);
    await fails(ann, 'save_pro_recommendation', { p_connection: S.connB, p_title: 'Mixed', p_item_ids: [S.blazer, S.shirt], p_client_ref: uuid() }, { message: 'item_not_shared', detail: '2' });
    await fails(ann, 'save_pro_recommendation', { p_connection: S.connB, p_title: 'Wish', p_item_ids: [S.wish], p_client_ref: uuid() }, { message: 'item_not_shared', detail: '1' });
    await fails(ann, 'save_pro_recommendation', { p_connection: S.connB, p_title: 'Friend', p_item_ids: [S.jacket], p_client_ref: uuid() }, { message: 'item_not_shared', detail: '1' });
    await fails(ann, 'save_pro_recommendation', { p_connection: S.connB, p_title: '   ', p_client_ref: uuid() }, { message: 'invalid_recommendation', detail: 'title' });
    await fails(ann, 'save_pro_recommendation', { p_connection: S.connB, p_title: 'Gift', p_body: 'Please send a gift card first', p_client_ref: uuid() }, { message: 'text_not_allowed', detail: 'body', hint: 'payment' });
    await fails(ann, 'save_pro_recommendation', { p_connection: S.connB, p_title: 'No ref' }, { message: 'invalid_request', detail: 'client_ref' });
    await fails(cat, 'save_pro_recommendation', { p_connection: S.connB, p_title: 'Not mine', p_client_ref: uuid() }, 'pro_unavailable');

    const edited = await ok(ann, 'save_pro_recommendation', { p_connection: S.connB, p_id: S.lookId, p_title: 'Autumn work look v2', p_body: 'Layer the blazer over a plain shirt.' });
    check('a title-only edit keeps the pieces', edited.id === S.lookId);
    const asDraft = await ok(ann, 'get_pro_recommendation', { p_id: S.lookId });
    check('the draft has both pieces, can be sent and deleted, and the pieces show details while shared', asDraft.title === 'Autumn work look v2' && asDraft.items.length === 2 && asDraft.actions.canSend === true && asDraft.actions.canDelete === true
      && asDraft.items.find(i => i.name === 'Blue blazer')?.color === 'blue' && asDraft.items.every(i => i.photoPath === null), JSON.stringify(asDraft.items));
    const stylistList = await ok(ann, 'list_pro_recommendations', { p_connection: S.connB });
    check('the stylist lists the draft with a cover piece and never a photo path', stylistList.length === 1 && stylistList[0].status === 'draft' && stylistList[0].item_count === 2 && stylistList[0].cover_item_id !== null && stylistList[0].cover_photo_path === null);
    const clientList0 = await ok(bea, 'list_pro_recommendations', { p_connection: S.connB }, { allowPaths: true });
    check('a draft does not exist for the client', clientList0.length === 0);
    await fails(bea, 'get_pro_recommendation', { p_id: S.lookId }, 'pro_unavailable');
    await fails(bea, 'give_recommendation_feedback', { p_id: S.lookId, p_rating: 5 }, 'pro_unavailable');

    await ok(ann, 'send_pro_recommendation', { p_id: S.lookId });
    await ok(ann, 'send_pro_recommendation', { p_id: S.lookId });
    await fails(ann, 'save_pro_recommendation', { p_connection: S.connB, p_id: S.lookId, p_title: 'Edited after sending', p_body: '' }, 'recommendation_locked');
    await fails(ann, 'delete_pro_recommendation', { p_id: S.lookId }, 'recommendation_locked');

    const empty = await ok(ann, 'save_pro_recommendation', { p_connection: S.connB, p_title: 'Empty', p_client_ref: uuid() });
    await fails(ann, 'send_pro_recommendation', { p_id: empty.id }, 'recommendation_empty');
    await ok(ann, 'delete_pro_recommendation', { p_id: empty.id });
    await fails(ann, 'delete_pro_recommendation', { p_id: empty.id }, 'pro_unavailable');

    const clientList = await ok(bea, 'list_pro_recommendations', { p_connection: S.connB }, { allowPaths: true });
    check('the client sees the sent look as new, with her own cover photo path', clientList.length === 1 && clientList[0].is_new === true && clientList[0].item_count === 2 && clientList[0].cover_photo_path?.startsWith(`${bea.id}/`), JSON.stringify(clientList));
    const asClient = await ok(bea, 'get_pro_recommendation', { p_id: S.lookId }, { allowPaths: true });
    check('reading a sent look marks it viewed and offers feedback', asClient.status === 'viewed' && asClient.viewedAt !== null && asClient.actions.canGiveFeedback === true && asClient.actions.canEdit === false
      && asClient.items.length === 2 && asClient.items.every(i => i.available === true && typeof i.photoPath === 'string'));
    await fails(bea, 'give_recommendation_feedback', { p_id: S.lookId, p_rating: 9 }, { message: 'invalid_request', detail: 'rating' });
    await fails(bea, 'give_recommendation_feedback', { p_id: S.lookId }, { message: 'invalid_request', detail: 'feedback' });
    await fails(bea, 'give_recommendation_feedback', { p_id: S.lookId, p_comment: 'I will send a gift card' }, { message: 'text_not_allowed', detail: 'comment', hint: 'payment' });
    await ok(bea, 'give_recommendation_feedback', { p_id: S.lookId, p_rating: 4, p_comment: 'Love the layering', p_worn: true });
    await fails(ann, 'give_recommendation_feedback', { p_id: S.lookId, p_rating: 5 }, 'pro_unavailable');
    const rated = await ok(ann, 'get_pro_recommendation', { p_id: S.lookId });
    check('the stylist sees the rating, the comment and that it was worn', rated.status === 'implemented' && rated.feedback?.rating === 4 && rated.feedback?.comment === 'Love the layering' && rated.implementedAt !== null);
    const lists = await ok(ann, 'list_pro_recommendations', { p_connection: S.connB });
    check('the list carries the rating', lists[0].client_rating === 4);
    const older = await ok(ann, 'list_pro_recommendations', { p_connection: S.connB, p_before: new Date(Date.now() - 86400e3).toISOString(), p_limit: 5 });
    const newer = await ok(ann, 'list_pro_recommendations', { p_connection: S.connB, p_before: new Date(Date.now() + 86400e3).toISOString(), p_limit: 5 });
    check('p_before pages by update time: nothing older than yesterday, the look before tomorrow', older.length === 0 && newer.length === 1);
  });

  await group('sessions: propose, answer, conflict, cancel, list', async () => {
    S.start1 = inDays(2, 10);
    S.apptRef = uuid();
    const proposed = await ok(ann, 'propose_pro_appointment', { p_connection: S.connB, p_starts_at: S.start1, p_duration_minutes: 60, p_mode: 'virtual', p_place: '', p_note: 'Intro call', p_utc_offset_minutes: 60, p_client_ref: S.apptRef });
    check('a proposal is proposed', proposed.status === 'proposed');
    S.apptId = proposed.appointmentId;
    const retry = await ok(ann, 'propose_pro_appointment', { p_connection: S.connB, p_starts_at: S.start1, p_duration_minutes: 60, p_mode: 'virtual', p_place: '', p_note: 'Intro call', p_utc_offset_minutes: 60, p_client_ref: S.apptRef });
    check('a retry with the same client_ref returns the same session', retry.appointmentId === S.apptId);
    await fails(ann, 'propose_pro_appointment', { p_connection: S.connB, p_starts_at: new Date(Date.now() - 3600e3).toISOString(), p_duration_minutes: 60, p_mode: 'virtual', p_client_ref: uuid() }, { message: 'invalid_appointment', detail: 'starts_at' });
    await fails(ann, 'propose_pro_appointment', { p_connection: S.connB, p_starts_at: inDays(3), p_duration_minutes: 20, p_mode: 'virtual', p_client_ref: uuid() }, { message: 'invalid_appointment', detail: 'duration' });
    await fails(ann, 'propose_pro_appointment', { p_connection: S.connB, p_starts_at: inDays(3), p_duration_minutes: 60, p_mode: 'phone', p_client_ref: uuid() }, { message: 'invalid_appointment', detail: 'mode' });
    await fails(ann, 'propose_pro_appointment', { p_connection: S.connB, p_starts_at: inDays(3), p_duration_minutes: 60, p_mode: 'in_person', p_place: 'call 555-123-4567', p_client_ref: uuid() }, { message: 'text_not_allowed', detail: 'place', hint: 'contact' });
    await fails(ann, 'propose_pro_appointment', { p_connection: S.connB, p_starts_at: inDays(3), p_duration_minutes: 60, p_mode: 'virtual', p_utc_offset_minutes: 50, p_client_ref: uuid() }, { message: 'invalid_appointment', detail: 'utc_offset' });
    await fails(ann, 'propose_pro_appointment', { p_connection: S.connB, p_starts_at: inDays(3), p_duration_minutes: 60, p_mode: 'virtual', p_utc_offset_minutes: 900, p_client_ref: uuid() }, { message: 'invalid_appointment', detail: 'utc_offset' });
    await fails(ann, 'propose_pro_appointment', { p_connection: S.connB, p_starts_at: inDays(3), p_duration_minutes: 60, p_mode: 'virtual' }, { message: 'invalid_request', detail: 'client_ref' });
    await fails(ann, 'respond_pro_appointment', { p_appointment: S.apptId, p_action: 'confirm' }, 'appointment_closed');
    await fails(bea, 'respond_pro_appointment', { p_appointment: S.apptId, p_action: 'maybe' }, { message: 'invalid_request', detail: 'action' });

    const needsMe = await ok(bea, 'list_pro_appointments', { p_connection: S.connB, p_scope: 'needs_me' });
    check('the client is asked to answer; she may confirm, decline and cancel', needsMe.length === 1 && needsMe[0].appointment_id === S.apptId && needsMe[0].can_confirm === true && needsMe[0].can_decline === true && needsMe[0].can_cancel === true && needsMe[0].other_label === 'Ann Styles' && needsMe[0].utc_offset_minutes === 60 && !('tz' in needsMe[0]));
    const ownRequest = await ok(ann, 'list_pro_appointments', { p_connection: S.connB, p_scope: 'needs_me' });
    check('the proposer is not asked to answer her own request', ownRequest.length === 0);
    await fails(bea, 'list_pro_appointments', { p_connection: S.connB, p_scope: 'someday' }, { message: 'invalid_request', detail: 'scope' });

    await ok(bea, 'respond_pro_appointment', { p_appointment: S.apptId, p_action: 'confirm' });
    await ok(bea, 'respond_pro_appointment', { p_appointment: S.apptId, p_action: 'confirm' });
    await fails(bea, 'respond_pro_appointment', { p_appointment: S.apptId, p_action: 'decline' }, 'appointment_closed');
    const upcoming = await ok(bea, 'list_pro_appointments', { p_connection: S.connB });
    check('the confirmed session is upcoming', upcoming.length === 1 && upcoming[0].status === 'confirmed' && upcoming[0].can_confirm === false && upcoming[0].can_cancel === true);

    // A second client proposes a time that overlaps; the stylist cannot confirm both.
    const overlap = await ok(cat, 'propose_pro_appointment', { p_connection: S.connC, p_starts_at: inDays(2, 10, 30), p_duration_minutes: 60, p_mode: 'virtual', p_client_ref: uuid() });
    await fails(ann, 'respond_pro_appointment', { p_appointment: overlap.appointmentId, p_action: 'confirm' }, 'appointment_conflict');
    await ok(cat, 'cancel_pro_appointment', { p_appointment: overlap.appointmentId });
    await ok(cat, 'cancel_pro_appointment', { p_appointment: overlap.appointmentId });
    await fails(ann, 'respond_pro_appointment', { p_appointment: overlap.appointmentId, p_action: 'confirm' }, 'appointment_closed');

    S.open = [];
    for (let i = 3; i <= 7; i++) {
      const p = await ok(cat, 'propose_pro_appointment', { p_connection: S.connC, p_starts_at: inDays(i, 9), p_duration_minutes: 30, p_mode: 'in_person', p_place: 'Café on the corner', p_client_ref: uuid() });
      S.open.push(p.appointmentId);
    }
    await fails(cat, 'propose_pro_appointment', { p_connection: S.connC, p_starts_at: inDays(8, 9), p_duration_minutes: 30, p_mode: 'virtual', p_client_ref: uuid() }, 'appointment_open_limit');
    const everyone = await ok(ann, 'list_pro_appointments');
    check('a stylist sees the sessions of all her connections', everyone.some(r => r.connection_id === S.connB) && everyone.some(r => r.connection_id === S.connC));
    for (const id of S.open) await ok(ann, 'cancel_pro_appointment', { p_appointment: id });
    const past = await ok(ann, 'list_pro_appointments', { p_connection: S.connC, p_scope: 'past' });
    check('cancelled sessions move to the past list', past.length >= 6 && past.every(r => r.status === 'cancelled'), JSON.stringify(past.map(r => r.status)));
  });

  await group('messages: send, retry, thread cursors, the badge', async () => {
    const ref = uuid();
    const m1 = await ok(ann, 'send_pro_message', { p_connection: S.connB, p_body: 'Hello Bea, welcome!', p_client_ref: ref });
    const m1again = await ok(ann, 'send_pro_message', { p_connection: S.connB, p_body: 'Hello Bea, welcome!', p_client_ref: ref });
    check('a retry with the same client_ref is the same message', m1.messageId === m1again.messageId);
    S.annMessage = m1.messageId;
    await ok(ann, 'send_pro_message', { p_connection: S.connB, p_body: 'Call me on 555-123-4567 if that is easier', p_client_ref: uuid() });
    await fails(ann, 'send_pro_message', { p_connection: S.connB, p_body: 'Please send a gift card first', p_client_ref: uuid() }, { message: 'text_not_allowed', detail: 'message', hint: 'payment' });
    await fails(ann, 'send_pro_message', { p_connection: S.connB, p_body: '   ', p_client_ref: uuid() }, { message: 'invalid_message', detail: 'body' });
    await fails(ann, 'send_pro_message', { p_connection: S.connB, p_body: 'x'.repeat(501), p_client_ref: uuid() }, { message: 'invalid_message', detail: 'body' });
    await fails(cat, 'send_pro_message', { p_connection: S.connB, p_body: 'Not my thread', p_client_ref: uuid() }, 'pro_unavailable');
    await fails(cat, 'get_pro_thread', { p_connection: S.connB }, 'pro_unavailable');

    const before = await ok(bea, 'get_pro_badge');
    const status = await ok(bea, 'get_pro_status');
    check('the badge counts what needs her and equals the status badge', before >= 1 && status.badge === before, `${before} vs ${status.badge}`);
    const listBefore = await ok(bea, 'list_pro_connections');
    check('the list shows unread text messages and a preview', listBefore[0].unread === 2 && listBefore[0].attention === true && listBefore[0].last_message_preview?.startsWith('Call me'), JSON.stringify(listBefore[0]));

    const thread = await ok(bea, 'get_pro_thread', { p_connection: S.connB });
    const systemLines = thread.messages.filter(m => m.from === 'system').map(m => m.code);
    check('the thread opens with the neutral lines and the two messages from the stylist',
      systemLines.join() === 'connected,sharing_on' && thread.messages.filter(m => m.from === 'them').length === 2 && thread.messages.every(m => m.from !== 'me') && thread.hasMore === false && thread.actions.canSend === true, JSON.stringify(thread.messages.map(m => `${m.from}:${m.code ?? m.body.slice(0, 10)}`)));
    const listAfter = await ok(bea, 'list_pro_connections');
    check('reading the thread clears the unread count', listAfter[0].unread === 0);
    const lastId = thread.messages[thread.messages.length - 1].id;
    const none = await ok(bea, 'get_pro_thread', { p_connection: S.connB, p_after_id: lastId });
    check('a poll that sees nothing new returns nothing', none.messages.length === 0 && none.hasMore === false);
    await ok(bea, 'send_pro_message', { p_connection: S.connB, p_body: 'Thank you!', p_client_ref: uuid() });
    const newer = await ok(ann, 'get_pro_thread', { p_connection: S.connB, p_after_id: lastId });
    check('after_id pages forward from the last message seen', newer.messages.length === 1 && newer.messages[0].from === 'them' && newer.messages[0].body === 'Thank you!');
    const older = await ok(ann, 'get_pro_thread', { p_connection: S.connB, p_before_id: newer.messages[0].id, p_limit: 1 });
    check('before_id pages back, newest first of the older ones, and says there is more', older.messages.length === 1 && older.hasMore === true && older.messages[0].id < newer.messages[0].id);
    await fails(ann, 'get_pro_thread', { p_connection: S.connB, p_after_id: 1, p_before_id: 9 }, { message: 'invalid_request', detail: 'cursor' });
    const mine = await ok(ann, 'get_pro_thread', { p_connection: S.connB, p_limit: 1 });
    check('the latest page is the newest message', mine.messages.length === 1 && mine.messages[0].body === 'Thank you!' && mine.hasMore === true);
  });

  await group('messages: the sixth message in a minute is the last', async () => {
    await alignToWindow(60, 20);
    for (let i = 1; i <= 6; i++) await ok(cat, 'send_pro_message', { p_connection: S.connC, p_body: `quick message ${i}`, p_client_ref: uuid() });
    await fails(cat, 'send_pro_message', { p_connection: S.connC, p_body: 'quick message 7', p_client_ref: uuid() }, { message: 'pro_rate_limited', detail: 'message_min' });
  });

  await group('photos: the path stays with the service role, and the function serves a cleaned image', async () => {
    const path1 = await ok(service, 'pro_photo_source', { p_uid: ann.id, p_connection: S.connB, p_item: S.blazer });
    check('a shared piece with a cover photo gives its path to the service role', path1 === `${bea.id}/test.jpg`, JSON.stringify(path1));
    const nulls = [
      ['a piece that is not in the chosen set', await ok(service, 'pro_photo_source', { p_uid: ann.id, p_connection: S.connB, p_item: S.shirt })],
      ['a wishlist piece', await ok(service, 'pro_photo_source', { p_uid: ann.id, p_connection: S.connB, p_item: S.wish })],
      ['a piece with only a retailer image', await ok(service, 'pro_photo_source', { p_uid: ann.id, p_connection: S.connB, p_item: S.retail })],
      ['another client\'s piece', await ok(service, 'pro_photo_source', { p_uid: ann.id, p_connection: S.connB, p_item: S.jacket })],
      ['a stranger', await ok(service, 'pro_photo_source', { p_uid: eve.id, p_connection: S.connB, p_item: S.blazer })],
      ['the client herself', await ok(service, 'pro_photo_source', { p_uid: bea.id, p_connection: S.connB, p_item: S.blazer })],
      ['the wrong connection', await ok(service, 'pro_photo_source', { p_uid: ann.id, p_connection: S.connC, p_item: S.blazer })],
      ['no piece at all', await ok(service, 'pro_photo_source', { p_uid: ann.id, p_connection: S.connB, p_item: null })],
    ];
    for (const [what, body] of nulls) check(`pro_photo_source answers null for ${what}`, body === null, JSON.stringify(body));
    await refused(ann, 'pro_photo_source', { p_uid: ann.id, p_connection: S.connB, p_item: S.blazer });
    await refused(bea, 'pro_photo_source', { p_uid: ann.id, p_connection: S.connB, p_item: S.blazer });
    await refused(anon, 'pro_photo_source', { p_uid: ann.id, p_connection: S.connB, p_item: S.blazer });
    await ok(bea, 'set_pro_grant', { p_connection: S.connB, p_scope: 'closet', p_enabled: true, p_item_mode: 'all', p_text_version: SHARE_TEXT_VERSION });
    const third = await ok(service, 'pro_photo_source', { p_uid: ann.id, p_connection: S.connB, p_item: S.shirt });
    const noPhoto = await ok(service, 'pro_photo_source', { p_uid: ann.id, p_connection: S.connB, p_item: S.retail });
    const wishAll = await ok(service, 'pro_photo_source', { p_uid: ann.id, p_connection: S.connB, p_item: S.wish });
    check('with "all", a piece with a photo address gives its path, one without a photo and a wishlist piece do not', third === `${bea.id}/third.jpg` && noPhoto === null && wishAll === null, JSON.stringify([third, noPhoto, wishAll]));
    await ok(bea, 'set_pro_grant', { p_connection: S.connB, p_scope: 'closet', p_enabled: true, p_item_mode: 'selected', p_item_ids: [S.blazer, S.scarf], p_text_version: SHARE_TEXT_VERSION });
    await ok(cat, 'set_pro_grant', { p_connection: S.connC, p_scope: 'closet', p_enabled: true, p_item_mode: 'selected', p_item_ids: [S.jacket], p_text_version: SHARE_TEXT_VERSION });

    check('the JPEG fixture does carry location, camera and comment data', jpegFindings(buildGeotaggedJpeg()).length >= 2, jpegFindings(buildGeotaggedJpeg()).join());
    check('the PNG fixture does carry text, time and trailing data', pngFindings(buildTextPng()).length >= 2, pngFindings(buildTextPng()).join());
    const probe = await photoRequest(ann, S.connB, S.blazer, { noToken: true });
    state.photoFunction = probe.status === 401 ? 'served' : 'unreachable';
    if (state.photoFunction !== 'served') {
      const why = `GET /functions/v1/pro-photo without a token answered HTTP ${probe.status || 'nothing'}, not 401 (run: supabase functions serve pro-photo)`;
      if (opts.requirePhotoFunction) check('the pro-photo function is being served', false, why);
      else skipped('the pro-photo function checks', why);
      return;
    }
    check('without a token the function answers 401', probe.status === 401);
    const jpeg = await photoRequest(ann, S.connB, S.blazer);
    check('a shared JPEG is served as image/jpeg', jpeg.status === 200 && /image\/jpeg/.test(jpeg.type), `HTTP ${jpeg.status} ${jpeg.type}`);
    check('the JPEG comes back without location, camera or comment data and without trailing bytes', jpegFindings(jpeg.bytes).length === 0, jpegFindings(jpeg.bytes).join());
    check('it is not cached', /no-store/.test(jpeg.headers.get('cache-control') || ''), jpeg.headers.get('cache-control'));
    const headerText = JSON.stringify([...jpeg.headers.entries()]).toLowerCase();
    const whole = `${jpeg.bytes.toString('latin1')}${headerText}`.toLowerCase();
    check('neither the body nor the headers carry the account id or the stored file name', !whole.includes(bea.id.toLowerCase()) && !whole.includes('test.jpg') && !whole.includes('wardrobe-images'));
    const png = await photoRequest(ann, S.connB, S.scarf);
    check('a shared PNG is served as image/png without its text chunk or trailing bytes', png.status === 200 && /image\/png/.test(png.type) && pngFindings(png.bytes).length === 0, `HTTP ${png.status} ${pngFindings(png.bytes).join()}`);
    for (const [what, res] of [
      ['a piece that is not shared', await photoRequest(ann, S.connB, S.shirt)],
      ['a wishlist piece', await photoRequest(ann, S.connB, S.wish)],
      ['another client\'s piece', await photoRequest(ann, S.connB, S.jacket)],
      ['a stranger', await photoRequest(eve, S.connB, S.blazer)],
      ['the client herself', await photoRequest(bea, S.connB, S.blazer)],
      ['ids that are not ids', await photoRequest(ann, 'x', 'y')],
    ]) check(`${what} is a bare 404`, res.status === 404 && res.bytes.length === 0, `HTTP ${res.status} ${res.bytes.length} bytes`);
    const anonKey = await photoRequest(anon, S.connB, S.blazer);
    check('the anon key is not a person', anonKey.status === 401, `HTTP ${anonKey.status}`);
    const catPhoto = await photoRequest(ann, S.connC, S.jacket);
    check('the second client\'s shared piece is served to the stylist', catPhoto.status === 200 && jpegFindings(catPhoto.bytes).length === 0, `HTTP ${catPhoto.status}`);

    await ok(bea, 'set_pro_grant', { p_connection: S.connB, p_scope: 'closet', p_enabled: false });
    const revoked = await photoRequest(ann, S.connB, S.blazer);
    check('once the client switches sharing off, the next request is a 404', revoked.status === 404, `HTTP ${revoked.status}`);
    await ok(bea, 'set_pro_grant', { p_connection: S.connB, p_scope: 'closet', p_enabled: true, p_item_mode: 'selected', p_item_ids: [S.blazer, S.scarf], p_text_version: SHARE_TEXT_VERSION });
    const again = await photoRequest(ann, S.connB, S.blazer);
    check('and a new grant serves the photo again', again.status === 200, `HTTP ${again.status}`);
  });

  await group('stopping sharing: the stylist is told nothing, and reads back nothing', async () => {
    const before = (await ok(ann, 'list_pro_connections', { p_as: 'stylist' })).find(r => r.connection_id === S.connB);
    const revokedBefore = (await ok(bea, 'get_pro_grant', { p_connection: S.connB })).events.filter(e => e.event === 'revoked').length;
    const off = await ok(bea, 'set_pro_grant', { p_connection: S.connB, p_scope: 'closet', p_enabled: false });
    check('the client sees sharing off and a "revoked" event', off.enabled === false && off.events[0].event === 'revoked');
    await ok(bea, 'set_pro_grant', { p_connection: S.connB, p_scope: 'closet', p_enabled: false });
    const again = await ok(bea, 'get_pro_grant', { p_connection: S.connB });
    check('switching it off twice writes one event', again.events.filter(e => e.event === 'revoked').length === revokedBefore + 1, JSON.stringify(again.events.map(e => e.event)));
    await fails(ann, 'get_client_closet', { p_connection: S.connB }, 'closet_not_shared');
    const g = await ok(ann, 'get_pro_grant', { p_connection: S.connB }, { shape: 'get_pro_grant:stylist' });
    check('the stylist sees only "not shared"', g.enabled === false && g.itemMode === null && g.itemCount === null && g.expiresAt === null);
    const src = await ok(service, 'pro_photo_source', { p_uid: ann.id, p_connection: S.connB, p_item: S.blazer });
    check('pro_photo_source answers null at once', src === null);
    const look = await ok(ann, 'get_pro_recommendation', { p_id: S.lookId });
    check('the look keeps its text, but the stylist reads back nothing about the pieces', look.items.length === 2 && look.items.every(i => i.color === null && i.brand === null && i.hasPhoto === false && i.available === false && i.photoPath === null) && look.items[0].name === 'Blue blazer', JSON.stringify(look.items));
    const looks = await ok(ann, 'list_pro_recommendations', { p_connection: S.connB });
    check('and the list has no cover piece', looks[0].cover_item_id === null && looks[0].cover_photo_path === null);
    const after = (await ok(ann, 'list_pro_connections', { p_as: 'stylist' })).find(r => r.connection_id === S.connB);
    check('the connection did not move in the stylist\'s list', after.last_activity_at === before.last_activity_at && after.closet_shared === false);
    const thread = await ok(ann, 'get_pro_thread', { p_connection: S.connB });
    check('no new line was written (only the first sharing wrote one)', thread.messages.filter(m => m.code === 'sharing_on').length === 1);
    await ok(bea, 'set_pro_grant', { p_connection: S.connB, p_scope: 'closet', p_enabled: true, p_item_mode: 'selected', p_item_ids: [S.blazer, S.scarf], p_text_version: SHARE_TEXT_VERSION });
    const reread = await ok(ann, 'get_pro_recommendation', { p_id: S.lookId });
    check('sharing again shows the pieces again', reread.items.find(i => i.name === 'Blue blazer')?.color === 'blue' && reread.items.find(i => i.name === 'Blue blazer')?.available === true);
  });

  await group('ways out work while the feature is paused, and when the terms text moves on', async () => {
    await ok(service, 'pro_set_enabled', { p_on: false });
    try {
      const st = await ok(bea, 'get_pro_status');
      check('the status still answers, and says paused', st.proEnabled === false);
      check('the badge is zero', (await ok(bea, 'get_pro_badge')) === 0);
      const detail = await ok(bea, 'get_pro_connection', { p_connection: S.connB });
      check('the connection answers with safetyOnly, no profile text, and the ways out', detail.safetyOnly === true && detail.stylist === null && detail.actions.canMessage === false && detail.actions.canShare === false && detail.actions.canEnd === true && detail.actions.canStopSharing === true, JSON.stringify(detail.actions));
      const list = await ok(bea, 'list_pro_connections');
      check('the list shows no message previews while paused', list.every(r => r.last_message_preview === null && r.other_headline === null));
      await fails(bea, 'send_pro_message', { p_connection: S.connB, p_body: 'Anyone there?', p_client_ref: uuid() }, 'pro_disabled');
      await fails(ann, 'get_client_closet', { p_connection: S.connB }, 'pro_disabled');
      await fails(bea, 'set_pro_grant', { p_connection: S.connB, p_scope: 'closet', p_enabled: true, p_item_mode: 'all', p_text_version: SHARE_TEXT_VERSION }, 'pro_disabled');
      check('pro_photo_source answers null', (await ok(service, 'pro_photo_source', { p_uid: ann.id, p_connection: S.connB, p_item: S.blazer })) === null);
      await ok(bea, 'export_my_pro_data');
      const off = await ok(bea, 'set_pro_grant', { p_connection: S.connB, p_scope: 'closet', p_enabled: false });
      check('Stop sharing works while paused', off.enabled === false);
      await ok(cat, 'end_pro_connection', { p_connection: S.connC });
      await ok(cat, 'end_pro_connection', { p_connection: S.connC });
    } finally {
      await setSwitch(true);
    }
    const ended = await ok(cat, 'get_pro_connection', { p_connection: S.connC });
    check('Cat ended it while paused: it reads ended by her, with no way to act', ended.status === 'ended' && ended.endedBy === 'me' && ended.actions.canMessage === false && ended.actions.canEnd === false);
    const endedList = await ok(ann, 'list_pro_connections', { p_as: 'stylist' });
    check('the stylist sees the connection ended by the client', endedList.find(r => r.connection_id === S.connC)?.status === 'ended' && endedList.find(r => r.connection_id === S.connC)?.ended_by === 'client');
    const spentPreview = await result(cat, 'preview_pro_invite', { p_code: S.inv3.code });
    check('the spent code of an ended connection previews as invalid, not as "already connected"', spentPreview.status === 200 && spentPreview.body?.valid === false, JSON.stringify(spentPreview.body));
    const spentRedeem = await result(cat, 'redeem_pro_invite', { p_code: S.inv3.code, p_alias: 'Cat C' });
    check('and a redeem of it is the invalid result, not ok with the id of a connection that has ended', spentRedeem.status === 200 && spentRedeem.body?.ok === false && spentRedeem.body?.error === 'invite_invalid', JSON.stringify(spentRedeem.body));
    const history = await ok(cat, 'get_pro_thread', { p_connection: S.connC });
    check('the history of an ended connection can still be read, and ends with a neutral line', history.messages.length >= 6 && history.messages.at(-1).code === 'ended' && history.actions.canSend === false);
    await fails(cat, 'send_pro_message', { p_connection: S.connC, p_body: 'Still there?', p_client_ref: uuid() }, 'connection_ended');
    await fails(cat, 'set_pro_grant', { p_connection: S.connC, p_scope: 'closet', p_enabled: true, p_item_mode: 'all', p_text_version: SHARE_TEXT_VERSION }, 'connection_ended');
    await fails(ann, 'get_client_closet', { p_connection: S.connC }, 'pro_unavailable');
    check('and the photo source is null', (await ok(service, 'pro_photo_source', { p_uid: ann.id, p_connection: S.connC, p_item: S.jacket })) === null);
    if (state.photoFunction === 'served') {
      const gone = await photoRequest(ann, S.connC, S.jacket);
      check('the function serves nothing of an ended connection', gone.status === 404, `HTTP ${gone.status}`);
    }

    await setConfig('client_terms_version', '2026-11');
    try {
      await fails(bea, 'send_pro_message', { p_connection: S.connB, p_body: 'New terms?', p_client_ref: uuid() }, { message: 'pro_terms_required', detail: 'client' });
      const detail = await ok(bea, 'get_pro_connection', { p_connection: S.connB });
      check('the connection answers safetyOnly when the terms text has moved on', detail.safetyOnly === true && detail.actions.canEnd === true);
      const st = await ok(bea, 'get_pro_status');
      check('the status says the client terms are not current', st.client.termsCurrent === false && st.versions.clientTerms === '2026-11');
      await fails(bea, 'set_pro_grant', { p_connection: S.connB, p_scope: 'closet', p_enabled: true, p_item_mode: 'all', p_text_version: SHARE_TEXT_VERSION }, { message: 'pro_terms_required', detail: 'client' });
      const stillOff = await ok(bea, 'set_pro_grant', { p_connection: S.connB, p_scope: 'closet', p_enabled: false });
      check('switching sharing off needs no terms', stillOff.enabled === false);
      await ok(bea, 'export_my_pro_data');
      await ok(bea, 'list_pro_blocks');
    } finally {
      await setConfig('client_terms_version', CLIENT_TERMS_VERSION);
    }
    const on = await ok(bea, 'set_pro_grant', { p_connection: S.connB, p_scope: 'closet', p_enabled: true, p_item_mode: 'selected', p_item_ids: [S.blazer, S.scarf], p_text_version: SHARE_TEXT_VERSION });
    check('with the terms back, sharing can be switched on again', on.enabled === true);
  });

  await group('reports: stored once, with evidence that fits, and a serious one stops the clients sharing', async () => {
    const reportsOf = async (who, query = '') => rowsOf(await rest('GET', 'content_reports', { query: `select=id,context,reason,ref_type,ref_id,reported_user_id,evidence&reporter_id=eq.${who.id}&order=created_at.asc${query}` }));
    await ok(bea, 'report_pro_content', { p_ref_type: 'connection', p_ref_id: S.connB, p_reason: 'spam', p_details: 'api check' });
    const r1 = await reportsOf(bea);
    check('a report of the other person is stored as a profile report, against the right person', r1.length === 1 && r1[0].context === 'pro_profile' && r1[0].ref_type === 'connection' && r1[0].ref_id === S.connB && r1[0].reason === 'spam' && r1[0].reported_user_id === ann.id, JSON.stringify(r1));
    await ok(bea, 'report_pro_content', { p_ref_type: 'connection', p_ref_id: S.connB, p_reason: 'spam', p_details: 'api check' });
    check('the same report again is folded into the first', (await reportsOf(bea)).length === 1);
    await ok(ann, 'report_pro_content', { p_ref_type: 'connection', p_ref_id: S.connB, p_reason: 'spam' });
    const g1 = await ok(bea, 'get_pro_grant', { p_connection: S.connB });
    check('a stylist\'s report does not touch the client\'s sharing', g1.enabled === true);
    await ok(bea, 'report_pro_content', { p_ref_type: 'connection', p_ref_id: S.connB, p_reason: 'spam', p_message_id: S.annMessage });
    const g2 = await ok(bea, 'get_pro_grant', { p_connection: S.connB });
    check('nor does a report about a message that is only spam', g2.enabled === true && (await reportsOf(bea)).length === 2);
    await fails(bea, 'report_pro_content', { p_ref_type: 'connection', p_ref_id: S.connB, p_reason: 'bogus' }, 'invalid_report');
    await fails(cat, 'report_pro_content', { p_ref_type: 'connection', p_ref_id: S.connB, p_reason: 'spam' }, 'pro_unavailable');
    await fails(eve, 'report_pro_content', { p_ref_type: 'invite', p_ref_id: uuid(), p_reason: 'spam' }, 'pro_unavailable');
    await ok(bea, 'report_pro_content', { p_ref_type: 'recommendation', p_ref_id: S.lookId, p_reason: 'inappropriate' });
    await ok(bea, 'report_pro_content', { p_ref_type: 'appointment', p_ref_id: S.apptId, p_reason: 'other', p_details: 'api check' });
    const kinds = (await reportsOf(bea)).map(r => `${r.ref_type}:${r.context}`);
    check('looks and sessions are reported as content', kinds.includes('recommendation:pro_content') && kinds.includes('appointment:pro_content'), kinds.join());
    const quote = 'He told me to pay with a gift card and send bitcoin';
    await ok(bea, 'report_pro_content', { p_ref_type: 'connection', p_ref_id: S.connB, p_reason: 'scam', p_details: quote });
    const quoted = rowsOf(await rest('GET', 'content_reports', { query: `select=details&reporter_id=eq.${bea.id}&reason=eq.scam` }));
    check('a report may quote a scam: the details are not filtered, and are stored as written', quoted.length === 1 && quoted[0].details === quote, JSON.stringify(quoted));
    const draft = await ok(ann, 'save_pro_recommendation', { p_connection: S.connB, p_title: 'Not sent yet', p_body: 'A draft', p_client_ref: uuid() });
    await fails(bea, 'report_pro_content', { p_ref_type: 'recommendation', p_ref_id: draft.id, p_reason: 'spam' }, 'pro_unavailable');
    await ok(ann, 'delete_pro_recommendation', { p_id: draft.id });

    S.inv4 = await ok(ann, 'create_pro_invite', { p_client_ref: uuid(), p_label: 'for a stranger' });
    const seen = await ok(cat, 'preview_pro_invite', { p_code: S.inv4.code });
    S.inviteSeen = seen.inviteId;
    await ok(cat, 'report_pro_content', { p_ref_type: 'invite', p_ref_id: S.inviteSeen, p_reason: 'scam' });
    const inviteReport = (await reportsOf(cat)).find(r => r.ref_type === 'invite');
    check('a stylist seen in a preview can be reported, and the report never counts toward a hold', inviteReport?.context === 'pro_profile' && inviteReport?.evidence?.qualified === false, JSON.stringify(inviteReport));

    // Thirty messages of five hundred four-byte characters: more than the table would take if the evidence were not cut.
    const long = '\u{1F600}'.repeat(500);
    const rows = Array.from({ length: 30 }, (_, i) => ({ connection_id: S.connB, sender_id: i % 2 === 0 ? ann.id : bea.id, kind: 'text', body: long }));
    const planted = await rest('POST', 'pro_messages', { body: rows });
    check('thirty long messages were planted', planted.status < 300 && rowsOf(planted).length === 30, `HTTP ${planted.status} ${errText(planted.err)}`);
    const flagged = rowsOf(planted).filter(r => r.sender_id === ann.id).at(-1)?.id;
    await ok(bea, 'report_pro_content', { p_ref_type: 'connection', p_ref_id: S.connB, p_reason: 'harassment', p_details: 'api check', p_message_id: flagged });
    const serious = (await reportsOf(bea)).find(r => r.reason === 'harassment');
    const ev = serious?.evidence || {};
    const bodies = Array.isArray(ev.messages) ? ev.messages : [];
    check('a report about a message is a chat report', serious?.context === 'pro_chat', JSON.stringify(serious?.context));
    check('its evidence fits: at most thirty messages, each cut to 300 characters, the flagged one kept', bodies.length > 0 && bodies.length <= 30 && bodies.every(m => Array.from(String(m.body ?? '')).length <= 300) && Number(ev.flaggedMessageId) === Number(flagged), `${bodies.length} messages, longest ${Math.max(0, ...bodies.map(m => Array.from(String(m.body ?? '')).length))} characters, flagged ${ev.flaggedMessageId} vs ${flagged}`);
    check('the evidence marks who wrote what, and says whether the reporter really worked with the stylist', bodies.every(m => ['reporter', 'reported', 'system'].includes(m.who)) && typeof ev.qualified === 'boolean', JSON.stringify(ev.qualified));
    const g3 = await ok(bea, 'get_pro_grant', { p_connection: S.connB });
    check('a serious report by the client switched her sharing off, and said so in the history', g3.enabled === false && g3.events.some(e => e.event === 'revoked'));
    await fails(ann, 'get_client_closet', { p_connection: S.connB }, 'closet_not_shared');
    const status = await ok(ann, 'get_pro_connection', { p_connection: S.connB });
    check('the connection itself stays open until someone ends it or blocks', status.status === 'active');
  });

  await group('export: your own data, never the other persons words, identity or closet', async () => {
    const mine = await ok(bea, 'export_my_pro_data');
    const text = JSON.stringify(mine);
    check('the client\'s export has her settings and her connection', typeof mine.settings === 'object' && mine.settings.adultConfirmedAt !== null && Array.isArray(mine.connections) && mine.connections.length >= 1, text.slice(0, 200));
    check('it holds none of the stylist\'s words', !text.includes('Hello Bea, welcome!') && !text.includes('Call me on 555'));
    check('but it does hold what she wrote herself', text.includes('Thank you!'));
    const stylist = await ok(ann, 'export_my_pro_data');
    check('the stylist\'s export has her profile, and the invites without their codes', stylist.stylistProfile?.displayName === 'Ann Styles' && stylist.invites.length >= 1 && stylist.invites.every(i => !('code' in i)) && !JSON.stringify(stylist).includes(S.inv2.code));
    check('and none of the client\'s closet', !JSON.stringify(stylist).includes('Zara') && !JSON.stringify(stylist).includes('private note'));
  });

  await group('blocking: a closed shell that never says blocked, and does not change on unblock', async () => {
    await fails(bea, 'block_pro_member', {}, { message: 'invalid_request' });
    await fails(bea, 'block_pro_member', { p_connection: S.connB, p_invite: S.inviteSeen }, { message: 'invalid_request' });
    // Ann and Bea are friends as well: a block must end that too, or the folder-wide read of photos would stay.
    const friend = await rest('POST', 'friend_requests', { body: { requester_id: ann.id, recipient_id: bea.id, status: 'accepted' } });
    check('the friendship was set up', friend.status < 300, `HTTP ${friend.status} ${errText(friend.err)}`);
    const control = await send('GET', `/storage/v1/object/authenticated/wardrobe-images/${bea.id}/test.jpg`, { actor: ann });
    check('positive control: as a friend, Ann can read Bea\'s photo from storage', control.status === 200, `HTTP ${control.status}`);

    await ok(bea, 'block_pro_member', { p_connection: S.connB });
    const friends = rowsOf(await rest('GET', 'friend_requests', { query: `select=id&or=(and(requester_id.eq.${ann.id},recipient_id.eq.${bea.id}),and(requester_id.eq.${bea.id},recipient_id.eq.${ann.id}))` }));
    check('the friendship is gone', friends.length === 0, `${friends.length} rows`);
    // A new query string: the storage layer lets the same person replay their own earlier answer for the same address for a
    // short while (a stranger asking for that address is refused at once), so the address must be one Ann has not asked for.
    const after = await send('GET', `/storage/v1/object/authenticated/wardrobe-images/${bea.id}/test.jpg?after-block=${RUN}`, { actor: ann });
    check('and Ann\'s storage read of Bea\'s folder is refused', after.status !== 200, `HTTP ${after.status}`);

    const aList = await ok(ann, 'list_pro_connections', { p_as: 'stylist' });
    const shell = aList.find(r => r.connection_id === S.connB);
    check('the blocked stylist sees a closed row labelled "Former client"', shell?.status === 'ended' && shell.other_label === 'Former client' && shell.last_message_preview === null && shell.closet_shared === false, JSON.stringify(shell));
    const aDetail = await ok(ann, 'get_pro_connection', { p_connection: S.connB });
    check('the detail is the same shell, with every action off', aDetail.status === 'ended' && aDetail.otherLabel === 'Former client' && aDetail.endedBy === 'them' && Object.values(aDetail.actions).every(v => v === false) && aDetail.counts.looks === 0, JSON.stringify(aDetail));
    const aThread = await ok(ann, 'get_pro_thread', { p_connection: S.connB });
    const aLooks = await ok(ann, 'list_pro_recommendations', { p_connection: S.connB });
    const aSessions = await ok(ann, 'list_pro_appointments', { p_connection: S.connB, p_scope: 'past' });
    check('its messages, looks and sessions are gone', aThread.messages.length === 0 && aLooks.length === 0 && aSessions.length === 0);
    await fails(ann, 'get_client_closet', { p_connection: S.connB }, 'pro_unavailable');
    await fails(ann, 'send_pro_message', { p_connection: S.connB, p_body: 'Hello?', p_client_ref: uuid() }, 'connection_ended');
    check('nothing she can read says "blocked"', !/block/i.test(JSON.stringify([aList, aDetail, aThread])));
    const bDetail = await ok(bea, 'get_pro_connection', { p_connection: S.connB });
    check('the blocker sees the same closed shell, ended by her', bDetail.status === 'ended' && bDetail.endedBy === 'me' && bDetail.otherLabel === 'Former stylist' && bDetail.stylist === null);

    const blocks = await ok(bea, 'list_pro_blocks');
    check('the block is listed under a label and an opaque ref, never an email', blocks.length === 1 && blocks[0].label === 'Ann Styles' && blocks[0].ref !== ann.id && typeof blocks[0].blocked_at === 'string', JSON.stringify(blocks));
    const oldList = await rest('GET', 'user_blocks', { actor: bea, query: 'select=*', prefer: 'return=representation' });
    check('and it is hidden from the old blocked-people list', oldList.status === 200 && rowsOf(oldList).length === 0, `HTTP ${oldList.status} ${rowsOf(oldList).length} rows`);
    await ok(bea, 'unblock_pro_member', { p_ref: blocks[0].ref });
    check('unblocking empties the list', (await ok(bea, 'list_pro_blocks')).length === 0);
    const aAfter = await ok(ann, 'get_pro_connection', { p_connection: S.connB });
    const aThreadAfter = await ok(ann, 'get_pro_thread', { p_connection: S.connB });
    check('and changes nothing for Ann: the same shell, no content comes back', aAfter.status === 'ended' && aAfter.otherLabel === 'Former client' && aThreadAfter.messages.length === 0);

    // A client who previewed a code and wants that stylist gone before ever connecting.
    await ok(cat, 'block_pro_member', { p_invite: S.inviteSeen });
    const catBlocks = await ok(cat, 'list_pro_blocks');
    check('a block from an invite preview is listed under the stylist\'s name', catBlocks.length === 1 && catBlocks[0].label === 'Ann Styles');
    const catPreview = await result(cat, 'preview_pro_invite', { p_code: S.inv4.code });
    check('her codes now answer as invalid to the blocker', catPreview.status === 200 && catPreview.body?.valid === false);
    const catView = await ok(cat, 'list_pro_connections');
    check('the earlier connection with that stylist is a closed shell for her too', catView.find(r => r.connection_id === S.connC)?.other_label === 'Former stylist');
  });

  await group('housekeeping: the upkeep really runs through the API (a bare write inside it would fail silently)', async () => {
    // pro_refresh and pro_janitor swallow their own errors, so "it answered" proves nothing. These checks make them
    // do something and look at the rows: if any statement inside had been refused for lacking a WHERE, the whole
    // block would have been rolled back and none of this would have happened.
    const connect = async (stylist, client, alias) => {
      await ok(stylist, 'accept_pro_terms', { p_role: 'stylist', p_version: STYLIST_TERMS_VERSION, p_adult: true });
      await ok(stylist, 'save_stylist_profile', { p_display_name: `${cap(stylist.name)} Styles`, p_services: ['outfit_styling'], p_languages: ['en'] });
      const invite = await ok(stylist, 'create_pro_invite', { p_client_ref: uuid() });
      await ok(client, 'accept_pro_terms', { p_role: 'client', p_version: CLIENT_TERMS_VERSION, p_adult: true });
      const joined = await ok(client, 'redeem_pro_invite', { p_code: invite.code, p_alias: alias });
      return joined.connectionId;
    };
    await signUp(dee);
    await signUp(gus);
    S.gusItems = await addItems(gus, [{ name: 'Gus parka', category: 'outerwear' }]);
    S.connG = await connect(dee, gus, 'Gus G');
    const grant = await ok(gus, 'set_pro_grant', { p_connection: S.connG, p_scope: 'closet', p_enabled: true, p_item_mode: 'all', p_text_version: SHARE_TEXT_VERSION });
    check('the pair is connected and sharing', grant.enabled === true);

    // 1. an expired grant is swept, with exactly one event, by whoever reads next
    const aged = await rest('PATCH', 'pro_grants', { query: `connection_id=eq.${S.connG}`, body: { expires_at: new Date(Date.now() - 3600e3).toISOString() } });
    check('the grant was aged', aged.status < 300 && rowsOf(aged).length === 1, `HTTP ${aged.status}`);
    await ok(gus, 'list_pro_connections');
    await ok(dee, 'list_pro_connections', { p_as: 'stylist' });
    const gone = await rest('GET', 'pro_grants', { query: `select=connection_id&connection_id=eq.${S.connG}` });
    const events = await rest('GET', 'pro_grant_events', { query: `select=event&connection_id=eq.${S.connG}&event=eq.expired` });
    check('the expired grant was removed by a read', rowsOf(gone).length === 0, `${rowsOf(gone).length} rows left`);
    check('and one "expired" event was written, not two', rowsOf(events).length === 1, `${rowsOf(events).length} events`);
    await fails(dee, 'get_client_closet', { p_connection: S.connG }, 'closet_not_shared');

    // 2. a proposal whose start has passed expires, and a confirmed session that is over completes
    const p1 = await ok(gus, 'propose_pro_appointment', { p_connection: S.connG, p_starts_at: inDays(4, 9), p_duration_minutes: 60, p_mode: 'virtual', p_client_ref: uuid() });
    const p2 = await ok(gus, 'propose_pro_appointment', { p_connection: S.connG, p_starts_at: inDays(5, 9), p_duration_minutes: 60, p_mode: 'virtual', p_client_ref: uuid() });
    await ok(dee, 'respond_pro_appointment', { p_appointment: p2.appointmentId, p_action: 'confirm' });
    const long = new Date(Date.now() - 3 * 3600e3).toISOString();
    const a1 = await rest('PATCH', 'pro_appointments', { query: `id=eq.${p1.appointmentId}`, body: { starts_at: long } });
    const a2 = await rest('PATCH', 'pro_appointments', { query: `id=eq.${p2.appointmentId}`, body: { starts_at: long } });
    check('the sessions were aged', a1.status < 300 && a2.status < 300 && rowsOf(a1).length === 1 && rowsOf(a2).length === 1);
    const seen = await ok(dee, 'list_pro_appointments', { p_connection: S.connG, p_scope: 'past' });
    check('the lists show them as expired and completed', seen.find(r => r.appointment_id === p1.appointmentId)?.status === 'expired' && seen.find(r => r.appointment_id === p2.appointmentId)?.status === 'completed', JSON.stringify(seen.map(r => r.status)));
    const stored = rowsOf(await rest('GET', 'pro_appointments', { query: `select=id,status&id=in.(${p1.appointmentId},${p2.appointmentId})` }));
    check('and the upkeep stored that', stored.find(r => r.id === p1.appointmentId)?.status === 'expired' && stored.find(r => r.id === p2.appointmentId)?.status === 'completed', JSON.stringify(stored));

    // 3. the janitor deletes what is old, in bounded statements
    const oldConnection = await rest('POST', 'pro_connections', { body: { status: 'ended', started_at: new Date(Date.now() - 200 * 86400e3).toISOString(), ended_at: new Date(Date.now() - 100 * 86400e3).toISOString(), ended_by: 'system' } });
    const oldCounter = await rest('POST', 'pro_rate_counters', { body: { user_id: eve.id, bucket: 'api_check_day', window_start: new Date(Date.now() - 5 * 86400e3).toISOString(), n: 1 } });
    const oldInvite = await rest('POST', 'pro_invites', { body: { stylist_id: dee.id, code: randomCode(), status: 'revoked', revoked_at: new Date(Date.now() - 40 * 86400e3).toISOString(), expires_at: new Date(Date.now() - 33 * 86400e3).toISOString(), client_ref: uuid() } });
    const oldView = await rest('POST', 'pro_closet_views', { body: { connection_id: S.connG, day: new Date(Date.now() - 120 * 86400e3).toISOString().slice(0, 10), pages: 1 } });
    const oldMessage = await rest('POST', 'pro_messages', { body: { connection_id: S.connG, sender_id: gus.id, kind: 'text', body: 'very old', created_at: new Date(Date.now() - 200 * 86400e3).toISOString() } });
    check('old rows were planted', [oldConnection, oldCounter, oldInvite, oldView, oldMessage].every(r => r.status < 300), [oldConnection, oldCounter, oldInvite, oldView, oldMessage].map(r => r.status).join());
    await ok(service, 'pro_janitor', { p_force: true });
    const left = {
      connection: rowsOf(await rest('GET', 'pro_connections', { query: `select=id&id=eq.${rowsOf(oldConnection)[0]?.id}` })).length,
      counter: rowsOf(await rest('GET', 'pro_rate_counters', { query: `select=bucket&bucket=eq.api_check_day&user_id=eq.${eve.id}` })).length,
      invite: rowsOf(await rest('GET', 'pro_invites', { query: `select=id&id=eq.${rowsOf(oldInvite)[0]?.id}` })).length,
      view: rowsOf(await rest('GET', 'pro_closet_views', { query: `select=day&connection_id=eq.${S.connG}&pages=eq.1&day=lt.${new Date(Date.now() - 100 * 86400e3).toISOString().slice(0, 10)}` })).length,
      message: rowsOf(await rest('GET', 'pro_messages', { query: `select=id&id=eq.${rowsOf(oldMessage)[0]?.id}` })).length,
    };
    check('the janitor removed the old ended connection, rate counter, revoked invite, view counter and message', Object.values(left).every(n => n === 0), JSON.stringify(left));
    await ok(service, 'pro_janitor');
  });

  await group('administration: the service-role functions, with the service key', async () => {
    const backlog = await ok(service, 'pro_report_backlog', { p_older_than: '0 seconds' });
    check('the report backlog counts the unreviewed reports from this run', Array.isArray(backlog) && backlog.length === 1 && backlog[0].waiting >= 3, JSON.stringify(backlog));
    const digest = await ok(service, 'pro_send_report_digest', { p_older_than: '4 hours' }, { shape: false });
    check('the digest answers a boolean and never raises', typeof digest === 'boolean', JSON.stringify(digest));
    const queue = await rest('GET', 'pro_moderation_queue', { query: 'select=id,context,reason,reporter_id,reported_user_id&limit=200' });
    check('the moderation queue lists this run\'s reports, with the safety reasons first', queue.status === 200 && rowsOf(queue).some(r => r.reporter_id === bea.id && r.reason === 'harassment'), `HTTP ${queue.status}`);
    for (const view of VIEWS) {
      for (const who of [anon, ann]) {
        const res = await rest('GET', view, { actor: who, query: 'select=*&limit=1' });
        check(`${who.name} cannot read ${view}`, isRefusal(res), `HTTP ${res.status}`);
      }
    }

    const review = rowsOf(await rest('GET', 'pro_review_queue', { query: `select=user_id,display_name&user_id=eq.${dee.id}` }));
    check('a stylist on probation is in the review queue', review.length === 1 && review[0].display_name === 'Dee Styles', JSON.stringify(review));
    await ok(service, 'pro_admin_approve_stylist', { p_user: dee.id });
    check('and leaves it when approved', rowsOf(await rest('GET', 'pro_review_queue', { query: `select=user_id&user_id=eq.${dee.id}` })).length === 0);
    check('Dee\'s profile says approved', (await ok(dee, 'get_my_stylist_profile')).approved === true);
    await ok(dee, 'close_stylist_profile');
    check('closing the profile deletes it', (await ok(dee, 'get_my_stylist_profile')) === null);
    await fails(dee, 'list_my_pro_invites', {}, 'stylist_profile_required');
    const closed = (await ok(gus, 'list_pro_connections')).find(r => r.connection_id === S.connG);
    check('and ends her client\'s connection, by her', closed?.status === 'ended' && closed.ended_by === 'stylist', JSON.stringify(closed));
    const again = await ok(dee, 'save_stylist_profile', { p_display_name: 'Dee Styles', p_services: ['outfit_styling'] });
    check('starting again does not undo the approval', again.approved === true);
    await ok(service, 'pro_admin_approve_stylist', { p_user: ann.id });
    const stAnn = await ok(ann, 'get_pro_status');
    check('approval lifts the caps (25 clients, 10 live codes)', stAnn.stylist.approved === true && stAnn.stylist.clientLimit === 25 && stAnn.stylist.inviteLimit === 10);

    await ok(service, 'pro_admin_hold_stylist', { p_user: dee.id });
    await fails(dee, 'create_pro_invite', { p_client_ref: uuid() }, 'invites_held');
    check('a held stylist is told so in her status', (await ok(dee, 'get_pro_status')).stylist.invitesHeld === true);
    await ok(service, 'pro_admin_release_stylist', { p_user: dee.id });
    const freed = await ok(dee, 'create_pro_invite', { p_client_ref: uuid() });
    check('releasing the hold lets her create a code again', typeof freed.code === 'string');

    await ok(service, 'pro_admin_suspend', { p_user: cat.id, p_reason: 'api check' });
    const suspendedList = [...await ok(cat, 'list_pro_connections', { p_as: 'client' }), ...await ok(ann, 'list_pro_connections', { p_as: 'stylist' })];
    check('a suspension is never shown as one: no row of either list says "system"', suspendedList.length > 0 && suspendedList.every(r => r.ended_by !== 'system'), JSON.stringify(suspendedList.map(r => r.ended_by)));
    const susp = await ok(cat, 'get_pro_status');
    check('a suspended person is told, and the feature is closed to her', susp.suspended === true);
    await fails(cat, 'preview_pro_invite', { p_code: randomCode() }, 'pro_suspended');
    await ok(cat, 'export_my_pro_data');
    await ok(service, 'pro_admin_unsuspend', { p_user: cat.id });
    check('lifting the suspension restores her access', (await ok(cat, 'get_pro_status')).suspended === false);

    await ok(service, 'pro_admin_remove_stylist', { p_user: dee.id, p_reason: 'api check' });
    const removed = await ok(dee, 'get_pro_status');
    check('a removed stylist has no profile, and her connection ended', removed.stylistRemoved === true && removed.stylist === null);
    const deeBack = await fails(dee, 'save_stylist_profile', { p_display_name: 'Dee Styles', p_services: ['outfit_styling'] }, { message: 'stylist_profile_removed', hint: 'email support' });
    check('and she cannot start again until she is restored', deeBack !== null);
    await ok(service, 'pro_admin_restore_stylist', { p_user: dee.id });
    const deeAgain = await ok(dee, 'save_stylist_profile', { p_display_name: 'Dee Styles', p_services: ['outfit_styling'] });
    check('restoring allows a new profile', deeAgain.displayName === 'Dee Styles');
  });

  await group('deleting an account: the client first, then the stylist', async () => {
    const pair = async (stylist, client) => {
      await signUp(stylist);
      await signUp(client);
      const mine = await addItems(client, [{ name: `${cap(client.name)} coat`, category: 'outerwear' }]);
      const item = Object.values(mine)[0];
      await ok(stylist, 'accept_pro_terms', { p_role: 'stylist', p_version: STYLIST_TERMS_VERSION, p_adult: true });
      await ok(stylist, 'save_stylist_profile', { p_display_name: `${cap(stylist.name)} Styles`, p_services: ['outfit_styling'], p_languages: ['en'] });
      const invite = await ok(stylist, 'create_pro_invite', { p_client_ref: uuid() });
      await ok(client, 'accept_pro_terms', { p_role: 'client', p_version: CLIENT_TERMS_VERSION, p_adult: true });
      const joined = await ok(client, 'redeem_pro_invite', { p_code: invite.code, p_alias: `${cap(client.name)} Client` });
      const c = joined.connectionId;
      await ok(client, 'set_pro_grant', { p_connection: c, p_scope: 'closet', p_enabled: true, p_item_mode: 'selected', p_item_ids: [item], p_text_version: SHARE_TEXT_VERSION });
      await ok(stylist, 'get_client_closet', { p_connection: c });
      const look = await ok(stylist, 'save_pro_recommendation', { p_connection: c, p_title: 'A look', p_body: 'Wear it', p_item_ids: [item], p_client_ref: uuid() });
      await ok(stylist, 'send_pro_recommendation', { p_id: look.id });
      await ok(client, 'give_recommendation_feedback', { p_id: look.id, p_rating: 5 });
      await ok(stylist, 'send_pro_message', { p_connection: c, p_body: 'Hello from the stylist', p_client_ref: uuid() });
      await ok(client, 'send_pro_message', { p_connection: c, p_body: 'Hello from the client', p_client_ref: uuid() });
      await ok(stylist, 'propose_pro_appointment', { p_connection: c, p_starts_at: inDays(6, 11), p_duration_minutes: 45, p_mode: 'virtual', p_client_ref: uuid() });
      return { c, look: look.id };
    };
    const rowsFor = async who => {
      const byUser = [['pro_members', 'user_id'], ['pro_stylists', 'user_id'], ['pro_invites', 'stylist_id'], ['pro_messages', 'sender_id'], ['pro_rate_counters', 'user_id']];
      const found = {};
      for (const [table, col] of byUser) found[table] = rowsOf(await rest('GET', table, { query: `select=${col}&${col}=eq.${who.id}` })).length;
      found.pro_connections = rowsOf(await rest('GET', 'pro_connections', { query: `select=id&or=(stylist_id.eq.${who.id},client_id.eq.${who.id})` })).length;
      return Object.fromEntries(Object.entries(found).filter(([, n]) => n > 0));
    };
    const under = async (c, look) => {
      const found = {};
      for (const table of ['pro_grants', 'pro_grant_items', 'pro_grant_events', 'pro_closet_views', 'pro_recommendations', 'pro_appointments']) {
        found[table] = rowsOf(await rest('GET', table, { query: `select=connection_id&connection_id=eq.${c}` })).length;
      }
      found.pro_recommendation_items = rowsOf(await rest('GET', 'pro_recommendation_items', { query: `select=position&recommendation_id=eq.${look}` })).length;
      return Object.fromEntries(Object.entries(found).filter(([, n]) => n > 0));
    };
    const exists = async c => rowsOf(await rest('GET', 'pro_connections', { query: `select=id,status,client_id,stylist_id,client_alias,stylist_label&id=eq.${c}` }))[0];

    // A: the client leaves first.
    const a = await pair(xan, yui);
    if (!(await deleteAccount(yui))) throw new Abort('delete yui');
    check('nothing of the departed client is left in any pro table', JSON.stringify(await rowsFor(yui)) === '{}', JSON.stringify(await rowsFor(yui)));
    check('the looks, sessions, grant and counters of her connection are gone', JSON.stringify(await under(a.c, a.look)) === '{}', JSON.stringify(await under(a.c, a.look)));
    const conn = await exists(a.c);
    check('the connection is kept for the stylist, ended, with the client\'s side empty', conn?.status === 'ended' && conn.client_id === null && conn.client_alias === null && conn.stylist_id === xan.id, JSON.stringify(conn));
    const listA = await ok(xan, 'list_pro_connections', { p_as: 'stylist' });
    check('the stylist sees a stub labelled "Former client"', listA.length === 1 && listA[0].other_label === 'Former client' && listA[0].status === 'ended', JSON.stringify(listA));
    const threadA = await ok(xan, 'get_pro_thread', { p_connection: a.c });
    check('what the client wrote is gone; the stylist\'s own words and the neutral line remain', threadA.messages.every(m => m.from !== 'them') && threadA.messages.some(m => m.from === 'me') && threadA.messages.at(-1).code === 'ended', JSON.stringify(threadA.messages.map(m => `${m.from}:${m.code ?? ''}`)));
    const detailA = await ok(xan, 'get_pro_connection', { p_connection: a.c });
    check('an account that left reads as "them" ending it', detailA.endedBy === 'them' && detailA.otherLabel === 'Former client');
    if (!(await deleteAccount(xan))) throw new Abort('delete xan');
    check('nothing of the stylist is left either', JSON.stringify(await rowsFor(xan)) === '{}', JSON.stringify(await rowsFor(xan)));
    check('and with nobody left, the connection row is gone', (await exists(a.c)) === undefined);

    // B: the stylist leaves first.
    const b = await pair(zed, wyn);
    if (!(await deleteAccount(zed))) throw new Abort('delete zed');
    check('nothing of the departed stylist is left in any pro table', JSON.stringify(await rowsFor(zed)) === '{}', JSON.stringify(await rowsFor(zed)));
    const connB = await exists(b.c);
    check('the client keeps the connection, ended, labelled by nobody', connB?.status === 'ended' && connB.stylist_id === null && connB.stylist_label === null && connB.client_id === wyn.id, JSON.stringify(connB));
    const listB = await ok(wyn, 'list_pro_connections');
    check('the client sees "Former stylist"', listB.length === 1 && listB[0].other_label === 'Former stylist' && listB[0].status === 'ended', JSON.stringify(listB));
    const looksB = await ok(wyn, 'list_pro_recommendations', { p_connection: b.c });
    const lookB = await ok(wyn, 'get_pro_recommendation', { p_id: b.look });
    check('the look she was sent is still hers to read', looksB.length === 1 && lookB.title === 'A look' && lookB.items.length === 1);
    const sessionsB = await ok(wyn, 'list_pro_appointments', { p_connection: b.c, p_scope: 'past' });
    check('and the session record stays, cancelled', sessionsB.length === 1 && sessionsB[0].status === 'cancelled', JSON.stringify(sessionsB.map(r => r.status)));
    const threadB = await ok(wyn, 'get_pro_thread', { p_connection: b.c });
    check('the stylist\'s messages are gone; the client\'s remain', threadB.messages.every(m => m.from !== 'them') && threadB.messages.some(m => m.from === 'me'), JSON.stringify(threadB.messages.map(m => `${m.from}:${m.code ?? ''}`)));
    const keptB = await under(b.c, b.look);
    check('the grant is gone, and the looks, sessions and history stay for the client', !('pro_grants' in keptB) && !('pro_grant_items' in keptB) && keptB.pro_recommendations === 1 && keptB.pro_appointments === 1, JSON.stringify(keptB));
    if (!(await deleteAccount(wyn))) throw new Abort('delete wyn');
    check('nothing of the client is left, and the connection with it', JSON.stringify(await rowsFor(wyn)) === '{}' && (await exists(b.c)) === undefined);
  });

  // ---- steps end ----
}

// ─── Main ────────────────────────────────────────────────────────────────────

function usage() {
  console.log(`usage: node scripts/pro-api-checks.mjs [--dry-run [--json] [--migrations <dir>]] [--verbose] [--keep] [--require-photo-function]

  Checks the professional-accounts functions through the real API layer of a LOCAL Supabase stack.
  Environment: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (from \`supabase status -o env\`).
  --dry-run needs none of them and makes no network call. See the top of this file.`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { usage(); return 0; }
  if (opts.bad) { usage(); return 2; }
  if (opts.dryRun) return dryRun(opts);

  const env = process.env;
  const target = checkTarget(env.SUPABASE_URL || env.API_URL, env);
  if (!target.ok) {
    console.error(`refusing to run: ${target.reason}`);
    return 1;
  }
  const anonKey = env.SUPABASE_ANON_KEY || env.ANON_KEY;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY;
  if (!anonKey || !serviceKey) {
    console.error('SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are both needed (supabase status -o env prints them)');
    return 2;
  }
  Object.assign(state, { url: target.url, anon: anonKey, service: serviceKey, opts });
  const startedAt = Date.now();
  console.log(`pro-api-checks against ${state.url} (${target.local ? 'a local stack' : 'a remote branch named in PRO_API_ALLOW_REMOTE'})`);

  // An interrupted run still puts the settings back and removes its accounts.
  const onSignal = async signal => {
    if (state.cleaning) return;
    state.interrupted = true;
    console.log(`\n${signal}: cleaning up before exit`);
    try {
      await cleanup();
    } catch (e) {
      console.log(`   clean-up failed: ${e && e.message}`);
    }
    process.exit(130);
  };
  process.once('SIGINT', () => onSignal('SIGINT'));
  process.once('SIGTERM', () => onSignal('SIGTERM'));

  let stopped = null;
  try {
    await runChecks(opts);
  } catch (e) {
    stopped = e;
    console.log(`\nSTOPPED: ${e instanceof Fatal ? e.message : e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e)}`);
  }
  if (state.interrupted) await new Promise(() => {});    // the signal handler is finishing the clean-up and then exits
  try {
    await cleanup();
  } catch (e) {
    console.log(`   clean-up failed: ${e && e.message}`);
    report.failed.push('clean-up');
  }

  console.log('\n== summary');
  console.log(`   ${report.passed} checks passed, ${report.failed.length} failed, ${report.skipped.length} skipped; ${state.calls} function calls through the API in ${Math.round((Date.now() - startedAt) / 1000)}s`);
  for (const s of report.skipped) console.log(`   skipped: ${s}`);
  for (const f of report.failed) console.log(`   FAILED:  ${f}`);
  if (stopped || report.failed.length) {
    console.log(stopped ? '   the run stopped early; what is above is all it proved' : '   not clean');
    return 1;
  }
  console.log('   clean');
  return 0;
}

const invokedDirectly = (() => {
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(SELF);
  } catch {
    return false;
  }
})();
if (invokedDirectly) {
  main().then(
    code => { process.exitCode = code; },
    e => { console.error(e); process.exitCode = 2; },
  );
}
