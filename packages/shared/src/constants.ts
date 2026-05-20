// ============================================================
// Design Mode — Shared Constants
// ============================================================

export const APP_NAME = 'Design Mode';
export const APP_VERSION = '1.3.0';

// Default WebSocket port for companion server
export const DEFAULT_WS_PORT = 9960;

// MCP server name
export const MCP_SERVER_NAME = 'design-mode';

// Element data attribute for tracking
export const DATA_ATTR = 'data-dm-id';

// Z-index layers for overlay elements
export const Z_INDEX = {
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

// CSS property categories for the panel
export const STYLE_CATEGORIES = {
  POSITION: 'Position',
  LAYOUT: 'Layout',
  SIZE: 'Size & Spacing',
  TYPOGRAPHY: 'Typography',
  APPEARANCE: 'Appearance',
  BORDERS: 'Borders & Radius',
  EFFECTS: 'Effects',
  ANIMATION: 'Animation & Motion',
} as const;

// Phase 1: Annotation intent options
export const INTENT_OPTIONS = [
  { value: 'fix', label: 'Fix', icon: 'wrench', color: '#EF4444' },
  { value: 'change', label: 'Change', icon: 'pencil', color: '#F59E0B' },
  { value: 'question', label: 'Question', icon: 'help-circle', color: '#3B82F6' },
  { value: 'approve', label: 'Approve', icon: 'check-circle', color: '#10B981' },
  { value: 'note', label: 'Note', icon: 'sticky-note', color: '#8B5CF6' },
] as const;

export const SEVERITY_OPTIONS = [
  { value: 'blocking', label: 'Blocking', icon: 'alert-octagon', color: '#EF4444' },
  { value: 'important', label: 'Important', icon: 'alert-triangle', color: '#F59E0B' },
  { value: 'suggestion', label: 'Suggestion', icon: 'lightbulb', color: '#3B82F6' },
  { value: 'info', label: 'Info', icon: 'info', color: '#6B7280' },
] as const;

export const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending', icon: 'clock', color: '#F59E0B' },
  { value: 'acknowledged', label: 'Acknowledged', icon: 'eye', color: '#3B82F6' },
  { value: 'in_progress', label: 'In Progress', icon: 'loader', color: '#8B5CF6' },
  { value: 'resolved', label: 'Resolved', icon: 'check-circle-2', color: '#10B981' },
  { value: 'dismissed', label: 'Dismissed', icon: 'x-circle', color: '#6B7280' },
] as const;

// Phase 4: Animation presets
export const SPRING_PRESETS = [
  { name: 'Gentle', stiffness: 120, damping: 14, mass: 1, bounce: 0, velocity: 0 },
  { name: 'Bouncy', stiffness: 600, damping: 15, mass: 1, bounce: 0.25, velocity: 0 },
  { name: 'Stiff', stiffness: 300, damping: 20, mass: 1, bounce: 0, velocity: 0 },
  { name: 'Slow', stiffness: 80, damping: 20, mass: 1.5, bounce: 0, velocity: 0 },
  { name: 'Molasses', stiffness: 40, damping: 25, mass: 2, bounce: 0, velocity: 0 },
] as const;

export const EASING_PRESETS = [
  { name: 'Ease', values: [0.25, 0.1, 0.25, 1] },
  { name: 'Ease In', values: [0.42, 0, 1, 1] },
  { name: 'Ease Out', values: [0, 0, 0.58, 1] },
  { name: 'Ease In Out', values: [0.42, 0, 0.58, 1] },
  { name: 'Linear', values: [0, 0, 1, 1] },
  { name: 'Snap', values: [0.6, -0.28, 0.735, 0.045] },
  { name: 'Elastic', values: [0.68, -0.55, 0.265, 1.55] },
] as const;

// Phase 5: Component palette categories
export const COMPONENT_CATEGORIES = [
  { id: 'layout', label: 'Layout', icon: 'layout' },
  { id: 'content', label: 'Content', icon: 'type' },
  { id: 'form', label: 'Form', icon: 'text-cursor-input' },
  { id: 'media', label: 'Media', icon: 'image' },
  { id: 'navigation', label: 'Navigation', icon: 'navigation' },
  { id: 'feedback', label: 'Feedback', icon: 'bell' },
  { id: 'data', label: 'Data', icon: 'table-2' },
] as const;

// Phase 7: Output detail levels
export const OUTPUT_DETAIL_LEVELS = [
  { value: 'compact', label: 'Compact', description: 'Essential changes only' },
  { value: 'standard', label: 'Standard', description: 'Changes + context' },
  { value: 'detailed', label: 'Detailed', description: 'Full element snapshots' },
  { value: 'forensic', label: 'Forensic', description: 'Every computed style' },
] as const;

// Phase 9: Default keyboard shortcuts
export const DEFAULT_SHORTCUTS = [
  { key: 'i', modifiers: ['alt'], action: 'toggle-inspect', label: 'Toggle Inspect', category: 'General' },
  { key: 'a', modifiers: ['alt'], action: 'add-annotation', label: 'Add Annotation', category: 'Annotations' },
  { key: 'd', modifiers: ['alt'], action: 'toggle-drawing', label: 'Toggle Drawing', category: 'Drawing' },
  { key: 'f', modifiers: ['alt'], action: 'freeze-animations', label: 'Freeze Animations', category: 'Animation' },
  { key: 'Escape', modifiers: [], action: 'deselect', label: 'Deselect', category: 'General' },
  { key: 'Delete', modifiers: [], action: 'delete-element', label: 'Delete Element', category: 'Editing' },
  { key: 'z', modifiers: ['ctrl'], action: 'undo', label: 'Undo', category: 'Editing' },
  { key: 'z', modifiers: ['ctrl', 'shift'], action: 'redo', label: 'Redo', category: 'Editing' },
  { key: 's', modifiers: ['alt'], action: 'screenshot', label: 'Screenshot', category: 'Export' },
  { key: 'e', modifiers: ['alt'], action: 'export-css', label: 'Export CSS', category: 'Export' },
  { key: '1', modifiers: ['alt'], action: 'tab-layers', label: 'Layers Tab', category: 'Navigation' },
  { key: '2', modifiers: ['alt'], action: 'tab-design', label: 'Design Tab', category: 'Navigation' },
  { key: '3', modifiers: ['alt'], action: 'tab-changes', label: 'Changes Tab', category: 'Navigation' },
] as const;

// Display options
export const DISPLAY_OPTIONS = [
  { value: 'block', label: 'Block' },
  { value: 'flex', label: 'Flex' },
  { value: 'grid', label: 'Grid' },
  { value: 'inline', label: 'Inline' },
  { value: 'inline-block', label: 'Inline Block' },
  { value: 'inline-flex', label: 'Inline Flex' },
  { value: 'none', label: 'None' },
] as const;

export const POSITION_OPTIONS = [
  { value: 'static', label: 'Static' },
  { value: 'relative', label: 'Relative' },
  { value: 'absolute', label: 'Absolute' },
  { value: 'fixed', label: 'Fixed' },
  { value: 'sticky', label: 'Sticky' },
] as const;

export const FLEX_DIRECTION_OPTIONS = [
  { value: 'row', label: 'Row', icon: '→' },
  { value: 'row-reverse', label: 'Row Reverse', icon: '←' },
  { value: 'column', label: 'Column', icon: '↓' },
  { value: 'column-reverse', label: 'Col Reverse', icon: '↑' },
] as const;

export const JUSTIFY_CONTENT_OPTIONS = [
  { value: 'flex-start', label: 'Start' },
  { value: 'center', label: 'Center' },
  { value: 'flex-end', label: 'End' },
  { value: 'space-between', label: 'Between' },
  { value: 'space-around', label: 'Around' },
  { value: 'space-evenly', label: 'Evenly' },
] as const;

export const ALIGN_ITEMS_OPTIONS = [
  { value: 'flex-start', label: 'Start' },
  { value: 'center', label: 'Center' },
  { value: 'flex-end', label: 'End' },
  { value: 'stretch', label: 'Stretch' },
  { value: 'baseline', label: 'Baseline' },
] as const;

export const FLEX_WRAP_OPTIONS = [
  { value: 'nowrap', label: 'No Wrap' },
  { value: 'wrap', label: 'Wrap' },
  { value: 'wrap-reverse', label: 'Wrap Rev' },
] as const;

export const FONT_WEIGHT_OPTIONS = [
  { value: '100', label: 'Thin' },
  { value: '200', label: 'Extra Light' },
  { value: '300', label: 'Light' },
  { value: '400', label: 'Regular' },
  { value: '500', label: 'Medium' },
  { value: '600', label: 'Semibold' },
  { value: '700', label: 'Bold' },
  { value: '800', label: 'Extra Bold' },
  { value: '900', label: 'Black' },
] as const;

export const TEXT_ALIGN_OPTIONS = [
  { value: 'left', label: 'Left', icon: '≡' },
  { value: 'center', label: 'Center', icon: '≡' },
  { value: 'right', label: 'Right', icon: '≡' },
  { value: 'justify', label: 'Justify', icon: '≡' },
] as const;

export const TEXT_TRANSFORM_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'uppercase', label: 'Upper' },
  { value: 'lowercase', label: 'Lower' },
  { value: 'capitalize', label: 'Capital' },
] as const;

export const BORDER_STYLE_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
  { value: 'double', label: 'Double' },
] as const;

export const OVERFLOW_OPTIONS = [
  { value: 'visible', label: 'Visible' },
  { value: 'hidden', label: 'Hidden' },
  { value: 'scroll', label: 'Scroll' },
  { value: 'auto', label: 'Auto' },
] as const;

export const CURSOR_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'default', label: 'Default' },
  { value: 'pointer', label: 'Pointer' },
  { value: 'text', label: 'Text' },
  { value: 'move', label: 'Move' },
  { value: 'grab', label: 'Grab' },
  { value: 'not-allowed', label: 'Not Allowed' },
  { value: 'crosshair', label: 'Crosshair' },
] as const;

export const VISIBILITY_OPTIONS = [
  { value: 'visible', label: 'Visible' },
  { value: 'hidden', label: 'Hidden' },
  { value: 'collapse', label: 'Collapse' },
] as const;

// ── Motion: animation + transition ───────────────────────────────
export const ANIMATION_NAME_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'dm-fade-in', label: 'Fade In' },
  { value: 'dm-fade-out', label: 'Fade Out' },
  { value: 'dm-slide-up', label: 'Slide Up' },
  { value: 'dm-slide-down', label: 'Slide Down' },
  { value: 'dm-slide-left', label: 'Slide Left' },
  { value: 'dm-slide-right', label: 'Slide Right' },
  { value: 'dm-pulse', label: 'Pulse' },
  { value: 'dm-bounce', label: 'Bounce' },
  { value: 'dm-shake', label: 'Shake' },
  { value: 'dm-spin', label: 'Spin' },
  { value: 'dm-wiggle', label: 'Wiggle' },
  { value: 'dm-ping', label: 'Ping' },
] as const;

export const ANIMATION_DIRECTION_OPTIONS = [
  { value: 'normal', label: 'Normal' },
  { value: 'reverse', label: 'Reverse' },
  { value: 'alternate', label: 'Alternate' },
  { value: 'alternate-reverse', label: 'Alt-Reverse' },
] as const;

export const ANIMATION_FILL_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'forwards', label: 'Forwards' },
  { value: 'backwards', label: 'Backwards' },
  { value: 'both', label: 'Both' },
] as const;

export const ANIMATION_PLAY_STATE_OPTIONS = [
  { value: 'running', label: 'Running' },
  { value: 'paused', label: 'Paused' },
] as const;

export const TIMING_FUNCTION_OPTIONS = [
  { value: 'ease', label: 'Ease' },
  { value: 'ease-in', label: 'Ease In' },
  { value: 'ease-out', label: 'Ease Out' },
  { value: 'ease-in-out', label: 'Ease In-Out' },
  { value: 'linear', label: 'Linear' },
  { value: 'step-start', label: 'Step Start' },
  { value: 'step-end', label: 'Step End' },
] as const;

export const TRANSITION_PROPERTY_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'none', label: 'None' },
  { value: 'opacity', label: 'opacity' },
  { value: 'transform', label: 'transform' },
  { value: 'background-color', label: 'background-color' },
  { value: 'color', label: 'color' },
  { value: 'border-color', label: 'border-color' },
  { value: 'box-shadow', label: 'box-shadow' },
  { value: 'width', label: 'width' },
  { value: 'height', label: 'height' },
  { value: 'top', label: 'top' },
  { value: 'left', label: 'left' },
  { value: 'right', label: 'right' },
  { value: 'bottom', label: 'bottom' },
  { value: 'margin', label: 'margin' },
  { value: 'padding', label: 'padding' },
  { value: 'filter', label: 'filter' },
] as const;

export const BLEND_MODE_OPTIONS = [
  { value: 'normal', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'darken', label: 'Darken' },
  { value: 'lighten', label: 'Lighten' },
  { value: 'color-dodge', label: 'Color Dodge' },
  { value: 'color-burn', label: 'Color Burn' },
  { value: 'hard-light', label: 'Hard Light' },
  { value: 'soft-light', label: 'Soft Light' },
  { value: 'difference', label: 'Difference' },
  { value: 'exclusion', label: 'Exclusion' },
] as const;
