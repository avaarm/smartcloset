/**
 * RatingScale: five stars or five dots for a 1 to 5 answer (documentation/design/quality-ratings.md, 6.2).
 *
 * Stars are for overall ratings, dots for the "how does it feel" scales. The whole control is one adjustable
 * element for a screen reader (swipe up or down to change it); each mark is also a tap target of at least 44
 * points for everyone else. A read-only scale just shows the answer.
 *
 * `adjustable={false}` is for a scale where choosing a mark saves at once (the one-tap stars on the item card). A
 * screen reader's increment swipe would commit a 1-star rating the moment it lands, so the grouping is dropped
 * and each mark is its own labelled button instead; the person picks the one they mean.
 *
 * `allowClear` is for optional scales: choosing the selected value again clears it. The clear is reported with
 * `onClear` because `onChange` only ever carries a real score.
 */

import React from 'react';
import { AccessibilityActionEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { SCORES, type Score } from '../config/ratingVocabulary';
import theme from '../styles/theme';

export interface RatingScaleProps {
  value: Score | null;
  onChange?: (value: Score) => void;
  /** Called when `allowClear` is on and the selected value is chosen again (or lowered below 1 by a screen reader). */
  onClear?: () => void;
  readOnly?: boolean;
  variant?: 'stars' | 'dots';
  size?: 'sm' | 'md' | 'lg';
  accessibilityLabel: string;
  /** The word for the chosen value, shown under the scale. */
  valueLabels?: Record<Score, string>;
  /** What the first and last mark mean, shown under the two ends. */
  endLabels?: readonly [string, string];
  allowClear?: boolean;
  /**
   * On (the default), a screen reader gets one adjustable element it can step up and down. Turn it off where a
   * change is saved as soon as it is made: the marks then stay separate buttons and there is no step action.
   */
  adjustable?: boolean;
}

const MARK_PX = {
  stars: { sm: 18, md: 28, lg: 36 },
  dots: { sm: 10, md: 14, lg: 20 },
} as const;

/** The smallest comfortable touch target. */
const MIN_TARGET = 44;

/** What each mark is called, for the person who can't see the stars and for tests. */
export const scaleStepLabel = (label: string, step: Score): string => `${label}, ${step} of 5`;

const valueText = (value: Score | null, valueLabels?: Record<Score, string>): string => {
  if (value === null) {
    return 'Not set';
  }
  return valueLabels ? `${value} of 5, ${valueLabels[value]}` : `${value} of 5`;
};

const RatingScale: React.FC<RatingScaleProps> = ({
  value,
  onChange,
  onClear,
  readOnly = false,
  variant = 'stars',
  size = 'md',
  accessibilityLabel,
  valueLabels,
  endLabels,
  allowClear = false,
  adjustable = true,
}) => {
  const interactive = !readOnly && !!onChange;
  // One element for a screen reader: the adjustable control, or the read-only value. An interactive scale that is
  // not adjustable leaves its marks to speak for themselves.
  const grouped = !interactive || adjustable;
  const px = MARK_PX[variant][size];

  const choose = (step: Score) => {
    if (!interactive) {
      return;
    }
    if (step === value) {
      if (allowClear) {
        onClear?.();
      }
      return;
    }
    onChange?.(step);
  };

  const adjust = (event: AccessibilityActionEvent) => {
    if (!interactive) {
      return;
    }
    const action = event.nativeEvent.actionName;
    if (action === 'increment') {
      const next = Math.min(5, (value ?? 0) + 1) as Score;
      if (next !== value) {
        onChange?.(next);
      }
    } else if (action === 'decrement' && value !== null) {
      if (value === 1) {
        if (allowClear) {
          onClear?.();
        }
      } else {
        onChange?.((value - 1) as Score);
      }
    }
  };

  const mark = (step: Score) => {
    const filled = value !== null && step <= value;
    const glyph =
      variant === 'stars' ? (
        <Icon
          name={filled ? 'star' : 'star-outline'}
          size={px}
          color={filled ? theme.colors.accent : theme.colors.borderStrong}
        />
      ) : (
        <View
          style={[
            styles.dot,
            { width: px, height: px, borderRadius: px / 2 },
            filled ? styles.dotFilled : styles.dotEmpty,
          ]}
        />
      );

    if (!interactive) {
      return (
        <View key={step} style={[styles.cell, variant === 'dots' && styles.cellGrow, styles.cellStatic]}>
          {glyph}
        </View>
      );
    }
    return (
      <Pressable
        key={step}
        onPress={() => choose(step)}
        accessibilityRole="button"
        accessibilityLabel={scaleStepLabel(accessibilityLabel, step)}
        accessibilityState={{ selected: value === step }}
        hitSlop={4}
        style={[styles.cell, variant === 'dots' ? styles.cellGrow : styles.cellFixed, styles.cellTouch]}
      >
        {glyph}
      </Pressable>
    );
  };

  return (
    <View
      accessible={grouped}
      accessibilityRole={grouped ? (interactive ? 'adjustable' : 'text') : undefined}
      accessibilityLabel={grouped ? accessibilityLabel : undefined}
      accessibilityHint={grouped && endLabels ? `1 is ${endLabels[0]}, 5 is ${endLabels[1]}` : undefined}
      accessibilityValue={
        grouped ? { min: 1, max: 5, now: value ?? undefined, text: valueText(value, valueLabels) } : undefined
      }
      accessibilityActions={interactive && adjustable ? [{ name: 'increment' }, { name: 'decrement' }] : undefined}
      onAccessibilityAction={interactive && adjustable ? adjust : undefined}
      style={styles.wrap}
    >
      <View style={styles.marks}>{SCORES.map(mark)}</View>
      {endLabels ? (
        <View style={styles.ends}>
          <Text style={styles.endLabel}>{endLabels[0]}</Text>
          <Text style={[styles.endLabel, styles.endRight]}>{endLabels[1]}</Text>
        </View>
      ) : null}
      {valueLabels && value !== null ? <Text style={styles.valueLabel}>{valueLabels[value]}</Text> : null}
    </View>
  );
};

export default RatingScale;

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch' },
  marks: { flexDirection: 'row', alignItems: 'center' },
  cell: { alignItems: 'center', justifyContent: 'center' },
  cellFixed: { width: MIN_TARGET },
  cellGrow: { flex: 1 },
  cellTouch: { minHeight: MIN_TARGET },
  // A display-only mark needs no touch room, only a little air.
  cellStatic: { minWidth: 28, paddingVertical: 2 },
  dot: { borderWidth: 1.5 },
  dotFilled: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  dotEmpty: { backgroundColor: 'transparent', borderColor: theme.colors.borderStrong },
  ends: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  endLabel: { flex: 1, fontSize: 12, color: theme.colors.textMuted },
  endRight: { textAlign: 'right' },
  valueLabel: { marginTop: 6, fontSize: 14, fontWeight: '600', color: theme.colors.text },
});
