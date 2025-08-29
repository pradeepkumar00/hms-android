import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import DatePicker from 'react-native-date-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import DropDownPicker from 'react-native-dropdown-picker';
import {
  launchImageLibrary,
  MediaType,
  ImageLibraryOptions,
} from 'react-native-image-picker';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {
  useAppDispatch,
  useAppSelector,
  selectCurrentUser,
  selectAuthToken,
  selectTasksLoading,
  selectTasksError,
} from '../store';
import {
  createTask,
  clearTaskError,
  fetchInboxNotifications,
} from '../store/taskSlice';
import { validateTaskForm } from '../utils/validation';
import { authService } from '../services/authService';
import { notificationService } from '../services/notificationService';
import { theme } from '../constants/theme';
import { DEPARTMENTS } from '../constants/app';
import { User } from '../types';
import Header from '../components/Header';

interface CreateTaskScreenProps {
  navigation: any;
}

const CreateTaskScreen: React.FC<CreateTaskScreenProps> = ({ navigation }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [department, setDepartment] = useState<string | null>('');
  const [assignedTo, setAssignedTo] = useState<string | null>('');
  const [selectedFile, setSelectedFile] = useState<{
    name: string;
    uri: string;
    type: string;
  } | null>(null);
  const [timeline, setTimeline] = useState<Date>(
    new Date(Date.now() + 24 * 60 * 60 * 1000),
  ); // Default to tomorrow
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [departmentUsers, setDepartmentUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [availableDepartments, setAvailableDepartments] = useState<string[]>([
    'admin',
    'doctor',
    'tvscreen',
  ]);
  const [allUsers, setAllUsers] = useState<User[]>([]);

  // Dropdown states
  const [departmentOpen, setDepartmentOpen] = useState(false);
  const [employeeOpen, setEmployeeOpen] = useState(false);
  const [departmentItems, setDepartmentItems] = useState<any[]>([]);
  const [employeeItems, setEmployeeItems] = useState<
    { label: string; value: string }[]
  >([]);

  // Refs for focus management
  const titleRef = useRef<TextInput>(null);
  const descriptionRef = useRef<TextInput>(null);

  const dispatch = useAppDispatch();
  const currentUser = useAppSelector(selectCurrentUser);
  const authToken = useAppSelector(selectAuthToken);
  const isLoading = useAppSelector(selectTasksLoading);
  const error = useAppSelector(selectTasksError);

  useEffect(() => {
    // Clear errors when component mounts
    dispatch(clearTaskError());
  }, [dispatch]);

  // Fetch departments and users from real API
  useEffect(() => {
    const fetchDepartmentsAndUsers = async () => {
      if (!authToken) return;

      try {
        const { departments, users } =
          await authService.getAllUsersWithDepartments(authToken);
        console.log('====================================');
        console.log({ departments, users });
        console.log('====================================');

        setAvailableDepartments(departments);
        setAllUsers(users);

        // Update department dropdown items with proper labels
        const departmentOptions = departments.map(dept => ({
          label: dept.charAt(0).toUpperCase() + dept.slice(1), // Capitalize first letter
          value: dept,
        }));
        setDepartmentItems(departmentOptions as any);

        console.log('Departments fetched:', departments);
        console.log('Users fetched:', users.length);
      } catch (error) {
        console.error('Failed to fetch departments and users:', error);
        // Fallback to default departments if API fails
        const defaultDepartments = ['admin', 'doctor', 'tvscreen'];
        setAvailableDepartments(defaultDepartments);
        setDepartmentItems([
          { label: 'HR', value: 'HR' },
          { label: 'Supervisor', value: 'Supervisor' },
          { label: 'Manager', value: 'Manager' },
        ] as any);
      }
    };

    fetchDepartmentsAndUsers();
  }, [authToken]);

  useEffect(() => {
    // Show error alert if task creation fails
    if (error) {
      Alert.alert('Task Creation Failed', error, [
        { text: 'OK', onPress: () => dispatch(clearTaskError()) },
      ]);
    }
  }, [error, dispatch]);

  // Filter users when department changes
  useEffect(() => {
    if (department && allUsers.length > 0) {
      setLoadingUsers(true);

      // Filter users by department from already fetched data
      const departmentUsers = allUsers.filter(user => user.type === department);
      setDepartmentUsers(departmentUsers);
      setAssignedTo(''); // Reset employee selection

      // Update employee dropdown items
      const items = departmentUsers.map(user => ({
        label: `${user.name} (${user.role})`,
        value: user.id,
      }));
      setEmployeeItems(items);
      setLoadingUsers(false);
    } else {
      setDepartmentUsers([]);
      setEmployeeItems([]);
      setAssignedTo('');
    }
  }, [department, allUsers]);

  const clearFieldError = useCallback(
    (field: string) => {
      if (errors[field]) {
        setErrors(prev => ({ ...prev, [field]: '' }));
      }
    },
    [errors],
  );

  const handleTitleChange = (text: string) => {
    setTitle(text);
    clearFieldError('title');
  };

  const handleDescriptionChange = (text: string) => {
    setDescription(text);
    clearFieldError('description');
  };

  const handleDepartmentChange = (value: string | null) => {
    setDepartment(value || '');
    clearFieldError('department');
  };

  const handleAssignedToChange = (userId: string | null) => {
    setAssignedTo(userId || '');
    clearFieldError('assignedTo');
  };

  const handleTimelineChange = (date: Date) => {
    setTimeline(date);
    clearFieldError('timeline');
  };

  const formatTimelineDisplay = (date: Date): string => {
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleFileUpload = async () => {
    try {
      // Use react-native-image-picker for file selection (supports documents via mixed media)
      const options: ImageLibraryOptions = {
        mediaType: 'mixed' as MediaType,
        includeBase64: false,
        maxHeight: 2000,
        maxWidth: 2000,
        quality: 0.8 as any, // Cast to any to handle PhotoQuality type
        selectionLimit: 1,
      };

      launchImageLibrary(options, response => {
        if (response.didCancel) {
          // User cancelled file picker
          return;
        }

        if (response.errorMessage) {
          console.error('File picker error:', response.errorMessage);
          Alert.alert(
            'File Upload Error',
            'Failed to select file. Please try again or continue without a file attachment.',
            [{ text: 'OK' }],
          );
          return;
        }

        if (response.assets && response.assets.length > 0) {
          const file = response.assets[0];
          setSelectedFile({
            name: file.fileName || 'Selected file',
            uri: file.uri || '',
            type: file.type || 'application/octet-stream',
          });
          clearFieldError('file');
        }
      });
    } catch (error) {
      console.error('File picker error:', error);
      Alert.alert(
        'File Upload Error',
        'Failed to select file. This feature may not be fully supported on this device. You can continue creating the task without a file attachment.',
        [{ text: 'OK' }],
      );
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
  };

  const handleCreateTask = async () => {
    // Clear previous errors
    setErrors({});

    // Validate form - department is optional, but if selected, user must be selected
    const validationErrors = validateTaskForm(
      title,
      description,
      department, // Department validation handled separately
      assignedTo, // Assignee validation handled separately
      timeline,
    );

    // Additional validation for department/assignee relationship
    // Note: Tasks can now be created without assignment (unassigned state)
    // Only validate assignee if department is selected AND user wants to assign
    // Users can select department but leave assignee empty to create unassigned task

    if (validationErrors.length > 0) {
      const errorMap: { [key: string]: string } = {};
      validationErrors.forEach(error => {
        errorMap[error.field] = error.message;
      });
      setErrors(errorMap);
      return;
    }

    if (!currentUser) {
      Alert.alert('Error', 'User not authenticated');
      return;
    }

    // Find the assigned user's name
    let assignedToName = '';
    if (assignedTo && allUsers.length > 0) {
      const assignedUser = allUsers.find(user => user.id === assignedTo);
      assignedToName = assignedUser ? assignedUser.name : '';
    }

    // Prepare task data
    const taskData = {
      title: title.trim(),
      description: description.trim(),
      department: department || '', // Convert null to empty string
      assignedTo: assignedTo || null,
      assignedToName: assignedToName,
      createdBy: currentUser.id,
      createdByName: currentUser.name,
      fileUrl: selectedFile
        ? `https://example.com/files/${Date.now()}_${selectedFile.name}`
        : undefined,
      timeline: timeline.toISOString(),
      tenantId: currentUser.tenantId,
    };

    try {
      const createdTask = await dispatch(createTask(taskData)).unwrap();
      console.log('✅ Task created successfully:', createdTask);

      // Send FCM notification payload to backend (enhanced reliability)
      try {
        await notificationService.sendTaskNotificationToBackend({
          title: taskData.title,
          assignedToName: taskData.assignedToName,
          taskId: createdTask.task?.id || `task_${Date.now()}`,
          tenantId: currentUser.tenantId,
          createdBy: currentUser.id,
          createdByName: currentUser.name,
          type: assignedTo ? 'task_assigned' : 'task_created',
        });
        console.log('📨 FCM notification payload processed');
      } catch (notificationError) {
        console.warn(
          '⚠️ FCM notification failed (continuing anyway):',
          notificationError,
        );
        // Don't fail task creation if notification fails
      }

      // Refresh inbox notifications to show the new notification immediately
      if (currentUser?.id) {
        dispatch(fetchInboxNotifications(currentUser.id));
      }

      // Show success message and navigate back
      const successMessage = assignedTo
        ? `Task created and assigned to ${assignedToName}!`
        : 'Task created successfully!';

      Alert.alert('Success', successMessage, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      // Error is handled in useEffect above
      console.error('Task creation error:', error);

      // Show specific error message if available
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to create task';
      Alert.alert('Task Creation Failed', errorMessage, [
        { text: 'Try Again', style: 'cancel' },
        { text: 'OK' },
      ]);
    }
  };

  const isFormValid = title.trim() && description.trim() && timeline;

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title="Create Task"
        showNotificationIcon={false}
        showHomeIcon={true}
        onHomePress={() => navigation.navigate('Main')}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.form}>
            {/* Title Field */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Task Title *</Text>
              <TextInput
                ref={titleRef}
                style={[styles.input, errors.title ? styles.inputError : null]}
                placeholder="Enter task title"
                placeholderTextColor={theme.colors.placeholder}
                value={title}
                onChangeText={handleTitleChange}
                autoCapitalize="sentences"
                autoCorrect={true}
                maxLength={100}
                editable={!isLoading}
                returnKeyType="next"
                onSubmitEditing={() => descriptionRef.current?.focus()}
                blurOnSubmit={false}
              />
              {errors.title ? (
                <Text style={styles.errorText}>{errors.title}</Text>
              ) : null}
            </View>

            {/* Description Field */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Description *</Text>
              <TextInput
                ref={descriptionRef}
                style={[
                  styles.textArea,
                  errors.description ? styles.inputError : null,
                ]}
                placeholder="Enter task description"
                placeholderTextColor={theme.colors.placeholder}
                value={description}
                onChangeText={handleDescriptionChange}
                autoCapitalize="sentences"
                autoCorrect={true}
                maxLength={500}
                multiline={true}
                numberOfLines={4}
                textAlignVertical="top"
                editable={!isLoading}
                returnKeyType="done"
                onSubmitEditing={() => {}}
                blurOnSubmit={true}
              />
              {errors.description ? (
                <Text style={styles.errorText}>{errors.description}</Text>
              ) : null}
            </View>

            {/* Department Selection - Optional */}
            <View style={[styles.inputContainer, { zIndex: 3000 }]}>
              <Text style={styles.label}>Assign to Department (Optional)</Text>
              <DropDownPicker
                open={departmentOpen}
                value={department}
                items={departmentItems}
                setOpen={setDepartmentOpen}
                setValue={setDepartment}
                setItems={setDepartmentItems}
                onChangeValue={handleDepartmentChange}
                placeholder="Select department..."
                disabled={isLoading}
                style={[
                  styles.dropdown,
                  errors.department ? styles.inputError : null,
                ]}
                dropDownContainerStyle={styles.dropdownContainer}
                textStyle={styles.dropdownText}
                placeholderStyle={styles.dropdownPlaceholder}
                zIndex={3000}
                zIndexInverse={1000}
              />
              {errors.department ? (
                <Text style={styles.errorText}>{errors.department}</Text>
              ) : null}
            </View>

            {/* Employee Selection - Show if department is selected */}
            {department && (
              <View style={[styles.inputContainer, { zIndex: 2000 }]}>
                <Text style={styles.label}>Assign to Employee (Optional)</Text>
                {loadingUsers ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator
                      size="small"
                      color={theme.colors.primary}
                    />
                    <Text style={styles.loadingText}>Loading employees...</Text>
                  </View>
                ) : (
                  <DropDownPicker
                    open={employeeOpen}
                    value={assignedTo}
                    items={employeeItems}
                    setOpen={setEmployeeOpen}
                    setValue={setAssignedTo}
                    setItems={setEmployeeItems}
                    onChangeValue={handleAssignedToChange}
                    placeholder={
                      !department
                        ? 'Select department first...'
                        : employeeItems.length === 0
                        ? 'No employees found'
                        : 'Select employee...'
                    }
                    disabled={
                      isLoading || !department || employeeItems.length === 0
                    }
                    style={[
                      styles.dropdown,
                      errors.assignedTo ? styles.inputError : null,
                    ]}
                    dropDownContainerStyle={styles.dropdownContainer}
                    textStyle={styles.dropdownText}
                    placeholderStyle={styles.dropdownPlaceholder}
                    zIndex={2000}
                    zIndexInverse={2000}
                  />
                )}
                {errors.assignedTo ? (
                  <Text style={styles.errorText}>{errors.assignedTo}</Text>
                ) : null}
              </View>
            )}

            {/* Timeline Field (Required) */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>
                Timeline <Text style={styles.required}>*</Text>
              </Text>
              <TouchableOpacity
                style={[
                  styles.input,
                  styles.datePickerButton,
                  errors.timeline ? styles.inputError : null,
                ]}
                onPress={() => setShowDatePicker(true)}
                disabled={isLoading}
              >
                <Text style={styles.datePickerText}>
                  {formatTimelineDisplay(timeline)}
                </Text>
                <Icon name="event" size={20} color={theme.colors.primary} />
              </TouchableOpacity>
              {errors.timeline ? (
                <Text style={styles.errorText}>{errors.timeline}</Text>
              ) : null}
            </View>

            {/* Date Picker Modal */}
            <DatePicker
              modal
              open={showDatePicker}
              date={timeline}
              mode="datetime"
              minimumDate={new Date()}
              onConfirm={date => {
                setShowDatePicker(false);
                handleTimelineChange(date);
              }}
              onCancel={() => {
                setShowDatePicker(false);
              }}
              title="Select Timeline"
            />

            {/* File Upload */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Attach File (Optional)</Text>

              {selectedFile ? (
                <View style={styles.fileContainer}>
                  <View style={styles.fileInfo}>
                    <Icon
                      name="insert-drive-file"
                      size={24}
                      color={theme.colors.primary}
                    />
                    <View style={styles.fileDetails}>
                      <Text style={styles.fileName} numberOfLines={1}>
                        {selectedFile.name}
                      </Text>
                      <Text style={styles.fileType}>{selectedFile.type}</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.removeFileButton}
                    onPress={handleRemoveFile}
                    disabled={isLoading}
                  >
                    <Icon name="close" size={20} color={theme.colors.error} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[
                    styles.fileUploadButton,
                    isLoading && styles.fileUploadButtonDisabled,
                  ]}
                  onPress={handleFileUpload}
                  disabled={isLoading}
                >
                  <Icon
                    name="cloud-upload"
                    size={24}
                    color={theme.colors.primary}
                  />
                  <Text style={styles.fileUploadText}>
                    Choose File (Images & Documents)
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Create Task Button */}
            <TouchableOpacity
              style={[
                styles.createButton,
                (!isFormValid || isLoading) && styles.createButtonDisabled,
              ]}
              onPress={handleCreateTask}
              disabled={!isFormValid || isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color={theme.colors.surface} size="small" />
              ) : (
                <Text style={styles.createButtonText}>Create Task</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: theme.spacing.lg,
  },
  form: {
    marginBottom: theme.spacing.xl,
  },
  inputContainer: {
    marginBottom: theme.spacing.lg,
  },
  label: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.medium,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
  },
  textArea: {
    minHeight: 100,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
  },
  inputError: {
    borderColor: theme.colors.error,
  },
  pickerWrapper: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
    overflow: 'hidden',
  },
  pickerDisabled: {
    backgroundColor: theme.colors.background,
    opacity: 0.6,
  },
  picker: {
    height: 50,
    color: theme.colors.text,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
  },
  loadingText: {
    marginLeft: theme.spacing.sm,
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
  },
  fileContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
  },
  fileInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  fileDetails: {
    flex: 1,
    marginLeft: theme.spacing.sm,
  },
  fileName: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.medium,
    color: theme.colors.text,
  },
  fileType: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  removeFileButton: {
    padding: theme.spacing.xs,
  },
  fileUploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.md,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    borderStyle: 'dashed',
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
  },
  fileUploadButtonDisabled: {
    opacity: 0.6,
  },
  fileUploadText: {
    marginLeft: theme.spacing.sm,
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeights.medium,
  },
  errorText: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.error,
    marginTop: theme.spacing.xs,
  },
  createButton: {
    height: 50,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: theme.spacing.lg,
    ...theme.shadows.sm,
  },
  createButtonDisabled: {
    opacity: 0.6,
  },
  createButtonText: {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.surface,
  },
  required: {
    color: theme.colors.error,
  },
  datePickerButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  datePickerText: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
    flex: 1,
  },
  dropdown: {
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
    minHeight: 50,
  },
  dropdownContainer: {
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    elevation: 5,
    shadowColor: theme.colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  dropdownText: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
  },
  dropdownPlaceholder: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.placeholder,
  },
});

export default CreateTaskScreen;
