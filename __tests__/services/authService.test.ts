const mockResetForEmail = jest.fn();
const mockVerifyOtp = jest.fn();
const mockUpdateUser = jest.fn();
const mockSignOut = jest.fn();
const mockClearCache = jest.fn();

jest.mock('../../src/config/supabase', () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: (...a: any[]) => mockResetForEmail(...a),
      verifyOtp: (...a: any[]) => mockVerifyOtp(...a),
      updateUser: (...a: any[]) => mockUpdateUser(...a),
      signOut: (...a: any[]) => mockSignOut(...a),
    },
  },
}));
jest.mock('../../src/services/imageUrls', () => ({ clearSignedImageCache: () => mockClearCache() }));

import { requestPasswordReset, resetPasswordWithCode, signOut } from '../../src/services/authService';

beforeEach(() => {
  [mockResetForEmail, mockVerifyOtp, mockUpdateUser, mockSignOut, mockClearCache].forEach(m => m.mockReset());
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
});
