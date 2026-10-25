import 'react-native';
import React from 'react';
import fs from 'fs';
import path from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TouchableOpacity } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import ProOnboardingScreen, { PRO_ONBOARDING_FOOTER } from '../../src/screens/ProOnboardingScreen';
import { PRO_INDEPENDENT_LINE } from '../../src/config/proRules';

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};

// No ThemeProvider and no NavigationContainer around it: the launch gate renders it outside both.
const render = async (props: Partial<React.ComponentProps<typeof ProOnboardingScreen>> = {}) => {
  const onComplete = jest.fn();
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<ProOnboardingScreen onComplete={onComplete} {...props} />);
  });
  const text = () => flatten(tree.toJSON());
  const card = (label: string) =>
    tree.root.find(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
  const press = async (label: string) => {
    const node = card(label);
    await act(async () => {
      node.props.onPress();
    });
  };
  return { tree, text, card, press, onComplete };
};

let consoleError: jest.SpyInstance;
beforeEach(() => {
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  expect(consoleError).not.toHaveBeenCalled();
  consoleError.mockRestore();
});

describe('ProOnboardingScreen', () => {
  it('offers exactly three choices, in words that do not claim a role for anyone', async () => {
    const { text, tree } = await render();
    expect(text()).toContain('How will you');
    expect(text()).toContain('Just for me');
    expect(text()).toContain('Your closet, outfits and wishlist.');
    expect(text()).toContain("I'm a stylist");
    expect(text()).toContain("Work with clients. You'll set up a short profile.");
    expect(text()).toContain('I work with a stylist');
    expect(text()).toContain("You'll need a code from your stylist.");
    const buttons = tree.root.findAllByType(TouchableOpacity);
    expect(buttons.map(b => b.props.accessibilityLabel)).toEqual(['Just for me', "I'm a stylist", 'I work with a stylist']);
    // The old "a bit of both" is gone: roles are additive and can be added later.
    expect(text()).not.toMatch(/bit of both/i);
  });

  it.each([
    ['Just for me', 'personal'],
    ["I'm a stylist", 'stylist'],
    ['I work with a stylist', 'client'],
  ] as const)('reports %s as %s, once', async (label, choice) => {
    const { press, onComplete } = await render();
    await press(label);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith(choice);
  });

  it('says where to change this, and that stylists are independent', async () => {
    const { text } = await render();
    expect(text()).toContain('You can change this any time in Settings > Professional.');
    expect(text()).toContain(PRO_INDEPENDENT_LINE);
    expect(PRO_ONBOARDING_FOOTER).toContain(PRO_INDEPENDENT_LINE);
  });

  it('greets the person by first name when it knows it, and says nothing odd when it does not', async () => {
    const named = await render({ userName: 'Ada Lovelace' });
    expect(named.text()).toContain('Hi Ada.');
    expect(named.text()).not.toContain('Lovelace');
    const anonymous = await render({ userName: undefined });
    expect(anonymous.text()).not.toContain('Hi ');
    const blank = await render({ userName: '   ' });
    expect(blank.text()).not.toContain('Hi ');
  });

  it('describes each choice to a screen reader', async () => {
    const { card } = await render();
    expect(card("I'm a stylist").props.accessibilityHint).toBe("Work with clients. You'll set up a short profile.");
  });

  it('uses none of the words an app that takes no payment must not show', async () => {
    const { text } = await render({ userName: 'Ada' });
    expect(text()).not.toMatch(/\b(book|pay now|buy|checkout|deposit|premium|featured|verified|certified|top rated)\b/i);
  });

  it('stores nothing on the device', async () => {
    const setItem = jest.spyOn(AsyncStorage, 'setItem');
    const getItem = jest.spyOn(AsyncStorage, 'getItem');
    const { press } = await render();
    await press("I'm a stylist");
    expect(setItem).not.toHaveBeenCalled();
    expect(getItem).not.toHaveBeenCalled();
    setItem.mockRestore();
    getItem.mockRestore();
  });

  it('uses no theme, navigation, storage or network: it is rendered before the providers exist', () => {
    const code = fs
      .readFileSync(path.resolve(__dirname, '../../src/screens/ProOnboardingScreen.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/@react-navigation|useNavigation|navigate\(|useTheme|ThemeProvider/);
    expect(code).not.toMatch(/AsyncStorage|supabase|proService|console\./);
  });
});
