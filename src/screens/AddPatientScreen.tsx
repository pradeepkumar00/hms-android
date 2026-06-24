import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  InteractionManager,
  RefreshControl,
} from 'react-native';
import DatePicker from 'react-native-date-picker';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useAppDispatch, useAppSelector, selectAuthToken, selectAppConfig, selectAppDataLoading, loadAppData } from '../store';
import { theme } from '../constants/theme';
import { Header, ModalBackdrop, SlotPickerGrid, CustomBookingTimeFields } from '../components';
import realAuthService from '../services/realAuthService';
import { RegisField } from '../types';
import { BookableSlot, isSlotSelectable } from '../utils/slot.util';
import {
  getDoctorBookingMode,
  isCustomBookingMode,
  isSlotBookingMode,
  DEFAULT_CUSTOM_BOOKING_DURATION_MINUTES,
  resolveCustomBookingDuration,
} from '../utils/doctorBookingMode.util';
import {
  buildInitialFormValues,
  extractRegisFields,
  formatDateForDisplay,
  isBookingRegistrationField,
  isCoDoctorField,
  isDoctorField,
  isRegistrationRequiredField,
  prefillPatientFormValues,
} from '../utils/regisConfig';
import { validateMobileNumber } from '../utils/validation';
import { snapCustomBookingDuration } from '../constants/customBookingDurationOptions';
import { defaultCustomStartTime } from '../utils/customBookingTime.util';

interface AddPatientScreenProps {
  navigation: any;
  route: {
    params?: {
      patientData?: Record<string, unknown>;
      bookingMode?: 'appointment';
      presetDoctorId?: string;
      presetDate?: string;
    };
  };
}

interface DoctorOption {
  _id: string;
  name: string;
  doctorCode?: string | null;
  bookingMode?: string;
  customBookingDuration?: number;
}

interface Slot extends BookableSlot {}

const toApiDate = (d: Date) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const AddPatientScreen: React.FC<AddPatientScreenProps> = ({ navigation, route }) => {
  const dispatch = useAppDispatch();
  const token = useAppSelector(selectAuthToken);
  const appConfig = useAppSelector(selectAppConfig);
  const appDataLoading = useAppSelector(selectAppDataLoading);
  const editPatientData = route.params?.patientData;
  const isAppointmentBooking =
    route.params?.bookingMode === 'appointment' &&
    !Boolean(editPatientData?._id || editPatientData?.id);
  const presetDoctorId = String(route.params?.presetDoctorId || '').trim();
  const presetDate = String(route.params?.presetDate || '').trim();
  const isEditMode = Boolean(editPatientData?._id || editPatientData?.id);
  const editPatientId = String(editPatientData?._id || editPatientData?.id || '');

  const [fields, setFields] = useState<RegisField[]>([]);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [openSelectKey, setOpenSelectKey] = useState<string | null>(null);
  const [datePickerKey, setDatePickerKey] = useState<string | null>(null);
  const [datePickerValue, setDatePickerValue] = useState(new Date());
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [customStartTime, setCustomStartTime] = useState(defaultCustomStartTime());
  const [customDuration, setCustomDuration] = useState(
    String(DEFAULT_CUSTOM_BOOKING_DURATION_MINUTES),
  );
  const [slotPickerOpen, setSlotPickerOpen] = useState(false);
  const [bookingPatientMatches, setBookingPatientMatches] = useState<
    Array<{ _id: string; name: string; mobileNo: string; uhid?: string | null }>
  >([]);
  const [bookingSelectedPatientId, setBookingSelectedPatientId] = useState<string | null>(
    null,
  );
  const [bookingSelectedPatient, setBookingSelectedPatient] = useState<{
    _id: string;
    name: string;
    mobileNo: string;
    uhid?: string | null;
  } | null>(null);
  const [bookingPatientsLoading, setBookingPatientsLoading] = useState(false);
  const [debouncedBookingMobile, setDebouncedBookingMobile] = useState('');

  const screenTitle = isEditMode ? 'Edit Patient' : 'Add Patient';

  const visibleFields = useMemo(
    () => {
      const base = isEditMode
        ? fields.filter(field => !isBookingRegistrationField(field))
        : fields;
      if (!isAppointmentBooking) return base;
      const allowed = new Set(['mobileNo', 'name', 'doctorId', 'date']);
      return base.filter(
        field =>
          allowed.has(field.key) ||
          (field.type === 'doctor' && isDoctorField(field.key) && !isCoDoctorField(field.key)) ||
          field.type === 'date' ||
          field.key === 'date',
      );
    },
    [fields, isEditMode, isAppointmentBooking],
  );

  const hasDateField = useMemo(
    () => fields.some(field => field.type === 'date' || field.key === 'date'),
    [fields],
  );

  const dateFieldKey = useMemo(
    () => fields.find(field => field.type === 'date' || field.key === 'date')?.key ?? 'date',
    [fields],
  );

  const primaryDoctorFieldKey = useMemo(
    () =>
      fields.find(
        field =>
          (field.type === 'doctor' || isDoctorField(field.key)) &&
          !isCoDoctorField(field.key),
      )?.key ?? 'doctorId',
    [fields],
  );

  const primaryDoctorId = useMemo(
    () => (formValues[primaryDoctorFieldKey] ?? '').trim(),
    [formValues, primaryDoctorFieldKey],
  );

  const appointmentDate = useMemo(() => {
    const configuredDate = (formValues[dateFieldKey] ?? '').trim();
    if (hasDateField) return configuredDate;
    return configuredDate || toApiDate(new Date());
  }, [hasDateField, formValues, dateFieldKey]);

  const selectedDoctor = useMemo(
    () => doctors.find(doc => doc._id === primaryDoctorId) ?? null,
    [doctors, primaryDoctorId],
  );

  const doctorUsesSlots = isSlotBookingMode(selectedDoctor);
  const doctorUsesCustom = isCustomBookingMode(selectedDoctor);

  const primaryDoctorField = useMemo(
    () =>
      fields.find(
        field =>
          (field.type === 'doctor' || isDoctorField(field.key)) &&
          !isCoDoctorField(field.key),
      ) ?? null,
    [fields],
  );

  const slotSelectionRequired = useMemo(
    () =>
      Boolean(
        primaryDoctorField &&
          primaryDoctorId &&
          doctorUsesSlots &&
          appointmentDate,
      ),
    [primaryDoctorField, primaryDoctorId, doctorUsesSlots, appointmentDate],
  );

  const customTimeRequired = useMemo(
    () =>
      Boolean(
        primaryDoctorField &&
          primaryDoctorId &&
          doctorUsesCustom &&
          appointmentDate,
      ),
    [primaryDoctorField, primaryDoctorId, doctorUsesCustom, appointmentDate],
  );

  const loadForm = useCallback(async () => {
    if (!token) {
      setLoadingConfig(false);
      setFields([]);
      return;
    }

    if (!appConfig) {
      if (!appDataLoading) {
        dispatch(loadAppData());
      }
      return;
    }

    setLoadingConfig(true);
    try {
      const doctorList = await realAuthService.fetchDoctors(token).catch(() => []);

      const regisFields = extractRegisFields(appConfig).filter(
        field => field.key !== 'visitType',
      );
      console.log(`📋 Registration fields loaded: ${regisFields.length}`);
      setFields(regisFields);
      const initial = buildInitialFormValues(regisFields);
      const nextValues = isEditMode
        ? { ...initial, ...prefillPatientFormValues(editPatientData) }
        : {
            ...initial,
            ...(presetDoctorId ? { doctorId: presetDoctorId } : {}),
            ...(presetDate ? { date: presetDate } : {}),
          };
      setFormValues(nextValues);
      setDoctors(
        (doctorList || []).map((doc: any) => ({
          _id: doc._id,
          name: doc.name,
          doctorCode: doc.doctorCode,
          bookingMode: doc.bookingMode,
          customBookingDuration: doc.customBookingDuration,
        })),
      );
    } catch (err) {
      console.error('Failed to load registration config:', err);
      Alert.alert(
        'Error',
        err instanceof Error ? err.message : 'Failed to load registration form.',
      );
    } finally {
      setLoadingConfig(false);
    }
  }, [token, appConfig, appDataLoading, dispatch, isEditMode, editPatientData, presetDoctorId, presetDate]);

  useEffect(() => {
    if (!isAppointmentBooking) return;
    const timer = setTimeout(() => {
      const digits = (formValues.mobileNo ?? '').replace(/\D/g, '').slice(-10);
      setDebouncedBookingMobile(digits.length >= 3 ? digits : '');
    }, 400);
    return () => clearTimeout(timer);
  }, [formValues.mobileNo, isAppointmentBooking]);

  useEffect(() => {
    if (!token || !isAppointmentBooking || !debouncedBookingMobile) {
      setBookingPatientMatches([]);
      setBookingPatientsLoading(false);
      return;
    }

    let active = true;
    (async () => {
      setBookingPatientsLoading(true);
      try {
        const result = await realAuthService.fetchPatients(token, {
          page: 0,
          limit: 5,
          search: debouncedBookingMobile,
        });
        if (!active) return;
        const rows = (result.patients || []).filter((p: any) =>
          String(p?.mobileNo || '').replace(/\D/g, '').includes(debouncedBookingMobile),
        );
        setBookingPatientMatches(
          rows.slice(0, 5).map((p: any) => ({
            _id: String(p._id || p.id),
            name: p.name || '',
            mobileNo: p.mobileNo || '',
            uhid: p.uhid ?? null,
          })),
        );
      } catch (err) {
        console.error('Booking patient search failed:', err);
        if (active) setBookingPatientMatches([]);
      } finally {
        if (active) setBookingPatientsLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [token, isAppointmentBooking, debouncedBookingMobile]);

  const selectBookingPatient = (patient: {
    _id: string;
    name: string;
    mobileNo: string;
    uhid?: string | null;
  }) => {
    setBookingSelectedPatientId(patient._id);
    setBookingSelectedPatient(patient);
    setFieldValue('name', patient.name);
    setFieldValue('mobileNo', patient.mobileNo);
    setBookingPatientMatches([]);
  };

  const clearBookingPatient = () => {
    setBookingSelectedPatientId(null);
    setBookingSelectedPatient(null);
    setFieldValue('name', '');
  };

  useEffect(() => {
    loadForm();
  }, [loadForm]);

  // Load slots whenever a slot-enabled doctor and appointment date are both set.
  useEffect(() => {
    if (!token || !primaryDoctorId || !appointmentDate) return;

    const doctor = doctors.find(doc => doc._id === primaryDoctorId);
    if (!isSlotBookingMode(doctor)) {
      setSelectedSlot(null);
      setSlots([]);
      setSlotsLoading(false);
      return;
    }

    let active = true;
    (async () => {
      setSlotsLoading(true);
      setSlots([]);
      setSelectedSlot(null);
      try {
        const list = await realAuthService.fetchDoctorSlots(
          primaryDoctorId,
          appointmentDate,
          token,
        );
        if (active) setSlots(list);
      } catch (err) {
        console.error('Failed to load doctor slots:', err);
        if (active) Alert.alert('Error', 'Could not load slots.');
      } finally {
        if (active) setSlotsLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [token, primaryDoctorId, appointmentDate, doctors]);

  // Pre-fill default custom duration from doctor schedule settings.
  useEffect(() => {
    if (!token || !primaryDoctorId) return;
    const doctor = doctors.find(doc => doc._id === primaryDoctorId);
    if (!isCustomBookingMode(doctor)) return;

    let active = true;
    (async () => {
      const profile = await realAuthService.fetchDoctorBookingProfile(primaryDoctorId, token);
      if (!active) return;
      const merged = {
        ...doctor,
        bookingMode: profile.bookingMode || doctor?.bookingMode,
        customBookingDuration:
          profile.customBookingDuration ?? doctor?.customBookingDuration,
      };
      const dur = snapCustomBookingDuration(resolveCustomBookingDuration(merged));
      setCustomDuration(String(dur));
      setDoctors(prev =>
        prev.map(d =>
          d._id === primaryDoctorId
            ? {
                ...d,
                bookingMode: merged.bookingMode,
                customBookingDuration: merged.customBookingDuration,
              }
            : d,
        ),
      );
    })();

    return () => {
      active = false;
    };
  }, [token, primaryDoctorId, doctorUsesCustom]);

  // Open the slot picker once doctor and date are set and slots have loaded.
  useEffect(() => {
    if (isEditMode) return;
    if (!primaryDoctorId || !appointmentDate || slotsLoading) return;

    const doctor = doctors.find(doc => doc._id === primaryDoctorId);
    if (!isSlotBookingMode(doctor)) return;

    const task = InteractionManager.runAfterInteractions(() => {
      setSlotPickerOpen(true);
    });

    return () => task.cancel();
  }, [primaryDoctorId, appointmentDate, slotsLoading, doctors, isEditMode]);

  const onRefresh = useCallback(async () => {
    if (!token || refreshing) return;

    setRefreshing(true);
    try {
      const result = await dispatch(loadAppData()).unwrap();
      const config = result.config;
      const doctorList = await realAuthService.fetchDoctors(token).catch(() => []);
      const regisFields = extractRegisFields(config).filter(
        field => field.key !== 'visitType',
      );

      setFields(regisFields);
      setFormValues(prev => {
        const initial = buildInitialFormValues(regisFields);
        const allowedKeys = new Set(regisFields.map(field => field.key));
        const merged = { ...initial, ...prev };
        return Object.fromEntries(
          Object.entries(merged).filter(([key]) => allowedKeys.has(key)),
        );
      });
      setDoctors(
        (doctorList || []).map((doc: any) => ({
          _id: doc._id,
          name: doc.name,
          doctorCode: doc.doctorCode,
          bookingMode: doc.bookingMode,
          customBookingDuration: doc.customBookingDuration,
        })),
      );
    } catch (err) {
      console.error('Failed to refresh registration form:', err);
    } finally {
      setRefreshing(false);
    }
  }, [token, refreshing, dispatch]);

  const doctorOptions = useMemo(
    () =>
      doctors.map(doc => ({
        label: doc.doctorCode ? `${doc.name} (${doc.doctorCode})` : doc.name,
        value: doc._id,
      })),
    [doctors],
  );

  const setFieldValue = (key: string, value: string) => {
    setFormValues(prev => ({ ...prev, [key]: value }));
    if (key === 'mobileNo' && isAppointmentBooking) {
      setBookingSelectedPatientId(null);
      setBookingSelectedPatient(null);
    }
    if (errors[key]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const loadSlotsAndOpenPicker = useCallback(
    async (doctorId?: string, date?: string) => {
      const resolvedDoctorId = doctorId || primaryDoctorId;
      const resolvedDate = date || appointmentDate;
      if (!token || !resolvedDoctorId || !resolvedDate) return;

      const doctor = doctors.find(doc => doc._id === resolvedDoctorId);
      if (!isSlotBookingMode(doctor)) {
        setSelectedSlot(null);
        setSlots([]);
        return;
      }

      setSlotPickerOpen(true);
      setSlotsLoading(true);
      setSlots([]);
      setSelectedSlot(null);

      try {
        const list = await realAuthService.fetchDoctorSlots(
          resolvedDoctorId,
          resolvedDate,
          token,
        );
        setSlots(list);
      } catch (err) {
        console.error('Failed to load doctor slots:', err);
        Alert.alert('Error', 'Could not load slots.');
      } finally {
        setSlotsLoading(false);
      }
    },
    [token, doctors, primaryDoctorId, appointmentDate],
  );

  const handleSelectOption = (field: RegisField, optionValue: string) => {
    setFieldValue(field.key, optionValue);
    setOpenSelectKey(null);

    const isPrimaryDoctor =
      (field.type === 'doctor' || isDoctorField(field.key)) &&
      !isCoDoctorField(field.key);

    if (!hasDateField && isPrimaryDoctor && optionValue) {
      const doctor = doctors.find(doc => doc._id === optionValue);
      if (!isSlotBookingMode(doctor)) {
        setSelectedSlot(null);
        setSlots([]);
        return;
      }

      setFieldValue(dateFieldKey, toApiDate(new Date()));
    }
  };

  const getSelectOptions = (field: RegisField) => {
    if (field.type === 'doctor' || isDoctorField(field.key) || isCoDoctorField(field.key)) {
      return doctorOptions;
    }
    return field.options || [];
  };

  const getSelectedLabel = (field: RegisField) => {
    const value = formValues[field.key];
    if (!value) return field.placeholder || `Select ${field.label}`;

    const options = getSelectOptions(field);
    const match = options.find(option => option.value === value);
    if (match) return match.label;

    if (field.type === 'doctor' || isDoctorField(field.key) || isCoDoctorField(field.key)) {
      const doctor = doctors.find(doc => doc._id === value);
      if (doctor) {
        return doctor.doctorCode
          ? `${doctor.name} (${doctor.doctorCode})`
          : doctor.name;
      }
    }

    return value;
  };

  const validateForm = () => {
    const nextErrors: Record<string, string> = {};

    visibleFields.forEach(field => {
      if (!isRegistrationRequiredField(field)) return;

      const value = (formValues[field.key] ?? '').trim();
      if (!value) {
        nextErrors[field.key] = `${field.label} is required`;
      }
    });

    const mobileField = visibleFields.find(field => field.key === 'mobileNo');
    if (mobileField) {
      const mobile = (formValues.mobileNo ?? '').trim();
      if (mobile) {
        const mobileError = validateMobileNumber(mobile);
        if (mobileError) {
          nextErrors.mobileNo = mobileError.message;
        }
      }
    }

    if (!isEditMode && slotSelectionRequired && !selectedSlot) {
      nextErrors.slot = 'Please select a slot';
    } else if (
      !isEditMode &&
      slotSelectionRequired &&
      selectedSlot &&
      !isSlotSelectable(selectedSlot)
    ) {
      nextErrors.slot = 'Please select an available slot';
    }

    if (!isEditMode && customTimeRequired) {
      const duration = Number(customDuration);
      if (!customStartTime.trim()) {
        nextErrors.customStartTime = 'Start time is required';
      }
      if (!customDuration.trim() || isNaN(duration) || duration < 1) {
        nextErrors.customDuration = 'Select a duration';
      }
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const buildBookAppointmentPayload = () => {
    const getValue = (key: string) => (formValues[key] ?? '').trim();
    const phone = getValue('mobileNo').replace(/\D/g, '').slice(-10);
    const appointmentDateValue = hasDateField
      ? getValue(dateFieldKey)
      : appointmentDate;

    const payload: {
      doctorId: string;
      phone: string;
      patientName: string;
      date: string;
      paymentMode: string;
      patientId?: string;
      slotTokenCount?: number;
      appointmentTime?: string;
      duration?: number;
    } = {
      doctorId: getValue(primaryDoctorFieldKey) || getValue('doctorId'),
      phone,
      patientName: getValue('name'),
      date: appointmentDateValue,
      paymentMode: 'cash',
    };

    if (bookingSelectedPatientId) {
      payload.patientId = bookingSelectedPatientId;
    }
    if (selectedSlot?.tokenCount != null) {
      payload.slotTokenCount = Number(selectedSlot.tokenCount);
    }
    if (doctorUsesCustom) {
      payload.appointmentTime = customStartTime;
      payload.duration = Number(customDuration);
    }

    return payload;
  };

  const buildPayload = () => {
    const getValue = (key: string) => (formValues[key] ?? '').trim();

    const doctorId = getValue('doctorId');
    const coDoctorId = getValue('coDoctorId');
    const doctor = doctors.find(doc => doc._id === doctorId);
    const appointmentDateValue = hasDateField
      ? getValue(dateFieldKey)
      : appointmentDate;
    const visitTypeLabel = getValue('visitType') || 'Normal';

    const patient: Record<string, string> = {
      name: getValue('name'),
      email: getValue('email'),
      mobileNo: getValue('mobileNo'),
      gender: getValue('gender'),
      age: getValue('age'),
      date: appointmentDateValue,
      doctorId,
      coDoctorId,
      address: getValue('address'),
      title: getValue('title'),
      careType: getValue('careType'),
      careTaker: getValue('careTaker'),
      visitType: visitTypeLabel,
      doctorName: doctor?.name ?? '',
      patientType: getValue('patientType') || 'opd',
    };

    // Include any custom dynamic fields inside patient.
    fields.forEach(field => {
      if (patient[field.key] !== undefined) return;
      patient[field.key] = getValue(field.key);
    });

    const mode = getDoctorBookingMode(doctor);
    const appointmentTime =
      selectedSlot?.startTime ?? (doctorUsesCustom ? customStartTime : null);

    return {
      doctorId,
      coDoctorId,
      patient,
      careTaker: getValue('careTaker'),
      registerCharge: 0,
      appointmentTime,
      appointmentType: mode === 'QUEUE' ? 'TOKEN' : 'SLOT',
      ...(selectedSlot?.tokenCount != null
        ? { tokenCount: selectedSlot.tokenCount }
        : {}),
      ...(doctorUsesCustom ? { duration: Number(customDuration) } : {}),
      date: appointmentDateValue,
      visitType: visitTypeLabel.toUpperCase().replace(/\s+/g, '_'),
    };
  };

  const buildEditPayload = () => {
    const payload: Record<string, string> = {};
    visibleFields.forEach(field => {
      payload[field.key] = String(formValues[field.key] ?? '').trim();
    });
    return payload;
  };

  const handleSubmit = async () => {
    if (!token || submitting) return;
    if (!validateForm()) return;

    setSubmitting(true);
    try {
      if (isEditMode) {
        await realAuthService.editPatient(
          editPatientId,
          buildEditPayload(),
          token,
        );
        Alert.alert('Success', 'Patient updated successfully.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
        return;
      }

      if (isAppointmentBooking) {
        await realAuthService.bookAdminAppointment(buildBookAppointmentPayload(), token);
        Alert.alert('Success', 'Appointment booked successfully.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
        return;
      }

      await realAuthService.registerPatient(buildPayload(), token);
      Alert.alert('Success', 'Patient registered successfully.', [
        {
          text: 'OK',
          onPress: () => navigation.navigate('PatientList'),
        },
      ]);
    } catch (err) {
      Alert.alert(
        isEditMode
          ? 'Update Failed'
          : isAppointmentBooking
            ? 'Booking Failed'
            : 'Registration Failed',
        err instanceof Error
          ? err.message
          : isEditMode
            ? 'Could not update patient.'
            : isAppointmentBooking
              ? 'Could not book appointment.'
              : 'Could not register patient.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const renderField = (field: RegisField) => {
    const value = formValues[field.key] ?? '';
    const error = errors[field.key];
    const isMobileField = field.key === 'mobileNo';
    const isSelectLike =
      field.type === 'select' ||
      field.type === 'doctor' ||
      isDoctorField(field.key) ||
      isCoDoctorField(field.key);

    return (
      <View key={field.key} style={styles.fieldBlock}>
        <Text style={styles.fieldLabel}>
          {field.label}
          {isRegistrationRequiredField(field) ? ' *' : ''}
        </Text>

        {isSelectLike ? (
          <>
            <TouchableOpacity
              style={[styles.input, styles.selectInput, error && styles.inputError]}
              activeOpacity={0.7}
              onPress={() =>
                setOpenSelectKey(openSelectKey === field.key ? null : field.key)
              }
            >
              <Text
                style={[
                  styles.selectText,
                  !value && styles.placeholderText,
                ]}
                numberOfLines={1}
              >
                {getSelectedLabel(field)}
              </Text>
              <Icon
                name={openSelectKey === field.key ? 'expand-less' : 'expand-more'}
                size={22}
                color={theme.colors.textSecondary}
              />
            </TouchableOpacity>
            {openSelectKey === field.key && (
              <View style={styles.dropdownList}>
                {getSelectOptions(field).map(option => {
                  const active = option.value === value;
                  return (
                    <TouchableOpacity
                      key={`${field.key}-${option.value}`}
                      style={styles.dropdownItem}
                      activeOpacity={0.7}
                      onPress={() => handleSelectOption(field, option.value)}
                    >
                      <Text
                        style={[
                          styles.dropdownItemText,
                          active && styles.dropdownItemTextActive,
                        ]}
                      >
                        {option.label}
                      </Text>
                      {active && (
                        <Icon name="check" size={18} color={theme.colors.primary} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </>
        ) : field.type === 'date' ? (
          <TouchableOpacity
            style={[styles.input, styles.selectInput, error && styles.inputError]}
            activeOpacity={0.7}
            onPress={() => {
              setDatePickerKey(field.key);
              setDatePickerValue(
                value ? new Date(`${value}T00:00:00`) : new Date(),
              );
            }}
          >
            <Text style={styles.selectText}>{formatDateForDisplay(value)}</Text>
            <Icon name="event" size={20} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        ) : (
          <TextInput
            style={[
              styles.input,
              field.type === 'textarea' && styles.textArea,
              error && styles.inputError,
            ]}
            value={value}
            onChangeText={text => setFieldValue(field.key, text)}
            placeholder={field.placeholder}
            placeholderTextColor={theme.colors.placeholder}
            keyboardType={
              field.type === 'number'
                ? 'numeric'
                : field.type === 'email'
                ? 'email-address'
                : isMobileField
                ? 'phone-pad'
                : 'default'
            }
            maxLength={isMobileField ? 13 : undefined}
            multiline={field.type === 'textarea'}
            numberOfLines={field.type === 'textarea' ? 3 : 1}
          />
        )}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {isAppointmentBooking && isMobileField ? (
          <>
            {bookingPatientsLoading ? (
              <Text style={styles.bookingHint}>Searching patients…</Text>
            ) : null}
            {bookingPatientMatches.length > 0 && !bookingSelectedPatientId ? (
              <View style={styles.bookingMatches}>
                {bookingPatientMatches.map(patient => (
                  <TouchableOpacity
                    key={patient._id}
                    style={styles.bookingMatchItem}
                    onPress={() => selectBookingPatient(patient)}
                  >
                    <Text style={styles.bookingMatchName}>{patient.name}</Text>
                    <Text style={styles.bookingMatchMeta}>
                      {patient.mobileNo}
                      {patient.uhid ? ` · UHID ${patient.uhid}` : ''}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
            {bookingSelectedPatient ? (
              <View style={styles.bookingLinked}>
                <View style={styles.bookingLinkedInfo}>
                  <Text style={styles.bookingMatchName}>{bookingSelectedPatient.name}</Text>
                  <Text style={styles.bookingMatchMeta}>
                    UHID {bookingSelectedPatient.uhid || '—'} · {bookingSelectedPatient.mobileNo}
                  </Text>
                </View>
                <TouchableOpacity onPress={clearBookingPatient}>
                  <Text style={styles.bookingChangeText}>Change</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </>
        ) : null}
      </View>
    );
  };

  if (!token) {
    return (
      <View style={styles.container}>
        <Header
          title={screenTitle}
          showHomeIcon
          onHomePress={() => navigation.popToTop()}
          onNotificationPress={() => navigation.navigate('Inbox')}
        />
        <View style={styles.centerState}>
          <Icon name="lock-outline" size={48} color={theme.colors.error} />
          <Text style={styles.emptyText}>Please log in to register a patient.</Text>
        </View>
      </View>
    );
  }

  if (loadingConfig || appDataLoading || !appConfig) {
    return (
      <View style={styles.container}>
        <Header
          title={screenTitle}
          showHomeIcon
          onHomePress={() => navigation.popToTop()}
          onNotificationPress={() => navigation.navigate('Inbox')}
        />
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading registration form...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header
        title={screenTitle}
        showHomeIcon
        onHomePress={() => navigation.popToTop()}
        onNotificationPress={() => navigation.navigate('Inbox')}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[theme.colors.primary]}
              tintColor={theme.colors.primary}
            />
          }
        >
          <Text style={styles.pageTitle}>{screenTitle}</Text>
          <Text style={styles.pageSubtitle}>
            {isEditMode
              ? 'Update patient details below.'
              : isAppointmentBooking
                ? 'Search by mobile, select patient UHID, or enter a new name.'
                : 'Register a new patient. Select the doctor in the form below.'}
          </Text>

          <View style={styles.formCard}>
            <Text style={styles.formHeading}>{screenTitle}</Text>

            {visibleFields.length === 0 ? (
              <View style={styles.centerState}>
                <Icon name="info-outline" size={40} color={theme.colors.disabled} />
                <Text style={styles.emptyText}>
                  No registration fields were returned by the config API.
                </Text>
                <TouchableOpacity style={styles.retryButton} onPress={loadForm}>
                  <Text style={styles.retryButtonText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {visibleFields.map(renderField)}

                {!isEditMode && customTimeRequired ? (
                  <CustomBookingTimeFields
                    startTime={customStartTime}
                    durationMinutes={customDuration}
                    onStartTimeChange={time => {
                      setCustomStartTime(time);
                      if (errors.customStartTime) {
                        setErrors(prev => {
                          const next = { ...prev };
                          delete next.customStartTime;
                          return next;
                        });
                      }
                    }}
                    onDurationChange={minutes => {
                      setCustomDuration(minutes);
                      if (errors.customDuration) {
                        setErrors(prev => {
                          const next = { ...prev };
                          delete next.customDuration;
                          return next;
                        });
                      }
                    }}
                    errors={{
                      startTime: errors.customStartTime,
                      duration: errors.customDuration,
                    }}
                  />
                ) : null}

                {!isEditMode && slotSelectionRequired ? (
                  <View style={styles.fieldBlock}>
                    <Text style={styles.fieldLabel}>Appointment Slot *</Text>
                    <TouchableOpacity
                      style={[
                        styles.input,
                        styles.selectInput,
                        errors.slot && styles.inputError,
                      ]}
                      activeOpacity={0.7}
                      disabled={slotsLoading}
                      onPress={() => loadSlotsAndOpenPicker()}
                    >
                      <Text
                        style={[
                          styles.selectText,
                          !selectedSlot && styles.placeholderText,
                        ]}
                        numberOfLines={1}
                      >
                        {selectedSlot
                          ? `${formatDateForDisplay(appointmentDate)} · ${selectedSlot.startTime}`
                          : slotsLoading
                          ? 'Loading slots...'
                          : 'Select a slot'}
                      </Text>
                      {slotsLoading ? (
                        <ActivityIndicator
                          size="small"
                          color={theme.colors.primary}
                        />
                      ) : (
                        <Icon
                          name="expand-more"
                          size={22}
                          color={theme.colors.textSecondary}
                        />
                      )}
                    </TouchableOpacity>
                    {errors.slot ? (
                      <Text style={styles.errorText}>{errors.slot}</Text>
                    ) : null}
                  </View>
                ) : null}
              </>
            )}

            {fields.length > 0 && (
              <TouchableOpacity
                style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
                activeOpacity={0.85}
                onPress={handleSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color={theme.colors.surface} />
                ) : (
                  <Text style={styles.submitButtonText}>
                    {isEditMode ? 'Save' : isAppointmentBooking ? 'Book' : 'Submit'}
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <DatePicker
        modal
        open={datePickerKey != null}
        date={datePickerValue}
        mode="date"
        onConfirm={date => {
          if (datePickerKey) {
            setFieldValue(datePickerKey, date.toISOString().slice(0, 10));
          }
          setDatePickerKey(null);
        }}
        onCancel={() => setDatePickerKey(null)}
      />

      <ModalBackdrop
        visible={slotPickerOpen}
        onClose={() => setSlotPickerOpen(false)}
        animationType="fade"
        align="center"
      >
        <View style={styles.slotModalCard}>
          <View style={styles.slotModalHeader}>
            <Text style={styles.slotModalTitle}>Select Slot</Text>
            <TouchableOpacity
              onPress={() => setSlotPickerOpen(false)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon name="close" size={22} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
          <Text style={styles.slotModalSubtitle}>
            {formatDateForDisplay(appointmentDate)}
          </Text>

          <SlotPickerGrid
            slots={slots}
            selectedSlotId={selectedSlot?._id}
            loading={slotsLoading}
            onSelect={slot => {
              if (!isSlotSelectable(slot)) return;
              setSelectedSlot(slot);
              setSlotPickerOpen(false);
              if (errors.slot) {
                setErrors(prev => {
                  const next = { ...prev };
                  delete next.slot;
                  return next;
                });
              }
            }}
          />
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
  flex: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xxl,
  },
  pageTitle: {
    fontSize: theme.typography.fontSizes.xxxl,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  pageSubtitle: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.lg,
  },
  formCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    ...theme.shadows.sm,
  },
  formHeading: {
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
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
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
  },
  textArea: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  inputError: {
    borderColor: theme.colors.error,
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
  placeholderText: {
    color: theme.colors.placeholder,
  },
  bookingHint: {
    marginTop: theme.spacing.xs,
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
  },
  bookingMatches: {
    marginTop: theme.spacing.xs,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    overflow: 'hidden',
  },
  bookingMatchItem: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  bookingMatchName: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.medium,
    color: theme.colors.text,
  },
  bookingMatchMeta: {
    marginTop: 2,
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
  },
  bookingLinked: {
    marginTop: theme.spacing.sm,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  bookingLinkedInfo: {
    flex: 1,
  },
  bookingChangeText: {
    color: theme.colors.primary,
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  dropdownList: {
    marginTop: theme.spacing.xs,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  dropdownItemText: {
    flex: 1,
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
  },
  dropdownItemTextActive: {
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  errorText: {
    marginTop: theme.spacing.xs,
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.error,
  },
  submitButton: {
    marginTop: theme.spacing.md,
    alignSelf: 'center',
    minWidth: 160,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.surface,
  },
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.xl,
  },
  loadingText: {
    marginTop: theme.spacing.md,
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.textSecondary,
  },
  emptyText: {
    marginTop: theme.spacing.md,
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: theme.spacing.md,
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
  },
  retryButtonText: {
    color: theme.colors.surface,
    fontWeight: theme.typography.fontWeights.semiBold,
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
  slotModalLoader: {
    marginVertical: theme.spacing.xl,
  },
  slotModalEmpty: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    paddingVertical: theme.spacing.xl,
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
});

export default AddPatientScreen;
