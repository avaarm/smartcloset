/**
 * SwapGuidelinesSheet — the rules for swaps, the safety tips, how to report or block, and how to
 * reach us. Friends have their own guidelines (CommunityGuidelinesSheet), which this does not touch.
 */

import React from 'react';
import { Alert, Linking, ScrollView, View } from 'react-native';
import { Button, Sheet, Text } from '../ui';
import { SWAP_GUIDELINES, SWAP_SAFETY_TIPS } from '../config/swapRules';
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '../config/legal';

export type SwapGuidelinesSheetProps = {
  visible: boolean;
  onClose: () => void;
};

const Bullet: React.FC<{ children: string }> = ({ children }) => (
  <View style={{ flexDirection: 'row', marginBottom: 8 }}>
    <Text variant="body" style={{ width: 16 }}>•</Text>
    <Text variant="body" style={{ flex: 1 }}>{children}</Text>
  </View>
);

export const SwapGuidelinesSheet: React.FC<SwapGuidelinesSheetProps> = ({ visible, onClose }) => {
  const contactSupport = async () => {
    try {
      await Linking.openURL(SUPPORT_MAILTO);
    } catch {
      Alert.alert('Could not open Mail', `You can reach us at ${SUPPORT_EMAIL}.`);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={SWAP_GUIDELINES.title}>
      <ScrollView style={{ maxHeight: 420 }}>
        <Text variant="body" color="muted">{SWAP_GUIDELINES.intro}</Text>
        <View style={{ marginTop: 12 }}>
          {SWAP_GUIDELINES.rules.map(rule => (
            <Bullet key={rule}>{rule}</Bullet>
          ))}
        </View>
        <Text variant="body" color="muted" style={{ marginTop: 4 }}>{SWAP_GUIDELINES.enforcement}</Text>

        <Text variant="h4" style={{ marginTop: 20, marginBottom: 8 }}>Swapping safely</Text>
        {SWAP_SAFETY_TIPS.map(tip => (
          <Bullet key={tip}>{tip}</Bullet>
        ))}

        <Text variant="body" color="muted" style={{ marginTop: 12 }}>{SWAP_GUIDELINES.contact}</Text>
      </ScrollView>
      <Button label="Email support" variant="secondary" onPress={contactSupport} fullWidth style={{ marginTop: 16 }} />
      <Button label="Done" onPress={onClose} fullWidth style={{ marginTop: 10 }} />
    </Sheet>
  );
};

export default SwapGuidelinesSheet;
