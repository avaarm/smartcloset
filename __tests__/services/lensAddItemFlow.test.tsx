/**
 * Add Item photo flow, end to end through the screen: honest empty/error
 * states in the match sheet (no invented products), a friendly note for guests,
 * camera shots kept out of the Camera Roll, and late results for an old photo
 * never landing on a newer one.
 */
jest.mock('../../src/config/supabase', () => ({
  supabase: { auth: { getSession: jest.fn(async () => ({ data: { session: null }, error: null })) } },
}));
jest.mock('../../src/services/storage', () => ({
  saveClothingItem: jest.fn(),
  updateClothingItem: jest.fn(),
}));
jest.mock('../../src/services/imageStorage', () => ({
  copyImageToPermanentStorage: jest.fn(async (uri: string) => uri),
}));
jest.mock('../../src/platform/fileSystem', () => ({
  readImageAsBase64: jest.fn(async () => 'base64-photo'),
}));
jest.mock('../../src/services/authUser', () => ({
  getAuthUserId: jest.fn(async () => 'user-1'),
}));
jest.mock('../../src/services/productContributions', () => ({
  lookupKnowledgeBase: jest.fn(async () => []),
  recordContribution: jest.fn(async () => undefined),
}));
jest.mock('../../src/services/imageRecognition', () => ({
  ...jest.requireActual('../../src/services/imageRecognition'),
  analyzeClothingImage: jest.fn(),
}));
jest.mock('../../src/services/lensSearchService', () => ({
  ...jest.requireActual('../../src/services/lensSearchService'),
  searchByImage: jest.fn(),
}));

import 'react-native';
import React from 'react';
import { Alert, TouchableOpacity } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import * as ImagePicker from 'react-native-image-picker';
import AddClothingScreen from '../../src/screens/AddClothingScreen';
import { analyzeClothingImage } from '../../src/services/imageRecognition';
import { searchByImage, type LensResult } from '../../src/services/lensSearchService';
import { lookupKnowledgeBase } from '../../src/services/productContributions';
import { getAuthUserId } from '../../src/services/authUser';

const analyze = analyzeClothingImage as jest.Mock;
const search = searchByImage as jest.Mock;

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void };
const defer = <T,>(): Deferred<T> => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => {
    resolve = r;
  });
  return { promise, resolve };
};

const flush = () =>
  act(async () => {
    await new Promise(r => setImmediate(r));
  });

const realResult = (over: any = {}) => ({
  isReal: true,
  confidence: {},
  category: 'tops',
  subtype: 'shirt',
  color: 'blue',
  ...over,
});

const lensItem = (id: string, title: string): LensResult => ({
  id,
  title,
  source: 'zara.com',
  url: `https://www.zara.com/${id}`,
  imageUrl: `https://static.zara.net/${id}.jpg`,
  similarity: 0.9,
  isShopping: true,
});

let tree: renderer.ReactTestRenderer;
const text = () => JSON.stringify(tree.toJSON());

const render = async () => {
  await act(async () => {
    tree = renderer.create(
      <AddClothingScreen navigation={{ goBack: jest.fn() } as any} route={{ params: {} }} />,
    );
  });
  await flush();
};

/** Tap the photo area, then the "Choose from Library" / "Take Photo" action. */
const addPhoto = async (uri: string, via: 'library' | 'camera' = 'library') => {
  const picker = (via === 'library' ? ImagePicker.launchImageLibrary : ImagePicker.launchCamera) as jest.Mock;
  picker.mockImplementation((_opts: any, cb: (r: any) => void) => cb({ assets: [{ uri }] }));
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  // The photo area is the only touchable with the 250pt image container style.
  const photoArea = tree.root.findAllByType(TouchableOpacity).find(t => (t.props.style as any)?.height === 250);
  expect(photoArea).toBeDefined();
  await act(async () => {
    photoArea!.props.onPress();
  });
  const buttons: any[] = alert.mock.calls[alert.mock.calls.length - 1][2] as any[];
  await act(async () => {
    buttons.find(b => b.text === (via === 'library' ? 'Choose from Library' : 'Take Photo')).onPress();
  });
  await flush();
};

beforeEach(() => {
  jest.clearAllMocks();
  (getAuthUserId as jest.Mock).mockResolvedValue('user-1');
  (lookupKnowledgeBase as jest.Mock).mockResolvedValue([]);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  act(() => {
    tree?.unmount();
  });
  jest.restoreAllMocks();
});

describe('guest', () => {
  beforeEach(() => {
    (getAuthUserId as jest.Mock).mockResolvedValue(null);
  });

  it('is told before picking a photo that AI needs a sign-in', async () => {
    await render();
    expect(text()).toContain('Sign in to let AI analyze your photo');
  });

  it('gets the friendly sign-in note after picking a photo, and no match search', async () => {
    analyze.mockResolvedValue({ isReal: false, confidence: {}, unavailableReason: 'signed_out' });
    await render();

    await addPhoto('file:///photo-1.jpg');

    expect(text()).toContain(
      'Sign in to let SmartCloset identify items from photos. You can still fill in the details yourself.',
    );
    expect(text()).not.toMatch(/ai-proxy|not_signed_in|401/i);
    expect(text()).not.toContain('Is it one of these?');
    expect(text()).not.toContain('No matches found');
    expect(text()).not.toContain('AI Suggestions');
    expect(search).not.toHaveBeenCalled();
    expect(lookupKnowledgeBase).not.toHaveBeenCalled();
  });
});

describe('signed-in user', () => {
  it('sees a generic friendly line when analysis fails (offline etc.)', async () => {
    analyze.mockResolvedValue({ isReal: false, confidence: {}, unavailableReason: 'other' });
    await render();

    await addPhoto('file:///photo-1.jpg');

    expect(text()).toContain("Couldn't analyze that photo right now.");
    expect(text()).not.toContain('Sign in to let SmartCloset');
    expect(search).not.toHaveBeenCalled();
  });

  it('is told AI is off (not asked to sign in) when they declined AI', async () => {
    analyze.mockResolvedValue({ isReal: false, confidence: {}, unavailableReason: 'consent' });
    await render();

    await addPhoto('file:///photo-1.jpg');

    expect(text()).toContain('Settings > Privacy');
    expect(text()).not.toContain('Sign in to let SmartCloset');
  });

  it('shows "No matches found" and no invented products when the search finds nothing', async () => {
    analyze.mockResolvedValue(realResult());
    search.mockResolvedValue({ query: '', bestGuessLabels: [], results: [] });
    await render();

    await addPhoto('file:///photo-1.jpg');

    expect(text()).toContain('No matches found');
    expect(text()).toContain('You can still fill in the details yourself.');
    expect(text()).not.toContain('Browse');
    expect(text()).not.toContain('Shop');
  });

  it('shows the friendly search error instead of "no matches" when the search fails', async () => {
    analyze.mockResolvedValue(realResult());
    search.mockResolvedValue({
      query: '',
      bestGuessLabels: [],
      results: [],
      error: "Couldn't search right now. Check your connection and try again.",
    });
    await render();

    await addPhoto('file:///photo-1.jpg');

    expect(text()).toContain("Couldn't search for matches");
    expect(text()).toContain("Couldn't search right now. Check your connection and try again.");
    expect(text()).not.toContain('No matches found');
  });

  it('shows real web matches', async () => {
    analyze.mockResolvedValue(realResult());
    search.mockResolvedValue({
      query: 'blue shirt',
      bestGuessLabels: [],
      results: [lensItem('p1', 'Blue linen shirt')],
    });
    await render();

    await addPhoto('file:///photo-1.jpg');

    expect(text()).toContain('Is it one of these?');
    expect(text()).toContain('Blue linen shirt');
  });

  it('keeps camera shots out of the Camera Roll', async () => {
    analyze.mockResolvedValue(realResult());
    search.mockResolvedValue({ query: '', bestGuessLabels: [], results: [] });
    await render();

    await addPhoto('file:///camera.jpg', 'camera');

    expect(ImagePicker.launchCamera).toHaveBeenCalledWith(
      expect.objectContaining({ saveToPhotos: false }),
      expect.any(Function),
    );
  });
});

describe('re-picking a photo while the previous one is still being searched', () => {
  it('drops the old photo\'s late results and keeps the new photo\'s loading state', async () => {
    const lensA = defer<any>();
    const lensB = defer<any>();
    analyze.mockResolvedValue(realResult());
    search.mockReturnValueOnce(lensA.promise).mockReturnValueOnce(lensB.promise);
    await render();

    await addPhoto('file:///photo-A.jpg');
    expect(search).toHaveBeenCalledTimes(1);
    expect(text()).toContain('Finding matches');

    // Second photo picked while A's matches are still coming in.
    await addPhoto('file:///photo-B.jpg');
    expect(search).toHaveBeenCalledTimes(2);

    // A's search finally answers: nothing from it may show up, and B must still be loading.
    await act(async () => {
      lensA.resolve({ query: '', bestGuessLabels: [], results: [lensItem('a1', 'Blue shirt from photo A')] });
    });
    await flush();
    expect(text()).not.toContain('Blue shirt from photo A');
    expect(text()).toContain('Finding matches');
    expect(text()).not.toContain('No matches found');

    await act(async () => {
      lensB.resolve({ query: '', bestGuessLabels: [], results: [lensItem('b1', 'Blue shirt from photo B')] });
    });
    await flush();
    expect(text()).toContain('Blue shirt from photo B');
    expect(text()).not.toContain('Blue shirt from photo A');
    expect(text()).not.toContain('Finding matches');
  });

  it('drops the old photo\'s analysis if a newer photo was picked first', async () => {
    const analysisA = defer<any>();
    analyze.mockReturnValueOnce(analysisA.promise).mockResolvedValueOnce(realResult({ color: 'red' }));
    search.mockResolvedValue({
      query: '',
      bestGuessLabels: [],
      results: [lensItem('b1', 'Red dress from photo B')],
    });
    await render();

    // A is still being analysed when B comes in (e.g. a slow picker callback
    // overlapping the first); the helper presses the photo area directly.
    await addPhoto('file:///photo-A.jpg');
    await addPhoto('file:///photo-B.jpg');
    expect(text()).toContain('Red dress from photo B');

    // A's analysis finally returns a failure; it must not replace B's results or spinner state.
    await act(async () => {
      analysisA.resolve({ isReal: false, confidence: {}, unavailableReason: 'signed_out' });
    });
    await flush();
    expect(text()).toContain('Red dress from photo B');
    expect(text()).not.toContain('Sign in to let SmartCloset');
    expect(text()).not.toContain('Analyzing image');
  });
});
