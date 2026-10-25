/**
 * Launch smoke test: the whole app (all screens' modules) loads, the splash
 * plays, and a signed-out user lands on the sign-in screen without crashing.
 * This is the class of failure that crashed TestFlight build 9 on open.
 *
 * One more case builds the app with the professional accounts feature switched on
 * (the flag is mocked; the shipped value is false) and checks the first-run prompt
 * is the real one and is shown once.
 */
import 'react-native';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from '../App';
import { supabase } from '../src/config/supabase';
import { resetProEntry } from '../src/services/proEntry';

let mockProModes = false;
jest.mock('../src/config/features', () => ({
  get PRO_MODES_ENABLED() {
    return mockProModes;
  },
}));

// The stand-in for the first tab keeps this test from loading a real Home; the prompt is the real screen.
jest.mock('../src/screens/HomeScreen', () => {
  const { Text } = require('react-native');
  return () => <Text>SCREEN_HOME</Text>;
});

beforeEach(async () => {
  jest.useFakeTimers();
  mockProModes = false;
  resetProEntry();
  await AsyncStorage.clear();
  (global as any).fetch = jest.fn(async () => ({ ok: false, status: 503, json: async () => ({}), text: async () => '' }));
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};

it('opens, plays the splash, and shows the sign-in screen when signed out', async () => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<App />);
  });
  await act(async () => {
    jest.advanceTimersByTime(15000);
  });
  await act(async () => {
    await Promise.resolve();
  });

  const text = flatten(tree.toJSON());
  expect(text).toContain('Continue as guest');
  expect(text).toContain('Privacy Policy');

  await act(async () => {
    tree.unmount();
  });
});

it('with the professional accounts feature on, asks a signed-in account how they will use the app, once', async () => {
  mockProModes = true;
  const session = { user: { id: 'user-7', email: 'ada@example.com', user_metadata: { name: 'Ada Lovelace' } } };
  jest.spyOn(supabase.auth, 'getSession').mockResolvedValue({ data: { session }, error: null } as any);
  // The real client would announce its own (empty) session right after and sign the account out again.
  jest.spyOn(supabase.auth, 'onAuthStateChange').mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } } as any);

  const open = async () => {
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<App />);
    });
    await act(async () => {
      jest.advanceTimersByTime(15000);
    });
    for (let i = 0; i < 10; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }
    return tree;
  };

  const first = await open();
  const prompt = flatten(first.toJSON());
  expect(prompt).toContain('Just for me');
  expect(prompt).toContain("I'm a stylist");
  expect(prompt).toContain('I work with a stylist');
  expect(prompt).toContain('Hi Ada.');
  expect(prompt).not.toContain('SCREEN_HOME');

  const choices = first.root.findAll(n => typeof n.props.onPress === 'function' && n.props.accessibilityRole !== 'link');
  expect(choices.length).toBeGreaterThanOrEqual(3);
  await act(async () => {
    choices[0].props.onPress();
  });
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
  expect(flatten(first.toJSON())).toContain('SCREEN_HOME');
  expect(await AsyncStorage.getItem('@smartcloset_mode_onboarded_user-7')).toBe('true');
  await act(async () => {
    first.unmount();
  });

  const second = await open();
  const again = flatten(second.toJSON());
  expect(again).toContain('SCREEN_HOME');
  expect(again).not.toContain('Just for me');
  await act(async () => {
    second.unmount();
  });
});
