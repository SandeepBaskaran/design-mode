// Re-export shared constants for content script bundling
export const DATA_ATTR = 'data-dm-id';
export const Z_INDEX = {
  // Box-model bands sit BELOW their respective outlines so the ring
  // always paints on top of the fill (matches Chrome DevTools' look).
  HOVER_BANDS: 2147483638,
  SELECT_BANDS: 2147483639,
  HOVER_OVERLAY: 2147483640,
  SELECT_OVERLAY: 2147483641,
  COMMENT_PIN: 2147483642,
  ANNOTATION_PIN: 2147483643,
  DRAWING_CANVAS: 2147483644,
  SNAP_GUIDE: 2147483645,
  RESIZE_HANDLE: 2147483646,
  PANEL: 2147483647,
  TOOLBAR: 2147483647,
} as const;
export const DEFAULT_WS_PORT = 9960;
