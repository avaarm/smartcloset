/**
 * OutfitCalendarScreen — shows a calendar grid of what you wore each day.
 *
 * Reads wear history from wardrobe items' `lastWorn` field and from
 * saved outfits. Displays a month view with thumbnails on days you logged
 * an outfit, plus a detail strip below for the selected day.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Card, Screen, Text, EmptyState, Badge } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import { ClothingItem } from '../types';
import { getClothingItems } from '../services/storage';
import { getSavedOutfits, Outfit } from '../services/outfitService';

// ─── Date helpers ───────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const toDateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// An entry for a single day
type DayEntry = {
  items: ClothingItem[];
  outfits: Outfit[];
};

// ─── Component ──────────────────────────────────────────────────────────────

const OutfitCalendarScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { theme } = useTheme();

  const [items, setItems] = useState<ClothingItem[]>([]);
  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(toDateKey(new Date()));

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        setLoading(true);
        const [allItems, allOutfits] = await Promise.all([
          getClothingItems(),
          getSavedOutfits(),
        ]);
        if (active) {
          setItems(allItems.filter(i => !i.isWishlist));
          setOutfits(allOutfits);
          setLoading(false);
        }
      })();
      return () => { active = false; };
    }, []),
  );

  // Build a map of date → items worn that day
  const dayMap = useMemo(() => {
    const map: Record<string, DayEntry> = {};

    // From individual item lastWorn dates
    items.forEach(item => {
      if (item.lastWorn) {
        const key = toDateKey(new Date(item.lastWorn));
        if (!map[key]) map[key] = { items: [], outfits: [] };
        map[key].items.push(item);
      }
    });

    // From saved outfits' createdAt (as "worn" date)
    outfits.forEach(outfit => {
      if (outfit.createdAt) {
        const key = toDateKey(new Date(outfit.createdAt));
        if (!map[key]) map[key] = { items: [], outfits: [] };
        map[key].outfits.push(outfit);
      }
    });

    return map;
  }, [items, outfits]);

  // ── Calendar grid ──
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));

  const calendarDays = useMemo(() => {
    const days: Array<{ day: number | null; key: string }> = [];
    // Leading blanks
    for (let i = 0; i < firstDay; i++) {
      days.push({ day: null, key: `blank-${i}` });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const key = toDateKey(new Date(year, month, d));
      days.push({ day: d, key });
    }
    return days;
  }, [year, month, firstDay, daysInMonth]);

  const selectedEntry = selectedDate ? dayMap[selectedDate] : null;
  const today = toDateKey(new Date());

  return (
    <Screen
      scrollable
      header={
        <View style={[s.header, { borderBottomColor: theme.colors.border }]}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Icon name="arrow-back" size={24} color={theme.colors.text} />
          </Pressable>
          <Text variant="h3" style={{ flex: 1, marginLeft: 12 }}>Outfit Calendar</Text>
        </View>
      }
    >
      {/* ── Month navigator ── */}
      <View style={s.monthNav}>
        <Pressable onPress={prevMonth} hitSlop={12}>
          <Icon name="chevron-back" size={24} color={theme.colors.text} />
        </Pressable>
        <Text variant="h3">{MONTH_NAMES[month]} {year}</Text>
        <Pressable onPress={nextMonth} hitSlop={12}>
          <Icon name="chevron-forward" size={24} color={theme.colors.text} />
        </Pressable>
      </View>

      {/* ── Day-of-week headers ── */}
      <View style={s.dayHeaders}>
        {DAY_LABELS.map(d => (
          <Text key={d} variant="caption" color="muted" style={s.dayHeaderText}>{d}</Text>
        ))}
      </View>

      {/* ── Calendar grid ── */}
      <View style={s.calGrid}>
        {calendarDays.map(({ day, key }) => {
          if (day === null) {
            return <View key={key} style={s.dayCell} />;
          }
          const dateKey = key;
          const entry = dayMap[dateKey];
          const isSelected = selectedDate === dateKey;
          const isToday = dateKey === today;
          const hasContent = !!entry;

          return (
            <Pressable
              key={key}
              style={[
                s.dayCell,
                isSelected && { backgroundColor: theme.colors.accent, borderRadius: 12 },
                isToday && !isSelected && { borderWidth: 2, borderColor: theme.colors.accent, borderRadius: 12 },
              ]}
              onPress={() => setSelectedDate(dateKey)}
            >
              <Text
                variant="label"
                style={{
                  color: isSelected
                    ? theme.colors.accentText
                    : isToday ? theme.colors.accent : theme.colors.text,
                }}
              >
                {day}
              </Text>
              {hasContent && (
                <View style={[s.dot, { backgroundColor: isSelected ? theme.colors.accentText : theme.colors.accent }]} />
              )}
            </Pressable>
          );
        })}
      </View>

      {/* ── Selected day detail ── */}
      {selectedDate && (
        <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 }}>
          <Text variant="overline" color="muted" style={{ marginBottom: 8 }}>
            {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
              weekday: 'long', month: 'long', day: 'numeric',
            })}
          </Text>

          {!selectedEntry ? (
            <Card>
              <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                <Icon name="shirt-outline" size={32} color={theme.colors.textSubtle} />
                <Text variant="body" color="muted" style={{ marginTop: 8 }}>
                  No outfits logged this day
                </Text>
              </View>
            </Card>
          ) : (
            <>
              {/* Outfits worn */}
              {selectedEntry.outfits.map(outfit => (
                <Card key={outfit.id} style={{ marginBottom: 12 }}>
                  <Text variant="label" style={{ marginBottom: 8 }}>{outfit.name}</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {outfit.items.slice(0, 4).map((item: any, idx: number) => (
                      <Image
                        key={idx}
                        source={{ uri: item.userImage || item.retailerImage || item.imageUrl }}
                        style={s.outfitThumb}
                      />
                    ))}
                    {outfit.items.length > 4 && (
                      <View style={[s.outfitThumb, { alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.muted }]}>
                        <Text variant="caption">+{outfit.items.length - 4}</Text>
                      </View>
                    )}
                  </View>
                  {outfit.occasion && (
                    <Badge label={outfit.occasion} style={{ marginTop: 8, alignSelf: 'flex-start' }} />
                  )}
                </Card>
              ))}

              {/* Individual items worn */}
              {selectedEntry.items.length > 0 && (
                <Card style={{ marginBottom: 12 }}>
                  <Text variant="label" style={{ marginBottom: 8 }}>Items worn</Text>
                  {selectedEntry.items.map(item => (
                    <Pressable
                      key={item.id}
                      style={s.itemRow}
                      onPress={() => navigation.navigate('ItemDetails', { item })}
                    >
                      <Image
                        source={{ uri: item.userImage || item.retailerImage }}
                        style={s.itemThumb}
                      />
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text variant="label" numberOfLines={1}>{item.name}</Text>
                        <Text variant="caption" color="muted">{item.brand || item.category}</Text>
                      </View>
                      <Icon name="chevron-forward" size={16} color={theme.colors.textSubtle} />
                    </Pressable>
                  ))}
                </Card>
              )}
            </>
          )}
        </View>
      )}

      {/* ── Month stats ── */}
      <View style={{ paddingHorizontal: 20, paddingBottom: 40 }}>
        <Text variant="overline" color="muted" style={{ marginBottom: 8 }}>This Month</Text>
        <Card>
          <View style={s.monthStats}>
            <View style={s.monthStat}>
              <Text variant="h2">
                {Object.keys(dayMap).filter(k => k.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`)).length}
              </Text>
              <Text variant="caption" color="muted">Days logged</Text>
            </View>
            <View style={s.monthStat}>
              <Text variant="h2">
                {Object.values(dayMap)
                  .filter((_, i) => Object.keys(dayMap)[i]?.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`))
                  .reduce((sum, e) => sum + e.items.length + e.outfits.length, 0)}
              </Text>
              <Text variant="caption" color="muted">Outfits / items</Text>
            </View>
          </View>
        </Card>
      </View>
    </Screen>
  );
};

// ─── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  monthNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  dayHeaders: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    marginBottom: 4,
  },
  dayHeaderText: {
    flex: 1,
    textAlign: 'center',
  },
  calGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
  },
  dayCell: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 2,
  },
  outfitThumb: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: '#F0F0F0',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  itemThumb: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#F0F0F0',
  },
  monthStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  monthStat: {
    alignItems: 'center',
  },
});

export default OutfitCalendarScreen;
