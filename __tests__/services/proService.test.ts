/**
 * proService: the client side of every pro function (documentation/design/pro-accounts.md 4.6, 7.6).
 * Guests fail before any network call; each function sends exactly the named arguments the SQL declares;
 * answers are mapped through exported mappers whose reads are pinned to PRO_RPC_COLUMNS.
 */
import fs from 'fs';
import path from 'path';

const mockGetSession = jest.fn();
const mockRpc = jest.fn();
jest.mock('../../src/config/supabase', () => ({
  supabase: {
    auth: { getSession: (...a: any[]) => mockGetSession(...a) },
    rpc: (...a: any[]) => mockRpc(...a),
  },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as pro from '../../src/services/proService';
import { ProError } from '../../src/services/proErrors';
import {
  PRO_CLIENT_TERMS_VERSION, PRO_SHARE_TEXT_VERSION, PRO_STYLIST_TERMS_VERSION,
} from '../../src/config/proRules';
import { deviceUtcOffsetMinutes } from '../../src/utils/proFormat';

const signedIn = () => mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'me' } } } });
const answer = (data: any) => mockRpc.mockResolvedValueOnce({ data, error: null });
const lastArgs = () => mockRpc.mock.calls[mockRpc.mock.calls.length - 1][1] as Record<string, unknown>;

beforeEach(() => {
  jest.clearAllMocks();
  mockRpc.mockReset();
  signedIn();
});

// ─── what the server answers, one example for each function that answers with something ───

const STATUS = {
  proEnabled: true, suspended: false, adultConfirmed: true, stylistRemoved: false,
  versions: { stylistTerms: '2026-10', clientTerms: '2026-10', shareText: '2026-10' },
  stylist: { termsCurrent: true, accepting: true, approved: false, invitesHeld: true, activeClients: 2, clientLimit: 3, liveInvites: 1, inviteLimit: 1 },
  client: { termsCurrent: true, connections: 2, connectionLimit: 5 },
  badge: 4,
};
const PROFILE = {
  displayName: 'Ann Lee', headline: 'Wardrobe edits', bio: 'Ten years in retail.', services: ['wardrobe_audit', 'outfit_styling'],
  languages: ['en', 'hy'], ratesText: 'From $80 per session', accepting: true, approved: true, invitesHeld: false, createdAt: '2026-10-01T10:00:00+00:00',
};
const STYLIST_CARD = { name: 'Ann Lee', headline: 'Wardrobe edits', bio: 'Ten years in retail.', services: ['wardrobe_audit'], languages: ['en'], ratesText: 'From $80 per session' };
const CONNECTION_ROW = {
  connection_id: 'c1', my_role: 'client', other_label: 'Ann Lee', other_headline: 'Wardrobe edits', status: 'ended', ended_by: 'stylist',
  started_at: '2026-10-01T10:00:00+00:00', ended_at: '2026-10-05T10:00:00+00:00', last_activity_at: '2026-10-05T10:00:00+00:00', unread: 2,
  attention: true, next_appointment_at: '2026-11-01T15:00:00+00:00', pending_appointments: 1, closet_shared: true,
  closet_expires_at: '2026-12-30T10:00:00+00:00', last_message_preview: 'See you then', last_message_at: '2026-10-05T09:00:00+00:00',
};
const CONNECTION_ROW_BARE = {
  connection_id: 'c2', my_role: 'stylist', other_label: 'Former client', other_headline: null, status: 'active', ended_by: null,
  started_at: '2026-10-01T10:00:00+00:00', ended_at: null, last_activity_at: '2026-10-01T10:00:00+00:00', unread: 0,
  attention: false, next_appointment_at: null, pending_appointments: 0, closet_shared: false, closet_expires_at: null,
  last_message_preview: null, last_message_at: null,
};
const GRANT = {
  enabled: true, itemMode: 'selected', itemIds: ['i1', 'i2'], itemCount: 2, grantedAt: '2026-10-01T10:00:00+00:00',
  expiresAt: '2026-12-30T10:00:00+00:00', expiresSoon: true, textVersion: '2026-10', lastViewedAt: '2026-10-02T10:00:00+00:00', views30d: 3,
  events: [{ event: 'granted', itemMode: 'selected', itemCount: 2, at: '2026-10-01T10:00:00+00:00' }, { event: 'revoked', itemMode: null, itemCount: null, at: '2026-10-03T10:00:00+00:00' }],
};
const CLOSET_ROW = {
  item_id: 'i1', name: 'Blue blazer', category: 'Outerwear', subcategory: 'Blazer', color: 'blue', brand: 'Zara', season: ['winter'], pattern: 'solid',
  material: 'wool', materials: [{ name: 'wool', percentage: 80 }], size: 'M', condition: 'good', has_photo: true, total_count: 12,
};
const LOOK_ROW = {
  rec_id: 'l1', status: 'sent', title: 'Date night', item_count: 3, cover_item_id: 'i1', cover_photo_path: 'me/blazer.jpg', sent_at: '2026-10-02T10:00:00+00:00',
  viewed_at: '2026-10-03T10:00:00+00:00', updated_at: '2026-10-03T10:00:00+00:00', client_rating: 5, is_new: true,
};
const LOOK = {
  id: 'l1', connectionId: 'c1', status: 'implemented', title: 'Date night', body: 'Wear the blue blazer.', sentAt: '2026-10-02T10:00:00+00:00',
  viewedAt: '2026-10-03T10:00:00+00:00', implementedAt: '2026-10-04T10:00:00+00:00',
  items: [
    { position: 1, itemId: 'i1', name: 'Blue blazer', category: 'Outerwear', color: 'blue', brand: 'Zara', hasPhoto: true, photoPath: 'me/blazer.jpg', available: true },
    { position: 2, itemId: null, name: 'Old scarf', category: null, color: null, brand: null, hasPhoto: false, available: false },
  ],
  feedback: { rating: 5, comment: 'Loved it', at: '2026-10-04T11:00:00+00:00' },
  actions: { canEdit: false, canSend: false, canDelete: false, canGiveFeedback: true, canMarkWorn: true },
};
const APPOINTMENT_ROW = {
  appointment_id: 'a1', connection_id: 'c1', other_label: 'Ann Lee', my_role: 'client', status: 'proposed', proposed_by: 'stylist',
  starts_at: '2026-11-01T15:00:00+00:00', duration_minutes: 60, mode: 'in_person', place: 'Cafe Rose', note: 'Bring swatches', utc_offset_minutes: 60,
  can_confirm: true, can_decline: true, can_cancel: true, created_at: '2026-10-20T10:00:00+00:00',
};

const RAW: Record<string, any> = {
  get_pro_status: STATUS,
  get_my_stylist_profile: PROFILE,
  save_stylist_profile: PROFILE,
  create_pro_invite: { inviteId: 'i1', code: 'ABCDE23456', expiresAt: '2026-10-30T10:00:00+00:00', createdAt: '2026-10-23T10:00:00+00:00', status: 'live', connected: false },
  list_my_pro_invites: [
    { invite_id: 'i1', code: 'ABCDE23456', label: 'Maya', status: 'used', created_at: '2026-10-23T10:00:00+00:00', expires_at: '2026-10-30T10:00:00+00:00', used_at: '2026-10-24T10:00:00+00:00', connected: true },
    { invite_id: 'i2', code: 'FGHJK78901', label: null, status: 'live', created_at: '2026-10-23T10:00:00+00:00', expires_at: '2026-10-30T10:00:00+00:00', used_at: null, connected: false },
  ],
  preview_pro_invite: { valid: true, inviteId: 'i1', stylist: STYLIST_CARD, alreadyConnected: true, clientTermsCurrent: false },
  redeem_pro_invite: { ok: true, connectionId: 'c1', alreadyConnected: true },
  list_pro_connections: [CONNECTION_ROW, CONNECTION_ROW_BARE],
  get_pro_connection: {
    connectionId: 'c1', myRole: 'client', status: 'ended', endedBy: 'them', startedAt: '2026-10-01T10:00:00+00:00', endedAt: '2026-10-05T10:00:00+00:00',
    otherLabel: 'Ann Lee', myAlias: 'Maya L', safetyOnly: true, stylist: STYLIST_CARD,
    closet: { shared: true, itemMode: 'all', itemCount: null, expiresAt: '2026-12-30T10:00:00+00:00', expiresSoon: true, lastViewedAt: '2026-10-02T10:00:00+00:00', views30d: 3 },
    counts: { looks: 2, upcoming: 1 },
    actions: { canMessage: true, canPropose: true, canRecommend: false, canEnd: true, canViewCloset: false, canShare: true, canStopSharing: true, canRename: true },
  },
  get_pro_grant: GRANT,
  set_pro_grant: GRANT,
  get_client_closet: [CLOSET_ROW, { ...CLOSET_ROW, item_id: 'i2', subcategory: null, color: null, brand: null, season: null, pattern: null, material: null, materials: null, size: null, condition: null, has_photo: false }],
  save_pro_recommendation: { id: 'l1', status: 'draft', updatedAt: '2026-10-02T10:00:00+00:00' },
  list_pro_recommendations: [LOOK_ROW, { ...LOOK_ROW, rec_id: 'l2', status: 'draft', cover_item_id: null, cover_photo_path: null, sent_at: null, viewed_at: null, client_rating: null, is_new: false }],
  get_pro_recommendation: LOOK,
  propose_pro_appointment: { appointmentId: 'a1', status: 'proposed' },
  list_pro_appointments: [APPOINTMENT_ROW],
  send_pro_message: { messageId: 42, createdAt: '2026-10-23T10:00:00+00:00' },
  get_pro_thread: {
    messages: [
      { id: 1, from: 'system', body: '', code: 'connected', at: '2026-10-01T10:00:00+00:00' },
      { id: 2, from: 'them', body: 'Hello', code: null, at: '2026-10-01T10:01:00+00:00' },
      { id: 3, from: 'me', body: 'Hi', code: null, at: '2026-10-01T10:02:00+00:00' },
    ],
    hasMore: true,
    actions: { canSend: true },
  },
  list_pro_blocks: [{ ref: 'r1', label: 'Former stylist', blocked_at: '2026-10-06T10:00:00+00:00' }],
  export_my_pro_data: { settings: { suspended: false }, stylistProfile: null, invites: [{ createdAt: 'x', expiresAt: 'y', status: 'live' }], connections: [] },
};

// ─── every function: the RPC it calls and the exact argument object it sends ───

type Row = [name: string, rpc: string, run: () => Promise<unknown>, args: Record<string, unknown> | undefined];

const CALLS: Row[] = [
  ['getProStatus', 'get_pro_status', () => pro.getProStatus(), undefined],
  ['getProBadge', 'get_pro_badge', () => pro.getProBadge(), undefined],
  ['acceptProTerms', 'accept_pro_terms', () => pro.acceptProTerms('stylist', true), { p_role: 'stylist', p_version: PRO_STYLIST_TERMS_VERSION, p_adult: true }],
  ['getMyStylistProfile', 'get_my_stylist_profile', () => pro.getMyStylistProfile(), undefined],
  ['saveStylistProfile', 'save_stylist_profile', () => pro.saveStylistProfile({
    displayName: 'Ann Lee', headline: 'Wardrobe edits', bio: 'Ten years in retail.', services: ['wardrobe_audit'], languages: ['en'], ratesText: 'From $80 per session', accepting: true,
  }), {
    p_display_name: 'Ann Lee', p_headline: 'Wardrobe edits', p_bio: 'Ten years in retail.', p_services: ['wardrobe_audit'], p_languages: ['en'], p_rates_text: 'From $80 per session', p_accepting: true,
  }],
  ['setStylistAccepting', 'set_stylist_accepting', () => pro.setStylistAccepting(false), { p_accepting: false }],
  ['closeStylistProfile', 'close_stylist_profile', () => pro.closeStylistProfile(), undefined],
  ['createProInvite', 'create_pro_invite', () => pro.createProInvite({ label: 'Maya', clientRef: 'r1' }), { p_client_ref: 'r1', p_label: 'Maya' }],
  ['listMyProInvites', 'list_my_pro_invites', () => pro.listMyProInvites(), undefined],
  ['revokeProInvite', 'revoke_pro_invite', () => pro.revokeProInvite('i1'), { p_invite: 'i1' }],
  ['previewProInvite', 'preview_pro_invite', () => pro.previewProInvite('ABCDE23456'), { p_code: 'ABCDE23456' }],
  ['redeemProInvite', 'redeem_pro_invite', () => pro.redeemProInvite('ABCDE23456', 'Maya'), { p_code: 'ABCDE23456', p_alias: 'Maya' }],
  ['listProConnections', 'list_pro_connections', () => pro.listProConnections('stylist'), { p_as: 'stylist' }],
  ['getProConnection', 'get_pro_connection', () => pro.getProConnection('c1'), { p_connection: 'c1' }],
  ['endProConnection', 'end_pro_connection', () => pro.endProConnection('c1'), { p_connection: 'c1' }],
  ['setProAlias', 'set_pro_alias', () => pro.setProAlias('c1', 'Maya L'), { p_connection: 'c1', p_alias: 'Maya L' }],
  ['getProGrant', 'get_pro_grant', () => pro.getProGrant('c1'), { p_connection: 'c1' }],
  ['setProGrant', 'set_pro_grant', () => pro.setProGrant('c1', { enabled: true, itemMode: 'selected', itemIds: ['x', 'y'], renew: true }), {
    p_connection: 'c1', p_scope: 'closet', p_enabled: true, p_item_mode: 'selected', p_item_ids: ['x', 'y'], p_text_version: PRO_SHARE_TEXT_VERSION, p_renew: true,
  }],
  ['getClientCloset', 'get_client_closet', () => pro.getClientCloset('c1', { offset: 60, limit: 60 }), { p_connection: 'c1', p_offset: 60, p_limit: 60 }],
  ['saveProLook', 'save_pro_recommendation', () => pro.saveProLook({
    connectionId: 'c1', id: 'l1', title: 'Date night', body: 'Wear the blue blazer.', itemIds: ['x'], clientRef: 'r2',
  }), { p_connection: 'c1', p_id: 'l1', p_title: 'Date night', p_body: 'Wear the blue blazer.', p_item_ids: ['x'], p_client_ref: 'r2' }],
  ['sendProLook', 'send_pro_recommendation', () => pro.sendProLook('l1'), { p_id: 'l1' }],
  ['deleteProLook', 'delete_pro_recommendation', () => pro.deleteProLook('l1'), { p_id: 'l1' }],
  ['listProLooks', 'list_pro_recommendations', () => pro.listProLooks('c1', { before: '2026-10-01T00:00:00Z', limit: 20 }), { p_connection: 'c1', p_before: '2026-10-01T00:00:00Z', p_limit: 20 }],
  ['getProLook', 'get_pro_recommendation', () => pro.getProLook('l1'), { p_id: 'l1' }],
  ['giveLookFeedback', 'give_recommendation_feedback', () => pro.giveLookFeedback('l1', { rating: 5, comment: 'Loved it', worn: true }), { p_id: 'l1', p_rating: 5, p_comment: 'Loved it', p_worn: true }],
  ['proposeProSession', 'propose_pro_appointment', () => pro.proposeProSession({
    connectionId: 'c1', startsAt: '2026-11-01T15:00:00.000Z', durationMinutes: 60, mode: 'in_person', place: 'Cafe Rose', note: 'Bring swatches', utcOffsetMinutes: 60, clientRef: 'r3',
  }), {
    p_connection: 'c1', p_starts_at: '2026-11-01T15:00:00.000Z', p_duration_minutes: 60, p_mode: 'in_person', p_place: 'Cafe Rose', p_note: 'Bring swatches', p_utc_offset_minutes: 60, p_client_ref: 'r3',
  }],
  ['respondProSession', 'respond_pro_appointment', () => pro.respondProSession('a1', 'confirm'), { p_appointment: 'a1', p_action: 'confirm' }],
  ['cancelProSession', 'cancel_pro_appointment', () => pro.cancelProSession('a1'), { p_appointment: 'a1' }],
  ['listProSessions', 'list_pro_appointments', () => pro.listProSessions({ connectionId: 'c1', scope: 'needs_me' }), { p_connection: 'c1', p_scope: 'needs_me' }],
  ['sendProMessage', 'send_pro_message', () => pro.sendProMessage('c1', 'Hello', 'r4'), { p_connection: 'c1', p_body: 'Hello', p_client_ref: 'r4' }],
  ['getProThread', 'get_pro_thread', () => pro.getProThread('c1', { afterId: 5, beforeId: 9, limit: 50 }), { p_connection: 'c1', p_after_id: 5, p_before_id: 9, p_limit: 50 }],
  ['reportProContent', 'report_pro_content', () => pro.reportProContent({ refType: 'connection', refId: 'c1', reason: 'harassment', details: ' rude ', messageId: 7 }), {
    p_ref_type: 'connection', p_ref_id: 'c1', p_reason: 'harassment', p_details: 'rude', p_message_id: 7,
  }],
  ['blockProMember', 'block_pro_member', () => pro.blockProMember({ connectionId: 'c1' }), { p_connection: 'c1' }],
  ['listProBlocks', 'list_pro_blocks', () => pro.listProBlocks(), undefined],
  ['unblockProMember', 'unblock_pro_member', () => pro.unblockProMember('r1'), { p_ref: 'r1' }],
  ['exportMyProData', 'export_my_pro_data', () => pro.exportMyProData(), undefined],
];

describe('the table covers every function of the service', () => {
  it('has the 36 client functions of 4.6, each once', () => {
    expect(CALLS).toHaveLength(36);
    expect(new Set(CALLS.map(c => c[1])).size).toBe(36);
    const exported = Object.keys(pro).filter(k => typeof (pro as any)[k] === 'function' && !/^map|^PRO_/.test(k));
    expect(exported.sort()).toEqual(CALLS.map(c => c[0]).sort());
  });
});

describe('guests', () => {
  it.each(CALLS.filter(c => c[0] !== 'getProBadge'))('%s fails before any network call', async (_name, _rpc, run) => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    await expect(run()).rejects.toMatchObject({ name: 'ProError', code: 'not_authenticated' });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('the badge quietly says zero', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    expect(await pro.getProBadge()).toBe(0);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('calls the right function with the right named arguments', () => {
  it.each(CALLS)('%s', async (_name, rpc, run, args) => {
    answer(RAW[rpc] ?? 7);
    await run();
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith(rpc, args);
    // Never an undefined value and never a null one: an argument that is not given is not sent.
    for (const value of Object.values(lastArgs() ?? {})) expect(value).not.toBeUndefined();
  });
});

describe('the source says what the SQL says', () => {
  // The argument names of 4.6, by function. proServiceInStepWithSql.test.ts compares the same names with the migrations.
  const SQL_ARGS: Record<string, string[]> = {
    get_pro_status: [], get_pro_badge: [], accept_pro_terms: ['p_role', 'p_version', 'p_adult'], get_my_stylist_profile: [],
    save_stylist_profile: ['p_display_name', 'p_headline', 'p_bio', 'p_services', 'p_languages', 'p_rates_text', 'p_accepting'],
    set_stylist_accepting: ['p_accepting'], close_stylist_profile: [], create_pro_invite: ['p_client_ref', 'p_label'], list_my_pro_invites: [],
    revoke_pro_invite: ['p_invite'], preview_pro_invite: ['p_code'], redeem_pro_invite: ['p_code', 'p_alias'], list_pro_connections: ['p_as'],
    get_pro_connection: ['p_connection'], end_pro_connection: ['p_connection'], set_pro_alias: ['p_connection', 'p_alias'],
    get_pro_grant: ['p_connection'],
    set_pro_grant: ['p_connection', 'p_scope', 'p_enabled', 'p_item_mode', 'p_item_ids', 'p_text_version', 'p_renew'],
    get_client_closet: ['p_connection', 'p_offset', 'p_limit'],
    save_pro_recommendation: ['p_connection', 'p_id', 'p_title', 'p_body', 'p_item_ids', 'p_client_ref'],
    send_pro_recommendation: ['p_id'], delete_pro_recommendation: ['p_id'],
    list_pro_recommendations: ['p_connection', 'p_before', 'p_limit'], get_pro_recommendation: ['p_id'],
    give_recommendation_feedback: ['p_id', 'p_rating', 'p_comment', 'p_worn'],
    propose_pro_appointment: ['p_connection', 'p_starts_at', 'p_duration_minutes', 'p_mode', 'p_place', 'p_note', 'p_utc_offset_minutes', 'p_client_ref'],
    respond_pro_appointment: ['p_appointment', 'p_action'], cancel_pro_appointment: ['p_appointment'],
    list_pro_appointments: ['p_connection', 'p_scope'], send_pro_message: ['p_connection', 'p_body', 'p_client_ref'],
    get_pro_thread: ['p_connection', 'p_after_id', 'p_before_id', 'p_limit'],
    report_pro_content: ['p_ref_type', 'p_ref_id', 'p_reason', 'p_details', 'p_message_id'],
    block_pro_member: ['p_connection', 'p_invite'], list_pro_blocks: [], unblock_pro_member: ['p_ref'], export_my_pro_data: [],
  };

  const source = fs.readFileSync(path.join(__dirname, '../../src/services/proService.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"\w])\/\/.*$/gm, '$1');
  const found: Record<string, string[]> = {};
  for (const m of source.matchAll(/\bcall(?:<[^>]*>)?\(\s*'(\w+)'(?:\s*,\s*\{([^}]*)\})?\s*\)/g)) {
    expect(found[m[1]]).toBeUndefined();        // one statement per function, so a name cannot be read twice
    found[m[1]] = [...(m[2] ?? '').matchAll(/\b(p_\w+)\s*:/g)].map(a => a[1]);
  }

  it('calls every function of 4.6 and nothing else, each in one statement with a literal argument object', () => {
    expect(Object.keys(found).sort()).toEqual(Object.keys(SQL_ARGS).sort());
    expect(Object.keys(SQL_ARGS)).toHaveLength(36);
  });

  it.each(Object.keys(SQL_ARGS))('sends exactly the arguments %s declares', rpc => {
    expect([...found[rpc]].sort()).toEqual([...SQL_ARGS[rpc]].sort());
  });

  it('every argument is p_ prefixed, and none is ever built from a variable name', () => {
    for (const names of Object.values(found)) for (const n of names) expect(n).toMatch(/^p_[a-z_]+$/);
    expect(source).not.toMatch(/\bcall(?:<[^>]*>)?\(\s*[^'\s]/);   // the function name is always a literal
  });
});

describe('terms and sharing send the version in this build, whatever a caller tries to pass', () => {
  it('accepts the stylist terms at the stylist version and the client terms at the client version', async () => {
    answer(null);
    await (pro.acceptProTerms as any)('stylist', true, '2099-01');
    expect(mockRpc).toHaveBeenLastCalledWith('accept_pro_terms', { p_role: 'stylist', p_version: PRO_STYLIST_TERMS_VERSION, p_adult: true });
    answer(null);
    await (pro.acceptProTerms as any)('client', false, '2099-01');
    expect(mockRpc).toHaveBeenLastCalledWith('accept_pro_terms', { p_role: 'client', p_version: PRO_CLIENT_TERMS_VERSION, p_adult: false });
  });

  it('turns sharing on with this build’s consent text, which cannot be passed in', async () => {
    answer(GRANT);
    await (pro.setProGrant as any)('c1', { enabled: true, itemMode: 'all', textVersion: '2099-01', p_text_version: '2099-01' });
    expect(lastArgs()).toEqual({ p_connection: 'c1', p_scope: 'closet', p_enabled: true, p_item_mode: 'all', p_text_version: PRO_SHARE_TEXT_VERSION });
  });

  it('never sends a text version, a mode, pieces or a renewal when turning sharing off', async () => {
    answer(GRANT);
    await (pro.setProGrant as any)('c1', { enabled: false, itemMode: 'selected', itemIds: ['x'], renew: true, textVersion: PRO_SHARE_TEXT_VERSION });
    expect(lastArgs()).toEqual({ p_connection: 'c1', p_scope: 'closet', p_enabled: false });
    expect('p_text_version' in lastArgs()).toBe(false);
  });

  it('sends the pieces only for a selection, and a renewal only when asked for', async () => {
    answer(GRANT);
    await pro.setProGrant('c1', { enabled: true, itemMode: 'all', itemIds: ['stale'] });
    expect(lastArgs()).not.toHaveProperty('p_item_ids');
    expect(lastArgs()).not.toHaveProperty('p_renew');
    answer(GRANT);
    await pro.setProGrant('c1', { enabled: true, itemMode: 'selected', itemIds: ['a'], renew: false });
    expect(lastArgs()).toMatchObject({ p_item_mode: 'selected', p_item_ids: ['a'] });
    expect(lastArgs()).not.toHaveProperty('p_renew');
  });

  it('leaves the mode out when the caller did not choose one, so the server refuses instead of guessing', async () => {
    answer(GRANT);
    await pro.setProGrant('c1', { enabled: true });
    expect(lastArgs()).not.toHaveProperty('p_item_mode');
  });
});

describe('arguments that are not given are not sent', () => {
  it.each<[string, () => Promise<unknown>, string, object]>([
    ['createProInvite without a label', () => pro.createProInvite({ clientRef: 'r1' }), 'create_pro_invite', { p_client_ref: 'r1' }],
    ['createProInvite with a blank label', () => pro.createProInvite({ clientRef: 'r1', label: '   ' }), 'create_pro_invite', { p_client_ref: 'r1' }],
    ['getClientCloset', () => pro.getClientCloset('c1'), 'get_client_closet', { p_connection: 'c1' }],
    ['listProLooks', () => pro.listProLooks('c1'), 'list_pro_recommendations', { p_connection: 'c1' }],
    ['listProSessions across all connections', () => pro.listProSessions({ scope: 'past' }), 'list_pro_appointments', { p_scope: 'past' }],
    ['listProSessions with nothing', () => pro.listProSessions(), 'list_pro_appointments', {}],
    ['getProThread', () => pro.getProThread('c1'), 'get_pro_thread', { p_connection: 'c1' }],
    ['reportProContent', () => pro.reportProContent({ refType: 'invite', refId: 'i1', reason: 'scam' }), 'report_pro_content', { p_ref_type: 'invite', p_ref_id: 'i1', p_reason: 'scam' }],
    ['reportProContent with blank details', () => pro.reportProContent({ refType: 'invite', refId: 'i1', reason: 'scam', details: '  ' }), 'report_pro_content', { p_ref_type: 'invite', p_ref_id: 'i1', p_reason: 'scam' }],
    ['blockProMember from an invite', () => pro.blockProMember({ inviteId: 'i1' }), 'block_pro_member', { p_invite: 'i1' }],
    ['giveLookFeedback with only worn', () => pro.giveLookFeedback('l1', { worn: false }), 'give_recommendation_feedback', { p_id: 'l1', p_worn: false }],
    ['saveProLook creating without pieces', () => pro.saveProLook({ connectionId: 'c1', title: 'T', body: '', clientRef: 'r1' }), 'save_pro_recommendation', { p_connection: 'c1', p_title: 'T', p_body: '', p_client_ref: 'r1' }],
  ])('%s', async (_n, run, rpc, args) => {
    answer(RAW[rpc] ?? null);
    await run();
    expect(lastArgs() ?? {}).toEqual(args);
    expect(Object.keys(lastArgs() ?? {}).sort()).toEqual(Object.keys(args).sort());
  });

  it('leaves a look’s pieces as they are when itemIds is undefined, and replaces them with an empty list when it is []', async () => {
    answer(RAW.save_pro_recommendation);
    await pro.saveProLook({ connectionId: 'c1', id: 'l1', title: 'New title', body: 'b' });
    expect(lastArgs()).not.toHaveProperty('p_item_ids');
    answer(RAW.save_pro_recommendation);
    await pro.saveProLook({ connectionId: 'c1', id: 'l1', title: 'New title', body: 'b', itemIds: [] });
    expect(lastArgs()).toHaveProperty('p_item_ids', []);
  });
});

describe('what is typed is tidied, and nothing is invented', () => {
  it('trims the profile text, the alias, the code, the message and the report details', async () => {
    answer(PROFILE);
    await pro.saveStylistProfile({ displayName: '  Ann Lee ', headline: ' h ', bio: ' b ', services: ['outfit_styling'], languages: [], ratesText: ' r ', accepting: false });
    expect(lastArgs()).toMatchObject({ p_display_name: 'Ann Lee', p_headline: 'h', p_bio: 'b', p_rates_text: 'r', p_accepting: false, p_languages: [] });
    answer(null);
    await pro.setProAlias('c1', ' Maya ');
    expect(lastArgs()).toEqual({ p_connection: 'c1', p_alias: 'Maya' });
    answer(RAW.send_pro_message);
    await pro.sendProMessage('c1', '  hi there \n', 'r1');
    expect(lastArgs()).toMatchObject({ p_body: 'hi there' });
    answer(null);
    await pro.reportProContent({ refType: 'connection', refId: 'c1', reason: 'other', details: ' rude '.padEnd(600, 'x') });
    expect((lastArgs().p_details as string).length).toBe(500);
  });

  it('sends a code the way the server will read it', async () => {
    answer(RAW.preview_pro_invite);
    await pro.previewProInvite(' abcde-fghij ');
    expect(lastArgs()).toEqual({ p_code: 'ABCDEFGH1J' });
    answer(RAW.redeem_pro_invite);
    await pro.redeemProInvite('abcde fghjk', ' Maya ');
    expect(lastArgs()).toEqual({ p_code: 'ABCDEFGHJK', p_alias: 'Maya' });
  });

  it('proposes a session with this device’s offset from UTC unless told another, and sends a Date as an ISO string', async () => {
    answer(RAW.propose_pro_appointment);
    await pro.proposeProSession({ connectionId: 'c1', startsAt: new Date('2026-11-01T15:00:00Z'), durationMinutes: 30, mode: 'virtual', clientRef: 'r1' });
    expect(lastArgs()).toEqual({
      p_connection: 'c1', p_starts_at: '2026-11-01T15:00:00.000Z', p_duration_minutes: 30, p_mode: 'virtual',
      p_utc_offset_minutes: deviceUtcOffsetMinutes('2026-11-01T15:00:00.000Z'), p_client_ref: 'r1',
    });
  });

  it('never sends a zone name: the other person learns an offset from UTC and not a city', async () => {
    answer(RAW.propose_pro_appointment);
    await pro.proposeProSession({ connectionId: 'c1', startsAt: '2026-11-01T15:00:00Z', durationMinutes: 30, mode: 'virtual', clientRef: 'r1' });
    expect(Object.keys(lastArgs())).not.toContain('p_tz');
    expect(JSON.stringify(lastArgs())).not.toMatch(/[A-Za-z]+\/[A-Za-z_]+/);
    expect(Number.isInteger(lastArgs().p_utc_offset_minutes as number)).toBe(true);
  });

  it('never makes up a client ref: the screen makes one per attempt and reuses it', async () => {
    answer(RAW.save_pro_recommendation);
    await pro.saveProLook({ connectionId: 'c1', title: 'T', body: '' });
    expect(lastArgs()).not.toHaveProperty('p_client_ref');
  });

  it('sends the same client ref on a retry', async () => {
    for (let i = 0; i < 2; i++) {
      answer(RAW.create_pro_invite);
      await pro.createProInvite({ clientRef: 'same-ref' });
      expect(lastArgs()).toEqual({ p_client_ref: 'same-ref' });
    }
    for (let i = 0; i < 2; i++) {
      answer(RAW.send_pro_message);
      await pro.sendProMessage('c1', 'hi', 'ref-2');
      expect(lastArgs()).toMatchObject({ p_client_ref: 'ref-2' });
    }
    for (let i = 0; i < 2; i++) {
      answer(RAW.propose_pro_appointment);
      await pro.proposeProSession({ connectionId: 'c1', startsAt: '2026-11-01T15:00:00Z', durationMinutes: 30, mode: 'virtual', utcOffsetMinutes: 0, clientRef: 'ref-3' });
      expect(lastArgs()).toMatchObject({ p_client_ref: 'ref-3' });
    }
  });
});

describe('answers', () => {
  it('maps the status', async () => {
    answer(STATUS);
    expect(await pro.getProStatus()).toEqual(STATUS);
    answer({ ...STATUS, stylist: null });
    expect((await pro.getProStatus()).stylist).toBeNull();
    answer(null);
    await expect(pro.getProStatus()).rejects.toMatchObject({ code: 'unknown' });
  });

  it('maps the profile, and null for no profile', async () => {
    answer(PROFILE);
    expect(await pro.getMyStylistProfile()).toEqual(PROFILE);
    answer(null);
    expect(await pro.getMyStylistProfile()).toBeNull();
    answer(PROFILE);
    expect(await pro.saveStylistProfile({ displayName: 'Ann Lee', headline: '', bio: '', services: ['outfit_styling'], languages: [], ratesText: '', accepting: true })).toEqual(PROFILE);
  });

  it('maps an invite made, and puts back the label the caller typed (the server never echoes it)', async () => {
    answer(RAW.create_pro_invite);
    expect(await pro.createProInvite({ clientRef: 'r1', label: ' Maya ' })).toEqual({
      id: 'i1', code: 'ABCDE23456', status: 'live', createdAt: '2026-10-23T10:00:00+00:00', expiresAt: '2026-10-30T10:00:00+00:00', connected: false, label: 'Maya',
    });
    answer(RAW.create_pro_invite);
    expect(await pro.createProInvite({ clientRef: 'r1' })).not.toHaveProperty('label');
  });

  it('maps invite rows, with a missing label and use date left out', async () => {
    answer(RAW.list_my_pro_invites);
    const invites = await pro.listMyProInvites();
    expect(invites[0]).toEqual({ id: 'i1', code: 'ABCDE23456', label: 'Maya', status: 'used', createdAt: '2026-10-23T10:00:00+00:00', expiresAt: '2026-10-30T10:00:00+00:00', usedAt: '2026-10-24T10:00:00+00:00', connected: true });
    expect(invites[1].label).toBeUndefined();
    expect(invites[1].usedAt).toBeUndefined();
  });

  it('turns { valid: false } and { ok: false } into ProError("invite_invalid")', async () => {
    answer({ valid: false, error: 'invite_invalid' });
    await expect(pro.previewProInvite('ABCDE23456')).rejects.toMatchObject({ name: 'ProError', code: 'invite_invalid' });
    answer({ ok: false, error: 'invite_invalid' });
    await expect(pro.redeemProInvite('ABCDE23456', 'Maya')).rejects.toMatchObject({ name: 'ProError', code: 'invite_invalid' });
    answer(null);
    await expect(pro.previewProInvite('ABCDE23456')).rejects.toMatchObject({ code: 'unknown' });
  });

  it('maps a preview and a redeem', async () => {
    answer(RAW.preview_pro_invite);
    expect(await pro.previewProInvite('ABCDE23456')).toEqual({ inviteId: 'i1', alreadyConnected: true, clientTermsCurrent: false, stylist: STYLIST_CARD });
    answer(RAW.redeem_pro_invite);
    expect(await pro.redeemProInvite('ABCDE23456', 'Maya')).toEqual({ connectionId: 'c1', alreadyConnected: true });
  });

  it('maps connection rows to camelCase and leaves out what is null', async () => {
    answer(RAW.list_pro_connections);
    const [full, bare] = await pro.listProConnections();
    expect(full).toEqual({
      id: 'c1', myRole: 'client', otherLabel: 'Ann Lee', otherHeadline: 'Wardrobe edits', status: 'ended', endedBy: 'stylist',
      startedAt: '2026-10-01T10:00:00+00:00', endedAt: '2026-10-05T10:00:00+00:00', lastActivityAt: '2026-10-05T10:00:00+00:00', unread: 2, attention: true,
      nextAppointmentAt: '2026-11-01T15:00:00+00:00', pendingAppointments: 1, closetShared: true, closetExpiresAt: '2026-12-30T10:00:00+00:00',
      lastMessagePreview: 'See you then', lastMessageAt: '2026-10-05T09:00:00+00:00',
    });
    for (const key of ['otherHeadline', 'endedBy', 'endedAt', 'nextAppointmentAt', 'closetExpiresAt', 'lastMessagePreview', 'lastMessageAt']) {
      expect((bare as any)[key]).toBeUndefined();
    }
    expect(bare).toMatchObject({ id: 'c2', myRole: 'stylist', otherLabel: 'Former client', status: 'active', unread: 0, attention: false, closetShared: false });
  });

  it('maps a connection', async () => {
    answer(RAW.get_pro_connection);
    const c = await pro.getProConnection('c1');
    expect(c).toMatchObject({ id: 'c1', myRole: 'client', status: 'ended', endedBy: 'them', otherLabel: 'Ann Lee', myAlias: 'Maya L', safetyOnly: true, stylist: STYLIST_CARD });
    expect(c.closet).toEqual(RAW.get_pro_connection.closet);
    expect(c.counts).toEqual({ looks: 2, upcoming: 1 });
    expect(c.actions).toEqual(RAW.get_pro_connection.actions);
  });

  it('maps a stylist-side connection, where the client-only parts are empty', async () => {
    answer({
      connectionId: 'c2', myRole: 'stylist', status: 'active', endedBy: null, startedAt: 's', otherLabel: 'Maya L', myAlias: null, safetyOnly: false, stylist: null,
      closet: { shared: false, itemMode: null, itemCount: null, expiresAt: null, expiresSoon: false, lastViewedAt: null, views30d: 0 },
      counts: { looks: 0, upcoming: 0 },
      actions: { canMessage: true, canPropose: true, canRecommend: true, canEnd: true, canViewCloset: false, canShare: false, canStopSharing: false, canRename: false },
    });
    const c = await pro.getProConnection('c2');
    expect(c).toMatchObject({ endedBy: null, myAlias: null, stylist: null, endedAt: undefined });
    expect(c.closet).toEqual({ shared: false, itemMode: null, itemCount: null, expiresAt: null, expiresSoon: false, lastViewedAt: null, views30d: 0 });
  });

  it('maps a grant for the client and for the stylist', async () => {
    answer(GRANT);
    const g = await pro.getProGrant('c1');
    expect(g).toMatchObject({ scope: 'closet', enabled: true, itemMode: 'selected', itemIds: ['i1', 'i2'], expiresSoon: true, textVersion: '2026-10', views30d: 3 });
    expect(g.events).toEqual([
      { event: 'granted', itemMode: 'selected', itemCount: 2, at: '2026-10-01T10:00:00+00:00' },
      { event: 'revoked', itemMode: undefined, itemCount: undefined, at: '2026-10-03T10:00:00+00:00' },
    ]);
    answer({ scope: 'closet', enabled: true, itemMode: 'selected', itemCount: 3, expiresAt: '2026-12-30T10:00:00+00:00' });
    const s = await pro.getProGrant('c1');
    expect(s).toEqual({ scope: 'closet', enabled: true, itemMode: 'selected', itemCount: 3, expiresAt: '2026-12-30T10:00:00+00:00' });
    expect(s.itemIds).toBeUndefined();
    answer({ scope: 'closet', enabled: false, itemMode: null });
    expect(await pro.getProGrant('c1')).toEqual({ scope: 'closet', enabled: false, itemMode: null });
  });

  it('maps a closet page with its total, and an empty page with zero', async () => {
    answer(RAW.get_client_closet);
    const page = await pro.getClientCloset('c1');
    expect(page.total).toBe(12);
    expect(page.items[0]).toEqual({
      id: 'i1', name: 'Blue blazer', category: 'Outerwear', subcategory: 'Blazer', color: 'blue', brand: 'Zara', season: ['winter'], pattern: 'solid',
      material: 'wool', materials: [{ name: 'wool', percentage: 80 }], size: 'M', condition: 'good', hasPhoto: true,
    });
    expect(page.items[1]).toMatchObject({ id: 'i2', hasPhoto: false, subcategory: undefined, season: undefined, materials: undefined });
    answer([]);
    expect(await pro.getClientCloset('c1')).toEqual({ items: [], total: 0 });
  });

  it('never carries a photo address, a path or an account id out of the closet mapping', () => {
    const item = pro.mapClosetRow({ ...CLOSET_ROW, user_image: 'https://x/ACCOUNT/p.jpg', photo_path: 'ACCOUNT/p.jpg', user_id: 'ACCOUNT' });
    expect(JSON.stringify(item)).not.toMatch(/ACCOUNT|https:|photo_path|user_image|user_id/);
  });

  it('maps looks: rows, one look, and a saved draft', async () => {
    answer(RAW.list_pro_recommendations);
    const [sent, draft] = await pro.listProLooks('c1');
    expect(sent).toEqual({
      id: 'l1', status: 'sent', title: 'Date night', itemCount: 3, coverItemId: 'i1', coverPhotoPath: 'me/blazer.jpg', sentAt: '2026-10-02T10:00:00+00:00',
      viewedAt: '2026-10-03T10:00:00+00:00', updatedAt: '2026-10-03T10:00:00+00:00', clientRating: 5, isNew: true,
    });
    expect(draft).toMatchObject({ id: 'l2', status: 'draft', clientRating: undefined, coverItemId: undefined, coverPhotoPath: undefined, sentAt: undefined, isNew: false });
    answer(LOOK);
    const look = await pro.getProLook('l1');
    expect(look).toMatchObject({ id: 'l1', connectionId: 'c1', status: 'implemented', body: 'Wear the blue blazer.', implementedAt: '2026-10-04T10:00:00+00:00' });
    expect(look.items[0]).toEqual({ position: 1, itemId: 'i1', name: 'Blue blazer', category: 'Outerwear', color: 'blue', brand: 'Zara', hasPhoto: true, photoPath: 'me/blazer.jpg', available: true });
    expect(look.items[1]).toMatchObject({ position: 2, itemId: undefined, name: 'Old scarf', hasPhoto: false, photoPath: undefined, available: false });
    expect(look.feedback).toEqual({ rating: 5, comment: 'Loved it', at: '2026-10-04T11:00:00+00:00' });
    expect(look.actions).toEqual(LOOK.actions);
    answer({ ...LOOK, feedback: null });
    expect((await pro.getProLook('l1')).feedback).toBeNull();
    answer(RAW.save_pro_recommendation);
    expect(await pro.saveProLook({ connectionId: 'c1', title: 'T', body: '', clientRef: 'r' })).toEqual({ id: 'l1', status: 'draft', updatedAt: '2026-10-02T10:00:00+00:00' });
  });

  it('maps sessions, a proposal and a message sent', async () => {
    answer(RAW.list_pro_appointments);
    expect(await pro.listProSessions({ scope: 'upcoming' })).toEqual([{
      id: 'a1', connectionId: 'c1', otherLabel: 'Ann Lee', myRole: 'client', status: 'proposed', proposedBy: 'stylist', startsAt: '2026-11-01T15:00:00+00:00',
      durationMinutes: 60, mode: 'in_person', place: 'Cafe Rose', note: 'Bring swatches', utcOffsetMinutes: 60, canConfirm: true, canDecline: true, canCancel: true,
      createdAt: '2026-10-20T10:00:00+00:00',
    }]);
    answer(RAW.propose_pro_appointment);
    expect(await pro.proposeProSession({ connectionId: 'c1', startsAt: 's', durationMinutes: 15, mode: 'virtual', clientRef: 'r' })).toEqual({ id: 'a1', status: 'proposed' });
    answer(RAW.send_pro_message);
    expect(await pro.sendProMessage('c1', 'hi', 'r')).toEqual({ id: 42, at: '2026-10-23T10:00:00+00:00' });
  });

  it('maps a thread: me, them, system lines, and whether more can be loaded', async () => {
    answer(RAW.get_pro_thread);
    const t = await pro.getProThread('c1');
    expect(t.hasMore).toBe(true);
    expect(t.canSend).toBe(true);
    expect(t.messages.map(m => [m.id, m.from, m.body, m.code])).toEqual([[1, 'system', '', 'connected'], [2, 'them', 'Hello', undefined], [3, 'me', 'Hi', undefined]]);
    answer({ messages: [], hasMore: false, actions: { canSend: false } });
    expect(await pro.getProThread('c1')).toEqual({ messages: [], hasMore: false, canSend: false });
  });

  it('maps blocks and the export', async () => {
    answer(RAW.list_pro_blocks);
    expect(await pro.listProBlocks()).toEqual([{ ref: 'r1', label: 'Former stylist', blockedAt: '2026-10-06T10:00:00+00:00' }]);
    answer(RAW.export_my_pro_data);
    expect(await pro.exportMyProData()).toEqual(RAW.export_my_pro_data);
    answer({});
    expect(await pro.exportMyProData()).toEqual({ settings: {}, stylistProfile: null, invites: [], connections: [] });
  });
});

describe('PRO_RPC_COLUMNS and the mappers', () => {
  // Reads of the top-level columns of a raw answer are recorded, so a mapper cannot read a column the list does not
  // name, and a column in the list cannot go unread. proServiceInStepWithSql.test.ts compares the list with the SQL.
  const watch = (raw: any, seen: Set<string>): any => {
    const spy = (o: any) => new Proxy(o, { get: (t, k) => { if (typeof k === 'string') seen.add(k); return t[k as any]; } });
    return Array.isArray(raw) ? raw.map(r => (r && typeof r === 'object' ? spy(r) : r)) : spy(raw);
  };

  it('has an entry for every answer in the fixtures, and a mapper for each', () => {
    expect(Object.keys(pro.PRO_RPC_COLUMNS).sort()).toEqual(Object.keys(RAW).sort());
    expect(Object.keys(pro.PRO_RPC_MAPPERS).sort()).toEqual(Object.keys(RAW).sort());
  });

  it.each(Object.keys(RAW))('%s: the fixture has exactly the listed columns, and the mapper reads exactly those', rpc => {
    const raw = RAW[rpc];
    const columns = [...pro.PRO_RPC_COLUMNS[rpc]];
    const sample = Array.isArray(raw) ? raw[0] : raw;
    expect(Object.keys(sample).sort()).toEqual([...columns].sort());
    const seen = new Set<string>();
    expect(() => pro.PRO_RPC_MAPPERS[rpc](watch(raw, seen))).not.toThrow();
    expect([...seen].sort()).toEqual([...columns].sort());
  });

  it('tables use snake_case columns and jsonb answers camelCase keys', () => {
    for (const [rpc, columns] of Object.entries(pro.PRO_RPC_COLUMNS)) {
      const isTable = Array.isArray(RAW[rpc]);
      for (const c of columns) expect(c).toMatch(isTable ? /^[a-z0-9]+(_[a-z0-9]+)*$/ : /^[a-z][A-Za-z0-9]*$/);
    }
  });

  it('every mapper survives an answer with nothing in it without a TypeError', () => {
    for (const [rpc, map] of Object.entries(pro.PRO_RPC_MAPPERS)) {
      try {
        map(Array.isArray(RAW[rpc]) ? [] : null);
      } catch (e) {
        expect(e).toBeInstanceOf(ProError);
      }
    }
  });
});

describe('errors', () => {
  it('turns a server error into a ProError with its detail and hint', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'text_not_allowed', details: 'bio', hint: 'contact', code: '22023' } });
    await expect(pro.saveStylistProfile({ displayName: 'Ann', headline: '', bio: 'x', services: ['outfit_styling'], languages: [], ratesText: '', accepting: true }))
      .rejects.toMatchObject({ name: 'ProError', code: 'text_not_allowed', detail: 'bio', hint: 'contact' });
  });

  it('turns a request that never got an answer into a ProError, offline', async () => {
    mockRpc.mockRejectedValueOnce(new TypeError('Network request failed'));
    await expect(pro.listProConnections()).rejects.toMatchObject({ name: 'ProError', code: 'offline' });
    mockRpc.mockRejectedValueOnce(new Error('something odd'));
    await expect(pro.getProConnection('c1')).rejects.toMatchObject({ name: 'ProError', code: 'unknown' });
  });

  it('reads a server without the functions as not deployed', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'Could not find the function public.get_pro_status without parameters', code: 'PGRST202' } });
    await expect(pro.getProStatus()).rejects.toMatchObject({ code: 'not_deployed' });
  });

  it('the badge is zero for an error, a rejection, an odd answer and a negative one, and never throws', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'pro_disabled' } });
    expect(await pro.getProBadge()).toBe(0);
    mockRpc.mockRejectedValueOnce(new Error('offline'));
    expect(await pro.getProBadge()).toBe(0);
    answer('nonsense');
    expect(await pro.getProBadge()).toBe(0);
    answer(-3);
    expect(await pro.getProBadge()).toBe(0);
    answer(5);
    expect(await pro.getProBadge()).toBe(5);
  });

  it('a failing call writes nothing to the device and says nothing on the console', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'pro_unavailable', code: '22023' } });
    await expect(pro.getProConnection('c1')).rejects.toMatchObject({ code: 'pro_unavailable' });
    mockGetSession.mockResolvedValue({ data: { session: null } });
    await expect(pro.getProStatus()).rejects.toMatchObject({ code: 'not_authenticated' });
    expect(error).not.toHaveBeenCalled();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    error.mockRestore();
  });
});

describe('importing the module', () => {
  it('does nothing: no session read, no call, no stored key', () => {
    jest.isolateModules(() => {
      require('../../src/services/proService');
    });
    expect(mockGetSession).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    expect(AsyncStorage.getItem).not.toHaveBeenCalled();
  });

  it('keeps no state about another person between calls', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../src/services/proService.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:'"\w])\/\/.*$/gm, '$1');
    expect(source).not.toMatch(/AsyncStorage|\.channel\(|new Map\(|new Set\(|localStorage/);
  });
});
