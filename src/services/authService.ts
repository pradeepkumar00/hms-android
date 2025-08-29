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
    type: 'admin',
    role: 'Editor',
    createdAt: '2024-01-15T10:00:00Z',
  },
  {
    id: '2',
    name: 'Elizabeth Catherine Thompson',
    email: 'elizabeth.thompson@company.com',
    mobileNumber: '+919876543211',
    type: 'doctor',
    role: 'Viewer',
    createdAt: '2024-01-16T10:00:00Z',
  },
  {
    id: '3',
    name: 'Christopher David Anderson',
    email: 'christopher.anderson@company.com',
    mobileNumber: '+919876543212',
    type: 'tvscreen',
    role: 'Viewer',
    createdAt: '2024-01-17T10:00:00Z',
  },
];

// Mock credentials for testing
const MOCK_CREDENTIALS = [
  { email: 'johnathan.richardson@company.com', password: 'password123' },
  { email: 'elizabeth.thompson@company.com', password: 'password123' },
  { email: 'christopher.anderson@company.com', password: 'password123' },
];

class AuthService {
  private baseURL = ''; // Will be set when backend is provided

  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    // Add artificial delay to simulate API call
    await sleep(1000);

    // Validate input
    const passwordError = validatePassword(credentials.password);
    if (passwordError) {
      throw new Error(passwordError.message);
    }

    // Mock authentication logic
    const mockCredential = MOCK_CREDENTIALS.find(
      cred => cred.email === credentials.email,
    );

    if (!mockCredential || mockCredential.password !== credentials.password) {
      throw new Error('Invalid email or password');
    }

    // Find user data
    const user = MOCK_USERS.find(u => u.email === credentials.email);

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
      email: cred.email,
      // Don't return actual password for security
      hasPassword: !!cred.password,
    }));
  }

  // Method to get users by department (type)
  async getUsersByDepartment(department: string): Promise<User[]> {
    // Add artificial delay to simulate API call
    await sleep(300);

    // In real implementation: const response = await api.get(`/users/department/${department}`);
    // For now, return mock data filtered by type
    const departmentUsers = MOCK_USERS.filter(user => user.type === department);

    return departmentUsers;
  }

  // Method to get all users with departments from real API
  async getAllUsersWithDepartments(
    token: string,
  ): Promise<{ departments: string[]; users: User[] }> {
    try {
      // Make real API call to /api/users with authorization
      const response = await fetch('https://app.octusai.com/api/users', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('API Response:', data);

      let users: User[] = [];
      let departments: string[] = [];

      // Parse the API response
      if (data.users && Array.isArray(data.users)) {
        // Map API users to our User interface
        users = data.users.map((apiUser: any) => ({
          id: apiUser._id,
          _id: apiUser._id,
          name: apiUser.name,
          email: apiUser.email,
          mobileNumber: apiUser.mobileNo || apiUser.mobileNumber,
          mobileNo: apiUser.mobileNo,
          type: apiUser.type,
          role: apiUser.role,
          createdAt: apiUser.createdAt,
          tenantId: apiUser.tenantId,
          status: apiUser.status,
        }));

        // Extract unique departments (types) from users
        departments = [
          ...new Set(users.map(user => user.type).filter(Boolean)),
        ];
      }

      // If no departments found, fall back to default departments
      if (departments.length === 0) {
        departments = ['admin', 'doctor', 'tvscreen'];
      }

      return { departments, users };
    } catch (error) {
      console.error('Failed to fetch users from API:', error);

      // Fallback to mock data if API fails
      const departments = ['admin', 'doctor', 'tvscreen'];
      const users = MOCK_USERS;

      return { departments, users };
    }
  }

  // Method to create a task using real API
  async createTask(taskData: any, token: string): Promise<any> {
    try {
      const response = await fetch('https://app.octusai.com/api/task', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(taskData),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Task creation response:', data);

      return data;
    } catch (error) {
      console.error('Failed to create task via API:', error);
      throw error;
    }
  }

  async assignedTasks(token: string): Promise<any> {
    try {
      const response = await fetch(
        `https://app.octusai.com/api/tasks/created?status=new`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Failed to fetch assigned tasks via API:', error);
      throw error;
    }
  }
}

export const authService = new AuthService();
export default authService;
