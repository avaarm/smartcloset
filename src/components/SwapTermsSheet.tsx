/**
 * SwapTermsSheet — the swap terms, in one scroll with one button.
 *
 * "I agree" records agreement to the text on this screen: acceptSwapTerms() sends the version of
 * SWAP_TERMS in this build and nothing else, and no version can be passed in. A screen opens this
 * sheet only in the needs_terms state (useSwapAccess), where the server's version equals this
 * build's; in update_required the member cannot be shown what they would agree to, so the screen
 * shows its own message and never opens this.
 */

import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Button, Sheet, Text } from '../ui';
import { SWAP_TERMS } from '../config/swapRules';
import { acceptSwapTerms } from '../services/swapService';
import { swapErrorMessage, toSwapError } from '../services/swapErrors';

/** The server's terms changed while the sheet was open, so the text on screen is not the one it holds now. */
const TERMS_CHANGED_MESSAGE = 'The swap terms were updated. Please reopen swaps.';

export type SwapTermsSheetProps = {
  visible: boolean;
  /** Agreement was recorded; the screen reloads what the member may do. */
  onAccepted: () => void;
  onClose: () => void;
};

export const SwapTermsSheet: React.FC<SwapTermsSheetProps> = ({ visible, onAccepted, onClose }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set when the server says its terms differ: agreeing again cannot succeed until swaps are reopened.
  const [outdated, setOutdated] = useState(false);
  // A new number each time the sheet opens or closes. An answer that arrives under an older number
  // is dropped: the member has moved on, and the screen reloads the server's state when it next looks.
  const session = useRef(0);

  useEffect(() => {
    session.current++;
    if (visible) {
      setBusy(false);
      setError(null);
      setOutdated(false);
    }
  }, [visible]);

  const agree = async () => {
    if (busy || outdated) return;
    const mine = session.current;
    setBusy(true);
    setError(null);
    try {
      await acceptSwapTerms();
      if (mine === session.current) onAccepted();
    } catch (e) {
      if (mine === session.current) {
        if (toSwapError(e).code === 'terms_version_mismatch') {
          setOutdated(true);
          setError(TERMS_CHANGED_MESSAGE);
        } else {
          setError(swapErrorMessage(e, 'Couldn’t save your agreement. Please try again.'));
        }
      }
    } finally {
      if (mine === session.current) setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={SWAP_TERMS.title}>
      <ScrollView style={{ maxHeight: 380 }} accessibilityLabel="Swap terms">
        {SWAP_TERMS.sections.map((section, i) => (
          <View key={section.heading} style={{ marginTop: i === 0 ? 0 : 16 }}>
            <Text variant="h4" style={{ marginBottom: 4 }}>{section.heading}</Text>
            <Text variant="body" color="muted">{section.body}</Text>
          </View>
        ))}
      </ScrollView>
      {error ? (
        <Text variant="caption" color="danger" style={{ marginTop: 10 }} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <Button
        label="I agree"
        onPress={agree}
        loading={busy}
        disabled={outdated}
        fullWidth
        style={{ marginTop: 16 }}
      />
      <Button label="Not now" variant="ghost" onPress={onClose} disabled={busy} fullWidth style={{ marginTop: 6 }} />
    </Sheet>
  );
};

export default SwapTermsSheet;
