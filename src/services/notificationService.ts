import messaging, {
  FirebaseMessagingTypes,
} from '@react-native-firebase/messaging';
import { Platform, PermissionsAndroid, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../constants/app';
import {
  requestNotificationsPermission,
  checkNotificationPermissions,
} from '../utils/permissionUtils';

export interface NotificationPayload {
  title: string;
  body: string;
  data?: {
    taskId?: string;
    type?: 'task_assigned' | 'task_updated' | 'task_completed';
    senderId?: string;
    screen?: string;
  };
}

class NotificationService {
  private currentTenantId: string | null = null;
  private isInitialized: boolean = false;

  /**
   * Initialize Firebase Cloud Messaging
   */
  async initialize(): Promise<void> {
    try {
      console.log('🔔 Initializing Firebase Cloud Messaging...');

      // Check if Firebase is properly configured
      try {
        // Test if messaging is available
        const messagingInstance = messaging();

        // Check if Firebase is available
        if (!messagingInstance.isDeviceRegisteredForRemoteMessages) {
          await messagingInstance.registerDeviceForRemoteMessages();
        }

        // Request notification permissions
        await this.requestPermissions();

        // Setup message handlers
        this.setupMessageHandlers();

        this.isInitialized = true;
        console.log('✅ Firebase Cloud Messaging initialized successfully');
      } catch (firebaseError) {
        console.warn(
          '⚠️ Firebase not properly configured, running in mock mode:',
          firebaseError,
        );
        this.isInitialized = false;
        // Don't throw error, allow app to continue without Firebase
      }
    } catch (error) {
      console.error('❌ Error initializing Firebase Cloud Messaging:', error);
      this.isInitialized = false;
      // Don't throw error, allow app to continue
    }
  }

  /**
   * Request notification permissions with proper handling and settings redirection
   */
  async requestPermissions(): Promise<boolean> {
    try {
      console.log('🔔 Requesting notification permissions...');

      // Use the new permission utility with proper error handling
      const granted = await requestNotificationsPermission(
        () => {
          console.log('✅ Notification permissions granted');
        },
        () => {
          console.log('❌ Notification permissions denied/blocked');
        },
      );

      return granted;
    } catch (error) {
      console.error('❌ Error requesting notification permissions:', error);
      return false;
    }
  }

  /**
   * Check current notification permission status
   */
  async checkPermissionStatus(): Promise<{
    hasPermission: boolean;
    status: string;
  }> {
    return await checkNotificationPermissions();
  }

  /**
   * Subscribe to topic using tenantId for FCM notifications
   */
  async subscribeToTopic(tenantId: string): Promise<boolean> {
    try {
      console.log(`🔔 Subscribing to topic: ${tenantId}`);

      // Unsubscribe from previous topic if exists
      if (this.currentTenantId && this.currentTenantId !== tenantId) {
        await this.unsubscribeFromTopic(this.currentTenantId);
      }

      // Subscribe to new topic
      await messaging().subscribeToTopic(tenantId);
      this.currentTenantId = tenantId;

      // Store current tenantId locally
      await AsyncStorage.setItem(STORAGE_KEYS.CURRENT_TENANT_ID, tenantId);

      console.log(`✅ Successfully subscribed to topic: ${tenantId}`);
      return true;
    } catch (error) {
      console.error(`❌ Error subscribing to topic ${tenantId}:`, error);
      return false;
    }
  }

  /**
   * Unsubscribe from topic
   */
  async unsubscribeFromTopic(tenantId: string): Promise<boolean> {
    try {
      console.log(`🔔 Unsubscribing from topic: ${tenantId}`);

      await messaging().unsubscribeFromTopic(tenantId);

      if (this.currentTenantId === tenantId) {
        this.currentTenantId = null;
        await AsyncStorage.removeItem(STORAGE_KEYS.CURRENT_TENANT_ID);
      }

      console.log(`✅ Successfully unsubscribed from topic: ${tenantId}`);
      return true;
    } catch (error) {
      console.error(`❌ Error unsubscribing from topic ${tenantId}:`, error);
      return false;
    }
  }

  /**
   * Get current subscribed tenantId
   */
  async getCurrentTenantId(): Promise<string | null> {
    try {
      if (this.currentTenantId) {
        return this.currentTenantId;
      }

      const storedTenantId = await AsyncStorage.getItem(
        STORAGE_KEYS.CURRENT_TENANT_ID,
      );
      this.currentTenantId = storedTenantId;
      return storedTenantId;
    } catch (error) {
      console.error('❌ Error getting current tenantId:', error);
      return null;
    }
  }

  /**
   * Setup message handlers for foreground and background
   */
  private setupMessageHandlers(): void {
    // Handle foreground messages
    messaging().onMessage(
      async (remoteMessage: FirebaseMessagingTypes.RemoteMessage) => {
        console.log('📨 Foreground message received:', remoteMessage);
        await this.handleForegroundMessage(remoteMessage);
      },
    );

    // Handle background messages
    messaging().setBackgroundMessageHandler(
      async (remoteMessage: FirebaseMessagingTypes.RemoteMessage) => {
        console.log('📨 Background message received:', remoteMessage);
        await this.handleBackgroundMessage(remoteMessage);
      },
    );

    // Handle notification tap when app is in background/quit
    messaging().onNotificationOpenedApp(
      (remoteMessage: FirebaseMessagingTypes.RemoteMessage) => {
        console.log('👆 Notification tapped (background):', remoteMessage);
        this.handleNotificationTap(remoteMessage);
      },
    );

    // Handle notification tap when app is launched from quit state
    messaging()
      .getInitialNotification()
      .then((remoteMessage: FirebaseMessagingTypes.RemoteMessage | null) => {
        if (remoteMessage) {
          console.log('👆 Notification tapped (quit state):', remoteMessage);
          this.handleNotificationTap(remoteMessage);
        }
      });
  }

  /**
   * Handle foreground messages (app is open)
   */
  private async handleForegroundMessage(
    remoteMessage: FirebaseMessagingTypes.RemoteMessage,
  ): Promise<void> {
    try {
      const { notification, data } = remoteMessage;

      if (notification) {
        // Show in-app notification or alert
        Alert.alert(
          notification.title || 'New Notification',
          notification.body || 'You have a new notification',
          [
            { text: 'Dismiss', style: 'cancel' },
            {
              text: 'View',
              onPress: () => this.handleNotificationTap(remoteMessage),
            },
          ],
        );
      }

      // Store notification in local storage for inbox
      await this.storeNotificationLocally(remoteMessage);
    } catch (error) {
      console.error('❌ Error handling foreground message:', error);
    }
  }

  /**
   * Handle background messages (app is in background)
   */
  private async handleBackgroundMessage(
    remoteMessage: FirebaseMessagingTypes.RemoteMessage,
  ): Promise<void> {
    try {
      console.log('📨 Processing background message:', remoteMessage);

      // Store notification in local storage for inbox
      await this.storeNotificationLocally(remoteMessage);

      // You can perform background tasks here
      // Note: Keep background processing minimal to avoid being killed by the OS
    } catch (error) {
      console.error('❌ Error handling background message:', error);
    }
  }

  /**
   * Handle notification tap (deep linking)
   */
  private handleNotificationTap(
    remoteMessage: FirebaseMessagingTypes.RemoteMessage,
  ): void {
    try {
      const { data } = remoteMessage;

      if (data) {
        // Import navigation service dynamically to avoid circular dependencies
        import('../services/navigationService').then(
          ({ navigationService }) => {
            navigationService.handleNotificationDeepLink(data);
          },
        );
      }
    } catch (error) {
      console.error('❌ Error handling notification tap:', error);
    }
  }

  /**
   * Store notification locally for inbox display
   */
  private async storeNotificationLocally(
    remoteMessage: FirebaseMessagingTypes.RemoteMessage,
  ): Promise<void> {
    try {
      const { notification, data } = remoteMessage;

      const localNotification = {
        id: Date.now().toString(),
        title: notification?.title || 'New Notification',
        body: notification?.body || '',
        data: data || {},
        receivedAt: new Date().toISOString(),
        read: false,
      };

      // Get existing notifications
      const existingNotifications = await AsyncStorage.getItem(
        STORAGE_KEYS.LOCAL_NOTIFICATIONS,
      );
      const notifications = existingNotifications
        ? JSON.parse(existingNotifications)
        : [];

      // Add new notification to the beginning
      notifications.unshift(localNotification);

      // Keep only last 50 notifications
      const trimmedNotifications = notifications.slice(0, 50);

      // Store updated notifications
      await AsyncStorage.setItem(
        STORAGE_KEYS.LOCAL_NOTIFICATIONS,
        JSON.stringify(trimmedNotifications),
      );

      console.log('💾 Notification stored locally');
    } catch (error) {
      console.error('❌ Error storing notification locally:', error);
    }
  }

  /**
   * Clean up legacy FCM token data
   */
  async cleanupLegacyTokenData(): Promise<void> {
    try {
      console.log('🧹 Cleaning up legacy FCM token data...');
      await AsyncStorage.removeItem(STORAGE_KEYS.FCM_TOKEN);
      console.log('✅ Legacy FCM token data cleaned up');
    } catch (error) {
      console.error('❌ Error cleaning up legacy FCM token data:', error);
    }
  }

  /**
   * Get local notifications for inbox
   */
  async getLocalNotifications(): Promise<any[]> {
    try {
      const notifications = await AsyncStorage.getItem(
        STORAGE_KEYS.LOCAL_NOTIFICATIONS,
      );
      return notifications ? JSON.parse(notifications) : [];
    } catch (error) {
      console.error('❌ Error getting local notifications:', error);
      return [];
    }
  }

  /**
   * Mark notification as read
   */
  async markNotificationAsRead(notificationId: string): Promise<void> {
    try {
      const notifications = await this.getLocalNotifications();
      const updatedNotifications = notifications.map(notification =>
        notification.id === notificationId
          ? { ...notification, read: true }
          : notification,
      );

      await AsyncStorage.setItem(
        STORAGE_KEYS.LOCAL_NOTIFICATIONS,
        JSON.stringify(updatedNotifications),
      );
      console.log('✅ Notification marked as read:', notificationId);
    } catch (error) {
      console.error('❌ Error marking notification as read:', error);
    }
  }

  /**
   * Clear all local notifications
   */
  async clearAllNotifications(): Promise<void> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.LOCAL_NOTIFICATIONS);
      console.log('🗑️ All notifications cleared');
    } catch (error) {
      console.error('❌ Error clearing notifications:', error);
    }
  }

  /**
   * Check if service is initialized
   */
  isServiceInitialized(): boolean {
    return this.isInitialized;
  }
}

// Export singleton instance
export const notificationService = new NotificationService();
export default notificationService;
