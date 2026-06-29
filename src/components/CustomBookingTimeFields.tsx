import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { theme } from '../constants/theme';
import {
  CUSTOM_BOOKING_DURATION_OPTIONS,
  getCustomBookingDurationLabel,
} from '../constants/customBookingDurationOptions';
import {
  formatTimeForDisplay,
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
  const [watchPickerOpen, setWatchPickerOpen] = useState(false);
  const [durationOpen, setDurationOpen] = useState(false);
  
  // Custom watch picker temporary states
  const [tempHour, setTempHour] = useState(9);
  const [tempMinute, setTempMinute] = useState(0);
  const [tempAmPm, setTempAmPm] = useState<'AM' | 'PM'>('AM');
  const [activeTab, setActiveTab] = useState<'hour' | 'minute'>('hour');

  const durationLabel = getCustomBookingDurationLabel(durationMinutes);

  const parseWatchTime = (timeStr: string) => {
    const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
    if (match) {
      const hr = parseInt(match[1], 10);
      const min = parseInt(match[2], 10);
      const ampm = (match[3]?.toUpperCase() || 'AM') as 'AM' | 'PM';
      return { hr, min, ampm };
    }
    return { hr: 9, min: 0, ampm: 'AM' as 'AM' | 'PM' };
  };

  const formatWatchTime = (hour: number, minute: number, ampm: string): string => {
    return `${hour}:${String(minute).padStart(2, '0')} ${ampm}`;
  };

  const handleOpenWatchPicker = () => {
    const { hr, min, ampm } = parseWatchTime(startTime);
    setTempHour(hr);
    setTempMinute(min);
    setTempAmPm(ampm);
    setActiveTab('hour');
    setWatchPickerOpen(true);
  };

  const handleSave = () => {
    const formatted = formatWatchTime(tempHour, tempMinute, tempAmPm);
    console.log('CustomBookingTimeFields: saved watch time ->', formatted);
    onStartTimeChange(formatted);
    setWatchPickerOpen(false);
  };

  const incrementValue = () => {
    if (activeTab === 'hour') {
      setTempHour(prev => (prev === 12 ? 1 : prev + 1));
    } else {
      setTempMinute(prev => (prev === 59 ? 0 : prev + 1));
    }
  };

  const decrementValue = () => {
    if (activeTab === 'hour') {
      setTempHour(prev => (prev === 1 ? 12 : prev - 1));
    } else {
      setTempMinute(prev => (prev === 0 ? 59 : prev - 1));
    }
  };

  // Clock Dial Geometry definitions
  const center = 115;
  const radius = 85;
  const btnRadius = 18;

  const needleAngle = useMemo(() => {
    if (activeTab === 'hour') {
      return tempHour * 30 - 90;
    } else {
      return tempMinute * 6 - 90;
    }
  }, [activeTab, tempHour, tempMinute]);

  return (
    <View style={styles.wrap}>
      <View style={styles.fieldBlock}>
        <Text style={styles.fieldLabel}>Start time *</Text>
        <TouchableOpacity
          style={[styles.input, styles.selectInput, errors?.startTime && styles.inputError]}
          activeOpacity={0.7}
          onPress={handleOpenWatchPicker}
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

      {/* Custom Watch/Clock Time Picker Modal */}
      <Modal
        visible={watchPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setWatchPickerOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Start Time</Text>
            
            {/* Elegant Digital Time Readout Panel */}
            <View style={styles.timeReadoutContainer}>
              <TouchableOpacity 
                activeOpacity={0.7}
                onPress={() => setActiveTab('hour')}
                style={[styles.timePartBtn, activeTab === 'hour' && styles.timePartBtnActive]}
              >
                <Text style={[styles.timeReadoutText, activeTab === 'hour' && styles.timeReadoutActive]}>
                  {String(tempHour).padStart(2, '0')}
                </Text>
              </TouchableOpacity>
              
              <Text style={styles.timeReadoutColon}>:</Text>
              
              <TouchableOpacity 
                activeOpacity={0.7}
                onPress={() => setActiveTab('minute')}
                style={[styles.timePartBtn, activeTab === 'minute' && styles.timePartBtnActive]}
              >
                <Text style={[styles.timeReadoutText, activeTab === 'minute' && styles.timeReadoutActive]}>
                  {String(tempMinute).padStart(2, '0')}
                </Text>
              </TouchableOpacity>

              <View style={styles.readoutAmPmContainer}>
                <TouchableOpacity
                  onPress={() => setTempAmPm('AM')}
                  style={[styles.readoutAmPmButton, tempAmPm === 'AM' && styles.readoutAmPmActive]}
                >
                  <Text style={[styles.readoutAmPmText, tempAmPm === 'AM' && styles.readoutAmPmTextActive]}>AM</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setTempAmPm('PM')}
                  style={[styles.readoutAmPmButton, tempAmPm === 'PM' && styles.readoutAmPmActive]}
                >
                  <Text style={[styles.readoutAmPmText, tempAmPm === 'PM' && styles.readoutAmPmTextActive]}>PM</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Circular Clock/Watch Face Dial */}
            <View style={styles.clockCircle}>
              {/* Clock Needle/Hand */}
              <View
                style={[
                  styles.clockNeedle,
                  {
                    transform: [{ rotate: `${needleAngle}deg` }],
                  },
                ]}
              >
                <View style={styles.clockNeedleTransparent} />
                <View style={styles.clockNeedleActive} />
              </View>

              {/* Clock Center Hub */}
              <View style={styles.clockHub} />

              {/* Render Numbers on Dial Perimeter */}
              {activeTab === 'hour'
                ? [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(h => {
                    const angleDegrees = h * 30 - 90;
                    const angleRadians = (angleDegrees * Math.PI) / 180;
                    const x = center + radius * Math.cos(angleRadians) - btnRadius;
                    const y = center + radius * Math.sin(angleRadians) - btnRadius;
                    const isSelected = tempHour === h;

                    return (
                      <TouchableOpacity
                        key={`hour-${h}`}
                        style={[
                          styles.dialItem,
                          { left: x, top: y },
                          isSelected && styles.dialItemActive,
                        ]}
                        activeOpacity={0.7}
                        onPress={() => {
                          setTempHour(h);
                          setTimeout(() => {
                            setActiveTab('minute');
                          }, 250);
                        }}
                      >
                        <Text style={[styles.dialItemText, isSelected && styles.dialItemTextActive]}>
                          {h}
                        </Text>
                      </TouchableOpacity>
                    );
                  })
                : [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => {
                    const angleDegrees = (m / 5) * 30 - 90;
                    const angleRadians = (angleDegrees * Math.PI) / 180;
                    const x = center + radius * Math.cos(angleRadians) - btnRadius;
                    const y = center + radius * Math.sin(angleRadians) - btnRadius;
                    
                    // Highlight the minute marker if it is selected
                    const isSelected = tempMinute === m;

                    return (
                      <TouchableOpacity
                        key={`minute-${m}`}
                        style={[
                          styles.dialItem,
                          { left: x, top: y },
                          isSelected && styles.dialItemActive,
                        ]}
                        activeOpacity={0.7}
                        onPress={() => {
                          setTempMinute(m);
                        }}
                      >
                        <Text style={[styles.dialItemText, isSelected && styles.dialItemTextActive]}>
                          {String(m).padStart(2, '0')}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
            </View>

            {/* Fine-Tuning controls below the clock */}
            <View style={styles.fineTuneRow}>
              <Text style={styles.fineTuneLabel}>
                Fine-tune {activeTab === 'hour' ? 'Hour' : 'Minute'}:
              </Text>
              <View style={styles.fineTuneControls}>
                <TouchableOpacity
                  style={styles.fineTuneButton}
                  onPress={decrementValue}
                  activeOpacity={0.7}
                >
                  <Icon name="remove" size={18} color={theme.colors.primary} />
                </TouchableOpacity>
                <Text style={styles.fineTuneValue}>
                  {activeTab === 'hour' ? tempHour : String(tempMinute).padStart(2, '0')}
                </Text>
                <TouchableOpacity
                  style={styles.fineTuneButton}
                  onPress={incrementValue}
                  activeOpacity={0.7}
                >
                  <Icon name="add" size={18} color={theme.colors.primary} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Modal Dialog Action Buttons */}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalBtn}
                onPress={() => setWatchPickerOpen(false)}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalSaveBtn]}
                onPress={handleSave}
              >
                <Text style={styles.modalSaveBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  
  // Watch Picker Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    width: 320,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  modalTitle: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.textSecondary,
    marginBottom: 16,
  },
  timeReadoutContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    backgroundColor: '#F8F9FA',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },
  timePartBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  timePartBtnActive: {
    backgroundColor: 'rgba(33, 150, 243, 0.1)',
  },
  timeReadoutText: {
    fontSize: 38,
    fontWeight: 'bold',
    color: '#495057',
  },
  timeReadoutActive: {
    color: theme.colors.primary,
  },
  timeReadoutColon: {
    fontSize: 34,
    fontWeight: 'bold',
    color: '#CED4DA',
    marginHorizontal: 4,
  },
  readoutAmPmContainer: {
    marginLeft: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  readoutAmPmButton: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginVertical: 2,
    backgroundColor: '#E9ECEF',
  },
  readoutAmPmActive: {
    backgroundColor: theme.colors.primary,
  },
  readoutAmPmText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#495057',
  },
  readoutAmPmTextActive: {
    color: '#FFFFFF',
  },
  clockCircle: {
    width: 230,
    height: 230,
    borderRadius: 115,
    backgroundColor: '#F1F3F5',
    position: 'relative',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },
  clockHub: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.primary,
    position: 'absolute',
    left: 110,
    top: 110,
    zIndex: 10,
  },
  clockNeedle: {
    position: 'absolute',
    left: 30, // 115 - 85
    top: 114, // 115 - 1
    width: 170, // 85 * 2
    height: 2,
    flexDirection: 'row',
  },
  clockNeedleTransparent: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  clockNeedleActive: {
    flex: 1,
    backgroundColor: theme.colors.primary,
  },
  dialItem: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dialItemActive: {
    backgroundColor: theme.colors.primary,
  },
  dialItemText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#495057',
  },
  dialItemTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  fineTuneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 8,
    marginBottom: 20,
    borderTopWidth: 1,
    borderTopColor: '#E9ECEF',
    paddingTop: 12,
  },
  fineTuneLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6C757D',
  },
  fineTuneControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fineTuneButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F1F3F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fineTuneValue: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#495057',
    marginHorizontal: 12,
    minWidth: 20,
    textAlign: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    width: '100%',
    borderTopWidth: 1,
    borderTopColor: '#E9ECEF',
    paddingTop: 12,
  },
  modalBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginLeft: 8,
  },
  modalCancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6C757D',
  },
  modalSaveBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: 8,
  },
  modalSaveBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});

export default CustomBookingTimeFields;
