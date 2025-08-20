import { LoginCredentials, LoginResponse, User, ApiResponse } from '../types';
import { sleep } from '../utils/helpers';
import { validateMobileNumber, validatePassword } from '../utils/validation';

// Mock users for testing (will be replaced with real API calls)
const MOCK_USERS: User[] = [
  {
    id: '1',
    name: 'Johnathan Michael Richardson',
    email: 'johnathan.richardson@company.com',
    mobileNumber: '+919876543210',
    department: 'HR',
    role: 'Senior Human Resources Manager',
    createdAt: '2024-01-15T10:00:00Z',
  },
  {
    id: '2',
    name: 'Elizabeth Catherine Thompson',
    email: 'elizabeth.thompson@company.com',
    mobileNumber: '+919876543211',
    department: 'Admin',
    role: 'Chief Administrative Officer',
    createdAt: '2024-01-16T10:00:00Z',
  },
  {
    id: '3',
    name: 'Christopher David Anderson',
    email: 'christopher.anderson@company.com',
    mobileNumber: '+919876543212',
    department: 'Supervisor',
    role: 'Senior Team Lead & Operations Manager',
    createdAt: '2024-01-17T10:00:00Z',
  },
];

// Mock credentials for testing
const MOCK_CREDENTIALS = [
  { mobileNumber: '+919876543210', password: 'password123' },
  { mobileNumber: '+919876543211', password: 'password123' },
  { mobileNumber: '+919876543212', password: 'password123' },
];

class AuthService {
  private baseURL = ''; // Will be set when backend is provided

  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    // Add artificial delay to simulate API call
    await sleep(1000);

    // Validate input
    const mobileError = validateMobileNumber(credentials.mobileNumber);
    if (mobileError) {
      throw new Error(mobileError.message);
    }

    const passwordError = validatePassword(credentials.password);
    if (passwordError) {
      throw new Error(passwordError.message);
    }

    // Mock authentication logic
    const mockCredential = MOCK_CREDENTIALS.find(
      cred => cred.mobileNumber === credentials.mobileNumber,
    );

    if (!mockCredential || mockCredential.password !== credentials.password) {
      throw new Error('Invalid mobile number or password');
    }

    // Find user data
    const user = MOCK_USERS.find(
      u => u.mobileNumber === credentials.mobileNumber,
    );

    if (!user) {
      throw new Error('User not found');
    }

    // Generate mock token
    const token = `mock_token_${user.id}_${Date.now()}`;

    return {
      user,
      token,
    };
  }

  async logout(): Promise<void> {
    // Add artificial delay to simulate API call
    await sleep(500);

    // In real implementation, this would invalidate the token on backend
    console.log('User logged out successfully');
  }

  async getCurrentUser(token: string): Promise<User> {
    // Add artificial delay to simulate API call
    await sleep(500);

    // Extract user ID from mock token
    const tokenParts = token.split('_');
    if (tokenParts.length < 3) {
      throw new Error('Invalid token');
    }

    const userId = tokenParts[2];
    const user = MOCK_USERS.find(u => u.id === userId);

    if (!user) {
      throw new Error('User not found');
    }

    return user;
  }

  async refreshToken(currentToken: string): Promise<string> {
    // Add artificial delay to simulate API call
    await sleep(500);

    // In real implementation, this would refresh the token on backend
    // For now, just return a new mock token
    const tokenParts = currentToken.split('_');
    if (tokenParts.length < 3) {
      throw new Error('Invalid token');
    }

    const userId = tokenParts[2];
    return `mock_token_${userId}_${Date.now()}`;
  }

  // Method to check if token is expired (mock implementation)
  isTokenExpired(token: string): boolean {
    try {
      const tokenParts = token.split('_');
      if (tokenParts.length < 4) return true;

      const timestamp = parseInt(tokenParts[3]);
      const expiryTime = timestamp + 24 * 60 * 60 * 1000; // 24 hours

      return Date.now() > expiryTime;
    } catch {
      return true;
    }
  }

  // Method to get user by mobile number (for testing)
  getMockUserByMobile(mobileNumber: string): User | undefined {
    return MOCK_USERS.find(user => user.mobileNumber === mobileNumber);
  }

  // Method to get all mock credentials (for testing)
  getMockCredentials() {
    return MOCK_CREDENTIALS.map(cred => ({
      mobileNumber: cred.mobileNumber,
      // Don't return actual password for security
      hasPassword: !!cred.password,
    }));
  }

  // Method to get users by department
  async getUsersByDepartment(
    department: 'HR' | 'Admin' | 'Supervisor',
  ): Promise<User[]> {
    // Add artificial delay to simulate API call
    await sleep(300);

    // In real implementation: const response = await api.get(`/users/department/${department}`);
    // For now, return mock data filtered by department
    const departmentUsers = MOCK_USERS.filter(
      user => user.department === department,
    );

    return departmentUsers;
  }
}

export const authService = new AuthService();
export default authService;
