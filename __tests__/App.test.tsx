/**
 * Launch smoke test: the whole app (all screens' modules) loads, the splash
 * plays, and a signed-out user lands on the sign-in screen without crashing.
 * This is the class of failure that crashed TestFlight build 9 on open.
 */
import 'react-native';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import App from '../App';

beforeEach(() => {
  jest.useFakeTimers();
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
