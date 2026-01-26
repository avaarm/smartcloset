import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  StatusBar,
} from 'react-native';

const { width, height } = Dimensions.get('window');

interface SplashScreenProps {
  onAnimationComplete: () => void;
}

const SplashScreen: React.FC<SplashScreenProps> = ({ onAnimationComplete }) => {
  const leftDoorAnim = useRef(new Animated.Value(0)).current;
  const rightDoorAnim = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textScale = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    // Start the animation sequence
    const animationSequence = Animated.sequence([
      // Wait a moment before starting
      Animated.delay(500),
      
      // Open the doors and fade in text simultaneously
      Animated.parallel([
        // Left door slides left
        Animated.timing(leftDoorAnim, {
          toValue: -width / 2,
          duration: 1200,
          useNativeDriver: true,
        }),
        // Right door slides right
        Animated.timing(rightDoorAnim, {
          toValue: width / 2,
          duration: 1200,
          useNativeDriver: true,
        }),
        // Text fades in and scales up
        Animated.sequence([
          Animated.delay(400), // Start text animation slightly after doors
          Animated.parallel([
            Animated.timing(textOpacity, {
              toValue: 1,
              duration: 800,
              useNativeDriver: true,
            }),
            Animated.timing(textScale, {
              toValue: 1,
              duration: 800,
              useNativeDriver: true,
            }),
          ]),
        ]),
      ]),
      
      // Hold for a moment
      Animated.delay(800),
    ]);

    animationSequence.start(() => {
      // Animation complete, notify parent
      onAnimationComplete();
    });
  }, [leftDoorAnim, rightDoorAnim, textOpacity, textScale, onAnimationComplete]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      
      {/* Background */}
      <View style={styles.background} />
      
      {/* Left Door */}
      <Animated.View
        style={[
          styles.door,
          styles.leftDoor,
          {
            transform: [{ translateX: leftDoorAnim }],
          },
        ]}
      >
        {/* Door handle */}
        <View style={[styles.doorHandle, styles.leftHandle]} />
        
        {/* Door panels */}
        <View style={styles.doorPanel} />
        <View style={[styles.doorPanel, styles.bottomPanel]} />
      </Animated.View>
      
      {/* Right Door */}
      <Animated.View
        style={[
          styles.door,
          styles.rightDoor,
          {
            transform: [{ translateX: rightDoorAnim }],
          },
        ]}
      >
        {/* Door handle */}
        <View style={[styles.doorHandle, styles.rightHandle]} />
        
        {/* Door panels */}
        <View style={styles.doorPanel} />
        <View style={[styles.doorPanel, styles.bottomPanel]} />
      </Animated.View>
      
      {/* Text that appears as doors open */}
      <Animated.View
        style={[
          styles.textContainer,
          {
            opacity: textOpacity,
            transform: [{ scale: textScale }],
          },
        ]}
      >
        <Text style={styles.mainText}>Your Closet</Text>
        <View style={styles.underline} />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  background: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1a1a1a',
  },
  door: {
    position: 'absolute',
    width: width / 2,
    height: height * 0.8,
    backgroundColor: '#000000',
    borderWidth: 2,
    borderColor: '#333333',
  },
  leftDoor: {
    left: 0,
    borderRightWidth: 1,
    borderRightColor: '#333333',
  },
  rightDoor: {
    right: 0,
    borderLeftWidth: 1,
    borderLeftColor: '#333333',
  },
  doorHandle: {
    position: 'absolute',
    width: 8,
    height: 40,
    backgroundColor: '#666666',
    borderRadius: 4,
    top: '50%',
    marginTop: -20,
  },
  leftHandle: {
    right: 20,
  },
  rightHandle: {
    left: 20,
  },
  doorPanel: {
    position: 'absolute',
    left: 20,
    right: 20,
    top: 40,
    height: height * 0.3,
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 4,
  },
  bottomPanel: {
    top: height * 0.3 + 80,
    height: height * 0.25,
  },
  textContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainText: {
    fontSize: 42,
    fontWeight: '300',
    color: '#FFFFFF',
    letterSpacing: 4,
    textAlign: 'center',
    fontFamily: 'System',
  },
  underline: {
    width: 120,
    height: 2,
    backgroundColor: '#FFFFFF',
    marginTop: 12,
    opacity: 0.8,
  },
});

export default SplashScreen;
