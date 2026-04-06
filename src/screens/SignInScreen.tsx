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
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {
  signInWithGoogle,
  signInWithApple,
  signInWithEmail,
  signUpWithEmail,
} from '../services/authService';
import { Session } from '@supabase/supabase-js';

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
      Alert.alert('Sign-In Error', error.message || 'Failed to sign in with Google');
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
        <StatusBar barStyle="light-content" />
        <SafeAreaView style={styles.safeArea}>
          <KeyboardAvoidingView
            style={styles.emailFormContainer}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <TouchableOpacity onPress={() => setShowEmailForm(false)} style={styles.backButton}>
              <Icon name="arrow-back" size={24} color="#FFFFFF" />
            </TouchableOpacity>

            <Text style={styles.brandTitle}>
              {isRegistering ? 'Create Account' : 'Welcome Back'}
            </Text>
            <Text style={styles.subtitle}>
              {isRegistering
                ? 'Sign up with your email address'
                : 'Sign in to your account'}
            </Text>

            {isRegistering && (
              <TextInput
                style={styles.textInput}
                placeholder="Name"
                placeholderTextColor="rgba(255,255,255,0.4)"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            )}
            <TextInput
              style={styles.textInput}
              placeholder="Email"
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TextInput
              style={styles.textInput}
              placeholder="Password"
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            <TouchableOpacity
              style={[styles.emailButton, loading && styles.disabledButton]}
              onPress={handleEmailSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.emailButtonText}>
                  {isRegistering ? 'Sign Up' : 'Sign In'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setIsRegistering(!isRegistering)}
              style={styles.toggleContainer}
            >
              <Text style={styles.footerText}>
                {isRegistering
                  ? 'Already have an account? '
                  : "Don't have an account? "}
              </Text>
              <Text style={styles.footerLink}>
                {isRegistering ? 'Sign In' : 'Sign Up'}
              </Text>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.headerContainer}>
          <Text style={styles.brandTitle}>SmartCloset</Text>
          <Text style={styles.subtitle}>
            Register today to start building a wardrobe you truly love.
          </Text>
        </View>

        <View style={styles.buttonsContainer}>
          <TouchableOpacity
            style={[styles.socialButton, loading && styles.disabledButton]}
            onPress={handleAppleSignIn}
            disabled={loading}
          >
            <Icon name="logo-apple" size={20} color="#111" />
            <Text style={styles.socialLabel}>Continue with Apple</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.socialButton, loading && styles.disabledButton]}
            onPress={handleGoogleSignIn}
            disabled={loading}
          >
            <Icon name="logo-google" size={20} color="#111" />
            <Text style={styles.socialLabel}>Continue with Google</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.emailButton, loading && styles.disabledButton]}
            onPress={() => { setShowEmailForm(true); setIsRegistering(true); }}
            disabled={loading}
          >
            <Text style={styles.emailButtonText}>Register with Email</Text>
          </TouchableOpacity>

          {loading && (
            <ActivityIndicator color="#8B7FD9" style={{ marginTop: 16 }} />
          )}

          <View style={styles.footerTextContainer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => { setShowEmailForm(true); setIsRegistering(false); }}>
              <Text style={styles.footerLink}>Log in</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={onGuestContinue} style={styles.guestContainer}>
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
    backgroundColor: '#1a1a2e',
  },
  safeArea: {
    flex: 1,
    justifyContent: 'space-between',
  },
  headerContainer: {
    paddingHorizontal: 24,
    paddingTop: 60,
  },
  brandTitle: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 12,
    fontSize: 16,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    lineHeight: 22,
  },
  buttonsContainer: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 16,
    marginBottom: 12,
    gap: 12,
  },
  socialLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
  },
  emailButton: {
    marginTop: 8,
    borderRadius: 12,
    backgroundColor: '#8B7FD9',
    paddingVertical: 16,
    alignItems: 'center',
  },
  emailButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  footerTextContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  footerText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
  },
  footerLink: {
    fontSize: 14,
    color: '#8B7FD9',
    fontWeight: '600',
  },
  guestContainer: {
    marginTop: 20,
    alignItems: 'center',
  },
  guestText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    textDecorationLine: 'underline',
  },
  emailFormContainer: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  backButton: {
    position: 'absolute',
    top: 16,
    left: 0,
    padding: 8,
  },
  textInput: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#FFFFFF',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  disabledButton: {
    opacity: 0.6,
  },
  toggleContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
});

export default SignInScreen;

