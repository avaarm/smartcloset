import React, { useState, useEffect, useRef, useCallback } from 'react';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Image, Platform, ScrollView, ActivityIndicator, Alert, Switch, Pressable, Linking } from 'react-native';
import ChipSelect, { ChipMultiSelect } from '../components/ChipSelect';
import * as ImagePicker from 'react-native-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { saveClothingItem, updateClothingItem } from '../services/storage';
import { ClothingCategory, Occasion } from '../types/clothing';
import type { MaterialComponent, Season } from '../types';
import {
  analyzeClothingImage,
  shouldAutofillPrediction,
  generateNameFromRecognition,
  formatPrice,
  RecognitionResult,
} from '../services/imageRecognition';
import { copyImageToPermanentStorage } from '../services/imageStorage';
import {
  searchByImage,
  refineLensResults,
  type LensResult,
} from '../services/lensSearchService';
import { classifyAiError, friendlyAiMessage } from '../services/aiProxy';
import { getAuthUserId } from '../services/authUser';
import {
  buildFingerprint,
  hashImageBase64,
  semanticFingerprint,
} from '../services/imageFingerprint';
import {
  lookupKnowledgeBase,
  recordContribution,
  type KBMatch,
} from '../services/productContributions';
import MatchPickerSheet, { type PickedMatch } from './MatchPickerSheet';
import MaterialsEditor from '../components/MaterialsEditor';
import { readImageAsBase64 } from '../platform/fileSystem';
import { parseMoney } from '../utils/money';
import {
  CATEGORY_LABELS,
  CLOTHING_CATEGORIES,
  OCCASION_LABELS,
  OCCASIONS,
  SEASONS,
  SEASON_LABELS,
  categoryLabel,
  isAllSeasons,
  isClothingCategory,
  normalizeOccasion,
  normalizeSeasons,
  toggleSeasonChoice,
} from '../utils/clothingOptions';
import { MIN_SUGGESTION_CONFIDENCE, buildAiSuggestionRows } from '../utils/aiSuggestionSummary';
import DateTimePicker from '@react-native-community/datetimepicker';

// Vertical rhythm of the form: blocks sit SECTION apart, a label sits LABEL above
// its control, and controls stacked inside a block are FIELD apart. The side
// gutter is applied once, on the scroll content.
const SPACE = { label: 8, field: 12, section: 24 } as const;
const GUTTER = 16;

// MatchPickerSheet and MaterialsEditor bring their own outer margins. These
// offsets cancel them so both sit on the form's grid like everything else. They
// must equal the children's real margins: AddClothingScreen.test.tsx renders both
// and fails when either side changes.
const OWN_MARGIN = { sheetSide: 16, sheetTop: 8, materialsTop: 16 } as const;

const CATEGORY_OPTIONS = CLOTHING_CATEGORIES.map(value => ({ label: CATEGORY_LABELS[value], value }));
const SEASON_OPTIONS: { label: string; value: Season | 'all' }[] = [
  { label: 'All seasons', value: 'all' },
  ...SEASONS.map(value => ({ label: SEASON_LABELS[value], value })),
];
// "Any occasion" is the explicit way to say the item isn't for one occasion.
const OCCASION_OPTIONS: { label: string; value: Occasion | 'any' }[] = [
  { label: 'Any occasion', value: 'any' },
  ...OCCASIONS.map(value => ({ label: OCCASION_LABELS[value], value })),
];

/** A labelled block of the form; its children are spaced evenly. */
const FormSection = ({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) => (
  <View style={styles.section}>
    <Text style={[styles.sectionHeader, !!hint && styles.sectionHeaderWithHint]}>{title}</Text>
    {!!hint && <Text style={styles.sectionHint}>{hint}</Text>}
    <View style={styles.sectionBody}>{children}</View>
  </View>
);

type AddClothingScreenProps = {
  navigation: NativeStackNavigationProp<any, 'AddClothing'>;
  route: {
    params?: {
      editItem?: any;
      item?: any;
      isWishlist?: boolean;
    };
  };
};

const AddClothingScreen = ({ navigation, route }: AddClothingScreenProps) => {
  const editItem = route.params?.editItem || route.params?.item;
  const isWishlist = route.params?.isWishlist || editItem?.isWishlist || false;
  const isEditing = !!editItem;
  const [name, setName] = useState<string>(editItem?.name || '');
  const [category, setCategory] = useState<ClothingCategory>(editItem?.category || 'tops');
  const [brand, setBrand] = useState<string>(editItem?.brand || '');
  const [imageUri, setImageUri] = useState(editItem?.userImage || editItem?.imageUrl || editItem?.retailerImage || '');
  const [color, setColor] = useState<string>(editItem?.color || '');
  // Every season the item suits, exactly as saved: "All seasons" is just all
  // four listed, which is how existing season filters expect it, so an edit
  // round-trips without losing or inventing any.
  const [seasons, setSeasons] = useState<Season[]>(() => normalizeSeasons(editItem?.season));
  // null is "Any occasion": no single occasion, stored as no occasion at all.
  const [occasion, setOccasion] = useState<string | null>(editItem?.occasion || null);
  const [cost, setCost] = useState<string>(editItem?.cost?.toString() || '');
  const [retailCost, setRetailCost] = useState<string>(editItem?.retailCost?.toString() || '');
  const [purchaseDate, setPurchaseDate] = useState<Date>(editItem?.purchaseDate ? new Date(editItem.purchaseDate) : new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [tags, setTags] = useState<string>(editItem?.tags?.join(', ') || '');
  const [notes, setNotes] = useState<string>(editItem?.notes || '');
  const [favorite, setFavorite] = useState(editItem?.favorite || false);
  const [retailer, setRetailer] = useState<string>(editItem?.retailer || '');
  const [errors, setErrors] = useState<{[key: string]: string}>({});
  const [saving, setSaving] = useState(false);
  // True once the user has chosen a category themselves (or is editing an item
  // that already has one), so photo analysis never overrides it.
  const categoryTouched = useRef(isEditing);

  // Multi-tier material composition — feeds the fabric knowledge base.
  const [materials, setMaterials] = useState<MaterialComponent[]>(
    editItem?.materials || [],
  );
  
  // AI recognition states
  const [analyzing, setAnalyzing] = useState(false);
  const [recognitionResult, setRecognitionResult] = useState<RecognitionResult | null>(null);

  // Match-picker state — populated after Vision analysis
  const [matchLoading, setMatchLoading] = useState(false);
  const [kbMatches, setKbMatches] = useState<KBMatch[]>([]);
  const [lensResults, setLensResults] = useState<LensResult[]>([]);
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [semanticFp, setSemanticFp] = useState<string | null>(null);
  const [imageHash, setImageHash] = useState<string | null>(null);
  const [visionLabels, setVisionLabels] = useState<string[]>([]);
  const [pickedMatch, setPickedMatch] = useState<PickedMatch | null>(null);
  const [matchSheetDismissed, setMatchSheetDismissed] = useState(false);
  // Friendly reason the automatic match search failed (vs. simply finding nothing).
  const [matchError, setMatchError] = useState<string | null>(null);
  // Guests can't use AI features, so say so before they pick a photo.
  const [isGuestUser, setIsGuestUser] = useState(false);
  // Identifies the latest photo analysis; results of an older one are dropped.
  const analysisId = useRef(0);

  useEffect(() => {
    getAuthUserId().then(id => setIsGuestUser(!id));
    // Leaving the screen invalidates any analysis still running.
    return () => {
      analysisId.current += 1;
    };
  }, []);

  const onCategoryChange = useCallback((value: ClothingCategory) => {
    categoryTouched.current = true;
    setCategory(value);
  }, []);

  const onSeasonToggle = useCallback((value: Season | 'all') => {
    setSeasons(prev => toggleSeasonChoice(prev, value));
  }, []);

  const onOccasionChange = useCallback((value: Occasion | 'any' | null) => {
    setOccasion(value === null || value === 'any' ? null : value);
  }, []);

  const showImageOptions = () => {
    Alert.alert(
      'Add Photo',
      'Choose an option',
      [
        {
          text: 'Take Photo',
          onPress: () => takePhoto(),
        },
        {
          text: 'Choose from Library',
          onPress: () => pickImage(),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ],
      { cancelable: true }
    );
  };

  /** Tell the user why the camera/library didn't give us a photo. */
  const reportPickerError = (response: ImagePicker.ImagePickerResponse, source: 'camera' | 'library') => {
    if (!response.errorCode) return;
    const denied = response.errorCode === 'permission';
    const unavailable = response.errorCode === 'camera_unavailable';
    Alert.alert(
      denied
        ? source === 'camera' ? 'Camera access is off' : 'Photo access is off'
        : unavailable ? 'Camera not available' : "Couldn't get that photo",
      denied
        ? `Turn on ${source === 'camera' ? 'camera' : 'photo'} access for SmartCloset in Settings to add photos.`
        : unavailable
          ? 'This device has no camera. Choose a photo from your library instead.'
          : 'Something went wrong. Please try again.',
      denied
        ? [{ text: 'Not now', style: 'cancel' }, { text: 'Open Settings', onPress: () => Linking.openSettings() }]
        : [{ text: 'OK' }],
    );
  };

  const takePhoto = async () => {
    ImagePicker.launchCamera({
      mediaType: 'photo',
      quality: 0.8,
      // The photo is kept privately inside the app; don't also copy it into the Camera Roll.
      saveToPhotos: false,
    }, async (response) => {
      if (response.didCancel) {
        return;
      }
      reportPickerError(response, 'camera');
      if (response.assets && response.assets[0].uri) {
        const tempUri = response.assets[0].uri;
        try {
          const permanentUri = await copyImageToPermanentStorage(tempUri);
          setImageUri(permanentUri);
          analyzeImage(permanentUri);
        } catch (error) {
          console.error('Error saving image:', error);
          Alert.alert(
            "Couldn't add that photo",
            error instanceof Error ? error.message : 'Please try again.',
          );
        }
      }
    });
  };

  const pickImage = async () => {
    ImagePicker.launchImageLibrary({
      mediaType: 'photo',
      quality: 0.8,
    }, async (response) => {
      if (response.didCancel) {
        return;
      }
      reportPickerError(response, 'library');
      if (response.assets && response.assets[0].uri) {
        const tempUri = response.assets[0].uri;
        try {
          const permanentUri = await copyImageToPermanentStorage(tempUri);
          setImageUri(permanentUri);
          analyzeImage(permanentUri);
        } catch (error) {
          console.error('Error saving image:', error);
          Alert.alert(
            "Couldn't add that photo",
            error instanceof Error ? error.message : 'Please try again.',
          );
        }
      }
    });
  };
  
  /**
   * Apply a user-picked match (from KB or Lens) — auto-fills the form.
   * Only fills fields the user hasn't already edited.
   */
  const applyMatch = useCallback(
    (match: PickedMatch) => {
      setPickedMatch(match);
      setMatchSheetDismissed(true);

      if (!name.trim()) setName(match.name);
      // A category the user picked (or an item being edited) is theirs to keep.
      if (isClothingCategory(match.category) && !categoryTouched.current) {
        setCategory(match.category);
      }
      if (match.brand && !brand.trim()) setBrand(match.brand);
      if (match.retailer && !retailer.trim()) setRetailer(match.retailer);
      if (match.color && !color.trim()) {
        setColor(match.color.charAt(0).toUpperCase() + match.color.slice(1));
      }
      if (match.cost != null && !cost) setCost(String(Math.round(match.cost)));
      if ((match as any).retailCost != null && !retailCost) {
        setRetailCost(String(Math.round((match as any).retailCost)));
      }
      if (match.material) {
        const current = tags.split(',').map((t: string) => t.trim()).filter(Boolean);
        if (!current.some((t: string) => t.toLowerCase() === match.material!.toLowerCase())) {
          setTags(current.length > 0 ? `${tags}, ${match.material}` : match.material);
        }
      }
      if (match.sourceUrl) {
        const line = `Source: ${match.sourceUrl}`;
        setNotes(prev => (prev && !prev.includes(match.sourceUrl!) ? `${prev}\n${line}` : prev || line));
      }
    },
    [brand, color, cost, name, retailer, retailCost, tags],
  );

  const dismissMatchSheet = useCallback(() => {
    setMatchSheetDismissed(true);
  }, []);

  const analyzeImage = async (uri: string) => {
    // Analysis and the match search take seconds, and another photo can be
    // picked meanwhile. Everything this run sets goes through isCurrent() so a
    // late answer for the old photo never lands on the new one.
    const myId = ++analysisId.current;
    const isCurrent = () => analysisId.current === myId;

    setAnalyzing(true);
    setMatchSheetDismissed(false);
    setPickedMatch(null);
    setKbMatches([]);
    setLensResults([]);
    setMatchError(null);
    setMatchLoading(false);
    setRecognitionResult(null);
    setFingerprint(null);
    setSemanticFp(null);
    setImageHash(null);
    setVisionLabels([]);
    try {
      // ── 1. Compute image fingerprint (cheap, local) ──
      let base64: string | null = null;
      try {
        base64 = await readImageAsBase64(uri);
        if (!isCurrent()) return;
        const imgHash = hashImageBase64(base64);
        setImageHash(imgHash);
      } catch (hashErr) {
        console.warn('[Analyze] fingerprint failed:', hashErr);
      }

      // ── 2. Run Vision AI ──
      const result = await analyzeClothingImage(uri);
      if (!isCurrent()) return;
      setRecognitionResult(result);
      setVisionLabels(result.rawLabels || []);

      // ── 3. Build fingerprints ──
      //   content+labels fp = legacy exact-match
      //   semantic fp = crop/angle-tolerant (preferred for KB matching)
      if (base64) {
        const fp = buildFingerprint(base64, result);
        const semFp = semanticFingerprint(result);
        setFingerprint(fp);
        setSemanticFp(semFp);

        // ── 4. Kick off KB lookup + lens shopping search in parallel ──
        // Skipped when the analysis itself didn't work (guest, AI off, offline):
        // there are no detected attributes to match on, and the banner below
        // already explains why.
        if (result.isReal) {
          setMatchLoading(true);
          Promise.allSettled([
            lookupKnowledgeBase(fp, semFp),
            // The detected attributes steer the search toward the right kind of
            // item, so a boot photo isn't answered with dresses.
            searchByImage(uri, {
              brand: result.brand,
              color: result.color,
              subtype: result.subtype,
              category: result.category,
            }),
          ])
            .then(([kbRes, lensRes]) => {
              if (!isCurrent()) return;
              if (kbRes.status === 'fulfilled') setKbMatches(kbRes.value);
              if (lensRes.status === 'rejected') {
                console.warn('[Analyze] lens search failed:', lensRes.reason);
                setMatchError(friendlyAiMessage('other', 'search'));
              } else if (lensRes.value.error) {
                setMatchError(lensRes.value.error);
              } else if (!lensRes.value.notConfigured) {
                // Refine against detected attributes — drops shelf pages, dedupes
                // by (title+source), ranks by color/subtype/material/brand match.
                // Nothing left means "no matches": the sheet says so rather than
                // padding with anything that wasn't actually found.
                const attrs = {
                  color: result.color,
                  subtype: result.subtype,
                  category: result.category,
                  material: result.material,
                  brand: result.brand,
                };
                setLensResults(refineLensResults(lensRes.value.results, attrs, 12));
              }
            })
            .finally(() => {
              if (isCurrent()) setMatchLoading(false);
            });
        }
      }

      // Auto-apply predictions using a looser threshold than
      // isConfidentPrediction — the goal is to always give the user a useful
      // starting point they can override. Only autofill fields the user hasn't
      // touched (so re-analyzing an edited item doesn't clobber their edits).
      //
      // Analysis takes several seconds, during which the user may keep typing.
      // Every fill below therefore uses a functional update, so it checks the
      // field's value NOW rather than the stale value from when the photo was
      // picked (which would overwrite what they typed in the meantime).
      if (result.category && shouldAutofillPrediction(result, 'category') && !categoryTouched.current) {
        setCategory(result.category);
      }

      if (result.brand && shouldAutofillPrediction(result, 'brand')) {
        setBrand(prev => (prev.trim() ? prev : result.brand!));
      }

      // Only an occasion the form has a chip for; anything else stays "Any occasion".
      const detectedOccasion = normalizeOccasion(result.occasion);
      if (detectedOccasion && shouldAutofillPrediction(result, 'occasion')) {
        setOccasion(prev => prev ?? detectedOccasion);
      }

      // Color: a weak reading (pixels alone, no item found in the frame) is
      // wrong often enough that an empty field beats a confident-looking guess.
      // It must also clear the bar the AI Suggestions box uses, so the form never
      // holds a colour the box would not offer. The swatches under the photo stay
      // available for picking one by hand.
      const confidentColor =
        result.color &&
        shouldAutofillPrediction(result, 'color') &&
        (result.confidence.color ?? 0) >= MIN_SUGGESTION_CONFIDENCE
          ? result.color
          : undefined;
      if (confidentColor) {
        const detected = confidentColor.charAt(0).toUpperCase() + confidentColor.slice(1);
        setColor(prev => (prev.trim() ? prev : detected));
      }

      // Cost auto-fill — split by OCR-detected kind:
      //   sale   → "You paid"   (what actually changed hands)
      //   original → "Retail"   (MSRP / was)
      //   plain  → "You paid"   unless retail is still blank and we have 2+ plain
      //                          prices, in which case highest = retail, lowest = paid
      if (result.prices && result.prices.length > 0) {
        const sales = result.prices.filter(p => p.kind === 'sale');
        const origs = result.prices.filter(p => p.kind === 'original');
        const plains = result.prices.filter(p => p.kind === 'plain');

        const fillCost = (amount: number) => setCost(prev => (prev ? prev : String(amount)));
        const fillRetail = (amount: number) => setRetailCost(prev => (prev ? prev : String(amount)));

        // Sale → paid
        if (sales.length > 0) {
          fillCost(sales.reduce((m, p) => (p.amount < m.amount ? p : m)).amount);
        }
        // Original → retail
        if (origs.length > 0) {
          fillRetail(origs.reduce((m, p) => (p.amount > m.amount ? p : m)).amount);
        }
        // Plain-only case: if we have 2+ and no sale/original context, the
        // higher is almost always the MSRP and the lower is the sale price.
        if (sales.length === 0 && origs.length === 0 && plains.length >= 2) {
          const sorted = [...plains].sort((a, b) => a.amount - b.amount);
          fillCost(sorted[0].amount);
          fillRetail(sorted[sorted.length - 1].amount);
        } else if (sales.length === 0 && plains.length === 1) {
          // Single plain price — put it in "paid"
          fillCost(plains[0].amount);
        }
      }

      // Auto-generate a name from the recognized attributes if the user
      // hasn't entered one yet. e.g. "Burgundy Handbag", "Gucci Black Jacket".
      // The name leaves out a colour the field above did not accept.
      const generatedName = generateNameFromRecognition({ ...result, color: confidentColor });
      if (generatedName) setName(prev => (prev.trim() ? prev : generatedName));

      // Add detected material and style descriptors as tags, merged into whatever
      // the user has typed by then.
      setTags((prev: string) => {
        const current = prev.split(',').map((t: string) => t.trim()).filter(Boolean);
        const toAdd: string[] = [];

        if (result.material && shouldAutofillPrediction(result, 'material')) {
          const mat = result.material.toLowerCase();
          if (!current.some((t: string) => t.toLowerCase() === mat)) toAdd.push(mat);
        }

        if (result.style && result.style.length > 0) {
          result.style.slice(0, 3).forEach((s: string) => {
            const lc = s.toLowerCase();
            if (!current.some((t: string) => t.toLowerCase() === lc) && !toAdd.includes(lc)) {
              toAdd.push(lc);
            }
          });
        }

        return toAdd.length > 0 ? [...current, ...toAdd].join(', ') : prev;
      });

      // Seed the materials[] composition from the detected primary material
      // if the user hasn't added any materials yet.
      if (result.material) {
        setMaterials(prev =>
          prev.length === 0 ? [{ name: result.material!.toLowerCase(), tier: 'primary' }] : prev,
        );
      }

      // Season auto-fill from GPT-4 analysis: every season it named, unless the
      // user already picked some.
      if (result.season && result.season.length > 0) {
        const detected = normalizeSeasons(result.season);
        setSeasons(prev => (prev.length > 0 ? prev : detected));
      }
    } catch (error) {
      console.error('Error analyzing image:', error);
      if (isCurrent()) {
        setRecognitionResult({ confidence: {}, isReal: false, unavailableReason: classifyAiError(error) });
      }
    } finally {
      if (isCurrent()) setAnalyzing(false);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: {[key: string]: string} = {};
    
    if (!name.trim()) {
      newErrors.name = 'Item name is required';
    }
    
    if (!category) {
      newErrors.category = 'Category is required';
    }
    
    if (cost && isNaN(parseMoney(cost))) {
      newErrors.cost = 'Cost must be a valid number';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (saving) return;
    if (!validateForm()) {
      Alert.alert('Validation Error', 'Please fill in all required fields correctly.');
      return;
    }

    setSaving(true);
    try {
      // Normalize materials — strip empty entries and de-dupe at same tier
      const cleanMaterials = materials
        .filter(m => m.name && m.name.trim().length > 0)
        .map(m => ({
          name: m.name.trim().toLowerCase(),
          percentage:
            m.percentage != null && Number.isFinite(m.percentage) && m.percentage > 0
              ? Math.min(100, Math.round(m.percentage))
              : undefined,
          tier: m.tier || 'primary',
        }));

      const itemData: any = {
        id: isEditing ? editItem.id : '',
        name: name.trim(),
        category,
        brand: brand.trim(),
        userImage: imageUri,
        retailerImage: imageUri,
        color: color.trim(),
        occasion: occasion || undefined,
        // Always sent, even when empty, so clearing every season on an edit clears them.
        season: seasons,
        isWishlist: isWishlist,
        dateAdded: isEditing ? editItem.dateAdded : new Date().toISOString(),
        cost: cost ? parseMoney(cost) : undefined,
        retailCost: retailCost ? parseMoney(retailCost) : undefined,
        purchaseDate: purchaseDate.toISOString(),
        tags: tags ? tags.split(',').map((tag: string) => tag.trim()).filter((tag: string) => tag) : [],
        notes: notes.trim(),
        favorite,
        retailer: retailer.trim(),
        wearCount: editItem?.wearCount || 0,
        lastWorn: editItem?.lastWorn,
        materials: cleanMaterials.length > 0 ? cleanMaterials : undefined,
      };

      if (isEditing) {
        await updateClothingItem(itemData);
      } else {
        await saveClothingItem(itemData);
      }

      // ── Record a contribution to the knowledge base ──
      // Every save — whether from a lens match, KB match, or manual entry —
      // feeds the shared recognition KB. Non-blocking; silently ignored if
      // anything fails so save UX is never interrupted.
      if (!isEditing && fingerprint && imageHash) {
        // Primary material for back-compat lookup: explicit primary-tier entry,
        // else the first detected material in tags
        const primaryMat =
          cleanMaterials.find(m => m.tier === 'primary')?.name ||
          itemData.tags?.find((t: string) =>
            ['cotton', 'wool', 'leather', 'silk', 'linen', 'denim', 'cashmere', 'polyester'].includes(
              t.toLowerCase(),
            ),
          );

        recordContribution({
          fingerprint,
          semanticFp: semanticFp || undefined,
          imageHash,
          source: pickedMatch?.source ?? 'manual',
          name: itemData.name,
          category: itemData.category,
          brand: itemData.brand || undefined,
          retailer: itemData.retailer || undefined,
          color: itemData.color || undefined,
          material: primaryMat || undefined,
          materials: cleanMaterials.length > 0 ? cleanMaterials : undefined,
          cost: itemData.cost,
          retailCost: itemData.retailCost,
          sourceUrl: pickedMatch?.sourceUrl,
          visionLabels: visionLabels.slice(0, 10),
        }).catch(err => console.warn('[AddClothing] contribution failed:', err));
      }

      navigation.goBack();
    } catch (error) {
      console.error('Error saving item:', error);
      Alert.alert('Error', 'Failed to save item. Please try again.');
      setSaving(false);
    }
  };

  const onDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setPurchaseDate(selectedDate);
    }
  };

  const unavailableReason = recognitionResult?.unavailableReason ?? 'other';

  // What the photo analysis suggested, worded against what the form shows now.
  const aiRows = buildAiSuggestionRows(recognitionResult, {
    category,
    color,
    brand,
    occasion,
    material: materials.find(m => (m.tier || 'primary') === 'primary')?.name ?? '',
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Icon name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {isEditing ? 'Edit Item' : isWishlist ? 'Add to Wishlist' : 'Add Item'}
        </Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Photo</Text>
          <TouchableOpacity style={styles.imageContainer} onPress={showImageOptions} disabled={analyzing}>
            {imageUri ? (
              <View style={styles.fill}>
                <Image source={{ uri: imageUri }} style={styles.image} />
                {analyzing && (
                  <View style={styles.analyzeOverlay}>
                    <ActivityIndicator size="large" color="#FFFFFF" />
                    <Text style={styles.analyzeText}>Analyzing image...</Text>
                  </View>
                )}
              </View>
            ) : (
              <View style={styles.placeholder}>
                <Icon name="camera-outline" size={40} color="#C4975A" />
                <Text style={styles.placeholderText}>Add Photo</Text>
                <Text style={styles.aiHintText}>
                  {isGuestUser ? 'Sign in to let AI analyze your photo' : 'AI will analyze your photo'}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          {/* AI detection banner — shows what Vision returned so you can tell if it worked */}
          {recognitionResult && !analyzing && (
            <View
              style={[
                styles.callout,
                { backgroundColor: recognitionResult.isReal ? '#EEF2FF' : '#FEF3C7' },
              ]}
            >
              <Text style={styles.detectedTitle}>
                {recognitionResult.isReal
                  ? '🔍 AI Detected'
                  : unavailableReason === 'other'
                    ? '⚠️ No AI result'
                    : 'ℹ️ AI identification is off'}
              </Text>
              <Text style={styles.detectedText}>
                {recognitionResult.isReal
                  ? [
                      recognitionResult.subtype ||
                        (recognitionResult.category && categoryLabel(recognitionResult.category)),
                      recognitionResult.color && `${recognitionResult.color}`,
                      recognitionResult.brand && `${recognitionResult.brand}`,
                      recognitionResult.material && `${recognitionResult.material}`,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'no attributes matched'
                  : friendlyAiMessage(unavailableReason, 'analyze')}
              </Text>

              {/* Color swatches — tap to set as the item's color */}
              {recognitionResult.colors && recognitionResult.colors.length > 0 && (
                <View style={styles.swatchRow}>
                  {recognitionResult.colors.map((c, i) => {
                    const selected = color.toLowerCase() === c.name.toLowerCase();
                    return (
                      <Pressable
                        key={`${c.name}-${i}`}
                        onPress={() => setColor(c.name.charAt(0).toUpperCase() + c.name.slice(1))}
                        style={[styles.swatch, selected && styles.swatchSelected]}
                      >
                        {c.hex ? <View style={[styles.swatchDot, { backgroundColor: c.hex }]} /> : null}
                        <Text style={[styles.swatchText, selected && styles.swatchTextSelected]}>{c.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {/* Detected prices from OCR — each chip shows kind (Sale/Was/—) and taps to apply. */}
              {recognitionResult.prices && recognitionResult.prices.length > 0 && (
                <View style={styles.priceRow}>
                  <Text style={styles.priceRowLabel}>
                    Price{recognitionResult.prices.length > 1 ? 's' : ''} found:
                  </Text>
                  {recognitionResult.prices.slice(0, 4).map((p, i) => {
                    // Original prices fill the retail field; sale/plain fill the paid field
                    const targetsRetail = p.kind === 'original';
                    const isSelected = targetsRetail
                      ? retailCost === String(p.amount)
                      : cost === String(p.amount);
                    const bg = p.kind === 'sale'
                      ? '#DCFCE7'
                      : p.kind === 'original'
                      ? '#FEE2E2'
                      : '#FFFFFF';
                    const border = p.kind === 'sale'
                      ? '#86EFAC'
                      : p.kind === 'original'
                      ? '#FCA5A5'
                      : '#C7D2FE';
                    const textColor = p.kind === 'sale'
                      ? '#065F46'
                      : p.kind === 'original'
                      ? '#991B1B'
                      : '#4338CA';
                    return (
                      <Pressable
                        key={`${p.raw}-${i}`}
                        onPress={() =>
                          targetsRetail
                            ? setRetailCost(String(p.amount))
                            : setCost(String(p.amount))
                        }
                        style={[
                          styles.priceChip,
                          {
                            backgroundColor: isSelected ? textColor : bg,
                            borderColor: isSelected ? textColor : border,
                          },
                        ]}
                      >
                        {p.kind !== 'plain' && (
                          <Text style={[styles.priceKind, { color: isSelected ? '#FFFFFF' : textColor }]}>
                            {p.kind === 'sale' ? 'Sale' : 'Was'}
                          </Text>
                        )}
                        <Text
                          style={[
                            styles.priceAmount,
                            {
                              color: isSelected ? '#FFFFFF' : textColor,
                              textDecorationLine: p.kind === 'original' ? 'line-through' : 'none',
                            },
                          ]}
                        >
                          {formatPrice(p)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {/* Match picker — shows after Vision completes, until user picks or dismisses */}
          {recognitionResult?.isReal && !analyzing && !matchSheetDismissed && (
            <View style={styles.matchSheetWrap}>
              <MatchPickerSheet
                loading={matchLoading}
                kbMatches={kbMatches}
                lensResults={lensResults}
                searchError={matchError}
                onPick={applyMatch}
                onSkip={dismissMatchSheet}
              />
            </View>
          )}

          {/* Similar-items price range — computed from lens match prices when OCR
              didn't already find a price. Gives the user a reasonable suggestion
              anchor instead of a blank cost field. */}
          {(() => {
            if (analyzing || recognitionResult?.prices?.length) return null;
            const amounts = lensResults
              .map(r => {
                if (!r.price) return NaN;
                const n = parseMoney(r.price);
                return n;
              })
              .filter(n => Number.isFinite(n) && n >= 5 && n <= 25000) as number[];
            if (amounts.length < 2) return null;
            amounts.sort((a, b) => a - b);
            const median = amounts[Math.floor(amounts.length / 2)];
            const min = amounts[0];
            const max = amounts[amounts.length - 1];
            return (
              <View style={[styles.callout, styles.calloutRow, { backgroundColor: '#F5F3FF' }]}>
                <Icon name="pricetags-outline" size={16} color="#4338CA" />
                <Text style={styles.rangeText}>
                  Similar items sell for{' '}
                  <Text style={styles.rangeStrong}>${min}–${max}</Text>{' '}
                  (median ${median})
                </Text>
                <Pressable onPress={() => setRetailCost(String(median))} style={styles.useButton}>
                  <Text style={styles.useButtonText}>Use as new</Text>
                </Pressable>
              </View>
            );
          })()}

          {/* KB cost suggestions — paid and retail averages from community contributions. */}
          {(() => {
            if (analyzing) return null;
            const paidCosts = kbMatches
              .map(m => m.cost)
              .filter((n): n is number => typeof n === 'number' && n > 0);
            const retailCosts = kbMatches
              .map(m => (m as any).retailCost)
              .filter((n): n is number => typeof n === 'number' && n > 0);
            if (paidCosts.length === 0 && retailCosts.length === 0) return null;

            const avgPaid =
              paidCosts.length > 0
                ? Math.round(paidCosts.reduce((a, b) => a + b, 0) / paidCosts.length)
                : null;
            const avgRetail =
              retailCosts.length > 0
                ? Math.round(retailCosts.reduce((a, b) => a + b, 0) / retailCosts.length)
                : null;

            return (
              <View style={[styles.callout, { backgroundColor: '#EEF2FF' }]}>
                <View style={styles.communityHeader}>
                  <Icon name="people-outline" size={14} color="#4338CA" />
                  <Text style={styles.communityTitle}>Community average</Text>
                </View>
                <View style={styles.communityRow}>
                  {avgPaid != null && (
                    <Pressable
                      onPress={() => !cost && setCost(String(avgPaid))}
                      disabled={!!cost}
                      style={[styles.communityCell, cost ? styles.communityCellUsed : null]}
                    >
                      <Text style={styles.communityCaption}>Used</Text>
                      <Text style={styles.communityAmount}>${avgPaid}</Text>
                      {!cost && <Text style={styles.communityTap}>Tap to use</Text>}
                    </Pressable>
                  )}
                  {avgRetail != null && (
                    <Pressable
                      onPress={() => !retailCost && setRetailCost(String(avgRetail))}
                      disabled={!!retailCost}
                      style={[styles.communityCell, retailCost ? styles.communityCellUsed : null]}
                    >
                      <Text style={styles.communityCaption}>New</Text>
                      <Text style={styles.communityAmount}>${avgRetail}</Text>
                      {!retailCost && <Text style={styles.communityTap}>Tap to use</Text>}
                    </Pressable>
                  )}
                </View>
              </View>
            );
          })()}

          {/* Picked-match confirmation pill */}
          {pickedMatch && (
            <View style={[styles.callout, styles.calloutRow, { backgroundColor: '#ECFDF5' }]}>
              <Icon name="checkmark-circle" size={16} color="#059669" />
              <Text style={styles.pickedText}>
                Auto-filled from{' '}
                {pickedMatch.source === 'kb_match' ? 'community knowledge' : 'web match'}
                {pickedMatch.retailer ? ` (${pickedMatch.retailer})` : ''}
              </Text>
            </View>
          )}
        </View>

        <FormSection title="Details">
          <TextInput
            style={styles.input}
            placeholder="Item Name"
            value={name}
            onChangeText={setName}
          />
          <TextInput
            style={styles.input}
            placeholder="Brand"
            value={brand}
            onChangeText={setBrand}
          />
          <TextInput
            style={styles.input}
            placeholder="Retailer/Store"
            value={retailer}
            onChangeText={setRetailer}
          />
          <TextInput
            style={styles.input}
            placeholder="Color"
            value={color}
            onChangeText={setColor}
          />
        </FormSection>

        {/* An item has exactly one category, so there is no "All" here; "All" belongs to the filters. */}
        <FormSection title="Category">
          <ChipSelect<ClothingCategory>
            accessibilityLabel="Category"
            value={category}
            onChange={v => v && onCategoryChange(v)}
            options={CATEGORY_OPTIONS}
          />
        </FormSection>

        <FormSection title="Price">
          <View style={styles.priceFields}>
            <View style={styles.priceField}>
              <Text style={styles.inputSubLabel}>Used</Text>
              <TextInput
                style={styles.input}
                placeholder="$0"
                value={cost}
                onChangeText={setCost}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.priceField}>
              <Text style={styles.inputSubLabel}>New</Text>
              <TextInput
                style={styles.input}
                placeholder="$0"
                value={retailCost}
                onChangeText={setRetailCost}
                keyboardType="decimal-pad"
              />
            </View>
          </View>
          {!!errors.cost && <Text style={styles.errorText}>{errors.cost}</Text>}

          {/* Savings callout when both are filled */}
          {(() => {
            const paid = parseMoney(cost);
            const retail = parseMoney(retailCost);
            if (!Number.isFinite(paid) || !Number.isFinite(retail)) return null;
            if (paid <= 0 || retail <= 0 || paid >= retail) return null;
            const savings = retail - paid;
            const percent = Math.round((savings / retail) * 100);
            return (
              <View style={styles.savings}>
                <Icon name="pricetag" size={12} color="#065F46" />
                <Text style={styles.savingsText}>
                  Saved ${savings.toFixed(savings % 1 === 0 ? 0 : 2)} ({percent}% off)
                </Text>
              </View>
            );
          })()}
        </FormSection>

        <FormSection title="Purchase Date">
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => setShowDatePicker(true)}
          >
            <Icon name="calendar-outline" size={20} color="#666" />
            <Text style={styles.dateButtonText}>
              {purchaseDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </Text>
          </TouchableOpacity>
          {showDatePicker && (
            <DateTimePicker
              value={purchaseDate}
              mode="date"
              display="default"
              onChange={onDateChange}
              maximumDate={new Date()}
            />
          )}
        </FormSection>

        <FormSection title="Season" hint="Pick every season it suits.">
          <ChipMultiSelect<Season | 'all'>
            accessibilityLabel="Season"
            options={SEASON_OPTIONS}
            selected={isAllSeasons(seasons) ? ['all'] : seasons}
            onToggle={onSeasonToggle}
          />
        </FormSection>

        <FormSection title="Occasion" hint="Any occasion means it isn't just for one.">
          <ChipSelect<Occasion | 'any'>
            accessibilityLabel="Occasion"
            value={occasion === null ? 'any' : (occasion as Occasion)}
            onChange={onOccasionChange}
            options={OCCASION_OPTIONS}
          />
        </FormSection>

        <FormSection title="Tags">
          <TextInput
            style={styles.input}
            placeholder="Tags (comma separated, e.g., summer, casual, favorite)"
            value={tags}
            onChangeText={setTags}
          />
        </FormSection>

        <View style={styles.materialsWrap}>
          <MaterialsEditor value={materials} onChange={setMaterials} />
        </View>

        <FormSection title="Notes">
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Add notes about this item..."
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </FormSection>

        <View style={[styles.favoriteContainer, styles.section]}>
          <View style={styles.favoriteText}>
            <Text style={styles.favoriteLabel}>Mark as Favorite</Text>
            <Text style={styles.favoriteSubtext}>Add to your favorites collection</Text>
          </View>
          <Switch
            value={favorite}
            onValueChange={setFavorite}
            trackColor={{ false: '#D1D5DB', true: '#FFC0CB' }}
            thumbColor={favorite ? '#C4975A' : '#f4f3f4'}
          />
        </View>

        {aiRows.length > 0 && (
          <View style={[styles.aiSuggestionContainer, styles.section]}>
            <Text style={styles.aiSuggestionTitle}>AI Suggestions</Text>
            <Text style={styles.aiSuggestionNote}>From your photo. Check them before you save.</Text>
            {aiRows.map(row => (
              <Text key={row.key} style={styles.aiSuggestion}>{`${row.label}: ${row.text}`}</Text>
            ))}
          </View>
        )}

        <TouchableOpacity
          style={[styles.saveButton, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.saveButtonText}>
              {isEditing ? 'Update Item' : isWishlist ? 'Save to Wishlist' : 'Save Item'}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: GUTTER,
    paddingVertical: 12,
    backgroundColor: '#F5F3F0',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    color: '#000',
    letterSpacing: 0.3,
  },
  headerSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    paddingHorizontal: GUTTER,
    paddingTop: GUTTER,
    paddingBottom: 32,
  },
  fill: {
    width: '100%',
    height: '100%',
  },

  // ── Blocks ──
  section: {
    marginBottom: SPACE.section,
  },
  sectionHeader: {
    fontSize: 13,
    color: '#8B8B8B',
    marginBottom: SPACE.label,
    marginLeft: 4,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionHeaderWithHint: {
    marginBottom: 2,
  },
  sectionHint: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: SPACE.label,
    marginLeft: 4,
  },
  sectionBody: {
    gap: SPACE.field,
  },
  materialsWrap: {
    marginTop: -OWN_MARGIN.materialsTop,
    marginBottom: SPACE.section,
  },

  // ── Photo ──
  imageContainer: {
    width: '100%',
    height: 250,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#f2f2f7',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f2f2f7',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C4975A',
    borderStyle: 'dashed',
  },
  placeholderText: {
    marginTop: 12,
    fontSize: 15,
    color: '#C4975A',
    fontWeight: '500',
  },
  aiHintText: {
    fontSize: 12,
    color: '#C4975A',
    marginTop: 4,
  },
  analyzeOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  analyzeText: {
    color: '#FFFFFF',
    marginTop: 10,
    fontSize: 16,
    fontWeight: '500',
  },

  // ── Callouts under the photo ──
  callout: {
    borderRadius: 10,
    padding: 12,
    marginTop: SPACE.field,
  },
  calloutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  matchSheetWrap: {
    marginHorizontal: -OWN_MARGIN.sheetSide,
    marginTop: SPACE.field - OWN_MARGIN.sheetTop,
  },
  detectedTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4338CA',
  },
  detectedText: {
    fontSize: 12,
    color: '#4338CA',
    marginTop: 2,
  },
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  swatch: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  swatchSelected: {
    backgroundColor: '#4338CA',
    borderColor: '#4338CA',
  },
  swatchDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#00000020',
    marginRight: 6,
  },
  swatchText: {
    fontSize: 11,
    color: '#4338CA',
    fontWeight: '500',
  },
  swatchTextSelected: {
    color: '#FFFFFF',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  priceRowLabel: {
    fontSize: 11,
    color: '#4338CA',
    fontWeight: '600',
  },
  priceChip: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  priceKind: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  priceAmount: {
    fontSize: 11,
    fontWeight: '600',
  },
  rangeText: {
    flex: 1,
    fontSize: 12,
    color: '#4338CA',
  },
  rangeStrong: {
    fontWeight: '700',
  },
  useButton: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    backgroundColor: '#4338CA',
    borderRadius: 8,
  },
  useButtonText: {
    fontSize: 11,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  communityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  communityTitle: {
    fontSize: 11,
    color: '#4338CA',
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  communityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  communityCell: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: 8,
    padding: 8,
  },
  communityCellUsed: {
    backgroundColor: '#F3F1FF',
  },
  communityCaption: {
    fontSize: 10,
    color: '#6366F1',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  communityAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4338CA',
    marginTop: 2,
  },
  communityTap: {
    fontSize: 10,
    color: '#6366F1',
    marginTop: 1,
  },
  pickedText: {
    flex: 1,
    fontSize: 12,
    color: '#065F46',
  },

  // ── Inputs ──
  inputSubLabel: {
    fontSize: 11,
    color: '#8B8B8B',
    marginBottom: 4,
    marginLeft: 4,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: '#C5C5C7',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 17,
    backgroundColor: '#ffffff',
  },
  textArea: {
    height: 100,
    paddingTop: 12,
  },
  priceFields: {
    flexDirection: 'row',
    gap: SPACE.field,
  },
  priceField: {
    flex: 1,
  },
  errorText: {
    fontSize: 12,
    color: '#FF3B30',
    marginLeft: 4,
  },
  savings: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: '#DCFCE7',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  savingsText: {
    fontSize: 12,
    color: '#065F46',
    fontWeight: '600',
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderWidth: 1,
    borderColor: '#C5C5C7',
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
    gap: 8,
  },
  dateButtonText: {
    fontSize: 17,
    color: '#1A1A1A',
  },

  // ── Favorite, AI box, save ──
  favoriteContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACE.field,
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
  },
  favoriteText: {
    flex: 1,
  },
  favoriteLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  favoriteSubtext: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  aiSuggestionContainer: {
    backgroundColor: '#F0F8FF',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#C4975A',
  },
  aiSuggestionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  aiSuggestionNote: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
    marginBottom: SPACE.label,
  },
  aiSuggestion: {
    fontSize: 14,
    color: '#555',
    marginBottom: 4,
  },
  saveButton: {
    backgroundColor: '#C4975A',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
});

export default AddClothingScreen;
