import React, { useEffect } from 'react';
import { StatusBar, LogBox } from 'react-native';
import { Provider } from 'react-redux';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { store, useAppDispatch } from './src/store';
import { loadSettings } from './src/store/settingsSlice';
import { checkAuthState } from './src/store/authSlice';

import { theme } from './src/constants/theme';
import AppNavigator from './src/navigation/AppNavigator';
import { notificationService } from './src/services/notificationService';
import { ringtoneService } from './src/services/ringtoneService';
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

const AppContent: React.FC = () => {
  const dispatch = useAppDispatch();

  useEffect(() => {
    const initializeApp = async () => {
      try {
        console.log('🚀 Initializing Hospital Management App...');

        // Load settings
        dispatch(loadSettings());

        // Check authentication state
        dispatch(checkAuthState());

        // Initialize notification service (will handle permissions internally)
        await notificationService.initialize();

        // Clean up legacy FCM token data (moved to topic-based approach)
        await notificationService.cleanupLegacyTokenData();

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
