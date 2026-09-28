export type FriendRequestStatus = 'pending' | 'accepted';

export interface FriendRequest {
  id: string;
  requesterId: string;
  recipientId: string;
  requesterName: string;
  recipientName: string;
  status: FriendRequestStatus;
  createdAt: string;
  respondedAt?: string;
}

export interface Friend {
  /** The friend_requests row id — needed to remove the friendship. */
  requestId: string;
  /** The OTHER user's id (not the current user). */
  userId: string;
  name: string;
  since?: string;
}
