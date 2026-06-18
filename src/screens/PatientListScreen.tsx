import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Linking,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAppSelector, selectAuthToken } from '../store';
import { theme } from '../constants/theme';
import { Header } from '../components';
import Icon from 'react-native-vector-icons/MaterialIcons';
import realAuthService from '../services/realAuthService';
import { Appointment, Patient } from '../types';

const PAGE_SIZE = 20;

interface PatientListScreenProps {
  navigation: any;
}

const normalizePatient = (raw: any): Patient => {
  const source = raw?.user ?? raw?.patient ?? raw;
  const firstName = source.firstName || source.fname || '';
  const lastName = source.lastName || source.lname || '';
  const combinedName = [firstName, lastName].filter(Boolean).join(' ').trim();

  return {
    _id: source._id || source.id || raw._id || raw.id,
    id: source.id || raw.id,
    name:
      source.name ||
      source.patientName ||
      source.fullName ||
      combinedName ||
      'Unknown',
    mobileNo:
      source.mobileNo ||
      source.mobile ||
      source.phone ||
      source.phoneNo ||
      '',
    uhid: source.uhid ?? source.UHID ?? source.uhId ?? raw.uhid ?? null,
    gender: source.gender,
    age: source.age,
    type: source.type || source.patientType || raw.type,
  };
};

const PatientListScreen: React.FC<PatientListScreenProps> = ({ navigation }) => {
  const token = useAppSelector(selectAuthToken);

  const [patients, setPatients] = useState<Patient[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [movingPatientId, setMovingPatientId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const fetchPatients = useCallback(
    async (pageToLoad: number, search: string, replace = true) => {
      if (!token) {
        setError('Authentication required');
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const result = await realAuthService.fetchPatients(token, {
          page: pageToLoad,
          limit: PAGE_SIZE,
          search: search || undefined,
        });

        const normalized = result.patients.map(normalizePatient);
        setPatients(normalized);
        setPage(result.page);
        setTotal(result.total);
        setHasMore(result.hasMore);
      } catch (err) {
        console.error('Error fetching patients:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to fetch patients',
        );
        if (replace) {
          setPatients([]);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [token],
  );

  useFocusEffect(
    useCallback(() => {
      if (!token) {
        setError('Authentication required');
        return;
      }
      fetchPatients(0, debouncedSearch);
    }, [token, fetchPatients, debouncedSearch]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchPatients(page, debouncedSearch);
    setRefreshing(false);
  }, [fetchPatients, page, debouncedSearch]);

  const goToPage = useCallback(
    (nextPage: number) => {
      if (nextPage < 0 || nextPage >= totalPages || isLoading) return;
      fetchPatients(nextPage, debouncedSearch);
    },
    [fetchPatients, debouncedSearch, totalPages, isLoading],
  );

  const filteredPatients = useMemo(() => {
    if (!debouncedSearch) return patients;

    const query = debouncedSearch.toLowerCase();
    return patients.filter(patient => {
      const name = (patient.name || '').toLowerCase();
      const mobile = (patient.mobileNo || '').toLowerCase();
      const uhid = String(patient.uhid ?? '').toLowerCase();
      return (
        name.includes(query) || mobile.includes(query) || uhid.includes(query)
      );
    });
  }, [patients, debouncedSearch]);

  const handleCall = useCallback((mobileNo?: string) => {
    const phone = mobileNo?.trim();
    if (!phone) {
      Alert.alert('Call', 'No mobile number available for this patient.');
      return;
    }

    Linking.openURL(`tel:${phone}`).catch(() => {
      Alert.alert('Call', 'Unable to open the phone dialer.');
    });
  }, []);

  const handleMoveToOpd = useCallback(
    async (patient: Patient) => {
      const patientId = patient._id || patient.id;
      if (!patientId || !token || movingPatientId) return;

      setMovingPatientId(patientId);
      try {
        const fullPatient = await realAuthService.moveToOpd(patientId, token);
        const resolvedPatient = fullPatient || patient;
        const appointment: Appointment = {
          _id: `patient-list-${patientId}`,
          patientId,
          patientName: resolvedPatient.name || patient.name,
          mobileNo: resolvedPatient.mobileNo || patient.mobileNo,
          uhid: resolvedPatient.uhid ?? patient.uhid,
          date: new Date().toISOString().slice(0, 10),
        };

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
        setMovingPatientId(null);
      }
    },
    [token, navigation, movingPatientId],
  );

  const renderPatientRow = ({ item }: { item: Patient }) => {
    const patientId = item._id || item.id || '';
    const isMoving = movingPatientId === patientId;

    return (
      <View style={styles.row}>
        <Text style={[styles.cell, styles.nameCell]} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={[styles.cell, styles.uhidCell]} numberOfLines={1}>
          {item.uhid || '—'}
        </Text>
        <Text style={[styles.cell, styles.mobileCell]} numberOfLines={1}>
          {item.mobileNo || '—'}
        </Text>
        <View style={styles.actionsCell}>
          <TouchableOpacity
            style={[
              styles.actionButton,
              !item.mobileNo && styles.actionButtonDisabled,
            ]}
            onPress={() => handleCall(item.mobileNo)}
            disabled={!item.mobileNo}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={`Call ${item.name}`}
          >
            <Icon
              name="phone"
              size={18}
              color={item.mobileNo ? theme.colors.success : theme.colors.disabled}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleMoveToOpd(item)}
            disabled={isMoving}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={`Move ${item.name} to OPD`}
          >
            {isMoving ? (
              <ActivityIndicator size="small" color={theme.colors.primary} />
            ) : (
              <Icon name="local-hospital" size={18} color={theme.colors.primary} />
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Icon name="people-outline" size={64} color={theme.colors.disabled} />
      <Text style={styles.emptyStateTitle}>No Patients Found</Text>
      <Text style={styles.emptyStateText}>
        {searchQuery.trim()
          ? `No patients match "${searchQuery}"`
          : 'There are no patients to display.'}
      </Text>
    </View>
  );

  if (error && !refreshing && patients.length === 0) {
    return (
      <View style={styles.container}>
        <Header
          title="Patients"
          showHomeIcon
          onHomePress={() => navigation.popToTop()}
          onNotificationPress={() => navigation.navigate('Inbox')}
        />
        <View style={styles.errorContainer}>
          <Icon name="error" size={48} color={theme.colors.error} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => fetchPatients(0, debouncedSearch)}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header
        title="Patients"
        showHomeIcon
        onHomePress={() => navigation.popToTop()}
        onNotificationPress={() => navigation.navigate('Inbox')}
      />

      <View style={styles.searchContainer}>
        <Icon name="search" size={20} color={theme.colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, number or UHID/PID"
          placeholderTextColor={theme.colors.placeholder}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Icon name="close" size={20} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.listSection}>
        <View style={styles.tableHeader}>
          <Text style={[styles.headerCell, styles.nameCell]}>NAME</Text>
          <Text style={[styles.headerCell, styles.uhidCell]}>UHID</Text>
          <Text style={[styles.headerCell, styles.mobileCell]}>MOBILE</Text>
          <Text style={[styles.headerCell, styles.actionsCell]}>ACTION</Text>
        </View>

        <FlatList
          style={styles.list}
          data={filteredPatients}
          renderItem={renderPatientRow}
          keyExtractor={(item, index) => item._id || item.id || `patient-${index}`}
          contentContainerStyle={[
            styles.listContainer,
            filteredPatients.length === 0 && styles.emptyListContainer,
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[theme.colors.primary]}
              tintColor={theme.colors.primary}
            />
          }
          ListEmptyComponent={!isLoading ? renderEmptyState : null}
        />
      </View>

      {total > 0 && (
        <View style={styles.pagination}>
          <TouchableOpacity
            style={[styles.pageButton, page === 0 && styles.pageButtonDisabled]}
            onPress={() => goToPage(0)}
            disabled={page === 0 || isLoading}
          >
            <Icon
              name="first-page"
              size={22}
              color={page === 0 ? theme.colors.disabled : theme.colors.primary}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.pageButton, page === 0 && styles.pageButtonDisabled]}
            onPress={() => goToPage(page - 1)}
            disabled={page === 0 || isLoading}
          >
            <Icon
              name="chevron-left"
              size={24}
              color={page === 0 ? theme.colors.disabled : theme.colors.primary}
            />
          </TouchableOpacity>

          <Text style={styles.pageIndicator}>
            {page + 1} / {totalPages}
          </Text>

          <TouchableOpacity
            style={[
              styles.pageButton,
              !hasMore && styles.pageButtonDisabled,
            ]}
            onPress={() => goToPage(page + 1)}
            disabled={!hasMore || isLoading}
          >
            <Icon
              name="chevron-right"
              size={24}
              color={!hasMore ? theme.colors.disabled : theme.colors.primary}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.pageButton,
              !hasMore && styles.pageButtonDisabled,
            ]}
            onPress={() => goToPage(totalPages - 1)}
            disabled={!hasMore || isLoading}
          >
            <Icon
              name="last-page"
              size={22}
              color={!hasMore ? theme.colors.disabled : theme.colors.primary}
            />
          </TouchableOpacity>
        </View>
      )}

      {isLoading && !refreshing && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    ...theme.shadows.sm,
  },
  searchInput: {
    flex: 1,
    marginLeft: theme.spacing.sm,
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
  },
  listSection: {
    flex: 1,
    marginHorizontal: theme.spacing.md,
  },
  list: {
    flex: 1,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: theme.colors.secondary,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderTopLeftRadius: theme.borderRadius.md,
    borderTopRightRadius: theme.borderRadius.md,
  },
  headerCell: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.textInverse,
    letterSpacing: 0.5,
  },
  listContainer: {
    backgroundColor: theme.colors.surface,
    borderBottomLeftRadius: theme.borderRadius.md,
    borderBottomRightRadius: theme.borderRadius.md,
    ...theme.shadows.sm,
  },
  emptyListContainer: {
    flexGrow: 1,
    minHeight: 200,
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  cell: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text,
  },
  nameCell: {
    flex: 1.4,
    paddingRight: theme.spacing.xs,
  },
  uhidCell: {
    flex: 0.8,
    paddingRight: theme.spacing.xs,
  },
  mobileCell: {
    flex: 1,
    paddingRight: theme.spacing.xs,
  },
  actionsCell: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: theme.spacing.xs,
    minWidth: 72,
  },
  actionButton: {
    width: 32,
    height: 32,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xxl,
    paddingHorizontal: theme.spacing.xl,
  },
  emptyStateTitle: {
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  emptyStateText: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  pageButton: {
    width: 36,
    height: 36,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.sm,
  },
  pageButtonDisabled: {
    opacity: 0.5,
  },
  pageIndicator: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.text,
    minWidth: 64,
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  errorText: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.error,
    textAlign: 'center',
    marginVertical: theme.spacing.md,
  },
  retryButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
  },
  retryButtonText: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.surface,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default PatientListScreen;
