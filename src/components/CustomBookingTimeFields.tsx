import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import DatePicker from 'react-native-date-picker';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { theme } from '../constants/theme';
import {
  CUSTOM_BOOKING_DURATION_OPTIONS,
  getCustomBookingDurationLabel,
} from '../constants/customBookingDurationOptions';
import {
  formatTimeForApi,
  formatTimeForDisplay,
  parseTimeStringToDate,
} from '../utils/customBookingTime.util';

interface CustomBookingTimeFieldsProps {
  startTime: string;
  durationMinutes: string;
  onStartTimeChange: (time: string) => void;
  onDurationChange: (minutes: string) => void;
  errors?: {
    startTime?: string;
    duration?: string;
  };
}

const CustomBookingTimeFields: React.FC<CustomBookingTimeFieldsProps> = ({
  startTime,
  durationMinutes,
  onStartTimeChange,
  onDurationChange,
  errors,
}) => {
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [durationOpen, setDurationOpen] = useState(false);

  const timePickerDate = useMemo(
    () => parseTimeStringToDate(startTime),
    [startTime],
  );

  const durationLabel = getCustomBookingDurationLabel(durationMinutes);

  return (
    <View style={styles.wrap}>
      <View style={styles.fieldBlock}>
        <Text style={styles.fieldLabel}>Start time *</Text>
        <TouchableOpacity
          style={[styles.input, styles.selectInput, errors?.startTime && styles.inputError]}
          activeOpacity={0.7}
          onPress={() => setTimePickerOpen(true)}
        >
          <Text style={styles.selectText}>{formatTimeForDisplay(startTime)}</Text>
          <Icon name="schedule" size={20} color={theme.colors.textSecondary} />
        </TouchableOpacity>
        {errors?.startTime ? (
          <Text style={styles.errorText}>{errors.startTime}</Text>
        ) : null}
      </View>

      <View style={styles.durationSection}>
        <Text style={styles.durationSectionTitle}>Set Duration</Text>
        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>Duration *</Text>
          <TouchableOpacity
            style={[
              styles.input,
              styles.selectInput,
              errors?.duration && styles.inputError,
            ]}
            activeOpacity={0.7}
            onPress={() => setDurationOpen(open => !open)}
          >
            <Text style={styles.selectText}>{durationLabel}</Text>
            <Icon
              name={durationOpen ? 'expand-less' : 'expand-more'}
              size={22}
              color={theme.colors.textSecondary}
            />
          </TouchableOpacity>
          {durationOpen ? (
            <View style={styles.dropdownList}>
              <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {CUSTOM_BOOKING_DURATION_OPTIONS.map(option => {
                const active = String(option.value) === String(durationMinutes);
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={styles.dropdownItem}
                    activeOpacity={0.7}
                    onPress={() => {
                      onDurationChange(String(option.value));
                      setDurationOpen(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.dropdownItemText,
                        active && styles.dropdownItemTextActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                    {active ? (
                      <Icon name="check" size={18} color={theme.colors.primary} />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
              </ScrollView>
            </View>
          ) : null}
          {errors?.duration ? (
            <Text style={styles.errorText}>{errors.duration}</Text>
          ) : null}
        </View>
      </View>

      <DatePicker
        modal
        open={timePickerOpen}
        date={timePickerDate}
        mode="time"
        title="Select time"
        confirmText="Save"
        cancelText="Cancel"
        onConfirm={date => {
            const formatted = formatTimeForApi(date);
            console.log('CustomBookingTimeFields: selected time ->', formatted);
            onStartTimeChange(formatted);
            setTimePickerOpen(false);
        }}
        onCancel={() => setTimePickerOpen(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    marginBottom: theme.spacing.xs,
  },
  fieldBlock: {
    marginBottom: theme.spacing.md,
  },
  fieldLabel: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.medium,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    minHeight: 44,
    justifyContent: 'center',
  },
  selectInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectText: {
    flex: 1,
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
    marginRight: theme.spacing.sm,
  },
  inputError: {
    borderColor: theme.colors.error,
  },
  errorText: {
    marginTop: theme.spacing.xs,
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.error,
  },
  durationSection: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  durationSectionTitle: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.sm,
  },
  dropdownList: {
    marginTop: theme.spacing.xs,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
    overflow: 'hidden',
    maxHeight: 220,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  dropdownItemText: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
    flex: 1,
  },
  dropdownItemTextActive: {
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
});

export default CustomBookingTimeFields;
