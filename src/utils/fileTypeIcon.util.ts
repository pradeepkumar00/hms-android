// Shared file-type → icon mapping so thumbnails/icons stay consistent across
// Patient History cards, the multi-file popup, the file-viewer strip, and any
// other file listing. Icons are MaterialIcons names.

export interface FileTypeIcon {
  icon: string;
  color: string;
  label: string;
  isImage: boolean;
}

const extOf = (name?: string | null): string => {
  if (!name) return '';
  const match = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : '';
};

/**
 * Resolve the icon, tint colour and short label for a file based on its MIME
 * type and/or file name. Falls back gracefully to a generic file icon.
 */
export const getFileTypeIcon = (
  mimeType?: string | null,
  name?: string | null,
): FileTypeIcon => {
  const mime = (mimeType || '').toLowerCase();
  const ext = extOf(name);
  const has = (list: string[]) => list.includes(ext);

  if (mime.startsWith('image/') || has(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif', 'bmp'])) {
    return { icon: 'image', color: '#8B5CF6', label: 'IMG', isImage: true };
  }
  if (mime.includes('pdf') || ext === 'pdf') {
    return { icon: 'picture-as-pdf', color: '#E53935', label: 'PDF', isImage: false };
  }
  if (mime.includes('word') || mime.includes('msword') || has(['doc', 'docx'])) {
    return { icon: 'description', color: '#2B579A', label: (ext || 'doc').toUpperCase(), isImage: false };
  }
  if (
    mime.includes('sheet') ||
    mime.includes('excel') ||
    mime.includes('csv') ||
    has(['xls', 'xlsx', 'csv'])
  ) {
    return { icon: 'grid-on', color: '#217346', label: (ext || 'xls').toUpperCase(), isImage: false };
  }
  if (mime.startsWith('text/') || has(['txt'])) {
    return { icon: 'article', color: '#607D8B', label: 'TXT', isImage: false };
  }
  if (
    mime.includes('zip') ||
    mime.includes('compressed') ||
    mime.includes('tar') ||
    has(['zip', 'rar', '7z', 'tar', 'gz'])
  ) {
    return { icon: 'folder-zip', color: '#F59E0B', label: (ext || 'zip').toUpperCase(), isImage: false };
  }
  return { icon: 'insert-drive-file', color: '#64748B', label: (ext || 'file').toUpperCase(), isImage: false };
};
