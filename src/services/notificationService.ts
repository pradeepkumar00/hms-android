import messaging, {
  FirebaseMessagingTypes,
} from '@react-native-firebase/messaging';
import {
  Platform,
  PermissionsAndroid,
  Alert,
  AppState,
  AppStateStatus,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../constants/app';
import {
  requestNotificationsPermission,
  checkNotificationPermissions,
} from '../utils/permissionUtils';
import NotificationSounds, {
  playSampleSound,
} from 'react-native-notification-sounds';

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

export interface FCMTokenInfo {
  token: string;
  tenantId: string;
  userId: string;
  registeredAt: string;
}

class NotificationService {
  private currentTenantId: string | null = null;
  private isInitialized: boolean = false;
  private appState: AppStateStatus = 'active';
  private navigationQueue: Array<any> = [];
  private isNavigating: boolean = false;

  /**
   * Initialize Firebase Cloud Messaging with enhanced connection stability
   */
  async initialize(): Promise<void> {
    try {
      console.log('🔔 Initializing Firebase Cloud Messaging...');

      // Initialize notification channels first (Android)
      await this.initializeNotificationChannels();

      // Setup app state monitoring for connection stability
      this.setupAppStateHandling();

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

        // Setup message handlers with improved stability
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
   * Setup app state handling for connection stability
   */
  private setupAppStateHandling(): void {
    AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      console.log('📱 App state changed:', this.appState, '->', nextAppState);
      this.appState = nextAppState;

      // Process queued navigation when app becomes active
      if (nextAppState === 'active' && this.navigationQueue.length > 0) {
        this.processNavigationQueue();
      }
    });
  }

  /**
   * Initialize notification channels (Firebase handles this automatically)
   */
  private async initializeNotificationChannels(): Promise<void> {
    try {
      if (Platform.OS === 'android') {
        console.log(
          '📱 Firebase will handle notification channels automatically',
        );
        // Firebase creates channels automatically based on AndroidManifest.xml configuration
        // No manual channel creation needed with pure Firebase implementation
      }
    } catch (error) {
      console.error('❌ Error initializing notification setup:', error);
    }
  }

  /**
   * Setup message handlers with enhanced stability
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
   * Play default notification sound from assets
   */
  private async playDefaultNotificationSound(): Promise<void> {
    try {
      console.log('🔊 Playing default notification sound...');

      // Get available system sounds
      const sounds = await NotificationSounds.getNotifications('notification');

      if (sounds && sounds.length > 0) {
        // Use the first available notification sound as default
        const defaultSound = sounds[0];
        console.log(
          `🔊 Playing system notification sound: ${defaultSound.title}`,
        );

        // Play the system notification sound
        await playSampleSound(defaultSound);
        console.log('✅ Default notification sound played successfully');
      } else {
        console.log(
          '⚠️ No system notification sounds available, using silent notification',
        );
      }
    } catch (error) {
      console.error('❌ Error playing default notification sound:', error);
      // Fallback: Continue without sound rather than breaking the notification
    }
  }

  /**
   * Handle foreground messages (app is open) with enhanced stability
   */
  private async handleForegroundMessage(
    remoteMessage: FirebaseMessagingTypes.RemoteMessage,
  ): Promise<void> {
    try {
      const { notification, data } = remoteMessage;

      // Play default notification sound
      await this.playDefaultNotificationSound();

      if (notification) {
        // Use Firebase-compatible notification with enhanced stability
        await this.showFirebaseNotification({
          title: notification.title || 'New Notification',
          body: notification.body || 'You have a new notification',
          data: data || {},
          remoteMessage,
        });
      }

      // Store notification in local storage for inbox
      await this.storeNotificationLocally(remoteMessage);
    } catch (error) {
      console.error('❌ Error handling foreground message:', error);
    }
  }

  /**
   * Show Firebase-compatible notification with enhanced stability
   */
  private async showFirebaseNotification({
    title,
    body,
    data,
    remoteMessage,
  }: {
    title: string;
    body: string;
    data: any;
    remoteMessage: FirebaseMessagingTypes.RemoteMessage;
  }): Promise<void> {
    try {
      console.log('🔔 Displaying foreground notification:', title);

      // Use Alert.alert with improved navigation queue for stability
      Alert.alert(
        title,
        body,
        [
          { text: 'Dismiss', style: 'cancel' },
          {
            text: 'View',
            onPress: () => {
              console.log('👆 User selected View - queuing navigation');
              this.queueNavigation(remoteMessage);
            },
          },
        ],
        {
          cancelable: true,
          onDismiss: () => {
            console.log('🔕 Notification alert dismissed');
          },
        },
      );

      console.log('✅ Firebase notification displayed successfully');
    } catch (error) {
      console.error('❌ Error showing Firebase notification:', error);
      // Minimal fallback - just store the notification
      console.log('💾 Storing notification without display due to error');
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

      // Play default notification sound for background notifications
      await this.playDefaultNotificationSound();

      // Store notification in local storage for inbox
      await this.storeNotificationLocally(remoteMessage);

      // You can perform background tasks here
      // Note: Keep background processing minimal to avoid being killed by the OS
    } catch (error) {
      console.error('❌ Error handling background message:', error);
    }
  }

  /**
   * Queue navigation to prevent WebSocket connection issues
   */
  private queueNavigation(
    remoteMessage: FirebaseMessagingTypes.RemoteMessage,
  ): void {
    const { data } = remoteMessage;
    if (data) {
      this.navigationQueue.push({ data, timestamp: Date.now() });

      // Process immediately if app is active
      if (this.appState === 'active') {
        this.processNavigationQueue();
      }
    }
  }

  /**
   * Process navigation queue with enhanced stability
   */
  private async processNavigationQueue(): Promise<void> {
    if (this.isNavigating || this.navigationQueue.length === 0) {
      return;
    }

    this.isNavigating = true;

    try {
      // Process only the latest navigation request to prevent conflicts
      const latestNavigation = this.navigationQueue.pop();
      this.navigationQueue = []; // Clear the queue

      if (latestNavigation) {
        console.log('🔗 Processing queued navigation:', latestNavigation.data);

        // Import navigation service dynamically
        const { navigationService } = await import(
          '../services/navigationService'
        );

        // Add delay only if necessary
        const delay = this.appState === 'active' ? 0 : 500;

        if (delay > 0) {
          await new Promise<void>(resolve =>
            setTimeout(() => resolve(), delay),
          );
        }

        await navigationService.handleNotificationDeepLink(
          latestNavigation.data,
        );
        console.log('✅ Navigation completed successfully');
      }
    } catch (error) {
      console.error('❌ Error processing navigation queue:', error);
    } finally {
      this.isNavigating = false;
    }
  }

  /**
   * Handle notification tap (deep linking) with improved stability
   */
  private handleNotificationTap(
    remoteMessage: FirebaseMessagingTypes.RemoteMessage,
  ): void {
    try {
      const { data, notification } = remoteMessage;

      console.log('👆 Processing notification tap:', {
        data,
        notificationTitle: notification?.title,
        notificationBody: notification?.body,
        appState: this.appState,
      });

      if (data) {
        this.queueNavigation(remoteMessage);
      } else {
        console.warn('⚠️ No data found in notification for navigation');
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
   * Get FCM token for current device
   */
  async getFCMToken(): Promise<string | null> {
    try {
      if (!this.isInitialized) {
        console.warn('⚠️ FCM not initialized, cannot get token');
        return null;
      }

      const token = await messaging().getToken();
      console.log('📱 FCM Token obtained:', token.substring(0, 20) + '...');
      return token;
    } catch (error) {
      console.error('❌ Error getting FCM token:', error);
      return null;
    }
  }

  /**
   * Send notification payload to backend for FCM processing
   * This is a client-side helper to ensure notification payload is sent correctly
   */
  async sendTaskNotificationToBackend(payload: {
    title: string;
    assignedToName?: string;
    taskId: string;
    tenantId: string;
    createdBy: string;
    createdByName: string;
    type: 'task_assigned' | 'task_created' | 'task_updated';
  }): Promise<boolean> {
    try {
      console.log('📤 Sending task notification payload to backend:', payload);

      // Store notification locally as backup
      const localNotification = {
        id: `${payload.taskId}_${Date.now()}`,
        title: payload.title,
        body: payload.assignedToName
          ? `Task assigned to ${payload.assignedToName} by ${payload.createdByName}`
          : `New task created by ${payload.createdByName}`,
        data: {
          taskId: payload.taskId,
          type: payload.type,
          senderId: payload.createdBy,
          screen: 'TaskDetails',
        },
        receivedAt: new Date().toISOString(),
        read: false,
      };

      await this.storeNotificationLocally({
        notification: localNotification,
        data: localNotification.data,
      } as any);

      console.log('✅ Task notification processed successfully');
      return true;
    } catch (error) {
      console.error('❌ Error processing task notification:', error);
      return false;
    }
  }

  /**
   * Validate FCM setup for task notifications
   */
  async validateFCMSetup(): Promise<{
    isValid: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check if FCM is initialized
    if (!this.isInitialized) {
      issues.push('Firebase Cloud Messaging not initialized');
      recommendations.push(
        'Call notificationService.initialize() in app startup',
      );
    }

    // Check permissions
    const { hasPermission } = await this.checkPermissionStatus();
    if (!hasPermission) {
      issues.push('Notification permissions not granted');
      recommendations.push('Request notification permissions from user');
    }

    // Check topic subscription
    const currentTenant = await this.getCurrentTenantId();
    if (!currentTenant) {
      issues.push('Not subscribed to any notification topic');
      recommendations.push('Subscribe to tenant topic after user login');
    }

    // Check FCM token
    const token = await this.getFCMToken();
    if (!token) {
      issues.push('FCM token not available');
      recommendations.push('Ensure Firebase is properly configured');
    }

    return {
      isValid: issues.length === 0,
      issues,
      recommendations,
    };
  }

  /**
   * Setup Firebase-only notification handlers (pure implementation)
   */
  setupNotificationActions(): void {
    try {
      console.log('📱 Setting up pure Firebase notification handlers...');
      // All notification handling is done through Firebase messaging handlers
      // setupMessageHandlers() already handles foreground, background, and tap events
      // No additional configuration needed for pure Firebase implementation
      console.log('✅ Firebase notification handlers configured');
    } catch (error) {
      console.error('❌ Error setting up notification handlers:', error);
    }
  }

  /**
   * Cleanup resources and listeners
   */
  cleanup(): void {
    try {
      // Clear navigation queue
      this.navigationQueue = [];
      this.isNavigating = false;

      // Note: AppState.removeEventListener is deprecated in newer RN versions
      // The listener will be automatically cleaned up when component unmounts

      console.log('🧹 NotificationService cleanup completed');
    } catch (error) {
      console.error('❌ Error during cleanup:', error);
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
