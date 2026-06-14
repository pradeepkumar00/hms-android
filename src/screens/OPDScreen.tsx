import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Alert,
  Modal,
  Image,
  Dimensions,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Pdf from 'react-native-pdf';
import DatePicker from 'react-native-date-picker';
import { launchCamera, CameraOptions } from 'react-native-image-picker';
import {
  pick,
  errorCodes,
  isErrorWithCode,
} from '@react-native-documents/picker';
import { useAppSelector, selectAuthToken } from '../store';
import { theme } from '../constants/theme';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Appointment } from '../types';

interface OPDScreenProps {
  navigation: any;
  route: { params?: { appointment?: Appointment; patient?: any } };
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Categories requested when loading the prescription configuration
const PRESCRIPTION_CATEGORIES =
  'DENTAL,EYE,CARDIOLOGY,DERMATOLOGY,ENT,ORTHOPEDICS,PEDIATRICS,GYNECOLOGY,NEUROLOGY,PSYCHIATRY,GENERAL_MEDICINE,PULMONOLOGY,GASTROENTEROLOGY,UROLOGY';

// A doctor record from GET /users?type=doctor
interface Doctor {
  _id: string;
  name: string;
  doctorCode?: string | null;
  isSlot?: boolean;
  color?: string | null;
}

// A bookable slot from GET /slot
interface Slot {
  _id: string;
  startTime: string;
  endTime?: string;
  duration?: number;
  isDisable?: boolean;
  tokenCount?: number;
}

// YYYY-MM-DD in local time (the format the slot/booking APIs expect).
const toApiDate = (d: Date) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

// DD-MM-YYYY (matches the web app's history format)
const formatDate = (value?: string) => {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()}`;
};

// e.g. "10:30 PM"
const formatTime = (value?: string) => {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

// "Today" / "Yesterday" / "DD-MM-YYYY"
const dateGroupLabel = (value?: string) => {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  const startOf = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const today = startOf(new Date());
  const that = startOf(d);
  const dayMs = 86400000;
  if (that === today) return 'Today';
  if (that === today - dayMs) return 'Yesterday';
  return formatDate(value);
};

// Show the tail of long file names: "…A7E5DE4B0.jpeg"
const shortName = (n?: string) => {
  if (!n) return '';
  return n.length > 14 ? `…${n.slice(-14)}` : n;
};

interface HistoryItem {
  id: string;
  kind: 'upload' | 'lab' | 'appointment';
  createdAt?: string;
  category?: string;
  mimeType?: string;
  fileName?: string;
  filePath?: string;
  reportName?: string;
  uploadedBy?: string;
  appointmentDate?: string;
  appointmentTime?: string | null;
  slot?: number | null;
  visitType?: string;
  doctorName?: string;
  status?: string;
  sortAt?: number;
}

const parseApptTime = (time?: string | null): number | null => {
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

const appointmentSortAt = (appt: Appointment): number => {
  if (!appt.date) return 0;
  const [y, m, d] = appt.date.split('-').map(Number);
  if (!y || !m || !d) return new Date(appt.date).getTime() || 0;
  const minutes = parseApptTime(appt.time) ?? 0;
  return new Date(y, m - 1, d, Math.floor(minutes / 60), minutes % 60).getTime();
};

// DD/MM/YYYY for appointment cards (matches the web OPD timeline)
const formatApptDate = (value?: string) => {
  if (!value) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-');
    return `${d}/${m}/${y}`;
  }
  return formatDate(value);
};

const formatVisitType = (value?: string) => {
  if (!value) return '—';
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
};

const getApptStatusColor = (status?: string) => {
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

const getApptStatusLabel = (status?: string) => {
  if (!status) return 'Unknown';
  return status.charAt(0).toUpperCase() + status.slice(1);
};

const itemGroupLabel = (item: HistoryItem) => {
  if (item.kind === 'appointment' && item.appointmentDate) {
    return dateGroupLabel(`${item.appointmentDate}T12:00:00`);
  }
  return dateGroupLabel(item.createdAt);
};

const itemSortAt = (item: HistoryItem) => {
  if (item.sortAt != null) return item.sortAt;
  return new Date(item.createdAt || 0).getTime();
};

const kindOrder = (kind: HistoryItem['kind']) => {
  switch (kind) {
    case 'upload':
      return 0;
    case 'lab':
      return 1;
    case 'appointment':
      return 2;
    default:
      return 3;
  }
};

// Prescriptions/labs first, then appointments; newest first within each type.
const compareHistoryItems = (a: HistoryItem, b: HistoryItem) => {
  const kindDiff = kindOrder(a.kind) - kindOrder(b.kind);
  if (kindDiff !== 0) return kindDiff;
  return itemSortAt(b) - itemSortAt(a);
};

// Flatten prescriptions, labs, and appointments into a date-sorted timeline.
const buildHistorySections = (
  history: any,
  appointments: Appointment[] = [],
): HistorySection[] => {
  const uploads: HistoryItem[] = (history?.prescriptionUpload || []).map(
    (u: any) => ({
      id: u._id,
      kind: 'upload' as const,
      createdAt: u.createdAt,
      category: u.category,
      mimeType: u.mimeType,
      fileName: u.originalName || u.fileName,
      filePath: u.filePath,
      uploadedBy: u.uploadedBy,
    }),
  );

  const labs: HistoryItem[] = (history?.labreport || []).map((l: any) => ({
    id: l._id,
    kind: 'lab' as const,
    createdAt: l.createdAt,
    reportName: l.name,
    uploadedBy: l.createdByName,
  }));

  const appts: HistoryItem[] = appointments.map(appt => ({
    id: appt._id,
    kind: 'appointment' as const,
    createdAt: appt.date ? `${appt.date}T12:00:00` : undefined,
    appointmentDate: appt.date,
    appointmentTime: appt.time,
    slot: appt.tokenCount,
    visitType: appt.visitType,
    doctorName: appt.doctorName,
    status: appt.status,
    sortAt: appointmentSortAt(appt),
  }));

  const all = [...uploads, ...labs, ...appts];

  const byLabel = new Map<string, HistoryItem[]>();
  for (const item of all) {
    const label = itemGroupLabel(item);
    if (!label) continue;
    const group = byLabel.get(label) || [];
    group.push(item);
    byLabel.set(label, group);
  }

  return Array.from(byLabel.entries())
    .map(([label, items]) => ({
      label,
      items: [...items].sort(compareHistoryItems),
      sectionSortAt: Math.max(...items.map(itemSortAt), 0),
    }))
    .sort((a, b) => b.sectionSortAt - a.sectionSortAt)
    .map(({ label, items }) => ({ label, items }));
};

interface HistorySection {
  label: string;
  items: HistoryItem[];
}

const OPDScreen: React.FC<OPDScreenProps> = ({ navigation, route }) => {
  const token = useAppSelector(selectAuthToken);
  const appointment = route.params?.appointment;
  const patient = route.params?.patient;
  const patientId = appointment?.patientId || patient?._id || patient?.id;

  const [history, setHistory] = useState<any>(null);
  const [patientAppointments, setPatientAppointments] = useState<Appointment[]>(
    [],
  );
  const [, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{
    name: string;
    uri: string;
    type: string;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  // Prescription category for the file being uploaded.
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  // Index of the currently open file within `openableItems` (null = closed).
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  // Shared cache of upload _id -> signed URL (used by thumbnails and viewer).
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);

  // ── Book Follow-up modal ──────────────────────────────────────────────────
  // The doctor is chosen from a dropdown, defaulting to the OPD visit's doctor
  // (taken from the screen props).
  const [showFollowupModal, setShowFollowupModal] = useState(false);
  const [followupDate, setFollowupDate] = useState<Date | null>(null);
  const [showFollowupDatePicker, setShowFollowupDatePicker] = useState(false);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [doctorsLoading, setDoctorsLoading] = useState(false);
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [doctorDropdownOpen, setDoctorDropdownOpen] = useState(false);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [slotPickerOpen, setSlotPickerOpen] = useState(false);
  const [booking, setBooking] = useState(false);

  const historySections = useMemo(
    () => buildHistorySections(history, patientAppointments),
    [history, patientAppointments],
  );

  // All openable upload files (images + PDFs) in display order — the set the
  // viewer's bottom strip pages through.
  const openableItems = useMemo(
    () =>
      historySections
        .flatMap(s => s.items)
        .filter(i => i.kind === 'upload' && i.filePath),
    [historySections],
  );

  // Fetch signed URLs for image uploads so their thumbnails show the image.
  useEffect(() => {
    if (!token || !patientId || !history) return;
    const images = (history.prescriptionUpload || []).filter(
      (u: any) => (u.mimeType || '').startsWith('image/') && u.filePath,
    );
    if (images.length === 0) return;

    let active = true;
    (async () => {
      const realAuthService = (await import('../services/realAuthService'))
        .default;
      const entries = await Promise.all(
        images.map(async (u: any) => {
          try {
            const url = await realAuthService.getPatientFileSignedUrl(
              u.filePath,
              patientId,
              token,
            );
            return [u._id, url] as const;
          } catch {
            return null;
          }
        }),
      );
      if (!active) return;
      const map: Record<string, string> = {};
      for (const e of entries) if (e) map[e[0]] = e[1];
      setSignedUrls(prev => ({ ...prev, ...map }));
    })();

    return () => {
      active = false;
    };
  }, [history, token, patientId]);

  // Resolve (and cache) the signed URL for an openable item.
  const resolveSignedUrl = useCallback(
    async (item: HistoryItem): Promise<string | null> => {
      if (!item.filePath || !token || !patientId) return null;
      if (signedUrls[item.id]) return signedUrls[item.id];
      try {
        const realAuthService = (await import('../services/realAuthService'))
          .default;
        const url = await realAuthService.getPatientFileSignedUrl(
          item.filePath,
          patientId,
          token,
        );
        setSignedUrls(prev => ({ ...prev, [item.id]: url }));
        return url;
      } catch (error) {
        console.error('Failed to resolve signed URL:', error);
        return null;
      }
    },
    [signedUrls, token, patientId],
  );

  // When the viewer opens or pages to a new item, make sure its URL is loaded.
  useEffect(() => {
    if (viewerIndex == null) return;
    const item = openableItems[viewerIndex];
    if (item && !signedUrls[item.id]) {
      resolveSignedUrl(item);
    }
  }, [viewerIndex, openableItems, signedUrls, resolveSignedUrl]);

  // Patient header values (prefer the fetched patient record, fall back to appt)
  const name = patient?.name || appointment?.patientName || 'Unknown';
  const mobile = patient?.mobileNo || appointment?.mobileNo || '—';
  const uhid = patient?.uhid || appointment?.uhid || '—';
  const genderAge =
    [
      patient?.gender,
      patient?.age != null ? `${patient.age} Years` : null,
    ]
      .filter(Boolean)
      .join(' / ') || '—';

  // Only DENTAL is offered for prescription uploads.
  const categoryOptions = useMemo(() => ['DENTAL'], []);

  // Default the category to the first option once a file is chosen.
  useEffect(() => {
    if (selectedFile && !selectedCategory && categoryOptions.length) {
      setSelectedCategory(categoryOptions[0]);
    }
  }, [selectedFile, selectedCategory, categoryOptions]);

  // The visit's doctor from props — used as the dropdown's default selection.
  const defaultDoctor: Doctor | null = useMemo(() => {
    if (!appointment?.doctorId) return null;
    return {
      _id: appointment.doctorId,
      name: appointment.doctorName || appointment.doctorCode || 'Doctor',
      doctorCode: appointment.doctorCode,
    };
  }, [appointment]);

  const openFollowupModal = () => {
    setFollowupDate(null);
    setSelectedSlot(null);
    setSlots([]);
    setSlotPickerOpen(false);
    setDoctorDropdownOpen(false);
    setSelectedDoctor(defaultDoctor);
    setShowFollowupModal(true);
  };

  // Load the doctor list the first time the modal is opened.
  useEffect(() => {
    if (!showFollowupModal || !token || doctors.length > 0) return;
    let active = true;
    (async () => {
      setDoctorsLoading(true);
      try {
        const realAuthService = (await import('../services/realAuthService'))
          .default;
        const list = await realAuthService.fetchDoctors(token);
        if (!active) return;
        setDoctors(list);
        // Default to the visit's doctor (match the list entry so we get its
        // full record), falling back to the props doctor or first in the list.
        const match = defaultDoctor
          ? list.find((d: Doctor) => d._id === defaultDoctor._id)
          : undefined;
        setSelectedDoctor(match || defaultDoctor || list[0] || null);
      } catch {
        if (active) Alert.alert('Error', 'Could not load doctors.');
      } finally {
        if (active) setDoctorsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [showFollowupModal, token, doctors.length, defaultDoctor]);

  // Load slots whenever a doctor and date are both selected.
  useEffect(() => {
    if (!showFollowupModal || !token || !selectedDoctor || !followupDate) {
      return;
    }
    let active = true;
    (async () => {
      setSlotsLoading(true);
      setSlots([]);
      setSelectedSlot(null);
      try {
        const realAuthService = (await import('../services/realAuthService'))
          .default;
        const list = await realAuthService.fetchDoctorSlots(
          selectedDoctor._id,
          toApiDate(followupDate),
          token,
        );
        if (active) setSlots(list);
      } catch {
        if (active) Alert.alert('Error', 'Could not load slots.');
      } finally {
        if (active) setSlotsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [showFollowupModal, token, selectedDoctor, followupDate]);

  const handleBookFollowup = async () => {
    if (!followupDate) {
      Alert.alert('Missing date', 'Please pick a follow-up date.');
      return;
    }
    if (!selectedDoctor) {
      Alert.alert('Missing doctor', 'Please select a doctor.');
      return;
    }
    if (!selectedSlot) {
      Alert.alert('Missing slot', 'Please pick a slot for the follow-up.');
      return;
    }
    if (!patientId) {
      Alert.alert('Booking Failed', 'No patient is associated with this visit.');
      return;
    }
    if (!token) return;

    setBooking(true);
    try {
      const realAuthService = (await import('../services/realAuthService'))
        .default;
      const result = await realAuthService.bookFollowupToken(
        {
          doctorId: selectedDoctor._id,
          doctorName: selectedDoctor.name,
          patientId,
          date: toApiDate(followupDate),
          appointmentTime: selectedSlot.startTime,
          tokenCount: selectedSlot.tokenCount,
        },
        token,
      );

      // Prefer the token returned by the server; fall back to the slot's token.
      const tokenNumber =
        result?.tokenCount ??
        result?.tokenNumber ??
        result?.token ??
        selectedSlot.tokenCount;

      setShowFollowupModal(false);
      Alert.alert(
        'Follow-up booked',
        `Token No: ${tokenNumber ?? '—'}\nDoctor: ${
          selectedDoctor.name
        }\nDate: ${formatDate(followupDate.toISOString())}\nTime: ${
          selectedSlot.startTime
        }`,
      );

      if (patientId) {
        const appts = await realAuthService
          .fetchPatientAppointments(patientId, token)
          .catch(() => []);
        setPatientAppointments(appts || []);
      }
    } catch (error) {
      console.error('Follow-up booking error:', error);
      Alert.alert(
        'Booking Failed',
        'Could not book the follow-up. Please try again.',
      );
    } finally {
      setBooking(false);
    }
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!token) return;
      setLoading(true);
      try {
        const realAuthService = (await import('../services/realAuthService'))
          .default;

        // Prescription config (used when building a new prescription)
        realAuthService
          .fetchPrescriptionConfig(PRESCRIPTION_CATEGORIES, token)
          .then(cfg => active && setConfig(cfg))
          .catch(() => {});

        // Prescription history and appointments for this patient
        const [data, appts] = await Promise.all([
          patientId
            ? realAuthService
                .fetchPrescriptionHistory(patientId, 'opd', token)
                .catch(() => null)
            : Promise.resolve(null),
          patientId
            ? realAuthService
                .fetchPatientAppointments(patientId, token)
                .catch(() => [])
            : Promise.resolve([]),
        ]);
        if (active) {
          setHistory(data);
          setPatientAppointments(appts || []);
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [token, patientId]);

  const refreshPrescriptionHistory = useCallback(async () => {
    if (!token || !patientId) return;
    const realAuthService = (await import('../services/realAuthService')).default;
    const data = await realAuthService
      .fetchPrescriptionHistory(patientId, 'opd', token)
      .catch(() => null);
    setHistory(data);
  }, [token, patientId]);

  const headerItem = (label: string, value: string) => (
    <View style={styles.headerItem}>
      <Text style={styles.hLabel}>{label}</Text>
      <Text style={styles.hValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );

  const infoRow = (label: string, value: string) => (
    <Text style={styles.cardInfoLine}>
      <Text style={styles.cardInfoLabel}>{label} </Text>
      {value}
    </Text>
  );

  const metaField = (
    label: string,
    value: string,
    variant: 'primary' | 'muted' = 'primary',
  ) => (
    <View style={styles.metaField}>
      <Text
        style={[
          styles.metaLabel,
          variant === 'muted' && styles.metaLabelMuted,
        ]}
      >
        {label}
      </Text>
      <Text style={styles.metaValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );

  const renderUploadCard = (item: HistoryItem) => {
    const isImage = (item.mimeType || '').startsWith('image/');
    const thumbUri = signedUrls[item.id];
    return (
      <View key={item.id} style={styles.uploadCard}>
        <View style={styles.historyCardHeader}>
          <Text style={styles.historyCardHeaderTitle}>Uploaded Prescription</Text>
          {!!item.category && (
            <View style={styles.uploadCategoryBadge}>
              <Text style={styles.uploadCategoryBadgeText}>{item.category}</Text>
            </View>
          )}
        </View>

        <View style={styles.uploadCardPanel}>
          <View style={styles.uploadCardContent}>
            <TouchableOpacity
              style={styles.thumbnail}
              activeOpacity={0.8}
              onPress={() => openFile(item)}
            >
              {isImage && thumbUri ? (
                <Image
                  source={{ uri: thumbUri }}
                  style={styles.thumbnailImage}
                  resizeMode="cover"
                />
              ) : (
                <>
                  <Icon
                    name={isImage ? 'image' : 'picture-as-pdf'}
                    size={40}
                    color={isImage ? theme.colors.primary : '#E53935'}
                  />
                  <Text style={styles.thumbnailLabel}>
                    {isImage ? 'IMAGE' : 'PDF'}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <View style={styles.uploadCardInfo}>
              <TouchableOpacity activeOpacity={0.7} onPress={() => openFile(item)}>
                <Text style={styles.uploadFileName} numberOfLines={2}>
                  {item.fileName || 'Prescription file'}
                </Text>
              </TouchableOpacity>
              {metaField('DATE', formatDate(item.createdAt), 'muted')}
              {metaField('TIME', formatTime(item.createdAt), 'muted')}
              {metaField('BY', item.uploadedBy || '—', 'muted')}
            </View>
          </View>

          <View style={styles.uploadCardActions}>
            <TouchableOpacity
              style={[styles.uploadActionBtn, styles.uploadActionPrint]}
              activeOpacity={0.85}
              onPress={() => openFile(item)}
            >
              <Icon name="print" size={18} color={theme.colors.surface} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.uploadActionBtn, styles.uploadActionDownload]}
              activeOpacity={0.85}
              onPress={() => openFile(item)}
            >
              <Icon name="file-download" size={18} color={theme.colors.surface} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.uploadActionBtn, styles.uploadActionDelete]}
              activeOpacity={0.85}
              disabled={deletingFileId === item.id}
              onPress={() => handleDeletePrescription(item)}
            >
              {deletingFileId === item.id ? (
                <ActivityIndicator size="small" color={theme.colors.surface} />
              ) : (
                <Icon name="delete-outline" size={18} color={theme.colors.surface} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  const renderLabCard = (item: HistoryItem) => (
    <View key={item.id} style={styles.labCard}>
      <View style={styles.labBadge}>
        <Text style={styles.labBadgeText}>Lab report</Text>
      </View>
      {infoRow('Report:', item.reportName || '—')}
      {infoRow('Date:', formatDate(item.createdAt))}
      {infoRow('Time:', formatTime(item.createdAt))}
    </View>
  );

  const renderAppointmentCard = (item: HistoryItem) => {
    const statusColor = getApptStatusColor(item.status);
    return (
      <View key={item.id} style={styles.apptCard}>
        <View style={styles.historyCardHeader}>
          <View style={styles.apptCardHeaderLeft}>
            <Icon name="event" size={18} color={theme.colors.surface} />
            <Text style={[styles.historyCardHeaderTitle, styles.apptHeaderTitle]}>
              Appointment
            </Text>
          </View>
          <View
            style={[styles.apptStatusBadge, { backgroundColor: statusColor }]}
          >
            <Text style={styles.apptStatusText}>
              {getApptStatusLabel(item.status)}
            </Text>
          </View>
        </View>

        <View style={styles.apptCardBody}>
          <View style={styles.apptCardGrid}>
            <View style={styles.apptGridCell}>
              {metaField('DATE', formatApptDate(item.appointmentDate))}
            </View>
            <View style={styles.apptGridCell}>
              {metaField('TIME', item.appointmentTime || '—')}
            </View>
            <View style={styles.apptGridCell}>
              {metaField('SLOT', item.slot != null ? `#${item.slot}` : '—')}
            </View>
            <View style={styles.apptGridCell}>
              {metaField('VISIT', formatVisitType(item.visitType))}
            </View>
            <View style={styles.apptGridCell}>
              {metaField('DOCTOR', item.doctorName || '—')}
            </View>
          </View>
        </View>
      </View>
    );
  };

  const renderHistoryItem = (item: HistoryItem) => {
    if (item.kind === 'upload') return renderUploadCard(item);
    if (item.kind === 'appointment') return renderAppointmentCard(item);
    return renderLabCard(item);
  };

  const handleCameraCapture = async () => {
    // CAMERA is declared in AndroidManifest, so Android requires a runtime grant
    // before react-native-image-picker can open the camera.
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: 'Camera Permission',
            message: 'Camera access is needed to capture the prescription.',
            buttonPositive: 'OK',
            buttonNegative: 'Cancel',
          },
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert(
            'Permission Required',
            'Camera permission is needed to take a photo of the prescription.',
          );
          return;
        }
      } catch (err) {
        console.error('Camera permission error:', err);
        return;
      }
    }

    const options: CameraOptions = {
      mediaType: 'photo',
      includeBase64: false,
      saveToPhotos: false,
      quality: 0.8 as any,
    };
    launchCamera(options, response => {
      if (response.didCancel) return;
      if (response.errorMessage) {
        console.error('Camera error:', response.errorMessage);
        Alert.alert('Camera Error', 'Failed to capture image. Please try again.');
        return;
      }
      if (response.assets && response.assets.length > 0) {
        const asset = response.assets[0];
        setSelectedFile({
          name: asset.fileName || `prescription_${Date.now()}.jpg`,
          uri: asset.uri || '',
          type: asset.type || 'image/jpeg',
        });
      }
    });
  };

  const handleFilePick = async () => {
    try {
      const result = await pick({ type: ['image/*', 'application/pdf'] });
      if (result && result.length > 0) {
        const file = result[0];
        setSelectedFile({
          name: file.name || 'Prescription file',
          uri: file.uri || '',
          type: file.type || 'application/octet-stream',
        });
      }
    } catch (error) {
      if (
        isErrorWithCode(error) &&
        error.code === errorCodes.OPERATION_CANCELED
      ) {
        return;
      }
      console.error('File picker error:', error);
      Alert.alert('Error', 'Failed to select file. Please try again.');
    }
  };

  const handleSelectCamera = () => {
    setShowUploadModal(false);
    handleCameraCapture();
  };

  const handleSelectFile = () => {
    setShowUploadModal(false);
    handleFilePick();
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setSelectedCategory(null);
    setCategoryDropdownOpen(false);
  };

  const openFile = (item: HistoryItem) => {
    if (!item.filePath) return;
    const index = openableItems.findIndex(i => i.id === item.id);
    if (index >= 0) setViewerIndex(index);
  };

  const handleDeletePrescription = (item: HistoryItem) => {
    if (!token || !patientId || deletingFileId) return;

    Alert.alert(
      'Delete prescription',
      `Remove "${item.fileName || 'this file'}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingFileId(item.id);
            try {
              const realAuthService = (await import('../services/realAuthService'))
                .default;
              await realAuthService.deletePatientFile(item.id, token);

              if (
                viewerIndex != null &&
                openableItems[viewerIndex]?.id === item.id
              ) {
                setViewerIndex(null);
              }

              setSignedUrls(prev => {
                const next = { ...prev };
                delete next[item.id];
                return next;
              });

              await refreshPrescriptionHistory();
              Alert.alert('Deleted', 'Prescription removed successfully.');
            } catch (error) {
              console.error('Prescription delete error:', error);
              Alert.alert(
                'Delete Failed',
                'Could not delete the prescription. Please try again.',
              );
            } finally {
              setDeletingFileId(null);
            }
          },
        },
      ],
    );
  };

  const handleUpload = async () => {
    if (!selectedFile || !token) return;
    if (!patientId) {
      Alert.alert('Upload Failed', 'No patient is associated with this visit.');
      return;
    }
    if (!selectedCategory) {
      Alert.alert('Select category', 'Please choose a prescription category.');
      return;
    }

    setUploading(true);
    try {
      const realAuthService = (await import('../services/realAuthService'))
        .default;
      await realAuthService.uploadPatientFile(
        selectedFile,
        patientId,
        'prescription',
        token,
        selectedCategory,
      );

      setSelectedFile(null);
      setSelectedCategory(null);
      Alert.alert('Success', 'Prescription uploaded successfully.');

      await refreshPrescriptionHistory();
    } catch (error) {
      console.error('Prescription upload error:', error);
      Alert.alert(
        'Upload Failed',
        'Could not upload the prescription. Please try again.',
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={theme.colors.primary}
      />

      {/* Top app header: back button (left) + OPD title (center) */}
      <SafeAreaView edges={['top']} style={styles.appBarSafe}>
        <View style={styles.appBar}>
          <TouchableOpacity
            style={styles.appBarSide}
            activeOpacity={0.7}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Icon name="arrow-back" size={24} color={theme.colors.surface} />
          </TouchableOpacity>
          <Text style={styles.appBarTitle}>OPD</Text>
          <View style={styles.appBarSide} />
        </View>
      </SafeAreaView>

      {/* Patient header */}
      <View style={styles.header}>
        <View style={styles.headerGrid}>
          <View style={styles.headerCol}>
            {headerItem('Name:', name)}
            {headerItem('Mobile No:', mobile)}
          </View>
          <View style={styles.headerCol}>
            {headerItem('UHID:', uhid)}
            {headerItem('Gender/Age:', genderAge)}
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Action buttons: Upload prescription + Add follow-up (inline) */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.uploadBtn, styles.actionBtn]}
            activeOpacity={0.8}
            onPress={() => setShowUploadModal(true)}
          >
            <Icon name="upload-file" size={20} color={theme.colors.surface} />
            <Text style={styles.uploadText}>Upload Prescription</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.followupBtn, styles.actionBtn]}
            activeOpacity={0.8}
            onPress={openFollowupModal}
          >
            <Icon name="event-available" size={20} color={theme.colors.primary} />
            <Text style={styles.followupText}>Add Follow-up</Text>
          </TouchableOpacity>
        </View>

        {/* Prescriptions, labs, and appointments */}
        <Text style={styles.historyTitle}>Prescriptions &amp; Labs</Text>
        {loading ? (
          <ActivityIndicator
            style={styles.historyLoader}
            color={theme.colors.primary}
          />
        ) : historySections.length === 0 ? (
          <Text style={styles.emptyText}>
            No records found for this patient
          </Text>
        ) : (
          historySections.map(section => (
            <View key={section.label} style={styles.historySection}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionLabelPill}>
                  <Text style={styles.sectionLabelText}>{section.label}</Text>
                </View>
                <View style={styles.sectionDivider} />
              </View>
              {section.items.map(item => renderHistoryItem(item))}
            </View>
          ))
        )}
      </ScrollView>

      {/* Upload source modal */}
      <Modal
        visible={showUploadModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowUploadModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowUploadModal(false)}
        >
          <View style={styles.uploadModalContainer}>
            <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()}>
              <View style={styles.uploadModalContent}>
                <View style={styles.uploadModalHeader}>
                  <Text style={styles.uploadModalTitle}>Upload Prescription</Text>
                  <TouchableOpacity onPress={() => setShowUploadModal(false)}>
                    <Icon name="close" size={24} color={theme.colors.text} />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.uploadOption}
                  activeOpacity={0.7}
                  onPress={handleSelectCamera}
                >
                  <View style={styles.uploadOptionIcon}>
                    <Icon
                      name="photo-camera"
                      size={24}
                      color={theme.colors.primary}
                    />
                  </View>
                  <View style={styles.uploadOptionTextWrap}>
                    <Text style={styles.uploadOptionTitle}>Camera</Text>
                    <Text style={styles.uploadOptionSubtitle}>
                      Take a photo of the prescription
                    </Text>
                  </View>
                  <Icon
                    name="chevron-right"
                    size={24}
                    color={theme.colors.textSecondary}
                  />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.uploadOption}
                  activeOpacity={0.7}
                  onPress={handleSelectFile}
                >
                  <View style={styles.uploadOptionIcon}>
                    <Icon
                      name="folder"
                      size={24}
                      color={theme.colors.primary}
                    />
                  </View>
                  <View style={styles.uploadOptionTextWrap}>
                    <Text style={styles.uploadOptionTitle}>File Manager</Text>
                    <Text style={styles.uploadOptionSubtitle}>
                      Choose an image or PDF file
                    </Text>
                  </View>
                  <Icon
                    name="chevron-right"
                    size={24}
                    color={theme.colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Selected file → category + confirm upload popup */}
      <Modal
        visible={!!selectedFile}
        transparent
        animationType="fade"
        onRequestClose={handleRemoveFile}
      >
        <TouchableOpacity
          style={styles.followupModalOverlay}
          activeOpacity={1}
          onPress={() => {
            if (!uploading) handleRemoveFile();
          }}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={e => e.stopPropagation()}
            style={styles.followupCard}
          >
            <View style={styles.followupHeader}>
              <Text style={styles.followupTitle}>Upload Prescription</Text>
              <TouchableOpacity
                style={styles.followupClose}
                onPress={handleRemoveFile}
                disabled={uploading}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Icon name="close" size={22} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            {/* Selected file */}
            <View style={styles.selectedFileRow}>
              <Icon
                name="insert-drive-file"
                size={20}
                color={theme.colors.primary}
              />
              <Text style={styles.selectedFileName} numberOfLines={1}>
                {selectedFile?.name}
              </Text>
            </View>

            {/* Category */}
            <Text style={styles.followupLabel}>Category</Text>
            <TouchableOpacity
              style={styles.categorySelect}
              activeOpacity={0.7}
              disabled={uploading}
              onPress={() => setCategoryDropdownOpen(o => !o)}
            >
              <Text
                style={[
                  styles.categorySelectText,
                  !selectedCategory && styles.followupPlaceholder,
                ]}
              >
                {selectedCategory || 'Select category'}
              </Text>
              <Icon
                name={categoryDropdownOpen ? 'expand-less' : 'expand-more'}
                size={22}
                color={theme.colors.textSecondary}
              />
            </TouchableOpacity>
            {categoryDropdownOpen && (
              <View style={styles.dropdownList}>
                <ScrollView style={styles.categoryDropdownScroll} nestedScrollEnabled>
                  {categoryOptions.map(cat => {
                    const active = cat === selectedCategory;
                    return (
                      <TouchableOpacity
                        key={cat}
                        style={styles.dropdownItem}
                        activeOpacity={0.7}
                        onPress={() => {
                          setSelectedCategory(cat);
                          setCategoryDropdownOpen(false);
                        }}
                      >
                        <Text
                          style={[
                            styles.dropdownItemText,
                            active && styles.dropdownItemTextActive,
                          ]}
                        >
                          {cat}
                        </Text>
                        {active && (
                          <Icon name="check" size={18} color={theme.colors.primary} />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.confirmBtn,
                styles.uploadPopupConfirmBtn,
                uploading && styles.confirmBtnDisabled,
              ]}
              activeOpacity={0.8}
              onPress={handleUpload}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator size="small" color={theme.colors.surface} />
              ) : (
                <>
                  <Icon
                    name="cloud-upload"
                    size={20}
                    color={theme.colors.surface}
                  />
                  <Text style={styles.uploadText}>Upload</Text>
                </>
              )}
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Book Follow-up modal (UI only) */}
      <Modal
        visible={showFollowupModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFollowupModal(false)}
      >
        <TouchableOpacity
          style={styles.followupModalOverlay}
          activeOpacity={1}
          onPress={() => setShowFollowupModal(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={e => e.stopPropagation()}
            style={styles.followupCard}
          >
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Header */}
              <View style={styles.followupHeader}>
                <Text style={styles.followupTitle}>Book Follow-up</Text>
                <View style={styles.tokenBadge}>
                  <Text style={styles.tokenBadgeText}>TOKEN ONLY</Text>
                </View>
                <TouchableOpacity
                  style={styles.followupClose}
                  onPress={() => setShowFollowupModal(false)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Icon name="close" size={22} color={theme.colors.text} />
                </TouchableOpacity>
              </View>

              <Text style={styles.followupSubtitle}>
                Books a queue appointment only — no prescription is created.
              </Text>

              {/* Follow-up date */}
              <Text style={styles.followupLabel}>Follow-up date</Text>
              <TouchableOpacity
                style={styles.followupField}
                activeOpacity={0.7}
                onPress={() => setShowFollowupDatePicker(true)}
              >
                <Text
                  style={[
                    styles.followupFieldText,
                    !followupDate && styles.followupPlaceholder,
                  ]}
                >
                  {followupDate ? formatDate(followupDate.toISOString()) : 'dd/mm/yyyy'}
                </Text>
                <Icon name="event" size={20} color={theme.colors.textSecondary} />
              </TouchableOpacity>

              {/* Doctor */}
              <Text style={styles.followupLabel}>Doctor</Text>
              <TouchableOpacity
                style={styles.followupField}
                activeOpacity={0.7}
                disabled={doctorsLoading}
                onPress={() => setDoctorDropdownOpen(o => !o)}
              >
                <Text
                  style={[
                    styles.followupFieldText,
                    !selectedDoctor && styles.followupPlaceholder,
                  ]}
                >
                  {selectedDoctor
                    ? `${selectedDoctor.name}${
                        selectedDoctor.doctorCode
                          ? ` (${selectedDoctor.doctorCode})`
                          : ''
                      }`
                    : 'Select doctor'}
                </Text>
                {doctorsLoading ? (
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                ) : (
                  <Icon
                    name={doctorDropdownOpen ? 'expand-less' : 'expand-more'}
                    size={22}
                    color={theme.colors.textSecondary}
                  />
                )}
              </TouchableOpacity>
              {doctorDropdownOpen && (
                <View style={styles.dropdownList}>
                  {doctors.map(doc => {
                    const active = doc._id === selectedDoctor?._id;
                    return (
                      <TouchableOpacity
                        key={doc._id}
                        style={styles.dropdownItem}
                        activeOpacity={0.7}
                        onPress={() => {
                          setSelectedDoctor(doc);
                          setDoctorDropdownOpen(false);
                        }}
                      >
                        <Text
                          style={[
                            styles.dropdownItemText,
                            active && styles.dropdownItemTextActive,
                          ]}
                        >
                          {doc.name}
                          {doc.doctorCode ? ` (${doc.doctorCode})` : ''}
                        </Text>
                        {active && (
                          <Icon
                            name="check"
                            size={18}
                            color={theme.colors.primary}
                          />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* Slot */}
              <Text style={styles.followupLabel}>Slot</Text>
              <TouchableOpacity
                style={styles.followupField}
                activeOpacity={0.7}
                disabled={!selectedDoctor || !followupDate || slotsLoading}
                onPress={() => setSlotPickerOpen(true)}
              >
                <Text
                  style={[
                    styles.followupFieldText,
                    !selectedSlot && styles.followupPlaceholder,
                  ]}
                >
                  {selectedSlot
                    ? selectedSlot.startTime
                    : !followupDate
                    ? 'Pick a date first'
                    : 'Click to pick a slot'}
                </Text>
                {slotsLoading ? (
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                ) : (
                  <Icon
                    name="expand-more"
                    size={22}
                    color={theme.colors.textSecondary}
                  />
                )}
              </TouchableOpacity>

              {/* Footer actions */}
              <View style={styles.followupFooter}>
                <TouchableOpacity
                  style={[styles.followupFooterBtn, styles.followupCancelBtn]}
                  activeOpacity={0.8}
                  onPress={() => setShowFollowupModal(false)}
                >
                  <Text style={styles.followupCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.followupFooterBtn,
                    styles.followupBookBtn,
                    booking && styles.confirmBtnDisabled,
                  ]}
                  activeOpacity={0.8}
                  onPress={handleBookFollowup}
                  disabled={booking}
                >
                  {booking ? (
                    <ActivityIndicator size="small" color={theme.colors.surface} />
                  ) : (
                    <Text style={styles.followupBookText}>Book follow-up</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>

        <DatePicker
          modal
          open={showFollowupDatePicker}
          date={followupDate || new Date()}
          mode="date"
          minimumDate={new Date()}
          onConfirm={date => {
            setShowFollowupDatePicker(false);
            setFollowupDate(date);
          }}
          onCancel={() => setShowFollowupDatePicker(false)}
          title="Follow-up date"
        />
      </Modal>

      {/* Slot picker popup (cards grid, like the web app) */}
      <Modal
        visible={slotPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSlotPickerOpen(false)}
      >
        <TouchableOpacity
          style={styles.followupModalOverlay}
          activeOpacity={1}
          onPress={() => setSlotPickerOpen(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={e => e.stopPropagation()}
            style={styles.slotModalCard}
          >
            <View style={styles.followupHeader}>
              <Text style={styles.followupTitle}>Select Slots</Text>
              <TouchableOpacity
                style={styles.followupClose}
                onPress={() => setSlotPickerOpen(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Icon name="close" size={22} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            {slots.length === 0 ? (
              <Text style={styles.followupSubtitle}>
                No slots available for this doctor on the selected date.
              </Text>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.slotCardGrid}>
                  {slots.map(slot => {
                    const active = slot._id === selectedSlot?._id;
                    const disabled = !!slot.isDisable;
                    return (
                      <TouchableOpacity
                        key={slot._id}
                        style={[
                          styles.slotCard,
                          active && styles.slotCardActive,
                          disabled && styles.slotCardDisabled,
                        ]}
                        activeOpacity={0.8}
                        disabled={disabled}
                        onPress={() => {
                          setSelectedSlot(slot);
                          setSlotPickerOpen(false);
                        }}
                      >
                        <Text style={styles.slotCardLine}>
                          Time: {slot.startTime}
                        </Text>
                        <Text style={styles.slotCardLine}>
                          Duration: {slot.duration ?? 30}
                        </Text>
                        <Text style={styles.slotCardLine}>
                          Token: {slot.tokenCount ?? '—'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* In-app file viewer with a bottom strip to move between prescriptions */}
      <Modal
        visible={viewerIndex != null}
        animationType="slide"
        onRequestClose={() => setViewerIndex(null)}
      >
        {(() => {
          const current =
            viewerIndex != null ? openableItems[viewerIndex] : undefined;
          const currentUrl = current ? signedUrls[current.id] : undefined;
          const isPdf = (current?.mimeType || '').includes('pdf');
          return (
            <SafeAreaView
              edges={['top', 'bottom']}
              style={styles.viewerContainer}
            >
              <View style={styles.viewerHeader}>
                <TouchableOpacity
                  onPress={() => setViewerIndex(null)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Icon name="arrow-back" size={24} color={theme.colors.text} />
                </TouchableOpacity>
                <Text style={styles.viewerTitle} numberOfLines={1}>
                  {current?.fileName || 'File'}
                </Text>
                <Text style={styles.viewerCount}>
                  {viewerIndex != null ? viewerIndex + 1 : 0}/
                  {openableItems.length}
                </Text>
              </View>

              <View style={styles.viewerBody}>
                {!currentUrl ? (
                  <ActivityIndicator
                    size="large"
                    color={theme.colors.surface}
                  />
                ) : isPdf ? (
                  <Pdf
                    key={current?.id}
                    source={{ uri: currentUrl, cache: true }}
                    trustAllCerts={false}
                    style={styles.viewerPdf}
                    onError={err => {
                      console.error('PDF render error:', err);
                    }}
                  />
                ) : (
                  <ScrollView
                    style={styles.viewerImageScroll}
                    contentContainerStyle={styles.viewerImageContent}
                    maximumZoomScale={4}
                    minimumZoomScale={1}
                    centerContent
                  >
                    <Image
                      source={{ uri: currentUrl }}
                      style={styles.viewerImage}
                      resizeMode="contain"
                    />
                  </ScrollView>
                )}
              </View>

              {/* Bottom glider: thumbnails of all prescriptions */}
              {openableItems.length > 1 && (
                <View style={styles.gliderContainer}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.gliderContent}
                  >
                    {openableItems.map((it, idx) => {
                      const itIsImage = (it.mimeType || '').startsWith('image/');
                      const itUri = signedUrls[it.id];
                      const active = idx === viewerIndex;
                      return (
                        <TouchableOpacity
                          key={it.id}
                          activeOpacity={0.8}
                          onPress={() => setViewerIndex(idx)}
                          style={[
                            styles.gliderThumb,
                            active && styles.gliderThumbActive,
                          ]}
                        >
                          {itIsImage && itUri ? (
                            <Image
                              source={{ uri: itUri }}
                              style={styles.gliderThumbImage}
                              resizeMode="cover"
                            />
                          ) : (
                            <Icon
                              name={itIsImage ? 'image' : 'picture-as-pdf'}
                              size={26}
                              color={itIsImage ? theme.colors.primary : '#E53935'}
                            />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}
            </SafeAreaView>
          );
        })()}
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  appBarSafe: {
    backgroundColor: theme.colors.primary,
  },
  appBar: {
    height: theme.headerHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.primary,
    elevation: 4,
  },
  appBarSide: {
    width: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  appBarTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.surface,
  },
  header: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  headerGrid: {
    flexDirection: 'row',
  },
  headerCol: {
    flex: 1,
  },
  headerItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.xs,
  },
  hLabel: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
    marginRight: theme.spacing.xs,
  },
  hValue: {
    flex: 1,
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text,
  },
  content: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xxl,
  },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
    backgroundColor: theme.colors.primary,
    ...theme.shadows.sm,
  },
  uploadText: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.surface,
    marginLeft: theme.spacing.sm,
  },
  selectedFileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
  },
  selectedFileName: {
    flex: 1,
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
    marginHorizontal: theme.spacing.sm,
  },
  categorySelect: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
  },
  categorySelectText: {
    flex: 1,
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
  },
  categoryDropdownScroll: {
    maxHeight: 220,
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.lg,
    backgroundColor: '#4CAF50',
    ...theme.shadows.sm,
  },
  confirmBtnDisabled: {
    opacity: 0.6,
  },
  uploadPopupConfirmBtn: {
    marginTop: theme.spacing.lg,
    marginBottom: 0,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  uploadModalContainer: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    paddingBottom: 20,
  },
  uploadModalContent: {
    padding: theme.spacing.lg,
  },
  uploadModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  uploadModalTitle: {
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
  },
  uploadOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.background,
    marginBottom: theme.spacing.sm,
  },
  uploadOptionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.md,
  },
  uploadOptionTextWrap: {
    flex: 1,
  },
  uploadOptionTitle: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.text,
  },
  uploadOptionSubtitle: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  historyTitle: {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  historyLoader: {
    marginTop: theme.spacing.lg,
  },
  emptyText: {
    textAlign: 'center',
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xxl,
  },
  historySection: {
    marginBottom: theme.spacing.md,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  sectionLabelPill: {
    backgroundColor: '#ECEFF1',
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
  },
  sectionLabelText: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.bold,
    color: '#546E7A',
  },
  sectionDivider: {
    flex: 1,
    height: 1,
    backgroundColor: theme.colors.border,
    marginLeft: theme.spacing.md,
  },
  // Shared info lines (File: / Date: / Time: / Uploaded By:)
  cardInfoLine: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
    marginTop: theme.spacing.xs,
  },
  cardInfoLabel: {
    fontWeight: theme.typography.fontWeights.bold,
  },
  metaField: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  metaLabel: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.primary,
    letterSpacing: 0.4,
    marginRight: theme.spacing.sm,
  },
  metaLabelMuted: {
    color: theme.colors.textSecondary,
  },
  metaValue: {
    flex: 1,
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.text,
  },
  historyCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
  },
  historyCardHeaderTitle: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.surface,
  },
  // Uploaded prescription card
  uploadCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadows.sm,
  },
  uploadCardPanel: {
    backgroundColor: '#F5F6F8',
    padding: theme.spacing.md,
  },
  uploadCategoryBadge: {
    backgroundColor: '#7E57C2',
    borderRadius: theme.borderRadius.sm,
    paddingVertical: 2,
    paddingHorizontal: theme.spacing.sm,
    marginLeft: theme.spacing.sm,
  },
  uploadCategoryBadgeText: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.surface,
  },
  uploadCardContent: {
    flexDirection: 'row',
  },
  uploadFileName: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  uploadCardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  uploadActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadActionPrint: {
    backgroundColor: '#43A047',
  },
  uploadActionDownload: {
    backgroundColor: theme.colors.primary,
  },
  uploadActionDelete: {
    backgroundColor: '#E53935',
  },
  thumbnail: {
    width: 96,
    height: 96,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.md,
    overflow: 'hidden',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  thumbnailLabel: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
  uploadCardInfo: {
    flex: 1,
  },
  // Lab report card
  labCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    ...theme.shadows.sm,
  },
  labBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#E8EAF6',
    borderRadius: theme.borderRadius.sm,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  labBadgeText: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
  },
  apptCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: '#BBDEFB',
    ...theme.shadows.sm,
  },
  apptCardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  apptHeaderTitle: {
    marginLeft: theme.spacing.sm,
  },
  apptStatusBadge: {
    borderRadius: theme.borderRadius.xl,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 4,
    marginLeft: theme.spacing.sm,
  },
  apptStatusText: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.surface,
  },
  apptCardBody: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  apptCardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  apptGridCell: {
    width: '50%',
    paddingRight: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  // In-app file viewer
  viewerContainer: {
    flex: 1,
    backgroundColor: theme.colors.surface,
  },
  viewerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  viewerTitle: {
    flex: 1,
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.text,
    marginLeft: theme.spacing.md,
  },
  viewerCount: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.textSecondary,
    marginLeft: theme.spacing.sm,
  },
  viewerBody: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerPdf: {
    flex: 1,
    width: SCREEN_WIDTH,
    backgroundColor: '#525659',
  },
  viewerImageScroll: {
    flex: 1,
    width: SCREEN_WIDTH,
    backgroundColor: '#000',
  },
  viewerImageContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewerImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.8,
  },
  // Bottom glider strip
  gliderContainer: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  gliderContent: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  gliderThumb: {
    width: 56,
    height: 56,
    borderRadius: theme.borderRadius.md,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.sm,
    overflow: 'hidden',
  },
  gliderThumbActive: {
    borderColor: theme.colors.primary,
  },
  gliderThumbImage: {
    width: '100%',
    height: '100%',
  },
  // Inline action buttons (Upload + Add follow-up)
  actionRow: {
    flexDirection: 'row',
    marginBottom: theme.spacing.md,
  },
  actionBtn: {
    flex: 1,
    marginBottom: 0,
  },
  followupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    marginLeft: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.sm,
  },
  followupText: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.primary,
    marginLeft: theme.spacing.sm,
  },
  // Book Follow-up modal
  followupModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  followupCard: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '85%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.lg,
    ...theme.shadows.sm,
  },
  followupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  followupTitle: {
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
    marginRight: theme.spacing.sm,
  },
  tokenBadge: {
    backgroundColor: theme.colors.primary + '1A',
    borderRadius: theme.borderRadius.lg,
    paddingVertical: 4,
    paddingHorizontal: theme.spacing.sm,
  },
  tokenBadgeText: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.primary,
    letterSpacing: 0.5,
  },
  followupClose: {
    marginLeft: 'auto',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followupSubtitle: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.lg,
  },
  followupLabel: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  followupField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surface,
  },
  followupFieldText: {
    flex: 1,
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
  },
  followupPlaceholder: {
    color: theme.colors.textSecondary,
  },
  dropdownList: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    marginTop: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  dropdownItemText: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
  },
  dropdownItemTextActive: {
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.primary,
  },
  // Slot picker popup (cards grid)
  slotModalCard: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '85%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.lg,
    ...theme.shadows.sm,
  },
  slotCardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  slotCard: {
    width: '48%',
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
    backgroundColor: '#86EFAC',
  },
  slotCardActive: {
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  slotCardDisabled: {
    backgroundColor: theme.colors.border,
    opacity: 0.5,
  },
  slotCardLine: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
    marginBottom: 2,
  },
  followupFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: theme.spacing.xl,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  followupFooterBtn: {
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followupCancelBtn: {
    backgroundColor: theme.colors.background,
    marginRight: theme.spacing.md,
  },
  followupCancelText: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.text,
  },
  followupBookBtn: {
    backgroundColor: theme.colors.primary,
  },
  followupBookText: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.surface,
  },
});

export default OPDScreen;
