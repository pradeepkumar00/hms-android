import { configureStore, createSelector } from '@reduxjs/toolkit';
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';
import authReducer from './authSlice';
import taskReducer from './taskSlice';
import settingsReducer from './settingsSlice';
import { RootState } from '../types';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    tasks: taskReducer,
    settings: settingsReducer,
  },
  middleware: getDefaultMiddleware =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
      },
    }),
  devTools: __DEV__, // Enable Redux DevTools in development
});

export type AppDispatch = typeof store.dispatch;
export type AppRootState = ReturnType<typeof store.getState>;

// Typed hooks
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<AppRootState> = useSelector;

// Auth Selectors
export const selectAuth = (state: AppRootState) => state.auth;
export const selectCurrentUser = (state: AppRootState) => state.auth.user;
export const selectAuthToken = (state: AppRootState) => state.auth.token;
export const selectIsAuthenticated = (state: AppRootState) =>
  state.auth.isAuthenticated;
export const selectAuthLoading = (state: AppRootState) => state.auth.isLoading;
export const selectAuthError = (state: AppRootState) => state.auth.error;

// Task Selectors
export const selectTasks = (state: AppRootState) => state.tasks;
export const selectInboxNotifications = (state: AppRootState) =>
  state.tasks.inbox;
export const selectAssignedToMeTasks = (state: AppRootState) =>
  state.tasks.assignedToMe;
export const selectAssignedByMeTasks = (state: AppRootState) =>
  state.tasks.assignedByMe;
export const selectCreatedByMeTasks = (state: AppRootState) =>
  state.tasks.createdTasks;
export const selectCurrentTask = (state: AppRootState) =>
  state.tasks.currentTask;
export const selectTasksLoading = (state: AppRootState) =>
  state.tasks.isLoading;
export const selectTasksError = (state: AppRootState) => state.tasks.error;

// Legacy selectors for backward compatibility
export const selectAssignedTasks = (state: AppRootState) =>
  state.tasks.assignedToMe;
export const selectCreatedTasks = (state: AppRootState) =>
  state.tasks.createdTasks;

// Computed selectors with memoization
export const selectUnreadNotifications = createSelector(
  [selectInboxNotifications],
  inbox => inbox.filter(notification => !notification.readStatus),
);

export const selectNotificationCount = createSelector(
  [selectUnreadNotifications],
  unreadNotifications => unreadNotifications.length,
);

// Settings selectors
export const selectSettings = (state: AppRootState) => state.settings;
export const selectNotificationSoundId = (state: AppRootState) =>
  state.settings.notificationSoundId;

export default store;
