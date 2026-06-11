import { RootStackParamList } from '../types';

export interface MenuItem {
  key: string;
  label: string;
  icon: string; // MaterialIcons name
  screen: keyof RootStackParamList;
  showBadge?: boolean;
}

// Shared menu definition used by both the side MenuDrawer and the HomeScreen tiles.
export const MENU_ITEMS: MenuItem[] = [
  {
    key: 'calendar',
    label: 'Calendar',
    icon: 'calendar-today',
    screen: 'Calendar',
  },
  {
    key: 'tasks',
    label: 'Tasks',
    icon: 'check-circle-outline',
    screen: 'AllTasks',
  },
  {
    key: 'inbox',
    label: 'Notifications',
    icon: 'notifications',
    screen: 'Inbox',
    showBadge: true,
  },
  {
    key: 'settings',
    label: 'Notification Settings',
    icon: 'settings',
    screen: 'NotificationSettings',
  },
];
