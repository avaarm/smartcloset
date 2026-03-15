# SmartCloset iOS Deployment Guide

Complete guide for running SmartCloset on physical iPhones - both your own device and distributing to others.

## Table of Contents
1. [Running on Your Own iPhone](#running-on-your-own-iphone)
2. [Distributing to Other People (TestFlight)](#distributing-to-other-people-testflight)
3. [App Store Submission](#app-store-submission)
4. [Troubleshooting](#troubleshooting)

---

## Running on Your Own iPhone

### Prerequisites
- Mac with Xcode installed
- Apple ID (free account works for personal testing)
- iPhone with USB cable
- iOS 13.0 or later on your iPhone

### Step 1: Set Up Apple Developer Account

**For Free Development (Personal Use Only):**
1. Open Xcode
2. Go to **Xcode > Preferences > Accounts**
3. Click the **+** button and select **Apple ID**
4. Sign in with your Apple ID
5. Your account will appear as "Personal Team"

**For Distribution to Others:**
- You'll need to enroll in the [Apple Developer Program](https://developer.apple.com/programs/) ($99/year)

### Step 2: Configure Project Signing

1. **Open the project in Xcode:**
   ```bash
   cd /Users/armenuhi/Programming/smartcloset
   open ios/smartcloset.xcworkspace
   ```

2. **Select the project in Xcode:**
   - Click on `smartcloset` in the Project Navigator (left sidebar)
   - Select the `smartcloset` target under TARGETS

3. **Configure Signing & Capabilities:**
   - Go to the **Signing & Capabilities** tab
   - **Automatically manage signing:** Check this box
   - **Team:** Select your Apple ID / Personal Team
   - **Bundle Identifier:** Change to something unique like `com.yourname.smartcloset`
     - Must be unique across all iOS apps
     - Use lowercase letters, numbers, and hyphens only

4. **Repeat for other targets if needed:**
   - Select `smartclosetTests` target
   - Apply the same team and signing settings

### Step 3: Connect Your iPhone

1. **Connect iPhone to Mac via USB cable**

2. **Trust your Mac on iPhone:**
   - Unlock your iPhone
   - Tap "Trust" when prompted
   - Enter your iPhone passcode

3. **Select your device in Xcode:**
   - At the top of Xcode, click the device dropdown (next to the Run button)
   - Select your iPhone from the list (it should appear under "iOS Device")

### Step 4: Build and Run

1. **Click the Run button (▶️) in Xcode** or press `Cmd + R`

2. **First time only - Trust Developer on iPhone:**
   - The app will install but won't open immediately
   - On your iPhone, go to **Settings > General > VPN & Device Management**
   - Tap your Apple ID under "Developer App"
   - Tap **Trust "[Your Apple ID]"**
   - Tap **Trust** in the confirmation dialog

3. **Run again:**
   - Click Run in Xcode again
   - The app should now launch on your iPhone!

### Step 5: Keep the App Running

**Important Notes:**
- Free Apple ID apps expire after **7 days**
- You'll need to rebuild and reinstall every week
- Paid Developer Program apps last **1 year**

**To reinstall after expiration:**
```bash
cd /Users/armenuhi/Programming/smartcloset
npx react-native run-ios --device "Your iPhone Name"
```

---

## Distributing to Other People (TestFlight)

TestFlight allows you to distribute your app to up to **100 testers** before App Store submission.

### Prerequisites
- **Apple Developer Program membership** ($99/year) - Required!
- Xcode installed
- App Store Connect access

### Step 1: Enroll in Apple Developer Program

1. Go to [developer.apple.com/programs](https://developer.apple.com/programs/)
2. Click **Enroll**
3. Sign in with your Apple ID
4. Complete enrollment (requires payment of $99/year)
5. Wait for approval (usually 24-48 hours)

### Step 2: Create App in App Store Connect

1. **Go to [App Store Connect](https://appstoreconnect.apple.com/)**

2. **Create a new app:**
   - Click **My Apps**
   - Click the **+** button
   - Select **New App**

3. **Fill in app information:**
   - **Platform:** iOS
   - **Name:** SmartCloset (or your preferred name)
   - **Primary Language:** English
   - **Bundle ID:** Select the bundle ID you created (or create new)
   - **SKU:** Any unique identifier (e.g., `smartcloset-001`)
   - **User Access:** Full Access

4. Click **Create**

### Step 3: Configure Xcode for Distribution

1. **Open project in Xcode:**
   ```bash
   open ios/smartcloset.xcworkspace
   ```

2. **Update signing for Release:**
   - Select the `smartcloset` target
   - Go to **Signing & Capabilities**
   - Under **Release** configuration:
     - Team: Select your paid Developer Team
     - Automatically manage signing: ✓ Checked

3. **Set the version and build number:**
   - Select the project (not target)
   - Go to **General** tab
   - **Version:** 1.0.0 (or your version)
   - **Build:** 1 (increment for each upload)

### Step 4: Archive and Upload

1. **Select "Any iOS Device" as the build destination:**
   - Click the device dropdown at the top
   - Select **Any iOS Device (arm64)**

2. **Archive the app:**
   - Go to **Product > Archive** in Xcode menu
   - Wait for the archive to complete (5-10 minutes)

3. **Upload to App Store Connect:**
   - The Organizer window will open automatically
   - Select your archive
   - Click **Distribute App**
   - Select **App Store Connect**
   - Click **Next**
   - Select **Upload**
   - Click **Next** through the options (keep defaults)
   - Click **Upload**
   - Wait for upload to complete

4. **Wait for processing:**
   - Go to [App Store Connect](https://appstoreconnect.apple.com/)
   - Select your app
   - Go to **TestFlight** tab
   - Your build will appear in ~5-15 minutes after processing

### Step 5: Add Testers

**Internal Testing (up to 100 Apple Developer Program members):**
1. In App Store Connect, go to **TestFlight > Internal Testing**
2. Click **+** to create a new group
3. Add testers by email (must be added to your team first)

**External Testing (up to 10,000 testers):**
1. Go to **TestFlight > External Testing**
2. Click **+** to create a new group
3. Add the build you uploaded
4. Add testers by email
5. **Submit for Beta Review** (required, takes 24-48 hours)
6. Once approved, testers will receive an email invitation

**Testers will:**
1. Receive an email invitation
2. Download **TestFlight** app from App Store
3. Open the invitation link
4. Install SmartCloset through TestFlight
5. The app will update automatically when you upload new builds

### Step 6: Upload New Versions

When you make updates:

1. **Increment the build number:**
   - In Xcode, go to General tab
   - Increase **Build** number (e.g., 1 → 2 → 3)
   - Version can stay the same for TestFlight

2. **Archive and upload again** (repeat Step 4)

3. **Testers automatically get updates** through TestFlight

---

## App Store Submission

To make SmartCloset available to everyone on the App Store:

### Prerequisites
- Apple Developer Program membership
- App tested via TestFlight
- App Store assets prepared (screenshots, description, etc.)

### Step 1: Prepare App Store Assets

**Required Screenshots:**
- iPhone 6.7" (iPhone 15 Pro Max): 1290 x 2796 pixels
- iPhone 6.5" (iPhone 14 Plus): 1284 x 2778 pixels
- At least 3-5 screenshots showing key features

**App Icon:**
- 1024 x 1024 pixels
- PNG format, no transparency
- Already in `ios/smartcloset/Images.xcassets/AppIcon.appiconset/`

**App Information:**
- App name (30 characters max)
- Subtitle (30 characters max)
- Description (4000 characters max)
- Keywords (100 characters max)
- Privacy Policy URL (required if you collect any data)
- Support URL

### Step 2: Configure App Store Connect

1. **Go to your app in App Store Connect**

2. **Fill in App Information:**
   - Go to **App Information** section
   - Add Privacy Policy URL
   - Add Support URL
   - Select category (Lifestyle or Shopping)
   - Set age rating

3. **Prepare for Submission:**
   - Go to **1.0 Prepare for Submission**
   - Add screenshots for each device size
   - Write app description
   - Add keywords
   - Set pricing (Free or Paid)

### Step 3: Submit for Review

1. **Select your build:**
   - In the **Build** section, click **+**
   - Select the build you uploaded via TestFlight

2. **Complete all required fields:**
   - Review all sections (marked with ⚠️ if incomplete)
   - Add App Review Information (contact info)
   - Add demo account if app requires login

3. **Submit for Review:**
   - Click **Submit for Review**
   - Answer export compliance questions
   - Confirm submission

4. **Wait for review:**
   - Initial review: 24-48 hours
   - You'll receive email updates on status
   - App can be **Approved**, **Rejected**, or need **Metadata Rejected**

### Step 4: After Approval

Once approved:
- App status changes to **Ready for Sale**
- App appears on App Store within 24 hours
- Users can download it worldwide
- You can release updates anytime

---

## Quick Command Reference

### Run on Connected iPhone
```bash
# List connected devices
xcrun simctl list devices

# Run on physical device
npx react-native run-ios --device "Your iPhone Name"
```

### Build for TestFlight/App Store
```bash
# Clean build folder
cd ios
rm -rf build
cd ..

# Install dependencies
npm install
cd ios && pod install && cd ..

# Archive in Xcode
# Product > Archive
```

### Update Version Numbers
```bash
# Edit in Xcode or manually in ios/smartcloset/Info.plist
# CFBundleShortVersionString = Version (e.g., 1.0.0)
# CFBundleVersion = Build (e.g., 1, 2, 3...)
```

---

## Troubleshooting

### "Untrusted Developer" Error
**Problem:** App won't open on iPhone  
**Solution:**
1. Go to Settings > General > VPN & Device Management
2. Tap your Apple ID
3. Tap Trust

### "Code Signing Error"
**Problem:** Can't build to device  
**Solution:**
1. Check Bundle Identifier is unique
2. Verify Team is selected in Signing & Capabilities
3. Try toggling "Automatically manage signing" off and on

### "App Expired" After 7 Days
**Problem:** Free developer account apps expire  
**Solution:**
- Rebuild and reinstall from Xcode
- Or upgrade to paid Developer Program ($99/year)

### "No Devices Found"
**Problem:** iPhone not showing in Xcode  
**Solution:**
1. Unlock iPhone
2. Trust computer when prompted
3. Restart Xcode
4. Check cable connection

### Build Failed in Xcode
**Problem:** Archive fails  
**Solution:**
```bash
# Clean build
cd ios
rm -rf build
rm -rf ~/Library/Developer/Xcode/DerivedData
pod deintegrate
pod install
cd ..

# Try archive again
```

### TestFlight Build Not Appearing
**Problem:** Upload succeeded but build not showing  
**Solution:**
- Wait 15-30 minutes for processing
- Check for email about processing issues
- Verify build number is unique (not previously used)

---

## Cost Summary

| Option | Cost | Duration | Users | Notes |
|--------|------|----------|-------|-------|
| **Free Apple ID** | $0 | 7 days | 1 (you only) | App expires weekly, must rebuild |
| **Developer Program** | $99/year | 1 year | Unlimited | Required for TestFlight & App Store |
| **TestFlight** | Included | - | 10,000 testers | Requires Developer Program |
| **App Store** | Included | - | Unlimited | Requires Developer Program |

---

## Recommended Workflow

### For Personal Use Only
1. Use free Apple ID
2. Run directly from Xcode to your iPhone
3. Rebuild weekly when app expires

### For Sharing with Friends/Testers (< 100 people)
1. Enroll in Apple Developer Program ($99/year)
2. Use TestFlight for distribution
3. Testers get automatic updates

### For Public Release
1. Enroll in Apple Developer Program
2. Test thoroughly with TestFlight
3. Submit to App Store
4. Reach unlimited users worldwide

---

## Next Steps

1. **Try it on your iPhone first:**
   - Follow "Running on Your Own iPhone" section
   - Test all features on a real device

2. **If you want to share with others:**
   - Enroll in Apple Developer Program
   - Follow TestFlight distribution steps

3. **For App Store release:**
   - Prepare marketing materials
   - Create screenshots
   - Write compelling description
   - Submit for review

---

## Additional Resources

- [Apple Developer Documentation](https://developer.apple.com/documentation/)
- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [TestFlight Documentation](https://developer.apple.com/testflight/)
- [React Native iOS Guide](https://reactnative.dev/docs/running-on-device)
- [App Store Connect Help](https://help.apple.com/app-store-connect/)

---

## Support

If you encounter issues:
1. Check the Troubleshooting section above
2. Review Xcode error messages carefully
3. Check React Native documentation
4. Search for specific error messages online

Good luck with your deployment! 🚀
