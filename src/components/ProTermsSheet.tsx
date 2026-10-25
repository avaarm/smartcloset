/**
 * ProTermsSheet — the terms for one role (stylist or client), in one scroll, with the 18+ switch when the
 * person has not yet said they are an adult.
 *
 * "I agree" records agreement to the text on this screen: it calls acceptTerms of useProAccess, which sends the
 * version of the terms in this build and no other, and no version can be passed in. A screen opens this sheet only
 * when the role is in needs_terms, where the server's version equals this build's. In update_required the person
 * cannot be shown what they would agree to, so the sheet shows the update line and records nothing.
 *
 * The sheet reads the person's access itself (useProAccess with refreshOn 'mount', so it needs no navigation
 * context and can be mounted inside Settings) and asks again each time it opens. "I agree" waits for that answer.
 */

import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Button, Sheet, Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import { proUpdateMessage, useProAccess } from '../hooks/useProAccess';
import {
  PRO_CLIENT_TERMS,
  PRO_NOT_DEPLOYED_MESSAGE,
  PRO_PAUSED_MESSAGE,
  PRO_STYLIST_TERMS,
  PRO_SUSPENDED_MESSAGE,
} from '../config/proRules';
import { ProError, proErrorMessage, toProError } from '../services/proErrors';
import type { ProRole } from '../types/pro';

/** The server's terms changed while the sheet was open, so the text on screen is not the one it holds now. */
const TERMS_CHANGED_MESSAGE = 'The terms were updated. Please reopen.';

export type ProTermsSheetProps = {
  visible: boolean;
  role: ProRole;
  /** The 18+ confirmation is not stored yet: show the switch. The sheet also shows it when its own read says so. */
  needsAdult: boolean;
  /** Agreement was recorded (or was already on record); the screen reloads what the person may do. */
  onAccepted: () => void;
  onClose: () => void;
};

export const ProTermsSheet: React.FC<ProTermsSheetProps> = ({ visible, role, needsAdult, onAccepted, onClose }) => {
  const { theme } = useTheme();
  const { access, refresh, acceptTerms } = useProAccess({ refreshOn: 'mount', lazy: true });
  const [adult, setAdult] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set when the server says its terms differ: agreeing again cannot succeed until the sheet is reopened.
  const [outdated, setOutdated] = useState(false);
  // A new number each time the sheet opens or closes. An answer that arrives under an older number is dropped:
  // the person has moved on, and the screen reloads the server's state when it next looks.
  const session = useRef(0);

  useEffect(() => {
    session.current++;
    if (visible) {
      setAdult(false);
      setBusy(false);
      setError(null);
      setOutdated(false);
      refresh();                       // the hook is lazy: this is the one read, each time the sheet opens
    }
  }, [visible, refresh]);

  const terms = role === 'stylist' ? PRO_STYLIST_TERMS : PRO_CLIENT_TERMS;
  const roleAccess = access.state === 'ready' ? access[role] : null;
  const showAdult = needsAdult || (access.state === 'ready' && !access.status.adultConfirmed);
  const alreadyAgreed = roleAccess === 'available';

  // Why "I agree" cannot do anything right now, in plain words; null when it can.
  let blocker: string | null = null;
  if (access.state === 'guest') blocker = proErrorMessage(new ProError('not_authenticated'));
  else if (access.state === 'paused') blocker = PRO_PAUSED_MESSAGE;
  else if (access.state === 'suspended') blocker = PRO_SUSPENDED_MESSAGE;
  else if (access.state === 'not_deployed') blocker = PRO_NOT_DEPLOYED_MESSAGE;
  else if (access.state === 'error') blocker = access.message;
  else if (access.state === 'ready' && roleAccess === 'update_required') blocker = proUpdateMessage(access.status, role);

  const loading = access.state === 'loading';
  const canAgree = !busy && !outdated && !blocker && !loading && (alreadyAgreed || !showAdult || adult);

  const agree = async () => {
    if (!canAgree) return;
    if (alreadyAgreed) {
      // Nothing to record: another screen got there first.
      onAccepted();
      return;
    }
    const mine = session.current;
    setBusy(true);
    setError(null);
    try {
      await acceptTerms(role, showAdult ? adult : true);
      if (mine === session.current) onAccepted();
    } catch (e) {
      if (mine === session.current) {
        if (toProError(e).code === 'terms_version_mismatch') {
          setOutdated(true);
          setError(TERMS_CHANGED_MESSAGE);
        } else {
          setError(proErrorMessage(e, "Couldn't save your agreement. Please try again."));
        }
      }
    } finally {
      if (mine === session.current) setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={terms.title}>
      <ScrollView style={styles.terms} accessibilityLabel={terms.title}>
        {terms.sections.map((section, i) => (
          <View key={section.heading} style={{ marginTop: i === 0 ? 0 : 16 }}>
            <Text variant="h4" style={{ marginBottom: 4 }}>{section.heading}</Text>
            <Text variant="body" color="muted">{section.body}</Text>
          </View>
        ))}
      </ScrollView>

      {showAdult && !alreadyAgreed ? (
        <View style={[styles.adultRow, { borderTopColor: theme.colors.border }]}>
          <Text variant="body" weight="500" style={styles.adultLabel}>I am 18 or older</Text>
          <Switch
            value={adult}
            onValueChange={setAdult}
            disabled={busy}
            accessibilityLabel="I am 18 or older"
            trackColor={{ false: theme.colors.border, true: theme.colors.accent }}
            thumbColor="#FFFFFF"
          />
        </View>
      ) : null}

      {error ? (
        <Text variant="caption" color="danger" style={styles.message} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : blocker ? (
        <Text variant="caption" color="muted" style={styles.message} accessibilityLiveRegion="polite">
          {blocker}
        </Text>
      ) : null}

      {access.state === 'error' ? (
        <Button label="Try again" onPress={refresh} fullWidth style={styles.primary} />
      ) : (
        <Button
          label="I agree"
          onPress={agree}
          loading={busy || loading}
          disabled={!canAgree}
          fullWidth
          style={styles.primary}
        />
      )}
      <Button label="Not now" variant="ghost" onPress={onClose} disabled={busy} fullWidth style={styles.secondary} />
    </Sheet>
  );
};

const styles = StyleSheet.create({
  terms: { maxHeight: 340 },
  adultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  adultLabel: { flex: 1, marginRight: 12 },
  message: { marginTop: 10 },
  primary: { marginTop: 16 },
  secondary: { marginTop: 6 },
});

export default ProTermsSheet;
