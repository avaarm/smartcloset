import 'react-native';
import React from 'react';
import { Alert, RefreshControl } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { SuggestionsTab, SavedOutfitsTab } from '../../src/screens/OutfitScreen';
import { getOwnedClothingItems } from '../../src/services/storage';
import {
  generateOutfitSuggestions,
  saveOutfit,
  getSavedOutfits,
  deleteSavedOutfit,
} from '../../src/services/outfitService';
import { WeatherOutfitService } from '../../src/services/weatherOutfitService';
import type { ClothingItem } from '../../src/types';

jest.mock('@react-navigation/material-top-tabs', () => ({
  createMaterialTopTabNavigator: () => ({ Navigator: () => null, Screen: () => null }),
}));
jest.mock('../../src/services/storage', () => ({ getOwnedClothingItems: jest.fn() }));
jest.mock('../../src/services/outfitService', () => ({
  generateOutfitSuggestions: jest.fn(),
  saveOutfit: jest.fn(),
  getSavedOutfits: jest.fn(),
  deleteSavedOutfit: jest.fn(),
}));
jest.mock('../../src/services/wearTrackingService', () => ({
  WearTrackingService: { markOutfitWorn: jest.fn() },
}));
jest.mock('../../src/services/weatherOutfitService', () => ({
  WeatherOutfitService: {
    getWeatherBasedRecommendations: jest.fn(),
    getWeatherIcon: jest.fn(() => 'sunny-outline'),
  },
}));

const mockFocus: { current: null | (() => void) } = { current: null };
jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useNavigation: () => ({ navigate: jest.fn() }),
    useFocusEffect: (cb: () => void) => {
      mockFocus.current = cb;
      React.useEffect(cb, [cb]);
    },
  };
});

const mockWardrobe = getOwnedClothingItems as jest.Mock;
const mockGenerate = generateOutfitSuggestions as jest.Mock;
const mockSave = saveOutfit as jest.Mock;
const mockSaved = getSavedOutfits as jest.Mock;
const mockDeleteSaved = deleteSavedOutfit as jest.Mock;
const mockWeather = WeatherOutfitService.getWeatherBasedRecommendations as jest.Mock;

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};
const text = (tree: renderer.ReactTestRenderer) => flatten(tree.toJSON());

let n = 0;
const clothing = (extra: Partial<ClothingItem> = {}): ClothingItem => ({
  id: `c${++n}`,
  name: `Piece ${n}`,
  category: 'tops',
  color: 'black',
  season: ['fall'],
  dateAdded: '2026-01-01T00:00:00Z',
  isWishlist: false,
  ...extra,
});
const pair = () => [clothing(), clothing({ category: 'bottoms' })];
const outfit = (name: string) => ({
  id: `o-${name}`,
  name,
  items: [clothing()],
  createdAt: '2026-01-01T00:00:00Z',
});

const mount = async (el: React.ReactElement) => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(el);
  });
  return tree;
};
const retry = (tree: renderer.ReactTestRenderer) =>
  tree.root.find(n => /^Try again to load your/.test(n.props.accessibilityLabel ?? '') && !!n.props.onPress);

beforeEach(() => {
  [mockWardrobe, mockGenerate, mockSave, mockSaved, mockDeleteSaved, mockWeather].forEach(m => m.mockReset());
  mockWeather.mockRejectedValue(new Error('no location')); // plain suggestions unless a test says otherwise
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('SuggestionsTab', () => {
  it('shows suggestions built from the wardrobe', async () => {
    mockWardrobe.mockResolvedValue(pair());
    mockGenerate.mockReturnValue([outfit('Smart Casual')]);
    const tree = await mount(<SuggestionsTab />);
    expect(text(tree)).toContain('Smart Casual');
  });

  it('a failed wardrobe load is a retryable error, not "No Outfit Suggestions"', async () => {
    mockWardrobe.mockRejectedValueOnce(new Error('offline'));
    const tree = await mount(<SuggestionsTab />);
    expect(text(tree)).toContain("Couldn't load your outfit suggestions");
    expect(text(tree)).not.toContain('No Outfit Suggestions');

    mockWardrobe.mockResolvedValue(pair());
    mockGenerate.mockReturnValue([outfit('Smart Casual')]);
    await act(async () => {
      await retry(tree).props.onPress();
    });
    expect(text(tree)).toContain('Smart Casual');
  });

  it('picks up items added elsewhere when the tab regains focus (empty -> suggestions)', async () => {
    mockWardrobe.mockResolvedValueOnce([clothing()]);
    const tree = await mount(<SuggestionsTab />);
    expect(text(tree)).toContain('No Outfit Suggestions');
    expect(mockGenerate).not.toHaveBeenCalled();

    mockWardrobe.mockResolvedValueOnce(pair());
    mockGenerate.mockReturnValue([outfit('Fresh Idea')]);
    await act(async () => {
      mockFocus.current!();
    });
    expect(text(tree)).toContain('Fresh Idea');
  });

  it('keeps the suggestions on screen on refocus when the wardrobe has not changed', async () => {
    const closet = pair();
    mockWardrobe.mockResolvedValue(closet);
    mockGenerate.mockReturnValueOnce([outfit('First')]).mockReturnValueOnce([outfit('Second')]);
    const tree = await mount(<SuggestionsTab />);

    await act(async () => {
      mockFocus.current!();
    });
    expect(text(tree)).toContain('First');
    expect(mockGenerate).toHaveBeenCalledTimes(1);

    // pull-to-refresh is an explicit ask for new ideas
    await act(async () => {
      await tree.root.findByType(RefreshControl).props.onRefresh();
    });
    expect(text(tree)).toContain('Second');
  });

  it('regenerates on refocus when the wardrobe changed', async () => {
    mockWardrobe.mockResolvedValueOnce(pair());
    mockGenerate.mockReturnValueOnce([outfit('First')]).mockReturnValueOnce([outfit('Second')]);
    const tree = await mount(<SuggestionsTab />);

    mockWardrobe.mockResolvedValueOnce([...pair(), clothing({ category: 'shoes' })]);
    await act(async () => {
      mockFocus.current!();
    });
    expect(text(tree)).toContain('Second');
  });

  it('rebuilds suggestions when the weather toggle flips, even though the wardrobe is unchanged', async () => {
    const closet = pair();
    mockWardrobe.mockResolvedValue(closet);
    mockWeather.mockReset().mockResolvedValue({
      weather: { temperature: 60, condition: 'sunny', location: 'Austin' },
      recommendedOutfits: [outfit('Weather Pick')],
      tips: ['Wear layers'],
    });
    mockGenerate.mockReturnValue([outfit('Plain Pick')]);
    const tree = await mount(<SuggestionsTab />);
    expect(text(tree)).toContain('Weather Pick');

    await act(async () => {
      tree.root.find(n => n.props.label === 'Show All' && !!n.props.onPress).props.onPress();
    });
    expect(text(tree)).toContain('Plain Pick');
    expect(text(tree)).not.toContain('Weather Pick');
  });

  it('a failed refresh keeps the suggestions and shows a banner', async () => {
    mockWardrobe.mockResolvedValueOnce(pair());
    mockGenerate.mockReturnValue([outfit('Smart Casual')]);
    const tree = await mount(<SuggestionsTab />);

    mockWardrobe.mockRejectedValueOnce(new Error('offline'));
    await act(async () => {
      await tree.root.findByType(RefreshControl).props.onRefresh();
    });
    expect(text(tree)).toContain('Smart Casual');
    expect(text(tree)).toContain("Couldn't refresh your outfit suggestions");
  });

  it('saving a suggestion calls saveOutfit, and a failed save raises an alert', async () => {
    mockWardrobe.mockResolvedValue(pair());
    const suggestion = outfit('Smart Casual');
    mockGenerate.mockReturnValue([suggestion]);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const tree = await mount(<SuggestionsTab />);
    const bookmark = () =>
      tree.root.find(n => n.props.accessibilityLabel === 'Save outfit' && !!n.props.onPress);

    mockSave.mockRejectedValueOnce(new Error('offline'));
    await act(async () => {
      await bookmark().props.onPress();
    });
    expect(alertSpy).toHaveBeenCalledWith("Couldn't save outfit", expect.any(String));

    mockSave.mockResolvedValueOnce(undefined);
    await act(async () => {
      await bookmark().props.onPress();
    });
    expect(mockSave).toHaveBeenCalledTimes(2);
    expect(mockSave).toHaveBeenLastCalledWith(suggestion);
    expect(text(tree)).toContain('Smart Casual');
    tree.root.find(n => n.props.accessibilityLabel === 'Outfit saved');
  });
});

describe('SavedOutfitsTab', () => {
  it('a failed load is a retryable error, not "No Saved Outfits"', async () => {
    mockSaved.mockRejectedValueOnce(new Error('offline'));
    const tree = await mount(<SavedOutfitsTab />);
    expect(text(tree)).toContain("Couldn't load your saved outfits");
    expect(text(tree)).not.toContain('No Saved Outfits');

    mockSaved.mockResolvedValueOnce([outfit('Brunch')]);
    await act(async () => {
      await retry(tree).props.onPress();
    });
    expect(text(tree)).toContain('Brunch');
  });

  it('an empty list can be pulled to refresh, and a newly saved outfit appears on refocus', async () => {
    mockSaved.mockResolvedValueOnce([]);
    const tree = await mount(<SavedOutfitsTab />);
    expect(text(tree)).toContain('No Saved Outfits');
    expect(tree.root.findAllByType(RefreshControl)).toHaveLength(1);

    mockSaved.mockResolvedValueOnce([outfit('Brunch')]);
    await act(async () => {
      mockFocus.current!();
    });
    expect(text(tree)).toContain('Brunch');
    expect(text(tree)).not.toContain('No Saved Outfits');
  });

  it('a failed refresh does not wipe the loaded list', async () => {
    mockSaved.mockResolvedValueOnce([outfit('Brunch')]);
    const tree = await mount(<SavedOutfitsTab />);

    mockSaved.mockRejectedValueOnce(new Error('offline'));
    await act(async () => {
      await tree.root.findByType(RefreshControl).props.onRefresh();
    });
    expect(text(tree)).toContain('Brunch');
    expect(text(tree)).toContain("Couldn't refresh your saved outfits");
    expect(text(tree)).not.toContain('No Saved Outfits');
  });

  it('deleting removes the outfit; a failed delete keeps it and says so', async () => {
    mockSaved.mockResolvedValueOnce([outfit('Brunch'), outfit('Gala')]);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const tree = await mount(<SavedOutfitsTab />);
    const del = (name: string) =>
      tree.root.find(n => !!n.props.onDelete && n.props.outfit?.name === name).props.onDelete;

    mockDeleteSaved.mockResolvedValueOnce(undefined);
    await act(async () => {
      await del('Brunch')();
    });
    expect(text(tree)).not.toContain('Brunch');

    mockDeleteSaved.mockRejectedValueOnce(new Error('offline'));
    await act(async () => {
      await del('Gala')();
    });
    expect(alertSpy).toHaveBeenCalledWith('Could not delete outfit', expect.any(String));
    expect(text(tree)).toContain('Gala');
  });
});
