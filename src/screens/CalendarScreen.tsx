import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  Image,
  StatusBar,
  Dimensions,
  Modal,
  Pressable,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DatePicker from 'react-native-date-picker';
import { useAppSelector, selectAuthToken, selectAppConfig, selectCurrentUser, selectManageServices, selectAppDataLoading } from '../store';
import { theme } from '../constants/theme';
import { Header, ModalBackdrop, SlotPickerGrid, FileViewerModal, OPDActionsFab, CustomBookingTimeFields } from '../components';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Appointment, Patient } from '../types';
import calendarRtdbService from '../services/calendarRtdbService';
import { BookableSlot, isSlotSelectable } from '../utils/slot.util';
import { isSlotBookingMode } from '../utils/doctorBookingMode.util';
import {
  formatAppointmentListTime,
  getAppointmentVisitDisplay,
  hasAppointmentStartTime,
  parseAppointmentTime,
  shouldShowAppointmentToken,
} from '../utils/appointmentDisplay.util';
import { extractAppointmentTreatments } from '../utils/appointmentTreatments';
import { defaultCustomStartTime } from '../utils/customBookingTime.util';
import {
  filesForAppointment,
  historyDateKey,
} from '../utils/appointmentFileSync.util';
import { formatAddress, formatGenderAge } from '../utils/patientDisplay';
import { filterManageServicesByType } from '../utils/manageServices';
import {
  collectSelectedFollowupDetails,
  mapCatalogTreatments,
  mapPlanGroups,
  matchDetailsToTreatmentKeys,
  type FollowupPlanGroup,
  type FollowupTreatmentOption,
} from '../utils/followupTreatments';
import { buildPatientSearchFetchParams } from '../utils/patientSearchParams.util';
import { canManageTreatmentPlan } from '../utils/accessControl';

import {
  collectUploadFileParts,
  isImageUploadPart,
  viewerPartKey,
} from '../utils/uploadFileParts.util';

interface CalendarScreenProps {
  navigation: any;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const GUTTER = 80; // px reserved for the TOKENS label column on the left
const DEFAULT_EVENT_COLOR = '#7CB342';
const CALENDAR_GRID_LINE = '#B8C0CC';
const CALENDAR_GRID_LINE_STRONG = '#8E99A8';

const hasAppointmentToken = (appt: Appointment) =>
  appt.tokenCount != null && Number(appt.tokenCount) > 0;

const shouldShowTokenDetail = shouldShowAppointmentToken;

const isFollowUpAppointment = (appt: Appointment | null | undefined) =>
  String(appt?.visitType || '').toUpperCase() === 'FOLLOW_UP';

// Local YYYY-MM-DD key for a Date
const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;

type AnchoredDropdownKind = 'calendarDoctor' | 'rescheduleDoctor' | 'rescheduleDate';

interface DropdownAnchor {
  top: number;
  left: number;
  width: number;
}

const measureDropdownAnchor = (
  ref: React.RefObject<View | null>,
  onMeasured: (anchor: DropdownAnchor) => void,
) => {
  requestAnimationFrame(() => {
    ref.current?.measureInWindow((x, y, width, height) => {
      const panelWidth = Math.max(width, 240);
      const left = Math.min(Math.max(8, x), SCREEN_WIDTH - panelWidth - 8);
      onMeasured({
        top: y + height + 4,
        left,
        width: panelWidth,
      });
    });
  });
};

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
const parseTime = parseAppointmentTime;

// "11:00 am" style for the appointment list
const formatListTime = formatAppointmentListTime;

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

interface PatientFileItem {
  id: string;
  kind: 'upload' | 'lab';
  title: string;
  typeLabel: string;
  meta: string;
  sortAt: number;
  dateKey: string;
  batchParentId?: string;
  uploadType?: string;
  sessionId?: string | null;
  queueId?: string | null;
  filePath?: string | null;
  mimeType?: string | null;
  signedUrl?: string | null;
  thumbUrl?: string | null;
}

const buildPatientFileItems = (history: any): PatientFileItem[] => {
  const uploads: PatientFileItem[] = [];
  for (const u of history?.prescriptionUpload || []) {
    const parts = collectUploadFileParts(u);
    const typeLabel = uploadTypeLabel(u.type);
    const shared = {
      kind: 'upload' as const,
      typeLabel,
      meta: [u.uploadedBy, u.createdAt ? formatApptCardDate(u.createdAt) : '']
        .filter(Boolean)
        .join(' · '),
      sortAt: u.createdAt ? new Date(u.createdAt).getTime() : 0,
      dateKey: historyDateKey(u.createdAt),
      uploadType: u.type,
      sessionId: u.sessionId || null,
      queueId: u.queueId || u.prescriptionId || null,
    };
    for (const part of parts) {
      if (!part?.filePath) continue;
      uploads.push({
        id: `${u._id}:${part.filePath}`,
        batchParentId: String(u._id),
        title: part.originalName || part.fileName || typeLabel,
        filePath: part.filePath,
        mimeType: part.mimeType,
        signedUrl: part.signedUrl || null,
        thumbUrl: part.thumbUrl || part.signedUrl || null,
        ...shared,
      });
    }
  }

  const labs: PatientFileItem[] = (history?.labreport || []).map((l: any) => ({
    id: String(l._id),
    batchParentId: String(l._id),
    kind: 'lab' as const,
    title: l.name || 'Lab report',
    typeLabel: 'Lab',
    meta: [l.createdByName, l.createdAt ? formatApptCardDate(l.createdAt) : '']
      .filter(Boolean)
      .join(' · '),
    sortAt: l.createdAt ? new Date(l.createdAt).getTime() : 0,
    dateKey: historyDateKey(l.createdAt),
    sessionId: l.sessionId || l.prescriptionId || null,
    queueId: l.queueId || l.prescriptionId || null,
    filePath: l.reportImg || l.filePath || null,
    mimeType: l.mimeType || null,
    signedUrl: l.signedUrl || null,
    thumbUrl: l.thumbUrl || l.signedUrl || null,
  }));

  return [...uploads, ...labs].sort((a, b) => b.sortAt - a.sortAt);
};

const mergeUploadSources = (list: any[], noSessionUploads: any[]): any[] => {
  const map = new Map<string, any>();
  for (const row of [...(noSessionUploads || []), ...(list || [])]) {
    const id = String(row?._id || '');
    if (!id) continue;
    map.set(id, row);
  }
  return Array.from(map.values());
};

const formatFileUploadTime = (sortAt?: number) => {
  if (!sortAt) return '';
  return new Date(sortAt).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const uploadTypeLabel = (type?: string) => {
  switch (type) {
    case 'lab':
      return 'Lab';
    case 'note':
      return 'Procedure';
    case 'radiology':
      return 'Radiology';
    default:
      return 'Prescription';
  }
};

const patientFileIcon = (item: PatientFileItem) => {
  if (item.kind === 'lab') return 'science';
  if (item.uploadType === 'note') return 'description';
  if (item.uploadType === 'lab') return 'biotech';
  return 'upload-file';
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
      return { bg: '#B7791F', text: '#FFFFFF' };
    case 'confirmed':
      return { bg: '#1565C0', text: '#FFFFFF' };
    case 'arrived':
      return { bg: '#7B1FA2', text: '#FFFFFF' };
    case 'completed':
      return { bg: '#2E7D32', text: '#FFFFFF' };
    case 'absent':
      return { bg: '#C62828', text: '#FFFFFF' };
    case 'cancelled':
    case 'canceled':
      return { bg: '#C62828', text: '#FFFFFF' };
    default:
      return { bg: '#F5F5F5', text: theme.colors.textSecondary };
  }
};

const getStatusDetailColor = (status?: string) => {
  switch ((status || '').toLowerCase()) {
    case 'waiting':
      return '#92400E';
    case 'progress':
    case 'in_progress':
      return '#1D4ED8';
    case 'completed':
      return '#16A34A';
    case 'absent':
      return '#DC2626';
    case 'cancelled':
    case 'canceled':
      return '#6B7280';
    case 'scheduled':
      return '#4338CA';
    default:
      return '#374151';
  }
};

const getStatusLabel = (status?: string) => {
  if (!status) return 'Unknown';
  return status.charAt(0).toUpperCase() + status.slice(1);
};

const isAppointmentCancelled = (appt: Appointment) => {
  const status = (appt.status || '').toLowerCase();
  const editStatus = (appt.editStatus || '').toLowerCase();
  return (
    status === 'cancelled' ||
    status === 'canceled' ||
    editStatus === 'cancelled'
  );
};

const isAppointmentAbsent = (appt: Appointment) => {
  const status = (appt.status || '').toLowerCase();
  return status === 'absent' && !isAppointmentCancelled(appt);
};

const shouldStrikeAppointment = (appt: Appointment) =>
  isAppointmentCancelled(appt) || isAppointmentAbsent(appt);

const getAppointmentStatusLabel = (appt: Appointment) => {
  if (isAppointmentCancelled(appt)) return 'Cancelled';
  if (isAppointmentAbsent(appt)) return 'Absent';
  return getStatusLabel(appt.status);
};

const getCancellationReason = (appt: Appointment) => {
  const remark = (appt.remark || '').trim();
  if (remark) return remark;
  const refundRemark = String((appt as { refundRemark?: string }).refundRemark || '').trim();
  if (refundRemark) return refundRemark;
  const reason = getAppointmentReason(appt);
  return reason === '—' ? '' : reason;
};

const getConsultationLabel = (appt: Appointment) => {
  const mode =
    String((appt as { consultationMode?: string }).consultationMode || '').toUpperCase() ===
    'VIDEO'
      ? 'Video'
      : 'In-Clinic';
  const doctor = appt.doctorName || 'Doctor';
  let label = `${mode} appointment with ${doctor}`;
  if (hasAppointmentStartTime(appt)) {
    label += ` · ${getAppointmentVisitDisplay(appt)}`;
  } else if (appt.tokenCount) {
    label += ` · T${appt.tokenCount}`;
  }
  if (!hasAppointmentStartTime(appt) && appt.duration) {
    label += ` for ${appt.duration} min`;
  }
  return label;
};

const isArrivalConfirmed = (appt: Appointment) =>
  !!(appt.isArrived || appt.confirmationStatus === 'confirmed');

const canConfirmArrivalFor = (appt: Appointment) =>
  appt.confirmationStatus === 'pending' && !isAppointmentCancelled(appt);

const canMoveToOpdFor = (appt: Appointment) =>
  !!appt.patientId && isArrivalConfirmed(appt) && !isAppointmentCancelled(appt);

const isAppointmentActive = (appt: Appointment) => {
  const status = (appt.status || '').toLowerCase();
  return !isAppointmentCancelled(appt) && status !== 'completed';
};

const isWhatsappSource = (appt: Appointment) =>
  String(appt.source || '').toUpperCase().includes('WHATSAPP');

const normalizeMobile = (value?: string) =>
  (value || '').replace(/\D/g, '').replace(/^91/, '').slice(-10);

const CalendarScreen: React.FC<CalendarScreenProps> = ({ navigation }) => {
  const token = useAppSelector(selectAuthToken);
  const appConfig = useAppSelector(selectAppConfig);
  const currentUser = useAppSelector(selectCurrentUser);
  const canManageTreatmentPlanAccess = useMemo(
    () => canManageTreatmentPlan(currentUser),
    [currentUser],
  );
  const manageServiceRecords = useAppSelector(selectManageServices);
  const appDataLoading = useAppSelector(selectAppDataLoading);

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
  const [calendarDoctors, setCalendarDoctors] = useState<
    { id: string; name: string; color?: string | null }[]
  >([]);
  const [anchoredDropdown, setAnchoredDropdown] = useState<{
    kind: AnchoredDropdownKind;
    anchor: DropdownAnchor;
  } | null>(null);
  const doctorSelectRef = useRef<View>(null);
  const rescheduleDoctorBtnRef = useRef<View>(null);
  const rescheduleDateBtnRef = useRef<View>(null);
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
  const [patientSummary, setPatientSummary] = useState<Patient | null>(null);
  const [patientHistory, setPatientHistory] = useState<any>(null);
  const [patientHistoryLoading, setPatientHistoryLoading] = useState(false);
  const [fileSignedUrls, setFileSignedUrls] = useState<Record<string, string>>({});
  const [openingFileId, setOpeningFileId] = useState<string | null>(null);
  const [fileViewerFile, setFileViewerFile] = useState<PatientFileItem | null>(null);
  const [fileViewerUrl, setFileViewerUrl] = useState<string | null>(null);
  const [fileViewerLoading, setFileViewerLoading] = useState(false);
  const [fileViewerContextAppt, setFileViewerContextAppt] =
    useState<Appointment | null>(null);
  // Patient search modal
  const [patientSearchOpen, setPatientSearchOpen] = useState(false);
  const [patientSearchQuery, setPatientSearchQuery] = useState('');
  const [debouncedPatientSearch, setDebouncedPatientSearch] = useState('');
  const [searchPatients, setSearchPatients] = useState<Patient[]>([]);
  const [searchPatientsLoading, setSearchPatientsLoading] = useState(false);
  const [searchPatientsError, setSearchPatientsError] = useState<string | null>(
    null,
  );
  const [movingSearchPatientId, setMovingSearchPatientId] = useState<
    string | null
  >(null);
  const [confirmArrivalOpen, setConfirmArrivalOpen] = useState(false);
  const [confirmPatientName, setConfirmPatientName] = useState('');
  const [confirmMobileNo, setConfirmMobileNo] = useState('');
  const [confirmExpenseAmount, setConfirmExpenseAmount] = useState(0);
  const [confirmAlreadyPaid, setConfirmAlreadyPaid] = useState(0);
  const [confirmNowPaying, setConfirmNowPaying] = useState(0);
  const [confirmDiscount, setConfirmDiscount] = useState(0);
  const [confirmRefundAmount, setConfirmRefundAmount] = useState(0);
  const [matchingPatients, setMatchingPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(
    null,
  );
  const [isLoadingConfirmPreview, setIsLoadingConfirmPreview] = useState(false);
  const [isConfirmingArrival, setIsConfirmingArrival] = useState(false);
  const [tooltipAppt, setTooltipAppt] = useState<Appointment | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelRemark, setCancelRemark] = useState('');
  const [cancelRefundOption, setCancelRefundOption] = useState<
    'yes' | 'later' | 'none' | null
  >(null);
  const [cancelRefundAmount, setCancelRefundAmount] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleDoctors, setRescheduleDoctors] = useState<
    Array<{ _id: string; name: string; bookingMode?: string }>
  >([]);
  const [rescheduleDoctorId, setRescheduleDoctorId] = useState('');
  const [rescheduleIsSlotDoctor, setRescheduleIsSlotDoctor] = useState(false);
  const [rescheduleAvailableDates, setRescheduleAvailableDates] = useState<
    Array<{ date: string; label?: string }>
  >([]);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleSlots, setRescheduleSlots] = useState<BookableSlot[]>([]);
  const [rescheduleSlotsLoading, setRescheduleSlotsLoading] = useState(false);
  const [rescheduleDatesLoading, setRescheduleDatesLoading] = useState(false);
  const [selectedRescheduleSlot, setSelectedRescheduleSlot] =
    useState<BookableSlot | null>(null);
  const [rescheduleSlotPickerOpen, setRescheduleSlotPickerOpen] = useState(false);
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [rescheduleCustomStartTime, setRescheduleCustomStartTime] = useState('');
  const [rescheduleCustomDuration, setRescheduleCustomDuration] = useState('');
  const [rescheduleCustomErrors, setRescheduleCustomErrors] = useState<{
    startTime?: string;
    duration?: string;
  } | null>(null);
  const [showTokenRescheduleDatePicker, setShowTokenRescheduleDatePicker] =
    useState(false);
  const [reschedulePlanGroups, setReschedulePlanGroups] = useState<FollowupPlanGroup[]>([]);
  const [rescheduleCatalogTreatments, setRescheduleCatalogTreatments] = useState<
    FollowupTreatmentOption[]
  >([]);
  const [rescheduleTreatmentsLoading, setRescheduleTreatmentsLoading] =
    useState(false);
  const [rescheduleTreatmentDropdownOpen, setRescheduleTreatmentDropdownOpen] =
    useState(false);
  const [rescheduleTreatmentSearch, setRescheduleTreatmentSearch] = useState('');
  const [rescheduleSelectedTreatmentKeys, setRescheduleSelectedTreatmentKeys] =
    useState<Set<string>>(new Set());
  const rtdbRefreshTimer = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

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

  const fetchAppointments = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!token) return;
      if (!options?.silent) {
        setIsLoading(true);
      }
      try {
        const realAuthService = (await import('../services/realAuthService'))
          .default;
        const fetched = await realAuthService
          .fetchAppointmentsRange(token, range.from, range.to)
          .catch(() => []);
        setAppointments(fetched || []);
        setSelectedAppt(prev => {
          if (!prev?._id) return prev;
          return fetched?.find((item: Appointment) => item._id === prev._id) ?? prev;
        });
      } catch (err) {
        console.error('Calendar: failed to fetch appointments:', err);
      } finally {
        if (!options?.silent) {
          setIsLoading(false);
        }
      }
    },
    [token, range.from, range.to],
  );

  const confirmArrivalPendingCalc = useMemo(
    () =>
      Math.max(
        0,
        (confirmExpenseAmount || 0) -
          (confirmAlreadyPaid || 0) -
          (confirmNowPaying || 0) -
          (confirmDiscount || 0),
      ),
    [
      confirmExpenseAmount,
      confirmAlreadyPaid,
      confirmNowPaying,
      confirmDiscount,
    ],
  );

  const requiresPatientSelection =
    matchingPatients.length > 1 && !selectedPatientId;

  const scheduleSilentRefresh = useCallback(() => {
    if (rtdbRefreshTimer.current) {
      clearTimeout(rtdbRefreshTimer.current);
    }
    rtdbRefreshTimer.current = setTimeout(() => {
      fetchAppointments({ silent: true });
    }, 400);
  }, [fetchAppointments]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  // Load doctor colors and the full doctor list for the calendar filter.
  useEffect(() => {
    if (!token) return;
    let active = true;
    (async () => {
      const realAuthService = (await import('../services/realAuthService'))
        .default;
      const [map, doctors] = await Promise.all([
        realAuthService.fetchDoctorColors(token),
        realAuthService.fetchDoctors(token),
      ]);
      if (!active) return;
      setDoctorColors(map);
      setCalendarDoctors(
        (Array.isArray(doctors) ? doctors : []).map((d: any) => ({
          id: String(d._id),
          name: d.name || d.doctorCode || 'Doctor',
        })),
      );
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

  useFocusEffect(
    useCallback(() => {
      const tenantId = currentUser?.tenantId;
      if (!tenantId || !appConfig) return undefined;

      calendarRtdbService.start(tenantId, appConfig, payload => {
        if (
          !calendarRtdbService.shouldHandle(payload, selectedDoctorId)
        ) {
          return;
        }
        scheduleSilentRefresh();
      });

      return () => {
        calendarRtdbService.stop();
        if (rtdbRefreshTimer.current) {
          clearTimeout(rtdbRefreshTimer.current);
        }
      };
    }, [
      appConfig,
      currentUser?.tenantId,
      scheduleSilentRefresh,
      selectedDoctorId,
    ]),
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
    const id =
      source._id ||
      source.id ||
      raw._id ||
      raw.id ||
      source.patientId ||
      raw.patientId;
    return {
      _id: id,
      id,
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
    setSearchPatientsError(null);
    try {
      const realAuthService = (await import('../services/realAuthService'))
        .default;
      const result = await realAuthService.fetchPatients(token, {
        page: 0,
        limit: 20,
        ...buildPatientSearchFetchParams(debouncedPatientSearch),
      });
      setSearchPatients(result.patients.map(normalizeSearchPatient));
    } catch (err) {
      console.error('Patient search failed:', err);
      setSearchPatients([]);
      setSearchPatientsError('Could not search patients. Pull to retry.');
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
    setSearchPatientsError(null);
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

  // Load patient appointments + uploaded files when the details sheet opens
  useEffect(() => {
    if (!selectedAppt?.patientId || !token) {
      setPatientAppointments([]);
      setPatientSummary(null);
      setPatientHistory(null);
      setPatientApptsLoading(false);
      setPatientHistoryLoading(false);
      return;
    }

    let active = true;
    setPatientApptsLoading(true);
    setPatientHistoryLoading(true);
    setPatientSummary(null);
    setPatientHistory(null);
    (async () => {
      try {
        const realAuthService = (await import('../services/realAuthService'))
          .default;
        const [apptResult, history, uploads] = await Promise.all([
          realAuthService.fetchPatientAppointments(
            selectedAppt.patientId!,
            token,
          ),
          realAuthService
            .fetchPrescriptionHistory(selectedAppt.patientId!, 'opd', token)
            .catch(() => null),
          realAuthService.fetchPatientUploads(selectedAppt.patientId!, token),
        ]);
        if (!active) return;
        setPatientAppointments(apptResult.appointments || []);
        setPatientSummary(apptResult.patient || null);
        setPatientHistory(
          history
            ? {
                ...history,
                prescriptionUpload: mergeUploadSources(
                  uploads,
                  history.prescriptionUpload,
                ),
              }
            : { prescriptionUpload: uploads, labreport: [] },
        );
      } catch (err) {
        console.error('Calendar: failed to fetch patient history:', err);
        if (active) {
          setPatientAppointments([]);
          setPatientSummary(null);
          setPatientHistory(null);
        }
      } finally {
        if (active) {
          setPatientApptsLoading(false);
          setPatientHistoryLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [selectedAppt?.patientId, selectedAppt?._id, token]);

  const handleEditPatient = async () => {
    const patientId = selectedAppt?.patientId;
    if (!patientId || !token) return;
    try {
      const realAuthService = (await import('../services/realAuthService'))
        .default;
      let full = patientSummary;
      if (!full) {
        const result = await realAuthService.fetchPatientAppointments(
          String(patientId),
          token,
        );
        full = result.patient;
        if (full) setPatientSummary(full);
      }
      navigation.navigate('AddPatient', {
        patientData: {
          ...(full || {}),
          _id: String(patientId),
          name: selectedAppt?.patientName || full?.name,
          mobileNo: selectedAppt?.mobileNo || full?.mobileNo,
          uhid: selectedAppt?.uhid || full?.uhid,
          gender: selectedAppt?.gender ?? full?.gender,
          age: selectedAppt?.age ?? full?.age,
          address: selectedAppt?.address ?? full?.address,
        },
      });
    } catch (err) {
      Alert.alert(
        'Edit Patient',
        err instanceof Error ? err.message : 'Could not open patient editor.',
      );
    }
  };

  const sortedPatientAppointments = useMemo(() => {
    return [...patientAppointments].sort((a, b) => {
      const dateCmp = (b.date || '').localeCompare(a.date || '');
      if (dateCmp !== 0) return dateCmp;
      return (parseTime(b.time) ?? 0) - (parseTime(a.time) ?? 0);
    });
  }, [patientAppointments]);

  const sortedPatientFiles = useMemo(
    () => buildPatientFileItems(patientHistory),
    [patientHistory],
  );

  const fileViewerStripItems = useMemo(() => {
    if (!fileViewerFile) return [];
    const appt = fileViewerContextAppt;
    const pool = appt
      ? filesForAppointment(
          appt,
          sortedPatientFiles,
          sortedPatientAppointments,
        ).filter(file => file.filePath)
      : sortedPatientFiles.filter(file => file.filePath);

    if (fileViewerFile.batchParentId) {
      const siblings = pool.filter(
        file => file.batchParentId === fileViewerFile.batchParentId,
      );
      if (siblings.length > 1) return siblings;
    }
    return pool.length > 1 ? pool : [];
  }, [
    fileViewerFile,
    fileViewerContextAppt,
    sortedPatientFiles,
    sortedPatientAppointments,
  ]);

  useEffect(() => {
    const patientId = selectedAppt?.patientId;
    if (!token || !patientId || !patientHistory) return;

    const images = sortedPatientFiles.filter(
      file => file.filePath && isImageUploadPart(file) && !file.thumbUrl,
    );
    if (!images.length) return;

    let active = true;
    (async () => {
      const realAuthService = (await import('../services/realAuthService'))
        .default;
      const entries = await Promise.all(
        images.map(async file => {
          try {
            const key = viewerPartKey(file);
            const url = await realAuthService.getPatientFileSignedUrl(
              file.filePath!,
              String(patientId),
              token,
            );
            return [key, url] as const;
          } catch {
            return null;
          }
        }),
      );
      if (!active) return;
      const map: Record<string, string> = {};
      for (const entry of entries) {
        if (entry) map[entry[0]] = entry[1];
      }
      if (Object.keys(map).length) {
        setFileSignedUrls(prev => ({ ...prev, ...map }));
      }
    })();

    return () => {
      active = false;
    };
  }, [patientHistory, selectedAppt?.patientId, sortedPatientFiles, token]);

  const openAppointmentFile = useCallback(
    async (file: PatientFileItem, appt?: Appointment) => {
      const patientId = selectedAppt?.patientId;
      if (!file.filePath || !patientId || !token || openingFileId) return;

      if (appt) {
        setFileViewerContextAppt(appt);
      }

      setOpeningFileId(file.id);
      setFileViewerFile(file);
      setFileViewerUrl(null);
      setFileViewerLoading(true);

      try {
        const cached =
          file.signedUrl ||
          file.thumbUrl ||
          fileSignedUrls[file.filePath] ||
          fileSignedUrls[viewerPartKey(file)];
        let url = cached;
        if (!url) {
          const realAuthService = (await import('../services/realAuthService'))
            .default;
          url = await realAuthService.getPatientFileSignedUrl(
            file.filePath,
            String(patientId),
            token,
          );
          setFileSignedUrls(prev => ({ ...prev, [file.filePath!]: url }));
        }
        setFileViewerUrl(url);
      } catch (err) {
        setFileViewerFile(null);
        setFileViewerContextAppt(null);
        Alert.alert(
          'Open file',
          err instanceof Error ? err.message : 'Unable to open file.',
        );
      } finally {
        setFileViewerLoading(false);
        setOpeningFileId(null);
      }
    },
    [fileSignedUrls, openingFileId, selectedAppt?.patientId, token],
  );

  const closeFileViewer = useCallback(() => {
    setFileViewerFile(null);
    setFileViewerUrl(null);
    setFileViewerLoading(false);
    setFileViewerContextAppt(null);
  }, []);

  const thumbUrlForFile = useCallback(
    (file: PatientFileItem) => {
      if (!isImageUploadPart(file)) return null;
      return (
        file.thumbUrl ||
        (file.filePath ? fileSignedUrls[file.filePath] : null) ||
        fileSignedUrls[viewerPartKey(file)] ||
        null
      );
    },
    [fileSignedUrls],
  );

  const renderAllAppointmentCard = (appt: Appointment) => {
    const statusBadge = getStatusBadgeColors(appt.status);
    const treatments = extractAppointmentTreatments(appt);
    const apptFiles = filesForAppointment(
      appt,
      sortedPatientFiles,
      sortedPatientAppointments,
    );

    return (
      <View key={appt._id} style={styles.allApptCard}>
        <View style={styles.allApptCardHeader}>
          <View style={styles.allApptCardDateRow}>
            <Text style={styles.allApptCardDate}>
              {formatApptCardDate(appt.date)}
            </Text>
            {hasAppointmentStartTime(appt) || appt.tokenCount ? (
              <Text style={styles.allApptCardTime}>
                {' '}
                {getAppointmentVisitDisplay(appt)}
              </Text>
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

        <View style={styles.allApptDoctorRow}>
          <Text style={styles.allApptDoctorLabel}>DOCTOR</Text>
          <Text style={styles.allApptDoctorName} numberOfLines={1}>
            {appt.doctorName || '—'}
          </Text>
        </View>

        {treatments.map((treatment, index) => (
          <View
            key={`${appt._id}-treatment-${index}`}
            style={styles.allApptTreatmentBox}
          >
            <Text style={styles.allApptTreatmentName} numberOfLines={1}>
              {treatment.treatmentDesc}
            </Text>
            <Text style={styles.allApptTreatmentDate}>
              {formatApptCardDate(treatment.date)}
            </Text>
          </View>
        ))}

        {apptFiles.length > 0 ? (
          <View style={styles.allApptUploadsBlock}>
            <Text style={styles.allApptUploadsLabel}>UPLOADED</Text>
            <View style={styles.allApptUploadList}>
              {apptFiles.map(file => {
                const thumb = thumbUrlForFile(file);
                const opening = openingFileId === file.id;
                return (
                  <TouchableOpacity
                    key={file.id}
                    style={[
                      styles.allApptUploadRow,
                      file.kind === 'lab' && styles.allApptUploadRowLab,
                      file.uploadType === 'note' && styles.allApptUploadRowNote,
                    ]}
                    activeOpacity={0.7}
                    disabled={!file.filePath || opening}
                    onPress={() => openAppointmentFile(file, appt)}
                  >
                    <View
                      style={[
                        styles.allApptUploadIcon,
                        file.kind === 'lab' && styles.allApptUploadIconLab,
                        file.uploadType === 'note' && styles.allApptUploadIconNote,
                      ]}
                    >
                      {thumb ? (
                        <Image
                          source={{ uri: thumb }}
                          style={styles.allApptUploadThumb}
                          resizeMode="cover"
                        />
                      ) : (
                        <Icon
                          name={patientFileIcon(file)}
                          size={16}
                          color={
                            file.kind === 'lab'
                              ? '#0D9488'
                              : file.uploadType === 'note'
                                ? '#7C3AED'
                                : '#6366F1'
                          }
                        />
                      )}
                    </View>
                    <Text style={styles.allApptUploadName} numberOfLines={1}>
                      {file.title}
                    </Text>
                    <View style={styles.allApptUploadMeta}>
                      {file.sortAt ? (
                        <Text style={styles.allApptUploadTime}>
                          {formatFileUploadTime(file.sortAt)}
                        </Text>
                      ) : null}
                      <Text style={styles.allApptUploadType}>
                        {file.typeLabel}
                      </Text>
                    </View>
                    {opening ? (
                      <ActivityIndicator size="small" color="#6366F1" />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ) : null}
      </View>
    );
  };

  const renderPatientFileCard = (item: PatientFileItem) => (
    <View key={item.id} style={styles.patientFileCard}>
      <View
        style={[
          styles.patientFileIconWrap,
          item.kind === 'lab' && styles.patientFileIconWrapLab,
          item.uploadType === 'note' && styles.patientFileIconWrapNote,
        ]}
      >
        <Icon
          name={patientFileIcon(item)}
          size={18}
          color={
            item.kind === 'lab'
              ? '#0D9488'
              : item.uploadType === 'note'
                ? '#7C3AED'
                : '#6366F1'
          }
        />
      </View>
      <View style={styles.patientFileBody}>
        <Text style={styles.patientFileTitle} numberOfLines={2}>
          {item.title}
        </Text>
        {item.meta ? (
          <Text style={styles.patientFileMeta} numberOfLines={1}>
            {item.meta}
          </Text>
        ) : null}
      </View>
      <View style={styles.patientFileBadge}>
        <Text style={styles.patientFileBadgeText}>
          {item.kind === 'lab'
            ? 'Lab'
            : uploadTypeLabel(item.uploadType).split(' ')[0]}
        </Text>
      </View>
    </View>
  );

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

  // Doctors for the header filter — prefer the full tenant list from the API.
  const doctorFilterOptions = useMemo(() => {
    if (calendarDoctors.length > 0) return calendarDoctors;
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
  }, [calendarDoctors, appointments]);

  const todayKey = toKey(new Date());

  const openAnchoredDropdown = (
    kind: AnchoredDropdownKind,
    ref: React.RefObject<View | null>,
  ) => {
    measureDropdownAnchor(ref, anchor => setAnchoredDropdown({ kind, anchor }));
  };

  const closeAnchoredDropdown = () => setAnchoredDropdown(null);

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
    () => doctorFilterOptions.find(d => d.id === selectedDoctorId) || null,
    [doctorFilterOptions, selectedDoctorId],
  );

  const renderAppointmentRow = (appt: Appointment) => {
    const dotColor = colorForAppt(appt);
    const subtitle = getAppointmentSubtitle(appt);
    const struck = shouldStrikeAppointment(appt);

    return (
      <View
        key={appt._id}
        style={[styles.apptRow, struck && styles.apptRowInactive]}
      >
        <TouchableOpacity
          style={styles.apptRowPressable}
          activeOpacity={0.7}
          onPress={() => handleAppointmentRowPress(appt)}
          onLongPress={() => showAppointmentTooltip(appt)}
          delayLongPress={350}
        >
          <Text style={[styles.apptRowTime, struck && styles.apptStruckText]}>
            {getAppointmentVisitDisplay(appt)}
          </Text>
          <View style={styles.apptRowMain}>
            <Text
              style={[styles.apptRowName, struck && styles.apptStruckText]}
              numberOfLines={1}
            >
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
        <TouchableOpacity
          style={styles.apptRowMenuBtn}
          activeOpacity={0.7}
          onPress={() => handleAppointmentMenuPress(appt)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Move to OPD"
        >
          <Icon name="more-vert" size={22} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>
    );
  };

  const renderTokenChip = (appt: Appointment) => {
    const accent = colorForAppt(appt);
    const struck = shouldStrikeAppointment(appt);
    return (
      <View
        key={appt._id}
        style={[
          styles.tokenChip,
          { borderLeftColor: accent },
          struck && styles.tokenChipInactive,
        ]}
      >
        <TouchableOpacity
          style={styles.tokenChipPressable}
          activeOpacity={0.8}
          onPress={() => handleAppointmentRowPress(appt)}
          onLongPress={() => showAppointmentTooltip(appt)}
          delayLongPress={350}
        >
          <Text
            style={[styles.tokenChipName, struck && styles.apptStruckText]}
            numberOfLines={1}
          >
            {appt.patientName || 'Unknown'}
          </Text>
          {hasAppointmentToken(appt) ? (
            <Text style={[styles.tokenChipNo, struck && styles.apptStruckText]}>
              #{appt.tokenCount}
            </Text>
          ) : null}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.apptRowMenuBtn}
          activeOpacity={0.7}
          onPress={() => handleAppointmentMenuPress(appt)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Move to OPD"
        >
          <Icon name="more-vert" size={20} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>
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

  // Move the selected patient to OPD (requires confirmed arrival, same as web)
  const openAppointmentDetails = (appt: Appointment) => {
    setSelectedAppt(appt);
  };

  const moveToOpdForAppointment = async (appt: Appointment) => {
    if (!token || movingToOpd) return;
    if (!canMoveToOpdFor(appt)) {
      openAppointmentDetails(appt);
      return;
    }
    const patientId = appt.patientId;
    if (!patientId) {
      Alert.alert('Move to OPD', 'No patient is linked to this appointment.');
      openAppointmentDetails(appt);
      return;
    }
    setMovingToOpd(true);
    try {
      const realAuthService = (await import('../services/realAuthService'))
        .default;
      const patient = await realAuthService.moveToOpd(patientId, token);
      setSelectedAppt(null);
      navigation.navigate('OPD', { appointment: appt, patient });
    } catch (err) {
      console.error('Move to OPD failed:', err);
      Alert.alert('Error', 'Failed to move the patient to OPD. Please try again.');
    } finally {
      setMovingToOpd(false);
    }
  };

  /** Row tap: always open appointment details. */
  const handleAppointmentRowPress = (appt: Appointment) => {
    openAppointmentDetails(appt);
  };

  /** 3-dot menu: move to OPD when arrival confirmed; otherwise details + confirm arrival. */
  const handleAppointmentMenuPress = (appt: Appointment) => {
    if (!isAppointmentCancelled(appt) && canMoveToOpdFor(appt)) {
      void moveToOpdForAppointment(appt);
    } else {
      openAppointmentDetails(appt);
    }
  };

  const handleMoveToOpd = () => {
    if (!selectedAppt) return;
    void moveToOpdForAppointment(selectedAppt);
  };

  type OpdNavigationOptions = {
    openUpload?: 'prescription' | 'procedure' | 'lab';
    openFollowup?: boolean;
    openTreatmentPlan?: boolean;
  };

  const navigateToOpdFromDetails = async (options?: OpdNavigationOptions) => {
    if (!selectedAppt || !token || movingToOpd) return;
    const patientId = selectedAppt.patientId;
    if (!patientId) {
      Alert.alert('OPD', 'No patient is linked to this appointment.');
      return;
    }
    setMovingToOpd(true);
    try {
      const realAuthService = (await import('../services/realAuthService'))
        .default;
      const patient = await realAuthService.moveToOpd(patientId, token);
      const appt = selectedAppt;
      setSelectedAppt(null);
      navigation.navigate('OPD', {
        appointment: appt,
        patient,
        ...(options?.openFollowup
          ? { followupLinkedTreatments: extractAppointmentTreatments(appt) }
          : {}),
        ...options,
      });
    } catch (err) {
      console.error('Navigate to OPD failed:', err);
      Alert.alert('Error', 'Failed to open OPD for this patient. Please try again.');
    } finally {
      setMovingToOpd(false);
    }
  };

  const handlePatientHeaderPress = () => {
    if (!selectedAppt?.patientId) {
      Alert.alert('OPD', 'No patient is linked to this appointment.');
      return;
    }
    void navigateToOpdFromDetails();
  };

  const closeConfirmArrival = () => {
    setConfirmArrivalOpen(false);
    setIsConfirmingArrival(false);
    setIsLoadingConfirmPreview(false);
    setConfirmPatientName('');
    setConfirmMobileNo('');
    setMatchingPatients([]);
    setSelectedPatientId(null);
  };

  const loadConfirmArrivalPreview = async (
    appt: Appointment,
    mobileNo: string,
  ) => {
    if (!token) return;
    const tenantId = String(appt.tenantId || currentUser?.tenantId || '');
    if (!tenantId) return;

    setIsLoadingConfirmPreview(true);
    try {
      const realAuthService = (await import('../services/realAuthService'))
        .default;
      const res = await realAuthService.fetchConfirmArrivalPreview(
        {
          queueId: appt._id,
          tenantId,
          ...(mobileNo ? { mobileNo } : {}),
        },
        token,
      );
      const q = res?.queue || {};
      const bill = res?.payment;
      setConfirmExpenseAmount(
        Number(bill?.expenseAmount ?? q.expenseAmount ?? 0),
      );
      setConfirmAlreadyPaid(Number(bill?.paidAmount ?? q.paidAmount ?? 0));
      setConfirmDiscount(Number(bill?.discount ?? q.discount ?? 0));
      setConfirmRefundAmount(Number(bill?.refundAmount ?? q.refundAmount ?? 0));

      const matches = (res?.matchingPatients || []).map((p: any) => ({
        _id: String(p._id),
        name: p.name || p.patientName || 'Unknown',
        mobileNo: p.mobileNo || p.mobile || '',
        uhid: p.uhid ?? null,
      }));
      setMatchingPatients(matches);

      const suggested = res?.suggestedPatientId
        ? String(res.suggestedPatientId)
        : null;
      if (suggested && matches.some((p: Patient) => p._id === suggested)) {
        setSelectedPatientId(suggested);
        const match = matches.find((p: Patient) => p._id === suggested);
        if (match?.name) setConfirmPatientName(match.name);
      } else if (matches.length === 1) {
        setSelectedPatientId(matches[0]._id);
        if (matches[0].name) setConfirmPatientName(matches[0].name);
      } else if (!matches.length) {
        setSelectedPatientId('__new__');
      } else {
        setSelectedPatientId(null);
      }
    } catch (err) {
      console.error('Confirm arrival preview failed:', err);
      Alert.alert('Error', 'Failed to load bill and patient matches.');
    } finally {
      setIsLoadingConfirmPreview(false);
    }
  };

  const openConfirmArrival = () => {
    if (!selectedAppt || !canConfirmArrivalFor(selectedAppt)) return;
    setConfirmPatientName((selectedAppt.patientName || '').trim());
    setConfirmMobileNo(normalizeMobile(selectedAppt.mobileNo));
    setConfirmNowPaying(0);
    setMatchingPatients([]);
    setSelectedPatientId(null);
    setConfirmArrivalOpen(true);
    loadConfirmArrivalPreview(
      selectedAppt,
      normalizeMobile(selectedAppt.mobileNo),
    );
  };

  const selectMatchingPatient = (patientId: string) => {
    setSelectedPatientId(patientId);
    const match = matchingPatients.find(p => p._id === patientId);
    if (match?.name) {
      setConfirmPatientName(match.name);
    }
    if (match?.mobileNo) {
      setConfirmMobileNo(normalizeMobile(match.mobileNo));
    }
  };

  const selectCreateNewPatient = () => {
    setSelectedPatientId('__new__');
  };

  const selectedApptTreatments = useMemo(
    () => (selectedAppt ? extractAppointmentTreatments(selectedAppt) : []),
    [selectedAppt],
  );

  const submitConfirmArrival = async () => {
    if (!selectedAppt || !token || isConfirmingArrival) return;
    if (confirmArrivalPendingCalc > 0 || requiresPatientSelection) return;

    const name = confirmPatientName.trim();
    const mobileNo = normalizeMobile(confirmMobileNo);
    if (!name) {
      Alert.alert('Error', 'Patient name is required');
      return;
    }
    if (!/^[6-9]\d{9}$/.test(mobileNo)) {
      Alert.alert('Error', 'Enter a valid 10-digit mobile number');
      return;
    }

    setIsConfirmingArrival(true);
    try {
      const realAuthService = (await import('../services/realAuthService'))
        .default;
      const tenantId = String(
        selectedAppt.tenantId || currentUser?.tenantId || '',
      );
      const totalPaid = (confirmAlreadyPaid || 0) + (confirmNowPaying || 0);
      const payload: Record<string, unknown> = {
        queueId: selectedAppt._id,
        tenantId,
        name,
        mobileNo,
        paidAmount: totalPaid,
        discount: confirmDiscount || 0,
        refundAmount: confirmRefundAmount || 0,
        pendingAmount: confirmArrivalPendingCalc,
        expenseAmount: confirmExpenseAmount || 0,
      };
      if (selectedPatientId === '__new__') {
        payload.createNewPatient = true;
      } else if (selectedPatientId) {
        payload.patientId = selectedPatientId;
      }

      const res = await realAuthService.confirmArrival(payload, token);
      const updated: Appointment = {
        ...selectedAppt,
        isArrived: true,
        confirmationStatus: 'confirmed',
        patientName: name,
        mobileNo,
        paidAmount: totalPaid,
        pendingAmount: confirmArrivalPendingCalc,
        expenseAmount: confirmExpenseAmount || 0,
        isPaymentDone: confirmArrivalPendingCalc === 0,
      };
      if (res?.uhid) updated.uhid = res.uhid;
      if (res?.patientId) updated.patientId = String(res.patientId);

      setSelectedAppt(updated);
      setAppointments(prev =>
        prev.map(item => (item._id === updated._id ? updated : item)),
      );
      closeConfirmArrival();
      Alert.alert(
        'Arrived',
        res?.uhid
          ? `Patient confirmed. UHID: ${res.uhid}`
          : 'Patient arrival confirmed',
      );
    } catch (err: any) {
      console.error('Confirm arrival failed:', err);
      Alert.alert('Error', err?.message || 'Failed to confirm arrival');
    } finally {
      setIsConfirmingArrival(false);
    }
  };

  const showAppointmentTooltip = (appt: Appointment) => {
    setTooltipAppt(appt);
  };

  const closeCancelModal = () => {
    setCancelOpen(false);
    setCancelRemark('');
    setCancelRefundOption(null);
    setCancelRefundAmount('');
    setIsCancelling(false);
  };

  const openCancelModal = () => {
    if (!selectedAppt) return;
    setCancelRemark('');
    setCancelRefundOption(null);
    setCancelRefundAmount('');
    setCancelOpen(true);
  };

  const submitCancelAppointment = async () => {
    if (!selectedAppt || !token || isCancelling) return;
    if (
      !isWhatsappSource(selectedAppt) &&
      cancelRefundOption === null
    ) {
      Alert.alert('Cancel', 'Please select a refund option.');
      return;
    }
    setIsCancelling(true);
    try {
      const realAuthService = (await import('../services/realAuthService'))
        .default;
      const body: Record<string, unknown> = {
        queueId: selectedAppt._id,
        tenantId: selectedAppt.tenantId || currentUser?.tenantId,
        refundRemark: cancelRemark || 'Cancelled by hospital admin',
        source: 'ADMIN_PANEL',
      };
      if (isWhatsappSource(selectedAppt)) {
        body.initiateRefund = true;
      } else {
        body.refundDone =
          cancelRefundOption === 'yes'
            ? true
            : cancelRefundOption === 'later'
              ? false
              : null;
        body.refundAmount =
          cancelRefundOption === 'yes'
            ? Number(cancelRefundAmount) || null
            : null;
      }
      await realAuthService.cancelAppointment(body, token);
      closeCancelModal();
      setSelectedAppt(null);
      await fetchAppointments();
      Alert.alert('Cancelled', 'Appointment cancelled — slot is now free.');
    } catch (err: any) {
      console.error('Cancel failed:', err);
      Alert.alert('Error', err?.message || 'Failed to cancel appointment');
    } finally {
      setIsCancelling(false);
    }
  };

  const closeRescheduleModal = () => {
    setRescheduleOpen(false);
    setRescheduleDoctorId('');
    setRescheduleIsSlotDoctor(false);
    setRescheduleDate('');
    setRescheduleAvailableDates([]);
    setRescheduleSlots([]);
    setSelectedRescheduleSlot(null);
    setRescheduleSlotPickerOpen(false);
    setReschedulePlanGroups([]);
    setRescheduleCatalogTreatments([]);
    setRescheduleTreatmentsLoading(false);
    setRescheduleTreatmentDropdownOpen(false);
    setRescheduleTreatmentSearch('');
    setRescheduleSelectedTreatmentKeys(new Set());
    closeAnchoredDropdown();
    setIsRescheduling(false);
  };

  const hasAssignedRescheduleTreatments = reschedulePlanGroups.length > 0;

  const reschedulePlanTreatmentOptions = useMemo(
    () => reschedulePlanGroups.flatMap(group => group.treatments),
    [reschedulePlanGroups],
  );

  const filteredReschedulePlanGroups = useMemo(() => {
    const query = rescheduleTreatmentSearch.trim().toLowerCase();
    if (!query) return reschedulePlanGroups;
    return reschedulePlanGroups
      .map(group => ({
        ...group,
        treatments: group.treatments.filter(treatment =>
          treatment.treatmentDesc.toLowerCase().includes(query),
        ),
      }))
      .filter(group => group.treatments.length > 0);
  }, [reschedulePlanGroups, rescheduleTreatmentSearch]);

  const filteredRescheduleCatalogTreatments = useMemo(() => {
    const query = rescheduleTreatmentSearch.trim().toLowerCase();
    if (!query) return rescheduleCatalogTreatments;
    return rescheduleCatalogTreatments.filter(treatment =>
      treatment.treatmentDesc.toLowerCase().includes(query),
    );
  }, [rescheduleCatalogTreatments, rescheduleTreatmentSearch]);

  const selectedRescheduleTreatmentSummaries = useMemo(() => {
    const selected = rescheduleSelectedTreatmentKeys;
    return [
      ...reschedulePlanTreatmentOptions.filter(item => selected.has(item.key)),
      ...rescheduleCatalogTreatments.filter(item => selected.has(item.key)),
    ];
  }, [
    rescheduleSelectedTreatmentKeys,
    reschedulePlanTreatmentOptions,
    rescheduleCatalogTreatments,
  ]);

  const rescheduleTreatmentTriggerLabel = useMemo(() => {
    const count = rescheduleSelectedTreatmentKeys.size;
    if (count === 0) {
      return hasAssignedRescheduleTreatments || rescheduleCatalogTreatments.length
        ? 'Select treatments…'
        : 'No treatments available';
    }
    if (count === 1) {
      return selectedRescheduleTreatmentSummaries[0]?.treatmentDesc || '1 treatment';
    }
    return `${count} treatments selected`;
  }, [
    rescheduleSelectedTreatmentKeys,
    hasAssignedRescheduleTreatments,
    rescheduleCatalogTreatments.length,
    selectedRescheduleTreatmentSummaries,
  ]);

  const toggleRescheduleTreatment = (key: string) => {
    setRescheduleSelectedTreatmentKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const loadRescheduleTreatmentOptions = async (appt: Appointment) => {
    if (!token || !appt.patientId) return;
    setRescheduleTreatmentsLoading(true);
    try {
      const realAuthService = (await import('../services/realAuthService'))
        .default;
      const plans = await realAuthService.fetchTreatmentPlans(
        appt.patientId,
        token,
        'opd',
      );
      const planGroups = mapPlanGroups(plans || []);
      const catalog = mapCatalogTreatments(
        filterManageServicesByType(manageServiceRecords, 'treatment'),
        'opd',
      );
      setReschedulePlanGroups(planGroups);
      setRescheduleCatalogTreatments(catalog);

      const rawDetails = Array.isArray(appt.details) ? appt.details : [];
      if (rawDetails.length) {
        setRescheduleSelectedTreatmentKeys(
          matchDetailsToTreatmentKeys(rawDetails, planGroups, catalog),
        );
      } else {
        setRescheduleSelectedTreatmentKeys(new Set());
      }
    } catch (err) {
      console.error('Failed to load reschedule treatments:', err);
      setReschedulePlanGroups([]);
      setRescheduleCatalogTreatments(
        mapCatalogTreatments(
          filterManageServicesByType(manageServiceRecords, 'treatment'),
          'opd',
        ),
      );
      setRescheduleSelectedTreatmentKeys(new Set());
    } finally {
      setRescheduleTreatmentsLoading(false);
    }
  };

  const mergeReschedulePinDate = (
    dates: { date: string; label?: string }[],
    pinDate?: string,
  ) => {
    if (!pinDate || dates.some(d => d.date === pinDate)) return dates;
    return [{ date: pinDate, label: formatApptCardDate(pinDate) }, ...dates];
  };

  const loadRescheduleDates = async (doctorId: string, pinDate?: string) => {
    if (!token || !doctorId) return;
    setRescheduleDatesLoading(true);
    try {
      const realAuthService = (await import('../services/realAuthService'))
        .default;
      const dates = await realAuthService.fetchBookingAvailability(
        doctorId,
        token,
      );
      setRescheduleAvailableDates(mergeReschedulePinDate(dates, pinDate));
    } catch (err) {
      console.error('Failed to load reschedule dates:', err);
      Alert.alert('Error', 'Could not load available dates.');
    } finally {
      setRescheduleDatesLoading(false);
    }
  };

  const loadRescheduleSlots = async (
    doctorId: string,
    date: string,
  ): Promise<BookableSlot[]> => {
    if (!token || !doctorId || !date) return [];
    setRescheduleSlotsLoading(true);
    try {
      const realAuthService = (await import('../services/realAuthService'))
        .default;
      const slots = await realAuthService.fetchDoctorSlots(
        doctorId,
        date,
        token,
      );
      setRescheduleSlots(slots);
      return slots;
    } catch (err) {
      console.error('Failed to load reschedule slots:', err);
      Alert.alert('Error', 'Could not load slots.');
      return [];
    } finally {
      setRescheduleSlotsLoading(false);
    }
  };

  const matchRescheduleSlotFromAppointment = (
    slots: BookableSlot[],
    appt: Appointment,
  ): BookableSlot | null => {
    const tokenCount = appt.tokenCount;
    if (tokenCount == null || Number(tokenCount) <= 0) return null;
    return (
      slots.find(s => Number(s.tokenCount) === Number(tokenCount)) ?? null
    );
  };

  const shouldPrefillRescheduleSlot = (date: string): boolean => {
    if (!selectedAppt) return false;
    const aptDate = appointmentKey(selectedAppt.date);
    return !!aptDate && aptDate === date;
  };

  const finalizeRescheduleSlots = async (
    doctorId: string,
    date: string,
    openPicker: boolean,
    prefillFromAppointment: boolean,
  ) => {
    const slots = await loadRescheduleSlots(doctorId, date);
    if (prefillFromAppointment && selectedAppt) {
      const match = matchRescheduleSlotFromAppointment(slots, selectedAppt);
      setSelectedRescheduleSlot(match);
    } else {
      setSelectedRescheduleSlot(null);
    }
    if (openPicker) {
      setRescheduleSlotPickerOpen(true);
    }
  };

  const openRescheduleModal = async () => {
    if (!selectedAppt || !token) return;
    const doctorId = String(selectedAppt.doctorId || '');
    const aptDate = appointmentKey(selectedAppt.date) || '';
    setRescheduleDoctorId(doctorId);
    setRescheduleDate(aptDate);
    setRescheduleAvailableDates([]);
    setRescheduleSlots([]);
    setSelectedRescheduleSlot(null);
    setRescheduleSlotPickerOpen(false);
    setRescheduleOpen(true);
    try {
      const realAuthService = (await import('../services/realAuthService'))
        .default;
      const doctors = await realAuthService.fetchDoctors(token);
      setRescheduleDoctors(
        (Array.isArray(doctors) ? doctors : []).map((d: any) => ({
          _id: String(d._id),
          name: d.name || d.doctorCode || 'Doctor',
          bookingMode: d.bookingMode,
        })),
      );
      const doctor = (Array.isArray(doctors) ? doctors : []).find(
        (d: any) => String(d._id) === doctorId,
      );
      const isSlot = isSlotBookingMode(doctor);
      setRescheduleIsSlotDoctor(isSlot);
      // initialize custom booking fields when doctor is custom booking mode
      if (!isSlot && doctor) {
        try {
          const { resolveCustomBookingDuration } = await import(
            '../utils/doctorBookingMode.util'
          );
          const d = resolveCustomBookingDuration(doctor);
          setRescheduleCustomDuration(String(d));
        } catch (e) {
          setRescheduleCustomDuration('15');
        }
        setRescheduleCustomStartTime('');
        setRescheduleCustomErrors(null);
      } else {
        setRescheduleCustomStartTime('');
        setRescheduleCustomDuration('');
        setRescheduleCustomErrors(null);
      }
      if (isSlot && doctorId) {
        await loadRescheduleDates(doctorId, aptDate);
        if (aptDate) {
          await finalizeRescheduleSlots(doctorId, aptDate, false, true);
        }
      }
      if (isFollowUpAppointment(selectedAppt) && selectedAppt.patientId) {
        setRescheduleTreatmentDropdownOpen(false);
        setRescheduleTreatmentSearch('');
        await loadRescheduleTreatmentOptions(selectedAppt);
      }
      // Auto-fill start time for custom booking doctors from the existing
      // appointment time or fallback to a sensible default.
      if (!isSlot && selectedAppt) {
        setRescheduleCustomStartTime(selectedAppt.time || defaultCustomStartTime());
      }
    } catch (err) {
      console.error('Failed to open reschedule:', err);
    }
  };

  const onRescheduleDoctorChange = async (doctorId: string) => {
    closeAnchoredDropdown();
    const aptDate = appointmentKey(selectedAppt?.date) || '';
    setRescheduleDoctorId(doctorId);
    setRescheduleDate(aptDate);
    setRescheduleSlots([]);
    setSelectedRescheduleSlot(null);
    const doctor = rescheduleDoctors.find(d => d._id === doctorId);
    const isSlot = isSlotBookingMode(doctor);
    setRescheduleIsSlotDoctor(isSlot);
    if (!isSlot && doctor) {
      try {
        const { resolveCustomBookingDuration } = await import(
          '../utils/doctorBookingMode.util'
        );
        const d = resolveCustomBookingDuration(doctor);
        setRescheduleCustomDuration(String(d));
      } catch (e) {
        setRescheduleCustomDuration('15');
      }
      setRescheduleCustomStartTime('');
      setRescheduleCustomErrors(null);
    } else {
      setRescheduleCustomStartTime('');
      setRescheduleCustomDuration('');
      setRescheduleCustomErrors(null);
    }
    if (isSlot && doctorId) {
      await loadRescheduleDates(doctorId, aptDate);
      if (aptDate) {
        await finalizeRescheduleSlots(doctorId, aptDate, true, true);
      } else {
        setRescheduleSlotPickerOpen(true);
      }
    } else {
      setRescheduleAvailableDates([]);
      setRescheduleSlots([]);
    }
  };

  const onRescheduleDateChange = async (date: string) => {
    closeAnchoredDropdown();
    setRescheduleDate(date);
    setSelectedRescheduleSlot(null);
    if (rescheduleIsSlotDoctor && rescheduleDoctorId && date) {
      await finalizeRescheduleSlots(
        rescheduleDoctorId,
        date,
        true,
        shouldPrefillRescheduleSlot(date),
      );
    } else {
      setRescheduleSlots([]);
    }
  };

  const submitReschedule = async () => {
    if (!selectedAppt || !token || isRescheduling) return;
    if (!rescheduleDoctorId) {
      Alert.alert('Reschedule', 'Please select a doctor.');
      return;
    }
    if (!rescheduleDate) {
      Alert.alert('Reschedule', 'Please select a date.');
      return;
    }
    if (rescheduleIsSlotDoctor && !selectedRescheduleSlot) {
      Alert.alert('Reschedule', 'Please select a slot.');
      return;
    }

    if (!rescheduleIsSlotDoctor) {
      const errors: { startTime?: string; duration?: string } = {};
      if (!rescheduleCustomStartTime || !rescheduleCustomStartTime.trim()) {
        errors.startTime = 'Please select a start time';
      }
      if (!rescheduleCustomDuration || Number(rescheduleCustomDuration) <= 0) {
        errors.duration = 'Please choose a valid duration';
      }
      if (Object.keys(errors).length) {
        setRescheduleCustomErrors(errors);
        Alert.alert('Reschedule', 'Please select start time and duration for custom booking.');
        setIsRescheduling(false);
        return;
      }
      setRescheduleCustomErrors(null);
    }

    const followUpReschedule = isFollowUpAppointment(selectedAppt);
    const rescheduleDetails = followUpReschedule
      ? collectSelectedFollowupDetails(
          rescheduleSelectedTreatmentKeys,
          reschedulePlanGroups,
          rescheduleCatalogTreatments,
          rescheduleDate || null,
        )
      : [];
    if (followUpReschedule && hasAssignedRescheduleTreatments && rescheduleDetails.length === 0) {
      Alert.alert('Reschedule', 'Select at least one treatment for this follow-up.');
      return;
    }

    setIsRescheduling(true);
    try {
      const realAuthService = (await import('../services/realAuthService'))
        .default;
      const originalDoctorId = String(selectedAppt.doctorId || '');
      const body: Record<string, unknown> = {
        queueId: selectedAppt._id,
        tenantId: selectedAppt.tenantId || currentUser?.tenantId,
        newDate: rescheduleDate,
        source: 'ADMIN_PANEL',
      };
      if (rescheduleDoctorId !== originalDoctorId) {
        body.newDoctorId = rescheduleDoctorId;
      }
      if (rescheduleIsSlotDoctor && selectedRescheduleSlot?.tokenCount != null) {
        body.newSlotTokenCount = selectedRescheduleSlot.tokenCount;
      }
      if (!rescheduleIsSlotDoctor) {
        // For custom booking doctors include appointment time and duration
        if (rescheduleCustomStartTime) body.newAppointmentTime = rescheduleCustomStartTime;
        if (rescheduleCustomDuration) body.newDuration = Number(rescheduleCustomDuration);
      }
      if (followUpReschedule) {
        body.details = rescheduleDetails;
      }
      await realAuthService.rescheduleAppointment(body, token);
      closeRescheduleModal();
      setSelectedAppt(null);
      await fetchAppointments();
      Alert.alert('Success', 'Appointment rescheduled successfully.');
    } catch (err: any) {
      console.error('Reschedule failed:', err);
      Alert.alert('Error', err?.message || 'Failed to reschedule appointment');
    } finally {
      setIsRescheduling(false);
    }
  };

  const handleFollowup = async () => {
    if (!selectedAppt || !token) return;
    const patientId = selectedAppt.patientId;
    if (!patientId) {
      Alert.alert(
        'Follow up',
        'Confirm arrival and link a patient before booking follow-up.',
      );
      return;
    }
    try {
      const realAuthService = (await import('../services/realAuthService'))
        .default;
      const patient = await realAuthService.moveToOpd(patientId, token);
      const appt = selectedAppt;
      setSelectedAppt(null);
      navigation.navigate('OPD', {
        appointment: appt,
        patient,
        openFollowup: true,
        followupLinkedTreatments: extractAppointmentTreatments(appt),
      });
    } catch (err) {
      console.error('Follow up navigation failed:', err);
      Alert.alert('Error', 'Could not open follow-up booking.');
    }
  };

  const renderCtaButton = (
    label: string,
    onPress: () => void,
    options?: {
      variant?: 'primary' | 'outline' | 'danger' | 'success' | 'warning' | 'reschedule' | 'absent';
      disabled?: boolean;
      loading?: boolean;
      fullWidth?: boolean;
    },
  ) => {
    const variant = options?.variant ?? 'outline';
    const btnStyle = [
      styles.ctaGridBtn,
      options?.fullWidth && styles.ctaGridBtnFull,
      variant === 'primary' && styles.ctaGridBtnPrimary,
      variant === 'danger' && styles.ctaGridBtnDanger,
      variant === 'success' && styles.ctaGridBtnSuccess,
      variant === 'warning' && styles.ctaGridBtnWarning,
      variant === 'reschedule' && styles.ctaGridBtnReschedule,
      variant === 'absent' && styles.ctaGridBtnAbsent,
      options?.disabled && styles.ctaGridBtnDisabled,
    ];
    const textStyle = [
      styles.ctaGridBtnText,
      variant === 'primary' && styles.ctaGridBtnTextPrimary,
      variant === 'danger' && styles.ctaGridBtnTextDanger,
      variant === 'success' && styles.ctaGridBtnTextSuccess,
      variant === 'warning' && styles.ctaGridBtnTextWarning,
      variant === 'reschedule' && styles.ctaGridBtnTextReschedule,
      variant === 'absent' && styles.ctaGridBtnTextAbsent,
    ];
    return (
      <TouchableOpacity
        key={label}
        style={btnStyle}
        activeOpacity={0.85}
        disabled={options?.disabled || options?.loading}
        onPress={onPress}
      >
        {options?.loading ? (
          <ActivityIndicator
            size="small"
            color={variant === 'primary' ? theme.colors.surface : theme.colors.primary}
          />
        ) : (
          <Text style={textStyle}>{label}</Text>
        )}
      </TouchableOpacity>
    );
  };

  const renderAppointmentCtaGrid = (appt: Appointment) => (
    <View style={styles.ctaGrid}>
      {canConfirmArrivalFor(appt)
        ? renderCtaButton('Confirm Arrival', openConfirmArrival, {
            variant: 'primary',
            fullWidth: true,
          })
        : null}

      {canMoveToOpdFor(appt)
        ? renderCtaButton('Move to OPD', handleMoveToOpd, {
            variant: 'primary',
            fullWidth: true,
            loading: movingToOpd,
            disabled: movingToOpd,
          })
        : null}

      {canConfirmArrivalFor(appt) && !canMoveToOpdFor(appt) ? (
        <Text style={styles.sheetHint}>Confirm arrival to enable OPD.</Text>
      ) : null}

      {!isAppointmentCancelled(appt) ? (
        isAppointmentActive(appt) ? (
          <View style={styles.ctaGridRow}>
            {renderCtaButton('Cancel Appointment', openCancelModal, {
              variant: 'danger',
            })}
            {renderCtaButton('Reschedule/Edit', openRescheduleModal, {
              variant: 'reschedule',
            })}
          </View>
        ) : (
          renderCtaButton('Cancel Appointment', openCancelModal, {
            variant: 'danger',
            fullWidth: true,
          })
        )
      ) : null}

      {isAppointmentActive(appt) ? (
        appt.patientId
          ? renderCtaButton('Follow up', handleFollowup, {
              variant: 'warning',
              fullWidth: true,
            })
          : renderCtaButton(
              'Follow up',
              () => {
                Alert.alert(
                  'Follow up',
                  'Confirm arrival and link a patient before booking follow-up.',
                );
              },
              { variant: 'warning', fullWidth: true, disabled: true },
            )
      ) : null}

      {isArrivalConfirmed(appt) && !isAppointmentCancelled(appt) ? (
        <View style={styles.ctaGridRow}>
          {renderCtaButton(
            'Complete',
            () => handleStatusUpdate('completed', 'Completed'),
            {
              variant: 'success',
              loading: statusUpdating === 'completed',
              disabled: statusUpdating != null,
            },
          )}
            {renderCtaButton(
            'Absent',
            () => handleStatusUpdate('absent', 'Absent'),
            {
              variant: 'absent',
              loading: statusUpdating === 'absent',
              disabled: statusUpdating != null,
            },
          )}
        </View>
      ) : null}
    </View>
  );

  const selectedRescheduleDoctorName = useMemo(() => {
    const doc = rescheduleDoctors.find(d => d._id === rescheduleDoctorId);
    return doc?.name || selectedAppt?.doctorName || 'Select doctor';
  }, [rescheduleDoctors, rescheduleDoctorId, selectedAppt?.doctorName]);

  const selectedRescheduleDateLabel = useMemo(() => {
    if (!rescheduleDate) return 'Choose date';
    const match = rescheduleAvailableDates.find(d => d.date === rescheduleDate);
    return match?.label || formatApptCardDate(rescheduleDate);
  }, [rescheduleDate, rescheduleAvailableDates]);

  const formatRescheduleSlotLabel = (slot: BookableSlot | null) => {
    if (!slot) return 'Select a slot';
    const start = slot.startTime || '';
    const end = slot.endTime ? ` – ${slot.endTime}` : '';
    const token =
      slot.tokenCount != null ? ` (T${slot.tokenCount})` : '';
    return `${start}${end}${token}`;
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

        <View ref={doctorSelectRef} collapsable={false} style={styles.doctorSelectWrap}>
        <TouchableOpacity
          style={styles.doctorSelectBox}
          activeOpacity={0.7}
          onPress={() => openAnchoredDropdown('calendarDoctor', doctorSelectRef)}
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
          {untimedAppointments.length > 0 ? (
            <View style={styles.gridHeader}>
              <View style={styles.gridHeaderTokens}>
                <Text style={styles.gridHeaderText}>TOKENS</Text>
              </View>
              <View style={styles.tokenListColumn}>
                {untimedAppointments.map(renderTokenChip)}
              </View>
            </View>
          ) : null}

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
            <View style={styles.timedApptSection}>
              {timedAppointments.map(renderAppointmentRow)}
            </View>
          )}
        </ScrollView>
      )}

      {/* Anchored dropdowns: calendar doctor filter + reschedule doctor/date */}
      <Modal
        visible={anchoredDropdown != null}
        transparent
        animationType="fade"
        statusBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={closeAnchoredDropdown}
      >
        <View style={styles.doctorDropdownRoot}>
          <Pressable
            style={styles.doctorDropdownBackdrop}
            onPress={closeAnchoredDropdown}
            accessibilityRole="button"
            accessibilityLabel="Close menu"
          />
          {anchoredDropdown ? (
            <View
              style={[
                styles.doctorDropdownPanel,
                {
                  top: anchoredDropdown.anchor.top,
                  left: anchoredDropdown.anchor.left,
                  width: anchoredDropdown.anchor.width,
                  maxHeight:
                    SCREEN_HEIGHT -
                    anchoredDropdown.anchor.top -
                    theme.spacing.lg,
                },
              ]}
            >
              <ScrollView
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator
              >
                {anchoredDropdown.kind === 'calendarDoctor' ? (
                  <>
                    <TouchableOpacity
                      style={styles.doctorOption}
                      activeOpacity={0.7}
                      onPress={() => {
                        setSelectedDoctorId(null);
                        closeAnchoredDropdown();
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
                    {doctorFilterOptions.map(doc => {
                      const isSelected = selectedDoctorId === doc.id;
                      return (
                        <TouchableOpacity
                          key={doc.id}
                          style={styles.doctorOption}
                          activeOpacity={0.7}
                          onPress={() => {
                            setSelectedDoctorId(doc.id);
                            closeAnchoredDropdown();
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
                          <Text style={styles.doctorOptionText} numberOfLines={2}>
                            {doc.name}
                          </Text>
                          {isSelected ? (
                            <Icon name="check" size={20} color={theme.colors.primary} />
                          ) : null}
                        </TouchableOpacity>
                      );
                    })}
                  </>
                ) : null}

                {anchoredDropdown.kind === 'rescheduleDoctor'
                  ? rescheduleDoctors.map(doc => {
                      const active = doc._id === rescheduleDoctorId;
                      return (
                        <TouchableOpacity
                          key={doc._id}
                          style={[
                            styles.doctorOption,
                            active && styles.rescheduleDoctorOptionActive,
                          ]}
                          onPress={() => onRescheduleDoctorChange(doc._id)}
                        >
                          <Text
                            style={[
                              styles.doctorOptionText,
                              active && styles.rescheduleDoctorOptionTextActive,
                            ]}
                            numberOfLines={2}
                          >
                            {doc.name}
                          </Text>
                          {active ? (
                            <Icon name="check" size={20} color={theme.colors.primary} />
                          ) : null}
                        </TouchableOpacity>
                      );
                    })
                  : null}

                {anchoredDropdown.kind === 'rescheduleDate'
                  ? rescheduleAvailableDates.map(item => {
                      const active = item.date === rescheduleDate;
                      return (
                        <TouchableOpacity
                          key={item.date}
                          style={[
                            styles.doctorOption,
                            active && styles.rescheduleDoctorOptionActive,
                          ]}
                          onPress={() => onRescheduleDateChange(item.date)}
                        >
                          <Text
                            style={[
                              styles.doctorOptionText,
                              active && styles.rescheduleDoctorOptionTextActive,
                            ]}
                            numberOfLines={2}
                          >
                            {item.label || formatApptCardDate(item.date)}
                          </Text>
                          {active ? (
                            <Icon name="check" size={20} color={theme.colors.primary} />
                          ) : null}
                        </TouchableOpacity>
                      );
                    })
                  : null}
              </ScrollView>
            </View>
          ) : null}
        </View>
      </Modal>

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
                        name={searchPatientsError ? 'error-outline' : 'people-outline'}
                        size={48}
                        color={theme.colors.disabled}
                      />
                      <Text style={styles.patientSearchEmptyText}>
                        {searchPatientsError
                          ? searchPatientsError
                          : patientSearchQuery.trim()
                          ? `No patients match "${patientSearchQuery}"`
                          : 'No patients found'}
                      </Text>
                      {searchPatientsError ? (
                        <TouchableOpacity
                          style={styles.patientSearchRetryBtn}
                          onPress={() => fetchSearchPatients()}
                        >
                          <Text style={styles.patientSearchRetryText}>Retry</Text>
                        </TouchableOpacity>
                      ) : null}
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

      {/* Appointment details — full screen */}
      <ModalBackdrop
        visible={selectedAppt != null}
        onClose={() => setSelectedAppt(null)}
        animationType="slide"
        align="full"
      >
        <SafeAreaView edges={['top', 'bottom']} style={styles.apptDetailsSheet}>
          <View style={styles.apptDetailsSheetHeader}>
            <Text style={styles.apptDetailsSheetTitle}>Appointment Details</Text>
            <View style={styles.apptDetailsSheetHeaderActions}>
              {selectedAppt?.patientId ? (
                <TouchableOpacity
                  onPress={handleEditPatient}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityLabel="Edit patient"
                >
                  <Icon name="edit" size={16} color={theme.colors.primary} />
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                onPress={() => setSelectedAppt(null)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Icon name="close" size={22} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
          </View>

          {selectedAppt && (
            <ScrollView
              style={styles.apptDetailsScroll}
              contentContainerStyle={styles.apptDetailsScrollContent}
              showsVerticalScrollIndicator
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.sheetHeader}>
                <View style={styles.sheetAvatar}>
                  <Icon
                    name="person"
                    size={18}
                    color={theme.colors.textSecondary}
                  />
                </View>
                <TouchableOpacity
                  style={styles.sheetHeaderCol}
                  activeOpacity={selectedAppt.patientId ? 0.7 : 1}
                  onPress={handlePatientHeaderPress}
                  disabled={!selectedAppt.patientId || movingToOpd}
                >
                  <Text style={styles.sheetHeaderLabel}>NAME</Text>
                  <Text
                    style={[
                      styles.sheetHeaderValue,
                      selectedAppt.patientId && styles.sheetHeaderValueLink,
                    ]}
                    numberOfLines={1}
                  >
                    {selectedAppt.patientName || 'Unknown'}
                  </Text>
                  {selectedAppt.patientId ? (
                    <Text style={styles.sheetHeaderOpdHint}>Tap to open OPD</Text>
                  ) : null}
                </TouchableOpacity>
                <View style={styles.sheetHeaderColDivider} />
                <View style={styles.sheetHeaderCol}>
                  <Text style={styles.sheetHeaderLabel}>MOBILE</Text>
                  <TouchableOpacity
                    onPress={() => handlePatientCall(selectedAppt.mobileNo)}
                    disabled={!selectedAppt.mobileNo}
                  >
                    <Text
                      style={[
                        styles.sheetHeaderValue,
                        styles.sheetHeaderMobile,
                      ]}
                      numberOfLines={1}
                    >
                      {selectedAppt.mobileNo || '—'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.sheetHeaderColDivider} />
                <View style={styles.sheetHeaderCol}>
                  <Text style={styles.sheetHeaderLabel}>UHID</Text>
                  <Text style={styles.sheetHeaderValue} numberOfLines={1}>
                    {selectedAppt.uhid || '—'}
                  </Text>
                </View>
              </View>

              <View style={styles.sheetBody}>
                <Text style={styles.sheetSectionTitle}>Appointment details</Text>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Date</Text>
                  <Text style={styles.detailValue}>
                    {formatApptCardDate(selectedAppt.date)}
                  </Text>
                </View>

                {(hasAppointmentStartTime(selectedAppt) ||
                  selectedAppt.duration ||
                  shouldShowTokenDetail(selectedAppt)) ? (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>
                      {hasAppointmentStartTime(selectedAppt) ? 'Time' : 'Visit'}
                    </Text>
                    <Text style={styles.detailValue}>
                      {getAppointmentVisitDisplay(selectedAppt)}
                    </Text>
                  </View>
                ) : null}

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Doctor</Text>
                  <Text style={styles.detailValue}>
                    {selectedAppt.doctorName || '—'}
                  </Text>
                </View>

                {shouldShowTokenDetail(selectedAppt) ? (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Token</Text>
                    <Text style={styles.detailValue}>
                      T{selectedAppt.tokenCount}
                    </Text>
                  </View>
                ) : null}

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Gender / Age</Text>
                  <Text style={styles.detailValue}>
                    {formatGenderAge(selectedAppt)}
                  </Text>
                </View>

                <View style={[styles.detailRow, styles.detailRowStatusArrival]}>
                  <View style={styles.statusArrivalLine}>
                    <Text style={styles.statusArrivalLabel}>Status:</Text>
                    <Text
                      style={[
                        styles.statusArrivalValue,
                        {
                          color: getStatusDetailColor(selectedAppt.status),
                        },
                      ]}
                    >
                      {getStatusLabel(selectedAppt.status)}
                    </Text>
                    <Text style={styles.statusArrivalSep}>·</Text>
                    <Text style={styles.statusArrivalLabel}>Arrival:</Text>
                    <Text
                      style={[
                        styles.statusArrivalValue,
                        {
                          color: isArrivalConfirmed(selectedAppt)
                            ? '#16A34A'
                            : '#92400E',
                        },
                      ]}
                    >
                      {isArrivalConfirmed(selectedAppt)
                        ? 'Confirmed'
                        : 'Pending'}
                    </Text>
                  </View>
                </View>

                <View style={[styles.detailRow, styles.detailRowAddress]}>
                  <Text style={styles.detailLabel}>Address</Text>
                  <Text style={[styles.detailValue, styles.detailValueMultiline]}>
                    {formatAddress(selectedAppt)}
                  </Text>
                </View>

                {selectedApptTreatments.length > 0 ||
                selectedAppt.visitType === 'FOLLOW_UP' ? (
                  <View style={styles.treatmentListBlock}>
                    <Text style={styles.treatmentListTitle}>Treatment details</Text>
                    {selectedApptTreatments.length === 0 ? (
                      <Text style={styles.confirmHint}>
                        No treatments linked to this follow-up.
                      </Text>
                    ) : (
                      selectedApptTreatments.map((treatment, index) => (
                        <View
                          key={`selected-treatment-${index}`}
                          style={[
                            styles.treatmentListItem,
                            index === selectedApptTreatments.length - 1 && {
                              borderBottomWidth: 0,
                            },
                          ]}
                        >
                          <Text style={styles.treatmentListName}>
                            {treatment.treatmentDesc}
                          </Text>
                          {treatment.date ? (
                            <Text style={styles.treatmentListDate}>
                              {formatApptCardDate(treatment.date)}
                            </Text>
                          ) : null}
                        </View>
                      ))
                    )}
                  </View>
                ) : null}
              </View>

              {renderAppointmentCtaGrid(selectedAppt)}

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

          {selectedAppt?.patientId ? (
            <OPDActionsFab
              onUploadPrescriptionPress={() =>
                void navigateToOpdFromDetails({ openUpload: 'prescription' })
              }
              onUploadProcedurePress={() =>
                void navigateToOpdFromDetails({ openUpload: 'procedure' })
              }
              onUploadLabPress={() =>
                void navigateToOpdFromDetails({ openUpload: 'lab' })
              }
              onTreatmentPlanPress={() =>
                void navigateToOpdFromDetails({ openTreatmentPlan: true })
              }
              onFollowupPress={() =>
                void navigateToOpdFromDetails({
                  openFollowup: true,
                })
              }
              showTreatmentPlan={canManageTreatmentPlanAccess}
            />
          ) : null}
        </SafeAreaView>
      </ModalBackdrop>

      <ModalBackdrop
        visible={confirmArrivalOpen}
        onClose={closeConfirmArrival}
        animationType="slide"
        align="bottom"
        dismissOnBackdropPress
      >
        <SafeAreaView edges={['bottom']} style={styles.confirmArrivalSheet}>
          <View style={styles.apptDetailsSheetHandle} />
          <View style={styles.confirmModalCard}>
            <View style={styles.confirmModalHeader}>
              <Text style={styles.confirmModalTitle}>Confirm Arrival</Text>
            <TouchableOpacity
              onPress={closeConfirmArrival}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon name="close" size={22} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.confirmSectionTitle}>Patient details</Text>
            {!selectedAppt?.patientId ? (
              <Text style={styles.confirmHint}>
                Verify name and mobile, then link to an existing patient or
                create a new one.
              </Text>
            ) : null}

            <Text style={styles.confirmFieldLabel}>Patient name</Text>
            <TextInput
              style={styles.confirmInput}
              value={confirmPatientName}
              onChangeText={setConfirmPatientName}
              placeholder="Patient name"
            />

            <Text style={styles.confirmFieldLabel}>Mobile</Text>
            <TextInput
              style={styles.confirmInput}
              value={confirmMobileNo}
              onChangeText={value => {
                setConfirmMobileNo(value);
              }}
              onEndEditing={() => {
                if (selectedAppt) {
                  loadConfirmArrivalPreview(
                    selectedAppt,
                    normalizeMobile(confirmMobileNo),
                  );
                }
              }}
              placeholder="10-digit mobile"
              keyboardType="phone-pad"
              maxLength={10}
            />

            {isLoadingConfirmPreview ? (
              <ActivityIndicator
                style={styles.confirmLoader}
                color={theme.colors.primary}
              />
            ) : (
              <>
                <View style={styles.confirmAmountRow}>
                  <Text style={styles.confirmFieldLabel}>Expense</Text>
                  <TextInput
                    style={styles.confirmAmountInput}
                    value={String(confirmExpenseAmount || '')}
                    onChangeText={v =>
                      setConfirmExpenseAmount(Number(v.replace(/\D/g, '')) || 0)
                    }
                    keyboardType="number-pad"
                  />
                </View>
                <View style={styles.confirmAmountRow}>
                  <Text style={styles.confirmFieldLabel}>Already paid</Text>
                  <TextInput
                    style={styles.confirmAmountInput}
                    value={String(confirmAlreadyPaid || '')}
                    onChangeText={v =>
                      setConfirmAlreadyPaid(Number(v.replace(/\D/g, '')) || 0)
                    }
                    keyboardType="number-pad"
                  />
                </View>
                <View style={styles.confirmAmountRow}>
                  <Text style={styles.confirmFieldLabel}>Pay now</Text>
                  <TextInput
                    style={styles.confirmAmountInput}
                    value={String(confirmNowPaying || '')}
                    onChangeText={v =>
                      setConfirmNowPaying(Number(v.replace(/\D/g, '')) || 0)
                    }
                    keyboardType="number-pad"
                  />
                </View>
                <View style={styles.confirmAmountRow}>
                  <Text style={styles.confirmFieldLabel}>Discount</Text>
                  <TextInput
                    style={styles.confirmAmountInput}
                    value={String(confirmDiscount || '')}
                    onChangeText={v =>
                      setConfirmDiscount(Number(v.replace(/\D/g, '')) || 0)
                    }
                    keyboardType="number-pad"
                  />
                </View>
                <View style={styles.confirmAmountRow}>
                  <Text style={styles.confirmFieldLabel}>Refund</Text>
                  <TextInput
                    style={styles.confirmAmountInput}
                    value={String(confirmRefundAmount || '')}
                    onChangeText={v =>
                      setConfirmRefundAmount(Number(v.replace(/\D/g, '')) || 0)
                    }
                    keyboardType="number-pad"
                  />
                </View>
                <View style={styles.confirmPendingBox}>
                  <Text style={styles.confirmPendingLabel}>Pending</Text>
                  <Text
                    style={[
                      styles.confirmPendingValue,
                      confirmArrivalPendingCalc > 0 && styles.confirmPendingDue,
                    ]}
                  >
                    ₹{confirmArrivalPendingCalc}
                  </Text>
                </View>

                {matchingPatients.length > 0 ? (
                  <View style={styles.confirmMatches}>
                    <Text style={styles.confirmFieldLabel}>
                      Matching patients ({matchingPatients.length})
                    </Text>
                    {matchingPatients.map(patient => {
                      const active = selectedPatientId === patient._id;
                      return (
                        <TouchableOpacity
                          key={patient._id}
                          style={[
                            styles.confirmMatchItem,
                            active && styles.confirmMatchItemActive,
                          ]}
                          onPress={() => selectMatchingPatient(patient._id)}
                        >
                          <Text style={styles.confirmMatchName}>
                            {patient.name}
                          </Text>
                          <Text style={styles.confirmMatchMeta}>
                            UHID {patient.uhid || '—'} ·{' '}
                            {patient.mobileNo || '—'}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                    <TouchableOpacity
                      style={[
                        styles.confirmMatchItem,
                        selectedPatientId === '__new__' &&
                          styles.confirmMatchItemActive,
                      ]}
                      onPress={selectCreateNewPatient}
                    >
                      <Text style={styles.confirmMatchName}>
                        Create new patient
                      </Text>
                      <Text style={styles.confirmMatchMeta}>
                        Register and link this appointment
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : null}

                {requiresPatientSelection ? (
                  <Text style={styles.confirmWarning}>
                    Multiple patients share this mobile — select one to link
                    queue and payment.
                  </Text>
                ) : null}
              </>
            )}
          </ScrollView>

          <TouchableOpacity
            style={[
              styles.sheetPrimaryBtn,
              (isConfirmingArrival ||
                isLoadingConfirmPreview ||
                confirmArrivalPendingCalc > 0 ||
                requiresPatientSelection) &&
                styles.sheetPrimaryBtnDisabled,
            ]}
            activeOpacity={0.85}
            disabled={
              isConfirmingArrival ||
              isLoadingConfirmPreview ||
              confirmArrivalPendingCalc > 0 ||
              requiresPatientSelection
            }
            onPress={submitConfirmArrival}
          >
            {isConfirmingArrival ? (
              <ActivityIndicator size="small" color={theme.colors.surface} />
            ) : (
              <Text style={styles.sheetPrimaryText}>Confirm Arrival</Text>
            )}
          </TouchableOpacity>
          </View>
        </SafeAreaView>
      </ModalBackdrop>

      {/* Cancel appointment */}
      <ModalBackdrop
        visible={cancelOpen}
        onClose={closeCancelModal}
        animationType="slide"
        align="bottom"
      >
        <SafeAreaView edges={['bottom']} style={styles.confirmArrivalSheet}>
          <View style={styles.apptDetailsSheetHandle} />
          <View style={styles.confirmModalCard}>
          <View style={styles.confirmModalHeader}>
            <Text style={styles.confirmModalTitle}>
              {selectedAppt && isWhatsappSource(selectedAppt)
                ? 'Cancel & Refund'
                : 'Cancel Appointment'}
            </Text>
            <TouchableOpacity
              onPress={closeCancelModal}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon name="close" size={22} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.confirmSectionTitle}>
              {selectedAppt?.patientName || 'Patient'}
            </Text>
            <Text style={styles.confirmHint}>
              {selectedAppt && isWhatsappSource(selectedAppt)
                ? 'This will cancel the appointment and initiate a refund to the patient.'
                : 'This will cancel the appointment.'}
            </Text>

            {selectedAppt && !isWhatsappSource(selectedAppt) ? (
              <>
                <Text style={styles.confirmFieldLabel}>
                  Was the payment refunded?
                </Text>
                {(['yes', 'later', 'none'] as const).map(option => (
                  <TouchableOpacity
                    key={option}
                    style={styles.refundOptionRow}
                    onPress={() => setCancelRefundOption(option)}
                  >
                    <Icon
                      name={
                        cancelRefundOption === option
                          ? 'radio-button-checked'
                          : 'radio-button-unchecked'
                      }
                      size={20}
                      color={theme.colors.primary}
                    />
                    <Text style={styles.refundOptionText}>
                      {option === 'yes'
                        ? 'Yes, refunded now'
                        : option === 'later'
                          ? 'No, will refund later'
                          : 'No payment collected'}
                    </Text>
                  </TouchableOpacity>
                ))}
                {cancelRefundOption === 'yes' ? (
                  <>
                    <Text style={styles.confirmFieldLabel}>
                      Refund amount (₹)
                    </Text>
                    <TextInput
                      style={styles.confirmInput}
                      value={cancelRefundAmount}
                      onChangeText={setCancelRefundAmount}
                      keyboardType="numeric"
                      placeholder="Enter amount refunded"
                    />
                  </>
                ) : null}
              </>
            ) : null}

            <Text style={styles.confirmFieldLabel}>Remark (optional)</Text>
            <TextInput
              style={styles.confirmInput}
              value={cancelRemark}
              onChangeText={setCancelRemark}
              placeholder="Reason for cancellation"
            />
          </ScrollView>

          <View style={styles.modalFooterRow}>
            <TouchableOpacity
              style={[styles.ctaGridBtn, styles.modalFooterBtn]}
              onPress={closeCancelModal}
            >
              <Text style={styles.ctaGridBtnText}>Keep Appointment</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.ctaGridBtn,
                styles.modalFooterBtn,
                styles.ctaGridBtnDanger,
                isCancelling && styles.ctaGridBtnDisabled,
              ]}
              disabled={
                isCancelling ||
                (!!selectedAppt &&
                  !isWhatsappSource(selectedAppt) &&
                  cancelRefundOption === null)
              }
              onPress={submitCancelAppointment}
            >
              {isCancelling ? (
                <ActivityIndicator size="small" color="#C62828" />
              ) : (
                <Text style={styles.ctaGridBtnTextDanger}>
                  {selectedAppt && isWhatsappSource(selectedAppt)
                    ? 'Cancel & Refund'
                    : 'Yes, Cancel'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
          </View>
        </SafeAreaView>
      </ModalBackdrop>

      {/* Reschedule appointment */}
      <ModalBackdrop
        visible={rescheduleOpen}
        onClose={closeRescheduleModal}
        animationType="slide"
        align="bottom"
      >
        <SafeAreaView edges={['bottom']} style={styles.rescheduleSheet}>
          <View style={styles.apptDetailsSheetHandle} />
          <View style={styles.confirmModalHeader}>
            <Text style={styles.confirmModalTitle}>Reschedule Appointment</Text>
            <TouchableOpacity
              onPress={closeRescheduleModal}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon name="close" size={22} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.rescheduleScroll}
            contentContainerStyle={styles.rescheduleScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.confirmSectionTitle}>
              {selectedAppt?.patientName || 'Patient'}
            </Text>

            <Text style={styles.confirmFieldLabel}>Doctor</Text>
            <View ref={rescheduleDoctorBtnRef} collapsable={false}>
              <TouchableOpacity
                style={styles.slotSelectBtn}
                onPress={() =>
                  openAnchoredDropdown('rescheduleDoctor', rescheduleDoctorBtnRef)
                }
              >
                <Text style={styles.slotSelectBtnText} numberOfLines={2}>
                  {selectedRescheduleDoctorName}
                </Text>
                <Icon
                  name="expand-more"
                  size={22}
                  color={theme.colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            {rescheduleIsSlotDoctor ? (
              <>
                <Text style={styles.confirmFieldLabel}>Select new date</Text>
                {rescheduleDatesLoading ? (
                  <ActivityIndicator color={theme.colors.primary} />
                ) : rescheduleAvailableDates.length === 0 ? (
                  <Text style={styles.confirmHint}>
                    No available dates for this doctor.
                  </Text>
                ) : (
                  <View ref={rescheduleDateBtnRef} collapsable={false}>
                    <TouchableOpacity
                      style={styles.slotSelectBtn}
                      onPress={() =>
                        openAnchoredDropdown('rescheduleDate', rescheduleDateBtnRef)
                      }
                    >
                      <Text style={styles.slotSelectBtnText} numberOfLines={2}>
                        {selectedRescheduleDateLabel}
                      </Text>
                      <Icon
                        name="expand-more"
                        size={22}
                        color={theme.colors.textSecondary}
                      />
                    </TouchableOpacity>
                  </View>
                )}

                {rescheduleDate ? (
                  <>
                    <Text style={styles.confirmFieldLabel}>Select slot</Text>
                    <TouchableOpacity
                      style={styles.slotSelectBtn}
                      onPress={() => setRescheduleSlotPickerOpen(true)}
                      disabled={rescheduleSlotsLoading}
                    >
                      <Text style={styles.slotSelectBtnText}>
                        {rescheduleSlotsLoading
                          ? 'Loading slots...'
                          : formatRescheduleSlotLabel(selectedRescheduleSlot)}
                      </Text>
                      <Icon
                        name="expand-more"
                        size={22}
                        color={theme.colors.textSecondary}
                      />
                    </TouchableOpacity>
                  </>
                ) : null}
              </>
            ) : (
              <>
                <Text style={styles.confirmFieldLabel}>Select new date</Text>
                <TouchableOpacity
                  style={styles.slotSelectBtn}
                  onPress={() => setShowTokenRescheduleDatePicker(true)}
                >
                  <Text style={styles.slotSelectBtnText}>
                    {rescheduleDate
                      ? formatApptCardDate(rescheduleDate)
                      : 'Choose date'}
                  </Text>
                  <Icon
                    name="calendar-today"
                    size={20}
                    color={theme.colors.textSecondary}
                  />
                </TouchableOpacity>
              </>
            )}

            {/* If doctor uses custom booking (not slot), show start time + duration fields */}
            {!rescheduleIsSlotDoctor ? (
              <CustomBookingTimeFields
                startTime={rescheduleCustomStartTime}
                durationMinutes={rescheduleCustomDuration}
                onStartTimeChange={setRescheduleCustomStartTime}
                onDurationChange={setRescheduleCustomDuration}
                errors={rescheduleCustomErrors || undefined}
              />
            ) : null}

            {isFollowUpAppointment(selectedAppt) ? (
              <>
                <Text style={styles.confirmFieldLabel}>
                  Treatment
                  {!hasAssignedRescheduleTreatments ? (
                    <Text style={styles.rescheduleTreatmentOptional}> (optional)</Text>
                  ) : null}
                </Text>
                <TouchableOpacity
                  style={styles.rescheduleTreatmentField}
                  activeOpacity={0.7}
                  disabled={
                    rescheduleTreatmentsLoading ||
                    (!rescheduleCatalogTreatments.length && !reschedulePlanGroups.length)
                  }
                  onPress={() =>
                    setRescheduleTreatmentDropdownOpen(open => !open)
                  }
                >
                  <Text
                    style={[
                      styles.rescheduleTreatmentFieldText,
                      rescheduleSelectedTreatmentKeys.size === 0 &&
                        styles.rescheduleTreatmentPlaceholder,
                    ]}
                    numberOfLines={1}
                  >
                    {rescheduleTreatmentTriggerLabel}
                  </Text>
                  {rescheduleTreatmentsLoading ? (
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                  ) : (
                    <Icon
                      name={
                        rescheduleTreatmentDropdownOpen
                          ? 'expand-less'
                          : 'expand-more'
                      }
                      size={22}
                      color={theme.colors.textSecondary}
                    />
                  )}
                </TouchableOpacity>

                {selectedRescheduleTreatmentSummaries.length > 0 ? (
                  <View style={styles.rescheduleSelectedTreatments}>
                    {selectedRescheduleTreatmentSummaries.map(treatment => (
                      <View
                        key={treatment.key}
                        style={styles.rescheduleSelectedTreatmentRow}
                      >
                        <Text
                          style={styles.rescheduleSelectedTreatmentText}
                          numberOfLines={1}
                        >
                          {treatment.treatmentDesc}
                        </Text>
                        <TouchableOpacity
                          onPress={() => toggleRescheduleTreatment(treatment.key)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Icon
                            name="close"
                            size={18}
                            color={theme.colors.textSecondary}
                          />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                ) : null}

                {rescheduleTreatmentDropdownOpen ? (
                  <View style={styles.rescheduleTreatmentDropdown}>
                    <TextInput
                      style={styles.rescheduleTreatmentSearch}
                      value={rescheduleTreatmentSearch}
                      onChangeText={setRescheduleTreatmentSearch}
                      placeholder="Search treatments"
                      placeholderTextColor={theme.colors.placeholder}
                    />

                    {rescheduleTreatmentsLoading ? (
                      <ActivityIndicator
                        size="small"
                        color={theme.colors.primary}
                        style={styles.rescheduleTreatmentLoader}
                      />
                    ) : filteredReschedulePlanGroups.length === 0 &&
                      filteredRescheduleCatalogTreatments.length === 0 ? (
                      <Text style={styles.rescheduleTreatmentEmpty}>
                        {rescheduleTreatmentSearch.trim()
                          ? 'No treatments match your search'
                          : 'No treatments available'}
                      </Text>
                    ) : (
                      <ScrollView
                        nestedScrollEnabled
                        keyboardShouldPersistTaps="handled"
                        style={styles.rescheduleTreatmentList}
                      >
                        {filteredReschedulePlanGroups.map(group => (
                          <View key={group.planId}>
                            <Text style={styles.rescheduleTreatmentGroupTitle}>
                              {group.planTitle}
                            </Text>
                            {group.treatments.map(treatment => {
                              const active = rescheduleSelectedTreatmentKeys.has(
                                treatment.key,
                              );
                              return (
                                <TouchableOpacity
                                  key={treatment.key}
                                  style={styles.rescheduleTreatmentOption}
                                  activeOpacity={0.7}
                                  onPress={() =>
                                    toggleRescheduleTreatment(treatment.key)
                                  }
                                >
                                  <Icon
                                    name={
                                      active
                                        ? 'check-box'
                                        : 'check-box-outline-blank'
                                    }
                                    size={20}
                                    color={
                                      active
                                        ? theme.colors.primary
                                        : theme.colors.textSecondary
                                    }
                                  />
                                  <View style={styles.rescheduleTreatmentOptionBody}>
                                    <Text style={styles.rescheduleTreatmentOptionName}>
                                      {treatment.treatmentDesc}
                                    </Text>
                                  </View>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        ))}

                        {filteredRescheduleCatalogTreatments.length > 0 ? (
                          <>
                            <Text style={styles.rescheduleTreatmentGroupTitle}>
                              Catalog
                            </Text>
                            {filteredRescheduleCatalogTreatments.map(treatment => {
                              const active = rescheduleSelectedTreatmentKeys.has(
                                treatment.key,
                              );
                              return (
                                <TouchableOpacity
                                  key={treatment.key}
                                  style={styles.rescheduleTreatmentOption}
                                  activeOpacity={0.7}
                                  onPress={() =>
                                    toggleRescheduleTreatment(treatment.key)
                                  }
                                >
                                  <Icon
                                    name={
                                      active
                                        ? 'check-box'
                                        : 'check-box-outline-blank'
                                    }
                                    size={20}
                                    color={
                                      active
                                        ? theme.colors.primary
                                        : theme.colors.textSecondary
                                    }
                                  />
                                  <View style={styles.rescheduleTreatmentOptionBody}>
                                    <Text style={styles.rescheduleTreatmentOptionName}>
                                      {treatment.treatmentDesc}
                                    </Text>
                                  </View>
                                </TouchableOpacity>
                              );
                            })}
                          </>
                        ) : null}
                      </ScrollView>
                    )}
                  </View>
                ) : null}
              </>
            ) : null}
          </ScrollView>

          <View style={[styles.modalFooterRow, styles.rescheduleFooter]}>
            <TouchableOpacity
              style={[styles.ctaGridBtn, styles.modalFooterBtn]}
              onPress={closeRescheduleModal}
            >
              <Text style={styles.ctaGridBtnText}>Close</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.ctaGridBtn,
                styles.modalFooterBtn,
                styles.ctaGridBtnPrimary,
                isRescheduling && styles.ctaGridBtnDisabled,
              ]}
              disabled={isRescheduling}
              onPress={submitReschedule}
            >
              {isRescheduling ? (
                <ActivityIndicator size="small" color={theme.colors.surface} />
              ) : (
                <Text style={styles.ctaGridBtnTextPrimary}>
                  Confirm Reschedule
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </ModalBackdrop>

      <ModalBackdrop
        visible={rescheduleSlotPickerOpen}
        onClose={() => setRescheduleSlotPickerOpen(false)}
        animationType="fade"
        align="center"
      >
        <View style={styles.slotModalCard}>
          <View style={styles.slotModalHeader}>
            <Text style={styles.slotModalTitle}>Select Slot</Text>
            <TouchableOpacity
              onPress={() => setRescheduleSlotPickerOpen(false)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon name="close" size={22} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
          <Text style={styles.slotModalSubtitle}>
            {formatApptCardDate(rescheduleDate)}
          </Text>
          <SlotPickerGrid
            slots={rescheduleSlots}
            selectedSlotId={selectedRescheduleSlot?._id}
            loading={rescheduleSlotsLoading}
            onSelect={slot => {
              if (!isSlotSelectable(slot)) return;
              setSelectedRescheduleSlot(slot);
              setRescheduleSlotPickerOpen(false);
            }}
          />
        </View>
      </ModalBackdrop>

      <DatePicker
        modal
        open={showTokenRescheduleDatePicker}
        date={
          rescheduleDate
            ? new Date(`${rescheduleDate}T12:00:00`)
            : new Date()
        }
        mode="date"
        onConfirm={date => {
          const key = toKey(date);
          setShowTokenRescheduleDatePicker(false);
          onRescheduleDateChange(key);
        }}
        onCancel={() => setShowTokenRescheduleDatePicker(false)}
      />

      {/* Long-press appointment tooltip (mobile equivalent of web hover) */}
      <ModalBackdrop
        visible={tooltipAppt != null}
        onClose={() => setTooltipAppt(null)}
        animationType="fade"
        align="center"
      >
        {tooltipAppt ? (
          <View style={styles.tooltipCard}>
            {shouldStrikeAppointment(tooltipAppt) ? (
              <View
                style={[
                  styles.tooltipStatusBanner,
                  {
                    backgroundColor: getStatusBadgeColors(
                      isAppointmentCancelled(tooltipAppt) ? 'cancelled' : 'absent',
                    ).bg,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.tooltipStatusBannerText,
                    {
                      color: getStatusBadgeColors(
                        isAppointmentCancelled(tooltipAppt) ? 'cancelled' : 'absent',
                      ).text,
                    },
                  ]}
                >
                  {getAppointmentStatusLabel(tooltipAppt)}
                </Text>
              </View>
            ) : null}
            <Text style={styles.tooltipTitle}>Appointment details</Text>
            <View style={styles.tooltipRow}>
              <Text style={styles.tooltipLabel}>Doctor</Text>
              <Text
                style={[
                  styles.tooltipValue,
                  shouldStrikeAppointment(tooltipAppt) && styles.apptStruckText,
                ]}
              >
                {tooltipAppt.doctorName || '—'}
              </Text>
            </View>
            <View style={styles.tooltipRow}>
              <Text style={styles.tooltipLabel}>Patient</Text>
              <Text
                style={[
                  styles.tooltipValue,
                  shouldStrikeAppointment(tooltipAppt) && styles.apptStruckText,
                ]}
              >
                {tooltipAppt.patientName || '—'}
              </Text>
            </View>
            <View style={styles.tooltipRow}>
              <Text style={styles.tooltipLabel}>Gender / Age</Text>
              <Text style={styles.tooltipValue}>
                {formatGenderAge(tooltipAppt)}
              </Text>
            </View>
            <View style={styles.tooltipRow}>
              <Text style={styles.tooltipLabel}>Date</Text>
              <Text style={styles.tooltipValue}>
                {formatApptCardDate(tooltipAppt.date)}
              </Text>
            </View>
            <View style={styles.tooltipRow}>
              <Text style={styles.tooltipLabel}>Visit</Text>
              <Text style={[styles.tooltipValue, styles.tooltipValueMultiline]}>
                {getConsultationLabel(tooltipAppt)}
              </Text>
            </View>
            <View style={styles.tooltipRow}>
              <Text style={styles.tooltipLabel}>
                {hasAppointmentStartTime(tooltipAppt) ? 'Time' : 'Token'}
              </Text>
              <Text style={styles.tooltipValue}>
                {getAppointmentVisitDisplay(tooltipAppt)}
              </Text>
            </View>
            {!shouldStrikeAppointment(tooltipAppt) ? (
              <View style={styles.tooltipRow}>
                <Text style={styles.tooltipLabel}>Status</Text>
                <Text style={styles.tooltipValue}>
                  {getAppointmentStatusLabel(tooltipAppt)}
                </Text>
              </View>
            ) : null}
            {shouldStrikeAppointment(tooltipAppt) &&
            getCancellationReason(tooltipAppt) ? (
              <View style={styles.tooltipRow}>
                <Text style={styles.tooltipLabel}>Reason</Text>
                <Text style={[styles.tooltipValue, styles.tooltipValueMultiline]}>
                  {getCancellationReason(tooltipAppt)}
                </Text>
              </View>
            ) : null}
            {extractAppointmentTreatments(tooltipAppt).map((treatment, index) => (
              <View key={`tooltip-treatment-${index}`} style={styles.tooltipRow}>
                <Text style={styles.tooltipLabel}>
                  {index === 0 ? 'Treatment' : ''}
                </Text>
                <Text style={styles.tooltipValue}>{treatment.treatmentDesc}</Text>
              </View>
            ))}
            <View style={styles.tooltipRow}>
              <Text style={styles.tooltipLabel}>Address</Text>
              <Text style={[styles.tooltipValue, styles.tooltipValueMultiline]}>
                {formatAddress(tooltipAppt)}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.ctaGridBtn, styles.ctaGridBtnPrimary, styles.tooltipCloseBtn]}
              onPress={() => setTooltipAppt(null)}
            >
              <Text style={styles.ctaGridBtnTextPrimary}>Close</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </ModalBackdrop>

      <FileViewerModal
        visible={fileViewerFile != null}
        item={fileViewerFile}
        url={fileViewerUrl}
        loading={fileViewerLoading}
        stripItems={fileViewerStripItems}
        signedUrls={fileSignedUrls}
        onSelectStrip={file => openAppointmentFile(file)}
        onClose={closeFileViewer}
      />
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
  doctorSelectWrap: {
    flex: 1,
    marginLeft: theme.spacing.sm,
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
    borderColor: CALENDAR_GRID_LINE,
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
    borderBottomWidth: 1.5,
    borderBottomColor: CALENDAR_GRID_LINE_STRONG,
    backgroundColor: '#FAFAFA',
  },
  gridHeaderTokens: {
    width: GUTTER,
    borderRightWidth: 1.5,
    borderRightColor: CALENDAR_GRID_LINE_STRONG,
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
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: CALENDAR_GRID_LINE,
    borderLeftWidth: 3,
    borderRadius: theme.borderRadius.sm,
    paddingRight: 2,
    marginBottom: 6,
  },
  tokenChipPressable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 8,
    minWidth: 0,
  },
  tokenChipInactive: {
    opacity: 0.78,
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
    paddingRight: 2,
    borderBottomWidth: 1,
    borderBottomColor: CALENDAR_GRID_LINE,
    backgroundColor: theme.colors.surface,
  },
  apptRowPressable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    paddingLeft: theme.spacing.md,
    minWidth: 0,
  },
  apptRowMenuBtn: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  apptRowInactive: {
    opacity: 0.78,
  },
  apptStruckText: {
    textDecorationLine: 'line-through',
  },
  timedApptSection: {
    borderTopWidth: 1.5,
    borderTopColor: CALENDAR_GRID_LINE_STRONG,
  },
  apptRowTime: {
    width: 72,
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.medium,
    color: theme.colors.text,
    borderRightWidth: 1,
    borderRightColor: CALENDAR_GRID_LINE,
    paddingRight: theme.spacing.sm,
    marginRight: theme.spacing.sm,
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
  doctorDropdownRoot: {
    flex: 1,
  },
  doctorDropdownBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
  },
  doctorDropdownPanel: {
    position: 'absolute',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
    ...theme.shadows.lg,
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
    paddingVertical: theme.spacing.sm,
    minHeight: 40,
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
  patientSearchRetryBtn: {
    marginTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primary,
  },
  patientSearchRetryText: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.surface,
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
  apptDetailsSheet: {
    flex: 1,
    width: '100%',
    backgroundColor: theme.colors.surface,
  },
  apptDetailsSheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: CALENDAR_GRID_LINE,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  apptDetailsSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: CALENDAR_GRID_LINE,
  },
  apptDetailsSheetTitle: {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
    flex: 1,
  },
  apptDetailsSheetHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  apptDetailsScroll: {
    flex: 1,
  },
  apptDetailsScrollContent: {
    paddingBottom: theme.spacing.xl,
  },
  sheetHeaderMobile: {
    color: theme.colors.primary,
  },
  ctaGrid: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xs,
    borderTopWidth: 1,
    borderTopColor: CALENDAR_GRID_LINE,
    marginTop: theme.spacing.sm,
  },
  ctaGridRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  ctaGridBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.sm,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
  },
  ctaGridBtnFull: {
    flex: 0,
    width: '100%',
  },
  ctaGridBtnPrimary: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  ctaGridBtnDanger: {
    borderColor: '#E57373',
    backgroundColor: '#FFCDD2',
  },
  ctaGridBtnSuccess: {
    borderColor: '#2E7D32',
    backgroundColor: '#E8F5E9',
  },
  ctaGridBtnWarning: {
    borderColor: '#6D28D9',
  },
  ctaGridBtnReschedule: {
    borderColor: '#FFE082',
    backgroundColor: '#FFF9C4',
  },
  ctaGridBtnAbsent: {
    borderColor: '#90CAF9',
    backgroundColor: '#E3F2FD',
  },
  ctaGridBtnDisabled: {
    opacity: 0.6,
  },
  ctaGridBtnText: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
  },
  ctaGridBtnTextPrimary: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.surface,
  },
  ctaGridBtnTextDanger: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.bold,
    color: '#B71C1C',
  },
  ctaGridBtnTextSuccess: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.bold,
    color: '#2E7D32',
  },
  ctaGridBtnTextWarning: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.bold,
    color: '#6D28D9',
  },
  ctaGridBtnTextReschedule: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.bold,
    color: '#8A6D00',
  },
  ctaGridBtnTextAbsent: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.bold,
    color: '#1565C0',
  },
  modalFooterRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  modalFooterBtn: {
    marginBottom: 0,
  },
  refundOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  refundOptionText: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
    flex: 1,
  },
  rescheduleDoctorScroll: {
    marginBottom: theme.spacing.sm,
  },
  rescheduleDoctorOptionActive: {
    backgroundColor: theme.colors.primary + '12',
  },
  rescheduleDoctorOptionTextActive: {
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  rescheduleDoctorChip: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    marginRight: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
  },
  rescheduleDoctorChipActive: {
    borderColor: theme.colors.primary,
    backgroundColor: '#E8F0FE',
  },
  rescheduleDoctorChipText: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text,
  },
  rescheduleDoctorChipTextActive: {
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  slotSelectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
  },
  slotSelectBtnText: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
    flex: 1,
  },
  slotModalCard: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '85%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.lg,
    ...theme.shadows.sm,
  },
  slotModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.xs,
  },
  slotModalTitle: {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
  },
  slotModalSubtitle: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  tooltipCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    ...theme.shadows.md,
  },
  tooltipStatusBanner: {
    marginBottom: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    paddingVertical: 8,
    paddingHorizontal: theme.spacing.sm,
    alignItems: 'center',
  },
  tooltipStatusBannerText: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  tooltipTitle: {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  tooltipRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.xs,
  },
  tooltipLabel: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
  },
  tooltipValue: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.text,
    flexShrink: 1,
    textAlign: 'right',
    marginLeft: theme.spacing.md,
  },
  tooltipValueMultiline: {
    flex: 1,
    maxWidth: '62%',
  },
  tooltipCloseBtn: {
    marginTop: theme.spacing.md,
    flex: 0,
    width: '100%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    marginHorizontal: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: CALENDAR_GRID_LINE,
  },
  sheetAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.xs,
    flexShrink: 0,
  },
  sheetHeaderCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  sheetHeaderColDivider: {
    width: 1,
    height: 28,
    backgroundColor: CALENDAR_GRID_LINE,
    marginHorizontal: theme.spacing.xs,
    flexShrink: 0,
  },
  sheetHeaderLabel: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  sheetHeaderValue: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.text,
  },
  sheetHeaderValueLink: {
    color: theme.colors.primary,
  },
  sheetHeaderOpdHint: {
    fontSize: theme.typography.fontSizes.xs,
    color: theme.colors.primary,
    marginTop: 2,
  },
  sheetBody: {
    paddingHorizontal: theme.spacing.sm,
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
  detailRowStatusArrival: {
    justifyContent: 'flex-end',
  },
  detailRowAddress: {
    alignItems: 'flex-start',
  },
  detailValueMultiline: {
    flex: 1,
    maxWidth: '68%',
    textAlign: 'right',
    lineHeight: 20,
  },
  statusArrivalLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  statusArrivalLabel: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
  },
  statusArrivalSep: {
    fontSize: theme.typography.fontSizes.sm,
    color: CALENDAR_GRID_LINE,
    marginHorizontal: 2,
  },
  statusArrivalValue: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semiBold,
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
  sheetHint: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  confirmModalCard: {
    width: '100%',
    maxHeight: '100%',
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
  },
  confirmArrivalSheet: {
    width: '100%',
    maxHeight: '92%',
    alignSelf: 'flex-end',
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    ...theme.shadows.lg,
  },
  rescheduleSheet: {
    width: '100%',
    maxHeight: '92%',
    alignSelf: 'flex-end',
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    ...theme.shadows.lg,
  },
  rescheduleScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  rescheduleScrollContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
  },
  rescheduleFooter: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: CALENDAR_GRID_LINE,
    backgroundColor: theme.colors.surface,
  },
  confirmModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xs,
  },
  confirmModalTitle: {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
  },
  confirmFieldLabel: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
    marginTop: theme.spacing.sm,
  },
  rescheduleTreatmentOptional: {
    fontWeight: theme.typography.fontWeights.normal,
    color: theme.colors.textSecondary,
  },
  rescheduleTreatmentField: {
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
  rescheduleTreatmentFieldText: {
    flex: 1,
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
  },
  rescheduleTreatmentPlaceholder: {
    color: theme.colors.textSecondary,
  },
  rescheduleSelectedTreatments: {
    marginTop: theme.spacing.xs,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.background,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    maxHeight: 120,
  },
  rescheduleSelectedTreatmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.xs,
  },
  rescheduleSelectedTreatmentText: {
    flex: 1,
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text,
    marginRight: theme.spacing.sm,
  },
  rescheduleTreatmentDropdown: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    marginTop: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
    overflow: 'hidden',
  },
  rescheduleTreatmentSearch: {
    margin: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
    backgroundColor: theme.colors.background,
  },
  rescheduleTreatmentLoader: {
    marginVertical: theme.spacing.md,
  },
  rescheduleTreatmentEmpty: {
    padding: theme.spacing.md,
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  rescheduleTreatmentList: {
    maxHeight: 200,
  },
  rescheduleTreatmentGroupTitle: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xs,
    backgroundColor: theme.colors.background,
  },
  rescheduleTreatmentOption: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  rescheduleTreatmentOptionBody: {
    flex: 1,
    marginLeft: theme.spacing.sm,
  },
  rescheduleTreatmentOptionName: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
  },
  confirmSectionTitle: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  confirmHint: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
    lineHeight: 18,
  },
  confirmWarning: {
    marginTop: theme.spacing.sm,
    fontSize: theme.typography.fontSizes.sm,
    color: '#B7791F',
    lineHeight: 18,
  },
  treatmentListBlock: {
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  treatmentListTitle: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  treatmentListItem: {
    paddingVertical: theme.spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  treatmentListName: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
  },
  treatmentListDate: {
    marginTop: 2,
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
  },
  confirmInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
  },
  confirmAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.spacing.sm,
  },
  confirmAmountInput: {
    minWidth: 120,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
    textAlign: 'right',
  },
  confirmPendingBox: {
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    backgroundColor: '#F5F5F5',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  confirmPendingLabel: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.textSecondary,
  },
  confirmPendingValue: {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.bold,
    color: '#2E7D32',
  },
  confirmPendingDue: {
    color: '#C62828',
  },
  confirmLoader: {
    marginVertical: theme.spacing.lg,
  },
  confirmMatches: {
    marginTop: theme.spacing.sm,
  },
  confirmMatchItem: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.sm,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  confirmMatchItemActive: {
    borderColor: theme.colors.primary,
    backgroundColor: '#E3F2FD',
  },
  confirmMatchName: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.text,
  },
  confirmMatchMeta: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginTop: 2,
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
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
    marginTop: theme.spacing.sm,
    borderTopWidth: 1.5,
    borderTopColor: CALENDAR_GRID_LINE_STRONG,
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
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 8,
    marginTop: 6,
    backgroundColor: theme.colors.surface,
  },
  allApptCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  allApptCardDateRow: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginRight: theme.spacing.xs,
  },
  allApptCardDate: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
  },
  allApptCardTime: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
  },
  allApptStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: theme.borderRadius.xl,
  },
  allApptStatusText: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.bold,
  },
  allApptDoctorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
    minWidth: 0,
  },
  allApptDoctorLabel: {
    fontSize: 10,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.textSecondary,
    letterSpacing: 0.4,
  },
  allApptDoctorName: {
    flex: 1,
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
  },
  allApptTreatmentBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.background,
    borderRadius: 6,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 5,
    marginTop: 4,
  },
  allApptTreatmentName: {
    flex: 1,
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: '#7E57C2',
    marginRight: theme.spacing.xs,
  },
  allApptTreatmentDate: {
    fontSize: theme.typography.fontSizes.xs,
    color: theme.colors.textSecondary,
  },
  allApptUploadsBlock: {
    marginTop: 4,
    gap: 4,
  },
  allApptUploadsLabel: {
    fontSize: 10,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.textSecondary,
    letterSpacing: 0.4,
  },
  allApptUploadList: {
    gap: 4,
  },
  allApptUploadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FAFBFF',
  },
  allApptUploadRowLab: {
    backgroundColor: '#F0FDF9',
    borderColor: '#BBF7D0',
  },
  allApptUploadRowNote: {
    backgroundColor: '#FAF5FF',
    borderColor: '#E9D5FF',
  },
  allApptUploadIcon: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  allApptUploadIconLab: {
    backgroundColor: '#ECFDF5',
  },
  allApptUploadIconNote: {
    backgroundColor: '#F5F3FF',
  },
  allApptUploadThumb: {
    width: '100%',
    height: '100%',
  },
  allApptUploadName: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    fontWeight: theme.typography.fontWeights.medium,
    color: theme.colors.text,
  },
  allApptUploadMeta: {
    alignItems: 'flex-end',
    gap: 1,
    flexShrink: 0,
  },
  allApptUploadTime: {
    fontSize: 9,
    color: theme.colors.textSecondary,
  },
  allApptUploadType: {
    fontSize: 9,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    flexShrink: 0,
  },
  patientFileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginBottom: 8,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: '#E0E7FF',
    backgroundColor: theme.colors.surface,
  },
  patientFileIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  patientFileIconWrapLab: {
    backgroundColor: '#CCFBF1',
  },
  patientFileIconWrapNote: {
    backgroundColor: '#EDE9FE',
  },
  patientFileBody: {
    flex: 1,
    minWidth: 0,
  },
  patientFileTitle: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.text,
  },
  patientFileMeta: {
    marginTop: 2,
    fontSize: theme.typography.fontSizes.xs,
    color: theme.colors.textSecondary,
  },
  patientFileBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: '#F1F5F9',
    flexShrink: 0,
  },
  patientFileBadgeText: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: '#64748B',
    textTransform: 'uppercase',
  },
});

export default CalendarScreen;
