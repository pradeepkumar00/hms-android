import * as Keychain from 'react-native-keychain';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { decode as base64Decode } from 'base-64';
import { STORAGE_KEYS } from '../constants/app';

/**
 * Secure Token Management Service
 * Following React Native security best practices for JWT storage
 */

const KEYCHAIN_SERVICE = 'HospitalManagement';
const TOKEN_KEY = 'jwt_token';
const USER_DATA_KEY = 'user_data';

export interface StoredUserData {
  id: string;
  name: string;
  email: string;
  mobileNumber?: string; // Optional to match API response
  department: 'HR' | 'Admin' | 'Supervisor';
  role?: string; // Optional - role from API
  type: string; // Required for user type
  tenantId: string; // Required for topic subscriptions
  createdAt: string;
  // Additional production API fields
  departmentId?: string;
  doctorCode?: string | null;
  isTokenAssignable?: boolean;
  subCategory?: string;
  status?: string;
  currentToken?: string;
  child?: {
    totalChild: number;
  };
  route?: string[];
  consultFees?: number;
  bookingMode?: string;
  updatedAt?: string;
  __v?: number;
}

class TokenService {
  /**
   * Store JWT token securely using Keychain (iOS) / Keystore (Android)
   * Falls back to AsyncStorage if Keychain is not available
   */
  async storeToken(token: string): Promise<void> {
    try {
      // Primary: Use Keychain for secure storage
      await Keychain.setInternetCredentials(KEYCHAIN_SERVICE, TOKEN_KEY, token);

      console.log('✅ Token stored securely in Keychain/Keystore');
    } catch (error) {
      console.warn(
        '⚠️ Keychain unavailable, falling back to AsyncStorage:',
        error,
      );

      // Fallback: Use AsyncStorage (less secure but functional)
      await AsyncStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
    }
  }

  /**
   * Retrieve JWT token from secure storage
   */
  async getToken(): Promise<string | null> {
    try {
      // Primary: Try Keychain first
      const credentials = await Keychain.getInternetCredentials(
        KEYCHAIN_SERVICE,
      );

      if (credentials && credentials.password) {
        return credentials.password;
      }
    } catch (error) {
      console.warn('⚠️ Failed to retrieve token from Keychain:', error);
    }

    // Fallback: Try AsyncStorage
    try {
      const token = await AsyncStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
      return token;
    } catch (error) {
      console.error('❌ Failed to retrieve token from AsyncStorage:', error);
      return null;
    }
  }

  /**
   * Remove JWT token from all storage locations
   */
  async removeToken(): Promise<void> {
    // Clear from Keychain with proper error handling
    try {
      await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE });
      console.log('✅ Token removed from Keychain');
    } catch (error) {
      console.warn('⚠️ Failed to clear Keychain:', error);
    }

    // Clear from AsyncStorage
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
      console.log('✅ Token cleared from all storage locations');
    } catch (error) {
      console.error('❌ Failed to clear token from AsyncStorage:', error);
    }
  }

  /**
   * Store user data securely
   * User data is less sensitive than tokens, so AsyncStorage is acceptable
   */
  async storeUserData(userData: StoredUserData): Promise<void> {
    try {
      await AsyncStorage.setItem(
        STORAGE_KEYS.USER_DATA,
        JSON.stringify(userData),
      );
      console.log('✅ User data stored successfully');
    } catch (error) {
      console.error('❌ Failed to store user data:', error);
      throw new Error('Failed to store user data');
    }
  }

  /**
   * Retrieve user data from storage
   */
  async getUserData(): Promise<StoredUserData | null> {
    try {
      const userData = await AsyncStorage.getItem(STORAGE_KEYS.USER_DATA);

      if (!userData) {
        return null;
      }

      return JSON.parse(userData) as StoredUserData;
    } catch (error) {
      console.error('❌ Failed to retrieve user data:', error);
      return null;
    }
  }

  /**
   * Remove user data from storage
   */
  async removeUserData(): Promise<void> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.USER_DATA);
      console.log('✅ User data cleared successfully');
    } catch (error) {
      console.error('❌ Failed to clear user data:', error);
    }
  }

  /**
   * Clear all authentication data
   */
  async clearAll(): Promise<void> {
    await Promise.all([this.removeToken(), this.removeUserData()]);

    console.log('✅ All authentication data cleared');
  }

  /**
   * Check if token exists in storage
   */
  async hasToken(): Promise<boolean> {
    const token = await this.getToken();
    return !!token;
  }

  /**
   * Check if token is expired (basic validation)
   * Note: This is a client-side check, server validation is still required
   */
  isTokenExpired(token: string): boolean {
    try {
      // Simple JWT structure check
      const parts = token.split('.');
      if (parts.length !== 3) {
        return true;
      }

      // Decode payload (second part)
      const payload = JSON.parse(base64Decode(parts[1]));
      console.log('====================================');
      console.log(payload);
      console.log('====================================');

      if (!payload.exp) {
        // No expiration time in token, consider it valid
        return false;
      }

      // Check if token is expired (exp is in seconds, Date.now() is in milliseconds)
      const currentTime = Math.floor(Date.now() / 1000);
      const isExpired = payload.exp < currentTime;

      if (isExpired) {
        console.log('⚠️ Token has expired');
      }

      return isExpired;
    } catch (error) {
      console.error('❌ Error parsing token:', error);
      return true; // Consider invalid tokens as expired
    }
  }

  /**
   * Get token payload without verification (for debugging/info purposes)
   */
  getTokenPayload(token: string): any {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }

      return JSON.parse(base64Decode(parts[1]));
    } catch (error) {
      console.error('❌ Error parsing token payload:', error);
      return null;
    }
  }

  /**
   * Check token validity and return remaining time
   */
  getTokenInfo(token: string): {
    isValid: boolean;
    expiresIn?: number;
    payload?: any;
  } {
    try {
      const payload = this.getTokenPayload(token);

      if (!payload) {
        return { isValid: false };
      }

      const isExpired = this.isTokenExpired(token);

      if (isExpired) {
        return { isValid: false, payload };
      }

      let expiresIn: number | undefined;
      if (payload.exp) {
        const currentTime = Math.floor(Date.now() / 1000);
        expiresIn = payload.exp - currentTime;
      }

      return {
        isValid: true,
        expiresIn,
        payload,
      };
    } catch (error) {
      console.error('❌ Error getting token info:', error);
      return { isValid: false };
    }
  }
}

export const tokenService = new TokenService();
export default tokenService;
