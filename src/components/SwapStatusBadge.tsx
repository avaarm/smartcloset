import React from 'react';
import { Badge, BadgeTone } from '../ui';
import { statusLabel } from '../utils/swapFormat';
import type { SwapClosedReason, SwapRole, SwapStatus } from '../types/swap';

export type SwapStatusBadgeProps = {
  status: SwapStatus;
  closedReason?: SwapClosedReason | null;
  role: SwapRole;
};

const TONE: Record<SwapStatus, BadgeTone> = {
  proposed: 'info',
  accepted: 'accent',
  completed: 'success',
  declined: 'neutral',
  cancelled: 'neutral',
  expired: 'neutral',
};

export const SwapStatusBadge: React.FC<SwapStatusBadgeProps> = ({ status, closedReason, role }) => (
  <Badge label={statusLabel({ status, closedReason, role })} tone={TONE[status]} />
);

export default SwapStatusBadge;
