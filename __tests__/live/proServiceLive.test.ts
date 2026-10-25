/**
 * proService against a real local Supabase stack (documentation/design/pro-accounts.md 9.3, stream PAPI).
 *
 * Every mapper in proService.ts is pinned to PRO_RPC_COLUMNS, and every suite that uses them runs on fixtures typed
 * by hand. Here the fixtures are the real thing: the pro migrations answer, and the answer goes through the same
 * mappers the screens use, so a renamed column or jsonb key fails in this file and not on a phone.
 *
 * Skipped unless all three of these are set, and they must point at a LOCAL stack (`supabase start`): the file creates
 * accounts and rows, changes the server switch for its duration, and removes what it made.
 *
 *   PRO_LIVE_URL=http://127.0.0.1:54321 PRO_LIVE_ANON_KEY=... PRO_LIVE_SERVICE_KEY=... \
 *     npx jest __tests__/live/proServiceLive.test.ts --maxWorkers=1
 *
 * (`supabase status -o env` prints the URL and the two keys.) Without them the whole suite is skipped and nothing is
 * contacted. The supabase client is replaced by one that talks to that stack with the token of whoever is acting.
 */
const mockGetSession = jest.fn();
const mockRpc = jest.fn();
jest.mock('../../src/config/supabase', () => ({
  supabase: {
    auth: { getSession: (...a: any[]) => mockGetSession(...a) },
    rpc: (...a: any[]) => mockRpc(...a),
  },
}));

import { randomUUID } from 'crypto';
import * as pro from '../../src/services/proService';
import { ProError } from '../../src/services/proErrors';
import { PRO_CLIENT_TERMS_VERSION, PRO_SHARE_TEXT_VERSION, PRO_STYLIST_TERMS_VERSION } from '../../src/config/proRules';

const URL_ = (process.env.PRO_LIVE_URL ?? '').replace(/\/+$/, '');
const ANON = process.env.PRO_LIVE_ANON_KEY ?? '';
const SERVICE = process.env.PRO_LIVE_SERVICE_KEY ?? '';
const live = Boolean(URL_ && ANON && SERVICE);

// The same rule as scripts/pro-api-checks.mjs, stricter: only a local stack. The host is read from the parsed URL.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const assertLocalStack = (raw: string): void => {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error('PRO_LIVE_URL is not a URL');
  }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.search || u.hash || (u.pathname !== '/' && u.pathname !== '')) {
    throw new Error('PRO_LIVE_URL must be the plain address of a local stack');
  }
  if (!LOCAL_HOSTS.has(u.hostname)) throw new Error(`refusing to run: ${u.hostname} is not a local stack (this file creates accounts and rows)`);
};

describe('the live file only ever talks to a local stack', () => {
  it('accepts the addresses of a local stack', () => {
    for (const url of ['http://127.0.0.1:54321', 'http://localhost:54321', 'http://[::1]:54321', 'http://localhost:54321/']) {
      expect(() => assertLocalStack(url)).not.toThrow();
    }
  });

  it('refuses anything else, wherever "localhost" also appears', () => {
    for (const url of [
      'https://db.invalid', 'http://localhost.invalid:54321', 'http://127.0.0.1.invalid', 'http://db.invalid/127.0.0.1',
      'http://db.invalid?host=localhost', 'http://localhost:pw@db.invalid', 'http://127.0.0.1:54321/rest/v1', 'ftp://127.0.0.1', 'not a url',
    ]) {
      expect(() => assertLocalStack(url)).toThrow();
    }
  });

  it('is skipped, and contacts nothing, without its three variables', () => {
    expect(typeof live).toBe('boolean');
    if (!live) expect(mockRpc).not.toHaveBeenCalled();
  });
});

type Person = { name: string; id: string; email: string; password: string; token: string };
const newPerson = (name: string): Person => ({ name, id: '', email: '', password: '', token: '' });
const RUN = Math.random().toString(16).slice(2, 8);
const UUID = (): string => randomUUID();

const call = async (method: string, path: string, opts: { token?: string; key?: string; body?: unknown; headers?: Record<string, string> } = {}) => {
  const key = opts.key ?? ANON;
  const res = await fetch(`${URL_}${path}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${opts.token ?? key}`, 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, json };
};
const admin = (method: string, path: string, body?: unknown, headers?: Record<string, string>) =>
  call(method, path, { key: SERVICE, body, headers });
const adminRpc = (fn: string, args: Record<string, unknown> = {}) => admin('POST', `/rest/v1/rpc/${fn}`, args);

(live ? describe : describe.skip)('proService over a real local stack', () => {
  jest.setTimeout(240000);
  const ann = newPerson('ann');
  const bea = newPerson('bea');
  const cat = newPerson('cat');
  const eve = newPerson('eve');
  const people = [ann, bea, cat, eve];
  let acting: Person = ann;
  let initial: Record<string, any> = {};
  const addedTerms: string[] = [];
  const ctx: Record<string, any> = {};

  // supabase-js is replaced by a client for the stack, in the shape the service reads: { data, error } with a
  // PostgREST error body as the error.
  const rpcAs = async (who: Person, fn: string, args?: Record<string, unknown>) => {
    const r = await call('POST', `/rest/v1/rpc/${fn}`, { token: who.token, body: args ?? {} });
    return r.status >= 400 ? { data: null, error: r.json && typeof r.json === 'object' ? r.json : { message: String(r.json) } } : { data: r.json, error: null };
  };
  const as = (who: Person) => { acting = who; };
  const raw = async (who: Person, fn: string, args?: Record<string, unknown>) => {
    const r = await rpcAs(who, fn, args);
    if (r.error) throw new Error(`${who.name} ${fn}: ${JSON.stringify(r.error)}`);
    return r.data;
  };

  const signUp = async (p: Person) => {
    p.email = `pro-live-${RUN}-${p.name}@example.test`;
    p.password = `Pw-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    const made = await admin('POST', '/auth/v1/admin/users', { email: p.email, password: p.password, email_confirm: true, user_metadata: { name: p.name } });
    if (made.status >= 300 || !made.json?.id) throw new Error(`cannot create ${p.name}: HTTP ${made.status}`);
    p.id = made.json.id;
    const tok = await call('POST', '/auth/v1/token?grant_type=password', { body: { email: p.email, password: p.password } });
    if (tok.status >= 300 || !tok.json?.access_token) throw new Error(`cannot sign in ${p.name}: HTTP ${tok.status}`);
    p.token = tok.json.access_token;
  };

  beforeAll(async () => {
    assertLocalStack(URL_);
    mockGetSession.mockImplementation(async () => ({ data: { session: acting.token ? { user: { id: acting.id } } : null } }));
    mockRpc.mockImplementation((fn: string, args?: Record<string, unknown>) => rpcAs(acting, fn, args));

    for (const p of people) await signUp(p);
    const cfg = await admin('GET', '/rest/v1/pro_config?select=key,value');
    if (cfg.status !== 200) throw new Error(`pro_config is not readable (HTTP ${cfg.status}): are the pro migrations applied?`);
    initial = Object.fromEntries((cfg.json as any[]).map(r => [r.key, r.value]));
    const terms = await admin('GET', '/rest/v1/swap_blocked_terms?select=term&kind=eq.content');
    const have = Array.isArray(terms.json) ? terms.json.length : 0;
    if (have < 50) {
      const rows = Array.from({ length: 50 - have }, (_, i) => ({ term: `apilive${RUN}x${i}`, kind: 'content' }));
      const ins = await admin('POST', '/rest/v1/swap_blocked_terms', rows, { Prefer: 'return=minimal' });
      if (ins.status >= 300) throw new Error(`cannot load content terms: HTTP ${ins.status}`);
      addedTerms.push(...rows.map(r => r.term));
    }
    const on = await adminRpc('pro_set_enabled', { p_on: true });
    if (on.status >= 300) throw new Error(`cannot switch the feature on: HTTP ${on.status} ${JSON.stringify(on.json)}`);
    await admin('PATCH', '/rest/v1/pro_config?key=eq.min_account_age_hours', { value: 0 });

    // Bea's closet: three pieces with a photo address in her own folder, one on the wishlist.
    const photo = (file: string) => `${URL_}/storage/v1/object/public/wardrobe-images/${bea.id}/${file}`;
    const items = await admin('POST', '/rest/v1/clothing_items', [
      { user_id: bea.id, name: 'Blue blazer', category: 'outerwear', brand: 'Zara', color: 'blue', user_image: photo('a.jpg') },
      { user_id: bea.id, name: 'Red scarf', category: 'accessories', color: 'red', user_image: photo('b.jpg') },
      { user_id: bea.id, name: 'Linen shirt', category: 'tops', color: 'white', user_image: photo('c.jpg') },
      { user_id: bea.id, name: 'Wishlist coat', category: 'outerwear', is_wishlist: true },
    ], { Prefer: 'return=representation' });
    if (items.status >= 300) throw new Error(`cannot add closet rows: HTTP ${items.status}`);
    ctx.items = Object.fromEntries((items.json as any[]).map(r => [r.name, r.id]));

    // The story, through the service: a stylist, a client, a connection, a shared closet, a look, a session, a message.
    as(ann);
    await pro.acceptProTerms('stylist', true);
    await pro.saveStylistProfile({
      displayName: 'Ann Styles', headline: 'Wardrobe edits', bio: 'Ten years of styling.', services: ['outfit_styling', 'wardrobe_audit'],
      languages: ['en'], ratesText: 'From $80 per session', accepting: true,
    });
    await adminRpc('pro_admin_approve_stylist', { p_user: ann.id });
    ctx.invite = await pro.createProInvite({ label: 'for Bea', clientRef: UUID() });
    ctx.inviteForCat = await pro.createProInvite({ clientRef: UUID() });
    ctx.inviteLive = await pro.createProInvite({ clientRef: UUID() });
    as(bea);
    await pro.acceptProTerms('client', true);
    ctx.redeemed = await pro.redeemProInvite(ctx.invite.code, 'Bea B');
    ctx.connection = ctx.redeemed.connectionId;
    await pro.setProGrant(ctx.connection, { enabled: true, itemMode: 'selected', itemIds: [ctx.items['Blue blazer'], ctx.items['Red scarf']] });
    as(ann);
    ctx.closet = await pro.getClientCloset(ctx.connection);
    ctx.look = await pro.saveProLook({ connectionId: ctx.connection, title: 'Autumn look', body: 'Layer it.', itemIds: [ctx.items['Blue blazer']], clientRef: UUID() });
    await pro.sendProLook(ctx.look.id);
    ctx.session = await pro.proposeProSession({
      connectionId: ctx.connection, startsAt: new Date(Date.now() + 3 * 86400e3), durationMinutes: 45, mode: 'virtual', note: 'Intro call', clientRef: UUID(),
    });
    await pro.sendProMessage(ctx.connection, 'Hello Bea', UUID());
    as(bea);
    await pro.getProLook(ctx.look.id);
    // Cat looks at the second code and blocks that stylist before connecting: something to list under "blocked".
    as(cat);
    await pro.acceptProTerms('client', true);
    ctx.catPreview = await pro.previewProInvite(ctx.inviteForCat.code);
    await pro.blockProMember({ inviteId: ctx.catPreview.inviteId });
  });

  afterAll(async () => {
    try {
      if (initial.min_account_age_hours !== undefined) await admin('PATCH', '/rest/v1/pro_config?key=eq.min_account_age_hours', { value: initial.min_account_age_hours });
      if (initial.pro_enabled !== true) await adminRpc('pro_set_enabled', { p_on: false });
      if (addedTerms.length) await admin('DELETE', `/rest/v1/swap_blocked_terms?term=in.(${addedTerms.join(',')})`, undefined, { Prefer: 'return=minimal' });
    } finally {
      for (const p of people) if (p.id) await admin('DELETE', `/auth/v1/admin/users/${p.id}`);
    }
  });

  // The raw answer of every function that PRO_RPC_COLUMNS lists, for someone who can make it, in a state that has data.
  const CASES: Record<string, () => Promise<unknown>> = {
    get_pro_status: () => raw(ann, 'get_pro_status'),
    get_my_stylist_profile: () => raw(ann, 'get_my_stylist_profile'),
    save_stylist_profile: () => raw(ann, 'save_stylist_profile', {
      p_display_name: 'Ann Styles', p_headline: 'Wardrobe edits', p_bio: 'Ten years of styling.', p_services: ['outfit_styling', 'wardrobe_audit'],
      p_languages: ['en'], p_rates_text: 'From $80 per session', p_accepting: true,
    }),
    create_pro_invite: () => raw(ann, 'create_pro_invite', { p_client_ref: UUID(), p_label: 'another' }),
    list_my_pro_invites: () => raw(ann, 'list_my_pro_invites'),
    preview_pro_invite: () => raw(eve, 'preview_pro_invite', { p_code: ctx.inviteLive.code }),
    redeem_pro_invite: () => raw(bea, 'redeem_pro_invite', { p_code: ctx.invite.code, p_alias: 'Bea B' }),
    list_pro_connections: () => raw(bea, 'list_pro_connections', { p_as: 'client' }),
    get_pro_connection: () => raw(bea, 'get_pro_connection', { p_connection: ctx.connection }),
    get_pro_grant: () => raw(bea, 'get_pro_grant', { p_connection: ctx.connection }),
    set_pro_grant: () => raw(bea, 'set_pro_grant', {
      p_connection: ctx.connection, p_scope: 'closet', p_enabled: true, p_item_mode: 'selected',
      p_item_ids: [ctx.items['Blue blazer'], ctx.items['Red scarf']], p_text_version: PRO_SHARE_TEXT_VERSION,
    }),
    get_client_closet: () => raw(ann, 'get_client_closet', { p_connection: ctx.connection }),
    save_pro_recommendation: () => raw(ann, 'save_pro_recommendation', { p_connection: ctx.connection, p_title: 'Another look', p_body: 'Try it.', p_client_ref: UUID() }),
    list_pro_recommendations: () => raw(bea, 'list_pro_recommendations', { p_connection: ctx.connection }),
    get_pro_recommendation: () => raw(bea, 'get_pro_recommendation', { p_id: ctx.look.id }),
    propose_pro_appointment: () => raw(bea, 'propose_pro_appointment', {
      p_connection: ctx.connection, p_starts_at: new Date(Date.now() + 5 * 86400e3).toISOString(), p_duration_minutes: 30, p_mode: 'virtual',
      p_utc_offset_minutes: 60, p_client_ref: UUID(),
    }),
    list_pro_appointments: () => raw(bea, 'list_pro_appointments', { p_connection: ctx.connection }),
    send_pro_message: () => raw(bea, 'send_pro_message', { p_connection: ctx.connection, p_body: 'Thank you', p_client_ref: UUID() }),
    get_pro_thread: () => raw(bea, 'get_pro_thread', { p_connection: ctx.connection }),
    list_pro_blocks: () => raw(cat, 'list_pro_blocks'),
    export_my_pro_data: () => raw(ann, 'export_my_pro_data'),
  };

  it('has a real answer for every function in PRO_RPC_COLUMNS, and no other', () => {
    expect(Object.keys(CASES).sort()).toEqual(Object.keys(pro.PRO_RPC_COLUMNS).sort());
    expect(Object.keys(pro.PRO_RPC_MAPPERS).sort()).toEqual(Object.keys(pro.PRO_RPC_COLUMNS).sort());
  });

  it.each(Object.keys(pro.PRO_RPC_COLUMNS))('%s: the answer has the columns the mapper reads, and the mapper maps it', async fn => {
    const answer: any = await CASES[fn]();
    const columns = [...pro.PRO_RPC_COLUMNS[fn]];
    const isTable = Array.isArray(answer);
    if (isTable) {
      expect(answer.length).toBeGreaterThan(0);                                        // the story left something in every list
      for (const row of answer) expect(Object.keys(row).sort()).toEqual([...columns].sort());
    } else {
      expect(answer).not.toBeNull();
      for (const c of columns) expect(Object.keys(answer)).toContain(c);              // a renamed key fails here
      // and one level down: every part the mapper reads inside the answer (a part that is null on this side has nothing to check)
      for (const [part, keys] of Object.entries(pro.PRO_RPC_NESTED[fn] ?? {})) {
        const value = answer[part];
        const elements: any[] = Array.isArray(value) ? value : value && typeof value === 'object' ? [value] : [];
        for (const element of elements) for (const k of keys) expect({ fn, part, k, has: Object.keys(element).includes(k) }).toEqual({ fn, part, k, has: true });
      }
    }
    const mapped = pro.PRO_RPC_MAPPERS[fn](answer);
    expect(mapped).toBeDefined();
    expect(mapped).not.toBeNull();
  });

  it('maps both sides of a grant, and the stylist\'s side carries only what a stylist may know', async () => {
    const mine: any = await raw(bea, 'get_pro_grant', { p_connection: ctx.connection });
    const theirs: any = await raw(ann, 'get_pro_grant', { p_connection: ctx.connection });
    expect(pro.mapGrant(mine)).toMatchObject({ scope: 'closet', enabled: true, itemMode: 'selected', itemCount: 2 });
    expect(pro.mapGrant(mine).itemIds).toHaveLength(2);
    expect(pro.mapGrant(mine).events?.[0]).toMatchObject({ event: 'granted' });
    expect(Object.keys(theirs).sort()).toEqual(['enabled', 'expiresAt', 'itemCount', 'itemMode', 'scope']);
    expect(pro.mapGrant(theirs)).toMatchObject({ enabled: true, itemMode: 'selected', itemCount: 2 });
  });

  it('turns the two invite lookups\' failure results into ProError(invite_invalid)', async () => {
    const preview: any = await raw(cat, 'preview_pro_invite', { p_code: 'ZZZZZZZZZZ' });
    expect(preview).toEqual({ valid: false, error: 'invite_invalid' });
    expect(() => pro.mapPreviewResult(preview)).toThrow(ProError);
    as(cat);
    await expect(pro.previewProInvite('ZZZZZ-ZZZZZ')).rejects.toMatchObject({ code: 'invite_invalid' });
    const redeem: any = await raw(cat, 'redeem_pro_invite', { p_code: 'ZZZZZZZZZZ', p_alias: 'Cat C' });
    expect(redeem).toEqual({ ok: false, error: 'invite_invalid' });
    expect(() => pro.mapRedeemResult(redeem)).toThrow(ProError);
  });

  it('works through the service the way the screens use it', async () => {
    as(bea);
    const status = await pro.getProStatus();
    expect(status).toMatchObject({ proEnabled: true, adultConfirmed: true });
    expect(status.versions).toEqual({ stylistTerms: PRO_STYLIST_TERMS_VERSION, clientTerms: PRO_CLIENT_TERMS_VERSION, shareText: PRO_SHARE_TEXT_VERSION });
    expect(typeof (await pro.getProBadge())).toBe('number');
    const connections = await pro.listProConnections('client');
    expect(connections[0]).toMatchObject({ id: ctx.connection, myRole: 'client', otherLabel: 'Ann Styles', status: 'active', closetShared: true });
    const detail = await pro.getProConnection(ctx.connection);
    expect(detail).toMatchObject({ myRole: 'client', myAlias: 'Bea B', safetyOnly: false });
    expect(detail.stylist?.name).toBe('Ann Styles');
    const looks = await pro.listProLooks(ctx.connection);
    expect(looks[0]).toMatchObject({ id: ctx.look.id, status: 'viewed' });
    const thread = await pro.getProThread(ctx.connection);
    expect(thread.messages.some(m => m.from === 'them' && m.body === 'Hello Bea')).toBe(true);
    as(ann);
    const page = await pro.getClientCloset(ctx.connection);
    expect(page.total).toBe(2);
    expect(page.items.map(i => i.name).sort()).toEqual(['Blue blazer', 'Red scarf']);
    expect(page.items.every(i => i.hasPhoto)).toBe(true);
    const invites = await pro.listMyProInvites();
    expect(invites.find(i => i.id === ctx.invite.id)).toMatchObject({ status: 'used', connected: true, label: 'for Bea' });
  });

  it('leaves a guest, and a server error, as ProErrors', async () => {
    acting = newPerson('nobody');
    await expect(pro.getProStatus()).rejects.toMatchObject({ code: 'not_authenticated' });
    as(bea);
    await expect(pro.saveStylistProfile({
      displayName: 'Official Support', headline: '', bio: '', services: ['outfit_styling'], languages: [], ratesText: '', accepting: true,
    })).rejects.toBeInstanceOf(ProError);
  });
});
