/**
 * Professional accounts (stylists and their clients): the only module the screens talk to. Every function
 *  - throws ProError('not_authenticated') for a guest, before any network call, and
 *  - turns server errors into ProError (see proErrors.ts).
 * Every server call is one statement that names the function and passes a literal object of p_ arguments, so
 * the names can be read from this file and compared with the SQL (documentation/design/pro-accounts.md 4.6, 7.6).
 * An argument whose value is undefined is left out. No module-level side effects (App.test imports every
 * screen's module graph), no AsyncStorage keys, no realtime channels, and nothing about another person is kept
 * anywhere.
 *
 * Server functions: supabase/migrations/20261023000300..0700_pro_*.sql (working versions; renamed at release)
 */
import { supabase } from '../config/supabase';
import { ProError, toProError } from './proErrors';
import { PRO_CLIENT_TERMS_VERSION, PRO_SHARE_TEXT_VERSION, PRO_STYLIST_TERMS_VERSION } from '../config/proRules';
import { deviceUtcOffsetMinutes, normaliseCode } from '../utils/proFormat';
import type {
  InvitePreview, ProAppointment, ProBlock, ProClosetItem, ProClosetPage, ProConnectionDetail, ProConnectionSummary,
  ProExport, ProGrant, ProGrantInput, ProInvite, ProLookDetail, ProLookInput, ProLookSummary, ProMessage,
  ProposeSessionInput, ProProposedSession, ProRedeemResult, ProReportReason, ProReportRefType, ProRole, ProSavedLook,
  ProSentMessage, ProSessionScope, ProStatus, ProThread, StylistProfile, StylistProfileInput,
} from '../types/pro';

// ─── plumbing ────────────────────────────────────────────────────────────────

const requireSession = async (): Promise<void> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new ProError('not_authenticated');
};

const withoutUndefined = (args: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(args)) {
    if (args[key] !== undefined) out[key] = args[key];
  }
  return out;
};

const call = async <T>(fn: string, args?: Record<string, unknown>): Promise<T> => {
  await requireSession();
  let answer;
  try {
    answer = await supabase.rpc(fn, args ? withoutUndefined(args) : undefined);
  } catch (e) {
    throw toProError(e);   // a request that never got an answer (offline) is a ProError like any other
  }
  if (answer.error) throw toProError(answer.error);
  return answer.data as T;
};

const opt = <T>(v: T | null | undefined): T | undefined => (v === null || v === undefined ? undefined : v);
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const optStr = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);
const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
};
const optNum = (v: unknown): number | undefined => {
  if (v === null || v === undefined) return undefined;
  const n = num(v, NaN);
  return Number.isFinite(n) ? n : undefined;
};
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const rows = (v: unknown): any[] => (Array.isArray(v) ? v : []);

// ─── row mapping (tables come back snake_case, jsonb results camelCase) ──────

export const mapStatus = (j: any): ProStatus => {
  if (!j || typeof j !== 'object') throw new ProError('unknown', 'get_pro_status returned nothing');
  const s = j.stylist;
  return {
    proEnabled: Boolean(j.proEnabled),
    suspended: Boolean(j.suspended),
    adultConfirmed: Boolean(j.adultConfirmed),
    stylistRemoved: Boolean(j.stylistRemoved),
    versions: {
      stylistTerms: str(j.versions?.stylistTerms),
      clientTerms: str(j.versions?.clientTerms),
      shareText: str(j.versions?.shareText),
    },
    stylist: s && typeof s === 'object'
      ? {
        termsCurrent: Boolean(s.termsCurrent),
        accepting: Boolean(s.accepting),
        approved: Boolean(s.approved),
        invitesHeld: Boolean(s.invitesHeld),
        activeClients: num(s.activeClients),
        clientLimit: num(s.clientLimit),
        liveInvites: num(s.liveInvites),
        inviteLimit: num(s.inviteLimit),
      }
      : null,
    client: {
      termsCurrent: Boolean(j.client?.termsCurrent),
      connections: num(j.client?.connections),
      connectionLimit: num(j.client?.connectionLimit),
    },
    badge: num(j.badge),
  };
};

export const mapStylistProfile = (j: any): StylistProfile => {
  if (!j || typeof j !== 'object') throw new ProError('unknown', 'the stylist profile came back empty');
  return {
    displayName: str(j.displayName),
    headline: str(j.headline),
    bio: str(j.bio),
    services: strList(j.services),
    languages: strList(j.languages),
    ratesText: str(j.ratesText),
    accepting: Boolean(j.accepting),
    approved: Boolean(j.approved),
    invitesHeld: Boolean(j.invitesHeld),
    createdAt: str(j.createdAt),
  };
};

/** get_my_stylist_profile answers null while there is no profile. */
export const mapMyStylistProfile = (j: any): StylistProfile | null => (j && typeof j === 'object' ? mapStylistProfile(j) : null);

/** A row of list_my_pro_invites. */
export const mapInviteRow = (r: any): ProInvite => ({
  id: r.invite_id,
  code: str(r.code),
  label: optStr(r.label),
  status: r.status,
  createdAt: r.created_at,
  expiresAt: r.expires_at,
  usedAt: opt(r.used_at),
  connected: Boolean(r.connected),
});

/** What create_pro_invite returns (jsonb): the same shape as a row, without the label (a private reference the server never echoes). */
export const mapCreatedInvite = (j: any): ProInvite => {
  if (!j || typeof j !== 'object') throw new ProError('unknown', 'create_pro_invite returned nothing');
  return {
    id: j.inviteId,
    code: str(j.code),
    status: j.status,
    createdAt: j.createdAt,
    expiresAt: j.expiresAt,
    connected: Boolean(j.connected),
  };
};

const mapStylistCard = (s: any): InvitePreview['stylist'] => ({
  name: str(s?.name),
  headline: str(s?.headline),
  bio: str(s?.bio),
  services: strList(s?.services),
  languages: strList(s?.languages),
  ratesText: str(s?.ratesText),
});

/** { valid: false } is the one answer for every failure of a code; it becomes ProError('invite_invalid'). */
export const mapPreviewResult = (j: any): InvitePreview => {
  if (!j || typeof j !== 'object') throw new ProError('unknown', 'preview_pro_invite returned nothing');
  if (j.valid !== true) throw new ProError('invite_invalid');
  return {
    inviteId: j.inviteId,
    alreadyConnected: Boolean(j.alreadyConnected),
    clientTermsCurrent: Boolean(j.clientTermsCurrent),
    stylist: mapStylistCard(j.stylist),
  };
};

/** { ok: false } likewise. */
export const mapRedeemResult = (j: any): ProRedeemResult => {
  if (!j || typeof j !== 'object') throw new ProError('unknown', 'redeem_pro_invite returned nothing');
  if (j.ok !== true) throw new ProError('invite_invalid');
  return { connectionId: j.connectionId, alreadyConnected: Boolean(j.alreadyConnected) };
};

export const mapConnectionRow = (r: any): ProConnectionSummary => ({
  id: r.connection_id,
  myRole: r.my_role,
  otherLabel: str(r.other_label),
  otherHeadline: optStr(r.other_headline),
  status: r.status,
  endedBy: opt(r.ended_by),
  startedAt: r.started_at,
  endedAt: opt(r.ended_at),
  lastActivityAt: r.last_activity_at,
  unread: num(r.unread),
  attention: Boolean(r.attention),
  nextAppointmentAt: opt(r.next_appointment_at),
  pendingAppointments: num(r.pending_appointments),
  closetShared: Boolean(r.closet_shared),
  closetExpiresAt: opt(r.closet_expires_at),
  lastMessagePreview: optStr(r.last_message_preview),
  lastMessageAt: opt(r.last_message_at),
});

export const mapConnectionDetail = (j: any): ProConnectionDetail => {
  if (!j || typeof j !== 'object') throw new ProError('pro_unavailable');
  const c = j.closet ?? {};
  const a = j.actions ?? {};
  return {
    id: j.connectionId,
    myRole: j.myRole,
    status: j.status,
    endedBy: j.endedBy === 'me' || j.endedBy === 'them' ? j.endedBy : null,
    startedAt: j.startedAt,
    endedAt: opt(j.endedAt),
    otherLabel: str(j.otherLabel),
    myAlias: typeof j.myAlias === 'string' ? j.myAlias : null,
    safetyOnly: Boolean(j.safetyOnly),
    stylist: j.stylist && typeof j.stylist === 'object' ? mapStylistCard(j.stylist) : null,
    closet: {
      shared: Boolean(c.shared),
      itemMode: c.itemMode === 'all' || c.itemMode === 'selected' ? c.itemMode : null,
      itemCount: c.itemCount === null || c.itemCount === undefined ? null : num(c.itemCount),
      expiresAt: typeof c.expiresAt === 'string' ? c.expiresAt : null,
      expiresSoon: Boolean(c.expiresSoon),
      lastViewedAt: typeof c.lastViewedAt === 'string' ? c.lastViewedAt : null,
      views30d: num(c.views30d),
    },
    counts: { looks: num(j.counts?.looks), upcoming: num(j.counts?.upcoming) },
    actions: {
      canMessage: Boolean(a.canMessage),
      canPropose: Boolean(a.canPropose),
      canRecommend: Boolean(a.canRecommend),
      canEnd: Boolean(a.canEnd),
      canViewCloset: Boolean(a.canViewCloset),
      canShare: Boolean(a.canShare),
      canStopSharing: Boolean(a.canStopSharing),
      canRename: Boolean(a.canRename),
    },
  };
};

export const mapGrant = (j: any): ProGrant => {
  if (!j || typeof j !== 'object') throw new ProError('pro_unavailable');
  return {
    scope: 'closet',
    enabled: Boolean(j.enabled),
    itemMode: j.itemMode === 'all' || j.itemMode === 'selected' ? j.itemMode : null,
    itemIds: Array.isArray(j.itemIds) ? strList(j.itemIds) : undefined,
    itemCount: optNum(j.itemCount),
    grantedAt: opt(j.grantedAt),
    expiresAt: opt(j.expiresAt),
    expiresSoon: j.expiresSoon === undefined || j.expiresSoon === null ? undefined : Boolean(j.expiresSoon),
    textVersion: opt(j.textVersion),
    lastViewedAt: opt(j.lastViewedAt),
    views30d: optNum(j.views30d),
    events: Array.isArray(j.events)
      ? j.events.map((e: any) => ({ event: str(e.event), itemMode: opt(e.itemMode), itemCount: optNum(e.itemCount), at: str(e.at) }))
      : undefined,
  };
};

export const mapClosetRow = (r: any): ProClosetItem => ({
  id: r.item_id,
  name: str(r.name),
  category: str(r.category),
  subcategory: optStr(r.subcategory),
  color: optStr(r.color),
  brand: optStr(r.brand),
  season: opt(r.season),
  pattern: optStr(r.pattern),
  material: optStr(r.material),
  materials: opt(r.materials),
  size: optStr(r.size),
  condition: optStr(r.condition),
  hasPhoto: Boolean(r.has_photo),
});

/** The page of rows, with the total the server repeats on every row (0 for an empty page). */
export const mapClosetPage = (data: any): ProClosetPage => {
  const list = rows(data);
  return { items: list.map(mapClosetRow), total: list.length ? num(list[0].total_count) : 0 };
};

export const mapLookRow = (r: any): ProLookSummary => ({
  id: r.rec_id,
  status: r.status,
  title: str(r.title),
  itemCount: num(r.item_count),
  coverItemId: opt(r.cover_item_id),
  coverPhotoPath: opt(r.cover_photo_path),
  sentAt: opt(r.sent_at),
  viewedAt: opt(r.viewed_at),
  updatedAt: r.updated_at,
  clientRating: optNum(r.client_rating),
  isNew: Boolean(r.is_new),
});

export const mapLookDetail = (j: any): ProLookDetail => {
  if (!j || typeof j !== 'object') throw new ProError('pro_unavailable');
  const a = j.actions ?? {};
  return {
    id: j.id,
    connectionId: j.connectionId,
    status: j.status,
    title: str(j.title),
    body: str(j.body),
    sentAt: opt(j.sentAt),
    viewedAt: opt(j.viewedAt),
    implementedAt: opt(j.implementedAt),
    items: rows(j.items).map((i: any) => ({
      position: num(i.position),
      itemId: opt(i.itemId),
      name: str(i.name),
      category: optStr(i.category),
      color: optStr(i.color),
      brand: optStr(i.brand),
      hasPhoto: Boolean(i.hasPhoto),
      photoPath: opt(i.photoPath),
      available: Boolean(i.available),
    })),
    feedback: j.feedback && typeof j.feedback === 'object'
      ? { rating: optNum(j.feedback.rating), comment: optStr(j.feedback.comment), at: str(j.feedback.at) }
      : null,
    actions: {
      canEdit: Boolean(a.canEdit),
      canSend: Boolean(a.canSend),
      canDelete: Boolean(a.canDelete),
      canGiveFeedback: Boolean(a.canGiveFeedback),
      canMarkWorn: Boolean(a.canMarkWorn),
    },
  };
};

export const mapSavedLook = (j: any): ProSavedLook => {
  if (!j || typeof j !== 'object') throw new ProError('unknown', 'save_pro_recommendation returned nothing');
  return { id: j.id, status: j.status, updatedAt: j.updatedAt };
};

export const mapAppointmentRow = (r: any): ProAppointment => ({
  id: r.appointment_id,
  connectionId: r.connection_id,
  otherLabel: str(r.other_label),
  myRole: r.my_role,
  status: r.status,
  proposedBy: r.proposed_by,
  startsAt: r.starts_at,
  durationMinutes: num(r.duration_minutes),
  mode: r.mode,
  place: str(r.place),
  note: str(r.note),
  utcOffsetMinutes: num(r.utc_offset_minutes),
  canConfirm: Boolean(r.can_confirm),
  canDecline: Boolean(r.can_decline),
  canCancel: Boolean(r.can_cancel),
  createdAt: r.created_at,
});

export const mapProposedSession = (j: any): ProProposedSession => {
  if (!j || typeof j !== 'object') throw new ProError('unknown', 'propose_pro_appointment returned nothing');
  return { id: j.appointmentId, status: j.status };
};

export const mapSentMessage = (j: any): ProSentMessage => {
  if (!j || typeof j !== 'object') throw new ProError('unknown', 'send_pro_message returned nothing');
  return { id: num(j.messageId), at: j.createdAt };
};

export const mapThread = (j: any): ProThread => {
  if (!j || typeof j !== 'object') throw new ProError('pro_unavailable');
  return {
    messages: rows(j.messages).map((m: any): ProMessage => ({
      id: num(m.id),
      from: m.from === 'me' || m.from === 'system' ? m.from : 'them',
      body: str(m.body),
      code: optStr(m.code),
      at: str(m.at),
    })),
    hasMore: Boolean(j.hasMore),
    canSend: Boolean(j.actions?.canSend),
  };
};

export const mapBlockRow = (r: any): ProBlock => ({ ref: r.ref, label: str(r.label), blockedAt: r.blocked_at });

/** The export is the caller's own data in the shape of 8.2; only its four top-level parts are made sure of. */
export const mapExport = (j: any): ProExport => {
  const x = j && typeof j === 'object' ? j : {};
  return {
    settings: x.settings && typeof x.settings === 'object' ? x.settings : {},
    stylistProfile: x.stylistProfile ?? null,
    invites: rows(x.invites),
    connections: rows(x.connections),
  };
};

/**
 * What each RPC's mapper reads: the snake_case columns of a `returns table` function, or the camelCase keys of
 * a jsonb one (top level). proServiceInStepWithSql.test.ts compares the column lists with the migrations, and the
 * live test feeds real responses through PRO_RPC_MAPPERS, so a renamed column cannot break every screen with all
 * suites green. Functions that return nothing are not listed. (A grant's `scope` is always 'closet' in this
 * release, so it is set, not read; the scope check of the table in 3.4 is widened by a later migration.)
 */
export const PRO_RPC_COLUMNS: Record<string, readonly string[]> = {
  get_pro_status: ['proEnabled', 'suspended', 'adultConfirmed', 'stylistRemoved', 'versions', 'stylist', 'client', 'badge'],
  get_my_stylist_profile: ['displayName', 'headline', 'bio', 'services', 'languages', 'ratesText', 'accepting', 'approved', 'invitesHeld', 'createdAt'],
  save_stylist_profile: ['displayName', 'headline', 'bio', 'services', 'languages', 'ratesText', 'accepting', 'approved', 'invitesHeld', 'createdAt'],
  create_pro_invite: ['inviteId', 'code', 'expiresAt', 'createdAt', 'status', 'connected'],
  list_my_pro_invites: ['invite_id', 'code', 'label', 'status', 'created_at', 'expires_at', 'used_at', 'connected'],
  preview_pro_invite: ['valid', 'inviteId', 'stylist', 'alreadyConnected', 'clientTermsCurrent'],
  redeem_pro_invite: ['ok', 'connectionId', 'alreadyConnected'],
  list_pro_connections: [
    'connection_id', 'my_role', 'other_label', 'other_headline', 'status', 'ended_by', 'started_at', 'ended_at',
    'last_activity_at', 'unread', 'attention', 'next_appointment_at', 'pending_appointments', 'closet_shared',
    'closet_expires_at', 'last_message_preview', 'last_message_at',
  ],
  get_pro_connection: [
    'connectionId', 'myRole', 'status', 'endedBy', 'startedAt', 'endedAt', 'otherLabel', 'myAlias', 'safetyOnly',
    'stylist', 'closet', 'counts', 'actions',
  ],
  get_pro_grant: ['enabled', 'itemMode', 'itemIds', 'itemCount', 'grantedAt', 'expiresAt', 'expiresSoon', 'textVersion', 'lastViewedAt', 'views30d', 'events'],
  set_pro_grant: ['enabled', 'itemMode', 'itemIds', 'itemCount', 'grantedAt', 'expiresAt', 'expiresSoon', 'textVersion', 'lastViewedAt', 'views30d', 'events'],
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
};

/**
 * The keys a jsonb answer carries one level down, which the mappers read as well: for each RPC, for each nested part
 * of its answer, the keys of that part (the keys of every element, for a list). PRO_RPC_COLUMNS only lists the top
 * level, so without this a renamed `closet.itemMode` or `actions.canStopSharing` would break a screen with every suite
 * still green. proServiceInStepWithSql.test.ts finds each nested key inside the part it belongs to in the SQL, and the
 * live test feeds real responses through the mappers. mapStatus, mapConnectionDetail, mapGrant, mapLookDetail,
 * mapThread and mapStylistCard read exactly these.
 */
export const PRO_RPC_NESTED: Record<string, Record<string, readonly string[]>> = {
  get_pro_status: {
    versions: ['stylistTerms', 'clientTerms', 'shareText'],
    stylist: ['termsCurrent', 'accepting', 'approved', 'invitesHeld', 'activeClients', 'clientLimit', 'liveInvites', 'inviteLimit'],
    client: ['termsCurrent', 'connections', 'connectionLimit'],
  },
  preview_pro_invite: {
    stylist: ['name', 'headline', 'bio', 'services', 'languages', 'ratesText'],
  },
  get_pro_connection: {
    stylist: ['name', 'headline', 'bio', 'services', 'languages', 'ratesText'],
    closet: ['shared', 'itemMode', 'itemCount', 'expiresAt', 'expiresSoon', 'lastViewedAt', 'views30d'],
    counts: ['looks', 'upcoming'],
    actions: ['canMessage', 'canPropose', 'canRecommend', 'canEnd', 'canViewCloset', 'canShare', 'canStopSharing', 'canRename'],
  },
  get_pro_grant: {
    events: ['event', 'itemMode', 'itemCount', 'at'],
  },
  set_pro_grant: {
    events: ['event', 'itemMode', 'itemCount', 'at'],
  },
  get_pro_recommendation: {
    items: ['position', 'itemId', 'name', 'category', 'color', 'brand', 'hasPhoto', 'photoPath', 'available'],
    feedback: ['rating', 'comment', 'at'],
    actions: ['canEdit', 'canSend', 'canDelete', 'canGiveFeedback', 'canMarkWorn'],
  },
  get_pro_thread: {
    messages: ['id', 'from', 'body', 'code', 'at'],
    actions: ['canSend'],
  },
};

/** For each RPC in PRO_RPC_COLUMNS, the function that turns its raw answer (the rows, or the jsonb) into what the service returns. */
export const PRO_RPC_MAPPERS: Record<string, (raw: any) => unknown> = {
  get_pro_status: mapStatus,
  get_my_stylist_profile: mapMyStylistProfile,
  save_stylist_profile: mapStylistProfile,
  create_pro_invite: mapCreatedInvite,
  list_my_pro_invites: raw => rows(raw).map(mapInviteRow),
  preview_pro_invite: mapPreviewResult,
  redeem_pro_invite: mapRedeemResult,
  list_pro_connections: raw => rows(raw).map(mapConnectionRow),
  get_pro_connection: mapConnectionDetail,
  get_pro_grant: mapGrant,
  set_pro_grant: mapGrant,
  get_client_closet: mapClosetPage,
  save_pro_recommendation: mapSavedLook,
  list_pro_recommendations: raw => rows(raw).map(mapLookRow),
  get_pro_recommendation: mapLookDetail,
  propose_pro_appointment: mapProposedSession,
  list_pro_appointments: raw => rows(raw).map(mapAppointmentRow),
  send_pro_message: mapSentMessage,
  get_pro_thread: mapThread,
  list_pro_blocks: raw => rows(raw).map(mapBlockRow),
  export_my_pro_data: mapExport,
};

// ─── access and terms ────────────────────────────────────────────────────────

/** Signed in only, so it answers when the server switch is off. */
export const getProStatus = async (): Promise<ProStatus> => mapStatus(await call<any>('get_pro_status'));

/** Cheap; for the Home badge. Never throws: a guest, a failure or a server without pro functions is 0. */
export const getProBadge = async (): Promise<number> => {
  try {
    const n = Number(await call<number>('get_pro_badge'));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
};

/**
 * Records that the person agreed to the terms text in this build, and, the first time, that they are 18 or older.
 * The version sent is this build's constant for the role and cannot be passed in, so a person only ever agrees to
 * text they were shown; the server refuses any version other than its own (`terms_version_mismatch`), and
 * useProAccess does not even ask when the two differ.
 */
export const acceptProTerms = async (role: ProRole, adult: boolean): Promise<void> => {
  await call('accept_pro_terms', {
    p_role: role,
    p_version: role === 'stylist' ? PRO_STYLIST_TERMS_VERSION : PRO_CLIENT_TERMS_VERSION,
    p_adult: Boolean(adult),
  });
};

// ─── the stylist profile ─────────────────────────────────────────────────────

export const getMyStylistProfile = async (): Promise<StylistProfile | null> =>
  mapMyStylistProfile(await call<any>('get_my_stylist_profile'));

export const saveStylistProfile = async (input: StylistProfileInput): Promise<StylistProfile> =>
  mapStylistProfile(await call<any>('save_stylist_profile', {
    p_display_name: input.displayName.trim(),
    p_headline: input.headline.trim(),
    p_bio: input.bio.trim(),
    p_services: input.services,
    p_languages: input.languages,
    p_rates_text: input.ratesText.trim(),
    p_accepting: input.accepting,
  }));

export const setStylistAccepting = async (on: boolean): Promise<void> => {
  await call('set_stylist_accepting', { p_accepting: on });
};

/** Disconnects every client and deletes the profile and the invite codes. Works under a pause, a suspension and stale terms. */
export const closeStylistProfile = async (): Promise<void> => {
  await call('close_stylist_profile');
};

// ─── invites ─────────────────────────────────────────────────────────────────

/** clientRef makes a retry after a dropped connection return the same code. The label is private to the stylist. */
export const createProInvite = async (input: { label?: string; clientRef: string }): Promise<ProInvite> => {
  const label = input.label?.trim() || undefined;
  const invite = mapCreatedInvite(await call<any>('create_pro_invite', { p_client_ref: input.clientRef, p_label: label }));
  return label ? { ...invite, label } : invite;
};

export const listMyProInvites = async (): Promise<ProInvite[]> =>
  rows(await call<any[]>('list_my_pro_invites')).map(mapInviteRow);

export const revokeProInvite = async (id: string): Promise<void> => {
  await call('revoke_pro_invite', { p_invite: id });
};

/**
 * What the client sees before connecting. The code is sent as the server will read it (see normaliseCode). Every
 * failure of the code itself, and nothing else, is ProError('invite_invalid').
 */
export const previewProInvite = async (code: string): Promise<InvitePreview> =>
  mapPreviewResult(await call<any>('preview_pro_invite', { p_code: normaliseCode(code) }));

/** Connects. Nothing is shared by connecting. `alias` is the name the stylist will see. */
export const redeemProInvite = async (code: string, alias: string): Promise<ProRedeemResult> =>
  mapRedeemResult(await call<any>('redeem_pro_invite', { p_code: normaliseCode(code), p_alias: alias.trim() }));

// ─── connections ─────────────────────────────────────────────────────────────

export const listProConnections = async (as: ProRole = 'client'): Promise<ProConnectionSummary[]> =>
  rows(await call<any[]>('list_pro_connections', { p_as: as })).map(mapConnectionRow);

export const getProConnection = async (id: string): Promise<ProConnectionDetail> =>
  mapConnectionDetail(await call<any>('get_pro_connection', { p_connection: id }));

export const endProConnection = async (id: string): Promise<void> => {
  await call('end_pro_connection', { p_connection: id });
};

export const setProAlias = async (id: string, alias: string): Promise<void> => {
  await call('set_pro_alias', { p_connection: id, p_alias: alias.trim() });
};

// ─── sharing ─────────────────────────────────────────────────────────────────

export const getProGrant = async (id: string): Promise<ProGrant> =>
  mapGrant(await call<any>('get_pro_grant', { p_connection: id }));

/**
 * Turns closet sharing on, changes it, renews it, or turns it off. Enabling needs `itemMode` (the person must
 * choose; there is no default) and sends this build's PRO_SHARE_TEXT_VERSION, which cannot be passed in; the
 * pieces go only with 'selected'. Disabling sends nothing but the connection, the scope and the switch: it
 * needs no text version and works from any build.
 */
export const setProGrant = async (id: string, input: ProGrantInput): Promise<ProGrant> => {
  const enabling = input.enabled === true;
  return mapGrant(await call<any>('set_pro_grant', {
    p_connection: id,
    p_scope: 'closet',
    p_enabled: enabling,
    p_item_mode: enabling ? input.itemMode : undefined,
    p_item_ids: enabling && input.itemMode === 'selected' ? input.itemIds : undefined,
    p_text_version: enabling ? PRO_SHARE_TEXT_VERSION : undefined,
    p_renew: enabling && input.renew === true ? true : undefined,
  }));
};

/** A stylist's page of a client's shared closet. Photos are not here: ask proPhotoSource() for each piece. */
export const getClientCloset = async (id: string, opts: { offset?: number; limit?: number } = {}): Promise<ProClosetPage> =>
  mapClosetPage(await call<any[]>('get_client_closet', { p_connection: id, p_offset: opts.offset, p_limit: opts.limit }));

// ─── looks ───────────────────────────────────────────────────────────────────

/** Creates a draft (needs clientRef) or edits one (id). itemIds undefined leaves the pieces as they are; an array replaces them. */
export const saveProLook = async (input: ProLookInput): Promise<ProSavedLook> =>
  mapSavedLook(await call<any>('save_pro_recommendation', {
    p_connection: input.connectionId,
    p_id: input.id,
    p_title: input.title.trim(),
    p_body: input.body.trim(),
    p_item_ids: input.itemIds,
    p_client_ref: input.clientRef,
  }));

export const sendProLook = async (id: string): Promise<void> => {
  await call('send_pro_recommendation', { p_id: id });
};

export const deleteProLook = async (id: string): Promise<void> => {
  await call('delete_pro_recommendation', { p_id: id });
};

export const listProLooks = async (connectionId: string, opts: { before?: string; limit?: number } = {}): Promise<ProLookSummary[]> =>
  rows(await call<any[]>('list_pro_recommendations', { p_connection: connectionId, p_before: opts.before, p_limit: opts.limit })).map(mapLookRow);

/** For the client, the first read of a sent look marks it viewed. */
export const getProLook = async (id: string): Promise<ProLookDetail> =>
  mapLookDetail(await call<any>('get_pro_recommendation', { p_id: id }));

export const giveLookFeedback = async (id: string, input: { rating?: number; comment?: string; worn?: boolean }): Promise<void> => {
  await call('give_recommendation_feedback', {
    p_id: id,
    p_rating: input.rating,
    p_comment: input.comment === undefined ? undefined : input.comment.trim(),
    p_worn: input.worn,
  });
};

// ─── sessions ────────────────────────────────────────────────────────────────

/**
 * clientRef makes a retry safe. The offset from UTC at the start is the proposer's and defaults to this device's: it is
 * all the other person learns about where the proposer is (never a zone name).
 */
export const proposeProSession = async (input: ProposeSessionInput): Promise<ProProposedSession> =>
  mapProposedSession(await call<any>('propose_pro_appointment', {
    p_connection: input.connectionId,
    p_starts_at: input.startsAt instanceof Date ? input.startsAt.toISOString() : input.startsAt,
    p_duration_minutes: input.durationMinutes,
    p_mode: input.mode,
    p_place: input.place?.trim() || undefined,
    p_note: input.note?.trim() || undefined,
    p_utc_offset_minutes: input.utcOffsetMinutes ?? deviceUtcOffsetMinutes(input.startsAt),
    p_client_ref: input.clientRef,
  }));

export const respondProSession = async (id: string, action: 'confirm' | 'decline'): Promise<void> => {
  await call('respond_pro_appointment', { p_appointment: id, p_action: action });
};

export const cancelProSession = async (id: string): Promise<void> => {
  await call('cancel_pro_appointment', { p_appointment: id });
};

/** connectionId undefined: across all the caller's connections. */
export const listProSessions = async (opts: { connectionId?: string; scope?: ProSessionScope } = {}): Promise<ProAppointment[]> =>
  rows(await call<any[]>('list_pro_appointments', { p_connection: opts.connectionId, p_scope: opts.scope })).map(mapAppointmentRow);

// ─── messages ────────────────────────────────────────────────────────────────

/** clientRef makes a retry after a dropped connection safe. */
export const sendProMessage = async (connectionId: string, body: string, clientRef: string): Promise<ProSentMessage> =>
  mapSentMessage(await call<any>('send_pro_message', { p_connection: connectionId, p_body: body.trim(), p_client_ref: clientRef }));

/** Latest page; afterId pages forward (for polling), beforeId pages back. Merge by id. */
export const getProThread = async (connectionId: string, opts: { afterId?: number; beforeId?: number; limit?: number } = {}): Promise<ProThread> =>
  mapThread(await call<any>('get_pro_thread', {
    p_connection: connectionId,
    p_after_id: opts.afterId,
    p_before_id: opts.beforeId,
    p_limit: opts.limit,
  }));

// ─── safety ──────────────────────────────────────────────────────────────────

export const reportProContent = async (input: {
  refType: ProReportRefType; refId: string; reason: ProReportReason; details?: string; messageId?: number;
}): Promise<void> => {
  await call('report_pro_content', {
    p_ref_type: input.refType,
    p_ref_id: input.refId,
    p_reason: input.reason,
    p_details: input.details?.trim().slice(0, 500) || undefined,
    p_message_id: input.messageId,
  });
};

/** Exactly one of the two: a connection, or the invite of a stylist the client previewed and does not want. */
export const blockProMember = async (input: { connectionId?: string; inviteId?: string }): Promise<void> => {
  await call('block_pro_member', { p_connection: input.connectionId, p_invite: input.inviteId });
};

export const listProBlocks = async (): Promise<ProBlock[]> => rows(await call<any[]>('list_pro_blocks')).map(mapBlockRow);

export const unblockProMember = async (ref: string): Promise<void> => {
  await call('unblock_pro_member', { p_ref: ref });
};

// ─── export ──────────────────────────────────────────────────────────────────

export const exportMyProData = async (): Promise<ProExport> => mapExport(await call<any>('export_my_pro_data'));
