/**
 * ProStylistProfileSheet — becoming a stylist, and editing the profile afterwards.
 *
 * One Sheet, two steps: the stylist terms (only while the stylist role is in needs_terms) and then the form. The form
 * is everything a client sees before they connect: display name, headline, bio, services and languages from closed
 * lists, and rates as text. Rates are information only; the app takes no payment (PRO_NO_PAYMENT_LINE comes with the
 * preview card). A live preview shows the card exactly as a client will see it.
 *
 * Saving calls saveStylistProfile and then asks the account mode to re-read the role, so the Stylist workspace is
 * available at once. The server filters every text field; a refusal is shown under the field it names, with the plain
 * reason. A profile a person removed answers 'stylist_profile_removed': the sheet then shows that and no form.
 * Terms are agreed through useProAccess, which sends this build's text version and nothing else.
 *
 * The person is not a stylist until the profile is saved: closing the sheet early creates nothing. Agreeing to the
 * terms is remembered for this opening only, because the server does not report terms for an account that has no
 * profile yet. The host closes the sheet from onSaved.
 *
 * Mounted inside Settings as well as in the Stylist workspace, so it uses no navigation hook.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, ScrollView, StyleSheet, Switch, TextInput, View, useWindowDimensions } from 'react-native';
import { Button, Input, Sheet, Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import { useAccountMode } from '../context/AccountModeContext';
import {
  PRO_LANGUAGES,
  PRO_LANGUAGES_MAX,
  PRO_NOT_DEPLOYED_MESSAGE,
  PRO_PAUSED_MESSAGE,
  PRO_SERVICES,
  PRO_STYLIST_TERMS,
  PRO_SUSPENDED_MESSAGE,
  PRO_TEXT_LIMITS,
} from '../config/proRules';
import { proUpdateMessage, useProAccess } from '../hooks/useProAccess';
import { getMyStylistProfile, saveStylistProfile } from '../services/proService';
import { ProError, proErrorMessage, toProError } from '../services/proErrors';
import type { InvitePreview } from '../types/pro';
import ChoiceChip from './ChoiceChip';
import { KeyboardDoneBar, keyboardDoneProps } from './KeyboardSafe';
import { KeyboardLift, useKeyboardHeight } from './KeyboardLift';
import ProStylistCard from './ProStylistCard';

export type ProStylistProfileSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** The profile was saved (and the role re-read); the host closes the sheet. */
  onSaved: () => void;
};

type Field = 'name' | 'headline' | 'bio' | 'services' | 'languages' | 'rates';

/** The field a refusal names (text_not_allowed and invalid_profile put it in DETAIL). */
const FIELD_OF_DETAIL: Record<string, Field> = {
  display_name: 'name',
  headline: 'headline',
  bio: 'bio',
  rates: 'rates',
  services: 'services',
  languages: 'languages',
};

/** How a field is named when its refusal is repeated below the form, where the field itself may be scrolled out of sight. */
const FIELD_NAME: Record<Field, string> = {
  name: 'Display name',
  headline: 'Headline',
  bio: 'Bio',
  services: 'Services',
  languages: 'Languages',
  rates: 'Rates',
};

const ADULT_TEXT = 'I am 18 or older';
const REMOVED_MESSAGE = proErrorMessage(new ProError('stylist_profile_removed'));
const RATES_HELPER = 'Information only. Payment is arranged directly with your clients.';

/** What the account mode offers; a mocked context may return less, and the role is then read again later on its own. */
type RoleMode = { currentMode: string; refreshRole?: () => Promise<unknown> | void };

const toggled = (list: string[], id: string): string[] => (list.includes(id) ? list.filter(x => x !== id) : [...list, id]);

export const ProStylistProfileSheet: React.FC<ProStylistProfileSheetProps> = ({ visible, onClose, onSaved }) => {
  const { theme } = useTheme();
  const { height: windowHeight } = useWindowDimensions();
  const keyboard = useKeyboardHeight();
  const { refreshRole } = useAccountMode() as RoleMode;
  const { access, refresh, acceptTerms } = useProAccess({ refreshOn: 'mount', lazy: true });

  const [loaded, setLoaded] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [existing, setExisting] = useState(false);
  const [name, setName] = useState('');
  const [headline, setHeadline] = useState('');
  const [bio, setBio] = useState('');
  const [services, setServices] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [rates, setRates] = useState('');
  const [accepting, setAccepting] = useState(true);
  const [termsDone, setTermsDone] = useState(false);
  const [outdated, setOutdated] = useState(false);
  const [adult, setAdult] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({});
  // A new number each time the sheet opens or closes; an answer that arrives under an older one is dropped.
  const session = useRef(0);
  const headlineRef = useRef<TextInput>(null);
  const bioRef = useRef<TextInput>(null);

  const loadProfile = useCallback(async () => {
    const mine = session.current;
    setLoaded('loading');
    try {
      const profile = await getMyStylistProfile();
      if (mine !== session.current) return;
      if (profile) {
        setExisting(true);
        setName(profile.displayName);
        setHeadline(profile.headline);
        setBio(profile.bio);
        setServices(profile.services);
        setLanguages(profile.languages);
        setRates(profile.ratesText);
        setAccepting(profile.accepting);
      }
      setLoaded('ready');
    } catch {
      // The reason shows through the access state when there is one; otherwise "Try again" explains.
      if (mine === session.current) setLoaded('failed');
    }
  }, []);

  useEffect(() => {
    session.current++;
    if (visible) {
      setExisting(false);
      setName('');
      setHeadline('');
      setBio('');
      setServices([]);
      setLanguages([]);
      setRates('');
      setAccepting(true);
      setTermsDone(false);
      setOutdated(false);
      setAdult(false);
      setRemoved(false);
      setBusy(false);
      setError(null);
      setFieldErrors({});
      refresh();                       // the hook is lazy: this is the one read, each time the sheet opens
      loadProfile();
    }
  }, [visible, refresh, loadProfile]);

  const close = () => {
    if (!busy) onClose();
  };

  const retry = () => {
    refresh();
    loadProfile();
  };

  const edit = <T,>(set: (v: T) => void, field?: Field) => (v: T) => {
    set(v);
    setError(null);
    if (field) setFieldErrors(cur => (cur[field] ? { ...cur, [field]: undefined } : cur));
  };

  // ── what the server says about this person, before the form ────────────────
  const stylistAccess = access.state === 'ready' ? access.stylist : null;
  const adultKnown = access.state === 'ready' && access.status.adultConfirmed;
  let blocker: string | null = null;
  if (access.state === 'guest') blocker = proErrorMessage(new ProError('not_authenticated'));
  else if (access.state === 'paused') blocker = PRO_PAUSED_MESSAGE;
  else if (access.state === 'suspended') blocker = PRO_SUSPENDED_MESSAGE;
  else if (access.state === 'not_deployed') blocker = PRO_NOT_DEPLOYED_MESSAGE;
  else if (access.state === 'error') blocker = access.message;
  else if (access.state === 'ready' && stylistAccess === 'update_required') blocker = proUpdateMessage(access.status, 'stylist');
  const profileRemoved = removed || (access.state === 'ready' && access.status.stylistRemoved);
  const needsTerms = stylistAccess === 'needs_terms' && !termsDone;

  const trimmedName = name.trim();
  const nameOk = trimmedName.length >= PRO_TEXT_LIMITS.display_name_min && trimmedName.length <= PRO_TEXT_LIMITS.display_name_max;
  const canSave = nameOk && services.length > 0 && !busy;

  const canAgree = !busy && !outdated && (adultKnown || adult);

  const agree = async () => {
    if (!canAgree) return;
    const mine = session.current;
    setBusy(true);
    setError(null);
    try {
      await acceptTerms('stylist', adultKnown ? true : adult);
      if (mine === session.current) setTermsDone(true);
    } catch (e) {
      if (mine === session.current) {
        if (toProError(e).code === 'terms_version_mismatch') setOutdated(true);
        setError(proErrorMessage(e, "Couldn't save your agreement. Please try again."));
      }
    } finally {
      if (mine === session.current) setBusy(false);
    }
  };

  const fail = (e: unknown) => {
    const failure = toProError(e);
    const field =
      (failure.code === 'text_not_allowed' || failure.code === 'invalid_profile') && failure.detail
        ? FIELD_OF_DETAIL[failure.detail]
        : undefined;
    if (failure.code === 'stylist_profile_removed') {
      setRemoved(true);
    } else if (failure.code === 'pro_terms_required' || failure.code === 'adult_required') {
      setTermsDone(false);
      refresh();
      setError(proErrorMessage(failure));
    } else if (field) {
      const reason = proErrorMessage(failure);
      setFieldErrors(cur => ({ ...cur, [field]: reason }));
      setError(`${FIELD_NAME[field]}: ${reason}`);
    } else {
      setError(proErrorMessage(failure, "Couldn't save your profile. Please try again."));
    }
  };

  const save = async () => {
    if (!canSave) return;
    Keyboard.dismiss();
    const mine = session.current;
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      await saveStylistProfile({
        displayName: trimmedName,
        headline: headline.trim(),
        bio: bio.trim(),
        services,
        languages,
        ratesText: rates.trim(),
        accepting,
      });
      if (mine !== session.current) return;
      try {
        await refreshRole?.();
      } catch {
        // The role is read again on the next launch or when the app returns to the foreground.
      }
      refresh();
      if (mine === session.current) onSaved();
    } catch (e) {
      if (mine === session.current) fail(e);
    } finally {
      if (mine === session.current) setBusy(false);
    }
  };

  const preview: InvitePreview['stylist'] = {
    name: trimmedName || 'Your name',
    headline: headline.trim(),
    bio: bio.trim(),
    services,
    languages,
    ratesText: rates.trim(),
  };

  const formMax = Math.max(180, Math.min(windowHeight * 0.55, windowHeight - keyboard - 280));
  const termsMax = Math.max(160, Math.min(340, windowHeight - keyboard - 300));

  const closeButton = <Button label="Close" variant="secondary" onPress={close} fullWidth style={styles.gapBig} />;
  const fieldError = (field: Field) =>
    fieldErrors[field] ? (
      <Text variant="caption" color="danger" style={styles.fieldError} accessibilityLiveRegion="polite">
        {fieldErrors[field]}
      </Text>
    ) : null;

  let title = loaded === 'ready' && !existing ? 'Become a stylist' : 'Stylist profile';
  let body: React.ReactNode;

  if (blocker) {
    body = (
      <View>
        <Text variant="body" color="muted" accessibilityLiveRegion="polite">{blocker}</Text>
        {access.state === 'error' ? <Button label="Try again" onPress={retry} fullWidth style={styles.gapBig} /> : null}
        {closeButton}
      </View>
    );
  } else if (access.state === 'loading' || loaded === 'loading') {
    body = <Text variant="body" color="muted" style={styles.gapSmall}>Loading…</Text>;
  } else if (profileRemoved) {
    body = (
      <View>
        <Text variant="body" color="muted" accessibilityLiveRegion="polite">{REMOVED_MESSAGE}</Text>
        {closeButton}
      </View>
    );
  } else if (loaded === 'failed') {
    body = (
      <View>
        <Text variant="body" color="danger" accessibilityLiveRegion="polite">
          Couldn't load your profile. Check your connection and try again.
        </Text>
        <Button label="Try again" onPress={retry} fullWidth style={styles.gapBig} />
        <Button label="Cancel" variant="ghost" onPress={close} fullWidth style={styles.gapSmall} />
      </View>
    );
  } else if (needsTerms) {
    title = PRO_STYLIST_TERMS.title;
    body = (
      <View>
        <ScrollView style={{ maxHeight: termsMax }} accessibilityLabel={PRO_STYLIST_TERMS.title}>
          {PRO_STYLIST_TERMS.sections.map((section, i) => (
            <View key={section.heading} style={{ marginTop: i === 0 ? 0 : 16 }}>
              <Text variant="h4" style={styles.heading}>{section.heading}</Text>
              <Text variant="body" color="muted">{section.body}</Text>
            </View>
          ))}
        </ScrollView>
        {!adultKnown ? (
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
        {error ? (
          <Text variant="caption" color="danger" style={styles.message} accessibilityLiveRegion="polite">{error}</Text>
        ) : null}
        <Button label="I agree" onPress={agree} loading={busy} disabled={!canAgree} fullWidth style={styles.gapBig} />
        <Button label="Not now" variant="ghost" onPress={close} disabled={busy} fullWidth style={styles.gapSmall} />
      </View>
    );
  } else {
    body = (
      <KeyboardLift>
        <ScrollView style={{ maxHeight: formMax }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Input
            label="Display name"
            placeholder="The name clients will see"
            value={name}
            onChangeText={edit(setName, 'name')}
            maxLength={PRO_TEXT_LIMITS.display_name_max}
            autoCapitalize="words"
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => headlineRef.current?.focus()}
            editable={!busy}
            error={fieldErrors.name}
            helper={`${PRO_TEXT_LIMITS.display_name_min} to ${PRO_TEXT_LIMITS.display_name_max} characters`}
            accessibilityLabel="Display name"
          />
          <Input
            ref={headlineRef}
            label="Headline"
            placeholder="One line about what you do"
            value={headline}
            onChangeText={edit(setHeadline, 'headline')}
            maxLength={PRO_TEXT_LIMITS.headline}
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => bioRef.current?.focus()}
            editable={!busy}
            error={fieldErrors.headline}
            containerStyle={styles.field}
            accessibilityLabel="Headline"
          />
          <Input
            ref={bioRef}
            label="Bio"
            placeholder="A little about you and how you work"
            value={bio}
            onChangeText={edit(setBio, 'bio')}
            multiline
            maxLength={PRO_TEXT_LIMITS.bio}
            editable={!busy}
            error={fieldErrors.bio}
            helper={`${bio.length}/${PRO_TEXT_LIMITS.bio}`}
            containerStyle={styles.field}
            inputStyle={styles.bio}
            accessibilityLabel="Bio"
            {...keyboardDoneProps}
          />

          <Text variant="label" color="muted" style={styles.sectionLabel}>Services</Text>
          <View style={styles.chips}>
            {PRO_SERVICES.map(s => (
              <ChoiceChip
                key={s.id}
                label={s.label}
                role="checkbox"
                selected={services.includes(s.id)}
                disabled={busy}
                onPress={() => edit(setServices, 'services')(toggled(services, s.id))}
              />
            ))}
          </View>
          {fieldError('services')}

          <Text variant="label" color="muted" style={styles.sectionLabel}>{`Languages (up to ${PRO_LANGUAGES_MAX})`}</Text>
          <View style={styles.chips}>
            {PRO_LANGUAGES.map(l => {
              const selected = languages.includes(l.code);
              return (
                <ChoiceChip
                  key={l.code}
                  label={l.label}
                  role="checkbox"
                  compact
                  selected={selected}
                  disabled={busy || (!selected && languages.length >= PRO_LANGUAGES_MAX)}
                  onPress={() => edit(setLanguages, 'languages')(toggled(languages, l.code))}
                />
              );
            })}
          </View>
          {fieldError('languages')}

          <Input
            label="Rates"
            placeholder="Optional. Say how you set your rates, in your own words."
            value={rates}
            onChangeText={edit(setRates, 'rates')}
            maxLength={PRO_TEXT_LIMITS.rates}
            returnKeyType="done"
            onSubmitEditing={() => Keyboard.dismiss()}
            editable={!busy}
            error={fieldErrors.rates}
            helper={RATES_HELPER}
            containerStyle={styles.field}
            accessibilityLabel="Rates"
          />

          <View style={[styles.switchRow, { borderTopColor: theme.colors.border }]}>
            <Text variant="body" weight="500" style={styles.adultLabel}>Accepting new clients</Text>
            <Switch
              value={accepting}
              onValueChange={edit(setAccepting)}
              disabled={busy}
              accessibilityLabel="Accepting new clients"
              trackColor={{ false: theme.colors.border, true: theme.colors.accent }}
              thumbColor="#FFFFFF"
            />
          </View>

          <Text variant="label" color="muted" style={styles.sectionLabel}>How clients see this</Text>
          <ProStylistCard stylist={preview} />
        </ScrollView>

        {error ? (
          <Text variant="caption" color="danger" style={styles.message} accessibilityLiveRegion="polite">{error}</Text>
        ) : null}
        <Button label="Save profile" onPress={save} loading={busy} disabled={!canSave} fullWidth style={styles.gapBig} />
        <Button label="Cancel" variant="ghost" onPress={close} disabled={busy} fullWidth style={styles.gapSmall} />
        <KeyboardDoneBar />
      </KeyboardLift>
    );
  }

  return (
    <Sheet visible={visible} onClose={close} title={title}>
      {body}
    </Sheet>
  );
};

const styles = StyleSheet.create({
  heading: { marginBottom: 4 },
  message: { marginTop: 10 },
  fieldError: { marginTop: 6 },
  field: { marginTop: 12 },
  bio: { minHeight: 88 },
  sectionLabel: { marginTop: 18, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gapBig: { marginTop: 16 },
  gapSmall: { marginTop: 6 },
  adultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  adultLabel: { flex: 1, marginRight: 12 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});

export default ProStylistProfileSheet;
