/**
 * PhotoStrip: the row of thumbnails under the cover photo on Add / Edit item. The cover is marked, every other photo
 * can be made the cover, every photo can be removed, shop photos say so, and the add tiles go away at the limit.
 */
import 'react-native';
import React from 'react';
import { ActivityIndicator, Image, Pressable } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import PhotoStrip, {
  ADD_PHOTOS_LABEL,
  CAMERA_LABEL,
  COVER_LABEL,
  MAKE_COVER_LABEL,
  SHOP_PHOTO_LABEL,
  TAKE_PHOTO_A11Y_LABEL,
  type PhotoStripProps,
} from '../../src/components/PhotoStrip';
import { MAX_ITEM_IMAGES } from '../../src/utils/itemImages';

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};

const PHOTOS = ['file:///a.jpg', 'file:///b.jpg', 'file:///c.jpg'];

const mount = async (over: Partial<PhotoStripProps> = {}) => {
  const props: PhotoStripProps = {
    photos: PHOTOS,
    onAdd: jest.fn(),
    onTakePhoto: jest.fn(),
    onMakeCover: jest.fn(),
    onRemove: jest.fn(),
    ...over,
  };
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<PhotoStrip {...props} />);
  });
  const button = (label: string) => {
    const found = tree.root.findAllByType(Pressable).filter(n => n.props.accessibilityLabel === label);
    if (found.length !== 1) throw new Error(`expected one button "${label}", found ${found.length}`);
    return found[0];
  };
  const hasButton = (label: string) =>
    tree.root.findAllByType(Pressable).some(n => n.props.accessibilityLabel === label);
  const press = (label: string) => act(async () => button(label).props.onPress());
  const texts = () => tree.root.findAll(n => (n.type as unknown) === 'Text').map(n => flatten(n.props.children));
  const count = (text: string) => texts().filter(t => t === text).length;
  return { tree, props, button, hasButton, press, count, text: () => flatten(tree.toJSON()) };
};

describe('PhotoStrip', () => {
  it('shows every photo, in order, with the first one marked as the cover', async () => {
    const strip = await mount();
    const shown = strip.tree.root.findAllByType(Image).map(i => i.props.source.uri);
    expect(shown).toEqual(PHOTOS);
    expect(strip.count(COVER_LABEL)).toBe(1);
    expect(strip.count(MAKE_COVER_LABEL)).toBe(2);
    expect(strip.hasButton('Make photo 1 of 3 the cover')).toBe(false);
    expect(strip.hasButton('Make photo 2 of 3 the cover')).toBe(true);
    expect(strip.hasButton('Make photo 3 of 3 the cover')).toBe(true);
  });

  it('describes each thumbnail to a screen reader, saying which is the cover', async () => {
    const strip = await mount({ shopPhotos: ['file:///c.jpg'] });
    const labels = strip.tree.root
      .findAll(n => (n.type as unknown) === 'View' && n.props.accessible === true && !n.props.accessibilityRole)
      .map(n => n.props.accessibilityLabel);
    expect(labels).toEqual(['photo 1 of 3, the cover', 'photo 2 of 3', 'photo 3 of 3, from the shop']);
  });

  it('makes a photo the cover when its button is pressed, and passes which one', async () => {
    const strip = await mount();
    await strip.press('Make photo 3 of 3 the cover');
    expect(strip.props.onMakeCover).toHaveBeenCalledTimes(1);
    expect(strip.props.onMakeCover).toHaveBeenCalledWith('file:///c.jpg');
    expect(strip.props.onRemove).not.toHaveBeenCalled();
  });

  it('removes any photo, the cover included', async () => {
    const strip = await mount();
    await strip.press('Remove photo 2 of 3');
    expect(strip.props.onRemove).toHaveBeenLastCalledWith('file:///b.jpg');
    await strip.press('Remove photo 1 of 3');
    expect(strip.props.onRemove).toHaveBeenLastCalledWith('file:///a.jpg');
    expect(strip.props.onMakeCover).not.toHaveBeenCalled();
  });

  it('labels the photos that came from a shop, and only those', async () => {
    const none = await mount();
    expect(none.count(SHOP_PHOTO_LABEL)).toBe(0);
    const some = await mount({ shopPhotos: ['file:///b.jpg', 'file:///c.jpg'] });
    expect(some.count(SHOP_PHOTO_LABEL)).toBe(2);
  });

  it('ends with an Add photos tile and a camera tile, and each one calls its handler', async () => {
    const strip = await mount();
    await strip.press(ADD_PHOTOS_LABEL);
    expect(strip.props.onAdd).toHaveBeenCalledTimes(1);
    await strip.press(TAKE_PHOTO_A11Y_LABEL);
    expect(strip.props.onTakePhoto).toHaveBeenCalledTimes(1);
    expect(strip.count(CAMERA_LABEL)).toBe(1);
  });

  it('has no camera tile when the screen does not offer the camera', async () => {
    const strip = await mount({ onTakePhoto: undefined });
    expect(strip.hasButton(ADD_PHOTOS_LABEL)).toBe(true);
    expect(strip.hasButton(TAKE_PHOTO_A11Y_LABEL)).toBe(false);
  });

  it('with no photos shows just the add tiles and says what the first photo is', async () => {
    const strip = await mount({ photos: [] });
    expect(strip.tree.root.findAllByType(Image)).toHaveLength(0);
    expect(strip.hasButton(ADD_PHOTOS_LABEL)).toBe(true);
    expect(strip.text()).toContain(`Up to ${MAX_ITEM_IMAGES} photos. The first one is the cover.`);
  });

  it('counts the photos under the row', async () => {
    const strip = await mount();
    expect(strip.text()).toContain(`3 of ${MAX_ITEM_IMAGES} photos. The first one is the cover.`);
  });

  it('hides both add tiles at the limit and says to remove one first', async () => {
    const full = Array.from({ length: MAX_ITEM_IMAGES }, (_, i) => `file:///p${i}.jpg`);
    const strip = await mount({ photos: full });
    expect(strip.tree.root.findAllByType(Image)).toHaveLength(MAX_ITEM_IMAGES);
    expect(strip.hasButton(ADD_PHOTOS_LABEL)).toBe(false);
    expect(strip.hasButton(TAKE_PHOTO_A11Y_LABEL)).toBe(false);
    expect(strip.text()).toContain(`${MAX_ITEM_IMAGES} of ${MAX_ITEM_IMAGES} photos. Remove one to add another.`);
    // Removing is still there.
    expect(strip.hasButton(`Remove photo ${MAX_ITEM_IMAGES} of ${MAX_ITEM_IMAGES}`)).toBe(true);
  });

  it('honours a smaller limit', async () => {
    const strip = await mount({ max: 3 });
    expect(strip.hasButton(ADD_PHOTOS_LABEL)).toBe(false);
    expect(strip.text()).toContain('3 of 3 photos. Remove one to add another.');
  });

  it('tells a screen reader how many photos the library may still give', async () => {
    const strip = await mount();
    expect(strip.button(ADD_PHOTOS_LABEL).props.accessibilityHint).toBe(`Choose up to ${MAX_ITEM_IMAGES - 3} from your library`);
  });

  it('waits while photos are being added: a spinner on Add photos, both add tiles off', async () => {
    const strip = await mount({ adding: true });
    expect(strip.tree.root.findAllByType(ActivityIndicator)).toHaveLength(1);
    expect(strip.button(ADD_PHOTOS_LABEL).props.disabled).toBe(true);
    expect(strip.button(TAKE_PHOTO_A11Y_LABEL).props.disabled).toBe(true);
    expect(strip.button(ADD_PHOTOS_LABEL).props.accessibilityState).toEqual({ disabled: true, busy: true });
  });

  it('turns every button off while the cover is being read', async () => {
    const strip = await mount({ disabled: true });
    for (const label of [
      'Make photo 2 of 3 the cover',
      'Remove photo 1 of 3',
      'Remove photo 3 of 3',
      ADD_PHOTOS_LABEL,
      TAKE_PHOTO_A11Y_LABEL,
    ]) {
      expect(strip.button(label).props.disabled).toBe(true);
      expect(strip.button(label).props.accessibilityState.disabled).toBe(true);
    }
  });

  it('shows a placeholder, still removable, for a picture that will not load', async () => {
    const strip = await mount({ photos: ['https://shop.example/gone.jpg'] });
    expect(strip.tree.root.findAllByType(Image)).toHaveLength(1);
    await act(async () => {
      strip.tree.root.findByType(Image).props.onError();
    });
    expect(strip.tree.root.findAllByType(Image)).toHaveLength(0);
    await strip.press('Remove photo 1 of 1');
    expect(strip.props.onRemove).toHaveBeenCalledWith('https://shop.example/gone.jpg');
  });
});
