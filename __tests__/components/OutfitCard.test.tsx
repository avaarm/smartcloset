import 'react-native';
import React from 'react';
import { Alert } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import OutfitCard from '../../src/components/OutfitCard';
import type { Outfit } from '../../src/services/outfitService';

jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: jest.fn() }) }));

const outfit: Outfit = {
  id: 'o1',
  name: 'Casual Look',
  items: [],
  season: ['fall'],
  occasion: 'casual',
  createdAt: '2026-01-01T00:00:00Z',
};

const render = async (el: React.ReactElement) => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(el);
  });
  return tree;
};

const bookmark = (tree: renderer.ReactTestRenderer) =>
  tree.root.find(n => !!n.props.onPress && /^(Save outfit|Outfit saved)$/.test(n.props.accessibilityLabel));
const iconName = (tree: renderer.ReactTestRenderer) => tree.root.findAllByType('Icon' as any)[0].props.name;

let alertSpy: jest.SpyInstance;
beforeEach(() => {
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('OutfitCard bookmark', () => {
  it('fills the bookmark after a successful save, and a later tap saves again (the service ignores a duplicate, and re-saves if it was deleted meanwhile)', async () => {
    const onSave = jest.fn(async () => {});
    const tree = await render(<OutfitCard outfit={outfit} onSave={onSave} />);
    expect(iconName(tree)).toBe('bookmark-outline');
    expect(bookmark(tree).props.accessibilityLabel).toBe('Save outfit');

    await act(async () => {
      await bookmark(tree).props.onPress();
    });
    expect(iconName(tree)).toBe('bookmark');
    expect(bookmark(tree).props.accessibilityLabel).toBe('Outfit saved');

    await act(async () => {
      await bookmark(tree).props.onPress();
    });
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(iconName(tree)).toBe('bookmark');
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('ignores a second tap while the first save is still in flight', async () => {
    let finish!: () => void;
    const onSave = jest.fn(() => new Promise<void>(res => (finish = res)));
    const tree = await render(<OutfitCard outfit={outfit} onSave={onSave} />);

    await act(async () => {
      bookmark(tree).props.onPress();
      bookmark(tree).props.onPress();
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(iconName(tree)).toBe('bookmark-outline'); // not saved until it succeeds

    await act(async () => finish());
    expect(iconName(tree)).toBe('bookmark');
  });

  it('shows an error and stays unsaved when the save fails, and lets the user retry', async () => {
    const onSave = jest
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined);
    const tree = await render(<OutfitCard outfit={outfit} onSave={onSave} />);

    await act(async () => {
      await bookmark(tree).props.onPress();
    });
    expect(alertSpy).toHaveBeenCalledWith("Couldn't save outfit", expect.any(String));
    expect(iconName(tree)).toBe('bookmark-outline');

    await act(async () => {
      await bookmark(tree).props.onPress();
    });
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(iconName(tree)).toBe('bookmark');
  });

  it('saved outfits show a labelled delete button instead of a bookmark', async () => {
    const onDelete = jest.fn();
    const tree = await render(<OutfitCard outfit={outfit} saved onDelete={onDelete} />);
    const del = tree.root.find(n => n.props.accessibilityLabel === 'Delete saved outfit' && !!n.props.onPress);
    await act(async () => del.props.onPress());
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(iconName(tree)).toBe('trash-outline');
  });
});
