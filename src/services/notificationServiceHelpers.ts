/**
 * Notification Service Helper Functions
 * Additional utilities for notification management
 */

import { notificationService } from './notificationService';
import { environmentService } from './environmentService';

export class NotificationServiceHelpers {
  /**
   * Create and send test notification to verify setup
   * Useful for testing notification channels and custom sounds
   */
  static async sendTestNotification(): Promise<void> {
    try {
      console.log('🧪 Sending test notification...');

      if (!notificationService.isServiceInitialized()) {
        console.warn(
          '⚠️ NotificationService not initialized, initializing now...',
        );
        await notificationService.initialize();
      }

      // Send test notification using the notification service
      await notificationService.sendTestNotification();

      console.log('✅ Test notification sent successfully');
    } catch (error) {
      console.error('❌ Failed to send test notification:', error);
    }
  }

  /**
   * Validate complete notification setup
   */
  static async validateNotificationSetup(): Promise<{
    isValid: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    try {
      console.log('🔍 Validating complete notification setup...');

      // Use existing FCM validation
      const fcmValidation = await notificationService.validateFCMSetup();

      const issues = [...fcmValidation.issues];
      const recommendations = [...fcmValidation.recommendations];

      // Additional checks for app branding and push notification
      const appInfo = environmentService.getAppInfo();

      if (appInfo.displayName.includes('Hospital')) {
        issues.push(
          'App name still shows "Hospital Management" instead of "Octus AI"',
        );
        recommendations.push(
          'Update environment variables to use "Octus AI" branding',
        );
      }

      if (!notificationService.isPushNotificationInitialized()) {
        issues.push(
          'PushNotification not initialized for custom notification channels',
        );
        recommendations.push(
          'Ensure PushNotification.configure() is called during app startup',
        );
      }

      console.log('🎯 Notification setup validation completed');
      console.log(`   Issues found: ${issues.length}`);
      console.log(`   App branding: ${appInfo.displayName}`);

      return {
        isValid: issues.length === 0,
        issues,
        recommendations,
      };
    } catch (error) {
      console.error('❌ Error validating notification setup:', error);
      return {
        isValid: false,
        issues: ['Failed to validate notification setup'],
        recommendations: ['Check notification service initialization'],
      };
    }
  }

  /**
   * Debug notification channels and settings
   */
  static async debugNotificationSettings(): Promise<void> {
    try {
      console.log('🔧 Debugging notification settings...');

      // Get app info
      const appInfo = environmentService.getAppInfo();
      console.log(`📱 App Info:`, appInfo);

      // Check FCM setup
      const fcmValidation = await notificationService.validateFCMSetup();
      console.log(`🔔 FCM Validation:`, fcmValidation);

      // Check current tenant subscription
      const tenantId = await notificationService.getCurrentTenantId();
      console.log(`🏢 Current Tenant ID: ${tenantId}`);

      // Check if services are initialized
      console.log(`🔧 Service Status:`);
      console.log(
        `   FCM Initialized: ${notificationService.isServiceInitialized()}`,
      );
      console.log(
        `   PushNotification Initialized: ${notificationService.isPushNotificationInitialized()}`,
      );

      console.log('✅ Notification settings debug completed');
    } catch (error) {
      console.error('❌ Error debugging notification settings:', error);
    }
  }
}

export default NotificationServiceHelpers;
