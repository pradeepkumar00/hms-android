import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { AppDataState, RootState } from '../types';
import { realAuthService } from '../services/realAuthService';
import { logoutUser } from './authSlice';

const initialState: AppDataState = {
  config: null,
  manageServices: [],
  isLoading: false,
  isLoaded: false,
  error: null,
  loadedAt: null,
};

export const loadAppData = createAsyncThunk(
  'appData/loadAppData',
  async (_, { getState, rejectWithValue }) => {
    const token = (getState() as RootState).auth.token;
    if (!token) {
      return rejectWithValue('Not authenticated');
    }

    const [config, manageServices] = await Promise.all([
      realAuthService.fetchAppConfig(token),
      realAuthService.fetchManageServiceRecords(token),
    ]);

    return {
      config: config as Record<string, unknown>,
      manageServices,
      loadedAt: new Date().toISOString(),
    };
  },
);

const appDataSlice = createSlice({
  name: 'appData',
  initialState,
  reducers: {
    clearAppData: () => initialState,
  },
  extraReducers: builder => {
    builder
      .addCase(loadAppData.pending, state => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loadAppData.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isLoaded = true;
        state.config = action.payload.config;
        state.manageServices = action.payload.manageServices;
        state.loadedAt = action.payload.loadedAt;
        state.error = null;
      })
      .addCase(loadAppData.rejected, (state, action) => {
        state.isLoading = false;
        state.error =
          (action.payload as string) ||
          action.error.message ||
          'Failed to load app data';
      })
      .addCase(logoutUser.fulfilled, () => initialState)
      .addCase(logoutUser.rejected, () => initialState);
  },
});

export const { clearAppData } = appDataSlice.actions;
export default appDataSlice.reducer;
