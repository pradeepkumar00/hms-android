import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { AuthState, LoginCredentials, LoginResponse, User } from '../types';
import { realAuthService } from '../services/realAuthService';
import { tokenService } from '../services/tokenService';

const initialState: AuthState = {
  user: null,
  token: null,
  isAuthenticated: false,
  tokenValidated: false,
  isLoading: false,
  error: null,
};

// Async thunks
export const loginUser = createAsyncThunk(
  'auth/loginUser',
  async (credentials: LoginCredentials, { rejectWithValue }) => {
    try {
      const response = await realAuthService.login(credentials);
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed';
      return rejectWithValue(message);
    }
  },
);

export const logoutUser = createAsyncThunk(
  'auth/logoutUser',
  async (_, { rejectWithValue }) => {
    try {
      await realAuthService.logout();
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Logout failed';
      return rejectWithValue(message);
    }
  },
);

export const checkAuthState = createAsyncThunk(
  'auth/checkAuthState',
  async (_, { rejectWithValue }) => {
    try {
      const response = await realAuthService.checkAuthState();
      return response;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Auth check failed';
      return rejectWithValue(message);
    }
  },
);

export const validateToken = createAsyncThunk(
  'auth/validateToken',
  async (_, { rejectWithValue }) => {
    try {
      const user = await realAuthService.validateToken();
      const token = await tokenService.getToken();

      if (!token) {
        throw new Error('No token available');
      }

      return { user, token };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Token validation failed';
      return rejectWithValue(message);
    }
  },
);

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearError: state => {
      state.error = null;
    },
    setUser: (state, action: PayloadAction<User>) => {
      state.user = action.payload;
    },
    updateUserProfile: (state, action: PayloadAction<Partial<User>>) => {
      if (state.user) {
        state.user = { ...state.user, ...action.payload };
      }
    },
  },
  extraReducers: builder => {
    // Login
    builder
      .addCase(loginUser.pending, state => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(
        loginUser.fulfilled,
        (state, action: PayloadAction<LoginResponse>) => {
          state.isLoading = false;
          state.isAuthenticated = true;
          state.tokenValidated = true;
          state.user = action.payload.user;
          state.token = action.payload.token;
          state.error = null;
        },
      )
      .addCase(loginUser.rejected, (state, action) => {
        state.isLoading = false;
        state.isAuthenticated = false;
        state.tokenValidated = false;
        state.user = null;
        state.token = null;
        state.error = action.payload as string;
      })

      // Logout
      .addCase(logoutUser.pending, state => {
        state.isLoading = true;
      })
      .addCase(logoutUser.fulfilled, state => {
        state.isLoading = false;
        state.isAuthenticated = false;
        state.tokenValidated = false;
        state.user = null;
        state.token = null;
        state.error = null;
      })
      .addCase(logoutUser.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
        // Still clear auth state even if logout API fails
        state.isAuthenticated = false;
        state.tokenValidated = false;
        state.user = null;
        state.token = null;
      })

      // Check auth state
      .addCase(checkAuthState.pending, state => {
        state.isLoading = true;
      })
      .addCase(checkAuthState.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isAuthenticated = true;
        state.tokenValidated = true;
        state.user = action.payload.user;
        state.token = action.payload.token;
        state.error = null;
      })
      .addCase(checkAuthState.rejected, state => {
        state.isLoading = false;
        state.isAuthenticated = false;
        state.tokenValidated = false;
        state.user = null;
        state.token = null;
        state.error = null; // Don't show error for failed auth check
      })

      // Validate token
      .addCase(validateToken.pending, state => {
        state.isLoading = true;
      })
      .addCase(validateToken.fulfilled, (state, action) => {
        state.isLoading = false;
        state.tokenValidated = true;
        state.user = action.payload.user;
        state.token = action.payload.token;
        state.error = null;
      })
      .addCase(validateToken.rejected, state => {
        state.isLoading = false;
        state.isAuthenticated = false;
        state.tokenValidated = false;
        state.user = null;
        state.token = null;
        state.error = null;
      });
  },
});

export const { clearError, setUser, updateUserProfile } = authSlice.actions;
export default authSlice.reducer;
