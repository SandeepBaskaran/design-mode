// ============================================================
// Design Mode — Message Types (Extension <-> Content <-> Server)
// ============================================================

import type {
  ElementInfo, DomTreeNode, PartialElementStyle, Comment,
  StyleChange, TextChange, ChangeSession, Annotation, ChangeStatus,
  AnnotationIntent, AnnotationSeverity, AnnotationStatus,
  ThreadMessage, DrawingStroke, SpringConfig, EasingConfig,
  AnimationState, ComponentPalette, PageSection, RearrangeNote,
  OutputDetailLevel, StructuredOutput, MCPSession,
  KeyboardShortcut, NamedPreset, SpatialContext, AccessibilityInfo,
  SourceLocation, ComponentHierarchy,
} from './types';

// --- Content Script <-> Panel Messages ---

export type PanelMessage =
  // Inspector
  | { type: 'ELEMENT_HOVERED'; payload: { id: string; tagName: string; rect: ElementInfo['rect'] } }
  | { type: 'ELEMENT_SELECTED'; payload: ElementInfo }
  | { type: 'ELEMENT_DESELECTED' }
  | { type: 'DOM_TREE_UPDATED'; payload: DomTreeNode[] }
  | { type: 'PAGE_INFO'; payload: { title: string; url: string } }
  // Style updates from panel
  | { type: 'UPDATE_STYLE'; payload: { elementId: string; property: string; value: string } }
  | { type: 'UPDATE_TEXT'; payload: { elementId: string; text: string } }
  // Navigation
  | { type: 'HIGHLIGHT_ELEMENT'; payload: { id: string } }
  | { type: 'SCROLL_TO_ELEMENT'; payload: { id: string } }
  // Phase 1: Annotations
  | { type: 'ANNOTATION_CREATED'; payload: Annotation }
  | { type: 'ANNOTATION_UPDATED'; payload: Annotation }
  | { type: 'ANNOTATION_DELETED'; payload: { id: string } }
  | { type: 'ANNOTATIONS_LIST'; payload: Annotation[] }
  | { type: 'TEXT_SELECTED'; payload: { text: string; elementId: string; rect: ElementInfo['rect'] } }
  | { type: 'DRAWING_UPDATED'; payload: { annotationId: string; strokes: DrawingStroke[]; dataUrl: string } }
  // Phase 2: Spatial
  | { type: 'SPATIAL_CONTEXT'; payload: { elementId: string; context: SpatialContext } }
  | { type: 'ACCESSIBILITY_INFO'; payload: { elementId: string; info: AccessibilityInfo } }
  // Phase 3: Source
  | { type: 'SOURCE_LOCATION'; payload: { elementId: string; source: SourceLocation; hierarchy?: ComponentHierarchy[] } }
  // Phase 4: Animation
  | { type: 'ANIMATION_STATE'; payload: AnimationState }
  | { type: 'ANIMATION_FROZEN'; payload: { frozen: boolean } }
  // Phase 5: Design mode
  | { type: 'COMPONENT_PLACED'; payload: { html: string; parentId: string } }
  | { type: 'SNAP_GUIDES'; payload: { guides: Array<{ type: string; position: number }> } }
  // Phase 6: Rearrange
  | { type: 'SECTIONS_DETECTED'; payload: PageSection[] }
  | { type: 'REARRANGE_APPLIED'; payload: { sectionId: string; newOrder: number[] } };

// --- Extension <-> Background Service Worker Messages ---

export type BackgroundMessage =
  | { type: 'TOGGLE_DESIGN_MODE'; tabId?: number }
  | { type: 'DESIGN_MODE_TOGGLED'; enabled: boolean }
  | { type: 'GET_STATE' }
  | { type: 'STATE_UPDATE'; payload: { enabled: boolean; connected: boolean } }
  // Server connection
  | { type: 'CONNECT_SERVER'; payload: { port: number } }
  | { type: 'DISCONNECT_SERVER' }
  | { type: 'SERVER_STATUS'; payload: { connected: boolean; port?: number } }
  // Data sync to server
  | { type: 'SYNC_CHANGE'; payload: StyleChange | TextChange }
  | { type: 'SYNC_COMMENT'; payload: Comment }
  | { type: 'SYNC_SESSION'; payload: ChangeSession }
  | { type: 'SYNC_ANNOTATION'; payload: Annotation }
  // Data requests from server (via background)
  | { type: 'REQUEST_ELEMENT_INFO'; payload: { selector: string } }
  | { type: 'ELEMENT_INFO_RESPONSE'; payload: ElementInfo | null }
  | { type: 'REQUEST_SCREENSHOT'; payload: { selector?: string } }
  | { type: 'SCREENSHOT_RESPONSE'; payload: { dataUrl: string } };

// --- Extension <-> WebSocket Server Messages ---

export type ServerMessage =
  | { type: 'HELLO'; payload: { version: string } }
  | { type: 'SESSION_UPDATE'; payload: ChangeSession }
  | { type: 'STYLE_CHANGED'; payload: StyleChange }
  | { type: 'TEXT_CHANGED'; payload: TextChange }
  | { type: 'COMMENT_ADDED'; payload: Comment }
  | { type: 'COMMENT_UPDATED'; payload: Comment }
  | { type: 'COMMENT_DELETED'; payload: { id: string } }
  | { type: 'REQUEST_CHANGES'; payload?: { pageUrl?: string } }
  | { type: 'REQUEST_COMMENTS'; payload?: { pageUrl?: string } }
  | { type: 'REQUEST_ELEMENT'; payload: { selector: string } }
  | { type: 'APPLY_CHANGES'; payload: { elementId: string; styles: PartialElementStyle } }
  | { type: 'SET_CHANGE_STATUS'; payload: { status: ChangeStatus; ids?: string[] } }
  | { type: 'MARK_COMMENT_RESOLVED'; requestId?: string; payload: { commentId: string; resolved: boolean } }
  | { type: 'CHANGES_RESPONSE'; payload: ChangeSession }
  | { type: 'COMMENTS_RESPONSE'; payload: Comment[] }
  | { type: 'ELEMENT_RESPONSE'; payload: ElementInfo | null }
  // Phase 1: Annotations via server
  | { type: 'ANNOTATION_CREATED'; payload: Annotation }
  | { type: 'ANNOTATION_UPDATED'; payload: Annotation }
  | { type: 'ANNOTATION_DELETED'; payload: { id: string } }
  | { type: 'REQUEST_ANNOTATIONS'; payload?: { pageUrl?: string; status?: AnnotationStatus } }
  | { type: 'ANNOTATIONS_RESPONSE'; payload: Annotation[] }
  // Phase 4: Animation
  | { type: 'FREEZE_ANIMATIONS'; payload: { freeze: boolean } }
  | { type: 'UPDATE_SPRING'; payload: { elementId: string; config: SpringConfig } }
  | { type: 'UPDATE_EASING'; payload: { elementId: string; config: EasingConfig } }
  | { type: 'ANIMATION_STATE_RESPONSE'; payload: AnimationState }
  // Phase 8: Enhanced MCP
  | { type: 'SESSION_LIST'; payload: MCPSession[] }
  | { type: 'WATCH_ANNOTATIONS'; payload: { sessionId: string; since?: number } }
  | { type: 'ANNOTATIONS_BATCH'; payload: Annotation[] };
