import React, { useEffect } from 'react';
import { StatusBar, LogBox } from 'react-native';
import { Provider } from 'react-redux';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { store, useAppDispatch } from './src/store';
import {
  loadSettings,
  setNotificationSound,
  setVibrationEnabled,
} from './src/store/settingsSlice';

import { theme } from './src/constants/theme';
import AppNavigator from './src/navigation/AppNavigator';
import { notificationService } from './src/services/notificationService';
import { ringtoneService } from './src/services/ringtoneService';
import { notificationChannelService } from './src/services/notificationChannelService';
import { STORAGE_KEYS } from './src/constants/app';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  requestNotificationsPermission,
  isIos,
  isAndroid,
  getPlatformVersion,
} from './src/utils/permissionUtils';

// Ignore specific warnings during development
// LogBox.ignoreLogs([
//   'Non-serializable values were found in the navigation state',
//   'VirtualizedLists should never be nested',
//   'Require cycle:', // Ignore require cycle warnings for now
// ]);

/**
 * Initialize default notification settings on app startup
 * This ensures first notification sound and vibration defaults are set
 */
const initializeDefaultNotificationSettings = async (): Promise<void> => {
  try {
    console.log('🔧 Initializing default notification settings...');

    // Check if notification sound is already set
    const existingSoundId = await AsyncStorage.getItem(
      STORAGE_KEYS.NOTIFICATION_SOUND,
    );
    console.log('====================================');
    console.log('existingSoundId', existingSoundId);
    console.log('====================================');

    if (!existingSoundId) {
      // Get all available sounds
      const availableSounds = await ringtoneService.getAllSounds();

      if (availableSounds && availableSounds.length > 0) {
        // Set the first notification bell as default
        const firstSound = availableSounds[0];
        console.log(
          '🔔 Setting first notification sound as default:',
          firstSound.name,
        );

        console.log('====================================');
        console.log('firstSound', firstSound);
        console.log('====================================');
        // Save to storage and Redux
        await ringtoneService.setSelectedRingtone(firstSound.id);
        store.dispatch(setNotificationSound(firstSound.id));

        // Create notification channel for the default sound
        await notificationChannelService.createChannelForSound(firstSound.id);

        console.log('✅ Default notification sound set:', firstSound.id);
      } else {
        console.warn(
          '⚠️ No notification sounds available, using system default',
        );
      }
    }

    // Check if vibration setting is already set
    const existingVibrationSetting = await AsyncStorage.getItem(
      STORAGE_KEYS.VIBRATION_ENABLED,
    );

    if (existingVibrationSetting === null) {
      // Set vibration enabled as default
      console.log('📳 Setting default vibration enabled: true');
      await AsyncStorage.setItem(
        STORAGE_KEYS.VIBRATION_ENABLED,
        JSON.stringify(true),
      );
      store.dispatch(setVibrationEnabled(true));

      console.log('✅ Default vibration setting set: enabled');
    }

    console.log('✅ Default notification settings initialization completed');
  } catch (error) {
    console.error(
      '❌ Failed to initialize default notification settings:',
      error,
    );
    // Don't throw - app should still work
  }
};

const AppContent: React.FC = () => {
  const dispatch = useAppDispatch();

  useEffect(() => {
    const initializeApp = async () => {
      try {
        console.log('🚀 Initializing Octus AI App...');

        // Load settings
        dispatch(loadSettings());

        // Auth state is initialized in AppNavigator

        // Initialize notification service (will handle permissions internally)
        await notificationService.initialize();

        // Setup notification action handlers for improved stability
        notificationService.setupNotificationActions();

        // Clean up legacy FCM token data (moved to topic-based approach)
        await notificationService.cleanupLegacyTokenData();

        // Initialize default notification settings (if not already set)
        await initializeDefaultNotificationSettings();

        // Initialize notification channels with user's current settings
        // await notificationService.initializeNotificationChannels();

        // Request notification permissions if supported platform
        if (isIos() || (isAndroid() && getPlatformVersion() >= 33)) {
          console.log('📱 Checking notification permissions...');
          // Note: This is handled inside notificationService.initialize()
          // but we can add additional logic here if needed
        }

        // Clean up invalid ringtones
        await ringtoneService.cleanupInvalidRingtones();

        console.log('✅ App initialization completed');
      } catch (error) {
        console.error('❌ App initialization failed:', error);
        // App should still work without core services failing
      }
    };

    initializeApp();
  }, [dispatch]);
  return (
    <SafeAreaProvider>
      <PaperProvider>
        <StatusBar
          barStyle="light-content"
          backgroundColor={theme.colors.primary}
          translucent={false}
        />
        <AppNavigator />
      </PaperProvider>
    </SafeAreaProvider>
  );
};

const App: React.FC = () => (
  <Provider store={store}>
    <AppContent />
  </Provider>
);

export default App;
