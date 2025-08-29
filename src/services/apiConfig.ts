import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../constants/app';
import { ApiResponse } from '../types';
import environmentService from './environmentService';

/**
 * API Configuration and Axios Instance Setup
 * Following React Native API integration best practices
 */

// Environment-based API Configuration
const createApiConfig = () => ({
  baseURL: environmentService.getApiBaseUrl(),
  timeout: environmentService.getApiTimeout(),
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'User-Agent': `${
      environmentService.getAppInfo().name
    }/1.0.0 (React Native)`,
  },
});

// Environment-based Auth API Configuration
const createAuthApiConfig = () => ({
  baseURL: environmentService.getAuthApiBaseUrl(),
  timeout: environmentService.getApiTimeout(),
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'User-Agent': `${
      environmentService.getAppInfo().name
    }/1.0.0 (React Native)`,
  },
});

const API_CONFIG = createApiConfig();
const AUTH_API_CONFIG = createAuthApiConfig();
console.log('====================================');
console.log(API_CONFIG);
console.log(AUTH_API_CONFIG);
console.log('====================================');

/**
 * Main API Instance for general API calls
 */
export const apiClient: AxiosInstance = axios.create(API_CONFIG);

/**
 * Auth API Instance for authorization calls
 */
export const authApiClient: AxiosInstance = axios.create(AUTH_API_CONFIG);

/**
 * Request Interceptor - Add Authorization header
 */
const addAuthHeader = async (
  config: AxiosRequestConfig,
): Promise<AxiosRequestConfig> => {
  try {
    const token = await AsyncStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  } catch (error) {
    console.warn('Failed to add auth header:', error);
    return config;
  }
};

// Apply auth interceptor to both instances
apiClient.interceptors.request.use(addAuthHeader);
authApiClient.interceptors.request.use(addAuthHeader);

/**
 * Response Interceptor - Handle 401 errors with automatic logout
 */
let isLogoutInProgress = false; // Prevent multiple simultaneous logout calls

const handle401Response = async (error: any) => {
  if (error.response?.status === 401 && !isLogoutInProgress) {
    isLogoutInProgress = true;

    try {
      // Clear stored authentication data
      await AsyncStorage.multiRemove([
        STORAGE_KEYS.AUTH_TOKEN,
        STORAGE_KEYS.USER_DATA,
      ]);

      console.log('401 Unauthorized - User logged out automatically');

      // Note: Navigation to login screen will be handled by the auth state listener
      // in the main navigation component
    } catch (storageError) {
      console.error(
        'Failed to clear auth data during 401 logout:',
        storageError,
      );
    } finally {
      isLogoutInProgress = false;
    }
  }

  return Promise.reject(error);
};

// Apply 401 interceptor to both instances
apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  handle401Response,
);

authApiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  handle401Response,
);

/**
 * Network Error Handler
 */
export const handleNetworkError = (error: any): string => {
  if (error.response) {
    // Server responded with error status
    const status = error.response.status;
    const message =
      error.response.data?.message ||
      error.response.data?.error ||
      'Request failed';

    switch (status) {
      case 400:
        return `Bad Request: ${message}`;
      case 401:
        return 'Unauthorized access. Please login again.';
      case 403:
        return 'Access forbidden. You do not have permission.';
      case 404:
        return 'Resource not found.';
      case 500:
        return 'Server error. Please try again later.';
      default:
        return `Request failed (${status}): ${message}`;
    }
  } else if (error.request) {
    // Request was made but no response received
    return 'Network error. Please check your internet connection.';
  } else {
    // Error in request setup
    return error.message || 'An unexpected error occurred.';
  }
};

/**
 * Generic API wrapper for type-safe responses
 */
export const makeApiCall = async <T = any>(
  apiCall: () => Promise<AxiosResponse<any>>,
): Promise<ApiResponse<T>> => {
  try {
    const response = await apiCall();

    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    const errorMessage = handleNetworkError(error);

    return {
      success: false,
      error: errorMessage,
    };
  }
};

/**
 * Debug logging based on environment configuration
 */
if (environmentService.isDebugLoggingEnabled()) {
  // Request logging
  apiClient.interceptors.request.use(
    config => {
      console.log(
        `🚀 API Request: ${config.method?.toUpperCase()} ${config.url}`,
      );
      if (config.data) {
        console.log('📤 Request Data:', config.data);
      }
      return config;
    },
    error => {
      console.log('❌ Request Error:', error);
      return Promise.reject(error);
    },
  );

  authApiClient.interceptors.request.use(
    config => {
      console.log(
        `🔐 Auth API Request: ${config.method?.toUpperCase()} ${config.url}`,
      );
      if (config.data) {
        console.log('📤 Auth Request Data:', config.data);
      }
      return config;
    },
    error => {
      console.log('❌ Auth Request Error:', error);
      return Promise.reject(error);
    },
  );

  // Response logging
  apiClient.interceptors.response.use(
    response => {
      console.log(`✅ API Response: ${response.status} ${response.config.url}`);
      console.log('📥 Response Data:', response.data);
      return response;
    },
    error => {
      console.log(
        '❌ API Response Error:',
        error.response?.status,
        error.response?.data,
      );
      return Promise.reject(error);
    },
  );

  authApiClient.interceptors.response.use(
    response => {
      console.log(
        `✅ Auth API Response: ${response.status} ${response.config.url}`,
      );
      console.log('📥 Auth Response Data:', response.data);
      return response;
    },
    error => {
      console.log(
        '❌ Auth API Response Error:',
        error.response?.status,
        error.response?.data,
      );
      return Promise.reject(error);
    },
  );
}

export default { apiClient, authApiClient, makeApiCall, handleNetworkError };
