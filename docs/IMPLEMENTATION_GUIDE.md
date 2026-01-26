# SmartCloset - Implementation Guide

## Quick Start for Production Deployment

### Prerequisites
- Node.js 18+ installed
- React Native development environment set up
- Firebase account
- Google Cloud Platform account
- Apple Developer account (for iOS)
- Google Play Developer account (for Android)

---

## Step 1: Firebase Setup

### 1.1 Create Firebase Project
```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize project
firebase init

# Select:
# - Firestore
# - Functions
# - Storage
# - Hosting
# - Authentication
```

### 1.2 Configure Firebase
```javascript
// src/config/firebase.ts
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);
```

### 1.3 Enable Authentication Methods
```bash
# In Firebase Console:
# 1. Go to Authentication > Sign-in method
# 2. Enable:
#    - Email/Password
#    - Google
#    - Apple (for iOS)
```

---

## Step 2: Google Cloud Setup

### 2.1 Enable Required APIs
```bash
# Enable Vision API
gcloud services enable vision.googleapis.com

# Enable Vertex AI
gcloud services enable aiplatform.googleapis.com

# Create service account
gcloud iam service-accounts create smartcloset-ai \
  --display-name="SmartCloset AI Service"

# Grant permissions
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:smartcloset-ai@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"

# Create and download key
gcloud iam service-accounts keys create ./service-account-key.json \
  --iam-account=smartcloset-ai@PROJECT_ID.iam.gserviceaccount.com
```

### 2.2 Configure Environment Variables
```bash
# .env
FIREBASE_API_KEY=your_api_key
FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_STORAGE_BUCKET=your_project.appspot.com
FIREBASE_MESSAGING_SENDER_ID=your_sender_id
FIREBASE_APP_ID=your_app_id

GOOGLE_CLOUD_PROJECT_ID=your_project_id
GOOGLE_APPLICATION_CREDENTIALS=./service-account-key.json

VERTEX_AI_LOCATION=us-central1
VISION_API_KEY=your_vision_api_key
```

---

## Step 3: Install Dependencies

```bash
# Core dependencies
npm install @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs
npm install @react-navigation/material-top-tabs react-native-tab-view
npm install firebase @react-native-firebase/app @react-native-firebase/auth
npm install @react-native-firebase/firestore @react-native-firebase/storage
npm install @react-native-firebase/functions

# State management
npm install @reduxjs/toolkit react-redux redux-persist

# UI components
npm install react-native-paper react-native-vector-icons
npm install react-native-linear-gradient react-native-reanimated

# Image handling
npm install react-native-image-picker react-native-fast-image
npm install react-native-image-resizer react-native-image-crop-picker

# Camera
npm install react-native-vision-camera

# Utilities
npm install axios date-fns lodash
npm install @react-native-async-storage/async-storage
npm install react-native-dotenv

# Development
npm install --save-dev @types/react @types/react-native
npm install --save-dev typescript @typescript-eslint/parser
npm install --save-dev jest @testing-library/react-native
npm install --save-dev detox

# iOS specific
cd ios && pod install && cd ..
```

---

## Step 4: Project Structure

```
smartcloset/
├── src/
│   ├── components/          # Reusable UI components
│   │   ├── ClothingItem.tsx
│   │   ├── OutfitCard.tsx
│   │   ├── FilterModal.tsx
│   │   └── ...
│   ├── screens/             # Screen components
│   │   ├── auth/
│   │   │   ├── LoginScreen.tsx
│   │   │   └── SignUpScreen.tsx
│   │   ├── wardrobe/
│   │   │   ├── WardrobeScreen.tsx
│   │   │   ├── AddClothingScreen.tsx
│   │   │   └── ItemDetailsScreen.tsx
│   │   ├── outfits/
│   │   │   ├── OutfitScreen.tsx
│   │   │   └── CreateOutfitScreen.tsx
│   │   └── wishlist/
│   │       └── WishlistScreen.tsx
│   ├── navigation/          # Navigation configuration
│   │   ├── AppNavigator.tsx
│   │   └── AuthNavigator.tsx
│   ├── services/            # Business logic & API calls
│   │   ├── auth/
│   │   │   └── AuthService.ts
│   │   ├── wardrobe/
│   │   │   ├── ClothingService.ts
│   │   │   └── WardrobeService.ts
│   │   ├── ai/
│   │   │   ├── VisionService.ts
│   │   │   └── OutfitAIService.ts
│   │   ├── storage/
│   │   │   └── StorageService.ts
│   │   └── wishlist/
│   │       └── WishlistService.ts
│   ├── store/               # Redux store
│   │   ├── slices/
│   │   │   ├── authSlice.ts
│   │   │   ├── wardrobeSlice.ts
│   │   │   └── outfitSlice.ts
│   │   └── store.ts
│   ├── types/               # TypeScript types
│   │   ├── models.ts
│   │   └── api.ts
│   ├── utils/               # Utility functions
│   │   ├── imageOptimizer.ts
│   │   ├── validators.ts
│   │   └── helpers.ts
│   ├── config/              # Configuration files
│   │   ├── firebase.ts
│   │   └── constants.ts
│   └── styles/              # Global styles
│       └── theme.ts
├── functions/               # Cloud Functions
│   ├── src/
│   │   ├── outfitSuggestions.ts
│   │   ├── imageAnalysis.ts
│   │   └── notifications.ts
│   └── package.json
├── docs/                    # Documentation
│   ├── ARCHITECTURE.md
│   └── API.md
├── __tests__/               # Tests
│   ├── unit/
│   ├── integration/
│   └── e2e/
└── package.json
```

---

## Step 5: Implement Core Services

### 5.1 Authentication Service
```typescript
// src/services/auth/AuthService.ts
import { 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth';
import { auth, db } from '../../config/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';

export class AuthService {
  async signUp(email: string, password: string, displayName: string) {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Create user profile in Firestore
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: user.email,
        displayName,
        createdAt: new Date(),
        preferences: {
          style: [],
          favoriteColors: [],
          sizes: {},
        },
        subscription: {
          tier: 'free',
        },
      });
      
      return user;
    } catch (error) {
      throw this.handleAuthError(error);
    }
  }
  
  async signIn(email: string, password: string) {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      return userCredential.user;
    } catch (error) {
      throw this.handleAuthError(error);
    }
  }
  
  async signInWithGoogle() {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      
      // Check if user profile exists
      const userDoc = await getDoc(doc(db, 'users', result.user.uid));
      if (!userDoc.exists()) {
        // Create profile for new Google user
        await setDoc(doc(db, 'users', result.user.uid), {
          uid: result.user.uid,
          email: result.user.email,
          displayName: result.user.displayName,
          photoURL: result.user.photoURL,
          createdAt: new Date(),
          preferences: {
            style: [],
            favoriteColors: [],
            sizes: {},
          },
          subscription: {
            tier: 'free',
          },
        });
      }
      
      return result.user;
    } catch (error) {
      throw this.handleAuthError(error);
    }
  }
  
  async signOut() {
    await signOut(auth);
  }
  
  private handleAuthError(error: any): Error {
    const errorMessages: Record<string, string> = {
      'auth/email-already-in-use': 'This email is already registered',
      'auth/invalid-email': 'Invalid email address',
      'auth/weak-password': 'Password should be at least 6 characters',
      'auth/user-not-found': 'No account found with this email',
      'auth/wrong-password': 'Incorrect password',
    };
    
    return new Error(errorMessages[error.code] || 'Authentication failed');
  }
}

export default new AuthService();
```

### 5.2 Vision Service (Google Cloud Vision API)
```typescript
// src/services/ai/VisionService.ts
import vision from '@google-cloud/vision';
import { ClothingCategory } from '../../types/models';

export class VisionService {
  private client: vision.ImageAnnotatorClient;
  
  constructor() {
    this.client = new vision.ImageAnnotatorClient({
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    });
  }
  
  async analyzeClothingImage(imageUri: string) {
    try {
      const [result] = await this.client.annotateImage({
        image: { source: { imageUri } },
        features: [
          { type: 'LABEL_DETECTION', maxResults: 10 },
          { type: 'IMAGE_PROPERTIES' },
          { type: 'TEXT_DETECTION' },
          { type: 'OBJECT_LOCALIZATION' },
          { type: 'WEB_DETECTION' },
        ],
      });
      
      return {
        category: this.extractCategory(result.labelAnnotations || []),
        name: this.generateName(result),
        brand: this.extractBrand(result.textAnnotations || []),
        colors: this.extractColors(result.imagePropertiesAnnotation),
        material: this.extractMaterial(result.labelAnnotations || []),
        pattern: this.extractPattern(result.labelAnnotations || []),
        confidence: this.calculateConfidence(result),
      };
    } catch (error) {
      console.error('Vision API error:', error);
      throw new Error('Failed to analyze image');
    }
  }
  
  private extractCategory(labels: any[]): ClothingCategory {
    const categoryKeywords = {
      tops: ['shirt', 'blouse', 't-shirt', 'top', 'sweater', 'hoodie'],
      bottoms: ['pants', 'jeans', 'trousers', 'shorts', 'skirt'],
      dresses: ['dress', 'gown', 'frock'],
      outerwear: ['jacket', 'coat', 'blazer', 'cardigan'],
      shoes: ['shoes', 'sneakers', 'boots', 'sandals', 'heels'],
      accessories: ['bag', 'purse', 'hat', 'scarf', 'belt', 'jewelry'],
    };
    
    for (const label of labels) {
      const desc = label.description.toLowerCase();
      for (const [category, keywords] of Object.entries(categoryKeywords)) {
        if (keywords.some(kw => desc.includes(kw)) && label.score > 0.7) {
          return category as ClothingCategory;
        }
      }
    }
    
    return ClothingCategory.TOPS;
  }
  
  private generateName(result: any): string {
    const labels = result.labelAnnotations || [];
    const topLabels = labels
      .filter((l: any) => l.score > 0.8)
      .slice(0, 3)
      .map((l: any) => l.description);
    
    return topLabels.join(' ') || 'Clothing Item';
  }
  
  private extractBrand(textAnnotations: any[]): string | null {
    const knownBrands = [
      'Nike', 'Adidas', 'Zara', 'H&M', 'Gucci', 'Prada', 'Chanel',
      'Louis Vuitton', 'Burberry', 'Ralph Lauren', 'Calvin Klein',
      // Add more brands
    ];
    
    const detectedText = textAnnotations
      .map(t => t.description)
      .join(' ');
    
    for (const brand of knownBrands) {
      if (detectedText.toLowerCase().includes(brand.toLowerCase())) {
        return brand;
      }
    }
    
    return null;
  }
  
  private extractColors(imageProps: any): string[] {
    if (!imageProps?.dominantColors?.colors) return [];
    
    return imageProps.dominantColors.colors
      .slice(0, 3)
      .map((c: any) => this.rgbToColorName(c.color));
  }
  
  private rgbToColorName(rgb: any): string {
    // Simple color mapping - can be enhanced
    const { red, green, blue } = rgb;
    
    if (red > 200 && green < 100 && blue < 100) return 'red';
    if (red < 100 && green > 200 && blue < 100) return 'green';
    if (red < 100 && green < 100 && blue > 200) return 'blue';
    if (red > 200 && green > 200 && blue < 100) return 'yellow';
    if (red > 200 && green < 100 && blue > 200) return 'purple';
    if (red < 100 && green > 200 && blue > 200) return 'cyan';
    if (red > 200 && green > 200 && blue > 200) return 'white';
    if (red < 50 && green < 50 && blue < 50) return 'black';
    
    return 'multicolor';
  }
  
  private extractMaterial(labels: any[]): string | null {
    const materials = ['cotton', 'silk', 'wool', 'leather', 'denim', 'polyester'];
    
    for (const label of labels) {
      const desc = label.description.toLowerCase();
      for (const material of materials) {
        if (desc.includes(material)) {
          return material;
        }
      }
    }
    
    return null;
  }
  
  private extractPattern(labels: any[]): string | null {
    const patterns = ['striped', 'plaid', 'floral', 'polka dot', 'solid'];
    
    for (const label of labels) {
      const desc = label.description.toLowerCase();
      for (const pattern of patterns) {
        if (desc.includes(pattern)) {
          return pattern;
        }
      }
    }
    
    return 'solid';
  }
  
  private calculateConfidence(result: any): number {
    const labels = result.labelAnnotations || [];
    if (labels.length === 0) return 0;
    
    const avgScore = labels.reduce((sum: number, l: any) => sum + l.score, 0) / labels.length;
    return Math.round(avgScore * 100);
  }
}

export default new VisionService();
```

### 5.3 Outfit AI Service (Vertex AI)
```typescript
// src/services/ai/OutfitAIService.ts
import { VertexAI } from '@google-cloud/aiplatform';
import { ClothingItem, OutfitSuggestion } from '../../types/models';

export class OutfitAIService {
  private client: VertexAI;
  
  constructor() {
    this.client = new VertexAI({
      project: process.env.GOOGLE_CLOUD_PROJECT_ID,
      location: process.env.VERTEX_AI_LOCATION || 'us-central1',
    });
  }
  
  async generateOutfitSuggestions(
    wardrobe: ClothingItem[],
    context: {
      occasion: string;
      season: string;
      weather?: string;
    }
  ): Promise<OutfitSuggestion[]> {
    const prompt = this.buildPrompt(wardrobe, context);
    
    try {
      const response = await this.client.predict({
        endpoint: 'projects/YOUR_PROJECT/locations/us-central1/endpoints/YOUR_ENDPOINT',
        instances: [{ content: prompt }],
      });
      
      return this.parseAIResponse(response, wardrobe);
    } catch (error) {
      console.error('Vertex AI error:', error);
      // Fallback to rule-based suggestions
      return this.generateRuleBasedOutfits(wardrobe, context);
    }
  }
  
  private buildPrompt(wardrobe: ClothingItem[], context: any): string {
    const itemDescriptions = wardrobe.map((item, idx) => 
      `${idx}: ${item.category} - ${item.color.join('/')} ${item.brand || ''}`
    ).join('\n');
    
    return `
You are a professional fashion stylist. Create 5 outfit combinations from these wardrobe items for ${context.occasion} in ${context.season}.

Wardrobe:
${itemDescriptions}

For each outfit, provide:
1. Item indices to combine (e.g., [0, 3, 7])
2. Style reasoning (why these items work together)
3. Confidence score (0-100)
4. Styling tips

Return as JSON array:
[
  {
    "items": [0, 3, 7],
    "reasoning": "...",
    "confidence": 85,
    "tips": ["...", "..."]
  }
]
    `.trim();
  }
  
  private parseAIResponse(response: any, wardrobe: ClothingItem[]): OutfitSuggestion[] {
    try {
      const suggestions = JSON.parse(response.predictions[0].content);
      
      return suggestions.map((s: any, idx: number) => ({
        id: `ai-${Date.now()}-${idx}`,
        name: `${s.reasoning.split('.')[0]}`,
        items: s.items.map((i: number) => wardrobe[i]),
        styleReasoning: s.reasoning,
        confidenceScore: s.confidence,
        stylingTips: s.tips,
        aiGenerated: true,
        createdAt: new Date(),
      }));
    } catch (error) {
      console.error('Failed to parse AI response:', error);
      return [];
    }
  }
  
  private generateRuleBasedOutfits(
    wardrobe: ClothingItem[],
    context: any
  ): OutfitSuggestion[] {
    // Fallback rule-based outfit generation
    const tops = wardrobe.filter(i => i.category === 'tops');
    const bottoms = wardrobe.filter(i => i.category === 'bottoms');
    const shoes = wardrobe.filter(i => i.category === 'shoes');
    
    const outfits: OutfitSuggestion[] = [];
    
    for (let i = 0; i < Math.min(5, tops.length); i++) {
      const top = tops[i];
      const bottom = bottoms[i % bottoms.length];
      const shoe = shoes[i % shoes.length];
      
      if (top && bottom) {
        outfits.push({
          id: `rule-${Date.now()}-${i}`,
          name: `${context.occasion} Outfit ${i + 1}`,
          items: [top, bottom, shoe].filter(Boolean),
          styleReasoning: `Classic ${context.occasion} combination`,
          confidenceScore: 70,
          stylingTips: ['Keep it simple', 'Accessorize as needed'],
          aiGenerated: false,
          createdAt: new Date(),
        } as OutfitSuggestion);
      }
    }
    
    return outfits;
  }
}

export default new OutfitAIService();
```

---

## Step 6: Deploy Cloud Functions

```typescript
// functions/src/index.ts
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import VisionService from './services/VisionService';
import OutfitAIService from './services/OutfitAIService';

admin.initializeApp();

export const analyzeClothingImage = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { imageUrl } = data;
  
  try {
    const analysis = await VisionService.analyzeClothingImage(imageUrl);
    return { success: true, analysis };
  } catch (error) {
    console.error('Image analysis failed:', error);
    throw new functions.https.HttpsError('internal', 'Failed to analyze image');
  }
});

export const generateOutfits = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { userId, occasion, season } = data;
  
  try {
    // Fetch user's wardrobe
    const wardrobeSnapshot = await admin.firestore()
      .collection('clothing')
      .where('userId', '==', userId)
      .where('isWishlist', '==', false)
      .get();
    
    const wardrobe = wardrobeSnapshot.docs.map(doc => doc.data());
    
    // Generate outfits
    const outfits = await OutfitAIService.generateOutfitSuggestions(
      wardrobe,
      { occasion, season }
    );
    
    return { success: true, outfits };
  } catch (error) {
    console.error('Outfit generation failed:', error);
    throw new functions.https.HttpsError('internal', 'Failed to generate outfits');
  }
});

// Deploy with: firebase deploy --only functions
```

---

## Step 7: Testing

```bash
# Run unit tests
npm test

# Run integration tests
npm run test:integration

# Run E2E tests
npm run test:e2e

# Check test coverage
npm run test:coverage
```

---

## Step 8: Deployment

### iOS Deployment
```bash
# Build for TestFlight
cd ios
fastlane beta

# Or manually
xcodebuild -workspace SmartCloset.xcworkspace \
  -scheme SmartCloset \
  -configuration Release \
  -archivePath build/SmartCloset.xcarchive \
  archive

# Upload to App Store Connect
```

### Android Deployment
```bash
# Build release APK
cd android
./gradlew assembleRelease

# Or build AAB for Play Store
./gradlew bundleRelease

# Upload to Play Console
fastlane beta
```

---

## Step 9: Monitoring & Maintenance

### Set up monitoring
```typescript
// src/utils/monitoring.ts
import analytics from '@react-native-firebase/analytics';
import crashlytics from '@react-native-firebase/crashlytics';

export const logEvent = (eventName: string, params?: object) => {
  analytics().logEvent(eventName, params);
};

export const logError = (error: Error) => {
  crashlytics().recordError(error);
};

export const setUser = (userId: string) => {
  analytics().setUserId(userId);
  crashlytics().setUserId(userId);
};
```

---

## Estimated Timeline

| Phase | Duration | Tasks |
|-------|----------|-------|
| Setup | 1 week | Firebase, GCP, dependencies |
| Auth | 1 week | Login, signup, profile |
| Upload | 2 weeks | Camera, Vision API, storage |
| Wardrobe | 2 weeks | CRUD, filters, search |
| AI Outfits | 3 weeks | Vertex AI, suggestions |
| Wishlist | 1 week | CRUD, budget tracking |
| Polish | 2 weeks | UI/UX, testing, optimization |
| **Total** | **12 weeks** | |

---

## Cost Breakdown (Monthly for 100 users)

| Service | Cost |
|---------|------|
| Firebase (Spark Plan) | Free |
| Firestore | ~$2 |
| Cloud Storage | ~$3 |
| Cloud Functions | ~$1 |
| Vision API | ~$5 |
| Vertex AI | ~$20 |
| **Total** | **~$31/month** |

---

## Success Checklist

- [ ] Firebase project configured
- [ ] Google Cloud APIs enabled
- [ ] Authentication working
- [ ] Image upload functional
- [ ] Vision API integration complete
- [ ] Outfit AI generating suggestions
- [ ] Wishlist CRUD operations
- [ ] Tests passing (>80% coverage)
- [ ] Performance optimized (<2s load time)
- [ ] Security rules deployed
- [ ] Monitoring active
- [ ] Documentation complete
- [ ] Beta testing completed
- [ ] App Store submission ready

---

*Ready to build! 🚀*
