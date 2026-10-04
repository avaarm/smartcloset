import { supabase } from '../config/supabase';
import { Session, User } from '@supabase/supabase-js';
import { clearSignedImageCache } from './imageUrls';
import { adoptPersonalLocalData, clearPersonalLocalData, stashPersonalLocalData } from './localData';
import { getAuthUserId } from './authUser';

// Google and Apple native SDKs are loaded dynamically to avoid
// crashes when client IDs are not yet configured.

export const configureGoogleSignIn = () => {
  const { GoogleSignin } = require('@react-native-google-signin/google-signin');
  const { env } = require('../config/env');
  if (!env.GOOGLE_IOS_CLIENT_ID) return;
  GoogleSignin.configure({
    iosClientId: env.GOOGLE_IOS_CLIENT_ID,
    webClientId: env.GOOGLE_WEB_CLIENT_ID,
    scopes: ['email', 'profile'],
  });
};

// ─── Email Auth ───────────────────────────────────────────────────────────────

/** Gives a freshly signed-in account back what it saved on this device before. */
const adoptLocalData = async (data: { session?: Session | null; user?: User | null } | null) => {
  const uid = data?.session?.user?.id ?? data?.user?.id;
  if (uid && data?.session) await adoptPersonalLocalData(uid);
};

export const signInWithEmail = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  await adoptLocalData(data);
  return data;
};

export const signUpWithEmail = async (
  email: string,
  password: string,
  name?: string,
) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } },
  });
  if (error) throw error;
  await adoptLocalData(data);
  return data;
};

// ─── Password reset (emailed 6-digit code, no deep link needed) ───────────────

export const requestPasswordReset = async (email: string) => {
  // Supabase returns success whether or not the account exists, so this
  // doesn't reveal which emails are registered.
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
  if (error) throw error;
};

export const resetPasswordWithCode = async (
  email: string,
  code: string,
  newPassword: string,
) => {
  const { data, error } = await supabase.auth.verifyOtp({
    email: email.trim(),
    token: code.trim(),
    type: 'recovery',
  });
  if (error) throw error;
  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
  if (updateError) {
    // The code already signed them in. Don't leave a session behind for a reset
    // that failed (they'd think it worked and the old password still applies).
    try {
      await supabase.auth.signOut();
    } catch {
      // Best effort.
    }
    throw updateError;
  }
  await adoptLocalData(data);
  return data;
};

// ─── Google Auth ──────────────────────────────────────────────────────────────

/** True when the user dismissed the Google/Apple sheet themselves. Not an error. */
const isCancelled = (error: any): boolean => {
  const code = String(error?.code ?? '');
  // Google: SIGN_IN_CANCELLED ('-5' on iOS); Apple: ERR_REQUEST_CANCELED / '1001'.
  return code === 'SIGN_IN_CANCELLED' || code === '-5' || code === '1001' || code === 'ERR_REQUEST_CANCELED'
    || /canceled|cancelled/i.test(String(error?.message ?? ''));
};

/** Resolves to the session data, or null if the user backed out of the sheet. */
export const signInWithGoogle = async () => {
  // Dynamically require to avoid crash when no client IDs are set
  const { GoogleSignin } = require('@react-native-google-signin/google-signin');
  let signInResult: any;
  try {
    await GoogleSignin.hasPlayServices();
    signInResult = await GoogleSignin.signIn();
  } catch (error) {
    if (isCancelled(error)) return null;
    throw error;
  }
  if (signInResult?.type === 'cancelled') return null;
  const idToken = signInResult?.data?.idToken;
  if (!idToken) throw new Error('No Google ID token received');

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
  });
  if (error) throw error;
  await adoptLocalData(data);
  return data;
};

// ─── Apple Auth ───────────────────────────────────────────────────────────────

/** Resolves to the session data, or null if the user backed out of the sheet. */
export const signInWithApple = async () => {
  // Dynamically require to avoid crash if module isn't fully configured
  const { appleAuth } = require('@invertase/react-native-apple-authentication');
  let appleAuthResponse: any;
  try {
    appleAuthResponse = await appleAuth.performRequest({
      requestedOperation: appleAuth.Operation.LOGIN,
      requestedScopes: [appleAuth.Scope.EMAIL, appleAuth.Scope.FULL_NAME],
    });
  } catch (error) {
    if (isCancelled(error)) return null;
    throw error;
  }

  if (!appleAuthResponse.identityToken) {
    throw new Error('No Apple identity token received');
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: appleAuthResponse.identityToken,
  });
  if (error) throw error;
  await adoptLocalData(data);

  // Apple only shares the user's name the first time they authorise the app, and
  // not in the token itself - keep it now or the app never learns it.
  const fullName = [appleAuthResponse.fullName?.givenName, appleAuthResponse.fullName?.familyName]
    .filter(Boolean)
    .join(' ')
    .trim();
  if (fullName && !data?.user?.user_metadata?.name) {
    try {
      await supabase.auth.updateUser({ data: { name: fullName, full_name: fullName } });
    } catch {
      // Cosmetic: the name just falls back to the email prefix.
    }
  }
  return data;
};

// ─── Session Management ───────────────────────────────────────────────────────

export const signOut = async () => {
  // Known before signing out: it is who the on-device data gets filed under.
  const uid = await getAuthUserId();
  let error: unknown = null;
  try {
    ({ error } = await supabase.auth.signOut());
  } catch (e) {
    error = e;
  }
  await clearSignedImageCache();
  // When sign-out fails (e.g. offline) the session is kept and it is still the
  // same person's device, so only wipe their local data if no login remains.
  if (!error || !(await getAuthUserId())) {
    if (uid) await stashPersonalLocalData(uid);
    else await clearPersonalLocalData();
  }
  if (error) throw error;
};

export const getSession = async (): Promise<Session | null> => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
};

export const getCurrentUser = async (): Promise<User | null> => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
};

export const onAuthStateChange = (
  callback: (session: Session | null) => void,
) => {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
};
