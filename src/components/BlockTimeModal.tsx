import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  ActivityIndicator,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { theme } from '../constants/theme';
import {
  formatTimeForApi,
  formatTimeForDisplay,
  parseTimeStringToDate,
} from '../utils/customBookingTime.util';
import { parseAppointmentTime } from '../utils/appointmentDisplay.util';
import {
  CUSTOM_BOOKING_DURATION_OPTIONS,
  getCustomBookingDurationLabel,
} from '../constants/customBookingDurationOptions';
import { MonthCalendarPickerModal } from './MonthCalendarPickerModal';
import { isCustomBookingMode } from '../utils/doctorBookingMode.util';

interface BlockRange {
  startTime: string; // display string e.g. "2:00 PM"
  durationMinutes: number | null;
}

/** Display end time ("h:mm AM/PM") for a start time + duration, capped at 23:59. */
function endTimeOf(startTime: string, durationMinutes: number): string {
  const start = parseAppointmentTime(startTime);
  if (start == null) return startTime;
  const endMins = Math.min(start + durationMinutes, 23 * 60 + 59);
  const d = new Date();
  d.setHours(Math.floor(endMins / 60), endMins % 60, 0, 0);
  return formatTimeForApi(d);
}

interface BlockTimeModalProps {
  visible: boolean;
  onClose: () => void;
  doctorId: string | null;
  doctorName?: string;
  isCustomDoctor: boolean;
  initialDate: string; // YYYY-MM-DD
  token: string | null;
}

const BlockTimeModal: React.FC<BlockTimeModalProps> = ({
  visible,
  onClose,
  doctorId,
  doctorName,
  isCustomDoctor,
  initialDate,
  token,
}) => {
  const [date, setDate] = useState(initialDate);
  const [ranges, setRanges] = useState<BlockRange[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);

  // Selector list variables
  const [selectedDoctorId, setSelectedDoctorId] = useState<string | null>(doctorId);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [selectedDoctor, setSelectedDoctor] = useState<any | null>(null);
  const [doctorDropdownOpen, setDoctorDropdownOpen] = useState(false);

  // Custom watch picker temporary states
  const [tempHour, setTempHour] = useState(9);
  const [tempMinute, setTempMinute] = useState(0);
  const [tempAmPm, setTempAmPm] = useState<'AM' | 'PM'>('AM');
  const [activeTab, setActiveTab] = useState<'hour' | 'minute'>('hour');

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

  // Preserve other config so saving block times never clobbers leave/slots.
  const [otherConfig, setOtherConfig] = useState<{
    isLeave: boolean;
    disabledSlots: string[];
    maxQueueCount: number | null;
  }>({ isLeave: false, disabledSlots: [], maxQueueCount: null });

  // Start-time picker state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);
  // Duration dropdown state — index of the row whose dropdown is open
  const [durationOpenIndex, setDurationOpenIndex] = useState<number | null>(null);

  const isCurrentCustomDoctor = selectedDoctor ? isCustomBookingMode(selectedDoctor) : false;

  const loadConfig = useCallback(async () => {
    if (!selectedDoctorId || !date || !token) return;
    setLoading(true);
    try {
      const svc = (await import('../services/realAuthService')).default;
      const res = await svc.getBookingConfig(selectedDoctorId, date, token);
      setOtherConfig({
        isLeave: res?.isLeave === true,
        disabledSlots: res?.disabledSlots || [],
        maxQueueCount: res?.maxQueueCount ?? null,
      });
      setRanges(
        (res?.blockedTimes || []).map((b: any): BlockRange => {
          const s = parseAppointmentTime(b.startTime);
          const e = parseAppointmentTime(b.endTime);
          return {
            startTime: b.startTime,
            durationMinutes: s != null && e != null ? e - s : null,
          };
        }),
      );
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to load blocked times');
    } finally {
      setLoading(false);
    }
  }, [selectedDoctorId, date, token]);

  useEffect(() => {
    if (visible) {
      setDate(initialDate);
      setSelectedDoctorId(doctorId);
    }
  }, [visible, initialDate, doctorId]);

  useEffect(() => {
    const fetchDoctorsList = async () => {
      if (!token || !visible) return;
      try {
        const svc = (await import('../services/realAuthService')).default;
        const res = await svc.fetchDoctors(token);
        setDoctors(res || []);
        if (selectedDoctorId) {
          const current = res.find((d: any) => d._id === selectedDoctorId);
          setSelectedDoctor(current || null);
        }
      } catch (err) {
        console.error('Failed to fetch doctors in modal', err);
      }
    };
    fetchDoctorsList();
  }, [token, visible, selectedDoctorId]);

  useEffect(() => {
    if (visible) {
      loadConfig();
    }
  }, [visible, loadConfig]);

  const addRange = () =>
    setRanges(prev => [...prev, { startTime: '', durationMinutes: null }]);
  const removeRange = (index: number) =>
    setRanges(prev => prev.filter((_, i) => i !== index));

  const openPicker = (index: number) => {
    setPickerIndex(index);
    const start = ranges[index]?.startTime || '9:00 AM';
    const { hr, min, ampm } = parseWatchTime(start);
    setTempHour(hr);
    setTempMinute(min);
    setTempAmPm(ampm);
    setActiveTab('hour');
    setPickerOpen(true);
  };

  const handleSaveWatchTime = () => {
    setPickerOpen(false);
    if (pickerIndex == null) return;
    const formatted = formatWatchTime(tempHour, tempMinute, tempAmPm);
    setRanges(prev =>
      prev.map((r, i) => (i === pickerIndex ? { ...r, startTime: formatted } : r)),
    );
  };

  const setDuration = (index: number, minutes: number) => {
    setRanges(prev =>
      prev.map((r, i) => (i === index ? { ...r, durationMinutes: minutes } : r)),
    );
    setDurationOpenIndex(null);
  };

  const handleSave = async () => {
    if (!selectedDoctorId || !date || !token) return;

    for (const r of ranges) {
      const dur = Number(r.durationMinutes);
      if (!r.startTime || !Number.isFinite(dur) || dur < 1) {
        Alert.alert('Incomplete', 'Each blocked range needs a start time and a duration.');
        return;
      }
    }

    setSaving(true);
    try {
      const svc = (await import('../services/realAuthService')).default;
      const res = await svc.saveBookingConfig(
        {
          doctorId: selectedDoctorId,
          date,
          isLeave: otherConfig.isLeave,
          disabledSlots: otherConfig.disabledSlots,
          maxQueueCount: otherConfig.maxQueueCount,
          blockedTimes: ranges.map(r => ({
            startTime: r.startTime,
            endTime: endTimeOf(r.startTime, Number(r.durationMinutes)),
          })),
        },
        token,
      );
      const conflicts = res?.conflicts || [];
      if (conflicts.length) {
        const names = conflicts
          .map((c: any) => `${c.patientName} (${c.time})`)
          .join('\n');
        Alert.alert(
          'Saved — existing appointments kept',
          `${conflicts.length} appointment(s) already fall in a blocked range and were not changed:\n\n${names}`,
        );
      } else {
        Alert.alert('Saved', `Blocked times updated for ${date}.`);
      }
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to save blocked times');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>
              Block Time{selectedDoctor ? ` — ${selectedDoctor.name}` : ''}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Icon name="close" size={22} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Doctor Dropdown Selector */}
          <View style={styles.dateRow}>
            <Text style={styles.dateLabel}>Select Doctor</Text>
            <TouchableOpacity
              style={[styles.dateBtn, { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minWidth: 160, marginLeft: 16 }]}
              activeOpacity={0.7}
              onPress={() => setDoctorDropdownOpen(!doctorDropdownOpen)}
            >
              <Text style={styles.dateText} numberOfLines={1}>
                {selectedDoctor ? selectedDoctor.name : 'Choose Doctor'}
              </Text>
              <Icon
                name={doctorDropdownOpen ? 'expand-less' : 'expand-more'}
                size={20}
                color={theme.colors.textSecondary}
              />
            </TouchableOpacity>
          </View>
          
          {doctorDropdownOpen ? (
            <View style={[styles.durationList, { marginHorizontal: 16, marginTop: 6, maxHeight: 150 }]}>
              <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {doctors.map(d => {
                  const active = d._id === selectedDoctorId;
                  return (
                    <TouchableOpacity
                      key={d._id}
                      style={styles.durationItem}
                      activeOpacity={0.7}
                      onPress={() => {
                        setSelectedDoctorId(d._id);
                        setSelectedDoctor(d);
                        setDoctorDropdownOpen(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.durationItemText,
                          active && styles.durationItemTextActive,
                        ]}
                      >
                        {d.name}
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

          <View style={styles.dateRow}>
            <Text style={styles.dateLabel}>Date</Text>
            <TouchableOpacity
              style={styles.dateBtn}
              activeOpacity={0.7}
              onPress={() => setDateOpen(true)}
            >
              <Icon name="event" size={18} color={theme.colors.primary} />
              <Text style={styles.dateText}>{date}</Text>
            </TouchableOpacity>
          </View>

          {!isCurrentCustomDoctor ? (
            <Text style={styles.notCustom}>
              Block Time applies to custom-booking doctors only.
            </Text>
          ) : loading ? (
            <ActivityIndicator style={{ marginVertical: 24 }} color={theme.colors.primary} />
          ) : (
            <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
              <Text style={styles.hint}>
                Patients cannot book a custom appointment overlapping a blocked range on this date.
              </Text>

              {ranges.length === 0 ? (
                <Text style={styles.empty}>No blocked ranges for this date.</Text>
              ) : (
                ranges.map((r, i) => (
                  <View key={i} style={styles.rangeBlock}>
                    <View style={styles.rangeRow}>
                      <TouchableOpacity
                        style={styles.timeBtn}
                        activeOpacity={0.7}
                        onPress={() => openPicker(i)}
                      >
                        <Icon name="schedule" size={16} color={theme.colors.textSecondary} />
                        <Text style={styles.timeText}>
                          {r.startTime ? formatTimeForDisplay(r.startTime) : 'Start time'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.timeBtn}
                        activeOpacity={0.7}
                        onPress={() =>
                          setDurationOpenIndex(durationOpenIndex === i ? null : i)
                        }
                      >
                        <Text style={styles.timeText}>
                          {r.durationMinutes != null
                            ? getCustomBookingDurationLabel(r.durationMinutes)
                            : 'Duration'}
                        </Text>
                        <Icon
                          name={durationOpenIndex === i ? 'expand-less' : 'expand-more'}
                          size={20}
                          color={theme.colors.textSecondary}
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.removeBtn}
                        onPress={() => removeRange(i)}
                      >
                        <Icon name="delete-outline" size={20} color={theme.colors.error} />
                      </TouchableOpacity>
                    </View>
                    {durationOpenIndex === i ? (
                      <View style={styles.durationList}>
                        <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                          {CUSTOM_BOOKING_DURATION_OPTIONS.map(opt => {
                            const active = r.durationMinutes === opt.value;
                            return (
                              <TouchableOpacity
                                key={opt.value}
                                style={styles.durationItem}
                                activeOpacity={0.7}
                                onPress={() => setDuration(i, opt.value)}
                              >
                                <Text
                                  style={[
                                    styles.durationItemText,
                                    active && styles.durationItemTextActive,
                                  ]}
                                >
                                  {opt.label}
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
                  </View>
                ))
              )}

              <TouchableOpacity style={styles.addBtn} onPress={addRange} activeOpacity={0.7}>
                <Icon name="add" size={18} color={theme.colors.primary} />
                <Text style={styles.addText}>Add Blocked Range</Text>
              </TouchableOpacity>
            </ScrollView>
          )}

          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, (!isCurrentCustomDoctor || saving) && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={!isCurrentCustomDoctor || saving}
            >
              <Text style={styles.saveText}>{saving ? 'Saving...' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Custom Watch/Clock Time Picker Modal */}
      <Modal
        visible={pickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerOpen(false)}
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
                onPress={() => setPickerOpen(false)}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalSaveBtn]}
                onPress={handleSaveWatchTime}
              >
                <Text style={styles.modalSaveBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <MonthCalendarPickerModal
        visible={dateOpen}
        onClose={() => setDateOpen(false)}
        value={new Date(`${date}T00:00:00`)}
        onSelectDate={d => {
          setDateOpen(false);
          setDate(d.toLocaleDateString('en-CA'));
        }}
      />
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  box: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '85%',
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginRight: 8,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  dateLabel: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
  },
  dateText: {
    fontSize: 14,
    color: theme.colors.text,
    marginLeft: 6,
  },
  notCustom: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    padding: 20,
    textAlign: 'center',
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  hint: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: 12,
  },
  empty: {
    fontSize: 13,
    color: '#94a3b8',
    marginBottom: 12,
  },
  rangeBlock: {
    marginBottom: 10,
  },
  rangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginRight: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    backgroundColor: theme.colors.surface,
  },
  timeText: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.text,
    marginLeft: 4,
  },
  removeBtn: {
    padding: 6,
  },
  durationList: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
    overflow: 'hidden',
    maxHeight: 220,
  },
  durationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  durationItemText: {
    fontSize: 14,
    color: theme.colors.text,
    flex: 1,
  },
  durationItemTextActive: {
    color: theme.colors.primary,
    fontWeight: '600',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colors.primary,
    borderRadius: 8,
    marginTop: 4,
    marginBottom: 16,
  },
  addText: {
    fontSize: 13,
    color: theme.colors.primary,
    marginLeft: 4,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  saveBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: theme.colors.primary,
    marginLeft: 8,
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
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
    fontSize: 14,
    fontWeight: '600',
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
    left: 30,
    top: 114,
    width: 170,
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

export default BlockTimeModal;
