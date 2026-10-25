/**
 * ProRedeemSheet — a client's way in: enter the code a stylist gave you, see who they are, agree to the client
 * terms if they are not on record yet, choose the name the stylist will see, and connect.
 *
 * Everything happens in one Sheet (code, preview, terms, name, done), because opening another modal while this one
 * is on screen is unreliable on iOS; that is also why "Report or block" closes this sheet and hands the invite to
 * the host (onReport), which opens ProSafetySheet. Nothing is shared by connecting (PRO_CONNECT_NOTE): the person
 * chooses what to share afterwards, on the connection's own page.
 *
 * The server decides what a code is worth. Every failure of the code itself (unknown, expired, used, held,
 * blocked...) is the one answer 'invite_invalid' and sends the person back to the code with the message, so a typo
 * can be fixed and nothing about the stylist is revealed. Terms are agreed through useProAccess, which sends this
 * build's text version and nothing else; in update_required nothing that records agreement is called.
 *
 * Mounted inside Settings as well as on Home, so it uses no navigation hook (useProAccess with refreshOn 'mount').
 * The hosts close the sheet from onConnected; "Done" only calls onClose.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Switch, View, useWindowDimensions } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Button, Input, Sheet, Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import { supabase } from '../config/supabase';
import {
  PRO_ALIAS_RANGE,
  PRO_CLIENT_TERMS,
  PRO_CONNECT_NOTE,
  PRO_NOT_DEPLOYED_MESSAGE,
  PRO_PAUSED_MESSAGE,
  PRO_SUSPENDED_MESSAGE,
} from '../config/proRules';
import { proUpdateMessage, useProAccess } from '../hooks/useProAccess';
import type { ProAccess } from '../hooks/useProAccess';
import { previewProInvite, redeemProInvite } from '../services/proService';
import { ProError, proErrorMessage, toProError } from '../services/proErrors';
import { groupCode, isCompleteCode, normaliseCode } from '../utils/proFormat';
import type { InvitePreview } from '../types/pro';
import { KeyboardLift, useKeyboardHeight } from './KeyboardLift';
import ProStylistCard from './ProStylistCard';

export type ProRedeemSheetProps = {
  visible: boolean;
  onClose: () => void;
  /**
   * The person asked to choose what to share: the host opens the connection. When `opensConnection` is false the sheet
   * offers no such button; it calls this when the person presses Done, so the host can close it and tell them where the
   * connection is.
   */
  onConnected: (connectionId: string) => void;
  /**
   * Whether the host can open the connection (Home can; Settings goes nowhere). Default true. When false the last step
   * says what it says and offers only Done, never a button that would do nothing.
   */
  opensConnection?: boolean;
  /** The person wants to report or block the stylist behind the code. The sheet has already been closed. */
  onReport: (inviteId: string, label: string) => void;
};

type Step = 'code' | 'preview' | 'terms' | 'alias' | 'done';
/** A request in flight. Closing is refused while terms or the connection are being recorded: those cannot be taken back. */
type Pending = 'lookup' | 'terms' | 'connect' | null;

const CODE_LENGTH = 10;
const ADULT_TEXT = 'I am 18 or older';

/** The first word of the account name, as a starting point for the name the stylist sees. Empty when there is none worth using. */
const firstWord = (name: unknown): string => {
  if (typeof name !== 'string') return '';
  const word = name.trim().split(/\s+/)[0] ?? '';
  return word.length >= PRO_ALIAS_RANGE.min ? word.slice(0, PRO_ALIAS_RANGE.max) : '';
};

/** Why the code step cannot be used at all, in plain words; null when it can. A load that has not finished does not block. */
const codeBlocker = (access: ProAccess): string | null => {
  switch (access.state) {
    case 'guest': return proErrorMessage(new ProError('not_authenticated'));
    case 'paused': return PRO_PAUSED_MESSAGE;
    case 'not_deployed': return PRO_NOT_DEPLOYED_MESSAGE;
    case 'suspended': return PRO_SUSPENDED_MESSAGE;
    case 'ready': return access.client === 'update_required' ? proUpdateMessage(access.status, 'client') : null;
    default: return null;
  }
};

export const ProRedeemSheet: React.FC<ProRedeemSheetProps> = ({ visible, onClose, onConnected, onReport, opensConnection = true }) => {
  const { theme } = useTheme();
  const { height: windowHeight } = useWindowDimensions();
  const keyboard = useKeyboardHeight();
  const { access, refresh, acceptTerms } = useProAccess({ refreshOn: 'mount', lazy: true });

  const [step, setStep] = useState<Step>('code');
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [alias, setAlias] = useState('');
  const [adult, setAdult] = useState(false);
  const [outdated, setOutdated] = useState(false);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);
  // A new number each time the sheet opens or closes; an answer that arrives under an older one is dropped.
  const session = useRef(0);

  useEffect(() => {
    session.current++;
    if (visible) {
      const mine = session.current;
      setStep('code');
      setCode('');
      setPreview(null);
      setAlias('');
      setAdult(false);
      setOutdated(false);
      setConnectionId(null);
      setPending(null);
      setError(null);
      refresh();                       // the hook is lazy: this is the one read, each time the sheet opens
      (async () => {
        try {
          const { data } = await supabase.auth.getSession();
          const meta = data?.session?.user?.user_metadata;
          const start = firstWord(meta?.name || meta?.full_name);
          // Only fills an empty field: a person who got as far as typing a name keeps theirs.
          if (mine === session.current && start) setAlias(cur => cur || start);
        } catch {
          // No name to offer; the field starts empty.
        }
      })();
    }
  }, [visible, refresh]);

  const busy = pending !== null;
  const close = () => {
    if (pending === 'terms' || pending === 'connect') return;
    onClose();
  };

  const bodyMax = Math.max(160, Math.min(380, windowHeight - keyboard - 300));
  const trimmedAlias = alias.trim();
  const aliasOk = trimmedAlias.length >= PRO_ALIAS_RANGE.min && trimmedAlias.length <= PRO_ALIAS_RANGE.max;

  const onCodeChange = (text: string) => {
    setError(null);
    setCode(groupCode(normaliseCode(text).slice(0, CODE_LENGTH)));
  };

  const lookUp = async () => {
    if (busy || !isCompleteCode(code)) return;
    Keyboard.dismiss();
    const mine = session.current;
    setPending('lookup');
    setError(null);
    try {
      const found = await previewProInvite(code);
      if (mine !== session.current) return;
      setPreview(found);
      setStep('preview');
    } catch (e) {
      if (mine === session.current) setError(proErrorMessage(e, "Couldn't check that code. Please try again."));
    } finally {
      if (mine === session.current) setPending(null);
    }
  };

  // The server's word is the access read; before it has answered, the preview's own terms flag decides.
  const clientAccess = access.state === 'ready' ? access.client : null;
  const needsTerms = (p: InvitePreview): boolean => (clientAccess ? clientAccess === 'needs_terms' : !p.clientTermsCurrent);

  const redeem = async () => {
    if (!preview) return;
    const mine = session.current;
    setPending('connect');
    setError(null);
    try {
      const result = await redeemProInvite(code, trimmedAlias);
      if (mine !== session.current) return;
      setConnectionId(result.connectionId);
      setStep('done');
    } catch (e) {
      if (mine !== session.current) return;
      const failure = toProError(e);
      if (failure.code === 'invite_invalid' || failure.code === 'stylist_not_accepting') {
        // The code stopped being usable between the preview and now: back to the code, which is kept.
        setPreview(null);
        setStep('code');
      } else if (failure.code === 'pro_terms_required' || failure.code === 'adult_required') {
        refresh();
        setStep('terms');
      }
      setError(proErrorMessage(failure, "Couldn't connect. Please try again."));
    } finally {
      if (mine === session.current) setPending(null);
    }
  };

  const connect = async () => {
    if (busy || !preview) return;
    if (!preview.alreadyConnected && !aliasOk) {
      setError(proErrorMessage(new ProError('invalid_alias')));
      return;
    }
    Keyboard.dismiss();
    await redeem();
  };

  const goOn = async () => {
    if (!preview) return;
    setError(null);
    if (needsTerms(preview)) {
      setStep('terms');
    } else if (preview.alreadyConnected) {
      await redeem();
    } else {
      setStep('alias');
    }
  };

  const adultKnown = access.state === 'ready' && access.status.adultConfirmed;
  const alreadyAgreed = clientAccess === 'available';
  let termsBlocker: string | null = null;
  if (access.state === 'guest') termsBlocker = proErrorMessage(new ProError('not_authenticated'));
  else if (access.state === 'paused') termsBlocker = PRO_PAUSED_MESSAGE;
  else if (access.state === 'suspended') termsBlocker = PRO_SUSPENDED_MESSAGE;
  else if (access.state === 'not_deployed') termsBlocker = PRO_NOT_DEPLOYED_MESSAGE;
  else if (access.state === 'error') termsBlocker = access.message;
  else if (access.state === 'ready' && clientAccess === 'update_required') termsBlocker = proUpdateMessage(access.status, 'client');
  const termsLoading = access.state === 'loading';
  const canAgree = !busy && !outdated && !termsBlocker && !termsLoading && (alreadyAgreed || adultKnown || adult);

  const agree = async () => {
    if (!canAgree || !preview) return;
    if (!alreadyAgreed) {
      const mine = session.current;
      setPending('terms');
      setError(null);
      try {
        await acceptTerms('client', adultKnown ? true : adult);
      } catch (e) {
        if (mine === session.current) {
          if (toProError(e).code === 'terms_version_mismatch') setOutdated(true);
          setError(proErrorMessage(e, "Couldn't save your agreement. Please try again."));
          setPending(null);
        }
        return;
      }
      if (mine !== session.current) return;
      setPending(null);
    }
    setError(null);
    if (preview.alreadyConnected) await redeem();
    else setStep('alias');
  };

  const report = () => {
    if (!preview) return;
    onClose();
    onReport(preview.inviteId, preview.stylist.name);
  };

  const errorText = error ? (
    <Text variant="caption" color="danger" style={styles.message} accessibilityLiveRegion="polite">
      {error}
    </Text>
  ) : null;

  // A step that needs the stylist's preview falls back to the code if the preview is gone.
  const shown: Step = (step === 'preview' || step === 'terms' || step === 'alias') && !preview ? 'code' : step;

  let title = 'Connect with a stylist';
  let body: React.ReactNode;

  if (shown === 'code') {
    const blocker = codeBlocker(access);
    body = blocker ? (
      <View>
        <Text variant="body" color="muted" accessibilityLiveRegion="polite">{blocker}</Text>
        <Button label="Close" variant="secondary" onPress={close} fullWidth style={styles.gapBig} />
      </View>
    ) : (
      <KeyboardLift>
        <Text variant="body" color="muted" style={styles.intro}>
          Enter the code your stylist gave you. It works once and expires after 7 days.
        </Text>
        <Input
          label="Invite code"
          placeholder="XXXXX-XXXXX"
          value={code}
          onChangeText={onCodeChange}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="go"
          onSubmitEditing={lookUp}
          editable={pending !== 'lookup'}
          accessibilityLabel="Invite code"
        />
        {errorText}
        <Button
          label="Continue"
          onPress={lookUp}
          disabled={!isCompleteCode(code)}
          loading={pending === 'lookup'}
          fullWidth
          style={styles.gapBig}
        />
        <Button label="Cancel" variant="ghost" onPress={close} fullWidth style={styles.gapSmall} />
      </KeyboardLift>
    );
  } else if (shown === 'preview' && preview) {
    body = (
      <View>
        <ScrollView style={{ maxHeight: bodyMax }} showsVerticalScrollIndicator={false}>
          <ProStylistCard stylist={preview.stylist} />
          <Text variant="body" color="muted" style={styles.note}>{PRO_CONNECT_NOTE}</Text>
          {preview.alreadyConnected ? (
            <Text variant="body" style={styles.note}>{`You're already connected to ${preview.stylist.name}.`}</Text>
          ) : null}
          <Pressable
            onPress={report}
            style={[styles.reportRow, { borderTopColor: theme.colors.border }]}
            accessibilityRole="button"
            accessibilityLabel={`Report or block ${preview.stylist.name}`}
          >
            <Icon name="flag-outline" size={18} color={theme.colors.textMuted} />
            <Text variant="bodySmall" color="muted" style={styles.reportText}>Report or block</Text>
          </Pressable>
        </ScrollView>
        {errorText}
        <Button
          label={preview.alreadyConnected ? 'Open' : 'Continue'}
          onPress={goOn}
          loading={pending === 'connect'}
          disabled={busy}
          fullWidth
          style={styles.gapBig}
        />
        <Button
          label="Back"
          variant="ghost"
          onPress={() => {
            setError(null);
            setStep('code');
          }}
          disabled={busy}
          fullWidth
          style={styles.gapSmall}
        />
      </View>
    );
  } else if (shown === 'terms') {
    title = PRO_CLIENT_TERMS.title;
    const showAdult = !adultKnown && !alreadyAgreed;
    body = (
      <View>
        <ScrollView style={{ maxHeight: bodyMax }} accessibilityLabel={PRO_CLIENT_TERMS.title}>
          {PRO_CLIENT_TERMS.sections.map((section, i) => (
            <View key={section.heading} style={{ marginTop: i === 0 ? 0 : 16 }}>
              <Text variant="h4" style={styles.heading}>{section.heading}</Text>
              <Text variant="body" color="muted">{section.body}</Text>
            </View>
          ))}
        </ScrollView>
        {showAdult ? (
          <View style={[styles.adultRow, { borderTopColor: theme.colors.border }]}>
            <Text variant="body" weight="500" style={styles.adultLabel}>{ADULT_TEXT}</Text>
            <Switch
              value={adult}
              onValueChange={setAdult}
              disabled={busy}
              accessibilityLabel={ADULT_TEXT}
              trackColor={{ false: theme.colors.border, true: theme.colors.accent }}
              thumbColor="#FFFFFF"
            />
          </View>
        ) : null}
        {errorText ?? (termsBlocker ? (
          <Text variant="caption" color="muted" style={styles.message} accessibilityLiveRegion="polite">
            {termsBlocker}
          </Text>
        ) : null)}
        {access.state === 'error' ? (
          <Button label="Try again" onPress={refresh} fullWidth style={styles.gapBig} />
        ) : (
          <Button
            label="I agree"
            onPress={agree}
            loading={pending === 'terms' || termsLoading}
            disabled={!canAgree}
            fullWidth
            style={styles.gapBig}
          />
        )}
        <Button
          label="Not now"
          variant="ghost"
          onPress={() => {
            setError(null);
            setStep('preview');
          }}
          disabled={busy}
          fullWidth
          style={styles.gapSmall}
        />
      </View>
    );
  } else if (shown === 'alias') {
    title = 'Name your stylist will see';
    body = (
      <KeyboardLift>
        <Text variant="body" color="muted" style={styles.intro}>
          Your stylist sees this name. Your email and other account details stay private.
        </Text>
        <Input
          label="Name your stylist will see"
          value={alias}
          onChangeText={t => {
            setAlias(t);
            setError(null);
          }}
          maxLength={PRO_ALIAS_RANGE.max}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={() => Keyboard.dismiss()}
          editable={!busy}
          helper={`${PRO_ALIAS_RANGE.min} to ${PRO_ALIAS_RANGE.max} characters`}
          accessibilityLabel="Name your stylist will see"
        />
        {errorText}
        <Button
          label="Connect"
          onPress={connect}
          disabled={!aliasOk}
          loading={pending === 'connect'}
          fullWidth
          style={styles.gapBig}
        />
        <Button
          label="Back"
          variant="ghost"
          onPress={() => {
            setError(null);
            setStep('preview');
          }}
          disabled={busy}
          fullWidth
          style={styles.gapSmall}
        />
      </KeyboardLift>
    );
  } else {
    title = 'Connected';
    const name = preview?.stylist.name ?? 'your stylist';
    body = (
      <View>
        <Text variant="bodyLarge" weight="600" style={styles.note}>
          {preview?.alreadyConnected ? `You're already connected to ${name}.` : `You're connected to ${name}.`}
        </Text>
        <Text variant="body" color="muted" style={styles.note}>{PRO_CONNECT_NOTE}</Text>
        {opensConnection ? (
          <>
            <Button
              label="Choose what to share"
              onPress={() => {
                if (connectionId) onConnected(connectionId);
              }}
              fullWidth
              style={styles.gapBig}
            />
            <Button label="Done" variant="ghost" onPress={close} fullWidth style={styles.gapSmall} />
          </>
        ) : (
          <Button
            label="Done"
            onPress={() => {
              if (connectionId) onConnected(connectionId);
              else close();
            }}
            fullWidth
            style={styles.gapBig}
          />
        )}
      </View>
    );
  }

  return (
    <Sheet visible={visible} onClose={close} title={title}>
      {body}
    </Sheet>
  );
};

const styles = StyleSheet.create({
  intro: { marginBottom: 12 },
  note: { marginTop: 12 },
  heading: { marginBottom: 4 },
  message: { marginTop: 10 },
  gapBig: { marginTop: 16 },
  gapSmall: { marginTop: 6 },
  reportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  reportText: { marginLeft: 10 },
  adultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  adultLabel: { flex: 1, marginRight: 12 },
});

export default ProRedeemSheet;
