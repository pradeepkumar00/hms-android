import { Platform, Alert } from 'react-native';
import {
  RESULTS,
  requestNotifications,
  openSettings,
  checkNotifications,
} from 'react-native-permissions';

export const isIos = () => Platform.OS === 'ios';
export const isAndroid = () => Platform.OS === 'android';
export const getPlatformVersion = () => Number(Platform.Version);

/**
 * Check current notification permission status
 */
export const checkNotificationPermissions = async (): Promise<{
  status: string;
  hasPermission: boolean;
}> => {
  try {
    const result = await checkNotifications();
    return {
      status: result.status,
      hasPermission: result.status === RESULTS.GRANTED,
    };
  } catch (error) {
    console.error('❌ Error checking notification permissions:', error);
    return {
      status: 'unknown',
      hasPermission: false,
    };
  }
};

/**
 * Request notification permissions with proper handling for denied cases
 */
export const requestNotificationsPermission = async (
  onGranted?: () => void,
  onBlocked?: () => void,
): Promise<boolean> => {
  try {
    // Check if we need to request permissions based on platform and version
    const shouldRequest =
      isIos() || (isAndroid() && getPlatformVersion() >= 33);

    if (!shouldRequest) {
      // For older Android versions, assume granted
      onGranted?.();
      return true;
    }

    console.log('📱 Requesting notification permissions...');

    const { status } = await requestNotifications(['alert', 'sound', 'badge']);

    console.log('🔔 Notification permission status:', status);

    switch (status) {
      case RESULTS.GRANTED:
        console.log('✅ Notification permissions granted');
        onGranted?.();
        return true;

      case RESULTS.DENIED:
        console.log('⚠️ Notification permissions denied');
        showPermissionDeniedAlert();
        onBlocked?.();
        return false;

      case RESULTS.BLOCKED:
        console.log('🚫 Notification permissions blocked');
        showPermissionBlockedAlert();
        onBlocked?.();
        return false;

      case RESULTS.UNAVAILABLE:
        console.log('❌ Notification permissions unavailable');
        onBlocked?.();
        return false;

      default:
        console.log('❓ Unknown notification permission status:', status);
        onBlocked?.();
        return false;
    }
  } catch (error) {
    console.error('❌ Error requesting notification permissions:', error);
    onBlocked?.();
    return false;
  }
};

/**
 * Show alert when permission is denied (first time)
 */
const showPermissionDeniedAlert = () => {
  Alert.alert(
    'Notification Permission Required',
    'This app needs notification permission to send you important task updates. Please enable notifications for the best experience.',
    [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: 'Retry',
        onPress: () => requestNotificationsPermission(),
      },
    ],
  );
};

/**
 * Show alert when permission is blocked (user must go to settings)
 */
const showPermissionBlockedAlert = () => {
  Alert.alert(
    'Enable Notifications in Settings',
    'Notifications are currently disabled. To receive task updates, please enable notifications in your device settings.',
    [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: 'Open Settings',
        onPress: () => {
          openSettings('notifications').catch(() => {
            console.warn(
              'Cannot open notification settings, opening app settings',
            );
            openSettings('application').catch(() =>
              console.warn('Cannot open app settings'),
            );
          });
        },
      },
    ],
  );
};

/**
 * Show alert for permission setup with settings redirect
 */
export const showNotificationPermissionSetup = () => {
  Alert.alert(
    'Setup Notifications',
    'Enable notifications to receive important updates about your tasks and assignments.',
    [
      {
        text: 'Skip',
        style: 'cancel',
      },
      {
        text: 'Enable',
        onPress: () => requestNotificationsPermission(),
      },
    ],
  );
};

/**
 * Force redirect to settings (for use in notification settings screen)
 */
export const redirectToNotificationSettings = () => {
  openSettings('notifications').catch(() => {
    console.warn('Cannot open notification settings, opening app settings');
    openSettings('application').catch(() =>
      console.warn('Cannot open app settings'),
    );
  });
};
