/**
 * ItemImageGallery: an item's photos as swipeable pages. One photo is just the picture; several get page
 * dots and an "n/N" counter. Every page has its own placeholder, and tapping a photo opens the full-screen viewer.
 */
import 'react-native';
import React from 'react';
import { Dimensions, Image, Modal, Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import ItemImageGallery from '../../src/components/ItemImageGallery';

const A = 'https://example.com/a.jpg';
const B = 'file:///var/mobile/b.jpg';
const C = 'https://example.supabase.co/storage/v1/object/sign/closet/c.jpg?token=t';
const PAGE = 400;

type Props = Partial<React.ComponentProps<typeof ItemImageGallery>>;

const mount = async (images: string[], props: Props = {}) => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<ItemImageGallery images={images} height={300} {...props} />);
  });
  // The gallery pages by the width it is laid out in.
  await act(async () => {
    host(tree, 'item-image-gallery').props.onLayout({ nativeEvent: { layout: { width: PAGE, height: 300 } } });
  });
  return tree;
};

const host = (tree: renderer.ReactTestRenderer, id: string) =>
  tree.root.find(n => typeof n.type === 'string' && n.props.testID === id);
const hosts = (tree: renderer.ReactTestRenderer, id: string) =>
  tree.root.findAll(n => typeof n.type === 'string' && n.props.testID === id);
const texts = (node: renderer.ReactTestInstance) =>
  node.findAllByType(Text).map(n => [n.props.children].flat().join(''));

/** The Images in the gallery itself, not the ones in the viewer (which is a Modal). */
const galleryImages = (tree: renderer.ReactTestRenderer) =>
  host(tree, 'item-image-gallery')
    .findAllByType(Image)
    .filter(img => !hasAncestor(img, n => n.type === Modal));
const viewerImages = (tree: renderer.ReactTestRenderer) =>
  tree.root.findByType(Modal).findAllByType(Image);

/** The close button as the component that owns onPress (the host view under a TouchableOpacity has none). */
const closeButton = (tree: renderer.ReactTestRenderer) =>
  tree.root.find(
    n => n.props.testID === 'item-image-viewer-close' && typeof n.props.onPress === 'function' && typeof n.type !== 'string',
  );

const hasAncestor = (node: renderer.ReactTestInstance, test: (n: renderer.ReactTestInstance) => boolean) => {
  for (let up = node.parent; up; up = up.parent) if (test(up)) return true;
  return false;
};

const scrollTo = async (tree: renderer.ReactTestRenderer, scrollId: string, x: number, event: 'onScroll' | 'onMomentumScrollEnd' = 'onMomentumScrollEnd') => {
  await act(async () => {
    host(tree, scrollId).props[event]({ nativeEvent: { contentOffset: { x, y: 0 } } });
  });
};

/** The press handler of a page (a Pressable: the host view carries no onPress of its own). */
const page = (tree: renderer.ReactTestRenderer, i: number) =>
  tree.root.find(
    n => n.props.testID === `item-image-page-${i}` && typeof n.props.onPress === 'function' && typeof n.type !== 'string',
  );

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('one photo', () => {
  it('is just the picture: no pager, dots or counter', async () => {
    const tree = await mount([A]);
    expect(galleryImages(tree)).toHaveLength(1);
    expect(galleryImages(tree)[0].props.source).toEqual({ uri: A });
    expect(galleryImages(tree)[0].props.resizeMode).toBe('cover');
    expect(hosts(tree, 'item-image-gallery-scroll')).toHaveLength(0);
    expect(hosts(tree, 'item-image-dots')).toHaveLength(0);
    expect(texts(host(tree, 'item-image-gallery'))).toEqual([]);
  });

  it('takes the height it is given and fills the width it is laid out in', async () => {
    const tree = await mount([A], { height: 321 });
    const root = host(tree, 'item-image-gallery');
    const style = [root.props.style].flat(5).reduce((acc: any, s: any) => ({ ...acc, ...s }), {});
    expect(style.height).toBe(321);
    expect(style.width).toBe('100%');
  });

  it('is labelled for VoiceOver', async () => {
    const tree = await mount([A]);
    expect(page(tree, 0).props.accessibilityLabel).toBe('Photo 1 of 1');
  });

  it('shows a placeholder, and nothing to open, when there is no photo at all', async () => {
    const tree = await mount([]);
    expect(galleryImages(tree)).toHaveLength(0);
    expect(hosts(tree, 'item-image-dots')).toHaveLength(0);
    expect(tree.root.findAll(n => n.props.accessibilityLabel === 'No photo').length).toBeGreaterThan(0);
  });
});

describe('several photos', () => {
  it('lays them out as pages of the width it is laid out in, in order', async () => {
    const tree = await mount([A, B, C]);
    expect(galleryImages(tree).map(i => i.props.source.uri)).toEqual([A, B, C]);
    const scroll = host(tree, 'item-image-gallery-scroll');
    expect(scroll.props.horizontal).toBe(true);
    expect(scroll.props.pagingEnabled).toBe(true);
    expect(scroll.props.showsHorizontalScrollIndicator).toBe(false);
    for (let i = 0; i < 3; i++) {
      const style = [page(tree, i).props.style].flat(5).reduce((acc: any, s: any) => ({ ...acc, ...s }), {});
      expect(style).toMatchObject({ width: PAGE, height: 300 });
    }
  });

  it('labels each page "Photo i of N"', async () => {
    const tree = await mount([A, B, C]);
    expect([0, 1, 2].map(i => page(tree, i).props.accessibilityLabel)).toEqual([
      'Photo 1 of 3',
      'Photo 2 of 3',
      'Photo 3 of 3',
    ]);
  });

  it('shows one dot per photo, the first lit, and the counter', async () => {
    const tree = await mount([A, B, C]);
    expect(hosts(tree, 'item-image-dots')).toHaveLength(1);
    expect(hosts(tree, 'item-image-dot')).toHaveLength(2);
    expect(hosts(tree, 'item-image-dot-active')).toHaveLength(1);
    expect(texts(host(tree, 'item-image-gallery'))).toEqual(['1/3']);
  });

  it('keeps the dots and counter out of the way of VoiceOver (the pages already say where you are) and of touches', async () => {
    const tree = await mount([A, B]);
    const dots = host(tree, 'item-image-dots').parent!;
    const row = tree.root.find(n => typeof n.type === 'string' && n.props.pointerEvents === 'none');
    expect(row.props.accessibilityElementsHidden).toBe(true);
    expect(row.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(dots).toBeTruthy();
  });

  it('keeps the dots above a sheet that overlaps the bottom of the gallery', async () => {
    const tree = await mount([A, B], { bottomInset: 36 });
    const row = tree.root.find(n => typeof n.type === 'string' && n.props.pointerEvents === 'none');
    const style = [row.props.style].flat(5).reduce((acc: any, s: any) => ({ ...acc, ...s }), {});
    expect(style.bottom).toBe(36);
  });

  it('moves the dots and counter, and reports the index, once a swipe lands on a page', async () => {
    const onIndexChange = jest.fn();
    const tree = await mount([A, B, C], { onIndexChange });

    await scrollTo(tree, 'item-image-gallery-scroll', PAGE * 2);
    expect(texts(host(tree, 'item-image-gallery'))).toEqual(['3/3']);
    expect(onIndexChange).toHaveBeenLastCalledWith(2);
    // The lit dot is the last one.
    const dots = host(tree, 'item-image-dots').children as renderer.ReactTestInstance[];
    expect(dots.map(d => d.props.testID)).toEqual(['item-image-dot', 'item-image-dot', 'item-image-dot-active']);

    await scrollTo(tree, 'item-image-gallery-scroll', PAGE);
    expect(texts(host(tree, 'item-image-gallery'))).toEqual(['2/3']);
    expect(onIndexChange).toHaveBeenLastCalledWith(1);
  });

  it('turns the page once a swipe passes halfway, not before, and says nothing twice', async () => {
    const onIndexChange = jest.fn();
    const tree = await mount([A, B, C], { onIndexChange });

    await scrollTo(tree, 'item-image-gallery-scroll', PAGE * 0.4, 'onScroll');
    expect(texts(host(tree, 'item-image-gallery'))).toEqual(['1/3']);
    expect(onIndexChange).not.toHaveBeenCalled();

    await scrollTo(tree, 'item-image-gallery-scroll', PAGE * 0.6, 'onScroll');
    expect(texts(host(tree, 'item-image-gallery'))).toEqual(['2/3']);
    await scrollTo(tree, 'item-image-gallery-scroll', PAGE, 'onMomentumScrollEnd');
    expect(onIndexChange).toHaveBeenCalledTimes(1);
    expect(onIndexChange).toHaveBeenCalledWith(1);
  });

  it('never goes past the last photo, even if the scroll offset does (rubber-banding)', async () => {
    const tree = await mount([A, B]);
    await scrollTo(tree, 'item-image-gallery-scroll', PAGE * 5);
    expect(texts(host(tree, 'item-image-gallery'))).toEqual(['2/2']);
    await scrollTo(tree, 'item-image-gallery-scroll', -80);
    expect(texts(host(tree, 'item-image-gallery'))).toEqual(['1/2']);
  });

  it('goes back to a single picture, with no dots, when photos are removed down to one', async () => {
    const tree = await mount([A, B, C]);
    await scrollTo(tree, 'item-image-gallery-scroll', PAGE * 2);
    await act(async () => {
      tree.update(<ItemImageGallery images={[A]} height={300} />);
    });
    expect(hosts(tree, 'item-image-dots')).toHaveLength(0);
    expect(galleryImages(tree)).toHaveLength(1);
  });

  it('stays on a photo that exists when the one it was on is removed', async () => {
    const onIndexChange = jest.fn();
    const tree = await mount([A, B, C], { onIndexChange });
    await scrollTo(tree, 'item-image-gallery-scroll', PAGE * 2);
    await act(async () => {
      tree.update(<ItemImageGallery images={[A, B]} height={300} onIndexChange={onIndexChange} />);
    });
    expect(texts(host(tree, 'item-image-gallery'))).toEqual(['2/2']);
    expect(onIndexChange).toHaveBeenLastCalledWith(1);
  });

  it('copes with the addresses photos come as: shop links, local files and signed links', async () => {
    const tree = await mount([A, B, C]);
    expect(galleryImages(tree).map(i => i.props.source.uri)).toEqual([A, B, C]);
  });
});

describe('a photo that cannot be loaded', () => {
  it('gets a placeholder of its own and leaves the other pages alone', async () => {
    const tree = await mount([A, B, C]);
    await act(async () => {
      galleryImages(tree)[1].props.onError({ nativeEvent: { error: 'dead link' } });
    });
    expect(hosts(tree, 'photo-fallback')).toHaveLength(1);
    expect(galleryImages(tree).map(i => i.props.source.uri)).toEqual([A, C]);
    // The placeholder is on page 2, which still has its label and its place in the order.
    expect(page(tree, 1).findAll(n => n.props.testID === 'photo-fallback').length).toBeGreaterThan(0);
    expect(page(tree, 1).props.accessibilityLabel).toBe('Photo 2 of 3');
    expect(texts(host(tree, 'item-image-gallery'))).toEqual(['1/3']);
    expect(hosts(tree, 'item-image-dot')).toHaveLength(2);
  });

  it('shows the placeholder for a single photo that fails, with nothing to open', async () => {
    const tree = await mount([A]);
    await act(async () => {
      galleryImages(tree)[0].props.onError({ nativeEvent: { error: 'x' } });
    });
    expect(galleryImages(tree)).toHaveLength(0);
    expect(hosts(tree, 'photo-fallback')).toHaveLength(1);
    expect(page(tree, 0).props.disabled).toBe(true);
    expect(page(tree, 0).props.accessibilityHint).toBe('This photo could not be loaded');
  });

  it('does not open the viewer on a photo that failed', async () => {
    const tree = await mount([A, B]);
    await act(async () => {
      galleryImages(tree)[0].props.onError({ nativeEvent: { error: 'x' } });
    });
    expect(page(tree, 0).props.disabled).toBe(true);
    expect(page(tree, 1).props.disabled).toBe(false);
  });

  it('tries the photo again when it is given a new address', async () => {
    const tree = await mount([A, B]);
    await act(async () => {
      galleryImages(tree)[0].props.onError({ nativeEvent: { error: 'x' } });
    });
    expect(hosts(tree, 'photo-fallback')).toHaveLength(1);
    await act(async () => {
      tree.update(<ItemImageGallery images={['https://example.com/a2.jpg', B]} height={300} />);
    });
    expect(hosts(tree, 'photo-fallback')).toHaveLength(0);
    expect(galleryImages(tree).map(i => i.props.source.uri)).toEqual(['https://example.com/a2.jpg', B]);
  });
});

describe('the full-screen viewer', () => {
  const modal = (tree: renderer.ReactTestRenderer) => tree.root.findByType(Modal);

  it('is closed until a photo is tapped', async () => {
    const tree = await mount([A, B, C]);
    expect(modal(tree).props.visible).toBe(false);
    expect(hosts(tree, 'item-image-viewer')).toHaveLength(0);
  });

  it('opens on the photo that was tapped, on black, with every photo to swipe through', async () => {
    const tree = await mount([A, B, C]);
    await act(async () => page(tree, 1).props.onPress());

    expect(modal(tree).props.visible).toBe(true);
    const viewer = host(tree, 'item-image-viewer');
    expect([viewer.props.style].flat(5).reduce((acc: any, s: any) => ({ ...acc, ...s }), {}).backgroundColor).toBe('#000000');
    expect(viewer.props.accessibilityViewIsModal).toBe(true);
    expect(viewerImages(tree).map(i => i.props.source.uri)).toEqual([A, B, C]);
    // Whole photos, not the cropped cover.
    for (const img of viewerImages(tree)) expect(img.props.resizeMode).toBe('contain');
    // It starts on the tapped page (the second) and says so.
    const { width } = Dimensions.get('window');
    expect(host(tree, 'item-image-viewer-scroll').props.contentOffset).toEqual({ x: width, y: 0 });
    expect(texts(viewer)).toEqual(['2/3']);
  });

  it('labels its pages and its close button', async () => {
    const tree = await mount([A, B]);
    await act(async () => page(tree, 0).props.onPress());
    const viewer = host(tree, 'item-image-viewer');
    const labels = viewer.findAll(n => typeof n.type === 'string' && /^Photo \d of \d$/.test(n.props.accessibilityLabel ?? ''));
    expect(labels.map(n => n.props.accessibilityLabel)).toEqual(['Photo 1 of 2', 'Photo 2 of 2']);
    const close = host(tree, 'item-image-viewer-close');
    expect(close.props.accessibilityRole).toBe('button');
    expect(close.props.accessibilityLabel).toBe('Close photo viewer');
  });

  it('closes with the close button', async () => {
    const tree = await mount([A, B, C]);
    await act(async () => page(tree, 0).props.onPress());
    expect(hosts(tree, 'item-image-viewer')).toHaveLength(1);

    await act(async () => closeButton(tree).props.onPress());
    expect(modal(tree).props.visible).toBe(false);
    expect(hosts(tree, 'item-image-viewer')).toHaveLength(0);
  });

  it('closes on the system back gesture too', async () => {
    const tree = await mount([A, B]);
    await act(async () => page(tree, 0).props.onPress());
    await act(async () => modal(tree).props.onRequestClose());
    expect(modal(tree).props.visible).toBe(false);
  });

  it('opens again on whichever photo is tapped next', async () => {
    const tree = await mount([A, B, C]);
    await act(async () => page(tree, 2).props.onPress());
    expect(texts(host(tree, 'item-image-viewer'))).toEqual(['3/3']);
    await act(async () => closeButton(tree).props.onPress());
    await act(async () => page(tree, 0).props.onPress());
    expect(texts(host(tree, 'item-image-viewer'))).toEqual(['1/3']);
  });

  it('swipes between photos, and the counter follows', async () => {
    const tree = await mount([A, B, C]);
    await act(async () => page(tree, 0).props.onPress());
    // The viewer is as wide as the window.
    const { width } = Dimensions.get('window');
    await scrollTo(tree, 'item-image-viewer-scroll', width * 2);
    expect(texts(host(tree, 'item-image-viewer'))).toEqual(['3/3']);
  });

  it('leaves the gallery on the photo the viewer ended on', async () => {
    const onIndexChange = jest.fn();
    const tree = await mount([A, B, C], { onIndexChange });
    await act(async () => page(tree, 0).props.onPress());
    const { width } = Dimensions.get('window');
    await scrollTo(tree, 'item-image-viewer-scroll', width * 2);
    await act(async () => closeButton(tree).props.onPress());

    expect(texts(host(tree, 'item-image-gallery'))).toEqual(['3/3']);
    expect(onIndexChange).toHaveBeenLastCalledWith(2);
  });

  it('opens for a single photo too, with no counter and nothing to swipe', async () => {
    const tree = await mount([A]);
    await act(async () => page(tree, 0).props.onPress());
    const viewer = host(tree, 'item-image-viewer');
    expect(viewerImages(tree)).toHaveLength(1);
    expect(texts(viewer)).toEqual([]);
    expect(host(tree, 'item-image-viewer-scroll').props.scrollEnabled).toBe(false);
  });

  it('has a placeholder of its own for a photo that cannot be loaded, and keeps the rest', async () => {
    const tree = await mount([A, B, C]);
    await act(async () => page(tree, 0).props.onPress());
    await act(async () => {
      viewerImages(tree)[1].props.onError({ nativeEvent: { error: 'x' } });
    });
    expect(viewerImages(tree).map(i => i.props.source.uri)).toEqual([A, C]);
    expect(tree.root.findByType(Modal).findAll(n => n.props.testID === 'photo-fallback').length).toBeGreaterThan(0);
  });
});
