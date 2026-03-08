import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  SafeAreaView,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';

type SignInScreenProps = {
  onAccountSignIn: () => void;
  onGuestContinue: () => void;
};

const SignInScreen: React.FC<SignInScreenProps> = ({ onAccountSignIn, onGuestContinue }) => {
  const handleSignIn = (provider: string) => {
    Alert.alert(
      'Signed In',
      `You've signed in with ${provider}.`,
      [{ text: 'OK', onPress: onAccountSignIn }],
    );
  };

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
          <TouchableOpacity style={styles.socialButton} onPress={() => handleSignIn('Apple')}>
            <Icon name="logo-apple" size={20} color="#111" />
            <Text style={styles.socialLabel}>Continue with Apple</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.socialButton} onPress={() => handleSignIn('Google')}>
            <Icon name="logo-google" size={20} color="#111" />
            <Text style={styles.socialLabel}>Continue with Google</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.emailButton} onPress={() => handleSignIn('Email')}>
            <Text style={styles.emailButtonText}>Register with Email</Text>
          </TouchableOpacity>

          <View style={styles.footerTextContainer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => handleSignIn('Email')}>
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
});

export default SignInScreen;

