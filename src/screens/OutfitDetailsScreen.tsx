import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Outfit } from '../services/outfitService';
import { WearTrackingService } from '../services/wearTrackingService';
import { OutfitHistory } from '../types';
import theme from '../styles/theme';

type RouteParams = {
  OutfitDetails: {
    outfit: Outfit;
    saved?: boolean;
  };
};

const OutfitDetailsScreen = () => {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RouteParams, 'OutfitDetails'>>();
  const { outfit, saved = false } = route.params;

  const [wearHistory, setWearHistory] = useState<OutfitHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWearModal, setShowWearModal] = useState(false);
  const [wearOccasion, setWearOccasion] = useState('');
  const [wearRating, setWearRating] = useState(0);
  const [wearNotes, setWearNotes] = useState('');

  useEffect(() => {
    loadWearHistory();
  }, []);

  const loadWearHistory = async () => {
    try {
      setLoading(true);
      const history = await WearTrackingService.getOutfitHistoryById(outfit.id);
      setWearHistory(history);
    } catch (error) {
      console.error('Error loading wear history:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsWorn = () => {
    setShowWearModal(true);
  };

  const confirmMarkAsWorn = async () => {
    try {
      await WearTrackingService.markOutfitWorn(
        outfit,
        wearOccasion || undefined,
        wearRating > 0 ? wearRating : undefined,
        wearNotes || undefined
      );

      setShowWearModal(false);
      setWearOccasion('');
      setWearRating(0);
      setWearNotes('');

      Alert.alert(
        'Success',
        'Outfit marked as worn! All items have been updated.',
        [{ text: 'OK', onPress: loadWearHistory }]
      );
    } catch (error) {
      console.error('Error marking outfit as worn:', error);
      Alert.alert('Error', 'Failed to mark outfit as worn. Please try again.');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const renderStars = (rating: number, onPress?: (rating: number) => void) => {
    return (
      <View style={styles.starsContainer}>
        {[1, 2, 3, 4, 5].map((star) => (
          <TouchableOpacity
            key={star}
            onPress={() => onPress && onPress(star)}
            disabled={!onPress}
          >
            <Icon
              name={star <= rating ? 'star' : 'star-outline'}
              size={24}
              color={star <= rating ? '#FFD700' : theme.colors.mediumGray}
              style={styles.star}
            />
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Icon name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Outfit Details</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.outfitCard}>
          <Text style={styles.outfitName}>{outfit.name}</Text>

          {outfit.occasion && (
            <View style={styles.tagsContainer}>
              <View style={styles.tag}>
                <Icon name="calendar-outline" size={14} color={theme.colors.mediumGray} />
                <Text style={styles.tagText}>{outfit.occasion}</Text>
              </View>
              {outfit.season?.map((season) => (
                <View key={season} style={styles.tag}>
                  <Text style={styles.tagText}>{season}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Icon name="shirt-outline" size={20} color={theme.colors.accent} />
              <Text style={styles.statValue}>{outfit.items.length}</Text>
              <Text style={styles.statLabel}>Items</Text>
            </View>
            <View style={styles.statItem}>
              <Icon name="calendar-outline" size={20} color={theme.colors.accent} />
              <Text style={styles.statValue}>{wearHistory.length}</Text>
              <Text style={styles.statLabel}>Times Worn</Text>
            </View>
            {wearHistory.length > 0 && (
              <View style={styles.statItem}>
                <Icon name="time-outline" size={20} color={theme.colors.accent} />
                <Text style={styles.statValue}>
                  {formatDate(wearHistory[0].dateWorn)}
                </Text>
                <Text style={styles.statLabel}>Last Worn</Text>
              </View>
            )}
          </View>

          <TouchableOpacity style={styles.wearButton} onPress={handleMarkAsWorn}>
            <Icon name="checkmark-circle-outline" size={20} color="#FFFFFF" />
            <Text style={styles.wearButtonText}>Mark as Worn Today</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Items in This Outfit</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.itemsContainer}
          >
            {outfit.items.map((item, index) => (
              <View key={item.id + index} style={styles.itemCard}>
                <Image
                  source={{
                    uri: item.retailerImage || item.userImage || 'https://via.placeholder.com/120x160',
                  }}
                  style={styles.itemImage}
                  resizeMode="cover"
                />
                <Text style={styles.itemName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.itemCategory}>{item.category}</Text>
              </View>
            ))}
          </ScrollView>
        </View>

        {wearHistory.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Wear History</Text>
            {wearHistory.map((entry) => (
              <View key={entry.id} style={styles.historyCard}>
                <View style={styles.historyHeader}>
                  <View style={styles.historyDate}>
                    <Icon name="calendar" size={16} color={theme.colors.accent} />
                    <Text style={styles.historyDateText}>{formatDate(entry.dateWorn)}</Text>
                  </View>
                  {entry.rating && renderStars(entry.rating)}
                </View>
                {entry.occasion && (
                  <View style={styles.historyRow}>
                    <Icon name="location-outline" size={14} color={theme.colors.mediumGray} />
                    <Text style={styles.historyOccasion}>{entry.occasion}</Text>
                  </View>
                )}
                {entry.notes && <Text style={styles.historyNotes}>{entry.notes}</Text>}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={showWearModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowWearModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Mark Outfit as Worn</Text>
              <TouchableOpacity onPress={() => setShowWearModal(false)}>
                <Icon name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.modalSection}>
                <Text style={styles.modalLabel}>Occasion (Optional)</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g., Work, Date Night, Casual"
                  value={wearOccasion}
                  onChangeText={setWearOccasion}
                  placeholderTextColor={theme.colors.mediumGray}
                />
              </View>

              <View style={styles.modalSection}>
                <Text style={styles.modalLabel}>Rating (Optional)</Text>
                {renderStars(wearRating, setWearRating)}
              </View>

              <View style={styles.modalSection}>
                <Text style={styles.modalLabel}>Notes (Optional)</Text>
                <TextInput
                  style={[styles.modalInput, styles.modalTextArea]}
                  placeholder="How did you feel? Any compliments?"
                  value={wearNotes}
                  onChangeText={setWearNotes}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  placeholderTextColor={theme.colors.mediumGray}
                />
              </View>

              <TouchableOpacity style={styles.modalButton} onPress={confirmMarkAsWorn}>
                <Text style={styles.modalButtonText}>Confirm</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.lightGray,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  outfitCard: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    marginBottom: 16,
  },
  outfitName: {
    fontSize: 24,
    fontWeight: '300',
    color: theme.colors.text,
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.mutedBackground,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.colors.lightGray,
  },
  tagText: {
    fontSize: 12,
    color: theme.colors.mediumGray,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginLeft: 4,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.colors.lightGray,
    marginBottom: 16,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginTop: 4,
  },
  statLabel: {
    fontSize: 11,
    color: theme.colors.mediumGray,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  wearButton: {
    backgroundColor: theme.colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 24,
    gap: 8,
  },
  wearButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  section: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 16,
  },
  itemsContainer: {
    paddingVertical: 8,
  },
  itemCard: {
    width: 120,
    marginRight: 12,
  },
  itemImage: {
    width: 120,
    height: 160,
    borderRadius: 12,
    backgroundColor: theme.colors.mutedBackground,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 8,
    color: theme.colors.text,
  },
  itemCategory: {
    fontSize: 11,
    color: theme.colors.mediumGray,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  historyCard: {
    backgroundColor: theme.colors.mutedBackground,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.lightGray,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  historyDate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  historyDateText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  historyOccasion: {
    fontSize: 13,
    color: theme.colors.mediumGray,
  },
  historyNotes: {
    fontSize: 13,
    color: theme.colors.text,
    marginTop: 8,
    lineHeight: 18,
  },
  starsContainer: {
    flexDirection: 'row',
  },
  star: {
    marginHorizontal: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.colors.text,
  },
  modalSection: {
    marginBottom: 24,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 8,
  },
  modalInput: {
    backgroundColor: theme.colors.mutedBackground,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: theme.colors.text,
    borderWidth: 1,
    borderColor: theme.colors.lightGray,
  },
  modalTextArea: {
    height: 100,
    paddingTop: 12,
  },
  modalButton: {
    backgroundColor: theme.colors.accent,
    paddingVertical: 16,
    borderRadius: 24,
    alignItems: 'center',
    marginTop: 8,
  },
  modalButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});

export default OutfitDetailsScreen;
