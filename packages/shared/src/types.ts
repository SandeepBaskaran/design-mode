// ============================================================
// Design Mode — Shared Type Definitions
// ============================================================

// --- Element Style Interface (all visually editable properties) ---

export interface ElementStyle {
  // Position
  position: 'static' | 'relative' | 'absolute' | 'fixed' | 'sticky';
  top: string;
  right: string;
  bottom: string;
  left: string;
  zIndex: string;
  transform: string;

  // Layout
  display: 'block' | 'flex' | 'grid' | 'inline' | 'inline-block' | 'inline-flex' | 'inline-grid' | 'none';
  flexDirection: 'row' | 'row-reverse' | 'column' | 'column-reverse';
  flexWrap: 'nowrap' | 'wrap' | 'wrap-reverse';
  justifyContent: string;
  alignItems: string;
  alignSelf: string;
  flexGrow: string;
  flexShrink: string;
  flexBasis: string;
  gap: string;
  rowGap: string;
  columnGap: string;

  // Grid
  gridTemplateColumns: string;
  gridTemplateRows: string;
  gridColumn: string;
  gridRow: string;

  // Box Model
  width: string;
  height: string;
  minWidth: string;
  maxWidth: string;
  minHeight: string;
  maxHeight: string;
  marginTop: string;
  marginRight: string;
  marginBottom: string;
  marginLeft: string;
  paddingTop: string;
  paddingRight: string;
  paddingBottom: string;
  paddingLeft: string;
  boxSizing: 'content-box' | 'border-box';
  overflow: string;
  overflowX: string;
  overflowY: string;

  // Typography
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  fontStyle: string;
  lineHeight: string;
  letterSpacing: string;
  wordSpacing: string;
  textAlign: 'left' | 'center' | 'right' | 'justify';
  textDecoration: string;
  textTransform: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  whiteSpace: string;
  color: string;

  // Appearance
  backgroundColor: string;
  backgroundImage: string;
  opacity: string;
  visibility: 'visible' | 'hidden' | 'collapse';
  cursor: string;
  mixBlendMode: string;

  // Borders
  borderTopWidth: string;
  borderRightWidth: string;
  borderBottomWidth: string;
  borderLeftWidth: string;
  borderTopStyle: string;
  borderRightStyle: string;
  borderBottomStyle: string;
  borderLeftStyle: string;
  borderTopColor: string;
  borderRightColor: string;
  borderBottomColor: string;
  borderLeftColor: string;
  borderTopLeftRadius: string;
  borderTopRightRadius: string;
  borderBottomRightRadius: string;
  borderBottomLeftRadius: string;

  // Effects
  boxShadow: string;
  textShadow: string;
  outline: string;
  outlineOffset: string;
  filter: string;
  backdropFilter: string;
  transition: string;

  // Animation & Motion (Phase 4)
  animationName: string;
  animationDuration: string;
  animationTimingFunction: string;
  animationDelay: string;
  animationIterationCount: string;
  animationDirection: string;
  animationFillMode: string;
  animationPlayState: string;
  transitionProperty: string;
  transitionDuration: string;
  transitionTimingFunction: string;
  transitionDelay: string;
}

// Partial style for updates
export type PartialElementStyle = Partial<ElementStyle>;

// --- DOM Tree Node ---

export interface DomTreeNode {
  id: string;
  tagName: string;
  displayName: string;
  depth: number;
  childCount: number;
  isVisible: boolean;
  hasText: boolean;
  parentId: string | null;
}

// --- Selected Element ---

export interface ElementRect {
  top: number;
  left: number;
  width: number;
  height: number;
  bottom: number;
  right: number;
}

export interface ElementInfo {
  id: string;
  tagName: string;
  className: string;
  elementId: string;
  breadcrumbs: string[];
  computedStyles: PartialElementStyle;
  rect: ElementRect;
  textContent: string | null;
  innerHTML: string;
  attributes: Record<string, string>;
  selector: string;
  // Phase 2: Spatial context
  spatialContext?: SpatialContext;
  // Phase 2: Accessibility info
  accessibility?: AccessibilityInfo;
  // Phase 3: React/framework source
  sourceLocation?: SourceLocation;
  reactComponents?: string[];
  // Phase 2: Smart name
  smartName?: string;
  // Effective inter-child spacing for flex/grid containers, in px, measured
  // from child rects. Per-axis null when not measurable (e.g. < 2 children).
  childGap?: { col: number | null; row: number | null };
}

// --- Style Change ---

export interface StyleChange {
  id: string;
  elementId: string;
  selector: string;
  property: keyof ElementStyle;
  oldValue: string;
  newValue: string;
  timestamp: number;
}

// --- Text Change ---

export interface TextChange {
  id: string;
  elementId: string;
  selector: string;
  oldText: string;
  newText: string;
  timestamp: number;
}

// --- Comment ---

export interface Comment {
  id: string;
  elementId: string;
  selector: string;
  text: string;
  author: string;
  timestamp: number;
  updatedAt: number;
  position: { x: number; y: number };
  resolved: boolean;
  pageUrl: string;
}

// ============================================================
// Phase 1: Annotation & Feedback System
// ============================================================

export type AnnotationIntent = 'fix' | 'change' | 'question' | 'approve' | 'note';
export type AnnotationSeverity = 'blocking' | 'important' | 'suggestion' | 'info';
export type AnnotationStatus = 'pending' | 'acknowledged' | 'in_progress' | 'resolved' | 'dismissed';

export interface ThreadMessage {
  id: string;
  author: string;
  authorType: 'human' | 'agent';
  text: string;
  timestamp: number;
}

export interface DrawingStroke {
  id: string;
  points: Array<{ x: number; y: number; pressure?: number }>;
  color: string;
  width: number;
  opacity: number;
}

export interface Annotation {
  id: string;
  // Element targeting
  elementId: string;
  elementPath: string; // CSS selector path
  boundingBox: ElementRect;
  // Content
  comment: string;
  intent: AnnotationIntent;
  severity: AnnotationSeverity;
  status: AnnotationStatus;
  // Context
  selectedText?: string; // Text selection annotation
  nearbyText?: string;
  cssClasses: string[];
  computedStyles?: PartialElementStyle;
  fullPath: string; // Full DOM path
  nearbyElements?: Array<{ selector: string; relation: string; gap?: number }>;
  accessibility?: AccessibilityInfo;
  // Multi-select
  isMultiSelect: boolean;
  multiSelectIds?: string[];
  // Threading
  thread: ThreadMessage[];
  // Drawing
  drawings?: DrawingStroke[];
  drawingDataUrl?: string;
  // Framework
  reactComponents?: string[];
  sourceFile?: string;
  // Meta
  pageUrl: string;
  pageTitle: string;
  timestamp: number;
  updatedAt: number;
  author: string;
  // Session
  sessionId: string;
}

// ============================================================
// Phase 2: Spatial & Context Intelligence
// ============================================================

export interface SpatialRelation {
  element: string; // selector
  direction: 'above' | 'below' | 'left' | 'right' | 'overlapping';
  gap: number; // px
  alignment?: 'start' | 'center' | 'end';
}

export interface SpatialContext {
  position: { x: number; y: number; width: number; height: number };
  nearby: SpatialRelation[];
  container?: { selector: string; display: string; role?: string };
  pageRegion: 'header' | 'nav' | 'main' | 'sidebar' | 'footer' | 'unknown';
  layoutPattern?: 'grid' | 'flex-row' | 'flex-col' | 'stack' | 'float' | 'absolute' | 'unknown';
}

export interface AccessibilityInfo {
  role: string;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  ariaLabelledBy?: string;
  tabIndex?: number;
  altText?: string;
  isInteractive: boolean;
  focusable: boolean;
  semanticTag?: string;
  issues?: string[];
}

// ============================================================
// Phase 3: React/Framework Source Detection
// ============================================================

export interface SourceLocation {
  file: string;
  line?: number;
  column?: number;
  component?: string;
  framework: 'react' | 'vue' | 'angular' | 'svelte' | 'unknown';
  bundlerUrl?: string;
  cleanPath?: string;
}

export interface ComponentHierarchy {
  name: string;
  source?: SourceLocation;
  props?: Record<string, string>;
  children?: ComponentHierarchy[];
}

// ============================================================
// Phase 4: Animation & Motion Controls
// ============================================================

export interface SpringConfig {
  stiffness: number;
  damping: number;
  mass: number;
  bounce: number;
  velocity: number;
}

export interface EasingConfig {
  type: 'cubic-bezier' | 'steps' | 'spring';
  values: number[]; // [x1, y1, x2, y2] for cubic-bezier
  preset?: string;
}

export interface AnimationState {
  frozen: boolean;
  animations: Array<{
    element: string;
    name: string;
    state: 'running' | 'paused';
    duration: string;
    timing: string;
  }>;
}

// ============================================================
// Phase 5: Design/Layout Mode
// ============================================================

export interface ComponentPalette {
  id: string;
  name: string;
  category: 'layout' | 'content' | 'form' | 'media' | 'navigation' | 'feedback' | 'data';
  html: string;
  icon: string;
  description: string;
}

export interface SnapGuide {
  type: 'horizontal' | 'vertical';
  position: number;
  label?: string;
}

export interface ResizeHandle {
  direction: 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';
  cursor: string;
}

// ============================================================
// Phase 6: Rearrange Mode
// ============================================================

export interface PageSection {
  id: string;
  selector: string;
  label: string;
  rect: ElementRect;
  children: string[];
  layoutPattern: string;
}

export interface RearrangeNote {
  id: string;
  sectionId: string;
  text: string;
  newOrder: number[];
}

// ============================================================
// Phase 7: Enhanced Output & Export
// ============================================================

export type OutputDetailLevel = 'compact' | 'standard' | 'detailed' | 'forensic';

export interface StructuredOutput {
  level: OutputDetailLevel;
  annotations: Annotation[];
  changes: StyleChange[];
  domChanges: any[];
  pageContext: {
    url: string;
    title: string;
    viewport: { width: number; height: number };
    timestamp: number;
  };
  elementSnapshots: Array<{
    selector: string;
    styles: PartialElementStyle;
    html: string;
    screenshot?: string;
  }>;
}

// ============================================================
// Phase 8: Enhanced MCP Server
// ============================================================

export interface MCPSession {
  id: string;
  pageUrl: string;
  pageTitle: string;
  startedAt: number;
  lastActivity: number;
  annotations: Annotation[];
  changes: StyleChange[];
  textChanges: TextChange[];
  domChanges: any[];
  animationState?: AnimationState;
}

// ============================================================
// Phase 9: UX Polish
// ============================================================

export interface KeyboardShortcut {
  key: string;
  modifiers: Array<'ctrl' | 'alt' | 'shift' | 'meta'>;
  action: string;
  label: string;
  category: string;
}

export interface NamedPreset {
  id: string;
  name: string;
  category: string;
  folder?: string;
  values: Record<string, string>;
  isBuiltIn: boolean;
  createdAt: number;
}

// --- Change Session ---

export interface ChangeSession {
  id: string;
  pageUrl: string;
  pageTitle: string;
  startedAt: number;
  styleChanges: StyleChange[];
  textChanges: TextChange[];
  comments: Comment[];
  annotations: Annotation[];
}

// --- MCP Tool Responses ---

export interface ChangeReport {
  pageUrl: string;
  pageTitle: string;
  changes: Array<{
    selector: string;
    elementTag: string;
    elementClasses: string;
    property: string;
    oldValue: string;
    newValue: string;
    cssRule: string;
  }>;
  cssBlock: string;
}

export interface CommentReport {
  pageUrl: string;
  comments: Array<{
    selector: string;
    elementTag: string;
    text: string;
    author: string;
    timestamp: string;
    resolved: boolean;
  }>;
}

export interface AnnotationReport {
  pageUrl: string;
  annotations: Array<{
    id: string;
    selector: string;
    comment: string;
    intent: AnnotationIntent;
    severity: AnnotationSeverity;
    status: AnnotationStatus;
    selectedText?: string;
    thread: ThreadMessage[];
    reactComponents?: string[];
    sourceFile?: string;
    spatialContext?: SpatialContext;
    accessibility?: AccessibilityInfo;
  }>;
}

export interface ElementReport {
  selector: string;
  tagName: string;
  classes: string[];
  id: string;
  attributes: Record<string, string>;
  computedStyles: PartialElementStyle;
  boundingRect: ElementRect;
  innerHTML: string;
  textContent: string | null;
  parentSelector: string;
  childSelectors: string[];
  spatialContext?: SpatialContext;
  accessibility?: AccessibilityInfo;
  sourceLocation?: SourceLocation;
  smartName?: string;
}
