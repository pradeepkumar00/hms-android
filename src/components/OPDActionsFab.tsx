import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { theme } from '../constants/theme';
import ModalBackdrop from './ModalBackdrop';

interface OPDActionsFabProps {
  onUploadPrescriptionPress: () => void;
  onUploadProcedurePress: () => void;
  onTreatmentPlanPress: () => void;
  onFollowupPress: () => void;
}

interface DrawerAction {
  key: string;
  title: string;
  subtitle: string;
  icon: string;
  iconColor: string;
  iconBg: string;
  onPress: () => void;
  accent?: boolean;
}

const OPDActionsFab: React.FC<OPDActionsFabProps> = ({
  onUploadPrescriptionPress,
  onUploadProcedurePress,
  onTreatmentPlanPress,
  onFollowupPress,
}) => {
  const insets = useSafeAreaInsets();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const closeDrawer = () => setDrawerOpen(false);

  const runAction = (action: () => void) => {
    closeDrawer();
    action();
  };

  const actions: DrawerAction[] = [
    {
      key: 'prescription',
      title: 'Upload Prescription',
      subtitle: 'PDF or image file',
      icon: 'description',
      iconColor: '#1565C0',
      iconBg: '#E3F2FD',
      onPress: () => runAction(onUploadPrescriptionPress),
    },
    {
      key: 'procedure',
      title: 'Upload Procedure',
      subtitle: 'Attach procedure document',
      icon: 'add-circle-outline',
      iconColor: '#2E7D32',
      iconBg: '#E8F5E9',
      onPress: () => runAction(onUploadProcedurePress),
    },
    {
      key: 'treatment',
      title: 'Treatment Plan',
      subtitle: 'Teeth, billing & plan',
      icon: 'credit-card',
      iconColor: '#E65100',
      iconBg: '#FFF3E0',
      onPress: () => runAction(onTreatmentPlanPress),
    },
    {
      key: 'followup',
      title: 'Add Follow-up',
      subtitle: 'Book next visit token',
      icon: 'event',
      iconColor: '#7B1FA2',
      iconBg: '#F3E5F5',
      onPress: () => runAction(onFollowupPress),
      accent: true,
    },
  ];

  return (
    <>
      {!drawerOpen && (
        <TouchableOpacity
          style={[styles.fab, { bottom: insets.bottom + theme.spacing.md }]}
          activeOpacity={0.85}
          onPress={() => setDrawerOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Quick actions"
        >
          <Icon name="add" size={28} color={theme.colors.surface} />
        </TouchableOpacity>
      )}

      <ModalBackdrop
        visible={drawerOpen}
        onClose={closeDrawer}
        animationType="slide"
      >
        <View
          style={[
            styles.drawerSheet,
            { paddingBottom: Math.max(insets.bottom, theme.spacing.md) },
          ]}
        >
          <View style={styles.drawerHandle} />

          <Text style={styles.drawerTitle}>Quick actions</Text>
          <Text style={styles.drawerSubtitle}>Add records for this patient</Text>

          {actions.map(action => (
            <TouchableOpacity
              key={action.key}
              style={[
                styles.drawerOption,
                action.accent && styles.drawerOptionAccent,
              ]}
              activeOpacity={0.85}
              onPress={action.onPress}
            >
              <View
                style={[
                  styles.drawerOptionIcon,
                  { backgroundColor: action.iconBg },
                ]}
              >
                <Icon name={action.icon} size={22} color={action.iconColor} />
              </View>
              <View style={styles.drawerOptionTextWrap}>
                <Text
                  style={[
                    styles.drawerOptionTitle,
                    action.accent && styles.drawerOptionTitleAccent,
                  ]}
                >
                  {action.title}
                </Text>
                <Text
                  style={[
                    styles.drawerOptionSubtitle,
                    action.accent && styles.drawerOptionSubtitleAccent,
                  ]}
                >
                  {action.subtitle}
                </Text>
              </View>
              <Icon
                name="chevron-right"
                size={22}
                color={action.accent ? '#7B1FA2' : theme.colors.textSecondary}
              />
            </TouchableOpacity>
          ))}

          <TouchableOpacity
            style={styles.cancelBtn}
            activeOpacity={0.7}
            onPress={closeDrawer}
          >
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </ModalBackdrop>
    </>
  );
};

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: theme.spacing.md,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.md,
    zIndex: 10,
  },
  drawerSheet: {
    zIndex: 1,
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
  },
  drawerHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    marginBottom: theme.spacing.md,
  },
  drawerTitle: {
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: theme.typography.fontWeights.bold,
    color: '#1A237E',
    textAlign: 'center',
  },
  drawerSubtitle: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.lg,
  },
  drawerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
  },
  drawerOptionAccent: {
    borderColor: '#CE93D8',
    backgroundColor: '#F3E5F5',
  },
  drawerOptionIcon: {
    width: 44,
    height: 44,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.md,
  },
  drawerOptionTextWrap: {
    flex: 1,
  },
  drawerOptionTitle: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.text,
  },
  drawerOptionTitleAccent: {
    color: '#7B1FA2',
  },
  drawerOptionSubtitle: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  drawerOptionSubtitleAccent: {
    color: '#7B1FA2',
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    marginTop: theme.spacing.xs,
  },
  cancelBtnText: {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: '#546E7A',
  },
});

export default OPDActionsFab;
