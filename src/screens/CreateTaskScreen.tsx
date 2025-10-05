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
import SectionedMultiSelect from 'react-native-sectioned-multi-select';
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
  route?: {
    params?: {
      parentTaskId?: string;
    };
  };
}

const CreateTaskScreen: React.FC<CreateTaskScreenProps> = ({
  navigation,
  route,
}) => {
  // Extract parentTaskId from route params (Phase 10)
  const parentTaskId = route?.params?.parentTaskId;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [selectedFile, setSelectedFile] = useState<{
    name: string;
    uri: string;
    type: string;
  } | null>(null);
  const [timeline, setTimeline] = useState<Date>(
    new Date(Date.now() + 24 * 60 * 60 * 1000),
  ); // Default to tomorrow
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [userItems, setUserItems] = useState<
    Array<{ id: string; name: string }>
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

  // Fetch all users from real API for multi-select dropdown
  useEffect(() => {
    const fetchAllUsers = async () => {
      if (!authToken) return;

      try {
        setLoadingUsers(true);
        const { users } = await authService.getAllUsersWithDepartments(
          authToken,
        );
        console.log('Fetched all users for multi-select:', users.length);

        setAllUsers(users);

        // Format users for SectionedMultiSelect
        const userOptions = users.map(user => ({
          id: user.id,
          name: `${user.name} (${user.role || user.type})`,
        }));
        setUserItems(userOptions);
        setLoadingUsers(false);
      } catch (error) {
        console.error('Failed to fetch users:', error);
        setLoadingUsers(false);
        // Fallback to empty array if API fails
        setAllUsers([]);
        setUserItems([]);
      }
    };

    fetchAllUsers();
  }, [authToken]);

  useEffect(() => {
    // Show error alert if task creation fails
    if (error) {
      Alert.alert('Task Creation Failed', error, [
        { text: 'OK', onPress: () => dispatch(clearTaskError()) },
      ]);
    }
  }, [error, dispatch]);

  // Remove department filtering - no longer needed

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

  const handleUserSelect = (selectedIds: string[]) => {
    // Convert selected IDs to user objects with names
    const selected = selectedIds
      .map(id => {
        const user = allUsers.find(u => u.id === id);
        return {
          id: id,
          name: user?.name || '',
        };
      })
      .filter(user => user.name !== ''); // Filter out any invalid selections

    setSelectedUsers(selected);
    clearFieldError('users');
  };

  const handleRemoveUser = (userId: string) => {
    const updatedUsers = selectedUsers.filter(user => user.id !== userId);
    setSelectedUsers(updatedUsers);
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

    // Validate form with multi-user selection
    const validationErrors = validateTaskForm(
      title,
      description,
      selectedUsers,
      timeline,
    );

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

    // Prepare task data with multi-user assignment
    const taskData = {
      title: title.trim(),
      description: description.trim(),
      selectedUsers: selectedUsers, // Array of {id, name} objects
      createdBy: currentUser.id,
      createdByName: currentUser.name,
      fileUrl: selectedFile
        ? `https://example.com/files/${Date.now()}_${selectedFile.name}`
        : undefined,
      timeline: timeline.toISOString(),
      tenantId: currentUser.tenantId,
      parentTaskId: parentTaskId || undefined, // Phase 10: Include parent task ID if creating child task
    };

    try {
      const createdTask = await dispatch(createTask(taskData)).unwrap();
      console.log('✅ Task created successfully:', createdTask);

      // Send FCM notification payload to backend (enhanced reliability)
      try {
        const assignedNames = selectedUsers.map(u => u.name).join(', ');
        await notificationService.sendTaskNotificationToBackend({
          title: taskData.title,
          assignedToName: selectedUsers.length > 0 ? assignedNames : undefined,
          taskId: createdTask.task?.id || `task_${Date.now()}`,
          tenantId: currentUser.tenantId,
          createdBy: currentUser.id,
          createdByName: currentUser.name,
          type: selectedUsers.length > 0 ? 'task_assigned' : 'task_created',
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

      // Show success message and navigate appropriately
      const userNames = selectedUsers.map(u => u.name).join(', ');
      const successMessage =
        selectedUsers.length > 0
          ? `Task created and assigned to ${userNames}!`
          : 'Task created successfully!';

      // Phase 10: If creating child task, navigate to the created task details
      if (parentTaskId && createdTask.task?.id) {
        Alert.alert('Success', successMessage, [
          {
            text: 'View Task',
            onPress: () =>
              navigation.replace('TaskDetails', {
                taskId: createdTask.task.id,
              }),
          },
        ]);
      } else {
        Alert.alert('Success', successMessage, [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      }
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
        title={parentTaskId ? 'Create Child Task' : 'Create Task'}
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
          {/* Parent Task Info (Phase 10) */}
          {parentTaskId && (
            <View style={styles.parentTaskInfo}>
              <Icon
                name="info-outline"
                size={20}
                color={theme.colors.primary}
              />
              <Text style={styles.parentTaskInfoText}>
                Creating a child task
              </Text>
            </View>
          )}

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

            {/* Multi-User Selection */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>
                Assign to Users <Text style={styles.required}>*</Text>
              </Text>
              {loadingUsers ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator
                    size="small"
                    color={theme.colors.primary}
                  />
                  <Text style={styles.loadingText}>Loading users...</Text>
                </View>
              ) : (
                <>
                  <TouchableOpacity
                    style={[
                      styles.multiSelectButton,
                      errors.users ? styles.inputError : null,
                    ]}
                    disabled={isLoading || userItems.length === 0}
                  >
                    <SectionedMultiSelect
                      items={userItems}
                      IconRenderer={Icon}
                      uniqueKey="id"
                      displayKey="name"
                      selectText="Select users to assign..."
                      searchPlaceholderText="Search users..."
                      confirmText="Confirm"
                      showDropDowns={false}
                      readOnlyHeadings={false}
                      onSelectedItemsChange={handleUserSelect}
                      selectedItems={selectedUsers.map(u => u.id)}
                      hideChips={true}
                      showChips={false}
                      colors={{
                        primary: theme.colors.primary,
                        success: theme.colors.primary,
                        cancel: theme.colors.textSecondary,
                        text: theme.colors.text,
                        subText: theme.colors.textSecondary,
                        selectToggleTextColor: theme.colors.text,
                        searchPlaceholderTextColor: theme.colors.placeholder,
                        searchSelectionColor: theme.colors.primary,
                        chipColor: theme.colors.primary,
                        itemBackground: theme.colors.surface,
                        subItemBackground: theme.colors.background,
                      }}
                      styles={{
                        selectToggle: styles.selectToggle,
                        selectToggleText: styles.selectToggleText,
                        chipContainer: {
                          display: 'none', // Hide chips in toggle
                        },
                        chipText: {
                          display: 'none', // Hide chip text in toggle
                        },
                        button: {
                          backgroundColor: theme.colors.primary,
                        },
                        confirmText: {
                          color: theme.colors.surface,
                        },
                        searchBar: {
                          backgroundColor: theme.colors.surface,
                        },
                      }}
                      modalWithSafeAreaView
                      hideSearch={userItems.length < 5}
                    />
                  </TouchableOpacity>

                  {/* Display selected users as chips */}
                  {selectedUsers.length > 0 && (
                    <View style={styles.chipsContainer}>
                      {selectedUsers.map(user => (
                        <View key={user.id} style={styles.chip}>
                          <Text style={styles.chipText}>{user.name}</Text>
                          <TouchableOpacity
                            onPress={() => handleRemoveUser(user.id)}
                            style={styles.chipCloseButton}
                            disabled={isLoading}
                          >
                            <Icon
                              name="close"
                              size={16}
                              color={theme.colors.surface}
                            />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}
                </>
              )}
              {errors.users ? (
                <Text style={styles.errorText}>{errors.users}</Text>
              ) : null}
            </View>

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
  multiSelectButton: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
  },
  selectToggle: {
    padding: theme.spacing.md,
    minHeight: 50,
    justifyContent: 'center',
  },
  selectToggleText: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    borderRadius: 20,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    marginRight: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  chipText: {
    color: theme.colors.surface,
    fontSize: theme.typography.fontSizes.sm,
    marginRight: theme.spacing.xs,
  },
  chipCloseButton: {
    marginLeft: theme.spacing.xs,
  },
  // Phase 10: Parent Task Info
  parentTaskInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary + '15',
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.primary,
    padding: theme.spacing.md,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
  },
  parentTaskInfoText: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.medium,
    color: theme.colors.primary,
    marginLeft: theme.spacing.sm,
  },
});

export default CreateTaskScreen;
