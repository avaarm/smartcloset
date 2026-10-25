/**
 * ProGuidelinesSheet — the rules for stylists and their clients, how reports and blocks work, the safety tips for
 * meeting in person, and how to reach us. Swaps and Friends have their own guidelines, which this does not touch.
 */

import React from 'react';
import { Alert, Linking, ScrollView, View } from 'react-native';
import { Button, Sheet, Text } from '../ui';
import {
  PRO_GUIDELINES,
  PRO_GUIDELINES_ENFORCEMENT,
  PRO_GUIDELINES_TITLE,
  PRO_INDEPENDENT_LINE,
  PRO_SAFETY_TIPS,
  PRO_SAFETY_TIPS_TITLE,
} from '../config/proRules';
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '../config/legal';

export type ProGuidelinesSheetProps = {
  visible: boolean;
  onClose: () => void;
};

const Bullet: React.FC<{ children: string }> = ({ children }) => (
  <View style={{ flexDirection: 'row', marginBottom: 8 }}>
    <Text variant="body" style={{ width: 16 }}>•</Text>
    <Text variant="body" style={{ flex: 1 }}>{children}</Text>
  </View>
);

export const ProGuidelinesSheet: React.FC<ProGuidelinesSheetProps> = ({ visible, onClose }) => {
  const contactSupport = async () => {
    try {
      await Linking.openURL(SUPPORT_MAILTO);
    } catch {
      Alert.alert('Could not open Mail', `You can reach us at ${SUPPORT_EMAIL}.`);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={PRO_GUIDELINES_TITLE}>
      <ScrollView style={{ maxHeight: 420 }}>
        <View>
          {PRO_GUIDELINES.map(rule => (
            <Bullet key={rule}>{rule}</Bullet>
          ))}
        </View>
        <Text variant="body" color="muted" style={{ marginTop: 4 }}>{PRO_GUIDELINES_ENFORCEMENT}</Text>

        <Text variant="h4" style={{ marginTop: 20, marginBottom: 8 }}>{PRO_SAFETY_TIPS_TITLE}</Text>
        {PRO_SAFETY_TIPS.map(tip => (
          <Bullet key={tip}>{tip}</Bullet>
        ))}

        <Text variant="body" color="muted" style={{ marginTop: 12 }}>{PRO_INDEPENDENT_LINE}</Text>
      </ScrollView>
      <Button label="Email support" variant="secondary" onPress={contactSupport} fullWidth style={{ marginTop: 16 }} />
      <Button label="Done" onPress={onClose} fullWidth style={{ marginTop: 10 }} />
    </Sheet>
  );
};

export default ProGuidelinesSheet;
