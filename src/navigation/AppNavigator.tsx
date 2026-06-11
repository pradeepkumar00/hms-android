import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { useAppDispatch, useAppSelector, selectAuth } from '../store';
import { checkAuthState } from '../store/authSlice';
import { RootStackParamList } from '../types';
import { theme } from '../constants/theme';
import { navigationRef } from '../services/navigationService';
import environmentService from '../services/environmentService';

// Screens
import LoginScreen from '../screens/LoginScreen';
import HomeScreen from '../screens/HomeScreen';
import AllTasksScreen from '../screens/AllTasksScreen';
import InboxScreen from '../screens/InboxScreen';
import TaskDetailsScreen from '../screens/TaskDetailsScreen';
import AssignedTasksScreen from '../screens/AssignedTasksScreen';
import HistoryScreen from '../screens/HistoryScreen';
import CreateTaskScreen from '../screens/CreateTaskScreen';
import NotificationSettingsScreen from '../screens/NotificationSettingsScreen';
import TaskListScreen from '../screens/TaskListScreen';
import CalendarScreen from '../screens/CalendarScreen';
import OPDScreen from '../screens/OPDScreen';

const Stack = createStackNavigator<RootStackParamList>();

const AppNavigator: React.FC = () => {
  const [isInitializing, setIsInitializing] = useState(true);
  const dispatch = useAppDispatch();
  const { isAuthenticated, isLoading } = useAppSelector(selectAuth);

  useEffect(() => {
    // Log environment information on app start
    console.log('');
    console.log('═══════════════════════════════════════════════════');
    console.log('🌍 ENVIRONMENT CONFIGURATION');
    console.log('═══════════════════════════════════════════════════');
    console.log(
      `📦 Environment: ${environmentService.getEnvironment().toUpperCase()}`,
    );
    console.log(`🌐 API URL: ${environmentService.getApiBaseUrl()}`);
    console.log(`🔐 Auth API: ${environmentService.getAuthApiBaseUrl()}`);
    console.log(
      `🔥 Firebase Project: ${environmentService.getFirebaseProjectId()}`,
    );
    console.log(`⏱️  API Timeout: ${environmentService.getApiTimeout()}ms`);
    console.log(
      `🔍 Debug Logging: ${
        environmentService.isDebugLoggingEnabled() ? 'ENABLED' : 'DISABLED'
      }`,
    );
    console.log(
      `📱 Dev Menu: ${
        environmentService.isDevMenuEnabled() ? 'ENABLED' : 'DISABLED'
      }`,
    );
    console.log('═══════════════════════════════════════════════════');
    console.log('');

    // Check if user is already authenticated on app start
    const initializeAuth = async () => {
      try {
        console.log('🔍 AppNavigator: Initializing auth state...');
        await dispatch(checkAuthState()).unwrap();
        console.log('✅ AppNavigator: Auth state initialized successfully');
      } catch (error) {
        // User is not authenticated, that's fine
        console.log('⚠️ AppNavigator: No stored auth state found:', error);
      } finally {
        console.log(
          '✅ AppNavigator: Auth initialization complete, setting isInitializing to false',
        );
        setIsInitializing(false);
      }
    };

    initializeAuth();
  }, [dispatch]);

  // Show loading spinner while initializing
  if (isInitializing || isLoading) {
    console.log(
      '🔄 AppNavigator: Showing loading spinner - isInitializing:',
      isInitializing,
      'isLoading:',
      isLoading,
    );
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  console.log(
    '📱 AppNavigator: Rendering app - isAuthenticated:',
    isAuthenticated,
  );

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false, // We'll create custom headers in Phase 2
          cardStyle: { backgroundColor: theme.colors.background },
          // animationEnabled is not a valid option for Stack.Navigator in React Navigation v6+
          // If you want to control animation, use 'animationTypeForReplace' or per-screen options
        }}
      >
        {isAuthenticated ? (
          // User is authenticated - Home is the default landing screen
          <Stack.Group>
            <Stack.Screen
              name="Home"
              component={HomeScreen}
              options={{
                gestureEnabled: false, // Default screen - no swipe back
              }}
            />
            <Stack.Screen
              name="Calendar"
              component={CalendarScreen}
              options={{
                gestureEnabled: true,
              }}
            />
            <Stack.Screen
              name="AllTasks"
              component={AllTasksScreen}
              options={{
                gestureEnabled: false, // Prevent swipe back to login
              }}
            />
            <Stack.Screen
              name="Inbox"
              component={InboxScreen}
              options={{
                gestureEnabled: true,
              }}
            />
            <Stack.Screen
              name="TaskDetails"
              component={TaskDetailsScreen}
              options={{
                gestureEnabled: false, // Disable swipe gesture to prevent bad animation
              }}
            />
            <Stack.Screen
              name="AssignedTasks"
              component={AssignedTasksScreen}
              options={{
                gestureEnabled: true,
              }}
            />
            <Stack.Screen
              name="History"
              component={HistoryScreen}
              options={{
                gestureEnabled: true,
              }}
            />
            <Stack.Screen
              name="CreateTask"
              component={CreateTaskScreen}
              options={{
                gestureEnabled: true,
              }}
            />
            <Stack.Screen
              name="NotificationSettings"
              component={NotificationSettingsScreen}
              options={{
                gestureEnabled: true,
              }}
            />
            <Stack.Screen
              name="TaskList"
              component={TaskListScreen}
              options={{
                gestureEnabled: true,
              }}
            />
            <Stack.Screen
              name="OPD"
              component={OPDScreen}
              options={{
                gestureEnabled: true,
              }}
            />
          </Stack.Group>
        ) : (
          // User is not authenticated - show auth screens
          <Stack.Group>
            <Stack.Screen
              name="Login"
              component={LoginScreen}
              options={{
                gestureEnabled: false, // Prevent swipe gestures on login
              }}
            />
          </Stack.Group>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
});

export default AppNavigator;
