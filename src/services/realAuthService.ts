import {
  apiClient,
  authApiClient,
  makeApiCall,
  handleNetworkError,
} from './apiConfig';
import { tokenService, StoredUserData } from './tokenService';
import { LoginCredentials, LoginResponse, User, ApiResponse } from '../types';
import { validateEmail, validatePassword } from '../utils/validation';

/**
 * Real Authentication Service
 * Integrates with production API endpoints for authentication
 * Following React Native authentication best practices
 */

interface LoginApiResponse {
  status: number;
  user: {
    _id: string;
    tenantId: string;
    name: string;
    email: string;
    mobileNo: string;
    role: string;
    isTokenAssignable: boolean;
    subCategory: string;
    type: string;
    status: string;
    currentToken: string;
    child: {
      totalChild: number;
    };
    route: string[];
    consultFees: number;
    isSlot: boolean;
    createdAt: string;
    updatedAt: string;
    __v: number;
  };
  jwt: string;
}

interface AuthorizeApiResponse {
  // Response structure from /api/role/authorize endpoint
  status: number;
  user?: LoginApiResponse['user'];
}

class RealAuthService {
  /**
   * Login with real API endpoint
   * POST https://app.octusai.com/api/cred/login
   */
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    // Validate input
    const emailError = validateEmail(credentials.email);
    if (emailError) {
      throw new Error(emailError.message);
    }

    const passwordError = validatePassword(credentials.password);
    if (passwordError) {
      throw new Error(passwordError.message);
    }

    try {
      console.log('🔐 Attempting login with real API...');

      const response = await apiClient.post('/cred/login', {
        email: credentials.email,
        password: credentials.password,
      });

      // Check if login was successful
      if (!response.data) {
        throw new Error('Invalid response from server');
      }

      // Extract response data
      const apiResponse: LoginApiResponse = response.data;

      // Validate response structure
      if (apiResponse.status !== 200 || !apiResponse.user) {
        throw new Error('Invalid response structure from server');
      }

      // Generate session token since API doesn't provide JWT
      // Create a session token based on user ID and timestamp for local session management
      const token = apiResponse?.jwt;
      console.log(
        token,
        '🔐 Generated session token for user:',
        apiResponse.user.name,
      );

      // Extract user data from nested structure
      const apiUser = apiResponse.user;

      // Convert API user format to our internal User format
      const user: User = {
        id: apiUser._id,
        name: apiUser.name,
        email: apiUser.email,
        mobileNumber: apiUser.mobileNo,
        department: this.mapRoleToOurDepartment(apiUser.role),
        role: apiUser.role,
        tenantId: apiUser.tenantId, // Required for topic subscription
        createdAt: apiUser.createdAt,
      };

      // Store token and user data securely
      await tokenService.storeToken(token);
      await tokenService.storeUserData(user);

      // Subscribe to FCM topic using tenantId for notifications
      await this.subscribeToNotificationTopic(user.tenantId);

      console.log('✅ Login successful:', user.name);

      return {
        user,
        token,
      };
    } catch (error: any) {
      console.error('❌ Login failed:', error);

      if (error.response?.status === 401) {
        throw new Error('Invalid email or password');
      } else if (error.response?.status === 403) {
        throw new Error('Account access restricted');
      } else {
        throw new Error(handleNetworkError(error));
      }
    }
  }

  /**
   * Validate token with authorization endpoint
   * POST /api/role/authorize
   */
  async validateToken(token?: string): Promise<User> {
    try {
      const authToken = token || (await tokenService.getToken());

      if (!authToken) {
        throw new Error('No token available');
      }

      // Check token expiration before making API call
      // if (tokenService.isTokenExpired(authToken)) {
      //   throw new Error('Token expired');
      // }

      console.log('🔍 Validating token with authorization API...');

      // Note: The authorization endpoint might need proper host configuration
      // Currently using localhost:5002 as per provided curl example
      const response = await authApiClient.post(
        '/role/authorize',
        {},
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        },
      );

      const authResponse: AuthorizeApiResponse = response.data;

      if (authResponse.status !== 200 || !authResponse.user) {
        throw new Error('Token validation failed');
      }

      // Convert API user format to our internal User format
      const apiUser = authResponse.user;
      const user: User = {
        id: apiUser._id,
        name: apiUser.name,
        email: apiUser.email,
        mobileNumber: apiUser.mobileNo,
        department: this.mapRoleToOurDepartment(apiUser.role),
        role: apiUser.role,
        tenantId: apiUser.tenantId, // Required for topic subscription
        createdAt: apiUser.createdAt,
      };

      // Update stored user data
      await tokenService.storeUserData(user);

      console.log('✅ Token validation successful:', user.name);
      return user;
    } catch (error: any) {
      console.error('❌ Token validation failed:', error);

      if (error.response?.status === 401) {
        // Clear invalid token
        await tokenService.clearAll();
        throw new Error('Invalid or expired token');
      } else {
        throw new Error(handleNetworkError(error));
      }
    }
  }

  /**
   * Logout user and clear all stored data
   */
  async logout(): Promise<void> {
    try {
      console.log('🔐 Logging out user...');

      // Unsubscribe from current notification topic
      await this.unsubscribeFromNotificationTopic();

      // Clear all stored authentication data
      await tokenService.clearAll();

      // Note: If the API has a logout endpoint, call it here
      // await apiClient.post('/auth/logout');

      console.log('✅ Logout successful');
    } catch (error) {
      console.error('❌ Logout error:', error);
      // Even if logout API fails, clear local data
      await tokenService.clearAll();
    }
  }

  /**
   * Check if user has valid authentication
   */
  async checkAuthState(): Promise<LoginResponse> {
    try {
      console.log('🔍 Checking authentication state...');

      const token = await tokenService.getToken();
      const userData = await tokenService.getUserData();

      if (!token || !userData) {
        throw new Error('No stored authentication data');
      }

      // Validate token with server
      const user = await this.validateToken(token);

      return {
        user,
        token,
      };
    } catch (error) {
      console.log('⚠️ Auth state check failed:', error);
      // Clear invalid data
      await tokenService.clearAll();
      throw error;
    }
  }

  /**
   * Get current user from stored data without API validation
   * Useful for quick access when token is known to be valid
   */
  async getCurrentUser(): Promise<User | null> {
    try {
      return await tokenService.getUserData();
    } catch (error) {
      console.error('❌ Failed to get current user:', error);
      return null;
    }
  }

  /**
   * Check if token exists and is not expired
   */
  async hasValidToken(): Promise<boolean> {
    try {
      const token = await tokenService.getToken();
      if (!token) return false;

      return !tokenService.isTokenExpired(token);
    } catch (error) {
      return false;
    }
  }

  /**
   * Map API role to our internal department structure
   * This might need adjustment based on actual API role values
   */
  private mapRoleToOurDepartment(
    apiRole: string,
  ): 'HR' | 'Admin' | 'Supervisor' {
    const role = apiRole.toLowerCase();

    if (role.includes('hr') || role.includes('human')) {
      return 'HR';
    } else if (role.includes('admin') || role.includes('editor')) {
      return 'Admin';
    } else if (role.includes('supervisor') || role.includes('manager')) {
      return 'Supervisor';
    } else {
      // Default mapping
      return 'Admin';
    }
  }

  /**
   * Get token info for debugging
   */
  async getTokenInfo(): Promise<any> {
    try {
      const token = await tokenService.getToken();
      if (!token) return null;

      return tokenService.getTokenInfo(token);
    } catch (error) {
      console.error('❌ Failed to get token info:', error);
      return null;
    }
  }

  /**
   * Subscribe to FCM topic using tenantId for notifications
   */
  private async subscribeToNotificationTopic(tenantId: string): Promise<void> {
    try {
      console.log('📲 Subscribing to notification topic...');

      // Import notification service dynamically to avoid circular dependencies
      const { notificationService } = await import('./notificationService');

      const subscribed = await notificationService.subscribeToTopic(tenantId);

      if (subscribed) {
        console.log(`✅ Successfully subscribed to topic: ${tenantId}`);
      } else {
        console.warn(`⚠️ Failed to subscribe to topic: ${tenantId}`);
      }
    } catch (error) {
      console.error('❌ Failed to subscribe to notification topic:', error);
    }
  }

  /**
   * Unsubscribe from current FCM topic
   */
  private async unsubscribeFromNotificationTopic(): Promise<void> {
    try {
      console.log('📲 Unsubscribing from notification topic...');

      // Import notification service dynamically to avoid circular dependencies
      const { notificationService } = await import('./notificationService');

      const currentTenantId = await notificationService.getCurrentTenantId();

      if (currentTenantId) {
        const unsubscribed = await notificationService.unsubscribeFromTopic(
          currentTenantId,
        );

        if (unsubscribed) {
          console.log(
            `✅ Successfully unsubscribed from topic: ${currentTenantId}`,
          );
        } else {
          console.warn(
            `⚠️ Failed to unsubscribe from topic: ${currentTenantId}`,
          );
        }
      } else {
        console.log('ℹ️ No active topic subscription to unsubscribe from');
      }
    } catch (error) {
      console.error('❌ Failed to unsubscribe from notification topic:', error);
    }
  }

  // Method to get users by department (keeping for backward compatibility)
  async getUsersByDepartment(
    department: 'HR' | 'Admin' | 'Supervisor',
  ): Promise<User[]> {
    // This will need to be implemented when the API provides this endpoint
    // For now, return empty array
    console.warn('⚠️ getUsersByDepartment not implemented with real API yet');
    return [];
  }
}

export const realAuthService = new RealAuthService();
export default realAuthService;
