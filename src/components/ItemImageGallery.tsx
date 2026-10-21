/**
 * An item's photos as pages you swipe through (the hero of the details screen). With more than one photo
 * it shows page dots and an "n/N" counter; with one it is just the picture. Each page has its own
 * placeholder if its photo cannot be loaded, so one dead address never blanks the gallery. Tapping a photo
 * opens it full screen (ItemImageViewer).
 *
 * The layout stays with the caller: it gives the height, the gallery fills the width it is laid out in.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
  useWindowDimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import theme from '../styles/theme';
import ItemImageViewer from './ItemImageViewer';
import PhotoWithFallback from './PhotoWithFallback';

export type ItemImageGalleryProps = {
  /** The photos, cover first. */
  images: string[];
  height: number;
  /** Called when the page in view changes (by swiping, or when the full-screen viewer closes on another photo). */
  onIndexChange?: (index: number) => void;
  style?: StyleProp<ViewStyle>;
  /**
   * Room kept under the dots and the counter, for something laid over the bottom of the gallery
   * (the details screen's content sheet covers its lowest 24pt).
   */
  bottomInset?: number;
};

const clampIndex = (i: number, count: number) => Math.max(0, Math.min(i, Math.max(count - 1, 0)));

type PageProps = {
  uri: string;
  index: number;
  count: number;
  width: number | string;
  height: number | string;
  onOpen: (index: number) => void;
};

/** One photo, tappable, with a placeholder of its own if it fails. */
const GalleryPage: React.FC<PageProps> = ({ uri, index, count, width, height, onOpen }) => {
  const [failed, setFailed] = useState(false);
  return (
    <Pressable
      testID={`item-image-page-${index}`}
      style={{ width, height } as ViewStyle}
      onPress={() => onOpen(index)}
      // A photo that did not load has nothing to open.
      disabled={failed}
      accessible
      accessibilityRole={failed ? 'image' : 'imagebutton'}
      accessibilityLabel={`Photo ${index + 1} of ${count}`}
      accessibilityHint={failed ? 'This photo could not be loaded' : 'Opens the photo full screen'}
    >
      <PhotoWithFallback uri={uri} style={styles.fill} onFailedChange={setFailed} />
    </Pressable>
  );
};

const ItemImageGallery: React.FC<ItemImageGalleryProps> = ({
  images,
  height,
  onIndexChange,
  style,
  bottomInset = 12,
}) => {
  const count = images.length;
  const window = useWindowDimensions();
  // The width it is laid out in; the window's until it has been measured.
  const [measured, setMeasured] = useState(0);
  const pageWidth = measured > 0 ? measured : window.width;

  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const scrollRef = useRef<ScrollView>(null);
  // Which photo the viewer opened on stays put while it fades out; only `viewerOpen` goes back.
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerStart, setViewerStart] = useState(0);
  const viewerIndexRef = useRef(0);

  const current = clampIndex(index, count);

  const goTo = useCallback(
    (next: number, scroll: boolean) => {
      if (scroll) scrollRef.current?.scrollTo({ x: next * pageWidth, y: 0, animated: false });
      if (next === indexRef.current) return;
      indexRef.current = next;
      setIndex(next);
      onIndexChange?.(next);
    },
    [pageWidth, onIndexChange],
  );

  // Fewer photos than before (one was removed): stay on a page that exists.
  useEffect(() => {
    if (indexRef.current > count - 1 && count > 0) goTo(count - 1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  // The width changed (rotation): stay on the same photo.
  useEffect(() => {
    scrollRef.current?.scrollTo({ x: indexRef.current * pageWidth, y: 0, animated: false });
  }, [pageWidth]);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && w !== measured) setMeasured(w);
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!(pageWidth > 0)) return;
    goTo(clampIndex(Math.round(e.nativeEvent.contentOffset.x / pageWidth), count), false);
  };

  const openViewer = (i: number) => {
    viewerIndexRef.current = i;
    setViewerStart(i);
    setViewerOpen(true);
  };

  const closeViewer = () => {
    // Land on the photo the viewer ended on.
    const last = clampIndex(viewerIndexRef.current, count);
    setViewerOpen(false);
    goTo(last, true);
  };

  const rootStyle = [styles.root, { height }, style];

  if (count === 0) {
    return (
      <View testID="item-image-gallery" style={rootStyle} onLayout={onLayout}>
        <View style={[styles.fill, styles.empty]} accessible accessibilityLabel="No photo">
          <Icon name="shirt-outline" size={44} color="#C8BBA6" />
        </View>
      </View>
    );
  }

  return (
    <View testID="item-image-gallery" style={rootStyle} onLayout={onLayout}>
      {count === 1 ? (
        <GalleryPage uri={images[0]} index={0} count={1} width="100%" height="100%" onOpen={openViewer} />
      ) : (
        <ScrollView
          ref={scrollRef}
          testID="item-image-gallery-scroll"
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={onScroll}
          onMomentumScrollEnd={onScroll}
        >
          {images.map((uri, i) => (
            <GalleryPage
              key={`${i}:${uri}`}
              uri={uri}
              index={i}
              count={count}
              width={pageWidth}
              height={height}
              onOpen={openViewer}
            />
          ))}
        </ScrollView>
      )}

      {count > 1 ? (
        // The pages say "Photo i of N" to VoiceOver, so the dots and counter are for the eye only.
        <View
          pointerEvents="none"
          style={[styles.indicators, { bottom: bottomInset }]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <View testID="item-image-dots" style={styles.dots}>
            {images.map((uri, i) => (
              <View
                key={`${i}:${uri}`}
                testID={i === current ? 'item-image-dot-active' : 'item-image-dot'}
                style={[styles.dot, i === current && styles.dotActive]}
              />
            ))}
          </View>
          <View style={styles.counter}>
            <Text style={styles.counterText}>{`${current + 1}/${count}`}</Text>
          </View>
        </View>
      ) : null}

      <ItemImageViewer
        visible={viewerOpen}
        images={images}
        initialIndex={viewerStart}
        onClose={closeViewer}
        onIndexChange={i => {
          viewerIndexRef.current = i;
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: theme.colors.mutedBackground,
  },
  fill: {
    width: '100%',
    height: '100%',
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicators: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    // The counter sits at the right end of the row the dots are centred in.
    flexDirection: 'row',
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  dotActive: {
    backgroundColor: '#FFFFFF',
  },
  counter: {
    position: 'absolute',
    right: 16,
    paddingHorizontal: 10,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  counterText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default ItemImageGallery;
