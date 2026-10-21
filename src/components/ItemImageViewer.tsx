/**
 * A full-screen look at an item's photos: black background, one photo per page, swipe between them,
 * a close button and (with more than one photo) an "n/N" counter. Photos are shown whole (`contain`),
 * unlike the cropped cover on the details screen. Each page has its own placeholder if its photo
 * cannot be loaded. There is no pinch zoom.
 */
import React, { useRef, useState } from 'react';
import {
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import PhotoWithFallback from './PhotoWithFallback';

type Props = {
  visible: boolean;
  images: string[];
  /** The photo to open on. */
  initialIndex?: number;
  onClose: () => void;
  /** Called as the page changes while swiping. */
  onIndexChange?: (index: number) => void;
};

const clampIndex = (i: number, count: number) => Math.max(0, Math.min(i, Math.max(count - 1, 0)));

/** The pages and the buttons. Mounted afresh each time the viewer opens, so it starts on the photo asked for. */
const ViewerContent: React.FC<Omit<Props, 'visible'>> = ({ images, initialIndex = 0, onClose, onIndexChange }) => {
  const { width, height } = useWindowDimensions();
  const count = images.length;
  const start = clampIndex(initialIndex, count);
  const [index, setIndex] = useState(start);
  const indexRef = useRef(start);
  const scrollRef = useRef<ScrollView>(null);

  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!(width > 0)) return;
    const next = clampIndex(Math.round(e.nativeEvent.contentOffset.x / width), count);
    if (next === indexRef.current) return;
    indexRef.current = next;
    setIndex(next);
    onIndexChange?.(next);
  };

  return (
    <View
      testID="item-image-viewer"
      style={styles.root}
      // Keeps VoiceOver inside the viewer instead of reading the screen behind it.
      accessibilityViewIsModal
    >
      <ScrollView
        ref={scrollRef}
        testID="item-image-viewer-scroll"
        horizontal
        pagingEnabled
        bounces={count > 1}
        scrollEnabled={count > 1}
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        contentOffset={{ x: start * width, y: 0 }}
        onLayout={() => scrollRef.current?.scrollTo({ x: indexRef.current * width, y: 0, animated: false })}
        onScroll={settle}
        onMomentumScrollEnd={settle}
      >
        {images.map((uri, i) => (
          <View
            key={`${i}:${uri}`}
            style={{ width, height }}
            accessible
            accessibilityRole="image"
            accessibilityLabel={`Photo ${i + 1} of ${count}`}
          >
            <PhotoWithFallback
              uri={uri}
              resizeMode="contain"
              style={{ width, height }}
              placeholderBackground="#000000"
              iconColor="#6B6B6B"
              iconSize={56}
            />
          </View>
        ))}
      </ScrollView>

      <SafeAreaView style={styles.topBar} pointerEvents="box-none">
        <View style={styles.topRow} pointerEvents="box-none">
          {count > 1 ? (
            <View style={styles.counter} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Text style={styles.counterText}>{`${index + 1}/${count}`}</Text>
            </View>
          ) : (
            <View />
          )}
          <TouchableOpacity
            testID="item-image-viewer-close"
            style={styles.closeButton}
            onPress={onClose}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            accessibilityRole="button"
            accessibilityLabel="Close photo viewer"
          >
            <Icon name="close" size={26} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
};

const ItemImageViewer: React.FC<Props> = ({ visible, ...content }) => (
  <Modal visible={visible} animationType="fade" onRequestClose={content.onClose} statusBarTranslucent>
    <ViewerContent {...content} />
  </Modal>
);

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  counter: {
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  counterText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default ItemImageViewer;
