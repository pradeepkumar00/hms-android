import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  Alert,
  Modal,
  Dimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import DatePicker from 'react-native-date-picker';
import { useAppSelector, selectAuthToken } from '../store';
import { theme } from '../constants/theme';
import { Header } from '../components';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Appointment } from '../types';

interface CalendarScreenProps {
  navigation: any;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Timeline layout constants
const HOUR_MIN_HEIGHT = 72; // px for an empty hour row
const EVENT_MIN_HEIGHT = 30; // px per appointment card
const EVENT_GAP = 6; // px between stacked cards in the same hour
const GUTTER = 80; // px reserved for the TOKENS / hour-label column on the left
const DEFAULT_DURATION = 30; // minutes when the API gives no duration
const DAY_START_HOUR = 7; // timeline starts at 7 AM
const DAY_END_HOUR = 23; // timeline ends at 11 PM
const SHEET_MAX_HEIGHT = Math.round(Dimensions.get('window').height * 0.88);

// Fallback card color when a doctor has no assigned color (matches the web app)
const DEFAULT_EVENT_COLOR = '#7CB342';

// Local YYYY-MM-DD key for a Date
const toKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;

// Normalize an appointment's date string to a YYYY-MM-DD key (null if invalid)
const appointmentKey = (date?: string): string | null => {
  if (!date) return null;
  // API already returns YYYY-MM-DD; guard against ISO timestamps too.
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const d = new Date(date);
  return isNaN(d.getTime()) ? null : toKey(d);
};

// Parse a "4:00 PM" / "16:00" style string into minutes from midnight (null if none)
const parseTime = (time?: string | null): number | null => {
  if (!time) return null;
  const m = time.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  let hours = parseInt(m[1], 10);
  const minutes = parseInt(m[2], 10);
  const meridiem = m[3]?.toUpperCase();
  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
};

const formatHour = (h: number) => {
  const period = h < 12 || h === 24 ? 'AM' : 'PM';
  let display = h % 12;
  if (display === 0) display = 12;
  return `${display} ${period}`;
};

// "03 Jun 2026" (optionally with time) for the all-appointments list
const formatApptListDate = (date?: string, time?: string | null) => {
  const key = appointmentKey(date);
  if (!key) return date || '—';
  const [y, m, d] = key.split('-').map(Number);
  const formatted = new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  return time ? `${formatted} ${time}` : formatted;
};

const getStatusColor = (status?: string) => {
  switch ((status || '').toLowerCase()) {
    case 'waiting':
      return '#FF9800';
    case 'confirmed':
      return '#2196F3';
    case 'arrived':
      return '#9C27B0';
    case 'completed':
      return '#4CAF50';
    case 'cancelled':
    case 'canceled':
      return '#F44336';
    default:
      return theme.colors.textSecondary;
  }
};

const getStatusLabel = (status?: string) => {
  if (!status) return 'Unknown';
  return status.charAt(0).toUpperCase() + status.slice(1);
};

// Pick black or white text for best contrast against a hex background color.
const contrastText = (bg: string): string => {
  let hex = (bg || '').replace('#', '');
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map(c => c + c)
      .join('');
  }
  if (hex.length !== 6) return '#FFFFFF';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  // Perceived brightness (0–1); bright backgrounds get dark text.
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#1A1A1A' : '#FFFFFF';
};

interface HourEventLayout {
  appt: Appointment;
  start: number; // minutes from midnight
  end: number; // minutes from midnight
  top: number; // px from top of hour slot
  height: number; // px
}

interface HourSlot {
  hour: number;
  height: number;
  events: HourEventLayout[];
}

// Stack appointments from the top of each hour slot; expand height as needed.
const layoutHourSlots = (
  events: { appt: Appointment; start: number; end: number }[],
  minHour: number,
  maxHour: number,
): HourSlot[] => {
  const slots: HourSlot[] = [];

  for (let hour = minHour; hour <= maxHour; hour++) {
    const inHour = events
      .filter(e => Math.floor(e.start / 60) === hour)
      .sort((a, b) => a.start - b.start || a.end - b.end);

    if (inHour.length === 0) {
      slots.push({ hour, height: HOUR_MIN_HEIGHT, events: [] });
      continue;
    }

    const laidOut: HourEventLayout[] = [];
    let lastBottom = 8;

    inHour.forEach((event, index) => {
      const top = index === 0 ? 8 : lastBottom + EVENT_GAP;

      laidOut.push({
        ...event,
        top,
        height: EVENT_MIN_HEIGHT,
      });
      lastBottom = top + EVENT_MIN_HEIGHT;
    });

    slots.push({
      hour,
      height: Math.max(HOUR_MIN_HEIGHT, lastBottom + 8),
      events: laidOut,
    });
  }

  return slots;
};

const CalendarScreen: React.FC<CalendarScreenProps> = ({ navigation }) => {
  const token = useAppSelector(selectAuthToken);

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  // doctor _id/doctorCode → color hex (from GET /get-doctor)
  const [doctorColors, setDoctorColors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Sunday of the week currently displayed
  const [weekStart, setWeekStart] = useState(() => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    d.setDate(d.getDate() - d.getDay()); // rewind to Sunday
    return d;
  });
  const [selectedKey, setSelectedKey] = useState(() => toKey(new Date()));
  // Doctor filter (null = all doctors)
  const [selectedDoctorId, setSelectedDoctorId] = useState<string | null>(null);
  // Whether the doctor dropdown is open
  const [doctorModalOpen, setDoctorModalOpen] = useState(false);
  // Whether the date picker is open
  const [showDatePicker, setShowDatePicker] = useState(false);
  // Appointment shown in the bottom details sheet (null = closed)
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  // Whether the "Move to OPD" request is in flight
  const [movingToOpd, setMovingToOpd] = useState(false);
  // Which status update is in flight (e.g. 'completed'), null when idle
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null);
  // Patient history shown in the details sheet
  const [patientAppointments, setPatientAppointments] = useState<Appointment[]>(
    [],
  );
  const [patientApptsLoading, setPatientApptsLoading] = useState(false);
  // Measured height of the fixed sheet header/details/actions block
  const [sheetTopHeight, setSheetTopHeight] = useState(0);

  // The seven dates of the displayed week (Sun → Sat)
  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        return d;
      }),
    [weekStart],
  );

  // The visible date range — the displayed week (Sun → Sat)
  const range = useMemo(
    () => ({ from: toKey(weekDays[0]), to: toKey(weekDays[6]) }),
    [weekDays],
  );

  const fetchAppointments = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const realAuthService = (await import('../services/realAuthService'))
        .default;
      const fetched = await realAuthService
        .fetchAppointmentsRange(token, range.from, range.to)
        .catch(() => []);
      setAppointments(fetched || []);
    } catch (err) {
      console.error('Calendar: failed to fetch appointments:', err);
    } finally {
      setIsLoading(false);
    }
  }, [token, range.from, range.to]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  // Load the doctor → color map once (used to color-code appointment cards).
  useEffect(() => {
    if (!token) return;
    let active = true;
    (async () => {
      const realAuthService = (await import('../services/realAuthService'))
        .default;
      const map = await realAuthService.fetchDoctorColors(token);
      if (active) setDoctorColors(map);
    })();
    return () => {
      active = false;
    };
  }, [token]);

  // Resolve an appointment's card color: the doctor's assigned color (by id or
  // code), then any color already on the appointment, then the default green.
  const colorForAppt = useCallback(
    (appt: Appointment) =>
      doctorColors[appt.doctorId || ''] ||
      doctorColors[appt.doctorCode || ''] ||
      appt.doctorColor ||
      DEFAULT_EVENT_COLOR,
    [doctorColors],
  );

  useFocusEffect(
    useCallback(() => {
      fetchAppointments();
    }, [fetchAppointments]),
  );

  // Load all appointments for the patient when the details sheet opens
  useEffect(() => {
    if (!selectedAppt?.patientId || !token) {
      setPatientAppointments([]);
      setPatientApptsLoading(false);
      return;
    }

    let active = true;
    setPatientApptsLoading(true);
    (async () => {
      try {
        const realAuthService = (await import('../services/realAuthService'))
          .default;
        const fetched = await realAuthService.fetchPatientAppointments(
          selectedAppt.patientId!,
          token,
        );
        if (active) setPatientAppointments(fetched || []);
      } catch (err) {
        console.error('Calendar: failed to fetch patient appointments:', err);
        if (active) setPatientAppointments([]);
      } finally {
        if (active) setPatientApptsLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [selectedAppt?.patientId, selectedAppt?._id, token]);

  const sortedPatientAppointments = useMemo(() => {
    return [...patientAppointments]
      .filter(appt => appt._id !== selectedAppt?._id)
      .sort((a, b) => {
        const dateCmp = (b.date || '').localeCompare(a.date || '');
        if (dateCmp !== 0) return dateCmp;
        return (parseTime(b.time) ?? 0) - (parseTime(a.time) ?? 0);
      });
  }, [patientAppointments, selectedAppt?._id]);

  const allApptsListHeight = useMemo(() => {
    const topHeight = sheetTopHeight || 460;
    const sectionHeader = 52;
    const bottomPad = theme.spacing.lg;
    return Math.max(96, SHEET_MAX_HEIGHT - topHeight - sectionHeader - bottomPad);
  }, [sheetTopHeight]);

  useEffect(() => {
    setSheetTopHeight(0);
  }, [selectedAppt?._id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAppointments();
    setRefreshing(false);
  }, [fetchAppointments]);

  // Group appointments by their date key
  const appointmentsByDate = useMemo(() => {
    const map: Record<string, Appointment[]> = {};
    appointments.forEach(appt => {
      const key = appointmentKey(appt.date);
      if (!key) return;
      (map[key] = map[key] || []).push(appt);
    });
    return map;
  }, [appointments]);

  // Unique list of doctors found across the loaded appointments (for the dropdown)
  const doctorOptions = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; color?: string | null }
    >();
    appointments.forEach(appt => {
      const id = appt.doctorId || appt.doctorName;
      if (!id || map.has(id)) return;
      map.set(id, {
        id,
        name: appt.doctorName || 'Unknown doctor',
        color: appt.doctorColor,
      });
    });
    return Array.from(map.values());
  }, [appointments]);

  const todayKey = toKey(new Date());

  const goToPrevWeek = () =>
    setWeekStart(d => {
      const n = new Date(d);
      n.setDate(d.getDate() - 7);
      return n;
    });
  const goToNextWeek = () =>
    setWeekStart(d => {
      const n = new Date(d);
      n.setDate(d.getDate() + 7);
      return n;
    });
  // Jump back to today's week and select today
  const goToToday = () => {
    const n = new Date();
    const sunday = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    sunday.setDate(sunday.getDate() - sunday.getDay());
    setWeekStart(sunday);
    setSelectedKey(toKey(n));
  };
  // Jump to an arbitrary date chosen from the date picker
  const goToDate = (date: Date) => {
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const sunday = new Date(day);
    sunday.setDate(day.getDate() - day.getDay());
    setWeekStart(sunday);
    setSelectedKey(toKey(day));
  };
  // Split the selected day's appointments into hour slots and untimed tokens
  const { hourSlots, untimed, timelineHeight } = useMemo(() => {
    let dayAppointments = appointmentsByDate[selectedKey] || [];
    if (selectedDoctorId) {
      dayAppointments = dayAppointments.filter(
        appt => (appt.doctorId || appt.doctorName) === selectedDoctorId,
      );
    }

    const timedRaw: { appt: Appointment; start: number; end: number }[] = [];
    const untimedList: Appointment[] = [];

    dayAppointments.forEach(appt => {
      const startMin = parseTime(appt.time);
      if (startMin == null) {
        untimedList.push(appt);
      } else {
        const dur =
          typeof appt.duration === 'number' && appt.duration > 0
            ? appt.duration
            : DEFAULT_DURATION;
        timedRaw.push({ appt, start: startMin, end: startMin + dur });
      }
    });

    const slots = layoutHourSlots(timedRaw, DAY_START_HOUR, DAY_END_HOUR);
    const totalHeight = slots.reduce((sum, slot) => sum + slot.height, 0);

    return {
      hourSlots: slots,
      untimed: untimedList,
      timelineHeight: totalHeight,
    };
  }, [appointmentsByDate, selectedKey, selectedDoctorId]);

  // The currently selected doctor option (null = all doctors)
  const selectedDoctor = useMemo(
    () => doctorOptions.find(d => d.id === selectedDoctorId) || null,
    [doctorOptions, selectedDoctorId],
  );

  const renderEventBlock = (e: HourEventLayout) => {
    const { appt } = e;
    const accent = colorForAppt(appt);
    const textColor = contrastText(accent);
    return (
      <TouchableOpacity
        key={appt._id}
        activeOpacity={0.8}
        onPress={() => setSelectedAppt(appt)}
        style={[
          styles.eventBlock,
          {
            top: e.top,
            height: e.height,
            backgroundColor: accent,
          },
        ]}
      >
        <Text style={[styles.eventText, { color: textColor }]} numberOfLines={2}>
          <Text style={[styles.eventTime, { color: textColor }]}>
            {appt.time}
          </Text>
          <Text style={[styles.eventName, { color: textColor }]}>
            {'  '}
            {appt.patientName || 'Unknown'}
          </Text>
          {appt.doctorName ? (
            <Text style={[styles.eventDoctor, { color: textColor }]}>
              {`  · ${appt.doctorName}`}
            </Text>
          ) : null}
        </Text>
      </TouchableOpacity>
    );
  };

  // Compact chip for a token (untimed) appointment in the timeline's TOKENS column
  const renderTokenChip = (appt: Appointment) => {
    const accent = colorForAppt(appt);
    return (
      <TouchableOpacity
        key={appt._id}
        activeOpacity={0.8}
        onPress={() => setSelectedAppt(appt)}
        style={[styles.tokenChip, { borderLeftColor: accent }]}
      >
        <Text style={styles.tokenChipName} numberOfLines={1}>
          {appt.patientName || 'Unknown'}
        </Text>
        <Text style={styles.tokenChipNo}>
          {appt.tokenCount != null ? `#${appt.tokenCount}` : '—'}
        </Text>
      </TouchableOpacity>
    );
  };

  // Pill used for status-like fields in the details sheet
  const renderPill = (label: string, color: string) => (
    <View style={[styles.pill, { backgroundColor: `${color}22` }]}>
      <Text style={[styles.pillText, { color }]}>{label}</Text>
    </View>
  );

  // Arrival label + color derived from confirmation / arrival flags
  const arrivalInfo = (appt: Appointment) => {
    const label = appt.confirmationStatus
      ? getStatusLabel(appt.confirmationStatus)
      : appt.isArrived
      ? 'Arrived'
      : 'Pending';
    const color = /confirm|arriv/i.test(label) ? '#4CAF50' : '#FF9800';
    return { label, color };
  };

  // Move the selected patient to OPD
  const handleMoveToOpd = async () => {
    if (!selectedAppt || !token || movingToOpd) return;
    const patientId = selectedAppt.patientId;
    if (!patientId) {
      Alert.alert('Move to OPD', 'No patient is linked to this appointment.');
      return;
    }
    setMovingToOpd(true);
    try {
      const realAuthService = (await import('../services/realAuthService'))
        .default;
      const patient = await realAuthService.moveToOpd(patientId, token);
      const appt = selectedAppt;
      setSelectedAppt(null);
      navigation.navigate('OPD', { appointment: appt, patient });
    } catch (err) {
      console.error('Move to OPD failed:', err);
      Alert.alert('Error', 'Failed to move the patient to OPD. Please try again.');
    } finally {
      setMovingToOpd(false);
    }
  };

  // Update the selected appointment's status (Complete / Absent / …)
  const handleStatusUpdate = async (status: string, label: string) => {
    if (!selectedAppt || !token || statusUpdating) return;
    setStatusUpdating(status);
    try {
      const realAuthService = (await import('../services/realAuthService'))
        .default;
      await realAuthService.updateAppointmentStatus(
        selectedAppt._id,
        status,
        token,
      );
      setSelectedAppt(null);
      await fetchAppointments();
      Alert.alert('Success', `Appointment marked as ${label}.`);
    } catch (err) {
      console.error('Status update failed:', err);
      Alert.alert('Error', `Failed to mark as ${label}. Please try again.`);
    } finally {
      setStatusUpdating(null);
    }
  };

  return (
    <View style={styles.container}>
      <Header
        title="Calendar"
        showHomeIcon
        onHomePress={() => navigation.popToTop()}
        showNotificationIcon
        onNotificationPress={() => navigation.navigate('Inbox')}
      />

      {/* Week navigation + doctor dropdown */}
      <View style={styles.navRow}>
        <View style={styles.todayNav}>
          <TouchableOpacity
            onPress={goToPrevWeek}
            style={styles.todayNavBtn}
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
          >
            <Icon name="chevron-left" size={22} color={theme.colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={goToToday}
            style={styles.todayNavLabelBtn}
            activeOpacity={0.7}
          >
            <Text style={styles.todayNavLabel}>
              {selectedKey === todayKey
                ? 'Today'
                : selectedKey.split('-').reverse().join('/')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={goToNextWeek}
            style={styles.todayNavBtn}
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
          >
            <Icon name="chevron-right" size={22} color={theme.colors.text} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.datePickerBtn}
          activeOpacity={0.7}
          onPress={() => setShowDatePicker(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="calendar-today" size={20} color={theme.colors.primary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.doctorSelectBox}
          activeOpacity={0.7}
          onPress={() => setDoctorModalOpen(true)}
        >
          <Text style={styles.doctorSelectText} numberOfLines={1}>
            {selectedDoctor?.name || 'All Doctors'}
          </Text>
          <Icon
            name="arrow-drop-down"
            size={22}
            color={theme.colors.textSecondary}
          />
        </TouchableOpacity>
      </View>

      {/* Date picker for jumping to a specific day */}
      <DatePicker
        modal
        open={showDatePicker}
        date={new Date(`${selectedKey}T00:00:00`)}
        mode="date"
        onConfirm={date => {
          setShowDatePicker(false);
          goToDate(date);
        }}
        onCancel={() => setShowDatePicker(false)}
        title="Select date"
      />

      {/* Week strip (day chips) */}
      <View style={styles.weekStrip}>
        {weekDays.map(d => {
          const key = toKey(d);
          const isToday = key === todayKey;
          const isSelected = key === selectedKey;
          return (
            <TouchableOpacity
              key={key}
              style={[
                styles.dayChip,
                isToday && !isSelected && styles.dayChipToday,
                isSelected && styles.dayChipSelected,
              ]}
              activeOpacity={0.7}
              onPress={() => setSelectedKey(key)}
            >
              <Text
                style={[
                  styles.dayChipWeekday,
                  isSelected && styles.dayChipTextSelected,
                ]}
              >
                {WEEKDAYS[d.getDay()].toUpperCase()}
              </Text>
              <Text
                style={[
                  styles.dayChipDate,
                  isSelected && styles.dayChipTextSelected,
                ]}
              >
                {d.getDate()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {isLoading && appointments.length === 0 ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        /* Calendar — timeline with the TOKENS column */
        <ScrollView
          contentContainerStyle={styles.timelineScroll}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {/* TOKENS section — unscheduled (token) appointments as a vertical list */}
          <View style={styles.gridHeader}>
            <View style={styles.gridHeaderTokens}>
              <Text style={styles.gridHeaderText}>TOKENS</Text>
            </View>
            <View style={styles.tokenListColumn}>
              {untimed.length > 0 ? (
                untimed.map(renderTokenChip)
              ) : (
                <Text style={styles.tokenRowEmpty}>No tokens</Text>
              )}
            </View>
          </View>

          <View style={[styles.timeline, { minHeight: timelineHeight }]}>
            {hourSlots.map(slot => (
              <View
                key={slot.hour}
                style={[styles.hourSlot, { height: slot.height }]}
              >
                <Text style={styles.hourLabel}>{formatHour(slot.hour)}</Text>
                <View style={styles.hourEventsArea}>
                  {slot.events.map(renderEventBlock)}
                </View>
              </View>
            ))}

          </View>
        </ScrollView>
      )}

      {/* Doctor filter dropdown for the token section */}
      <Modal
        visible={doctorModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDoctorModalOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setDoctorModalOpen(false)}
        >
          <View style={styles.doctorModalContent}>
            <View style={styles.doctorModalHeader}>
              <Text style={styles.doctorModalTitle}>Select Doctor</Text>
              <TouchableOpacity onPress={() => setDoctorModalOpen(false)}>
                <Icon name="close" size={22} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {/* All doctors */}
              <TouchableOpacity
                style={styles.doctorOption}
                activeOpacity={0.7}
                onPress={() => {
                  setSelectedDoctorId(null);
                  setDoctorModalOpen(false);
                }}
              >
                <Icon
                  name="groups"
                  size={18}
                  color={theme.colors.textSecondary}
                  style={styles.doctorOptionIcon}
                />
                <Text style={styles.doctorOptionText}>All Doctors</Text>
                {selectedDoctorId == null && (
                  <Icon name="check" size={20} color={theme.colors.primary} />
                )}
              </TouchableOpacity>

              {doctorOptions.map(doc => {
                const isSelected = selectedDoctorId === doc.id;
                return (
                  <TouchableOpacity
                    key={doc.id}
                    style={styles.doctorOption}
                    activeOpacity={0.7}
                    onPress={() => {
                      setSelectedDoctorId(doc.id);
                      setDoctorModalOpen(false);
                    }}
                  >
                    <View
                      style={[
                        styles.doctorDot,
                        {
                          backgroundColor:
                            doctorColors[doc.id] ||
                            doc.color ||
                            theme.colors.primary,
                        },
                      ]}
                    />
                    <Text style={styles.doctorOptionText} numberOfLines={1}>
                      {doc.name}
                    </Text>
                    {isSelected && (
                      <Icon name="check" size={20} color={theme.colors.primary} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Appointment details bottom sheet */}
      <Modal
        visible={selectedAppt != null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedAppt(null)}
      >
        <View style={styles.sheetOverlay}>
          <Pressable
            style={styles.sheetBackdrop}
            onPress={() => setSelectedAppt(null)}
          />
          <View style={styles.sheet}>
            {selectedAppt && (
              <>
                <View
                  style={styles.sheetTop}
                  onLayout={event =>
                    setSheetTopHeight(event.nativeEvent.layout.height)
                  }
                >
                  {/* Header: name + mobile */}
                  <View style={styles.sheetHeader}>
                    <View style={styles.sheetAvatar}>
                      <Icon
                        name="person"
                        size={26}
                        color={theme.colors.textSecondary}
                      />
                    </View>
                    <View style={styles.sheetHeaderCol}>
                      <Text style={styles.sheetHeaderLabel}>NAME</Text>
                      <Text style={styles.sheetHeaderValue} numberOfLines={1}>
                        {selectedAppt.patientName || 'Unknown'}
                      </Text>
                    </View>
                    <View style={styles.sheetHeaderColDivider} />
                    <View style={styles.sheetHeaderCol}>
                      <Text style={styles.sheetHeaderLabel}>MOBILE</Text>
                      <Text style={styles.sheetHeaderValue} numberOfLines={1}>
                        {selectedAppt.mobileNo || '—'}
                      </Text>
                    </View>
                    <View style={styles.sheetStatusDot} />
                    <TouchableOpacity
                      style={styles.sheetClose}
                      onPress={() => setSelectedAppt(null)}
                    >
                      <Icon name="close" size={20} color={theme.colors.text} />
                    </TouchableOpacity>
                  </View>

                  {/* Details */}
                  <View style={styles.sheetBody}>
                    <Text style={styles.sheetSectionTitle}>
                      APPOINTMENT DETAILS
                    </Text>

                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Doctor</Text>
                      <Text style={styles.detailValue}>
                        {selectedAppt.doctorName || '—'}
                      </Text>
                    </View>

                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Type</Text>
                      {renderPill(selectedAppt.appointmentType || '—', '#B7791F')}
                    </View>

                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Visit</Text>
                      {renderPill(
                        selectedAppt.visitType || 'Normal',
                        theme.colors.textSecondary,
                      )}
                    </View>

                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Token</Text>
                      <Text style={styles.detailValue}>
                        {selectedAppt.tokenCount != null
                          ? `T${selectedAppt.tokenCount}`
                          : '—'}
                      </Text>
                    </View>

                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Status</Text>
                      {renderPill(
                        getStatusLabel(selectedAppt.status),
                        getStatusColor(selectedAppt.status),
                      )}
                    </View>

                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Arrival</Text>
                      {renderPill(
                        arrivalInfo(selectedAppt).label,
                        arrivalInfo(selectedAppt).color,
                      )}
                    </View>

                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Fee</Text>
                      <Text style={styles.detailValue}>
                        ₹{selectedAppt.doctorFee ?? selectedAppt.expenseAmount ?? 0}
                      </Text>
                    </View>
                  </View>

                  {/* Actions */}
                  <View style={styles.sheetActions}>
                    <TouchableOpacity
                      style={[
                        styles.sheetPrimaryBtn,
                        movingToOpd && styles.sheetPrimaryBtnDisabled,
                      ]}
                      activeOpacity={0.85}
                      disabled={movingToOpd}
                      onPress={handleMoveToOpd}
                    >
                      {movingToOpd ? (
                        <ActivityIndicator size="small" color={theme.colors.surface} />
                      ) : (
                        <Text style={styles.sheetPrimaryText}>Move to OPD</Text>
                      )}
                    </TouchableOpacity>
                    <View style={styles.sheetOutlineRow}>
                      <TouchableOpacity
                        style={[
                          styles.sheetOutlineBtn,
                          styles.sheetCompleteBtn,
                          statusUpdating != null && styles.sheetPrimaryBtnDisabled,
                        ]}
                        activeOpacity={0.85}
                        disabled={statusUpdating != null}
                        onPress={() => handleStatusUpdate('completed', 'Completed')}
                      >
                        {statusUpdating === 'completed' ? (
                          <ActivityIndicator size="small" color="#2E7D32" />
                        ) : (
                          <Text
                            style={[styles.sheetOutlineText, { color: '#2E7D32' }]}
                          >
                            Complete
                          </Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.sheetOutlineBtn,
                          styles.sheetAbsentBtn,
                          statusUpdating != null && styles.sheetPrimaryBtnDisabled,
                        ]}
                        activeOpacity={0.85}
                        disabled={statusUpdating != null}
                        onPress={() => handleStatusUpdate('absent', 'Absent')}
                      >
                        {statusUpdating === 'absent' ? (
                          <ActivityIndicator size="small" color="#C62828" />
                        ) : (
                          <Text
                            style={[styles.sheetOutlineText, { color: '#C62828' }]}
                          >
                            Absent
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                {/* All appointments for this patient — list scrolls independently */}
                <View style={styles.sheetAllAppts}>
                  <Text style={styles.sheetSectionTitle}>ALL APPOINTMENTS</Text>
                  {patientApptsLoading ? (
                    <ActivityIndicator
                      style={styles.sheetAllApptsLoader}
                      color={theme.colors.primary}
                    />
                  ) : sortedPatientAppointments.length === 0 ? (
                    <Text style={styles.sheetAllApptsEmpty}>
                      No other appointments found
                    </Text>
                  ) : (
                    <ScrollView
                      style={{ maxHeight: allApptsListHeight }}
                      contentContainerStyle={styles.sheetAllApptsScrollContent}
                      nestedScrollEnabled
                      showsVerticalScrollIndicator
                      keyboardShouldPersistTaps="handled"
                    >
                      {sortedPatientAppointments.map(appt => (
                        <View key={appt._id} style={styles.allApptRow}>
                          <View style={styles.allApptRowMain}>
                            <Text style={styles.allApptDate} numberOfLines={1}>
                              {formatApptListDate(appt.date, appt.time)}
                            </Text>
                            {appt.doctorName ? (
                              <Text
                                style={styles.allApptDoctor}
                                numberOfLines={1}
                              >
                                {appt.doctorName}
                              </Text>
                            ) : null}
                          </View>
                          <View style={styles.allApptPillWrap}>
                            {renderPill(
                              getStatusLabel(appt.status),
                              getStatusColor(appt.status),
                            )}
                          </View>
                        </View>
                      ))}
                    </ScrollView>
                  )}
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  weekStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
  },
  topToggleRow: {
    alignItems: 'center',
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
  },
  topToggle: {
    flexDirection: 'row',
    backgroundColor: '#EEF0F3',
    borderRadius: theme.borderRadius.lg,
    padding: 4,
  },
  topToggleBtn: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
  },
  topToggleBtnActive: {
    backgroundColor: theme.colors.surface,
    ...theme.shadows.sm,
  },
  topToggleText: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.textSecondary,
  },
  topToggleTextActive: {
    color: theme.colors.primary,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
  },
  todayNav: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 6,
    backgroundColor: theme.colors.surface,
  },
  todayNavBtn: {
    paddingHorizontal: theme.spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayNavLabelBtn: {
    minWidth: 72,
    alignItems: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  todayNavLabel: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.text,
  },
  datePickerBtn: {
    width: 40,
    height: 40,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    marginLeft: theme.spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
  },
  doctorSelectBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingLeft: theme.spacing.md,
    paddingRight: theme.spacing.xs,
    paddingVertical: 8,
    marginLeft: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
  },
  doctorSelectText: {
    flex: 1,
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
    marginRight: theme.spacing.xs,
  },
  dayChip: {
    flex: 1,
    marginHorizontal: 3,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.sm,
    minHeight: 60,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
  },
  dayChipToday: {
    borderColor: theme.colors.primary,
  },
  dayChipSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  dayChipWeekday: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  dayChipDate: {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
  },
  dayChipTextSelected: {
    color: theme.colors.surface,
  },
  gridHeader: {
    flexDirection: 'row',
    minHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: '#FAFAFA',
  },
  gridHeaderTokens: {
    width: GUTTER,
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
    paddingTop: theme.spacing.md,
    paddingLeft: theme.spacing.md,
  },
  gridHeaderText: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.textSecondary,
    letterSpacing: 0.5,
  },
  timelineDivider: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: GUTTER,
    width: 1,
    backgroundColor: theme.colors.border,
  },
  tokenListColumn: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
  },
  tokenRowEmpty: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    alignSelf: 'center',
    marginTop: theme.spacing.sm,
  },
  tokenChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderLeftWidth: 3,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 8,
    marginBottom: 6,
  },
  tokenChipName: {
    flex: 1,
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.text,
    marginRight: theme.spacing.sm,
  },
  tokenChipNo: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.primary,
  },
  queueScroll: {
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xxl,
  },
  monthContainer: {
    backgroundColor: theme.colors.surface,
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  monthNavTitle: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
  },
  weekdayLabelsRow: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  weekdayLabel: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.textSecondary,
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: theme.spacing.xs,
  },
  monthCell: {
    width: `${100 / 7}%`,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekNavBtn: {
    paddingHorizontal: theme.spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekDaysRow: {
    flex: 1,
    flexDirection: 'row',
  },
  weekDayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: theme.spacing.xs,
  },
  weekdayText: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  weekdayTextActive: {
    color: theme.colors.primary,
  },
  dayInner: {
    width: 36,
    height: 36,
    aspectRatio: 1,
    borderRadius: 18,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayToday: {
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
  },
  daySelected: {
    backgroundColor: theme.colors.primary,
  },
  dayText: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
  },
  dayTextActive: {
    fontWeight: theme.typography.fontWeights.bold,
  },
  dayDot: {
    position: 'absolute',
    bottom: 4,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: theme.colors.primary,
  },
  dayDotOnSelected: {
    backgroundColor: theme.colors.surface,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  dateLabel: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.text,
    marginRight: theme.spacing.sm,
  },
  segmentBar: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 3,
  },
  segmentBtn: {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borderRadius.xl,
  },
  segmentBtnActive: {
    backgroundColor: theme.colors.primary,
  },
  segmentText: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.textSecondary,
  },
  segmentTextActive: {
    color: theme.colors.surface,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  listHeaderText: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.text,
  },
  listHeaderCount: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.surface,
    backgroundColor: theme.colors.primary,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    textAlign: 'center',
    textAlignVertical: 'center',
    overflow: 'hidden',
    paddingHorizontal: 6,
    lineHeight: 22,
  },
  timelineScroll: {
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xxl,
  },
  emptyScroll: {
    flexGrow: 1,
  },
  sectionLabel: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: theme.spacing.md,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  untimedSection: {
    marginBottom: theme.spacing.sm,
  },
  untimedCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    overflow: 'hidden',
    ...theme.shadows.sm,
  },
  untimedAccent: {
    width: 4,
    alignSelf: 'stretch',
  },
  untimedContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.md,
  },
  untimedTitle: {
    flex: 1,
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.text,
    marginRight: theme.spacing.sm,
  },
  tokenBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${theme.colors.primary}15`,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.sm,
  },
  tokenText: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.primary,
    marginLeft: 3,
  },
  untimedDoctor: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  untimedMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  untimedMobile: {
    flex: 1,
    textAlign: 'right',
    fontSize: theme.typography.fontSizes.xs,
    color: theme.colors.textSecondary,
  },
  statusPill: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.sm,
    marginRight: theme.spacing.sm,
  },
  statusPillText: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.bold,
  },
  timeline: {
    position: 'relative',
    marginTop: theme.spacing.xs,
    borderLeftWidth: 1,
    borderLeftColor: theme.colors.border,
    marginLeft: GUTTER,
  },
  hourSlot: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  hourLabel: {
    position: 'absolute',
    left: -GUTTER,
    width: GUTTER - theme.spacing.sm,
    textAlign: 'right',
    top: 6,
    fontSize: theme.typography.fontSizes.xs,
    color: theme.colors.textSecondary,
  },
  hourEventsArea: {
    flex: 1,
    position: 'relative',
    marginLeft: theme.spacing.sm,
    marginRight: theme.spacing.md,
  },
  eventBlock: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 8,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  eventText: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.surface,
  },
  eventTime: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.surface,
  },
  eventName: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.surface,
  },
  eventDoctor: {
    fontSize: theme.typography.fontSizes.sm,
    opacity: 0.9,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.xxl,
  },
  emptyText: {
    marginTop: theme.spacing.sm,
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.textSecondary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  doctorModalContent: {
    width: '100%',
    maxHeight: '70%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    paddingBottom: theme.spacing.sm,
    ...theme.shadows.sm,
  },
  doctorModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  doctorModalTitle: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
  },
  doctorModalEmpty: {
    textAlign: 'center',
    color: theme.colors.textSecondary,
    paddingVertical: theme.spacing.lg,
  },
  doctorOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  doctorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: theme.spacing.sm,
  },
  doctorOptionIcon: {
    marginRight: theme.spacing.sm,
  },
  doctorOptionText: {
    flex: 1,
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    maxHeight: SHEET_MAX_HEIGHT,
    overflow: 'hidden',
    paddingBottom: theme.spacing.lg,
  },
  sheetTop: {
    flexShrink: 0,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  sheetAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.sm,
  },
  sheetHeaderCol: {
    justifyContent: 'center',
  },
  sheetHeaderColDivider: {
    width: 1,
    height: 36,
    backgroundColor: theme.colors.border,
    marginHorizontal: theme.spacing.md,
  },
  sheetHeaderLabel: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  sheetHeaderValue: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.text,
  },
  sheetStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4CAF50',
    marginLeft: 'auto',
  },
  sheetClose: {
    width: 32,
    height: 32,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: theme.spacing.sm,
  },
  sheetBody: {
    paddingHorizontal: theme.spacing.md,
  },
  sheetSectionTitle: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.textSecondary,
    letterSpacing: 0.5,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.xs,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.sm,
  },
  detailLabel: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.textSecondary,
  },
  detailValue: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.text,
  },
  pill: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.xl,
    alignItems: 'center',
  },
  pillText: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.bold,
  },
  sheetActions: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    marginTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  sheetPrimaryBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  sheetPrimaryBtnDisabled: {
    opacity: 0.6,
  },
  sheetPrimaryText: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.surface,
  },
  sheetOutlineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sheetOutlineBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
  },
  sheetCompleteBtn: {
    borderColor: '#2E7D32',
    marginRight: theme.spacing.sm,
  },
  sheetAbsentBtn: {
    borderColor: '#C62828',
    marginLeft: theme.spacing.sm,
  },
  sheetOutlineText: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.bold,
  },
  sheetAllAppts: {
    flexShrink: 1,
    minHeight: 0,
    paddingHorizontal: theme.spacing.md,
  },
  sheetAllApptsScrollContent: {
    paddingBottom: theme.spacing.xs,
  },
  sheetAllApptsLoader: {
    marginVertical: theme.spacing.lg,
  },
  sheetAllApptsEmpty: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
  },
  allApptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    marginTop: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
  },
  allApptRowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: theme.spacing.sm,
    minWidth: 0,
  },
  allApptDate: {
    flexShrink: 1,
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
    marginRight: theme.spacing.sm,
  },
  allApptDoctor: {
    flex: 1,
    flexShrink: 1,
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.textSecondary,
  },
  allApptPillWrap: {
    flexShrink: 0,
  },
});

export default CalendarScreen;
