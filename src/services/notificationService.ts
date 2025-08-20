import messaging, {
  FirebaseMessagingTypes,
} from '@react-native-firebase/messaging';
import { Platform, PermissionsAndroid, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../constants/app';

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
  private fcmToken: string | null = null;
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

        // Get FCM token
        await this.getFCMToken();

        // Setup message handlers
        this.setupMessageHandlers();

        // Setup token refresh handler
        this.setupTokenRefreshHandler();

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
   * Request notification permissions
   */
  async requestPermissions(): Promise<boolean> {
    try {
      if (Platform.OS === 'android') {
        // For Android 13+ (API level 33), request POST_NOTIFICATIONS permission
        if (Platform.Version >= 33) {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
            {
              title: 'Notification Permission',
              message:
                'This app needs notification permission to send you task updates.',
              buttonNeutral: 'Ask Me Later',
              buttonNegative: 'Cancel',
              buttonPositive: 'OK',
            },
          );

          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            console.log('❌ Notification permission denied');
            return false;
          }
        }
      } else {
        // iOS permission request
        const authStatus = await messaging().requestPermission();
        const enabled =
          authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
          authStatus === messaging.AuthorizationStatus.PROVISIONAL;

        if (!enabled) {
          console.log('❌ iOS notification permission denied');
          return false;
        }
      }

      console.log('✅ Notification permissions granted');
      return true;
    } catch (error) {
      console.error('❌ Error requesting notification permissions:', error);
      return false;
    }
  }

  /**
   * Get FCM token for this device
   */
  async getFCMToken(): Promise<string | null> {
    try {
      const token = await messaging().getToken();
      this.fcmToken = token;

      // Store token locally
      await AsyncStorage.setItem(STORAGE_KEYS.FCM_TOKEN, token);

      console.log('📱 FCM Token:', token);
      return token;
    } catch (error) {
      console.error('❌ Error getting FCM token:', error);
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
   * Setup token refresh handler
   */
  private setupTokenRefreshHandler(): void {
    messaging().onTokenRefresh(async (token: string) => {
      console.log('🔄 FCM Token refreshed:', token);
      this.fcmToken = token;
      await AsyncStorage.setItem(STORAGE_KEYS.FCM_TOKEN, token);

      // TODO: Send updated token to backend
      // await this.sendTokenToBackend(token);
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
   * Get stored FCM token
   */
  async getStoredToken(): Promise<string | null> {
    try {
      if (this.fcmToken) {
        return this.fcmToken;
      }

      const storedToken = await AsyncStorage.getItem(STORAGE_KEYS.FCM_TOKEN);
      this.fcmToken = storedToken;
      return storedToken;
    } catch (error) {
      console.error('❌ Error getting stored token:', error);
      return null;
    }
  }

  /**
   * Send token to backend (placeholder for future implementation)
   */
  async sendTokenToBackend(token: string): Promise<void> {
    try {
      console.log('📤 Sending token to backend:', token);
      // TODO: Implement API call to send token to backend
      // await api.post('/notifications/register-token', { token });
    } catch (error) {
      console.error('❌ Error sending token to backend:', error);
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
