import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {
  useAppSelector,
  selectNotificationCount,
  selectCurrentUser,
} from '../store';
import { navigationService } from '../services/navigationService';
import { theme } from '../constants/theme';
import { DRAWER_MENU_ITEMS } from '../constants/menuItems';
import { RootStackParamList } from '../types';

interface MenuDrawerProps {
  visible: boolean;
  onClose: () => void;
  onLogout: () => void;
}

const MenuDrawer: React.FC<MenuDrawerProps> = ({
  visible,
  onClose,
  onLogout,
}) => {
  const insets = useSafeAreaInsets();
  const unreadCount = useAppSelector(selectNotificationCount);
  const currentUser = useAppSelector(selectCurrentUser);

  const handleNavigate = (screen: keyof RootStackParamList) => {
    onClose();
    // Defer navigation slightly so the modal close animation can start first
    setTimeout(() => navigationService.navigate(screen), 50);
  };

  const handleLogout = () => {
    onClose();
    setTimeout(() => onLogout(), 50);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      presentationStyle="overFullScreen"
    >
      <View style={styles.root}>
        <Pressable
          style={[
            styles.overlay,
            {
              top: -insets.top,
              bottom: -insets.bottom,
            },
          ]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close menu"
        />

        <SafeAreaView edges={['top']} style={styles.panelContainer}>
        <View style={styles.panel}>
          {/* Header row */}
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>Menu</Text>
            <TouchableOpacity
              onPress={onClose}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Icon name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {DRAWER_MENU_ITEMS.map(item => (
              <TouchableOpacity
                key={item.key}
                style={styles.menuItem}
                activeOpacity={0.7}
                onPress={() => handleNavigate(item.screen)}
              >
                <View style={styles.menuIconWrapper}>
                  <Icon
                    name={item.icon}
                    size={24}
                    color={theme.colors.primary}
                  />
                  {item.showBadge && unreadCount > 0 && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText} numberOfLines={1}>
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.menuLabel}>{item.label}</Text>
                <Icon
                  name="chevron-right"
                  size={22}
                  color={theme.colors.textSecondary}
                />
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Logout */}
          <TouchableOpacity
            style={styles.logoutItem}
            activeOpacity={0.7}
            onPress={handleLogout}
          >
            <Icon name="logout" size={24} color={theme.colors.error} />
            <Text style={styles.logoutLabel}>Logout</Text>
            {!!currentUser?.name && (
              <Text style={styles.logoutUserName} numberOfLines={1}>
                {currentUser.name}
              </Text>
            )}
          </TouchableOpacity>
        </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  panelContainer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
  },
  panel: {
    flex: 1,
    width: 280,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
    ...theme.shadows.md,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  panelTitle: {
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  menuIconWrapper: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.md,
  },
  menuLabel: {
    flex: 1,
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.medium,
    color: theme.colors.text,
  },
  logoutItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  logoutLabel: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.error,
    marginLeft: theme.spacing.md,
  },
  logoutUserName: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.error,
    marginLeft: theme.spacing.sm,
  },
  badge: {
    position: 'absolute',
    right: -6,
    top: -4,
    backgroundColor: theme.colors.error,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: theme.colors.surface,
    fontSize: 10,
    fontWeight: theme.typography.fontWeights.bold,
  },
});

export default MenuDrawer;
