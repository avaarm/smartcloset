/**
 * ScanTagCard: the card-style way into the tag scan on Item Details. It does not scan itself; it calls
 * onPress, and the screen sends the person to Edit item with the scanner open. Nothing for a guest or with
 * tag scanning off.
 */
import 'react-native';
import React from 'react';
import { Pressable, Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';

const mockFlags = { on: true };
jest.mock('../../src/config/ratingFlags', () => ({
  tagScanActive: () => mockFlags.on,
  ratingsActive: () => false,
  brandInsightsActive: () => false,
}));

const mockAuthUserId = jest.fn();
jest.mock('../../src/services/authUser', () => ({ getAuthUserId: (...a: unknown[]) => mockAuthUserId(...a) }));

import ScanTagCard, {
  SCAN_CARD_HELPER_AGAIN,
  SCAN_CARD_TITLE,
  SCAN_CARD_TITLE_AGAIN,
} from '../../src/components/ScanTagCard';
import { SCAN_HELPER } from '../../src/components/ScanTagButton';

let errorSpy: jest.SpyInstance;

beforeEach(() => {
  mockFlags.on = true;
  mockAuthUserId.mockReset().mockResolvedValue('u1');
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  expect(errorSpy).not.toHaveBeenCalled();
  jest.restoreAllMocks();
});

const mount = async (hasTag = false, onPress: () => void = jest.fn()) => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<ScanTagCard hasTag={hasTag} onPress={onPress} />);
  });
  const texts = () => tree.root.findAllByType(Text).map(t => [t.props.children].flat().join(''));
  return { tree, texts, onPress };
};

describe('ScanTagCard', () => {
  it('is a button that says what it scans: the tag and the washing instructions', async () => {
    const { tree, texts } = await mount();
    expect(SCAN_CARD_TITLE).toBe('Scan the tag & washing instructions');
    expect(texts()).toContain('Scan the tag & washing instructions');
    expect(texts()).toContain(SCAN_HELPER);
    const button = tree.root.findByType(Pressable);
    expect(button.props.accessibilityRole).toBe('button');
    expect(button.props.accessibilityLabel).toBe('Scan the tag & washing instructions');
  });

  it('calls onPress when it is pressed', async () => {
    const { tree, onPress } = await mount();
    await act(async () => {
      tree.root.findByType(Pressable).props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('says "Scan the tag again" once a tag was scanned', async () => {
    const { tree, texts } = await mount(true);
    expect(SCAN_CARD_TITLE_AGAIN).toBe('Scan the tag again');
    expect(texts()).toContain('Scan the tag again');
    expect(texts()).toContain(SCAN_CARD_HELPER_AGAIN);
    expect(texts()).not.toContain(SCAN_CARD_TITLE);
    expect(tree.root.findByType(Pressable).props.accessibilityLabel).toBe('Scan the tag again');
  });

  it('shows nothing to a guest', async () => {
    mockAuthUserId.mockResolvedValue(null);
    const { tree } = await mount();
    expect(tree.toJSON()).toBeNull();
  });

  it('shows nothing, and asks nothing, with tag scanning off', async () => {
    mockFlags.on = false;
    const { tree } = await mount();
    expect(tree.toJSON()).toBeNull();
    expect(mockAuthUserId).not.toHaveBeenCalled();
  });

  it('shows nothing when the sign-in check fails', async () => {
    mockAuthUserId.mockRejectedValue(new Error('network'));
    const { tree } = await mount();
    expect(tree.toJSON()).toBeNull();
  });

  it('sets nothing after it is gone', async () => {
    let answer!: (id: string) => void;
    mockAuthUserId.mockReturnValue(new Promise<string>(resolve => (answer = resolve)));
    const { tree } = await mount();
    await act(async () => {
      tree.unmount();
    });
    await act(async () => {
      answer('u1');
    });
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
