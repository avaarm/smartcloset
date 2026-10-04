import { supabase } from '../config/supabase';
import { ClothingItem } from '../types';
import { Friend, FriendRequest } from '../types/friends';
import { mapDbToClothingItem } from './storage';
import { withSignedImages } from './imageUrls';
import { MAX_REPORT_DETAILS, ReportContext, ReportReason } from '../config/communityGuidelines';

const getSession = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
};

const mapDbToFriendRequest = (row: any): FriendRequest => ({
  id: row.id,
  requesterId: row.requester_id,
  recipientId: row.recipient_id,
  requesterName: row.requester_name,
  recipientName: row.recipient_name,
  status: row.status,
  createdAt: row.created_at,
  respondedAt: row.responded_at ?? undefined,
});

export interface BlockedUser {
  userId: string;
  name: string;
  blockedAt: string;
}

export type SendFriendRequestResult =
  | 'sent'
  | 'already_friends'
  | 'already_pending'
  | 'not_found'
  | 'you_blocked'
  | 'self';

/** Looks up the given email and, if found, sends (or reactivates) a friend request. */
export const sendFriendRequest = async (email: string): Promise<SendFriendRequestResult> => {
  const session = await getSession();
  if (!session?.user) throw new Error('You need to be signed in to add friends.');

  const trimmedEmail = email.trim();
  if (!trimmedEmail) throw new Error('Enter an email address.');

  const { data: matches, error: lookupError } = await supabase.rpc('find_user_by_email', {
    target_email: trimmedEmail,
  });
  if (lookupError) throw lookupError;
  const match = Array.isArray(matches) ? matches[0] : matches;
  if (!match) return 'not_found';
  if (match.id === session.user.id) return 'self';

  // Someone you blocked is still found (so you can be told why you can't add
  // them); someone who blocked you is not, and looks like "no such account".
  if ((await getBlockedUsers()).some(b => b.userId === match.id)) return 'you_blocked';

  const { data: existing, error: existingError } = await supabase
    .from('friend_requests')
    .select('id, status, requester_id')
    .or(
      `and(requester_id.eq.${session.user.id},recipient_id.eq.${match.id}),and(requester_id.eq.${match.id},recipient_id.eq.${session.user.id})`
    )
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing) {
    return existing.status === 'accepted' ? 'already_friends' : 'already_pending';
  }

  // Both display names are filled in by the database from the accounts themselves,
  // so a sender can't choose the name that appears on someone else's screen.
  const { error: insertError } = await supabase.from('friend_requests').insert({
    requester_id: session.user.id,
    recipient_id: match.id,
    status: 'pending',
  });
  if (insertError) {
    // A block raced the lookup. Look the same as "no such account" so a block is never revealed.
    if (`${insertError.message}`.includes('friend_request_not_allowed')) return 'not_found';
    throw insertError;
  }
  return 'sent';
};

export const getFriends = async (): Promise<Friend[]> => {
  const session = await getSession();
  if (!session?.user) return [];

  const [{ data, error }, blocked] = await Promise.all([
    supabase
      .from('friend_requests')
      .select('*')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${session.user.id},recipient_id.eq.${session.user.id}`)
      .order('responded_at', { ascending: false }),
    // Best effort: a failed block lookup must not hide the real friends list.
    getBlockedUsers().catch(() => [] as BlockedUser[]),
  ]);
  if (error) throw error;
  const blockedIds = new Set(blocked.map(b => b.userId));

  return (data || [])
    .map((row: any) => {
      const iAmRequester = row.requester_id === session.user.id;
      return {
        requestId: row.id,
        userId: iAmRequester ? row.recipient_id : row.requester_id,
        name: iAmRequester ? row.recipient_name : row.requester_name,
        since: row.responded_at ?? undefined,
      };
    })
    .filter((friend: Friend) => !blockedIds.has(friend.userId));
};

export const getPendingRequests = async (): Promise<{
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
}> => {
  const session = await getSession();
  if (!session?.user) return { incoming: [], outgoing: [] };

  const [{ data, error }, blocked] = await Promise.all([
    supabase
      .from('friend_requests')
      .select('*')
      .eq('status', 'pending')
      .or(`requester_id.eq.${session.user.id},recipient_id.eq.${session.user.id}`)
      .order('created_at', { ascending: false }),
    getBlockedUsers().catch(() => [] as BlockedUser[]),
  ]);
  if (error) throw error;
  const blockedIds = new Set(blocked.map(b => b.userId));

  const requests = (data || []).map(mapDbToFriendRequest);
  return {
    incoming: requests.filter(r => r.recipientId === session.user.id && !blockedIds.has(r.requesterId)),
    outgoing: requests.filter(r => r.requesterId === session.user.id && !blockedIds.has(r.recipientId)),
  };
};

export const acceptFriendRequest = async (requestId: string): Promise<void> => {
  const { error } = await supabase
    .from('friend_requests')
    .update({ status: 'accepted', responded_at: new Date().toISOString() })
    .eq('id', requestId);
  if (error) throw error;
};

/** Declines an incoming request, cancels one you sent, or removes an
 * accepted friend — the row is simply deleted in every case. */
export const removeFriendRequest = async (requestId: string): Promise<void> => {
  const { error } = await supabase.from('friend_requests').delete().eq('id', requestId);
  if (error) throw error;
};

/** Read-only fetch of a friend's wardrobe. RLS enforces that this only
 * returns rows when an accepted friendship actually exists — an
 * unauthorized id simply comes back empty rather than erroring. */
export const getFriendCloset = async (friendUserId: string): Promise<ClothingItem[]> => {
  // Returns only the fields a friend should see (no prices paid, notes, or wear
  // history) and only for an accepted friend you haven't blocked (or been blocked
  // by); anything else comes back empty.
  const { data, error } = await supabase.rpc('get_friend_closet', { p_friend_id: friendUserId });
  if (error) throw error;
  return withSignedImages((data || []).map(mapDbToClothingItem));
};

/** People the signed-in user has blocked, newest first. Blocks are private: the
 * database only ever shows a user their own, never who has blocked them. */
export const getBlockedUsers = async (): Promise<BlockedUser[]> => {
  const session = await getSession();
  if (!session?.user) return [];

  const { data, error } = await supabase
    .from('user_blocks')
    .select('blocked_id, blocked_name, created_at')
    .eq('blocker_id', session.user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;

  return (data || []).map((row: any) => ({
    userId: row.blocked_id,
    name: row.blocked_name || 'Someone',
    blockedAt: row.created_at,
  }));
};

/** Messages shown to the person instead of raw database errors. */
const moderationErrorMessage = (error: any, fallback: string): string => {
  const text = `${error?.message ?? ''}`;
  if (error?.code === '54000' || text.includes('report_rate_limited')) {
    return 'You’ve sent a lot of reports today. Please try again tomorrow.';
  }
  if (text.includes('user_not_found')) return 'That account no longer exists.';
  if (text.includes('not_authenticated')) return 'You need to be signed in.';
  return fallback;
};

/** Blocks a user and removes any request or friendship between you. They can no
 * longer find you, send you a request, or see your closet, and aren't told. */
export const blockUser = async (userId: string): Promise<void> => {
  const { error } = await supabase.rpc('block_user', { p_user_id: userId });
  if (error) throw new Error(moderationErrorMessage(error, 'Couldn’t block this person. Please try again.'));
};

/** Lifts a block. It doesn't restore a friendship; either of you can send a new request. */
export const unblockUser = async (userId: string): Promise<void> => {
  // Row-level security limits this to the signed-in user's own blocks.
  const { error } = await supabase.from('user_blocks').delete().eq('blocked_id', userId);
  if (error) throw new Error(moderationErrorMessage(error, 'Couldn’t unblock this person. Please try again.'));
};

/** Blank details become null; anything longer than the database allows is cut. */
export const normalizeReportDetails = (details?: string): string | null => {
  const trimmed = details?.trim();
  return trimmed ? trimmed.slice(0, MAX_REPORT_DETAILS) : null;
};

/** Sends a report to the developer for review (stored privately, never shown to the reported person). */
export const reportUser = async (
  userId: string,
  context: ReportContext,
  reason: ReportReason,
  details?: string
): Promise<void> => {
  const { error } = await supabase.rpc('report_user', {
    p_user_id: userId,
    p_context: context,
    p_reason: reason,
    p_details: normalizeReportDetails(details),
  });
  if (error) throw new Error(moderationErrorMessage(error, 'Couldn’t send your report. Please try again.'));
};
