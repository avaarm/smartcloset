/**
 * LensSearchScreen — "Google Lens for clothes".
 *
 * Pick a photo → call lensSearchService → render a grid of visually similar
 * items found online, prioritizing shopping sites. Tap a result to open the
 * source URL in the browser.
 *
 * Gracefully handles the no-API-key case with an inline setup hint.
 */

import React, { useState } from 'react';
import {
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Screen,
  Skeleton,
  Text,
} from '../ui';
import { useTheme } from '../styles/ThemeProvider';
import { pickImageFromLibrary } from '../platform/imagePicker';
import {
  searchByImage,
  type LensResult,
  type LensSearchResponse,
} from '../services/lensSearchService';

const LensSearchScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { theme } = useTheme();

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<LensSearchResponse | null>(null);

  const handlePick = async () => {
    const picked = await pickImageFromLibrary();
    if (!picked) return;
    setPhotoUri(picked.uri);
    setLoading(true);
    setResponse(null);
    try {
      const result = await searchByImage(picked.uri);
      setResponse(result);
    } catch (err: any) {
      setResponse({
        query: '',
        bestGuessLabels: [],
        results: [],
        error: err?.message ?? 'Unknown error',
      });
    } finally {
      setLoading(false);
    }
  };

  const openResult = (r: LensResult) => {
    Linking.openURL(r.url).catch(() => {});
  };

  const reset = () => {
    setPhotoUri(null);
    setResponse(null);
  };

  return (
    <Screen padded={false}>
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={16}>
          <Icon name="arrow-back" size={24} color={theme.colors.text} />
        </Pressable>
        <Text variant="h3">Search a look</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {/* Picker area */}
        <Pressable
          onPress={handlePick}
          style={[
            styles.picker,
            {
              backgroundColor: theme.colors.muted,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.xl,
            },
          ]}
        >
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.pickerImage} />
          ) : (
            <View style={{ alignItems: 'center' }}>
              <View
                style={[
                  styles.iconCircle,
                  { backgroundColor: theme.colors.surface, borderRadius: theme.radius.full },
                ]}
              >
                <Icon name="camera-outline" size={24} color={theme.colors.text} />
              </View>
              <Text variant="h4" style={{ marginTop: 12 }}>
                Pick a photo
              </Text>
              <Text variant="caption" color="muted" style={{ marginTop: 4 }}>
                From your library
              </Text>
            </View>
          )}
        </Pressable>

        {photoUri ? (
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <Button label="Change photo" variant="secondary" size="sm" onPress={handlePick} />
            <Button label="Clear" variant="ghost" size="sm" onPress={reset} />
          </View>
        ) : null}

        {/* Query hint */}
        {response && response.query ? (
          <View style={{ marginTop: 20 }}>
            <Text variant="label" color="muted">
              BEST GUESS
            </Text>
            <Text variant="h3" style={{ marginTop: 4 }}>
              {response.query}
            </Text>
            {response.bestGuessLabels.length > 1 ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {response.bestGuessLabels.slice(1).map(l => (
                  <Badge key={l} label={l} tone="neutral" />
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Loading skeletons */}
        {loading && (
          <View style={styles.grid}>
            {[0, 1, 2, 3].map(i => (
              <Skeleton
                key={i}
                width={'47%' as any}
                height={180}
                borderRadius={theme.radius.xl}
              />
            ))}
          </View>
        )}

        {/* Not configured state */}
        {!loading && response?.notConfigured && (
          <Card style={{ marginTop: 20 }}>
            <Badge label="Setup required" tone="warning" />
            <Text variant="h3" style={{ marginTop: 10 }}>
              Add a Google Vision API key
            </Text>
            <Text variant="body" color="muted" style={{ marginTop: 6, lineHeight: 20 }}>
              Lens search uses Google Cloud Vision to find visually similar
              items across the web. Add `GOOGLE_VISION_API_KEY` to your .env
              file and rebuild the app.
            </Text>
            <Button
              label="Open setup docs"
              variant="secondary"
              size="md"
              onPress={() =>
                Linking.openURL('https://console.cloud.google.com/apis/library/vision.googleapis.com').catch(() => {})
              }
              style={{ marginTop: 14 }}
            />
          </Card>
        )}

        {/* Error */}
        {!loading && response?.error && (
          <Card style={{ marginTop: 20 }}>
            <Badge label="Error" tone="danger" />
            <Text variant="h4" style={{ marginTop: 8 }}>
              Search failed
            </Text>
            <Text variant="caption" color="muted" style={{ marginTop: 4 }}>
              {response.error}
            </Text>
          </Card>
        )}

        {/* Empty state after completed search */}
        {!loading && response && !response.error && !response.notConfigured && response.results.length === 0 && photoUri && (
          <View style={{ marginTop: 30 }}>
            <EmptyState
              icon={<Icon name="search-outline" size={28} color={theme.colors.textSubtle} />}
              title="No matches found"
              body="Try a clearer photo, or a different angle of the item."
            />
          </View>
        )}

        {/* Results grid */}
        {!loading && response?.results && response.results.length > 0 && (
          <>
            <Text variant="overline" color="muted" style={{ marginTop: 24, marginBottom: 10 }}>
              {response.results.filter(r => r.isShopping).length} shopping results ·{' '}
              {response.results.length} total
            </Text>
            <View style={styles.grid}>
              {response.results.map(r => (
                <ResultCard key={r.id} result={r} onPress={() => openResult(r)} />
              ))}
            </View>
          </>
        )}

        {/* First-visit hint */}
        {!photoUri && !loading && !response && (
          <Card bordered style={{ marginTop: 24 }}>
            <Text variant="h4">How it works</Text>
            <Text variant="body" color="muted" style={{ marginTop: 6, lineHeight: 20 }}>
              Pick a photo of a clothing item — from a magazine, a screenshot,
              or someone you saw on the street. We’ll find visually similar
              items online with links to where to buy.
            </Text>
            <View style={{ marginTop: 12, flexDirection: 'row', gap: 6 }}>
              <Badge label="Photo library only" tone="neutral" />
              <Badge label="No camera access" tone="neutral" />
            </View>
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
};

const ResultCard: React.FC<{ result: LensResult; onPress: () => void }> = ({
  result,
  onPress,
}) => {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.resultCard,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.xl,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      {result.imageUrl ? (
        <Image source={{ uri: result.imageUrl }} style={styles.resultImage} resizeMode="cover" />
      ) : (
        <View
          style={[
            styles.resultImage,
            { backgroundColor: theme.colors.muted, alignItems: 'center', justifyContent: 'center' },
          ]}
        >
          <Icon name="image-outline" size={24} color={theme.colors.textSubtle} />
        </View>
      )}
      <View style={{ padding: 12 }}>
        {result.isShopping ? (
          <Badge label="Shop" tone="accent" style={{ marginBottom: 6 }} />
        ) : null}
        <Text variant="bodySmall" weight="600" numberOfLines={2}>
          {result.title}
        </Text>
        <Text variant="caption" color="muted" style={{ marginTop: 2 }} numberOfLines={1}>
          {result.source}
        </Text>
      </View>
    </Pressable>
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
  picker: {
    height: 220,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  pickerImage: {
    width: '100%',
    height: '100%',
  },
  iconCircle: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
  },
  resultCard: {
    width: '47%',
    borderWidth: 1,
    overflow: 'hidden',
  },
  resultImage: {
    width: '100%',
    height: 160,
  },
});

export default LensSearchScreen;
