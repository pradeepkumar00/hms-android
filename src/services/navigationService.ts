import {
  createNavigationContainerRef,
  StackActions,
} from '@react-navigation/native';
import { RootStackParamList } from '../types';

// Create navigation reference
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

class NavigationService {
  /**
   * Navigate to a screen with retry mechanism
   */
  navigate<T extends keyof RootStackParamList>(
    screen: T,
    params?: RootStackParamList[T],
  ): void {
    if (navigationRef.isReady()) {
      // Use type assertion to handle the complex navigation typing
      (navigationRef as any).navigate(screen, params);
    } else {
      console.warn('Navigation is not ready yet, retrying...');
      // Retry navigation after a short delay
      setTimeout(() => {
        if (navigationRef.isReady()) {
          (navigationRef as any).navigate(screen, params);
        } else {
          console.error(
            'Navigation still not ready after retry, navigation failed',
          );
        }
      }, 500);
    }
  }

  /**
   * Go back to previous screen
   */
  goBack(): void {
    if (navigationRef.isReady() && navigationRef.canGoBack()) {
      navigationRef.goBack();
    }
  }

  /**
   * Reset navigation stack
   */
  reset(routeName: keyof RootStackParamList): void {
    if (navigationRef.isReady()) {
      navigationRef.reset({
        index: 0,
        routes: [{ name: routeName }],
      });
    }
  }

  /**
   * Push a new screen onto the stack
   */
  push<T extends keyof RootStackParamList>(
    screen: T,
    params?: RootStackParamList[T],
  ): void {
    if (navigationRef.isReady()) {
      navigationRef.dispatch(StackActions.push(screen, params));
    }
  }

  /**
   * Replace current screen
   */
  replace<T extends keyof RootStackParamList>(
    screen: T,
    params?: RootStackParamList[T],
  ): void {
    if (navigationRef.isReady()) {
      navigationRef.dispatch(StackActions.replace(screen, params));
    }
  }

  /**
   * Get current route name
   */
  getCurrentRoute(): string | undefined {
    if (navigationRef.isReady()) {
      return navigationRef.getCurrentRoute()?.name;
    }
    return undefined;
  }

  /**
   * Handle deep linking from notifications
   */
  handleNotificationDeepLink(data: any): void {
    try {
      console.log(
        '🔗 Handling notification deep link:',
        JSON.stringify(data, null, 2),
      );
      console.log('📍 Navigation ready status:', navigationRef.isReady());

      // Validate data exists and is an object
      if (!data || typeof data !== 'object') {
        console.warn('⚠️ Invalid notification data for deep link:', data);
        this.navigate('Main');
        return;
      }

      if (data.taskId && typeof data.taskId === 'string') {
        // Navigate to task details with proper validation
        const params = {
          taskId: String(data.taskId),
          readonly: data.readonly === 'true' || data.readonly === true || false, // Default to false for creator access
        };

        console.log('🔗 Navigating to TaskDetails with params:', params);
        this.navigate('TaskDetails', params);
      } else if (data.screen && typeof data.screen === 'string') {
        // Navigate to specific screen
        console.log(`🔗 Navigating to screen: ${data.screen}`);
        switch (data.screen) {
          case 'Inbox':
            this.navigate('Inbox');
            break;
          case 'AssignedTasks':
            this.navigate('AssignedTasks');
            break;
          case 'CreateTask':
            this.navigate('CreateTask');
            break;
          case 'NotificationSettings':
            this.navigate('NotificationSettings');
            break;
          default:
            console.warn('Unknown screen for deep link:', data.screen);
            this.navigate('Main');
        }
      } else {
        // Default to main screen
        console.log(
          '🔗 No valid taskId or screen found in data, navigating to Main',
        );
        this.navigate('Main');
      }
    } catch (error) {
      console.error('❌ Error handling notification deep link:', error);
      // Fallback to main screen
      this.navigate('Main');
    }
  }

  /**
   * Check if navigation is ready
   */
  isReady(): boolean {
    return navigationRef.isReady();
  }

  /**
   * Wait for navigation to be ready
   */
  async waitForReady(): Promise<void> {
    return new Promise(resolve => {
      if (navigationRef.isReady()) {
        resolve();
      } else {
        const unsubscribe = navigationRef.addListener('state', () => {
          if (navigationRef.isReady()) {
            unsubscribe();
            resolve();
          }
        });
      }
    });
  }
}

// Export singleton instance
export const navigationService = new NavigationService();
export default navigationService;
