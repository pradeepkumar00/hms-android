import Config from 'react-native-config';
import { EnvironmentType, EnvironmentConfig } from '../types/env';

/**
 * Environment Service
 * Provides type-safe access to environment configuration
 * Following React Native configuration management best practices
 *
 * DEFAULT BEHAVIOR: Uses development-friendly defaults for easier testing
 * - API: http://192.168.31.123:3000/api (local backend)
 * - Firebase: user-management-fd816 project
 * - Debug logging: enabled
 * - Performance monitoring: disabled
 */

class EnvironmentService {
  private config: EnvironmentConfig;

  constructor() {
    this.config = this.parseEnvironmentConfig();
    this.logEnvironmentInfo();
  }

  /**
   * Parse raw config values into typed configuration
   */
  private parseEnvironmentConfig(): EnvironmentConfig {
    const environment = (Config.ENVIRONMENT ||
      'development') as EnvironmentType;

    return {
      // Environment Info
      isDevelopment: environment === 'development',
      isStaging: environment === 'staging',
      isProduction: environment === 'production',
      environment,

      // API Configuration - Default to DEVELOPMENT environment
      apiBaseUrl: Config.API_BASE_URL || 'https://app.octusai.com/api',
      authApiBaseUrl:
        Config.AUTH_API_BASE_URL ||
        Config.API_BASE_URL ||
        'https://app.octusai.com/api',
      apiTimeout: parseInt(Config.API_TIMEOUT || '30000', 10),

      // Firebase Configuration - Default to DEVELOPMENT project
      firebaseProjectId: Config.FIREBASE_PROJECT_ID || 'doctor-app-fd816',
      firebaseStorageBucket:
        Config.FIREBASE_STORAGE_BUCKET ||
        'doctor-app-fd816.firebasestorage.app',

      // Feature Flags (convert string to boolean) - Default to DEVELOPMENT friendly
      enableDebugLogging: this.stringToBoolean(
        Config.ENABLE_DEBUG_LOGGING,
        true, // Always enable debug logging by default
      ),
      enableDevMenu: this.stringToBoolean(
        Config.ENABLE_DEV_MENU,
        true, // Enable dev menu by default
      ),
      enablePerformanceMonitoring: this.stringToBoolean(
        Config.ENABLE_PERFORMANCE_MONITORING,
        false, // Disable performance monitoring by default (development friendly)
      ),

      // Notification Configuration - Default to DEVELOPMENT
      fcmDefaultChannelId:
        Config.FCM_DEFAULT_CHANNEL_ID || 'development_notification_channel',
      notificationSound: Config.NOTIFICATION_SOUND || 'notification_dev.mp3',

      // App Configuration - Default to DEVELOPMENT (disabled for testing)
      sentryEnabled: this.stringToBoolean(
        Config.SENTRY_ENABLED,
        false, // Disable Sentry by default (development friendly)
      ),
      analyticsEnabled: this.stringToBoolean(
        Config.ANALYTICS_ENABLED,
        false, // Disable analytics by default (development friendly)
      ),
    };
  }

  /**
   * Convert string to boolean with fallback
   */
  private stringToBoolean(
    value: string | undefined,
    fallback: boolean,
  ): boolean {
    if (value === undefined) return fallback;
    return value.toLowerCase() === 'true';
  }

  /**
   * Log environment information (development only)
   */
  private logEnvironmentInfo(): void {
    if (this.config.enableDebugLogging) {
      console.log('🌍 Environment Configuration Loaded:');
      console.log(`   Environment: ${this.config.environment}`);
      console.log(`   API Base URL: ${this.config.apiBaseUrl}`);
      console.log(`   Firebase Project: ${this.config.firebaseProjectId}`);
      console.log(`   Debug Logging: ${this.config.enableDebugLogging}`);
      console.log(`   Dev Menu: ${this.config.enableDevMenu}`);
      console.log(
        `   Performance Monitoring: ${this.config.enablePerformanceMonitoring}`,
      );
      console.log(`   Sentry: ${this.config.sentryEnabled}`);
      console.log(`   Analytics: ${this.config.analyticsEnabled}`);
    }
  }

  /**
   * Get complete environment configuration
   */
  getConfig(): EnvironmentConfig {
    return { ...this.config };
  }

  /**
   * Get current environment type
   */
  getEnvironment(): EnvironmentType {
    return this.config.environment;
  }

  /**
   * Environment check helpers
   */
  isDevelopment(): boolean {
    return this.config.isDevelopment;
  }

  isStaging(): boolean {
    return this.config.isStaging;
  }

  isProduction(): boolean {
    return this.config.isProduction;
  }

  /**
   * API Configuration getters
   */
  getApiBaseUrl(): string {
    return this.config.apiBaseUrl;
  }

  getAuthApiBaseUrl(): string {
    return this.config.authApiBaseUrl;
  }

  getApiTimeout(): number {
    return this.config.apiTimeout;
  }

  /**
   * Firebase Configuration getters
   */
  getFirebaseProjectId(): string {
    return this.config.firebaseProjectId;
  }

  getFirebaseStorageBucket(): string {
    return this.config.firebaseStorageBucket;
  }

  /**
   * Feature flag getters
   */
  isDebugLoggingEnabled(): boolean {
    return this.config.enableDebugLogging;
  }

  isDevMenuEnabled(): boolean {
    return this.config.enableDevMenu;
  }

  isPerformanceMonitoringEnabled(): boolean {
    return this.config.enablePerformanceMonitoring;
  }

  /**
   * Notification Configuration getters
   */
  getFCMDefaultChannelId(): string {
    return this.config.fcmDefaultChannelId;
  }

  getNotificationSound(): string {
    return this.config.notificationSound;
  }

  /**
   * App Configuration getters
   */
  isSentryEnabled(): boolean {
    return this.config.sentryEnabled;
  }

  isAnalyticsEnabled(): boolean {
    return this.config.analyticsEnabled;
  }

  /**
   * Get app display information
   */
  getAppInfo() {
    return {
      name: Config.APP_NAME || 'Hospital Management',
      displayName: Config.APP_DISPLAY_NAME || 'Hospital Management',
      bundleId: Config.APP_BUNDLE_ID || 'com.octusai.hospital',
      versionCode: Config.APP_VERSION_CODE || '1',
      environment: this.config.environment,
    };
  }

  /**
   * Get environment-specific URLs for development testing
   */
  getDevUrls() {
    if (!this.isDevelopment()) {
      return null;
    }

    return {
      localhost: 'https://app.octusai.com/api',
      androidEmulator: 'https://app.octusai.com/api',
      physicalDevice: 'https://app.octusai.com/api', // Real device testing IP
    };
  }

  /**
   * Validate configuration
   */
  validateConfiguration(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate required fields
    if (!this.config.apiBaseUrl) {
      errors.push('API_BASE_URL is required');
    }

    if (!this.config.firebaseProjectId) {
      errors.push('FIREBASE_PROJECT_ID is required');
    }

    // Validate API timeout
    if (this.config.apiTimeout < 1000) {
      errors.push('API_TIMEOUT should be at least 1000ms');
    }

    // Validate URLs
    try {
      new URL(this.config.apiBaseUrl);
    } catch {
      errors.push('API_BASE_URL is not a valid URL');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}

// Export singleton instance
export const environmentService = new EnvironmentService();
export default environmentService;
