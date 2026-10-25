/**
 * Types for professional accounts: stylists and their clients (documentation/design/pro-accounts.md 7.5.1).
 * Shapes mirror what the pro functions return (tables are mapped from snake_case, jsonb results are already
 * camelCase; see proService.ts). Nothing here ever carries another person's account id, email, phone or a
 * storage path: the server resolves who is who and a person is only ever a connection and a label.
 */

/** The device preference. A stored 'client' (from an older build) is read as 'user'. */
export type AccountMode = 'user' | 'stylist';

export type ProRole = 'stylist' | 'client';

/** Every message the pro functions raise (4.4), plus the three the app adds itself. */
export type ProErrorCode =
  | 'not_authenticated'
  | 'pro_disabled' | 'pro_suspended' | 'account_too_new' | 'stylist_profile_required' | 'stylist_profile_removed'
  | 'invites_held' | 'closet_not_shared'
  | 'pro_terms_required'
  | 'pro_unavailable' | 'connection_ended' | 'invite_invalid' | 'stylist_not_accepting'
  | 'adult_required' | 'terms_version_mismatch' | 'stale_consent_text'
  | 'invalid_request' | 'invalid_profile' | 'invalid_alias' | 'invalid_message' | 'invalid_recommendation'
  | 'invalid_appointment' | 'invalid_report'
  | 'recommendation_locked' | 'recommendation_empty' | 'appointment_closed'
  | 'item_not_found' | 'item_not_shared' | 'text_not_allowed' | 'appointment_conflict'
  | 'pro_rate_limited' | 'invite_limit' | 'client_connection_limit' | 'draft_limit' | 'appointment_open_limit'
  | 'closet_page_limit' | 'report_rate_limited'
  | 'not_deployed' | 'offline' | 'unknown';

export interface ProStatus {
  proEnabled: boolean;
  suspended: boolean;
  adultConfirmed: boolean;
  stylistRemoved: boolean;
  versions: { stylistTerms: string; clientTerms: string; shareText: string };
  /** Null when there is no stylist profile. */
  stylist: null | {
    termsCurrent: boolean;
    accepting: boolean;
    approved: boolean;
    invitesHeld: boolean;
    activeClients: number;
    clientLimit: number;
    liveInvites: number;
    inviteLimit: number;
  };
  client: { termsCurrent: boolean; connections: number; connectionLimit: number };
  /** What needs this person's attention (the Home badge). */
  badge: number;
}

export interface StylistProfile {
  displayName: string;
  headline: string;
  bio: string;
  services: string[];
  languages: string[];
  ratesText: string;
  accepting: boolean;
  approved: boolean;
  invitesHeld: boolean;
  createdAt: string;
}

export type StylistProfileInput = Pick<
  StylistProfile,
  'displayName' | 'headline' | 'bio' | 'services' | 'languages' | 'ratesText' | 'accepting'
>;

export interface ProInvite {
  id: string;
  /** Ten characters, no separator; show it with groupCode(). */
  code: string;
  /** The stylist's private reference; never shown to a client. */
  label?: string;
  status: 'live' | 'expired' | 'used' | 'revoked';
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
  /** An active connection came from this code. */
  connected: boolean;
}

export interface InvitePreview {
  inviteId: string;
  alreadyConnected: boolean;
  clientTermsCurrent: boolean;
  stylist: {
    name: string;
    headline: string;
    bio: string;
    services: string[];
    languages: string[];
    ratesText: string;
  };
}

export interface ProConnectionSummary {
  id: string;
  myRole: ProRole;
  otherLabel: string;
  /** The stylist's headline (client rows only). */
  otherHeadline?: string;
  status: 'active' | 'ended';
  endedBy?: 'client' | 'stylist' | 'system';
  startedAt: string;
  endedAt?: string;
  lastActivityAt: string;
  unread: number;
  attention: boolean;
  nextAppointmentAt?: string;
  pendingAppointments: number;
  closetShared: boolean;
  closetExpiresAt?: string;
  lastMessagePreview?: string;
  lastMessageAt?: string;
}

export interface ProConnectionDetail {
  id: string;
  myRole: ProRole;
  status: 'active' | 'ended';
  /** 'me' / 'them' / null; a system ending reads as 'them'. */
  endedBy: null | 'me' | 'them';
  startedAt: string;
  endedAt?: string;
  otherLabel: string;
  /** Client side only: the name this client chose to show. */
  myAlias: null | string;
  /** The role's own gate would refuse (paused, suspended, terms out of date): only the ways out are offered. */
  safetyOnly: boolean;
  /** Client side only. */
  stylist: null | InvitePreview['stylist'];
  closet: {
    shared: boolean;
    itemMode: null | 'all' | 'selected';
    itemCount: null | number;
    expiresAt: null | string;
    expiresSoon: boolean;
    /** Client side only (null and 0 for the stylist). */
    lastViewedAt: null | string;
    views30d: number;
  };
  counts: { looks: number; upcoming: number };
  /** The server decides; the app only draws buttons. */
  actions: {
    canMessage: boolean;
    canPropose: boolean;
    canRecommend: boolean;
    canEnd: boolean;
    canViewCloset: boolean;
    canShare: boolean;
    canStopSharing: boolean;
    canRename: boolean;
  };
}

export interface ProGrant {
  scope: 'closet';
  enabled: boolean;
  itemMode: null | 'all' | 'selected';
  /** Client side, when itemMode is 'selected'. */
  itemIds?: string[];
  /** Stylist side. */
  itemCount?: number;
  grantedAt?: string;
  expiresAt?: string;
  expiresSoon?: boolean;
  textVersion?: string;
  lastViewedAt?: string;
  views30d?: number;
  events?: { event: string; itemMode?: string; itemCount?: number; at: string }[];
}

/** A piece of a client's closet as the stylist sees it. Never a photo address: photos come from proPhotoSource(). */
export interface ProClosetItem {
  id: string;
  name: string;
  category: string;
  subcategory?: string;
  color?: string;
  brand?: string;
  season?: unknown;
  pattern?: string;
  material?: string;
  materials?: unknown;
  size?: string;
  condition?: string;
  hasPhoto: boolean;
}

export interface ProLookSummary {
  id: string;
  status: 'draft' | 'sent' | 'viewed' | 'implemented';
  title: string;
  itemCount: number;
  coverItemId?: string;
  /** The client's own path, never a stylist's. */
  coverPhotoPath?: string;
  sentAt?: string;
  viewedAt?: string;
  updatedAt: string;
  clientRating?: number;
  isNew: boolean;
}

export interface ProLookDetail {
  id: string;
  connectionId: string;
  status: ProLookSummary['status'];
  title: string;
  body: string;
  sentAt?: string;
  viewedAt?: string;
  implementedAt?: string;
  items: {
    position: number;
    itemId?: string;
    name: string;
    category?: string;
    color?: string;
    brand?: string;
    hasPhoto: boolean;
    /** Client only. */
    photoPath?: string;
    available: boolean;
  }[];
  feedback: null | { rating?: number; comment?: string; at: string };
  actions: { canEdit: boolean; canSend: boolean; canDelete: boolean; canGiveFeedback: boolean; canMarkWorn: boolean };
}

export interface ProAppointment {
  id: string;
  connectionId: string;
  otherLabel: string;
  myRole: ProRole;
  status: 'proposed' | 'confirmed' | 'declined' | 'cancelled' | 'expired' | 'completed';
  proposedBy: ProRole;
  startsAt: string;
  durationMinutes: number;
  mode: 'virtual' | 'in_person';
  place: string;
  note: string;
  /** The proposer's offset from UTC at the start, in minutes east of UTC (+60 for UTC+1): a display hint only. A zone name is never shared. */
  utcOffsetMinutes: number;
  canConfirm: boolean;
  canDecline: boolean;
  canCancel: boolean;
  createdAt: string;
}

export interface ProMessage {
  id: number;
  from: 'me' | 'them' | 'system';
  body: string;
  /** System lines: connected, ended, sharing_on. */
  code?: string;
  at: string;
}

export interface ProThread {
  messages: ProMessage[];
  hasMore: boolean;
  canSend: boolean;
}

export interface ProBlock { ref: string; label: string; blockedAt: string }

export interface ProExport {
  settings: Record<string, unknown>;
  stylistProfile: StylistProfile | null;
  invites: { createdAt: string; expiresAt: string; status: string }[];
  connections: {
    role: ProRole;
    otherLabel: string;
    status: string;
    startedAt: string;
    endedAt?: string;
    grantHistory?: unknown[];
    looks: unknown[];
    sessions: unknown[];
    myMessages: { body: string; sentAt: string }[];
  }[];
}

export type ProReportRefType = 'connection' | 'recommendation' | 'appointment' | 'invite';
export type ProReportReason =
  | 'spam' | 'harassment' | 'inappropriate' | 'impersonation' | 'scam' | 'unsafe'
  | 'underage' | 'false_credentials' | 'data_misuse' | 'unsafe_meeting' | 'other';

// ─── shapes the service takes and gives back that 7.5.1 does not spell out ───

export type ProSessionScope = 'upcoming' | 'needs_me' | 'past';
export type ProSessionMode = ProAppointment['mode'];
export type ProGrantMode = 'all' | 'selected';

/** What saveProLook sends. A new look needs a clientRef (the same value on a retry); itemIds undefined leaves the pieces as they are. */
export interface ProLookInput {
  connectionId: string;
  /** Present when editing a draft. */
  id?: string;
  title: string;
  body: string;
  itemIds?: string[];
  clientRef?: string;
}

/** What proposeProSession sends. clientRef is required and is reused on a retry; utcOffsetMinutes defaults to this device's offset at the start. */
export interface ProposeSessionInput {
  connectionId: string;
  /** An ISO string, or a Date (sent as an ISO string). */
  startsAt: string | Date;
  durationMinutes: number;
  mode: ProSessionMode;
  place?: string;
  note?: string;
  utcOffsetMinutes?: number;
  clientRef: string;
}

/** What setProGrant sends. Enabling needs itemMode (the app must ask; there is no default); disabling needs nothing else. */
export interface ProGrantInput {
  enabled: boolean;
  itemMode?: ProGrantMode;
  /** Only sent when itemMode is 'selected'. */
  itemIds?: string[];
  /** "Keep sharing": sets a new 90 days (enabling only). */
  renew?: boolean;
}

export interface ProRedeemResult { connectionId: string; alreadyConnected: boolean }
export interface ProSavedLook { id: string; status: ProLookSummary['status']; updatedAt: string }
export interface ProProposedSession { id: string; status: ProAppointment['status'] }
export interface ProSentMessage { id: number; at: string }
export interface ProClosetPage { items: ProClosetItem[]; total: number }
