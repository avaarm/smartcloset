# Google Vision API Setup Guide

## 1. Google Cloud Console Setup

### Step 1: Create Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Note your Project ID (you'll need this)  smartcloset-467817

### Step 2: Enable APIs
Enable these APIs in your project:
- **Vision API** (for image analysis)
- **Product Search API** (for finding similar products)
- **Cloud Storage API** (for image storage)

```bash
# Enable APIs via CLI (optional)
gcloud services enable vision.googleapis.com
gcloud services enable cloudsearch.googleapis.com
gcloud services enable storage.googleapis.com
```

### Step 3: Create Service Account
1. Go to IAM & Admin > Service Accounts
2. Click "Create Service Account"
3. Name: `smartcloset-vision`
4. Grant roles:
   - Vision API User
   - Storage Object Viewer
   - Product Search Editor

### Step 4: Generate API Key
1. Go to APIs & Services > Credentials
2. Click "Create Credentials" > API Key
3. Restrict the key to Vision API only
4. Copy the API key

## 2. Product Search Setup (Optional but Recommended)

### Create Product Set for Fashion Items
```bash
# Set your project ID
export PROJECT_ID="your-project-id"
export LOCATION="us-west1"

# Create product set
curl -X POST \
  -H "Authorization: Bearer $(gcloud auth application-default print-access-token)" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{
    "display_name": "fashion-products",
    "product_set_id": "fashion-products"
  }' \
  "https://vision.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/productSets"
```

## 3. Environment Configuration

Create `.env` file in your project root:
```env
GOOGLE_VISION_API_KEY=your-api-key-here
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_VISION_LOCATION=us-west1
PRODUCT_SET_ID=fashion-products
```

## 4. iOS Configuration

Add to `ios/smartcloset/Info.plist`:
```xml
<key>NSCameraUsageDescription</key>
<string>SmartCloset uses your camera to analyze clothing items and provide smart suggestions</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>SmartCloset accesses your photo library to analyze clothing images</string>
```

## 5. Android Configuration

Add to `android/app/src/main/AndroidManifest.xml`:
```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.INTERNET" />
```

## 6. Testing Your Setup

Use the test function in the app to verify everything works:
```typescript
import GoogleVisionService from './src/services/googleVisionService';

const visionService = new GoogleVisionService();
const result = await visionService.testConnection();
console.log('Google Vision API Status:', result);
```

## 7. Cost Optimization Tips

- **Image Optimization**: Resize images to max 1024x1024 before sending
- **Feature Selection**: Only request features you need
- **Caching**: Cache results locally to avoid repeated API calls
- **Batch Processing**: Process multiple images in single request when possible

## 8. Rate Limits & Quotas

- **Vision API**: 1,800 requests per minute
- **Product Search**: 600 requests per minute
- **Monthly Free Tier**: 1,000 requests per month

Monitor usage in Google Cloud Console > APIs & Services > Quotas.
