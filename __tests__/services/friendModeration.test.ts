const mockRpc = jest.fn();
const mockFrom = jest.fn();
const mockGetSession = jest.fn();
jest.mock('../../src/config/supabase', () => ({
  supabase: {
    rpc: (...a: any[]) => mockRpc(...a),
    from: (...a: any[]) => mockFrom(...a),
    auth: { getSession: () => mockGetSession() },
  },
}));
jest.mock('../../src/services/imageUrls', () => ({
  withSignedImages: async (items: any[]) => items,
  canonicalizeImageUrl: (u: any) => u,
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import {
  blockUser,
  getBlockedUsers,
  getFriends,
  getPendingRequests,
  normalizeReportDetails,
  reportUser,
  sendFriendRequest,
  unblockUser,
} from '../../src/services/friendService';

type Result = { data?: any; error?: any };

/** A chainable stand-in for a supabase-js query: every step returns itself and
 * awaiting it (or maybeSingle) yields the canned result. */
const makeQuery = (result: Result) => {
  const q: any = {};
  ['select', 'eq', 'or', 'order', 'insert', 'delete'].forEach(m => {
    q[m] = jest.fn(() => q);
  });
  q.maybeSingle = jest.fn(async () => result);
  q.then = (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject);
  return q;
};

/** Routes supabase.from(table) to a canned result and remembers each query. */
const stubTables = (tables: Record<string, Result>) => {
  const queries: Record<string, any[]> = {};
  mockFrom.mockImplementation((table: string) => {
    const q = makeQuery(tables[table] ?? { data: [], error: null });
    (queries[table] ||= []).push(q);
    return q;
  });
  return queries;
};

const ME = 'me';

beforeEach(() => {
  mockRpc.mockReset();
  mockFrom.mockReset();
  mockGetSession.mockReset().mockResolvedValue({ data: { session: { user: { id: ME, email: 'me@x.com' } } } });
});

describe('blockUser', () => {
  it('calls block_user with the person to block', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await blockUser('u1');
    expect(mockRpc).toHaveBeenCalledWith('block_user', { p_user_id: 'u1' });
  });

  it('turns a failure into a readable message instead of the raw database error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'permission denied for function block_user', code: '42501' } });
    await expect(blockUser('u1')).rejects.toThrow('Couldn’t block this person. Please try again.');
  });

  it('explains when the account no longer exists', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'user_not_found', code: '22023' } });
    await expect(blockUser('gone')).rejects.toThrow('That account no longer exists.');
  });
});

describe('unblockUser', () => {
  it('deletes the block row for that person', async () => {
    const queries = stubTables({ user_blocks: { data: null, error: null } });
    await unblockUser('u1');
    expect(mockFrom).toHaveBeenCalledWith('user_blocks');
    expect(queries.user_blocks[0].delete).toHaveBeenCalled();
    expect(queries.user_blocks[0].eq).toHaveBeenCalledWith('blocked_id', 'u1');
  });

  it('reports a failure', async () => {
    stubTables({ user_blocks: { data: null, error: { message: 'boom' } } });
    await expect(unblockUser('u1')).rejects.toThrow('Couldn’t unblock this person. Please try again.');
  });
});

describe('getBlockedUsers', () => {
  it('lists only the signed-in user\'s blocks, newest first', async () => {
    const queries = stubTables({
      user_blocks: {
        data: [
          { blocked_id: 'u2', blocked_name: 'Bob', created_at: '2026-10-02' },
          { blocked_id: 'u3', blocked_name: null, created_at: '2026-10-01' },
        ],
        error: null,
      },
    });
    const list = await getBlockedUsers();
    expect(queries.user_blocks[0].eq).toHaveBeenCalledWith('blocker_id', ME);
    expect(queries.user_blocks[0].order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(list).toEqual([
      { userId: 'u2', name: 'Bob', blockedAt: '2026-10-02' },
      { userId: 'u3', name: 'Someone', blockedAt: '2026-10-01' },
    ]);
  });

  it('is empty when signed out, without touching the database', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    expect(await getBlockedUsers()).toEqual([]);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('throws when the lookup fails', async () => {
    stubTables({ user_blocks: { data: null, error: new Error('db down') } });
    await expect(getBlockedUsers()).rejects.toThrow('db down');
  });
});

describe('reportUser', () => {
  it('sends the report with the context, reason and cleaned details', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await reportUser('u1', 'friend_request', 'harassment', '  rude name  ');
    expect(mockRpc).toHaveBeenCalledWith('report_user', {
      p_user_id: 'u1',
      p_context: 'friend_request',
      p_reason: 'harassment',
      p_details: 'rude name',
    });
  });

  it('sends null when there are no details', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await reportUser('u1', 'friend_closet', 'spam');
    expect(mockRpc).toHaveBeenCalledWith('report_user', expect.objectContaining({ p_details: null }));
  });

  it('maps the daily limit to a friendly message', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'report_rate_limited', code: '54000' } });
    await expect(reportUser('u1', 'profile', 'spam')).rejects.toThrow('You’ve sent a lot of reports today');
  });

  it('uses a generic message for anything else', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'connection reset' } });
    await expect(reportUser('u1', 'profile', 'spam')).rejects.toThrow('Couldn’t send your report. Please try again.');
  });
});

describe('normalizeReportDetails', () => {
  it('trims, and turns blank into null', () => {
    expect(normalizeReportDetails('  hi  ')).toBe('hi');
    expect(normalizeReportDetails('   ')).toBeNull();
    expect(normalizeReportDetails(undefined)).toBeNull();
  });

  it('cuts to the 500 characters the database allows', () => {
    expect(normalizeReportDetails('x'.repeat(700))).toHaveLength(500);
  });
});

describe('blocked people are hidden from the friend lists', () => {
  const row = (over: any) => ({
    id: 'r', requester_id: ME, recipient_id: 'u2', requester_name: 'Me', recipient_name: 'Bob',
    status: 'pending', created_at: '2026-10-01', responded_at: null, ...over,
  });

  it('getFriends drops a blocked friend on either side of the row', async () => {
    stubTables({
      friend_requests: {
        data: [
          row({ id: 'a', status: 'accepted', recipient_id: 'u2', recipient_name: 'Bob' }),
          row({ id: 'b', status: 'accepted', requester_id: 'u3', recipient_id: ME, requester_name: 'Cat' }),
          row({ id: 'c', status: 'accepted', recipient_id: 'u4', recipient_name: 'Dee' }),
        ],
        error: null,
      },
      user_blocks: { data: [{ blocked_id: 'u2', blocked_name: 'Bob', created_at: 'x' }, { blocked_id: 'u3', blocked_name: 'Cat', created_at: 'x' }], error: null },
    });
    const friends = await getFriends();
    expect(friends.map(f => f.userId)).toEqual(['u4']);
  });

  it('getPendingRequests drops blocked senders and recipients', async () => {
    stubTables({
      friend_requests: {
        data: [
          row({ id: 'in-ok', requester_id: 'u5', recipient_id: ME, requester_name: 'Eve' }),
          row({ id: 'in-blocked', requester_id: 'u2', recipient_id: ME, requester_name: 'Bob' }),
          row({ id: 'out-ok', recipient_id: 'u6', recipient_name: 'Fay' }),
          row({ id: 'out-blocked', recipient_id: 'u2', recipient_name: 'Bob' }),
        ],
        error: null,
      },
      user_blocks: { data: [{ blocked_id: 'u2', blocked_name: 'Bob', created_at: 'x' }], error: null },
    });
    const { incoming, outgoing } = await getPendingRequests();
    expect(incoming.map(r => r.id)).toEqual(['in-ok']);
    expect(outgoing.map(r => r.id)).toEqual(['out-ok']);
  });

  it('shows everyone when nobody is blocked', async () => {
    stubTables({
      friend_requests: { data: [row({ id: 'a', status: 'accepted' })], error: null },
      user_blocks: { data: [], error: null },
    });
    expect(await getFriends()).toHaveLength(1);
  });

  it('does not hide the friends or requests that did load when the block lookup fails', async () => {
    stubTables({
      friend_requests: { data: [row({ id: 'a', status: 'accepted' })], error: null },
      user_blocks: { data: null, error: { message: 'relation "user_blocks" does not exist', code: '42P01' } },
    });
    expect(await getFriends()).toHaveLength(1);
    await expect(getPendingRequests()).resolves.toMatchObject({ incoming: expect.any(Array), outgoing: expect.any(Array) });
  });
});

describe('sendFriendRequest', () => {
  const setup = (insertResult: Result = { data: null, error: null }, blocks: any[] = []) => {
    mockRpc.mockResolvedValue({ data: [{ id: 'u2', name: 'Bob' }], error: null });
    const queries: Record<string, any[]> = {};
    // First friend_requests query is the "already connected?" check, second is the insert.
    let requestCalls = 0;
    mockFrom.mockImplementation((table: string) => {
      const q =
        table === 'user_blocks'
          ? makeQuery({ data: blocks, error: null })
          : makeQuery(requestCalls++ === 0 ? { data: null, error: null } : insertResult);
      (queries[table] ||= []).push(q);
      return q;
    });
    return queries;
  };

  it('does not send a name: the database fills in both display names', async () => {
    const queries = setup();
    expect(await sendFriendRequest(' bob@x.com ')).toBe('sent');
    expect(mockRpc).toHaveBeenCalledWith('find_user_by_email', { target_email: 'bob@x.com' });
    const inserted = queries.friend_requests[1].insert.mock.calls[0][0];
    expect(inserted).toEqual({ requester_id: ME, recipient_id: 'u2', status: 'pending' });
  });

  it('looks like "no such account" when a block stops the request', async () => {
    setup({ data: null, error: { message: 'friend_request_not_allowed', code: '42501' } });
    expect(await sendFriendRequest('bob@x.com')).toBe('not_found');
  });

  it('still throws other insert failures', async () => {
    setup({ data: null, error: { message: 'new row violates row-level security policy', code: '42501' } });
    await expect(sendFriendRequest('bob@x.com')).rejects.toMatchObject({ code: '42501' });
  });

  it('tells you when you blocked them, without sending anything', async () => {
    const queries = setup(undefined, [{ blocked_id: 'u2', blocked_name: 'Bob', created_at: '2026-01-01' }]);
    expect(await sendFriendRequest('bob@x.com')).toBe('you_blocked');
    expect(queries.friend_requests).toBeUndefined();
  });

  it('reports "not found" when the lookup hides a blocked person', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    expect(await sendFriendRequest('bob@x.com')).toBe('not_found');
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
