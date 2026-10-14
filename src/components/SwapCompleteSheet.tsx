/**
 * SwapCompleteSheet — the confirmation before "We swapped!". It says plainly what will happen to the
 * member's closet, because the hand-off cannot be taken back: the piece they get is added, the piece
 * they gave is removed unless they choose to keep it.
 *
 * The screen owns the work (completeSwapHandoff); this sheet only asks and reports the choice.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { Button, Sheet, Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';

export type SwapCompleteSheetProps = {
  visible: boolean;
  /** Names of the pieces the member gives. */
  giveNames: string[];
  /** Names of the pieces the member gets. */
  getNames: string[];
  /** The hand-off is running; the buttons wait. */
  busy: boolean;
  onConfirm: (choice: { keepGiven: boolean }) => void;
  onClose: () => void;
};

/** "Blazer", "Blazer and Shirt", "Blazer, Shirt and Hat". */
export const joinNames = (names: string[]): string => {
  const clean = names.map(n => n.trim()).filter(Boolean);
  if (clean.length <= 1) return clean[0] ?? '';
  return `${clean.slice(0, -1).join(', ')} and ${clean[clean.length - 1]}`;
};

export const SwapCompleteSheet: React.FC<SwapCompleteSheetProps> = ({
  visible,
  giveNames,
  getNames,
  busy,
  onConfirm,
  onClose,
}) => {
  const { theme } = useTheme();
  const [keepGiven, setKeepGiven] = useState(false);

  // Keeping the piece is a choice made each time, never carried over from an earlier opening.
  useEffect(() => {
    if (visible) setKeepGiven(false);
  }, [visible]);

  const get = joinNames(getNames) || 'Your new piece';
  const give = joinNames(giveNames) || 'your piece';
  const closet = keepGiven ? `${give} stays in it.` : `${give} will be removed from it.`;

  return (
    <Sheet visible={visible} onClose={busy ? () => {} : onClose} title="Did you swap?">
      <Text variant="body" color="muted">
        {`Only tap this once you have actually swapped. ${get} will be added to your closet, and ${closet}`}
      </Text>
      <View style={styles.switchRow}>
        <Text variant="body" style={{ flex: 1, marginRight: 12 }}>Keep mine in my closet</Text>
        <Switch
          value={keepGiven}
          onValueChange={setKeepGiven}
          disabled={busy}
          trackColor={{ false: theme.colors.border, true: theme.colors.accent }}
          thumbColor={theme.colors.surface}
          accessibilityLabel="Keep mine in my closet"
        />
      </View>
      <Button
        label="Yes, we swapped!"
        onPress={() => onConfirm({ keepGiven })}
        loading={busy}
        fullWidth
        style={{ marginTop: 20 }}
      />
      <Button label="Not yet" variant="ghost" onPress={onClose} disabled={busy} fullWidth style={{ marginTop: 6 }} />
    </Sheet>
  );
};

const styles = StyleSheet.create({
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
  },
});

export default SwapCompleteSheet;
