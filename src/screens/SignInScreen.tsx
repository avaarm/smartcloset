import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {
  signInWithGoogle,
  signInWithApple,
  signInWithEmail,
  signUpWithEmail,
} from '../services/authService';
import { Session } from '@supabase/supabase-js';

const GOLD = '#C4975A';
const GOLD_LIGHT = '#D4A86A';
const BLACK = '#080604';
const SURFACE = '#0F0D0A';
const CREAM = '#F5EDE0';
const MUTED = 'rgba(245,237,224,0.45)';
const BORDER = 'rgba(196,151,90,0.25)';

type SignInScreenProps = {
  onSignInComplete?: (session: Session) => void;
  onGuestContinue: () => void;
};

const SignInScreen: React.FC<SignInScreenProps> = ({ onSignInComplete, onGuestContinue }) => {
  const [loading, setLoading] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [isRegistering, setIsRegistering] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      const result = await signInWithGoogle();
      if (result.session) onSignInComplete?.(result.session);
    } catch (error: any) {
      const msg: string = error?.message || '';
      const friendlyMessage =
        msg.includes('AuthenticationServices') || msg.includes('error 1000')
          ? 'Google Sign-In is not supported on this device. Please use Email or Sign in with Apple instead.'
          : msg || 'Failed to sign in with Google';
      Alert.alert('Sign-In Error', friendlyMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    setLoading(true);
    try {
      const result = await signInWithApple();
      if (result.session) onSignInComplete?.(result.session);
    } catch (error: any) {
      Alert.alert('Sign-In Error', error.message || 'Failed to sign in with Apple');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSubmit = async () => {
    if (!email || !password) {
      Alert.alert('Missing Fields', 'Please enter your email and password.');
      return;
    }
    if (isRegistering && !name.trim()) {
      Alert.alert('Missing Fields', 'Please enter your name.');
      return;
    }
    setLoading(true);
    try {
      if (isRegistering) {
        const result = await signUpWithEmail(email, password, name);
        if (result.session) {
          onSignInComplete?.(result.session);
        } else {
          Alert.alert('Check Your Email', 'We sent you a confirmation link. You can now sign in.');
          setIsRegistering(false);
        }
      } else {
        const result = await signInWithEmail(email, password);
        if (result.session) {
          onSignInComplete?.(result.session);
        }
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  if (showEmailForm) {
    return (
      <View style={styles.root}>
        <StatusBar barStyle="light-content" backgroundColor={BLACK} />
        <SafeAreaView style={styles.safeArea}>
          <KeyboardAvoidingView
            style={styles.emailFormContainer}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <TouchableOpacity onPress={() => setShowEmailForm(false)} style={styles.backButton} hitSlop={16}>
              <Icon name="arrow-back" size={22} color={CREAM} />
            </TouchableOpacity>

            <View style={styles.emailFormHeader}>
              <Text style={styles.goldAccentLine}>— Account</Text>
              <Text style={styles.emailFormTitle}>
                {isRegistering ? 'Create\nAccount' : 'Welcome\nBack'}
              </Text>
            </View>

            <View style={styles.formFields}>
              {isRegistering && (
                <TextInput
                  style={styles.textInput}
                  placeholder="Full name"
                  placeholderTextColor={MUTED}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                />
              )}
              <TextInput
                style={styles.textInput}
                placeholder="Email address"
                placeholderTextColor={MUTED}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <TextInput
                style={styles.textInput}
                placeholder="Password"
                placeholderTextColor={MUTED}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.disabledButton]}
              onPress={handleEmailSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={BLACK} />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {isRegistering ? 'Create Account' : 'Sign In'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setIsRegistering(!isRegistering)}
              style={styles.toggleContainer}
            >
              <Text style={styles.toggleText}>
                {isRegistering ? 'Already have an account?' : "Don't have an account?"}
                {'  '}
                <Text style={styles.toggleLink}>
                  {isRegistering ? 'Sign In' : 'Sign Up'}
                </Text>
              </Text>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={BLACK} />
      <SafeAreaView style={styles.safeArea}>
        {/* Hero */}
        <View style={styles.heroContainer}>
          <Text style={styles.heroAccent}>Est. 2024</Text>
          <Text style={styles.brandTitle}>Smart{'\n'}Closet</Text>
          <View style={styles.goldDivider} />
          <Text style={styles.heroSubtitle}>
            Your personal wardrobe,{'\n'}curated to perfection.
          </Text>
        </View>

        {/* Buttons */}
        <View style={styles.buttonsContainer}>
          <TouchableOpacity
            style={[styles.socialButton, loading && styles.disabledButton]}
            onPress={handleAppleSignIn}
            disabled={loading}
          >
            <Icon name="logo-apple" size={18} color={CREAM} />
            <Text style={styles.socialLabel}>Continue with Apple</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.socialButton, loading && styles.disabledButton]}
            onPress={handleGoogleSignIn}
            disabled={loading}
          >
            <Icon name="logo-google" size={18} color={CREAM} />
            <Text style={styles.socialLabel}>Continue with Google</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.disabledButton]}
            onPress={() => { setShowEmailForm(true); setIsRegistering(true); }}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color={BLACK} />
              : <Text style={styles.primaryButtonText}>Create Account</Text>
            }
          </TouchableOpacity>

          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Have an account?</Text>
            <TouchableOpacity onPress={() => { setShowEmailForm(true); setIsRegistering(false); }}>
              <Text style={styles.footerLink}>  Sign in</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={onGuestContinue} style={styles.guestButton}>
            <Text style={styles.guestText}>Continue as guest</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BLACK,
  },
  safeArea: {
    flex: 1,
    justifyContent: 'space-between',
  },

  // Hero section
  heroContainer: {
    paddingHorizontal: 32,
    paddingTop: 56,
  },
  heroAccent: {
    fontSize: 11,
    fontWeight: '500',
    color: GOLD,
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: 20,
  },
  brandTitle: {
    fontSize: 60,
    fontWeight: '300',
    color: CREAM,
    letterSpacing: -1,
    lineHeight: 64,
  },
  goldDivider: {
    width: 40,
    height: 1.5,
    backgroundColor: GOLD,
    marginTop: 24,
    marginBottom: 20,
  },
  heroSubtitle: {
    fontSize: 16,
    color: MUTED,
    lineHeight: 24,
    fontWeight: '300',
  },

  // Buttons section
  buttonsContainer: {
    paddingHorizontal: 24,
    paddingBottom: 44,
    gap: 12,
  },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SURFACE,
    borderRadius: 2,
    paddingVertical: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: BORDER,
  },
  socialLabel: {
    fontSize: 15,
    fontWeight: '400',
    color: CREAM,
    letterSpacing: 0.3,
  },
  primaryButton: {
    borderRadius: 2,
    backgroundColor: GOLD,
    paddingVertical: 17,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: BLACK,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  footerText: {
    fontSize: 14,
    color: MUTED,
  },
  footerLink: {
    fontSize: 14,
    color: GOLD_LIGHT,
    fontWeight: '500',
  },
  guestButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  guestText: {
    fontSize: 13,
    color: 'rgba(245,237,224,0.3)',
    letterSpacing: 0.3,
  },
  disabledButton: {
    opacity: 0.5,
  },

  // Email form
  emailFormContainer: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 40,
    justifyContent: 'center',
  },
  backButton: {
    position: 'absolute',
    top: 24,
    left: 20,
    padding: 8,
  },
  emailFormHeader: {
    marginBottom: 40,
  },
  goldAccentLine: {
    fontSize: 11,
    fontWeight: '500',
    color: GOLD,
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  emailFormTitle: {
    fontSize: 44,
    fontWeight: '300',
    color: CREAM,
    letterSpacing: -0.5,
    lineHeight: 50,
  },
  formFields: {
    gap: 12,
    marginBottom: 28,
  },
  textInput: {
    backgroundColor: SURFACE,
    borderRadius: 2,
    paddingVertical: 16,
    paddingHorizontal: 18,
    fontSize: 15,
    color: CREAM,
    borderWidth: 1,
    borderColor: BORDER,
  },
  toggleContainer: {
    alignItems: 'center',
    marginTop: 24,
  },
  toggleText: {
    fontSize: 14,
    color: MUTED,
    textAlign: 'center',
  },
  toggleLink: {
    color: GOLD_LIGHT,
    fontWeight: '500',
  },
});

export default SignInScreen;
