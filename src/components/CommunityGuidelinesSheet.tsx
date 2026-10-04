/**
 * CommunityGuidelinesSheet — the rules for the Friends feature, how to report
 * or block someone, and how to reach us.
 */

import React from 'react';
import { Alert, Linking, ScrollView, View } from 'react-native';
import { Button, Sheet, Text } from '../ui';
import { COMMUNITY_GUIDELINES } from '../config/communityGuidelines';
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '../config/legal';

export type CommunityGuidelinesSheetProps = {
  visible: boolean;
  onClose: () => void;
};

export const CommunityGuidelinesSheet: React.FC<CommunityGuidelinesSheetProps> = ({ visible, onClose }) => {
  const contactSupport = () => {
    Linking.openURL(SUPPORT_MAILTO).catch(() =>
      Alert.alert('Could not open Mail', `You can reach us at ${SUPPORT_EMAIL}.`),
    );
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={COMMUNITY_GUIDELINES.title}>
      <ScrollView style={{ maxHeight: 420 }}>
        <Text variant="body" color="muted">{COMMUNITY_GUIDELINES.intro}</Text>
        <View style={{ marginTop: 12 }}>
          {COMMUNITY_GUIDELINES.rules.map(rule => (
            <View key={rule} style={{ flexDirection: 'row', marginBottom: 8 }}>
              <Text variant="body" style={{ width: 16 }}>•</Text>
              <Text variant="body" style={{ flex: 1 }}>{rule}</Text>
            </View>
          ))}
        </View>
        <Text variant="body" color="muted" style={{ marginTop: 4 }}>{COMMUNITY_GUIDELINES.enforcement}</Text>
        <Text variant="body" color="muted" style={{ marginTop: 12 }}>{COMMUNITY_GUIDELINES.contact}</Text>
      </ScrollView>
      <Button label="Email support" variant="secondary" onPress={contactSupport} fullWidth style={{ marginTop: 16 }} />
      <Button label="Done" onPress={onClose} fullWidth style={{ marginTop: 10 }} />
    </Sheet>
  );
};

export default CommunityGuidelinesSheet;
