/**
 * ProAccessNotice — the one plain answer for a person who cannot use professional features right now, so every
 * pro screen says the same thing and no screen file imports another to get it.
 *
 *   guest          "Sign in to work with a stylist" and a Sign in button
 *   paused         the server switch is off; stopping sharing, ending, reporting and blocking still work
 *   not_deployed   this server has no pro functions yet
 *   suspended      the account is suspended, with Email support
 *
 * The paused and suspended states say where the safety actions are (`safetyNote`): on the screen itself by default,
 * because most screens draw the safety-only list below the notice. A screen that lists no connections passes a note
 * that points to the tab that does, or null for none, so it never promises buttons it does not have.
 *   ready          nothing, except for the screen's own role (`role`, the client by default):
 *                    update_required   "Update SmartCloset to keep using professional features" (or "check back
 *                                      soon" when this build is the newer one)
 *                    needs_terms       "Read the terms to get started", only when `onReadTerms` is given
 *   error          LoadError with a Try again button
 *   loading        nothing
 *
 * The screen draws its own safety-only list (Stop sharing, End, Report or block) below the notice. This component
 * contains no navigation: it takes callbacks.
 */

import React from 'react';
import { Alert, Linking } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { EmptyState } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import LoadError from './LoadError';
import { proUpdateMessage, type ProAccess } from '../hooks/useProAccess';
import {
  PRO_NOT_DEPLOYED_MESSAGE,
  PRO_PAUSED_MESSAGE,
  PRO_SAFETY_ONLY_NOTE,
  PRO_SERVER_BEHIND_MESSAGE,
  PRO_SUSPENDED_MESSAGE,
} from '../config/proRules';
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '../config/legal';
import type { ProRole } from '../types/pro';

export type ProAccessNoticeProps = {
  access: ProAccess;
  /** Which role the screen is about. Only the ready state depends on it. Defaults to the client side. */
  role?: ProRole;
  onSignIn?: () => void;
  onRefresh?: () => void | Promise<unknown>;
  /** Opens the terms for `role`. Without it a role that needs the terms draws nothing here. */
  onReadTerms?: () => void;
  /** What the paused and suspended states say about the safety actions. Default: PRO_SAFETY_ONLY_NOTE. Null: nothing. */
  safetyNote?: string | null;
};

const emailSupport = async () => {
  try {
    await Linking.openURL(SUPPORT_MAILTO);
  } catch {
    Alert.alert('Could not open Mail', `You can reach us at ${SUPPORT_EMAIL}.`);
  }
};

const noop = () => {};

export const ProAccessNotice: React.FC<ProAccessNoticeProps> = ({
  access,
  role = 'client',
  onSignIn,
  onRefresh,
  onReadTerms,
  safetyNote = PRO_SAFETY_ONLY_NOTE,
}) => {
  const { theme } = useTheme();
  const icon = (name: string) => <Icon name={name} size={32} color={theme.colors.textSubtle} />;

  switch (access.state) {
    case 'guest':
      return (
        <EmptyState
          icon={icon('person-outline')}
          title="Sign in to work with a stylist"
          actionLabel="Sign in"
          onAction={onSignIn}
        />
      );
    case 'paused':
      return (
        <EmptyState
          icon={icon('pause-circle-outline')}
          title={PRO_PAUSED_MESSAGE}
          body={safetyNote ?? undefined}
        />
      );
    case 'not_deployed':
      return (
        <EmptyState
          icon={icon('construct-outline')}
          title="Not available yet"
          body={PRO_NOT_DEPLOYED_MESSAGE}
        />
      );
    case 'suspended':
      return (
        <EmptyState
          icon={icon('hand-left-outline')}
          title={PRO_SUSPENDED_MESSAGE}
          body={safetyNote ?? undefined}
          actionLabel="Email support"
          onAction={emailSupport}
        />
      );
    case 'error':
      return (
        <LoadError
          what="professional features"
          title="Couldn't load professional features"
          onRetry={onRefresh ?? noop}
        />
      );
    case 'ready': {
      const mine = access[role];
      if (mine === 'update_required') {
        const message = proUpdateMessage(access.status, role);
        return message === PRO_SERVER_BEHIND_MESSAGE ? (
          <EmptyState icon={icon('time-outline')} title="Check back soon" body={message} />
        ) : (
          <EmptyState icon={icon('cloud-download-outline')} title="Update needed" body={message} />
        );
      }
      if (mine === 'needs_terms' && onReadTerms) {
        return (
          <EmptyState
            icon={icon('document-text-outline')}
            title="Read the terms to get started"
            actionLabel="Read the terms"
            onAction={onReadTerms}
          />
        );
      }
      return null;
    }
    default:
      return null;
  }
};

export default ProAccessNotice;
