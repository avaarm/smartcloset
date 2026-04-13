/**
 * RecommendationDetailsScreen — view a single styling recommendation.
 */

import React from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../styles/ThemeProvider';
import { Text, Badge, Card } from '../ui';

type Props = {
  navigation: any;
  route: {
    params: {
      recommendation: any;
    };
  };
};

const getStatusTone = (status: string) => {
  switch (status) {
    case 'draft': return 'neutral' as const;
    case 'sent': return 'info' as const;
    case 'viewed': return 'warning' as const;
    case 'implemented': return 'success' as const;
    default: return 'neutral' as const;
  }
};

const getCategoryIcon = (category: string) => {
  switch (category) {
    case 'outfit': return 'shirt-outline';
    case 'purchase': return 'cart-outline';
    case 'wardrobe-tip': return 'bulb-outline';
    case 'color-palette': return 'color-palette-outline';
    case 'style-guide': return 'book-outline';
    default: return 'document-outline';
  }
};

const RecommendationDetailsScreen = ({ navigation, route }: Props) => {
  const { theme } = useTheme();
  const rec = route.params.recommendation;
  const category = rec.category || 'style-guide';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Icon name="arrow-back" size={24} color={theme.colors.text} />
        </Pressable>
        <Text variant="h3" style={{ flex: 1, marginLeft: 12 }} numberOfLines={1}>
          {rec.title}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Status + Category */}
        <View style={styles.badges}>
          <Badge
            label={category.replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
            tone="accent"
            leftIcon={<Icon name={getCategoryIcon(category)} size={14} color={theme.colors.accentText} />}
          />
          <Badge
            label={rec.status.charAt(0).toUpperCase() + rec.status.slice(1)}
            tone={getStatusTone(rec.status)}
          />
        </View>

        {/* Client + Date */}
        <Card style={{ marginBottom: 16 }}>
          <View style={styles.metaRow}>
            <Icon name="person-outline" size={18} color={theme.colors.textSubtle} />
            <Text variant="body" style={{ marginLeft: 8 }}>
              {rec.clientName || 'Unknown Client'}
            </Text>
          </View>
          <View style={[styles.metaRow, { marginTop: 8 }]}>
            <Icon name="calendar-outline" size={18} color={theme.colors.textSubtle} />
            <Text variant="body" color="muted" style={{ marginLeft: 8 }}>
              {new Date(rec.createdAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </Text>
          </View>
          {rec.priority && (
            <View style={[styles.metaRow, { marginTop: 8 }]}>
              <Icon name="flag-outline" size={18} color={theme.colors.textSubtle} />
              <Text variant="body" color="muted" style={{ marginLeft: 8, textTransform: 'capitalize' }}>
                {rec.priority} priority
              </Text>
            </View>
          )}
        </Card>

        {/* Description */}
        <Text variant="overline" color="muted" style={styles.sectionLabel}>Description</Text>
        <Card style={{ marginBottom: 16 }}>
          <Text variant="body">{rec.description}</Text>
        </Card>

        {/* Suggested Items */}
        {rec.items && rec.items.length > 0 && (
          <>
            <Text variant="overline" color="muted" style={styles.sectionLabel}>
              Suggested Items
            </Text>
            {rec.items.map((item: any, idx: number) => (
              <Card key={idx} style={{ marginBottom: 12 }}>
                <View style={styles.itemRow}>
                  {item.imageUrl && (
                    <Image
                      source={{ uri: item.imageUrl }}
                      style={styles.itemImage}
                    />
                  )}
                  <View style={{ flex: 1, marginLeft: item.imageUrl ? 12 : 0 }}>
                    <Text variant="label">{item.name}</Text>
                    {item.brand && (
                      <Text variant="caption" color="muted">{item.brand}</Text>
                    )}
                    {item.price != null && (
                      <Text variant="label" style={{ marginTop: 4 }}>
                        ${typeof item.price === 'number' ? item.price.toFixed(0) : item.price}
                      </Text>
                    )}
                    {item.notes && (
                      <Text variant="caption" color="muted" style={{ marginTop: 4 }}>
                        {item.notes}
                      </Text>
                    )}
                  </View>
                </View>
              </Card>
            ))}
          </>
        )}

        {/* Suggested Purchases */}
        {rec.suggestedPurchases && rec.suggestedPurchases.length > 0 && (
          <>
            <Text variant="overline" color="muted" style={styles.sectionLabel}>
              Suggested Purchases
            </Text>
            {rec.suggestedPurchases.map((purchase: any, idx: number) => (
              <Card key={idx} style={{ marginBottom: 12 }}>
                <Text variant="label">{purchase.name}</Text>
                <Text variant="caption" color="muted">{purchase.description}</Text>
                {purchase.estimatedPrice && (
                  <Text variant="body" style={{ marginTop: 4 }}>
                    ~${purchase.estimatedPrice}
                  </Text>
                )}
                {purchase.priority && (
                  <Badge
                    label={purchase.priority}
                    tone={purchase.priority === 'high' ? 'danger' : purchase.priority === 'medium' ? 'warning' : 'neutral'}
                    style={{ marginTop: 8 }}
                  />
                )}
              </Card>
            ))}
          </>
        )}

        {/* Notes */}
        {rec.notes && (
          <>
            <Text variant="overline" color="muted" style={styles.sectionLabel}>Notes</Text>
            <Card style={{ marginBottom: 16 }}>
              <Text variant="body">{rec.notes}</Text>
            </Card>
          </>
        )}

        {/* Client Feedback */}
        {rec.clientFeedback && (rec.clientFeedback.rating || rec.clientFeedback.comment) && (
          <>
            <Text variant="overline" color="muted" style={styles.sectionLabel}>Client Feedback</Text>
            <Card style={{ marginBottom: 16 }}>
              {rec.clientFeedback.rating && (
                <View style={styles.metaRow}>
                  <Icon name="star" size={18} color="#F59E0B" />
                  <Text variant="body" style={{ marginLeft: 8 }}>
                    {rec.clientFeedback.rating.toFixed(1)} / 5
                  </Text>
                </View>
              )}
              {rec.clientFeedback.comment && (
                <Text variant="body" color="muted" style={{ marginTop: 8 }}>
                  "{rec.clientFeedback.comment}"
                </Text>
              )}
            </Card>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  content: {
    padding: 20,
  },
  badges: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  sectionLabel: {
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemImage: {
    width: 64,
    height: 64,
    borderRadius: 10,
    backgroundColor: '#F0F0F0',
  },
});

export default RecommendationDetailsScreen;
