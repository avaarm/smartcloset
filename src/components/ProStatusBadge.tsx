import React from 'react';
import { Badge, BadgeTone } from '../ui';
import { statusLabel, type ProStatusKind } from '../utils/proFormat';

export type ProStatusBadgeProps = {
  kind: ProStatusKind;
  status: string;
  /** Whose move the status is: the viewer proposed the session, or is the stylist who wrote the look. */
  mine?: boolean;
};

/** The colour of a status. A status this build does not know has no label, so it has no badge either. */
const toneFor = (kind: ProStatusKind, status: string, mine: boolean): BadgeTone => {
  switch (kind) {
    case 'session':
      switch (status) {
        case 'proposed': return mine ? 'info' : 'warning';
        case 'confirmed': return 'accent';
        case 'completed': return 'success';
        default: return 'neutral';
      }
    case 'look':
      switch (status) {
        case 'sent': return mine ? 'info' : 'accent';
        case 'implemented': return 'success';
        default: return 'neutral';
      }
    default:
      return status === 'active' ? 'success' : 'neutral';
  }
};

export const ProStatusBadge: React.FC<ProStatusBadgeProps> = ({ kind, status, mine = false }) => {
  const label = statusLabel(kind, status, mine);
  if (!label) return null;
  return <Badge label={label} tone={toneFor(kind, status, mine)} />;
};

export default ProStatusBadge;
