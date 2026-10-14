/**
 * SwapJoinCommunitySheet — the way into the community tier (swaps with people who are not friends).
 *
 * The member picks an alias, says they are 18 or older, and agrees to the photo check. joinSwapCommunity()
 * records those against SWAP_TERMS_VERSION, the version in this build; no version is passed from here.
 * The terms are read inside this sheet (a second step) because opening another modal while this one is
 * on screen is unreliable on iOS.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Dimensions, Keyboard, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Button, Input, Sheet, Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import { SWAP_ALIAS_PATTERN, SWAP_COMMUNITY_SCAN_NOTICE, SWAP_TERMS } from '../config/swapRules';
import { joinSwapCommunity } from '../services/swapService';
import { SwapError, swapErrorMessage } from '../services/swapErrors';
import { useKeyboardHeight, KeyboardLift } from './KeyboardLift';

const ALIAS_MIN = 3;
const ALIAS_MAX = 20;
const ADULT_TEXT = 'I am 18 or older';

type Step = 'form' | 'terms';

export type SwapJoinCommunitySheetProps = {
  visible: boolean;
  /** The member joined; the screen reloads their settings. */
  onJoined: () => void;
  onClose: () => void;
};

const TickRow: React.FC<{ checked: boolean; onToggle: () => void; text: string; disabled?: boolean }> = ({
  checked,
  onToggle,
  text,
  disabled,
}) => {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onToggle}
      disabled={disabled}
      style={styles.tick}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: Boolean(disabled) }}
      accessibilityLabel={text}
    >
      <Icon
        name={checked ? 'checkbox' : 'square-outline'}
        size={22}
        color={checked ? theme.colors.accent : theme.colors.textSubtle}
      />
      <Text variant="body" style={{ flex: 1, marginLeft: 12 }}>{text}</Text>
    </Pressable>
  );
};

export const SwapJoinCommunitySheet: React.FC<SwapJoinCommunitySheetProps> = ({ visible, onJoined, onClose }) => {
  const { theme } = useTheme();
  const [step, setStep] = useState<Step>('form');
  const [alias, setAlias] = useState('');
  const [adult, setAdult] = useState(false);
  const [scanOk, setScanOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A new number each time the sheet opens or closes; an answer from an older one is dropped.
  const session = useRef(0);
  const keyboard = useKeyboardHeight();

  useEffect(() => {
    session.current++;
    if (visible) {
      setStep('form');
      setAlias('');
      setAdult(false);
      setScanOk(false);
      setBusy(false);
      setError(null);
    }
  }, [visible]);

  const trimmed = alias.trim();
  const canJoin = trimmed.length >= ALIAS_MIN && trimmed.length <= ALIAS_MAX && adult && scanOk && !busy;

  const join = async () => {
    if (!canJoin) return;
    // The database applies the same pattern; checking here saves a round trip for an obvious typo.
    if (!SWAP_ALIAS_PATTERN.test(trimmed)) {
      setError(swapErrorMessage(new SwapError('alias_invalid'), ''));
      return;
    }
    const mine = session.current;
    setBusy(true);
    setError(null);
    try {
      await joinSwapCommunity({ alias: trimmed, adult, photoScanOk: scanOk });
      if (mine === session.current) onJoined();
    } catch (e) {
      if (mine === session.current) setError(swapErrorMessage(e, 'Couldn’t join community swaps. Please try again.'));
    } finally {
      if (mine === session.current) setBusy(false);
    }
  };

  const readTerms = () => {
    Keyboard.dismiss();
    setError(null);
    setStep('terms');
  };

  // One Sheet for both steps, so moving to the terms and back never closes and reopens the modal.
  let title = 'Join community swaps';
  let body: React.ReactNode;

  if (step === 'terms') {
    title = SWAP_TERMS.title;
    body = (
      <View>
        <ScrollView style={{ maxHeight: 380 }}>
          {SWAP_TERMS.sections.map((section, i) => (
            <View key={section.heading} style={{ marginTop: i === 0 ? 0 : 16 }}>
              <Text variant="h4" style={{ marginBottom: 4 }}>{section.heading}</Text>
              <Text variant="body" color="muted">{section.body}</Text>
            </View>
          ))}
        </ScrollView>
        <Button label="Back" onPress={() => setStep('form')} fullWidth style={{ marginTop: 16 }} />
      </View>
    );
  } else {
    // The form scrolls when the screen is short or the keyboard is up, so Join stays reachable. The
    // scroll view adds no keyboard insets of its own: the sheet is already lifted by KeyboardLift.
    const bodyMax = Math.max(160, Math.min(360, Dimensions.get('window').height - keyboard - 300));
    body = (
      <KeyboardLift>
        <ScrollView style={{ maxHeight: bodyMax }} keyboardShouldPersistTaps="handled">
          <Text variant="body" color="muted" style={{ marginBottom: 12 }}>
            People who aren’t your friends only ever see this alias, never your name.
          </Text>
          <Input
            label="Alias"
            placeholder="For example, Velvet Otter"
            value={alias}
            onChangeText={setAlias}
            maxLength={ALIAS_MAX}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={() => Keyboard.dismiss()}
            helper={`${ALIAS_MIN} to ${ALIAS_MAX} letters, numbers, spaces or . _ -`}
            accessibilityLabel="Alias"
          />
          <View style={{ marginTop: 8 }}>
            <TickRow checked={adult} onToggle={() => setAdult(v => !v)} text={ADULT_TEXT} />
            <TickRow checked={scanOk} onToggle={() => setScanOk(v => !v)} text={SWAP_COMMUNITY_SCAN_NOTICE} />
          </View>
          <Pressable
            onPress={readTerms}
            accessibilityRole="link"
            accessibilityLabel="Read the swap terms"
            style={{ paddingVertical: 8 }}
          >
            <Text variant="body" style={{ color: theme.colors.accent, textDecorationLine: 'underline' }}>
              Read the swap terms
            </Text>
          </Pressable>
        </ScrollView>
        {error ? (
          <Text variant="caption" color="danger" style={{ marginTop: 10 }} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
        <Button label="Join" onPress={join} disabled={!canJoin} loading={busy} fullWidth style={{ marginTop: 16 }} />
        <Button label="Cancel" variant="ghost" onPress={onClose} disabled={busy} fullWidth style={{ marginTop: 6 }} />
      </KeyboardLift>
    );
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      {body}
    </Sheet>
  );
};

const styles = StyleSheet.create({
  tick: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
  },
});

export default SwapJoinCommunitySheet;
