/**
 * Environment Variables Type Definitions
 * Generated for react-native-config
 */

declare module 'react-native-config' {
  export interface NativeConfig {
    // Environment Info
    ENVIRONMENT: 'development' | 'staging' | 'production';
    APP_NAME: string;
    APP_DISPLAY_NAME: string;
    APP_BUNDLE_ID: string;

    // API Configuration
    API_BASE_URL: string;
    AUTH_API_BASE_URL: string;
    API_TIMEOUT: string;

    // Firebase Configuration
    FIREBASE_PROJECT_ID: string;
    FIREBASE_STORAGE_BUCKET: string;
    FIREBASE_WEB_CLIENT_ID: string;

    // Feature Flags
    ENABLE_FLIPPER: string;
    ENABLE_DEBUG_LOGGING: string;
    ENABLE_DEV_MENU: string;
    ENABLE_PERFORMANCE_MONITORING: string;

    // Notification Configuration
    FCM_DEFAULT_CHANNEL_ID: string;
    NOTIFICATION_SOUND: string;

    // App Configuration
    API_VERSION: string;
    APP_VERSION_CODE: string;
    SENTRY_ENABLED: string;
    ANALYTICS_ENABLED: string;
  }

  const Config: NativeConfig;
  export default Config;
}

/**
 * Environment Helper Types
 */
export type EnvironmentType = 'development' | 'staging' | 'production';

export interface EnvironmentConfig {
  isDevelopment: boolean;
  isStaging: boolean;
  isProduction: boolean;
  environment: EnvironmentType;
  apiBaseUrl: string;
  authApiBaseUrl: string;
  apiTimeout: number;
  firebaseProjectId: string;
  firebaseStorageBucket: string;
  enableDebugLogging: boolean;
  enableDevMenu: boolean;
  enablePerformanceMonitoring: boolean;
  fcmDefaultChannelId: string;
  notificationSound: string;
  sentryEnabled: boolean;
  analyticsEnabled: boolean;
}

