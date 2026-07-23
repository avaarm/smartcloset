/**
 * WardrobeEditScreen — Swipe-to-audit wardrobe edit tool for stylist sessions.
 *
 * Shows each clothing item one at a time. Stylist taps Keep / Donate / Store / Skip.
 * Ends with a shareable session summary.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Animated,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Button, Screen, Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import { getClothingItems } from '../services/storage';
import { ClothingItem } from '../types';

type Decision = 'keep' | 'donate' | 'store' | 'skip';

interface AuditResult {
  item: ClothingItem;
  decision: Decision;
}

const DECISIONS: { key: Decision; label: string; icon: string; color: string; bg: string }[] = [
  { key: 'donate', label: 'Donate', icon: 'heart-outline', color: '#DC2626', bg: '#FEE2E2' },
  { key: 'keep',   label: 'Keep',   icon: 'checkmark',     color: '#059669', bg: '#D1FAE5' },
  { key: 'store',  label: 'Store',  icon: 'archive-outline', color: '#6B7280', bg: '#F3F4F6' },
  { key: 'skip',   label: 'Skip',   icon: 'arrow-forward',  color: '#D97706', bg: '#FEF3C7' },
];

const WardrobeEditScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { theme } = useTheme();
  const clientName: string | undefined = route.params?.clientName;

  const [items, setItems] = useState<ClothingItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<AuditResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    getClothingItems({ all: true })
      .then(all => {
        setItems(all.filter(i => !i.isWishlist));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const current = items[currentIndex];
  const progress = items.length > 0 ? currentIndex / items.length : 0;

  const decide = (decision: Decision) => {
    if (!current) return;

    Animated.sequence([
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 0, duration: 100, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: decision === 'donate' ? -30 : 30, duration: 100, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 120, useNativeDriver: true }),
      ]),
    ]).start();

    const nextResults = [...results, { item: current, decision }];
    setResults(nextResults);

    if (currentIndex + 1 >= items.length) {
      setDone(true);
    } else {
      setCurrentIndex(i => i + 1);
    }
  };

  const summary = {
    keep: results.filter(r => r.decision === 'keep'),
    donate: results.filter(r => r.decision === 'donate'),
    store: results.filter(r => r.decision === 'store'),
    skip: results.filter(r => r.decision === 'skip'),
  };

  if (loading) {
    return (
      <Screen>
        <Text variant="body" color="muted" align="center">Loading wardrobe…</Text>
      </Screen>
    );
  }

  // ── Summary screen ────────────────────────────────────────────────────────
  if (done || (items.length === 0 && !loading)) {
    return (
      <Screen padded={false}>
        <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={16}>
            <Icon name="close" size={24} color={theme.colors.text} />
          </Pressable>
          <Text variant="h3">Audit Complete</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          {clientName && (
            <Text variant="body" color="muted" style={{ marginBottom: 16 }}>
              Session summary for {clientName}
            </Text>
          )}

          {/* Stat row */}
          <View style={styles.statRow}>
            {[
              { label: 'Keep', count: summary.keep.length, color: '#059669', bg: '#D1FAE5' },
              { label: 'Donate', count: summary.donate.length, color: '#DC2626', bg: '#FEE2E2' },
              { label: 'Store', count: summary.store.length, color: '#6B7280', bg: '#F3F4F6' },
              { label: 'Skipped', count: summary.skip.length, color: '#D97706', bg: '#FEF3C7' },
            ].map(s => (
              <View key={s.label} style={[styles.statCard, { backgroundColor: s.bg }]}>
                <Text variant="h2" style={{ color: s.color }}>{s.count}</Text>
                <Text variant="caption" style={{ color: s.color, marginTop: 2 }}>{s.label}</Text>
              </View>
            ))}
          </View>

          {/* Detail sections */}
          {(['donate', 'store'] as Decision[]).map(key => {
            const group = summary[key];
            if (group.length === 0) return null;
            const cfg = DECISIONS.find(d => d.key === key)!;
            return (
              <View key={key} style={{ marginTop: 24 }}>
                <Text variant="overline" color="muted" style={{ marginBottom: 10 }}>
                  {cfg.label} ({group.length})
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    {group.map(r => (
                      <View key={r.item.id} style={[styles.thumbCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.cardBackground ?? '#fff' }]}>
                        {(r.item.userImage || r.item.retailerImage) ? (
                          <Image
                            source={{ uri: r.item.userImage || r.item.retailerImage }}
                            style={styles.thumb}
                          />
                        ) : (
                          <View style={[styles.thumb, { backgroundColor: theme.colors.muted, alignItems: 'center', justifyContent: 'center' }]}>
                            <Icon name="shirt-outline" size={20} color={theme.colors.textSubtle} />
                          </View>
                        )}
                        <Text variant="caption" style={{ padding: 4, paddingTop: 2 }} numberOfLines={1}>{r.item.name}</Text>
                      </View>
                    ))}
                  </View>
                </ScrollView>
              </View>
            );
          })}

          <Button
            label="Done"
            variant="primary"
            onPress={() => navigation.goBack()}
            style={{ marginTop: 32 }}
          />
        </ScrollView>
      </Screen>
    );
  }

  // ── Main audit card ───────────────────────────────────────────────────────
  const imageUri = current.userImage || current.retailerImage;

  return (
    <Screen padded={false}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={16}>
          <Icon name="close" size={24} color={theme.colors.text} />
        </Pressable>
        <Text variant="h3">Wardrobe Edit</Text>
        <Text variant="caption" color="muted">
          {currentIndex + 1}/{items.length}
        </Text>
      </View>

      {/* Progress bar */}
      <View style={[styles.progressTrack, { backgroundColor: theme.colors.border }]}>
        <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: theme.colors.accent }]} />
      </View>

      {/* Client label */}
      {clientName && (
        <Text variant="caption" color="muted" align="center" style={{ marginTop: 8 }}>
          {clientName}'s wardrobe
        </Text>
      )}

      {/* Item card */}
      <Animated.View
        style={[styles.cardWrap, { opacity: fadeAnim, transform: [{ translateX: slideAnim }] }]}
      >
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.itemImage} resizeMode="cover" />
        ) : (
          <View style={[styles.itemImage, { backgroundColor: theme.colors.muted, alignItems: 'center', justifyContent: 'center' }]}>
            <Icon name="shirt-outline" size={64} color={theme.colors.textSubtle} />
          </View>
        )}

        <View style={[styles.itemMeta, { backgroundColor: theme.colors.cardBackground ?? '#fff', borderColor: theme.colors.border }]}>
          <Text variant="h3" numberOfLines={1}>{current.name}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            {current.brand && (
              <Text variant="caption" color="muted">{current.brand}</Text>
            )}
            <Text variant="caption" color="muted" style={{ textTransform: 'capitalize' }}>
              {current.category}
            </Text>
            {current.wearCount !== undefined && current.wearCount > 0 && (
              <Text variant="caption" color="muted">· {current.wearCount} wears</Text>
            )}
          </View>
        </View>
      </Animated.View>

      {/* Decision buttons */}
      <View style={styles.decisionRow}>
        {DECISIONS.map(d => (
          <Pressable
            key={d.key}
            onPress={() => decide(d.key)}
            style={({ pressed }) => [
              styles.decisionBtn,
              { backgroundColor: d.bg, opacity: pressed ? 0.8 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={d.label}
          >
            <Icon name={d.icon} size={24} color={d.color} />
            <Text variant="caption" style={{ color: d.color, marginTop: 4 }}>{d.label}</Text>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  progressTrack: {
    height: 3,
    width: '100%',
  },
  progressFill: {
    height: 3,
  },
  cardWrap: {
    flex: 1,
    margin: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  itemImage: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: 12,
    backgroundColor: '#F5F5F4',
  },
  itemMeta: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    borderTopWidth: 1,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  decisionRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
    paddingBottom: 32,
    paddingTop: 8,
    gap: 8,
  },
  decisionBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
  },
  statRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: 12,
  },
  thumbCard: {
    width: 96,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  thumb: {
    width: '100%',
    height: 96,
  },
});

export default WardrobeEditScreen;
