import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  TouchableOpacity,
  StatusBar,
  SafeAreaView,
  Platform,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Ionicons';
import theme from '../styles/theme';

type SignInScreenProps = {
  onAccountSignIn: () => void;
  onGuestContinue: () => void;
};

const SignInScreen: React.FC<SignInScreenProps> = ({ onAccountSignIn, onGuestContinue }) => {
  const handleAccountAction = () => {
    onAccountSignIn();
  };

  const renderSocialButton = (
    label: string,
    iconName: string,
  ) => {
    return (
      <TouchableOpacity style={styles.socialButton} onPress={handleAccountAction}>
        <View style={styles.socialIconContainer}>
          <Icon name={iconName} size={20} color={theme.colors.text} />
        </View>
        <Text style={styles.socialLabel}>{label}</Text>
        <View style={{ width: 24 }} />
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.root}>
      <StatusBar
        barStyle={Platform.OS === 'ios' ? 'light-content' : 'light-content'}
        translucent
        backgroundColor="transparent"
      />
      <ImageBackground
        source={{
          uri: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=80',
        }}
        style={styles.backgroundImage}
      >
        <LinearGradient
          colors={["rgba(0,0,0,0.1)", "rgba(0,0,0,0.75)", "rgba(0,0,0,0.95)"]}
          style={styles.gradient}
        >
          <SafeAreaView style={styles.safeArea}>
            <View style={styles.headerContainer}>
              <Text style={styles.brandTitle}>SmartCloset</Text>
              <Text style={styles.subtitle}>
                Register today to start building a wardrobe you truly love.
              </Text>
            </View>

            <View style={styles.buttonsContainer}>
              {renderSocialButton('Continue with Apple', 'logo-apple')}
              {renderSocialButton('Continue with Google', 'logo-google')}
              {renderSocialButton('Continue with Facebook', 'logo-facebook')}

              <TouchableOpacity
                style={styles.emailButton}
                onPress={handleAccountAction}
              >
                <Text style={styles.emailButtonText}>Register with Email</Text>
              </TouchableOpacity>

              <View style={styles.footerTextContainer}>
                <Text style={styles.footerText}>Already have an account? </Text>
                <TouchableOpacity onPress={handleAccountAction}>
                  <Text style={styles.footerLink}>Log in</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity onPress={onGuestContinue} style={styles.registerLaterContainer}>
                <Text style={styles.registerLaterText}>Continue as guest</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </LinearGradient>
      </ImageBackground>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  backgroundImage: {
    flex: 1,
  },
  gradient: {
    flex: 1,
    justifyContent: 'space-between',
  },
  safeArea: {
    flex: 1,
    justifyContent: 'space-between',
  },
  headerContainer: {
    paddingHorizontal: 24,
    paddingTop: 40,
  },
  brandTitle: {
    fontSize: 32,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 20,
  },
  buttonsContainer: {
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  socialIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.04)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  socialLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  emailButton: {
    marginTop: 8,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.85)',
    paddingVertical: 14,
    alignItems: 'center',
  },
  emailButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  footerTextContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 18,
  },
  footerText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
  },
  footerLink: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  registerLaterContainer: {
    marginTop: 16,
    alignItems: 'center',
  },
  registerLaterText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    textDecorationLine: 'underline',
  },
});

export default SignInScreen;

