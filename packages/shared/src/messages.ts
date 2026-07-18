// ============================================================
// Design Mode — Message Types (Extension <-> Content <-> Server)
// ============================================================

import type {
  ElementInfo, DomTreeNode, PartialElementStyle, Comment,
  StyleChange, TextChange, ChangeSession, ChangeStatus,
  AnimationState, ComponentPalette,
  OutputDetailLevel, StructuredOutput,
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
  | { type: 'SNAP_GUIDES'; payload: { guides: Array<{ type: string; position: number }> } };

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
  // Data requests from server (via background)
  | { type: 'REQUEST_ELEMENT_INFO'; payload: { selector: string } }
  | { type: 'ELEMENT_INFO_RESPONSE'; payload: ElementInfo | null }
  | { type: 'REQUEST_SCREENSHOT'; payload: { selector?: string } }
  | { type: 'SCREENSHOT_RESPONSE'; payload: { dataUrl: string } };

// --- Extension <-> WebSocket Server Messages ---

export type ServerMessage =
  | { type: 'HELLO'; payload: { version: string; agentConnected?: boolean } }
  | { type: 'SESSION_UPDATE'; payload: ChangeSession }
  | { type: 'STYLE_CHANGED'; payload: StyleChange }
  | { type: 'TEXT_CHANGED'; payload: TextChange }
  | { type: 'DOM_CHANGED'; payload: { id: string; elementId: string; selector: string; action: 'delete' | 'duplicate' | 'move' | 'insert'; tagName: string; timestamp: number; status?: ChangeStatus } }
  | { type: 'COMMENT_ADDED'; payload: Comment }
  | { type: 'COMMENT_UPDATED'; payload: Comment }
  | { type: 'COMMENT_DELETED'; payload: { id: string } }
  // "Send to Agent" marker — extension → server
  | { type: 'HANDOFF'; payload: { requestedAt: number; pageUrl: string; pageTitle: string } }
  | { type: 'APPLY_CHANGES'; requestId?: string; payload: { changes: Array<{ elementId: string; styles: PartialElementStyle }> } }
  | { type: 'SET_CHANGE_STATUS'; requestId?: string; payload: { status: ChangeStatus; ids?: string[] } }
  | { type: 'CLEAR_CHANGES'; requestId?: string; payload?: Record<string, never> }
  | { type: 'MARK_COMMENT_RESOLVED'; requestId?: string; payload: { commentId: string; resolved: boolean } };
