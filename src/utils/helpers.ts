import { FILE_UPLOAD } from '../constants/app';

export const formatDate = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return 'Invalid Date';
  }
};

export const formatDateTime = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    return date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return 'Invalid Date';
  }
};

export const formatTimeAgo = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInMins = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    if (diffInMins < 1) return 'Just now';
    if (diffInMins < 60)
      return `${diffInMins} min${diffInMins > 1 ? 's' : ''} ago`;
    if (diffInHours < 24)
      return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
    if (diffInDays < 7)
      return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;

    return formatDate(dateString);
  } catch {
    return 'Unknown';
  }
};

export const capitalizeFirst = (str: string): string => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

export const truncateText = (text: string, maxLength: number): string => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.substring(0, maxLength)}...`;
};

export const getInitials = (name: string): string => {
  if (!name) return '';
  const words = name.trim().split(' ');
  if (words.length === 1) {
    return words[0].substring(0, 2).toUpperCase();
  }
  return words.map(word => word.charAt(0).toUpperCase()).join('');
};

export const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

export const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number,
): ((...args: Parameters<T>) => void) => {
  let timeout: any; // Changed from NodeJS.Timeout to fix TS error

  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

export const isValidFileSize = (sizeInBytes: number): boolean => {
  return sizeInBytes <= FILE_UPLOAD.maxSizeInBytes;
};

export const isValidFileType = (mimeType: string): boolean => {
  return FILE_UPLOAD.allowedTypes.includes(mimeType as any);
};

export const getFileExtension = (filename: string): string => {
  return filename.toLowerCase().substring(filename.lastIndexOf('.'));
};

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

export const getStatusColor = (status: string): string => {
  switch (status.toLowerCase()) {
    case 'assigned':
      return '#FF9800'; // Orange
    case 'in progress':
      return '#2196F3'; // Blue
    case 'completed':
      return '#4CAF50'; // Green
    default:
      return '#666666'; // Gray
  }
};

export const getDepartmentColor = (department: string): string => {
  switch (department.toLowerCase()) {
    case 'hr':
      return '#9C27B0'; // Purple
    case 'admin':
      return '#F44336'; // Red
    case 'supervisor':
      return '#4CAF50'; // Green
    default:
      return '#666666'; // Gray
  }
};

export const isURL = (str: string): boolean => {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
};
export const maskMobileNumber = (mobileNumber: string): string => {
  if (!mobileNumber) return '';
  if (mobileNumber.length < 4) return mobileNumber;

  const visiblePart = mobileNumber.slice(-4);
  const maskedPart = '*'.repeat(mobileNumber.length - 4);
  return maskedPart + visiblePart;
};

// Date formatting to dd/mm/yyyy
export const formatDateDDMMYYYY = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return 'Invalid Date';
  }
};

// Enhanced relative time formatting with detailed status info
export const formatDetailedRelativeTime = (
  dateString: string,
  status?: 'Assigned' | 'In Progress' | 'Completed',
  dueDate?: string,
): string => {
  try {
    const now = new Date();
    const targetDate = new Date(dateString);
    const diffMs = now.getTime() - targetDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    // For completed tasks, show when it was completed (never show overdue)
    if (status === 'Completed') {
      if (diffDays > 0) {
        return `Completed: ${diffDays}d ago`;
      } else if (diffHours > 0) {
        return `Completed: ${diffHours}h ago`;
      } else {
        return `Completed: ${diffMinutes}m ago`;
      }
    }

    // For active tasks (Assigned or In Progress), check if overdue based on due date
    if (dueDate && (status === 'Assigned' || status === 'In Progress')) {
      const due = new Date(dueDate);
      const overdueDiff = now.getTime() - due.getTime();
      const overdueDays = Math.floor(overdueDiff / (1000 * 60 * 60 * 24));

      if (overdueDays > 0) {
        return `Overdue: ${overdueDays}d ago`;
      } else {
        // Not overdue, show due in X days
        const dueDays = Math.ceil(
          (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
        );
        if (dueDays === 0) {
          return 'Due: Today';
        } else if (dueDays === 1) {
          return 'Due: Tomorrow';
        } else {
          return `Due: In ${dueDays}d`;
        }
      }
    }

    // Fallback to creation time
    if (diffDays > 0) {
      return `Created: ${diffDays}d ago`;
    } else if (diffHours > 0) {
      return `Created: ${diffHours}h ago`;
    } else {
      return `Created: ${diffMinutes}m ago`;
    }
  } catch {
    return 'Unknown time';
  }
};
