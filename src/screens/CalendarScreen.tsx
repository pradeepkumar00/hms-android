import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  Alert,
  TextInput,
  FlatList,
  Linking,
  StatusBar,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DatePicker from 'react-native-date-picker';
import { useAppSelector, selectAuthToken } from '../store';
import { theme } from '../constants/theme';
import { Header, ModalBackdrop } from '../components';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Appointment, Patient } from '../types';

interface CalendarScreenProps {
  navigation: any;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const GUTTER = 80; // px reserved for the TOKENS label column on the left
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

// "11:00 am" style for the appointment list
const formatListTime = (time?: string | null): string => {
  const mins = parseTime(time);
  if (mins == null) return time?.trim() || '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const period = h < 12 ? 'am' : 'pm';
  let displayH = h % 12;
  if (displayH === 0) displayH = 12;
  return `${displayH}:${String(m).padStart(2, '0')} ${period}`;
};

const getAppointmentSubtitle = (appt: Appointment): string => {
  if (appt.doctorName?.trim()) return appt.doctorName.trim();
  if (appt.visitType?.trim()) {
    const v = appt.visitType.trim();
    return v.charAt(0).toUpperCase() + v.slice(1).toLowerCase();
  }
  if (appt.appointmentType?.trim()) {
    const t = appt.appointmentType.trim();
    return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
  }
  return 'Consultation';
};

// "03 Jun 2026" for appointment cards
const formatApptCardDate = (date?: string) => {
  const key = appointmentKey(date);
  if (!key) return date || '—';
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

interface AppointmentTreatmentItem {
  treatmentDesc: string;
  date?: string;
}

const extractAppointmentTreatments = (appt: any): AppointmentTreatmentItem[] => {
  const rawLists = [
    appt.details,
    appt.treatments,
    appt.treatmentDetails,
    appt.followupDetails,
  ].filter(Array.isArray);

  const raw = rawLists.find(list => list.length > 0) ?? [];
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item: any) => ({
      treatmentDesc: String(
        item?.treatmentDesc ??
          item?.treatmentName ??
          item?.name ??
          item?.title ??
          '',
      ).trim(),
      date: item?.date ?? appt.date,
    }))
    .filter(item => item.treatmentDesc.length > 0);
};

const getAppointmentReason = (appt: Appointment): string => {
  if (appt.reason?.trim()) return appt.reason.trim();

  const rawLists = [
    appt.details,
    appt.treatments,
    (appt as any).treatmentDetails,
    (appt as any).followupDetails,
  ].filter(Array.isArray);

  for (const list of rawLists) {
    for (const item of list) {
      const reason = String(item?.reason ?? '').trim();
      if (reason) return reason;
    }
  }

  return '—';
};

const getStatusBadgeColors = (status?: string) => {
  switch ((status || '').toLowerCase()) {
    case 'waiting':
      return { bg: '#FFF8E1', text: '#B7791F' };
    case 'confirmed':
      return { bg: '#E3F2FD', text: '#1565C0' };
    case 'arrived':
      return { bg: '#F3E5F5', text: '#7B1FA2' };
    case 'completed':
      return { bg: '#E8F5E9', text: '#2E7D32' };
    case 'absent':
      return { bg: '#FFEBEE', text: '#C62828' };
    case 'cancelled':
    case 'canceled':
      return { bg: '#FFEBEE', text: '#C62828' };
    default:
      return { bg: '#F5F5F5', text: theme.colors.textSecondary };
  }
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
  // Appointment shown in the details modal (null = closed)
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  // Whether the "Move to OPD" request is in flight
  const [movingToOpd, setMovingToOpd] = useState(false);
  // Which status update is in flight (e.g. 'completed'), null when idle
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null);
  // Patient history shown in the details modal
  const [patientAppointments, setPatientAppointments] = useState<Appointment[]>(
    [],
  );
  const [patientApptsLoading, setPatientApptsLoading] = useState(false);
  // Patient search modal
  const [patientSearchOpen, setPatientSearchOpen] = useState(false);
  const [patientSearchQuery, setPatientSearchQuery] = useState('');
  const [debouncedPatientSearch, setDebouncedPatientSearch] = useState('');
  const [searchPatients, setSearchPatients] = useState<Patient[]>([]);
  const [searchPatientsLoading, setSearchPatientsLoading] = useState(false);
  const [movingSearchPatientId, setMovingSearchPatientId] = useState<
    string | null
  >(null);

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

  useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedPatientSearch(patientSearchQuery.trim()),
      400,
    );
    return () => clearTimeout(timer);
  }, [patientSearchQuery]);

  const normalizeSearchPatient = (raw: any): Patient => {
    const source = raw?.user ?? raw?.patient ?? raw;
    return {
      _id: source._id || source.id || raw._id || raw.id,
      id: source.id || raw.id,
      name:
        source.name ||
        source.patientName ||
        source.fullName ||
        'Unknown',
      mobileNo:
        source.mobileNo ||
        source.mobile ||
        source.phone ||
        source.phoneNo ||
        '',
      uhid: source.uhid ?? source.UHID ?? raw.uhid ?? null,
    };
  };

  const fetchSearchPatients = useCallback(async () => {
    if (!token || !patientSearchOpen) return;

    setSearchPatientsLoading(true);
    try {
      const realAuthService = (await import('../services/realAuthService'))
        .default;
      const result = await realAuthService.fetchPatients(token, {
        page: 0,
        limit: 20,
        search: debouncedPatientSearch || undefined,
      });
      setSearchPatients(result.patients.map(normalizeSearchPatient));
    } catch (err) {
      console.error('Patient search failed:', err);
      setSearchPatients([]);
    } finally {
      setSearchPatientsLoading(false);
    }
  }, [token, patientSearchOpen, debouncedPatientSearch]);

  useEffect(() => {
    if (patientSearchOpen) {
      fetchSearchPatients();
    }
  }, [patientSearchOpen, fetchSearchPatients]);

  const handlePatientCall = (mobileNo?: string) => {
    const phone = mobileNo?.trim();
    if (!phone) {
      Alert.alert('Call', 'No mobile number available for this patient.');
      return;
    }
    Linking.openURL(`tel:${phone}`).catch(() => {
      Alert.alert('Call', 'Unable to open the phone dialer.');
    });
  };

  const openPatientSearch = () => {
    setPatientSearchQuery('');
    setDebouncedPatientSearch('');
    setPatientSearchOpen(true);
  };

  const closePatientSearch = () => {
    setPatientSearchOpen(false);
    setPatientSearchQuery('');
    setDebouncedPatientSearch('');
    setSearchPatients([]);
    setMovingSearchPatientId(null);
  };

  const handleSearchPatientMoveToOpd = async (patient: Patient) => {
    const patientId = patient._id || patient.id;
    if (!patientId || !token || movingSearchPatientId) return;

    setMovingSearchPatientId(patientId);
    try {
      const realAuthService = (await import('../services/realAuthService'))
        .default;
      const fullPatient = await realAuthService.moveToOpd(patientId, token);
      const resolvedPatient = fullPatient || patient;
      const appointment: Appointment = {
        _id: `calendar-search-${patientId}`,
        patientId,
        patientName: resolvedPatient.name || patient.name,
        mobileNo: resolvedPatient.mobileNo || patient.mobileNo,
        uhid: resolvedPatient.uhid ?? patient.uhid,
        date: new Date().toISOString().slice(0, 10),
      };

      closePatientSearch();
      navigation.navigate('OPD', {
        appointment,
        patient: resolvedPatient,
      });
    } catch (err) {
      console.error('Move to OPD failed:', err);
      Alert.alert(
        'Error',
        'Failed to move the patient to OPD. Please try again.',
      );
    } finally {
      setMovingSearchPatientId(null);
    }
  };

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
    return [...patientAppointments].sort((a, b) => {
      const dateCmp = (b.date || '').localeCompare(a.date || '');
      if (dateCmp !== 0) return dateCmp;
      return (parseTime(b.time) ?? 0) - (parseTime(a.time) ?? 0);
    });
  }, [patientAppointments]);

  const renderAllAppointmentCard = (appt: Appointment) => {
    const statusBadge = getStatusBadgeColors(appt.status);
    const treatments = extractAppointmentTreatments(appt);

    return (
      <View key={appt._id} style={styles.allApptCard}>
        <View style={styles.allApptCardHeader}>
          <View style={styles.allApptCardDateRow}>
            <Text style={styles.allApptCardDate}>
              {formatApptCardDate(appt.date)}
            </Text>
            {appt.time ? (
              <Text style={styles.allApptCardTime}> {appt.time}</Text>
            ) : null}
          </View>
          <View
            style={[
              styles.allApptStatusBadge,
              { backgroundColor: statusBadge.bg },
            ]}
          >
            <Text
              style={[styles.allApptStatusText, { color: statusBadge.text }]}
            >
              {getStatusLabel(appt.status)}
            </Text>
          </View>
        </View>

        <Text style={styles.allApptDoctorLabel}>DOCTOR</Text>
        <Text style={styles.allApptDoctorName} numberOfLines={1}>
          {appt.doctorName || '—'}
        </Text>

        {treatments.map((treatment, index) => (
          <View
            key={`${appt._id}-treatment-${index}`}
            style={styles.allApptTreatmentBox}
          >
            <Text style={styles.allApptTreatmentName} numberOfLines={2}>
              {treatment.treatmentDesc}
            </Text>
            <Text style={styles.allApptTreatmentDate}>
              {formatApptCardDate(treatment.date)}
            </Text>
          </View>
        ))}
      </View>
    );
  };

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
  const { timedAppointments, untimedAppointments } = useMemo(() => {
    let dayAppointments = appointmentsByDate[selectedKey] || [];
    if (selectedDoctorId) {
      dayAppointments = dayAppointments.filter(
        appt => (appt.doctorId || appt.doctorName) === selectedDoctorId,
      );
    }

    const timed: Appointment[] = [];
    const untimed: Appointment[] = [];

    dayAppointments.forEach(appt => {
      if (parseTime(appt.time) == null) {
        untimed.push(appt);
      } else {
        timed.push(appt);
      }
    });

    timed.sort((a, b) => {
      const aTime = parseTime(a.time)!;
      const bTime = parseTime(b.time)!;
      if (aTime !== bTime) return aTime - bTime;
      return (a.patientName || '').localeCompare(b.patientName || '');
    });

    untimed.sort((a, b) => (a.tokenCount ?? 0) - (b.tokenCount ?? 0));

    return { timedAppointments: timed, untimedAppointments: untimed };
  }, [appointmentsByDate, selectedKey, selectedDoctorId]);

  // The currently selected doctor option (null = all doctors)
  const selectedDoctor = useMemo(
    () => doctorOptions.find(d => d.id === selectedDoctorId) || null,
    [doctorOptions, selectedDoctorId],
  );

  const renderAppointmentRow = (appt: Appointment) => {
    const dotColor = colorForAppt(appt);
    const subtitle = getAppointmentSubtitle(appt);

    return (
      <TouchableOpacity
        key={appt._id}
        activeOpacity={0.7}
        onPress={() => setSelectedAppt(appt)}
        style={styles.apptRow}
      >
        <Text style={styles.apptRowTime}>{formatListTime(appt.time)}</Text>
        <View style={styles.apptRowMain}>
          <Text style={styles.apptRowName} numberOfLines={1}>
            {appt.patientName || 'Unknown'}
          </Text>
          <View style={styles.apptRowMeta}>
            <View
              style={[styles.apptRowDot, { backgroundColor: dotColor }]}
            />
            <Text style={styles.apptRowSubtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

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
        showNotificationIcon={false}
        showSearchIcon
        onSearchPress={openPatientSearch}
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
        <ScrollView
          style={styles.apptListScroll}
          contentContainerStyle={[
            styles.apptListContent,
            timedAppointments.length === 0 &&
              untimedAppointments.length === 0 &&
              styles.apptListContentEmpty,
          ]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          <View style={styles.gridHeader}>
            <View style={styles.gridHeaderTokens}>
              <Text style={styles.gridHeaderText}>TOKENS</Text>
            </View>
            <View style={styles.tokenListColumn}>
              {untimedAppointments.length > 0 ? (
                untimedAppointments.map(renderTokenChip)
              ) : (
                <Text style={styles.tokenRowEmpty}>No tokens</Text>
              )}
            </View>
          </View>

          {timedAppointments.length === 0 &&
          untimedAppointments.length === 0 ? (
            <View style={styles.centerBox}>
              <Icon
                name="event-busy"
                size={48}
                color={theme.colors.disabled}
              />
              <Text style={styles.emptyText}>No appointments for this day</Text>
            </View>
          ) : (
            timedAppointments.map(renderAppointmentRow)
          )}
        </ScrollView>
      )}

      {/* Doctor filter dropdown for the token section */}
      <ModalBackdrop
        visible={doctorModalOpen}
        onClose={() => setDoctorModalOpen(false)}
        animationType="fade"
        align="center"
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
      </ModalBackdrop>

      {/* Patient search modal */}
      <ModalBackdrop
        visible={patientSearchOpen}
        onClose={closePatientSearch}
        animationType="slide"
        align="full"
        dismissOnBackdropPress={false}
      >
        <View style={styles.patientSearchModal}>
          <StatusBar
            barStyle="light-content"
            backgroundColor={theme.colors.primary}
            translucent={false}
          />
          <SafeAreaView edges={['top']} style={styles.patientSearchHeaderSafeArea}>
            <View style={styles.patientSearchHeader}>
              <Text style={styles.patientSearchHeaderTitle}>Search Patients</Text>
              <TouchableOpacity
                onPress={closePatientSearch}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Icon name="close" size={24} color={theme.colors.textInverse} />
              </TouchableOpacity>
            </View>
          </SafeAreaView>

          <SafeAreaView edges={['bottom']} style={styles.patientSearchContentSafeArea}>
            <View style={styles.patientSearchBody}>
            <View style={styles.patientSearchInputRow}>
              <Icon name="search" size={20} color={theme.colors.textSecondary} />
              <TextInput
                style={styles.patientSearchInput}
                placeholder="Search by name, number or UHID/PID"
                placeholderTextColor={theme.colors.placeholder}
                value={patientSearchQuery}
                onChangeText={setPatientSearchQuery}
                autoFocus
              />
              {patientSearchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setPatientSearchQuery('')}>
                  <Icon name="close" size={20} color={theme.colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.patientSearchListSection}>
              <View style={styles.patientSearchTableHeader}>
                <Text style={[styles.patientSearchHeaderCell, styles.patientSearchNameColHeader]}>
                  NAME
                </Text>
                <Text style={[styles.patientSearchHeaderCell, styles.patientSearchMobileColHeader]}>
                  MOBILE
                </Text>
                <Text style={[styles.patientSearchHeaderCell, styles.patientSearchActionColHeader]}>
                  CALL
                </Text>
              </View>

              {searchPatientsLoading ? (
                <View style={styles.patientSearchLoading}>
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                </View>
              ) : (
                <FlatList
                  data={searchPatients}
                  keyExtractor={(item, index) =>
                    item._id || item.id || `patient-${index}`
                  }
                  keyboardShouldPersistTaps="handled"
                  style={styles.patientSearchList}
                  contentContainerStyle={styles.patientSearchListContent}
                  ListEmptyComponent={
                    <View style={styles.patientSearchEmpty}>
                      <Icon
                        name="people-outline"
                        size={48}
                        color={theme.colors.disabled}
                      />
                      <Text style={styles.patientSearchEmptyText}>
                        {patientSearchQuery.trim()
                          ? `No patients match "${patientSearchQuery}"`
                          : 'No patients found'}
                      </Text>
                    </View>
                  }
                  renderItem={({ item }) => {
                    const patientId = item._id || item.id || '';
                    const isMoving = movingSearchPatientId === patientId;

                    return (
                    <View style={styles.patientSearchRow}>
                      <TouchableOpacity
                        style={styles.patientSearchInfoPressable}
                        activeOpacity={0.7}
                        disabled={isMoving}
                        onPress={() => handleSearchPatientMoveToOpd(item)}
                      >
                        <View style={styles.patientSearchNameCell}>
                          <View style={styles.patientSearchAvatar}>
                            {isMoving ? (
                              <ActivityIndicator
                                size="small"
                                color={theme.colors.primary}
                              />
                            ) : (
                              <Icon
                                name="person"
                                size={20}
                                color={theme.colors.primary}
                              />
                            )}
                          </View>
                          <Text style={styles.patientSearchName} numberOfLines={2}>
                            {item.name}
                          </Text>
                        </View>
                        <Text
                          style={[styles.patientSearchMobile, styles.patientSearchMobileCell]}
                          numberOfLines={1}
                        >
                          {item.mobileNo || '—'}
                        </Text>
                      </TouchableOpacity>
                      <View style={styles.patientSearchActionCell}>
                        <TouchableOpacity
                          style={[
                            styles.patientSearchCallBtn,
                            !item.mobileNo && styles.patientSearchCallBtnDisabled,
                          ]}
                          onPress={() => handlePatientCall(item.mobileNo)}
                          disabled={!item.mobileNo}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Icon
                            name="phone"
                            size={18}
                            color={
                              item.mobileNo
                                ? theme.colors.success
                                : theme.colors.disabled
                            }
                          />
                        </TouchableOpacity>
                      </View>
                    </View>
                    );
                  }}
                />
              )}
            </View>
          </View>
          </SafeAreaView>
        </View>
      </ModalBackdrop>

      {/* Appointment details modal */}
      <ModalBackdrop
        visible={selectedAppt != null}
        onClose={() => setSelectedAppt(null)}
        animationType="slide"
        align="full"
        dismissOnBackdropPress={false}
      >
        <View style={styles.apptDetailsModal}>
          <StatusBar
            barStyle="light-content"
            backgroundColor={theme.colors.primary}
            translucent={false}
          />
          <SafeAreaView edges={['top']} style={styles.apptDetailsHeaderSafeArea}>
            <View style={styles.apptDetailsHeader}>
              <Text style={styles.apptDetailsHeaderTitle}>Appointment Details</Text>
              <TouchableOpacity
                onPress={() => setSelectedAppt(null)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Icon name="close" size={24} color={theme.colors.textInverse} />
              </TouchableOpacity>
            </View>
          </SafeAreaView>

          <SafeAreaView edges={['bottom']} style={styles.apptDetailsContentSafeArea}>
            {selectedAppt && (
              <ScrollView
                style={styles.apptDetailsScroll}
                contentContainerStyle={styles.apptDetailsScrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
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
                </View>

                <View style={styles.sheetBody}>
                  <Text style={styles.sheetSectionTitle}>APPOINTMENT DETAILS</Text>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Doctor</Text>
                    <Text style={styles.detailValue}>
                      {selectedAppt.doctorName || '—'}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Treatment</Text>
                    <Text style={styles.detailValue} numberOfLines={3}>
                      {getAppointmentReason(selectedAppt)}
                    </Text>
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

                <View style={styles.sheetAllAppts}>
                  <Text style={styles.sheetSectionTitle}>ALL APPOINTMENTS</Text>
                  {patientApptsLoading ? (
                    <ActivityIndicator
                      style={styles.sheetAllApptsLoader}
                      color={theme.colors.primary}
                    />
                  ) : sortedPatientAppointments.length === 0 ? (
                    <Text style={styles.sheetAllApptsEmpty}>
                      No appointments found
                    </Text>
                  ) : (
                    sortedPatientAppointments.map(renderAllAppointmentCard)
                  )}
                </View>
              </ScrollView>
            )}
          </SafeAreaView>
        </View>
      </ModalBackdrop>
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
  apptListScroll: {
    flex: 1,
    backgroundColor: theme.colors.surface,
  },
  apptListContent: {
    paddingBottom: theme.spacing.xxl,
  },
  apptListContentEmpty: {
    flexGrow: 1,
  },
  apptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  apptRowTime: {
    width: 72,
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.medium,
    color: theme.colors.text,
  },
  apptRowMain: {
    flex: 1,
    minWidth: 0,
    paddingRight: theme.spacing.sm,
  },
  apptRowName: {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.text,
    marginBottom: 4,
  },
  apptRowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  apptRowDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: theme.spacing.sm,
  },
  apptRowSubtitle: {
    flex: 1,
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
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
  patientSearchModal: {
    flex: 1,
    width: '100%',
    backgroundColor: theme.colors.background,
  },
  patientSearchHeaderSafeArea: {
    backgroundColor: theme.colors.primary,
  },
  patientSearchContentSafeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  patientSearchHeader: {
    height: theme.headerHeight,
    backgroundColor: theme.colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    ...theme.shadows.md,
  },
  patientSearchHeaderTitle: {
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.textInverse,
  },
  patientSearchBody: {
    flex: 1,
    paddingTop: theme.spacing.sm,
  },
  patientSearchInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    ...theme.shadows.sm,
  },
  patientSearchInput: {
    flex: 1,
    marginLeft: theme.spacing.sm,
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
    paddingVertical: 0,
  },
  patientSearchListSection: {
    flex: 1,
    marginHorizontal: theme.spacing.md,
  },
  patientSearchTableHeader: {
    flexDirection: 'row',
    backgroundColor: theme.colors.secondary,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderTopLeftRadius: theme.borderRadius.md,
    borderTopRightRadius: theme.borderRadius.md,
  },
  patientSearchHeaderCell: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.textInverse,
    letterSpacing: 0.5,
  },
  patientSearchNameColHeader: {
    flex: 2,
    paddingRight: theme.spacing.sm,
  },
  patientSearchMobileColHeader: {
    flex: 1.2,
    paddingRight: theme.spacing.sm,
  },
  patientSearchActionColHeader: {
    width: 48,
    textAlign: 'center',
  },
  patientSearchInfoPressable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  patientSearchNameCell: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: theme.spacing.sm,
  },
  patientSearchMobileCell: {
    flex: 1.2,
    paddingRight: theme.spacing.sm,
  },
  patientSearchActionCell: {
    width: 48,
    alignItems: 'center',
  },
  patientSearchList: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderBottomLeftRadius: theme.borderRadius.md,
    borderBottomRightRadius: theme.borderRadius.md,
    ...theme.shadows.sm,
  },
  patientSearchListContent: {
    flexGrow: 1,
    paddingBottom: theme.spacing.md,
  },
  patientSearchLoading: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderBottomLeftRadius: theme.borderRadius.md,
    borderBottomRightRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.xxl,
    alignItems: 'center',
    ...theme.shadows.sm,
  },
  patientSearchEmpty: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xxl,
    paddingHorizontal: theme.spacing.lg,
  },
  patientSearchEmptyText: {
    marginTop: theme.spacing.md,
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  patientSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  patientSearchAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EEF1FE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.sm,
  },
  patientSearchName: {
    flex: 1,
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.medium,
    color: theme.colors.text,
  },
  patientSearchMobile: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text,
  },
  patientSearchCallBtn: {
    width: 32,
    height: 32,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  patientSearchCallBtnDisabled: {
    opacity: 0.5,
  },
  apptDetailsModal: {
    flex: 1,
    width: '100%',
    backgroundColor: theme.colors.background,
  },
  apptDetailsHeaderSafeArea: {
    backgroundColor: theme.colors.primary,
  },
  apptDetailsContentSafeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  apptDetailsHeader: {
    height: theme.headerHeight,
    backgroundColor: theme.colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    ...theme.shadows.md,
  },
  apptDetailsHeaderTitle: {
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.textInverse,
  },
  apptDetailsScroll: {
    flex: 1,
  },
  apptDetailsScrollContent: {
    paddingBottom: theme.spacing.lg,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadows.sm,
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
    paddingTop: theme.spacing.sm,
    marginTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  sheetPrimaryBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.sm,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  sheetPrimaryBtnDisabled: {
    opacity: 0.6,
  },
  sheetPrimaryText: {
    fontSize: theme.typography.fontSizes.sm,
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
    borderRadius: theme.borderRadius.sm,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
  },
  sheetCompleteBtn: {
    borderColor: '#2E7D32',
    marginRight: theme.spacing.xs,
  },
  sheetAbsentBtn: {
    borderColor: '#C62828',
    marginLeft: theme.spacing.xs,
  },
  sheetOutlineText: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.bold,
  },
  sheetAllAppts: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
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
  allApptCard: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    marginTop: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
  },
  allApptCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
  allApptCardDateRow: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginRight: theme.spacing.sm,
  },
  allApptCardDate: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
  },
  allApptCardTime: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.textSecondary,
  },
  allApptStatusBadge: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.xl,
  },
  allApptStatusText: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.bold,
  },
  allApptDoctorLabel: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  allApptDoctorName: {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  allApptTreatmentBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  allApptTreatmentName: {
    flex: 1,
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: '#7E57C2',
    marginRight: theme.spacing.sm,
  },
  allApptTreatmentDate: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
  },
});

export default CalendarScreen;
