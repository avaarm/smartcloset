/**
 * LookbookScreen — Professional lookbook composer for stylists.
 *
 * Create curated "looks" for a client, organized into chapters (Work / Weekend / Evening).
 * Each look references a wardrobe item's image with a custom title and styling note.
 * Looks render in a magazine-style layout in Preview mode.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Badge, Button, Card, Screen, Text } from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import { getClothingItems } from '../services/storage';
import { ClothingItem } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Look {
  id: string;
  chapter: string;
  title: string;
  itemId?: string;
  imageUri?: string;
  stylingNote: string;
}

interface Lookbook {
  id: string;
  title: string;
  clientName?: string;
  season: string;
  looks: Look[];
  createdAt: string;
}

const LOOKBOOKS_KEY = '@smartcloset_lookbooks';
const CHAPTERS = ['Work', 'Weekend', 'Evening', 'Travel', 'Special Occasion', 'Everyday'];
const SEASONS = ['Spring/Summer 2025', 'Fall/Winter 2025', 'Resort 2026', 'Spring/Summer 2026', 'Capsule'];

// ── Helpers ───────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 10);

// ── Component ─────────────────────────────────────────────────────────────────

const LookbookScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { theme } = useTheme();
  const clientName: string | undefined = route.params?.clientName;

  const [tab, setTab] = useState<'compose' | 'preview'>('compose');
  const [lookbook, setLookbook] = useState<Lookbook>({
    id: uid(),
    title: clientName ? `${clientName}'s Lookbook` : 'New Lookbook',
    clientName,
    season: SEASONS[0],
    looks: [],
    createdAt: new Date().toISOString(),
  });

  const [items, setItems] = useState<ClothingItem[]>([]);
  const [showItemPicker, setShowItemPicker] = useState(false);
  const [showLookForm, setShowLookForm] = useState(false);
  const [draftLook, setDraftLook] = useState<Partial<Look>>({ chapter: CHAPTERS[0], title: '', stylingNote: '' });
  const [pickerForLook, setPickerForLook] = useState(false);
  const [editingLookId, setEditingLookId] = useState<string | null>(null);
  const [titleEditing, setTitleEditing] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getClothingItems({ all: true })
      .then(all => setItems(all.filter(i => !i.isWishlist)))
      .catch(() => {});
  }, []);

  // ── Actions ─────────────────────────────────────────────────────────────────

  const openAddLook = () => {
    setDraftLook({ chapter: CHAPTERS[0], title: '', stylingNote: '' });
    setEditingLookId(null);
    setShowLookForm(true);
  };

  const openEditLook = (look: Look) => {
    setDraftLook({ ...look });
    setEditingLookId(look.id);
    setShowLookForm(true);
  };

  const saveLook = () => {
    if (!draftLook.title?.trim()) {
      Alert.alert('Title required', 'Please add a title for this look.');
      return;
    }
    if (editingLookId) {
      setLookbook(lb => ({
        ...lb,
        looks: lb.looks.map(l => l.id === editingLookId ? { ...l, ...draftLook } as Look : l),
      }));
    } else {
      const newLook: Look = {
        id: uid(),
        chapter: draftLook.chapter || CHAPTERS[0],
        title: draftLook.title || '',
        itemId: draftLook.itemId,
        imageUri: draftLook.imageUri,
        stylingNote: draftLook.stylingNote || '',
      };
      setLookbook(lb => ({ ...lb, looks: [...lb.looks, newLook] }));
    }
    setShowLookForm(false);
  };

  const deleteLook = (id: string) => {
    Alert.alert('Remove look', 'Remove this look from the lookbook?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () =>
        setLookbook(lb => ({ ...lb, looks: lb.looks.filter(l => l.id !== id) }))
      },
    ]);
  };

  const pickItem = (item: ClothingItem) => {
    const imageUri = item.userImage || item.retailerImage;
    setDraftLook(d => ({ ...d, itemId: item.id, imageUri, title: d.title || item.name }));
    setShowItemPicker(false);
  };

  const saveLookbook = async () => {
    try {
      const existing = await AsyncStorage.getItem(LOOKBOOKS_KEY);
      const all: Lookbook[] = existing ? JSON.parse(existing) : [];
      const idx = all.findIndex(lb => lb.id === lookbook.id);
      if (idx >= 0) all[idx] = lookbook; else all.unshift(lookbook);
      await AsyncStorage.setItem(LOOKBOOKS_KEY, JSON.stringify(all));
      setSaved(true);
      Alert.alert('Saved', 'Lookbook saved successfully.');
    } catch {
      Alert.alert('Error', 'Could not save lookbook.');
    }
  };

  // ── Grouped looks by chapter ─────────────────────────────────────────────

  const chapters = CHAPTERS.filter(c => lookbook.looks.some(l => l.chapter === c));
  const uncategorized = lookbook.looks.filter(l => !CHAPTERS.includes(l.chapter));

  // ── Item picker modal ────────────────────────────────────────────────────

  const ItemPickerModal = () => (
    <Modal visible={showItemPicker} animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.modalContainer, { backgroundColor: theme.colors.background }]}>
        <View style={[styles.modalHeader, { borderBottomColor: theme.colors.border }]}>
          <Pressable onPress={() => setShowItemPicker(false)} hitSlop={16}>
            <Icon name="close" size={24} color={theme.colors.text} />
          </Pressable>
          <Text variant="h3">Pick an item</Text>
          <View style={{ width: 24 }} />
        </View>
        <ScrollView contentContainerStyle={styles.pickerGrid}>
          {items.map(item => {
            const img = item.userImage || item.retailerImage;
            return (
              <Pressable
                key={item.id}
                onPress={() => pickItem(item)}
                style={({ pressed }) => [styles.pickerCell, { opacity: pressed ? 0.7 : 1 }]}
              >
                {img ? (
                  <Image source={{ uri: img }} style={styles.pickerThumb} />
                ) : (
                  <View style={[styles.pickerThumb, { backgroundColor: theme.colors.muted, alignItems: 'center', justifyContent: 'center' }]}>
                    <Icon name="shirt-outline" size={24} color={theme.colors.textSubtle} />
                  </View>
                )}
                <Text variant="caption" numberOfLines={1} style={{ marginTop: 4 }}>{item.name}</Text>
                {item.brand && <Text variant="caption" color="muted" numberOfLines={1}>{item.brand}</Text>}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );

  // ── Look form modal ──────────────────────────────────────────────────────

  const LookFormModal = () => (
    <Modal visible={showLookForm} animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.modalContainer, { backgroundColor: theme.colors.background }]}>
        <View style={[styles.modalHeader, { borderBottomColor: theme.colors.border }]}>
          <Pressable onPress={() => setShowLookForm(false)} hitSlop={16}>
            <Icon name="close" size={24} color={theme.colors.text} />
          </Pressable>
          <Text variant="h3">{editingLookId ? 'Edit look' : 'Add look'}</Text>
          <Pressable onPress={saveLook} hitSlop={16}>
            <Text variant="label" color="accent">Save</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          {/* Image picker */}
          <Pressable
            onPress={() => setShowItemPicker(true)}
            style={[styles.imagePicker, { borderColor: theme.colors.border, backgroundColor: theme.colors.muted }]}
          >
            {draftLook.imageUri ? (
              <Image source={{ uri: draftLook.imageUri }} style={styles.imagePickerPreview} resizeMode="cover" />
            ) : (
              <View style={{ alignItems: 'center', gap: 8 }}>
                <Icon name="image-outline" size={32} color={theme.colors.textSubtle} />
                <Text variant="caption" color="muted">Tap to pick from wardrobe</Text>
              </View>
            )}
          </Pressable>

          {/* Chapter */}
          <Text variant="label" style={{ marginTop: 20, marginBottom: 8 }}>Chapter</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {CHAPTERS.map(c => (
                <Pressable
                  key={c}
                  onPress={() => setDraftLook(d => ({ ...d, chapter: c }))}
                  style={[
                    styles.chipBtn,
                    {
                      backgroundColor: draftLook.chapter === c ? theme.colors.accent : theme.colors.muted,
                      borderColor: draftLook.chapter === c ? theme.colors.accent : theme.colors.border,
                    },
                  ]}
                >
                  <Text variant="caption" style={{ color: draftLook.chapter === c ? '#fff' : theme.colors.text }}>
                    {c}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          {/* Title */}
          <Text variant="label" style={{ marginBottom: 8 }}>Look title</Text>
          <TextInput
            value={draftLook.title}
            onChangeText={v => setDraftLook(d => ({ ...d, title: v }))}
            placeholder="e.g. Monday Power Look"
            placeholderTextColor={theme.colors.textSubtle}
            style={[styles.textField, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.background }]}
          />

          {/* Styling note */}
          <Text variant="label" style={{ marginTop: 16, marginBottom: 8 }}>Styling note</Text>
          <TextInput
            value={draftLook.stylingNote}
            onChangeText={v => setDraftLook(d => ({ ...d, stylingNote: v }))}
            placeholder="e.g. Pair with nude heels and minimal gold jewellery…"
            placeholderTextColor={theme.colors.textSubtle}
            multiline
            numberOfLines={4}
            style={[styles.textField, styles.textArea, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.background }]}
          />
        </ScrollView>
      </View>
    </Modal>
  );

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <Screen padded={false}>
      <ItemPickerModal />
      <LookFormModal />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={16}>
          <Icon name="arrow-back" size={24} color={theme.colors.text} />
        </Pressable>
        <Pressable onLongPress={() => setTitleEditing(true)} hitSlop={8}>
          {titleEditing ? (
            <TextInput
              value={lookbook.title}
              onChangeText={v => setLookbook(lb => ({ ...lb, title: v }))}
              onBlur={() => setTitleEditing(false)}
              autoFocus
              style={{ fontSize: 17, fontWeight: '600', color: theme.colors.text, minWidth: 180, textAlign: 'center' }}
            />
          ) : (
            <Text variant="h3">{lookbook.title}</Text>
          )}
        </Pressable>
        <Pressable onPress={saveLookbook} hitSlop={16}>
          <Icon name={saved ? 'checkmark-circle' : 'cloud-upload-outline'} size={22} color={theme.colors.accent} />
        </Pressable>
      </View>

      {/* Tab bar */}
      <View style={[styles.tabBar, { borderBottomColor: theme.colors.border }]}>
        {(['compose', 'preview'] as const).map(t => (
          <Pressable key={t} onPress={() => setTab(t)} style={styles.tabItem}>
            <Text
              variant="label"
              style={{
                color: tab === t ? theme.colors.accent : theme.colors.textSubtle,
                textTransform: 'capitalize',
              }}
            >
              {t === 'compose' ? 'Compose' : 'Preview'}
            </Text>
            {tab === t && <View style={[styles.tabUnderline, { backgroundColor: theme.colors.accent }]} />}
          </Pressable>
        ))}
      </View>

      {/* Season badge + client */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingTop: 12 }}>
        <Badge label={lookbook.season} tone="neutral" />
        {lookbook.clientName && <Badge label={lookbook.clientName} tone="accent" />}
        <Badge label={`${lookbook.looks.length} looks`} tone="neutral" />
      </View>

      {tab === 'compose' ? (
        // ── Compose tab ────────────────────────────────────────────────────
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          {lookbook.looks.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 48 }}>
              <Icon name="book-outline" size={48} color={theme.colors.textSubtle} />
              <Text variant="h3" style={{ marginTop: 16 }}>Start composing</Text>
              <Text variant="body" color="muted" align="center" style={{ marginTop: 8, maxWidth: 260 }}>
                Add looks from your client's wardrobe. Organize by chapter — Work, Weekend, Evening…
              </Text>
            </View>
          ) : (
            chapters.map(chapter => {
              const chapterLooks = lookbook.looks.filter(l => l.chapter === chapter);
              if (chapterLooks.length === 0) return null;
              return (
                <View key={chapter} style={{ marginBottom: 24 }}>
                  <Text variant="overline" color="muted" style={{ marginBottom: 10 }}>{chapter}</Text>
                  {chapterLooks.map(look => (
                    <Card key={look.id} padding={0} style={{ marginBottom: 10 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        {look.imageUri ? (
                          <Image source={{ uri: look.imageUri }} style={styles.composeThumb} />
                        ) : (
                          <View style={[styles.composeThumb, { backgroundColor: theme.colors.muted, alignItems: 'center', justifyContent: 'center' }]}>
                            <Icon name="shirt-outline" size={20} color={theme.colors.textSubtle} />
                          </View>
                        )}
                        <View style={{ flex: 1, padding: 12 }}>
                          <Text variant="label" numberOfLines={1}>{look.title}</Text>
                          {look.stylingNote ? (
                            <Text variant="caption" color="muted" numberOfLines={2} style={{ marginTop: 2 }}>{look.stylingNote}</Text>
                          ) : null}
                        </View>
                        <View style={{ flexDirection: 'row', gap: 4, paddingRight: 12 }}>
                          <Pressable onPress={() => openEditLook(look)} hitSlop={8}>
                            <Icon name="pencil-outline" size={18} color={theme.colors.accent} />
                          </Pressable>
                          <Pressable onPress={() => deleteLook(look.id)} hitSlop={8} style={{ marginLeft: 8 }}>
                            <Icon name="trash-outline" size={18} color={theme.colors.danger} />
                          </Pressable>
                        </View>
                      </View>
                    </Card>
                  ))}
                </View>
              );
            })
          )}

          <Button
            label="+ Add look"
            variant="primary"
            onPress={openAddLook}
            style={{ marginTop: 8 }}
          />
        </ScrollView>
      ) : (
        // ── Preview tab ─────────────────────────────────────────────────────
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Magazine header */}
          <View style={[styles.magazineHeader, { backgroundColor: theme.colors.accent }]}>
            <Text variant="overline" style={{ color: 'rgba(255,255,255,0.7)', letterSpacing: 4 }}>
              STYLED FOR
            </Text>
            <Text variant="h1" style={{ color: '#fff', fontSize: 28, marginTop: 4 }}>
              {lookbook.clientName || 'Your Client'}
            </Text>
            <Text variant="body" style={{ color: 'rgba(255,255,255,0.8)', marginTop: 4 }}>
              {lookbook.season}
            </Text>
          </View>

          {lookbook.looks.length === 0 ? (
            <View style={{ alignItems: 'center', padding: 40 }}>
              <Text variant="body" color="muted">Add looks in Compose to preview them here.</Text>
            </View>
          ) : (
            chapters.map(chapter => {
              const chapterLooks = lookbook.looks.filter(l => l.chapter === chapter);
              if (chapterLooks.length === 0) return null;
              return (
                <View key={chapter} style={{ marginTop: 32 }}>
                  <View style={[styles.chapterDivider, { borderBottomColor: theme.colors.border }]}>
                    <Text variant="overline" style={{ backgroundColor: theme.colors.background, paddingHorizontal: 12, color: theme.colors.textSubtle }}>
                      {chapter.toUpperCase()}
                    </Text>
                  </View>
                  {chapterLooks.map((look, i) => (
                    <View key={look.id} style={[
                      styles.magazineLook,
                      i % 2 === 1 && { flexDirection: 'row-reverse' },
                    ]}>
                      {look.imageUri ? (
                        <Image
                          source={{ uri: look.imageUri }}
                          style={styles.magazineImage}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={[styles.magazineImage, { backgroundColor: theme.colors.muted, alignItems: 'center', justifyContent: 'center' }]}>
                          <Icon name="shirt-outline" size={48} color={theme.colors.textSubtle} />
                        </View>
                      )}
                      <View style={styles.magazineText}>
                        <Text variant="h3" style={{ fontSize: 16 }}>{look.title}</Text>
                        {look.stylingNote ? (
                          <Text variant="body" color="muted" style={{ marginTop: 8, lineHeight: 20 }}>{look.stylingNote}</Text>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </View>
              );
            })
          )}
        </ScrollView>
      )}
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
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    position: 'relative',
  },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: '20%',
    right: '20%',
    height: 2,
    borderRadius: 1,
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  pickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 12,
    gap: 8,
  },
  pickerCell: {
    width: '30%',
  },
  pickerThumb: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: '#F5F5F4',
  },
  imagePicker: {
    height: 200,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  imagePickerPreview: {
    width: '100%',
    height: '100%',
  },
  chipBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  textField: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  composeThumb: {
    width: 72,
    height: 72,
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
  },
  magazineHeader: {
    padding: 32,
    paddingTop: 48,
    paddingBottom: 40,
  },
  chapterDivider: {
    borderBottomWidth: 1,
    alignItems: 'center',
    marginBottom: 16,
    marginHorizontal: 20,
  },
  magazineLook: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 12,
    overflow: 'hidden',
    minHeight: 160,
  },
  magazineImage: {
    width: '45%',
    aspectRatio: 3 / 4,
  },
  magazineText: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
  },
});

export default LookbookScreen;
