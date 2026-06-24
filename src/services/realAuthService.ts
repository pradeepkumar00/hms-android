import {
  apiClient,
  authApiClient,
  makeApiCall,
  handleNetworkError,
} from './apiConfig';
import { tokenService, StoredUserData } from './tokenService';
import { LoginCredentials, LoginResponse, User, ApiResponse } from '../types';
import { validateEmail, validatePassword } from '../utils/validation';
import { mergeQueueIntoSlots } from '../utils/slot.util';
import ReactNativeBlobUtil from 'react-native-blob-util';

/**
 * Real Authentication Service
 * Integrates with API endpoints for authentication
 * Following React Native authentication best practices
 * Uses environment service for dynamic API URLs
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
    bookingMode?: string;
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
   * POST /api/cred/login (URL from environment configuration)
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
        bookingMode: apiUser.bookingMode,
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
        bookingMode: apiUser.bookingMode,
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
   * Fetch appointments within a date range (inclusive) for the calendar
   * GET /api/appointments/range?from={YYYY-MM-DD}&to={YYYY-MM-DD}
   */
  async fetchAppointmentsRange(
    token: string,
    from: string,
    to: string,
  ): Promise<any[]> {
    try {
      console.log(`📅 Fetching appointments from ${from} to ${to}`);

      const response = await apiClient.get('/appointments/range', {
        params: { from, to },
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      // API returns { data: [...] }
      const appointments = response.data?.data ?? response.data ?? [];
      console.log(
        `✅ Appointments fetched successfully: ${
          Array.isArray(appointments) ? appointments.length : 0
        } appointments`,
      );
      return Array.isArray(appointments) ? appointments : [];
    } catch (error) {
      console.error('❌ Failed to fetch appointments:', error);
      throw error;
    }
  }

  /**
   * Fetch tenant app configuration (includes regisConfig for patient registration).
   * GET /api/config
   */
  async fetchAppConfig(token: string): Promise<any> {
    try {
      console.log('⚙️ Fetching app config');

      const response = await apiClient.get('/config', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const body = response.data?.data ?? response.data ?? {};
      console.log(
        '⚙️ Config loaded — regisConfig keys:',
        Object.keys(body?.regisConfig ?? {}),
      );
      return body;
    } catch (error) {
      console.error('❌ Failed to fetch app config:', error);
      throw new Error(handleNetworkError(error));
    }
  }

  /**
   * Book an appointment (admin calendar / counter).
   * POST /api/admin/book-appointment
   */
  async bookAdminAppointment(
    payload: {
      doctorId: string;
      phone: string;
      patientName: string;
      date: string;
      paymentMode?: string;
      patientId?: string;
      slotTokenCount?: number;
      appointmentTime?: string;
      duration?: number;
    },
    token: string,
  ): Promise<any> {
    try {
      const response = await apiClient.post('/admin/book-appointment', payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const body = response.data ?? {};
      if (body.status >= 400) {
        throw new Error(body.message || 'Failed to book appointment');
      }

      return body.data ?? body;
    } catch (error) {
      console.error('❌ Failed to book appointment:', error);
      throw new Error(handleNetworkError(error));
    }
  }

  /**
   * Register a new patient.
   * POST /api/add/patient
   */
  async registerPatient(
    payload: Record<string, unknown>,
    token: string,
  ): Promise<any> {
    try {
      console.log('📝 Registering patient via /add/patient');

      const response = await apiClient.post('/add/patient', payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const body = response.data ?? {};
      if (body.status >= 400) {
        throw new Error(body.message || 'Failed to register patient');
      }

      console.log('✅ Patient registered');
      return body.data ?? body;
    } catch (error) {
      console.error('❌ Failed to register patient:', error);
      throw new Error(handleNetworkError(error));
    }
  }

  /**
   * Admin booking availability dates for reschedule.
   * GET /appointments/booking-availability/:doctorId
   */
  async fetchBookingAvailability(
    doctorId: string,
    token: string,
  ): Promise<Array<{ date: string; label?: string }>> {
    try {
      const response = await apiClient.get(
        `/appointments/booking-availability/${doctorId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );
      const body = response.data?.data ?? response.data ?? {};
      const dates = body?.dates ?? [];
      return Array.isArray(dates) ? dates : [];
    } catch (error) {
      console.error('❌ Failed to fetch booking availability:', error);
      throw new Error(handleNetworkError(error));
    }
  }

  /**
   * Reschedule an appointment (admin panel).
   * POST /appointments/reschedule
   */
  async rescheduleAppointment(
    payload: Record<string, unknown>,
    token: string,
  ): Promise<any> {
    try {
      const response = await apiClient.post('/appointments/reschedule', payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      const body = response.data ?? {};
      if (body.status >= 400) {
        throw new Error(body.message || 'Failed to reschedule appointment');
      }
      return body.data ?? body;
    } catch (error) {
      console.error('❌ Failed to reschedule appointment:', error);
      throw new Error(handleNetworkError(error));
    }
  }

  /**
   * Cancel an appointment.
   * POST /appointments/cancel
   */
  async cancelAppointment(
    payload: Record<string, unknown>,
    token: string,
  ): Promise<any> {
    try {
      const response = await apiClient.post('/appointments/cancel', payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      const body = response.data ?? {};
      if (body.status >= 400) {
        throw new Error(body.message || 'Failed to cancel appointment');
      }
      return body.data ?? body;
    } catch (error) {
      console.error('❌ Failed to cancel appointment:', error);
      throw new Error(handleNetworkError(error));
    }
  }

  /**
   * Fetch paginated patient list.
   * GET /api/patient?page=0&limit=20
   */
  async fetchPatients(
    token: string,
    params: {
      page?: number;
      limit?: number;
      search?: string;
      name?: string;
      mobileNo?: string;
      type?: string;
      doctorId?: string;
    } = {},
  ): Promise<{
    patients: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasMore: boolean;
  }> {
    const page = params.page ?? 0;
    const limit = params.limit ?? 20;

    try {
      console.log(`👥 Fetching patients page=${page} limit=${limit}`);

      const queryParams: Record<string, string | number> = { page, limit };

      if (params.type?.trim()) {
        queryParams.type = params.type.trim();
      }
      if (params.doctorId?.trim()) {
        queryParams.doctorId = params.doctorId.trim();
      }
      if (params.name?.trim()) {
        queryParams.name = params.name.trim();
      }
      if (params.mobileNo?.trim()) {
        queryParams.mobileNo = params.mobileNo.trim();
      }
      if (params.search?.trim()) {
        queryParams.search = params.search.trim();
      }

      const response = await apiClient.get('/patient', {
        params: queryParams,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const root = response.data ?? {};
      const body = root.data ?? root;

      const rawList = Array.isArray(body)
        ? body
        : body.patients ??
          body.docs ??
          body.list ??
          body.rows ??
          body.records ??
          body.result ??
          body.items ??
          body.users ??
          (Array.isArray(root.users) ? root.users : undefined) ??
          (Array.isArray(body?.data) ? body.data : undefined) ??
          [];

      const patients = Array.isArray(rawList) ? rawList : [];

      const paginationSource =
        root.totalPages != null ||
        root.totalItems != null ||
        root.currentPage != null
          ? root
          : body.totalPages != null ||
              body.totalItems != null ||
              body.currentPage != null
            ? body
            : Array.isArray(body)
              ? root
              : body;

      const currentPage =
        paginationSource.currentPage ??
        paginationSource.page ??
        page;

      const totalItems =
        paginationSource.totalItems ??
        paginationSource.total ??
        paginationSource.totalCount ??
        paginationSource.totalRecords ??
        paginationSource.count ??
        root.totalItems ??
        root.total ??
        root.totalCount ??
        patients.length;

      const totalPages =
        paginationSource.totalPages ??
        Math.max(1, Math.ceil(totalItems / limit));

      const hasMore = currentPage < totalPages - 1;

      if (patients.length === 0) {
        console.log('⚠️ Patient list empty — response keys:', {
          rootKeys: Object.keys(root),
          bodyKeys: Array.isArray(body) ? 'array' : Object.keys(body ?? {}),
        });
      }

      console.log(
        `✅ Patients fetched: ${patients.length} (page ${currentPage + 1}/${totalPages}, total: ${totalItems})`,
      );
      return {
        patients,
        total: totalItems,
        page: currentPage,
        limit,
        totalPages,
        hasMore,
      };
    } catch (error) {
      console.error('❌ Failed to fetch patients:', error);
      throw new Error(handleNetworkError(error));
    }
  }

  /**
   * Fetch all appointments for a patient.
   * GET /api/appointments/patient?patientId={id}
   */
  async fetchPatientAppointments(
    patientId: string,
    token: string,
  ): Promise<{ appointments: any[]; patient: any | null }> {
    try {
      console.log(`📅 Fetching appointments for patient ${patientId}`);

      const response = await apiClient.get('/appointments/patient', {
        params: { patientId },
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const body = response.data ?? {};
      const appointments = body.data ?? [];
      const patient = body.patient ?? null;
      console.log(
        `✅ Patient appointments fetched: ${
          Array.isArray(appointments) ? appointments.length : 0
        }`,
      );
      return {
        appointments: Array.isArray(appointments) ? appointments : [],
        patient,
      };
    } catch (error) {
      console.error('❌ Failed to fetch patient appointments:', error);
      throw error;
    }
  }

  /**
   * Fetch a single patient record.
   * GET /patient/:id
   */
  async fetchPatientById(patientId: string, token: string): Promise<any> {
    try {
      const response = await apiClient.get(`/patient/${patientId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      const body = response.data?.data ?? response.data ?? {};
      return body.user ?? body.patient ?? body ?? null;
    } catch (error) {
      console.error('❌ Failed to fetch patient:', error);
      throw new Error(handleNetworkError(error));
    }
  }

  /**
   * Update an existing patient.
   * POST /patient/:id/edit
   */
  async editPatient(
    patientId: string,
    payload: Record<string, unknown>,
    token: string,
  ): Promise<any> {
    try {
      const response = await apiClient.post(`/patient/${patientId}/edit`, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      const body = response.data ?? {};
      if (body.status >= 400) {
        throw new Error(body.message || 'Failed to update patient');
      }
      return body.data ?? body;
    } catch (error) {
      console.error('❌ Failed to update patient:', error);
      throw new Error(handleNetworkError(error));
    }
  }

  /**
   * Move a patient to OPD — hits GET /patient/:id as per the backend flow.
   */
  async moveToOpd(patientId: string, token: string): Promise<any> {
    try {
      console.log(`🏥 Move to OPD for patient ${patientId}`);

      const patient = await this.fetchPatientById(patientId, token);
      console.log('✅ Move to OPD request succeeded');
      return patient;
    } catch (error) {
      console.error('❌ Move to OPD failed:', error);
      throw error;
    }
  }

  /**
   * Update an appointment's status (e.g. "completed"). Hits
   * POST /appointments/:id/status with { status }.
   */
  async updateAppointmentStatus(
    appointmentId: string,
    status: string,
    token: string,
  ): Promise<any> {
    try {
      console.log(`📝 Updating appointment ${appointmentId} -> ${status}`);

      const response = await apiClient.post(
        `/appointments/${appointmentId}/status`,
        { status },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      console.log('✅ Appointment status updated');
      return response.data?.data ?? response.data ?? null;
    } catch (error) {
      console.error('❌ Failed to update appointment status:', error);
      throw error;
    }
  }

  /**
   * Save or update an appointment remark.
   * PATCH /appointments/:id/remark
   */
  async saveAppointmentRemark(
    appointmentId: string,
    remark: string,
    token: string,
  ): Promise<any> {
    try {
      console.log(`📝 Saving remark for appointment ${appointmentId}`);

      const response = await apiClient.patch(
        `/appointments/${appointmentId}/remark`,
        { remark },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      console.log('✅ Appointment remark saved');
      return response.data?.data ?? response.data ?? null;
    } catch (error) {
      console.error('❌ Failed to save appointment remark:', error);
      throw error;
    }
  }

  /**
   * Fetch the prescription configuration for the given (comma-separated) categories.
   */
  async fetchPrescriptionConfig(
    categories: string,
    token: string,
  ): Promise<any> {
    try {
      console.log('💊 Fetching prescription config');

      // Embed categories directly so commas are sent as-is (not re-encoded).
      const response = await apiClient.get(
        `/prescriptionConfig?categories=${categories}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      return response.data?.data ?? response.data ?? null;
    } catch (error) {
      console.error('❌ Failed to fetch prescription config:', error);
      throw error;
    }
  }

  /**
   * Fetch a patient's prescriptions (e.g. type "opd").
   */
  async fetchPrescriptions(
    patientId: string,
    type: string,
    token: string,
  ): Promise<any[]> {
    try {
      console.log(`💊 Fetching ${type} prescriptions for patient ${patientId}`);

      const response = await apiClient.get('/prescription', {
        params: { patientId, type },
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = response.data?.data ?? response.data ?? [];
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error('❌ Failed to fetch prescriptions:', error);
      throw error;
    }
  }

  /**
   * Fetch a patient's full prescription history (uploads, lab reports, notes,
   * etc.) from the no-session endpoint. Returns the raw structured object with
   * its various arrays (prescriptionUpload, labreport, ...).
   */
  async fetchPrescriptionHistory(
    patientId: string,
    type: string,
    token: string,
  ): Promise<any> {
    try {
      console.log(`💊 Fetching ${type} prescription history for ${patientId}`);

      const response = await apiClient.get('/prescription/no-session', {
        params: { patientId, type },
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      return response.data?.data ?? response.data ?? {};
    } catch (error) {
      console.error('❌ Failed to fetch prescription history:', error);
      throw error;
    }
  }

  /** All patient bucket uploads (includes session-linked rows). */
  async fetchPatientUploads(patientId: string, token: string): Promise<any[]> {
    try {
      const response = await apiClient.get('/file/patient/list', {
        params: { patientId, limit: 500 },
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      return response.data?.data ?? [];
    } catch (error) {
      console.error('❌ Failed to fetch patient uploads:', error);
      return [];
    }
  }

  /**
   * PUT a local file to GCS using a signed URL. Uses react-native-blob-util so
   * content:// URIs on Android work reliably (fetch(blob) often fails there).
   */
  private async putLocalFileToStorage(
    file: { uri: string; name: string; type: string },
    uploadUrl: string,
    method: string,
    uploadHeaders: Record<string, string>,
  ): Promise<number> {
    const httpMethod = (method || 'PUT').toUpperCase() as 'PUT' | 'POST';
    const response = await ReactNativeBlobUtil.fetch(
      httpMethod,
      uploadUrl,
      uploadHeaders,
      ReactNativeBlobUtil.wrap(file.uri),
    );
    const status = response.info().status;
    if (status < 200 || status >= 300) {
      const rawText = response.text();
      const errorBody =
        rawText instanceof Promise
          ? await rawText.catch(() => '')
          : String(rawText || '');
      console.error('❌ Storage upload rejected:', errorBody);
      throw new Error(`File upload failed (status ${status})`);
    }
    try {
      const path = file.uri.replace(/^file:\/\//, '');
      const stat = await ReactNativeBlobUtil.fs.stat(path);
      return Number(stat.size) || 0;
    } catch {
      return 0;
    }
  }

  private parseUploadInstructions(
    meta: any,
    fallbackMime: string,
  ): { uploadUrl: string; method: string; uploadHeaders: Record<string, string> } {
    const instructions = meta.instructions ?? {};
    const uploadUrl =
      instructions.url ||
      meta.uploadUrl ||
      meta.url ||
      meta.signedUrl ||
      meta.presignedUrl;
    const method = (instructions.method || 'PUT').toUpperCase();
    const uploadHeaders = instructions.headers || {
      'Content-Type': fallbackMime,
    };
    if (!uploadUrl) {
      throw new Error('Upload URL was not returned by the server');
    }
    return { uploadUrl, method, uploadHeaders };
  }

  private async stagePatientFile(
    file: { uri: string; name: string; type: string },
    patientId: string,
    fileType: string,
    token: string,
  ): Promise<{
    filePath: string;
    fileName: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
  }> {
    const urlResponse = await apiClient.post(
      '/file/patient/upload-url',
      {
        patientId,
        type: fileType,
        originalName: file.name,
        mimeType: file.type,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      },
    );

    const meta = urlResponse.data?.data ?? urlResponse.data ?? {};
    const { uploadUrl, method, uploadHeaders } = this.parseUploadInstructions(
      meta,
      file.type,
    );
    const sizeBytes = await this.putLocalFileToStorage(
      file,
      uploadUrl,
      method,
      uploadHeaders,
    );

    return {
      filePath: meta.filePath,
      fileName: meta.fileName || file.name,
      originalName: meta.originalName || file.name,
      mimeType: meta.mimeType || file.type,
      sizeBytes,
    };
  }

  /**
   * Upload a patient file (e.g. a prescription) using the presigned-URL flow.
   */
  async uploadPatientFile(
    file: { uri: string; name: string; type: string },
    patientId: string,
    fileType: string,
    token: string,
    category?: string,
  ): Promise<any> {
    try {
      console.log(`📤 Requesting upload URL for ${fileType}: ${file.name}`);

      const staged = await this.stagePatientFile(
        file,
        patientId,
        fileType,
        token,
      );

      console.log('✅ File uploaded to storage, confirming…');

      const confirmResponse = await apiClient.post(
        '/file/patient/confirm-upload',
        {
          patientId,
          type: fileType,
          filePath: staged.filePath,
          fileName: staged.fileName,
          originalName: staged.originalName,
          mimeType: staged.mimeType,
          sizeBytes: staged.sizeBytes,
          category: category || '',
          sessionId: '',
          prescriptionId: '',
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      console.log('✅ Upload confirmed');
      return confirmResponse.data?.data ?? confirmResponse.data ?? staged;
    } catch (error) {
      console.error('❌ Failed to upload patient file:', error);
      throw error;
    }
  }

  /**
   * Upload one or more patient files (batch uses confirm-batch-upload).
   */
  async uploadPatientFiles(
    files: Array<{ uri: string; name: string; type: string }>,
    patientId: string,
    fileType: string,
    token: string,
    category?: string,
  ): Promise<any> {
    if (!files.length) {
      throw new Error('No files selected');
    }
    if (files.length === 1) {
      return this.uploadPatientFile(
        files[0],
        patientId,
        fileType,
        token,
        category,
      );
    }

    try {
      const staged: Array<{
        filePath: string;
        fileName: string;
        originalName: string;
        mimeType: string;
        sizeBytes: number;
      }> = [];

      for (const file of files) {
        staged.push(await this.stagePatientFile(file, patientId, fileType, token));
      }

      const common = {
        patientId,
        type: fileType,
        category: category || 'COMMON',
        sessionId: '',
        prescriptionId: '',
      };

      const confirmResponse = await apiClient.post(
        '/file/patient/confirm-batch-upload',
        { ...common, files: staged },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const body = confirmResponse.data ?? {};
      if (body.status >= 400 || body.success === false) {
        throw new Error(body.message || 'Failed to confirm batch upload');
      }

      console.log(`✅ Batch upload confirmed (${staged.length} files)`);
      return body.data ?? body;
    } catch (error) {
      console.error('❌ Failed to upload patient files:', error);
      throw error;
    }
  }

  /**
   * Get a temporary signed (GET) URL for viewing/downloading a stored patient
   * file. The bucket objects are private, so this is required to open them.
   */
  async getPatientFileSignedUrl(
    filePath: string,
    patientId: string,
    token: string,
  ): Promise<string> {
    try {
      console.log(`🔗 Requesting signed URL for ${filePath}`);

      const response = await apiClient.post(
        '/file/patient/signed-url',
        { filePath, patientId },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const data = response.data?.data ?? response.data ?? {};
      const signedUrl = data.signedUrl || data.url;

      if (!signedUrl) {
        throw new Error('Signed URL was not returned by the server');
      }
      return signedUrl;
    } catch (error) {
      console.error('❌ Failed to get signed URL:', error);
      throw error;
    }
  }

  /**
   * Delete an uploaded patient file. Hits DELETE /file/patient/:id.
   */
  async deletePatientFile(fileId: string, token: string): Promise<any> {
    try {
      console.log(`🗑️ Deleting patient file ${fileId}`);

      const response = await apiClient.delete(`/file/patient/${fileId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      console.log('✅ Patient file deleted');
      return response.data?.data ?? response.data ?? null;
    } catch (error) {
      console.error('❌ Failed to delete patient file:', error);
      throw error;
    }
  }

  /**
   * Remove one file from a multi-file upload row.
   */
  async deletePatientFilePart(
    uploadId: string,
    filePath: string,
    token: string,
  ): Promise<any> {
    try {
      const qs = `filePath=${encodeURIComponent(filePath)}`;
      const response = await apiClient.delete(
        `/file/patient/${uploadId}/file?${qs}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );
      return response.data?.data ?? response.data ?? null;
    } catch (error) {
      console.error('❌ Failed to remove file from upload:', error);
      throw error;
    }
  }

  /**
   * Fetch the list of doctors for the current tenant. Hits
   * GET /users?type=doctor and returns the raw user records.
   */
  async fetchDoctors(token: string): Promise<any[]> {
    try {
      console.log('🩺 Fetching doctors');

      const response = await apiClient.get('/users', {
        params: { type: 'doctor' },
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const users =
        response.data?.users ?? response.data?.data ?? response.data ?? [];
      // Only keep actual doctor accounts (the endpoint can include others).
      const doctors = (Array.isArray(users) ? users : []).filter(
        (u: any) => u?.type === 'doctor',
      );
      console.log(`✅ Doctors fetched: ${doctors.length}`);
      return doctors;
    } catch (error) {
      console.error('❌ Failed to fetch doctors:', error);
      throw error;
    }
  }

  /**
   * Fetch the doctor → color map (GET /get-doctor). Returns a lookup keyed by
   * both doctor _id and doctorCode so callers can resolve a color either way.
   */
  async fetchDoctorColors(token: string): Promise<Record<string, string>> {
    try {
      console.log('🎨 Fetching doctor colors');

      const response = await apiClient.get('/get-doctor', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const list = response.data?.data ?? response.data ?? [];
      const map: Record<string, string> = {};
      (Array.isArray(list) ? list : []).forEach((d: any) => {
        if (d?.color) {
          if (d._id) map[d._id] = d.color;
          if (d.doctorCode) map[d.doctorCode] = d.color;
        }
      });
      return map;
    } catch (error) {
      console.error('❌ Failed to fetch doctor colors:', error);
      return {};
    }
  }

  /**
   * Doctor schedule meta (booking mode, default custom duration).
   * GET /slot?doctorId=
   */
  async fetchDoctorBookingProfile(
    doctorId: string,
    token: string,
  ): Promise<{ bookingMode?: string; customBookingDuration?: number }> {
    try {
      const response = await apiClient.get('/slot', {
        params: { doctorId },
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      const body = response.data?.data ?? response.data ?? {};
      return {
        bookingMode: body?.bookingMode,
        customBookingDuration: body?.customBookingDuration,
      };
    } catch (error) {
      console.error('❌ Failed to fetch doctor booking profile:', error);
      return {};
    }
  }

  /**
   * Fetch a doctor's bookable slots for a given day. Hits
   * GET /slot?doctorId=&date=YYYY-MM-DD&forBooking=1 and merges queue into slots
   * (same as web book-appointment).
   */
  async fetchDoctorSlots(
    doctorId: string,
    date: string,
    token: string,
  ): Promise<any[]> {
    try {
      console.log(`🕑 Fetching slots for doctor ${doctorId} on ${date}`);

      const response = await apiClient.get('/slot', {
        params: { doctorId, date, forBooking: 1 },
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const body = response.data?.data ?? response.data ?? {};
      const slots = Array.isArray(body?.slots) ? body.slots : [];
      const queue = Array.isArray(body?.queue) ? body.queue : [];
      return mergeQueueIntoSlots(slots, queue);
    } catch (error) {
      console.error('❌ Failed to fetch doctor slots:', error);
      throw error;
    }
  }

  /**
   * Load bill/patient matches before confirming arrival.
   * GET /whatsapp/confirm-arrival-preview
   */
  async fetchConfirmArrivalPreview(
    params: { queueId: string; tenantId: string; mobileNo?: string },
    token: string,
  ): Promise<any> {
    try {
      const response = await apiClient.get('/whatsapp/confirm-arrival-preview', {
        params,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      return response.data?.data ?? response.data ?? {};
    } catch (error) {
      console.error('❌ Failed to load confirm-arrival preview:', error);
      throw new Error(handleNetworkError(error));
    }
  }

  /**
   * Confirm patient arrival for a queue entry.
   * POST /whatsapp/confirm-arrival
   */
  async confirmArrival(
    payload: Record<string, unknown>,
    token: string,
  ): Promise<any> {
    try {
      const response = await apiClient.post('/whatsapp/confirm-arrival', payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      const body = response.data ?? {};
      if (body.status >= 400) {
        throw new Error(body.message || 'Failed to confirm arrival');
      }
      return body.data ?? body;
    } catch (error) {
      console.error('❌ Failed to confirm arrival:', error);
      throw new Error(handleNetworkError(error));
    }
  }

  /**
   * Book a follow-up (token-only) appointment. Hits POST /book-token.
   */
  async bookFollowupToken(
    params: {
      doctorId: string;
      doctorName: string;
      patientId: string;
      date: string; // YYYY-MM-DD
      appointmentTime?: string; // e.g. "12:00 PM"
      tokenCount?: number;
      duration?: number; // minutes (for custom bookings)
      details?: Array<{
        treatmentDesc: string;
        manageServiceId: string;
        expenseAmount: number;
        date: string;
        teeth: Record<string, number[]>;
        source?: 'catalog';
        qty?: number;
        description?: string;
      }>;
      remark?: string;
    },
    token: string,
  ): Promise<any> {
    try {
      console.log(
        `🎟️ Booking follow-up token for patient ${params.patientId} with doctor ${params.doctorId}`,
      );

      const payload: Record<string, unknown> = {
        doctorId: params.doctorId,
        patientId: params.patientId,
        doctorName: params.doctorName,
        date: params.date,
        tokenType: 'opd',
        visitType: 'FOLLOW_UP',
        expenseAmount: 0,
        paidAmount: 0,
        discount: 0,
      };

      if (params.details?.length) {
        payload.details = params.details;
      }
      if (params.remark?.trim()) {
        payload.remark = params.remark.trim();
      }
      if (params.tokenCount != null) {
        payload.tokenCount = params.tokenCount;
      }
      if (params.appointmentTime) {
        payload.appointmentTime = params.appointmentTime;
      }
      if (params.duration != null) {
        payload.duration = params.duration;
      }

      const response = await apiClient.post('/book-token', payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      console.log('✅ Follow-up token booked');
      const body = response.data;
      return body?.res ?? body?.data ?? body ?? null;
    } catch (error) {
      console.error('❌ Failed to book follow-up token:', error);
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

  /**
   * Fetch treatment plans for a patient.
   * GET /treatment-plan?patientId=...&noSession=1&type=opd
   */
  async fetchTreatmentPlans(
    patientId: string,
    token: string,
    type: string = 'opd',
  ): Promise<any[]> {
    try {
      console.log(`🦷 Fetching treatment plans for patient ${patientId}`);

      const response = await apiClient.get('/treatment-plan', {
        params: {
          patientId,
          noSession: 1,
          type,
        },
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const raw =
        response.data?.data ??
        response.data?.plans ??
        response.data?.treatmentPlans ??
        response.data;

      if (Array.isArray(raw)) {
        console.log(`✅ Treatment plans fetched: ${raw.length}`);
        return raw;
      }
      if (raw && typeof raw === 'object') {
        return [raw];
      }
      return [];
    } catch (error) {
      console.error('❌ Failed to fetch treatment plans:', error);
      throw error;
    }
  }

  /**
   * Cancel a treatment plan / bill group.
   * POST /payment/cancel-treatment
   */
  async cancelTreatment(
    payload: {
      patientId: string;
      groupId: string;
      cancelRemark: string;
    },
    token: string,
  ): Promise<any> {
    try {
      console.log(`🦷 Cancelling treatment group ${payload.groupId}`);

      const response = await apiClient.post('/payment/cancel-treatment', payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      console.log('✅ Treatment cancelled');
      return response.data?.data ?? response.data;
    } catch (error) {
      console.error('❌ Failed to cancel treatment:', error);
      throw error;
    }
  }

  /**
   * Save a treatment plan and bill for an OPD patient.
   * POST /treatment-plan
   */
  async saveTreatmentPlan(payload: Record<string, unknown>, token: string): Promise<any> {
    try {
      console.log('🦷 Saving treatment plan');

      const response = await apiClient.post('/treatment-plan', payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      console.log('✅ Treatment plan saved');
      return response.data?.data ?? response.data;
    } catch (error) {
      console.error('❌ Failed to save treatment plan:', error);
      throw error;
    }
  }

  /**
   * Update an existing treatment plan.
   * PUT /treatment-plan/:id
   */
  async updateTreatmentPlan(
    planId: string,
    payload: Record<string, unknown>,
    token: string,
  ): Promise<any> {
    try {
      console.log(`🦷 Updating treatment plan ${planId}`);

      const response = await apiClient.put(`/treatment-plan/${planId}`, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      console.log('✅ Treatment plan updated');
      return response.data?.data ?? response.data;
    } catch (error) {
      console.error('❌ Failed to update treatment plan:', error);
      throw error;
    }
  }

  /**
   * Fetch manage-service items (e.g. treatments) for the current tenant.
   * GET /manage-service?type=treatment
   */
  async fetchManageServices(
    token: string,
    type: string = 'treatment',
  ): Promise<
    Array<{ _id: string; name: string; price: number }>
  > {
    try {
      console.log(`🦷 Fetching manage services (${type})`);

      const response = await apiClient.get('/manage-service', {
        params: { type },
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json, text/plain, */*',
        },
      });

      const list =
        response.data?.data ??
        response.data?.services ??
        response.data?.result ??
        response.data ??
        [];
      const raw = Array.isArray(list) ? list : [];
      const services = raw.map((item: Record<string, unknown>) => ({
        _id: String(item._id ?? item.id ?? ''),
        name: String(
          item.serviceName ?? item.name ?? item.title ?? '',
        ),
        price: Number(
          item.servicePrice ??
            item.price ??
            item.amount ??
            item.cost ??
            item.fees ??
            item.rate ??
            0,
        ),
      }));
      console.log(`✅ Manage services fetched: ${services.length}`);
      return services;
    } catch (error) {
      console.error('❌ Failed to fetch manage services:', error);
      throw error;
    }
  }

  /**
   * Raw manage-service records for follow-up treatment picker.
   * GET /manage-service?type=treatment
   */
  async fetchManageServiceRecords(
    token: string,
    type?: string,
  ): Promise<Array<Record<string, unknown>>> {
    try {
      console.log(
        `🦷 Fetching manage service records${type ? ` (${type})` : ''}`,
      );

      const response = await apiClient.get('/manage-service', {
        params: type ? { type } : undefined,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json, text/plain, */*',
        },
      });

      const list =
        response.data?.data ??
        response.data?.services ??
        response.data?.result ??
        response.data ??
        [];
      const raw = Array.isArray(list) ? list : [];
      console.log(`✅ Manage service records fetched: ${raw.length}`);
      return raw as Array<Record<string, unknown>>;
    } catch (error) {
      console.error('❌ Failed to fetch manage service records:', error);
      throw error;
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
