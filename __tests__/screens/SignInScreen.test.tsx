import 'react-native';
import React from 'react';
import { Alert } from 'react-native';
import renderer, { act } from 'react-test-renderer';

const mockAuth = {
  signInWithGoogle: jest.fn(),
  signInWithApple: jest.fn(),
  signInWithEmail: jest.fn(),
  signUpWithEmail: jest.fn(),
  requestPasswordReset: jest.fn(),
  resetPasswordWithCode: jest.fn(),
};
jest.mock('../../src/services/authService', () => ({
  signInWithGoogle: (...a: any[]) => mockAuth.signInWithGoogle(...a),
  signInWithApple: (...a: any[]) => mockAuth.signInWithApple(...a),
  signInWithEmail: (...a: any[]) => mockAuth.signInWithEmail(...a),
  signUpWithEmail: (...a: any[]) => mockAuth.signUpWithEmail(...a),
  requestPasswordReset: (...a: any[]) => mockAuth.requestPasswordReset(...a),
  resetPasswordWithCode: (...a: any[]) => mockAuth.resetPasswordWithCode(...a),
}));

import SignInScreen from '../../src/screens/SignInScreen';

const flatten = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return flatten(node.children);
};

let alertSpy: jest.SpyInstance;

const mount = async () => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<SignInScreen onGuestContinue={jest.fn()} />);
  });
  const text = () => flatten(tree.toJSON());
  const press = async (label: string) => {
    const node = tree.root.find(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
    await act(async () => {
      node.props.onPress();
    });
  };
  // Buttons without an accessibility label are found by their visible text: find the
  // text, then press the nearest ancestor that handles presses.
  const pressText = async (label: string) => {
    const textNode = tree.root.findAll(
      n => n.children.length === 1 && typeof n.children[0] === 'string' && (n.children[0] as string).trim() === label,
    )[0];
    let target: renderer.ReactTestInstance | null = textNode;
    while (target && typeof target.props.onPress !== 'function') target = target.parent;
    await act(async () => {
      target!.props.onPress();
    });
  };
  const type = async (placeholder: string, value: string) => {
    const input = tree.root.find(n => n.props.placeholder === placeholder && typeof n.props.onChangeText === 'function');
    await act(async () => {
      input.props.onChangeText(value);
    });
  };
  return { tree, text, press, pressText, type };
};

beforeEach(() => {
  Object.values(mockAuth).forEach(fn => fn.mockReset());
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('Forgot password is easy to find', () => {
  it('is on the first screen, before choosing how to sign in', async () => {
    const { text, press } = await mount();
    expect(text()).toContain('Forgot password?');
    await press('Forgot password');
    expect(text()).toContain('Send Reset Code');
  });

  it('sits under the password field on the Sign In form', async () => {
    const { text, pressText, press } = await mount();
    await pressText('Sign in');
    expect(text()).toContain('Welcome');
    expect(text()).toContain('Forgot password?');
    await press('Forgot password');
    expect(text()).toContain('Send Reset Code');
  });

  it('is not shown on the Create Account form, where it would only confuse', async () => {
    const { text, pressText } = await mount();
    await pressText('Create Account');
    expect(text()).toContain('Create');
    expect(text()).not.toContain('Forgot password?');
  });

  it('is offered when the password is wrong, and leads to the reset screen', async () => {
    mockAuth.signInWithEmail.mockRejectedValue(new Error('Invalid login credentials'));
    const { text, pressText, type } = await mount();
    await pressText('Sign in');
    await type('Email address', 'a@b.co');
    await type('Password', 'nope');
    await pressText('Sign In');

    expect(alertSpy).toHaveBeenCalledTimes(1);
    const [title, , buttons] = alertSpy.mock.calls[0];
    expect(title).toBe('Incorrect email or password');
    expect((buttons as any[]).map(b => b.text)).toEqual(['Try again', 'Reset password']);

    await act(async () => {
      (buttons as any[]).find(b => b.text === 'Reset password').onPress();
    });
    expect(text()).toContain('Send Reset Code');
  });

  it('keeps the plain error for other failures', async () => {
    mockAuth.signInWithEmail.mockRejectedValue(new Error('Network request failed'));
    const { pressText, type } = await mount();
    await pressText('Sign in');
    await type('Email address', 'a@b.co');
    await type('Password', 'pw');
    await pressText('Sign In');
    expect(alertSpy).toHaveBeenCalledWith('Error', 'Network request failed');
  });

  it('asks for the code and a new password after the code is sent', async () => {
    mockAuth.requestPasswordReset.mockResolvedValue(undefined);
    const { tree, text, press, pressText, type } = await mount();
    await press('Forgot password');
    await type('Email address', 'a@b.co');
    await pressText('Send Reset Code');

    expect(mockAuth.requestPasswordReset).toHaveBeenCalledWith('a@b.co');
    expect(text()).toContain('Reset Password');
    // The code step asks for the emailed code and a new password.
    const placeholders = tree.root
      .findAll(n => typeof n.props.placeholder === 'string' && typeof n.props.onChangeText === 'function')
      .map(n => n.props.placeholder as string);
    expect(placeholders.some(p => /code/i.test(p))).toBe(true);
    expect(placeholders.some(p => /password/i.test(p))).toBe(true);
  });
});
