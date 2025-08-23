// Development Environment Configuration
module.exports = {
  ENVIRONMENT: 'development',
  APP_NAME: 'Hospital Management Dev',
  APP_DISPLAY_NAME: 'HospitalMgmt Dev',
  APP_BUNDLE_ID: 'com.octusai.hospital.dev',

  // API Configuration
  API_BASE_URL: 'http://localhost:3000/api',
  AUTH_API_BASE_URL: 'http://localhost:3000/api',
  API_TIMEOUT: '30000',

  // Firebase Configuration - Development Project
  FIREBASE_PROJECT_ID: 'docpad-6ff99-dev',
  FIREBASE_STORAGE_BUCKET: 'docpad-6ff99-dev.firebasestorage.app',
  FIREBASE_WEB_CLIENT_ID: 'YOUR_DEV_WEB_CLIENT_ID',

  // Features & Debug
  ENABLE_FLIPPER: 'true',
  ENABLE_DEBUG_LOGGING: 'true',
  ENABLE_DEV_MENU: 'true',
  ENABLE_PERFORMANCE_MONITORING: 'false',

  // Notification Configuration
  FCM_DEFAULT_CHANNEL_ID: 'dev_notifications',
  NOTIFICATION_SOUND: 'notification_dev.mp3',

  // App Configuration
  API_VERSION: 'v1',
  APP_VERSION_CODE: '1',
  SENTRY_ENABLED: 'false',
  ANALYTICS_ENABLED: 'false',

  // Development URLs (for emulator/physical device testing)
  // Use these based on your setup:
  // Android Emulator: http://10.0.2.2:3000/api
  // iOS Simulator: http://localhost:3000/api  
  // Physical Device: http://YOUR_COMPUTER_IP:3000/api
};

