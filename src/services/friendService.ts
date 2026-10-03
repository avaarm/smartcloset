import { supabase } from '../config/supabase';
import { ClothingItem } from '../types';
import { Friend, FriendRequest } from '../types/friends';
import { mapDbToClothingItem } from './storage';
import { withSignedImages } from './imageUrls';

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

export type SendFriendRequestResult =
  | 'sent'
  | 'already_friends'
  | 'already_pending'
  | 'not_found'
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

  const myName = session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'Someone';
  const { error: insertError } = await supabase.from('friend_requests').insert({
    requester_id: session.user.id,
    recipient_id: match.id,
    requester_name: myName,
    recipient_name: match.name,
    status: 'pending',
  });
  if (insertError) throw insertError;
  return 'sent';
};

export const getFriends = async (): Promise<Friend[]> => {
  const session = await getSession();
  if (!session?.user) return [];

  const { data, error } = await supabase
    .from('friend_requests')
    .select('*')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${session.user.id},recipient_id.eq.${session.user.id}`)
    .order('responded_at', { ascending: false });
  if (error) throw error;

  return (data || []).map((row: any) => {
    const iAmRequester = row.requester_id === session.user.id;
    return {
      requestId: row.id,
      userId: iAmRequester ? row.recipient_id : row.requester_id,
      name: iAmRequester ? row.recipient_name : row.requester_name,
      since: row.responded_at ?? undefined,
    };
  });
};

export const getPendingRequests = async (): Promise<{
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
}> => {
  const session = await getSession();
  if (!session?.user) return { incoming: [], outgoing: [] };

  const { data, error } = await supabase
    .from('friend_requests')
    .select('*')
    .eq('status', 'pending')
    .or(`requester_id.eq.${session.user.id},recipient_id.eq.${session.user.id}`)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const requests = (data || []).map(mapDbToFriendRequest);
  return {
    incoming: requests.filter(r => r.recipientId === session.user.id),
    outgoing: requests.filter(r => r.requesterId === session.user.id),
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
  const { data, error } = await supabase
    .from('clothing_items')
    .select('*')
    .eq('user_id', friendUserId)
    .eq('is_wishlist', false)
    .order('date_added', { ascending: false });
  if (error) throw error;
  return withSignedImages((data || []).map(mapDbToClothingItem));
};
