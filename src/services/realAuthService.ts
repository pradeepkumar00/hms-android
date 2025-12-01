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
    role?: string; // Role can be optional in some cases
    isTokenAssignable: boolean;
    subCategory: string;
    type: string;
    departmentId?: string; // Department ID from production API
    status: string;
    currentToken: string;
    doctorCode?: string | null; // Doctor code (can be null)
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
        type: apiUser.type,
        tenantId: apiUser.tenantId, // Required for topic subscription
        createdAt: apiUser.createdAt,
        // Additional fields from production API
        departmentId: apiUser.departmentId,
        doctorCode: apiUser.doctorCode,
        isTokenAssignable: apiUser.isTokenAssignable,
        subCategory: apiUser.subCategory,
        status: apiUser.status,
        currentToken: apiUser.currentToken,
        child: apiUser.child,
        route: apiUser.route,
        consultFees: apiUser.consultFees,
        isSlot: apiUser.isSlot,
        updatedAt: apiUser.updatedAt,
        __v: apiUser.__v,
      };

      // Store token and user data securely
      await tokenService.storeToken(token);
      await tokenService.storeUserData(user);

      console.log('✅ Login successful:', user.name);

      // Subscribe to FCM topic using tenantId for notifications (async - don't block login)
      this.subscribeToNotificationTopic(user.tenantId)
        .then(() => {
          console.log('🔔 FCM topic subscription completed successfully');
        })
        .catch(error => {
          console.error(
            '⚠️ Topic subscription failed but login continues:',
            error,
          );
        });

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
        type: apiUser.type,
        tenantId: apiUser.tenantId, // Required for topic subscription
        createdAt: apiUser.createdAt,
        // Additional fields from production API
        departmentId: apiUser.departmentId,
        doctorCode: apiUser.doctorCode,
        isTokenAssignable: apiUser.isTokenAssignable,
        subCategory: apiUser.subCategory,
        status: apiUser.status,
        currentToken: apiUser.currentToken,
        child: apiUser.child,
        route: apiUser.route,
        consultFees: apiUser.consultFees,
        isSlot: apiUser.isSlot,
        updatedAt: apiUser.updatedAt,
        __v: apiUser.__v,
      };

      // Update stored user data
      await tokenService.storeUserData(user);

      console.log('✅ Token validation successful:', user.name);
      console.log('📋 User tenantId from validation:', user.tenantId);

      // CRITICAL: Subscribe to FCM topic using tenantId for notifications
      // This ensures notifications work even when user logged in via web/other device
      if (user.tenantId) {
        console.log(
          `🔔 Attempting to subscribe to FCM topic: ${user.tenantId}`,
        );
        this.subscribeToNotificationTopic(user.tenantId)
          .then(() => {
            console.log(
              '🔔 FCM topic subscription completed successfully after token validation',
            );
          })
          .catch(error => {
            console.error(
              '❌ Topic subscription failed after token validation:',
              error,
            );
            console.error('Error details:', {
              message: error?.message,
              stack: error?.stack,
            });
          });
      } else {
        console.error(
          '❌ CRITICAL: No tenantId found in user data, cannot subscribe to FCM topic',
        );
        console.error('User object:', JSON.stringify(user, null, 2));
      }

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
   * Check if user has valid authentication with timeout protection
   */
  async checkAuthState(): Promise<LoginResponse> {
    try {
      console.log('🔍 Checking authentication state...');

      // Add timeout protection
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Auth check timeout')), 10000); // 10 second timeout
      });

      const authCheckPromise = (async () => {
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
      })();

      // Race between auth check and timeout
      const result = (await Promise.race([
        authCheckPromise,
        timeoutPromise,
      ])) as LoginResponse;
      console.log('✅ Auth state check completed successfully');
      return result;
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
    apiRole?: string,
  ): 'HR' | 'Admin' | 'Supervisor' {
    // Handle undefined, null, or empty role values
    if (!apiRole || typeof apiRole !== 'string') {
      console.warn('⚠️ Role is undefined or invalid, defaulting to Admin');
      return 'Admin';
    }

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
   * Fetch task by ID from backend
   */
  async fetchTaskById(taskId: string, token: string): Promise<any> {
    try {
      console.log(`📋 Fetching task by ID: ${taskId}`);

      const response = await apiClient.get(`/task/taskId/${taskId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      console.log('✅ Task fetched successfully:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Failed to fetch task by ID:', error);
      throw error;
    }
  }

  /**
   * Fetch tasks created by current user
   * GET /api/task/created?status={status}
   */
  async fetchCreatedTasks(
    token: string,
    status?:
      | 'today'
      | 'new'
      | 'assigned'
      | 'progress'
      | 'completed'
      | 'withdraw',
  ): Promise<any> {
    try {
      console.log(`📋 Fetching created tasks with status: ${status || 'all'}`);

      const params = status ? `?status=${status}` : '';
      const response = await apiClient.get(`/task/created${params}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      console.log('✅ Created tasks fetched successfully:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Failed to fetch created tasks:', error);
      throw error;
    }
  }

  /**
   * Fetch tasks assigned to current user
   * GET /api/tasks (returns assignedToMe array)
   * Or GET /api/task/assigned if endpoint exists
   */
  async fetchAssignedTasks(token: string): Promise<any> {
    try {
      console.log('📋 Fetching tasks assigned to current user...');

      // Try the /api/tasks endpoint first (returns assignedToMe and createdByMe)
      try {
        const response = await apiClient.get('/tasks', {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        // If response has assignedToMe array, return it
        if (response.data?.data?.assignedToMe) {
          console.log(
            `✅ Assigned tasks fetched successfully: ${response.data.data.assignedToMe.length} tasks`,
          );
          return response.data.data.assignedToMe;
        }

        // If response is an array directly, return it
        if (Array.isArray(response.data)) {
          console.log(
            `✅ Assigned tasks fetched successfully: ${response.data.length} tasks`,
          );
          return response.data;
        }

        // Fallback: return empty array if structure is unexpected
        console.warn('⚠️ Unexpected response structure, returning empty array');
        return [];
      } catch (tasksError: any) {
        // If /api/tasks fails, try /api/task/assigned endpoint
        console.log(
          '⚠️ /api/tasks endpoint failed, trying /api/task/assigned...',
        );
        const assignedResponse = await apiClient.get('/task/assigned', {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (Array.isArray(assignedResponse.data)) {
          console.log(
            `✅ Assigned tasks fetched successfully: ${assignedResponse.data.length} tasks`,
          );
          return assignedResponse.data;
        }

        // If response has a data property, return it
        if (assignedResponse.data?.data) {
          return assignedResponse.data.data;
        }

        return assignedResponse.data || [];
      }
    } catch (error) {
      console.error('❌ Failed to fetch assigned tasks:', error);
      throw error;
    }
  }

  /**
   * Fetch tasks assigned to current user with status filter
   * GET /api/task/assigned?status={status}
   */
  async fetchAssignedTasksWithStatus(
    token: string,
    status?:
      | 'today'
      | 'new'
      | 'assigned'
      | 'progress'
      | 'completed'
      | 'withdraw',
  ): Promise<any> {
    try {
      console.log(`📋 Fetching assigned tasks with status: ${status || 'all'}`);

      const params = status ? `?status=${status}` : '';
      const response = await apiClient.get(`/task/assigned${params}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      console.log(
        '✅ Assigned tasks with status fetched successfully:',
        response.data,
      );
      return response.data;
    } catch (error) {
      console.error('❌ Failed to fetch assigned tasks with status:', error);
      throw error;
    }
  }

  /**
   * Update task status and assignment
   * PUT /api/task/taskId/{taskId}/update
   */
  async updateTaskStatus(
    taskId: string,
    token: string,
    updateData: {
      status: 'new' | 'assigned' | 'progress' | 'completed';
      assignedTo?: string;
      assignedToName?: string;
    },
  ): Promise<any> {
    try {
      console.log(
        `📋 Updating task ${taskId} with status: ${updateData.status}`,
      );

      const response = await apiClient.post(
        `/task/taskId/${taskId}/update`,
        updateData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      console.log('✅ Task updated successfully:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Failed to update task:', error);
      throw error;
    }
  }

  /**
   * Fetch task with hierarchy (parent and children)
   * GET /api/task/taskId/{taskId}
   * Returns task with parentTask and childTask arrays (Phase 10)
   */
  async fetchTaskWithHierarchy(taskId: string, token: string): Promise<any> {
    try {
      console.log(`📋 Fetching task with hierarchy: ${taskId}`);

      const response = await apiClient.get(`/task/taskId/${taskId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      console.log('✅ Task with hierarchy fetched successfully:', {
        taskId: response.data?.task?._id,
        hasParent: !!response.data?.parentTask,
        childrenCount: response.data?.childTask?.length || 0,
      });

      return response.data;
    } catch (error) {
      console.error('❌ Failed to fetch task with hierarchy:', error);
      throw error;
    }
  }

  /**
   * Create child task with parentTaskId
   * POST /api/task
   * Creates a new task with parent-child relationship (Phase 10)
   */
  async createChildTask(
    taskData: {
      title: string;
      description: string;
      assignedTo: string;
      assignedToName: string;
      dueDate: string;
      status: 'new' | 'assigned';
      parentTaskId: string;
    },
    token: string,
  ): Promise<any> {
    try {
      console.log(
        `📋 Creating child task for parent: ${taskData.parentTaskId}`,
      );

      const response = await apiClient.post('/task', taskData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      console.log('✅ Child task created successfully:', {
        taskId: response.data?.task?._id,
        parentTaskId: taskData.parentTaskId,
      });

      return response.data;
    } catch (error) {
      console.error('❌ Failed to create child task:', error);
      throw error;
    }
  }

  /**
   * Fetch notifications from API
   * GET /task/notification
   */
  async fetchNotifications(token: string): Promise<any[]> {
    try {
      console.log('🔔 Fetching notifications from API...');

      const response = await apiClient.get('/task/notification', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      console.log(
        '✅ Notifications fetched successfully:',
        response.data?.length || 0,
        'notifications',
      );

      // API returns array of notification objects directly
      return response.data || [];
    } catch (error) {
      console.error('❌ Failed to fetch notifications:', error);
      throw error;
    }
  }

  /**
   * Subscribe to FCM topic using tenantId for notifications
   */
  private async subscribeToNotificationTopic(tenantId: string): Promise<void> {
    try {
      console.log('📲 Subscribing to notification topic...');
      console.log(`📲 Topic to subscribe: ${tenantId}`);

      if (!tenantId || tenantId.trim() === '') {
        console.error(
          '❌ Invalid tenantId provided for subscription:',
          tenantId,
        );
        throw new Error('Invalid tenantId: empty or null');
      }

      // Import notification service dynamically to avoid circular dependencies
      const { notificationService } = await import('./notificationService');

      console.log('📲 Calling notificationService.subscribeToTopic...');
      const subscribed = await notificationService.subscribeToTopic(tenantId);

      if (subscribed) {
        console.log(`✅ Successfully subscribed to topic: ${tenantId}`);
      } else {
        console.error(`❌ Failed to subscribe to topic: ${tenantId}`);
        throw new Error(`Subscription returned false for topic: ${tenantId}`);
      }
    } catch (error: any) {
      console.error('❌ Failed to subscribe to notification topic:', error);
      console.error('Error details:', {
        message: error?.message,
        stack: error?.stack,
        tenantId,
      });
      throw error; // Re-throw to be caught by caller
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
