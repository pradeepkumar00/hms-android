export interface UploadViewerImageLayout {
  imgWidth: number;
  imgHeight: number;
  frameWidth: number;
  frameHeight: number;
}

/** Fit an image into the viewer body, reserving layout space for rotation. */
export function layoutUploadViewerImage(
  naturalWidth: number,
  naturalHeight: number,
  maxWidth: number,
  maxHeight: number,
  rotationDeg: number,
  zoom = 1,
): UploadViewerImageLayout | null {
  if (!naturalWidth || !naturalHeight || maxWidth <= 0 || maxHeight <= 0) {
    return null;
  }

  const rot = ((rotationDeg % 360) + 360) % 360;
  const swapped = rot === 90 || rot === 270;
  const fitW = swapped ? maxHeight : maxWidth;
  const fitH = swapped ? maxWidth : maxHeight;
  const scale = Math.min(1, fitW / naturalWidth, fitH / naturalHeight) * zoom;
  const imgWidth = Math.round(naturalWidth * scale);
  const imgHeight = Math.round(naturalHeight * scale);

  return {
    imgWidth,
    imgHeight,
    frameWidth: swapped ? imgHeight : imgWidth,
    frameHeight: swapped ? imgWidth : imgHeight,
  };
}
