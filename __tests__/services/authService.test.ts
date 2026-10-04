const mockResetForEmail = jest.fn();
const mockVerifyOtp = jest.fn();
const mockUpdateUser = jest.fn();
const mockSignOut = jest.fn();
const mockClearCache = jest.fn();
const mockSignInWithIdToken = jest.fn();
const mockClearPersonal = jest.fn();
const mockStash = jest.fn();
const mockAdopt = jest.fn();
const mockUserId = jest.fn();

jest.mock('../../src/config/supabase', () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: (...a: any[]) => mockResetForEmail(...a),
      verifyOtp: (...a: any[]) => mockVerifyOtp(...a),
      updateUser: (...a: any[]) => mockUpdateUser(...a),
      signOut: (...a: any[]) => mockSignOut(...a),
      signInWithIdToken: (...a: any[]) => mockSignInWithIdToken(...a),
    },
  },
}));
jest.mock('../../src/services/imageUrls', () => ({ clearSignedImageCache: () => mockClearCache() }));
jest.mock('../../src/services/localData', () => ({
  clearPersonalLocalData: () => mockClearPersonal(),
  stashPersonalLocalData: (...a: any[]) => mockStash(...a),
  adoptPersonalLocalData: (...a: any[]) => mockAdopt(...a),
}));
jest.mock('../../src/services/authUser', () => ({ getAuthUserId: () => mockUserId() }));

import { requestPasswordReset, resetPasswordWithCode, signInWithApple, signInWithGoogle, signOut } from '../../src/services/authService';

beforeEach(() => {
  [mockResetForEmail, mockVerifyOtp, mockUpdateUser, mockSignOut, mockClearCache, mockSignInWithIdToken, mockClearPersonal, mockStash, mockAdopt, mockUserId].forEach(m => m.mockReset());
  mockClearPersonal.mockResolvedValue(undefined);
  mockStash.mockResolvedValue(undefined);
  mockAdopt.mockResolvedValue(undefined);
  mockUserId.mockResolvedValue(null);
});

describe('password reset by emailed code', () => {
  it('requests a code for the trimmed email', async () => {
    mockResetForEmail.mockResolvedValue({ error: null });
    await requestPasswordReset('  me@example.com ');
    expect(mockResetForEmail).toHaveBeenCalledWith('me@example.com');
  });

  it('surfaces a failure to send the code', async () => {
    mockResetForEmail.mockResolvedValue({ error: new Error('rate limit') });
    await expect(requestPasswordReset('a@b.co')).rejects.toThrow('rate limit');
  });

  it('verifies the code as a recovery token, then sets the new password', async () => {
    mockVerifyOtp.mockResolvedValue({ data: { session: { access_token: 't' } }, error: null });
    mockUpdateUser.mockResolvedValue({ error: null });
    const data = await resetPasswordWithCode(' me@example.com', ' 123456 ', 'newpass1');
    expect(mockVerifyOtp).toHaveBeenCalledWith({ email: 'me@example.com', token: '123456', type: 'recovery' });
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'newpass1' });
    expect(data.session).toBeTruthy();
  });

  it('does not change the password when the code is wrong or expired', async () => {
    mockVerifyOtp.mockResolvedValue({ data: {}, error: new Error('Token has expired or is invalid') });
    await expect(resetPasswordWithCode('a@b.co', '000000', 'newpass1')).rejects.toThrow('expired or is invalid');
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('reports a failure to save the new password', async () => {
    mockVerifyOtp.mockResolvedValue({ data: { session: {} }, error: null });
    mockUpdateUser.mockResolvedValue({ error: new Error('weak password') });
    await expect(resetPasswordWithCode('a@b.co', '123456', 'x')).rejects.toThrow('weak password');
  });
});

describe('signOut', () => {
  it('clears the cached signed photo links even when sign-out reports an error', async () => {
    mockSignOut.mockResolvedValue({ error: new Error('network') });
    await expect(signOut()).rejects.toThrow('network');
    expect(mockClearCache).toHaveBeenCalledTimes(1);
  });

  it("files the person's on-device data under their id after the session is gone", async () => {
    const order: string[] = [];
    mockUserId.mockResolvedValue('u1');
    mockSignOut.mockImplementation(async () => { order.push('supabase'); return { error: null }; });
    mockStash.mockImplementation(async () => { order.push('stash'); });
    await signOut();
    expect(order).toEqual(['supabase', 'stash']);
    expect(mockStash).toHaveBeenCalledWith('u1');
    expect(mockClearPersonal).not.toHaveBeenCalled();
  });

  it('wipes it when nobody is known to be signed in', async () => {
    mockSignOut.mockResolvedValue({ error: null });
    mockUserId.mockResolvedValue(null);
    await signOut();
    expect(mockClearPersonal).toHaveBeenCalledTimes(1);
    expect(mockStash).not.toHaveBeenCalled();
  });

  it('still files it when sign-out reports an error but no login remains', async () => {
    mockUserId.mockResolvedValueOnce('u1').mockResolvedValue(null);
    mockSignOut.mockResolvedValue({ error: new Error('network') });
    await expect(signOut()).rejects.toThrow('network');
    expect(mockStash).toHaveBeenCalledWith('u1');
  });

  it('still files it when the sign-out call itself throws and no login remains', async () => {
    mockUserId.mockResolvedValueOnce('u1').mockResolvedValue(null);
    mockSignOut.mockRejectedValue(new Error('boom'));
    await expect(signOut()).rejects.toThrow('boom');
    expect(mockClearCache).toHaveBeenCalledTimes(1);
    expect(mockStash).toHaveBeenCalledWith('u1');
  });

  it('keeps their local data in place when sign-out fails and they are still signed in', async () => {
    mockSignOut.mockResolvedValue({ error: new Error('offline') });
    mockUserId.mockResolvedValue('u1');
    await expect(signOut()).rejects.toThrow('offline');
    expect(mockClearPersonal).not.toHaveBeenCalled();
    expect(mockStash).not.toHaveBeenCalled();
  });
});

describe('reset with a bad new password', () => {
  it('signs the user back out so a failed reset does not leave them signed in', async () => {
    mockVerifyOtp.mockResolvedValue({ data: { session: {} }, error: null });
    mockUpdateUser.mockResolvedValue({ error: new Error('weak password') });
    mockSignOut.mockResolvedValue({ error: null });
    await expect(resetPasswordWithCode('a@b.co', '123456', 'x')).rejects.toThrow('weak password');
    expect(mockSignOut).toHaveBeenCalled();
  });
});

describe('Google / Apple sign-in', () => {
  const { GoogleSignin } = require('@react-native-google-signin/google-signin');
  const { appleAuth } = require('@invertase/react-native-apple-authentication');

  it('Google: backing out of the sheet is not an error', async () => {
    GoogleSignin.signIn.mockResolvedValueOnce({ type: 'cancelled', data: null });
    await expect(signInWithGoogle()).resolves.toBeNull();
    GoogleSignin.signIn.mockRejectedValueOnce(Object.assign(new Error('cancelled'), { code: 'SIGN_IN_CANCELLED' }));
    await expect(signInWithGoogle()).resolves.toBeNull();
    expect(mockSignInWithIdToken).not.toHaveBeenCalled();
  });

  it('Google: a real failure still surfaces', async () => {
    GoogleSignin.signIn.mockRejectedValueOnce(new Error('network down'));
    await expect(signInWithGoogle()).rejects.toThrow('network down');
  });

  it('Google: exchanges the id token for a session and restores that account\'s on-device data', async () => {
    GoogleSignin.signIn.mockResolvedValueOnce({ data: { idToken: 'g-token' } });
    mockSignInWithIdToken.mockResolvedValue({ data: { session: { access_token: 'a', user: { id: 'u9' } }, user: { id: 'u9' } }, error: null });
    const data = await signInWithGoogle();
    expect(mockSignInWithIdToken).toHaveBeenCalledWith({ provider: 'google', token: 'g-token' });
    expect(data?.session).toBeTruthy();
    expect(mockAdopt).toHaveBeenCalledWith('u9');
  });

  it('Apple: backing out of the sheet is not an error', async () => {
    appleAuth.performRequest.mockRejectedValueOnce(Object.assign(new Error('The user canceled the authorization attempt'), { code: '1001' }));
    await expect(signInWithApple()).resolves.toBeNull();
    expect(mockSignInWithIdToken).not.toHaveBeenCalled();
  });

  it('Apple: keeps the name Apple shares on first sign-in', async () => {
    appleAuth.performRequest.mockResolvedValueOnce({ identityToken: 'a-token', fullName: { givenName: 'Ada', familyName: 'Lovelace' } });
    mockSignInWithIdToken.mockResolvedValue({ data: { session: {}, user: { user_metadata: {} } }, error: null });
    mockUpdateUser.mockResolvedValue({ error: null });
    await signInWithApple();
    expect(mockUpdateUser).toHaveBeenCalledWith({ data: { name: 'Ada Lovelace', full_name: 'Ada Lovelace' } });
  });

  it('Apple: does not overwrite a name the user already has (Apple omits it on later sign-ins)', async () => {
    appleAuth.performRequest.mockResolvedValueOnce({ identityToken: 'a-token', fullName: { givenName: null, familyName: null } });
    mockSignInWithIdToken.mockResolvedValue({ data: { session: {}, user: { user_metadata: { name: 'Ada' } } }, error: null });
    await signInWithApple();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });
});
