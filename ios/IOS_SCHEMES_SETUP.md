# iOS Build Schemes Setup for Multi-Environment

## 📱 **iOS Environment Configuration**

To support multiple environments in iOS, you need to create separate build schemes in Xcode.

### **Step 1: Open Xcode Project**

1. Open `ios/UserManagementApp.xcworkspace` in Xcode
2. Make sure you're using the workspace, not the xcodeproj

### **Step 2: Create Build Schemes**

#### **Duplicate Existing Scheme:**

1. **Product Menu** → **Scheme** → **Manage Schemes**
2. **Select** existing scheme → **Duplicate**
3. **Rename** to match environments:
   - `HospitalManagementDev` (Development)
   - `HospitalManagementStaging` (Staging)
   - `HospitalManagement` (Production - existing)

#### **Configure Build Settings:**

For **each scheme**, edit:

1. **Edit Scheme** → **Build** → **Pre-actions**
2. **Add New Run Script Action:**

```bash
# Development Scheme
echo ".env.development" > /tmp/envfile

# Staging Scheme
echo ".env.staging" > /tmp/envfile

# Production Scheme
echo ".env.production" > /tmp/envfile
```

### **Step 3: Update Info.plist**

Add environment-specific app names:

```xml
<!-- In ios/UserManagementApp/Info.plist -->
<key>CFBundleDisplayName</key>
<string>$(APP_DISPLAY_NAME)</string>

<key>CFBundleName</key>
<string>$(APP_NAME)</string>
```

### **Step 4: Configure Build Settings**

In Xcode **Build Settings**, add:

#### **Development Configuration:**

- `APP_NAME = Hospital Management Dev`
- `APP_DISPLAY_NAME = HospitalMgmt Dev`
- `PRODUCT_BUNDLE_IDENTIFIER = com.octusai.hospital.dev`

#### **Staging Configuration:**

- `APP_NAME = Hospital Management Staging`
- `APP_DISPLAY_NAME = HospitalMgmt Stage`
- `PRODUCT_BUNDLE_IDENTIFIER = com.octusai.hospital.staging`

#### **Production Configuration:**

- `APP_NAME = Hospital Management`
- `APP_DISPLAY_NAME = Hospital Management`
- `PRODUCT_BUNDLE_IDENTIFIER = com.octusai.hospital`

### **Step 5: Firebase Configuration**

For **each scheme**, configure Firebase:

1. **Add GoogleService-Info.plist files** for each environment
2. **Add Build Phase** to copy correct plist:

```bash
# Copy the right GoogleService-Info.plist based on scheme
if [ "${CONFIGURATION}" == "Debug-Dev" ] || [ "${CONFIGURATION}" == "Release-Dev" ]; then
    cp "${PROJECT_DIR}/Firebase/Dev/GoogleService-Info.plist" "${BUILT_PRODUCTS_DIR}/${PRODUCT_NAME}.app/GoogleService-Info.plist"
elif [ "${CONFIGURATION}" == "Debug-Staging" ] || [ "${CONFIGURATION}" == "Release-Staging" ]; then
    cp "${PROJECT_DIR}/Firebase/Staging/GoogleService-Info.plist" "${BUILT_PRODUCTS_DIR}/${PRODUCT_NAME}.app/GoogleService-Info.plist"
else
    cp "${PROJECT_DIR}/Firebase/Prod/GoogleService-Info.plist" "${BUILT_PRODUCTS_DIR}/${PRODUCT_NAME}.app/GoogleService-Info.plist"
fi
```

### **Step 6: Test iOS Schemes**

```bash
# Development
npm run ios:dev

# Staging
npm run ios:staging

# Production
npm run ios:prod
```

---

## 🔧 **Alternative: Automated iOS Setup**

If manual Xcode setup is complex, you can use:

### **react-native-schemes-manager**

```bash
npm install --save-dev react-native-schemes-manager
```

### **Fastlane Integration**

Create `ios/fastlane/Fastfile` for automated builds:

```ruby
platform :ios do
  desc "Build Development"
  lane :build_dev do
    build_app(
      scheme: "HospitalManagementDev",
      configuration: "Debug",
      export_method: "development"
    )
  end

  desc "Build Staging"
  lane :build_staging do
    build_app(
      scheme: "HospitalManagementStaging",
      configuration: "Release",
      export_method: "ad-hoc"
    )
  end

  desc "Build Production"
  lane :build_prod do
    build_app(
      scheme: "HospitalManagement",
      configuration: "Release",
      export_method: "app-store"
    )
  end
end
```

---

**Note**: The current implementation focuses on Android build variants. iOS schemes require Xcode configuration and are optional for the initial multi-environment setup.

