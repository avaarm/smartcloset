import React, { useState, useEffect } from 'react';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Image, Platform, ScrollView, ActivityIndicator, Alert, Switch, Pressable } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useCallback } from 'react';
import * as ImagePicker from 'react-native-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { saveClothingItem, updateClothingItem } from '../services/storage';
import { ClothingCategory, Season, Occasion } from '../types/clothing';
import type { MaterialComponent, MaterialTier } from '../types';
import {
  analyzeClothingImage,
  isConfidentPrediction,
  shouldAutofillPrediction,
  generateNameFromRecognition,
  pickBestPrice,
  formatPrice,
  RecognitionResult,
} from '../services/imageRecognition';
import { copyImageToPermanentStorage } from '../services/imageStorage';
import {
  searchByImage,
  refineLensResults,
  rankCatalogByAttributes,
  type LensResult,
} from '../services/lensSearchService';
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
import DateTimePicker from '@react-native-community/datetimepicker';

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
  const [name, setName] = useState(editItem?.name || '');
  const [category, setCategory] = useState<ClothingCategory>(editItem?.category || 'tops');
  const [brand, setBrand] = useState(editItem?.brand || '');
  const [imageUri, setImageUri] = useState(editItem?.userImage || editItem?.imageUrl || editItem?.retailerImage || '');
  const [color, setColor] = useState(editItem?.color || '');
  // Season state uses 'all' as a sentinel; at save time we expand it to the
  // full [spring, summer, fall, winter] array so existing filters keep working.
  const initialSeasonValue: Season | 'all' | null = (() => {
    const arr = editItem?.season;
    if (!arr || arr.length === 0) return null;
    // Item covers every season → show "All Seasons" in picker
    const hasAll = ['spring', 'summer', 'fall', 'winter'].every(s => arr.includes(s));
    if (hasAll) return 'all';
    return arr[0];
  })();
  const [season, setSeason] = useState<Season | 'all' | null>(initialSeasonValue);
  const [occasion, setOccasion] = useState<Occasion | null>(editItem?.occasion || null);
  const [cost, setCost] = useState(editItem?.cost?.toString() || '');
  const [retailCost, setRetailCost] = useState(editItem?.retailCost?.toString() || '');
  const [purchaseDate, setPurchaseDate] = useState<Date>(editItem?.purchaseDate ? new Date(editItem.purchaseDate) : new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [tags, setTags] = useState(editItem?.tags?.join(', ') || '');
  const [notes, setNotes] = useState(editItem?.notes || '');
  const [favorite, setFavorite] = useState(editItem?.favorite || false);
  const [retailer, setRetailer] = useState(editItem?.retailer || '');
  const [errors, setErrors] = useState<{[key: string]: string}>({});

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

  const onCategoryChange = useCallback((value: ClothingCategory) => {
    setCategory(value);
  }, []);

  const onSeasonChange = useCallback((value: Season | 'all' | null) => {
    setSeason(value);
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

  const takePhoto = async () => {
    ImagePicker.launchCamera({
      mediaType: 'photo',
      quality: 0.8,
      saveToPhotos: true,
    }, async (response) => {
      if (response.didCancel) {
        return;
      }
      if (response.assets && response.assets[0].uri) {
        const tempUri = response.assets[0].uri;
        try {
          const permanentUri = await copyImageToPermanentStorage(tempUri);
          setImageUri(permanentUri);
          analyzeImage(permanentUri);
        } catch (error) {
          console.error('Error saving image:', error);
          setImageUri(tempUri);
          analyzeImage(tempUri);
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
      if (response.assets && response.assets[0].uri) {
        const tempUri = response.assets[0].uri;
        try {
          const permanentUri = await copyImageToPermanentStorage(tempUri);
          setImageUri(permanentUri);
          analyzeImage(permanentUri);
        } catch (error) {
          console.error('Error saving image:', error);
          setImageUri(tempUri);
          analyzeImage(tempUri);
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
      if (match.category && !isEditing) {
        setCategory(match.category as ClothingCategory);
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
    [brand, color, cost, isEditing, name, notes, retailer, tags],
  );

  const dismissMatchSheet = useCallback(() => {
    setMatchSheetDismissed(true);
  }, []);

  const analyzeImage = async (uri: string) => {
    setAnalyzing(true);
    setMatchSheetDismissed(false);
    setPickedMatch(null);
    setKbMatches([]);
    setLensResults([]);
    try {
      // ── 1. Compute image fingerprint (cheap, local) ──
      let base64: string | null = null;
      try {
        base64 = await readImageAsBase64(uri);
        const imgHash = hashImageBase64(base64);
        setImageHash(imgHash);
      } catch (hashErr) {
        console.warn('[Analyze] fingerprint failed:', hashErr);
      }

      // ── 2. Run Vision AI ──
      const result = await analyzeClothingImage(uri);
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
        setMatchLoading(true);
        Promise.allSettled([
          lookupKnowledgeBase(fp, semFp),
          searchByImage(uri),
        ])
          .then(([kbRes, lensRes]) => {
            if (kbRes.status === 'fulfilled') setKbMatches(kbRes.value);
            if (lensRes.status === 'fulfilled' && !lensRes.value.notConfigured) {
              // Refine against detected attributes — drops shelf pages, dedupes
              // by (title+source), ranks by color/subtype/material/brand match.
              const attrs = {
                color: result.color,
                subtype: result.subtype,
                category: result.category,
                material: result.material,
                brand: result.brand,
              };
              const refined = refineLensResults(lensRes.value.results, attrs, 12);

              // If web results were all junk, fall back to the curated
              // catalog ranked by the same attributes — better to show a
              // visually plausible option than three Macy's shelf pages.
              const finalResults =
                refined.length > 0 ? refined : rankCatalogByAttributes(attrs, 8);

              setLensResults(finalResults);
            }
          })
          .finally(() => setMatchLoading(false));
      }

      // Auto-apply predictions using a looser threshold than
      // isConfidentPrediction — the goal is to always give the user a useful
      // starting point they can override. Only autofill fields the user hasn't
      // touched (so re-analyzing an edited item doesn't clobber their edits).
      if (result.category && shouldAutofillPrediction(result, 'category')) {
        setCategory(result.category);
      }

      if (result.brand && shouldAutofillPrediction(result, 'brand') && !brand.trim()) {
        setBrand(result.brand);
      }

      if (result.occasion && shouldAutofillPrediction(result, 'occasion') && !occasion) {
        setOccasion(result.occasion as Occasion);
      }

      // Color: ALWAYS auto-fill if detected (no confidence gate) — pixel-level
      // color analysis is reliable and the user can override.
      if (result.color && !color.trim()) {
        setColor(result.color.charAt(0).toUpperCase() + result.color.slice(1));
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

        // Sale → paid
        if (!cost && sales.length > 0) {
          const min = sales.reduce((m, p) => (p.amount < m.amount ? p : m));
          setCost(String(min.amount));
        }
        // Original → retail
        if (!retailCost && origs.length > 0) {
          const max = origs.reduce((m, p) => (p.amount > m.amount ? p : m));
          setRetailCost(String(max.amount));
        }
        // Plain-only case: if we have 2+ and no sale/original context, the
        // higher is almost always the MSRP and the lower is the sale price.
        if (sales.length === 0 && origs.length === 0 && plains.length >= 2) {
          const sorted = [...plains].sort((a, b) => a.amount - b.amount);
          if (!cost) setCost(String(sorted[0].amount));
          if (!retailCost) setRetailCost(String(sorted[sorted.length - 1].amount));
        } else if (sales.length === 0 && plains.length === 1 && !cost) {
          // Single plain price — put it in "paid"
          setCost(String(plains[0].amount));
        }
      }

      // Auto-generate a name from the recognized attributes if the user
      // hasn't entered one yet. e.g. "Burgundy Handbag", "Gucci Black Jacket".
      if (!name.trim()) {
        const generated = generateNameFromRecognition(result);
        if (generated) setName(generated);
      }

      // Accumulate new tags from material and GPT-4 style descriptors in one
      // setTags call to avoid the React batching race (both reads from same `tags`).
      {
        const current = tags.split(',').map((t: string) => t.trim()).filter(Boolean);
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

        if (toAdd.length > 0) {
          setTags(current.length > 0 ? `${tags}, ${toAdd.join(', ')}` : toAdd.join(', '));
        }
      }

      // Seed the materials[] composition from the detected primary material
      // if the user hasn't added any materials yet.
      if (result.material && materials.length === 0) {
        setMaterials([{ name: result.material.toLowerCase(), tier: 'primary' }]);
      }

      // Season auto-fill from GPT-4 analysis
      if (result.season && result.season.length > 0 && !season) {
        const ALL_SEASONS = ['spring', 'summer', 'fall', 'winter'];
        const coversAll = ALL_SEASONS.every(s => result.season!.includes(s));
        setSeason(coversAll ? 'all' : result.season[0] as Season);
      }
    } catch (error) {
      console.error('Error analyzing image:', error);
    } finally {
      setAnalyzing(false);
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
    
    if (cost && isNaN(parseFloat(cost))) {
      newErrors.cost = 'Cost must be a valid number';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) {
      Alert.alert('Validation Error', 'Please fill in all required fields correctly.');
      return;
    }

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
        isWishlist: isWishlist,
        dateAdded: isEditing ? editItem.dateAdded : new Date().toISOString(),
        cost: cost ? parseFloat(cost) : undefined,
        retailCost: retailCost ? parseFloat(retailCost) : undefined,
        purchaseDate: purchaseDate.toISOString(),
        tags: tags ? tags.split(',').map((tag: string) => tag.trim()).filter((tag: string) => tag) : [],
        notes: notes.trim(),
        favorite,
        retailer: retailer.trim(),
        wearCount: editItem?.wearCount || 0,
        lastWorn: editItem?.lastWorn,
        materials: cleanMaterials.length > 0 ? cleanMaterials : undefined,
      };
      
      if (season === 'all') {
        // "All Seasons" expands to every individual season so existing filters
        // (which check for specific seasons) still match this item.
        itemData.season = ['spring', 'summer', 'fall', 'winter'];
      } else if (season) {
        itemData.season = [season];
      }
      
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
    }
  };

  const onDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setPurchaseDate(selectedDate);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Icon name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isEditing ? 'Edit Item' : 'Add Item'}</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.sectionHeader}>Photo</Text>
        <TouchableOpacity style={styles.imageContainer} onPress={showImageOptions} disabled={analyzing}>
          {imageUri ? (
            <View style={{width: '100%', height: '100%'}}>
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
              <Icon name="camera-outline" size={40} color="#8B7FD9" />
              <Text style={styles.placeholderText}>Add Photo</Text>
              <Text style={styles.aiHintText}>AI will analyze your photo</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* AI detection banner — shows what Vision returned so you can tell if it worked */}
        {recognitionResult && !analyzing && (
          <View
            style={{
              backgroundColor: recognitionResult.isReal ? '#EEF2FF' : '#FEF3C7',
              borderRadius: 10,
              padding: 10,
              marginHorizontal: 16,
              marginTop: 8,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#4338CA' }}>
              {recognitionResult.isReal ? '🔍 AI Detected' : '⚠️ No AI result'}
            </Text>
            <Text style={{ fontSize: 12, color: '#4338CA', marginTop: 2 }}>
              {recognitionResult.isReal
                ? [
                    recognitionResult.category &&
                      `${recognitionResult.subtype || recognitionResult.category}`,
                    recognitionResult.color && `${recognitionResult.color}`,
                    recognitionResult.brand && `${recognitionResult.brand}`,
                    recognitionResult.material && `${recognitionResult.material}`,
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'no attributes matched'
                : 'Set GOOGLE_VISION_API_KEY in .env and rebuild.'}
            </Text>

            {/* Color swatches — tap to set as the item's color */}
            {recognitionResult.colors && recognitionResult.colors.length > 0 && (
              <View style={{ flexDirection: 'row', marginTop: 8, gap: 6, flexWrap: 'wrap' }}>
                {recognitionResult.colors.map((c, i) => {
                  const selected = color.toLowerCase() === c.name.toLowerCase();
                  return (
                    <Pressable
                      key={`${c.name}-${i}`}
                      onPress={() => setColor(c.name.charAt(0).toUpperCase() + c.name.slice(1))}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingVertical: 4,
                        paddingHorizontal: 8,
                        borderRadius: 12,
                        backgroundColor: selected ? '#4338CA' : '#FFFFFF',
                        borderWidth: 1,
                        borderColor: selected ? '#4338CA' : '#C7D2FE',
                      }}
                    >
                      {c.hex ? (
                        <View
                          style={{
                            width: 12,
                            height: 12,
                            borderRadius: 6,
                            backgroundColor: c.hex,
                            borderWidth: 1,
                            borderColor: '#00000020',
                            marginRight: 6,
                          }}
                        />
                      ) : null}
                      <Text
                        style={{
                          fontSize: 11,
                          color: selected ? '#FFFFFF' : '#4338CA',
                          fontWeight: '500',
                        }}
                      >
                        {c.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* Detected prices from OCR — each chip shows kind (Sale/Was/—) and taps to apply. */}
            {recognitionResult.prices && recognitionResult.prices.length > 0 && (
              <View style={{ marginTop: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                  <Text style={{ fontSize: 11, color: '#4338CA', fontWeight: '600' }}>
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
                        style={{
                          paddingVertical: 3,
                          paddingHorizontal: 8,
                          borderRadius: 10,
                          backgroundColor: isSelected ? textColor : bg,
                          borderWidth: 1,
                          borderColor: isSelected ? textColor : border,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        {p.kind !== 'plain' && (
                          <Text
                            style={{
                              fontSize: 9,
                              fontWeight: '700',
                              color: isSelected ? '#FFFFFF' : textColor,
                              textTransform: 'uppercase',
                              letterSpacing: 0.5,
                            }}
                          >
                            {p.kind === 'sale' ? 'Sale' : 'Was'}
                          </Text>
                        )}
                        <Text
                          style={{
                            fontSize: 11,
                            color: isSelected ? '#FFFFFF' : textColor,
                            fontWeight: '600',
                            textDecorationLine: p.kind === 'original' ? 'line-through' : 'none',
                          }}
                        >
                          {formatPrice(p)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        )}

        {/* Match picker — shows after Vision completes, until user picks or dismisses */}
        {recognitionResult && !analyzing && !matchSheetDismissed && (
          <MatchPickerSheet
            loading={matchLoading}
            kbMatches={kbMatches}
            lensResults={lensResults}
            detection={recognitionResult}
            onPick={applyMatch}
            onSkip={dismissMatchSheet}
          />
        )}

        {/* Similar-items price range — computed from lens match prices when OCR
            didn't already find a price. Gives the user a reasonable suggestion
            anchor instead of a blank cost field. */}
        {(() => {
          if (analyzing || recognitionResult?.prices?.length) return null;
          const amounts = lensResults
            .map(r => {
              if (!r.price) return NaN;
              const n = parseFloat(r.price.replace(/[^\d.]/g, ''));
              return n;
            })
            .filter(n => Number.isFinite(n) && n >= 5 && n <= 25000) as number[];
          if (amounts.length < 2) return null;
          amounts.sort((a, b) => a - b);
          const median = amounts[Math.floor(amounts.length / 2)];
          const min = amounts[0];
          const max = amounts[amounts.length - 1];
          return (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#F5F3FF',
                borderRadius: 10,
                padding: 10,
                marginHorizontal: 16,
                marginTop: 8,
                gap: 8,
              }}
            >
              <Icon name="pricetags-outline" size={16} color="#4338CA" />
              <Text style={{ fontSize: 12, color: '#4338CA', flex: 1 }}>
                Similar items sell for{' '}
                <Text style={{ fontWeight: '700' }}>${min}–${max}</Text>{' '}
                (median ${median})
              </Text>
              <Pressable
                onPress={() => setRetailCost(String(median))}
                style={{
                  paddingVertical: 4,
                  paddingHorizontal: 10,
                  backgroundColor: '#4338CA',
                  borderRadius: 8,
                }}
              >
                <Text style={{ fontSize: 11, color: '#FFFFFF', fontWeight: '600' }}>
                  Use as new
                </Text>
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
            <View
              style={{
                backgroundColor: '#EEF2FF',
                borderRadius: 10,
                padding: 10,
                marginHorizontal: 16,
                marginTop: 8,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <Icon name="people-outline" size={14} color="#4338CA" />
                <Text style={{ fontSize: 11, color: '#4338CA', fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                  Community average
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {avgPaid != null && (
                  <Pressable
                    onPress={() => !cost && setCost(String(avgPaid))}
                    disabled={!!cost}
                    style={{
                      flex: 1,
                      backgroundColor: cost ? '#F3F1FF' : '#FFFFFF',
                      borderWidth: 1,
                      borderColor: '#C7D2FE',
                      borderRadius: 8,
                      padding: 8,
                    }}
                  >
                    <Text style={{ fontSize: 10, color: '#6366F1', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Used
                    </Text>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#4338CA', marginTop: 2 }}>
                      ${avgPaid}
                    </Text>
                    {!cost && (
                      <Text style={{ fontSize: 10, color: '#6366F1', marginTop: 1 }}>Tap to use</Text>
                    )}
                  </Pressable>
                )}
                {avgRetail != null && (
                  <Pressable
                    onPress={() => !retailCost && setRetailCost(String(avgRetail))}
                    disabled={!!retailCost}
                    style={{
                      flex: 1,
                      backgroundColor: retailCost ? '#F3F1FF' : '#FFFFFF',
                      borderWidth: 1,
                      borderColor: '#C7D2FE',
                      borderRadius: 8,
                      padding: 8,
                    }}
                  >
                    <Text style={{ fontSize: 10, color: '#6366F1', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      New
                    </Text>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#4338CA', marginTop: 2 }}>
                      ${avgRetail}
                    </Text>
                    {!retailCost && (
                      <Text style={{ fontSize: 10, color: '#6366F1', marginTop: 1 }}>Tap to use</Text>
                    )}
                  </Pressable>
                )}
              </View>
            </View>
          );
        })()}

        {/* Picked-match confirmation pill */}
        {pickedMatch && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: '#ECFDF5',
              borderRadius: 10,
              padding: 10,
              marginHorizontal: 16,
              marginTop: 8,
            }}
          >
            <Icon name="checkmark-circle" size={16} color="#059669" />
            <Text style={{ marginLeft: 8, fontSize: 12, color: '#065F46', flex: 1 }}>
              Auto-filled from{' '}
              {pickedMatch.source === 'kb_match' ? 'community knowledge' : 'web match'}
              {pickedMatch.retailer ? ` (${pickedMatch.retailer})` : ''}
            </Text>
          </View>
        )}

        <Text style={styles.sectionHeader}>Details</Text>

        <TextInput
          style={styles.input}
          placeholder="Item Name"
          value={name}
          onChangeText={setName}
        />

        <Text style={[styles.sectionHeader, { marginTop: 8 }]}>Category</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={category}
            onValueChange={onCategoryChange}
            style={styles.picker}
            itemStyle={{ color: '#1A1A1A', fontSize: 16 }}
          >
            <Picker.Item label="Tops" value="tops" color="#1A1A1A" />
            <Picker.Item label="Bottoms" value="bottoms" color="#1A1A1A" />
            <Picker.Item label="Dresses" value="dresses" color="#1A1A1A" />
            <Picker.Item label="Outerwear" value="outerwear" color="#1A1A1A" />
            <Picker.Item label="Shoes" value="shoes" color="#1A1A1A" />
            <Picker.Item label="Accessories" value="accessories" color="#1A1A1A" />
          </Picker>
        </View>

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

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.inputSubLabel}>Used</Text>
            <TextInput
              style={styles.input}
              placeholder="$0"
              value={cost}
              onChangeText={setCost}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={{ flex: 1 }}>
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
        {errors.cost && <Text style={styles.errorText}>{errors.cost}</Text>}

        {/* Savings callout when both are filled */}
        {(() => {
          const paid = parseFloat(cost);
          const retail = parseFloat(retailCost);
          if (!Number.isFinite(paid) || !Number.isFinite(retail)) return null;
          if (paid <= 0 || retail <= 0 || paid >= retail) return null;
          const savings = retail - paid;
          const percent = Math.round((savings / retail) * 100);
          return (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#DCFCE7',
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 6,
                marginTop: 4,
                alignSelf: 'flex-start',
                gap: 6,
              }}
            >
              <Icon name="pricetag" size={12} color="#065F46" />
              <Text style={{ fontSize: 12, color: '#065F46', fontWeight: '600' }}>
                Saved ${savings.toFixed(savings % 1 === 0 ? 0 : 2)} ({percent}% off)
              </Text>
            </View>
          );
        })()}

        <Text style={[styles.sectionHeader, { marginTop: 8 }]}>Purchase Date</Text>
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

        <Text style={[styles.sectionHeader, { marginTop: 8 }]}>Season</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={season || undefined}
            onValueChange={onSeasonChange}
            style={styles.picker}
            itemStyle={{ color: '#1A1A1A', fontSize: 16 }}
          >
            <Picker.Item label="Select Season" value={null} color="#8B8B8B" />
            <Picker.Item label="All Seasons" value="all" color="#1A1A1A" />
            <Picker.Item label="Spring" value="spring" color="#1A1A1A" />
            <Picker.Item label="Summer" value="summer" color="#1A1A1A" />
            <Picker.Item label="Fall" value="fall" color="#1A1A1A" />
            <Picker.Item label="Winter" value="winter" color="#1A1A1A" />
          </Picker>
        </View>
        
        <Text style={[styles.sectionHeader, { marginTop: 8 }]}>Occasion</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={occasion || undefined}
            onValueChange={(value) => setOccasion(value)}
            style={styles.picker}
            itemStyle={{ color: '#1A1A1A', fontSize: 16 }}
          >
            <Picker.Item label="Select Occasion" value={null} color="#8B8B8B" />
            <Picker.Item label="Casual" value="casual" color="#1A1A1A" />
            <Picker.Item label="Formal" value="formal" color="#1A1A1A" />
            <Picker.Item label="Business" value="business" color="#1A1A1A" />
            <Picker.Item label="Sports" value="sports" color="#1A1A1A" />
            <Picker.Item label="Party" value="party" color="#1A1A1A" />
            <Picker.Item label="Everyday" value="everyday" color="#1A1A1A" />
          </Picker>
        </View>

        <TextInput
          style={styles.input}
          placeholder="Tags (comma separated, e.g., summer, casual, favorite)"
          value={tags}
          onChangeText={setTags}
        />

        <MaterialsEditor value={materials} onChange={setMaterials} />

        <Text style={[styles.sectionHeader, { marginTop: 8 }]}>Notes</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Add notes about this item..."
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />

        <View style={styles.favoriteContainer}>
          <View>
            <Text style={styles.favoriteLabel}>Mark as Favorite</Text>
            <Text style={styles.favoriteSubtext}>Add to your favorites collection</Text>
          </View>
          <Switch
            value={favorite}
            onValueChange={setFavorite}
            trackColor={{ false: '#D1D5DB', true: '#FFC0CB' }}
            thumbColor={favorite ? '#8B7FD9' : '#f4f3f4'}
          />
        </View>
        
        {recognitionResult && (
          <View style={styles.aiSuggestionContainer}>
            <Text style={styles.aiSuggestionTitle}>AI Suggestions</Text>
            {recognitionResult.category && (
              <Text style={styles.aiSuggestion}>
                Category: {recognitionResult.category} 
                ({Math.round((recognitionResult.confidence.category || 0) * 100)}% confidence)
              </Text>
            )}
            {recognitionResult.brand && (
              <Text style={styles.aiSuggestion}>
                Brand: {recognitionResult.brand} 
                ({Math.round((recognitionResult.confidence.brand || 0) * 100)}% confidence)
              </Text>
            )}
            {recognitionResult.occasion && (
              <Text style={styles.aiSuggestion}>
                Occasion: {recognitionResult.occasion}
                ({Math.round((recognitionResult.confidence.occasion || 0) * 100)}% confidence)
              </Text>
            )}
            {recognitionResult.color && (
              <Text style={styles.aiSuggestion}>
                Color: {recognitionResult.color}
                ({Math.round((recognitionResult.confidence.color || 0) * 100)}% confidence)
              </Text>
            )}
            {recognitionResult.material && (
              <Text style={styles.aiSuggestion}>
                Material: {recognitionResult.material}
                ({Math.round((recognitionResult.confidence.material || 0) * 100)}% confidence)
              </Text>
            )}
            {recognitionResult.pattern && recognitionResult.pattern !== 'solid' && (
              <Text style={styles.aiSuggestion}>
                Pattern: {recognitionResult.pattern}
                ({Math.round((recognitionResult.confidence.pattern || 0) * 100)}% confidence)
              </Text>
            )}
          </View>
        )}

        <TouchableOpacity 
          style={styles.saveButton}
          onPress={handleSave}
        >
          <Text style={styles.saveButtonText}>{isEditing ? 'Update Item' : 'Save Item'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
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
  sectionHeader: {
    fontSize: 13,
    color: '#8B8B8B',
    marginBottom: 12,
    marginLeft: 4,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  scrollContent: {
    padding: 16,
    paddingTop: 20,
  },
  scrollView: {
    flex: 1,
    width: '100%',
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#E8E6E3',
    borderRadius: 12,
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    height: Platform.OS === 'ios' ? 50 : 50,
    justifyContent: 'center',
  },
  picker: {
    height: Platform.OS === 'ios' ? 50 : 50,
    width: '100%',
    color: '#1A1A1A',
    fontSize: 16,
    fontWeight: '500',
  },
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  imageContainer: {
    width: '100%',
    height: 250,
    marginBottom: 24,
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
    borderColor: '#8B7FD9',
    borderStyle: 'dashed',
  },
  placeholderText: {
    marginTop: 12,
    fontSize: 15,
    color: '#8B7FD9',
    fontWeight: '500',
  },
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
    marginBottom: 16,
  },
  textArea: {
    height: 100,
    paddingTop: 12,
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
    marginBottom: 16,
    gap: 8,
  },
  dateButtonText: {
    fontSize: 17,
    color: '#1A1A1A',
  },
  favoriteContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    marginBottom: 16,
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
  errorText: {
    fontSize: 12,
    color: '#FF3B30',
    marginTop: -12,
    marginBottom: 12,
    marginLeft: 4,
  },
  saveButton: {
    backgroundColor: '#8B7FD9',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 24,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
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
  aiHintText: {
    fontSize: 12,
    color: '#8B7FD9',
    marginTop: 4,
  },
  aiSuggestionContainer: {
    backgroundColor: '#F0F8FF',
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#8B7FD9',
  },
  aiSuggestionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  aiSuggestion: {
    fontSize: 14,
    color: '#555',
    marginBottom: 4,
  },
});

export default AddClothingScreen;
