/**
 * Flatten a prescriptionUpload row into individual viewable file parts.
 * Supports legacy single-file rows (top-level filePath) and batch rows (`files[]`).
 */
export function collectUploadFileParts(item: any): any[] {
  if (!item) return [];

  const nested = (Array.isArray(item.files) ? item.files : []).filter(
    (f: any) => f?.filePath,
  );
  const parts: any[] = [];
  const seen = new Set<string>();

  const pushPart = (fileRow: any) => {
    const key = String(fileRow?.filePath || '');
    if (!key || seen.has(key)) return;
    seen.add(key);
    parts.push(toUploadFilePart(item, fileRow));
  };

  if (nested.length) {
    nested.forEach(pushPart);
  }
  if (item.filePath) {
    pushPart(item);
  }
  return parts;
}

function toUploadFilePart(parent: any, fileRow: any): any {
  return {
    ...parent,
    filePath: fileRow.filePath,
    fileName: fileRow.fileName ?? parent.fileName,
    originalName: fileRow.originalName ?? parent.originalName,
    mimeType: fileRow.mimeType ?? parent.mimeType,
    sizeBytes: fileRow.sizeBytes ?? parent.sizeBytes,
    signedUrl: fileRow.signedUrl ?? parent.signedUrl,
    thumbUrl:
      fileRow.thumbUrl ??
      fileRow.signedUrl ??
      parent.thumbUrl ??
      parent.signedUrl,
    _batchParent: parent,
    _batchParentId: parent._id,
    _batchFileKey: fileRow.filePath,
  };
}

export function isImageUploadPart(row: any): boolean {
  const mime = String(row?.mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  const name = String(
    row?.originalName || row?.fileName || row?.filePath || '',
  ).toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(name);
}

export function viewerPartKey(part: any): string {
  return String(part?.filePath || part?._batchFileKey || part?._id || '');
}
