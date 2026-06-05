import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Switch,
  StatusBar,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppSelector, selectAuthToken } from '../store';
import { theme } from '../constants/theme';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Appointment } from '../types';

interface OPDScreenProps {
  navigation: any;
  route: { params?: { appointment?: Appointment; patient?: any } };
}

// Categories requested when loading the prescription configuration
const PRESCRIPTION_CATEGORIES =
  'DENTAL,EYE,CARDIOLOGY,DERMATOLOGY,ENT,ORTHOPEDICS,PEDIATRICS,GYNECOLOGY,NEUROLOGY,PSYCHIATRY,GENERAL_MEDICINE,PULMONOLOGY,GASTROENTEROLOGY,UROLOGY';

const formatDate = (value?: string) => {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const OPDScreen: React.FC<OPDScreenProps> = ({ navigation, route }) => {
  const token = useAppSelector(selectAuthToken);
  const appointment = route.params?.appointment;
  const patient = route.params?.patient;
  const patientId = appointment?.patientId || patient?._id || patient?.id;

  const [sessionMode, setSessionMode] = useState(true);
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(false);

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

        // Prescription history for this patient
        const list = patientId
          ? await realAuthService
              .fetchPrescriptions(patientId, 'opd', token)
              .catch(() => [])
          : [];
        if (active) setPrescriptions(list || []);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [token, patientId]);

  const headerItem = (label: string, value: string) => (
    <View style={styles.headerItem}>
      <Text style={styles.hLabel}>{label}</Text>
      <Text style={styles.hValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );

  const renderPrescription = (p: any, idx: number) => (
    <View key={p?._id || p?.id || idx} style={styles.prescriptionCard}>
      <View style={styles.prescriptionTopRow}>
        <Text style={styles.prescriptionDate}>
          {formatDate(p?.createdAt || p?.date)}
        </Text>
        {!!(p?.category || p?.type) && (
          <Text style={styles.prescriptionTag}>{p?.category || p?.type}</Text>
        )}
      </View>
      {!!(p?.doctorName || p?.doctor?.name) && (
        <Text style={styles.prescriptionDoctor} numberOfLines={1}>
          {p?.doctorName || p?.doctor?.name}
        </Text>
      )}
      {!!(p?.diagnosis || p?.complaint || p?.notes) && (
        <Text style={styles.prescriptionNote} numberOfLines={2}>
          {p?.diagnosis || p?.complaint || p?.notes}
        </Text>
      )}
    </View>
  );

  const comingSoon = (feature: string) =>
    Alert.alert(feature, `"${feature}" is not available yet.`);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={theme.colors.surface} />

      {/* Patient header */}
      <SafeAreaView edges={['top']} style={styles.headerSafe}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            activeOpacity={0.8}
            onPress={() => navigation.goBack()}
          >
            <Icon name="arrow-back" size={24} color={theme.colors.surface} />
          </TouchableOpacity>
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
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Session mode */}
        <View style={styles.sessionRow}>
          <Text style={styles.sessionLabel}>Session mode</Text>
          <Switch
            value={sessionMode}
            onValueChange={setSessionMode}
            trackColor={{ true: '#4CAF50', false: '#CFD3D8' }}
            thumbColor={theme.colors.surface}
          />
          <Text style={styles.sessionState}>{sessionMode ? 'On' : 'Off'}</Text>
        </View>

        {/* Actions */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.actionBtn}
            activeOpacity={0.8}
            onPress={() => comingSoon('Create Session')}
          >
            <Text style={styles.actionText}>Create Session</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            activeOpacity={0.8}
            onPress={() => comingSoon('Vital Signs')}
          >
            <Text style={styles.actionText}>Vital Signs</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            activeOpacity={0.8}
            onPress={() => comingSoon('Prescription Assets')}
          >
            <Text style={styles.actionText}>Prescription Assets</Text>
          </TouchableOpacity>
        </View>

        {/* Prescriptions history */}
        <Text style={styles.historyTitle}>Prescriptions History</Text>
        {loading ? (
          <ActivityIndicator
            style={styles.historyLoader}
            color={theme.colors.primary}
          />
        ) : prescriptions.length === 0 ? (
          <Text style={styles.emptyText}>
            No prescriptions found for this patient
          </Text>
        ) : (
          prescriptions.map(renderPrescription)
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  headerSafe: {
    backgroundColor: theme.colors.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  backBtn: {
    width: 48,
    height: 48,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.md,
  },
  headerGrid: {
    flex: 1,
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
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  sessionLabel: {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.text,
    marginRight: theme.spacing.md,
  },
  sessionState: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
    marginLeft: theme.spacing.sm,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: theme.spacing.lg,
  },
  actionBtn: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    margin: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.sm,
  },
  actionText: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.text,
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
  prescriptionCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    ...theme.shadows.sm,
  },
  prescriptionTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  prescriptionDate: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.text,
  },
  prescriptionTag: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.primary,
  },
  prescriptionDoctor: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  prescriptionNote: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text,
    marginTop: theme.spacing.xs,
  },
});

export default OPDScreen;
