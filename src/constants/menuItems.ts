import { RootStackParamList } from '../types';

export interface MenuItem {
  key: string;
  label: string;
  icon: string; // MaterialIcons name
  screen: keyof RootStackParamList;
  showBadge?: boolean;
}

// Home screen tiles (main shortcuts only).
export const HOME_MENU_ITEMS: MenuItem[] = [
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
    key: 'patients',
    label: 'OPD Patients',
    icon: 'people',
    screen: 'PatientList',
  },
  {
    key: 'addPatient',
    label: 'Add Patient',
    icon: 'person-add',
    screen: 'AddPatient',
  },
  {
    key: 'reports',
    label: 'Reports',
    icon: 'folder-shared',
    screen: 'Reports',
  },
];

// Extra items shown only in the side menu drawer.
export const DRAWER_ONLY_MENU_ITEMS: MenuItem[] = [
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

// Full drawer menu: home tiles + drawer-only items.
export const DRAWER_MENU_ITEMS: MenuItem[] = [
  ...HOME_MENU_ITEMS,
  ...DRAWER_ONLY_MENU_ITEMS,
];

/** @deprecated Use HOME_MENU_ITEMS or DRAWER_MENU_ITEMS */
export const MENU_ITEMS = HOME_MENU_ITEMS;
