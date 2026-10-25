import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { acceptProTerms, getProStatus } from '../services/proService';
import { ProError, proErrorMessage, toProError } from '../services/proErrors';
import {
  PRO_CLIENT_TERMS_VERSION,
  PRO_SERVER_BEHIND_MESSAGE,
  PRO_STYLIST_TERMS_VERSION,
  PRO_UPDATE_REQUIRED_MESSAGE,
} from '../config/proRules';
import type { ProRole, ProStatus } from '../types/pro';

/**
 * What one role (stylist or client) can do right now:
 *   available        go ahead
 *   needs_terms      the terms are not accepted at the current version, or the 18+ confirmation is missing:
 *                    open ProTermsSheet. A person with no stylist profile yet is always here for the stylist role,
 *                    because the server does not say whether they accepted before.
 *   update_required  the server's terms version is not the one this build carries (newer: the person cannot be
 *                    shown the text they would agree to; older: the server is behind this build). Show
 *                    proUpdateMessage() and call nothing that records consent. Stop sharing, End, Report and Block
 *                    stay available: they need no terms.
 */
export type RoleAccess = 'available' | 'needs_terms' | 'update_required';

/**
 * Whether the signed-in person can use professional features right now, and why not. Every pro screen starts here
 * so the empty, paused and sign-in states are the same everywhere.
 *
 *   loading        first load
 *   guest          not signed in
 *   paused         the server switch is off ("Professional features are paused"); the safety-only list stays
 *   not_deployed   this server has no pro functions yet ("Professional features aren't available yet")
 *   suspended      the account is suspended; ended history, Export Data, End, Block, Report and Stop sharing stay
 *   ready          everything else; see RoleAccess for each role
 *   error          the first read failed (offline, say): show LoadError with refresh()
 *
 * A failed re-read never takes away what the screen already has. A screen that holds a ready, paused or suspended
 * state keeps it when the next read fails for any reason but sign-out, the switch or a server with no pro functions,
 * and `refreshFailed` says that the state may be out of date (the 7.8 row "Refresh failed with data on screen"): the
 * rows on screen, and Stop sharing and End connection with them, stay. `error` is only for a screen with nothing to keep.
 */
export type ProAccess =
  | { state: 'loading' }
  | { state: 'guest' }
  | { state: 'paused' }
  | { state: 'not_deployed' }
  | { state: 'suspended'; status: ProStatus }
  | { state: 'ready'; status: ProStatus; stylist: RoleAccess; client: RoleAccess }
  | { state: 'error'; message: string };

const serverVersion = (status: ProStatus, role: ProRole) => (role === 'stylist' ? status.versions.stylistTerms : status.versions.clientTerms);
const buildVersion = (role: ProRole) => (role === 'stylist' ? PRO_STYLIST_TERMS_VERSION : PRO_CLIENT_TERMS_VERSION);

const roleAccess = (status: ProStatus, role: ProRole): RoleAccess => {
  if (serverVersion(status, role) !== buildVersion(role)) return 'update_required';
  const termsCurrent = role === 'stylist' ? Boolean(status.stylist?.termsCurrent) : status.client.termsCurrent;
  return termsCurrent && status.adultConfirmed ? 'available' : 'needs_terms';
};

/** The access a status gives. Paused wins over suspended, as the switch is for everyone. */
export const accessFromStatus = (status: ProStatus): ProAccess => {
  if (!status.proEnabled) return { state: 'paused' };
  if (status.suspended) return { state: 'suspended', status };
  return { state: 'ready', status, stylist: roleAccess(status, 'stylist'), client: roleAccess(status, 'client') };
};

/**
 * The line to show for a role in update_required: the build is older than the server (update the app), or newer
 * (the database change has not gone out yet). Version strings are zero-padded year-month, so comparing them as
 * text orders them.
 */
export const proUpdateMessage = (status: ProStatus, role: ProRole): string =>
  buildVersion(role) > serverVersion(status, role) ? PRO_SERVER_BEHIND_MESSAGE : PRO_UPDATE_REQUIRED_MESSAGE;

type Show = () => void | (() => void);

// Which of these a hook instance uses is fixed by its options for its whole life.
const useFocusRefresh = (onShow: Show) => { useFocusEffect(onShow); };
const useMountRefresh = (onShow: Show) => { useEffect(onShow, [onShow]); };

/**
 * `refreshOn: 'focus'` (the default) refreshes whenever the screen comes into focus, like useSwapAccess, and so
 * needs a navigation context. `refreshOn: 'mount'` refreshes in a plain effect and uses no navigation hook at all:
 * ProSettingsSection and every sheet that can be mounted outside a screen's navigation context call it that way.
 *
 * `lazy: true` makes the hook read nothing by itself: the state stays `loading` until the owner calls refresh(). A
 * sheet that is mounted while closed uses it and calls refresh() when it opens, so a screen that hosts three sheets
 * makes one status read (its own) and not four every time it appears.
 */
export const useProAccess = (options: { refreshOn?: 'focus' | 'mount'; lazy?: boolean } = {}) => {
  const refreshOn = options.refreshOn ?? 'focus';
  const lazy = options.lazy ?? false;
  const [access, setAccess] = useState<ProAccess>({ state: 'loading' });
  const [refreshFailed, setRefreshFailed] = useState(false);
  const alive = useRef(true);
  const latest = useRef(0);
  const current = useRef(access);
  current.current = access;

  const refresh = useCallback(async () => {
    const mine = ++latest.current;
    try {
      const status = await getProStatus();
      if (!alive.current || mine !== latest.current) return;
      setRefreshFailed(false);
      setAccess(accessFromStatus(status));
    } catch (e) {
      if (!alive.current || mine !== latest.current) return;
      const err = toProError(e);
      if (err.code === 'not_authenticated' || err.code === 'pro_disabled' || err.code === 'not_deployed') {
        setRefreshFailed(false);
        setAccess(err.code === 'not_authenticated' ? { state: 'guest' } : err.code === 'pro_disabled' ? { state: 'paused' } : { state: 'not_deployed' });
        return;
      }
      const held = current.current.state;
      if (held === 'ready' || held === 'paused' || held === 'suspended') {
        setRefreshFailed(true);                    // keep what the screen has; the next read may succeed
        return;
      }
      setRefreshFailed(false);
      setAccess({ state: 'error', message: proErrorMessage(err, "Couldn't load professional features. Please try again.") });
    }
  }, []);

  const onShow = useCallback(() => {
    alive.current = true;
    if (!lazy) refresh();
    return () => { alive.current = false; };
  }, [refresh, lazy]);

  const useRefreshTrigger = refreshOn === 'mount' ? useMountRefresh : useFocusRefresh;
  useRefreshTrigger(onShow);

  /**
   * Records the person's agreement to the terms they were shown for `role` (and, the first time, that they are 18
   * or older), then reloads. The service sends this build's version for the role, never the server's value: the
   * person agrees to the text on their screen. It only runs for a role in needs_terms, which is reached only when
   * the two versions are equal; in update_required nothing is sent.
   */
  const acceptTerms = useCallback(async (role: ProRole, adult: boolean) => {
    const now = current.current;
    if (now.state !== 'ready' || now[role] !== 'needs_terms') return;
    try {
      await acceptProTerms(role, adult);
    } catch (e) {
      throw e instanceof ProError ? e : toProError(e);
    }
    await refresh();
  }, [refresh]);

  return { access, refresh, acceptTerms, refreshFailed };
};
