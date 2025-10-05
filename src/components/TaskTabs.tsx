import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { theme } from '../constants/theme';

export type TabType = 'details' | 'history' | 'parent' | 'children';

interface Tab {
  id: TabType;
  label: string;
  visible: boolean;
  badge?: number; // Optional badge count
}

interface TaskTabsProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  hasParent?: boolean;
  childrenCount?: number;
}

const TaskTabs: React.FC<TaskTabsProps> = ({
  activeTab,
  onTabChange,
  hasParent = false,
  childrenCount = 0,
}) => {
  const tabs: Tab[] = [
    {
      id: 'details',
      label: 'Details',
      visible: true,
    },
    {
      id: 'history',
      label: 'History',
      visible: true,
    },
    {
      id: 'parent',
      label: 'Parent Task',
      visible: true, // Always show Parent Task tab
    },
    {
      id: 'children',
      label: 'Child Task',
      visible: true,
      badge: childrenCount > 0 ? childrenCount : undefined,
    },
  ];

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {tabs
          .filter(tab => tab.visible)
          .map((tab, index) => (
            <TouchableOpacity
              key={tab.id}
              style={[
                styles.tab,
                activeTab === tab.id && styles.activeTab,
                index === 0 && styles.firstTab,
              ]}
              onPress={() => onTabChange(tab.id)}
              activeOpacity={0.7}
            >
              <View style={styles.tabContent}>
                <Text
                  style={[
                    styles.tabText,
                    activeTab === tab.id && styles.activeTabText,
                  ]}
                >
                  {tab.label}
                </Text>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{tab.badge}</Text>
                  </View>
                )}
              </View>
              {activeTab === tab.id && <View style={styles.activeIndicator} />}
            </TouchableOpacity>
          ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  scrollView: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.sm,
  },
  tab: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    marginRight: theme.spacing.xs,
    position: 'relative',
  },
  firstTab: {
    marginLeft: theme.spacing.xs,
  },
  activeTab: {
    // Active tab styling handled by indicator
  },
  tabContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tabText: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.medium,
    color: theme.colors.textSecondary,
  },
  activeTabText: {
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  activeIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: theme.colors.primary,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  badge: {
    marginLeft: theme.spacing.xs,
    backgroundColor: theme.colors.primary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xs,
  },
  badgeText: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.surface,
  },
});

export default TaskTabs;
