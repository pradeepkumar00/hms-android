import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../constants/app';
import { SettingsState } from '../types';

const initialState: SettingsState = {
  notificationSoundId: null,
  vibrationEnabled: true, // Default to enabled
};

export const loadSettings = createAsyncThunk('settings/load', async () => {
  const soundId = await AsyncStorage.getItem(STORAGE_KEYS.NOTIFICATION_SOUND);
  const vibrationSetting = await AsyncStorage.getItem(
    STORAGE_KEYS.VIBRATION_ENABLED,
  );

  return {
    notificationSoundId: soundId,
    vibrationEnabled: vibrationSetting ? JSON.parse(vibrationSetting) : true,
  } as SettingsState;
});

export const setNotificationSound = createAsyncThunk(
  'settings/setNotificationSound',
  async (soundId: string | null) => {
    if (soundId) {
      await AsyncStorage.setItem(STORAGE_KEYS.NOTIFICATION_SOUND, soundId);
    } else {
      await AsyncStorage.removeItem(STORAGE_KEYS.NOTIFICATION_SOUND);
    }
    return soundId;
  },
);

export const setVibrationEnabled = createAsyncThunk(
  'settings/setVibrationEnabled',
  async (enabled: boolean) => {
    await AsyncStorage.setItem(
      STORAGE_KEYS.VIBRATION_ENABLED,
      JSON.stringify(enabled),
    );
    return enabled;
  },
);

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {},
  extraReducers: builder => {
    builder
      .addCase(
        loadSettings.fulfilled,
        (state, action: PayloadAction<SettingsState>) => {
          state.notificationSoundId = action.payload.notificationSoundId;
          state.vibrationEnabled = action.payload.vibrationEnabled;
        },
      )
      .addCase(
        setNotificationSound.fulfilled,
        (state, action: PayloadAction<string | null>) => {
          state.notificationSoundId = action.payload;
        },
      )
      .addCase(
        setVibrationEnabled.fulfilled,
        (state, action: PayloadAction<boolean>) => {
          state.vibrationEnabled = action.payload;
        },
      );
  },
});

export default settingsSlice.reducer;
export { setVibrationEnabled };
