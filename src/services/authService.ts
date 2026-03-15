import { supabase } from '../config/supabase';
import { Session, User } from '@supabase/supabase-js';

// Google and Apple native SDKs are loaded dynamically to avoid
// crashes when client IDs are not yet configured.

export const configureGoogleSignIn = () => {
  // No-op until Google OAuth client IDs are added to .env
  // Once configured, uncomment the block in signInWithGoogle below.
};

// ─── Email Auth ───────────────────────────────────────────────────────────────

export const signInWithEmail = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
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
  return data;
};

// ─── Google Auth ──────────────────────────────────────────────────────────────

export const signInWithGoogle = async () => {
  // Dynamically require to avoid crash when no client IDs are set
  const { GoogleSignin } = require('@react-native-google-signin/google-signin');
  await GoogleSignin.hasPlayServices();
  const signInResult = await GoogleSignin.signIn();
  const idToken = signInResult?.data?.idToken;
  if (!idToken) throw new Error('No Google ID token received');

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
  });
  if (error) throw error;
  return data;
};

// ─── Apple Auth ───────────────────────────────────────────────────────────────

export const signInWithApple = async () => {
  // Dynamically require to avoid crash if module isn't fully configured
  const { appleAuth } = require('@invertase/react-native-apple-authentication');
  const appleAuthResponse = await appleAuth.performRequest({
    requestedOperation: appleAuth.Operation.LOGIN,
    requestedScopes: [appleAuth.Scope.EMAIL, appleAuth.Scope.FULL_NAME],
  });

  if (!appleAuthResponse.identityToken) {
    throw new Error('No Apple identity token received');
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: appleAuthResponse.identityToken,
  });
  if (error) throw error;
  return data;
};

// ─── Session Management ───────────────────────────────────────────────────────

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
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
