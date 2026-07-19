// ============================================================
// Design Mode — Side Panel v0.8.0
// Figma-quality layers panel + property inspector
// Phase 1: morphdom + event delegation
// Phase 2: Tree layers with collapse/expand, icons, search
// Phase 3: Hover-edit, persistent sections, CSS variables
// Phase 4: Grouped changes, keyboard nav, transitions
// ============================================================

import morphdom from 'morphdom';
import { icon, icons } from '../content/icons';
import { escapeAttr, rgbToHex } from '../content/helpers';
import { AGENT_COMMAND_MARKDOWN, AGENT_TOOLS } from './agent-workflow';
import {
  CATEGORY_LABEL, RATING_META, evaluate, parseRgba, parseOklab, parseOklch,
  isTransparent, resolveCategory, thresholdFor,
  type Category as A11yCategory, type Level as A11yLevel,
  type ResolvedCategory as A11yResolvedCategory,
  type Rating as A11yRating, type Rgb, type Rgba,
} from './contrast';

/* ── Strict HTML sanitizer for the rich-text editor seed ──
   The contenteditable in the Typography section is seeded with the
   selected element's innerHTML so bold / italic / links round-trip.
   Inspected pages are untrusted: raw HTML can carry `<img onerror=…>`,
   `<svg onload=…>`, `<iframe srcdoc=…>` payloads that would execute
   inside the side-panel context — handing a malicious site chrome.tabs
   / chrome.scripting / chrome.storage. This sanitizer parses the input
   in a sandboxed DOMParser (which does NOT fire scripts or events on
   parse) and walks the tree keeping only structural formatting tags
   and explicitly allow-listed attributes. Anything outside the
   allow-list is replaced by its text content, so the visible copy
   survives without the markup. */
const RICH_TEXT_ALLOWED_TAGS = new Set([
  'B','I','U','STRONG','EM','A','BR','P','SPAN','UL','OL','LI','CODE','DIV','H1','H2','H3','H4','H5','H6','BLOCKQUOTE','PRE','SMALL','MARK','SUB','SUP',
]);
const RICH_TEXT_ALLOWED_ATTRS_PER_TAG: Record<string, Set<string>> = {
  A: new Set(['href', 'target', 'rel']),
};
/* ── Safe CSS-colour-value clamp ──
   Page-derived colour values (computed styles read off the inspected
   element, or layer.color stored from the picker) are interpolated
   directly into inline `style="background:<v>;..."` attributes.
   escapeAttr only blocks `& " < >` — a value like
   `red; background-image: url(https://attacker/log)` would survive
   and trigger an outbound request from the side-panel context.
   This clamp returns the value when it matches a known-safe colour
   syntax, or empty string otherwise. */
function safeCssColor(v: string): string {
  if (!v) return '';
  const t = v.trim();
  if (!t || t.length > 200) return '';
  // Hex #rgb / #rgba / #rrggbb / #rrggbbaa
  if (/^#[0-9a-f]{3,8}$/i.test(t)) return t;
  // CSS named colours / global keywords
  if (/^(transparent|currentcolor|inherit|initial|unset|revert|revert-layer|none)$/i.test(t)) return t;
  if (/^[a-z]+$/i.test(t)) return t;
  // Functional colour syntaxes — strict whole-string match, no
  // semicolons allowed inside the args (CSS doesn't need ; in any
  // colour function, so this is a tight exfil guard).
  if (/^(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color|color-mix)\([^;{}]+\)$/i.test(t)) return t;
  // var(--token, fallback) — token name + optional fallback (no ;).
  if (/^var\(--[a-z0-9_-]+(\s*,\s*[^;{}]+)?\)$/i.test(t)) return t;
  return '';
}

function sanitizeRichTextHtml(raw: string): string {
  if (!raw) return '';
  const doc = new DOMParser().parseFromString('<body><div id="r">' + raw + '</div></body>', 'text/html');
  const root = doc.getElementById('r');
  if (!root) return '';
  const walk = (node: Element) => {
    for (let i = node.children.length - 1; i >= 0; i--) {
      const child = node.children[i] as HTMLElement;
      if (!RICH_TEXT_ALLOWED_TAGS.has(child.tagName)) {
        const text = doc.createTextNode(child.textContent || '');
        node.replaceChild(text, child);
        continue;
      }
      const allowed = RICH_TEXT_ALLOWED_ATTRS_PER_TAG[child.tagName] || new Set<string>();
      for (const attr of Array.from(child.attributes)) {
        const name = attr.name.toLowerCase();
        if (!allowed.has(name)) {
          child.removeAttribute(attr.name);
          continue;
        }
        if (name === 'href') {
          // Only http(s) / fragments / relative paths survive — never
          // javascript:, data:, vbscript:, blob:, filesystem:.
          const v = attr.value.trim();
          const safe = /^https?:\/\//i.test(v) || v.startsWith('#') || v.startsWith('/') || v.startsWith('.');
          if (!safe) child.removeAttribute(attr.name);
        }
      }
      walk(child);
    }
  };
  walk(root);
  return root.innerHTML;
}
import {
  ANIMATION_NAME_OPTIONS,
  ANIMATION_DIRECTION_OPTIONS,
  ANIMATION_FILL_OPTIONS,
  ANIMATION_PLAY_STATE_OPTIONS,
  TIMING_FUNCTION_OPTIONS,
  TRANSITION_PROPERTY_OPTIONS,
  DEFAULT_SHORTCUTS,
} from '@shared/constants';

/* ── Types ── */
interface ElementInfo {
  id: string; tagName: string; className: string;
  computedStyles: Record<string, string>;
  // camelCase prop → the token it's authored from (var name + the scope
  // this element resolves it through).
  styleTokens?: Record<string, { cssVar: string; scope: string }>;
  boundingRect: { x: number; y: number; width: number; height: number };
  breadcrumbs: string[]; element?: any; imgSrc?: string;
  textContent?: string; hasChildElements?: boolean;
  sourceLocation?: {
    file: string; line?: number; column?: number;
    component?: string; framework: string; cleanPath?: string;
  };
  componentHierarchy?: string[];
  // Parent context — used by Position section to dispatch alignment buttons
  // (flex parent → align/justify-self; grid parent → same; block parent →
  // margin auto). Captured by inspector.buildElementInfo and present on
  // both ELEMENT_SELECTED and ELEMENT_HOVERED_INFO payloads.
  parentDisplay?: string;
  parentFlexDirection?: string;
  parentJustifyContent?: string;
  parentAlignItems?: string;
  parentGap?: string;
}
type ChangeStatus = 'todo' | 'in_progress' | 'resolved';
interface StyleChange {
  id?: string; elementId: string; selector: string; label?: string;
  property: string; oldValue: string; newValue: string; timestamp?: number;
  // State-variant suffix for Motion interactions (':hover', '@starting', …).
  state?: string;
  // Optional grouping envelope. Multiple StyleChanges sharing a `groupId`
  // collapse into a single row in the Changes tab. `groupKind` shapes the
  // row label (`PRESET`, `APPLIED to N`, `HIDE`). When `groupKind` is set
  // without a `groupId`, it's treated as a single-row label override.
  groupId?: string;
  groupKind?: 'preset' | 'multi-select' | 'visibility';
  groupLabel?: string;
  status?: ChangeStatus;
}
interface TextChange { id: string; elementId: string; selector: string; label?: string; oldText: string; newText: string; timestamp?: number; status?: ChangeStatus; }
interface DomChange {
  id?: string; action: string; tagName: string; selector: string; label?: string;
  elementId?: string; timestamp?: number;
  destination?: { parentSelector: string; index: number };
  origin?: { parentSelector: string; index: number };
  status?: ChangeStatus;
}
interface CommentEntry { id: string; elementId: string; text: string; selector: string; timestamp: number; updatedAt?: number; resolved?: boolean; pinOffset?: { x: number; y: number }; region?: { x: number; y: number; w: number; h: number } }
interface DomNode {
  id: string; tagName: string; displayName: string;
  depth: number; childCount: number; isVisible: boolean; hasText: boolean;
  parentId: string | null;
  zIndex?: string;
  backgroundColor?: string;
  componentName?: string;
  containerKind?: 'shadow' | 'iframe' | 'pseudo';
}

/* ── State ── */
type Tab = 'layers' | 'design' | 'changes';
type McpState = 'offline' | 'running' | 'connected';
type Theme = 'dark' | 'light' | 'system';
type ColorFormat = 'hex' | 'rgba' | 'hsl';
let tab: Tab = 'design';
let settingsOpen = false;
let helpOpen = false;
let mcpOpen = false;
let sendAgentHelpOpen = false;

// "Select matching layers" checkbox — checked hands all matching
// elements to multi-select so edits fan out; unchecked returns to
// single selection. Resets whenever the selected element changes.
let matchingLayersChecked = false;
let shortcutsOpen = false;
let contributeOpen = false;
let fileAccessBlocked = false;
let enabled = false;
let inspecting = true;
// While a comment composer is open (add / edit / region) we suspend inspect
// so page clicks don't hijack what the user is annotating, then restore it.
let inspectSuspendedForComment = false;
let inspectWasOnBeforeComment = false;
let mcpState: McpState = 'offline';
let pinnedDomain = '';
let info: ElementInfo | null = null;
let hoverInfo: ElementInfo | null = null;
let styleChanges: StyleChange[] = [];
let textChanges: TextChange[] = [];
let domChanges: DomChange[] = [];
let comments: CommentEntry[] = [];
// Design-system :root token edits, synced from the content change payload
// (same source the Copy Prompt reads) so they appear in the Changes tab.
let tokenChanges: Array<{ cssVar: string; scopeSelector: string; original: string; current: string; system?: string }> = [];
let batchAppliedChanges: Set<string> = new Set();
let mediaInfo: { kind: string; src: string; alt?: string; naturalWidth?: number; naturalHeight?: number; filename?: string; markup?: string; isObjectUrl?: boolean; poster?: string; bytes?: number } | null = null;
let lastMediaElementId: string | null = null;
let activeColorPickerProp: string | null = null;
// Tokens-only dropdown (a focus-driven shortcut on hex inputs) — distinct
// from the full HSV+tokens panel that opens on swatch click.
let tokensDropdownProp: string | null = null;
let colorPickerSearch = '';
// Inline contrast checker (WCAG ratio + AA/AAA badge + rating label)
// shown above the SV gradient. Category / Level live in chrome.storage.local
// so the user's preferred threshold sticks across selections + sessions.
let a11yCategory: A11yCategory = 'auto';
let a11yLevel: A11yLevel = 'AA';
let contrastSettingsOpen = false;
// Cached result of the ancestor-walk for the selected element's effective
// background — populated on selection when info.computedStyles.backgroundColor
// is transparent. Keyed by element id; cleared when selection changes.
const effectiveBgCache = new Map<string, string>();
let domTree: DomNode[] = [];
let hoveredLayerId: string | null = null;
let undoCount = 0;
let redoCount = 0;
let theme: Theme = 'system';
let resolvedTheme: 'dark' | 'light' = 'dark';
let colorFormat: ColorFormat = 'hex';
type CaptureMode = 'clipboard' | 'download' | 'both';
let captureMode: CaptureMode = 'clipboard';
let multiSelectActive = false;
let multiSelectIds: string[] = [];
// The token whose consumers are currently highlighted via the "×N uses"
// chip. Clicking the same chip again clears the highlight (toggle).
let tokenUsesActiveVar: string | null = null;
// Anchor for Shift-click range selection — the last layer the user
// single-clicked (without a modifier). Mirrors how Finder / Figma anchor
// shift-extends; Cmd-clicks leave the anchor alone.
let multiSelectAnchor: string | null = null;
let animationsFrozen = false;
let captureToast: { kind: 'success' | 'error'; text: string } | null = null;
let captureToastTimer: ReturnType<typeof setTimeout> | null = null;
let commentMode = false;
let commentText = '';
// Region-comment flow: `awaitingRegionDraw` is true between clicking the
// region button and finishing the drag on the page; `regionCommentPending`
// is true while the composer is open for the just-drawn region.
let awaitingRegionDraw = false;
let regionCommentPending = false;
let editingCommentId: string | null = null;
let viewingCommentId: string | null = null;
// Inline-confirm overlay for deleting a comment (mirrors Clear All).
let deletingCommentId: string | null = null;
let commentDirty = false;

// Phase 2: Tree state
const collapsedNodes = new Set<string>();
let layerSearch = '';

// Phase 3: Persistent section collapse state
const sectionStates: Record<string, boolean | undefined> = {};

// Layers tab UI state. The Layers tab intentionally mirrors the live DOM
// — we don't carry parallel naming/lock state. Filtering is the only
// user-side transform.
type LayersFilter = 'all' | 'visible' | 'hidden' | 'modified';
let layersFilter: LayersFilter = 'all';

// Phase 4: Changes tab UI state.
const changesGroupCollapsed = new Set<string>();
// Filter narrows the visible items to one change kind.
type ChangesFilter = 'all' | 'style' | 'text' | 'dom' | 'comment' | 'token';
let changesFilter: ChangesFilter = 'all';
// Free-text search across selector / property / value / comment text.
let changesSearch = '';
// Sort order for the change list. Default oldest-first matches the
// historical behaviour; the other two are user-pickable from the action row.
type ChangesSort = 'oldest' | 'newest' | 'element';
let changesSort: ChangesSort = 'oldest';
// Per-row checkbox selection for bulk-revert. Keys are the same change-ids
// the per-row trash button uses (`style-N`, text-id, `dom-N`, comment-id).
const changesSelected = new Set<string>();
// Sub-filter for comments (Open / Resolved / All). Only narrows comment
// items; other change kinds always pass.
type CommentsResolvedFilter = 'all' | 'open' | 'resolved';
let commentsResolvedFilter: CommentsResolvedFilter = 'all';
// Sub-filter for the agent-driven status on style/text/DOM changes
// (to-do / in-progress / resolved). Comments use their own resolved
// filter above; this narrows the non-comment kinds.
type ChangesStatusFilter = 'all' | 'todo' | 'in_progress' | 'resolved';
let changesStatusFilter: ChangesStatusFilter = 'all';
// Inline confirmation overlay state for the destructive Clear All button.
let clearAllConfirming = false;
// Anchored popover for the sort icon. Three options live inside it; clicking
// one writes to changesSort and closes the popover.
let changesSortMenuOpen = false;

// Phase 5: Design tokens — same unified DesignToken shape as the Tokens
// panel (declared below); populated from the shared content-side engine.
let designTokens: DesignToken[] = [];
let pageFonts: Array<{ value: string; label: string }> = [];

// Drag state (for layer reorder)
let dragLayerId: string | null = null;

// Design-system / Tokens panel state. Replaces the previous Presets
// surface — the swatch-book header button now lists the page's :root
// CSS variables grouped by purpose (Colour / Typography / Spacing /
// Radius / Shadow / Other), plus the implicit scales detected from
// computed styles of viewport-visible elements.
type TokenGroup = 'colour' | 'typography' | 'spacing' | 'radius' | 'shadow' | 'other';
type TokenScopeKind = 'root' | 'theme' | 'component';
interface TokenScope { selector: string; kind: TokenScopeKind; active: boolean; matchCount: number }
interface DesignSystemProfile { id: string; label: string; tokenCount: number }
interface TokenVariant { scope: TokenScope; value: string; resolvedValue: string }
interface DesignToken {
  cssVar: string; value: string; resolvedValue: string; group: TokenGroup; usageCount: number;
  scope: TokenScope; scopes: string[]; variants: TokenVariant[]; system?: string;
}
interface ScaleEntry { value: string; count: number; driftOf?: string }
interface DesignSystemPayload {
  tokens: DesignToken[];
  scales: { spacing: ScaleEntry[]; radius: ScaleEntry[]; fontSize: ScaleEntry[]; shadow: ScaleEntry[] };
  systems: DesignSystemProfile[];
  scopes: TokenScope[];
}
type TokenFilter = 'all' | TokenGroup;
type TokensTab = 'declared' | 'detected' | 'defined';
type PresetKindLocal = 'position' | 'layout' | 'appearance' | 'typography' | 'fill' | 'stroke' | 'effects' | 'motion';
interface PresetLocal { id: string; name: string; kind: PresetKindLocal; styles: Record<string, string>; createdAt: number }
let tokensOpen = false;
let tokensTab: TokensTab = 'declared';
let designSystem: DesignSystemPayload | null = null;
let designSystemInflight = false;
let tokenFilter: TokenFilter = 'all';
let tokenUsedOnlyFilter = false;
// User-defined preset bundles for the Defined tab. Empty by default —
// the user adds them manually from the panel. Persisted via
// chrome.storage.sync (handled in content-script presets module).
let customPresets: PresetLocal[] = [];
let presetAddingKind: PresetKindLocal | null = null;
// Tracks presets the user has Applied in this session. Maps presetId
// → groupId so the row's Unapply button knows which change-tracker
// entries to revert. Session-only — cleared when the panel closes.
const appliedPresetGroups = new Map<string, string>();
// Map of cssVar → the user's edited value (cleared on Reset). Lets the
// panel surface a Reset affordance only for tokens that have changed.
const editedTokens = new Map<string, string>();
const tokenEditKey = (scopeSelector: string, cssVar: string) => scopeSelector + '\u0000' + cssVar;
let tokenSearch = '';
// Token badge on Design-tab fields: which prop's badge menu / swap picker
// is open, and which var the Tokens panel should highlight when opened
// via "Edit token globally".
let tokenBadgeMenuProp: string | null = null;
let tokenPickerProp: string | null = null;
let tokensFocusVar: string | null = null;
// Tokens panel — scope / design-system filters and the component-token
// disclosure. Component-scoped tokens live in their own section so they
// don't drown the page-wide sets.
let tokenScopeFilter = 'all';
let tokenSystemFilter: string | null = null;
let componentTokensOpen = false;

// v1.2: Computed CSS
let computedCssOpen = false;
let computedCssText = '';

// v1.2: Before/After
let previewingOriginal = false;

// v1.2: Transition/Animation visualizer
let vizProp: string | null = null;
let vizMode: 'ease' | 'spring' = 'ease';
let bezX1 = 0.42, bezY1 = 0, bezX2 = 0.58, bezY2 = 1;
let sprStiffness = 100, sprDamping = 10, sprMass = 1;

// Per-property linked toggles. Each defaults to *linked* (Figma's default
// behaviour) so editing the primary value writes to all four sides.
let borderWidthLinked = true;
let borderStyleLinked = true;
let borderColorLinked = true;

// Stroke style intent — tracks user's chosen style (solid / dashed) per
// selected element. Needed because Inside mode (box-shadow inset) can't
// render dashed visually, but the user's design intent still controls
// which panel (dashed config) is shown in the side panel.
const strokeStyleByElement = new Map<string, 'solid' | 'dashed'>();

// Figma-style Design tab state
let cornerRadiusLinked = true;
let cornerRadiusExpanded = false;
let marginExpanded = false;
let paddingExpanded = false;
const CORNER_RADIUS_PROPS = new Set([
  'borderRadius',
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomLeftRadius',
  'borderBottomRightRadius',
]);
// Numeric fields that CSS will reject (or silently zero) when given a
// negative value. Same UX as CORNER_RADIUS_PROPS: floor at 0 on commit,
// block the `-` keystroke, and clamp Arrow-stepping past zero.
// Skipped here on purpose: width/height (legitimately accept `auto`),
// lineHeight (unitless decimals + percentages are normal), outlineOffset
// (negative is meaningful — pulls outline inward).
const NON_NEGATIVE_NUMERIC_PROPS = new Set([
  'borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth',
  'paddingTop','paddingRight','paddingBottom','paddingLeft','padding',
  'fontSize',
  'outlineWidth',
  '__stroke_weight',
]);
function isNonNegativeNumericProp(prop: string): boolean {
  if (CORNER_RADIUS_PROPS.has(prop)) return true;
  if (NON_NEGATIVE_NUMERIC_PROPS.has(prop)) return true;
  if (prop.startsWith('__stroke_weight__')) return true;
  return false;
}
const advancedOpen: Record<string, boolean> = {};   // keyed by section key
let sidesPopoverOpen = false;
let strokeStylePopoverOpen = false;
let effectsMenuOpen = false;
let motionMenuOpen = false;
// Which interaction is being force-previewed (the .dm-force-* class is on
// the page element). Null when nothing is previewing. Panel-only state.
let motionForcedTrigger: string | null = null;
// Motion interaction triggers → the CSS state-variant selector the target
// props are written into. Hover/press/focus are pseudo-classes; 'appear'
// uses the @starting-style sentinel handled in the override engine.
const MOTION_TRIGGER_STATE: Record<string, string> = {
  hover: ':hover',
  press: ':active',
  focus: ':focus-visible',
  appear: '@starting',
};
// State-variant triggers (target values written into a `:state` rule).
// `appear` uses the @starting-style sentinel and carries "from" values —
// the element animates from those to its natural resting state on mount.
const MOTION_TRIGGERS: Array<{ trigger: string; state: string; label: string; verb: string; icon: keyof typeof icons }> = [
  { trigger: 'hover',  state: ':hover',         label: 'Hover',  verb: 'On hover',  icon: 'mousePointer2' },
  { trigger: 'press',  state: ':active',        label: 'Press',  verb: 'On press',  icon: 'move' },
  { trigger: 'focus',  state: ':focus-visible', label: 'Focus',  verb: 'On focus',  icon: 'crosshair' },
  { trigger: 'appear', state: '@starting',      label: 'Appear', verb: 'On appear', icon: 'sparkles' },
];
const MOTION_STATE_TRIGGER: Record<string, typeof MOTION_TRIGGERS[number]> =
  Object.fromEntries(MOTION_TRIGGERS.map(t => [t.state, t]));
type MotionPreset = { prop: string; value: string; label: string; icon: keyof typeof icons };
// Interaction / press / focus animate TO a target; appear animates FROM a
// start state, so the same gestures need different seed values per family.
const MOTION_CHANGE_PRESETS: Record<string, MotionPreset> = {
  fade:  { prop: 'opacity',         value: '0.6',       label: 'Fade',       icon: 'blend' },
  lift:  { prop: 'translate',       value: '0px -8px',  label: 'Lift',       icon: 'move' },
  scale: { prop: 'scale',           value: '1.05',      label: 'Scale',      icon: 'maximize' },
  color: { prop: 'backgroundColor', value: '#3b82f6',   label: 'Background', icon: 'droplet' },
};
const MOTION_APPEAR_PRESETS: Record<string, MotionPreset> = {
  fade:  { prop: 'opacity',   value: '0',        label: 'Fade in',  icon: 'blend' },
  slide: { prop: 'translate', value: '0px 12px', label: 'Slide up', icon: 'move' },
  scale: { prop: 'scale',     value: '0.9',      label: 'Scale in', icon: 'maximize' },
};
function motionPresetsFor(trigger: string): Record<string, MotionPreset> {
  return trigger === 'appear' ? MOTION_APPEAR_PRESETS : MOTION_CHANGE_PRESETS;
}
function motionChangeLabel(prop: string): string {
  const hit = [...Object.values(MOTION_CHANGE_PRESETS), ...Object.values(MOTION_APPEAR_PRESETS)].find(p => p.prop === prop);
  return hit ? hit.label : prop;
}
// Built-in @keyframes offered in the Loop / Scroll cards (from the shared
// keyframes library — names must match BUILTIN_KEYFRAMES in change-tracker).
const MOTION_KEYFRAME_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'dm-fade-in', label: 'Fade in' },
  { value: 'dm-slide-up', label: 'Slide up' },
  { value: 'dm-pulse', label: 'Pulse' },
  { value: 'dm-bounce', label: 'Bounce' },
  { value: 'dm-spin', label: 'Spin' },
  { value: 'dm-wiggle', label: 'Wiggle' },
  { value: 'dm-ping', label: 'Ping' },
];
let fillAddOpen = false;
let expandedFillIdx: number | null = null;
let expandedStrokeIdx: number | null = null;
let expandedEffectIdx: number | null = null;
// Per-element stash so swapping stroke position (Inside/Outside/Center)
// doesn't lose unrelated box-shadow / outline values authored elsewhere.
const previousStroke = new Map<string, { boxShadow?: string; outline?: string; outlineOffset?: string }>();
// Per-element stash for the Fill eye toggle so re-enabling restores the
// authored backgroundColor instead of leaving it transparent.
const previousFill = new Map<string, string>();
// Per-element × axis stash so switching gap mode to Auto (space-between)
// doesn't permanently clobber the alignment the user set via the 9-pad.
// Key: `${elementId}:${distProp}`, value: the previous CSS value.
const previousGapAlign = new Map<string, string>();

// v1.2: Spacing expand state

const root = document.getElementById('dm-root')!;

/* ── Theme ── */
function resolveTheme() {
  if (theme === 'system') resolvedTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  else resolvedTheme = theme;
  document.documentElement.dataset.theme = resolvedTheme;
}
resolveTheme();
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (theme === 'system') { resolveTheme(); render(); } });
// Persisted settings — restored from chrome.storage.local on boot.
let mcpPort = 9960;
let mcpAutoConnect = true;
// Cloud / self-hosted MCP. Mode picks where the extension dials; the
// other three are only meaningful when mode !== 'local'.
type McpMode = 'local' | 'cloud' | 'self-hosted';
let mcpMode: McpMode = 'cloud';
let mcpCloudToken = '';
let mcpCloudUrl = 'https://mcp.designmode.app';
let mcpCloudTenantId = '';
let mcpCloudRegistering = false;
let inspectorHoverColor = '#4F9EFF';
let inspectorSelectColor = '#FF6B35';
// Box-model band defaults — light coral red for margin, soft pastel green
// for padding. Stored as hex (the colour picker only accepts hex); the
// content script multiplies by a fixed alpha when painting.
const OVERLAY_MARGIN_DEFAULT = '#FF6363';
const OVERLAY_PADDING_DEFAULT = '#7CC886';
let overlayMarginColor = OVERLAY_MARGIN_DEFAULT;
let overlayPaddingColor = OVERLAY_PADDING_DEFAULT;
// Display unit for pixel-based inputs (W/H, min/max, padding/margin/border
// width). When set to rem, the panel converts resolved px to rem for
// display and writes new values back as rem to the override stylesheet —
// so the Changes tab shows the user's chosen unit, not a forced
// translation. The conversion uses the root document's font-size at boot
// (typically 16px); we cache it once so the value is stable across
// renders without re-reading getComputedStyle each time.
let inputUnit: 'px' | 'rem' = 'px';
let remRootPx = 16;
// Figma-style nudge: Shift+Arrow steps a numeric field by this amount
// (plain Arrow steps by 1). User-editable in Settings.
let nudgeAmount = 10;
// App-icon cursor on the inspected page while the panel is open. The
// content script reads the same key via chrome.storage.onChanged.
let customCursor = true;

chrome.storage?.local?.get?.([
  'dm-theme', 'dm-color-format', 'dm-capture-mode',
  'dm-mcp-port', 'dm-mcp-auto-connect',
  'dm-mcp-mode', 'dm-mcp-cloud-token', 'dm-mcp-cloud-url', 'dm-mcp-cloud-tenant',
  'dm-inspector-hover-color', 'dm-inspector-select-color',
  'dm-overlay-margin-color', 'dm-overlay-padding-color',
  'dm-input-unit',
  'dm-nudge-amount',
  'dm-custom-cursor',
  'dm-a11y-category', 'dm-a11y-level',
  'dm-pip-size', 'dm-pip-unsupported',
], (result: any) => {
  if (result?.['dm-theme']) { theme = result['dm-theme']; resolveTheme(); }
  if (result?.['dm-color-format']) { colorFormat = result['dm-color-format']; }
  if (result?.['dm-capture-mode']) { captureMode = result['dm-capture-mode']; }
  if (typeof result?.['dm-mcp-port'] === 'number') mcpPort = result['dm-mcp-port'];
  if (typeof result?.['dm-mcp-auto-connect'] === 'boolean') mcpAutoConnect = result['dm-mcp-auto-connect'];
  if (typeof result?.['dm-mcp-mode'] === 'string') mcpMode = result['dm-mcp-mode'];
  if (typeof result?.['dm-mcp-cloud-token'] === 'string') mcpCloudToken = result['dm-mcp-cloud-token'];
  if (typeof result?.['dm-mcp-cloud-url'] === 'string') mcpCloudUrl = result['dm-mcp-cloud-url'];
  if (typeof result?.['dm-mcp-cloud-tenant'] === 'string') mcpCloudTenantId = result['dm-mcp-cloud-tenant'];
  if (typeof result?.['dm-inspector-hover-color'] === 'string') inspectorHoverColor = result['dm-inspector-hover-color'];
  if (typeof result?.['dm-inspector-select-color'] === 'string') inspectorSelectColor = result['dm-inspector-select-color'];
  if (typeof result?.['dm-overlay-margin-color'] === 'string') overlayMarginColor = result['dm-overlay-margin-color'];
  if (typeof result?.['dm-overlay-padding-color'] === 'string') overlayPaddingColor = result['dm-overlay-padding-color'];
  if (result?.['dm-input-unit'] === 'rem' || result?.['dm-input-unit'] === 'px') inputUnit = result['dm-input-unit'];
  if (typeof result?.['dm-nudge-amount'] === 'number' && result['dm-nudge-amount'] > 0) nudgeAmount = result['dm-nudge-amount'];
  if (typeof result?.['dm-custom-cursor'] === 'boolean') customCursor = result['dm-custom-cursor'];
  const cat = result?.['dm-a11y-category'];
  if (cat === 'auto' || cat === 'large' || cat === 'normal' || cat === 'graphics') a11yCategory = cat;
  const lvl = result?.['dm-a11y-level'];
  if (lvl === 'AA' || lvl === 'AAA') a11yLevel = lvl;
  // PiP size must be in memory before the pin click: requestWindow()
  // consumes the click's user gesture, so the handler cannot await storage.
  const ps = result?.['dm-pip-size'];
  if (ps && typeof ps.width === 'number' && typeof ps.height === 'number') pipSavedSize = ps;
  if (result?.['dm-pip-unsupported'] === true) pipUnsupported = true;
  // Resolve the host page's rem root once so px → rem conversions are
  // accurate even when the page customises the root font-size.
  try {
    const rootFs = parseFloat(getComputedStyle(document.documentElement).fontSize);
    if (rootFs > 0) remRootPx = rootFs;
  } catch {}
  render();
});
// Section expand/collapse state — restore the user's per-section
// preference so the panel opens at the same shape they last left it.
chrome.storage?.session?.get?.(['dm-section-states'], (result: any) => {
  if (result?.['dm-section-states'] && typeof result['dm-section-states'] === 'object') {
    Object.assign(sectionStates, result['dm-section-states']);
  }
  render();
});

// Compact human-readable byte formatter (1 decimal place; B / KB / MB / GB).
// Uses 1024 base, matching how dev tools / file managers display sizes.
function formatBytes(n: number): string {
  if (!isFinite(n) || n < 0) return '';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10 * 1024 ? 1 : 0) + ' KB';
  if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0) + ' MB';
  return (n / 1024 / 1024 / 1024).toFixed(1) + ' GB';
}

// Middle-truncates the name part to 20 chars so the extension and tail stay visible.
function truncateFilename(filename: string): string {
  const dot = filename.lastIndexOf('.');
  const name = dot > 0 ? filename.slice(0, dot) : filename;
  const ext = dot > 0 ? filename.slice(dot) : '';
  if (name.length <= 20) return filename;
  return name.slice(0, 10) + '…' + name.slice(-9) + ext;
}

function parseNumeric(val: string): { num: number; unit: string } | null {
  const m = val.match(/^(-?[\d.]+)\s*(px|rem|em|%|vw|vh|vmin|vmax|ch|ex|deg|s|ms)?$/);
  if (m) return { num: parseFloat(m[1]), unit: m[2] || '' };
  return null;
}

// The browser tab this panel controls. The native side panel learns it from
// INIT_STATE; a popped-out window gets it up front from its `?tab=` URL param.
// Every SP_* message is stamped with it so the background routes to the right
// tab even when several panel surfaces (side panel + floating windows) are open.
const popoutTabParam = (() => {
  const t = parseInt(new URLSearchParams(location.search).get('tab') || '', 10);
  return Number.isInteger(t) ? t : null;
})();
const isPopout = popoutTabParam != null;
let myTabId: number | null = popoutTabParam;

// Pin-on-top via Document Picture-in-Picture (Chrome 116+). The PiP window
// hosts a fresh copy of this page in an iframe (`?pip=1`) instead of
// migrating the live DOM — a PiP window dies the moment its opener document
// unloads, so this page stays alive as the opener while pinned.
const isPip = new URLSearchParams(location.search).get('pip') === '1';
const pipAvailable = 'documentPictureInPicture' in window;
// Floor matches the panel's own min-width (index.html); Chrome has no API to
// stop the user shrinking a PiP window below this afterwards — content then
// scrolls horizontally instead of breaking.
const PIP_MIN_WIDTH = 320;
const PIP_MIN_HEIGHT = 400;
let pipPinned = false;
let pipWindow: Window | null = null;
let pipMinimizedSelf = false;
// Dock-back was requested from inside the PiP (side panel is taking over) —
// on PiP close, this floating window must close itself instead of restoring.
let pipDockingBack = false;
let pipChannel: BroadcastChannel | null = null;
let pipUnsupported = false;
let pipSavedSize: { width: number; height: number } | null = null;

function send(msg: any): Promise<any> {
  const stamped = (myTabId != null && msg && typeof msg.type === 'string' && msg.type.startsWith('SP_'))
    ? { ...msg, targetTabId: myTabId }
    : msg;
  return new Promise((resolve) => chrome.runtime.sendMessage(stamped, (r) => resolve(r || {})));
}

// file:// URLs have an empty hostname — show the file name instead.
function domainLabel(url: string): string {
  try {
    const u = new URL(url);
    if (u.protocol === 'file:') {
      const name = decodeURIComponent(u.pathname.split('/').pop() || '');
      return name || 'Local file';
    }
    return u.hostname;
  } catch { return url; }
}

/* ── Chrome Port ── */
// Popped-out windows announce their bound tab in the port name so the
// background binds correctly even before INIT_STATE.
const port = chrome.runtime.connect({ name: isPopout ? 'sidepanel:' + popoutTabParam : 'sidepanel' });
port.onMessage.addListener((msg) => {
  if (msg.type === 'INIT_STATE') {
    enabled = msg.enabled ?? false; inspecting = msg.inspecting ?? true;
    if (typeof msg.tabId === 'number') myTabId = msg.tabId;
    mcpState = !msg.connected ? 'offline' : msg.agentConnected ? 'connected' : 'running';
    if (msg.pinnedUrl) { pinnedDomain = domainLabel(msg.pinnedUrl); }
    fileAccessBlocked = !!msg.fileAccessBlocked;
    if (fileAccessBlocked) { render(); return; }
    render(); refreshMcpStatus(); refreshDomTree(); refreshChanges(); refreshDesignTokens(); refreshPageFonts();
  }
});

// Immediately deactivate inspect mode when the side panel is closing.
// We only listen to *unload* events — visibilitychange would fire when the
// user switches tabs in the same window even though the panel itself is
// still attached, and that prematurely killed the inspector.
// `pagehide` covers panel close + browser-quit; `beforeunload` is a backup.
// The background's port.onDisconnect handler is the third belt in case
// either of these gets dropped while the service worker is spinning down.
function signalPanelClosing() {
  try { chrome.runtime.sendMessage({ type: 'SP_PANEL_CLOSING' }); } catch {}
}
window.addEventListener('pagehide', signalPanelClosing);
window.addEventListener('beforeunload', signalPanelClosing);

// Runs for every PiP close path — the PiP window's own ✕, the Unpin button,
// or a dock-back from inside the iframe — via pagehide. Unpin/✕ restore this
// floating window; dock-back (flagged over the BroadcastChannel) closes it,
// since the side panel is taking over (transition guard keeps design mode
// alive across the swap).
function onPipClosed() {
  pipWindow = null;
  pipPinned = false;
  try { pipChannel?.close(); } catch {}
  pipChannel = null;
  if (pipDockingBack) {
    pipDockingBack = false;
    try { window.close(); } catch {}
    return;
  }
  if (pipMinimizedSelf) {
    pipMinimizedSelf = false;
    chrome.windows?.getCurrent?.().then((win) => {
      if (win?.id != null) return chrome.windows.update(win.id, { state: 'normal', focused: true });
    }).catch(() => {});
  }
  render();
}
let pipSizeTimer: ReturnType<typeof setTimeout> | null = null;
function savePipSizeDebounced() {
  if (pipSizeTimer) clearTimeout(pipSizeTimer);
  pipSizeTimer = setTimeout(() => {
    if (!pipWindow) return;
    pipSavedSize = {
      width: Math.max(pipWindow.innerWidth, PIP_MIN_WIDTH),
      height: Math.max(pipWindow.innerHeight, PIP_MIN_HEIGHT),
    };
    chrome.storage?.local?.set?.({ 'dm-pip-size': pipSavedSize });
  }, 300);
}

// Opens the always-on-top PiP window hosting a fresh panel iframe, then
// minimizes this floating window out of the way (it must stay alive as the
// PiP's opener). requestWindow() consumes the click's user gesture, so
// nothing may run before it — no await, no storage reads (pipSavedSize is
// preloaded at boot for exactly this reason).
function openPipWindow() {
  const dpip = (window as any).documentPictureInPicture;
  if (!dpip || myTabId == null || pipPinned) return;
  dpip.requestWindow({
    width: Math.max(pipSavedSize?.width || window.innerWidth, PIP_MIN_WIDTH),
    height: Math.max(pipSavedSize?.height || window.innerHeight, PIP_MIN_HEIGHT),
  }).then(async (pw: Window) => {
    pipWindow = pw;
    pw.document.body.style.margin = '0';
    const frame = pw.document.createElement('iframe');
    frame.src = chrome.runtime.getURL('sidepanel/index.html') + '?tab=' + myTabId + '&pip=1';
    frame.style.cssText = 'border:0;display:block;width:100vw;height:100vh;';
    frame.addEventListener('load', () => { try { frame.contentWindow?.focus(); } catch {} });
    pw.document.body.appendChild(frame);
    pw.addEventListener('pagehide', onPipClosed);
    pw.addEventListener('resize', savePipSizeDebounced);
    try {
      pipChannel = new BroadcastChannel('dm-pip-' + myTabId);
      pipChannel.onmessage = (e) => { if (e.data === 'dock-back') pipDockingBack = true; };
    } catch {}
    pipPinned = true;
    render();
    try {
      const win = await chrome.windows.getCurrent();
      if (win?.id != null) {
        pipMinimizedSelf = true;
        await chrome.windows.update(win.id, { state: 'minimized' });
      }
    } catch {}
  }).catch(() => {
    pipUnsupported = true;
    chrome.storage?.local?.set?.({ 'dm-pip-unsupported': true });
    showCaptureToast('error', 'Pin on top isn’t available in this Chrome.');
    render();
  });
}

/* ── Async actions ── */
async function refreshMcpStatus() { const res = await send({ type: 'SP_GET_MCP_STATUS' }); if (res.mcpState) mcpState = res.mcpState; else if (res.connected && res.agentConnected) mcpState = 'connected'; else if (res.connected) mcpState = 'running'; else mcpState = 'offline'; render(); }
async function refreshState() { const res = await send({ type: 'SP_GET_STATE' }); enabled = res.enabled ?? enabled; inspecting = res.inspecting ?? inspecting; undoCount = res.undoCount ?? undoCount; redoCount = res.redoCount ?? redoCount; render(); }
async function refreshChanges() { const res = await send({ type: 'SP_GET_CHANGES' }); styleChanges = res.styleChanges || []; textChanges = res.textChanges || []; domChanges = res.domChanges || []; comments = res.comments || []; tokenChanges = res.tokenChanges || []; render(); }
async function refreshDomTree() { const res = await send({ type: 'SP_GET_DOM_TREE' }); domTree = res.tree || []; render(); }
// Scroll the currently-selected layer row into view (Layers tab). Tolerates
// the row not existing yet — caller may invoke it after a re-render where
// morphdom hasn't placed the element by the next microtask.
function scrollSelectedLayerIntoView() {
  const id = info?.id;
  if (!id) return;
  const tryScroll = (attempts: number) => {
    const layerEl = root.querySelector('[data-dm-layer="' + id + '"]');
    if (layerEl) { layerEl.scrollIntoView({ block: 'nearest' }); return; }
    if (attempts > 0) requestAnimationFrame(() => tryScroll(attempts - 1));
  };
  // Three rAFs is plenty for morphdom + the auto-expand of collapsed ancestors.
  requestAnimationFrame(() => tryScroll(3));
}
// Bring the token a field's "Edit token globally" jumped to into view.
// Same retry cadence as scrollSelectedLayerIntoView — the row only exists
// once the design-system fetch has resolved and morphdom has painted.
function scrollFocusedTokenIntoView() {
  const cssVar = tokensFocusVar;
  if (!cssVar) return;
  const tryScroll = (attempts: number) => {
    const row = root.querySelector('[data-dm-token-row="' + CSS.escape(cssVar) + '"]');
    if (row) { row.scrollIntoView({ block: 'center' }); return; }
    if (attempts > 0) requestAnimationFrame(() => tryScroll(attempts - 1));
  };
  requestAnimationFrame(() => tryScroll(5));
}

async function refreshDesignTokens() { const res = await send({ type: 'SP_GET_DESIGN_TOKENS' }); designTokens = res.tokens || []; }
async function refreshPageFonts() { const res = await send({ type: 'SP_GET_PAGE_FONTS' }); pageFonts = res.fonts || []; render(); }
async function refreshMedia() {
  if (!info) { mediaInfo = null; lastMediaElementId = null; return; }
  if (info.id === lastMediaElementId) return;
  lastMediaElementId = info.id;
  const res = await send({ type: 'SP_GET_MEDIA' });
  mediaInfo = res?.media || null;
  render();
}
async function refreshCustomPresets(): Promise<void> {
  const res = await send({ type: 'SP_GET_PRESETS' });
  customPresets = (res && Array.isArray(res.presets)) ? res.presets : [];
  render();
}

// Fetch the page's design system — :root CSS variables + detected scales
// (spacing, radius, font-size, shadow histograms from viewport-visible
// elements). Cached in `designSystem` until the user reloads or
// re-opens the Tokens panel.
async function refreshDesignSystem(force = false) {
  if (designSystemInflight) return;
  designSystemInflight = true;
  try {
    const res = await send({ type: 'SP_GET_DESIGN_SYSTEM', force });
    designSystem = (res && res.tokens) ? res as DesignSystemPayload : { tokens: [], scales: { spacing: [], radius: [], fontSize: [], shadow: [] }, systems: [], scopes: [] };
    render();
  } finally {
    designSystemInflight = false;
  }
}

// Recompose translate / scale from their X/Y inputs and apply.
function applyTransformComponentFromFields(group: 'translate' | 'scale') {
  const xEl = root.querySelector<HTMLInputElement>('[data-dm-tcomp-group="' + group + '"][data-dm-tcomp-axis="x"]');
  const yEl = root.querySelector<HTMLInputElement>('[data-dm-tcomp-group="' + group + '"][data-dm-tcomp-axis="y"]');
  const xRaw = (xEl?.value ?? '').trim();
  const yRaw = (yEl?.value ?? '').trim();
  if (group === 'translate') {
    const x = xRaw === '' ? '0' : xRaw;
    const y = yRaw === '' ? '0' : yRaw;
    // Append px when input is a bare number; users can also paste 'em'/'%' and we honor it.
    const fmt = (v: string) => /^-?\d+(?:\.\d+)?$/.test(v) ? v + 'px' : v;
    applyStyle('translate', `${fmt(x)} ${fmt(y)}`);
  } else {
    const x = xRaw === '' ? '1' : xRaw;
    const y = yRaw === '' ? '1' : yRaw;
    // CSS scale accepts unitless numbers — strip any accidental units.
    const num = (v: string) => v.replace(/[^0-9.\-]/g, '') || (group === 'scale' ? '1' : '0');
    applyStyle('scale', `${num(x)} ${num(y)}`);
  }
}

// Mirror a value to the slider+number duo for the same filter function so
// dragging the slider keeps the number in sync (and vice-versa) without
// waiting for a re-render. Called from input/keydown handlers.
function syncFilterSiblings(src: HTMLInputElement) {
  const group = src.dataset.dmFcompGroup;
  const field = src.dataset.dmFcompField;
  if (!group || !field) return;
  const siblings = root.querySelectorAll<HTMLInputElement>(
    '[data-dm-fcomp-group="' + group + '"][data-dm-fcomp-field="' + field + '"]'
  );
  siblings.forEach(sib => { if (sib !== src) sib.value = src.value; });
}

// Recompose filter / backdrop-filter from per-function fields and apply.
// Dedupes by function name (slider + number share a name) — first input
// in DOM order wins, which is the slider since we render it first. The
// sync helper above ensures slider/number agree before this runs.
function applyFilterComponentsFromFields(group: 'filter' | 'bfilter') {
  const inputs = root.querySelectorAll<HTMLInputElement>('[data-dm-fcomp-group="' + group + '"]');
  const seen = new Set<string>();
  const parts: string[] = [];
  inputs.forEach(inp => {
    const fn = inp.dataset.dmFcompField!;
    if (seen.has(fn)) return; // dedupe slider+number into one declaration
    seen.add(fn);
    const unit = inp.dataset.dmUnit || '';
    const raw = (inp.value ?? '').trim();
    if (!raw) return;
    const isDefault =
      (fn === 'blur' && raw === '0') ||
      (fn === 'hue-rotate' && raw === '0') ||
      (fn === 'grayscale' && raw === '0') ||
      ((fn === 'brightness' || fn === 'contrast' || fn === 'saturate') && raw === '1');
    if (isDefault) return;
    const isNum = /^-?\d+(?:\.\d+)?$/.test(raw);
    const arg = isNum && unit ? raw + unit : raw;
    parts.push(`${fn}(${arg})`);
  });
  const value = parts.length === 0 ? 'none' : parts.join(' ');
  applyStyle(group === 'filter' ? 'filter' : 'backdropFilter', value);
}

// Color-picker pointer drag handlers + input wiring. Single shared
// `pointermove`/`pointerup` listener kept on `window` while the user is
// dragging — we set a `currentDrag` ref on pointerdown and clear it on
// pointerup so we never accumulate listeners.
type ColorDrag = { kind: 'sv' | 'hue'; prop: string; el: HTMLElement } | null;
let colorDrag: ColorDrag = null;

function getDragHueFromAttr(prop: string): number {
  // The current hue is stashed on the SV gradient as `data-dm-color-h`
  // (set during render). For drags that happen on the SV plane, we use
  // that hue; for hue-slider drags, the new hue is computed from x.
  const sv = root.querySelector<HTMLElement>('[data-dm-color-sv="' + prop + '"]');
  return sv ? parseFloat(sv.dataset.dmColorH || '0') : 0;
}

function applyColorFromHsv(prop: string, h: number, sv: number, v: number) {
  const [r, g, b] = hsvToRgb(h, sv, v);
  let value: string;
  if (colorFormat === 'hsl') {
    // Convert HSV → HSL.
    const lL = (2 - sv) * v / 2;
    const sL = lL && lL < 1 ? sv * v / (lL < 0.5 ? lL * 2 : 2 - lL * 2) : 0;
    value = `hsl(${Math.round(h)}, ${Math.round(sL * 100)}%, ${Math.round(lL * 100)}%)`;
  } else if (colorFormat === 'rgba') {
    value = `rgb(${r}, ${g}, ${b})`;
  } else {
    value = rgbToHexStr(r, g, b);
  }
  applyStyle(prop, value);
}

function handleColorPointer(e: PointerEvent) {
  if (!colorDrag) return;
  const rect = colorDrag.el.getBoundingClientRect();
  if (colorDrag.kind === 'sv') {
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const h = getDragHueFromAttr(colorDrag.prop);
    applyColorFromHsv(colorDrag.prop, h, x, 1 - y);
  } else {
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const h = x * 360;
    // Preserve the current S/V by rebuilding from the current swatch RGB.
    const swatch = root.querySelector<HTMLButtonElement>('[data-dm-color-trigger="' + colorDrag.prop + '"]');
    let s = 1, v = 1;
    if (swatch) {
      const cs = window.getComputedStyle(swatch).backgroundColor;
      const rgb = parseColorRgb(cs);
      if (rgb) { const hsv = rgbToHsv(rgb[0], rgb[1], rgb[2]); s = hsv[1]; v = hsv[2]; }
    }
    applyColorFromHsv(colorDrag.prop, h, s, v);
  }
}

window.addEventListener('pointermove', handleColorPointer);
window.addEventListener('pointerup', () => { colorDrag = null; });
window.addEventListener('pointercancel', () => { colorDrag = null; });

// Pointerdown delegation for the inline color picker — the SV (saturation
// × value) gradient and the hue strip both rely on `colorDrag` being set.
// Without this listener, pointermove silently bails and the dot / slider
// never move.
window.addEventListener('pointerdown', (e) => {
  const target = e.target as HTMLElement;
  if (!target) return;
  const sv = target.closest<HTMLElement>('[data-dm-color-sv]');
  if (sv) {
    const prop = sv.dataset.dmColorSv!;
    colorDrag = { kind: 'sv', prop, el: sv };
    handleColorPointer(e);
    return;
  }
  const hue = target.closest<HTMLElement>('[data-dm-color-hue]');
  if (hue) {
    const prop = hue.dataset.dmColorHue!;
    colorDrag = { kind: 'hue', prop, el: hue };
    handleColorPointer(e);
    return;
  }
});

function applyTextShadowFromFields() {
  const get = (field: string, fallback: string) => {
    const el = root.querySelector<HTMLInputElement>('[data-dm-textshadow-field="' + field + '"]');
    return el ? el.value : fallback;
  };
  const x = parseFloat(get('x', '0')) || 0;
  const y = parseFloat(get('y', '1')) || 0;
  const blur = parseFloat(get('blur', '2')) || 0;
  const colorEl = root.querySelector<HTMLInputElement>('[data-dm-textshadow-field="color"]');
  const hexEl = root.querySelector<HTMLInputElement>('[data-dm-textshadow-field="colorhex"]');
  // Prefer the hex text field if user typed there; otherwise the color picker.
  let color = '#000000';
  if (hexEl?.value) {
    const v = hexEl.value.trim();
    color = v.startsWith('#') ? v : '#' + v;
  } else if (colorEl?.value) {
    color = colorEl.value;
  }
  const css = `${x}px ${y}px ${blur}px ${color}`;
  applyStyle('textShadow', css);
}

function applyShadowFromFields() {
  const get = (field: string, fallback: string) => {
    const el = root.querySelector<HTMLInputElement>('[data-dm-shadow-field="' + field + '"]');
    return el ? el.value : fallback;
  };
  const type = get('type', 'outer');
  const colorHex = get('colorhex', '000000').replace('#','');
  const opacity = parseFloat(get('opacity', '30')) || 0;
  const x = get('x', '0'); const y = get('y', '4');
  const blur = get('blur', '12'); const spread = get('spread', '0');
  const hex = colorHex.padEnd(6, '0');
  const r = parseInt(hex.slice(0,2),16)||0, g = parseInt(hex.slice(2,4),16)||0, b = parseInt(hex.slice(4,6),16)||0;
  const a = (opacity/100).toFixed(2);
  const colorStr = 'rgba(' + r + ', ' + g + ', ' + b + ', ' + a + ')';
  const insetStr = type === 'inset' ? 'inset ' : '';
  applyStyle('boxShadow', insetStr + x + 'px ' + y + 'px ' + blur + 'px ' + spread + 'px ' + colorStr);
}
// The single dispatcher for every style edit triggered from the Design tab.
// Every input/select/button/picker in the panel ends up calling this with
// a `(property, value)` pair — DO NOT add parallel SP_APPLY_STYLE call sites
// in render helpers; build virtual props and route them through here. The
// content script's APPLY_STYLE handler does the multi-select fan-out, undo
// bookkeeping, and stylesheet write — keeping all of it on one path is what
// makes Changes-tab grouping and reverts predictable.
async function applyStyle(property: string, value: string) {
  // Route virtual stroke props (`__stroke_color`, `__stroke_weight`,
  // `__stroke_style`) to their real CSS targets based on the active
  // stroke position (Inside / Outside / Center). This keeps the Stroke
  // section's UI mode-agnostic — fields write through one helper.
  if (property === '__stroke_color' || property === '__stroke_weight' || property === '__stroke_style') {
    applyStrokeProperty(property, value);
    return;
  }
  // Motion interaction target: `__motion_<trigger>__<cssProp>` writes the
  // CSS prop into a state-variant rule (`:hover` etc.) rather than the base
  // rule, so it only applies while that interaction state is active.
  const motionMatch = property.match(/^__motion_([a-z]+)__(.+)$/);
  if (motionMatch) {
    const state = MOTION_TRIGGER_STATE[motionMatch[1]];
    if (state) {
      const res = await send({ type: 'SP_APPLY_STYLE', property: motionMatch[2], value, state });
      if (res.info) info = res.info; if (res.styleChanges) styleChanges = res.styleChanges; if (res.textChanges) textChanges = res.textChanges; if (res.domChanges) domChanges = res.domChanges; render();
    }
    return;
  }
  // Margin / padding shorthand from the uniform field → write the four
  // longhands instead. A standalone `margin` shorthand rule wouldn't override
  // an existing per-side longhand override (so one differing side would stay),
  // and would later reset all sides when one side is edited. Writing the four
  // longhands sets every side and keeps per-side editing independent.
  if (property === 'margin' || property === 'padding') {
    return applyStylesBatch(
      ['Top', 'Right', 'Bottom', 'Left'].map((side) => ({ property: property + side, value })),
      property === 'margin' ? 'Margin' : 'Padding',
    );
  }
  // Aspect-ratio lock: when the W:H ratio is pinned (the link2 icon is
  // active in the Layout section), editing one dimension drives the
  // other. We detect "locked" by the live computed `aspect-ratio` —
  // it's only set when the user explicitly engaged the lock button. We
  // dispatch the partner FIRST so when the user's own edit's repaint
  // arrives, both dimensions are already coherent.
  //
  // Media elements (<img>, <video>, <svg>, <canvas>, <picture>) get an
  // implicit lock derived from their current W:H so resizing keeps the
  // natural proportions by default — users don't have to remember to
  // toggle the link button on first.
  if (property === 'width' || property === 'height') {
    const arRaw = (info?.computedStyles?.aspectRatio || '').trim();
    let ratio = NaN;
    // Browsers serialise computed aspect-ratio in three shapes:
    //   "16 / 9"   — explicit user value
    //   "1.7777"   — single number
    //   "auto 800 / 600" — element's intrinsic ratio (img / svg / video)
    // The user-set `<W>/<H>` is the canonical "lock on" signal; the
    // `auto <W> / <H>` form is what `<img>` reports by default and is
    // treated as the implicit-lock branch below.
    const userSlash = arRaw.match(/^(-?[\d.]+)\s*\/\s*(-?[\d.]+)$/);
    if (userSlash) {
      const a = parseFloat(userSlash[1]);
      const b = parseFloat(userSlash[2]);
      if (a > 0 && b > 0) ratio = a / b;
    } else if (arRaw && arRaw !== 'auto') {
      const n = parseFloat(arRaw);
      if (!isNaN(n) && n > 0) ratio = n;
    }
    // Media-kind implicit lock — derive ratio from current rendered
    // width / height when no explicit aspect-ratio is set.
    if (isNaN(ratio) && info) {
      const tag = (info.tagName || '').toLowerCase();
      const isMedia = tag === 'img' || tag === 'video' || tag === 'svg' || tag === 'canvas' || tag === 'picture';
      if (isMedia) {
        const cw = parseFloat(info.computedStyles?.width || '0') || 0;
        const ch = parseFloat(info.computedStyles?.height || '0') || 0;
        if (cw > 0 && ch > 0) ratio = cw / ch;
      }
    }
    if (!isNaN(ratio) && ratio > 0) {
      const parsedVal = (value || '').trim().match(/^(-?[\d.]+)\s*([a-z%]*)$/i);
      if (parsedVal) {
        const num = parseFloat(parsedVal[1]);
        const unit = (parsedVal[2] || 'px').trim() || 'px';
        if (!isNaN(num) && num > 0) {
          const partnerProp = property === 'width' ? 'height' : 'width';
          const partnerNum = property === 'width' ? num / ratio : num * ratio;
          // Use SP_APPLY_STYLE directly so we don't recursively re-enter
          // this lock branch (the partner's own dispatch would try to
          // ping the original prop again, ad infinitum).
          await send({ type: 'SP_APPLY_STYLE', property: partnerProp, value: partnerNum.toFixed(2).replace(/\.?0+$/, '') + unit });
        }
      }
    }
  }
  // Unified colour picker output for box-shadow / text-shadow. The
  // composer reads `[data-dm-shadow-field="colorhex"]` (and similarly
  // for textshadow); we mirror the picker's value into that hidden
  // input so the existing composer keeps working without a parallel
  // dispatch path. Same picker UX as the rest of the Design tab —
  // HSV + tokens + eyedropper — instead of the OS native colour dialog.
  if (property === '__shadow_color' || property === '__textshadow_color') {
    const fieldKind = property === '__shadow_color' ? 'shadow' : 'textshadow';
    const hex = (() => {
      if (value.startsWith('#')) return value.replace('#', '');
      const rgb = parseColorRgb(value);
      return rgb ? rgbToHexStr(rgb[0], rgb[1], rgb[2]).slice(1) : '000000';
    })();
    const hexEl = root.querySelector<HTMLInputElement>('[data-dm-' + fieldKind + '-field="colorhex"]');
    if (hexEl) hexEl.value = hex;
    const colorEl = root.querySelector<HTMLInputElement>('[data-dm-' + fieldKind + '-field="color"]');
    if (colorEl) colorEl.value = '#' + hex;
    if (fieldKind === 'shadow') applyShadowFromFields();
    else applyTextShadowFromFields();
    return;
  }
  // Fill virtual colour props. The inline colour picker (HSV drag, hue
  // strip, hex / RGB / HSL inputs, eyedropper) calls applyStyle directly
  // — there's no DOM input to dispatch a change event from when the
  // user drags a marker, so the change-handler intercept never fires.
  // Without this branch, dragging in the picker writes `__fill_color__0`
  // to the content script, which isn't a real CSS property, and the
  // colour silently never moves. Route to the same fill-layer update
  // path the change-handler uses for text edits.
  if (property.startsWith('__fill_color__') || property.startsWith('__fill_stop_color__')) {
    applyFillColorProperty(property, value);
    return;
  }
  // Per-layer stroke colour / weight. Same intercept reason as fill: the
  // inline picker's drag dispatches applyStyle directly without going
  // through the change handler. Route to the in-memory stash + chain
  // re-dispatch so each row's swatch / weight input edits its own layer.
  if (property.startsWith('__stroke_color__') || property.startsWith('__stroke_weight__')) {
    applyStrokeLayerProperty(property, value);
    return;
  }
  // Layout guide per-layer edits. Same intercept reason — picker drag
  // bypasses the change handler. Routes to the in-memory stash and
  // dispatches the overlay write directly to content (bypassing the
  // change-tracker so it never lands in the Changes tab).
  if (property.startsWith('__guide_')) {
    applyLayoutGuideProperty(property, value);
    return;
  }
  // Shadow-row colour picker drag. The shadow editor's swatch dispatches
  // `applyStyle('__effd_box_0_color', '#…')` directly during HSV drag
  // (no DOM input fires a change event). Without an intercept the value
  // would be sent to the content script as a CSS property — that fails
  // silently and the picker appears dead. Splice into the right chain
  // entry and apply the colour back via the chain's CSS property.
  const effdColorMatch = property.match(/^__effd_(box|fx|text)_(\d+)_color$/);
  if (effdColorMatch) {
    const chain = effdColorMatch[1] as 'box' | 'fx' | 'text';
    const idx = parseInt(effdColorMatch[2], 10);
    const cs = info?.computedStyles || {};
    if (chain === 'box') {
      const entries = parseCssCommaList(cs.boxShadow || '');
      const cur = entries[idx];
      if (cur) {
        const parsed = parseShadowEntry(cur);
        if (parsed) {
          entries[idx] = formatShadowEntry({ ...parsed, color: value });
          applyStyle('boxShadow', entries.join(', '));
        }
      }
    } else if (chain === 'fx') {
      const list = splitFilterFunctions(cs.filter || '');
      const cur = list[idx];
      if (cur) {
        const inner = cur.match(/^drop-shadow\((.*)\)\s*$/i)?.[1] || '';
        const parsed = parseShadowEntry(inner);
        if (parsed) {
          list[idx] = formatFilterDropShadow({ ...parsed, color: value });
          applyStyle('filter', list.join(' '));
        }
      }
    } else if (chain === 'text') {
      const parsed = parseShadowEntry(cs.textShadow || '');
      if (parsed) {
        applyStyle('textShadow', formatTextShadow({ ...parsed, color: value }));
      }
    }
    return;
  }
  // Overlay-chain per-field edits dispatched from buttons (Noise mode
  // tabs) or the colour picker drag. Same problem as fill/stroke
  // colour edits: dragging the picker bypasses the change handler so
  // we need a direct intercept. Mode tabs reach here because the
  // propBtn click handler calls applyStyle() directly.
  if (property.startsWith('__effd_overlay_')) {
    const id = info?.id || '';
    if (!id) return;
    const m = property.match(/^__effd_overlay_(\d+)_(\w+)$/);
    if (!m) return;
    const idx = parseInt(m[1], 10);
    const field = m[2];
    const list = getOverlayEntries(id).slice();
    const entry = list[idx];
    if (!entry) return;
    if (entry.kind === 'noise') {
      if (field === 'mode') (entry as any).mode = value as NoiseMode;
      else if (field === 'color1' || field === 'color2') (entry as any)[field] = value;
      else if (field === 'sizeX' || field === 'sizeY' || field === 'density' ||
               field === 'color1Opacity' || field === 'color2Opacity' || field === 'opacity') {
        const n = parseFloat(value);
        (entry as any)[field] = isFinite(n) ? n : 0;
      }
    } else if (entry.kind === 'texture') {
      if (field === 'clipToShape') (entry as any).clipToShape = value === 'true';
      else if (field === 'sizeX' || field === 'sizeY' || field === 'radius') {
        const n = parseFloat(value);
        (entry as any)[field] = isFinite(n) ? n : 0;
      }
    }
    list[idx] = entry;
    setOverlayEntries(id, list);
    dispatchOverlayEntries(id, list);
    return;
  }
  const res = await send({ type: 'SP_APPLY_STYLE', property, value });
  if (res.info) info = res.info; if (res.styleChanges) styleChanges = res.styleChanges; if (res.textChanges) textChanges = res.textChanges; if (res.domChanges) domChanges = res.domChanges; render();
}

// Dispatch many CSS writes in one round-trip instead of N individual
// SP_APPLY_STYLE messages. Used by anything that has to fan out a
// single user gesture across many longhand properties (stroke-position
// switching is the main caller). Without batching, each property was
// its own send + content-side apply + response, and the panel
// re-rendered after each — visible flicker plus the "tab moves through
// every state" feeling. One message, one re-paint, one render.
async function applyStylesBatch(changes: Array<{ property: string; value: string }>, groupLabel?: string) {
  if (changes.length === 0) return;
  const res = await send({ type: 'SP_APPLY_STYLES', changes, groupLabel });
  if (res.info) info = res.info;
  if (res.styleChanges) styleChanges = res.styleChanges;
  if (res.textChanges) textChanges = res.textChanges;
  if (res.domChanges) domChanges = res.domChanges;
  render();
}

// Apply a fill virtual colour prop to its target layer slot. Shared by
// applyStyle (called by the inline colour-picker's drag / hex / RGB
// inputs) and the change-event handler (typed values in the swatch
// row). Solid fills preserve the existing alpha so a swatch swap from
// the picker doesn't silently zero the opacity field next to it;
// gradient stops update in place and re-build the gradient string.
function applyFillColorProperty(prop: string, value: string) {
  const id = info?.id || '';
  if (!id) return;
  const layers = getFillLayers(id, info?.computedStyles || {});
  let m = prop.match(/^__fill_color__(\d+)$/);
  if (m) {
    const i = parseInt(m[1], 10);
    if (layers[i] && layers[i].kind === 'solid') {
      const { opacity } = splitColorOpacity(layers[i].raw);
      layers[i].raw = combineColorOpacity(value, opacity);
      fillLayersByElement.set(id, layers);
      dispatchFillLayers(layers, applyStyle);
    }
    return;
  }
  m = prop.match(/^__fill_stop_color__(\d+)_(\d+)$/);
  if (m) {
    const i = parseInt(m[1], 10);
    const sIdx = parseInt(m[2], 10);
    const layer = layers[i];
    if (layer && (layer.kind === 'linear' || layer.kind === 'radial' || layer.kind === 'conic')) {
      const parsed = parseGradientStops(layer.raw);
      if (parsed.stops[sIdx]) {
        parsed.stops[sIdx].color = value;
        layer.raw = buildGradient(layer.kind, parsed.prefix, parsed.stops);
        fillLayersByElement.set(id, layers);
        dispatchFillLayers(layers, applyStyle);
      }
    }
    return;
  }
}

// Per-layer stroke edits (`__stroke_color__N` / `__stroke_weight__N`).
// Each row in the Outside / Inside layered list owns one virtual-prop
// pair scoped to its layer index; this routes through the in-memory
// stash so the picker drag, the colour-code input, and the weight
// stepper all converge on the same dispatch.
function applyStrokeLayerProperty(prop: string, value: string) {
  const id = info?.id || '';
  if (!id) return;
  const s = info?.computedStyles || {};
  const pos = getStrokeActiveTab(id, s);
  if (pos === 'center') return; // center is single-stroke; primary row handles it
  const m = prop.match(/^__stroke_(color|weight)__(\d+)$/);
  if (!m) return;
  const field = m[1] as 'color' | 'weight';
  const idx = parseInt(m[2], 10);
  const layers = getStrokeLayers(id, s, pos);
  if (idx < 0 || idx >= layers.length) return;
  if (field === 'color') {
    layers[idx].color = value;
  } else {
    const num = parseFloat(value);
    layers[idx].weight = !isFinite(num) || num < 0 ? 0 : num;
  }
  setStrokeLayers(id, pos, layers);
  const intent = strokeStyleByElement.get(id);
  const styleNow = intent || (s.borderTopStyle && s.borderTopStyle !== 'none' ? s.borderTopStyle : 'solid');
  const batch: Array<{ property: string; value: string }> = [];
  dispatchStrokeLayers(layers, pos, s, (p, v) => batch.push({ property: p, value: v }), styleNow);
  applyStylesBatch(batch, field === 'color' ? 'Stroke colour' : 'Stroke weight');
}

// Per-layer Layout Guide edit. Routes virtual `__guide_<field>__N`
// props through the in-memory stash, then pushes the full layer array
// to content via dispatchLayoutGuides for the overlay paint. Never
// hits the change-tracker — layout guides are a session-only design
// aid, not a CSS edit.
function applyLayoutGuideProperty(prop: string, value: string) {
  const id = info?.id || '';
  if (!id) return;
  const m = prop.match(/^__guide_(kind|count|color|opacity|align|size|margin|gutter)__(\d+)$/);
  if (!m) return;
  const field = m[1];
  const idx = parseInt(m[2], 10);
  const layers = getLayoutGuides(id).slice();
  if (idx < 0 || idx >= layers.length) return;
  const layer = { ...layers[idx] };
  switch (field) {
    case 'kind':
      layer.kind = (value as LayoutGuideKind);
      // Reset align to a kind-appropriate default if the current value
      // no longer makes sense (e.g. 'top' was selected, user flipped to
      // columns — drop back to 'stretch').
      if (layer.kind === 'columns' && !['stretch','left','center','right'].includes(layer.align)) layer.align = 'stretch';
      if (layer.kind === 'rows' && !['stretch','top','center','bottom'].includes(layer.align)) layer.align = 'stretch';
      break;
    case 'count': {
      const n = parseInt(value, 10);
      layer.count = !isFinite(n) || n < 1 ? 1 : Math.min(50, n);
      break;
    }
    case 'color':
      layer.color = value;
      break;
    case 'opacity': {
      const n = parseFloat(value);
      layer.opacity = !isFinite(n) ? 10 : Math.max(0, Math.min(100, n));
      break;
    }
    case 'align':
      layer.align = (value as LayoutGuideAlign);
      break;
    case 'size':
    case 'margin':
    case 'gutter':
      (layer as any)[field] = value;
      break;
  }
  layers[idx] = layer;
  setLayoutGuides(id, layers);
  dispatchLayoutGuides(id, layers);
  render();
}

// Map the stroke section's virtual props to actual CSS targets. With the
// layered model, color / weight mutate the active layer and dispatch via
// `dispatchStrokeLayers` (which picks the right CSS path: border-* for
// Outside-single, box-shadow chain for Inside or Outside-multi, outline-*
// for Center). Style stays uniform across the chain (CSS limitation).
function applyStrokeProperty(prop: string, value: string) {
  const s = info?.computedStyles || {};
  const id = info?.id || '';
  const pos = getStrokeActiveTab(id, s);

  // Determine the current style keyword (used by the dispatcher to write
  // border-*-style / outline-style / etc.). Reads the in-memory intent map
  // first so dashed/dotted intent is preserved across mode switches.
  const intentStyle = id ? strokeStyleByElement.get(id) : undefined;
  const cssStyleNow = pos === 'center'
    ? (s.outlineStyle && s.outlineStyle !== 'none' ? s.outlineStyle : 'solid')
    : (s.borderTopStyle && s.borderTopStyle !== 'none' ? s.borderTopStyle : 'solid');
  const styleNow = intentStyle || cssStyleNow;

  if (prop === '__stroke_color' || prop === '__stroke_weight') {
    if (!id) return;
    const layers = getStrokeLayers(id, s, pos);
    // Seed a layer if the list is empty (e.g. Outside with no border yet
    // — first edit of color/weight implies the user wants a stroke).
    if (layers.length === 0) {
      layers.push({ weight: 1, color: '#000000', visible: true });
    }
    const idx = Math.min(activeStrokeIdx, layers.length - 1);
    if (prop === '__stroke_color') {
      layers[idx].color = value;
    } else {
      const num = parseFloat(value);
      layers[idx].weight = !isFinite(num) || num < 0 ? 0 : num;
    }
    setStrokeLayers(id, pos, layers);
    // Collect dispatchStrokeLayers' fan-out into a batch instead of
    // firing N individual SP_APPLY_STYLE messages. Changing one Weight
    // value fans out to 4 border-*-width + 4 colour + 4 style + 1 box-
    // shadow = 13 writes; the unbatched path made the per-side fields
    // visibly tear (each one updating on its own render) and that's
    // the "width field isn't following the weight value" symptom.
    const batch: Array<{ property: string; value: string }> = [];
    const collect = (p: string, v: string) => batch.push({ property: p, value: v });
    dispatchStrokeLayers(layers, pos, s, collect, styleNow);
    applyStylesBatch(batch, prop === '__stroke_color' ? 'Stroke colour' : 'Stroke weight');
    return;
  }

  if (prop === '__stroke_style') {
    // 'auto' is outline-only (browser-native focus ring). When the user
    // picks it from the dropdown, switch mode to Center automatically.
    if (value === 'auto' && pos !== 'center') {
      applyStrokePosition('center');
      // Defer the auto write so it lands after the mode switch.
      setTimeout(() => applyStyle('outlineStyle', 'auto'), 0);
      return;
    }
    // Track user's intent regardless of mode so the dashed panel toggles
    // correctly. Only Center mode writes a CSS style (outline-style);
    // Outside and Inside both render via box-shadow which CSS only
    // paints solid, so the keyword is captured for codegen / tokens but
    // not pushed to CSS.
    if (id) strokeStyleByElement.set(id, value as 'solid' | 'dashed');
    if (pos === 'center') {
      applyStyle('outlineStyle', value);
    } else {
      render();
    }
    return;
  }
}

// Pragmatic mapping for Figma's Position-section alignment buttons.
// Flex/grid parents → align-self / justify-self.
// Block parent      → margin-left/right auto for horizontal centering.
// Absolute/fixed    → top/left + translate shortcuts on the element itself.
function applyPositionAlign(which: string, ctx: { isFlex: boolean; isGrid: boolean; isAbs: boolean }) {
  const isFlexLike = ctx.isFlex || ctx.isGrid;
  if (which === 'h-left') {
    if (isFlexLike) applyStyle('justifySelf', 'start');
    else if (ctx.isAbs) { applyStyle('left', '0px'); applyStyle('right', 'auto'); applyStyle('translate', '0px 0px'); }
    else { applyStyle('marginLeft', '0px'); applyStyle('marginRight', 'auto'); }
  } else if (which === 'h-center') {
    if (isFlexLike) applyStyle('justifySelf', 'center');
    else if (ctx.isAbs) { applyStyle('left', '50%'); applyStyle('right', 'auto'); applyStyle('translate', '-50% 0px'); }
    else { applyStyle('marginLeft', 'auto'); applyStyle('marginRight', 'auto'); }
  } else if (which === 'h-right') {
    if (isFlexLike) applyStyle('justifySelf', 'end');
    else if (ctx.isAbs) { applyStyle('left', 'auto'); applyStyle('right', '0px'); applyStyle('translate', '0px 0px'); }
    else { applyStyle('marginLeft', 'auto'); applyStyle('marginRight', '0px'); }
  } else if (which === 'v-top') {
    if (isFlexLike) applyStyle('alignSelf', 'start');
    else if (ctx.isAbs) { applyStyle('top', '0px'); applyStyle('bottom', 'auto'); }
  } else if (which === 'v-middle') {
    if (isFlexLike) applyStyle('alignSelf', 'center');
    else if (ctx.isAbs) { applyStyle('top', '50%'); applyStyle('bottom', 'auto'); applyStyle('translate', '-50% -50%'); }
  } else if (which === 'v-bottom') {
    if (isFlexLike) applyStyle('alignSelf', 'end');
    else if (ctx.isAbs) { applyStyle('top', 'auto'); applyStyle('bottom', '0px'); }
  }
}

// Pragmatic CSS mapping for Figma's Stroke position selector. Single
// stroke per element. Border-* longhands store the user's intent (color,
// per-side widths, style) regardless of mode; Inside/Center add a
// synthesized visual (inset shadow / outline) on top, hiding the border
// itself. Outside leaves the native border visible.
// Tab switching is now a pure panel-state toggle. We don't write CSS —
// each position is an independent CSS family (border-* / box-shadow
// non-inset / box-shadow inset / outline-*) and they coexist on the
// page. Switching tabs just changes which one the editor surfaces.
// The strokes you set in other tabs keep painting; come back and the
// stash + CSS are exactly where you left them.
function applyStrokePosition(pos: StrokePos) {
  const elementId = info?.id || '';
  if (!elementId) return;
  if (strokeActiveTab.get(elementId) === pos) return;
  strokeActiveTab.set(elementId, pos);
  activeStrokeIdx = 0;
  render();
}
async function applyText(text: string) { const res = await send({ type: 'SP_SET_TEXT', text }); if (res.info) info = res.info; if (res.styleChanges) styleChanges = res.styleChanges; if (res.textChanges) textChanges = res.textChanges; if (res.domChanges) domChanges = res.domChanges; if (res.undoCount != null) undoCount = res.undoCount; if (res.redoCount != null) redoCount = res.redoCount; render(); }
async function applyHtml(html: string) { const res = await send({ type: 'SP_SET_HTML', html }); if (res.info) info = res.info; if (res.styleChanges) styleChanges = res.styleChanges; if (res.textChanges) textChanges = res.textChanges; if (res.domChanges) domChanges = res.domChanges; if (res.undoCount != null) undoCount = res.undoCount; if (res.redoCount != null) redoCount = res.redoCount; render(); }
async function domAction(action: string) { const res = await send({ type: 'SP_DOM_ACTION', action }); if (res.info) info = res.info; else if (action === 'delete' || action === 'cut') info = null; if (res.styleChanges) styleChanges = res.styleChanges; if (res.textChanges) textChanges = res.textChanges; if (res.domChanges) domChanges = res.domChanges; if (res.comments) comments = res.comments; undoCount = res.undoCount ?? undoCount; redoCount = res.redoCount ?? redoCount; render(); await refreshDomTree(); await refreshChanges(); }
async function selectElement(elementId: string) {
  const res = await send({ type: 'SP_SELECT_ELEMENT', elementId });
  if (res.payload || res.info) info = res.payload || res.info;
  hydrateLayoutGuidesFromPayload(info);
  hoverInfo = null; render();
  setTimeout(() => {
    const layerEl = root.querySelector('[data-dm-layer="' + elementId + '"]');
    if (layerEl) layerEl.scrollIntoView({ block: 'nearest' });
  }, 60);
}

// Push the panel's intended multi-select set to the content script so the
// page-side overlays and the APPLY_STYLE fan-out stay in sync. An empty
// array deactivates multi-select mode.
async function pushMultiSelectIds(ids: string[]) {
  multiSelectIds = ids;
  multiSelectActive = ids.length > 0;
  await send({ type: 'SP_SET_MULTI_SELECT_IDS', ids });
}

// Modifier-driven layer click dispatcher. Plain click is single-select,
// Cmd/Ctrl+click toggles in the multi-select set, Shift+click extends a
// range from the anchor. The clicked layer always becomes the focused
// element (its properties show in the Design tab) regardless of the
// modifier, so users can fan an edit out while keeping the row they
// just clicked as the "primary" target.
async function handleLayerClick(id: string, e: MouseEvent) {
  const isShift = !!e.shiftKey;
  const isToggle = !isShift && (e.metaKey || e.ctrlKey);
  if (isShift && multiSelectAnchor) {
    const visible = getVisibleLayers();
    const ai = visible.findIndex(n => n.id === multiSelectAnchor);
    const bi = visible.findIndex(n => n.id === id);
    if (ai !== -1 && bi !== -1) {
      const [start, end] = ai <= bi ? [ai, bi] : [bi, ai];
      const rangeIds = visible.slice(start, end + 1).map(n => n.id);
      const merged = Array.from(new Set([...multiSelectIds, ...rangeIds]));
      await pushMultiSelectIds(merged);
      await selectElement(id);
      return;
    }
    // No anchor / one of the endpoints missing — fall through to a
    // plain single-select rather than no-op'ing.
  }
  if (isToggle) {
    const set = new Set(multiSelectIds);
    if (set.has(id)) {
      set.delete(id);
    } else {
      // First cmd-click on an empty set seeds with the existing anchor
      // so the previously focused layer is part of the group too.
      if (set.size === 0 && multiSelectAnchor && multiSelectAnchor !== id) {
        set.add(multiSelectAnchor);
      }
      set.add(id);
    }
    await pushMultiSelectIds(Array.from(set));
    await selectElement(id);
    return;
  }
  // Plain click: drop any existing multi-select, set anchor, focus.
  multiSelectAnchor = id;
  if (multiSelectIds.length > 0) await pushMultiSelectIds([]);
  await selectElement(id);
}
async function selectParent() { const res = await send({ type: 'SP_SELECT_PARENT' }); if (res.payload || res.info) info = res.payload || res.info; hydrateLayoutGuidesFromPayload(info); render(); }
async function selectChild() { const res = await send({ type: 'SP_SELECT_CHILD' }); if (res.payload || res.info) info = res.payload || res.info; hydrateLayoutGuidesFromPayload(info); render(); }
async function undoAction() { const res = await send({ type: 'SP_UNDO' }); if (res.styleChanges) styleChanges = res.styleChanges; if (res.textChanges) textChanges = res.textChanges; if (res.domChanges) domChanges = res.domChanges; if (res.comments) comments = res.comments; if (res.info) info = res.info; undoCount = res.undoCount ?? Math.max(0, undoCount - 1); redoCount = res.redoCount ?? redoCount + 1; render(); await refreshDomTree(); await refreshChanges(); }
async function redoAction() { const res = await send({ type: 'SP_REDO' }); if (res.styleChanges) styleChanges = res.styleChanges; if (res.textChanges) textChanges = res.textChanges; if (res.domChanges) domChanges = res.domChanges; if (res.comments) comments = res.comments; if (res.info) info = res.info; undoCount = res.undoCount ?? undoCount + 1; redoCount = res.redoCount ?? Math.max(0, redoCount - 1); render(); await refreshDomTree(); await refreshChanges(); }
async function moveLayer(dir: 'up' | 'down') { const res = await send({ type: 'SP_DOM_ACTION', action: 'move-' + dir }); if (res.domChanges) domChanges = res.domChanges; await refreshDomTree(); }
async function downloadMedia() {
  if (!mediaInfo) return;
  const m = mediaInfo;
  try {
    if (m.kind === 'svg' && m.markup) {
      const blob = new Blob([m.markup], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = m.filename || 'icon.svg'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }
    const resp = await fetch(m.src);
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = m.filename || (m.kind + '-' + Date.now()); a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (err) {
    console.error('[DM] Media download failed:', err);
    const a = document.createElement('a'); a.href = m.src; a.download = m.filename || ''; a.target = '_blank'; a.click();
  }
}
async function copySvgMarkup() {
  if (mediaInfo?.markup) {
    try { await navigator.clipboard.writeText(mediaInfo.markup); } catch {}
  }
}
function showCaptureToast(kind: 'success' | 'error', text: string) {
  captureToast = { kind, text };
  if (captureToastTimer) clearTimeout(captureToastTimer);
  captureToastTimer = setTimeout(() => { captureToast = null; render(); }, 2400);
  render();
}

async function takeScreenshot() {
  // The panel auto-selects <body> as the "Page" context, which isn't a real
  // selection — capture the current viewport (no scroll) rather than crop+scroll
  // to body. Only a real element selection takes the element-crop path.
  const isPage = !info || classifyTag((info.tagName || '').toLowerCase()) === 'page';
  const target = isPage ? 'viewport' : 'element';
  const res = await send({ type: 'SP_SCREENSHOT', target });
  if (!res.dataUrl) { showCaptureToast('error', 'Capture failed'); return; }
  const filename = target + '-' + Date.now() + '.png';
  const wantClipboard = captureMode === 'clipboard' || captureMode === 'both';
  const wantDownload = captureMode === 'download' || captureMode === 'both';
  let clipboardOk = !wantClipboard;
  let downloadOk = !wantDownload;
  if (wantClipboard) {
    try {
      const resp = await fetch(res.dataUrl);
      const blob = await resp.blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      clipboardOk = true;
    } catch (err) {
      console.warn('[DM] Clipboard write failed', err);
      clipboardOk = false;
    }
  }
  if (wantDownload) {
    try {
      const a = document.createElement('a');
      a.href = res.dataUrl; a.download = filename; a.click();
      downloadOk = true;
    } catch { downloadOk = false; }
  }
  const btn = root.querySelector('[data-dm-action="screenshot"]');
  if (btn && (clipboardOk || downloadOk)) { btn.innerHTML = icon('check', 14); setTimeout(() => render(), 1200); }
  if (clipboardOk && downloadOk && wantClipboard && wantDownload) showCaptureToast('success', 'Copied & saved as ' + filename);
  else if (clipboardOk && wantClipboard) showCaptureToast('success', 'Copied to clipboard');
  else if (downloadOk && wantDownload) showCaptureToast('success', 'Saved as ' + filename);
  else showCaptureToast('error', 'Capture failed');
}
async function submitComment() {
  const text = commentText.trim(); if (!text) return;
  if (editingCommentId) { await send({ type: 'SP_REMOVE_CHANGE', changeId: 'comment-' + editingCommentId }); editingCommentId = null; }
  if (regionCommentPending) { await send({ type: 'SP_ADD_REGION_COMMENT', text }); regionCommentPending = false; }
  else await send({ type: 'SP_ADD_COMMENT', text });
  commentMode = false; commentText = ''; await refreshChanges();
}
function cancelComment() {
  // If we're composing for a freshly-drawn region, drop it on the content side.
  if (regionCommentPending) { void send({ type: 'SP_CANCEL_REGION_COMMENT' }); }
  commentMode = false; commentText = ''; editingCommentId = null; viewingCommentId = null;
  commentDirty = false; regionCommentPending = false; awaitingRegionDraw = false; render();
}
function startComment() { if (!info) return; commentMode = true; commentText = ''; editingCommentId = null; viewingCommentId = null; commentDirty = false; render(); }
// Region comment: ask the content script to enter draw mode. The composer
// opens later, when the REGION_DRAWN message arrives.
function startRegionComment() {
  if (awaitingRegionDraw) { awaitingRegionDraw = false; void send({ type: 'SP_CANCEL_REGION_COMMENT' }); render(); return; }
  commentMode = false; regionCommentPending = false; awaitingRegionDraw = true;
  void send({ type: 'SP_START_REGION_COMMENT' });
  render();
}
function editComment(comment: CommentEntry) { commentMode = true; commentText = comment.text; editingCommentId = comment.id; viewingCommentId = null; commentDirty = false; render(); }
async function deleteCommentEntry(commentId: string) { await send({ type: 'SP_REMOVE_CHANGE', changeId: 'comment-' + commentId }); comments = comments.filter(c => c.id !== commentId); render(); }
async function removeChange(changeId: string) { styleChanges = styleChanges.filter(c => (c.id || 'style-' + styleChanges.indexOf(c)) !== changeId); textChanges = textChanges.filter(c => c.id !== changeId); domChanges = domChanges.filter(c => (c.id || 'dom-' + c.action) !== changeId); batchAppliedChanges.delete(changeId); render(); await send({ type: 'SP_REMOVE_CHANGE', changeId }); await refreshChanges(); await refreshDomTree(); await refreshState(); }
async function clearAllChanges() { await send({ type: 'SP_CLEAR_CHANGES' }); styleChanges = []; textChanges = []; domChanges = []; comments = []; tokenChanges = []; editedTokens.clear(); batchAppliedChanges.clear(); render(); }

// Tiny markdown-ish renderer for comment bodies. Supports inline code,
// bold (`**text**`), italic (`*text*`), links (`[text](url)`), and
// newlines. Escapes the input before substituting so nothing the user
// types can become HTML directly.
function renderCommentMarkdown(s: string): string {
  let h = escapeAttr(s);
  // Inline code first so its delimiters can't be eaten by bold / italic.
  h = h.replace(/`([^`]+)`/g, '<code style="font-family:SF Mono,Monaco,monospace;background:rgba(0,0,0,0.06);padding:1px 4px;border-radius:3px;font-size:0.9em;">$1</code>');
  // Bold then italic. The italic regex skips over the `**` markers we
  // just inserted by requiring a non-`*` before the opening `*`.
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  // Markdown link — only allow http(s) or root-relative URLs.
  h = h.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:var(--dm-accent);">$1</a>');
  // Bare URL → link.
  h = h.replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer" style="color:var(--dm-accent);">$2</a>');
  // Preserve line breaks.
  h = h.replace(/\n/g, '<br/>');
  return h;
}

// Revert every change in a single group (one element). The group key is
// either the element id or, when the tracker couldn't capture one, the
// selector — match against the same fallback the renderer uses.
async function revertGroup(groupKey: string) {
  const inGroup = (c: { elementId?: string; selector?: string }) =>
    (c.elementId || c.selector || 'unknown') === groupKey;
  const styleIds = styleChanges.filter(inGroup).map((c, i) => c.id || 'style-' + styleChanges.indexOf(c));
  const textIds  = textChanges.filter(inGroup).map(c => c.id);
  const domIds   = domChanges.filter(inGroup).map(c => c.id || 'dom-' + c.action);
  // Drop comments locally — comments live in their own collection. We
  // remove them along with the rest of the group for visual consistency.
  comments = comments.filter(c => (c as any).elementId !== groupKey && (c as any).selector !== groupKey);
  // Remove styles / text / dom via the existing per-change path so undo
  // / redo / overlay cleanup all flow through the tracker.
  for (const id of [...styleIds, ...textIds, ...domIds]) {
    await send({ type: 'SP_REMOVE_CHANGE', changeId: id });
  }
  styleChanges = styleChanges.filter(c => !inGroup(c));
  textChanges  = textChanges.filter(c => !inGroup(c));
  domChanges   = domChanges.filter(c => !inGroup(c));
  for (const id of [...styleIds, ...textIds, ...domIds]) batchAppliedChanges.delete(id);
  // Token edits live under the synthetic ':root' group — reset each via the
  // root-var path so the page repaints and the prompt drops them too.
  if (groupKey === ':root') {
    for (const t of tokenChanges) { editedTokens.delete(tokenEditKey(t.scopeSelector || ':root', t.cssVar)); await send({ type: 'SP_RESET_ROOT_VAR', cssVar: t.cssVar, scopeSelector: t.scopeSelector || ':root' }); }
    tokenChanges = [];
    designSystem = null;
  }
  render();
  await refreshChanges();
  await refreshState();
}

async function copyPrompt() { const res = await send({ type: 'SP_EXPORT', format: 'markdown' }); const output = res.output || res.markdown || ''; if (output) { await navigator.clipboard.writeText(output); const btn = root.querySelector('#dm-copy-prompt-btn'); if (btn) { btn.textContent = 'Copied!'; setTimeout(() => render(), 1500); } } }
async function sendToAgent() {
  await refreshMcpStatus();
  if (mcpState !== 'connected') { sendAgentHelpOpen = true; render(); return; }
  const res = await send({ type: 'SP_SEND_TO_AGENT' });
  if (res?.ok) {
    const btn = root.querySelector('#dm-send-agent-btn');
    if (btn) { (btn as HTMLElement).textContent = 'Sent!'; setTimeout(() => render(), 1500); }
    showCaptureToast('success', 'Staged for your agent — run /design-mode to implement.');
  } else {
    showCaptureToast('error', 'Could not reach the agent — check the MCP status and retry.');
  }
}
function toggleTheme() { if (theme === 'system') theme = resolvedTheme === 'dark' ? 'light' : 'dark'; else if (theme === 'dark') theme = 'light'; else theme = 'dark'; resolveTheme(); chrome.storage?.local?.set?.({ 'dm-theme': theme }); render(); }

/* ── Select matching layers ── */
async function toggleMatchingLayers(next: boolean) {
  matchingLayersChecked = next;
  if (!next) { await pushMultiSelectIds([]); render(); return; }
  if (!info) { matchingLayersChecked = false; return; }
  const res = await send({ type: 'SP_FIND_MATCHING', elementId: info.id });
  const ids: string[] = Array.isArray(res?.ids) ? res.ids : [];
  if (ids.length >= 2) {
    await pushMultiSelectIds(ids);
    showCaptureToast('success', 'Editing ' + ids.length + ' matching layers — changes apply to all.');
  } else {
    matchingLayersChecked = false;
    showCaptureToast('error', 'No other matching layers on this page.');
  }
  render();
}
// Click on a compact comment row in the changes tab. We expand the row
// inline (the same "viewing" card the page-pin click triggers) so the
// user sees Resolve / Edit / Delete in one place. Clicking the same row
// again collapses it. Selects the element on the page as a side effect
// so the user can see what the comment is about.
function scrollToComment(comment: CommentEntry) {
  if (viewingCommentId === comment.id) {
    viewingCommentId = null;
  } else {
    viewingCommentId = comment.id;
    editingCommentId = null;
    commentMode = false;
  }
  send({ type: 'SP_SELECT_ELEMENT', elementId: comment.elementId });
  render();
}
async function toggleLayerVisibility(layerId: string) { await send({ type: 'SP_TOGGLE_VISIBILITY', elementId: layerId }); await refreshDomTree(); }
async function deleteLayer(layerId: string) { await send({ type: 'SP_DOM_ACTION', action: 'delete', elementId: layerId }); if (info?.id === layerId) info = null; await refreshDomTree(); await refreshChanges(); }
async function duplicateLayer(layerId: string) { await send({ type: 'SP_DOM_ACTION', action: 'duplicate', elementId: layerId }); await refreshDomTree(); await refreshChanges(); }
async function reorderLayer(sourceId: string, targetId: string, position: 'before' | 'after' | 'inside' = 'before') {
  await send({ type: 'SP_REORDER_LAYER', sourceId, targetId, position });
  await refreshDomTree();
  await refreshChanges();
}

// Walk parent ids up the visible tree until we hit either `ancestorId` or
// the root. Returns true if `ancestorId` is an ancestor of `descendantId`
// (or equal). Used to reject drag-and-drop where the target is inside the
// element being dragged — that would orphan the page subtree.
function isLayerAncestor(ancestorId: string, descendantId: string): boolean {
  if (!ancestorId || !descendantId) return false;
  if (ancestorId === descendantId) return true;
  const map = new Map(domTree.map(n => [n.id, n] as const));
  let cursor = map.get(descendantId);
  while (cursor) {
    if (cursor.id === ancestorId) return true;
    cursor = cursor.parentId ? map.get(cursor.parentId) : undefined;
  }
  return false;
}

// Decide which of the three drop zones the cursor is in. Top sliver →
// before-sibling, middle → drop INTO target as last child (indent),
// bottom sliver → after-sibling. Sliver size scales with row height so
// thin layer rows still get a reachable middle zone.
function dropZoneAt(target: HTMLElement, clientY: number): 'before' | 'inside' | 'after' {
  const rect = target.getBoundingClientRect();
  const sliver = Math.min(8, rect.height * 0.28);
  if (clientY < rect.top + sliver) return 'before';
  if (clientY > rect.bottom - sliver) return 'after';
  return 'inside';
}

/* ── Message handling ── */
chrome.runtime.onMessage.addListener((msg) => {
  // Content scripts broadcast to every panel context. Ignore broadcasts from
  // a tab this surface isn't bound to (multiple side panels / floating windows
  // can be open at once). Messages without `_dmTab` (or before we know our
  // tab) pass through.
  if (msg && msg._dmTab != null && myTabId != null && msg._dmTab !== myTabId) return;

  // Region draw finished on the page — open the comment composer for it.
  if (msg.type === 'REGION_DRAWN') {
    awaitingRegionDraw = false; regionCommentPending = true;
    commentMode = true; commentText = ''; editingCommentId = null;
    viewingCommentId = null; commentDirty = false; render();
    return;
  }
  if (msg.type === 'REGION_CANCELLED') {
    awaitingRegionDraw = false; regionCommentPending = false;
    if (commentMode) { commentMode = false; commentText = ''; }
    render();
    return;
  }
  if (msg.type === 'ELEMENT_SELECTED') {
    // Clear a lingering Motion preview: the forced `.dm-force-*` class was
    // applied to the previously-selected element and must come off when the
    // selection moves, or it stays stuck in that state on the page.
    if (motionForcedTrigger && info?.id) {
      send({ type: 'SP_FORCE_STATE', elementId: info.id, state: MOTION_TRIGGER_STATE[motionForcedTrigger] || '', on: false });
      motionForcedTrigger = null;
    }
    info = msg.payload; hoverInfo = null; commentMode = false;
    hydrateLayoutGuidesFromPayload(info);
    contrastSettingsOpen = false;
    tokenBadgeMenuProp = null;
    tokenPickerProp = null;
    effectiveBgCache.clear();
    maybeFetchEffectiveBg();
    // Covers pages that hydrated after INIT_STATE fired (SPA nav): without
    // the token cache the badges and swap pickers have nothing to offer.
    if (designTokens.length === 0) refreshDesignTokens();
    // Matching-layers selection is per-element — reset for the new one.
    matchingLayersChecked = false;
    render();
    refreshMedia();
    setTimeout(() => {
      const layerEl = root.querySelector('[data-dm-layer="' + info?.id + '"]');
      if (layerEl) layerEl.scrollIntoView({ block: 'nearest' });
    }, 60);
  }
  if (msg.type === 'ELEMENT_HOVERED_INFO') {
    // If an element is selected, ignore hover updates (a stale 100ms-debounced hover
    // info can arrive after a click; this guard prevents it from polluting state).
    if (info && msg.payload) return;
    hoverInfo = msg.payload;
    if (tab === 'design' && !info) render();
  }
  // Live dimensions streamed while a resize handle is dragged on the page.
  // Patch the selected element's computed W/H so the Design tab's size fields
  // tick along; the full ELEMENT_SELECTED roundtrip settles state on mouseup.
  if (msg.type === 'LIVE_RESIZE') {
    if (!info || info.id !== msg.elementId || !info.computedStyles) return;
    if (msg.width) info.computedStyles.width = msg.width;
    if (msg.height) info.computedStyles.height = msg.height;
    if (tab === 'design') render();
  }
  // Live left/top streamed while the selected element's body is dragged.
  // Patch the panel's X/Y fields — plus `position` on the first frame after
  // a static-element auto-promotion, otherwise the offset row would stay
  // hidden mid-drag (`offsetActive` gates on position !== 'static').
  if (msg.type === 'LIVE_MOVE') {
    if (!info || info.id !== msg.elementId || !info.computedStyles) return;
    if (msg.position) info.computedStyles.position = msg.position;
    if (msg.left) info.computedStyles.left = msg.left;
    if (msg.top) info.computedStyles.top = msg.top;
    if (tab === 'design') render();
  }
  if (msg.type === 'COMMENT_BUBBLE_CLICKED') {
    const c = comments.find(cc => cc.id === msg.commentId);
    if (c) { tab = 'changes'; viewingCommentId = msg.commentId; editingCommentId = null; commentMode = false; render(); }
  }
  // Alt+A on the page: open the comment add field for the focused layer.
  // Mirrors the side-panel comment button (action row) so the keyboard
  // shortcut and the click both land in the same flow.
  if (msg.type === 'OPEN_COMMENT_FOR_SELECTED') {
    if (!info) return;
    startComment();
    setTimeout(() => {
      const ta = root.querySelector<HTMLTextAreaElement>('[data-dm-comment-input]');
      if (ta) ta.focus();
    }, 30);
  }
  // Alt+1 / Alt+2 / Alt+3 from the page-side shortcut layer. We mirror
  // the tab-click handler's side effects (scroll restore for the
  // destination tab) by setting `pendingTabScrollRestore` before the
  // re-render — same pattern the user's mouse-click tab switch uses.
  if (msg.type === 'SWITCH_TAB') {
    const requested = msg.tab as Tab | undefined;
    if (requested && (requested === 'layers' || requested === 'design' || requested === 'changes') && tab !== requested) {
      captureTabScroll();
      pendingTabScrollRestore = tabScrollPositions[requested] ?? { top: 0, left: 0 };
      tab = requested;
      render();
    }
  }
  if (msg.type === 'STATE_UPDATE') {
    // Only a live content script sends this, so the page is reachable.
    fileAccessBlocked = false;
    enabled = msg.enabled ?? enabled;
    inspecting = msg.inspecting ?? inspecting;
    undoCount = msg.undoCount ?? undoCount;
    redoCount = msg.redoCount ?? redoCount;
    if (msg.multiSelect !== undefined) multiSelectActive = !!msg.multiSelect;
    if (msg.multiSelectIds) multiSelectIds = msg.multiSelectIds;
    if (msg.frozen !== undefined) animationsFrozen = !!msg.frozen;
    // STATE_UPDATE fires ~1s after the content script's enable() —
    // including after every page reload while the panel is open.
    // Re-push the panel's session-memory guides so the overlay paints
    // again on the fresh page. If the panel was closed during the
    // reload, this branch never runs and the page stays clean.
    restoreLayoutGuidesAfterReload();
    render();
  }
  if (msg.type === 'MULTI_SELECT_UPDATE') {
    multiSelectIds = msg.payload?.ids || [];
    multiSelectActive = multiSelectIds.length > 0;
    render();
  }
  if (msg.type === 'CHANGES_UPDATE') { styleChanges = msg.styleChanges || styleChanges; textChanges = msg.textChanges || textChanges; domChanges = msg.domChanges || domChanges; comments = msg.comments || comments; tokenChanges = msg.tokenChanges || tokenChanges; render(); }
  if (msg.type === 'AGENT_PRESENCE_UPDATE') {
    // Transport state is implicit from current mcpState — if we were
    // 'offline' an AGENT_PRESENCE_UPDATE shouldn't suddenly say
    // connected, so guard on the existing state.
    if (mcpState === 'offline') return;
    mcpState = msg.connected ? 'connected' : 'running';
    render();
  }
});

/* ── Phase 2: Tag icon mapping ── */
const TAG_ICON_MAP: Record<string, keyof typeof icons> = {
  div: 'layoutGrid', span: 'type', p: 'type',
  h1: 'type', h2: 'type', h3: 'type', h4: 'type', h5: 'type', h6: 'type',
  a: 'externalLink', img: 'image', button: 'box',
  input: 'pencil', textarea: 'pencil', select: 'sliders',
  form: 'fileText', label: 'type',
  ul: 'layers', ol: 'layers', li: 'minus',
  nav: 'compass', header: 'layoutDashboard', footer: 'layoutDashboard',
  main: 'layoutDashboard', section: 'layoutDashboard', article: 'layoutDashboard', aside: 'layoutDashboard',
  table: 'layoutGrid', tr: 'minus', td: 'minus', th: 'minus',
  svg: 'penTool', canvas: 'penTool',
  video: 'play', audio: 'activity',
  iframe: 'externalLink',
  strong: 'type', em: 'type', b: 'type', i: 'type', small: 'type',
  code: 'code', pre: 'code',
  body: 'box',
};

/* ── Phase 2: Tree helpers ── */
function buildNodeMap(): Map<string, DomNode> {
  const map = new Map<string, DomNode>();
  for (const n of domTree) map.set(n.id, n);
  return map;
}

function isAncestorCollapsed(node: DomNode, nodeMap: Map<string, DomNode>): boolean {
  let pid = node.parentId;
  while (pid) {
    if (collapsedNodes.has(pid)) return true;
    pid = nodeMap.get(pid)?.parentId ?? null;
  }
  return false;
}

// Helper: does this elementId have any tracked change of any kind?
function elementHasChanges(elementId: string): boolean {
  if (!elementId) return false;
  if (styleChanges.some(c => c.elementId === elementId)) return true;
  if (textChanges.some(c => c.elementId === elementId)) return true;
  if (domChanges.some(c => c.elementId === elementId)) return true;
  if (comments.some(c => (c as any).elementId === elementId)) return true;
  return false;
}

function getVisibleLayers(): DomNode[] {
  const nodeMap = buildNodeMap();
  let filtered = domTree;

  // Layer search filter
  if (layerSearch.trim()) {
    const q = layerSearch.toLowerCase();
    const matchIds = new Set<string>();
    for (const n of domTree) {
      const name = n.componentName || n.displayName;
      if (name.toLowerCase().includes(q) || n.tagName.toLowerCase().includes(q)) {
        matchIds.add(n.id);
        // Auto-expand parents of matches
        let pid = n.parentId;
        while (pid) {
          collapsedNodes.delete(pid);
          matchIds.add(pid);
          pid = nodeMap.get(pid)?.parentId ?? null;
        }
      }
    }
    filtered = filtered.filter(n => matchIds.has(n.id));
  }

  // Visibility / state filter chips
  if (layersFilter === 'visible') {
    filtered = filtered.filter(n => n.isVisible);
  } else if (layersFilter === 'hidden') {
    filtered = filtered.filter(n => !n.isVisible);
  } else if (layersFilter === 'modified') {
    filtered = filtered.filter(n => elementHasChanges(n.id));
  }

  return filtered.filter(n => !isAncestorCollapsed(n, nodeMap));
}

// Maps each design-tab section to the CSS properties it owns. Drives the
// per-section reset button on the section header — clicking it removes
// every recorded style change whose property is in this list. Properties
// that legitimately belong to multiple sections (e.g. `gap`) are listed
// where the user is most likely to look for them.
const SECTION_PROPS: Record<string, string[]> = {
  position: [
    'position','top','right','bottom','left','zIndex',
    'translate','rotate','scale','transform','transformOrigin','transformBox',
    'perspective','perspectiveOrigin','transformStyle','backfaceVisibility',
    'insetBlockStart','insetBlockEnd','insetInlineStart','insetInlineEnd',
    'anchorName','positionAnchor','positionArea','viewTransitionName',
    'positionTryFallbacks','positionTryOrder','positionVisibility',
    'alignSelf','justifySelf',
    'marginTop','marginRight','marginBottom','marginLeft',
  ],
  layout: [
    'width','height','minWidth','maxWidth','minHeight','maxHeight','aspectRatio',
    'display','overflow','overflowX','overflowY','clipPath','boxSizing',
    'flexDirection','flexWrap','justifyContent','alignItems','alignContent',
    'flexGrow','flexShrink','flexBasis','order',
    'gap','rowGap','columnGap',
    'gridTemplateColumns','gridTemplateRows','gridTemplateAreas',
    'gridAutoColumns','gridAutoRows','gridAutoFlow',
    'gridColumn','gridRow','gridArea',
    'placeItems','placeContent','placeSelf',
    'paddingTop','paddingRight','paddingBottom','paddingLeft',
    'marginTop','marginRight','marginBottom','marginLeft',
    'marginBlockStart','marginBlockEnd','marginInlineStart','marginInlineEnd',
  ],
  appearance: [
    // Primary
    'opacity','mixBlendMode','isolation',
    'borderTopLeftRadius','borderTopRightRadius','borderBottomLeftRadius','borderBottomRightRadius','borderRadius',
    'filter','backdropFilter',
    // Visibility & cursor
    'visibility','cursor','colorScheme','forcedColorAdjust',
    // Interaction
    'pointerEvents','userSelect','appearance',
    // Form-only
    'accentColor','caretColor',
    // Clip path
    'clipPath',
    // Scrollbars
    'scrollbarWidth','scrollbarColor','scrollbarGutter',
    // Performance
    'contain','contentVisibility','willChange',
  ],
  typography: [
    // Primary controls
    'fontFamily','fontSize','fontWeight','fontStyle','color',
    'lineHeight','letterSpacing','wordSpacing','textAlign','textTransform',
    'textDecorationLine','listStyleType',
    // Decoration cluster
    'textDecorationStyle','textDecorationColor','textDecorationThickness',
    'textUnderlineOffset','textUnderlinePosition','textDecorationSkipInk',
    // Wrapping / whitespace
    'whiteSpace','textWrap','wordBreak','overflowWrap','hyphens',
    'textJustify','textAlignLast','lineBreak',
    // Layout in text
    'textIndent','tabSize','verticalAlign','textOverflow',
    'webkitLineClamp','webkitBoxOrient',
    // Direction (i18n)
    'direction','writingMode','unicodeBidi',
    // Font features
    'fontStretch','fontSizeAdjust','fontKerning','fontOpticalSizing','fontSynthesis',
    'fontVariant','fontVariantCaps','fontVariantNumeric','fontVariantLigatures','fontVariantPosition',
    'fontFeatureSettings','fontVariationSettings','textRendering',
    // List
    'listStylePosition','listStyleImage',
  ],
  fill: [
    'backgroundColor','backgroundImage','backgroundSize','backgroundRepeat',
    'backgroundPosition','backgroundAttachment','backgroundClip','backgroundOrigin',
    'backgroundBlendMode','webkitBackgroundClip','webkitTextFillColor',
    // Mask family (lives in Fill Advanced)
    'maskImage','maskMode','maskRepeat','maskPosition','maskSize',
    'maskOrigin','maskClip','maskComposite',
    // SVG paint (Fill section variant for kind=svg)
    'fill','fillOpacity','fillRule','stroke','strokeWidth','strokeOpacity',
    'strokeDasharray','strokeDashoffset','strokeLinecap','strokeLinejoin',
  ],
  stroke: [
    'borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth',
    'borderTopStyle','borderRightStyle','borderBottomStyle','borderLeftStyle',
    'borderTopColor','borderRightColor','borderBottomColor','borderLeftColor',
    'outlineWidth','outlineStyle','outlineColor','outlineOffset',
    'borderImageSource','borderImageSlice','borderImageWidth','borderImageOutset','borderImageRepeat',
  ],
  effects: [
    // Visual effects only — shadows + blurs. Motion was split out into
    // its own section / SECTION_PROPS bucket below.
    'boxShadow','textShadow','filter','backdropFilter',
  ],
  motion: [
    'transition','transitionProperty','transitionDuration','transitionTimingFunction','transitionDelay',
    'animation','animationName','animationDuration','animationTimingFunction','animationDelay',
    'animationIterationCount','animationDirection','animationFillMode','animationPlayState',
    // Transform (also in Position, but Motion is where the animated-
    // transform recipes live, so keep them here as save targets too).
    'translate','rotate','scale','transform','transformOrigin','transformBox',
    'perspective','perspectiveOrigin','transformStyle','backfaceVisibility',
    // Motion path
    'offsetPath','offsetDistance','offsetRotate','offsetAnchor','offsetPosition',
    // View Transitions
    'viewTransitionName','viewTransitionClass',
    // Scroll-driven animations (animation-timeline + named timelines)
    'animationTimeline','animationRange','animationRangeStart','animationRangeEnd',
    'scrollTimeline','scrollTimelineName','scrollTimelineAxis',
    'viewTimeline','viewTimelineName','viewTimelineAxis','viewTimelineInset',
    'timelineScope',
  ],
};

/* ── Shared render helpers ── */
function sec(title: string, iconName: keyof typeof icons, content: string, defaultOpen = true, actions = ''): string {
  const id = 'dm-sec-' + title.toLowerCase().replace(/[\s&]+/g, '-');
  const resetKey = SECTION_PROPS[title.toLowerCase()] ? title.toLowerCase() : '';
  const isOpen = sectionStates[id] !== undefined ? sectionStates[id]! : defaultOpen;
  const chevIcon = isOpen ? 'chevronDown' : 'chevronRight';
  const bodyClass = isOpen ? 'dm-section-body dm-expanded' : 'dm-section-body dm-collapsed';
  const bodyStyle = isOpen ? 'padding:0 14px 14px;max-height:2000px;' : 'padding:0 14px 0;max-height:0;';
  // Per-section reset — only show when this section has a known property
  // list AND there's at least one tracked change in that property set.
  let resetBtn = '';
  if (resetKey && SECTION_PROPS[resetKey]) {
    const propSet = new Set(SECTION_PROPS[resetKey]);
    const hasChanges = styleChanges.some(c => propSet.has(c.property));
    if (hasChanges) {
      resetBtn = '<button class="dm-section-action" data-dm-reset-section="' + escapeAttr(resetKey) + '" title="Reset ' + escapeAttr(title) + ' changes on this element" aria-label="Reset section">' + icon('rotateCcw', 11) + '</button>';
    }
  }
  // Action cluster sits between the title and the chevron. Per-section
  // header buttons (eye, +, advanced toggle) are passed in via `actions`
  // and reset is appended last so it always lives next to the chevron.
  const actionCluster = (actions || resetBtn)
    ? '<div class="dm-section-actions">' + actions + resetBtn + '</div>'
    : '';
  return '<div style="border-bottom:1px solid var(--dm-separator);">' +
    '<div class="dm-section-header" data-dm-toggle-section="' + id + '" aria-expanded="' + isOpen + '" aria-label="' + title + ' section" style="display:flex;align-items:center;gap:8px;padding:10px 14px;cursor:pointer;user-select:none;">' +
    '<span style="color:var(--dm-text-muted);display:flex;align-items:center;">' + icon(iconName, 14) + '</span>' +
    '<span style="font-size:11px;font-weight:600;color:var(--dm-text-secondary);flex:1;">' + title + '</span>' +
    actionCluster +
    '<span style="color:var(--dm-text-dim);display:flex;">' + icon(chevIcon as keyof typeof icons, 10) + '</span>' +
    '</div><div class="' + bodyClass + '" data-dm-section-body="' + id + '" style="' + bodyStyle + '">' + content + '</div></div>';
}

// Opacity input — CSS stores 0-1 but humans think in 0-100%. Shows the
// percent value with a locked `%` chip; the change handler intercepts
// `__opacity_pct`, clamps 0-100, divides by 100, and writes the real
// `opacity` property so the Changes tab records the canonical CSS
// (`opacity: 0.5`) rather than the percent presentation.
function opacityInput(value: string): string {
  const raw = parseFloat(value);
  const pct = isNaN(raw) ? 100 : Math.max(0, Math.min(100, Math.round(raw * 100)));
  return '<div class="dm-field">' +
    '<div class="dm-input-shell" title="Opacity">' +
    '<span class="dm-input-icon">' + icon('blend', 12) + '</span>' +
    '<input type="text" class="dm-input dm-input-bare" data-dm-prop="__opacity_pct" data-dm-numeric="1" data-dm-unit="" inputmode="decimal" value="' + pct + '"/>' +
    '<span class="dm-input-unit">%</span>' +
    '</div></div>';
}

// Translate a resolved CSS value to (display, displayUnit, writeUnit)
// while honouring the Settings → Input unit preference. When the preference
// is `rem` and the value is in `px`, the number is converted using the
// page's resolved rem-root font-size and the write unit becomes `rem` —
// so a user-typed edit lands in the change tracker as `rem`, not `px`.
// Non-px units (`%`, `em`, `vw`, …) pass through unchanged; they already
// carry an explicit unit and the user's px ↔ rem toggle doesn't apply.
function formatPxValueForDisplay(value: string): { display: string; unit: string; writeUnit: string } {
  const parsed = parseNumeric(value);
  if (!parsed) return { display: value, unit: 'px', writeUnit: 'px' };
  const sourceUnit = parsed.unit || 'px';
  if (sourceUnit !== 'px' || inputUnit !== 'rem') {
    return { display: String(parsed.num), unit: sourceUnit, writeUnit: sourceUnit };
  }
  const rem = parsed.num / remRootPx;
  // Round to 4 decimals, then strip trailing zeros so 16px reads as `1`
  // not `1.0000` and 24px reads as `1.5` not `1.5000`.
  const rounded = Math.round(rem * 10000) / 10000;
  const display = String(rounded);
  return { display, unit: 'rem', writeUnit: 'rem' };
}

function inp(label: string, prop: string, value: string, unit = 'px'): string {
  const badge = renderTokenBadge(prop);
  const overlays = renderTokenOverlays(prop);
  const parsed = parseNumeric(value);
  if (!parsed) {
    // Non-numeric (e.g. `auto`, `inherit`) — render raw, no unit chip.
    return '<div class="dm-field">' +
      (label ? '<label class="dm-field-label">' + label + '</label>' : '') +
      '<div class="dm-input-shell">' +
      '<input type="text" class="dm-input dm-input-bare" data-dm-prop="' + prop + '" value="' + escapeAttr(value) + '"/>' +
      badge +
      '</div>' + overlays + '</div>';
  }
  const sourceUnit = parsed.unit || unit;
  // Only apply the px ↔ rem conversion when the input is genuinely a px
  // value (the source unit matters more than the caller's hint `unit`).
  const usePxConversion = sourceUnit === 'px' && inputUnit === 'rem';
  const displayVal = usePxConversion
    ? String(Math.round((parsed.num / remRootPx) * 10000) / 10000)
    : String(parsed.num);
  const displayUnit = usePxConversion ? 'rem' : sourceUnit;
  const writeUnit = displayUnit;
  return '<div class="dm-field">' +
    (label ? '<label class="dm-field-label">' + label + '</label>' : '') +
    '<div class="dm-input-shell">' +
    '<input type="text" class="dm-input dm-input-bare" data-dm-prop="' + prop + '" data-dm-numeric="1" data-dm-unit="' + escapeAttr(writeUnit) + '" inputmode="decimal" value="' + escapeAttr(displayVal) + '"/>' +
    badge +
    '<span class="dm-input-unit">' + displayUnit + '</span>' +
    '</div>' + overlays + '</div>';
}

// Figma-style W / H input with a Fixed / Hug / Fill mode picker.
//   Fixed → user-entered number + unit (px, %, em, …).
//   Hug   → `fit-content` — the box shrinks to its children.
//   Fill  → `100%` — the box expands to its parent.
// The mode is inferred from the user's most recent override for this
// (element, property) so the dropdown reflects intent rather than the
// resolved px that getComputedStyle reports for every layout state. When
// the user has never overridden the property, the resolved value is
// shown as Fixed — the most honest default.
function inferSizeMode(value: string): 'fixed' | 'hug' | 'fill' {
  const v = (value || '').trim().toLowerCase();
  if (!v) return 'fixed';
  if (v === 'fit-content' || v === 'max-content' || v === 'min-content' || v === 'auto') return 'hug';
  if (v.startsWith('fit-content(') || v.startsWith('max-content(') || v.startsWith('min-content(')) return 'hug';
  if (v === '100%' || v === 'stretch' || v === '-webkit-fill-available') return 'fill';
  return 'fixed';
}

function lastStyleChangeFor(elementId: string, property: string): string | null {
  for (let i = styleChanges.length - 1; i >= 0; i--) {
    const c = styleChanges[i];
    if (c.elementId === elementId && c.property === property) return c.newValue;
  }
  return null;
}

// Which design token paints a property of the selected element, and the
// scope this element resolves it through — a design system declares the
// same token once per theme, so editing the wrong scope is a no-op. The
// user's own var() override (panel intent) wins over page attribution; a
// raw-value override detaches the field from its page token.
function tokenForProp(prop: string): { cssVar: string; scope: string; source: 'edit' | 'page' } | null {
  if (!info) return null;
  const tokens = info.styleTokens;
  const intent = lastStyleChangeFor(info.id, prop);
  if (intent) {
    const m = intent.match(/^var\(\s*(--[\w-]+)/);
    if (!m) return null;
    // Attribution harvests our own dm-applied-styles overrides, so once the
    // swap round-trips it already knows the scope this element resolves the
    // new token through. The primary scope is only a pre-round-trip stopgap.
    const attributed = tokens?.[prop];
    const scope = attributed?.cssVar === m[1]
      ? attributed.scope
      : designTokens.find(t => t.cssVar === m[1])?.scope.selector || ':root';
    return { cssVar: m[1], scope, source: 'edit' };
  }
  if (!tokens) return null;
  // Shorthand fields (uniform padding / margin) only badge when every
  // side is authored from the same var.
  if (prop === 'padding' || prop === 'margin') {
    const sides = ['Top', 'Right', 'Bottom', 'Left'].map(s => tokens[prop + s]);
    const first = sides[0];
    return first && sides.every(v => v?.cssVar === first.cssVar)
      ? { cssVar: first.cssVar, scope: first.scope, source: 'page' }
      : null;
  }
  const t = tokens[prop];
  return t ? { cssVar: t.cssVar, scope: t.scope, source: 'page' } : null;
}

const PROP_TOKEN_GROUPS: Array<{ re: RegExp; group: TokenGroup }> = [
  { re: /color|fill$|^stroke/i, group: 'colour' },
  { re: /^(padding|margin|gap|rowGap|columnGap|width|height)/, group: 'spacing' },
  { re: /Radius/, group: 'radius' },
  { re: /^(fontSize|fontWeight|fontFamily|lineHeight|letterSpacing)$/, group: 'typography' },
  { re: /Shadow$/i, group: 'shadow' },
];

function tokenGroupForProp(prop: string): TokenGroup {
  for (const r of PROP_TOKEN_GROUPS) if (r.re.test(prop)) return r.group;
  return 'other';
}

// The badge pill rendered inside a field's input shell. Compact mode
// (narrow numeric fields) shows the token diamond only; full mode shows
// the shortened var name. Click opens the badge menu.
function renderTokenBadge(prop: string, compact = true): string {
  const tok = tokenForProp(prop);
  if (!tok) return '';
  const short = tok.cssVar.replace(/^--(cds|mdc|md|mui|bs|p|radix)-/, '').replace(/^--/, '');
  const open = tokenBadgeMenuProp === prop || tokenPickerProp === prop;
  return '<button type="button" class="dm-token-badge' + (open ? ' dm-token-badge-open' : '') + '" data-dm-token-badge="' + escapeAttr(prop) + '" title="var(' + escapeAttr(tok.cssVar) + ')">' +
    '◆' + (compact ? '' : '<span class="dm-token-badge-name">' + escapeAttr(short) + '</span>') +
    '</button>';
}

// Swap-token dropdown for non-color groups (colors reuse the site-colour
// dropdown). Same visual pattern as renderTokensDropdown.
function renderTokenPicker(prop: string): string {
  const group = tokenGroupForProp(prop);
  const tokens = designTokens.filter(t => t.group === group);
  const current = tokenForProp(prop)?.cssVar;
  const rows = tokens.length > 0
    ? tokens.map(t => {
        const display = (t.resolvedValue || t.value).trim();
        const isCurrent = t.cssVar === current;
        return '<button data-dm-pick-token="' + escapeAttr('var(' + t.cssVar + ')') + '" data-dm-pick-prop="' + escapeAttr(prop) + '" style="width:100%;display:flex;align-items:center;gap:8px;padding:5px 8px;background:' + (isCurrent ? 'var(--dm-accent-bg)' : 'transparent') + ';border:none;cursor:pointer;text-align:left;font-family:inherit;color:var(--dm-text);">' +
          '<span style="flex:1;font-size:10px;font-family:SF Mono,Monaco,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeAttr(t.cssVar) + '</span>' +
          '<span style="font-size:9px;color:var(--dm-text-dim);font-family:SF Mono,Monaco,monospace;flex-shrink:0;max-width:90px;overflow:hidden;text-overflow:ellipsis;">' + escapeAttr(display) + '</span>' +
          '</button>';
      }).join('')
    : '<div style="padding:12px;font-size:10px;color:var(--dm-text-dim);text-align:center;">No ' + group + ' tokens on this page.</div>';
  return '<div data-dm-token-picker="' + escapeAttr(prop) + '" style="position:absolute;left:0;right:0;top:100%;margin-top:4px;z-index:40;background:var(--dm-bg);border:1px solid var(--dm-separator-strong);border-radius:6px;max-height:240px;overflow-y:auto;box-shadow:0 4px 16px rgba(0,0,0,0.18);padding:4px 0;">' +
    '<div style="padding:6px 8px 4px;font-size:9px;color:var(--dm-text-dim);text-transform:uppercase;letter-spacing:0.4px;">Site tokens (' + tokens.length + ')</div>' + rows +
    '</div>';
}

// Badge menu + swap picker, absolutely positioned inside the field.
// Rendered by every field that renders a badge.
function renderTokenOverlays(prop: string): string {
  const tok = tokenForProp(prop);
  if (!tok) return '';
  if (tokenPickerProp === prop) return renderTokenPicker(prop);
  if (tokenBadgeMenuProp !== prop) return '';
  const item = (action: string, label: string) =>
    '<button data-dm-token-action="' + action + '" data-dm-token-prop="' + escapeAttr(prop) + '" data-dm-token-var="' + escapeAttr(tok.cssVar) + '" data-dm-token-scope="' + escapeAttr(tok.scope) + '" style="width:100%;display:block;padding:6px 10px;background:transparent;border:none;cursor:pointer;text-align:left;font-family:inherit;font-size:11px;color:var(--dm-text);">' + label + '</button>';
  // The scope line matters: it's where an edit to this token has to land
  // for this element to change.
  const scopeLine = tok.scope !== ':root'
    ? '<div style="padding:0 10px 6px;font-size:9px;color:var(--dm-text-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">via <span style="font-family:SF Mono,Monaco,monospace;">' + escapeAttr(tok.scope) + '</span></div>'
    : '';
  return '<div data-dm-token-menu="' + escapeAttr(prop) + '" style="position:absolute;right:0;top:100%;margin-top:4px;z-index:40;background:var(--dm-bg);border:1px solid var(--dm-separator-strong);border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,0.18);padding:4px 0;min-width:180px;">' +
    '<div style="padding:5px 10px 3px;font-size:9px;color:var(--dm-text-dim);font-family:SF Mono,Monaco,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">var(' + escapeAttr(tok.cssVar) + ')</div>' +
    scopeLine +
    '<div style="border-bottom:1px solid var(--dm-separator);margin-bottom:3px;"></div>' +
    item('swap', 'Swap token…') +
    item('edit', 'Edit token globally') +
    item('detach', 'Detach from token') +
    '</div>';
}

function sizeInput(label: string, prop: 'width' | 'height', resolvedValue: string, elementId: string): string {
  // Intent from the override stylesheet wins. Without an override, the
  // resolved computed value (always px) implies Fixed mode.
  const intent = elementId ? lastStyleChangeFor(elementId, prop) : null;
  const mode = inferSizeMode(intent ?? resolvedValue);
  // Display always shows the *resolved* numeric value — even in Hug / Fill
  // mode the user wants to see what the browser actually rendered. The
  // dropdown is the mode indicator; the number is the truth.
  // (Display honours the px / rem unit preference; the value the change
  // tracker stores is still the literal CSS — `fit-content`, `100%`, or
  // the user-typed number with the chosen unit.)
  const formatted = formatPxValueForDisplay(resolvedValue);
  const numericDisplay = formatted.display;
  const displayUnit = formatted.unit;
  const writeUnit = formatted.writeUnit;
  const isFixed = mode === 'fixed';
  // We render either an <input> (Fixed, editable) or a <span> (Hug /
  // Fill, read-only). Swapping element types makes morphdom replace the
  // node outright rather than trying to morph readonly / value
  // attributes back and forth across mode changes — which it does
  // unreliably when an input has been focused recently.
  const valueCell = isFixed
    ? '<input type="text" class="dm-input dm-input-bare" data-dm-prop="' + prop + '" data-dm-numeric="1" data-dm-unit="' + escapeAttr(writeUnit) + '" inputmode="decimal" value="' + escapeAttr(numericDisplay) + '"/>'
    : '<span class="dm-input-readonly" data-dm-size-readonly="' + prop + '" title="Read-only in ' + mode + ' mode — switch to Fixed to edit">' + escapeAttr(numericDisplay) + '</span>';
  return '<div class="dm-field">' +
    '<label class="dm-field-label">' + label + '</label>' +
    '<div class="dm-input-shell">' +
    valueCell +
    renderTokenBadge(prop) +
    '<span class="dm-input-unit">' + displayUnit + '</span>' +
    '<select class="dm-size-mode" data-dm-size-mode="' + prop + '" title="Size mode" aria-label="' + label + ' size mode">' +
      '<option value="fixed"' + (mode === 'fixed' ? ' selected' : '') + '>Fixed</option>' +
      '<option value="hug"' + (mode === 'hug' ? ' selected' : '') + '>Hug</option>' +
      '<option value="fill"' + (mode === 'fill' ? ' selected' : '') + '>Fill</option>' +
    '</select>' +
    '</div>' + renderTokenOverlays(prop) + '</div>';
}

// Which distribution property a gap field's "Auto" mode drives. The visible
// gap field is always the container's spread target: Col gap → the inline
// axis (justify-content for flex row and grid), Row gap → the block axis
// (align-content for grid, but justify-content for a vertical flex column,
// whose main axis is vertical).
function gapDistProp(field: 'col' | 'row', s: Record<string, string>): string {
  const display = (s.display || '').toLowerCase();
  const isGrid = display === 'grid' || display === 'inline-grid';
  return field === 'col' ? 'justifyContent' : (isGrid ? 'alignContent' : 'justifyContent');
}

function inferGapMode(field: 'col' | 'row', s: Record<string, string>): 'fixed' | 'auto' {
  const v = (s[gapDistProp(field, s)] || '').toLowerCase();
  if (v === 'space-between' || v === 'space-around' || v === 'space-evenly') return 'auto';
  return 'fixed';
}

// Gap field modelled on sizeInput: a number input + unit suffix + a two-mode
// dropdown. Fixed is editable and writes column-gap / row-gap; Auto spreads
// the children via space-between and shows the measured effective spacing
// (info.childGap) read-only.
function gapInput(label: string, field: 'col' | 'row', s: Record<string, string>, iconName: string): string {
  const prop = field === 'col' ? 'columnGap' : 'rowGap';
  const mode = inferGapMode(field, s);
  const isFixed = mode === 'fixed';
  const rawGap = s[prop] || '';
  const fixedVal = rawGap === 'normal' ? '' : rawGap;
  const formatted = formatPxValueForDisplay(fixedVal || '0');
  const measured = field === 'col' ? info?.childGap?.col : info?.childGap?.row;
  const autoDisplay = (measured === null || measured === undefined) ? '—' : String(measured);
  const labelHtml = '<label style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--dm-text-muted);text-transform:uppercase;letter-spacing:0.4px;">' + icon(iconName, 11) + ' ' + label + '</label>';
  const valueCell = isFixed
    ? '<input type="text" class="dm-input dm-input-bare" data-dm-prop="' + prop + '" data-dm-numeric="1" data-dm-unit="' + escapeAttr(formatted.writeUnit) + '" data-dm-kw="normal" inputmode="decimal" placeholder="0" value="' + escapeAttr(fixedVal ? formatted.display : '') + '"/>'
    : '<span class="dm-input-readonly" data-dm-gap-readonly="' + prop + '" title="Auto (space-between) — switch to Fixed to enter a value">' + escapeAttr(autoDisplay) + '</span>';
  const unit = isFixed && fixedVal ? formatted.unit : 'px';
  return '<div class="dm-field">' + labelHtml +
    '<div class="dm-input-shell">' +
    valueCell +
    renderTokenBadge(prop) +
    '<span class="dm-input-unit">' + unit + '</span>' +
    '<select class="dm-size-mode" data-dm-gap-mode="' + field + '" title="Gap mode" aria-label="' + label + ' mode">' +
      '<option value="fixed"' + (mode === 'fixed' ? ' selected' : '') + '>Fixed</option>' +
      '<option value="auto"' + (mode === 'auto' ? ' selected' : '') + '>Auto</option>' +
    '</select>' +
    '</div>' + renderTokenOverlays(prop) + '</div>';
}

// Numeric input that knows about a CSS keyword default (e.g. `normal` for
// line-height / letter-spacing). If the live value is the keyword, the input
// renders empty with a `(Normal)` chip on the right at 0.4 opacity — making
// it obvious the user is on the default — and is still freely editable. As
// soon as the user types a number it overrides the default; clearing the
// field reverts to the keyword (applyStyleChange treats '' as "remove").
function inpKw(label: string, prop: string, value: string, unit: string, keyword: string): string {
  const isKeyword = !value || value === keyword;
  const parsed = isKeyword ? null : parseNumeric(value);
  const displayVal = isKeyword ? '' : (parsed ? String(parsed.num) : value);
  const displayUnit = parsed ? (parsed.unit || unit) : (isKeyword ? unit : '');
  const placeholder = isKeyword ? '0' : '';
  const keywordChip = isKeyword
    ? '<span class="dm-input-unit dm-input-unit-faint">(' + keyword.charAt(0).toUpperCase() + keyword.slice(1) + ')</span>'
    : (displayUnit ? '<span class="dm-input-unit">' + displayUnit + '</span>' : '');
  return '<div class="dm-field">' +
    (label ? '<label class="dm-field-label">' + label + '</label>' : '') +
    '<div class="dm-input-shell">' +
    '<input type="text" class="dm-input dm-input-bare" data-dm-prop="' + prop + '" data-dm-numeric="1" data-dm-unit="' + escapeAttr(unit) + '" data-dm-kw="' + escapeAttr(keyword) + '" inputmode="decimal" placeholder="' + placeholder + '" value="' + escapeAttr(displayVal) + '"/>' +
    renderTokenBadge(prop) +
    keywordChip +
    '</div>' + renderTokenOverlays(prop) + '</div>';
}

function sel(label: string, prop: string, value: string, options: string[]): string {
  const opts = options.map(o => '<option value="' + o + '"' + (o === value ? ' selected' : '') + '>' + o + '</option>').join('');
  return '<div class="dm-field"><label class="dm-field-label">' + label + '</label>' +
    '<select class="dm-select" data-dm-prop="' + prop + '">' + opts + '</select></div>';
}

function selKV(label: string, prop: string, value: string, options: Array<{ value: string; label: string }>): string {
  const opts = options.map(o => '<option value="' + escapeAttr(o.value) + '"' + (o.value === value ? ' selected' : '') + '>' + escapeAttr(o.label) + '</option>').join('');
  return '<div class="dm-field"><label class="dm-field-label">' + label + '</label>' +
    '<select class="dm-select" data-dm-prop="' + prop + '">' + opts + '</select></div>';
}

const FONT_WEIGHTS: Array<{ value: string; label: string }> = [
  { value: '100', label: 'Thin (100)' },
  { value: '200', label: 'Extra Light (200)' },
  { value: '300', label: 'Light (300)' },
  { value: '400', label: 'Regular (400)' },
  { value: '500', label: 'Medium (500)' },
  { value: '600', label: 'Semi Bold (600)' },
  { value: '700', label: 'Bold (700)' },
  { value: '800', label: 'Extra Bold (800)' },
  { value: '900', label: 'Black (900)' },
];

// ── Color math: HSV ↔ RGB ↔ HEX, plus a robust value parser. The custom
// inline color picker (built below) renders the HSV gradient + hue slider
// from these. Edge cases handled: 3/6/8-digit hex, rgb(...) with or
// without alpha, named colors via a temporary canvas-style fallback are
// not needed here because `value` arrives from getComputedStyle (always
// rgba) or our own `var()` strings (handled separately).

function clampInt(n: number, lo = 0, hi = 255): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function parseColorRgb(value: string): [number, number, number] | null {
  const v = (value || '').trim();
  if (!v) return null;
  if (v.startsWith('#')) {
    const hex = v.slice(1);
    if (/^[0-9a-fA-F]{3}$/.test(hex)) {
      return [parseInt(hex[0] + hex[0], 16), parseInt(hex[1] + hex[1], 16), parseInt(hex[2] + hex[2], 16)];
    }
    if (/^[0-9a-fA-F]{6,8}$/.test(hex)) {
      return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
    }
  }
  const m = v.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) return [+m[1], +m[2], +m[3]];
  return null;
}

function rgbToHexStr(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(n => clampInt(n).toString(16).padStart(2, '0')).join('');
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s, v];
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  // h in 0..360, s and v in 0..1
  const c = v * s;
  const hp = (h % 360 + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0, g1 = 0, b1 = 0;
  if (hp < 1) { r1 = c; g1 = x; }
  else if (hp < 2) { r1 = x; g1 = c; }
  else if (hp < 3) { g1 = c; b1 = x; }
  else if (hp < 4) { g1 = x; b1 = c; }
  else if (hp < 5) { r1 = x; b1 = c; }
  else { r1 = c; b1 = x; }
  const m = v - c;
  return [clampInt((r1 + m) * 255), clampInt((g1 + m) * 255), clampInt((b1 + m) * 255)];
}

// ── Contrast checker ──
// Determines what colour to pair against when the user edits `prop`.
// Returns null when the contrast row shouldn't render (box-shadow / drop-
// shadow colours, or no current selection).
type ContrastContext = {
  role: 'fg' | 'bg';
  fg: Rgba;
  bg: Rgb;
  pairLabel: string;
};

// Normalise any CSS colour string to RGBA. parseRgba handles hex + rgb/rgba
// in both legacy (comma) and modern (space, slash-alpha) forms. oklab and
// oklch are converted via the spec math in contrast.ts so we don't depend
// on canvas / browser version. Anything else (named colours, hsl, lab, lch,
// color()) is fed through a canvas 2D context which always coerces fillStyle
// to sRGB on readback. Cached per input string to avoid recomputing during
// SV drag.
const normaliseColourCache = new Map<string, Rgba | null>();
let probeCanvasCtx: CanvasRenderingContext2D | null = null;
function normaliseToRgba(value: string): Rgba | null {
  const fast = parseRgba(value);
  if (fast) return fast;
  const lowered = value.trim().toLowerCase();
  if (lowered.startsWith('oklab(')) {
    const r = parseOklab(value);
    if (r) return r;
  }
  if (lowered.startsWith('oklch(')) {
    const r = parseOklch(value);
    if (r) return r;
  }
  if (normaliseColourCache.has(value)) return normaliseColourCache.get(value) || null;
  let result: Rgba | null = null;
  try {
    if (!probeCanvasCtx) {
      probeCanvasCtx = document.createElement('canvas').getContext('2d');
    }
    if (probeCanvasCtx) {
      probeCanvasCtx.fillStyle = '#000';
      probeCanvasCtx.fillStyle = value;
      const normalised = probeCanvasCtx.fillStyle;
      if (typeof normalised === 'string') result = parseRgba(normalised);
    }
  } catch {}
  normaliseColourCache.set(value, result);
  return result;
}

function isBoxShadowColorProp(prop: string): boolean {
  if (prop === '__shadow_color') return true;
  if (prop.startsWith('__effd_')) return true;
  return false;
}

function getContrastContext(prop: string, value: string): ContrastContext | null {
  if (!info) return null;
  if (isBoxShadowColorProp(prop)) return null;
  const s = info.computedStyles || {};

  let currentValue = (value || '').trim();
  const tokenResolved = resolveCssVarToColor(currentValue);
  if (tokenResolved) currentValue = tokenResolved;
  const currentRgba = normaliseToRgba(currentValue);
  if (!currentRgba) return null;

  const isFillProp = prop.startsWith('__fill_color__') || prop.startsWith('__fill_stop_color__');
  const role: 'fg' | 'bg' = isFillProp ? 'bg' : 'fg';

  let fg: Rgba;
  let bgSource: string;
  if (role === 'fg') {
    fg = currentRgba;
    const ownBg = s.backgroundColor || '';
    if (!isTransparent(ownBg)) {
      bgSource = ownBg;
    } else {
      const id = info.id;
      const cached = id ? effectiveBgCache.get(id) : undefined;
      bgSource = cached || '#FFFFFF';
    }
  } else {
    bgSource = currentValue;
    const textColor = s.color || '#000000';
    fg = normaliseToRgba(textColor) || [0, 0, 0, 1];
  }
  const bgResolved = resolveCssVarToColor(bgSource) || bgSource;
  // Fall back to white so the row always renders for a valid foreground —
  // unparseable backgrounds (rare modern colour spaces) shouldn't silently
  // hide the row; a best-effort ratio against white is more useful than nothing.
  const bgRgba = normaliseToRgba(bgResolved) || [255, 255, 255, 1];
  const bg: Rgb = [bgRgba[0], bgRgba[1], bgRgba[2]];
  return { role, fg, bg, pairLabel: role === 'fg' ? 'Background' : 'Text' };
}

function maybeFetchEffectiveBg() {
  if (!info) return;
  const s = info.computedStyles || {};
  if (!isTransparent(s.backgroundColor || '')) return;
  const id = info.id;
  if (!id || effectiveBgCache.has(id)) return;
  send({ type: 'SP_GET_EFFECTIVE_BG', elementId: id }).then(r => {
    if (r?.ok && r.color) {
      effectiveBgCache.set(id, r.color);
      if (activeColorPickerProp) render();
    }
  });
}

function renderContrastSettingsPopover(resolved: A11yResolvedCategory): string {
  const item = (label: string, attr: string, active: boolean) =>
    '<button class="dm-popover-item" ' + attr + ' data-active="' + (active ? 'true' : 'false') + '">' +
      '<span style="flex:1;">' + escapeAttr(label) + '</span>' +
      (active ? '<span style="color:var(--dm-accent);display:flex;">' + icon('check', 11) + '</span>' : '') +
    '</button>';
  return '<div class="dm-popover dm-contrast-settings" data-dm-contrast-settings>' +
    '<div class="dm-contrast-section-header">Category</div>' +
    item('Auto (' + CATEGORY_LABEL[resolved] + ')', 'data-dm-action="set-a11y-category" data-dm-cat="auto"', a11yCategory === 'auto') +
    item('Large text', 'data-dm-action="set-a11y-category" data-dm-cat="large"', a11yCategory === 'large') +
    item('Normal text', 'data-dm-action="set-a11y-category" data-dm-cat="normal"', a11yCategory === 'normal') +
    item('Graphics', 'data-dm-action="set-a11y-category" data-dm-cat="graphics"', a11yCategory === 'graphics') +
  '</div>';
}

// Render the AA / AAA pair as a 2-tab segmented control. Both pass/fail
// verdicts are visible simultaneously; the active tab is the user's
// currently-selected target Level (drives the ratio number's threshold
// halo + persists across sessions). Clicking either switches Level.
function renderLevelTabs(
  resolved: A11yResolvedCategory,
  ratio: number,
): string {
  const tab = (level: A11yLevel) => {
    const threshold = thresholdFor(resolved, level);
    const pass = ratio >= threshold;
    const active = a11yLevel === level;
    const title = (pass ? 'Passes' : 'Fails') + ' WCAG ' + level +
      ' for ' + CATEGORY_LABEL[resolved] + ' (' + threshold + ' : 1)';
    return '<button class="dm-contrast-tab" data-dm-action="set-a11y-level" data-dm-level="' + level +
      '" data-active="' + (active ? 'true' : 'false') + '" data-pass="' + (pass ? 'true' : 'false') +
      '" title="' + escapeAttr(title) + '">' +
      (pass ? icon('check', 10) : icon('x', 10)) +
      '<span class="dm-contrast-tab-label">' + level + '</span>' +
    '</button>';
  };
  return '<div class="dm-contrast-tabs" role="tablist">' + tab('AA') + tab('AAA') + '</div>';
}

function renderContrastRow(prop: string, value: string): string {
  const ctx = getContrastContext(prop, value);
  if (!ctx) return '';

  const fontSizePx = parseFloat(info?.computedStyles?.fontSize || '16') || 16;
  const fwRaw = info?.computedStyles?.fontWeight || '400';
  const fontWeight = fwRaw === 'bold' ? 700 : (parseInt(fwRaw, 10) || 400);

  const res = evaluate({
    fg: ctx.fg, bg: ctx.bg,
    category: a11yCategory, level: a11yLevel,
    prop, fontSizePx, fontWeight,
  });
  const meta = RATING_META[res.rating];

  const fgCss = 'rgba(' + ctx.fg[0] + ',' + ctx.fg[1] + ',' + ctx.fg[2] + ',' + ctx.fg[3] + ')';
  const bgCss = 'rgb(' + ctx.bg[0] + ',' + ctx.bg[1] + ',' + ctx.bg[2] + ')';
  const safeFg = safeCssColor(fgCss) || '#000';
  const safeBg = safeCssColor(bgCss) || '#fff';

  const popoverHtml = contrastSettingsOpen ? renderContrastSettingsPopover(res.resolvedCategory) : '';

  return '<div class="dm-contrast-row" data-dm-contrast-row>' +
    '<span class="dm-contrast-chip" title="' + escapeAttr(ctx.pairLabel + ' • ' + bgCss) + '" style="background:linear-gradient(135deg, ' + safeFg + ' 50%, ' + safeBg + ' 50%);"></span>' +
    '<span class="dm-contrast-ratio">' + res.ratio.toFixed(2) + ' : 1</span>' +
    '<span class="dm-contrast-rating" data-rating="' + res.rating + '" title="' + escapeAttr(meta.description) + '">' + meta.label + '</span>' +
    '<span class="dm-contrast-spacer"></span>' +
    renderLevelTabs(res.resolvedCategory, res.ratio) +
    '<button data-dm-action="toggle-contrast-settings" class="dm-contrast-settings-btn" data-active="' + (contrastSettingsOpen ? 'true' : 'false') + '" aria-label="Contrast settings" aria-expanded="' + (contrastSettingsOpen ? 'true' : 'false') + '" title="Contrast settings">' +
      icon('slidersHorizontal', 12) +
    '</button>' +
    popoverHtml +
  '</div>';
}

// Renders the inline custom color picker: HSV gradient + hue slider +
// hex/R/G/B inputs. All interaction wires through `data-dm-color-*`
// attributes that the input + pointer handlers below recognize.
function renderInlineColorPicker(prop: string, value: string, compact = false): string {
  const rgb = parseColorRgb(value) || [0, 0, 0];
  const [r, g, b] = rgb;
  const [h, s, v] = rgbToHsv(r, g, b);
  const hueColor = `hsl(${h.toFixed(1)}, 100%, 50%)`;
  const svX = (s * 100).toFixed(1);
  const svY = ((1 - v) * 100).toFixed(1);
  const hueX = (h / 360 * 100).toFixed(1);
  const hex = rgbToHexStr(r, g, b);

  return (
    // Contrast checker — pairs the edited colour against the element's
    // effective background (or the element's text colour when the prop is
    // itself a fill). Hidden for box-shadow colours via getContrastContext.
    (compact ? '' : renderContrastRow(prop, value)) +
    // SV (saturation × value) gradient. Bottom→top black overlay handles
    // the V axis; left→right white→hue handles the S axis. Marker dot
    // positioned on top via percentage offsets.
    '<div data-dm-color-sv="' + escapeAttr(prop) + '" data-dm-color-h="' + h.toFixed(2) + '" style="position:relative;width:100%;height:140px;border-radius:5px;background:linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ' + hueColor + ');cursor:crosshair;user-select:none;touch-action:none;">' +
      '<div style="position:absolute;left:' + svX + '%;top:' + svY + '%;width:12px;height:12px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,0.5);transform:translate(-50%,-50%);pointer-events:none;"></div>' +
    '</div>' +
    '<div data-dm-color-hue="' + escapeAttr(prop) + '" style="position:relative;width:100%;height:14px;margin-top:8px;border-radius:5px;background:linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%);cursor:ew-resize;user-select:none;touch-action:none;">' +
      '<div style="position:absolute;left:' + hueX + '%;top:50%;width:14px;height:18px;background:#fff;border:1px solid rgba(0,0,0,0.4);border-radius:3px;transform:translate(-50%,-50%);pointer-events:none;"></div>' +
    '</div>' +
    // Format cycle button + eyedropper. The eyedropper uses Chrome's
    // built-in EyeDropper API (Chrome 95+). On unsupported browsers the
    // click handler shows a tooltip explaining the requirement.
    '<div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-top:10px;">' +
      '<button data-dm-eyedropper="' + escapeAttr(prop) + '" title="Eyedropper — pick a colour from anywhere on screen" style="display:flex;align-items:center;gap:4px;padding:3px 6px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:4px;color:var(--dm-text-secondary);cursor:pointer;font-size:10px;font-family:inherit;">' +
        icon('penTool', 11) +
        '<span>Pick</span>' +
      '</button>' +
      '<button data-dm-cycle-color-format style="display:flex;align-items:center;gap:4px;padding:3px 6px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:4px;color:var(--dm-text-secondary);cursor:pointer;font-size:10px;font-family:inherit;letter-spacing:0.4px;text-transform:uppercase;" title="Cycle color format">' +
        '<span>' + (colorFormat === 'hex' ? 'HEX' : colorFormat === 'rgba' ? 'RGB' : 'HSL') + '</span>' +
        icon('chevronsUpDown', 11) +
      '</button>' +
    '</div>' +
    // When the format cycle is on HSL, swap the R/G/B sub-inputs for H/S/L
    // so the panel matches the format the user types in. Each H/S/L
    // input writes back via `data-dm-color-hsl` (handled in the input
    // listener below).
    (colorFormat === 'hsl' ? (() => {
      const hh = Math.round(h);
      const sPct = Math.round(s * 100);
      // HSL "L" is from HSL space (different from HSV "V"). Convert.
      // HSV {h,s,v} → HSL: l = v * (1 - s/2), s_hsl = (v-l) / min(l, 1-l)
      const lDec = v * (1 - s / 2);
      const lPct = Math.round(lDec * 100);
      return '<div style="display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr;gap:6px;margin-top:6px;">' +
        '<div style="display:flex;flex-direction:column;gap:2px;">' +
          '<label style="font-size:9px;color:var(--dm-text-dim);text-transform:uppercase;letter-spacing:0.4px;">Hex</label>' +
          '<input type="text" class="dm-input" data-dm-color-hex="' + escapeAttr(prop) + '" value="' + escapeAttr(hex.slice(1)) + '" style="padding:5px 6px;font-size:10px;font-family:SF Mono,Monaco,monospace;text-transform:uppercase;"/>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:2px;">' +
          '<label style="font-size:9px;color:var(--dm-text-dim);text-transform:uppercase;letter-spacing:0.4px;">H</label>' +
          '<input type="number" class="dm-input" data-dm-color-hsl="' + escapeAttr(prop) + '" data-c="h" min="0" max="360" value="' + hh + '" style="padding:5px 6px;font-size:10px;"/>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:2px;">' +
          '<label style="font-size:9px;color:var(--dm-text-dim);text-transform:uppercase;letter-spacing:0.4px;">S</label>' +
          '<input type="number" class="dm-input" data-dm-color-hsl="' + escapeAttr(prop) + '" data-c="s" min="0" max="100" value="' + sPct + '" style="padding:5px 6px;font-size:10px;"/>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:2px;">' +
          '<label style="font-size:9px;color:var(--dm-text-dim);text-transform:uppercase;letter-spacing:0.4px;">L</label>' +
          '<input type="number" class="dm-input" data-dm-color-hsl="' + escapeAttr(prop) + '" data-c="l" min="0" max="100" value="' + lPct + '" style="padding:5px 6px;font-size:10px;"/>' +
        '</div>' +
      '</div>';
    })() :
    '<div style="display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr;gap:6px;margin-top:6px;">' +
      '<div style="display:flex;flex-direction:column;gap:2px;">' +
        '<label style="font-size:9px;color:var(--dm-text-dim);text-transform:uppercase;letter-spacing:0.4px;">Hex</label>' +
        '<input type="text" class="dm-input" data-dm-color-hex="' + escapeAttr(prop) + '" value="' + escapeAttr(hex.slice(1)) + '" style="padding:5px 6px;font-size:10px;font-family:SF Mono,Monaco,monospace;text-transform:uppercase;"/>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:2px;">' +
        '<label style="font-size:9px;color:var(--dm-text-dim);text-transform:uppercase;letter-spacing:0.4px;">R</label>' +
        '<input type="number" class="dm-input" data-dm-color-rgb="' + escapeAttr(prop) + '" data-c="r" min="0" max="255" value="' + r + '" style="padding:5px 6px;font-size:10px;"/>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:2px;">' +
        '<label style="font-size:9px;color:var(--dm-text-dim);text-transform:uppercase;letter-spacing:0.4px;">G</label>' +
        '<input type="number" class="dm-input" data-dm-color-rgb="' + escapeAttr(prop) + '" data-c="g" min="0" max="255" value="' + g + '" style="padding:5px 6px;font-size:10px;"/>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:2px;">' +
        '<label style="font-size:9px;color:var(--dm-text-dim);text-transform:uppercase;letter-spacing:0.4px;">B</label>' +
        '<input type="number" class="dm-input" data-dm-color-rgb="' + escapeAttr(prop) + '" data-c="b" min="0" max="255" value="' + b + '" style="padding:5px 6px;font-size:10px;"/>' +
      '</div>' +
    '</div>')
  );
}

// Format the user's color value for display in the input field. Honors
// the configured `colorFormat` setting (HEX vs RGBA). `var(--token)`
// references are resolved against the design-tokens cache so the field
// shows the actual rendered colour — the user can still tell they
// picked a token from the swatch's accent ring + the token entry's
// active state in the panel; the field surfaces the *value* that's
// actually painting on the page. The underlying change-tracker still
// stores `var(--name)` (the user's intent) — only this display is
// resolved.
function formatColorForDisplay(value: string): string {
  const v = (value || '').trim();
  if (!v) return '';
  const resolved = resolveCssVarToColor(v);
  const target = resolved ?? v;
  if (colorFormat === 'rgba') return target;
  return rgbToHex(target);
}

// Walk a `var(--name, fallback)` reference back to a concrete colour
// value via the design-tokens cache. Returns null when the reference
// isn't found (the caller falls back to the raw text so the user can
// still see what they typed). Tolerates fallback values inside the
// var() — only the primary name drives the lookup.
function resolveCssVarToColor(value: string): string | null {
  const m = value.match(/^var\(\s*(--[\w-]+)/);
  if (!m) return null;
  const tokenName = m[1];
  const token = designTokens.find(t => t.cssVar === tokenName);
  const resolved = token?.resolvedValue || token?.value;
  return resolved ? resolved.trim() : null;
}

// Format a token's display value the same way (used in the dropdown label).
function formatTokenForDisplay(value: string): string {
  const v = (value || '').trim();
  if (!v) return '';
  if (colorFormat === 'rgba') return v;
  return rgbToHex(v);
}

// Font family — dropdown of fonts actually used on the page (parsed from
// every accessible stylesheet) plus a curated list of system fallbacks.
// Match against the *primary* family so a computed style like
// `Inter, Helvetica, sans-serif` lines up with the option whose primary
// family is `Inter`. If the current value isn't in the list (rare —
// e.g. inline font-family that no rule uses), prepend it so it renders.
function renderFontFamilyPicker(currentValue: string): string {
  const v = (currentValue || '').trim();
  const primary = (s: string) => s.split(',')[0].trim().replace(/^["']|["']$/g, '').toLowerCase();
  const curPrimary = primary(v);
  let options = pageFonts.slice();
  let matchedValue = '';
  for (const opt of options) {
    if (primary(opt.value) === curPrimary) { matchedValue = opt.value; break; }
  }
  if (!matchedValue && v) {
    // Surface the current value as the first option so the dropdown reflects reality.
    options = [{ value: v, label: primary(v) || v.slice(0, 32) }, ...options];
    matchedValue = v;
  }
  return selKV('Font', 'fontFamily', matchedValue, options);
}

// Render the color picker panel (HSV / hex / RGB / token list) for a prop.
// Used both inline by colorInp and detached by sections (e.g. Stroke) that
// want the panel rendered below the row instead of inside the field.
// `compact` drops the contrast row and the Site Colors list, leaving just
// the picker and its value inputs. For colours that aren't page content —
// e.g. layout-guide overlays — WCAG pairing and design tokens are noise.
function renderColorPanel(prop: string, value: string, compact = false): string {
  const hex = rgbToHex(value);
  const colorTokens = designTokens.filter(t => t.group === 'colour');
  const q = colorPickerSearch.toLowerCase();
  const filteredTokens = q
    ? colorTokens.filter(t => t.cssVar.toLowerCase().includes(q) || (t.resolvedValue || t.value).toLowerCase().includes(q))
    : colorTokens;
  return '<div data-dm-color-popover="' + prop + '" style="margin-top:6px;background:var(--dm-bg-secondary);border:1px solid var(--dm-separator);border-radius:6px;max-height:520px;overflow-y:auto;">' +
    '<div style="padding:10px;' + (compact ? '' : 'border-bottom:1px solid var(--dm-separator);') + '">' +
    renderInlineColorPicker(prop, value, compact) +
    '</div>' +
    (compact ? '' : filteredTokens.length > 0
      ? '<div style="padding:6px 8px 4px;font-size:9px;color:var(--dm-text-dim);text-transform:uppercase;letter-spacing:0.4px;">Site Colors (' + filteredTokens.length + ')</div>' +
        filteredTokens.map(t => {
          const tokenVal = (t.resolvedValue || t.value).trim();
          const tokenHex = rgbToHex(tokenVal);
          const tokenDisplay = formatTokenForDisplay(tokenVal);
          const isCurrent = tokenVal === value || tokenHex === hex || ('var(' + t.cssVar + ')') === value;
          return '<button data-dm-pick-color="' + escapeAttr('var(' + t.cssVar + ')') + '" data-dm-pick-prop="' + escapeAttr(prop) + '" style="width:100%;display:flex;align-items:center;gap:8px;padding:5px 8px;background:' + (isCurrent ? 'var(--dm-accent-bg)' : 'transparent') + ';border:none;border-radius:0;cursor:pointer;text-align:left;font-family:inherit;color:var(--dm-text);">' +
            '<span style="width:14px;height:14px;border-radius:3px;background:' + escapeAttr(tokenVal) + ';border:1px solid var(--dm-separator);flex-shrink:0;"></span>' +
            '<span style="flex:1;font-size:10px;font-family:SF Mono,Monaco,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeAttr(t.cssVar) + '</span>' +
            '<span style="font-size:9px;color:var(--dm-text-dim);font-family:SF Mono,Monaco,monospace;flex-shrink:0;max-width:90px;overflow:hidden;text-overflow:ellipsis;">' + escapeAttr(tokenDisplay) + '</span>' +
            '</button>';
        }).join('')
      : '<div style="padding:14px;font-size:10px;color:var(--dm-text-dim);text-align:center;">' + (q ? 'No matching colors. Press Enter to use "' + escapeAttr(q) + '" as custom value.' : 'No design tokens on this page.') + '</div>') +
    '</div>';
}

// Site-color tokens-only dropdown. Used as a focus-driven shortcut on the
// hex input — clicking into the input pops up just the site-colour list
// (not the full HSV picker), so users can apply a token without opening
// the full panel.
function renderTokensDropdown(prop: string, value: string): string {
  const hex = rgbToHex(value);
  const colorTokens = designTokens.filter(t => t.group === 'colour');
  if (colorTokens.length === 0) return '';
  return '<div data-dm-tokens-dropdown="' + prop + '" style="position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:30;background:var(--dm-bg);border:1px solid var(--dm-separator-strong);border-radius:6px;max-height:240px;overflow-y:auto;box-shadow:0 4px 16px rgba(0,0,0,0.18);padding:4px 0;">' +
    '<div style="padding:6px 8px 4px;font-size:9px;color:var(--dm-text-dim);text-transform:uppercase;letter-spacing:0.4px;">Site colours (' + colorTokens.length + ')</div>' +
    colorTokens.map(t => {
      const tokenVal = (t.resolvedValue || t.value).trim();
      const tokenHex = rgbToHex(tokenVal);
      const isCurrent = tokenVal === value || tokenHex === hex || ('var(' + t.cssVar + ')') === value;
      const tokenDisplay = formatTokenForDisplay(tokenVal);
      return '<button data-dm-pick-color="' + escapeAttr('var(' + t.cssVar + ')') + '" data-dm-pick-prop="' + escapeAttr(prop) + '" style="width:100%;display:flex;align-items:center;gap:8px;padding:5px 8px;background:' + (isCurrent ? 'var(--dm-accent-bg)' : 'transparent') + ';border:none;cursor:pointer;text-align:left;font-family:inherit;color:var(--dm-text);">' +
        '<span style="width:14px;height:14px;border-radius:3px;background:' + escapeAttr(tokenVal) + ';border:1px solid var(--dm-separator);flex-shrink:0;"></span>' +
        '<span style="flex:1;font-size:10px;font-family:SF Mono,Monaco,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeAttr(t.cssVar) + '</span>' +
        '<span style="font-size:9px;color:var(--dm-text-dim);font-family:SF Mono,Monaco,monospace;flex-shrink:0;max-width:90px;overflow:hidden;text-overflow:ellipsis;">' + escapeAttr(tokenDisplay) + '</span>' +
        '</button>';
    }).join('') +
    '</div>';
}

function colorInp(label: string, prop: string, value: string, omitPanel = false): string {
  const hex = rgbToHex(value);
  const displayColor = formatColorForDisplay(value);
  const isOpen = activeColorPickerProp === prop;
  const tokensOpen = tokensDropdownProp === prop;
  // Render the inline panel below the field unless caller asked us to
  // omit it (Stroke renders the panel detached, beneath the whole row).
  const panel = (isOpen && !omitPanel) ? renderColorPanel(prop, value) : '';
  // Tokens-only dropdown — opens when the hex input is focused. Doesn't
  // render when the full color panel is already open (avoid stacking).
  const tokensPanel = (tokensOpen && !isOpen && !omitPanel) ? renderTokensDropdown(prop, value) : '';
  return '<div style="display:flex;flex-direction:column;gap:3px;min-width:0;position:relative;">' +
    (label ? '<label class="dm-field-label">' + label + '</label>' : '') +
    '<div style="display:flex;align-items:center;gap:4px;min-width:0;position:relative;">' +
    '<button type="button" data-dm-color-trigger="' + escapeAttr(prop) + '" title="Pick a color" style="width:28px;height:28px;border:1px solid var(--dm-input-border);border-radius:5px;cursor:pointer;background:' + escapeAttr(value || hex || '#000') + ';padding:0;flex-shrink:0;outline:' + (isOpen ? '2px solid var(--dm-accent)' : 'none') + ';"></button>' +
    '<input type="text" class="dm-input" data-dm-prop="' + prop + '" data-dm-tokens-trigger="' + escapeAttr(prop) + '" value="' + escapeAttr(displayColor) + '" style="background:var(--dm-input-bg);border:1px solid var(--dm-input-border);flex:1;min-width:0;"/>' +
    renderTokenBadge(prop, false) +
    tokensPanel +
    renderTokenOverlays(prop) +
    '</div>' +
    panel +
    '</div>';
}

function grid(cols: number, ...children: string[]): string {
  // Grid sizes used by callers are 2/3/4. The fallback inline style covers
  // any non-class column count without breaking. Avoid template literals to
  // keep this hot helper allocation-tight.
  const cls = (cols === 2 || cols === 3 || cols === 4) ? 'dm-grid dm-grid-' + cols : '';
  return cls
    ? '<div class="' + cls + '">' + children.join('') + '</div>'
    : '<div style="display:grid;grid-template-columns:repeat(' + cols + ',1fr);gap:8px;">' + children.join('') + '</div>';
}
function sp(): string { return '<div class="dm-spacer"></div>'; }
function sub(text: string): string { return '<div class="dm-section-sub">' + text + '</div>'; }
// 12-column grid helper. Each spec is a column span (1-12) and the HTML
// to drop in that cell. Cells stack into multiple rows automatically when
// spans don't fit a single 12-track row.
function grid12(cells: Array<{ span: number; content: string }>): string {
  return '<div class="dm-grid-12">' +
    cells.map(c => '<div class="dm-cell dm-cell-' + c.span + '">' + c.content + '</div>').join('') +
    '</div>';
}
// Wrap content as visually disabled (greyed out, non-interactive) — used
// when a control isn't applicable for the current context (e.g. anchor
// `position-area` while `position: static`). Children inputs stay in DOM
// so morphdom's focus-preservation logic doesn't churn.
function dis(content: string, disabled: boolean, reason = 'Not applicable for the current position type'): string {
  if (!disabled) return content;
  return '<div style="opacity:0.4;pointer-events:none;cursor:not-allowed;" aria-disabled="true" title="' + escapeAttr(reason) + '">' + content + '</div>';
}

/* ── v1.2: Linked 2×2 grid helper — link button centered between rows ── */
function linked2x2(linkKey: string, isLinked: boolean, ...items: string[]): string {
  const linkColor = isLinked ? 'var(--dm-accent)' : 'var(--dm-text-dim)';
  const linkBg = isLinked ? 'var(--dm-accent-bg)' : 'var(--dm-bg)';
  const linkBorder = isLinked ? 'var(--dm-accent-border)' : 'var(--dm-separator)';
  // Place the chain icon at the right edge, vertically centered between the
  // two rows, so it doesn't sit on top of the 4th cell's label glyph
  // (⊥ / ⊣ / ┘ etc.). Reserve 28px of right padding on the row so the
  // button has room without overlapping the right-column inputs either.
  const linkBtn = '<button data-dm-border-link="' + linkKey + '" title="' + (isLinked ? 'Linked — all change together' : 'Unlinked — edit individually') + '" style="position:absolute;right:0;top:50%;transform:translateY(-50%);width:24px;height:24px;background:' + linkBg + ';border:1px solid ' + linkBorder + ';border-radius:50%;color:' + linkColor + ';cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center;z-index:2;box-shadow:0 0 0 3px var(--dm-bg);">' +
    icon(isLinked ? 'link2' : 'unlink2', 11) + '</button>';
  return '<div style="position:relative;padding-right:30px;">' + grid(2, ...items) + linkBtn + '</div>';
}

/* ── Figma-style helpers ──
   Reused across Position, Layout, Fill, Stroke, Appearance, and Effects
   sections. Each helper produces a small, self-contained chunk of HTML
   that piggybacks the existing event-delegation pipeline via `data-dm-*`
   attributes — no fresh listeners required. */

type IconRowButton = {
  icon?: keyof typeof icons;
  label?: string;
  attr: string;
  active?: boolean;
  title?: string;
  size?: number;
};

function iconButtonRow(buttons: IconRowButton[]): string {
  return '<div class="dm-icon-row">' + buttons.map(b => {
    const sz = b.size || 14;
    const inner = b.icon
      ? icon(b.icon, sz)
      : '<span style="font-size:11px;font-weight:600;line-height:1;">' + escapeAttr(b.label || '') + '</span>';
    return '<button class="dm-icon-row-button" ' + b.attr +
      ' data-active="' + (b.active ? 'true' : 'false') + '"' +
      (b.title ? ' title="' + escapeAttr(b.title) + '"' : '') +
      '>' + inner + '</button>';
  }).join('') + '</div>';
}

function segmentedRow(items: IconRowButton[]): string {
  return '<div class="dm-segmented">' + items.map(i => {
    const ic = i.icon ? icon(i.icon, 12) : '';
    const lb = i.label ? '<span>' + escapeAttr(i.label) + '</span>' : '';
    return '<button class="dm-segmented-item" ' + i.attr +
      ' data-active="' + (i.active ? 'true' : 'false') + '"' +
      (i.title ? ' title="' + escapeAttr(i.title) + '"' : '') +
      '>' + ic + lb + '</button>';
  }).join('') + '</div>';
}

type PopoverItem = { icon?: keyof typeof icons; label: string; attr: string; active?: boolean; divider?: boolean };

function popover(items: PopoverItem[]): string {
  return '<div class="dm-popover">' + items.map(i => {
    if (i.divider) return '<div class="dm-popover-divider"></div>';
    const ic = i.icon ? '<span style="color:var(--dm-text-muted);display:flex;">' + icon(i.icon, 12) + '</span>' : '';
    return '<button class="dm-popover-item" ' + i.attr +
      ' data-active="' + (i.active ? 'true' : 'false') + '">' + ic +
      '<span style="flex:1;">' + escapeAttr(i.label) + '</span>' +
      (i.active ? '<span style="color:var(--dm-accent);display:flex;">' + icon('check', 11) + '</span>' : '') +
      '</button>';
  }).join('') + '</div>';
}

function detectParentContext(displayInfo: any, s: Record<string, string>): {
  display: string; isFlex: boolean; isGrid: boolean; isAbs: boolean;
} {
  const display = (displayInfo?.parentDisplay as string) || '';
  const ownPos = (s.position || '').trim();
  return {
    display,
    isFlex: display === 'flex' || display === 'inline-flex',
    isGrid: display === 'grid' || display === 'inline-grid',
    isAbs: ownPos === 'absolute' || ownPos === 'fixed',
  };
}

function positionAlignGrid(_s: Record<string, string>, _ctx: ReturnType<typeof detectParentContext>): string {
  // Object-alignment buttons (canonical Figma icons). No inline help text —
  // dispatch logic lives in applyPositionAlign() based on parent context.
  const horizontal = iconButtonRow([
    { icon: 'alignStartVertical', attr: 'data-dm-pos-align="h-left"', title: 'Align left' },
    { icon: 'alignCenterVertical', attr: 'data-dm-pos-align="h-center"', title: 'Align horizontal center' },
    { icon: 'alignEndVertical', attr: 'data-dm-pos-align="h-right"', title: 'Align right' },
  ]);
  const vertical = iconButtonRow([
    { icon: 'alignStartHorizontal', attr: 'data-dm-pos-align="v-top"', title: 'Align top' },
    { icon: 'alignCenterHorizontal', attr: 'data-dm-pos-align="v-middle"', title: 'Align vertical center' },
    { icon: 'alignEndHorizontal', attr: 'data-dm-pos-align="v-bottom"', title: 'Align bottom' },
  ]);
  return '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' + horizontal + vertical + '</div>';
}

// Distribute buttons — render only when 2+ siblings are selected.
function positionDistributeRow(): string {
  const enabled = multiSelectActive && multiSelectIds.length >= 2;
  if (!enabled) return '';
  return iconButtonRow([
    { icon: 'alignHorizontalSpaceAround', attr: 'data-dm-pos-distribute="horizontal"', title: 'Distribute horizontally' },
    { icon: 'alignVerticalSpaceAround', attr: 'data-dm-pos-distribute="vertical"', title: 'Distribute vertically' },
  ]);
}

function flipButtons(s: Record<string, string>): string {
  const scale = (s.scale || '').trim();
  const parts = (scale === 'none' || !scale) ? ['1','1'] : scale.split(/\s+/);
  const sx = parseFloat(parts[0] || '1') || 1;
  const sy = parseFloat(parts[1] || parts[0] || '1') || sx;
  return iconButtonRow([
    { icon: 'flipHorizontal2', attr: 'data-dm-flip="h"', active: sx < 0, title: 'Flip horizontally' },
    { icon: 'flipVertical2', attr: 'data-dm-flip="v"', active: sy < 0, title: 'Flip vertically' },
  ]);
}

// Rotation 90° quick buttons — bump the `rotate` longhand by ±90deg.
// The default icon size (14) reads as ambiguous in this dense row, so
// these get bumped to 18 — same visual weight as the alignment glyphs.
function rotateQuickButtons(s: Record<string, string>): string {
  void s;
  return iconButtonRow([
    { icon: 'rotateCcw', attr: 'data-dm-rotate-step="-90"', title: 'Rotate 90° counter-clockwise', size: 18 },
    { icon: 'rotateCw',  attr: 'data-dm-rotate-step="90"',  title: 'Rotate 90° clockwise',          size: 18 },
  ]);
}

// Z-order — Bring forward / Send backward as ±1 increment buttons.
function zOrderButtons(s: Record<string, string>): string {
  void s;
  return iconButtonRow([
    { icon: 'arrowUpToLine', attr: 'data-dm-z-step="up"', title: 'Bring forward' },
    { icon: 'arrowDownToLine', attr: 'data-dm-z-step="down"', title: 'Send backward' },
  ]);
}

function layoutModeRow(s: Record<string, string>): string {
  const display = s.display || 'block';
  const flexDir = s.flexDirection || 'row';
  const isFree = display === 'block' || display === 'inline' || display === 'inline-block' || display === '';
  const isFlex = display === 'flex' || display === 'inline-flex';
  const isHStack = isFlex && (flexDir === 'row' || flexDir === 'row-reverse');
  const isVStack = isFlex && (flexDir === 'column' || flexDir === 'column-reverse');
  const isGrid = display === 'grid' || display === 'inline-grid';
  return segmentedRow([
    { icon: 'squareDashed', attr: 'data-dm-layout-mode="free"', active: isFree, title: 'Freeform (no layout)' },
    { icon: 'columns3', attr: 'data-dm-layout-mode="hstack"', active: isHStack, title: 'Horizontal stack' },
    { icon: 'rows3', attr: 'data-dm-layout-mode="vstack"', active: isVStack, title: 'Vertical stack' },
    { icon: 'layoutGrid', attr: 'data-dm-layout-mode="grid"', active: isGrid, title: 'Grid' },
  ]);
}

// 9-cell children alignment pad. The CSS that drives X / Y depends on the
// container kind:
//   - grid                   → X = justify-items,   Y = align-items
//   - flex row / row-reverse → X = justify-content, Y = align-items
//   - flex col / col-reverse → X = align-items,     Y = justify-content
//                              (main axis is vertical for column flex, so
//                              justify-content controls Y, not X — without
//                              this swap the pad's row cells nudge the
//                              wrong axis)
// `axesForContainer` returns the per-axis CSS property and its current
// value resolved from the computed styles, so both the renderer and the
// click handler share one source of truth.
function axesForContainer(s: Record<string, string>): { xProp: string; yProp: string; xVal: string; yVal: string } {
  const display = (s.display || 'block').toLowerCase();
  const isGrid = display === 'grid' || display === 'inline-grid';
  const isFlex = display === 'flex' || display === 'inline-flex';
  const flexDir = (s.flexDirection || 'row').toLowerCase();
  const isFlexColumn = isFlex && (flexDir === 'column' || flexDir === 'column-reverse');
  const justifyProp = isGrid ? 'justifyItems' : 'justifyContent';
  if (isFlexColumn) {
    return {
      xProp: 'alignItems',
      yProp: 'justifyContent',
      xVal: (s.alignItems || 'stretch').toLowerCase(),
      yVal: (s.justifyContent || 'flex-start').toLowerCase(),
    };
  }
  return {
    xProp: justifyProp,
    yProp: 'alignItems',
    xVal: (s[justifyProp] || 'flex-start').toLowerCase(),
    yVal: (s.alignItems || 'stretch').toLowerCase(),
  };
}

function childrenAlignPad(s: Record<string, string>): string {
  const { xVal, yVal } = axesForContainer(s);
  const cssToH: Record<string, string> = { 'flex-start': 'left', start: 'left', center: 'center', 'flex-end': 'right', end: 'right' };
  const cssToV: Record<string, string> = { 'flex-start': 'top', start: 'top', center: 'center', 'flex-end': 'bottom', end: 'bottom' };
  // When a distribution keyword (space-between etc.) is active on an axis
  // — e.g. from the gap Auto mode — don't falsely highlight a dot; the
  // distribution doesn't map to a single alignment position.
  const curH: string | null = cssToH[xVal] ?? null;
  const curV: string | null = cssToV[yVal] ?? null;
  const cells: { h: string; v: string }[] = [];
  for (const v of ['top','center','bottom'])
    for (const h of ['left','center','right'])
      cells.push({ h, v });
  return '<div style="display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);gap:2px;width:100%;aspect-ratio:1/1;">' +
    cells.map(c => {
      const active = c.h === curH && c.v === curV;
      const dot = '<span style="width:6px;height:6px;border-radius:50%;background:' + (active ? 'var(--dm-accent)' : 'var(--dm-text-dim)') + ';"></span>';
      return '<button class="dm-icon-row-button" data-dm-children-align="' + c.h + '-' + c.v + '" data-active="' + (active ? 'true' : 'false') + '" title="Align children: ' + c.v + ' / ' + c.h + '" style="padding:0;display:flex;align-items:center;justify-content:center;">' + dot + '</button>';
    }).join('') +
    '</div>';
}

// clip-path structured representation. CSS supports several shape
// functions; we model them so the visual editor can rebuild the value
// from typed fields without forcing the user to write CSS by hand.
type ClipPathDef =
  | { kind: 'none' }
  | { kind: 'inset'; top: string; right: string; bottom: string; left: string }
  | { kind: 'circle'; r: string; x: string; y: string }
  | { kind: 'ellipse'; rx: string; ry: string; x: string; y: string }
  | { kind: 'polygon'; points: string }
  | { kind: 'path'; d: string }
  | { kind: 'url'; target: string }
  | { kind: 'custom'; raw: string };

function parseClipPath(raw: string): ClipPathDef {
  const v = (raw || 'none').trim();
  if (!v || v === 'none') return { kind: 'none' };
  let m;
  if ((m = v.match(/^inset\(([^)]*)\)\s*$/i))) {
    const parts = m[1].trim().split(/\s+/);
    const t = parts[0] || '0';
    const r = parts[1] || t;
    const b = parts[2] || t;
    const l = parts[3] || r;
    return { kind: 'inset', top: t, right: r, bottom: b, left: l };
  }
  if ((m = v.match(/^circle\(([^)]*)\)\s*$/i))) {
    const inner = m[1].trim();
    const at = inner.match(/^(.+?)\s+at\s+(.+)$/i);
    const r = at ? at[1].trim() : (inner || '50%');
    const center = (at ? at[2].trim() : '50% 50%').split(/\s+/);
    return { kind: 'circle', r, x: center[0] || '50%', y: center[1] || '50%' };
  }
  if ((m = v.match(/^ellipse\(([^)]*)\)\s*$/i))) {
    const inner = m[1].trim();
    const at = inner.match(/^(.+?)\s+at\s+(.+)$/i);
    const radii = (at ? at[1].trim() : inner).split(/\s+/);
    const center = (at ? at[2].trim() : '50% 50%').split(/\s+/);
    return {
      kind: 'ellipse',
      rx: radii[0] || '50%',
      ry: radii[1] || radii[0] || '50%',
      x: center[0] || '50%',
      y: center[1] || '50%',
    };
  }
  if ((m = v.match(/^polygon\(([^)]*)\)\s*$/i))) {
    return { kind: 'polygon', points: m[1].trim() };
  }
  if ((m = v.match(/^path\(\s*['"]?(.+?)['"]?\s*\)\s*$/i))) {
    return { kind: 'path', d: m[1] };
  }
  if ((m = v.match(/^url\(\s*['"]?#?(.+?)['"]?\s*\)\s*$/i))) {
    return { kind: 'url', target: m[1] };
  }
  return { kind: 'custom', raw: v };
}

function serializeClipPath(cp: ClipPathDef): string {
  switch (cp.kind) {
    case 'none': return 'none';
    case 'inset': return `inset(${cp.top} ${cp.right} ${cp.bottom} ${cp.left})`;
    case 'circle': return `circle(${cp.r} at ${cp.x} ${cp.y})`;
    case 'ellipse': return `ellipse(${cp.rx} ${cp.ry} at ${cp.x} ${cp.y})`;
    case 'polygon': return cp.points.trim() ? `polygon(${cp.points})` : 'none';
    case 'path': return cp.d ? `path('${cp.d}')` : 'none';
    case 'url': return cp.target ? `url(#${cp.target.replace(/^#/, '')})` : 'none';
    case 'custom': return cp.raw;
  }
}

function defaultClipPathFor(kind: ClipPathDef['kind']): ClipPathDef {
  switch (kind) {
    case 'inset': return { kind: 'inset', top: '0', right: '0', bottom: '0', left: '0' };
    case 'circle': return { kind: 'circle', r: '50%', x: '50%', y: '50%' };
    case 'ellipse': return { kind: 'ellipse', rx: '50%', ry: '50%', x: '50%', y: '50%' };
    case 'polygon': return { kind: 'polygon', points: '50% 0%, 100% 50%, 50% 100%, 0% 50%' };
    case 'path': return { kind: 'path', d: 'M 0 0 H 100 V 100 H 0 Z' };
    case 'url': return { kind: 'url', target: 'mask' };
    case 'custom': return { kind: 'custom', raw: 'none' };
    case 'none': default: return { kind: 'none' };
  }
}

// Parse a border-*-radius value into its X and Y components. CSS allows
// a single length (circular: X = Y) or two lengths (elliptical: X then Y).
function parseRadiusXY(val: string): [string, string] {
  const parts = (val || '0px').trim().split(/\s+/);
  const x = parts[0] || '0px';
  const y = parts[1] || x;
  return [x, y];
}

// Primary corner-radius value to surface on the appearance row's single
// input. When all four corners match, shows the value; when they vary,
// shows the literal "Mixed" string so the user can still see the cell
// without losing the differing per-corner state.
function cornerRadiusPrimary(s: Record<string, string>): string {
  const tl = s.borderTopLeftRadius || '0px';
  const tr = s.borderTopRightRadius || '0px';
  const bl = s.borderBottomLeftRadius || '0px';
  const br = s.borderBottomRightRadius || '0px';
  return (tl === tr && tr === bl && bl === br) ? tl : 'Mixed';
}

// Uniform corner-radius field. Mirrors spacingUniformField: always numeric,
// so typing a number over the 'Mixed' placeholder writes the border-radius
// shorthand and collapses all four corners to the typed value.
function cornerRadiusUniformField(s: Record<string, string>): string {
  const primary = cornerRadiusPrimary(s);
  const isMixed = primary === 'Mixed';
  const formatted = formatPxValueForDisplay(isMixed ? '0px' : primary);
  return '<div class="dm-field">' +
    '<div class="dm-input-shell" title="Corner radius">' +
    '<span class="dm-input-icon">' + icon('maximize', 12) + '</span>' +
    '<input type="text" class="dm-input dm-input-bare" data-dm-prop="borderRadius" data-dm-numeric="1" data-dm-unit="' + escapeAttr(formatted.writeUnit) + '" inputmode="decimal" placeholder="' + (isMixed ? 'Mixed' : '0') + '" value="' + escapeAttr(isMixed ? '' : formatted.display) + '"/>' +
    '<span class="dm-input-unit">' + formatted.unit + '</span>' +
    '</div></div>';
}

// Expanded 2×2 panel that drops below the Appearance row when the user
// clicks "Edit each corner". Each cell is a single numeric input wired
// straight to its border-*-radius long-form property — no virtual
// __corner_*_x / _y splicing — so the user types `0`, sees `0`, and
// the change tracker records the literal CSS. The elliptical X/Y form
// (`border-*-radius: 10px 20px`) is rare enough to live in the
// Advanced section's raw inputs; not worth the always-paired UI here.
function cornerRadius2x2(s: Record<string, string>): string {
  const cells: Array<{ glyph: string; prop: string; val: string; label: string }> = [
    { glyph: '┌', prop: 'borderTopLeftRadius',     val: s.borderTopLeftRadius     || '0px', label: 'top-left radius' },
    { glyph: '┐', prop: 'borderTopRightRadius',    val: s.borderTopRightRadius    || '0px', label: 'top-right radius' },
    { glyph: '└', prop: 'borderBottomLeftRadius',  val: s.borderBottomLeftRadius  || '0px', label: 'bottom-left radius' },
    { glyph: '┘', prop: 'borderBottomRightRadius', val: s.borderBottomRightRadius || '0px', label: 'bottom-right radius' },
  ];
  const cornerCell = (c: typeof cells[0]): string => {
    // The corner cell takes any value but renders px / rem per the
    // user's input-unit preference, matching the rest of the panel.
    // Round-corner-only: takes the first axis if the user has set an
    // elliptical pair (`10px 20px`); the second axis is editable in
    // Advanced. parseRadiusXY normalises elliptical → [x, y].
    const [xRaw] = parseRadiusXY(c.val);
    const formatted = formatPxValueForDisplay(xRaw);
    return '<div style="display:flex;align-items:center;gap:4px;min-width:0;background:var(--dm-input-bg);border:1px solid var(--dm-input-border);border-radius:5px;padding:4px 6px;">' +
      '<span style="font-family:SF Mono,Monaco,monospace;font-size:11px;color:var(--dm-text-muted);width:14px;flex-shrink:0;text-align:center;">' + c.glyph + '</span>' +
      '<input class="dm-input" data-dm-prop="' + c.prop + '" data-dm-numeric="1" data-dm-unit="' + escapeAttr(formatted.writeUnit) + '" inputmode="decimal" value="' + escapeAttr(formatted.display) + '" placeholder="0" title="' + c.label + '" aria-label="' + c.label + '" style="background:none;border:none;padding:2px;flex:1;min-width:0;font-size:11px;"/>' +
      '<span style="font-size:9px;color:var(--dm-text-dim);flex-shrink:0;">' + formatted.unit + '</span>' +
    '</div>';
  };
  return '<div class="dm-corner-grid">' + cells.map(cornerCell).join('') + '</div>';
}

// Figma-style uniform value for margin / padding — the shared value when all
// four sides match, else 'Mixed'. Mirrors cornerRadiusPrimary.
function spacingPrimary(s: Record<string, string>, kind: 'margin' | 'padding'): string {
  const t = s[kind + 'Top'] || '0px';
  const r = s[kind + 'Right'] || '0px';
  const b = s[kind + 'Bottom'] || '0px';
  const l = s[kind + 'Left'] || '0px';
  return (t === r && r === b && b === l) ? t : 'Mixed';
}

// Uniform margin / padding field. Always numeric so editing it — including
// typing a number over the 'Mixed' placeholder — writes the shorthand
// (`margin` / `padding`) and sets all four sides at once.
function spacingUniformField(label: string, kind: 'margin' | 'padding', s: Record<string, string>): string {
  const primary = spacingPrimary(s, kind);
  const isMixed = primary === 'Mixed';
  const formatted = formatPxValueForDisplay(isMixed ? '0px' : primary);
  return '<div class="dm-field">' +
    '<label class="dm-field-label">' + label + '</label>' +
    '<div class="dm-input-shell">' +
    '<input type="text" class="dm-input dm-input-bare" data-dm-prop="' + kind + '" data-dm-numeric="1" data-dm-unit="' + escapeAttr(formatted.writeUnit) + '" inputmode="decimal" placeholder="' + (isMixed ? 'Mixed' : '0') + '" value="' + escapeAttr(isMixed ? '' : formatted.display) + '"/>' +
    renderTokenBadge(kind) +
    '<span class="dm-input-unit">' + formatted.unit + '</span>' +
    '</div>' + renderTokenOverlays(kind) + '</div>';
}

// Per-side icon for the expanded editor. Margin uses gallery-thumbnails
// oriented toward each side; padding uses the panel-*-dashed set.
function spacingSideIcon(kind: 'margin' | 'padding', side: 'top' | 'right' | 'bottom' | 'left'): string {
  if (kind === 'margin') {
    const tf = side === 'top' ? 'scaleY(-1)' : side === 'right' ? 'rotate(90deg)' : side === 'left' ? 'rotate(-90deg)' : '';
    return '<span style="display:inline-flex;align-items:center;justify-content:center;width:14px;flex-shrink:0;color:var(--dm-text-muted);' + (tf ? 'transform:' + tf + ';' : '') + '">' + icon('galleryThumbnails', 13) + '</span>';
  }
  const name = side === 'top' ? 'panelTopDashed' : side === 'bottom' ? 'panelBottomDashed' : side === 'left' ? 'panelLeftDashed' : 'panelRightDashed';
  return '<span style="display:inline-flex;align-items:center;justify-content:center;width:14px;flex-shrink:0;color:var(--dm-text-muted);">' + icon(name as keyof typeof icons, 13) + '</span>';
}

// Expanded per-side editor for margin / padding (top / right / bottom / left),
// dropping below the uniform field. Two columns so each cell is 3 of the 12
// layout cols (half of its 6-col region). Each cell writes its longhand.
function spacing2x2(s: Record<string, string>, kind: 'margin' | 'padding'): string {
  const cells: Array<{ side: 'top' | 'right' | 'bottom' | 'left'; prop: string; val: string; label: string }> = [
    { side: 'top',    prop: kind + 'Top',    val: s[kind + 'Top']    || '0px', label: kind + ' top' },
    { side: 'right',  prop: kind + 'Right',  val: s[kind + 'Right']  || '0px', label: kind + ' right' },
    { side: 'bottom', prop: kind + 'Bottom', val: s[kind + 'Bottom'] || '0px', label: kind + ' bottom' },
    { side: 'left',   prop: kind + 'Left',   val: s[kind + 'Left']   || '0px', label: kind + ' left' },
  ];
  const cell = (c: typeof cells[0]): string => {
    const formatted = formatPxValueForDisplay(c.val);
    return '<div style="display:flex;align-items:center;gap:4px;min-width:0;background:var(--dm-input-bg);border:1px solid var(--dm-input-border);border-radius:5px;padding:4px 6px;">' +
      spacingSideIcon(kind, c.side) +
      '<input class="dm-input" data-dm-prop="' + c.prop + '" data-dm-numeric="1" data-dm-unit="' + escapeAttr(formatted.writeUnit) + '" inputmode="decimal" value="' + escapeAttr(formatted.display) + '" placeholder="0" title="' + escapeAttr(c.label) + '" aria-label="' + escapeAttr(c.label) + '" style="background:none;border:none;padding:2px;flex:1;min-width:0;font-size:11px;"/>' +
      '<span style="font-size:9px;color:var(--dm-text-dim);flex-shrink:0;">' + formatted.unit + '</span>' +
    '</div>';
  };
  return '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">' + cells.map(cell).join('') + '</div>';
}

function inferStrokePosition(s: Record<string, string>): 'inside' | 'outside' | 'center' {
  // First-visit-only heuristic: pick the position that has actual paint
  // on the element so the editor opens to a useful tab. After the first
  // visit, `strokeActiveTab` overrides this — see `getStrokeActiveTab`.
  const entries = parseCssCommaList(s.boxShadow || '');
  let hasInside = false;
  let hasOutside = false;
  for (const e of entries) {
    const p = parseShadowEntry(e);
    if (!p) continue;
    if (p.x !== 0 || p.y !== 0 || p.blur !== 0 || p.spread < 0) continue;
    if (p.inset) hasInside = true;
    else hasOutside = true;
  }
  if (hasInside) return 'inside';
  if (hasOutside) return 'outside';
  const ol = (s.outlineStyle || '').trim();
  const olActive = ol && ol !== 'none' && ol !== 'auto';
  if (olActive) return 'center';
  return 'outside';
}

function strokePositionRow(_s: Record<string, string>, current: 'inside' | 'outside' | 'center'): string {
  // Tab order: Outside → Center → Inside. Outside is the most common
  // (matches `border-*`); Center is the next-most-common (outline);
  // Inside is the niche box-shadow trick. Reading left-to-right matches
  // "where does the stroke sit relative to the box edge" — outside, on
  // the edge (centered), inside.
  return segmentedRow([
    { label: 'Outside', attr: 'data-dm-stroke-pos="outside"', active: current === 'outside', title: 'Stroke outside (border)' },
    { label: 'Center',  attr: 'data-dm-stroke-pos="center"',  active: current === 'center',  title: 'Stroke centered (outline + offset)' },
    { label: 'Inside',  attr: 'data-dm-stroke-pos="inside"',  active: current === 'inside',  title: 'Stroke inside (inset shadow — only solid renders)' },
  ]);
}

function sidesPopoverTrigger(s: Record<string, string>, isOpen: boolean): string {
  const trigger = '<button class="dm-section-action" data-dm-sides-popover title="Side selection" data-active="' + (isOpen ? 'true' : 'false') + '">' +
    icon('sliders', 11) + '</button>';
  if (!isOpen) return '<div style="position:relative;display:inline-flex;">' + trigger + '</div>';
  const bt = parseFloat(s.borderTopWidth || '0') || 0;
  const br = parseFloat(s.borderRightWidth || '0') || 0;
  const bb = parseFloat(s.borderBottomWidth || '0') || 0;
  const bl = parseFloat(s.borderLeftWidth || '0') || 0;
  const allEqual = bt === br && br === bb && bb === bl && bt > 0;
  const items: PopoverItem[] = [
    { icon: 'squareDashed', label: 'All', attr: 'data-dm-side="all"', active: allEqual },
    { icon: 'arrowUp', label: 'Top', attr: 'data-dm-side="top"', active: bt > 0 && !allEqual },
    { icon: 'arrowDown', label: 'Bottom', attr: 'data-dm-side="bottom"', active: bb > 0 && !allEqual },
    { icon: 'chevronLeft', label: 'Left', attr: 'data-dm-side="left"', active: bl > 0 && !allEqual },
    { icon: 'chevronRight', label: 'Right', attr: 'data-dm-side="right"', active: br > 0 && !allEqual },
    { divider: true, label: '', attr: '' },
    { icon: 'sliders', label: 'Custom', attr: 'data-dm-side="custom"', active: !allEqual && (bt > 0 || br > 0 || bb > 0 || bl > 0) },
  ];
  return '<div style="position:relative;display:inline-flex;">' + trigger + popover(items) + '</div>';
}

function effectsAddMenuTrigger(isOpen: boolean): string {
  const trigger = '<button class="dm-section-action" data-dm-effects-menu title="Add effect" data-active="' + (isOpen ? 'true' : 'false') + '">' +
    icon('plus', 12) + '</button>';
  if (!isOpen) return '<div style="position:relative;display:inline-flex;">' + trigger + '</div>';
  // Figma-aligned 6-effect set. Drop shadow alone covers what used to
  // be three siblings (Drop / Text / Filter drop-shadow); the row's
  // "Show behind transparent areas" checkbox switches between the
  // three underlying CSS paths.
  const items: PopoverItem[] = [
    { icon: 'squareStack', label: 'Inner shadow', attr: 'data-dm-add-effect="inner-shadow"' },
    { icon: 'sparkles', label: 'Drop shadow', attr: 'data-dm-add-effect="drop-shadow"' },
    { icon: 'eye', label: 'Layer blur', attr: 'data-dm-add-effect="layer-blur"' },
    { icon: 'panelRight', label: 'Background blur', attr: 'data-dm-add-effect="backdrop-blur"' },
    { icon: 'sparkles', label: 'Noise', attr: 'data-dm-add-effect="noise"' },
    { icon: 'sparkles', label: 'Texture', attr: 'data-dm-add-effect="texture"' },
  ];
  return '<div style="position:relative;display:inline-flex;">' + trigger + popover(items) + '</div>';
}

// Motion add-menu — its own popover with the time/animation kinds that
// used to share the Effects + menu. State lives in `motionMenuOpen` so
// the two popovers don't fight each other.
function motionAddMenuTrigger(isOpen: boolean): string {
  const trigger = '<button class="dm-section-action" data-dm-motion-menu title="Add motion" data-active="' + (isOpen ? 'true' : 'false') + '">' +
    icon('plus', 12) + '</button>';
  if (!isOpen) return '<div style="position:relative;display:inline-flex;">' + trigger + '</div>';
  const items: PopoverItem[] = [
    { icon: 'play', label: 'Transition', attr: 'data-dm-add-effect="transition"' },
    { icon: 'activity', label: 'Animation', attr: 'data-dm-add-effect="animation"' },
    { icon: 'move', label: 'Transform', attr: 'data-dm-add-effect="transform"' },
    { icon: 'compass', label: 'Motion path', attr: 'data-dm-add-effect="motion-path"' },
    { icon: 'shuffle', label: 'View transition', attr: 'data-dm-add-effect="view-transition"' },
    { icon: 'arrowUpDown', label: 'Scroll-driven animation', attr: 'data-dm-add-effect="scroll-driven"' },
  ];
  return '<div style="position:relative;display:inline-flex;">' + trigger + popover(items) + '</div>';
}

function advancedDisclosure(key: string, isOpen: boolean, content: string): string {
  if (!isOpen) return '';
  return '<div data-dm-advanced-body="' + escapeAttr(key) + '" style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--dm-separator);">' + content + '</div>';
}

function advancedToggleBtn(key: string, isOpen: boolean): string {
  return '<button class="dm-section-action dm-advanced-toggle" data-dm-advanced-toggle="' + escapeAttr(key) + '" data-open="' + (isOpen ? 'true' : 'false') + '" title="' +
    (isOpen ? 'Hide advanced' : 'Show advanced') + '">' + icon('sliders', 11) + '</button>';
}

function eyeToggleBtn(attr: string, isOff: boolean, title: string): string {
  return '<button class="dm-section-action" ' + attr + ' data-active="' + (isOff ? 'false' : 'true') + '" title="' + escapeAttr(title) + '">' +
    icon(isOff ? 'eyeOff' : 'eye', 12) + '</button>';
}

function plusActionBtn(attr: string, title: string): string {
  return '<button class="dm-section-action" ' + attr + ' title="' + escapeAttr(title) + '">' + icon('plus', 12) + '</button>';
}

void strokeStylePopoverOpen; void plusActionBtn; void eyeToggleBtn; void advancedDisclosure;
void advancedToggleBtn; void cornerRadius2x2; void cornerRadiusPrimary; void strokePositionRow; void sidesPopoverTrigger;
void effectsAddMenuTrigger; void inferStrokePosition; void layoutModeRow; void positionAlignGrid;
void flipButtons; void detectParentContext;

/* ── Layered-list helpers (Fill / Stroke / Effects) ──
   CSS comma-separated lists with paren-balanced respect. Used by every
   layered editor below. */
function parseCssCommaList(input: string): string[] {
  if (!input || input === 'none' || input === 'normal') return [];
  const out: string[] = [];
  let depth = 0, cur = '';
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '(') { depth++; cur += ch; }
    else if (ch === ')') { depth--; cur += ch; }
    else if (ch === ',' && depth === 0) { if (cur.trim()) out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// Fill layers — top of array paints on TOP (CSS comma-list order). The
// serializer figures out which solid (if any) gets the
// `background-color` slot; everything else lands in `background-image`,
// with extra solids encoded as `linear-gradient(<c>, <c>)` so the
// stack survives CSS's one-bg-color-per-element rule.
type FillLayerKind = 'solid' | 'linear' | 'radial' | 'conic' | 'image';
type FillLayer = {
  kind: FillLayerKind;
  raw: string;             // for solid: color; otherwise the full CSS entry for background-image
  // Legacy hint — older serialized sessions still carry it. New code
  // shouldn't read this; serialization picks the bottom-most solid for
  // the `background-color` slot regardless of the flag.
  bgColorOnly?: boolean;
  visible: boolean;        // when false, the layer is dropped from CSS but kept in our state
  // Per-layer comma-positional background-* properties. Default to undefined
  // so the serializer can omit slots and let CSS use the default.
  size?: string;
  repeat?: string;
  position?: string;
  blendMode?: string;
};

// Per-element fill state. Once an element's layers are mutated through the
// panel, this map becomes the source of truth (we no longer reparse from
// computed styles for that element). Re-seeded on first edit; survives
// across selections so hidden layers don't get lost.
const fillLayersByElement = new Map<string, FillLayer[]>();

// Per-element settings-panel expansion state for non-solid fills. The
// solid-fill row owns its own inline edit; only gradients / images
// open the settings drawer when the user clicks the gear.
// (kept on `expandedFillIdx`, declared near the other panel state).

// Figma-style fill cap. CSS itself can stack more, but anything above
// this is almost certainly a runaway — the user gets a toast instead
// of an opaque "Add fill" no-op.
const FILL_LIMIT = 32;

// Multi-stroke cap. Tighter than fills because each extra stroke is a
// concentric ring expressed as a box-shadow chain entry — once you're
// past ~5 the visual is already a thick rainbow border that's hard to
// read, and the bookkeeping for per-layer weight / colour gets noisy
// in the panel.
const STROKE_LIMIT = 5;

// ── Layout Guide ─────────────────────────────────────────────────────
// Figma-style non-intrusive design overlay: vertical / horizontal /
// grid bars painted over the selected element via a `::before`
// pseudo-element. Doesn't affect layout; lives in its own background
// chain so it composes with the rest of the page's CSS.
type LayoutGuideKind = 'grid' | 'columns' | 'rows';
type LayoutGuideAlign = 'stretch' | 'left' | 'center' | 'right' | 'top' | 'bottom';
interface LayoutGuideLayer {
  kind: LayoutGuideKind;
  count: number;
  color: string;         // hex or rgb(); opacity stored separately, baked in at serialize time
  opacity: number;       // 0..100
  visible: boolean;
  align: LayoutGuideAlign;
  size: string;          // 'auto' | 'Npx' — track width for columns, height for rows, cell for grid
  margin: string;        // 'Npx' — outer offset (columns/rows only)
  gutter: string;        // 'Npx' — spacing between tracks (columns/rows) / cells (grid)
}

const LAYOUT_GUIDE_LIMIT = 5;
const layoutGuidesByElement = new Map<string, LayoutGuideLayer[]>();
// Per-element CSS selector at the time the guide was last touched.
// Used to re-resolve the element on page reload — the content script
// loses its data-dm-id stamps on reload, so on STATE_UPDATE we re-push
// every guide with its selector and content stamps the matching node
// back with its original dm-id. Lets page reloads preserve guides as
// long as the side panel is still open.
const guideSelectorsByElement = new Map<string, string>();
// Per-element section-wide hide flag — when set, the overlay is
// suppressed on the page while the panel's row state is preserved, so
// toggling the section eye on/off restores exactly what was there.
const layoutGuidesSectionHidden = new Set<string>();
let expandedGuideIdx: number | null = null;
let draggingGuideIdx: number | null = null;

function defaultLayoutGuide(): LayoutGuideLayer {
  return {
    kind: 'columns',
    count: 12,
    color: '#ff3366',
    opacity: 10,
    visible: true,
    align: 'stretch',
    size: 'auto',
    margin: '0',
    gutter: '20',
  };
}

// Push the per-element layer array to the content script's overlay
// stylesheet. Bypasses the change-tracker entirely: layout guides are a
// session-only visual aid, not a CSS edit. The side panel keeps the
// authoritative map (`layoutGuidesByElement`); content keeps the same
// state for rendering and exposes it back to the panel on selection so
// closing/reopening the panel doesn't drop the user's config.
function dispatchLayoutGuides(elementId: string, layers: LayoutGuideLayer[]): void {
  if (!elementId) return;
  // Stamp the selector at write time so a later restore (after page
  // reload while panel is open) can resolve the element by selector
  // when data-dm-id stamps reset. We pull the selector from the
  // currently-focused info if it matches; otherwise fall back to any
  // previously stored one.
  if (info?.id === elementId && (info as any).selector) {
    guideSelectorsByElement.set(elementId, (info as any).selector);
  }
  send({
    type: 'SP_SET_LAYOUT_GUIDES',
    elementId,
    selector: guideSelectorsByElement.get(elementId) || '',
    layers,
    sectionVisible: !layoutGuidesSectionHidden.has(elementId),
  });
}

// Re-push every known guide to content after a page reload. STATE_UPDATE
// fires from the content script ~1s after enable(), which is exactly
// when content is fresh and has no guides yet. The panel's
// layoutGuidesByElement survives the reload (the panel is a separate
// document), so we just walk it and dispatch each entry.
function restoreLayoutGuidesAfterReload(): void {
  for (const [id, layers] of layoutGuidesByElement) {
    dispatchLayoutGuides(id, layers);
  }
}

// Absorb a content-side layout-guide snapshot back into the panel's
// own map. The snapshot arrives on every ELEMENT_SELECTED / select
// response so the panel re-hydrates after a close/reopen — content
// outlives the panel, so it's the authoritative session memory.
function hydrateLayoutGuidesFromPayload(payload: any): void {
  if (!payload || !payload.id) return;
  // Always record the selector for the focused element so future
  // restores have it, even when the snapshot is empty.
  if (payload.selector) guideSelectorsByElement.set(payload.id, payload.selector);
  const snapshot = payload.layoutGuides;
  if (!snapshot) {
    // No snapshot in payload — leave the panel's map alone.
    return;
  }
  if (Array.isArray(snapshot.layers) && snapshot.layers.length) {
    layoutGuidesByElement.set(payload.id, snapshot.layers);
    if (snapshot.sectionVisible === false) layoutGuidesSectionHidden.add(payload.id);
    else layoutGuidesSectionHidden.delete(payload.id);
  } else {
    layoutGuidesByElement.delete(payload.id);
    layoutGuidesSectionHidden.delete(payload.id);
  }
}
function getLayoutGuides(id: string): LayoutGuideLayer[] {
  if (!id) return [];
  const cached = layoutGuidesByElement.get(id);
  if (cached) return cached;
  return [];
}
function setLayoutGuides(id: string, layers: LayoutGuideLayer[]): void {
  layoutGuidesByElement.set(id, layers);
}

// Split a color into its base (no alpha) + opacity 0-1. Solid fills in
// the panel store opacity as the alpha channel of the CSS color so the
// single `background-color` write covers both; we keep the two visible
// inputs in sync by decomposing on read and re-composing on write.
function splitColorOpacity(raw: string): { color: string; opacity: number } {
  const v = (raw || '').trim();
  // rgb(R, G, B) or rgba(R, G, B, A) — also handle modern space-separated.
  const rgbaM = v.match(/^rgba?\(\s*([^)]+)\)$/i);
  if (rgbaM) {
    const tokens = rgbaM[1].split(/[\s,\/]+/).filter(Boolean);
    if (tokens.length >= 3) {
      const r = Math.round(parseFloat(tokens[0]));
      const g = Math.round(parseFloat(tokens[1]));
      const b = Math.round(parseFloat(tokens[2]));
      const aTok = tokens[3];
      let a = 1;
      if (aTok !== undefined) {
        a = aTok.endsWith('%') ? parseFloat(aTok) / 100 : parseFloat(aTok);
        if (isNaN(a)) a = 1;
      }
      return { color: `rgb(${r}, ${g}, ${b})`, opacity: Math.max(0, Math.min(1, a)) };
    }
  }
  // #RRGGBBAA — split alpha out into the opacity field.
  const hex8 = v.match(/^#([0-9a-fA-F]{8})$/);
  if (hex8) {
    return { color: '#' + hex8[1].slice(0, 6), opacity: parseInt(hex8[1].slice(6, 8), 16) / 255 };
  }
  // #RGB / #RRGGBB / named / token — no alpha component, opacity 1.
  return { color: v || '#000000', opacity: 1 };
}

function combineColorOpacity(color: string, opacity: number): string {
  const clampedA = Math.max(0, Math.min(1, opacity));
  if (clampedA >= 0.9999) return color || '#000000';
  const rgb = parseColorRgb(color);
  if (!rgb) return color || '#000000';
  const a = Math.round(clampedA * 1000) / 1000;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`;
}

function parseFillLayers(s: Record<string, string>): FillLayer[] {
  // Per-property comma lists, aligned to background-image entries by index.
  const sizes = parseCssCommaList(s.backgroundSize || '');
  const repeats = parseCssCommaList(s.backgroundRepeat || '');
  const positions = parseCssCommaList(s.backgroundPosition || '');
  const blends = parseCssCommaList((s as any).backgroundBlendMode || '');

  const layers: FillLayer[] = [];
  const bgImg = s.backgroundImage || 'none';
  let i = 0;
  for (const v of parseCssCommaList(bgImg)) {
    // CSS holds one background-color but the panel lets users stack
    // multiple "solid" fills. Extras land in background-image as a
    // single-color `linear-gradient(<c>, <c>)`. Detect that pattern on
    // the way back in and surface it as a solid layer — otherwise the
    // round-trip would silently demote the user's solid to a gradient.
    const soloColor = isSingleColorLinearGradient(v);
    if (soloColor) {
      layers.push({
        kind: 'solid',
        raw: soloColor,
        visible: true,
      });
      i++;
      continue;
    }
    let kind: FillLayerKind = 'image';
    if (/^(linear|repeating-linear)-gradient/.test(v)) kind = 'linear';
    else if (/^(radial|repeating-radial)-gradient/.test(v)) kind = 'radial';
    else if (/^(conic|repeating-conic)-gradient/.test(v)) kind = 'conic';
    else if (v.startsWith('url(')) kind = 'image';
    else { i++; continue; } // unknown — skip
    layers.push({
      kind,
      raw: v,
      visible: true,
      size: sizes[i],
      repeat: repeats[i],
      position: positions[i],
      blendMode: blends[i],
    });
    i++;
  }
  // Solid backed by background-color — append at the bottom of our
  // stack. Visually it paints under all background-image entries,
  // which matches its position in the array (the UI shows array index
  // 0 on top, so the last element renders at the bottom).
  const bgColor = (s.backgroundColor || 'transparent').replace(/\s+/g, '');
  if (bgColor && bgColor !== 'rgba(0,0,0,0)' && bgColor !== 'transparent') {
    layers.push({
      kind: 'solid',
      raw: s.backgroundColor || 'transparent',
      visible: true,
    });
  }
  return layers;
}

// Recognise `linear-gradient(<color>, <color>)` (with matching stops) as
// a single-color fill — that's how the panel encodes a second solid
// layer when CSS's one background-color slot is already taken. Returns
// the colour to use, or null if `v` is a real gradient.
function isSingleColorLinearGradient(v: string): string | null {
  if (!/^linear-gradient\(/i.test(v)) return null;
  const parsed = parseGradientStops(v);
  if (parsed.stops.length !== 2) return null;
  // Allow either form: with or without an angle prefix. Both stops must
  // share the same colour text; positions don't matter (default 0% /
  // 100%) — if the colours match the gradient renders as a flat fill.
  const a = parsed.stops[0].color.trim().toLowerCase().replace(/\s+/g, '');
  const b = parsed.stops[1].color.trim().toLowerCase().replace(/\s+/g, '');
  if (!a || a !== b) return null;
  return parsed.stops[0].color.trim();
}

// Serialize the full fill state into the four comma-positional CSS
// properties. Hidden layers are skipped (preserved in state but not in
// CSS). When multiple solid layers exist, the bottom-most one writes
// `background-color` and the others become single-color
// `linear-gradient(<c>, <c>)` entries in `background-image` — that's
// how CSS lets us stack what Figma exposes as plain solid fills.
function serializeFillLayers(layers: FillLayer[]): {
  backgroundColor: string;
  backgroundImage: string;
  backgroundSize: string;
  backgroundRepeat: string;
  backgroundPosition: string;
  backgroundBlendMode: string;
} {
  const visible = layers.filter(l => l.visible !== false);
  // Pick the bottom-most solid (highest array index) for the
  // `background-color` slot — visually it paints under the rest, which
  // matches its position at the end of the stack.
  let bgColorLayer: FillLayer | null = null;
  for (let i = visible.length - 1; i >= 0; i--) {
    if (visible[i].kind === 'solid') { bgColorLayer = visible[i]; break; }
  }
  type Entry = { raw: string; size: string; repeat: string; position: string; blend: string };
  const entries: Entry[] = [];
  for (const l of visible) {
    if (l === bgColorLayer) continue;
    if (l.kind === 'solid') {
      // Stack-supporting solid → single-color linear gradient. The
      // per-layer comma-positional properties use safe defaults
      // (cover / no-repeat / center / normal) since a flat colour
      // doesn't need tiling or positioning.
      const c = l.raw;
      entries.push({ raw: 'linear-gradient(' + c + ', ' + c + ')', size: 'auto', repeat: 'no-repeat', position: '0% 0%', blend: 'normal' });
    } else {
      entries.push({
        raw: l.raw,
        size: l.size || 'auto',
        repeat: l.repeat || 'repeat',
        position: l.position || '0% 0%',
        blend: l.blendMode || 'normal',
      });
    }
  }
  const sizes = entries.map(e => e.size);
  const repeats = entries.map(e => e.repeat);
  const positions = entries.map(e => e.position);
  const blends = entries.map(e => e.blend);
  const allDefault = (arr: string[], def: string) => arr.every(v => v === def);
  return {
    backgroundColor: bgColorLayer ? bgColorLayer.raw : 'transparent',
    backgroundImage: entries.length ? entries.map(e => e.raw).join(', ') : 'none',
    backgroundSize: entries.length && !allDefault(sizes, 'auto') ? sizes.join(', ') : 'auto',
    backgroundRepeat: entries.length && !allDefault(repeats, 'repeat') ? repeats.join(', ') : 'repeat',
    backgroundPosition: entries.length && !allDefault(positions, '0% 0%') ? positions.join(', ') : '0% 0%',
    backgroundBlendMode: entries.length && !allDefault(blends, 'normal') ? blends.join(', ') : 'normal',
  };
}

// Get-or-create the per-element layer state. Once an element has been edited
// through the panel, this is authoritative; otherwise parse fresh from CSS.
function getFillLayers(id: string, s: Record<string, string>): FillLayer[] {
  const existing = fillLayersByElement.get(id);
  if (existing) return existing;
  const fresh = parseFillLayers(s);
  fillLayersByElement.set(id, fresh);
  return fresh;
}

// After a mutation, dispatch the four CSS properties at once.
function dispatchFillLayers(layers: FillLayer[], applyStyle: (p: string, v: string) => void): void {
  const css = serializeFillLayers(layers);
  applyStyle('backgroundColor', css.backgroundColor);
  applyStyle('backgroundImage', css.backgroundImage);
  applyStyle('backgroundSize', css.backgroundSize);
  applyStyle('backgroundRepeat', css.backgroundRepeat);
  applyStyle('backgroundPosition', css.backgroundPosition);
  applyStyle('backgroundBlendMode', css.backgroundBlendMode);
}

// Gradient stop parsing — split the function args, peel off the angle/shape
// prefix, and parse remaining tokens as stops. Forgiving: any token without
// a recognisable position becomes a stop with empty position.
type GradientStop = { color: string; position: string };
function parseGradientStops(raw: string): { prefix: string; stops: GradientStop[] } {
  const m = raw.match(/^[a-z-]+\((.*)\)\s*$/i);
  if (!m) return { prefix: '', stops: [] };
  const parts = parseCssCommaList(m[1]);
  let prefix = '';
  let stopParts = parts;
  // First part is config (no leading color token) when it looks like an angle / shape / from-clause
  const first = (parts[0] || '').trim();
  const looksLikeConfig = /^(\d|to\b|from\b|circle|ellipse|at\b|farthest|closest|-?\d*\.?\d+(deg|turn|grad|rad)\b)/i.test(first)
    && !/^(rgb|rgba|hsl|hsla|#|var|currentcolor|transparent)/i.test(first);
  if (looksLikeConfig) {
    prefix = first;
    stopParts = parts.slice(1);
  }
  const stops: GradientStop[] = stopParts.map(p => {
    const t = p.trim();
    // Strip a trailing length/percentage token from the end
    const posMatch = t.match(/^(.+?)\s+(-?\d+(?:\.\d+)?(?:px|%|em|rem|vw|vh|vmin|vmax|fr|deg|turn|grad|rad)?)\s*$/);
    if (posMatch) return { color: posMatch[1].trim(), position: posMatch[2] };
    return { color: t, position: '' };
  });
  return { prefix, stops };
}

function buildGradient(kind: 'linear' | 'radial' | 'conic', prefix: string, stops: GradientStop[]): string {
  const stopStr = stops.map(s => s.color + (s.position ? ' ' + s.position : '')).join(', ');
  const def = kind === 'linear' ? '180deg' : kind === 'radial' ? 'circle' : 'from 0deg';
  const head = prefix.trim() || def;
  return kind + '-gradient(' + head + ', ' + stopStr + ')';
}

// Build a single fill row using the existing layeredRow head, plus a
// draggable wrapper so the user can reorder via HTML5 drag-and-drop.
function renderFillRow(layer: FillLayer, idx: number, swatch: string, label: string, expanded: boolean, body: string): string {
  const inner = layeredRow({
    idx,
    prefix: 'fill',
    swatch,
    label,
    visible: layer.visible !== false,
    expanded,
    body,
  });
  // The wrapper carries `draggable` + the row index. Drop targets are the
  // same wrappers — handled by global dragover/drop listeners.
  return '<div data-dm-fill-row="' + idx + '" draggable="true">' + inner + '</div>';
}

// Solid fill row — Figma-style inline editor. No settings icon to wade
// through; the swatch click opens the colour picker directly below the
// row, the colour-code field is editable in place, opacity sits next
// to it as a locked-suffix %, and the visibility / delete actions only
// appear on hover so the resting state stays calm. The split into
// color + alpha is local to the panel: at the CSS layer we still write
// the resulting `background-color` (with rgba() when opacity < 1).
function renderFillSolidRow(layer: FillLayer, idx: number): string {
  const { color, opacity } = splitColorOpacity(layer.raw);
  const colorDisplay = formatColorForDisplay(color);
  const pctOpacity = Math.max(0, Math.min(100, Math.round(opacity * 100)));
  const swatchProp = '__fill_color__' + idx;
  const swatchOpen = activeColorPickerProp === swatchProp;
  const visible = layer.visible !== false;
  // Resolve `var(--name)` against the design-tokens cache before
  // handing the colour to the swatch's inline `background:` — the
  // panel's own stylesheet doesn't see the host page's custom
  // properties, so `background: var(--accent)` would render as
  // transparent inside the side panel. Fallback to the raw value
  // (which covers plain hex / rgb / rgba) when the token isn't found.
  const swatchBg = resolveCssVarToColor(color) || color || '#000';
  // Swatch — clickable colour preview. Opening outline indicates the
  // active state so the user can tell which fill's panel is open.
  const swatchBtn = '<button type="button" class="dm-fill-swatch" data-dm-color-trigger="' + swatchProp + '" title="Pick a colour" style="background:' + safeCssColor(swatchBg) + ';outline:' + (swatchOpen ? '2px solid var(--dm-accent)' : 'none') + ';outline-offset:1px;"></button>';
  // Colour code — uses data-dm-tokens-trigger so focusing the field
  // opens the design-token dropdown the rest of the panel uses for
  // colour inputs. Writes through __fill_color__N (the existing handler
  // already updates layer.raw and re-dispatches), preserving the alpha
  // we read from the opacity field.
  const codeInput = '<input type="text" class="dm-fill-code" data-dm-prop="' + swatchProp + '" data-dm-tokens-trigger="' + swatchProp + '" value="' + escapeAttr(colorDisplay) + '" spellcheck="false" autocomplete="off"/>';
  // Opacity — same locked-% pattern as Appearance > Opacity. The
  // __fill_opacity__N handler reconstructs an rgba() and writes through.
  const opacityCell =
    '<div class="dm-fill-opacity">' +
    '<input type="text" class="dm-input dm-input-bare" data-dm-prop="__fill_opacity__' + idx + '" data-dm-numeric="1" data-dm-unit="" inputmode="decimal" value="' + pctOpacity + '"/>' +
    '<span class="dm-input-unit">%</span>' +
    '</div>';
  // Hover-revealed actions on the right edge — eye toggle + delete.
  const eyeBtn = '<button class="dm-fill-action dm-fill-action-hover" data-dm-fill-toggle="' + idx + '" title="' + (visible ? 'Hide fill' : 'Show fill') + '" data-active="' + (visible ? 'true' : 'false') + '">' + icon(visible ? 'eye' : 'eyeOff', 12) + '</button>';
  const trashBtn = '<button class="dm-fill-action dm-fill-action-hover" data-dm-fill-remove="' + idx + '" title="Remove fill" style="color:var(--dm-danger);">' + icon('trash', 12) + '</button>';
  // Drag handle uses the same Layers-tab pattern (a <span>, not a
  // <button>) so Chromium reliably initiates a drag from it instead of
  // capturing focus on the way down.
  const grip = '<span class="dm-section-action" data-dm-fill-drag="' + idx + '" title="Drag to reorder" style="cursor:grab;flex-shrink:0;">' + icon('gripVertical', 12) + '</span>';
  const row =
    '<div class="dm-fill-row-solid">' +
      grip + swatchBtn + codeInput + opacityCell + eyeBtn + trashBtn +
    '</div>';
  // Colour panel renders BELOW the row when the swatch is active.
  // Same picker as the rest of the panel uses elsewhere — keeps the
  // token list / eyedropper consistent.
  const colorPanel = swatchOpen ? renderColorPanel(swatchProp, color) : '';
  return '<div data-dm-fill-row="' + idx + '" draggable="true" style="margin-bottom:6px;">' + row + colorPanel + '</div>';
}

// Per-layer expanded body. Gradients get a visual stop list. Solids get a
// colour picker (writes to virtual __fill_color__N). Images get a URL
// input. All non-solid layers get the per-layer size / repeat / position /
// blend selects beneath the type-specific editor.
// Parse a `background-position` value (1 or 2 tokens) into "X Y". Maps the
// CSS keywords (`left`, `center`, `right`, `top`, `bottom`) to their
// percentage equivalents so the 9-cell pad can match against canonical
// "<x>% <y>%" cell values.
function normalizePosition(raw: string): string {
  const map: Record<string, string> = {
    'left': '0%', 'center': '50%', 'right': '100%',
    'top': '0%', 'bottom': '100%',
  };
  const parts = (raw || '0% 0%').trim().split(/\s+/).map(t => map[t.toLowerCase()] ?? t);
  const x = parts[0] || '0%';
  // CSS: when only one value is given, the other defaults to `center`.
  const y = parts[1] || (parts.length === 1 ? '50%' : '0%');
  return x + ' ' + y;
}

// 9-cell position pad — replaces the 3×3 keyword select with a visual
// grid of buttons. Each cell carries the `X% Y%` it writes.
function fillPositionPad(idx: number, value: string): string {
  const norm = normalizePosition(value);
  const cells: Array<{ pos: string; glyph: string; title: string }> = [
    { pos: '0% 0%',     glyph: '↖', title: 'Top-left' },
    { pos: '50% 0%',    glyph: '↑', title: 'Top' },
    { pos: '100% 0%',   glyph: '↗', title: 'Top-right' },
    { pos: '0% 50%',    glyph: '←', title: 'Left' },
    { pos: '50% 50%',   glyph: '·', title: 'Center' },
    { pos: '100% 50%',  glyph: '→', title: 'Right' },
    { pos: '0% 100%',   glyph: '↙', title: 'Bottom-left' },
    { pos: '50% 100%',  glyph: '↓', title: 'Bottom' },
    { pos: '100% 100%', glyph: '↘', title: 'Bottom-right' },
  ];
  const cellHtml = cells.map(c => {
    const active = c.pos === norm;
    return '<button data-dm-fill-pos-cell="' + c.pos + '" data-dm-fill-pos-idx="' + idx + '" data-active="' + (active ? 'true' : 'false') + '" title="' + c.title + ' (' + c.pos + ')" style="aspect-ratio:1;display:flex;align-items:center;justify-content:center;background:' + (active ? 'var(--dm-accent-bg)' : 'transparent') + ';border:1px solid ' + (active ? 'var(--dm-accent-border)' : 'transparent') + ';color:' + (active ? 'var(--dm-accent)' : 'var(--dm-text-muted)') + ';border-radius:3px;cursor:pointer;font-size:11px;padding:0;">' + c.glyph + '</button>';
  }).join('');
  return '<div class="dm-field">' +
    '<label class="dm-field-label">Position</label>' +
    '<div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:2px;border:1px solid var(--dm-input-border);border-radius:4px;padding:2px;background:var(--dm-input-bg);">' +
    cellHtml +
    '</div>' +
    '</div>';
}

// Image fit mode segmented row — Fill / Fit / Crop / Tile. Each writes a
// {size, repeat} pair atomically, mapping to Figma's image fit modes.
function fillFitRow(idx: number, layer: FillLayer): string {
  const size = (layer.size || 'auto').toLowerCase();
  const repeat = (layer.repeat || 'repeat').toLowerCase();
  const isFill = size === 'cover' && repeat === 'no-repeat';
  const isFit = size === 'contain' && repeat === 'no-repeat';
  const isCrop = size === '100% 100%' && repeat === 'no-repeat';
  const isTile = repeat === 'repeat' || repeat === 'space' || repeat === 'round';
  const btn = (mode: string, lbl: string, active: boolean, title: string): string =>
    '<button class="dm-icon-row-button" data-dm-fill-fit-mode="' + mode + '" data-dm-fill-fit-idx="' + idx + '" data-active="' + (active ? 'true' : 'false') + '" title="' + escapeAttr(title) + '" style="flex:1;height:30px;font-size:11px;font-weight:500;">' + lbl + '</button>';
  return '<div style="display:flex;gap:6px;">' +
    btn('fill', 'Fill', isFill, 'Cover the box; crop overflow (background-size: cover)') +
    btn('fit',  'Fit',  isFit,  'Fit inside the box; preserve aspect (background-size: contain)') +
    btn('crop', 'Crop', isCrop, 'Stretch to exact box dimensions (background-size: 100% 100%)') +
    btn('tile', 'Tile', isTile, 'Repeat at native size (background-repeat: repeat)') +
  '</div>';
}

function renderFillLayerBody(layer: FillLayer, idx: number): string {
  const sizeOpts = ['auto','cover','contain','100% 100%','50% 50%'];
  const repeatOpts = ['repeat','no-repeat','repeat-x','repeat-y','space','round'];
  const blendOpts = ['normal','multiply','screen','overlay','darken','lighten','color-dodge','color-burn','hard-light','soft-light','difference','exclusion','hue','saturation','color','luminosity'];

  let head = '';
  if (layer.kind === 'solid') {
    head = colorInp('Color', '__fill_color__' + idx, layer.raw);
  } else if (layer.kind === 'image') {
    head = inp('URL', '__fill_url__' + idx, (layer.raw.match(/url\((['"]?)([^'")]+)\1\)/) || ['','',layer.raw])[2], '');
  } else {
    // gradient (linear / radial / conic) — visual stop editor
    const parsed = parseGradientStops(layer.raw);
    const prefixLabel = layer.kind === 'linear' ? 'Angle' : layer.kind === 'radial' ? 'Shape' : 'From';
    const prefixDef = layer.kind === 'linear' ? '180deg' : layer.kind === 'radial' ? 'circle' : 'from 0deg';
    const stopRows = parsed.stops.map((stop, sIdx) => {
      return '<div style="display:grid;grid-template-columns:1fr 80px 28px;gap:6px;align-items:end;">' +
        colorInp('Stop ' + (sIdx + 1), '__fill_stop_color__' + idx + '_' + sIdx, stop.color || '#000000') +
        inp('Pos', '__fill_stop_pos__' + idx + '_' + sIdx, stop.position || '', '') +
        '<div class="dm-field"><label style="font-size:10px;color:var(--dm-text-muted);visibility:hidden;">_</label>' +
        '<button class="dm-section-action" data-dm-fill-stop-remove="' + idx + '_' + sIdx + '" title="Remove stop" style="width:100%;height:28px;color:var(--dm-danger);">' + icon('trash', 11) + '</button>' +
        '</div></div>';
    }).join('<div style="height:4px;"></div>');
    const addStopBtn = '<button class="dm-btn" data-dm-fill-stop-add="' + idx + '" style="width:100%;padding:6px;font-size:11px;display:flex;align-items:center;gap:4px;justify-content:center;">' + icon('plus', 11) + ' Add stop</button>';
    head =
      grid12([
        { span: 12, content: inp(prefixLabel, '__fill_grad_prefix__' + idx, parsed.prefix || prefixDef, '') },
      ]) + sp() +
      sub('Stops') +
      stopRows + sp() +
      addStopBtn;
  }
  // Per-layer comma-positional properties — only meaningful for non-solid layers.
  const perLayer = layer.kind === 'solid' ? '' :
    sp() +
    // 4-mode segmented (image only). Atomically writes {size, repeat} pairs.
    (layer.kind === 'image' ? fillFitRow(idx, layer) + sp() : '') +
    grid12([
      { span: 6, content: sel('Size', '__fill_size__' + idx, layer.size || 'auto', sizeOpts) },
      { span: 6, content: sel('Repeat', '__fill_repeat__' + idx, layer.repeat || 'repeat', repeatOpts) },
    ]) + sp() +
    grid12([
      { span: 6, content: fillPositionPad(idx, layer.position || '0% 0%') },
      { span: 6, content: sel('Blend', '__fill_blend__' + idx, layer.blendMode || 'normal', blendOpts) },
    ]);
  return head + perLayer;
}

type StrokeLayer = { weight: number; color: string; visible?: boolean };

// Per-element multi-stroke state. Once a 2nd stroke is added (or the user
// otherwise mutates layers through the panel) this map becomes the source
// of truth for that element. The dispatcher knows when to fall back to the
// single-stroke `border-*` path (1 layer, Outside) vs. the chained
// `box-shadow` path (multi-stroke). `activeStrokeIdx` and the previously
// declared `expandedStrokeIdx` (top of file) live elsewhere.
// Per-element-per-position stroke stash. Each tab (Outside / Center /
// Inside) holds its own layer list so switching tabs doesn't bleed
// weight / colour / style between modes — a stroke set in Inside stays
// in Inside even after the user visits Outside, and Outside reads
// fresh from its own state instead of inheriting from Inside.
type StrokePos = 'inside' | 'outside' | 'center';
const strokeLayersByElement = new Map<string, Map<StrokePos, StrokeLayer[]>>();

function setStrokeLayers(id: string, position: StrokePos, layers: StrokeLayer[]): void {
  let elementMap = strokeLayersByElement.get(id);
  if (!elementMap) {
    elementMap = new Map();
    strokeLayersByElement.set(id, elementMap);
  }
  elementMap.set(position, layers);
}

// Which tab the user is currently editing for each element. Not derived
// from CSS — tabs coexist (Outside / Center / Inside all paint at the
// same time when set), so we can't infer "the position" from looking at
// the resolved styles. inferStrokePosition is only used as the first-
// visit fallback so an element with a natural border / inset / outline
// lands on the right tab when initially selected.
const strokeActiveTab = new Map<string, StrokePos>();
function getStrokeActiveTab(id: string, s: Record<string, string>): StrokePos {
  const cached = id ? strokeActiveTab.get(id) : undefined;
  if (cached) return cached;
  return inferStrokePosition(s);
}
let activeStrokeIdx = 0;

// Parse a single box-shadow entry into structured form. Browsers normalize
// computed values to color-first format (`rgb(0,0,0) 0px 0px 0px 1px [inset]`)
// while authored CSS is usually `[inset] 0 0 0 1px <color>`. We accept both.
function parseShadowEntry(e: string): { x: number; y: number; blur: number; spread: number; color: string; inset: boolean } | null {
  const trimmed = e.trim();
  if (!trimmed) return null;
  const insetStart = /^inset\b/i.test(trimmed);
  const insetEnd = /\binset$/i.test(trimmed);
  const inset = insetStart || insetEnd;
  const core = trimmed.replace(/^inset\s+/i, '').replace(/\s+inset$/i, '').trim();
  const colorRe = '(rgba?\\([^)]+\\)|hsla?\\([^)]+\\)|#[0-9a-fA-F]{3,8}|[a-zA-Z]+)';
  // Color first: <color> <x> <y> <blur> <spread>
  let m = core.match(new RegExp('^' + colorRe + '\\s+(.+)$'));
  if (m) {
    const color = m[1];
    const nums = m[2].split(/\s+/).map(p => parseFloat(p)).filter(n => !isNaN(n));
    if (nums.length >= 2) {
      const [x = 0, y = 0, blur = 0, spread = 0] = nums;
      return { x, y, blur, spread, color, inset };
    }
  }
  // Color last: <x> <y> <blur> <spread> <color>
  m = core.match(new RegExp('^(.+?)\\s+' + colorRe + '$'));
  if (m) {
    const color = m[2];
    const nums = m[1].split(/\s+/).map(p => parseFloat(p)).filter(n => !isNaN(n));
    if (nums.length >= 2) {
      const [x = 0, y = 0, blur = 0, spread = 0] = nums;
      return { x, y, blur, spread, color, inset };
    }
  }
  return null;
}

// A stroke entry is a box-shadow with x=y=blur=0 and spread>0 (`0 0 0 Npx`).
function shadowEntryIsStroke(e: string): boolean {
  const p = parseShadowEntry(e);
  return !!p && p.x === 0 && p.y === 0 && p.blur === 0 && p.spread > 0;
}

// Stroke layers live in box-shadow as `[inset?] 0 0 0 Npx <color>` entries,
// matching Figma's mental model: Outside → no inset, Inside → inset. Center
// is outline-only (single stroke). Other unrelated box-shadows in the chain
// (drop shadows etc.) are preserved untouched on serialize.
function parseStrokeLayers(s: Record<string, string>, position: 'inside' | 'outside' | 'center'): StrokeLayer[] {
  if (position === 'center') {
    const w = parseFloat(s.outlineWidth || '0') || 0;
    return w > 0 ? [{ weight: w, color: s.outlineColor || '#000' }] : [];
  }
  const entries = parseCssCommaList(s.boxShadow || '');
  const wantInset = position === 'inside';
  const out: StrokeLayer[] = [];
  for (const e of entries) {
    const p = parseShadowEntry(e);
    if (!p) continue;
    if (p.inset !== wantInset) continue;
    if (p.x !== 0 || p.y !== 0 || p.blur !== 0 || p.spread < 0) continue;
    out.push({ weight: p.spread, color: p.color });
  }
  return out;
}

function serializeStrokeLayers(layers: StrokeLayer[], position: 'inside' | 'outside' | 'center', existingShadow: string): string {
  if (position === 'center') return existingShadow || 'none';
  const entries = parseCssCommaList(existingShadow);
  const wantInset = position === 'inside';
  // Preserve non-stroke shadows in the chain (drop shadows, custom
  // shadows). The threshold for "this is a stroke-shape entry"
  // matches inferStrokePosition's detector: zero offset / blur with
  // any non-negative spread (including 0). The old `spread > 0` test
  // diverged from the detector — a zero-spread inset slipped through
  // the filter but still triggered the inside-position check, so tab
  // swaps left a residual entry behind that pinned the panel on
  // Inside forever.
  const preserved = entries.filter(e => {
    const p = parseShadowEntry(e);
    if (!p) return true;
    if (p.inset !== wantInset) return true;     // different mode → preserve
    return !(p.x === 0 && p.y === 0 && p.blur === 0 && p.spread >= 0);
  });
  const visible = layers.filter(l => l.visible !== false);
  const newEntries = visible.map(l => {
    const prefix = position === 'inside' ? 'inset ' : '';
    return prefix + '0 0 0 ' + l.weight + 'px ' + l.color;
  });
  const all = [...newEntries, ...preserved];
  return all.length ? all.join(', ') : 'none';
}

// Get-or-seed the per-element-per-position stroke-layer state. Each tab
// keeps its own list — switching tabs doesn't carry weight / colour
// across modes. First visit parses from CSS so the user sees the
// page's natural stroke (if any) in the position-appropriate slot;
// after that, the stash holds their edits per tab.
function getStrokeLayers(id: string, s: Record<string, string>, position: StrokePos): StrokeLayer[] {
  const cached = strokeLayersByElement.get(id)?.get(position);
  if (cached) return cached;
  let layers = parseStrokeLayers(s, position);
  if (layers.length === 0 && position === 'outside') {
    // Outside single-stroke stored in border-*; synthesise a primary layer.
    const w = parseFloat(s.borderTopWidth || '0') || 0;
    if (w > 0) layers = [{ weight: w, color: s.borderTopColor || '#000000', visible: true }];
  }
  layers = layers.map(l => ({ ...l, visible: l.visible !== false }));
  setStrokeLayers(id, position, layers);
  return layers;
}

// Dispatch the layered model to CSS. Each position writes to a distinct
// CSS property family, so all three can coexist on the page at once:
//   Inside  → box-shadow chain with `inset` (any count).
//   Outside → box-shadow chain without `inset` (any count). Paints OUTSIDE
//             the element's box without growing it, regardless of
//             box-sizing. We never write border-* for strokes anymore.
//   Center  → outline-* (single only; UI prevents multi).
function dispatchStrokeLayers(
  layers: StrokeLayer[],
  position: 'inside' | 'outside' | 'center',
  s: Record<string, string>,
  applyStyleFn: (p: string, v: string) => void,
  styleKeyword: string,
): void {
  if (position === 'center') {
    const layer = layers.find(l => l.visible !== false) || layers[0];
    if (!layer) return;
    applyStyleFn('outlineWidth', layer.weight + 'px');
    applyStyleFn('outlineColor', layer.color);
    applyStyleFn('outlineStyle', styleKeyword || 'solid');
    return;
  }
  const css = serializeStrokeLayers(layers, position, s.boxShadow || '');
  applyStyleFn('boxShadow', css);
  if (position === 'outside') {
    // Outside is now a pure box-shadow paint; clear any border-* width
    // so it doesn't add to the box. Keep color/style untouched so the
    // user's existing `border` declarations (if any) survive untouched.
    ['borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth'].forEach(p => applyStyleFn(p, '0px'));
  }
}

// Reusable single-row renderer for a layered-list item. The trailing
// children slot is the per-layer body shown when the row is expanded.
function layeredRow(opts: {
  idx: number;
  prefix: string;        // 'fill' | 'stroke' | 'effect'
  swatch: string;        // HTML for the leading swatch / type icon
  label: string;         // primary value text (hex / url / gradient / 'Drop shadow')
  meta?: string;         // secondary text (e.g. '100%')
  metaHtml?: string;     // raw HTML for the meta slot (overrides `meta`); caller escapes
  hideExpand?: boolean;  // skip the settings/expand button (single-field rows)
  visible: boolean;
  expanded: boolean;
  body?: string;         // expanded body
}): string {
  // Grip is a <span>, not a <button>: a draggable parent with a <button>
  // child mousedown-target is unreliable in Chromium — the button captures
  // focus and the drag often fails to initiate. The Layers tab's working
  // grip uses the same span pattern. The data attr is decorative; drag
  // identifies the row via the outer wrapper's data-dm-<prefix>-row.
  const metaPart = opts.metaHtml
    ? opts.metaHtml
    : (opts.meta ? '<span style="font-size:10px;color:var(--dm-text-muted);">' + escapeAttr(opts.meta) + '</span>' : '');
  const expandBtn = opts.hideExpand
    ? ''
    : '<button class="dm-section-action" data-dm-' + opts.prefix + '-expand="' + opts.idx + '" title="' + (opts.expanded ? 'Collapse' : 'Settings') + '" data-active="' + (opts.expanded ? 'true' : 'false') + '">' + icon('slidersHorizontal', 12) + '</button>';
  const headRow = '<div style="display:flex;align-items:center;gap:6px;padding:6px 8px;background:var(--dm-bg-secondary);border:1px solid var(--dm-separator);border-radius:5px;">' +
    '<span class="dm-section-action" data-dm-' + opts.prefix + '-drag="' + opts.idx + '" title="Drag to reorder" aria-label="Drag" style="cursor:grab;">' + icon('gripVertical', 12) + '</span>' +
    opts.swatch +
    '<span style="flex:1;min-width:0;font-size:11px;font-family:SF Mono,Monaco,monospace;color:var(--dm-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeAttr(opts.label) + '</span>' +
    metaPart +
    '<button class="dm-section-action" data-dm-' + opts.prefix + '-toggle="' + opts.idx + '" title="' + (opts.visible ? 'Hide' : 'Show') + '" data-active="' + (opts.visible ? 'true' : 'false') + '">' + icon(opts.visible ? 'eye' : 'eyeOff', 12) + '</button>' +
    expandBtn +
    '<button class="dm-section-action" data-dm-' + opts.prefix + '-remove="' + opts.idx + '" title="Remove" style="color:var(--dm-danger);">' + icon('trash', 12) + '</button>' +
    '</div>';
  const bodyRow = (opts.expanded && opts.body)
    ? '<div style="margin:6px 0 10px 24px;padding:8px;background:var(--dm-bg);border:1px solid var(--dm-separator);border-radius:5px;">' + opts.body + '</div>'
    : '';
  return '<div style="margin-bottom:6px;">' + headRow + bodyRow + '</div>';
}

/* ── v1.2: Box Shadow parser/builder ── */
function parseBoxShadowComputed(val: string): { inset: boolean; x: number; y: number; blur: number; spread: number; color: string; opacity: number } {
  const d = { inset: false, x: 0, y: 4, blur: 12, spread: 0, color: '#000000', opacity: 12 };
  if (!val || val === 'none') return d;
  try {
    const inset = val.includes('inset');
    let color = '#000000'; let opacity = 12;
    const rgbaM = val.match(/rgba?\([\d\s,./]+\)/);
    if (rgbaM) {
      const nums = rgbaM[0].match(/[\d.]+/g) || [];
      const r = parseInt(nums[0])||0, g = parseInt(nums[1])||0, b = parseInt(nums[2])||0;
      const a = parseFloat(nums[3] ?? '1');
      color = '#' + [r,g,b].map(n => n.toString(16).padStart(2,'0')).join('');
      opacity = Math.round(a * 100);
    } else {
      const hexM = val.match(/#[0-9a-fA-F]{3,8}/);
      if (hexM) color = hexM[0];
    }
    const rest = val.replace(/rgba?\([^)]+\)/g,'').replace('inset','').trim();
    const nums = rest.match(/-?[\d.]+/g) || [];
    return { inset, x: parseFloat(nums[0])||0, y: parseFloat(nums[1])||0, blur: parseFloat(nums[2])||0, spread: parseFloat(nums[3])||0, color, opacity };
  } catch { return d; }
}

/* ── v1.2: Shadow structured editor ── */
function renderShadowEditor(s: Record<string, string>): string {
  const hasShadow = s.boxShadow && s.boxShadow !== 'none';
  if (!hasShadow) {
    return '<button data-dm-action="add-shadow" style="width:100%;padding:6px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:5px;color:var(--dm-text-secondary);cursor:pointer;font-size:10px;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:4px;">' + icon('plus', 10) + ' Add Shadow</button>';
  }
  const p = parseBoxShadowComputed(s.boxShadow || 'none');
  const numInp = (lbl: string, field: string, val: number) =>
    '<div class="dm-field">' +
    '<label class="dm-field-label">' + lbl + '</label>' +
    '<div style="display:flex;align-items:center;background:var(--dm-input-bg);border:1px solid var(--dm-input-border);border-radius:5px;overflow:hidden;">' +
    '<input type="number" data-dm-shadow-field="' + field + '" value="' + val + '" style="background:none;border:none;padding:6px;width:100%;min-width:0;font-family:inherit;font-size:10px;color:var(--dm-text);"/>' +
    '<span style="font-size:9px;color:var(--dm-text-dim);padding-right:6px;opacity:0.6;flex-shrink:0;">px</span>' +
    '</div></div>';
  return '<div style="background:var(--dm-bg-secondary);border:1px solid var(--dm-separator);border-radius:6px;padding:8px;">' +
    // Type + delete
    '<div style="display:flex;gap:6px;align-items:center;margin-bottom:8px;">' +
    '<select data-dm-shadow-field="type" class="dm-select" style="flex:1;">' +
    '<option value="outer"' + (!p.inset?' selected':'') + '>Outer Shadow</option>' +
    '<option value="inset"' + (p.inset?' selected':'') + '>Inner Shadow</option>' +
    '</select>' +
    '<button data-dm-action="clear-shadow" title="Remove shadow" style="padding:4px 6px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:4px;color:var(--dm-text-muted);cursor:pointer;display:flex;">' + icon('trash', 10) + '</button>' +
    '</div>' +
    // Color + opacity. The colour swatch uses the same unified picker
    // (HSV + design tokens + eyedropper) the rest of the Design tab
    // uses; the `__shadow_color` virtual prop routes its output back
    // through `applyShadowFromFields` via the dispatcher in applyStyle.
    // Hidden mirror inputs keep the composer's existing field-reading
    // logic intact without a second code path.
    sub('Color') +
    '<input type="hidden" data-dm-shadow-field="color" value="' + p.color + '"/>' +
    '<input type="hidden" data-dm-shadow-field="colorhex" value="' + p.color.replace('#','') + '"/>' +
    colorInp('', '__shadow_color', p.color) +
    '<div style="display:flex;align-items:center;gap:6px;margin:8px 0;">' +
    '<label class="dm-field-label" style="flex-shrink:0;">Opacity</label>' +
    '<div style="display:flex;align-items:center;background:var(--dm-input-bg);border:1px solid var(--dm-input-border);border-radius:5px;overflow:hidden;flex:1;">' +
    '<input type="number" data-dm-shadow-field="opacity" min="0" max="100" value="' + p.opacity + '" style="background:none;border:none;padding:6px;flex:1;min-width:0;font-size:10px;color:var(--dm-text);text-align:right;"/>' +
    '<span style="font-size:9px;color:var(--dm-text-dim);padding-right:6px;flex-shrink:0;">%</span>' +
    '</div></div>' +
    grid(2, numInp('Offset X','x',p.x), numInp('Offset Y','y',p.y)) + sp() +
    grid(2, numInp('Blur','blur',p.blur), numInp('Spread','spread',p.spread)) +
    '</div>';
}

/* ── Text shadow editor (structured: x/y/blur/color) ── */
function parseTextShadow(val: string): { x: number; y: number; blur: number; color: string } {
  const d = { x: 0, y: 1, blur: 2, color: 'rgba(0,0,0,0.4)' };
  if (!val || val === 'none') return d;
  try {
    const colorM = val.match(/(rgba?\([^)]+\)|#[0-9a-fA-F]{3,8}|hsla?\([^)]+\))/);
    const color = colorM ? colorM[0] : '#000000';
    const rest = val.replace(/(rgba?\([^)]+\)|#[0-9a-fA-F]{3,8}|hsla?\([^)]+\))/g, '').trim();
    const nums = rest.split(/\s+/).filter(Boolean).map(s => parseFloat(s) || 0);
    return { x: nums[0] ?? 0, y: nums[1] ?? 1, blur: nums[2] ?? 2, color };
  } catch { return d; }
}

function renderTextShadowEditor(s: Record<string, string>): string {
  const p = parseTextShadow(s.textShadow || 'none');
  const numField = (label: string, prop: string, val: number) =>
    '<div class="dm-field">' +
    '<label class="dm-field-label">' + label + '</label>' +
    '<div style="display:flex;align-items:center;background:var(--dm-input-bg);border:1px solid var(--dm-input-border);border-radius:5px;overflow:hidden;">' +
    '<input type="number" data-dm-textshadow-field="' + prop + '" value="' + val + '" style="background:none;border:none;padding:6px;width:100%;min-width:0;font-family:inherit;font-size:10px;color:var(--dm-text);"/>' +
    '<span style="font-size:9px;color:var(--dm-text-dim);padding-right:6px;opacity:0.6;flex-shrink:0;">px</span>' +
    '</div></div>';
  // Hidden mirror inputs feed the existing applyTextShadowFromFields
  // composer so the unified colour picker (HSV + tokens + eyedropper)
  // can replace the OS native colour dialog without a parallel apply
  // path. Same pattern as the box-shadow editor above.
  const colorHex = rgbToHex(p.color);
  return '<div style="background:var(--dm-bg-secondary);border:1px solid var(--dm-separator);border-radius:6px;padding:8px;">' +
    '<input type="hidden" data-dm-textshadow-field="color" value="' + colorHex + '"/>' +
    '<input type="hidden" data-dm-textshadow-field="colorhex" value="' + colorHex.replace('#', '') + '"/>' +
    grid(2, numField('Offset X', 'x', p.x), numField('Offset Y', 'y', p.y)) + sp() +
    grid(2, numField('Blur', 'blur', p.blur), colorInp('Color', '__textshadow_color', colorHex)) +
    '<div style="margin-top:6px;display:flex;justify-content:flex-end;"><button data-dm-action="clear-text-shadow" style="padding:3px 8px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:4px;color:var(--dm-text-dim);cursor:pointer;font-size:9px;font-family:inherit;">Remove</button></div>' +
    '</div>';
}

// ─── Effects layered model ───────────────────────────────────────────────
// Per-effect visibility lives in memory, keyed by element id + a stable
// effect id. Hidden effects are dropped from CSS but kept in the chain
// (and therefore in the visible list) so re-toggling restores them.
const hiddenEffectsByElement = new Map<string, Set<string>>();
const stashedEffectByKey = new Map<string, string>(); // `${elementId}::${effectId}` → original CSS entry

type ShadowParts = { inset: boolean; x: number; y: number; blur: number; spread: number; color: string };
// Figma-aligned model:
//   • Inner shadow → inset box-shadow (chain: 'box', supports spread).
//   • Drop shadow → one row that swaps between three CSS chains via the
//     "Show behind transparent areas" checkbox:
//       - checkbox ON  → box-shadow (rectangle, spread supported).
//       - checkbox OFF + text element → text-shadow (no spread).
//       - checkbox OFF + other element → filter:drop-shadow (no spread).
//     `chain` discriminates which slot the entry currently lives in;
//     `showBehindTransparent` mirrors that (chain === 'box').
// Overlay effects (Noise / Texture) don't live in any of the four CSS
// chains above — there's no native CSS for them. They're painted via
// an `::after` pseudo-element with chained background-image SVG data
// URIs, written out of one synthetic prop `__effect_overlay` whose
// value is a JSON array.
type NoiseMode = 'mono' | 'duo' | 'multi';
type OverlayEntry =
  | { id: string; kind: 'noise'; chain: 'overlay'; chainIdx: number; raw: string; visible: boolean;
      mode: NoiseMode;
      sizeX: number; sizeY: number; density: number;
      color1: string; color1Opacity: number;
      color2: string; color2Opacity: number;
      opacity: number }
  | { id: string; kind: 'texture'; chain: 'overlay'; chainIdx: number; raw: string; visible: boolean;
      sizeX: number; sizeY: number; radius: number; clipToShape: boolean };
type EffectEntry =
  | { id: string; kind: 'inner-shadow'; chain: 'box'; chainIdx: number; raw: string; shadow: ShadowParts; visible: boolean }
  | { id: string; kind: 'drop-shadow'; chain: 'box' | 'filter' | 'text'; chainIdx: number; raw: string; shadow: ShadowParts; visible: boolean; showBehindTransparent: boolean }
  | { id: string; kind: 'layer-blur'; chain: 'filter'; chainIdx: number; raw: string; radius: number; visible: boolean }
  | { id: string; kind: 'backdrop-blur'; chain: 'backdrop'; chainIdx: number; raw: string; radius: number; visible: boolean }
  | OverlayEntry;

// Default seeds for new overlay entries. Match the Figma defaults shown
// in the reference screenshots so a freshly-added Noise / Texture looks
// the way users coming from Figma expect.
function defaultNoiseEntry(mode: NoiseMode = 'mono'): OverlayEntry {
  return {
    id: 'noise-' + Math.random().toString(36).slice(2, 8),
    kind: 'noise',
    chain: 'overlay',
    chainIdx: 0,
    raw: '',
    visible: true,
    mode,
    sizeX: 0.5,
    sizeY: 0.5,
    density: 100,
    color1: '#000000',
    color1Opacity: 25,
    color2: '#ffffff',
    color2Opacity: 25,
    opacity: 15,
  };
}
function defaultTextureEntry(): OverlayEntry {
  return {
    id: 'texture-' + Math.random().toString(36).slice(2, 8),
    kind: 'texture',
    chain: 'overlay',
    chainIdx: 0,
    raw: '',
    visible: true,
    sizeX: 0.5,
    sizeY: 0.5,
    radius: 4,
    clipToShape: false,
  };
}

// Per-element overlay-effects stash. Updated whenever a row is added /
// removed / edited; serialized into the synthetic `__effect_overlay`
// CSS prop which flows through the change-tracker (so the Changes tab
// and session persistence pick it up). Hydrated from styleChanges on
// selection so panel reopens / page reloads restore the rows.
const overlayEffectsByElement = new Map<string, OverlayEntry[]>();

function serializeOverlayEntries(entries: OverlayEntry[]): string {
  if (!entries.length) return 'none';
  return JSON.stringify(entries);
}
function parseOverlayEntries(value: string): OverlayEntry[] {
  if (!value || value === 'none') return [];
  try {
    const arr = JSON.parse(value);
    if (!Array.isArray(arr)) return [];
    return arr.filter(e => e && (e.kind === 'noise' || e.kind === 'texture'));
  } catch { return []; }
}
function getOverlayEntries(elementId: string): OverlayEntry[] {
  if (!elementId) return [];
  return overlayEffectsByElement.get(elementId) || [];
}
function setOverlayEntries(elementId: string, entries: OverlayEntry[]): void {
  overlayEffectsByElement.set(elementId, entries);
}
// Push the typed array to the change-tracker via the synthetic prop.
// The content-side translator (change-tracker.ts:rebuildStyleSheet)
// recognises `__effect_overlay` and emits a `::after` rule.
function dispatchOverlayEntries(elementId: string, entries: OverlayEntry[]): void {
  if (!elementId) return;
  applyStyle('__effect_overlay', serializeOverlayEntries(entries));
}

// Filter functions are space-separated, each call wrapped in parens. A
// dumb whitespace split would tear apart `drop-shadow(0 4px 8px ...)`. This
// preserves nested whitespace inside parens.
function splitFilterFunctions(value: string): string[] {
  const v = (value || '').trim();
  if (!v || v === 'none') return [];
  const out: string[] = [];
  let depth = 0; let cur = '';
  for (let i = 0; i < v.length; i++) {
    const ch = v[i];
    if (ch === '(') { depth++; cur += ch; }
    else if (ch === ')') { depth--; cur += ch; }
    else if (/\s/.test(ch) && depth === 0) {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
    } else { cur += ch; }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function parseEffects(s: Record<string, string>, elementId: string, isText: boolean): EffectEntry[] {
  const hidden = hiddenEffectsByElement.get(elementId) ?? new Set<string>();
  const out: EffectEntry[] = [];

  // box-shadow chain — inner (inset) + drop (non-inset).
  // Stroke-shaped entries belong to Stroke and are skipped here.
  const bsRaw = parseCssCommaList(s.boxShadow || '');
  bsRaw.forEach((raw, i) => {
    if (shadowEntryIsStroke(raw)) return;
    const p = parseShadowEntry(raw);
    if (!p) return;
    const id = 'box:' + i;
    if (p.inset) {
      out.push({
        id,
        kind: 'inner-shadow',
        chain: 'box',
        chainIdx: i,
        raw,
        shadow: { inset: true, x: p.x, y: p.y, blur: p.blur, spread: p.spread, color: p.color },
        visible: !hidden.has(id),
      });
    } else {
      out.push({
        id,
        kind: 'drop-shadow',
        chain: 'box',
        chainIdx: i,
        raw,
        shadow: { inset: false, x: p.x, y: p.y, blur: p.blur, spread: p.spread, color: p.color },
        visible: !hidden.has(id),
        showBehindTransparent: true,
      });
    }
  });

  // filter chain — drop-shadow() calls fold into the same "Drop shadow"
  // row kind with checkbox OFF (alpha-bound). blur() stays as Layer blur.
  const fnList = splitFilterFunctions(s.filter || '');
  fnList.forEach((fn, i) => {
    const ds = fn.match(/^drop-shadow\((.*)\)\s*$/i);
    if (ds) {
      const inner = ds[1];
      const p = parseShadowEntry(inner);
      if (!p) return;
      const id = 'filter-drop:' + i;
      out.push({
        id,
        kind: 'drop-shadow',
        chain: 'filter',
        chainIdx: i,
        raw: fn,
        shadow: { inset: false, x: p.x, y: p.y, blur: p.blur, spread: 0, color: p.color },
        visible: !hidden.has(id),
        showBehindTransparent: false,
      });
    } else if (/^blur\(/i.test(fn)) {
      const m = fn.match(/^blur\(([^)]+)\)\s*$/i);
      const id = 'layer-blur:' + i;
      out.push({
        id,
        kind: 'layer-blur',
        chain: 'filter',
        chainIdx: i,
        raw: fn,
        radius: m ? (parseFloat(m[1]) || 0) : 0,
        visible: !hidden.has(id),
      });
    }
  });

  // text-shadow chain — folds into Drop shadow row with checkbox OFF
  // (alpha-bound, glyph-only). Surfaced even on non-text elements when
  // present, so the row can be removed if it was set accidentally.
  if (s.textShadow && s.textShadow !== 'none') {
    const p = parseShadowEntry(s.textShadow);
    if (p) {
      const id = 'text-shadow';
      out.push({
        id,
        kind: 'drop-shadow',
        chain: 'text',
        chainIdx: 0,
        raw: s.textShadow,
        shadow: { inset: false, x: p.x, y: p.y, blur: p.blur, spread: 0, color: p.color },
        visible: !hidden.has(id),
        showBehindTransparent: false,
      });
    }
  }
  void isText;

  // backdrop blur — same pattern, on `backdrop-filter`.
  const bdList = splitFilterFunctions((s as any).backdropFilter || '');
  bdList.forEach((fn, i) => {
    const m = fn.match(/^blur\(([^)]+)\)\s*$/i);
    if (m) {
      const id = 'backdrop-blur:' + i;
      out.push({
        id,
        kind: 'backdrop-blur',
        chain: 'backdrop',
        chainIdx: i,
        raw: fn,
        radius: parseFloat(m[1]) || 0,
        visible: !hidden.has(id),
      });
    }
  });

  // Overlay chain (Noise / Texture). Source-of-truth is the in-memory
  // stash, hydrated from the synthetic `__effect_overlay` change record
  // on selection (see hydrateOverlayFromChanges). We keep the typed
  // entries indexed and bumped here so drag-reorder, expand, and
  // remove all use the same indices the typed array exposes.
  const overlayList = getOverlayEntries(elementId);
  overlayList.forEach((entry, i) => {
    out.push({
      ...entry,
      chainIdx: i,
      visible: entry.visible !== false && !hidden.has(entry.id),
    });
  });

  return out;
}

// Read the `__effect_overlay` synthetic prop from the per-element style
// change records (which is where the change-tracker stores the JSON we
// dispatched) and rebuild the in-memory overlay stash. Called whenever
// the selected element changes so the rows in the panel reflect the
// last persisted state.
function hydrateOverlayFromChanges(elementId: string): void {
  if (!elementId) return;
  if (overlayEffectsByElement.has(elementId)) return; // already in memory
  const persisted = styleChanges.find(c => c.elementId === elementId && c.property === '__effect_overlay');
  if (!persisted) return;
  const parsed = parseOverlayEntries(persisted.newValue);
  if (parsed.length) overlayEffectsByElement.set(elementId, parsed);
}

function formatShadowEntry(p: ShadowParts): string {
  const ins = p.inset ? 'inset ' : '';
  return ins + p.x + 'px ' + p.y + 'px ' + p.blur + 'px ' + p.spread + 'px ' + p.color;
}

function formatFilterDropShadow(p: ShadowParts): string {
  return 'drop-shadow(' + p.x + 'px ' + p.y + 'px ' + p.blur + 'px ' + p.color + ')';
}
// text-shadow has no spread, no inset, no comma chaining surfaced in
// our UI — emit the single entry in the canonical "x y blur color" form.
function formatTextShadow(p: ShadowParts): string {
  return p.x + 'px ' + p.y + 'px ' + p.blur + 'px ' + p.color;
}

// Move a Drop shadow entry between three CSS chains when the user
// toggles "Show behind transparent areas" on its row. Reads the entry
// out of the source chain, re-writes it into the target chain, and
// dispatches both edits as a batch so the panel sees one re-render.
//
// Target chain on toggle ON  → 'boxShadow'
// Target chain on toggle OFF → 'textShadow' (when the element is text
//                              with no painted background) or
//                              'filter' otherwise.
//
// Spread is preserved in the typed model when toggling OFF — text-
// shadow / filter:drop-shadow don't support it, but toggling back ON
// re-emits the original spread.
function flipDropShadowChain(srcChain: 'box' | 'fx' | 'text', srcIdx: number, checked: boolean): void {
  const cs = info?.computedStyles || {};
  // Pull the entry's ShadowParts out of its current chain.
  let parts: ShadowParts | null = null;
  let boxEntries = parseCssCommaList(cs.boxShadow || '');
  let filterEntries = splitFilterFunctions(cs.filter || '');
  let textShadowVal: string = cs.textShadow || 'none';
  if (srcChain === 'box') {
    const raw = boxEntries[srcIdx];
    if (!raw) return;
    const p = parseShadowEntry(raw);
    if (!p) return;
    parts = { inset: p.inset, x: p.x, y: p.y, blur: p.blur, spread: p.spread, color: p.color };
    boxEntries.splice(srcIdx, 1);
  } else if (srcChain === 'fx') {
    const raw = filterEntries[srcIdx];
    if (!raw) return;
    const inner = raw.match(/^drop-shadow\((.*)\)\s*$/i)?.[1] || '';
    const p = parseShadowEntry(inner);
    if (!p) return;
    parts = { inset: false, x: p.x, y: p.y, blur: p.blur, spread: 0, color: p.color };
    filterEntries.splice(srcIdx, 1);
  } else {
    const p = parseShadowEntry(textShadowVal);
    if (!p) return;
    parts = { inset: false, x: p.x, y: p.y, blur: p.blur, spread: 0, color: p.color };
    textShadowVal = 'none';
  }
  if (!parts) return;
  // Decide target chain.
  let targetChain: 'box' | 'fx' | 'text';
  if (checked) {
    targetChain = 'box';
  } else {
    // Prefer text-shadow when the selected element is a text-kind
    // layer with no painted background — text-shadow only shadows
    // the glyph alpha. Otherwise filter:drop-shadow follows the
    // whole-element alpha, which is what users want on anything
    // that paints a background / image / SVG.
    const isTextKind = info ? classifyTag((info.tagName || '').toLowerCase()) === 'text' : false;
    targetChain = isTextKind ? 'text' : 'fx';
  }
  // Format + insert into target chain.
  if (targetChain === 'box') {
    parts.inset = false;
    boxEntries.push(formatShadowEntry(parts));
  } else if (targetChain === 'fx') {
    filterEntries.push(formatFilterDropShadow(parts));
  } else {
    textShadowVal = formatTextShadow(parts);
  }
  // Batch the writes so the panel only re-renders once.
  const batch: Array<{ property: string; value: string }> = [];
  batch.push({ property: 'boxShadow', value: boxEntries.length ? boxEntries.join(', ') : 'none' });
  batch.push({ property: 'filter', value: filterEntries.length ? filterEntries.join(' ') : 'none' });
  batch.push({ property: 'textShadow', value: textShadowVal || 'none' });
  applyStylesBatch(batch, 'Show behind transparent areas');
}

// Per-shadow editor. Writes via virtual props that encode (chain,
// chainIdx, field) so the input handler can splice exactly the right
// entry in the right CSS shorthand chain.
//
// Spread only paints when the underlying chain is `box-shadow` — text-
// shadow and filter:drop-shadow don't support it. The field is rendered
// but disabled for chain !== 'box' with a tooltip explaining why.
//
// For drop-shadow rows we also render the "Show behind transparent
// areas" checkbox: when ON the entry lives in `box-shadow` (rectangle,
// shows through transparent areas); when OFF it lives in `text-shadow`
// (text elements) or `filter:drop-shadow` (others), clipped to alpha.
function renderShadowEntryEditor(entry: EffectEntry & { shadow: ShadowParts }): string {
  const sh = entry.shadow;
  // Prefix per chain — keeps the regex match in the change handler tidy.
  const prefix =
    entry.kind === 'drop-shadow' && entry.chain === 'filter' ? '__effd_fx_' + entry.chainIdx + '_' :
    entry.kind === 'drop-shadow' && entry.chain === 'text' ? '__effd_text_0_' :
    '__effd_box_' + (entry as any).chainIdx + '_';
  const isDropShadow = entry.kind === 'drop-shadow';
  const supportsSpread = entry.kind === 'inner-shadow' || (isDropShadow && entry.chain === 'box');
  const spreadDisabled = isDropShadow && entry.chain !== 'box';
  const numField = (label: string, field: 'x' | 'y' | 'blur' | 'spread', val: number) => {
    const disabled = field === 'spread' && spreadDisabled;
    const title = disabled ? 'Spread requires "Show behind transparent areas" — text-shadow and filter:drop-shadow don\'t support spread' : '';
    return '<div class="dm-field">' +
      '<label class="dm-field-label" style="' + (disabled ? 'opacity:0.5;' : '') + '">' + label + '</label>' +
      '<div style="display:flex;align-items:center;background:var(--dm-input-bg);border:1px solid var(--dm-input-border);border-radius:5px;overflow:hidden;' + (disabled ? 'opacity:0.5;' : '') + '" title="' + escapeAttr(title) + '">' +
      '<input type="number" data-dm-prop="' + prefix + field + '"' + (disabled ? ' disabled' : '') + ' value="' + val + '" style="background:none;border:none;padding:6px;width:100%;min-width:0;font-family:inherit;font-size:10px;color:var(--dm-text);"/>' +
      '<span style="font-size:9px;color:var(--dm-text-dim);padding-right:6px;opacity:0.6;flex-shrink:0;">px</span>' +
      '</div></div>';
  };

  const showBehindCheckbox = isDropShadow
    ? '<label style="display:flex;align-items:center;gap:6px;margin-top:10px;font-size:11px;color:var(--dm-text-secondary);cursor:pointer;">' +
        '<input type="checkbox" data-dm-prop="' + prefix + 'show_behind"' + (entry.chain === 'box' ? ' checked' : '') + ' style="margin:0;"/>' +
        '<span>Show behind transparent areas</span>' +
      '</label>'
    : '';

  return '<div style="background:var(--dm-bg-secondary);border:1px solid var(--dm-separator);border-radius:6px;padding:8px;">' +
    sub('Colour') +
    '<div style="margin-bottom:8px;">' +
      colorInp('', prefix + 'color', sh.color || '#000000') +
    '</div>' +
    grid(2, numField('Offset X', 'x', sh.x), numField('Offset Y', 'y', sh.y)) + sp() +
    grid(2,
      numField('Blur', 'blur', sh.blur),
      numField('Spread', 'spread', sh.spread)
    ) +
    showBehindCheckbox +
    '</div>';
}

// ── Noise / Texture (overlay-chain) editors ──
// These rows write into the in-memory overlayEffectsByElement stash and
// dispatch the whole JSON array as one synthetic CSS prop. Each field
// has a virtual prop name `__effd_overlay_<idx>_<field>` so it routes
// through the same change handler as the other effect editors.
function renderNoiseEntryEditor(entry: Extract<OverlayEntry, { kind: 'noise' }>): string {
  const prefix = '__effd_overlay_' + entry.chainIdx + '_';
  const modeTab = (m: NoiseMode, label: string): string => {
    const active = entry.mode === m;
    return '<button type="button" data-dm-prop="' + prefix + 'mode" data-dm-value="' + m + '" data-active="' + (active ? 'true' : 'false') + '" style="flex:1;padding:5px 8px;background:' + (active ? 'var(--dm-bg)' : 'none') + ';border:' + (active ? '1px solid var(--dm-separator)' : 'none') + ';border-radius:4px;color:' + (active ? 'var(--dm-text)' : 'var(--dm-text-dim)') + ';cursor:pointer;font-size:10px;font-family:inherit;">' + label + '</button>';
  };
  const modeTabs = '<div style="display:flex;background:var(--dm-input-bg);border:1px solid var(--dm-input-border);border-radius:5px;padding:2px;margin-bottom:8px;">' +
    modeTab('mono', 'Mono') + modeTab('duo', 'Duo') + modeTab('multi', 'Multi') +
    '</div>';
  // Compact decimal input. Shares metrics with the X/Y inputs in other rows.
  const decField = (label: string, field: string, val: number, step = '0.1', min = '0', max = '') => {
    return '<div class="dm-field">' +
      '<label class="dm-field-label">' + label + '</label>' +
      '<div style="display:flex;align-items:center;background:var(--dm-input-bg);border:1px solid var(--dm-input-border);border-radius:5px;overflow:hidden;">' +
      '<input type="number" data-dm-prop="' + prefix + field + '" step="' + step + '" min="' + min + '"' + (max ? ' max="' + max + '"' : '') + ' value="' + val + '" style="background:none;border:none;padding:6px;width:100%;min-width:0;font-family:inherit;font-size:10px;color:var(--dm-text);"/>' +
      '</div></div>';
  };
  const sizeRow = grid(2,
    decField('Size X', 'sizeX', entry.sizeX, '0.1', '0.1', '5'),
    decField('Size Y', 'sizeY', entry.sizeY, '0.1', '0.1', '5'),
  );
  const densityRow = grid(1, decField('Density %', 'density', entry.density, '1', '0', '100'));
  // Colour + opacity rows — Mono shows one, Duo shows two, Multi shows
  // a single opacity (the noise itself is full-spectrum colour).
  const colorRow = (label: string, colorField: string, opacityField: string, color: string, opacity: number) =>
    '<div style="display:flex;gap:6px;align-items:center;">' +
      '<div style="flex:1;">' + colorInp(label, prefix + colorField, color) + '</div>' +
      '<div style="width:80px;">' + decField('Opacity %', opacityField, opacity, '1', '0', '100') + '</div>' +
    '</div>';
  let modeBody = '';
  if (entry.mode === 'mono') {
    modeBody = colorRow('Colour', 'color1', 'color1Opacity', entry.color1, entry.color1Opacity);
  } else if (entry.mode === 'duo') {
    modeBody =
      colorRow('Colour 1', 'color1', 'color1Opacity', entry.color1, entry.color1Opacity) + sp() +
      colorRow('Colour 2', 'color2', 'color2Opacity', entry.color2, entry.color2Opacity);
  } else {
    modeBody = grid(1, decField('Opacity %', 'opacity', entry.opacity, '1', '0', '100'));
  }
  return '<div style="background:var(--dm-bg-secondary);border:1px solid var(--dm-separator);border-radius:6px;padding:8px;">' +
    modeTabs +
    sizeRow + sp() +
    densityRow + sp() +
    modeBody +
    '</div>';
}

function renderTextureEntryEditor(entry: Extract<OverlayEntry, { kind: 'texture' }>): string {
  const prefix = '__effd_overlay_' + entry.chainIdx + '_';
  const decField = (label: string, field: string, val: number, step = '0.1', min = '0', max = '') => {
    return '<div class="dm-field">' +
      '<label class="dm-field-label">' + label + '</label>' +
      '<div style="display:flex;align-items:center;background:var(--dm-input-bg);border:1px solid var(--dm-input-border);border-radius:5px;overflow:hidden;">' +
      '<input type="number" data-dm-prop="' + prefix + field + '" step="' + step + '" min="' + min + '"' + (max ? ' max="' + max + '"' : '') + ' value="' + val + '" style="background:none;border:none;padding:6px;width:100%;min-width:0;font-family:inherit;font-size:10px;color:var(--dm-text);"/>' +
      '</div></div>';
  };
  const sizeRow = grid(2,
    decField('Size X', 'sizeX', entry.sizeX, '0.1', '0.1', '5'),
    decField('Size Y', 'sizeY', entry.sizeY, '0.1', '0.1', '5'),
  );
  const radiusRow = grid(1, decField('Radius', 'radius', entry.radius, '1', '0'));
  const clipRow =
    '<label style="display:flex;align-items:center;gap:6px;margin-top:10px;font-size:11px;color:var(--dm-text-secondary);cursor:pointer;">' +
      '<input type="checkbox" data-dm-prop="' + prefix + 'clipToShape"' + (entry.clipToShape ? ' checked' : '') + ' style="margin:0;"/>' +
      '<span>Clip to shape</span>' +
    '</label>';
  return '<div style="background:var(--dm-bg-secondary);border:1px solid var(--dm-separator);border-radius:6px;padding:8px;">' +
    sizeRow + sp() +
    radiusRow +
    clipRow +
    '</div>';
}

// Per-blur editor — single radius input for `filter: blur` /
// `backdrop-filter: blur`. The Uniform / Progressive segmented control
// renders for parity with Figma, but Progressive is intentionally
// disabled: CSS has no true gradient blur and the closest hack
// (mask-image fade over a uniform blur) would mislead users into
// thinking they'd shipped Figma-equivalent CSS.
function renderBlurEntryEditor(entry: { kind: 'layer-blur' | 'backdrop-blur'; chainIdx: number; radius: number }): string {
  const prefix = entry.kind === 'layer-blur'
    ? '__effd_lblur_' + entry.chainIdx + '_'
    : '__effd_bblur_' + entry.chainIdx + '_';
  const modeTabs = '<div style="display:flex;background:var(--dm-input-bg);border:1px solid var(--dm-input-border);border-radius:5px;padding:2px;margin-bottom:8px;">' +
    '<button type="button" data-dm-blur-mode="uniform" data-active="true" style="flex:1;padding:5px 8px;background:var(--dm-bg);border:1px solid var(--dm-separator);border-radius:4px;color:var(--dm-text);cursor:pointer;font-size:10px;font-family:inherit;">Uniform</button>' +
    '<button type="button" data-dm-blur-mode="progressive" data-active="false" disabled title="Progressive blur isn\'t available — CSS doesn\'t support a true gradient blur" style="flex:1;padding:5px 8px;background:none;border:none;color:var(--dm-text-dim);cursor:not-allowed;font-size:10px;font-family:inherit;opacity:0.5;">Progressive</button>' +
    '</div>';
  return '<div style="background:var(--dm-bg-secondary);border:1px solid var(--dm-separator);border-radius:6px;padding:8px;">' +
    modeTabs +
    '<div class="dm-field">' +
    '<label class="dm-field-label">Blur</label>' +
    '<div style="display:flex;align-items:center;background:var(--dm-input-bg);border:1px solid var(--dm-input-border);border-radius:5px;overflow:hidden;">' +
    '<input type="number" data-dm-prop="' + prefix + 'radius" min="0" value="' + entry.radius + '" style="background:none;border:none;padding:6px;width:100%;min-width:0;font-family:inherit;font-size:10px;color:var(--dm-text);"/>' +
    '<span style="font-size:9px;color:var(--dm-text-dim);padding-right:6px;opacity:0.6;flex-shrink:0;">px</span>' +
    '</div></div>' +
    '</div>';
}

/* ── Filter presets ── */
const FILTER_PRESETS: Array<{ value: string; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'blur(4px)', label: 'Blur — light' },
  { value: 'blur(12px)', label: 'Blur — strong' },
  { value: 'brightness(1.2)', label: 'Brighter' },
  { value: 'brightness(0.7)', label: 'Darker' },
  { value: 'contrast(1.2)', label: 'High contrast' },
  { value: 'saturate(1.5)', label: 'Vivid' },
  { value: 'saturate(0)', label: 'Grayscale' },
  { value: 'sepia(1)', label: 'Sepia' },
  { value: 'invert(1)', label: 'Invert' },
  { value: 'hue-rotate(90deg)', label: 'Hue shift +90°' },
  { value: 'drop-shadow(0 4px 8px rgba(0,0,0,0.25))', label: 'Drop shadow' },
];

function renderFilterEditor(prop: string, label: string, value: string): string {
  // Legacy entry point — retained for back-compat with any external callers.
  // The structured editor (renderFilterFunctions / renderTransformComponents)
  // is what the design tab now uses.
  const cur = (value || 'none').trim();
  return '<div style="background:var(--dm-bg-secondary);border:1px solid var(--dm-separator);border-radius:6px;padding:8px;">' +
    selKV(label, prop, FILTER_PRESETS.find(p => p.value === cur) ? cur : 'custom', [
      ...FILTER_PRESETS,
      ...(FILTER_PRESETS.find(p => p.value === cur) ? [] : [{ value: 'custom', label: 'Custom (below)' }]),
    ] as any) + sp() +
    inp('Custom value', prop, cur, '') +
    '</div>';
}

// ── Structured Transform Components ──
// translate / scale ship as standalone CSS properties — break each into
// X/Y inputs pre-filled from computed style. Each edit recomposes the
// owning property and fires one applyStyle.
interface TwoComp { x: string; y: string; }

function parseTranslate(val: string): TwoComp {
  if (!val || val === 'none') return { x: '0', y: '0' };
  const parts = val.trim().split(/\s+/);
  const strip = (v: string) => (v || '0').replace(/px$/, '').trim();
  return { x: strip(parts[0]), y: strip(parts[1] || '0') };
}

function parseScale(val: string): TwoComp {
  if (!val || val === 'none') return { x: '1', y: '1' };
  const parts = val.trim().split(/\s+/);
  return { x: (parts[0] || '1').trim(), y: (parts[1] || parts[0] || '1').trim() };
}

function tcompField(group: 'translate' | 'scale', axis: 'x' | 'y', label: string, value: string, unit: string): string {
  return '<div class="dm-field">' +
    '<label class="dm-field-label">' + label + '</label>' +
    '<div style="display:flex;align-items:center;border-radius:5px;overflow:hidden;background:var(--dm-input-bg);border:1px solid var(--dm-input-border);">' +
    '<input type="text" class="dm-input" data-dm-tcomp-group="' + group + '" data-dm-tcomp-axis="' + axis + '" data-dm-numeric="1" data-dm-unit="' + unit + '" inputmode="decimal" value="' + escapeAttr(value) + '" style="background:none;border:none;padding:6px;width:100%;min-width:0;"/>' +
    (unit ? '<span style="font-size:9px;color:var(--dm-text-dim);padding-right:6px;flex-shrink:0;opacity:0.6;pointer-events:none;">' + unit + '</span>' : '') +
    '</div></div>';
}

function renderTransformComponents(s: Record<string, string>): string {
  const t = parseTranslate(s.translate || '');
  const sc = parseScale(s.scale || '');
  return grid(2,
    '<div class="dm-field">' +
      '<label class="dm-field-label">Translate</label>' +
      grid(2, tcompField('translate', 'x', 'X', t.x, 'px'), tcompField('translate', 'y', 'Y', t.y, 'px')) +
    '</div>',
    '<div class="dm-field">' +
      '<label class="dm-field-label">Scale</label>' +
      grid(2, tcompField('scale', 'x', 'X', sc.x, ''), tcompField('scale', 'y', 'Y', sc.y, '')) +
    '</div>'
  );
}

// ── Structured Filter / Backdrop-filter ──
// Common filter functions surfaced as labelled number fields. Pre-filled
// from the element's current value (parsed) or sane defaults. Each edit
// recomposes the whole shorthand and writes via applyStyle.

// Each filter function gets a slider with a paired number field. The slider
// range is chosen so the *neutral* value (no visible effect) sits at the
// middle of the track for the multiplier filters (brightness/contrast/
// saturate, neutral=1, range 0..2) and at zero for hue-rotate (range
// -180..180). Blur and Grayscale have no negative concept — slider sweeps
// from default toward max.
interface FilterField {
  name: string;
  label: string;
  unit: string;
  default: number;
  min: number;
  max: number;
  step: number;
}
const FILTER_FIELDS: FilterField[] = [
  { name: 'blur',        label: 'Blur',        unit: 'px',  default: 0, min: 0,    max: 20,  step: 0.1 },
  { name: 'brightness',  label: 'Brightness',  unit: '',    default: 1, min: 0,    max: 2,   step: 0.05 },
  { name: 'contrast',    label: 'Contrast',    unit: '',    default: 1, min: 0,    max: 2,   step: 0.05 },
  { name: 'saturate',    label: 'Saturate',    unit: '',    default: 1, min: 0,    max: 2,   step: 0.05 },
  { name: 'hue-rotate',  label: 'Hue rotate',  unit: 'deg', default: 0, min: -180, max: 180, step: 1 },
  { name: 'grayscale',   label: 'Grayscale',   unit: '',    default: 0, min: 0,    max: 1,   step: 0.01 },
];

function parseFilter(val: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of FILTER_FIELDS) out[f.name] = f.default;
  if (!val || val === 'none') return out;
  const re = /(blur|brightness|contrast|saturate|hue-rotate|grayscale|invert|sepia)\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(val)) !== null) {
    const fn = m[1];
    const arg = m[2].trim().replace(/(px|deg|%)$/, '').trim();
    const n = parseFloat(arg);
    if (!isNaN(n)) out[fn] = n;
  }
  return out;
}

// One row per filter function: [label · slider · number+unit].
// `input` event recomposes the filter shorthand and writes via applyStyle
// so the page repaints live; slider+number for the same field are kept in
// sync via syncFilterSiblings on every input.
function renderFilterFunctions(propName: 'filter' | 'backdropFilter', value: string): string {
  const parsed = parseFilter(value);
  const groupAttr = propName === 'filter' ? 'filter' : 'bfilter';
  const row = (f: FilterField) => {
    const v = parsed[f.name] ?? f.default;
    return (
      '<div style="display:flex;align-items:center;gap:8px;min-width:0;margin-bottom:6px;">' +
      '<label style="font-size:10px;color:var(--dm-text-muted);text-transform:uppercase;letter-spacing:0.4px;width:64px;flex-shrink:0;">' + f.label + '</label>' +
      '<input type="range" class="dm-fslider" data-dm-fcomp-group="' + groupAttr + '" data-dm-fcomp-field="' + f.name + '" data-dm-fcomp-slider="1" min="' + f.min + '" max="' + f.max + '" step="' + f.step + '" value="' + v + '" style="flex:1;min-width:0;"/>' +
      '<div style="display:flex;align-items:center;border-radius:5px;overflow:hidden;background:var(--dm-input-bg);border:1px solid var(--dm-input-border);width:64px;flex-shrink:0;">' +
      '<input type="text" class="dm-input" data-dm-fcomp-group="' + groupAttr + '" data-dm-fcomp-field="' + f.name + '" data-dm-numeric="1" data-dm-unit="' + f.unit + '" inputmode="decimal" value="' + v + '" style="background:none;border:none;padding:5px 6px;width:100%;min-width:0;font-size:10px;text-align:right;"/>' +
      (f.unit ? '<span style="font-size:9px;color:var(--dm-text-dim);padding:0 4px;flex-shrink:0;opacity:0.6;pointer-events:none;">' + f.unit + '</span>' : '') +
      '</div></div>'
    );
  };
  return FILTER_FIELDS.map(row).join('');
}

/* ── Transition + Animation editors ── */
function renderTransitionEditor(s: Record<string, string>): string {
  const prop = (s.transitionProperty || 'all').split(',')[0].trim();
  const dur = (s.transitionDuration || '0s').split(',')[0].trim();
  const timing = (s.transitionTimingFunction || 'ease').split(',')[0].trim();
  const delay = (s.transitionDelay || '0s').split(',')[0].trim();
  const customCurveActive = vizProp === 'transition';
  const customCurveBtn =
    '<button data-dm-viz-open="transition" title="Open the cubic-bezier / spring visualizer to author a custom timing curve" style="padding:6px;background:' + (customCurveActive ? 'var(--dm-accent-bg)' : 'var(--dm-btn-bg)') + ';border:1px solid ' + (customCurveActive ? 'var(--dm-accent-border)' : 'var(--dm-btn-border)') + ';border-radius:5px;color:' + (customCurveActive ? 'var(--dm-accent)' : 'var(--dm-text-secondary)') + ';cursor:pointer;font-size:10px;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:4px;">' + icon('activity', 11) + ' Custom curve</button>';
  const previewBtn =
    '<button data-dm-action="preview-transition" title="Preview transition" style="padding:6px;background:var(--dm-accent-bg);border:1px solid var(--dm-accent-border);border-radius:5px;color:var(--dm-accent);cursor:pointer;font-size:10px;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:4px;">' + icon('play', 11) + ' Preview</button>';
  return '<div style="background:var(--dm-bg-secondary);border:1px solid var(--dm-separator);border-radius:6px;padding:8px;">' +
    grid(2,
      selKV('Property', 'transitionProperty', prop, TRANSITION_PROPERTY_OPTIONS as any),
      selKV('Timing', 'transitionTimingFunction', timing, TIMING_FUNCTION_OPTIONS as any)
    ) + sp() +
    grid(2,
      inp('Duration', 'transitionDuration', dur, 's'),
      inp('Delay', 'transitionDelay', delay, 's')
    ) + sp() +
    grid(2, customCurveBtn, previewBtn) +
    '</div>';
}

function renderAnimationEditor(s: Record<string, string>): string {
  const name = (s.animationName && s.animationName !== 'none') ? s.animationName.split(',')[0].trim() : 'none';
  const dur = (s.animationDuration || '0s').split(',')[0].trim();
  const timing = (s.animationTimingFunction || 'ease').split(',')[0].trim();
  const delay = (s.animationDelay || '0s').split(',')[0].trim();
  const iter = (s.animationIterationCount || '1').split(',')[0].trim();
  const isInfinite = iter === 'infinite';
  const dir = (s.animationDirection || 'normal').split(',')[0].trim();
  const fill = (s.animationFillMode || 'none').split(',')[0].trim();
  const playState = (s.animationPlayState || 'running').split(',')[0].trim();
  const isBuiltin = name.startsWith('dm-');
  const knownName = isBuiltin || name === 'none' ? name : '';
  const customLabel = isBuiltin || name === 'none' ? '' :
    '<div style="margin-top:4px;font-size:9px;color:var(--dm-text-dim);">Custom: <span style="font-family:monospace;color:var(--dm-text-muted);">' + escapeAttr(name) + '</span> (page must define @keyframes)</div>';
  const iterInput =
    '<div class="dm-field">' +
    '<label class="dm-field-label">Iterations</label>' +
    '<div style="display:flex;align-items:center;gap:4px;">' +
    '<input type="text" class="dm-input" data-dm-prop="animationIterationCount" value="' + escapeAttr(iter) + '" style="flex:1;min-width:0;background:var(--dm-input-bg);border:1px solid var(--dm-input-border);border-radius:5px;padding:6px;"/>' +
    '<button data-dm-prop="animationIterationCount" data-dm-value="' + (isInfinite ? '1' : 'infinite') + '" title="Toggle infinite" style="padding:6px 8px;background:' + (isInfinite ? 'var(--dm-accent-bg)' : 'var(--dm-btn-bg)') + ';border:1px solid ' + (isInfinite ? 'var(--dm-accent-border)' : 'var(--dm-btn-border)') + ';border-radius:4px;color:' + (isInfinite ? 'var(--dm-accent)' : 'var(--dm-text-dim)') + ';cursor:pointer;font-size:11px;font-family:inherit;">∞</button>' +
    '</div></div>';
  const previewBtn =
    '<button data-dm-action="preview-animation" title="Restart animation" style="padding:6px;background:var(--dm-accent-bg);border:1px solid var(--dm-accent-border);border-radius:5px;color:var(--dm-accent);cursor:pointer;font-size:10px;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:4px;align-self:flex-end;">' + icon('play', 11) + ' Preview</button>';
  return '<div style="background:var(--dm-bg-secondary);border:1px solid var(--dm-separator);border-radius:6px;padding:8px;">' +
    selKV('Animation', 'animationName', knownName, ANIMATION_NAME_OPTIONS as any) +
    customLabel + sp() +
    grid(2,
      inp('Duration', 'animationDuration', dur, 's'),
      selKV('Timing', 'animationTimingFunction', timing, TIMING_FUNCTION_OPTIONS as any)
    ) + sp() +
    grid(2,
      inp('Delay', 'animationDelay', delay, 's'),
      iterInput
    ) + sp() +
    grid(2,
      selKV('Direction', 'animationDirection', dir, ANIMATION_DIRECTION_OPTIONS as any),
      selKV('Fill', 'animationFillMode', fill, ANIMATION_FILL_OPTIONS as any)
    ) + sp() +
    grid(2,
      selKV('State', 'animationPlayState', playState, ANIMATION_PLAY_STATE_OPTIONS as any),
      previewBtn
    ) +
    '</div>';
}

// ── Motion interactions (trigger-first UI) ─────────────────────────────
// Derives interaction cards from the element's state-variant style changes.
// Each distinct state (`:hover`, …) present on the element becomes one card.
function motionInteractionsFor(elId: string): Array<{ trigger: typeof MOTION_TRIGGERS[number]; changes: StyleChange[] }> {
  if (!elId) return [];
  const byState = new Map<string, StyleChange[]>();
  for (const c of styleChanges) {
    if (c.elementId !== elId || !c.state) continue;
    if (!byState.has(c.state)) byState.set(c.state, []);
    byState.get(c.state)!.push(c);
  }
  const out: Array<{ trigger: typeof MOTION_TRIGGERS[number]; changes: StyleChange[] }> = [];
  for (const t of MOTION_TRIGGERS) {
    const changes = byState.get(t.state);
    if (changes && changes.length) out.push({ trigger: t, changes });
  }
  return out;
}

function motionInteractionSummary(verb: string, changes: StyleChange[], dur: string, timing: string): string {
  const parts = changes.map(c => motionChangeLabel(c.property).toLowerCase() + ' → ' + c.newValue);
  return verb + ' → ' + parts.join(', ') + ' · ' + dur + ' ' + timing;
}

// Shared card chrome for the trigger cards.
function motionCardHeader(iconName: keyof typeof icons, verb: string, trigger: string, opts: { forced?: boolean; preview?: boolean }): string {
  const previewBtn = opts.preview
    ? '<button class="dm-fill-action" data-dm-motion-preview="' + trigger + '" title="' + (opts.forced ? 'Stop previewing' : 'Preview') + '" data-active="' + (opts.forced ? 'true' : 'false') + '">' + icon(opts.forced ? 'circlePause' : 'play', 12) + '</button>'
    : '';
  return '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">' +
    '<span style="color:var(--dm-text-secondary);display:flex;">' + icon(iconName, 13) + '</span>' +
    '<span style="font-size:11px;font-weight:600;color:var(--dm-text);flex:1;">' + verb + '</span>' +
    previewBtn +
    '<button class="dm-fill-action" data-dm-motion-remove-trigger="' + trigger + '" title="Remove" style="color:var(--dm-danger);">' + icon('trash', 12) + '</button>' +
    '</div>';
}
function motionCardWrap(inner: string, active: boolean): string {
  return '<div style="background:var(--dm-bg-secondary);border:1px solid ' + (active ? 'var(--dm-accent-border)' : 'var(--dm-separator)') + ';border-radius:6px;padding:8px;margin-bottom:8px;">' + inner + '</div>';
}

function renderMotionInteractionCard(t: typeof MOTION_TRIGGERS[number], changes: StyleChange[], s: Record<string, string>): string {
  const dur = (s.transitionDuration || '0.2s').split(',')[0].trim();
  const timing = (s.transitionTimingFunction || 'ease').split(',')[0].trim();
  const isForced = motionForcedTrigger === t.trigger;
  // Appear can't be forced via a class (@starting-style fires on mount), so
  // its preview re-inserts the element instead — still a play button.
  const changeRow = (c: StyleChange): string => {
    const vprop = '__motion_' + t.trigger + '__' + c.property;
    return '<div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;">' +
      '<span style="font-size:10px;color:var(--dm-text-muted);width:74px;flex-shrink:0;">' + escapeAttr(motionChangeLabel(c.property)) + (t.trigger === 'appear' ? ' from' : '') + '</span>' +
      '<input type="text" class="dm-input dm-input-bare" data-dm-prop="' + vprop + '" value="' + escapeAttr(c.newValue) + '" spellcheck="false" style="flex:1;min-width:0;background:var(--dm-input-bg);border:1px solid var(--dm-input-border);border-radius:4px;"/>' +
      '<button class="dm-fill-action" data-dm-motion-remove-change="' + t.trigger + ':' + escapeAttr(c.property) + '" title="Remove this change" style="color:var(--dm-danger);flex-shrink:0;">' + icon('x', 11) + '</button>' +
      '</div>';
  };

  const present = new Set(changes.map(c => c.property));
  const chips = Object.entries(motionPresetsFor(t.trigger))
    .filter(([, p]) => !present.has(p.prop))
    .map(([key, p]) =>
      '<button class="dm-btn" data-dm-motion-add-change="' + t.trigger + ':' + key + '" title="Animate ' + escapeAttr(p.label.toLowerCase()) + '" style="padding:3px 7px;font-size:9px;display:inline-flex;align-items:center;gap:3px;">' + icon(p.icon, 10) + escapeAttr(p.label) + '</button>')
    .join('');

  const curve = '<div style="display:flex;align-items:center;gap:6px;margin-top:8px;">' +
    '<span style="font-size:10px;color:var(--dm-text-muted);width:74px;flex-shrink:0;">Curve</span>' +
    '<input type="text" class="dm-input dm-input-bare" data-dm-prop="transitionDuration" data-dm-numeric="1" data-dm-unit="s" inputmode="decimal" value="' + escapeAttr(parseFloat(dur).toString()) + '" title="Duration (seconds)" style="width:52px;flex-shrink:0;background:var(--dm-input-bg);border:1px solid var(--dm-input-border);border-radius:4px;"/>' +
    '<select class="dm-select" data-dm-prop="transitionTimingFunction" style="flex:1;min-width:0;font-size:10px;">' +
      (TIMING_FUNCTION_OPTIONS as readonly string[]).map(o => '<option value="' + o + '"' + (o === timing ? ' selected' : '') + '>' + o + '</option>').join('') +
    '</select>' +
    '</div>';

  const summary = '<div style="font-size:10px;color:var(--dm-text-dim);margin-top:8px;font-style:italic;">' + escapeAttr(motionInteractionSummary(t.verb, changes, dur, timing)) + '</div>';

  return motionCardWrap(
    motionCardHeader(t.icon, t.verb, t.trigger, { forced: isForced, preview: true }) +
    changes.map(changeRow).join('') +
    (chips ? '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;">' + chips + '</div>' : '') +
    curve + summary,
    isForced,
  );
}

// Loop card — an infinite keyframe animation (the timeline family). Writes
// base animation-* longhands; reuses the shared built-in keyframes.
function renderMotionLoopCard(s: Record<string, string>): string {
  const name = (s.animationName || 'none').split(',')[0].trim();
  const dur = (s.animationDuration || '1s').split(',')[0].trim();
  const picker = '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">' +
    '<span style="font-size:10px;color:var(--dm-text-muted);width:74px;flex-shrink:0;">Animation</span>' +
    '<select class="dm-select" data-dm-prop="animationName" style="flex:1;min-width:0;font-size:10px;">' +
      MOTION_KEYFRAME_OPTIONS.map(o => '<option value="' + o.value + '"' + (o.value === name ? ' selected' : '') + '>' + o.label + '</option>').join('') +
    '</select></div>';
  const durRow = '<div style="display:flex;align-items:center;gap:6px;">' +
    '<span style="font-size:10px;color:var(--dm-text-muted);width:74px;flex-shrink:0;">Duration</span>' +
    '<input type="text" class="dm-input dm-input-bare" data-dm-prop="animationDuration" data-dm-numeric="1" data-dm-unit="s" inputmode="decimal" value="' + escapeAttr(parseFloat(dur).toString()) + '" style="width:52px;flex-shrink:0;background:var(--dm-input-bg);border:1px solid var(--dm-input-border);border-radius:4px;"/>' +
    '<span style="font-size:10px;color:var(--dm-text-dim);align-self:center;">· repeats forever</span></div>';
  return motionCardWrap(
    motionCardHeader('activity', 'Loop', 'loop', { preview: true }) + picker + durRow,
    false,
  );
}

// Scroll card — binds a keyframe animation's progress to scroll position via
// a view() timeline. No time-preview (it plays as you scroll the page).
function renderMotionScrollCard(s: Record<string, string>): string {
  const name = ((s as any).animationName || 'none').split(',')[0].trim();
  const range = ((s as any).animationRange || 'entry 0% cover 40%').trim();
  const picker = '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">' +
    '<span style="font-size:10px;color:var(--dm-text-muted);width:74px;flex-shrink:0;">Animation</span>' +
    '<select class="dm-select" data-dm-prop="animationName" style="flex:1;min-width:0;font-size:10px;">' +
      MOTION_KEYFRAME_OPTIONS.map(o => '<option value="' + o.value + '"' + (o.value === name ? ' selected' : '') + '>' + o.label + '</option>').join('') +
    '</select></div>';
  const rangeRow = '<div style="display:flex;align-items:center;gap:6px;">' +
    '<span style="font-size:10px;color:var(--dm-text-muted);width:74px;flex-shrink:0;">Range</span>' +
    '<input type="text" class="dm-input dm-input-bare" data-dm-prop="animationRange" value="' + escapeAttr(range) + '" spellcheck="false" title="Scroll range that drives the animation, e.g. &quot;entry 0% cover 40%&quot;" style="flex:1;min-width:0;background:var(--dm-input-bg);border:1px solid var(--dm-input-border);border-radius:4px;"/></div>';
  const note = '<div style="font-size:10px;color:var(--dm-text-dim);margin-top:8px;font-style:italic;">Plays as this element scrolls through the viewport (Chrome 115+).</div>';
  return motionCardWrap(
    motionCardHeader('arrowUpDown', 'On scroll', 'scroll', { preview: false }) + picker + rangeRow + note,
    false,
  );
}

function motionLoopSet(s: Record<string, string>): boolean {
  const name = (s.animationName || 'none').split(',')[0].trim();
  const iter = (s.animationIterationCount || '1').split(',')[0].trim();
  const timeline = ((s as any).animationTimeline || 'auto').trim();
  return name !== 'none' && name !== '' && iter === 'infinite' && (timeline === 'auto' || timeline === '');
}
function motionScrollSet(s: Record<string, string>): boolean {
  const timeline = ((s as any).animationTimeline || 'auto').trim();
  return timeline !== 'auto' && timeline !== '';
}

function renderMotionInteractions(s: Record<string, string>, elId: string): string {
  const interactions = motionInteractionsFor(elId);
  const cards = interactions.map(i => renderMotionInteractionCard(i.trigger, i.changes, s)).join('');
  const loopSet = motionLoopSet(s);
  const scrollSet = motionScrollSet(s);
  const timelineCards = (scrollSet ? renderMotionScrollCard(s) : '') + (loopSet ? renderMotionLoopCard(s) : '');
  const used = new Set<string>(interactions.map(i => i.trigger.trigger));
  if (loopSet) used.add('loop');
  if (scrollSet) used.add('scroll');
  const addDefs: Array<{ trigger: string; label: string; icon: keyof typeof icons }> = [
    ...MOTION_TRIGGERS.map(t => ({ trigger: t.trigger, label: t.label, icon: t.icon })),
    { trigger: 'loop', label: 'Loop', icon: 'activity' },
    { trigger: 'scroll', label: 'Scroll', icon: 'arrowUpDown' },
  ];
  const addChips = addDefs.filter(t => !used.has(t.trigger)).map(t =>
    '<button class="dm-btn" data-dm-motion-add-trigger="' + t.trigger + '" title="Animate ' + t.label + '" style="padding:4px 8px;font-size:10px;display:inline-flex;align-items:center;gap:4px;">' + icon(t.icon, 11) + t.label + '</button>').join('');
  const anyCard = cards || timelineCards;
  const addRow = addChips
    ? '<div style="display:flex;flex-wrap:wrap;gap:5px;' + (anyCard ? 'margin-top:2px;' : '') + '">' +
      '<span style="font-size:10px;color:var(--dm-text-dim);align-self:center;margin-right:2px;">When:</span>' + addChips + '</div>'
    : '';
  return cards + timelineCards + addRow;
}

/* ── v1.2: Curve math helpers ── */
function sampleBezier(x1: number, y1: number, x2: number, y2: number, n = 40): {x: number; y: number}[] {
  function b(t: number, p0: number, p1: number, p2: number, p3: number): number {
    const mt = 1 - t;
    return mt*mt*mt*p0 + 3*mt*mt*t*p1 + 3*mt*t*t*p2 + t*t*t*p3;
  }
  const pts: {x: number; y: number}[] = [];
  for (let i = 0; i <= n; i++) { const t = i/n; pts.push({ x: b(t,0,x1,x2,1), y: b(t,0,y1,y2,1) }); }
  return pts;
}

function simulateSpring(stiffness: number, damping: number, mass: number, steps = 40): number[] {
  const dt = 0.025;
  let pos = 0, vel = 0;
  const result: number[] = [0];
  for (let i = 0; i < steps; i++) {
    const acc = (-stiffness*(pos-1) - damping*vel) / Math.max(mass, 0.1);
    vel += acc*dt; pos += vel*dt;
    result.push(pos);
  }
  return result;
}

function bptsToPolyline(pts: {x: number; y: number}[], w: number, h: number): string {
  const yMin = -0.2, yMax = 1.2, yr = yMax - yMin;
  return pts.map(p => (p.x*w).toFixed(1) + ',' + ((1-(p.y-yMin)/yr)*h).toFixed(1)).join(' ');
}

function narrToPolyline(arr: number[], w: number, h: number): string {
  const yMin = -0.2, yMax = 1.2, yr = yMax - yMin;
  return arr.map((y, i) => ((i/(arr.length-1))*w).toFixed(1) + ',' + ((1-(y-yMin)/yr)*h).toFixed(1)).join(' ');
}

/* ── v1.2: Transition Visualizer ── */
function renderVizPanel(): string {
  const isEase = vizMode === 'ease';
  const mBtn = (m: 'ease' | 'spring', label: string) => {
    const a = vizMode === m;
    return '<button data-dm-viz-mode="' + m + '" style="flex:1;padding:3px 6px;background:' + (a?'var(--dm-accent-bg)':'var(--dm-btn-bg)') + ';border:1px solid ' + (a?'var(--dm-accent-border)':'var(--dm-btn-border)') + ';border-radius:4px;color:' + (a?'var(--dm-accent)':'var(--dm-text-secondary)') + ';cursor:pointer;font-size:9px;font-family:inherit;">' + label + '</button>';
  };
  const srow = (lbl: string, param: string, val: number, mn: number, mx: number, st: number) =>
    '<div style="display:flex;align-items:center;gap:5px;margin-bottom:4px;">' +
    '<span style="width:22px;font-size:9px;color:var(--dm-text-muted);flex-shrink:0;">' + lbl + '</span>' +
    '<input type="range" data-dm-viz-param="' + param + '" min="' + mn + '" max="' + mx + '" step="' + st + '" value="' + val + '" style="flex:1;accent-color:var(--dm-accent);height:3px;"/>' +
    '<span style="width:28px;text-align:right;font-size:9px;color:var(--dm-text-dim);font-family:monospace;">' + val.toFixed(2) + '</span>' +
    '</div>';
  const polyline = isEase
    ? bptsToPolyline(sampleBezier(bezX1, bezY1, bezX2, bezY2), 74, 36)
    : narrToPolyline(simulateSpring(sprStiffness, sprDamping, sprMass), 74, 36);
  const svg = '<svg width="78" height="40" style="display:block;border-radius:4px;border:1px solid var(--dm-separator);background:var(--dm-bg);flex-shrink:0;">' +
    '<polyline points="' + polyline + '" fill="none" stroke="var(--dm-accent)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" transform="translate(2,2)"/></svg>';
  const sliders = isEase
    ? srow('x1','bezX1',bezX1,-1,2,0.01)+srow('y1','bezY1',bezY1,-1,2,0.01)+srow('x2','bezX2',bezX2,-1,2,0.01)+srow('y2','bezY2',bezY2,-1,2,0.01)
    : srow('K','sprStiffness',sprStiffness,10,500,1)+srow('B','sprDamping',sprDamping,0,100,0.5)+srow('M','sprMass',sprMass,0.1,10,0.1);
  let cssVal = '';
  if (isEase) {
    cssVal = 'all 0.3s cubic-bezier(' + [bezX1,bezY1,bezX2,bezY2].map(v=>v.toFixed(2)).join(',') + ')';
  } else {
    const dur = Math.max(0.1, 2*Math.PI*Math.sqrt(Math.max(sprMass,0.1)/Math.max(sprStiffness,1))).toFixed(2);
    cssVal = 'all ' + dur + 's ease-in-out';
  }
  return '<div data-dm-viz style="margin-top:6px;padding:8px;background:var(--dm-bg-secondary);border:1px solid var(--dm-separator);border-radius:8px;">' +
    '<div style="display:flex;gap:4px;margin-bottom:8px;align-items:center;">' +
    mBtn('ease','Easing') + mBtn('spring','Spring') +
    '<button data-dm-action="close-viz" style="margin-left:auto;background:none;border:none;color:var(--dm-text-muted);cursor:pointer;padding:2px;display:flex;">' + icon('x',10) + '</button>' +
    '</div>' +
    '<div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:8px;">' + svg +
    '<div style="flex:1;min-width:0;">' + sliders + '</div></div>' +
    '<button data-dm-action="apply-viz" style="width:100%;padding:4px 6px;background:var(--dm-accent-bg);border:1px solid var(--dm-accent-border);border-radius:4px;color:var(--dm-accent);cursor:pointer;font-size:9px;font-family:inherit;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
    'Apply: ' + escapeAttr(cssVal) + '</button>' +
    '</div>';
}

/* ── Presets View — user-saved styles, 7 kinds (one per Design-tab section). ── */
// Design-system / Tokens view — lists every :root CSS variable the page
// declares (grouped by purpose) plus the implicit scales detected from
// computed styles of viewport-visible elements. The user can:
//   • see the original value + a swatch / preview per row
//   • edit declared CSS variables (the page repaints live across every
//     consumer)
//   • reset edited tokens back to their original value
//   • click "×N uses" to highlight every element on the page that
//     resolves to that token (existing multi-select overlay system)
//   • spot drift — values close-but-not-equal to a declared token
//
// This panel replaced the user-saved-preset feature. The bookmark icon
// in the header is now the swatchBook icon.
function renderTokensView(): string {
  // Token data is fetched lazily when the panel opens. Until it arrives
  // we render an empty-state with a small spinner-like message.
  if (!designSystem) {
    refreshDesignSystem();
  }
  const ds: DesignSystemPayload = designSystem || { tokens: [], scales: { spacing: [], radius: [], fontSize: [], shadow: [] }, systems: [], scopes: [] };

  const header = '<div style="display:flex;align-items:center;gap:6px;padding:8px 10px;border-bottom:1px solid var(--dm-separator-strong);flex-shrink:0;background:var(--dm-bg);">' +
    '<button data-dm-action="close-tokens" style="background:none;border:none;color:var(--dm-text-secondary);cursor:pointer;display:flex;padding:2px;" title="Back">' + icon('chevronLeft', 14) + '</button>' +
    '<span style="font-size:13px;font-weight:600;color:var(--dm-text);flex:1;">Design system</span>' +
    '<label class="dm-token-io-btn dm-token-io-btn-labelled" title="Import design-system JSON">' +
      icon('upload', 11) + '<span>Import</span>' +
      '<input type="file" accept=".json" data-dm-tokens-import style="display:none;"/></label>' +
    '<button data-dm-action="tokens-export" class="dm-token-io-btn dm-token-io-btn-labelled" title="Export the detected design system as JSON">' + icon('download', 11) + '<span>Export</span></button>' +
    '<button data-dm-action="refresh-tokens" class="dm-token-io-btn" title="Rescan the page">' + icon('rotateCw', 11) + '</button>' +
    '</div>';

  // Per-tab chip count — the same chip strip is shown on every tab but
  // each tab maps the chip onto its own content (see plan's table).
  const detectedCountForChip = (g: TokenFilter): number => {
    if (g === 'spacing') return ds.scales.spacing.length;
    if (g === 'radius') return ds.scales.radius.length;
    if (g === 'typography') return ds.scales.fontSize.length;
    if (g === 'shadow') return ds.scales.shadow.length;
    if (g === 'all') return ds.scales.spacing.length + ds.scales.radius.length + ds.scales.fontSize.length + ds.scales.shadow.length;
    return 0; // colour / other → no detected scale
  };
  const presetKindsForChip = (g: TokenFilter): PresetKindLocal[] => {
    if (g === 'all') return ['position', 'layout', 'appearance', 'typography', 'fill', 'stroke', 'effects', 'motion'];
    if (g === 'typography') return ['typography'];
    if (g === 'spacing') return ['layout'];
    if (g === 'radius') return ['appearance'];
    if (g === 'shadow') return ['effects'];
    if (g === 'colour') return ['fill', 'stroke'];
    if (g === 'other') return ['position', 'motion'];
    return [];
  };
  const definedCountForChip = (g: TokenFilter): number => {
    const kinds = new Set<PresetKindLocal>(presetKindsForChip(g));
    return customPresets.filter(p => kinds.has(p.kind)).length;
  };

  const countFor = (g: TokenFilter): number => {
    if (tokensTab === 'declared') {
      if (g === 'all') return ds.tokens.length;
      return ds.tokens.filter(t => t.group === g).length;
    }
    if (tokensTab === 'detected') return detectedCountForChip(g);
    return definedCountForChip(g);
  };

  // One filter row: detected design-system chips on the left (Carbon,
  // shadcn, Tailwind…), the group selector as a dropdown pinned to the
  // right end. The system chips only appear when a known system is
  // detected on the Declared tab; the group dropdown is always present.
  const filterRow = (() => {
    const systemChips = (ds.systems.length > 0 && tokensTab === 'declared')
      ? ds.systems.map(sys => {
          const active = tokenSystemFilter === sys.id;
          return '<button data-dm-token-system="' + escapeAttr(sys.id) + '" data-active="' + (active ? 'true' : 'false') + '" class="dm-token-chip" title="' + escapeAttr(sys.label) + ' — ' + sys.tokenCount + ' tokens">' +
            '<span style="color:var(--dm-accent);">◆</span> ' + escapeAttr(sys.label) +
            ' <span class="dm-token-chip-count">' + sys.tokenCount + '</span></button>';
        }).join('')
      : '';
    const groupOption = (key: TokenFilter, label: string) =>
      '<option value="' + key + '"' + (tokenFilter === key ? ' selected' : '') + '>' + escapeAttr(label) + ' (' + countFor(key) + ')</option>';
    const groupSelect = '<span style="position:relative;display:inline-flex;align-items:center;flex-shrink:0;">' +
      '<select class="dm-select" data-dm-token-group title="Filter by token group" style="width:auto;font-size:10px;padding-right:22px;">' +
        groupOption('all', 'All') +
        groupOption('colour', 'Colours') +
        groupOption('typography', 'Type') +
        groupOption('spacing', 'Spacing') +
        groupOption('radius', 'Radius') +
        groupOption('shadow', 'Shadow') +
        groupOption('other', 'Other') +
      '</select>' +
      '<span style="position:absolute;right:6px;display:flex;color:var(--dm-text-muted);pointer-events:none;">' + icon('chevronDown', 12) + '</span>' +
    '</span>';
    return '<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">' +
      systemChips +
      '<div style="flex:1;min-width:8px;"></div>' +
      groupSelect +
    '</div>';
  })();

  // Scope picker — which theme's token declarations to show. Only :root
  // and theme-level scopes (`.dark`, `.cds--g100`, `[data-theme]`) belong
  // here: those are the whole-page variants a user switches between.
  // Component scopes — Tailwind utility classes, the universal `*` default
  // block, `:where(...)` helpers — are implementation noise for this
  // control; they're browsable in the Component tokens section instead.
  const scopePicker = (() => {
    if (tokensTab !== 'declared') return '';
    const isUniversal = (sel: string) => /(^|[\s,])\*/.test(sel);
    const declaredScopes = new Map<string, { scope: TokenScope; count: number }>();
    for (const t of ds.tokens) {
      for (const v of t.variants) {
        if (v.scope.kind === 'component') continue;
        if (isUniversal(v.scope.selector)) continue;
        const hit = declaredScopes.get(v.scope.selector);
        if (hit) hit.count++;
        else declaredScopes.set(v.scope.selector, { scope: v.scope, count: 1 });
      }
    }
    if (declaredScopes.size <= 1) return '';
    // Themes first, then the richest sets — the scopes a user actually
    // wants to switch between sit at the top of the list.
    const sorted = Array.from(declaredScopes.values()).sort((a, b) =>
      Number(b.scope.active) - Number(a.scope.active) || b.count - a.count);
    const opts = ['<option value="all"' + (tokenScopeFilter === 'all' ? ' selected' : '') + '>All scopes</option>'];
    for (const { scope: s, count } of sorted) {
      const label = s.selector + ' · ' + count + (s.active ? '' : ' · inactive');
      opts.push('<option value="' + escapeAttr(s.selector) + '"' + (tokenScopeFilter === s.selector ? ' selected' : '') + '>' + escapeAttr(label) + '</option>');
    }
    return '<select class="dm-select" data-dm-token-scope-filter style="width:100%;font-size:10px;">' + opts.join('') + '</select>';
  })();

  // Chrome row (chips + search + checkbox) shown on every tab so the
  // user has consistent filtering affordances throughout the panel.
  const filterChrome =
    '<div style="padding:8px 10px;border-bottom:1px solid var(--dm-separator);flex-shrink:0;display:flex;flex-direction:column;gap:6px;background:var(--dm-bg);position:relative;z-index:2;">' +
      filterRow +
      scopePicker +
      '<input type="text" class="dm-input" data-dm-token-search value="' + escapeAttr(tokenSearch) + '" placeholder="Search tokens…" style="width:100%;font-size:10px;padding:5px 8px;box-sizing:border-box;"/>' +
      '<label style="display:flex;align-items:center;gap:6px;font-size:10px;color:var(--dm-text-secondary);cursor:pointer;">' +
        '<input type="checkbox" data-dm-tokens-used-only' + (tokenUsedOnlyFilter ? ' checked' : '') + ' style="accent-color:var(--dm-accent);"/>' +
        '<span>Show only tokens used on this page</span>' +
      '</label>' +
    '</div>';

  // Tab strip — Declared / Detected / Defined. Sticky-pin-style so it
  // stays visible while the body scrolls.
  const tabStrip = (() => {
    const tab = (key: TokensTab, label: string, count: number) => {
      const active = tokensTab === key;
      return '<button class="dm-segmented-item" data-dm-action="switch-tokens-tab" data-tokens-tab="' + key + '" data-active="' + (active ? 'true' : 'false') + '">' +
        '<span>' + escapeAttr(label) + '</span>' +
        '<span class="dm-tokens-tab-count">' + count + '</span>' +
      '</button>';
    };
    const declaredCount = ds.tokens.length;
    const detectedCount = ds.scales.spacing.length + ds.scales.radius.length + ds.scales.fontSize.length + ds.scales.shadow.length;
    const definedCount = customPresets.length;
    return '<div class="dm-tokens-tabs" style="background:var(--dm-bg);">' +
      '<div class="dm-segmented">' +
        tab('declared', 'Declared', declaredCount) +
        tab('detected', 'Detected', detectedCount) +
        tab('defined', 'Defined', definedCount) +
      '</div>' +
    '</div>';
  })();

  const filter = tokenSearch.toLowerCase().trim();
  const matchesFilter = (s: string) => !filter || s.toLowerCase().includes(filter);
  const passesUsedFilter = (t: DesignToken) => !tokenUsedOnlyFilter || t.usageCount > 0;
  const systemLabelFor = (id?: string) => ds.systems.find(s => s.id === id)?.label || '';
  // The scope a row represents: the selected one when the user has picked
  // a scope and this token declares in it, otherwise the token's primary.
  const effectiveScope = (t: DesignToken): TokenScope =>
    (tokenScopeFilter !== 'all' && t.variants.find(v => v.scope.selector === tokenScopeFilter)?.scope) || t.scope;
  const passesTokenFilters = (t: DesignToken) =>
    passesUsedFilter(t) &&
    (tokenScopeFilter === 'all' || t.scopes.includes(tokenScopeFilter)) &&
    (!tokenSystemFilter || t.system === tokenSystemFilter) &&
    (matchesFilter(t.cssVar) || matchesFilter(t.resolvedValue) || matchesFilter(t.value) ||
      t.scopes.some(matchesFilter) || matchesFilter(systemLabelFor(t.system)));
  const showGroup = (g: TokenFilter) => tokenFilter === 'all' || tokenFilter === g;

  // Component-scoped tokens render in their own section below the
  // page-wide sets, so the semantic groups stay readable.
  const tFilter = (group: TokenGroup) => ds.tokens.filter(t =>
    t.group === group && effectiveScope(t).kind !== 'component' && passesTokenFilters(t),
  );
  const componentTokens = ds.tokens.filter(t =>
    effectiveScope(t).kind === 'component' && showGroup(t.group) && passesTokenFilters(t),
  );

  // Groups for the Declared tab — only declared :root token buckets.
  // Detected scales render on the Detected tab via a separate branch.
  const declaredGroups: { key: TokenGroup; label: string; tokens: DesignToken[] }[] = [];
  if (showGroup('colour')) declaredGroups.push({ key: 'colour', label: 'Colour', tokens: tFilter('colour') });
  if (showGroup('typography')) declaredGroups.push({ key: 'typography', label: 'Typography', tokens: tFilter('typography') });
  if (showGroup('spacing')) declaredGroups.push({ key: 'spacing', label: 'Spacing', tokens: tFilter('spacing') });
  if (showGroup('radius')) declaredGroups.push({ key: 'radius', label: 'Radius', tokens: tFilter('radius') });
  if (showGroup('shadow')) declaredGroups.push({ key: 'shadow', label: 'Shadow', tokens: tFilter('shadow') });
  if (showGroup('other')) declaredGroups.push({ key: 'other', label: 'Other', tokens: tFilter('other') });

  // Detected groups for the Detected tab. Filter by chip + search.
  // Chip maps: Spacing→spacing scale, Radius→radius scale,
  // Type→fontSize scale, Shadow→shadow scale; Colours/Other empty.
  const showDetectedScale = (chipKey: TokenFilter): boolean =>
    tokenFilter === 'all' || tokenFilter === chipKey;
  const detectedGroups: { key: string; label: string; group: TokenGroup; entries: ScaleEntry[] }[] = [];
  if (showDetectedScale('spacing')) {
    detectedGroups.push({ key: 'detected-spacing',  label: 'Spacing',   group: 'spacing',    entries: ds.scales.spacing.filter(e => matchesFilter(e.value)) });
  }
  if (showDetectedScale('radius')) {
    detectedGroups.push({ key: 'detected-radius',   label: 'Radius',    group: 'radius',     entries: ds.scales.radius.filter(e => matchesFilter(e.value)) });
  }
  if (showDetectedScale('typography')) {
    detectedGroups.push({ key: 'detected-fontSize', label: 'Font size', group: 'typography', entries: ds.scales.fontSize.filter(e => matchesFilter(e.value)) });
  }
  if (showDetectedScale('shadow')) {
    detectedGroups.push({ key: 'detected-shadow',   label: 'Shadow',    group: 'shadow',     entries: ds.scales.shadow.filter(e => matchesFilter(e.value)) });
  }

  // Per-row preview swatch — type-aware. For colours we paint a chip; for
  // shadows we stamp the shadow on a white square; for everything else we
  // render the value text in monospace.
  const renderSwatch = (group: TokenGroup, value: string): string => {
    const safe = safeCssColor(value) || value;
    if (group === 'colour') {
      return '<span style="width:18px;height:18px;border-radius:4px;border:1px solid var(--dm-separator-strong);background:' + escapeAttr(safe) + ';flex-shrink:0;"></span>';
    }
    if (group === 'shadow') {
      return '<span style="width:24px;height:18px;border-radius:3px;background:#fff;border:1px solid var(--dm-separator);box-shadow:' + escapeAttr(value) + ';flex-shrink:0;"></span>';
    }
    if (group === 'radius') {
      return '<span style="width:18px;height:18px;border:2px solid var(--dm-text-secondary);border-radius:' + escapeAttr(value) + ';flex-shrink:0;"></span>';
    }
    if (group === 'spacing') {
      const n = Math.max(2, Math.min(18, parseFloat(value) || 0));
      return '<span style="width:18px;height:18px;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><span style="width:' + n + 'px;height:3px;background:var(--dm-accent);border-radius:1px;"></span></span>';
    }
    if (group === 'typography') {
      const n = Math.max(8, Math.min(18, parseFloat(value) || 12));
      return '<span style="width:18px;height:18px;display:flex;align-items:center;justify-content:center;color:var(--dm-text);font-size:' + n + 'px;line-height:1;flex-shrink:0;">A</span>';
    }
    return '<span style="width:8px;height:8px;border-radius:50%;background:var(--dm-text-dim);flex-shrink:0;"></span>';
  };

  // ── Declared body ──
  const renderDeclaredRow = (t: DesignToken) => {
    // With a scope selected, the row shows (and edits) that scope's own
    // declaration — the same token carries a different value per theme.
    const variant = tokenScopeFilter !== 'all'
      ? t.variants.find(v => v.scope.selector === tokenScopeFilter)
      : undefined;
    const scope = variant ? variant.scope : t.scope;
    const scopeSel = scope.selector;
    const edited = editedTokens.has(tokenEditKey(scopeSel, t.cssVar));
    const baseValue = variant ? (variant.resolvedValue || variant.value) : (t.resolvedValue || t.value);
    const displayValue = edited ? editedTokens.get(tokenEditKey(scopeSel, t.cssVar))! : baseValue;
    const swatch = renderSwatch(t.group, displayValue);
    const valueInputAttrs = 'data-dm-token-edit="' + escapeAttr(t.cssVar) + '" data-dm-token-scope="' + escapeAttr(scopeSel) + '" value="' + escapeAttr(displayValue) + '"';
    const usageLabel = t.usageCount > 0 ? '×' + t.usageCount + ' uses' : 'unused';
    const usageTitle = t.usageCount > 0
      ? 'Highlight ' + t.usageCount + ' element' + (t.usageCount === 1 ? '' : 's') + ' using this token'
      : 'No on-page consumers — declared but never resolved on this page';
    // Scope chip on anything not declared at :root, so the user can see
    // which theme / component the value they're editing belongs to.
    const scopeChip = scopeSel !== ':root'
      ? '<span class="dm-token-scope-chip" data-inactive="' + (scope.active ? 'false' : 'true') + '" title="Declared on ' + escapeAttr(scopeSel) + (scope.active ? '' : ' — not active on this page') + '">' + escapeAttr(scopeSel) + '</span>'
      : '';
    const focused = tokensFocusVar === t.cssVar;
    return '<div class="dm-token-row" data-dm-token-row="' + escapeAttr(t.cssVar) + '"' + (focused ? ' data-dm-token-focused="true"' : '') + '>' +
      swatch +
      '<span class="dm-token-name" title="' + escapeAttr(t.cssVar) + '">' + escapeAttr(t.cssVar) + '</span>' +
      scopeChip +
      '<input class="dm-input dm-token-value" type="text" ' + valueInputAttrs + ' />' +
      '<button class="dm-token-uses" data-dm-token-find-uses="' + escapeAttr(t.cssVar) + '" data-unused="' + (t.usageCount === 0 ? 'true' : 'false') + '" data-active="' + (tokenUsesActiveVar === t.cssVar ? 'true' : 'false') + '" title="' + escapeAttr(tokenUsesActiveVar === t.cssVar ? 'Click to hide highlights' : usageTitle) + '">' + usageLabel + '</button>' +
      (edited
        ? '<button class="dm-token-reset" data-dm-token-reset="' + escapeAttr(t.cssVar) + '" data-dm-token-scope="' + escapeAttr(scopeSel) + '" title="Restore original value">' + icon('rotateCcw', 10) + '</button>'
        : '<span class="dm-token-reset-placeholder"></span>') +
      '</div>';
  };

  const componentTokensHtml = componentTokens.length > 0
    ? '<div class="dm-token-group">' +
        '<button class="dm-token-group-header" data-dm-action="toggle-component-tokens" style="width:100%;background:none;border:none;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:4px;">' +
          '<span style="color:var(--dm-text-dim);display:flex;">' + icon(componentTokensOpen ? 'chevronDown' : 'chevronRight', 10) + '</span>' +
          '<span class="dm-token-group-label">Component tokens · ' + componentTokens.length + '</span>' +
        '</button>' +
        (componentTokensOpen ? componentTokens.map(renderDeclaredRow).join('') : '') +
      '</div>'
    : '';

  const declaredHtml = declaredGroups.map(g => {
    if (!g.tokens.length) return '';
    return '<div class="dm-token-group">' +
      '<div class="dm-token-group-header">' +
        '<span class="dm-token-group-label">' + escapeAttr(g.label) + ' · ' + g.tokens.length + '</span>' +
      '</div>' +
      g.tokens.map(renderDeclaredRow).join('') +
      '</div>';
  }).join('') + componentTokensHtml;

  // ── Detected body ──
  // Compute lower / exact / upper declared-token suggestions per group.
  // Numeric comparison uses parseFloat on the resolved value. Tokens
  // whose resolved value is non-numeric (named colours, shadows) skip
  // the lookup — for shadows the Replace dropdown is hidden entirely
  // since same-string matching is the only useful relation there.
  const closestVarOptions = (entry: ScaleEntry, group: TokenGroup): Array<{ kind: 'lower' | 'exact' | 'upper'; cssVar: string; value: string; delta: number }> => {
    const target = parseFloat(entry.value);
    if (!isFinite(target)) return [];
    // The detected "group" the row falls under maps onto declared-token
    // groups: spacing→spacing, radius→radius, typography→typography
    // (font-size variables), shadow→shadow.
    const candidates = ds.tokens.filter(t => t.group === group)
      .map(t => ({ cssVar: t.cssVar, value: t.resolvedValue || t.value, n: parseFloat(t.resolvedValue || t.value) }))
      .filter(t => isFinite(t.n));
    if (!candidates.length) return [];
    const exact = candidates.find(c => c.n === target);
    const below = candidates.filter(c => c.n < target).sort((a, b) => b.n - a.n)[0];
    const above = candidates.filter(c => c.n > target).sort((a, b) => a.n - b.n)[0];
    const out: Array<{ kind: 'lower' | 'exact' | 'upper'; cssVar: string; value: string; delta: number }> = [];
    if (below) out.push({ kind: 'lower', cssVar: below.cssVar, value: below.value, delta: below.n - target });
    if (exact) out.push({ kind: 'exact', cssVar: exact.cssVar, value: exact.value, delta: 0 });
    if (above) out.push({ kind: 'upper', cssVar: above.cssVar, value: above.value, delta: above.n - target });
    return out;
  };

  const detectedHtml = detectedGroups.map(g => {
    if (!g.entries.length) return '';
    return '<div class="dm-token-group">' +
      '<div class="dm-token-group-header">' +
        '<span class="dm-token-group-label">' + escapeAttr(g.label) + ' · ' + g.entries.length + '</span>' +
      '</div>' +
      g.entries.map(e => {
        const swatch = renderSwatch(g.group, e.value);
        const driftBadge = e.driftOf
          ? '<span class="dm-token-drift" title="Close to ' + escapeAttr(e.driftOf) + ' — possible drift">' + icon('alertTriangle', 10) + ' ' + escapeAttr(e.driftOf) + '</span>'
          : '';
        // "Replace with…" select. Only shown when the row is numeric
        // (skip shadows; same-string match is the only useful relation).
        const scaleKey = g.key === 'detected-spacing' ? 'spacing' :
                         g.key === 'detected-radius' ? 'radius' :
                         g.key === 'detected-fontSize' ? 'fontSize' : 'shadow';
        let replaceSelect = '';
        if (scaleKey !== 'shadow') {
          const opts = closestVarOptions(e, g.group);
          if (opts.length > 0) {
            const fmt = (o: typeof opts[number]) => {
              const sign = o.delta === 0 ? 'exact' : (o.delta > 0 ? '+' + Math.round(o.delta * 100) / 100 : Math.round(o.delta * 100) / 100);
              return o.cssVar + ' (' + o.value + ')' + (o.delta === 0 ? '' : ' · ' + sign);
            };
            const optionPayload = (o: typeof opts[number]) =>
              JSON.stringify({ scale: scaleKey, rawValue: e.value, cssVar: o.cssVar });
            const optionsHtml = opts.map(o =>
              '<option value="' + escapeAttr(optionPayload(o)) + '">' + escapeAttr(fmt(o)) + '</option>'
            ).join('');
            replaceSelect =
              '<select class="dm-detected-replace" data-dm-detected-replace title="Replace every on-page occurrence of ' + escapeAttr(e.value) + ' with a declared token">' +
                '<option value="" selected>Replace with…</option>' +
                optionsHtml +
              '</select>';
          }
        }
        return '<div class="dm-token-row dm-token-row-readonly">' +
          swatch +
          '<span class="dm-token-name dm-token-name-detected">' + escapeAttr(e.value) + '</span>' +
          driftBadge +
          replaceSelect +
          '<span class="dm-token-count">×' + e.count + '</span>' +
          '</div>';
      }).join('') +
      '</div>';
  }).join('');

  // ── Defined body ──
  const allowedKinds = new Set<PresetKindLocal>(presetKindsForChip(tokenFilter));
  const definedHtml = renderDefinedTab(allowedKinds, filter);

  // Select which body to show based on the active tab.
  let body = '';
  if (tokensTab === 'declared') {
    const emptyState = !designSystem
      ? '<div class="dm-tokens-empty">Scanning the page…</div>'
      : (declaredHtml === '' && !filter
          ? '<div class="dm-tokens-empty">No declared CSS variables on this page.</div>'
          : declaredHtml === ''
            ? '<div class="dm-tokens-empty">Nothing matches "' + escapeAttr(filter) + '".</div>'
            : '');
    body = declaredHtml || emptyState;
  } else if (tokensTab === 'detected') {
    body = detectedHtml || '<div class="dm-tokens-empty">No detected scales — the page may be empty or off-screen.</div>';
  } else {
    body = definedHtml;
  }

  return header +
    tabStrip +
    filterChrome +
    '<div style="flex:1;overflow-y:auto;position:relative;">' + body + '</div>';
}

// Compute the list of preset kinds that make sense for the currently
// selected element. A kind is included iff at least one of its
// SECTION_PROPS has a non-default value on the element. Mirrors the
// short-circuit `saveCustomPreset` uses in content/presets.ts so the
// user can't pick a kind that would save zero properties.
function availableKindsForSelection(): PresetKindLocal[] {
  if (!info || !info.computedStyles) return [];
  const cs = info.computedStyles;
  const isDefault = (v: string | undefined): boolean =>
    !v || v === 'none' || v === 'normal' || v === 'auto' || v === '0px' || v === '0' ||
    v === 'rgba(0, 0, 0, 0)' || v === 'transparent';
  const ALL: PresetKindLocal[] = ['typography', 'fill', 'stroke', 'effects', 'position', 'layout', 'appearance', 'motion'];
  const out: PresetKindLocal[] = [];
  for (const k of ALL) {
    const props = (SECTION_PROPS as Record<string, string[]>)[k] || [];
    if (props.some(p => !isDefault((cs as any)[p]))) out.push(k);
  }
  return out;
}

// Render the Defined tab — user-saved style-bundle presets. Empty by
// default. Users add via the Add CTA → inline form with a kind dropdown
// + name input. List rows show preview swatch + kind badge + Apply +
// Delete. Apply requires an element selected on the page; kind list
// reflects which kinds the selected element actually has styles for.
function renderDefinedTab(allowedKinds: Set<PresetKindLocal>, searchFilter: string): string {
  const hasSelection = !!info;
  const KIND_LABELS: Record<PresetKindLocal, string> = {
    position: 'Position', layout: 'Layout', appearance: 'Appearance',
    typography: 'Typography', fill: 'Fill', stroke: 'Stroke',
    effects: 'Effects', motion: 'Motion',
  };
  const KIND_ORDER: PresetKindLocal[] = ['typography', 'fill', 'stroke', 'effects', 'position', 'layout', 'appearance', 'motion'];
  const kindBadgeStyle = (k: PresetKindLocal): string => {
    const colors: Record<string, [string, string]> = {
      position:   ['rgba(34,197,94,0.16)', 'rgb(34,197,94)'],
      layout:     ['rgba(20,184,166,0.18)', 'rgb(20,184,166)'],
      appearance: ['rgba(139,92,246,0.18)', 'var(--dm-purple)'],
      typography: ['rgba(79,158,255,0.15)', 'var(--dm-accent)'],
      fill:       ['rgba(245,158,11,0.18)', '#f59e0b'],
      stroke:     ['rgba(244,63,94,0.18)', 'rgb(244,63,94)'],
      effects:    ['rgba(168,85,247,0.18)', 'rgb(168,85,247)'],
      motion:     ['rgba(56,189,248,0.18)', 'rgb(56,189,248)'],
    };
    const [bg, fg] = colors[k] || colors.typography;
    return `font-size:8px;padding:1px 6px;border-radius:9999px;background:${bg};color:${fg};text-transform:uppercase;letter-spacing:0.4px;font-weight:600;flex-shrink:0;`;
  };
  const previewSwatch = (p: PresetLocal): string => {
    const styles = p.styles || {};
    if ((p.kind === 'typography' || p.kind === 'fill') && styles.color) {
      return '<span style="width:18px;height:18px;border-radius:4px;background:' + escapeAttr(styles.color) + ';border:1px solid var(--dm-separator);flex-shrink:0;"></span>';
    }
    if (p.kind === 'fill' && styles.backgroundColor) {
      return '<span style="width:18px;height:18px;border-radius:4px;background:' + escapeAttr(styles.backgroundColor) + ';border:1px solid var(--dm-separator);flex-shrink:0;"></span>';
    }
    if (p.kind === 'effects' && styles.boxShadow) {
      return '<span style="width:24px;height:18px;border-radius:3px;background:#fff;box-shadow:' + escapeAttr(styles.boxShadow) + ';border:1px solid var(--dm-separator);flex-shrink:0;"></span>';
    }
    if (p.kind === 'stroke' && styles.borderTopColor) {
      return '<span style="width:18px;height:18px;border-radius:4px;background:transparent;border:2px solid ' + escapeAttr(styles.borderTopColor) + ';flex-shrink:0;"></span>';
    }
    return '<span style="width:8px;height:8px;border-radius:50%;background:var(--dm-accent);opacity:0.6;flex-shrink:0;margin-left:5px;margin-right:5px;"></span>';
  };

  // Available kinds reflect the current selection — no point letting
  // the user pick "Motion" if the element has no transition / animation.
  const available = availableKindsForSelection();
  const availableSet = new Set(available);
  // If presetAddingKind is set to a kind that's no longer available
  // (e.g. selection changed mid-edit), reset to the first available.
  const effectiveAddingKind: PresetKindLocal | null = presetAddingKind && availableSet.has(presetAddingKind)
    ? presetAddingKind
    : (available[0] || null);

  // Add form — inline when presetAddingKind is non-null.
  const addPanel = presetAddingKind === null
    ? '<div class="dm-defined-cta"><button data-dm-action="add-preset-open" class="dm-defined-add-btn"' +
        (hasSelection ? '' : ' disabled') +
        ' title="' + (hasSelection ? 'Save the selected element’s styles as a preset' : 'Select an element on the page first') + '">' +
        icon('plus', 11) + '<span>Add preset</span></button></div>'
    : available.length === 0
      ? '<div class="dm-defined-add-form">' +
          '<div style="font-size:11px;color:var(--dm-text-secondary);line-height:1.5;">Nothing non-default to save from this element.</div>' +
          '<div style="display:flex;justify-content:flex-end;gap:6px;margin-top:8px;">' +
            '<button data-dm-action="add-preset-cancel" class="dm-defined-form-btn dm-defined-form-cancel">Close</button>' +
          '</div>' +
        '</div>'
      : (() => {
          const kindOptions = KIND_ORDER.filter(k => availableSet.has(k)).map(k =>
            '<option value="' + k + '"' + (effectiveAddingKind === k ? ' selected' : '') + '>' + KIND_LABELS[k] + '</option>'
          ).join('');
          return '<div class="dm-defined-add-form">' +
            '<div style="display:flex;flex-direction:column;gap:6px;">' +
              '<div style="display:flex;align-items:center;gap:6px;">' +
                '<select class="dm-select dm-defined-kind" data-dm-defined-kind>' + kindOptions + '</select>' +
                '<input type="text" class="dm-input dm-defined-name" data-dm-defined-name placeholder="Preset name" autofocus />' +
              '</div>' +
              '<div style="display:flex;justify-content:flex-end;gap:6px;">' +
                '<button data-dm-action="add-preset-cancel" class="dm-defined-form-btn dm-defined-form-cancel">Cancel</button>' +
                '<button data-dm-action="add-preset-save" class="dm-defined-form-btn dm-defined-form-save">' + icon('save', 10) + ' Save</button>' +
              '</div>' +
            '</div>' +
          '</div>';
        })();

  const sf = (searchFilter || '').toLowerCase();
  const matchesSearch = (p: PresetLocal) =>
    !sf ||
    p.name.toLowerCase().includes(sf) ||
    KIND_LABELS[p.kind].toLowerCase().includes(sf) ||
    p.kind.toLowerCase().includes(sf);
  const visiblePresets = customPresets.filter(p => allowedKinds.has(p.kind) && matchesSearch(p));

  const list = customPresets.length === 0
    ? '<div class="dm-tokens-empty" style="line-height:1.6;">No saved presets yet.<br/><br/>Select an element on the page, choose a category<br/>(Typography, Fill, Stroke, …), and click Add.</div>'
    : visiblePresets.length === 0
      ? '<div class="dm-tokens-empty">No presets match this filter.</div>'
      : '<div class="dm-defined-list">' +
        visiblePresets.map(p => {
          const applied = appliedPresetGroups.has(p.id);
          const applyTitle = hasSelection ? 'Apply to the selected element' : 'Select an element on the page first';
          const actionBtn = applied
            ? '<button class="dm-preset-applied" data-dm-action="unapply-preset" data-preset-id="' + escapeAttr(p.id) + '" title="Revert the styles this preset added">' + icon('undo', 10) + ' Applied</button>'
            : '<button class="dm-preset-apply" data-dm-action="apply-preset" data-preset-id="' + escapeAttr(p.id) + '"' +
              (hasSelection ? '' : ' disabled') + ' title="' + escapeAttr(applyTitle) + '">Apply</button>';
          return '<div class="dm-preset-row">' +
            previewSwatch(p) +
            '<span class="dm-preset-name" title="' + escapeAttr(p.name) + '">' + escapeAttr(p.name) + '</span>' +
            '<span style="' + kindBadgeStyle(p.kind) + '">' + escapeAttr(p.kind) + '</span>' +
            actionBtn +
            '<button class="dm-preset-delete" data-dm-action="delete-preset" data-preset-id="' + escapeAttr(p.id) + '" title="Delete preset">' + icon('trash', 10) + '</button>' +
          '</div>';
        }).join('') +
        '</div>';

  return addPanel + list;
}


/* ── v1.2: Computed CSS Overlay ── */
function renderComputedCssOverlay(): string {
  if (!computedCssOpen) return '';
  return '<div style="position:absolute;left:0;right:0;bottom:0;top:0;background:var(--dm-bg);z-index:20;display:flex;flex-direction:column;">' +
    '<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--dm-separator-strong);flex-shrink:0;">' +
    '<button data-dm-action="close-computed-css" style="background:none;border:none;color:var(--dm-text-secondary);cursor:pointer;display:flex;padding:4px;">' + icon('x',14) + '</button>' +
    '<span style="font-size:12px;font-weight:600;color:var(--dm-text);">Computed CSS</span>' +
    '<button data-dm-action="copy-computed-css" style="margin-left:auto;padding:4px 8px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:5px;color:var(--dm-text-secondary);cursor:pointer;font-size:10px;font-family:inherit;display:flex;align-items:center;gap:4px;">' + icon('copy',10) + ' Copy</button>' +
    '</div>' +
    '<pre style="flex:1;overflow:auto;margin:0;padding:12px;font-family:SF Mono,Monaco,monospace;font-size:10px;line-height:1.6;color:var(--dm-text);white-space:pre-wrap;word-break:break-all;">' + escapeAttr(computedCssText) + '</pre>' +
    '</div>';
}

function alignBtn(align: string, currentAlign: string, iconName: keyof typeof icons): string {
  const active = align === currentAlign;
  return '<button data-dm-prop="textAlign" data-dm-value="' + align + '" title="' + align + '" style="flex:1;padding:6px;background:' + (active ? 'var(--dm-accent-bg)' : 'var(--dm-input-bg)') + ';border:1px solid ' + (active ? 'var(--dm-accent-border)' : 'var(--dm-input-border)') + ';border-radius:4px;color:' + (active ? 'var(--dm-accent)' : 'var(--dm-text-secondary)') + ';cursor:pointer;display:flex;align-items:center;justify-content:center;">' + icon(iconName, 12) + '</button>';
}

function textDecBtn(prop: string, activeVal: string, inactiveVal: string, currentVal: string, iconName: keyof typeof icons, title: string): string {
  const active = currentVal === activeVal || currentVal.includes(activeVal);
  return '<button data-dm-prop="' + prop + '" data-dm-value="' + (active ? inactiveVal : activeVal) + '" title="' + title + '" style="flex:1;padding:6px;background:' + (active ? 'var(--dm-accent-bg)' : 'var(--dm-input-bg)') + ';border:1px solid ' + (active ? 'var(--dm-accent-border)' : 'var(--dm-input-border)') + ';border-radius:4px;color:' + (active ? 'var(--dm-accent)' : 'var(--dm-text-secondary)') + ';cursor:pointer;display:flex;align-items:center;justify-content:center;">' + icon(iconName, 12) + '</button>';
}

// Text-transform as a 4-icon toggle group (matches alignBtn shape).
// Glyph labels (`Tt`, `AB`, `ab`, `Aa`) read more clearly than abstract
// SVG icons for a typographic transform — they are the transform.
function transformBtn(value: string, currentVal: string, label: string, title: string): string {
  const active = (currentVal || 'none') === value;
  return '<button data-dm-prop="textTransform" data-dm-value="' + value + '" title="' + title + '" style="flex:1;padding:6px;background:' + (active ? 'var(--dm-accent-bg)' : 'var(--dm-input-bg)') + ';border:1px solid ' + (active ? 'var(--dm-accent-border)' : 'var(--dm-input-border)') + ';border-radius:4px;color:' + (active ? 'var(--dm-accent)' : 'var(--dm-text-secondary)') + ';cursor:pointer;display:flex;align-items:center;justify-content:center;font-family:inherit;font-size:11px;font-weight:600;letter-spacing:0.5px;">' + label + '</button>';
}

function renderMediaSection(displayInfo: any, s: Record<string, string>, isImg: boolean): string {
  if (!mediaInfo) {
    if (isImg && displayInfo?.imgSrc) {
      // Fallback: render a basic image section when async media data hasn't loaded yet
      return sec('Media', 'image',
        '<div style="margin-bottom:8px;border-radius:6px;overflow:hidden;max-height:120px;"><img src="' + escapeAttr(displayInfo.imgSrc) + '" style="max-width:100%;display:block;"/></div>' +
        inp('Src', 'src', displayInfo.imgSrc || '', '') + sp() +
        grid(2, sel('Fit', 'objectFit', s.objectFit || 'fill', ['fill','contain','cover','none','scale-down']), inp('Alt', 'alt', '', ''))
      );
    }
    return '';
  }

  const m = mediaInfo;
  let preview = '';
  if (m.kind === 'image' || m.kind === 'background') {
    preview = '<div style="margin-bottom:8px;border-radius:6px;overflow:hidden;max-height:140px;background:var(--dm-bg-secondary);display:flex;align-items:center;justify-content:center;"><img src="' + escapeAttr(m.src) + '" style="max-width:100%;max-height:140px;display:block;"/></div>';
  } else if (m.kind === 'video') {
    preview = '<div style="margin-bottom:8px;border-radius:6px;overflow:hidden;max-height:140px;background:var(--dm-bg-secondary);"><video src="' + escapeAttr(m.src) + '"' + (m.poster ? ' poster="' + escapeAttr(m.poster) + '"' : '') + ' controls style="max-width:100%;max-height:140px;display:block;"></video></div>';
  } else if (m.kind === 'audio') {
    preview = '<div style="margin-bottom:8px;"><audio src="' + escapeAttr(m.src) + '" controls style="width:100%;"></audio></div>';
  } else if (m.kind === 'svg') {
    preview = '<div style="margin-bottom:8px;border-radius:6px;overflow:hidden;max-height:140px;background:var(--dm-bg-secondary);display:flex;align-items:center;justify-content:center;padding:12px;"><img src="' + escapeAttr(m.src) + '" style="max-width:100%;max-height:120px;display:block;"/></div>';
  }

  const metaParts: string[] = [];
  if (m.naturalWidth && m.naturalHeight) metaParts.push(m.naturalWidth + ' × ' + m.naturalHeight + 'px');
  metaParts.push(m.kind);
  if (typeof m.bytes === 'number' && m.bytes > 0) metaParts.push(formatBytes(m.bytes));
  const meta = '<div style="font-size:9px;color:var(--dm-text-dim);margin-bottom:6px;' +
    (m.naturalWidth ? '' : 'text-transform:capitalize;') + '">' +
    escapeAttr(metaParts.join(' · ')) +
    '</div>';

  const downloadBtn = '<button data-dm-action="download-media" style="width:100%;padding:7px 10px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:6px;color:var(--dm-text-secondary);cursor:pointer;font-size:10px;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px;font-weight:500;">' + icon('download', 11) + ' Download ' + escapeAttr(truncateFilename(m.filename || m.kind)) + '</button>';

  let extra = '';
  if (m.kind === 'image' || m.kind === 'background') {
    extra = sp() + inp('Src', 'src', m.src, '') + sp() +
      grid(2, sel('Fit', 'objectFit', s.objectFit || 'fill', ['fill','contain','cover','none','scale-down']), inp('Alt', 'alt', m.alt || '', ''));
  } else if (m.kind === 'svg') {
    extra = sp() + '<button data-dm-action="copy-svg-markup" style="width:100%;padding:5px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:5px;color:var(--dm-text-secondary);cursor:pointer;font-size:9px;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:4px;">' + icon('copy', 9) + ' Copy SVG markup</button>';
  }

  return sec('Media', 'image', preview + meta + downloadBtn + extra);
}

function spacingBox(s: Record<string, string>, displayInfo: any): string {
  const px = (v: string | undefined) => {
    if (!v || v === 'auto' || v === 'normal') return '-';
    const m = v.match(/^(-?\d+(?:\.\d+)?)/);
    if (!m) return '-';
    const n = parseFloat(m[1]);
    return n === 0 ? '0' : String(Math.round(n));
  };
  const mT = px(s.marginTop), mR = px(s.marginRight), mB = px(s.marginBottom), mL = px(s.marginLeft);
  const pT = px(s.paddingTop), pR = px(s.paddingRight), pB = px(s.paddingBottom), pL = px(s.paddingLeft);

  const w = displayInfo?.rect?.width ? Math.round(displayInfo.rect.width) : 0;
  const h = displayInfo?.rect?.height ? Math.round(displayInfo.rect.height) : 0;

  const fld = (prop: string, val: string, ariaLabel: string) =>
    '<input data-dm-prop="' + prop + '" data-dm-numeric="1" data-dm-unit="px" data-dm-pad-field="1" value="' + escapeAttr(val) + '" aria-label="' + ariaLabel + '" style="width:30px;height:18px;background:transparent;border:none;color:var(--dm-text-secondary);font-family:inherit;font-size:10px;text-align:center;outline:none;padding:0;border-radius:3px;"/>';

  return '<div style="position:relative;background:var(--dm-bg-secondary);border:1px dashed var(--dm-separator-strong);border-radius:10px;padding:28px 32px;margin:6px 0 4px;">' +
    // Margin labels (centered on outer box edges)
    '<div style="position:absolute;top:6px;left:50%;transform:translateX(-50%);">' + fld('marginTop', mT, 'Margin top') + '</div>' +
    '<div style="position:absolute;bottom:6px;left:50%;transform:translateX(-50%);">' + fld('marginBottom', mB, 'Margin bottom') + '</div>' +
    '<div style="position:absolute;left:4px;top:50%;transform:translateY(-50%);">' + fld('marginLeft', mL, 'Margin left') + '</div>' +
    '<div style="position:absolute;right:4px;top:50%;transform:translateY(-50%);">' + fld('marginRight', mR, 'Margin right') + '</div>' +

    // Inner padding box
    '<div style="position:relative;background:var(--dm-bg);border:1px solid var(--dm-separator);border-radius:8px;padding:24px 28px;">' +
    '<div style="position:absolute;top:3px;left:50%;transform:translateX(-50%);">' + fld('paddingTop', pT, 'Padding top') + '</div>' +
    '<div style="position:absolute;bottom:3px;left:50%;transform:translateX(-50%);">' + fld('paddingBottom', pB, 'Padding bottom') + '</div>' +
    '<div style="position:absolute;left:1px;top:50%;transform:translateY(-50%);">' + fld('paddingLeft', pL, 'Padding left') + '</div>' +
    '<div style="position:absolute;right:1px;top:50%;transform:translateY(-50%);">' + fld('paddingRight', pR, 'Padding right') + '</div>' +

    // Element dimensions display
    '<div style="background:var(--dm-text);color:var(--dm-bg);border-radius:5px;padding:7px 10px;text-align:center;font-size:10px;font-family:SF Mono,Monaco,monospace;font-weight:500;">' + w + ' × ' + h + '</div>' +
    '</div></div>';
}

/* ── Layout render helpers ── */
// Single source of truth for the MCP state's visual treatment. The header
// chip and the MCP page's status card both derive from this so they can't
// drift. `label` is the human-readable state; `detail` is a one-line
// explanation shown on the MCP page.
function mcpStatusDisplay(): { dotStyle: string; textColor: string; label: string; detail: string } {
  const isCloud = mcpMode === 'cloud' || mcpMode === 'self-hosted';
  if (mcpState === 'offline') {
    return {
      dotStyle: 'width:7px;height:7px;border-radius:50%;background:var(--dm-text-muted);flex-shrink:0;',
      textColor: 'var(--dm-text-muted)',
      label: 'Offline',
      detail: isCloud
        ? (mcpCloudToken
            ? 'Cloud relay unreachable. Refresh to retry, or check the server URL + token below.'
            : 'No cloud token yet. Click Connect to Cloud below.')
        : 'MCP not running. Start the server with `npm start --prefix packages/mcp-local`, then refresh.',
    };
  }
  if (mcpState === 'running') {
    return {
      dotStyle: 'width:7px;height:7px;border-radius:50%;background:#22c55e;flex-shrink:0;animation:dm-pulse 2s ease-in-out infinite;',
      textColor: '#22c55e',
      label: 'Running',
      detail: isCloud
        ? 'Cloud relay connected. Side panel must stay open for agent calls to land.'
        : 'MCP server is running, but no agent is connected yet.',
    };
  }
  return {
    dotStyle: 'width:7px;height:7px;border-radius:50%;background:#22c55e;box-shadow:0 0 6px rgba(34,197,94,0.4);flex-shrink:0;',
    textColor: '#22c55e',
    label: 'Connected',
    detail: isCloud
      ? 'Cloud relay connected and serving an agent.'
      : 'MCP connected and serving an agent.',
  };
}

function renderMcpStatus(): string {
  const { dotStyle, textColor, label } = mcpStatusDisplay();
  // The whole chip opens the dedicated MCP page (status + server config +
  // agent setup). The trailing chevron signals navigation rather than the
  // old in-place refresh — refreshing now lives on the page itself.
  return '<button data-dm-action="mcp" style="display:flex;align-items:center;gap:5px;padding:4px 8px;background:var(--dm-bg-secondary);border:none;border-radius:6px;cursor:pointer;font-family:inherit;" title="' + escapeAttr('MCP: ' + label + ' — click to open MCP settings') + '">' +
    '<span style="' + dotStyle + '"></span><span style="font-size:10px;color:' + textColor + ';font-weight:500;">MCP</span>' +
    '<span style="color:var(--dm-text-secondary);display:flex;padding:2px;">' + icon('chevronRight', 10) + '</span>' +
    '</button>';
}

function renderHeader(): string {
  const domain = pinnedDomain ? '<span style="font-size:11px;color:var(--dm-text-secondary);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeAttr(pinnedDomain) + '</span>' : '';
  const themeIcon = resolvedTheme === 'dark' ? 'sun' : 'moon';
  return '<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--dm-separator-strong);flex-shrink:0;background:var(--dm-bg);position:sticky;top:0;z-index:10;">' +
    domain + '<div style="flex:1;"></div>' + renderMcpStatus() +
    '<button data-dm-action="toggle-theme" title="Toggle theme" style="background:none;border:none;color:var(--dm-text-secondary);cursor:pointer;display:flex;padding:4px;">' + icon(themeIcon as keyof typeof icons, 15) + '</button>' +
    '<button data-dm-action="contribute" title="Contribute" aria-label="Open contribute panel" style="background:none;border:none;color:var(--dm-text-secondary);cursor:pointer;display:flex;padding:4px;">' + icon('heartHandshake', 15) + '</button>' +
    '<button data-dm-action="help" title="Help" aria-label="Open help" style="background:none;border:none;color:var(--dm-text-secondary);cursor:pointer;display:flex;padding:4px;">' + icon('helpCircle', 15) + '</button>' +
    '<button data-dm-action="settings" title="Settings" style="background:none;border:none;color:var(--dm-text-secondary);cursor:pointer;display:flex;padding:4px;">' + icon('settings', 16) + '</button>' +
    // Docking controls (pop-out / pin-on-top / dock-back) sit last — they
    // manage the panel window itself, not the page, so they read as a
    // separate group after Settings.
    (isPip
      ? '<button data-dm-action="pip-unpin" title="Pinned on top — click to unpin back to the floating window" aria-label="Pinned on top — click to unpin back to the floating window" style="background:var(--dm-accent-bg);border:1px solid var(--dm-accent-border);border-radius:5px;color:var(--dm-accent);cursor:pointer;display:flex;padding:4px;">' + icon('pictureInPicture2', 15) + '</button>' +
        '<button data-dm-action="pip-dock-back" title="Dock back to the side panel" aria-label="Dock back to side panel" style="background:none;border:none;color:var(--dm-text-secondary);cursor:pointer;display:flex;padding:4px;">' + icon('panelRight', 15) + '</button>'
      : isPopout
        ? (pipAvailable && !pipUnsupported
            ? '<button data-dm-action="pip-pin" title="Pin on top of every window" aria-label="Pin on top of every window" style="background:none;border:none;color:var(--dm-text-secondary);cursor:pointer;display:flex;padding:4px;">' + icon('pictureInPicture2', 15) + '</button>'
            : '') +
          '<button data-dm-action="dock-back" title="Dock back to the side panel" aria-label="Dock back to side panel" style="background:none;border:none;color:var(--dm-text-secondary);cursor:pointer;display:flex;padding:4px;">' + icon('panelRight', 15) + '</button>'
        : '<button data-dm-action="pop-out" title="Pop out into a floating window" aria-label="Pop out into a floating window" style="background:none;border:none;color:var(--dm-text-secondary);cursor:pointer;display:flex;padding:4px;">' + icon('externalLink', 15) + '</button>') +
    '</div>';
}

function renderActionRow(): string {
  const dis = !info;
  const bs = (cc?: string, alwaysEnabled?: boolean) => {
    const d = alwaysEnabled ? false : dis;
    const c = d ? 'var(--dm-text-dim)' : (cc || 'var(--dm-text-secondary)');
    return 'background:' + (d ? 'var(--dm-btn-bg-disabled)' : 'var(--dm-btn-bg)') + ';border:1px solid ' + (d ? 'var(--dm-btn-border-disabled)' : 'var(--dm-btn-border)') + ';border-radius:5px;color:' + c + ';padding:5px 7px;cursor:' + (d ? 'default' : 'pointer') + ';display:flex;align-items:center;justify-content:center;opacity:' + (d ? '0.5' : '1') + ';pointer-events:' + (d ? 'none' : 'auto') + ';';
  };
  return '<div style="display:flex;align-items:center;gap:3px;padding:6px 12px;border-bottom:1px solid var(--dm-separator);flex-shrink:0;">' +
    '<button data-dm-action="select-parent" title="Parent" style="' + bs() + '">' + icon('arrowUp', 14) + '</button>' +
    '<button data-dm-action="select-child" title="Child" style="' + bs() + '">' + icon('arrowDown', 14) + '</button>' +
    // Spacer + the spacer before Undo flank the middle cluster, centering it as
    // the panel widens (Parent/Child pinned left, Undo/Redo pinned right).
    '<div style="flex:1;"></div>' +
    '<button data-dm-action="duplicate" title="Duplicate" style="' + bs() + '">' + icon('copy', 14) + '</button>' +
    '<button data-dm-action="delete" title="Remove" style="' + bs('var(--dm-danger)') + '">' + icon('trash', 14) + '</button>' +
    '<button data-dm-action="comment" title="Comment" style="' + bs() + '">' + icon('messageSquare', 14) + '</button>' +
    '<button data-dm-action="region-comment" title="Comment on a region — drag a box anywhere on the page" style="' + bs(undefined, true) + ';' + (awaitingRegionDraw ? 'color:var(--dm-accent);background:var(--dm-accent-bg);border-color:var(--dm-accent-border);' : '') + '">' + icon('squareDashed', 14) + '</button>' +
    '<button data-dm-action="screenshot" title="Screenshot" style="' + bs(undefined, true) + '">' + icon('camera', 14) + '</button>' +
    '<div style="width:1px;height:16px;background:var(--dm-separator-strong);margin:0 2px;"></div>' +
    '<button data-dm-action="open-tokens" title="Design system" style="' + bs(undefined, true) + ';' + (tokensOpen ? 'color:var(--dm-accent);background:var(--dm-accent-bg);border-color:var(--dm-accent-border);' : '') + '">' + icon('swatchBook', 14) + '</button>' +
    '<div style="flex:1;"></div>' +
    '<button data-dm-action="undo" title="Undo (Ctrl+Z)" style="' + bs(undefined, true) + '">' + icon('undo', 14) + '</button>' +
    '<button data-dm-action="redo" title="Redo (Ctrl+Shift+Z)" style="' + bs(undefined, true) + ';transform:scaleX(-1);">' + icon('undo', 14) + '</button></div>';
}

function renderCommentCard(): string {
  if (!commentMode) return '';
  const isEditing = !!editingCommentId;
  const tagLabel = regionCommentPending
    ? '<span style="display:inline-flex;align-items:center;gap:3px;">' + icon('squareDashed', 9) + 'region</span>'
    : (info ? '&lt;' + escapeAttr(info.tagName?.toLowerCase() || 'div') + '&gt;' : '');
  return '<div style="padding:10px 12px;border-bottom:1px solid var(--dm-separator-strong);background:var(--dm-purple-bg);">' +
    '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">' +
    '<span style="color:var(--dm-purple);display:flex;">' + icon('messageSquare', 14) + '</span>' +
    '<span style="font-size:11px;font-weight:600;color:var(--dm-text);">' + (isEditing ? 'Edit Comment' : 'Add Comment') + '</span>' +
    '<span style="font-size:9px;color:var(--dm-text-dim);font-family:SF Mono,monospace;">' + tagLabel + '</span></div>' +
    '<textarea data-dm-comment-input style="width:100%;min-height:60px;background:var(--dm-input-bg);border:1px solid var(--dm-input-border);border-radius:6px;color:var(--dm-text);font-size:11px;padding:8px;outline:none;resize:vertical;font-family:inherit;box-sizing:border-box;">' + escapeAttr(commentText) + '</textarea>' +
    '<div style="display:flex;gap:6px;margin-top:8px;justify-content:flex-end;">' +
    '<button data-dm-action="cancel-comment" style="padding:5px 12px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:5px;color:var(--dm-text-secondary);cursor:pointer;font-size:10px;font-family:inherit;">Cancel</button>' +
    '<button data-dm-action="submit-comment" ' + (isEditing && !commentDirty ? 'disabled style="padding:5px 12px;background:rgba(139,92,246,0.06);border:1px solid rgba(139,92,246,0.1);border-radius:5px;color:rgba(139,92,246,0.4);cursor:default;font-size:10px;font-weight:500;font-family:inherit;opacity:0.5;"' : 'style="padding:5px 12px;background:rgba(139,92,246,0.15);border:1px solid var(--dm-purple-border);border-radius:5px;color:var(--dm-purple);cursor:pointer;font-size:10px;font-weight:500;font-family:inherit;"') + '>' + (isEditing ? 'Save' : 'Add') + '</button></div></div>';
}

function renderTabs(): string {
  const tabs: { key: Tab; label: string; iconName: keyof typeof icons; badge?: number }[] = [
    { key: 'layers', label: 'Layers', iconName: 'layers' },
    { key: 'design', label: 'Design', iconName: 'sliders' },
    { key: 'changes', label: 'Changes', iconName: 'sparkles', badge: styleChanges.length + textChanges.length + domChanges.length + comments.length },
  ];
  return '<div style="display:flex;padding:4px 12px;gap:2px;border-bottom:1px solid var(--dm-separator);flex-shrink:0;">' +
    tabs.map(tt => {
      const a = tt.key === tab;
      const badgeHtml = tt.badge && tt.badge > 0 ? ' <span style="font-size:8px;background:var(--dm-success-bg);color:var(--dm-success);border-radius:8px;padding:1px 4px;">' + tt.badge + '</span>' : '';
      return '<button role="tab" aria-selected="' + a + '" data-dm-tab="' + tt.key + '" style="flex:1;padding:5px 2px;background:' + (a ? 'var(--dm-bg-active)' : 'transparent') + ';border:none;border-radius:5px;color:' + (a ? 'var(--dm-text)' : 'var(--dm-text-muted)') + ';cursor:pointer;font-size:10px;font-weight:' + (a ? '600' : '400') + ';font-family:inherit;display:flex;align-items:center;justify-content:center;gap:3px;">' + icon(tt.iconName, 11) + ' ' + tt.label + badgeHtml + '</button>';
    }).join('') + '</div>';
}

function renderStickyBottom(): string {
  const hasChanges = styleChanges.length > 0 || textChanges.length > 0 || domChanges.length > 0 || comments.length > 0;
  const copyDis = previewingOriginal || !hasChanges;
  // Send-to-Agent stays clickable whenever there's something to send —
  // when no agent is connected yet, the click opens setup instructions
  // instead of sending. The tooltip previews which of the two it will be.
  const sendDis = previewingOriginal || !hasChanges;
  let sendTitle = 'Send these changes to your coding agent';
  if (previewingOriginal) sendTitle = 'Disable “Preview original” first.';
  else if (!hasChanges) sendTitle = 'No changes to send.';
  else if (mcpState === 'offline') sendTitle = 'MCP is not connected — click for setup instructions.';
  else if (mcpState === 'running') sendTitle = 'No coding agent connected yet — click for instructions.';
  const copyTitle = previewingOriginal ? 'Disable “Preview original” first.' : !hasChanges ? 'No changes to copy.' : 'Copy as prompt to clipboard';
  const copyS = 'flex:1;padding:8px 12px;border-radius:8px;font-size:11px;font-weight:500;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:5px;' +
    (copyDis ? 'background:var(--dm-btn-bg-disabled);border:1px solid var(--dm-btn-border-disabled);color:var(--dm-text-dim);cursor:default;opacity:0.5;pointer-events:none;' : 'background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);color:var(--dm-text-secondary);cursor:pointer;');
  // pointer-events:auto on the disabled send button so hover/title still
  // works — the click handler is the gate, not CSS.
  const sendS = 'flex:1;padding:8px 12px;border-radius:8px;font-size:11px;font-weight:500;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:5px;' +
    (sendDis ? 'background:var(--dm-btn-bg-disabled);border:1px solid var(--dm-btn-border-disabled);color:var(--dm-text-dim);cursor:not-allowed;opacity:0.5;' : 'background:var(--dm-accent-bg);border:1px solid var(--dm-accent-border);color:var(--dm-accent);cursor:pointer;');
  return '<div style="display:flex;gap:8px;padding:10px 12px;border-top:1px solid var(--dm-separator-strong);flex-shrink:0;background:var(--dm-bg);position:sticky;bottom:0;z-index:10;">' +
    '<button id="dm-copy-prompt-btn" data-dm-action="copy-prompt" title="' + escapeAttr(copyTitle) + '" style="' + copyS + '">' + icon('clipboard', 13) + ' Copy as Prompt</button>' +
    '<button id="dm-send-agent-btn" data-dm-action="send-to-agent"' + (sendDis ? ' disabled aria-disabled="true"' : '') + ' title="' + escapeAttr(sendTitle) + '" style="' + sendS + '">' + icon('send', 13) + ' Send to Agent</button></div>';
}

// First-run guidance for "Send to Agent": shown when the button is clicked
// while no agent is connected. The copy is state-specific — `offline` walks
// through wiring MCP up, `running` means the transport is live but no agent
// has attached yet.
function renderSendAgentHelpOverlay(): string {
  if (!sendAgentHelpOpen) return '';
  const isCloud = mcpMode === 'cloud' || mcpMode === 'self-hosted';
  const code = (t: string) => '<code style="font-family:SF Mono,Monaco,monospace;font-size:9px;background:var(--dm-bg-secondary);border:1px solid var(--dm-separator);border-radius:3px;padding:1px 4px;word-break:break-all;">' + t + '</code>';
  let intro: string;
  let steps: string[];
  if (mcpState === 'running') {
    intro = 'The MCP server is reachable, but no coding agent has connected yet.';
    steps = [
      'Open the <b>MCP page</b> (click the MCP chip up top) and click <b>Copy MCP config</b>.',
      'Paste it into your agent’s MCP settings (Claude Code, Cursor, Windsurf, …) and restart the agent.',
      'Run ' + code('/design-mode') + ' in the agent — the MCP chip up top turns solid green.',
    ];
  } else if (isCloud && mcpCloudToken) {
    intro = 'The cloud relay is unreachable right now.';
    steps = [
      'Open the <b>MCP page</b> (click the MCP chip up top) and check the server URL and token.',
      'Click <b>Refresh status</b> on the MCP page to retry the connection.',
    ];
  } else if (isCloud) {
    intro = 'One-time setup — takes about a minute.';
    steps = [
      'Open the <b>MCP page</b> (click the MCP chip up top) and click <b>Connect to Cloud</b>.',
      'Click <b>Copy MCP config</b> and paste it into your agent’s MCP settings (Claude Code, Cursor, Windsurf, …).',
      'Restart the agent, then run ' + code('/design-mode') + ' in it.',
    ];
  } else {
    intro = 'The local companion server isn’t running. One-time setup:';
    steps = [
      'Register the server with your agent: ' + code('claude mcp add design-mode -- npm start --prefix &lt;repo&gt;/packages/mcp-local'),
      'Start your agent — it launches the server automatically.',
      'Run ' + code('/design-mode') + ' in the agent.',
    ];
  }
  const stepRows = steps.map((s, i) =>
    '<div style="display:flex;gap:8px;align-items:flex-start;">' +
    '<span style="flex-shrink:0;width:16px;height:16px;border-radius:50%;background:var(--dm-accent-bg);border:1px solid var(--dm-accent-border);color:var(--dm-accent);font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;">' + (i + 1) + '</span>' +
    '<span style="font-size:10px;color:var(--dm-text-secondary);line-height:1.6;min-width:0;">' + s + '</span></div>'
  ).join('');
  return '<div style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:60;display:flex;align-items:center;justify-content:center;">' +
    '<div style="background:var(--dm-bg);border:1px solid var(--dm-separator-strong);border-radius:10px;padding:16px;width:312px;max-width:calc(100vw - 32px);box-shadow:0 8px 24px rgba(0,0,0,0.3);">' +
    '<div style="font-size:12px;font-weight:600;color:var(--dm-text);margin-bottom:6px;display:flex;align-items:center;gap:6px;">' + icon('send', 12) + ' Connect a coding agent</div>' +
    '<div style="font-size:10px;color:var(--dm-text-muted);margin-bottom:10px;line-height:1.5;">' + intro + '</div>' +
    '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px;">' + stepRows + '</div>' +
    '<div style="font-size:9px;color:var(--dm-text-dimmer);margin-bottom:14px;line-height:1.5;">Once connected, this button stages your changes for the agent — it implements them and marks each one done in the Changes tab.</div>' +
    '<div style="display:flex;gap:6px;">' +
    '<button data-dm-action="send-agent-help-close" style="flex:1;padding:6px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:6px;color:var(--dm-text-secondary);cursor:pointer;font-size:10px;font-family:inherit;">Close</button>' +
    '<button data-dm-action="send-agent-help-mcp" style="flex:1;padding:6px;background:var(--dm-accent-bg);border:1px solid var(--dm-accent-border);border-radius:6px;color:var(--dm-accent);cursor:pointer;font-size:10px;font-family:inherit;font-weight:500;">Open MCP settings</button>' +
    '</div></div></div>';
}

/* ── Phase 2: Layers Tab ── */
function renderLayersTab(): string {
  if (domTree.length === 0) return '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:300px;color:var(--dm-text-dim);text-align:center;padding:40px;"><div style="margin-bottom:12px;color:var(--dm-text-dimmer);">' + icon('crosshair', 32) + '</div><div style="font-size:12px;font-weight:500;color:var(--dm-text-muted);">Click the inspector icon to start selecting elements</div></div>';

  const selectedId = info?.id || '';
  const visible = getVisibleLayers();

  // Multi-select works through the regular click flow now — Cmd/Ctrl+click
  // toggles a layer in the set, Shift+click extends a range from the
  // anchor (last single-click). The old dedicated toggle button next to
  // search is gone; a small selection chip surfaces the count and offers
  // a one-click clear so users can exit the set without hunting for the
  // last selected row.
  const msCount = multiSelectIds.length;
  const selectionChip = msCount > 0
    ? '<button data-dm-action="clear-multi-select" title="Clear multi-select" style="display:flex;align-items:center;gap:4px;padding:4px 8px;background:var(--dm-accent-bg);border:1px solid var(--dm-accent-border);border-radius:6px;color:var(--dm-accent);cursor:pointer;font-size:10px;font-family:inherit;flex-shrink:0;font-weight:600;">' +
      icon('layers', 11) +
      '<span>' + msCount + ' selected</span>' +
      '<span style="opacity:0.7;display:flex;">' + icon('x', 10) + '</span>' +
      '</button>'
    : '';
  const searchBar = '<div style="padding:8px 12px;border-bottom:1px solid var(--dm-separator);display:flex;align-items:center;gap:6px;">' +
    '<div style="position:relative;flex:1;min-width:0;">' +
    '<span style="position:absolute;left:8px;top:50%;transform:translateY(-50%);color:var(--dm-text-dim);display:flex;pointer-events:none;">' + icon('search', 12) + '</span>' +
    '<input type="text" class="dm-layer-search" data-dm-layer-search placeholder="Search layers..." value="' + escapeAttr(layerSearch) + '"/></div>' +
    selectionChip +
    '</div>';

  // Visibility / state filter chips. Each chip carries a count badge so
  // the user can see at a glance which buckets have entries.
  const counts = {
    all: domTree.length,
    visible: domTree.filter(n => n.isVisible).length,
    hidden: domTree.filter(n => !n.isVisible).length,
    modified: domTree.filter(n => elementHasChanges(n.id)).length,
  };
  const fchip = (f: LayersFilter, label: string) => {
    const active = layersFilter === f;
    return '<button data-dm-layers-filter="' + f + '" style="padding:3px 9px;background:' + (active ? 'var(--dm-accent-bg)' : 'transparent') +
      ';border:1px solid ' + (active ? 'var(--dm-accent-border)' : 'var(--dm-separator)') +
      ';border-radius:9999px;color:' + (active ? 'var(--dm-accent)' : 'var(--dm-text-secondary)') +
      ';cursor:pointer;font-size:9px;font-family:inherit;font-weight:' + (active ? '600' : '400') + ';">' +
      label + ' <span style="opacity:0.6;">' + counts[f] + '</span></button>';
  };
  const filterChipsRow = '<div style="display:flex;gap:4px;padding:6px 10px;border-bottom:1px solid var(--dm-separator);flex-wrap:wrap;">' +
    fchip('all', 'All') + fchip('visible', 'Visible') + fchip('hidden', 'Hidden') + fchip('modified', 'Modified') +
    '</div>';

  // Bulk-action toolbar — shows when multi-select has 2+ layers. Each
  // action operates on every selected layer at once.
  const bulkBar = (msCount >= 2) ? (
    '<div style="position:sticky;left:0;display:flex;flex-wrap:wrap;gap:4px;padding:6px 10px;border-bottom:1px solid var(--dm-separator);background:var(--dm-accent-bg);">' +
      '<span style="font-size:9px;color:var(--dm-accent);font-weight:600;align-self:center;margin-right:4px;">' + msCount + ' selected:</span>' +
      '<button data-dm-bulk-action="show-all" title="Make all visible" style="padding:3px 8px;background:var(--dm-bg);border:1px solid var(--dm-separator);border-radius:4px;color:var(--dm-text-secondary);cursor:pointer;font-size:9px;font-family:inherit;display:flex;align-items:center;gap:3px;">' + icon('eye', 10) + ' Show</button>' +
      '<button data-dm-bulk-action="hide-all" title="Hide all" style="padding:3px 8px;background:var(--dm-bg);border:1px solid var(--dm-separator);border-radius:4px;color:var(--dm-text-secondary);cursor:pointer;font-size:9px;font-family:inherit;display:flex;align-items:center;gap:3px;">' + icon('eyeClosed', 10) + ' Hide</button>' +
      '<button data-dm-bulk-action="duplicate-all" title="Duplicate all" style="padding:3px 8px;background:var(--dm-bg);border:1px solid var(--dm-separator);border-radius:4px;color:var(--dm-text-secondary);cursor:pointer;font-size:9px;font-family:inherit;display:flex;align-items:center;gap:3px;">' + icon('copy', 10) + ' Duplicate</button>' +
      '<button data-dm-bulk-action="delete-all" title="Delete all" style="padding:3px 8px;background:var(--dm-danger-bg);border:1px solid var(--dm-danger-border);border-radius:4px;color:var(--dm-danger);cursor:pointer;font-size:9px;font-family:inherit;display:flex;align-items:center;gap:3px;">' + icon('trash', 10) + ' Delete</button>' +
      '<button data-dm-bulk-action="clear-selection" title="Exit multi-select" style="padding:3px 8px;background:var(--dm-bg);border:1px solid var(--dm-separator);border-radius:4px;color:var(--dm-text-secondary);cursor:pointer;font-size:9px;font-family:inherit;display:flex;align-items:center;gap:3px;margin-left:auto;">' + icon('x', 10) + ' Clear</button>' +
    '</div>'
  ) : '';

  const nodeMapForDim = buildNodeMap();
  const dimmedByAncestor = new Set<string>();
  for (const n of visible) {
    let pid = n.parentId;
    while (pid) {
      const parent = nodeMapForDim.get(pid);
      if (!parent) break;
      if (!parent.isVisible) { dimmedByAncestor.add(n.id); break; }
      pid = parent.parentId;
    }
  }

  const multiSet = new Set(multiSelectIds);
  const rows = visible.map(n => {
    const indent = n.depth * 16;
    const isSel = n.id === selectedId;
    const isHov = n.id === hoveredLayerId;
    const isMulti = multiSet.has(n.id);
    const hasChanges = elementHasChanges(n.id);
    // Display name precedence: component name (from React fiber walk) > smart
    // name. We don't carry user-supplied overrides — the live DOM is the
    // source of truth here.
    const displayName = n.componentName || n.displayName;
    const bg = isSel ? 'var(--dm-accent-bg)' : isMulti ? 'var(--dm-accent-bg)' : isHov ? 'var(--dm-bg-secondary)' : 'transparent';

    // Chevron for expand/collapse
    const isCollapsed = collapsedNodes.has(n.id);
    let chevron = '<span style="width:14px;flex-shrink:0;"></span>';
    if (n.childCount > 0) {
      const chevIcon = isCollapsed ? 'chevronRight' : 'chevronDown';
      chevron = '<span data-dm-toggle-collapse="' + n.id + '" style="color:var(--dm-text-dim);display:flex;cursor:pointer;flex-shrink:0;width:14px;align-items:center;justify-content:center;">' + icon(chevIcon as keyof typeof icons, 10) + '</span>';
    }

    // Tag icon — components get a special component icon; shadow-roots
    // get the box-stack icon; pseudo-elements get a small letter-glyph.
    const tagIconName: keyof typeof icons = n.componentName
      ? 'component'
      : n.containerKind === 'shadow'
        ? 'squareStack'
        : n.containerKind === 'pseudo'
          ? 'sparkles'
          : (TAG_ICON_MAP[n.tagName] || 'box');
    const tagIcon = '<span style="color:' + (isSel ? 'var(--dm-accent)' : 'var(--dm-text-dim)') + ';display:flex;flex-shrink:0;">' + icon(tagIconName, 12) + '</span>';

    // Indentation guides
    let guides = '';
    for (let d = 1; d <= n.depth; d++) {
      guides += '<span class="dm-indent-guide" style="left:' + (4 + (d - 1) * 16 + 7) + 'px;"></span>';
    }

    const dragHandle = '<span class="dm-layer-drag" style="color:var(--dm-text-dimmer);display:flex;cursor:grab;flex-shrink:0;">' + icon('gripVertical', 12) + '</span>';

    // Hover actions — only the two that can't be done from the canvas:
    // scroll the page to the layer, and toggle visibility. Renaming
    // belongs to the live DOM (the page already names every node), so
    // there's no rename here. Locking was removed too — Lock didn't
    // align with the "Layers tab mirrors the live DOM" stance.
    // sticky right keeps the actions reachable at the viewport edge while
    // the tree is panned horizontally; background:inherit picks up the
    // row's hover/selected colour so panned content doesn't bleed through.
    const hoverActions = '<span class="dm-layer-hover-actions" style="display:flex;gap:2px;margin-left:auto;flex-shrink:0;position:sticky;right:0;background:inherit;">' +
      '<button data-dm-scroll-to="' + n.id + '" title="Scroll page to this layer" aria-label="Scroll to layer" style="background:none;border:none;color:var(--dm-text-muted);cursor:pointer;display:flex;padding:2px;">' + icon('crosshair', 11) + '</button>' +
      '<button data-dm-toggle-vis="' + n.id + '" title="' + (n.isVisible ? 'Hide layer' : 'Show layer') + '" aria-label="Toggle visibility" style="background:none;border:none;color:' + (n.isVisible ? 'var(--dm-text-muted)' : 'var(--dm-accent)') + ';cursor:pointer;display:flex;padding:2px;">' + icon(n.isVisible ? 'eye' : 'eyeClosed', 12) + '</button></span>';

    const tagColor = isSel ? 'var(--dm-accent)' : 'var(--dm-text-secondary)';
    const borderColor = isSel ? 'var(--dm-accent)' : (isMulti ? 'var(--dm-accent-border)' : 'transparent');
    const multiBadge = isMulti && !isSel
      ? '<span title="Part of multi-select" style="color:var(--dm-accent);display:flex;flex-shrink:0;">' + icon('checkSquare', 11) + '</span>'
      : '';
    // Tracked-change indicator dot — shown when the element has any
    // tracked change (style / text / DOM / comment). Click does nothing
    // beyond the row's own select handler.
    const changeDot = hasChanges
      ? '<span title="This layer has tracked changes" style="width:6px;height:6px;border-radius:50%;background:var(--dm-accent);flex-shrink:0;display:inline-block;"></span>'
      : '';
    // Comment-count chip — small `💬 N` next to the change dot when this
    // layer has at least one comment.
    const commentCount = comments.filter(cc => cc.elementId === n.id).length;
    const commentChip = commentCount > 0
      ? '<span title="' + commentCount + ' comment' + (commentCount === 1 ? '' : 's') + ' on this layer" style="display:inline-flex;align-items:center;gap:2px;padding:1px 5px;border-radius:9999px;background:rgba(251,191,36,0.18);color:#92400e;font-size:9px;font-weight:600;flex-shrink:0;font-family:SF Mono,Monaco,monospace;">' + icon('messageSquare', 8) + ' ' + commentCount + '</span>'
      : '';
    // Container-kind badge — surfaces shadow / iframe / pseudo subtrees.
    const containerBadge = n.containerKind === 'shadow'
      ? '<span title="Shadow DOM (open)" style="font-size:8px;padding:1px 5px;border-radius:9999px;background:rgba(139,92,246,0.18);color:var(--dm-purple);font-weight:600;text-transform:uppercase;letter-spacing:0.4px;flex-shrink:0;">shadow</span>'
      : n.containerKind === 'iframe'
        ? '<span title="Same-origin iframe" style="font-size:8px;padding:1px 5px;border-radius:9999px;background:rgba(245,158,11,0.18);color:#f59e0b;font-weight:600;text-transform:uppercase;letter-spacing:0.4px;flex-shrink:0;">iframe</span>'
        : n.containerKind === 'pseudo'
          ? '<span title="CSS pseudo-element" style="font-size:8px;padding:1px 5px;border-radius:9999px;background:rgba(20,184,166,0.18);color:rgb(20,184,166);font-weight:600;text-transform:uppercase;letter-spacing:0.4px;flex-shrink:0;">pseudo</span>'
          : '';
    // Z-index chip — surfaces non-default stacking contexts.
    const zChip = n.zIndex
      ? '<span title="z-index: ' + escapeAttr(n.zIndex) + '" style="font-size:8px;padding:1px 5px;border-radius:9999px;background:rgba(0,0,0,0.06);color:var(--dm-text-dim);font-weight:600;flex-shrink:0;font-family:SF Mono,Monaco,monospace;">z:' + escapeAttr(n.zIndex) + '</span>'
      : '';
    // Color swatch — when the layer has a non-transparent background colour.
    const colorSwatch = n.backgroundColor
      ? '<span title="background: ' + escapeAttr(n.backgroundColor) + '" style="width:10px;height:10px;border-radius:2px;background:' + safeCssColor(n.backgroundColor) + ';border:1px solid var(--dm-separator);flex-shrink:0;display:inline-block;"></span>'
      : '';
    // Component subtitle — when source detection found a React/Vue/etc.
    // component, the row reads "ComponentName" with the html tag fading
    // out as a smaller pill on the right.
    const tagSubtitle = n.componentName
      ? '<span style="font-size:9px;color:var(--dm-text-dim);font-family:SF Mono,Monaco,monospace;flex-shrink:0;opacity:0.7;">' + escapeAttr('<' + n.tagName + '>') + '</span>'
      : '';

    // max-width guards against a single pathological class/id name
    // blowing up the max-content row width; the row title carries the
    // full name for that case.
    const nameCell = '<span style="font-size:11px;color:' + tagColor + ';font-family:SF Mono,Monaco,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;max-width:360px;">' + escapeAttr(displayName) + '</span>';

    return '<div class="dm-layer-item" data-dm-layer="' + n.id + '" draggable="true" data-dm-layer-drag="' + n.id + '" style="display:flex;align-items:center;gap:3px;padding:3px 6px 3px ' + (4 + indent) + 'px;background:' + bg + ';cursor:pointer;border-left:2px solid ' + borderColor + ';position:relative;min-height:30px;opacity:' + (!n.isVisible || dimmedByAncestor.has(n.id) ? '0.4' : '1') + ';" title="' + escapeAttr(displayName) + '">' +
      guides + dragHandle + chevron + tagIcon + colorSwatch + multiBadge + containerBadge + changeDot + commentChip +
      nameCell +
      tagSubtitle + zChip +
      hoverActions + '</div>';
  }).join('');

  // The layers tab scrolls both axes (#dm-tab-body gets overflow:auto in
  // render()) so deep trees can be panned to read full names. The rows
  // wrapper is max-content wide so every row spans the widest row and
  // names render un-truncated; the search/filter header pins to the
  // top-left of the viewport, and the bulk bar scrolls away vertically
  // with the list (it's transient and tied to the active selection, not
  // navigation) but pins horizontally so it never shifts out of view.
  const stickyHeader = '<div style="position:sticky;top:0;left:0;z-index:5;background:var(--dm-bg);">' + searchBar + filterChipsRow + '</div>';
  return stickyHeader + bulkBar + '<div style="width:max-content;min-width:100%;">' + rows + '</div>';
}

// Layer kind classifier — what sections in the design panel should show.
// Plain CSS is permissive (any element can take any property), but the side
// panel becomes noisy if it offers Typography on an `<img>` or Layout on a
// `<br>`. This narrows each section to elements where the property class
// actually does something useful.
type LayerKind = 'text' | 'container' | 'media' | 'svg' | 'form' | 'void' | 'page' | 'unknown';
function classifyTag(tag: string): LayerKind {
  const t = (tag || '').toLowerCase();
  if (t === 'body' || t === 'html') return 'page';
  if (['h1','h2','h3','h4','h5','h6','p','span','a','button','label','li','td','th','dd','dt','blockquote','code','pre','em','strong','b','i','small','mark','q','cite','abbr','figcaption','caption'].includes(t)) return 'text';
  if (['img','video','audio','picture','source','iframe','canvas','embed','object'].includes(t)) return 'media';
  if (['svg','use','path','circle','rect','line','polygon','polyline','g','defs','symbol'].includes(t)) return 'svg';
  if (['input','textarea','select','option','optgroup','progress','meter'].includes(t)) return 'form';
  if (['div','section','main','article','aside','header','footer','nav','ul','ol','dl','form','fieldset','figure','table','tr','tbody','thead','tfoot','details','summary'].includes(t)) return 'container';
  if (['br','hr','wbr','meta','link','script','style','head','title','base','col','colgroup'].includes(t)) return 'void';
  return 'unknown';
}

interface SectionVisibility {
  position: boolean;
  layout: boolean;
  appearance: boolean;
  typography: boolean;
  fill: boolean;
  stroke: boolean;
  effects: boolean;
  motion: boolean;
  layoutGuide: boolean;
}
function visibleSections(kind: LayerKind): SectionVisibility {
  // Mirrors Figma: each kind exposes only the sections that make sense.
  // Layout Guide is shown on anything that has a box you'd lay things
  // inside — containers, pages, and the permissive `unknown` default.
  // Motion (transitions / animations / transform / motion path / view
  // transition / scroll-driven) goes wherever Effects goes — they apply
  // to the same kinds.
  if (kind === 'void') {
    return { position: true, layout: false, appearance: true, typography: false, fill: false, stroke: false, effects: false, motion: false, layoutGuide: false };
  }
  if (kind === 'media' || kind === 'svg') {
    return { position: true, layout: true, appearance: true, typography: false, fill: true, stroke: true, effects: true, motion: true, layoutGuide: true };
  }
  if (kind === 'form') {
    return { position: true, layout: false, appearance: true, typography: true, fill: true, stroke: true, effects: true, motion: true, layoutGuide: false };
  }
  if (kind === 'page') {
    // Motion is on for the page context so the page-wide freeze toggle (in the
    // Motion section header) is reachable even when nothing is selected.
    return { position: false, layout: true, appearance: true, typography: false, fill: true, stroke: false, effects: false, motion: true, layoutGuide: true };
  }
  if (kind === 'container') {
    return { position: true, layout: true, appearance: true, typography: false, fill: true, stroke: true, effects: true, motion: true, layoutGuide: true };
  }
  // 'text' (and 'unknown' as a permissive default) — full kit including Typography.
  return { position: true, layout: true, appearance: true, typography: true, fill: true, stroke: true, effects: true, motion: true, layoutGuide: true };
}

/* ── Phase 3: Design Tab ── */
let pageContextInflight = false; // prevents duplicate SP_INSPECT_PAGE while one is in flight
function renderDesignTab(): string {
  const displayInfo = info ?? hoverInfo;
  const isHovering = !info && !!hoverInfo;

  // Nothing selected → treat the page (<body>) as the implicit context. The
  // first render with no selection fires SP_INSPECT_PAGE which makes the
  // content script silently set body as the selected element and ship its
  // info back; subsequent renders use it like any other selection.
  if (!displayInfo) {
    if (!pageContextInflight) {
      pageContextInflight = true;
      send({ type: 'SP_INSPECT_PAGE' }).then(r => {
        pageContextInflight = false;
        if (r?.payload && !info && !hoverInfo) {
          info = r.payload;
          hydrateLayoutGuidesFromPayload(info);
          render();
        }
      });
    }
    return '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:300px;color:var(--dm-text-dim);text-align:center;padding:40px;"><div style="margin-bottom:12px;color:var(--dm-text-dimmer);">' + icon('crosshair', 32) + '</div><div style="font-size:12px;font-weight:500;color:var(--dm-text-muted);">Loading page context…</div><div style="font-size:11px;margin-top:4px;color:var(--dm-text-dim);">Hover any element to focus on it.</div></div>';
  }

  const s = displayInfo.computedStyles;
  const tag = displayInfo.tagName?.toLowerCase() || 'div';
  const isImg = tag === 'img';
  const kind = classifyTag(tag);
  const vis = visibleSections(kind);
  const isPageContext = kind === 'page' && !isHovering;

  // Hover/Selected indicator. In multi-select mode, append a count chip and
  // a hint that style edits will fan out to every selected element. CSS
  // button (computed-styles viewer) lives on the right of this row — it's
  // contextual to the selected layer, so disable when nothing is selected.
  const multiBadge = multiSelectActive && multiSelectIds.length > 0
    ? '<span style="font-size:9px;padding:2px 8px;background:var(--dm-accent-bg);color:var(--dm-accent);border:1px solid var(--dm-accent-border);border-radius:9999px;font-weight:600;flex-shrink:0;" title="Style edits will apply to all ' + multiSelectIds.length + ' selected elements">' + multiSelectIds.length + ' selected</span>'
    : '';
  const cssBtnDisabled = !info; // hover-only state still shouldn't trigger a "view computed CSS" of a fleeting hover
  const cssBtn = '<button data-dm-action="view-computed-css"' + (cssBtnDisabled ? ' disabled' : '') + ' title="' + (cssBtnDisabled ? 'Select a layer to view its computed CSS' : 'View computed CSS for the selected layer') + '" style="display:flex;align-items:center;gap:4px;padding:3px 8px;background:' + (cssBtnDisabled ? 'var(--dm-btn-bg-disabled)' : 'var(--dm-btn-bg)') + ';border:1px solid ' + (cssBtnDisabled ? 'var(--dm-btn-border-disabled)' : 'var(--dm-btn-border)') + ';border-radius:5px;color:' + (cssBtnDisabled ? 'var(--dm-text-dim)' : 'var(--dm-text-secondary)') + ';cursor:' + (cssBtnDisabled ? 'default' : 'pointer') + ';font-size:10px;font-family:inherit;flex-shrink:0;opacity:' + (cssBtnDisabled ? '0.5' : '1') + ';">' + icon('code', 11) + '<span>CSS</span></button>';
  // "Matching layers" — one checkbox: checked hands every matching element
  // (same tag sharing a class) to multi-select fan-out; the existing
  // "N selected" badge shows the resulting count. Lives inline in the
  // Selected row, in front of the CSS button.
  const matchingCtl = info && !isPageContext && !isHovering
    ? '<label title="Selects every layer like this one (same tag, shared class) so your edits apply to all of them" style="display:flex;align-items:center;gap:4px;font-size:9px;color:var(--dm-text-secondary);cursor:pointer;user-select:none;flex-shrink:0;white-space:nowrap;">' +
      '<input type="checkbox" data-dm-action="toggle-matching-layers"' + (matchingLayersChecked ? ' checked' : '') + ' style="accent-color:var(--dm-accent);margin:0;cursor:pointer;"/>' +
      'Matching layers</label>'
    : '';
  // Indicator label: "Page" when body/html is the implicit context (no real
  // selection), "Hovering" while hovering, otherwise "Selected".
  const indicatorLeft = isPageContext
    ? '<span class="dm-hover-indicator selected">' + icon('panelRight', 8) + ' Page</span>'
    : isHovering
      ? '<span class="dm-hover-indicator hovering">' + icon('eye', 8) + ' Hovering</span>'
      : '<span class="dm-hover-indicator selected">' + icon('crosshair', 8) + ' Selected</span>';
  const indicator =
    '<div style="padding:6px 12px;border-bottom:1px solid var(--dm-separator);display:flex;align-items:center;gap:6px;">' +
    indicatorLeft +
    '<span style="font-size:10px;color:var(--dm-text-dim);font-family:SF Mono,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;">&lt;' + escapeAttr(tag) + '&gt;</span>' +
    multiBadge + matchingCtl + cssBtn + '</div>';

  // Text content editing — show for ANY text-tagged layer (the same set whose
  // Layers icon is the "T"/type glyph). Editing a text element with children
  // will replace its inner content, so we surface a one-line warning when that
  // would happen instead of hiding the field entirely.
  const directTextTags = ['p','h1','h2','h3','h4','h5','h6','span','a','li','td','th','label','button','strong','em','b','i','small','mark','figcaption','caption','dt','dd','abbr','cite','q','code','pre','blockquote'];
  const isTextTag = directTextTags.includes(tag);
  const showTextEdit = isTextTag && !!displayInfo.textContent;
  const textVal = displayInfo.textContent || '';
  // The rich-text editor preserves HTML structure (headings/links/spans),
  // so the old "saves will flatten children" warning no longer applies.
  const textWarning = '';
  // Rich-text editor: contenteditable div seeded with the element's
  // innerHTML so bold/italic/links round-trip. Toolbar drives
  // document.execCommand on the focused editor; native Cmd/Ctrl+B / Cmd+I /
  // Cmd+U also Just Work because contenteditable owns those shortcuts.
  // Save fires on blur so the user doesn't need a Save button.
  //
  // SECURITY: inspected pages are untrusted. The raw innerHTML they
  // produce can contain `<img onerror=...>`, `<svg onload=...>`, etc. —
  // executing inside the side-panel context would hand a malicious site
  // chrome.tabs / chrome.scripting / chrome.storage. Strip every tag
  // outside the structural-formatting allow-list and every attribute
  // that isn't explicitly safe (href is the only allowed one, and only
  // when it points to http(s) / fragment / relative path).
  const rawInner = (displayInfo as any).innerHTML;
  const richHtml = rawInner ? sanitizeRichTextHtml(rawInner) : escapeAttr(textVal);
  const tbBtn = (cmd: string, label: string, title: string) =>
    '<button data-dm-richtext-cmd="' + cmd + '" title="' + title + '" style="padding:3px 6px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:4px;color:var(--dm-text-secondary);cursor:pointer;font-size:10px;font-family:inherit;display:flex;align-items:center;justify-content:center;min-width:22px;">' + label + '</button>';
  const richToolbar =
    '<div style="display:flex;gap:3px;flex-wrap:wrap;margin-bottom:4px;">' +
    '<button data-dm-richtext-cmd="bold" title="Bold (⌘B)" style="padding:3px 6px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:4px;color:var(--dm-text-secondary);cursor:pointer;font-size:10px;font-family:inherit;display:flex;align-items:center;justify-content:center;">' + icon('bold', 11) + '</button>' +
    '<button data-dm-richtext-cmd="italic" title="Italic (⌘I)" style="padding:3px 6px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:4px;color:var(--dm-text-secondary);cursor:pointer;font-size:10px;font-family:inherit;display:flex;align-items:center;justify-content:center;">' + icon('italic', 11) + '</button>' +
    '<button data-dm-richtext-cmd="underline" title="Underline (⌘U)" style="padding:3px 6px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:4px;color:var(--dm-text-secondary);cursor:pointer;font-size:10px;font-family:inherit;display:flex;align-items:center;justify-content:center;">' + icon('underline', 11) + '</button>' +
    '<button data-dm-richtext-cmd="strikeThrough" title="Strikethrough" style="padding:3px 6px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:4px;color:var(--dm-text-secondary);cursor:pointer;font-size:10px;font-family:inherit;display:flex;align-items:center;justify-content:center;">' + icon('strikethrough', 11) + '</button>' +
    '<div style="width:1px;background:var(--dm-separator);margin:2px 4px;"></div>' +
    tbBtn('insertUnorderedList', '• List', 'Bulleted list') +
    tbBtn('insertOrderedList', '1. List', 'Numbered list') +
    '<div style="width:1px;background:var(--dm-separator);margin:2px 4px;"></div>' +
    tbBtn('createLink', '🔗', 'Link the selected text (you\'ll be prompted for URL)') +
    tbBtn('removeFormat', '⨯ fmt', 'Strip all formatting') +
    '</div>';
  const textField = showTextEdit
    ? '<div style="display:flex;flex-direction:column;gap:3px;margin-bottom:10px;">' +
      '<label style="font-size:9px;color:var(--dm-text-muted);text-transform:uppercase;letter-spacing:0.4px;">Text Content</label>' +
      richToolbar +
      '<div data-dm-richtext data-dm-element-id="' + escapeAttr(displayInfo.id || '') + '" contenteditable="true" class="dm-input" style="width:100%;min-height:88px;font-family:inherit;font-size:13px;line-height:1.5;padding:8px;box-sizing:border-box;outline:none;overflow-y:auto;max-height:280px;" spellcheck="false">' + richHtml + '</div>' +
      textWarning +
      '</div>'
    : '';

  // Smart section defaults (Phase 3D)
  const positionDefault = (s.position === 'static' || !s.position) ? false : true;
  const hasEffects = (s.boxShadow && s.boxShadow !== 'none') || (s.textShadow && s.textShadow !== 'none') ||
    (s.filter && s.filter !== 'none') || (s.backdropFilter && s.backdropFilter !== 'none') ||
    (s.transition && s.transition !== 'none') || (s.animation && s.animation !== 'none');

  // Source detection still runs in the background and rides along on the
  // ELEMENT_SELECTED payload (see content/index.ts and source-detection.ts)
  // so Copy Prompt can include a file:line hint for the agent. The Design
  // tab itself is framework-neutral — no Component section is rendered,
  // because that section was inherently React-specific.

  // Icon section for SVG/icon elements
  const iconInfo = (displayInfo as any).iconInfo;
  const iconSection = iconInfo ? sec('Icon', 'penTool',
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
    '<span style="font-size:10px;color:var(--dm-text-secondary);">Library:</span>' +
    '<span style="font-size:10px;font-weight:600;color:var(--dm-accent);">' + escapeAttr(iconInfo.library) + '</span>' +
    '</div>' +
    '<div style="display:flex;align-items:center;gap:8px;">' +
    '<span style="font-size:10px;color:var(--dm-text-secondary);">Icon:</span>' +
    (iconInfo.availableIcons && iconInfo.availableIcons.length > 1
      ? '<select class="dm-select" data-dm-icon-replace style="flex:1;min-width:0;">' +
        iconInfo.availableIcons.map((ic: string) => '<option value="' + escapeAttr(ic) + '"' + (ic === 'lucide-' + iconInfo.name || ic === iconInfo.name ? ' selected' : '') + '>' + ic.replace('lucide-', '') + '</option>').join('') + '</select>'
      : '<span style="font-size:11px;font-family:SF Mono,Monaco,monospace;color:var(--dm-text);">' + escapeAttr(iconInfo.name) + '</span>') +
    '</div>'
  ) : '';

  // Typography section — Figma-style: family / weight / size / spacing
  // controls then style toggles, casing, alignment, and list rows.
  const fontWeightCur = s.fontWeight || '400';
  const isBold = fontWeightCur === 'bold' || (parseInt(fontWeightCur, 10) || 400) >= 600;
  const fontStyleCur = s.fontStyle || 'normal';
  const decoCur = s.textDecorationLine || 'none';
  const txAlign = s.textAlign || 'left';
  const txCase = s.textTransform || 'none';
  // Vertical text alignment lives on the same row as horizontal alignment.
  // The buttons write to `align-content` — modern CSS that vertically
  // distributes a block / flex / grid element's content within its own
  // height (requires a definite height to be visible). Works on plain
  // block text layers; `vertical-align` (the long-form select in
  // Typography Advanced) only affects inline-block / table-cell.
  // Treat `start` / `flex-start` as "top" and `end` / `flex-end` as
  // "bottom" so the active state survives whichever keyword the browser
  // resolves to for the element's current display mode.
  const alignContentRaw = ((s as any).alignContent || 'normal').toLowerCase();
  const vAlignActive: 'top' | 'middle' | 'bottom' | null =
    alignContentRaw === 'start' || alignContentRaw === 'flex-start' ? 'top'
    : alignContentRaw === 'center' ? 'middle'
    : alignContentRaw === 'end' || alignContentRaw === 'flex-end' ? 'bottom'
    : null;
  // `list-style-type` computes to `disc` for every element (CSS initial),
  // even non-list ones. Painting bullets requires a list-display value
  // (`<ul>`/`<ol>`/`<li>` or `display: list-item`), so we treat the
  // toggle row as relevant only for actual list elements. For everything
  // else lstStyle reads as 'none' so no button looks active and the row
  // is suppressed entirely below.
  const isListLayer = tag === 'ul' || tag === 'ol' || tag === 'li' ||
    s.display === 'list-item' || s.display === 'inline list-item';
  const lstStyle = isListLayer ? ((s as any).listStyleType || 'disc') : 'none';
  const inputWithIcon = (iconName: keyof typeof icons, prop: string, value: string, kw: string, unit: string, title: string): string =>
    '<div class="dm-field">' +
    '<label style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--dm-text-muted);text-transform:uppercase;letter-spacing:0.4px;" title="' + escapeAttr(title) + '">' + icon(iconName, 11) + '</label>' +
    inpKw('', prop, value, unit, kw).replace(/<label[^>]*><\/label>/, '') +
    '</div>';
  // Typography Advanced — decoration cluster, wrapping/whitespace, indent/clamp,
  // i18n direction, font features, rendering. Mirrors the Position pattern:
  // primary rows stay clean and Figma-style; deeper CSS is one click away.
  const typographyAdvOpen = !!advancedOpen.typography;
  const lineClampRaw = (s as any).webkitLineClamp || '';
  const lineClampNum = parseInt(lineClampRaw, 10);
  const lineClampVal = isFinite(lineClampNum) && lineClampNum > 0 ? String(lineClampNum) : '';
  const typographyAdvancedHtml = advancedDisclosure('typography', typographyAdvOpen,
    sub('Decoration') +
    grid12([
      { span: 4, content: sel('Style', 'textDecorationStyle', (s as any).textDecorationStyle || 'solid', ['solid','double','dotted','dashed','wavy']) },
      { span: 4, content: inp('Color', 'textDecorationColor', (s as any).textDecorationColor || 'currentColor', '') },
      { span: 4, content: inp('Thickness', 'textDecorationThickness', (s as any).textDecorationThickness || 'auto') },
    ]) + sp() +
    grid12([
      { span: 4, content: inp('U. offset', 'textUnderlineOffset', (s as any).textUnderlineOffset || 'auto') },
      { span: 4, content: sel('U. position', 'textUnderlinePosition', (s as any).textUnderlinePosition || 'auto', ['auto','under','from-font','left','right']) },
      { span: 4, content: sel('Skip ink', 'textDecorationSkipInk', (s as any).textDecorationSkipInk || 'auto', ['auto','none','all']) },
    ]) + sp() +

    sub('Wrapping') +
    grid12([
      { span: 6, content: sel('White space', 'whiteSpace', s.whiteSpace || 'normal', ['normal','nowrap','pre','pre-wrap','pre-line','break-spaces']) },
      { span: 6, content: sel('Text wrap', 'textWrap', (s as any).textWrap || 'wrap', ['wrap','nowrap','balance','pretty','stable']) },
    ]) + sp() +
    grid12([
      { span: 6, content: sel('Word break', 'wordBreak', (s as any).wordBreak || 'normal', ['normal','break-all','keep-all','break-word']) },
      { span: 6, content: sel('Overflow wrap', 'overflowWrap', (s as any).overflowWrap || 'normal', ['normal','break-word','anywhere']) },
    ]) + sp() +
    grid12([
      { span: 6, content: sel('Hyphens', 'hyphens', (s as any).hyphens || 'manual', ['none','manual','auto']) },
      { span: 6, content: sel('Justify', 'textJustify', (s as any).textJustify || 'auto', ['auto','inter-word','inter-character','none']) },
    ]) + sp() +
    grid12([
      { span: 6, content: sel('Last line', 'textAlignLast', (s as any).textAlignLast || 'auto', ['auto','start','end','left','right','center','justify']) },
      { span: 6, content: sel('Line break', 'lineBreak', (s as any).lineBreak || 'auto', ['auto','loose','normal','strict','anywhere']) },
    ]) + sp() +

    sub('Layout in text') +
    grid12([
      { span: 4, content: inp('Indent', 'textIndent', (s as any).textIndent || '0px') },
      { span: 4, content: inp('Tab size', 'tabSize', (s as any).tabSize || '8', '') },
      { span: 4, content: inp('Word space', 'wordSpacing', (s as any).wordSpacing || 'normal') },
    ]) + sp() +
    grid12([
      { span: 12, content: sel('Vertical align', 'verticalAlign', (s as any).verticalAlign || 'baseline', ['baseline','top','middle','bottom','sub','super','text-top','text-bottom']) },
    ]) + sp() +
    grid12([
      { span: 6, content: inp('Line clamp', '__line_clamp', lineClampVal || '0', '') },
      { span: 6, content: '<div class="dm-field"><label class="dm-field-label dm-field-label-hidden">_</label><button class="dm-icon-row-button" data-dm-typo-action="truncate" title="Truncate (text-overflow: ellipsis + white-space: nowrap + overflow: hidden)" style="width:100%;height:30px;padding:6px;font-size:11px;">Truncate</button></div>' },
    ]) + sp() +

    sub('Direction (i18n)') +
    grid12([
      { span: 6, content: sel('Direction', 'direction', (s as any).direction || 'ltr', ['ltr','rtl']) },
      { span: 6, content: sel('Writing mode', 'writingMode', (s as any).writingMode || 'horizontal-tb', ['horizontal-tb','vertical-rl','vertical-lr','sideways-rl','sideways-lr']) },
    ]) + sp() +
    grid12([
      { span: 12, content: sel('Unicode bidi', 'unicodeBidi', (s as any).unicodeBidi || 'normal', ['normal','embed','isolate','bidi-override','isolate-override','plaintext']) },
    ]) + sp() +

    sub('Font features') +
    grid12([
      { span: 6, content: inp('Stretch', 'fontStretch', (s as any).fontStretch || '100%', '%') },
      { span: 6, content: inp('Size adjust', 'fontSizeAdjust', (s as any).fontSizeAdjust || 'none', '') },
    ]) + sp() +
    grid12([
      { span: 4, content: sel('Kerning', 'fontKerning', (s as any).fontKerning || 'auto', ['auto','normal','none']) },
      { span: 4, content: sel('Optical', 'fontOpticalSizing', (s as any).fontOpticalSizing || 'auto', ['auto','none']) },
      { span: 4, content: sel('Synthesis', 'fontSynthesis', (s as any).fontSynthesis || 'weight style small-caps', ['weight style small-caps','none','weight','style','small-caps']) },
    ]) + sp() +
    grid12([
      { span: 6, content: sel('Caps', 'fontVariantCaps', (s as any).fontVariantCaps || 'normal', ['normal','small-caps','all-small-caps','petite-caps','all-petite-caps','unicase','titling-caps']) },
      { span: 6, content: sel('Position', 'fontVariantPosition', (s as any).fontVariantPosition || 'normal', ['normal','sub','super']) },
    ]) + sp() +
    grid12([
      { span: 12, content: sel('Numeric', 'fontVariantNumeric', (s as any).fontVariantNumeric || 'normal', ['normal','ordinal','slashed-zero','lining-nums','oldstyle-nums','proportional-nums','tabular-nums','diagonal-fractions','stacked-fractions']) },
    ]) + sp() +
    grid12([
      { span: 12, content: sel('Ligatures', 'fontVariantLigatures', (s as any).fontVariantLigatures || 'normal', ['normal','none','common-ligatures','no-common-ligatures','discretionary-ligatures','no-discretionary-ligatures','historical-ligatures','no-historical-ligatures','contextual','no-contextual']) },
    ]) + sp() +
    grid12([
      { span: 12, content: inp('Feature settings', 'fontFeatureSettings', (s as any).fontFeatureSettings || 'normal', '') },
    ]) + sp() +
    grid12([
      { span: 12, content: inp('Variation settings', 'fontVariationSettings', (s as any).fontVariationSettings || 'normal', '') },
    ]) + sp() +

    sub('List') +
    grid12([
      { span: 6, content: sel('List position', 'listStylePosition', (s as any).listStylePosition || 'outside', ['outside','inside']) },
      { span: 6, content: inp('List image', 'listStyleImage', (s as any).listStyleImage || 'none', '') },
    ]) + sp() +

    sub('Rendering') +
    grid12([
      { span: 12, content: sel('Text rendering', 'textRendering', (s as any).textRendering || 'auto', ['auto','optimizeSpeed','optimizeLegibility','geometricPrecision']) },
    ])
  );

  const typographyActionsHtml = advancedToggleBtn('typography', typographyAdvOpen);

  const typographySection = !vis.typography ? '' : sec('Typography', 'type', textField +
    renderFontFamilyPicker(s.fontFamily || '') + sp() +
    grid(2, selKV('Weight', 'fontWeight', fontWeightCur, FONT_WEIGHTS), inp('Size', 'fontSize', s.fontSize || '16px')) + sp() +
    grid(2,
      inputWithIcon('moveVertical', 'lineHeight', s.lineHeight || 'normal', 'normal', '', 'Line height'),
      inputWithIcon('moveHorizontal', 'letterSpacing', s.letterSpacing || 'normal', 'normal', 'px', 'Letter spacing')
    ) + sp() +
    colorInp('Color', 'color', s.color || '#000') + sp() +
    // Style + case row — 8 buttons across the full width (1.5 of 12 cols each).
    // Bold | Italic | Underline | Strikethrough | None | UPPER | lower | Title.
    iconButtonRow([
      { icon: 'bold', attr: 'data-dm-text-toggle="bold"', active: isBold, title: 'Bold' },
      { icon: 'italic', attr: 'data-dm-text-toggle="italic"', active: fontStyleCur === 'italic', title: 'Italic' },
      { icon: 'underline', attr: 'data-dm-text-toggle="underline"', active: decoCur.includes('underline'), title: 'Underline' },
      { icon: 'strikethrough', attr: 'data-dm-text-toggle="strikethrough"', active: decoCur.includes('line-through'), title: 'Strikethrough' },
      { icon: 'minus', attr: 'data-dm-prop="textTransform" data-dm-value="none"', active: txCase === 'none', title: 'No case' },
      { icon: 'caseUpper', attr: 'data-dm-prop="textTransform" data-dm-value="uppercase"', active: txCase === 'uppercase', title: 'UPPERCASE' },
      { icon: 'caseLower', attr: 'data-dm-prop="textTransform" data-dm-value="lowercase"', active: txCase === 'lowercase', title: 'lowercase' },
      { icon: 'caseSensitive', attr: 'data-dm-prop="textTransform" data-dm-value="capitalize"', active: txCase === 'capitalize', title: 'Title Case' },
    ]) + sp() +
    // Alignment row: horizontal (4 buttons) + vertical (3 buttons), each
    // half taking 6 of 12 columns. The list-style row sits underneath
    // and only renders for actual list elements — `list-style-type`
    // computes to `disc` everywhere, so showing the toggle on every
    // element would mislead users into thinking a `<p>` is a bulleted
    // list.
    grid12([
      { span: 6, content: iconButtonRow([
        { icon: 'textAlignStart', attr: 'data-dm-prop="textAlign" data-dm-value="left"', active: txAlign === 'left' || txAlign === 'start', title: 'Align left' },
        { icon: 'textAlignCenter', attr: 'data-dm-prop="textAlign" data-dm-value="center"', active: txAlign === 'center', title: 'Align center' },
        { icon: 'textAlignEnd', attr: 'data-dm-prop="textAlign" data-dm-value="right"', active: txAlign === 'right' || txAlign === 'end', title: 'Align right' },
        { icon: 'textAlignJustify', attr: 'data-dm-prop="textAlign" data-dm-value="justify"', active: txAlign === 'justify', title: 'Justify' },
      ]) },
      { span: 6, content: iconButtonRow([
        { icon: 'arrowUpToLine', attr: 'data-dm-prop="alignContent" data-dm-value="start"', active: vAlignActive === 'top', title: 'Align top' },
        { icon: 'foldVertical', attr: 'data-dm-prop="alignContent" data-dm-value="center"', active: vAlignActive === 'middle', title: 'Align middle' },
        { icon: 'arrowDownToLine', attr: 'data-dm-prop="alignContent" data-dm-value="end"', active: vAlignActive === 'bottom', title: 'Align bottom' },
      ]) },
    ]) + sp() +
    (isListLayer
      ? iconButtonRow([
          { icon: 'minus', attr: 'data-dm-list-style="none"', active: lstStyle === 'none' || !lstStyle, title: 'No list marker' },
          { icon: 'list', attr: 'data-dm-list-style="disc"', active: lstStyle === 'disc', title: 'Bulleted list' },
          { icon: 'listOrdered', attr: 'data-dm-list-style="decimal"', active: lstStyle === 'decimal', title: 'Numbered list' },
        ]) + sp()
      : '') +
    typographyAdvancedHtml,
    true,
    typographyActionsHtml
  );

  // \u2500\u2500\u2500 Smart defaults & section-action computations (Figma-style) \u2500\u2500\u2500
  const ctx = detectParentContext(displayInfo, s);
  const display = s.display || 'block';
  const isFlex = display === 'flex' || display === 'inline-flex';
  const isGrid = display === 'grid' || display === 'inline-grid';
  const layoutAdvOpen = !!advancedOpen.layout;
  const appearanceAdvOpen = !!advancedOpen.appearance;
  const fillAdvOpen = !!advancedOpen.fill;

  const strokePos = getStrokeActiveTab(info?.id || '', s);
  const strokeStyleOff = ['borderTopStyle','borderRightStyle','borderBottomStyle','borderLeftStyle']
    .every(p => (s[p] || 'none') === 'none');
  const fillOff = (s.backgroundColor || '').replace(/\s+/g,'') === 'rgba(0,0,0,0)';
  const visibilityOff = (s.visibility || 'visible') !== 'visible';

  // Section-header action clusters
  const layoutActionsHtml = advancedToggleBtn('layout', layoutAdvOpen);
  const fillActionsHtml = advancedToggleBtn('fill', fillAdvOpen);
  void strokeStyleOff; void sidesPopoverOpen;
  const visEyeBtn = '<button class="dm-section-action" data-dm-prop="visibility" data-dm-value="' + (visibilityOff ? 'visible' : 'hidden') + '" title="' +
    (visibilityOff ? 'Show element' : 'Hide element') + '" data-active="' + (visibilityOff ? 'false' : 'true') + '">' +
    icon(visibilityOff ? 'eyeOff' : 'eye', 12) + '</button>';
  const appearanceActionsHtml = visEyeBtn + advancedToggleBtn('appearance', appearanceAdvOpen);
  const effectsActionsHtml = effectsAddMenuTrigger(effectsMenuOpen);
  // Freeze toggle lives in the Motion section header (moved out of the action
  // row). Page-wide: pauses every animation / transition / video on the page.
  const freezeBtn = '<button class="dm-section-action" data-dm-action="toggle-freeze" data-active="' + (animationsFrozen ? 'true' : 'false') + '" title="' + (animationsFrozen ? 'Resume all motion on the page' : 'Pause every animation, transition and video on the page') + '">' + icon(animationsFrozen ? 'circlePlay' : 'circlePause', 12) + '</button>';
  const motionActionsHtml = freezeBtn + advancedToggleBtn('motion', !!advancedOpen.motion) + motionAddMenuTrigger(motionMenuOpen);

  // Position content \u2014 laid out on a 12-col grid:
  //   \u2022 alignment row: 6 buttons \u00d7 2 cols
  //   \u2022 distribute (multi-select): 2 buttons \u00d7 6 cols
  //   \u2022 X (3) Y (3) Z (2) Zup (2) Zdn (2) = 12
  //   \u2022 Rot (2) CCW (2) CW (2) FlipH (3) FlipV (3) = 12
  const distributeActive = multiSelectActive && multiSelectIds.length >= 2;
  const rotateRaw = s.rotate || '';
  const rotateDisplay = (rotateRaw === 'none' || rotateRaw === '') ? '0deg' : rotateRaw;
  // Build alignment buttons individually so each can claim its 2-col span.
  const alignBtnHtml = (iconName: keyof typeof icons, attr: string, title: string): string =>
    '<button class="dm-icon-row-button" ' + attr + ' data-active="false" title="' + escapeAttr(title) + '" style="width:100%;height:30px;padding:6px;">' + icon(iconName, 14) + '</button>';
  const distBtnHtml = (iconName: keyof typeof icons, attr: string, title: string): string =>
    '<button class="dm-icon-row-button" ' + attr + ' data-active="false" title="' + escapeAttr(title) + '" style="width:100%;height:30px;padding:6px;">' + icon(iconName, 14) + '</button>';
  const zOrderBtnHtml = (iconName: keyof typeof icons, attr: string, title: string): string =>
    '<button class="dm-icon-row-button" ' + attr + ' data-active="false" title="' + escapeAttr(title) + '" style="width:100%;height:30px;padding:6px;">' + icon(iconName, 14) + '</button>';
  const flipBtnHtml = (iconName: keyof typeof icons, attr: string, active: boolean, title: string): string =>
    '<button class="dm-icon-row-button" ' + attr + ' data-active="' + (active ? 'true' : 'false') + '" title="' + escapeAttr(title) + '" style="width:100%;height:30px;padding:6px;">' + icon(iconName, 14) + '</button>';
  const scale = (s.scale || '').trim();
  const scaleParts = (scale === 'none' || !scale) ? ['1','1'] : scale.split(/\s+/);
  const sx = parseFloat(scaleParts[0] || '1') || 1;
  const sy = parseFloat(scaleParts[1] || scaleParts[0] || '1') || sx;

  // Pivot 9-cell pad \u2014 same shape as Layout's children-align pad. Each
  // cell maps to one CSS transform-origin keyword pair. Browsers normalise
  // computed `transform-origin` to pixel values (e.g. `296px 129.695px`),
  // so we parse against the element's rect when the value isn't a keyword.
  const tOriginRaw = s.transformOrigin || '50% 50%';
  const axisToFrac = (val: string, total: number): number => {
    const t = (val || '').trim();
    if (t.endsWith('%')) return (parseFloat(t) || 0) / 100;
    if (t.endsWith('px') || /^-?\d+(\.\d+)?$/.test(t)) {
      return total > 0 ? (parseFloat(t) || 0) / total : 0.5;
    }
    return 0.5;
  };
  let tOriginH: 'left'|'center'|'right' = 'center';
  let tOriginV: 'top'|'center'|'bottom' = 'center';
  const tOriginLc = tOriginRaw.toLowerCase();
  if (/(left|right|top|bottom|center)/.test(tOriginLc)) {
    if (tOriginLc.includes('left')) tOriginH = 'left';
    else if (tOriginLc.includes('right')) tOriginH = 'right';
    if (tOriginLc.includes('top')) tOriginV = 'top';
    else if (tOriginLc.includes('bottom')) tOriginV = 'bottom';
  } else {
    const parts = tOriginRaw.split(/\s+/);
    const xF = axisToFrac(parts[0] || '50%', displayInfo?.rect?.width || 100);
    const yF = axisToFrac(parts[1] || '50%', displayInfo?.rect?.height || 100);
    const TOL = 0.15;
    tOriginH = xF < TOL ? 'left' : xF > 1 - TOL ? 'right' : 'center';
    tOriginV = yF < TOL ? 'top' : yF > 1 - TOL ? 'bottom' : 'center';
  }
  const pivotCells: { h: 'left'|'center'|'right'; v: 'top'|'center'|'bottom' }[] = [];
  for (const v of ['top','center','bottom'] as const)
    for (const h of ['left','center','right'] as const)
      pivotCells.push({ h, v });
  const pivotPad = '<div style="display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);gap:2px;width:100%;aspect-ratio:1/1;">' +
    pivotCells.map(c => {
      const active = c.h === tOriginH && c.v === tOriginV;
      const dot = '<span style="width:6px;height:6px;border-radius:50%;background:' + (active ? 'var(--dm-accent)' : 'var(--dm-text-dim)') + ';"></span>';
      const valueAttr = c.v + ' ' + c.h;
      return '<button class="dm-icon-row-button" data-dm-transform-origin="' + valueAttr + '" data-active="' + (active ? 'true' : 'false') + '" title="Pivot: ' + c.v + ' ' + c.h + '" style="padding:0;display:flex;align-items:center;justify-content:center;">' + dot + '</button>';
    }).join('') +
    '</div>';

  // Skew X / Y display values \u2014 read existing transform shorthand.
  const transformCur = (s.transform || '').toLowerCase();
  const skewXMatch = /skewx\(([^)]+)\)/.exec(transformCur) || /skew\(([^,)]+)/.exec(transformCur);
  const skewYMatch = /skewy\(([^)]+)\)/.exec(transformCur) || /skew\([^,]+,([^)]+)/.exec(transformCur);
  const skewX = skewXMatch ? parseFloat(skewXMatch[1]) || 0 : 0;
  const skewY = skewYMatch ? parseFloat(skewYMatch[1]) || 0 : 0;

  const positionAdvOpen = !!advancedOpen.position;

  // Position-type gating \u2014 hide rows that have no effect when `position`
  // is `static`. Static disables CSS positioning entirely (top/right/
  // bottom/left/z-index are inert), so showing those fields would be
  // misleading. Anchor positioning likewise needs a positioned element.
  const posType = (s.position || 'static') as 'static'|'relative'|'absolute'|'fixed'|'sticky';
  const offsetActive = posType !== 'static';   // top / right / bottom / left / z-index
  const anchorPosActive = posType !== 'static'; // position-anchor / position-area / try-* / visibility

  const positionContent =
    sel('Position', 'position', s.position || 'static', ['static','relative','absolute','fixed','sticky']) + sp() +
    // Alignment row \u2014 always visible (margin-auto / align-self / justify-self
    // work regardless of position type).
    grid12([
      { span: 2, content: alignBtnHtml('alignStartVertical', 'data-dm-pos-align="h-left"', 'Align left') },
      { span: 2, content: alignBtnHtml('alignCenterVertical', 'data-dm-pos-align="h-center"', 'Align horizontal center') },
      { span: 2, content: alignBtnHtml('alignEndVertical', 'data-dm-pos-align="h-right"', 'Align right') },
      { span: 2, content: alignBtnHtml('alignStartHorizontal', 'data-dm-pos-align="v-top"', 'Align top') },
      { span: 2, content: alignBtnHtml('alignCenterHorizontal', 'data-dm-pos-align="v-middle"', 'Align vertical center') },
      { span: 2, content: alignBtnHtml('alignEndHorizontal', 'data-dm-pos-align="v-bottom"', 'Align bottom') },
    ]) + sp() +
    // Distribute row (multi-select only) \u2014 6 cols each so they evenly fill.
    (distributeActive ? grid12([
      { span: 6, content: distBtnHtml('alignHorizontalSpaceAround', 'data-dm-pos-distribute="horizontal"', 'Distribute horizontally') },
      { span: 6, content: distBtnHtml('alignVerticalSpaceAround', 'data-dm-pos-distribute="vertical"', 'Distribute vertically') },
    ]) + sp() : '') +
    // X / Y / Z / Z-order \u2014 hidden when position is static (offsets inert).
    (offsetActive ? grid12([
      { span: 3, content: inp('X', 'left', s.left || 'auto') },
      { span: 3, content: inp('Y', 'top', s.top || 'auto') },
      { span: 2, content: inp('Z', 'zIndex', s.zIndex || 'auto', '') },
      { span: 2, content: '<div class="dm-field"><label class="dm-field-label dm-field-label-hidden">\u2191</label>' + zOrderBtnHtml('arrowUpToLine', 'data-dm-z-step="up"', 'Bring forward') + '</div>' },
      { span: 2, content: '<div class="dm-field"><label class="dm-field-label dm-field-label-hidden">\u2193</label>' + zOrderBtnHtml('arrowDownToLine', 'data-dm-z-step="down"', 'Send backward') + '</div>' },
    ]) + sp() : '') +
    // Rot (4) + CCW (2) + CW (2) + FlipH (2) + FlipV (2) = 12.
    '<div style="display:grid;grid-template-columns:repeat(12, 1fr);gap:6px;align-items:stretch;">' +
      '<div style="grid-column:span 4;min-width:0;">' + inp('', 'rotate', rotateDisplay, 'deg') + '</div>' +
      '<div style="grid-column:span 2;min-width:0;">' + zOrderBtnHtml('rotateCcwSquare', 'data-dm-rotate-step="-90"', 'Rotate 90\u00b0 counter-clockwise') + '</div>' +
      '<div style="grid-column:span 2;min-width:0;">' + zOrderBtnHtml('rotateCwSquare', 'data-dm-rotate-step="90"', 'Rotate 90\u00b0 clockwise') + '</div>' +
      '<div style="grid-column:span 2;min-width:0;">' + flipBtnHtml('flipHorizontal2', 'data-dm-flip="h"', sx < 0, 'Flip horizontally') + '</div>' +
      '<div style="grid-column:span 2;min-width:0;">' + flipBtnHtml('flipVertical2', 'data-dm-flip="v"', sy < 0, 'Flip vertically') + '</div>' +
    '</div>' +
    // Advanced disclosure \u2014 pivot, skew, anchor (right/bottom), 3D, raw
    // transform, self-alignment overrides.
    advancedDisclosure('position', positionAdvOpen,
      sub('Pivot (transform-origin)') +
      '<div style="display:grid;grid-template-columns:repeat(12, 1fr);gap:8px;align-items:start;">' +
        '<div style="grid-column:span 6;min-width:0;">' + pivotPad + '</div>' +
        '<div style="grid-column:span 6;min-width:0;">' + inp('Raw', 'transformOrigin', s.transformOrigin || '50% 50%', '') + '</div>' +
      '</div>' + sp() +
      sub('Skew') +
      grid12([
        { span: 6, content: inp('Skew X', '__skew_x', skewX + 'deg', 'deg') },
        { span: 6, content: inp('Skew Y', '__skew_y', skewY + 'deg', 'deg') },
      ]) + sp() +
      // Right / Bottom anchors — hidden when position is static (offsets inert).
      (offsetActive ? sub('Anchor (right / bottom edges)') +
      grid12([
        { span: 6, content: inp('Right', 'right', s.right || 'auto') },
        { span: 6, content: inp('Bottom', 'bottom', s.bottom || 'auto') },
      ]) + sp() : '') +
      sub('3D') +
      grid12([
        { span: 6, content: inp('Perspective', 'perspective', (s as any).perspective || 'none', '') },
        { span: 6, content: inp('Persp. origin', 'perspectiveOrigin', (s as any).perspectiveOrigin || '50% 50%', '') },
      ]) + sp() +
      grid12([
        { span: 6, content: sel('Transform style', 'transformStyle', (s as any).transformStyle || 'flat', ['flat','preserve-3d']) },
        { span: 6, content: sel('Backface', 'backfaceVisibility', (s as any).backfaceVisibility || 'visible', ['visible','hidden']) },
      ]) + sp() +
      grid12([
        { span: 12, content: sel('Transform reference box', 'transformBox', (s as any).transformBox || 'view-box', ['view-box','fill-box','stroke-box','border-box','content-box']) },
      ]) + sp() +
      // Logical anchors — same gating as physical inset edges.
      (offsetActive ? sub('Logical anchors (i18n — flip with writing-mode / direction)') +
      grid12([
        { span: 3, content: inp('Block start', 'insetBlockStart', (s as any).insetBlockStart || 'auto') },
        { span: 3, content: inp('Block end', 'insetBlockEnd', (s as any).insetBlockEnd || 'auto') },
        { span: 3, content: inp('Inline start', 'insetInlineStart', (s as any).insetInlineStart || 'auto') },
        { span: 3, content: inp('Inline end', 'insetInlineEnd', (s as any).insetInlineEnd || 'auto') },
      ]) + sp() : '') +
      sub('Anchor positioning') +
      // anchor-name works on any element (it's just a name). position-anchor
      // and position-area need this element to be positioned, so disable
      // those two when position is static.
      grid12([
        { span: 4, content: inp('Anchor name', 'anchorName', (s as any).anchorName || 'none', '') },
        { span: 4, content: dis(inp('Position anchor', 'positionAnchor', (s as any).positionAnchor || 'auto', ''), !anchorPosActive, 'Position must not be static') },
        { span: 4, content: dis(inp('Position area', 'positionArea', (s as any).positionArea || 'none', ''), !anchorPosActive, 'Position must not be static') },
      ]) + sp() +
      // Try order / visibility / fallbacks — hidden entirely when static
      // (whole rows are inert).
      (anchorPosActive ? grid12([
        { span: 6, content: sel('Try order', 'positionTryOrder', (s as any).positionTryOrder || 'normal', ['normal','most-width','most-height','most-block-size','most-inline-size']) },
        { span: 6, content: sel('Visibility', 'positionVisibility', (s as any).positionVisibility || 'always', ['always','anchors-visible','no-overflow']) },
      ]) + sp() +
      inp('Try fallbacks', 'positionTryFallbacks', (s as any).positionTryFallbacks || 'none', '') + sp() : '') +
      sub('View transition name') +
      inp('', 'viewTransitionName', (s as any).viewTransitionName || 'none', '') + sp() +
      sub('Raw transform') +
      inp('', 'transform', s.transform || 'none', '') + sp() +
      sub('Self alignment override') +
      grid12([
        { span: 6, content: inp('Align self', 'alignSelf', s.alignSelf || 'auto', '') },
        { span: 6, content: inp('Justify self', 'justifySelf', s.justifySelf || 'auto', '') },
      ])
    );

  // Layout content \u2014 12-col grid:
  //   row: layout mode segmented (full width)
  //   row: W (5) + aspect-ratio btn (1) + H (5) + shrink (1)
  //   row: Min W / Max W / Min H / Max H \u2014 each 3 cols
  //   row: Children align (6) + col-gap & row-gap stacked (6)
  //   row: Chrome computed-box (padding nested in margin)
  //   row: clip checkbox + clip-path
  //   row: overflow X / overflow Y / box-sizing
  const clipChecked = (s.overflow || 'visible') === 'hidden';
  // Checkbox-style toggle button (no inline label — the surrounding
  // wrapper supplies the "Clip content" title above the field).
  const clipBtn = '<button data-dm-prop="overflow" data-dm-value="' + (clipChecked ? 'visible' : 'hidden') + '" title="' + (clipChecked ? 'Currently clipping' : 'Toggle clip content (overflow: hidden)') + '" style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--dm-text-secondary);cursor:pointer;background:none;border:none;padding:0;font-family:inherit;text-align:left;width:100%;">' +
    '<span style="width:14px;height:14px;border:1px solid var(--dm-input-border);border-radius:3px;background:' + (clipChecked ? 'var(--dm-accent)' : 'var(--dm-input-bg)') + ';display:flex;align-items:center;justify-content:center;color:white;flex-shrink:0;">' + (clipChecked ? icon('check', 10) : '') + '</span>' +
    '<span>' + (clipChecked ? 'On' : 'Off') + '</span></button>';
  // Aspect-ratio button \u2014 link2 (blue) when locked, unlink2 when free.
  // The W and H inputs are coupled when locked: editing one fans out to
  // the other so the ratio holds. See applyStyle's locked-aspect path.
  const aspectRatioCur = ((s as any).aspectRatio || 'auto').trim();
  const aspectActive = !!aspectRatioCur && aspectRatioCur !== 'auto';
  const aspectBtn = '<button data-dm-action="toggle-aspect-ratio" title="' +
    (aspectActive ? 'Unlock aspect ratio' : 'Lock aspect ratio to current W:H') +
    '" data-active="' + (aspectActive ? 'true' : 'false') + '" style="width:100%;height:30px;padding:0;display:flex;align-items:center;justify-content:center;border-radius:5px;cursor:pointer;background:' +
    (aspectActive ? 'var(--dm-accent-bg)' : 'var(--dm-btn-bg)') + ';border:1px solid ' +
    (aspectActive ? 'var(--dm-accent-border)' : 'var(--dm-btn-border)') + ';color:' +
    (aspectActive ? 'var(--dm-accent)' : 'var(--dm-text-secondary)') + ';">' + icon(aspectActive ? 'link2' : 'unlink2', 16) + '</button>';

  // Gap fields (column / row) \u2014 context-gated by layout mode.
  // Horizontal stack \u2192 only Col gap. Vertical stack \u2192 only Row gap. Grid \u2192 both.
  const colGapField = gapInput('Col gap', 'col', s, 'alignHorizontalSpaceAround');
  const rowGapField = gapInput('Row gap', 'row', s, 'alignVerticalSpaceAround');
  const flexDir = s.flexDirection || 'row';
  const isHStackFlex = isFlex && (flexDir === 'row' || flexDir === 'row-reverse');
  const isVStackFlex = isFlex && (flexDir === 'column' || flexDir === 'column-reverse');
  const showColGap = isGrid || isHStackFlex;
  const showRowGap = isGrid || isVStackFlex;
  const gapsBlock = (showColGap || showRowGap)
    ? '<div style="display:flex;flex-direction:column;gap:6px;">' +
        (showColGap ? colGapField : '') +
        (showRowGap ? rowGapField : '') +
      '</div>'
    : '';

  const layoutContent =
    layoutModeRow(s) + sp() +
    // W (5) + aspect (2) + H (5). The standalone "resize to content"
    // button is gone \u2014 Hug mode in each size input owns that intent now.
    grid12([
      { span: 5, content: sizeInput('W', 'width', s.width || 'auto', info?.id || '') },
      { span: 2, content: '<div class="dm-field"><label style="font-size:10px;color:var(--dm-text-muted);visibility:hidden;">\u00b7</label>' + aspectBtn + '</div>' },
      { span: 5, content: sizeInput('H', 'height', s.height || 'auto', info?.id || '') },
    ]) + sp() +
    // Min W (3) + Max W (3) + Min H (3) + Max H (3)
    grid12([
      { span: 3, content: inp('Min W', 'minWidth', s.minWidth || '0') },
      { span: 3, content: inp('Max W', 'maxWidth', s.maxWidth || 'none') },
      { span: 3, content: inp('Min H', 'minHeight', s.minHeight || '0') },
      { span: 3, content: inp('Max H', 'maxHeight', s.maxHeight || 'none') },
    ]) + sp() +
    // Margin (4 field + 2 expand) and Padding (4 field + 2 expand) share one
    // row; each expander drops below its own half independently.
    grid12([
      { span: 4, content: spacingUniformField('Margin', 'margin', s) },
      { span: 2, content: '<div class="dm-field"><label class="dm-field-label dm-field-label-hidden">&middot;</label><button class="dm-icon-row-button" data-dm-spacing-expand="margin" title="' + (marginExpanded ? 'Collapse sides' : 'Edit each side separately') + '" data-active="' + (marginExpanded ? 'true' : 'false') + '" style="width:100%;">' + icon('scan', 14) + '</button></div>' },
      { span: 4, content: spacingUniformField('Padding', 'padding', s) },
      { span: 2, content: '<div class="dm-field"><label class="dm-field-label dm-field-label-hidden">&middot;</label><button class="dm-icon-row-button" data-dm-spacing-expand="padding" title="' + (paddingExpanded ? 'Collapse sides' : 'Edit each side separately') + '" data-active="' + (paddingExpanded ? 'true' : 'false') + '" style="width:100%;">' + icon('scan', 14) + '</button></div>' },
    ]) + sp() +
    ((marginExpanded || paddingExpanded)
      ? grid12([
          { span: 6, content: marginExpanded ? spacing2x2(s, 'margin') : '' },
          { span: 6, content: paddingExpanded ? spacing2x2(s, 'padding') : '' },
        ]) + sp()
      : '') +
    // Children align (6) + Col/Row gap stacked (6) \u2014 top-aligned so the
    // gap fields start at the same Y as the children-align pad.
    ((isFlex || isGrid) ? '<div style="display:grid;grid-template-columns:repeat(12, 1fr);gap:6px;align-items:start;">' +
      '<div style="grid-column:span 6;min-width:0;display:flex;flex-direction:column;gap:3px;"><label class="dm-field-label">Children align</label>' + childrenAlignPad(s) + '</div>' +
      '<div style="grid-column:span 6;min-width:0;">' + gapsBlock + '</div>' +
    '</div>' + sp() : '') +
    // Advanced disclosure: clip / overflow / box-sizing live here now —
    // they're rarely-toggled box-model fine-tuning that crowds the top
    // of the panel when always visible. Flex / grid container + item
    // details still live below them in this same disclosure.
    advancedDisclosure('layout', layoutAdvOpen,
      sub('Computed box') +
      spacingBox(s, displayInfo) + sp() +
      sub('Clip + overflow') +
      // Clip content (6) + Clip path (6) — sit side-by-side but they're
      // independent CSS features. `overflow: hidden` clips children that
      // overflow this element's box; `clip-path` shapes the visible area
      // of this element itself. The Clip path label gets an info chip to
      // make that clear since the visual pairing implies otherwise.
      grid12([
        { span: 6, content: '<div class="dm-field"><label class="dm-field-label">Clip content</label><div style="height:30px;display:flex;align-items:center;background:var(--dm-input-bg);border:1px solid var(--dm-input-border);border-radius:5px;padding:0 8px;">' + clipBtn + '</div></div>' },
        { span: 6, content: '<div class="dm-field" title="clip-path shapes this element\'s own visible area. It works independently of \'Clip content\' (overflow: hidden), which only clips overflowing children."><label class="dm-field-label" style="display:flex;align-items:center;gap:4px;">Clip path<span style="font-size:9px;color:var(--dm-text-dim);font-weight:400;text-transform:none;letter-spacing:0;">(independent of overflow)</span></label>' +
          '<select class="dm-select" data-dm-prop="clipPath">' +
            ['none','inset(10px)','circle(50%)','ellipse(50% 50%)','polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)','inset(0 round 12px)']
              .map(o => '<option value="' + o + '"' + (((s as any).clipPath || 'none') === o ? ' selected' : '') + '>' + o + '</option>')
              .join('') +
          '</select></div>' },
      ]) + sp() +
      // Overflow X (4) / Y (4) / Box-sizing (4)
      grid12([
        { span: 4, content: sel('Overflow X', 'overflowX', s.overflowX || 'visible', ['visible','hidden','scroll','auto']) },
        { span: 4, content: sel('Overflow Y', 'overflowY', s.overflowY || 'visible', ['visible','hidden','scroll','auto']) },
        { span: 4, content: sel('Box sizing', 'boxSizing', (s as any).boxSizing || 'content-box', ['content-box','border-box']) },
      ]) + sp() +
      inp('Aspect ratio (raw)', 'aspectRatio', aspectRatioCur || 'auto', '') + sp() +
      // Container-level: align-content (only meaningful for flex+wrap or grid).
      ((isFlex || isGrid) ? sel('Align content', 'alignContent', s.alignContent || 'normal',
        ['normal','start','center','end','flex-start','flex-end','space-between','space-around','space-evenly','stretch','baseline']) + sp() : '') +
      // Container-level shorthands (place-items / place-content).
      ((isFlex || isGrid) ? grid(2,
        inp('Place items', 'placeItems', (s as any).placeItems || 'normal', ''),
        inp('Place content', 'placeContent', (s as any).placeContent || 'normal', '')
      ) + sp() : '') +
      // Flex item subsection (when this element's parent is flex).
      (ctx.isFlex ? sub('Flex item') + grid(4,
        inp('Grow', 'flexGrow', s.flexGrow || '0', ''),
        inp('Shrink', 'flexShrink', s.flexShrink || '1', ''),
        inp('Basis', 'flexBasis', s.flexBasis || 'auto', ''),
        inp('Order', 'order', (s as any).order || '0', '')
      ) + sp() : '') +
      // Flex container — wrap stays here.
      (isFlex ? sel('Wrap', 'flexWrap', s.flexWrap || 'nowrap', ['nowrap','wrap','wrap-reverse']) + sp() : '') +
      // Grid container subsection.
      (isGrid ? sub('Grid container') +
        inp('Cols', 'gridTemplateColumns', s.gridTemplateColumns || 'none', '') + sp() +
        inp('Rows', 'gridTemplateRows', s.gridTemplateRows || 'none', '') + sp() +
        '<div class="dm-field"><label class="dm-field-label">Areas</label><textarea class="dm-input" data-dm-prop="gridTemplateAreas" rows="3" placeholder=\'"a a b" "c c b"\' style="background:var(--dm-input-bg);border:1px solid var(--dm-input-border);border-radius:5px;padding:6px;font-family:SF Mono,Monaco,monospace;resize:vertical;">' + escapeAttr((s as any).gridTemplateAreas || '') + '</textarea></div>' + sp() +
        grid(2,
          inp('Auto cols', 'gridAutoColumns', (s as any).gridAutoColumns || 'auto', ''),
          inp('Auto rows', 'gridAutoRows', (s as any).gridAutoRows || 'auto', '')
        ) + sp() +
        sel('Auto flow', 'gridAutoFlow', (s as any).gridAutoFlow || 'row', ['row','column','row dense','column dense']) + sp() : '') +
      // Grid item subsection (when this element's parent is grid).
      (ctx.isGrid ? sub('Grid item') +
        grid(3,
          inp('Col', 'gridColumn', (s as any).gridColumn || 'auto', ''),
          inp('Row', 'gridRow', (s as any).gridRow || 'auto', ''),
          inp('Area', 'gridArea', (s as any).gridArea || 'auto', '')
        ) + sp() +
        inp('Place self', 'placeSelf', (s as any).placeSelf || 'auto', '') + sp() : '') +
      // Logical margin — block (top/bottom in horizontal-tb writing-mode)
      // and inline (left/right). Pairs with the logical-inset properties
      // already exposed in Position → Advanced. Useful when the project
      // targets RTL or vertical writing modes; auto-flips with `direction`.
      sub('Logical margin (auto-flips with writing-mode)') +
      grid(2,
        inp('Block start', 'marginBlockStart', (s as any).marginBlockStart || '0px'),
        inp('Block end', 'marginBlockEnd', (s as any).marginBlockEnd || '0px')
      ) + sp() +
      grid(2,
        inp('Inline start', 'marginInlineStart', (s as any).marginInlineStart || '0px'),
        inp('Inline end', 'marginInlineEnd', (s as any).marginInlineEnd || '0px')
      )
    );

  // Appearance content \u2014 opacity + blend + isolation, corner radius (title
  // row + scan \u2192 2\u00d72; each cell accepts elliptical "X Y" pairs natively),
  // color-adjust filters, raw filter, and an Advanced disclosure that
  // covers visibility / cursor / form-control colours / scrollbars /
  // backdrop adjust / clip-path / performance hints.
  const filterCur = (s.filter || 'none').toLowerCase();
  const filterIs = (fn: string): boolean => filterCur.includes(fn + '(');
  const bdFilterCur = ((s as any).backdropFilter || 'none').toLowerCase();
  const bdFilterIs = (fn: string): boolean => bdFilterCur.includes(fn + '(');
  const colorAdjustRow = iconButtonRow([
    { icon: 'sun', attr: 'data-dm-filter-fn="brightness"', active: filterIs('brightness'), title: 'Brightness' },
    { icon: 'circleHalfFull', attr: 'data-dm-filter-fn="contrast"', active: filterIs('contrast'), title: 'Contrast' },
    { icon: 'palette', attr: 'data-dm-filter-fn="saturate"', active: filterIs('saturate'), title: 'Saturation' },
    { icon: 'rotate3d', attr: 'data-dm-filter-fn="hue-rotate"', active: filterIs('hue-rotate'), title: 'Hue rotate' },
    { icon: 'circleOff', attr: 'data-dm-filter-fn="grayscale"', active: filterIs('grayscale'), title: 'Grayscale' },
    { icon: 'contrast', attr: 'data-dm-filter-fn="invert"', active: filterIs('invert'), title: 'Invert' },
    { icon: 'flame', attr: 'data-dm-filter-fn="sepia"', active: filterIs('sepia'), title: 'Sepia' },
    { icon: 'squareStack', attr: 'data-dm-filter-fn="drop-shadow"', active: filterIs('drop-shadow'), title: 'Drop shadow (filter — ignores overflow:hidden, follows alpha shape)' },
  ]);
  const backdropAdjustRow = iconButtonRow([
    { icon: 'sun', attr: 'data-dm-bdfilter-fn="brightness"', active: bdFilterIs('brightness'), title: 'Backdrop brightness' },
    { icon: 'circleHalfFull', attr: 'data-dm-bdfilter-fn="contrast"', active: bdFilterIs('contrast'), title: 'Backdrop contrast' },
    { icon: 'palette', attr: 'data-dm-bdfilter-fn="saturate"', active: bdFilterIs('saturate'), title: 'Backdrop saturation' },
    { icon: 'rotate3d', attr: 'data-dm-bdfilter-fn="hue-rotate"', active: bdFilterIs('hue-rotate'), title: 'Backdrop hue rotate' },
    { icon: 'circleOff', attr: 'data-dm-bdfilter-fn="grayscale"', active: bdFilterIs('grayscale'), title: 'Backdrop grayscale' },
    { icon: 'contrast', attr: 'data-dm-bdfilter-fn="invert"', active: bdFilterIs('invert'), title: 'Backdrop invert' },
    { icon: 'flame', attr: 'data-dm-bdfilter-fn="sepia"', active: bdFilterIs('sepia'), title: 'Backdrop sepia' },
  ]);

  const isolationCur = ((s as any).isolation || 'auto') === 'isolate';
  const isolationBtn = '<div class="dm-field"><label class="dm-field-label" title="Forces a new stacking context. Useful when blend modes should not bleed across siblings.">Iso</label>' +
    '<button class="dm-icon-row-button" data-dm-prop="isolation" data-dm-value="' + (isolationCur ? 'auto' : 'isolate') + '" data-active="' + (isolationCur ? 'true' : 'false') + '" title="' + (isolationCur ? 'Stop forcing a new stacking context' : 'Force a new stacking context (isolate)') + '" style="width:100%;height:30px;padding:6px;">' +
    icon(isolationCur ? 'box' : 'squareDashed', 14) + '</button></div>';

  const isFormLayer = kind === 'form';

  // Top row of the Appearance section — three controls in one 12-col
  // grid: Opacity (5), Corner radius (5), Edit-each-corner toggle (2).
  // Blend mode + isolation moved into Advanced; they're niche stacking-
  // context controls, not the kind of thing you reach for on every layer.
  // Button reuses .dm-icon-row-button's default padding (6px) instead of
  // the explicit height:30px;padding:0 the earlier draft hard-coded —
  // that combination rendered ~2px taller than the .dm-input-shell next
  // to it (padding-driven height of an input wins on the small fraction
  // of a px-line difference). Letting padding drive the height keeps the
  // button visually flush with the Opacity / Corner-radius fields.
  const cornerExpandRowBtn = '<div class="dm-field">' +
    '<button class="dm-icon-row-button" data-dm-corner-expand title="' + (cornerRadiusExpanded ? 'Collapse corners' : 'Edit each corner separately') + '" data-active="' + (cornerRadiusExpanded ? 'true' : 'false') + '" style="width:100%;">' +
    icon('scan', 14) + '</button></div>';
  const appearanceContent =
    grid12([
      { span: 5, content: opacityInput(s.opacity || '1') },
      { span: 5, content: cornerRadiusUniformField(s) },
      { span: 2, content: cornerExpandRowBtn },
    ]) + sp() +
    (cornerRadiusExpanded ? cornerRadius2x2(s) + sp() : '') +
    advancedDisclosure('appearance', appearanceAdvOpen,
      // Blend mode + isolation live up here in Advanced. They drive
      // stacking-context behaviour rather than visual style, so they
      // belong with the other context-y controls (visibility, pointer
      // events, etc.) rather than the always-visible top row.
      sub('Blend + stacking') +
      grid12([
        { span: 8, content: sel('Blend', 'mixBlendMode', s.mixBlendMode || 'normal', ['normal','multiply','screen','overlay','darken','lighten','color-dodge','color-burn','hard-light','soft-light','difference','exclusion','hue','saturation','color','luminosity','plus-lighter']) },
        { span: 4, content: isolationBtn },
      ]) + sp() +

      // Color adjust is a quick-toggle UI on top of the standard CSS
      // `filter` property — each button toggles one function (e.g.
      // `brightness(120%)`) on or off in the filter chain. The raw
      // "Filter" input is the same property surfaced as text so users
      // can type custom values like `blur(4px) saturate(150%)`. Both
      // moved here from the always-visible block: filters are
      // occasional-use, not the daily look-and-feel controls (opacity,
      // corner radius) that earn their seat at the top.
      '<div title="Quick toggles for individual filter functions (brightness, contrast, saturate, etc.). Edits the same CSS property as the raw Filter input below.">' + sub('Color adjust (filter quick toggles)') + colorAdjustRow + '</div>' + sp() +
      '<div title="Raw value for the CSS `filter` shorthand — type custom filters here (e.g. blur(4px) saturate(150%)). Mirrors the toggles above.">' + inp('Filter (raw value)', 'filter', s.filter || 'none', '') + '</div>' + sp() +

      sub('Visibility & cursor') +
      grid12([
        { span: 6, content: sel('Visible', 'visibility', s.visibility || 'visible', ['visible','hidden','collapse']) },
        { span: 6, content: sel('Cursor', 'cursor', s.cursor || 'auto', ['auto','default','pointer','text','move','grab','grabbing','not-allowed','crosshair','wait','help','zoom-in','zoom-out','col-resize','row-resize','n-resize','s-resize','e-resize','w-resize','ne-resize','nw-resize','se-resize','sw-resize','none']) },
      ]) + sp() +
      grid12([
        { span: 6, content: sel('Color scheme', 'colorScheme', (s as any).colorScheme || 'normal', ['normal','light','dark','light dark','only light','only dark']) },
        { span: 6, content: sel('Forced colors', 'forcedColorAdjust', (s as any).forcedColorAdjust || 'auto', ['auto','none','preserve-parent-color']) },
      ]) + sp() +

      sub('Interaction') +
      grid12([
        { span: 4, content: sel('Pointer events', 'pointerEvents', s.pointerEvents || 'auto', ['auto','none','all']) },
        { span: 4, content: sel('User select', 'userSelect', s.userSelect || 'auto', ['auto','none','text','all','contain']) },
        { span: 4, content: sel('Appearance', 'appearance', (s as any).appearance || 'auto', ['auto','none','textfield','menulist-button','searchfield','textarea','push-button','slider-horizontal','checkbox','radio','square-button','menulist','listbox','meter','progress-bar','button','button-bevel']) },
      ]) + sp() +

      // Form-control colours \u2014 only meaningful on form layers, but harmless
      // elsewhere (the property cascades but has no effect without a native
      // control). We surface them only for form layers to keep the panel
      // honest about scope.
      (isFormLayer ?
        sub('Form colours') +
        grid12([
          { span: 6, content: colorInp('Accent', 'accentColor', (s as any).accentColor || 'auto') },
          { span: 6, content: colorInp('Caret', 'caretColor', (s as any).caretColor || 'auto') },
        ]) + sp()
      : '') +

      sub('Backdrop adjust (backdrop-filter)') +
      backdropAdjustRow + sp() +
      inp('Backdrop filter', 'backdropFilter', (s as any).backdropFilter || 'none', '') + sp() +

      sub('Clip path') +
      (() => {
        const cp = parseClipPath((s as any).clipPath || 'none');
        const shapeRow = grid12([
          { span: 6, content: sel('Shape', '__clippath_shape', cp.kind, ['none','inset','circle','ellipse','polygon','path','url','custom']) },
          { span: 6, content: inp('Raw', 'clipPath', (s as any).clipPath || 'none', '') },
        ]);
        let fields = '';
        if (cp.kind === 'inset') {
          fields = grid12([
            { span: 3, content: inp('Top', '__clippath_inset_top', cp.top) },
            { span: 3, content: inp('Right', '__clippath_inset_right', cp.right) },
            { span: 3, content: inp('Bottom', '__clippath_inset_bottom', cp.bottom) },
            { span: 3, content: inp('Left', '__clippath_inset_left', cp.left) },
          ]);
        } else if (cp.kind === 'circle') {
          fields = grid12([
            { span: 4, content: inp('Radius', '__clippath_circle_r', cp.r) },
            { span: 4, content: inp('Center X', '__clippath_circle_x', cp.x) },
            { span: 4, content: inp('Center Y', '__clippath_circle_y', cp.y) },
          ]);
        } else if (cp.kind === 'ellipse') {
          fields = grid12([
            { span: 3, content: inp('Rx', '__clippath_ellipse_rx', cp.rx) },
            { span: 3, content: inp('Ry', '__clippath_ellipse_ry', cp.ry) },
            { span: 3, content: inp('X', '__clippath_ellipse_x', cp.x) },
            { span: 3, content: inp('Y', '__clippath_ellipse_y', cp.y) },
          ]);
        } else if (cp.kind === 'polygon') {
          // Per-vertex X / Y inputs replace the comma-list text. Each
          // vertex carries a remove button; an Add vertex button appends
          // a new pair seeded at 50% 50%.
          const pairs = cp.points.split(',').map(p => p.trim()).filter(Boolean);
          const vertexRows = pairs.map((pair, i) => {
            const m = pair.match(/^(\S+)\s+(\S+)$/);
            const xv = m ? m[1] : pair;
            const yv = m ? m[2] : '';
            return '<div style="display:grid;grid-template-columns:24px 1fr 1fr 24px;gap:6px;align-items:end;">' +
              '<div style="font-size:9px;color:var(--dm-text-dim);font-family:SF Mono,Monaco,monospace;padding-bottom:6px;text-align:right;">' + (i + 1) + '</div>' +
              inp('X', '__clippath_polygon_x_' + i, xv, '') +
              inp('Y', '__clippath_polygon_y_' + i, yv, '') +
              '<button class="dm-section-action" data-dm-clippath-polygon-remove="' + i + '" title="Remove vertex" style="height:28px;color:var(--dm-danger);">' + icon('trash', 11) + '</button>' +
              '</div>';
          }).join('<div style="height:4px;"></div>');
          const addBtn = '<button class="dm-btn" data-dm-clippath-polygon-add style="width:100%;padding:6px;font-size:10px;display:flex;align-items:center;gap:4px;justify-content:center;">' + icon('plus', 11) + ' Add vertex</button>';
          fields = sub('Vertices') + (vertexRows || '<div style="font-size:10px;color:var(--dm-text-dim);">No vertices yet — click Add vertex to start.</div>') + sp() + addBtn;
        } else if (cp.kind === 'path') {
          fields = grid12([
            { span: 12, content: inp('SVG path d', '__clippath_path', cp.d, '') },
          ]);
        } else if (cp.kind === 'url') {
          fields = grid12([
            { span: 12, content: inp('Fragment id (#…)', '__clippath_url', cp.target, '') },
          ]);
        }
        // Live preview — small SVG sketch of the current shape so the user
        // sees what they're cutting. Renders for the four shape kinds we
        // have geometry for (inset / circle / ellipse / polygon).
        const previewSvg = (() => {
          if (cp.kind === 'none' || cp.kind === 'custom' || cp.kind === 'url' || cp.kind === 'path') return '';
          const W = 80, H = 60;
          let shape = '';
          const pct = (v: string, axis: 'x' | 'y'): number => {
            const t = (v || '').trim();
            if (t.endsWith('%')) return parseFloat(t) / 100;
            return parseFloat(t) || 0;
          };
          if (cp.kind === 'inset') {
            const t = pct(cp.top, 'y') * H;
            const r = pct(cp.right, 'x') * W;
            const b = pct(cp.bottom, 'y') * H;
            const l = pct(cp.left, 'x') * W;
            shape = '<rect x="' + l + '" y="' + t + '" width="' + (W - l - r) + '" height="' + (H - t - b) + '" fill="rgba(79,158,255,0.25)" stroke="var(--dm-accent)" stroke-width="1" />';
          } else if (cp.kind === 'circle') {
            const cx = pct(cp.x, 'x') * W;
            const cy = pct(cp.y, 'y') * H;
            const r = Math.min(W, H) / 2 * pct(cp.r, 'x');
            shape = '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="rgba(79,158,255,0.25)" stroke="var(--dm-accent)" stroke-width="1" />';
          } else if (cp.kind === 'ellipse') {
            const cx = pct(cp.x, 'x') * W;
            const cy = pct(cp.y, 'y') * H;
            const rx = W / 2 * pct(cp.rx, 'x');
            const ry = H / 2 * pct(cp.ry, 'y');
            shape = '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="rgba(79,158,255,0.25)" stroke="var(--dm-accent)" stroke-width="1" />';
          } else if (cp.kind === 'polygon') {
            const pts = cp.points.split(',').map(p => p.trim()).filter(Boolean).map(pair => {
              const m = pair.match(/^(\S+)\s+(\S+)$/);
              if (!m) return '';
              return (pct(m[1], 'x') * W) + ',' + (pct(m[2], 'y') * H);
            }).filter(Boolean).join(' ');
            shape = pts ? '<polygon points="' + pts + '" fill="rgba(79,158,255,0.25)" stroke="var(--dm-accent)" stroke-width="1" />' : '';
          }
          return '<div style="display:flex;align-items:center;gap:8px;margin-top:6px;">' +
            '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" style="background:var(--dm-bg-secondary);border:1px solid var(--dm-separator);border-radius:4px;">' +
            '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="transparent" stroke="var(--dm-separator)" stroke-dasharray="2 2" stroke-width="1"/>' +
            shape + '</svg>' +
            '<span style="font-size:9px;color:var(--dm-text-dim);">Live preview · 80×60 reference box</span>' +
            '</div>';
        })();
        return shapeRow + (fields ? sp() + fields : '') + previewSvg;
      })() + sp() +

      sub('Scrollbars') +
      grid12([
        { span: 6, content: sel('Width', 'scrollbarWidth', (s as any).scrollbarWidth || 'auto', ['auto','thin','none']) },
        { span: 6, content: sel('Gutter', 'scrollbarGutter', (s as any).scrollbarGutter || 'auto', ['auto','stable','stable both-edges']) },
      ]) + sp() +
      grid12([
        { span: 12, content: inp('Color (thumb track)', 'scrollbarColor', (s as any).scrollbarColor || 'auto', '') },
      ]) + sp() +

      sub('Performance') +
      grid12([
        { span: 4, content: sel('Contain', 'contain', (s as any).contain || 'none', ['none','strict','content','size','layout','style','paint','inline-size','size layout','size paint','size style','layout paint','layout style']) },
        { span: 4, content: sel('Content vis.', 'contentVisibility', (s as any).contentVisibility || 'visible', ['visible','auto','hidden']) },
        { span: 4, content: inp('Will change', 'willChange', (s as any).willChange || 'auto', '') },
      ])
    );

  // Fill content \u2014 Figma-style layered list. Each layer is one row; the
  // settings (sliders) icon expands a per-layer body underneath. State is
  // owned by `fillLayersByElement` once the user has made any edit; until
  // then we read fresh from CSS.
  const fillElId = info?.id || '';
  const fillLayers = fillElId ? getFillLayers(fillElId, s) : parseFillLayers(s);

  // Visual swatch \u2014 gradient/image use the raw CSS as the swatch background.
  const fillSwatch = (l: FillLayer): string => {
    const bg = l.kind === 'image' ? l.raw + ' center/cover' : l.raw;
    return '<span style="width:18px;height:18px;border-radius:3px;border:1px solid var(--dm-separator);background:' + escapeAttr(bg) + ';flex-shrink:0;display:inline-block;"></span>';
  };
  const fillLabel = (l: FillLayer): string => {
    if (l.kind === 'solid') return l.raw;
    if (l.kind === 'image') {
      const m = l.raw.match(/url\((['"]?)([^'")]+)\1\)/);
      const url = m ? m[2] : l.raw;
      return 'image \u2014 ' + (url.length > 36 ? '\u2026' + url.slice(-33) : url);
    }
    // gradient \u2014 strip the leading function name + ( so the label shows the angle/stops
    return l.kind + ' \u2014 ' + l.raw.replace(/^[^(]+\(/, '').replace(/\)\s*$/, '').slice(0, 40);
  };

  const fillRows = fillLayers.map((layer, idx) => {
    // Solid fills use the inline Figma-style row (swatch / code /
    // opacity / eye / trash) with the colour panel rendered directly
    // below when the swatch is clicked. Non-solid layers keep the
    // settings-icon flow so users can edit gradient stops / image URLs
    // / position / blend without crowding the resting row.
    if (layer.kind === 'solid') return renderFillSolidRow(layer, idx);
    const expanded = expandedFillIdx === idx;
    const body = expanded ? renderFillLayerBody(layer, idx) : '';
    return renderFillRow(layer, idx, fillSwatch(layer), fillLabel(layer), expanded, body);
  }).join('');

  // Add Fill \u2014 split button. The primary action always creates a solid
  // fill (the common case) so users don't have to pick a type at
  // creation time; the small caret on the right opens the alternative
  // types (gradients / image) for the niche cases. Mirrors Figma's
  // "+" workflow. Caps at FILL_LIMIT total layers \u2014 beyond that the
  // user is hitting a hard ceiling, not a layout problem.
  const fillAtLimit = fillLayers.length >= FILL_LIMIT;
  const addTypeBtn = (kindAttr: string, lbl: string, glyph: string): string =>
    '<button class="dm-btn" data-dm-fill-add="' + kindAttr + '" style="flex:1;padding:8px 6px;font-size:11px;display:flex;flex-direction:column;align-items:center;gap:4px;">' +
    '<span style="width:24px;height:14px;border-radius:3px;background:' + glyph + ';border:1px solid rgba(0,0,0,0.12);"></span>' +
    '<span>' + lbl + '</span></button>';
  const addFillMenu = fillAddOpen
    ? '<div style="display:flex;gap:6px;margin-top:6px;">' +
        addTypeBtn('linear', 'Linear', 'linear-gradient(90deg, #fff, #000)') +
        addTypeBtn('radial', 'Radial', 'radial-gradient(circle, #fff, #000)') +
        addTypeBtn('conic',  'Conic',  'conic-gradient(from 0deg, #fff, #000, #fff)') +
        addTypeBtn('image',  'Image',  'repeating-linear-gradient(45deg, #ddd 0 4px, #fff 4px 8px)') +
      '</div>'
    : '';
  const addFillBtn = '<div style="display:flex;gap:4px;margin-top:6px;">' +
    '<button class="dm-btn" data-dm-fill-add="solid"' + (fillAtLimit ? ' disabled aria-disabled="true" title="Fill limit reached (' + FILL_LIMIT + ')"' : ' title="Add a solid fill (click the caret for gradient / image)"') + ' style="flex:1;display:flex;align-items:center;gap:6px;padding:8px;justify-content:center;' + (fillAtLimit ? 'opacity:0.5;cursor:not-allowed;' : '') + '">' +
    icon('plus', 12) + '<span>Add fill</span></button>' +
    '<button class="dm-btn" data-dm-fill-add-open data-active="' + (fillAddOpen ? 'true' : 'false') + '"' + (fillAtLimit ? ' disabled aria-disabled="true"' : '') + ' title="Add a gradient or image fill" style="padding:8px 10px;display:flex;align-items:center;justify-content:center;' + (fillAtLimit ? 'opacity:0.5;cursor:not-allowed;' : '') + '">' +
    icon(fillAddOpen ? 'x' : 'chevronDown', 12) + '</button>' +
    '</div>';

  // Fill Advanced \u2014 clip / origin / attachment + the gradient-text preset
  // and the mask-* family (CSS masks are the natural home for fill-shaped
  // alpha cutouts; Figma collapses this into "Use as mask" but the CSS
  // surface area is its own thing).
  const fillAdvancedHtml = advancedDisclosure('fill', fillAdvOpen,
    sub('Background painting box') +
    grid12([
      { span: 6, content: sel('Clip', 'backgroundClip', (s as any).backgroundClip || 'border-box', ['border-box','padding-box','content-box','text']) },
      { span: 6, content: sel('Origin', 'backgroundOrigin', (s as any).backgroundOrigin || 'padding-box', ['border-box','padding-box','content-box']) },
    ]) + sp() +
    grid12([
      { span: 6, content: sel('Attachment', 'backgroundAttachment', s.backgroundAttachment || 'scroll', ['scroll','fixed','local']) },
      { span: 6, content: '<div class="dm-field"><label class="dm-field-label dm-field-label-hidden">_</label><button class="dm-btn" data-dm-fill-action="gradient-text" title="Sets background-clip:text + -webkit-text-fill-color:transparent so the topmost gradient/image fills the glyph shape" style="height:30px;font-size:11px;">Gradient text</button></div>' },
    ]) + sp() +

    sub('Mask') +
    grid12([
      { span: 12, content: inp('Image', 'maskImage', (s as any).maskImage || 'none', '') },
    ]) + sp() +
    grid12([
      { span: 6, content: sel('Mode', 'maskMode', (s as any).maskMode || 'match-source', ['match-source','alpha','luminance']) },
      { span: 6, content: sel('Composite', 'maskComposite', (s as any).maskComposite || 'add', ['add','subtract','intersect','exclude']) },
    ]) + sp() +
    grid12([
      { span: 6, content: sel('Repeat', 'maskRepeat', (s as any).maskRepeat || 'repeat', ['repeat','no-repeat','repeat-x','repeat-y','space','round']) },
      { span: 6, content: inp('Size', 'maskSize', (s as any).maskSize || 'auto', '') },
    ]) + sp() +
    grid12([
      { span: 6, content: inp('Position', 'maskPosition', (s as any).maskPosition || '0% 0%', '') },
      { span: 6, content: sel('Origin', 'maskOrigin', (s as any).maskOrigin || 'border-box', ['border-box','padding-box','content-box','margin-box','fill-box','stroke-box','view-box']) },
    ]) + sp() +
    grid12([
      { span: 12, content: sel('Clip', 'maskClip', (s as any).maskClip || 'border-box', ['border-box','padding-box','content-box','margin-box','fill-box','stroke-box','view-box','no-clip']) },
    ])
  );

  // SVG paint editor — for `kind: 'svg'` the box's `background-*` is rarely
  // what the designer wants; the SVG's own `fill` / `fill-opacity` /
  // `fill-rule` paint the path. Surface those instead.
  const svgPaintHtml = (kind === 'svg') ? (
    sub('SVG paint') +
    grid12([
      { span: 6, content: colorInp('Fill', 'fill', (s as any).fill || '#000000') },
      { span: 6, content: inp('Opacity', 'fillOpacity', (s as any).fillOpacity || '1', '') },
    ]) + sp() +
    grid12([
      { span: 12, content: sel('Fill rule', 'fillRule', (s as any).fillRule || 'nonzero', ['nonzero','evenodd']) },
    ]) + sp() +
    sub('SVG stroke') +
    grid12([
      { span: 6, content: colorInp('Color', 'stroke', (s as any).stroke || 'none') },
      { span: 6, content: inp('Width', 'strokeWidth', (s as any).strokeWidth || '1', '') },
    ]) + sp() +
    grid12([
      { span: 6, content: sel('Linecap', 'strokeLinecap', (s as any).strokeLinecap || 'butt', ['butt','round','square']) },
      { span: 6, content: sel('Linejoin', 'strokeLinejoin', (s as any).strokeLinejoin || 'miter', ['miter','round','bevel']) },
    ]) + sp() +
    grid12([
      { span: 6, content: inp('Dash array', 'strokeDasharray', (s as any).strokeDasharray || 'none', '') },
      { span: 6, content: inp('Dash offset', 'strokeDashoffset', (s as any).strokeDashoffset || '0', '') },
    ]) + sp() + sp()
  ) : '';

  const fillContent =
    svgPaintHtml +
    (fillRows || '<div style="font-size:11px;color:var(--dm-text-dim);text-align:center;padding:14px 0;">No fills yet. Click "Add fill" to start.</div>') +
    addFillBtn + addFillMenu + sp() + fillAdvancedHtml;

  // Stroke content \u2014 single stroke per position. The Inside/Outside/Center
  // selector picks where the stroke renders. Below it: color (6) + weight
  // (2) + style (3) + square (1) on a 12-col grid. The square icon expands
  // a 2\u00D72 of per-side widths (border-*-width) \u2014 only meaningful for
  // Outside (CSS doesn't support per-side outline / inset shadow), but
  // still surfaced for storage.
  // Multi-stroke layered model \u2014 derive layers from per-element state (or
  // seed from current CSS). `activeStrokeIdx` selects which layer the
  // primary controls operate on.
  const strokeElId = info?.id || '';
  const strokeLayers = strokeElId ? getStrokeLayers(strokeElId, s, strokePos) : [];
  const isMultiStroke = strokeLayers.length >= 2;
  const safeActiveIdx = Math.min(Math.max(0, activeStrokeIdx), Math.max(0, strokeLayers.length - 1));
  const activeLayer = strokeLayers[safeActiveIdx];

  // Primary controls read from the active layer. When the layer list is
  // empty (no stroke set in this position), default to black at 0 so the
  // user starts from a neutral state rather than the page's currentColor.
  const strokeWeight = activeLayer ? activeLayer.weight : 0;
  const strokeColor = activeLayer ? activeLayer.color : '#000000';
  // Read user's chosen style from the in-memory map first, fall back to
  // the active mode's CSS. The map keeps the dashed panel correct even
  // in Inside mode (which can't render dashed visually).
  const intentStyle = strokeElId ? strokeStyleByElement.get(strokeElId) : undefined;
  const cssStyle = strokePos === 'center'
    ? (s.outlineStyle && s.outlineStyle !== 'none' ? s.outlineStyle : 'solid')
    : (s.borderTopStyle && s.borderTopStyle !== 'none' ? s.borderTopStyle : 'solid');
  const strokeStyleCur = intentStyle || cssStyle;

  // Stroke color picker: clicking the swatch toggles a panel that renders
  // BELOW the entire stroke row (not inside the 4-col cell). Pass
  // omitPanel:true so colorInp produces just the swatch+input row.
  const strokeColorPanelOpen = activeColorPickerProp === '__stroke_color';
  // Style is only meaningful for Center mode. Center writes outline-style
  // which natively supports dashed / dotted / double / groove / ridge /
  // inset / outset / hidden / auto. Outside and Inside render via the
  // CSS box-shadow chain, and box-shadow has no style \u2014 shadows are
  // always solid filled rectangles. So we surface the field only when
  // it actually controls something.
  const styleOptions = ['solid','dashed','dotted','double','groove','ridge','inset','outset','hidden','none','auto'];
  // Center is single-stroke (CSS outline can't stack). Keep the original
  // Color + Weight + Style row + outline-offset.
  const centerStrokeRow = grid12([
    { span: 4, content: colorInp('Color', '__stroke_color', strokeColor, true) },
    { span: 2, content: inp('Weight', '__stroke_weight', strokeWeight + 'px') },
    { span: 6, content: sel('Style', '__stroke_style', strokeStyleCur, styleOptions) },
  ]);
  const centerColorPanel = strokeColorPanelOpen ? sp() + renderColorPanel('__stroke_color', strokeColor) : '';

  // Outline-offset control — only meaningful in Center mode. Negative
  // values pull the outline inward (toward the box edge); positive push
  // it outward. Helper text lives inside the label parens so the field
  // can use the full 12-column row instead of stealing half for a chip.
  const offsetRow = sp() + grid12([
    { span: 12, content: inp('Outline offset (negative pulls inward)', 'outlineOffset', s.outlineOffset || '0px') },
  ]);

  // Outside / Inside render one row per stroke layer (mirrors the Fill
  // section's per-row pattern). Each row owns its swatch, colour-code,
  // weight input, eye toggle and trash; the swatch click reveals the
  // colour panel inline beneath that specific row. Center bypasses the
  // list entirely — its single outline pair stays in the primary row.
  const renderStrokeLayerRow = (layer: StrokeLayer, idx: number): string => {
    const visible = layer.visible !== false;
    const colorProp = '__stroke_color__' + idx;
    const swatchOpen = activeColorPickerProp === colorProp;
    const swatchBg = resolveCssVarToColor(layer.color) || layer.color || '#000';
    const codeDisplay = formatColorForDisplay(layer.color);
    const swatchBtn = '<button type="button" class="dm-fill-swatch" data-dm-color-trigger="' + colorProp + '" title="Pick a colour" style="background:' + safeCssColor(swatchBg) + ';outline:' + (swatchOpen ? '2px solid var(--dm-accent)' : 'none') + ';outline-offset:1px;"></button>';
    const codeInput = '<input type="text" class="dm-fill-code" data-dm-prop="' + colorProp + '" data-dm-tokens-trigger="' + colorProp + '" value="' + escapeAttr(codeDisplay) + '" spellcheck="false" autocomplete="off"/>';
    // Weight input — replaces the fill-row Opacity cell. Locked-`px`
    // suffix mirrors Opacity's locked-`%` so the row reads as one unit.
    const weightProp = '__stroke_weight__' + idx;
    const weightCell =
      '<div class="dm-fill-opacity">' +
      '<input type="text" class="dm-input dm-input-bare" data-dm-prop="' + weightProp + '" data-dm-numeric="1" data-dm-unit="px" inputmode="decimal" value="' + (Math.round(layer.weight * 10) / 10) + '"/>' +
      '<span class="dm-input-unit">px</span>' +
      '</div>';
    const eyeBtn = '<button class="dm-fill-action dm-fill-action-hover" data-dm-stroke-toggle="' + idx + '" title="' + (visible ? 'Hide stroke' : 'Show stroke') + '" data-active="' + (visible ? 'true' : 'false') + '">' + icon(visible ? 'eye' : 'eyeOff', 12) + '</button>';
    const trashBtn = '<button class="dm-fill-action dm-fill-action-hover" data-dm-stroke-remove="' + idx + '" title="Remove stroke" style="color:var(--dm-danger);">' + icon('trash', 12) + '</button>';
    const grip = '<span class="dm-section-action" data-dm-stroke-drag="' + idx + '" title="Drag to reorder" style="cursor:grab;flex-shrink:0;">' + icon('gripVertical', 12) + '</span>';
    const row = '<div class="dm-fill-row-solid">' + grip + swatchBtn + codeInput + weightCell + eyeBtn + trashBtn + '</div>';
    const colorPanel = swatchOpen ? renderColorPanel(colorProp, layer.color) : '';
    return '<div data-dm-stroke-row="' + idx + '" draggable="true" style="margin-bottom:6px;">' + row + colorPanel + '</div>';
  };
  const strokeRowsHtml = strokeLayers.map(renderStrokeLayerRow).join('');

  // Add-stroke button is Outside / Inside only — Center is single-stroke
  // (CSS outline can't stack), so hiding the button there is more honest
  // than showing it disabled. Hide also at STROKE_LIMIT.
  const atStrokeLimit = strokeLayers.length >= STROKE_LIMIT;
  const showAddStroke = strokePos !== 'center' && !atStrokeLimit;
  const addStrokeBtn = showAddStroke
    ? '<button class="dm-btn" data-dm-stroke-add title="Add another stroke on top" style="margin-top:8px;display:flex;align-items:center;gap:6px;padding:8px;width:100%;justify-content:center;">' +
        icon('plus', 12) + '<span>Add stroke</span></button>'
    : '';

  const strokeContent = strokePos === 'center'
    ? strokePositionRow(s, strokePos) + sp() +
      centerStrokeRow +
      offsetRow +
      centerColorPanel
    : strokePositionRow(s, strokePos) + sp() +
      strokeRowsHtml +
      addStrokeBtn;

  // Effects \u2014 Figma-style layered list. Each entry is a discrete effect:
  // drop shadow / inner shadow / layer blur / background blur. The header
  // `+` opens the add-menu (already wired). Motion (transition / animation
  // / transform) lives as a separate subsection below since it doesn't
  // map to Figma's effect concept.
  const hasShadow = (s.boxShadow || 'none') !== 'none';
  // Distinguish stroke entries from drop/inner shadows so the Effects
  // section only surfaces the latter. A non-stroke box-shadow is something
  // with non-zero offset, blur, or spread.
  const shadowEntries = parseCssCommaList(s.boxShadow || '');
  const isStrokeEntry = (e: string): boolean => shadowEntryIsStroke(e);
  const isInsetEntry = (e: string): boolean => {
    const p = parseShadowEntry(e);
    return !!p && p.inset;
  };
  const hasDropShadow = shadowEntries.some(e => !isInsetEntry(e) && !isStrokeEntry(e));
  const hasInnerShadow = shadowEntries.some(e => isInsetEntry(e) && !isStrokeEntry(e));
  const hasTextShadow = (s.textShadow || 'none') !== 'none';
  const filterCanon = (s.filter || 'none').toLowerCase();
  const hasLayerBlur = /\bblur\(/.test(filterCanon);
  const hasBackdrop = /\bblur\(/.test((s.backdropFilter || '').toLowerCase());
  const hasTransition = (s.transition || 'none') !== 'none';
  const hasAnimation = (s.animation || 'none') !== 'none';
  const transformIsSet = (!!s.translate && s.translate !== 'none' && s.translate !== '0px 0px') ||
    (!!s.scale && s.scale !== 'none' && s.scale !== '1 1' && s.scale !== '1') ||
    (!!s.rotate && s.rotate !== '0deg' && s.rotate !== '0' && s.rotate !== 'none');

  // Layered effect list. Each box-shadow entry, each filter drop-shadow,
  // each blur, and the text-shadow each get their own row.
  const effectsElId = info?.id || '';
  const effectsIsText = kind === 'text';
  if (effectsElId) hydrateOverlayFromChanges(effectsElId);
  const effectEntries: EffectEntry[] = effectsElId ? parseEffects(s, effectsElId, effectsIsText) : [];
  const labelFor = (e: EffectEntry): string => {
    if (e.kind === 'drop-shadow' || e.kind === 'inner-shadow') {
      const sh = e.shadow;
      const insetMark = e.kind === 'inner-shadow' ? 'inset ' : '';
      const spreadSeg = (e.kind === 'inner-shadow' || (e.kind === 'drop-shadow' && e.chain === 'box')) && sh.spread
        ? ' ' + sh.spread : '';
      return insetMark + sh.x + ' ' + sh.y + ' ' + sh.blur + spreadSeg + ' \u00b7 ' + sh.color;
    }
    if (e.kind === 'noise') return e.mode + ' \u00b7 ' + e.density + '%';
    if (e.kind === 'texture') return 'r' + e.radius + ' \u00b7 ' + e.sizeX + '\u00d7' + e.sizeY;
    return (e as any).radius + 'px';
  };
  const titleFor = (e: EffectEntry): string => ({
    'drop-shadow':        'Drop shadow',
    'inner-shadow':       'Inner shadow',
    'layer-blur':         'Layer blur',
    'backdrop-blur':      'Background blur',
    'noise':              'Noise',
    'texture':            'Texture',
  } as Record<string, string>)[e.kind];
  const iconFor = (e: EffectEntry): keyof typeof icons => ({
    'drop-shadow':        'sparkles',
    'inner-shadow':       'squareStack',
    'layer-blur':         'eye',
    'backdrop-blur':      'panelRight',
    'noise':              'sparkles',
    'texture':            'sparkles',
  } as Record<string, keyof typeof icons>)[e.kind];
  const bodyFor = (e: EffectEntry): string => {
    if (e.kind === 'layer-blur' || e.kind === 'backdrop-blur') return renderBlurEntryEditor(e as any);
    if (e.kind === 'noise') return renderNoiseEntryEditor(e as any);
    if (e.kind === 'texture') return renderTextureEntryEditor(e as any);
    return renderShadowEntryEditor(e as any);
  };
  const effectRows = effectEntries.map((entry, idx) => {
    const swatch = '<span style="width:18px;height:18px;display:flex;align-items:center;justify-content:center;color:' + (entry.visible ? 'var(--dm-text-muted)' : 'var(--dm-text-dim)') + ';">' + icon(iconFor(entry), 14) + '</span>';
    const expanded = expandedEffectIdx === idx;
    // Layer blur / Background blur have just one knob (radius). Surface
    // it inline in the row instead of behind the settings expand, so
    // the row mirrors fill / stroke rows that show their primary value
    // up front. No expanded body needed since Progressive blur is
    // intentionally not supported.
    const isBlurRow = entry.kind === 'layer-blur' || entry.kind === 'backdrop-blur';
    const blurPrefix = entry.kind === 'layer-blur' ? '__effd_lblur_' : '__effd_bblur_';
    const blurMetaHtml = isBlurRow
      ? '<div style="display:flex;align-items:center;background:var(--dm-input-bg);border:1px solid var(--dm-input-border);border-radius:4px;padding:2px 4px;">' +
          '<input type="number" min="0" data-dm-prop="' + blurPrefix + entry.chainIdx + '_radius" value="' + (entry as any).radius + '" style="background:none;border:none;color:var(--dm-text);font-family:inherit;font-size:10px;width:36px;text-align:right;padding:2px;"/>' +
          '<span style="font-size:9px;color:var(--dm-text-dim);padding-left:2px;opacity:0.6;">px</span>' +
        '</div>'
      : undefined;
    const head = layeredRow({
      idx,
      prefix: 'effect',
      swatch,
      label: titleFor(entry),
      meta: isBlurRow ? undefined : labelFor(entry),
      metaHtml: blurMetaHtml,
      hideExpand: isBlurRow,
      visible: entry.visible,
      expanded,
      body: !isBlurRow && expanded ? bodyFor(entry) : '',
    });
    // Wrap with a draggable wrapper. `data-dm-effect-row` carries the row
    // index; drag-reorder is constrained to within the same chain so
    // moves across kinds are no-ops in the drop handler.
    return '<div data-dm-effect-row="' + idx + '" data-dm-effect-id="' + escapeAttr(entry.id) + '" data-dm-effect-chain="' + ((entry as any).chain || '') + '" draggable="true">' + head + '</div>';
  }).join('');

  // Motion subsection. Trigger-first interaction cards are the primary UI;
  // the raw transition / animation / transform / etc. editors move into an
  // Advanced disclosure for power users (Phase 5 absorption).
  const motionPieces: string[] = [];
  const motionRawPieces: string[] = [];
  // Interaction cards + the "When:" add-row (always rendered so a trigger
  // can be added even before any interaction exists).
  const motionElId = info?.id || '';
  const interactionsHtml = renderMotionInteractions(s, motionElId);
  if (interactionsHtml) motionPieces.push(interactionsHtml);
  if (hasTransition) motionRawPieces.push(
    '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;color:var(--dm-text-muted);"><span>' + icon('play', 12) + '</span><span style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;">Transition</span></div>' +
    renderTransitionEditor(s) +
    (vizProp === 'transition' ? renderVizPanel() : '')
  );
  if (hasAnimation) motionRawPieces.push(
    '<div style="display:flex;align-items:center;gap:6px;margin:10px 0 6px 0;color:var(--dm-text-muted);"><span>' + icon('film', 12) + '</span><span style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;">Animation</span></div>' +
    renderAnimationEditor(s)
  );
  if (transformIsSet) motionRawPieces.push(
    '<div style="display:flex;align-items:center;gap:6px;margin:10px 0 6px 0;color:var(--dm-text-muted);"><span>' + icon('move3d', 12) + '</span><span style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;">Transform</span></div>' +
    renderTransformComponents(s)
  );
  // Motion Path — animate an element along a custom path. Renders only
  // when at least one offset-* property is non-default; the + menu has a
  // "Motion path" preset that seeds it. CSS-native equivalent of SVG
  // <animateMotion>.
  const motionPathSet = (((s as any).offsetPath || 'none') !== 'none' && (s as any).offsetPath !== '');
  if (motionPathSet) motionRawPieces.push(
    '<div style="display:flex;align-items:center;gap:6px;margin:10px 0 6px 0;color:var(--dm-text-muted);"><span>' + icon('compass', 12) + '</span><span style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;">Motion path</span></div>' +
    grid12([
      { span: 12, content: inp('Path', 'offsetPath', (s as any).offsetPath || 'none', '') },
    ]) + sp() +
    grid12([
      { span: 6, content: inp('Distance', 'offsetDistance', (s as any).offsetDistance || '0%') },
      { span: 6, content: inp('Rotate', 'offsetRotate', (s as any).offsetRotate || 'auto', '') },
    ]) + sp() +
    grid12([
      { span: 6, content: inp('Anchor', 'offsetAnchor', (s as any).offsetAnchor || 'auto', '') },
      { span: 6, content: inp('Position', 'offsetPosition', (s as any).offsetPosition || 'auto', '') },
    ]) + sp() +
    '<div style="display:flex;justify-content:flex-end;"><button class="dm-btn" data-dm-effect-action="clear-motion-path" title="Clear motion path" style="padding:3px 8px;font-size:9px;">Clear motion path</button></div>'
  );

  // View transition — bridges the View Transitions API. Renders when the
  // user has set a name or class. The View Transitions API only takes
  // effect when the page calls `document.startViewTransition(...)`; the
  // CSS properties themselves are static metadata for the browser to use
  // during that call.
  const vtName = ((s as any).viewTransitionName || 'none').trim();
  const vtClass = ((s as any).viewTransitionClass || 'none').trim();
  const viewTransitionSet = vtName !== 'none' && vtName !== '' || vtClass !== 'none' && vtClass !== '';
  if (viewTransitionSet) motionRawPieces.push(
    '<div style="display:flex;align-items:center;gap:6px;margin:10px 0 6px 0;color:var(--dm-text-muted);"><span>' + icon('shuffle', 12) + '</span><span style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;">View transition</span></div>' +
    grid12([
      { span: 6, content: inp('Name', 'viewTransitionName', vtName === 'none' ? '' : vtName, '') },
      { span: 6, content: inp('Class', 'viewTransitionClass', vtClass === 'none' ? '' : vtClass, '') },
    ]) + sp() +
    '<div style="font-size:10px;color:var(--dm-text-dim);font-style:italic;">Active only during <code style="font-family:SF Mono,monospace;">document.startViewTransition()</code> calls. Set a unique <code>name</code> per element you want to animate across DOM swaps.</div>' + sp() +
    '<div style="display:flex;justify-content:flex-end;"><button class="dm-btn" data-dm-effect-action="clear-view-transition" title="Clear view-transition properties" style="padding:3px 8px;font-size:9px;">Clear view transition</button></div>'
  );

  // Scroll-driven animations. CSS-native scroll / view timelines that
  // bind an animation's progress to scroll position rather than time.
  // Renders when any scroll/view-timeline property is non-default.
  const sdAnyTimeline = (((s as any).animationTimeline || 'auto') !== 'auto' && (s as any).animationTimeline !== '');
  const sdAnyScrollTl = (((s as any).scrollTimelineName || 'none') !== 'none' && (s as any).scrollTimelineName !== '');
  const sdAnyViewTl   = (((s as any).viewTimelineName || 'none') !== 'none' && (s as any).viewTimelineName !== '');
  const scrollDrivenSet = sdAnyTimeline || sdAnyScrollTl || sdAnyViewTl;
  if (scrollDrivenSet) motionRawPieces.push(
    '<div style="display:flex;align-items:center;gap:6px;margin:10px 0 6px 0;color:var(--dm-text-muted);"><span>' + icon('arrowUpDown', 12) + '</span><span style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;">Scroll-driven animation</span></div>' +
    sub('Animation timeline') +
    grid12([
      { span: 8, content: inp('Timeline', 'animationTimeline', (s as any).animationTimeline || 'auto', '') },
      { span: 4, content: inp('Range', 'animationRange', (s as any).animationRange || 'normal', '') },
    ]) + sp() +
    sub('Scroll-timeline source (this element scrolls)') +
    grid12([
      { span: 6, content: inp('Name', 'scrollTimelineName', (s as any).scrollTimelineName || 'none', '') },
      { span: 6, content: sel('Axis', 'scrollTimelineAxis', (s as any).scrollTimelineAxis || 'block', ['block','inline','x','y']) },
    ]) + sp() +
    sub('View-timeline source (this element\'s visibility)') +
    grid12([
      { span: 6, content: inp('Name', 'viewTimelineName', (s as any).viewTimelineName || 'none', '') },
      { span: 6, content: sel('Axis', 'viewTimelineAxis', (s as any).viewTimelineAxis || 'block', ['block','inline','x','y']) },
    ]) + sp() +
    grid12([
      { span: 12, content: inp('View-timeline inset', 'viewTimelineInset', (s as any).viewTimelineInset || 'auto', '') },
    ]) + sp() +
    grid12([
      { span: 12, content: inp('Timeline scope', 'timelineScope', (s as any).timelineScope || 'none', '') },
    ]) + sp() +
    '<div style="display:flex;justify-content:flex-end;gap:6px;">' +
      '<button class="dm-btn" data-dm-effect-action="preset-scroll-progress" title="Bind animation to root scroll progress" style="padding:3px 8px;font-size:9px;">Bind to page scroll</button>' +
      '<button class="dm-btn" data-dm-effect-action="clear-scroll-driven" title="Reset all scroll/view-timeline properties" style="padding:3px 8px;font-size:9px;">Clear</button>' +
    '</div>'
  );
  // Motion lives in its own section (rendered below Effects). Interaction
  // cards + the "When:" add-row are always present; the raw CSS editors sit
  // under an Advanced disclosure so the everyday surface stays simple.
  const motionAdvOpen = !!advancedOpen.motion;
  const motionAdvancedHtml = motionRawPieces.length
    ? advancedDisclosure('motion', motionAdvOpen,
        '<div style="font-size:9px;text-transform:uppercase;letter-spacing:0.5px;color:var(--dm-text-dim);margin-bottom:8px;">Advanced (raw CSS)</div>' +
        motionRawPieces.join(''))
    : '';
  const motionContent = motionPieces.join('') + motionAdvancedHtml;

  const effectsContent = effectEntries.length > 0
    ? effectRows
    : '<div style="font-size:11px;color:var(--dm-text-dim);text-align:center;padding:14px 0;">Click + to add an effect.</div>';

  // ── Layout guide ────────────────────────────────────────────────
  // Figma-style overlay of column / row / grid bars on the selected
  // element. Rows mirror Fill / Stroke but with a slimmer primary row:
  // grip + kind + count/size + expand + eye + trash. The expanded body
  // surfaces the type-specific fields — for columns/rows a 3×2 grid
  // (colour + opacity / align + size / margin + gutter); for grid just
  // a 1×2 (colour + opacity). The overlay is a `::before` pseudo
  // element written from the content script, never the change-tracker.
  const guideElId = info?.id || '';
  const guideLayers = getLayoutGuides(guideElId);
  const guidesSectionHidden = layoutGuidesSectionHidden.has(guideElId);
  const renderLayoutGuideRow = (layer: LayoutGuideLayer, idx: number): string => {
    const visible = layer.visible !== false;
    const colorProp = '__guide_color__' + idx;
    const swatchOpen = activeColorPickerProp === colorProp;
    const swatchBg = resolveCssVarToColor(layer.color) || layer.color || '#000';
    const codeDisplay = formatColorForDisplay(layer.color);
    const expanded = expandedGuideIdx === idx;
    // Primary row — slim: Type + Count/Size + expand + eye + trash.
    const grip = '<span class="dm-section-action" data-dm-guide-drag="' + idx + '" title="Drag to reorder" style="cursor:grab;flex-shrink:0;">' + icon('gripVertical', 12) + '</span>';
    const kindSel = '<select class="dm-select" data-dm-prop="__guide_kind__' + idx + '" style="flex:1;min-width:0;font-size:11px;">' +
      ['grid','columns','rows'].map(k => '<option value="' + k + '"' + (layer.kind === k ? ' selected' : '') + '>' + k.charAt(0).toUpperCase() + k.slice(1) + '</option>').join('') +
      '</select>';
    // Count for columns/rows, Size for grid (label-less compact input).
    const countOrSizeProp = layer.kind === 'grid' ? '__guide_size__' + idx : '__guide_count__' + idx;
    const countOrSizeVal = layer.kind === 'grid' ? (layer.size || '8') : String(layer.count);
    const countOrSizeUnit = layer.kind === 'grid' ? 'px' : '';
    const countOrSizeInput =
      '<div class="dm-fill-opacity" title="' + (layer.kind === 'grid' ? 'Cell size' : 'Count') + '">' +
      '<input type="text" class="dm-input dm-input-bare" data-dm-prop="' + countOrSizeProp + '" data-dm-numeric="1" data-dm-unit="' + countOrSizeUnit + '" inputmode="decimal" value="' + escapeAttr(countOrSizeVal) + '"/>' +
      (countOrSizeUnit ? '<span class="dm-input-unit">' + countOrSizeUnit + '</span>' : '') +
      '</div>';
    const expandBtn = '<button class="dm-fill-action" data-dm-guide-expand="' + idx + '" title="' + (expanded ? 'Collapse settings' : 'Settings') + '" data-active="' + (expanded ? 'true' : 'false') + '">' + icon('slidersHorizontal', 12) + '</button>';
    // Parent/child visibility, Figma-style: the layer only paints when the
    // section eye AND its own eye are on. With the section hidden the row's
    // eye still reflects (and edits) its own state, dimmed to show the
    // section gate is what's suppressing it.
    const eyeTitle = visible
      ? (guidesSectionHidden ? 'Hide guide (all guides currently hidden)' : 'Hide guide')
      : 'Show guide';
    const eyeBtn = '<button class="dm-fill-action" data-dm-guide-toggle="' + idx + '" title="' + eyeTitle + '" data-active="' + (visible ? 'true' : 'false') + '"' +
      (guidesSectionHidden ? ' style="opacity:0.4;"' : '') + '>' + icon(visible ? 'eye' : 'eyeOff', 12) + '</button>';
    const trashBtn = '<button class="dm-fill-action dm-fill-action-hover" data-dm-guide-remove="' + idx + '" title="Remove guide" style="color:var(--dm-danger);">' + icon('trash', 12) + '</button>';
    const primaryRow = '<div class="dm-fill-row-solid">' + grip + kindSel + countOrSizeInput + expandBtn + eyeBtn + trashBtn + '</div>';
    // Colour swatch + hex inline cell, used in the expanded body. Reuses
    // the fill row's solid pattern so the swatch / picker behaviour is
    // identical to the rest of the panel.
    const swatchBtn = '<button type="button" class="dm-fill-swatch" data-dm-color-trigger="' + colorProp + '" title="Pick a colour" style="background:' + safeCssColor(swatchBg) + ';outline:' + (swatchOpen ? '2px solid var(--dm-accent)' : 'none') + ';outline-offset:1px;"></button>';
    // No data-dm-tokens-trigger here, unlike Fill / Stroke: site-colour
    // tokens don't apply to a guide overlay, same reasoning as the compact
    // colour panel below.
    const codeInput = '<input type="text" class="dm-fill-code" data-dm-prop="' + colorProp + '" value="' + escapeAttr(codeDisplay) + '" spellcheck="false" autocomplete="off"/>';
    // Both cells share an explicit 32px min-height so the swatch row and
    // the opacity input land at exactly the same vertical extent in the
    // 3×2 / 1×2 expanded grids.
    const cellHeight = 'min-height:32px;box-sizing:border-box;';
    const colorCellInner = '<div style="display:flex;align-items:center;gap:6px;padding:4px 8px;background:var(--dm-input-bg);border:1px solid var(--dm-input-border);border-radius:5px;' + cellHeight + '">' + swatchBtn + codeInput + '</div>';
    const opacityCell =
      '<div class="dm-fill-opacity" style="width:100%;' + cellHeight + '">' +
      '<input type="text" class="dm-input dm-input-bare" data-dm-prop="__guide_opacity__' + idx + '" data-dm-numeric="1" data-dm-unit="" inputmode="decimal" value="' + Math.round(layer.opacity) + '"/>' +
      '<span class="dm-input-unit">%</span>' +
      '</div>';
    const colorPanel = swatchOpen ? renderColorPanel(colorProp, layer.color, true) : '';
    // Expanded body — 3×2 for columns/rows (colour+opacity, align+size,
    // margin+gutter); 1×2 for grid (colour+opacity).
    let body = '';
    if (expanded) {
      const sizeLabel = layer.kind === 'columns' ? 'Width' : layer.kind === 'rows' ? 'Height' : 'Cell size';
      const colorRow = grid12([
        { span: 6, content: colorCellInner },
        { span: 6, content: opacityCell },
      ]);
      if (layer.kind === 'grid') {
        body = colorRow;
      } else {
        const alignOpts = layer.kind === 'columns'
          ? ['stretch','left','center','right']
          : ['stretch','top','center','bottom'];
        body =
          colorRow + sp() +
          grid12([
            { span: 6, content: sel('Type', '__guide_align__' + idx, layer.align, alignOpts) },
            { span: 6, content: inp(sizeLabel, '__guide_size__' + idx, layer.size || 'auto') },
          ]) + sp() +
          grid12([
            { span: 6, content: inp('Margin', '__guide_margin__' + idx, layer.margin || '0px') },
            { span: 6, content: inp('Gutter', '__guide_gutter__' + idx, layer.gutter || '20px') },
          ]);
      }
      body = '<div style="margin-top:6px;padding:8px;background:var(--dm-bg);border:1px solid var(--dm-separator);border-radius:5px;">' + body + '</div>';
    }
    return '<div data-dm-guide-row="' + idx + '" draggable="true" style="margin-bottom:6px;">' + primaryRow + colorPanel + body + '</div>';
  };
  const guideRowsHtml = guideLayers.map(renderLayoutGuideRow).join('');
  const atGuideLimit = guideLayers.length >= LAYOUT_GUIDE_LIMIT;
  const addGuideBtn = atGuideLimit ? '' :
    '<button class="dm-btn" data-dm-guide-add title="Add layout guide" style="margin-top:8px;display:flex;align-items:center;gap:6px;padding:8px;width:100%;justify-content:center;">' +
    icon('plus', 12) + '<span>Add layout guide</span></button>';
  const layoutGuideContent = guideRowsHtml + addGuideBtn;
  // Section-level show/hide — drawn to the right of the section title,
  // before the chevron. Toggling clears or restores the overlay
  // immediately without touching the per-layer config in the panel.
  // Only earns its seat once there are 2+ guides: with one guide it would
  // duplicate that row's own eye. The hide flag is cleared below 2 layers
  // (see the remove handler) so it can never strand a guide invisible with
  // no visible control explaining why.
  const layoutGuideSectionActions = (guideElId && guideLayers.length >= 2)
    ? '<button class="dm-section-action" data-dm-guide-section-toggle title="' + (guidesSectionHidden ? 'Show all layout guides' : 'Hide all layout guides') + '" data-active="' + (guidesSectionHidden ? 'false' : 'true') + '">' + icon(guidesSectionHidden ? 'eyeOff' : 'eye', 12) + '</button>'
    : '';

  // Suppress unused (smart-defaults from old layout)
  void positionDefault; void hasEffects;

  return '<div style="overflow-x:hidden;">' + indicator +
    iconSection +
    // Media is only meaningful for actual media tags (img / video / audio /
    // svg / picture / etc.). On a `<body>` or generic container the
    // SP_GET_MEDIA response can come back with kind:"background" because
    // the element has a CSS background-image — that's a Fill, not a Media
    // layer, so don't surface a Media section there.
    ((kind === 'media' || kind === 'svg') ? renderMediaSection(displayInfo, s, isImg) : '') +
    (!vis.position ? '' : sec('Position', 'move', positionContent, true, advancedToggleBtn('position', !!advancedOpen.position))) +
    (!vis.layout ? '' : sec('Layout', 'layoutGrid', layoutContent, true, layoutActionsHtml)) +
    (!vis.appearance ? '' : sec('Appearance', 'droplet', appearanceContent, true, appearanceActionsHtml)) +
    typographySection +
    (!vis.fill ? '' : sec('Fill', 'palette', fillContent, true, fillActionsHtml)) +
    (!vis.stroke ? '' : sec('Stroke', 'squareDashed', strokeContent, true)) +
    (!vis.effects ? '' : sec('Effects', 'sparkles', effectsContent, true, effectsActionsHtml)) +
    (!vis.motion ? '' : sec('Motion', 'play', motionContent, false, motionActionsHtml)) +
    (!vis.layoutGuide ? '' : sec('Layout guide', 'layoutGrid', layoutGuideContent, true, layoutGuideSectionActions)) +
    '</div>';
}

/* ── Phase 4: Changes Tab (Grouped) ── */
function renderChangesTab(): string {
  type ChangeItem =
    | { type: 'style'; data: StyleChange; idx: number }
    | { type: 'text'; data: TextChange; idx: number }
    | { type: 'dom'; data: DomChange; idx: number }
    | { type: 'comment'; data: CommentEntry; idx: number }
    | { type: 'token'; data: { cssVar: string; scopeSelector: string; original: string; current: string; system?: string; selector: string; elementId: string }; idx: number };
  const allItemsRaw: ChangeItem[] = [
    ...styleChanges.map((c, idx) => ({ type: 'style' as const, data: c, idx })),
    ...textChanges.map((c, idx) => ({ type: 'text' as const, data: c, idx })),
    ...domChanges.map((c, idx) => ({ type: 'dom' as const, data: c, idx })),
    ...comments.map((c, idx) => ({ type: 'comment' as const, data: c, idx })),
    // Token edits group under a synthetic `:root` selector so they share one
    // "Design tokens" group header in the by-element view.
    ...tokenChanges.map((c, idx) => ({ type: 'token' as const, data: { ...c, selector: c.scopeSelector || ':root', elementId: '' }, idx })),
  ];
  // Compute the first-touched timestamp per group so the by-element sort
  // can keep all of an element's edits together while preserving relative
  // age across groups.
  const groupFirstTouch = new Map<string, number>();
  for (const it of allItemsRaw) {
    const k = (it.data as any).elementId || (it.data as any).selector || 'unknown';
    const ts = (it.data as any).timestamp || 0;
    const cur = groupFirstTouch.get(k);
    if (cur === undefined || ts < cur) groupFirstTouch.set(k, ts);
  }
  const sortItems = (a: ChangeItem, b: ChangeItem): number => {
    if (changesSort === 'newest') return ((b.data as any).timestamp || 0) - ((a.data as any).timestamp || 0);
    if (changesSort === 'element') {
      const ka = (a.data as any).elementId || (a.data as any).selector || 'unknown';
      const kb = (b.data as any).elementId || (b.data as any).selector || 'unknown';
      const ga = groupFirstTouch.get(ka) || 0;
      const gb = groupFirstTouch.get(kb) || 0;
      if (ga !== gb) return ga - gb;
      // Within a group, keep oldest-first.
      return ((a.data as any).timestamp || 0) - ((b.data as any).timestamp || 0);
    }
    return ((a.data as any).timestamp || 0) - ((b.data as any).timestamp || 0);
  };
  const allItems = [...allItemsRaw].sort(sortItems);

  if (allItems.length === 0) return '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:300px;color:var(--dm-text-dim);text-align:center;padding:40px;">' +
      '<div style="margin-bottom:12px;color:var(--dm-text-dimmer);">' + icon('sparkles', 32) + '</div>' +
      '<div style="font-size:12px;font-weight:500;color:var(--dm-text-muted);">No changes yet</div>' +
      '<div style="font-size:11px;margin-top:6px;color:var(--dm-text-dim);max-width:260px;line-height:1.5;">Edits you make on the page show up here, ready to copy as a prompt or send straight to your agent. Picking up where you left off? Import a previously exported JSON.</div>' +
      // Import button mirrors the one in the populated-state action row,
      // so first-time + empty-state users can pull a saved session in
      // without any prior context.
      '<label title="Replace every change with an imported JSON file" style="margin-top:14px;padding:6px 12px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:6px;color:var(--dm-text-secondary);cursor:pointer;font-size:10px;font-family:inherit;display:inline-flex;align-items:center;gap:6px;">' +
      icon('upload', 11) + ' Import changes' +
      '<input type="file" accept=".json,application/json" data-dm-import-changes style="display:none;"/></label>' +
    '</div>';

  // Apply filter (kind chips) and search (selector / property / value / text).
  const q = changesSearch.trim().toLowerCase();
  const matches = (item: ChangeItem): boolean => {
    if (changesFilter !== 'all' && item.type !== changesFilter) return false;
    // Comments sub-filter — narrows to open or resolved only when the user
    // has the resolved-filter set. Non-comment items always pass.
    if (item.type === 'comment' && commentsResolvedFilter !== 'all') {
      const r = !!(item.data as any).resolved;
      if (commentsResolvedFilter === 'open' && r) return false;
      if (commentsResolvedFilter === 'resolved' && !r) return false;
    }
    // Status sub-filter — narrows style/text/DOM items by the agent-driven
    // status. Comments (filtered above) and tokens always pass.
    if (changesStatusFilter !== 'all' && (item.type === 'style' || item.type === 'text' || item.type === 'dom')) {
      if (((item.data as any).status || 'todo') !== changesStatusFilter) return false;
    }
    if (!q) return true;
    const sel = (item.data as any).selector || '';
    if (sel.toLowerCase().includes(q)) return true;
    if (item.type === 'style') {
      const c = item.data;
      return c.property.toLowerCase().includes(q) ||
        (c.oldValue || '').toLowerCase().includes(q) ||
        (c.newValue || '').toLowerCase().includes(q);
    }
    if (item.type === 'text') {
      return (item.data.oldText || '').toLowerCase().includes(q) ||
        (item.data.newText || '').toLowerCase().includes(q);
    }
    if (item.type === 'dom') return item.data.action.toLowerCase().includes(q) || item.data.tagName.toLowerCase().includes(q);
    if (item.type === 'comment') return (item.data.text || '').toLowerCase().includes(q);
    if (item.type === 'token') return item.data.cssVar.toLowerCase().includes(q) ||
      (item.data.original || '').toLowerCase().includes(q) ||
      (item.data.current || '').toLowerCase().includes(q);
    return false;
  };
  const items = allItems.filter(matches);

  // Group by selector / elementId. `label` is the recorded human-readable
  // layer name (describeElement) — selectors on class-less markup degrade
  // to bare tags, so the header prefers the label and keeps the selector
  // in the tooltip.
  const groups = new Map<string, { selector: string; label: string; elementId: string; items: ChangeItem[] }>();
  for (const item of items) {
    const selector = (item.data as any).selector || 'unknown';
    const elementId = (item.data as any).elementId || '';
    const key = elementId || selector;
    if (!groups.has(key)) groups.set(key, { selector, label: '', elementId, items: [] });
    const group = groups.get(key)!;
    group.items.push(item);
    if (!group.label && (item.data as any).label) group.label = (item.data as any).label;
  }

  // Single toggle replaces the old "View Original" / "View Changes" pair —
  // when changes are visible (default) the button reads as active with an
  // open-eye glyph; clicking flips to preview the original (eye-off, muted)
  // and clicking again restores. One control = half the row width and one
  // less interaction model to learn.
  const activeStyle = 'padding:4px 8px;background:var(--dm-accent-bg);border:1px solid var(--dm-accent-border);border-radius:4px;color:var(--dm-accent);cursor:pointer;font-size:9px;font-family:inherit;display:flex;align-items:center;gap:3px;font-weight:500;';
  const inactiveStyle = 'padding:4px 8px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:4px;color:var(--dm-text-secondary);cursor:pointer;font-size:9px;font-family:inherit;display:flex;align-items:center;gap:3px;';
  const previewToggleAction = previewingOriginal ? 'restore-changes' : 'preview-original';
  const previewToggleTitle = previewingOriginal
    ? 'Currently previewing the original — click to show your edits'
    : 'Click to temporarily hide your edits and preview the original';
  const previewToggleBtn = '<button data-dm-action="' + previewToggleAction + '" title="' + previewToggleTitle + '" style="' + (previewingOriginal ? inactiveStyle : activeStyle) + '">' + icon(previewingOriginal ? 'eyeOff' : 'eye', 10) + ' Changes</button>';
  const previewBanner = previewingOriginal
    ? '<div style="padding:6px 12px;background:var(--dm-accent-bg);border-bottom:1px solid var(--dm-accent-border);font-size:10px;color:var(--dm-accent);text-align:center;">Previewing original — click Changes to see your edits</div>'
    : '';

  // Action row 1 — buttons. Changes toggle / Clear all / Export / Import.
  // Import is a styled <label> wrapping a hidden file input, mirroring the
  // presets export/import pattern in Settings.
  const exportBtn = '<button data-dm-action="export-changes" title="Download every tracked change as a JSON file" style="' + inactiveStyle + '">' + icon('download', 10) + ' Export</button>';
  const importBtn = '<label title="Replace every change with an imported JSON file" style="' + inactiveStyle + '">' + icon('upload', 10) + ' Import<input type="file" accept=".json,application/json" data-dm-import-changes style="display:none;"/></label>';
  const clearBtn = '<button data-dm-action="clear-all-changes" style="padding:4px 10px;background:var(--dm-danger-bg);border:1px solid var(--dm-danger-border);border-radius:4px;color:var(--dm-danger);cursor:pointer;font-size:9px;font-family:inherit;display:flex;align-items:center;gap:4px;">' + icon('trash', 10) + ' Clear all</button>';
  // Two clusters: primary (Changes toggle + Clear all) on the left, file
  // I/O (Export + Import) on the right. `justify-content:space-between`
  // pushes them apart while `flex-wrap` keeps the row tidy on narrow panels.
  const topRow = '<div style="padding:6px 10px;border-bottom:1px solid var(--dm-separator);display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap;background:var(--dm-bg);">' +
    '<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">' + previewToggleBtn + clearBtn + '</div>' +
    '<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">' + exportBtn + importBtn + '</div>' +
    '</div>';

  // Action row 2 — Search + Expand-all toggle + Sort menu. Sort is an icon
  // button that opens an anchored 3-option popover (Oldest / Newest / By
  // element) so it stays compact and matches the action-row icon style.
  const groupKeys = Array.from(groups.keys());
  const anyCollapsed = groupKeys.some(k => changesGroupCollapsed.has(k));
  const expandIconName = anyCollapsed ? 'listChevronsUpDown' : 'listChevronsDownUp';
  const expandTitle = anyCollapsed ? 'Expand all groups' : 'Collapse all groups';
  const expandIconBtn = '<button data-dm-action="' + (anyCollapsed ? 'expand-all-groups' : 'collapse-all-groups') + '" title="' + expandTitle + '" style="background:none;border:none;color:var(--dm-text-secondary);cursor:pointer;display:flex;padding:4px;border-radius:4px;flex-shrink:0;">' + icon(expandIconName, 14) + '</button>';

  const sortLabel: Record<ChangesSort, string> = { oldest: 'Oldest first', newest: 'Newest first', element: 'By element' };
  const sortMenu = changesSortMenuOpen
    ? '<div data-dm-changes-sort-menu style="position:absolute;top:calc(100% + 4px);right:0;background:var(--dm-bg);border:1px solid var(--dm-separator-strong);border-radius:6px;box-shadow:0 6px 18px rgba(0,0,0,0.3);padding:4px;z-index:20;min-width:120px;">' +
      (Object.keys(sortLabel) as ChangesSort[]).map(k => {
        const active = changesSort === k;
        return '<button data-dm-changes-sort="' + k + '" style="display:block;width:100%;text-align:left;padding:5px 8px;background:' + (active ? 'var(--dm-accent-bg)' : 'transparent') + ';border:none;border-radius:4px;color:' + (active ? 'var(--dm-accent)' : 'var(--dm-text-secondary)') + ';cursor:pointer;font-size:10px;font-family:inherit;font-weight:' + (active ? '600' : '400') + ';">' + sortLabel[k] + '</button>';
      }).join('') +
      '</div>'
    : '';
  const sortIconBtn = '<div style="position:relative;flex-shrink:0;">' +
    '<button data-dm-action="toggle-changes-sort" title="Sort order — ' + sortLabel[changesSort] + '" style="background:' + (changesSortMenuOpen ? 'var(--dm-accent-bg)' : 'none') + ';border:none;color:' + (changesSortMenuOpen ? 'var(--dm-accent)' : 'var(--dm-text-secondary)') + ';cursor:pointer;display:flex;padding:4px;border-radius:4px;">' + icon('arrowUpDown', 14) + '</button>' +
    sortMenu +
    '</div>';

  const searchRow = '<div style="display:flex;gap:6px;align-items:center;padding:6px 10px;border-bottom:1px solid var(--dm-separator);">' +
    '<div style="display:flex;align-items:center;background:var(--dm-input-bg);border:1px solid var(--dm-input-border);border-radius:5px;padding:0 6px;flex:1;min-width:0;">' +
    '<span style="color:var(--dm-text-dim);display:flex;flex-shrink:0;">' + icon('search', 10) + '</span>' +
    '<input type="text" class="dm-input" data-dm-changes-search value="' + escapeAttr(changesSearch) + '" placeholder="Search changes…" style="background:none;border:none;padding:5px 6px;flex:1;min-width:0;font-size:10px;"/>' +
    (changesSearch ? '<button data-dm-action="clear-changes-search" title="Clear search" style="background:none;border:none;color:var(--dm-text-dim);cursor:pointer;display:flex;padding:2px;flex-shrink:0;">' + icon('x', 10) + '</button>' : '') +
    '</div>' +
    expandIconBtn + sortIconBtn +
    '</div>';

  // Action row 3 — kind filter chips. Counts on each chip help the user
  // spot which kinds have any entries.
  const counts = {
    all: allItems.length,
    style: allItems.filter(i => i.type === 'style').length,
    text: allItems.filter(i => i.type === 'text').length,
    dom: allItems.filter(i => i.type === 'dom').length,
    comment: allItems.filter(i => i.type === 'comment').length,
    token: allItems.filter(i => i.type === 'token').length,
  };
  const fchip = (f: ChangesFilter, label: string) => {
    const active = changesFilter === f;
    const n = counts[f];
    return '<button data-dm-changes-filter="' + f + '" style="padding:3px 9px;background:' + (active ? 'var(--dm-accent-bg)' : 'transparent') +
      ';border:1px solid ' + (active ? 'var(--dm-accent-border)' : 'var(--dm-separator)') +
      ';border-radius:9999px;color:' + (active ? 'var(--dm-accent)' : 'var(--dm-text-secondary)') +
      ';cursor:pointer;font-size:9px;font-family:inherit;font-weight:' + (active ? '600' : '400') + ';">' +
      label + ' <span style="opacity:0.6;">' + n + '</span></button>';
  };
  const filterChipsRow = '<div style="display:flex;gap:4px;align-items:center;padding:6px 10px;border-bottom:1px solid var(--dm-separator);flex-wrap:wrap;">' +
    fchip('all', 'All') + fchip('style', 'Styles') + fchip('text', 'Text') + fchip('dom', 'DOM') + fchip('comment', 'Comments') + fchip('token', 'Tokens') +
    '</div>';

  // Comments sub-filter — only renders when the kind filter is 'all' (and
  // there are any comments) or 'comment'. Three pills: All / Open /
  // Resolved with count badges, mirroring the kind chips.
  const showCommentsSub = (changesFilter === 'comment') || (changesFilter === 'all' && counts.comment > 0);
  const cCounts = {
    all: counts.comment,
    open: comments.filter(c => !(c as any).resolved).length,
    resolved: comments.filter(c => !!(c as any).resolved).length,
  };
  const cchip = (f: CommentsResolvedFilter, label: string) => {
    const active = commentsResolvedFilter === f;
    const n = cCounts[f];
    return '<button data-dm-comments-filter="' + f + '" style="padding:3px 9px;background:' + (active ? 'var(--dm-purple-bg)' : 'transparent') +
      ';border:1px solid ' + (active ? 'var(--dm-purple-border)' : 'var(--dm-separator)') +
      ';border-radius:9999px;color:' + (active ? 'var(--dm-purple)' : 'var(--dm-text-secondary)') +
      ';cursor:pointer;font-size:9px;font-family:inherit;font-weight:' + (active ? '600' : '400') + ';">' +
      label + ' <span style="opacity:0.6;">' + n + '</span></button>';
  };
  const commentsSubRow = showCommentsSub
    ? '<div style="display:flex;gap:4px;align-items:center;padding:4px 10px;border-bottom:1px solid var(--dm-separator);flex-wrap:wrap;background:var(--dm-bg);">' +
        '<span style="font-size:9px;color:var(--dm-text-dim);text-transform:uppercase;letter-spacing:0.4px;margin-right:4px;">Comments:</span>' +
        cchip('all', 'All') + cchip('open', 'Open') + cchip('resolved', 'Resolved') +
      '</div>'
    : '';

  // Status sub-filter — the agent-driven lifecycle on style/text/DOM
  // changes. Stays hidden until an agent actually moves something off the
  // default 'todo', so it doesn't clutter the solo-editing flow.
  const statusOf = (i: ChangeItem) => (i.data as any).status || 'todo';
  const hasStatus = (i: ChangeItem) => i.type === 'style' || i.type === 'text' || i.type === 'dom';
  const sCounts = {
    all: allItems.filter(hasStatus).length,
    todo: allItems.filter(i => hasStatus(i) && statusOf(i) === 'todo').length,
    in_progress: allItems.filter(i => hasStatus(i) && statusOf(i) === 'in_progress').length,
    resolved: allItems.filter(i => hasStatus(i) && statusOf(i) === 'resolved').length,
  };
  const showStatusSub = (sCounts.in_progress + sCounts.resolved) > 0 && changesFilter !== 'comment' && changesFilter !== 'token';
  const sLabel: Record<ChangesStatusFilter, string> = { all: 'All', todo: 'To-do', in_progress: 'In progress', resolved: 'Resolved' };
  const schip = (f: ChangesStatusFilter) => {
    const active = changesStatusFilter === f;
    const n = sCounts[f];
    return '<button data-dm-changes-status="' + f + '" style="padding:3px 9px;background:' + (active ? 'var(--dm-accent-bg)' : 'transparent') +
      ';border:1px solid ' + (active ? 'var(--dm-accent-border)' : 'var(--dm-separator)') +
      ';border-radius:9999px;color:' + (active ? 'var(--dm-accent)' : 'var(--dm-text-secondary)') +
      ';cursor:pointer;font-size:9px;font-family:inherit;font-weight:' + (active ? '600' : '400') + ';">' +
      sLabel[f] + ' <span style="opacity:0.6;">' + n + '</span></button>';
  };
  const statusSubRow = showStatusSub
    ? '<div style="display:flex;gap:4px;align-items:center;padding:4px 10px;border-bottom:1px solid var(--dm-separator);flex-wrap:wrap;background:var(--dm-bg);">' +
        '<span style="font-size:9px;color:var(--dm-text-dim);text-transform:uppercase;letter-spacing:0.4px;margin-right:4px;">Status:</span>' +
        schip('all') + schip('todo') + schip('in_progress') + schip('resolved') +
      '</div>'
    : '';

  // Inline confirmation overlay for Clear All. Mirrors the per-comment
  // delete pattern so the destructive action is one extra click, not
  // a system dialog.
  // Confirmation overlays are positioned fixed (viewport-relative) instead
  // of absolute (parent-relative). The Changes tab is scrollable; the
  // overlay's parent is the FULL list height, so an absolute overlay would
  // sit at the geometric centre of the list — often below the fold — and
  // the user would never see it.
  const clearAllOverlay = clearAllConfirming
    ? '<div style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:60;display:flex;align-items:center;justify-content:center;">' +
      '<div style="background:var(--dm-bg);border:1px solid var(--dm-separator-strong);border-radius:10px;padding:16px;width:250px;text-align:center;box-shadow:0 8px 24px rgba(0,0,0,0.3);">' +
      '<div style="font-size:12px;font-weight:600;color:var(--dm-text);margin-bottom:6px;">Clear all changes?</div>' +
      '<div style="font-size:10px;color:var(--dm-text-secondary);margin-bottom:14px;line-height:1.5;">Removes every tracked style, text, DOM, and comment change. Resets the undo stack. This can\'t be undone.</div>' +
      '<div style="display:flex;gap:6px;">' +
      '<button data-dm-action="cancel-clear-all" style="flex:1;padding:6px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:6px;color:var(--dm-text-secondary);cursor:pointer;font-size:10px;font-family:inherit;">Cancel</button>' +
      '<button data-dm-action="confirm-clear-all" style="flex:1;padding:6px;background:var(--dm-danger-bg);border:1px solid var(--dm-danger-border);border-radius:6px;color:var(--dm-danger);cursor:pointer;font-size:10px;font-family:inherit;font-weight:500;">Clear all</button>' +
      '</div></div></div>'
    : '';

  // Same inline overlay for deleting a single comment.
  const deleteCommentOverlay = deletingCommentId
    ? '<div style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:60;display:flex;align-items:center;justify-content:center;">' +
      '<div style="background:var(--dm-bg);border:1px solid var(--dm-separator-strong);border-radius:10px;padding:16px;width:250px;text-align:center;box-shadow:0 8px 24px rgba(0,0,0,0.3);">' +
      '<div style="font-size:12px;font-weight:600;color:var(--dm-text);margin-bottom:6px;">Delete comment?</div>' +
      '<div style="font-size:10px;color:var(--dm-text-secondary);margin-bottom:14px;line-height:1.5;">The comment, its pin, and any unsaved replies will be removed. This can\'t be undone.</div>' +
      '<div style="display:flex;gap:6px;">' +
      '<button data-dm-action="cancel-delete-comment-confirm" style="flex:1;padding:6px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:6px;color:var(--dm-text-secondary);cursor:pointer;font-size:10px;font-family:inherit;">Cancel</button>' +
      '<button data-dm-action="confirm-delete-comment-confirm" style="flex:1;padding:6px;background:var(--dm-danger-bg);border:1px solid var(--dm-danger-border);border-radius:6px;color:var(--dm-danger);cursor:pointer;font-size:10px;font-family:inherit;font-weight:500;">Delete</button>' +
      '</div></div></div>'
    : '';

  // Bulk-revert toolbar — appears when 2+ rows are selected via the
  // checkbox column. The "Revert selected" button drives every selected
  // change-id through the existing per-change revert path.
  const bulkBar = changesSelected.size > 0 ? (
    '<div style="display:flex;flex-wrap:wrap;gap:4px;padding:6px 10px;border-bottom:1px solid var(--dm-separator);background:var(--dm-accent-bg);align-items:center;">' +
      '<span style="font-size:9px;color:var(--dm-accent);font-weight:600;margin-right:4px;">' + changesSelected.size + ' selected:</span>' +
      '<button data-dm-action="revert-selected-changes" style="padding:3px 8px;background:var(--dm-danger-bg);border:1px solid var(--dm-danger-border);border-radius:4px;color:var(--dm-danger);cursor:pointer;font-size:9px;font-family:inherit;display:flex;align-items:center;gap:3px;">' + icon('trash', 10) + ' Revert selected</button>' +
      '<button data-dm-action="clear-selected-changes" style="padding:3px 8px;background:var(--dm-bg);border:1px solid var(--dm-separator);border-radius:4px;color:var(--dm-text-secondary);cursor:pointer;font-size:9px;font-family:inherit;display:flex;align-items:center;gap:3px;margin-left:auto;">' + icon('x', 10) + ' Clear</button>' +
    '</div>'
  ) : '';

  // Header rows pin to the top of the scrollable Changes tab so the user
  // can keep filtering/searching/toggling-original while reading rows
  // further down. The comments sub-filter, bulk-revert toolbar, and
  // "previewing original" banner sit below the sticky band — they're
  // contextual, not navigation, and including them in the pinned region
  // would push the actual list rows too far down on small panels.
  const stickyHeader = '<div style="position:sticky;top:0;z-index:5;background:var(--dm-bg);">' + topRow + searchRow + filterChipsRow + '</div>';
  const headerHtml = stickyHeader + commentsSubRow + statusSubRow + bulkBar + previewBanner;

  // Char-level diff for text changes — Myers-style longest common
  // subsequence, then collapse identical runs into <span>'s. Cheap enough
  // for short strings; falls back to the short-truncation diff when both
  // strings are tiny (< 30 chars combined) since the colour coding is
  // already obvious there.
  const diffChars = (oldStr: string, newStr: string): string => {
    const aLen = oldStr.length, bLen = newStr.length;
    // Heuristic: skip the LCS dance for tiny strings.
    if (aLen + bLen < 60) return '';
    // Build LCS dp matrix.
    const dp: number[][] = Array.from({ length: aLen + 1 }, () => new Array(bLen + 1).fill(0));
    for (let i = 1; i <= aLen; i++) {
      for (let j = 1; j <= bLen; j++) {
        dp[i][j] = oldStr[i - 1] === newStr[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
    // Walk back to record edits as runs of {kind, text}.
    type Run = { kind: 'eq' | 'add' | 'del'; text: string };
    const runs: Run[] = [];
    let i = aLen, j = bLen;
    while (i > 0 && j > 0) {
      if (oldStr[i - 1] === newStr[j - 1]) { runs.unshift({ kind: 'eq', text: oldStr[i - 1] }); i--; j--; }
      else if (dp[i - 1][j] >= dp[i][j - 1]) { runs.unshift({ kind: 'del', text: oldStr[i - 1] }); i--; }
      else { runs.unshift({ kind: 'add', text: newStr[j - 1] }); j--; }
    }
    while (i > 0) { runs.unshift({ kind: 'del', text: oldStr[i - 1] }); i--; }
    while (j > 0) { runs.unshift({ kind: 'add', text: newStr[j - 1] }); j--; }
    // Coalesce adjacent same-kind runs.
    const coalesced: Run[] = [];
    for (const r of runs) {
      const last = coalesced[coalesced.length - 1];
      if (last && last.kind === r.kind) last.text += r.text;
      else coalesced.push({ ...r });
    }
    return coalesced.map(r => {
      const t = escapeAttr(r.text);
      if (r.kind === 'eq') return '<span style="color:var(--dm-text-secondary);">' + t + '</span>';
      if (r.kind === 'add') return '<span style="background:rgba(34,197,94,0.18);color:var(--dm-success);">' + t + '</span>';
      return '<span style="background:rgba(239,68,68,0.18);color:var(--dm-danger);text-decoration:line-through;">' + t + '</span>';
    }).join('');
  };

  // Time-ago helper for hover tooltips on each change row.
  const fmtAgo = (ts?: number): string => {
    if (!ts) return '';
    const diff = Math.max(0, Date.now() - ts);
    const s = Math.floor(diff / 1000);
    if (s < 5) return 'just now';
    if (s < 60) return s + 's ago';
    const m = Math.floor(s / 60);
    if (m < 60) return m + 'm ago';
    const h = Math.floor(m / 60);
    if (h < 24) return h + 'h ago';
    return Math.floor(h / 24) + 'd ago';
  };

  // Build a Set of currently-known element ids for the active-DOM stale
  // check. domTree is populated by SP_GET_DOM_TREE on tab switch and is
  // re-fetched after every action, so this is a reliable snapshot.
  const liveElementIds = new Set(domTree.map(n => n.id));

  const groupHtml = Array.from(groups.entries()).map(([key, group]) => {
    const isCollapsed = changesGroupCollapsed.has(key);
    const count = group.items.length;
    const chevIcon = isCollapsed ? 'chevronRight' : 'chevronDown';
    // A group is "stale" when (a) the tracker has no elementId, OR (b)
    // its elementId no longer exists in the live DOM tree (framework
    // removed / re-rendered the host with a different selector).
    const isStale = !group.elementId || (domTree.length > 0 && !liveElementIds.has(group.elementId));

    const header = '<div class="dm-change-group-header" data-dm-change-group="' + escapeAttr(key) + '"' + (isStale ? ' style="opacity:0.7;"' : '') + '>' +
      '<span style="color:var(--dm-text-dim);display:flex;">' + icon(chevIcon as keyof typeof icons, 10) + '</span>' +
      '<span style="font-family:SF Mono,Monaco,monospace;font-size:10px;color:var(--dm-text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;" title="' + escapeAttr(group.selector) + (isStale ? ' (element no longer reachable)' : '') + '">' + escapeAttr(group.label || group.selector) + '</span>' +
      (isStale ? '<span style="font-size:8px;padding:1px 6px;border-radius:9999px;background:rgba(0,0,0,0.06);color:var(--dm-text-dim);font-weight:600;text-transform:uppercase;letter-spacing:0.4px;flex-shrink:0;">stale</span>' : '') +
      '<span style="font-size:9px;background:var(--dm-accent-bg);color:var(--dm-accent);border-radius:8px;padding:1px 6px;flex-shrink:0;">' + count + '</span>' +
      (group.elementId ? '<button data-dm-select-change-el="' + escapeAttr(group.elementId) + '" title="Select element" style="background:none;border:none;color:var(--dm-text-dim);cursor:pointer;display:flex;padding:2px;flex-shrink:0;">' + icon('crosshair', 10) + '</button>' : '') +
      '<button data-dm-revert-group="' + escapeAttr(key) + '" title="Revert all changes in this group" style="background:none;border:none;color:var(--dm-danger);cursor:pointer;display:flex;padding:2px;flex-shrink:0;">' + icon('trash', 10) + '</button>' +
      '</div>';

    if (isCollapsed) return '<div class="dm-change-group">' + header + '</div>';

    // Per-row checkbox HTML — cid scoped to the row's change-id so
    // selection is stable across re-renders.
    const checkbox = (cid: string) => {
      const checked = changesSelected.has(cid);
      return '<input type="checkbox" data-dm-change-checkbox="' + escapeAttr(cid) + '"' + (checked ? ' checked' : '') + ' style="accent-color:var(--dm-accent);width:12px;height:12px;flex-shrink:0;cursor:pointer;" aria-label="Select change for bulk revert"/>';
    };

    const renderItem = (item: typeof group.items[number], opts?: { extraIndent?: boolean }): string => {
      const tsLabel = fmtAgo((item.data as any).timestamp);
      const rowTip = tsLabel ? ' title="' + escapeAttr(tsLabel) + '"' : '';
      const indentLeft = opts?.extraIndent ? 44 : 28;
      if (item.type === 'style') {
        const c = item.data;
        const cid = c.id || 'style-' + item.idx;
        const matchCount = Math.max(1, (c as any).matchCount || 1);
        const isBatched = batchAppliedChanges.has(cid);
        const zapStyle = isBatched
          ? 'background:var(--dm-accent-bg);border:1px solid var(--dm-accent-border);color:var(--dm-accent);cursor:pointer;display:flex;align-items:center;gap:3px;padding:3px 5px;flex-shrink:0;border-radius:4px;'
          : 'background:none;border:1px solid transparent;color:var(--dm-text-dim);cursor:pointer;display:flex;align-items:center;gap:3px;padding:3px 5px;flex-shrink:0;border-radius:4px;opacity:' + (matchCount > 1 ? '0.85' : '0.55') + ';';
        const zapTitle = isBatched
          ? 'Applied to all ' + matchCount + ' matching element' + (matchCount > 1 ? 's' : '') + ' (click to clear flag)'
          : 'Apply to all ' + matchCount + ' matching element' + (matchCount > 1 ? 's' : '');
        const countBadge = matchCount > 1
          ? '<span style="font-size:9px;font-family:inherit;font-weight:600;">\u00d7' + matchCount + '</span>'
          : '';
        // Visibility-tagged rows render as `HIDE` / `SHOW` instead of
        // `display: none` / `display: revert` \u2014 same change underneath, but
        // the row reads as the gesture the user actually performed.
        const isVisToggle = c.groupKind === 'visibility';
        const innerLabel = isVisToggle
          ? '<div style="font-size:10px;font-weight:600;color:' + (c.newValue === 'none' ? 'var(--dm-danger)' : 'var(--dm-success)') + ';">' + (c.groupLabel || (c.newValue === 'none' ? 'Hidden' : 'Shown')) + '</div>'
          : '<div style="font-size:10px;"><span style="color:var(--dm-text-muted);">' + c.property + '</span>: <span style="color:var(--dm-danger);text-decoration:line-through;font-size:9px;">' + escapeAttr((c.oldValue || '').slice(0, 20)) + '</span> \u2192 <span style="color:var(--dm-success);">' + escapeAttr((c.newValue || '').slice(0, 20)) + '</span></div>';
        const rowIcon = isVisToggle
          ? '<span style="color:' + (c.newValue === 'none' ? 'var(--dm-danger)' : 'var(--dm-success)') + ';display:flex;flex-shrink:0;">' + icon(c.newValue === 'none' ? 'eyeClosed' : 'eye', 10) + '</span>'
          : '<span style="color:var(--dm-accent);display:flex;flex-shrink:0;">' + icon('sliders', 10) + '</span>';
        return '<div class="dm-change-item" data-dm-select-change-el="' + escapeAttr(c.elementId || '') + '" data-dm-change-prop="' + escapeAttr(c.property) + '"' + rowTip + ' style="display:flex;align-items:center;gap:6px;padding:6px 12px 6px ' + indentLeft + 'px;border-bottom:1px solid var(--dm-separator);cursor:pointer;' + ((c as any).status === 'resolved' ? 'opacity:0.6;' : '') + '">' +
          checkbox(cid) +
          rowIcon +
          '<div style="flex:1;min-width:0;' + ((c as any).status === 'resolved' ? 'text-decoration:line-through;' : '') + '">' + innerLabel + '</div>' +
          changeStatusBadge((c as any).status) +
          '<button data-dm-batch-apply="' + cid + '" title="' + zapTitle + '" style="' + zapStyle + '" aria-label="Batch apply">' + icon('zap', 10) + countBadge + '</button>' +
          '<button class="dm-change-revert" data-dm-remove-change="' + cid + '" title="Revert" style="background:none;border:none;color:var(--dm-text-muted);cursor:pointer;display:flex;padding:4px;flex-shrink:0;">' + icon('trash', 10) + '</button></div>';
      } else if (item.type === 'text') {
        const c = item.data;
        const cid = c.id;
        // Char-level diff for non-trivial text changes; falls back to the
        // 20-char old \u2192 new format for short edits.
        const diffHtml = diffChars(c.oldText || '', c.newText || '');
        const inner = diffHtml
          ? '<div style="font-size:10px;line-height:1.5;font-family:SF Mono,Monaco,monospace;word-break:break-word;"><span style="color:var(--dm-text-muted);">text:</span> ' + diffHtml + '</div>'
          : '<div style="font-size:10px;"><span style="color:var(--dm-text-muted);">text</span>: <span style="color:var(--dm-danger);text-decoration:line-through;font-size:9px;">' + escapeAttr((c.oldText || '').slice(0, 20)) + '</span> \u2192 <span style="color:var(--dm-success);">' + escapeAttr((c.newText || '').slice(0, 20)) + '</span></div>';
        return '<div class="dm-change-item" data-dm-select-change-el="' + escapeAttr(c.elementId || '') + '"' + rowTip + ' style="display:flex;align-items:flex-start;gap:6px;padding:6px 12px 6px 28px;border-bottom:1px solid var(--dm-separator);cursor:pointer;' + ((c as any).status === 'resolved' ? 'opacity:0.6;' : '') + '">' +
          checkbox(cid) +
          '<span style="color:var(--dm-accent);display:flex;flex-shrink:0;margin-top:2px;">' + icon('type', 10) + '</span>' +
          '<div style="flex:1;min-width:0;' + ((c as any).status === 'resolved' ? 'text-decoration:line-through;' : '') + '">' + inner + '</div>' +
          changeStatusBadge((c as any).status) +
          '<button class="dm-change-revert" data-dm-remove-change="' + cid + '" title="Revert" style="background:none;border:none;color:var(--dm-text-muted);cursor:pointer;display:flex;padding:4px;flex-shrink:0;">' + icon('trash', 10) + '</button></div>';
      } else if (item.type === 'dom') {
        const c = item.data;
        const colors: Record<string, string> = { delete: 'var(--dm-danger)', duplicate: 'var(--dm-purple)', move: '#f59e0b', insert: 'var(--dm-success)', text: 'var(--dm-accent)' };
        const ic: Record<string, keyof typeof icons> = { delete: 'trash', duplicate: 'layers', move: 'move', insert: 'plus', text: 'type' };
        const cid = c.id || 'dom-' + c.action;
        // For move actions surface origin + destination as compact sub-lines:
        //   from <selector> > position 2
        //   to   <selector> > position 1
        // Origin is captured first time only (recordDomChange dedup); the
        // destination updates on every drag / arrow click.
        const fmt = (loc: { parentSelector: string; index: number }) =>
          escapeAttr(loc.parentSelector) + ' › position ' + (loc.index + 1);
        const origLine = c.action === 'move' && c.origin
          ? '<div style="font-size:9px;color:var(--dm-text-dim);font-family:SF Mono,Monaco,monospace;margin-top:2px;line-height:1.4;"><span style="color:var(--dm-text-muted);">from</span> ' + fmt(c.origin) + '</div>'
          : '';
        const destLine = c.action === 'move' && c.destination
          ? '<div style="font-size:9px;color:var(--dm-text-dim);font-family:SF Mono,Monaco,monospace;margin-top:2px;line-height:1.4;"><span style="color:var(--dm-text-muted);">to</span> ' + fmt(c.destination) + '</div>'
          : '';
        return '<div class="dm-change-item" data-dm-select-change-el="' + escapeAttr(c.elementId || '') + '"' + rowTip + ' style="display:flex;align-items:flex-start;gap:6px;padding:6px 12px 6px 28px;border-bottom:1px solid var(--dm-separator);cursor:pointer;' + ((c as any).status === 'resolved' ? 'opacity:0.6;' : '') + '">' +
          checkbox(cid) +
          '<span style="color:' + (colors[c.action] || 'var(--dm-text-muted)') + ';display:flex;flex-shrink:0;margin-top:2px;">' + icon(ic[c.action] || 'sparkles', 10) + '</span>' +
          '<div style="flex:1;min-width:0;' + ((c as any).status === 'resolved' ? 'text-decoration:line-through;' : '') + '">' +
          '<div style="font-size:10px;color:' + (colors[c.action] || 'var(--dm-text-muted)') + ';">' + c.action.toUpperCase() + ' &lt;' + c.tagName + '&gt;</div>' +
          origLine + destLine +
          '</div>' + changeStatusBadge((c as any).status) + '<button class="dm-change-revert" data-dm-remove-change="' + cid + '" title="Revert" style="background:none;border:none;color:var(--dm-text-muted);cursor:pointer;display:flex;padding:4px;flex-shrink:0;">' + icon('trash', 10) + '</button></div>';
      } else if (item.type === 'token') {
        const c = item.data;
        const shortOld = escapeAttr((c.original || '').slice(0, 20));
        const shortNew = escapeAttr((c.current || '').slice(0, 20));
        const scopeSel = c.scopeSelector || ':root';
        const chip = (text: string, title: string) =>
          '<span title="' + escapeAttr(title) + '" style="flex-shrink:0;padding:0 3px;border-radius:3px;background:var(--dm-accent-bg);color:var(--dm-accent);font-size:8px;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeAttr(text) + '</span>';
        const chips =
          (c.system ? chip(c.system, 'Design system: ' + c.system) : '') +
          (scopeSel !== ':root' ? chip(scopeSel, 'Declared on ' + scopeSel) : '');
        return '<div class="dm-change-item"' + rowTip + ' style="display:flex;align-items:center;gap:6px;padding:6px 12px 6px ' + indentLeft + 'px;border-bottom:1px solid var(--dm-separator);">' +
          '<span style="color:var(--dm-accent);display:flex;flex-shrink:0;">' + icon('swatchBook', 10) + '</span>' +
          '<div style="flex:1;min-width:0;"><div style="font-size:10px;display:flex;align-items:center;gap:4px;flex-wrap:wrap;"><span style="color:var(--dm-text-muted);font-family:SF Mono,Monaco,monospace;">' + escapeAttr(c.cssVar) + '</span>' + chips + '<span><span style="color:var(--dm-danger);text-decoration:line-through;font-size:9px;">' + shortOld + '</span> → <span style="color:var(--dm-success);">' + shortNew + '</span></span></div></div>' +
          '<button class="dm-change-revert" data-dm-token-reset="' + escapeAttr(c.cssVar) + '" data-dm-token-scope="' + escapeAttr(scopeSel) + '" title="Revert token to original" style="background:none;border:none;color:var(--dm-text-muted);cursor:pointer;display:flex;padding:4px;flex-shrink:0;">' + icon('trash', 10) + '</button></div>';
      } else {
        const c = item.data;
        const isViewing = c.id === viewingCommentId;
        const isResolved = !!c.resolved;
        const isRegion = !!c.region;
        const kindIcon = isRegion ? 'squareDashed' : 'messageSquare';
        // Pin ordinal — same algorithm the content script uses (creation
        // order). The displayed `#N` matches the number painted on the
        // pin, so users can reference the same comment in panel + page.
        const sortedComments = [...comments].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        const ordinal = sortedComments.findIndex(cc => cc.id === c.id) + 1;
        const wasEdited = !!(c.updatedAt && c.timestamp && c.updatedAt > c.timestamp + 1000);
        const tsLabel = fmtAgo(c.timestamp);
        const editedLabel = wasEdited ? ' · edited ' + fmtAgo(c.updatedAt) : '';
        const tsInfo = '<span style="font-size:9px;color:var(--dm-text-dim);font-family:SF Mono,Monaco,monospace;flex-shrink:0;">' + escapeAttr(tsLabel + editedLabel) + '</span>';
        // Body styling — strikethrough + faded when resolved.
        const bodyStyle = 'font-size:11px;color:' + (isResolved ? 'var(--dm-text-dim)' : 'var(--dm-text)') + ';line-height:1.5;' + (isResolved ? 'text-decoration:line-through;' : '');
        const bodyStyleCompact = 'font-size:10px;color:' + (isResolved ? 'var(--dm-text-dim)' : 'var(--dm-text)') + ';margin-bottom:4px;' + (isResolved ? 'text-decoration:line-through;' : '');
        // Resolve toggle — primary action when comment is open; "Reopen"
        // when resolved.
        const resolveBtn = '<button data-dm-toggle-resolved="' + c.id + '" aria-label="' + (isResolved ? 'Reopen' : 'Resolve') + '" title="' + (isResolved ? 'Reopen — restore as open comment' : 'Resolve — mark as done') + '" style="padding:3px 10px;background:' + (isResolved ? 'var(--dm-btn-bg)' : 'rgba(34,197,94,0.18)') + ';border:1px solid ' + (isResolved ? 'var(--dm-btn-border)' : 'rgba(34,197,94,0.4)') + ';border-radius:3px;color:' + (isResolved ? 'var(--dm-text-secondary)' : 'rgb(34,197,94)') + ';cursor:pointer;font-size:10px;font-family:inherit;font-weight:500;display:flex;align-items:center;gap:3px;">' + icon(isResolved ? 'rotateCcw' : 'checkCircle', 10) + ' ' + (isResolved ? 'Reopen' : 'Resolve') + '</button>';
        const resolveBtnCompact = '<button data-dm-toggle-resolved="' + c.id + '" aria-label="' + (isResolved ? 'Reopen' : 'Resolve') + '" title="' + (isResolved ? 'Reopen' : 'Resolve') + '" style="padding:2px 8px;background:' + (isResolved ? 'var(--dm-btn-bg)' : 'rgba(34,197,94,0.18)') + ';border:1px solid ' + (isResolved ? 'var(--dm-btn-border)' : 'rgba(34,197,94,0.4)') + ';border-radius:3px;color:' + (isResolved ? 'var(--dm-text-secondary)' : 'rgb(34,197,94)') + ';cursor:pointer;font-size:9px;font-family:inherit;display:flex;align-items:center;gap:2px;">' + icon(isResolved ? 'rotateCcw' : 'checkCircle', 9) + ' ' + (isResolved ? 'Reopen' : 'Resolve') + '</button>';
        // Pin number badge — small chip mirroring the page pin so the user
        // can match panel ↔ overlay quickly.
        const pinBadge = '<span title="Pin #' + ordinal + '" style="background:' + (isResolved ? '#A3A3A3' : '#FBBF24') + ';color:#000;font-weight:700;font-size:9px;padding:1px 6px;border-radius:9999px;flex-shrink:0;font-family:SF Mono,Monaco,monospace;">#' + ordinal + '</span>';
        if (isViewing) {
          return '<div class="dm-change-item" style="border-bottom:1px solid var(--dm-separator);background:' + (isResolved ? 'var(--dm-bg-secondary)' : 'var(--dm-purple-bg)') + ';opacity:' + (isResolved ? '0.85' : '1') + ';">' +
            '<div style="display:flex;align-items:center;gap:6px;padding:8px 12px 6px 28px;">' +
            pinBadge +
            '<span style="color:var(--dm-yellow);display:flex;flex-shrink:0;">' + icon(kindIcon, 10) + '</span>' +
            '<span style="font-size:10px;font-weight:600;color:var(--dm-text);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (isRegion ? 'region' : escapeAttr(c.selector || '')) + '</span>' +
            tsInfo +
            '<button data-dm-action="close-viewing-comment" aria-label="Close" style="background:none;border:none;color:var(--dm-text-muted);cursor:pointer;display:flex;padding:2px;flex-shrink:0;">' + icon('x', 10) + '</button>' +
            '</div>' +
            '<div style="padding:0 12px 6px 28px;' + bodyStyle + '">' + renderCommentMarkdown(c.text) + '</div>' +
            '<div style="display:flex;gap:6px;padding:0 12px 8px 28px;flex-wrap:wrap;">' +
            resolveBtn +
            '<button data-dm-edit-comment="' + c.id + '" aria-label="Edit comment" style="padding:3px 10px;background:rgba(139,92,246,0.12);border:1px solid var(--dm-purple-border);border-radius:3px;color:var(--dm-purple);cursor:pointer;font-size:10px;font-family:inherit;font-weight:500;">Edit</button>' +
            '<button data-dm-delete-comment="' + c.id + '" aria-label="Delete comment" style="padding:3px 10px;background:var(--dm-danger-bg);border:1px solid var(--dm-danger-border);border-radius:3px;color:var(--dm-danger);cursor:pointer;font-size:10px;font-family:inherit;">Delete</button>' +
            '</div></div>';
        }
        return '<div class="dm-change-item" data-dm-comment-item="' + c.id + '" style="display:flex;align-items:start;gap:6px;padding:6px 12px 6px 28px;border-bottom:1px solid var(--dm-separator);background:' + (isResolved ? 'var(--dm-bg-secondary)' : 'var(--dm-purple-bg)') + ';cursor:pointer;opacity:' + (isResolved ? '0.85' : '1') + ';">' +
          checkbox('comment-' + c.id) +
          pinBadge +
          '<span style="color:var(--dm-yellow);display:flex;flex-shrink:0;margin-top:2px;" title="' + (isRegion ? 'Region comment' : 'Element comment') + '">' + icon(kindIcon, 10) + '</span>' +
          '<div style="flex:1;min-width:0;">' +
          '<div style="' + bodyStyleCompact + '">' + renderCommentMarkdown(c.text) + '</div>' +
          '<div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;">' +
          resolveBtnCompact +
          '<button data-dm-edit-comment="' + c.id + '" aria-label="Edit comment" style="padding:2px 8px;background:rgba(139,92,246,0.12);border:1px solid var(--dm-purple-border);border-radius:3px;color:var(--dm-purple);cursor:pointer;font-size:9px;font-family:inherit;">Edit</button>' +
          '<button data-dm-delete-comment="' + c.id + '" aria-label="Delete comment" style="padding:2px 8px;background:var(--dm-bg-secondary);border:1px solid var(--dm-input-border);border-radius:3px;color:var(--dm-text-muted);cursor:pointer;font-size:9px;font-family:inherit;">Delete</button>' +
          '<span style="margin-left:auto;font-size:9px;color:var(--dm-text-dim);font-family:SF Mono,Monaco,monospace;">' + escapeAttr(tsLabel + editedLabel) + '</span>' +
          '</div></div></div>';
      }
      return '';
    };

    // Bucket consecutive style items that share a `groupId` into one
    // collapsible sub-row. groupKind 'preset' / 'multi-select' get the
    // grouped treatment; 'visibility' (no groupId) is rendered inline by
    // renderItem above. Order is preserved — the subgroup appears at the
    // position of its first member.
    type Unit =
      | { kind: 'item'; item: typeof group.items[number] }
      | { kind: 'subgroup'; gid: string; gkind: 'preset' | 'multi-select'; gLabel: string; items: typeof group.items };
    const units: Unit[] = [];
    const unitIdx = new Map<string, number>();
    for (const item of group.items) {
      if (item.type === 'style' && (item.data as any).groupId &&
          ((item.data as any).groupKind === 'preset' || (item.data as any).groupKind === 'multi-select')) {
        const gid = (item.data as any).groupId as string;
        const gkind = (item.data as any).groupKind as 'preset' | 'multi-select';
        const existing = unitIdx.get(gid);
        if (existing != null) {
          (units[existing] as { kind: 'subgroup'; items: typeof group.items }).items.push(item);
        } else {
          unitIdx.set(gid, units.length);
          units.push({
            kind: 'subgroup', gid, gkind,
            gLabel: ((item.data as any).groupLabel as string) || '',
            items: [item],
          });
        }
      } else {
        units.push({ kind: 'item', item });
      }
    }

    const body = units.map(u => {
      if (u.kind === 'item') return renderItem(u.item);
      const subKey = 'sub:' + u.gid;
      const isSubCollapsed = changesGroupCollapsed.has(subKey);
      const chev = isSubCollapsed ? 'chevronRight' : 'chevronDown';
      const labelPrefix = u.gkind === 'preset' ? 'PRESET' : 'APPLIED TO';
      const subColor = u.gkind === 'preset' ? 'var(--dm-purple)' : 'var(--dm-accent)';
      const subIcon: keyof typeof icons = u.gkind === 'preset' ? 'bookmark' : 'layers';
      const headerHtml = '<div class="dm-change-subgroup-header" data-dm-toggle-subgroup="' + escapeAttr(subKey) + '" style="display:flex;align-items:center;gap:6px;padding:5px 12px 5px 28px;border-bottom:1px solid var(--dm-separator);cursor:pointer;background:rgba(0,0,0,0.025);">' +
        '<span style="color:var(--dm-text-dim);display:flex;flex-shrink:0;">' + icon(chev as keyof typeof icons, 10) + '</span>' +
        '<span style="color:' + subColor + ';display:flex;flex-shrink:0;">' + icon(subIcon, 10) + '</span>' +
        '<div style="flex:1;min-width:0;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
        '<span style="color:var(--dm-text-muted);font-weight:600;letter-spacing:0.4px;">' + labelPrefix + '</span> ' +
        '<span style="color:var(--dm-text);">' + escapeAttr(u.gLabel) + '</span></div>' +
        '<span style="font-size:9px;background:var(--dm-bg-secondary);color:var(--dm-text-dim);border-radius:8px;padding:1px 6px;flex-shrink:0;">' + u.items.length + '</span>' +
        '<button data-dm-revert-subgroup="' + escapeAttr(u.gid) + '" title="Revert all in this group" style="background:none;border:none;color:var(--dm-danger);cursor:pointer;display:flex;padding:2px;flex-shrink:0;">' + icon('trash', 10) + '</button>' +
        '</div>';
      const childrenHtml = isSubCollapsed
        ? ''
        : u.items.map(it => renderItem(it, { extraIndent: true })).join('');
      return headerHtml + childrenHtml;
    }).join('');

    return '<div class="dm-change-group">' + header + body + '</div>';
  }).join('');

  // When filter / search produces an empty list, replace the group HTML
  // with a small contextual empty state.
  const filteredEmpty = items.length === 0;
  const filteredEmptyHtml = filteredEmpty
    ? '<div style="text-align:center;padding:28px 16px;color:var(--dm-text-dim);font-size:11px;line-height:1.7;">No changes match this filter / search.<br/><a data-dm-action="reset-changes-filter" style="color:var(--dm-accent);cursor:pointer;text-decoration:underline;">Clear filter</a></div>'
    : '';

  return '<div style="position:relative;">' + headerHtml + (filteredEmpty ? filteredEmptyHtml : groupHtml) + clearAllOverlay + deleteCommentOverlay + '</div>';
}

/* ── Settings View ── */
// Renders the MCP Server settings card. Three modes: Local (today's
// localhost server), Cloud (mcp.designmode.app), Self-hosted URL (user's
// own Vercel deploy of @design-mode/mcp-cloud). The cloud mode card
// shows a token chip + copy buttons for the agent's config snippet.
function renderMcpServerCard(sS: string, sT: string, lS: string, activeBtn: string, inactiveBtn: string): string {
  const modeBtn = (m: McpMode, label: string) => '<button data-dm-mcp-mode="' + m + '" style="' + (mcpMode === m ? activeBtn : inactiveBtn) + '">' + label + '</button>';
  const modeRow = '<div style="display:flex;gap:4px;margin-bottom:8px;">' +
    modeBtn('cloud', 'Cloud') + modeBtn('local', 'Local') + modeBtn('self-hosted', 'Self-hosted') +
    '</div>';

  let body = '';
  if (mcpMode === 'local') {
    // Stable id on each input so morphdom keys the swap when the mode
    // flips. Without these ids, morphdom would diff the wsPort number
    // input against the cloud-mode url text input at the same position
    // and Chrome would reject value="https://…" as non-numeric.
    body = '<div style="display:flex;justify-content:space-between;align-items:center;"><span style="' + lS + '">WebSocket Port</span><input id="dm-mcp-ws-port" type="number" class="dm-input" data-dm-setting="wsPort" value="' + escapeAttr(String(mcpPort)) + '" style="width:80px;text-align:right;"/></div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;"><span style="' + lS + '">Auto-connect</span><input id="dm-mcp-auto-connect" type="checkbox" data-dm-setting="autoConnect"' + (mcpAutoConnect ? ' checked' : '') + ' style="accent-color:var(--dm-accent);"/></div>' +
      '<div style="font-size:9px;color:var(--dm-text-dimmer);margin-top:4px;line-height:1.4;">Port and auto-connect are stored locally. Run <code style="font-family:SF Mono,monospace;">npm start</code> in <code style="font-family:SF Mono,monospace;">packages/mcp-local</code> to bring up the bridge.</div>';
  } else {
    // Cloud + self-hosted share the same UI; only the URL field is
    // editable in self-hosted mode.
    const isSelf = mcpMode === 'self-hosted';
    const hasToken = !!mcpCloudToken;
    const mcpEndpoint = (mcpCloudUrl || '').replace(/\/$/, '') + '/mcp';

    const urlField = isSelf
      ? '<div style="display:flex;flex-direction:column;gap:4px;"><span style="' + lS + '">Server URL</span><input id="dm-mcp-cloud-url" type="text" class="dm-input" data-dm-setting="cloudUrl" value="' + escapeAttr(mcpCloudUrl) + '" placeholder="https://your-deploy.vercel.app" style="font-size:10px;"/></div>'
      : '<div style="display:flex;justify-content:space-between;align-items:center;"><span style="' + lS + '">Server</span><span style="font-size:10px;color:var(--dm-text-secondary);font-family:SF Mono,monospace;">' + escapeAttr(mcpCloudUrl) + '</span></div>';

    if (!hasToken) {
      body = urlField +
        '<button data-dm-action="mcp-cloud-register" style="margin-top:8px;padding:8px 10px;background:var(--dm-accent-bg);border:1px solid var(--dm-accent-border);border-radius:6px;color:var(--dm-accent);cursor:pointer;font-size:10px;font-family:inherit;font-weight:500;display:flex;align-items:center;justify-content:center;gap:6px;"' + (mcpCloudRegistering ? ' disabled' : '') + '>' + icon('zap', 11) + (mcpCloudRegistering ? ' Connecting…' : ' Connect to Cloud') + '</button>' +
        '<div style="font-size:9px;color:var(--dm-text-dimmer);margin-top:6px;line-height:1.4;">A device token is generated on the server. Copy the config, paste it into your agent (Claude Code, Cursor, VS Code, …), restart the agent.</div>';
    } else {
      // One reasonable, IDE-agnostic snippet. The `mcpServers` wrapper +
      // `type: "http"` is what Claude Code / Claude Desktop / VS Code /
      // current Cursor all accept; users trim the wrapper if their client
      // wants the bare object.
      const mcpConfig = JSON.stringify({
        mcpServers: { 'design-mode': { type: 'http', url: mcpEndpoint, headers: { Authorization: 'Bearer ' + mcpCloudToken } } },
      }, null, 2);
      const tenantBadge = mcpCloudTenantId
        ? '<span style="font-size:9px;color:var(--dm-text-dimmer);font-family:SF Mono,monospace;">' + escapeAttr(mcpCloudTenantId) + '</span>'
        : '';
      body = urlField +
        '<div style="display:flex;align-items:center;gap:6px;justify-content:space-between;"><span style="' + lS + '">Token</span>' + tenantBadge + '</div>' +
        '<div style="display:flex;align-items:center;gap:6px;background:var(--dm-input-bg);border:1px solid var(--dm-input-border);border-radius:6px;padding:6px 8px;"><code style="font-size:10px;font-family:SF Mono,monospace;color:var(--dm-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">' + escapeAttr(maskToken(mcpCloudToken)) + '</code><button data-dm-action="mcp-cloud-copy-token" title="Copy token" style="background:none;border:none;color:var(--dm-text-secondary);cursor:pointer;display:flex;padding:2px;">' + icon('copy', 11) + '</button></div>' +
        '<div style="display:flex;gap:6px;margin-top:6px;">' +
        '<button data-dm-action="mcp-cloud-copy-config" data-dm-payload="' + escapeAttr(mcpConfig) + '" style="flex:1;padding:6px 8px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:5px;color:var(--dm-text-secondary);cursor:pointer;font-size:9px;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:4px;">' + icon('copy', 10) + ' Copy MCP config</button>' +
        '</div>' +
        '<button data-dm-action="mcp-cloud-revoke" style="margin-top:6px;padding:6px 8px;background:var(--dm-danger-bg);border:1px solid var(--dm-danger-border);border-radius:5px;color:var(--dm-danger);cursor:pointer;font-size:9px;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:4px;">' + icon('trash', 10) + ' Revoke token</button>' +
        '<div style="font-size:9px;color:var(--dm-text-dimmer);margin-top:6px;line-height:1.4;">Side panel must stay open for the agent to reach this browser. Closing the panel pauses cloud calls until you reopen it.</div>';
    }
  }

  // The mode-keyed wrapper id forces morphdom to swap the whole branch
  // on a mode change, instead of trying to diff a number input against
  // a text input across the swap.
  return '<div style="' + sS + '"><div style="' + sT + '">MCP Server</div>' + modeRow +
    '<div id="dm-mcp-mode-' + mcpMode + '" style="display:flex;flex-direction:column;gap:6px;">' + body + '</div></div>';
}

function maskToken(t: string): string {
  if (t.length <= 12) return t;
  return t.slice(0, 6) + '…' + t.slice(-4);
}

// Small pill shown on a change row once an agent moves it off 'todo'.
// 'todo' renders nothing so the default solo-editing view stays clean.
function changeStatusBadge(s?: ChangeStatus): string {
  if (s === 'in_progress') return '<span title="Agent is implementing this" style="background:rgba(245,158,11,0.18);color:#f59e0b;font-size:8px;font-weight:700;padding:1px 5px;border-radius:9999px;flex-shrink:0;text-transform:uppercase;letter-spacing:0.3px;">WIP</span>';
  if (s === 'resolved') return '<span title="Agent marked this done" style="background:rgba(34,197,94,0.18);color:rgb(34,197,94);font-size:8px;font-weight:700;padding:1px 5px;border-radius:9999px;flex-shrink:0;text-transform:uppercase;letter-spacing:0.3px;">DONE</span>';
  return '';
}

// "Set up your agent" — copies the /design-mode workflow command into your
// coding tool. The command body is identical across tools (it drives the
// live MCP tools); only the save path differs, so each row copies the same
// text and names where to drop it.
function renderAgentCommandCard(sS: string, sT: string, lS: string): string {
  const rows = AGENT_TOOLS.map(t =>
    '<div style="display:flex;align-items:center;gap:8px;justify-content:space-between;">' +
    '<div style="min-width:0;"><div style="font-size:11px;color:var(--dm-text-secondary);">' + escapeAttr(t.label) + '</div>' +
    '<code style="font-size:9px;color:var(--dm-text-dimmer);font-family:SF Mono,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block;">' + escapeAttr(t.path) + '</code></div>' +
    '<button data-dm-action="copy-agent-command" data-dm-tool="' + t.key + '" style="flex-shrink:0;padding:5px 8px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:5px;color:var(--dm-text-secondary);cursor:pointer;font-size:9px;font-family:inherit;display:flex;align-items:center;gap:4px;">' + icon('copy', 10) + ' Copy</button>' +
    '</div>'
  ).join('');
  return '<div style="' + sS + '"><div style="' + sT + '">Set up your agent</div>' +
    '<div style="font-size:9px;color:var(--dm-text-dimmer);margin-bottom:8px;line-height:1.4;">Copy the <code style="font-family:SF Mono,monospace;">/design-mode</code> command into your coding tool, then run it after editing. It reads your changes and comments over MCP and resolves them as it works.</div>' +
    '<div style="display:flex;flex-direction:column;gap:8px;">' + rows + '</div></div>';
}

// Dedicated MCP page — opened from the header MCP chip. Surfaces live
// connection status (with refresh), the MCP Server card (mode + config /
// token), and the agent-setup command card. These used to live inside
// Settings; they're MCP/agent concerns, so they get their own home.
function renderMcpView(): string {
  const activeBtn = 'flex:1;padding:5px 8px;background:var(--dm-accent-bg);border:1px solid var(--dm-accent-border);border-radius:5px;color:var(--dm-accent);cursor:pointer;font-size:10px;font-family:inherit;text-transform:uppercase;';
  const inactiveBtn = 'flex:1;padding:5px 8px;background:var(--dm-input-bg);border:1px solid var(--dm-input-border);border-radius:5px;color:var(--dm-text-secondary);cursor:pointer;font-size:10px;font-family:inherit;text-transform:uppercase;';
  const sS = 'background:var(--dm-bg-secondary);border:1px solid var(--dm-separator);border-radius:8px;padding:12px;';
  const sT = 'font-size:11px;font-weight:600;color:var(--dm-text-secondary);margin-bottom:8px;';
  const lS = 'font-size:11px;color:var(--dm-text-muted);';

  const { dotStyle, textColor, label, detail } = mcpStatusDisplay();
  const statusCard = '<div style="' + sS + '">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">' +
    '<div style="display:flex;align-items:center;gap:6px;"><span style="' + dotStyle + '"></span>' +
    '<span style="font-size:12px;font-weight:600;color:' + textColor + ';">' + escapeAttr(label) + '</span></div>' +
    '<button data-dm-action="refresh-mcp" title="Re-ping the MCP server" style="display:flex;align-items:center;gap:4px;padding:5px 8px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:5px;color:var(--dm-text-secondary);cursor:pointer;font-size:10px;font-family:inherit;">' + icon('rotateCw', 11) + ' Refresh status</button>' +
    '</div>' +
    '<div style="font-size:10px;color:var(--dm-text-dim);line-height:1.4;">' + escapeAttr(detail) + '</div>' +
    '</div>';

  return '<div style="padding:16px;">' +
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">' +
    '<button data-dm-action="back-from-mcp" style="background:none;border:none;color:var(--dm-text-secondary);cursor:pointer;display:flex;padding:4px;">' + icon('chevronLeft', 14) + '</button>' +
    '<span style="font-size:14px;font-weight:600;color:var(--dm-text);">MCP</span></div>' +
    '<div style="display:flex;flex-direction:column;gap:12px;">' +
    statusCard +
    renderMcpServerCard(sS, sT, lS, activeBtn, inactiveBtn) +
    renderAgentCommandCard(sS, sT, lS) +
    '</div></div>';
}

function renderSettingsView(): string {
  const cfHex = colorFormat === 'hex';
  const cfRgba = colorFormat === 'rgba';
  const cfHsl = colorFormat === 'hsl';
  const activeBtn = 'flex:1;padding:5px 8px;background:var(--dm-accent-bg);border:1px solid var(--dm-accent-border);border-radius:5px;color:var(--dm-accent);cursor:pointer;font-size:10px;font-family:inherit;text-transform:uppercase;';
  const inactiveBtn = 'flex:1;padding:5px 8px;background:var(--dm-input-bg);border:1px solid var(--dm-input-border);border-radius:5px;color:var(--dm-text-secondary);cursor:pointer;font-size:10px;font-family:inherit;text-transform:uppercase;';
  const themeActive = (m: string) => theme === m ? activeBtn.replace('uppercase','capitalize') : inactiveBtn.replace('uppercase','capitalize');
  const sS = 'background:var(--dm-bg-secondary);border:1px solid var(--dm-separator);border-radius:8px;padding:12px;';
  const sT = 'font-size:11px;font-weight:600;color:var(--dm-text-secondary);margin-bottom:8px;';
  const lS = 'font-size:11px;color:var(--dm-text-muted);';

  return '<div style="padding:16px;">' +
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">' +
    '<button data-dm-action="back-from-settings" style="background:none;border:none;color:var(--dm-text-secondary);cursor:pointer;display:flex;padding:4px;">' + icon('chevronLeft', 14) + '</button>' +
    '<span style="font-size:14px;font-weight:600;color:var(--dm-text);">Settings</span></div>' +
    '<div style="display:flex;flex-direction:column;gap:12px;">' +
    (() => {
      const swatch = (key: string, val: string) =>
        '<div style="display:flex;align-items:center;gap:8px;">' +
          '<span style="font-size:10px;color:var(--dm-text-dim);font-family:SF Mono,Monaco,monospace;text-transform:uppercase;letter-spacing:0.4px;">' + escapeAttr(val.toUpperCase()) + '</span>' +
          '<input type="color" data-dm-setting="' + key + '" value="' + escapeAttr(val) + '" style="width:28px;height:22px;border:1px solid var(--dm-input-border);border-radius:4px;cursor:pointer;background:none;padding:0;"/>' +
        '</div>';
      const row = (label: string, key: string, val: string) =>
        '<div style="display:flex;justify-content:space-between;align-items:center;"><span style="' + lS + '">' + label + '</span>' + swatch(key, val) + '</div>';
      const resetBtn =
        '<button data-dm-action="reset-inspector-overlay-colors" title="Restore default colours" style="display:flex;align-items:center;gap:3px;background:none;border:none;color:var(--dm-text-secondary);cursor:pointer;font-size:10px;font-family:inherit;padding:2px 4px;border-radius:3px;">' +
          icon('rotateCcw', 11) +
          '<span>Reset</span>' +
        '</button>';
      return '<div style="' + sS + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
          '<div style="' + sT + 'margin-bottom:0;">Inspector overlay</div>' +
          resetBtn +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:6px;">' +
          row('Hover color', 'hoverColor', inspectorHoverColor) +
          row('Selection color', 'selectColor', inspectorSelectColor) +
          row('Margin overlay', 'marginColor', overlayMarginColor) +
          row('Padding overlay', 'paddingColor', overlayPaddingColor) +
        '</div>' +
      '</div>';
    })() +
    '<div style="' + sS + '"><div style="' + sT + '">Color Format</div><div style="display:flex;gap:4px;">' +
    '<button data-dm-color-format="hex" style="' + (cfHex ? activeBtn : inactiveBtn) + '">HEX</button>' +
    '<button data-dm-color-format="rgba" style="' + (cfRgba ? activeBtn : inactiveBtn) + '">RGBA</button>' +
    '<button data-dm-color-format="hsl" style="' + (cfHsl ? activeBtn : inactiveBtn) + '">HSL</button>' +
    '</div></div>' +
    '<div style="' + sS + '"><div style="' + sT + '">Input unit</div>' +
    '<div style="font-size:10px;color:var(--dm-text-dim);margin-bottom:8px;">How sizes are shown in the editor — W/H, padding, margin, border-width. The page CSS is unchanged either way; only the display + the value the change tracker stores switches.</div>' +
    '<div style="display:flex;gap:4px;">' +
    '<button data-dm-input-unit="px" style="' + (inputUnit === 'px' ? activeBtn : inactiveBtn) + '">PX</button>' +
    '<button data-dm-input-unit="rem" style="' + (inputUnit === 'rem' ? activeBtn : inactiveBtn) + '">REM</button>' +
    '</div></div>' +
    '<div style="' + sS + '"><div style="' + sT + '">Nudge amount</div>' +
    '<div style="font-size:10px;color:var(--dm-text-dim);margin-bottom:8px;">Shift+Arrow step for number fields in the Design panel. Arrow keys alone nudge by 1.</div>' +
    '<div style="display:flex;align-items:center;gap:6px;">' +
    '<input type="text" data-dm-setting="nudge-amount" data-dm-numeric="1" inputmode="decimal" value="' + escapeAttr(String(nudgeAmount)) + '" style="width:64px;padding:6px 8px;background:var(--dm-input-bg);border:1px solid var(--dm-input-border);border-radius:5px;color:var(--dm-text);font-family:inherit;font-size:11px;"/>' +
    '<span style="font-size:10px;color:var(--dm-text-dim);">px</span>' +
    '</div></div>' +
    '<div style="' + sS + '"><div style="' + sT + '">Page cursor</div>' +
    '<div style="font-size:10px;color:var(--dm-text-dim);margin-bottom:8px;">Show the Design Mode icon as the mouse cursor on the page while the panel is open.</div>' +
    '<div style="display:flex;gap:4px;">' +
    '<button data-dm-custom-cursor="on" style="' + (customCursor ? activeBtn : inactiveBtn) + '">On</button>' +
    '<button data-dm-custom-cursor="off" style="' + (!customCursor ? activeBtn : inactiveBtn) + '">Off</button>' +
    '</div></div>' +
    '<div style="' + sS + '"><div style="' + sT + '">Screenshot Capture</div>' +
    '<div style="font-size:10px;color:var(--dm-text-dim);margin-bottom:8px;">What the camera button does</div>' +
    '<div style="display:flex;gap:4px;">' +
    '<button data-dm-capture-mode="clipboard" style="' + (captureMode === 'clipboard' ? activeBtn : inactiveBtn) + '">Clipboard</button>' +
    '<button data-dm-capture-mode="download" style="' + (captureMode === 'download' ? activeBtn : inactiveBtn) + '">Download</button>' +
    '<button data-dm-capture-mode="both" style="' + (captureMode === 'both' ? activeBtn : inactiveBtn) + '">Both</button>' +
    '</div></div>' +
    '<div style="' + sS + '"><div style="' + sT + '">Theme</div><div style="display:flex;gap:4px;">' +
    '<button data-dm-theme="system" style="' + themeActive('system') + '">System</button>' +
    '<button data-dm-theme="dark" style="' + themeActive('dark') + '">Dark</button>' +
    '<button data-dm-theme="light" style="' + themeActive('light') + '">Light</button></div></div>' +
    // Footer actions — Reset + Shortcuts. Reset wipes the locally-stored
    // settings (theme, color format, capture mode, MCP port + auto-connect,
    // inspector colours) so the next session starts at defaults.
    '<div style="display:flex;gap:6px;margin-top:4px;">' +
    '<button data-dm-action="show-shortcuts" style="flex:1;padding:6px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:6px;color:var(--dm-text-secondary);cursor:pointer;font-size:10px;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:4px;">' + icon('keyboard', 11) + ' Keyboard shortcuts</button>' +
    '<button data-dm-action="reset-settings" style="flex:1;padding:6px;background:var(--dm-danger-bg);border:1px solid var(--dm-danger-border);border-radius:6px;color:var(--dm-danger);cursor:pointer;font-size:10px;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:4px;">' + icon('rotateCcw', 11) + ' Reset settings</button>' +
    '</div>' +
    '</div><div style="margin-top:16px;text-align:center;"><div style="font-size:10px;color:var(--dm-text-dimmer);">Design Mode v' + extensionVersion() + '</div></div></div>';
}

// Read the live manifest version so the Settings footer stays in lockstep
// with the published build — no more hard-coded strings drifting from the
// actual release. Guards for the (impossible in MV3 but cheap) case where
// chrome.runtime is missing so dev / fixture pages don't crash.
function extensionVersion(): string {
  try {
    return chrome?.runtime?.getManifest?.()?.version || '';
  } catch {
    return '';
  }
}

// Pad each label so values line up in the resulting block — the bug template
// placeholder renders this verbatim, so column alignment matters visually.
function pad(label: string): string {
  return (label + ':').padEnd(13, ' ');
}

function detectBrowser(): string {
  type UAData = { brand: string; version: string };
  const nav = navigator as Navigator & { userAgentData?: { brands?: UAData[] } };
  const brands = nav.userAgentData?.brands;
  if (brands && brands.length) {
    const main = brands.find(b => /chrome|chromium|edge|brave/i.test(b.brand) && !/not.*brand/i.test(b.brand)) || brands[0];
    return main.brand + ' ' + main.version;
  }
  const m = navigator.userAgent.match(/(Chrome|Firefox|Safari|Edg)\/([\d.]+)/);
  return m ? m[1] + ' ' + m[2] : navigator.userAgent;
}

function buildDiagnostics(): string {
  const lines = [
    pad('Design Mode') + (extensionVersion() || 'dev'),
    pad('Chrome') + detectBrowser(),
    pad('Platform') + (navigator.platform || 'unknown') + ', ' + (navigator.language || 'unknown'),
    pad('Theme') + resolvedTheme,
  ];
  return lines.join('\n');
}

// Mac shows modifier glyphs (⌘ ⌥ ⇧); other platforms show text chips.
// `ctrl` maps to ⌘ on mac because matchShortcut treats ctrl as ctrlKey||metaKey
// (keyboard-shortcuts.ts), so mac users press Cmd for these.
const IS_MAC = /mac/i.test(
  (navigator as any).userAgentData?.platform || navigator.platform || navigator.userAgent || ''
);

// Format one shortcut's modifiers + key as a row of <kbd> chips.
function shortcutChips(sc: { key: string; modifiers: readonly string[] }): string {
  const modLabel: Record<string, string> = IS_MAC
    ? { alt: '⌥', ctrl: '⌘', meta: '⌘', shift: '⇧' }
    : { alt: 'Alt', ctrl: 'Ctrl', meta: '⌘', shift: 'Shift' };
  const keyLabel: Record<string, string> = { Escape: 'Esc', Delete: 'Del', ArrowUp: '↑', ArrowDown: '↓', Enter: 'Enter' };
  const parts = [...(sc.modifiers || []).map(m => modLabel[m] || m), keyLabel[sc.key] || sc.key.toUpperCase()];
  const kbd = 'display:inline-flex;align-items:center;min-width:18px;height:20px;padding:0 6px;background:var(--dm-input-bg);border:1px solid var(--dm-input-border);border-bottom-width:2px;border-radius:4px;font-size:10px;font-weight:600;font-family:SF Mono,Monaco,monospace;color:var(--dm-text);justify-content:center;';
  // Mac uses glyphs with no separator (⌘⇧Z); other platforms join with "+".
  const sep = IS_MAC ? '<span style="display:inline-block;width:2px;"></span>' : '<span style="color:var(--dm-text-dim);font-size:9px;margin:0 1px;">+</span>';
  return parts.map(p => '<kbd style="' + kbd + '">' + escapeAttr(p) + '</kbd>').join(sep);
}

// Popover card listing every keyboard shortcut, grouped by category — driven
// by DEFAULT_SHORTCUTS so new shortcuts show up automatically. Renders empty
// unless `shortcutsOpen`; the backdrop and ✕ both close it.
// Keys that can't become Chrome-configurable commands: bare keys (Esc/Delete)
// and the page-native undo/redo combos. They render in a separate, clearly
// non-remappable "Fixed" group.
const FIXED_SHORTCUT_ACTIONS = new Set(['deselect', 'delete-element', 'undo', 'redo']);

function renderShortcutsPopover(): string {
  if (!shortcutsOpen) return '';
  const row = (sc: typeof DEFAULT_SHORTCUTS[number]) =>
    '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:5px 0;">' +
    '<span style="font-size:11px;color:var(--dm-text);">' + escapeAttr(sc.label) + '</span>' +
    '<span style="display:inline-flex;align-items:center;flex-shrink:0;">' + shortcutChips(sc) + '</span>' +
    '</div>';
  // Remappable shortcuts, grouped by category.
  const cats: string[] = [];
  const byCat = new Map<string, typeof DEFAULT_SHORTCUTS[number][]>();
  for (const sc of DEFAULT_SHORTCUTS) {
    if (FIXED_SHORTCUT_ACTIONS.has(sc.action)) continue;
    if (!byCat.has(sc.category)) { byCat.set(sc.category, []); cats.push(sc.category); }
    byCat.get(sc.category)!.push(sc);
  }
  const groups = cats.map(cat =>
    '<div style="margin-bottom:12px;">' +
    '<div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--dm-text-dim);margin-bottom:6px;">' + escapeAttr(cat) + '</div>' +
    byCat.get(cat)!.map(row).join('') +
    '</div>'
  ).join('');
  // Fixed group — built-in keys that aren't remappable.
  const fixed = DEFAULT_SHORTCUTS.filter(sc => FIXED_SHORTCUT_ACTIONS.has(sc.action));
  const fixedGroup = fixed.length
    ? '<div style="border-top:1px solid var(--dm-separator);padding-top:10px;">' +
      '<div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--dm-text-dim);margin-bottom:2px;">Fixed</div>' +
      '<div style="font-size:9px;color:var(--dm-text-dimmer);margin-bottom:6px;line-height:1.4;">Built-in keys — not remappable.</div>' +
      fixed.map(row).join('') +
      '</div>'
    : '';
  return '<div data-dm-action="close-shortcuts" style="position:fixed;inset:0;z-index:50;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;padding:16px;">' +
    '<div data-dm-action="noop" data-dm-shortcuts-card style="background:var(--dm-bg);border:1px solid var(--dm-separator-strong);border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,0.4);width:100%;max-width:425px;max-height:80vh;display:flex;flex-direction:column;overflow:hidden;">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid var(--dm-separator);flex-shrink:0;">' +
    '<span style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:var(--dm-text);">' + icon('keyboard', 13) + ' Keyboard shortcuts</span>' +
    '<button data-dm-action="close-shortcuts" aria-label="Close" style="background:none;border:none;color:var(--dm-text-muted);cursor:pointer;display:flex;padding:2px;">' + icon('x', 14) + '</button>' +
    '</div>' +
    '<div style="padding:12px 14px;overflow-y:auto;">' + groups + fixedGroup + '</div>' +
    '</div></div>';
}

function renderHelpView(): string {
  const card = 'background:var(--dm-bg-secondary);border:1px solid var(--dm-separator);border-radius:8px;padding:14px;';
  const primaryBtn = 'display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:10px 12px;background:var(--dm-text);border:1px solid var(--dm-text);border-radius:6px;color:var(--dm-bg);cursor:pointer;font-size:12px;font-weight:600;font-family:inherit;text-decoration:none;';
  const secondaryBtn = 'display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:9px 12px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:6px;color:var(--dm-text-secondary);cursor:pointer;font-size:12px;font-weight:500;font-family:inherit;';
  const linkStyle = 'color:var(--dm-text-secondary);text-decoration:none;font-size:11px;';

  return '<div style="padding:16px;">' +
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">' +
    '<button data-dm-action="back-from-help" style="background:none;border:none;color:var(--dm-text-secondary);cursor:pointer;display:flex;padding:4px;">' + icon('chevronLeft', 14) + '</button>' +
    '<span style="font-size:14px;font-weight:600;color:var(--dm-text);">Help</span></div>' +
    '<div style="display:flex;flex-direction:column;gap:12px;">' +
    '<div style="' + card + '">' +
    '<p style="margin:0 0 12px 0;font-size:12px;line-height:1.5;color:var(--dm-text-secondary);">Found a bug or want to request a feature? File it on GitHub — please include your Chrome version and repro steps.</p>' +
    '<a href="https://github.com/SandeepBaskaran/design-mode/issues/new/choose" target="_blank" rel="noopener noreferrer" style="' + primaryBtn + '">Report an issue ' + icon('externalLink', 12) + '</a>' +
    '<div style="height:8px;"></div>' +
    '<button data-dm-action="copy-diagnostics" style="' + secondaryBtn + '">' + icon('copy', 12) + ' <span data-dm-copy-label>Copy diagnostics</span></button>' +
    '</div>' +
    '<div style="' + card + '"><div style="display:flex;flex-direction:column;gap:8px;">' +
    '<a href="https://github.com/SandeepBaskaran/design-mode#readme" target="_blank" rel="noopener noreferrer" style="' + linkStyle + '">Read the docs ↗</a>' +
    '<a href="https://github.com/SandeepBaskaran/design-mode/blob/main/PRIVACY.md" target="_blank" rel="noopener noreferrer" style="' + linkStyle + '">Privacy ↗</a>' +
    '<a href="mailto:hello@sandeepbaskaran.com" style="' + linkStyle + '">Security disclosure ↗</a>' +
    '</div></div>' +
    '</div>' +
    '<div style="margin-top:16px;text-align:center;"><div style="font-size:10px;color:var(--dm-text-dimmer);">Design Mode v' + extensionVersion() + '</div></div>' +
    '</div>';
}

function renderFileAccessView(): string {
  const card = 'background:var(--dm-bg-secondary);border:1px solid var(--dm-separator);border-radius:8px;padding:14px;';
  const primaryBtn = 'display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:10px 12px;background:var(--dm-text);border:1px solid var(--dm-text);border-radius:6px;color:var(--dm-bg);cursor:pointer;font-size:12px;font-weight:600;font-family:inherit;';
  const step = (text: string) =>
    '<li style="margin:0 0 8px 0;font-size:12px;line-height:1.5;color:var(--dm-text-secondary);">' + text + '</li>';

  return '<div style="padding:16px;">' +
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">' +
    '<span style="display:flex;color:var(--dm-text-secondary);">' + icon('fileText', 14) + '</span>' +
    '<span style="font-size:14px;font-weight:600;color:var(--dm-text);">Local file</span></div>' +
    '<div style="' + card + '">' +
    '<p style="margin:0 0 12px 0;font-size:12px;line-height:1.5;color:var(--dm-text-secondary);">Chrome blocks extensions from local files by default. To edit this file, allow Design Mode to access file URLs:</p>' +
    '<ol style="margin:0 0 12px 0;padding-left:18px;">' +
    step('Open Design Mode’s extension settings — the button below takes you there.') +
    step('Turn on <strong style="color:var(--dm-text);">“Allow access to file URLs”</strong>.') +
    step('Chrome reloads the extension — come back to this tab and reopen the panel.') +
    '</ol>' +
    '<button data-dm-action="open-file-access-settings" style="' + primaryBtn + '">Open extension settings ' + icon('externalLink', 12) + '</button>' +
    '</div>' +
    '</div>';
}

function renderContributeView(): string {
  const card = 'background:var(--dm-bg-secondary);border:1px solid var(--dm-separator);border-radius:8px;padding:14px;';
  const primaryBtn = 'display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:10px 12px;background:var(--dm-text);border:1px solid var(--dm-text);border-radius:6px;color:var(--dm-bg);cursor:pointer;font-size:12px;font-weight:600;font-family:inherit;text-decoration:none;';
  const rowBtn = 'display:flex;align-items:center;gap:10px;width:100%;padding:10px 12px;background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:6px;color:var(--dm-text);cursor:pointer;font-size:12px;font-weight:500;font-family:inherit;text-decoration:none;text-align:left;';
  const rowIcon = 'display:flex;align-items:center;justify-content:center;color:var(--dm-text-secondary);flex-shrink:0;';
  const rowText = 'flex:1;';
  const rowExt = 'color:var(--dm-text-dimmer);display:flex;align-items:center;flex-shrink:0;';
  const sectionLabel = 'font-size:10px;font-weight:600;letter-spacing:0.6px;color:var(--dm-text-dimmer);text-transform:uppercase;margin:0 0 8px 2px;';

  const row = (iconName: keyof typeof icons, label: string, href: string) =>
    '<a href="' + href + '" target="_blank" rel="noopener noreferrer" style="' + rowBtn + '">' +
      '<span style="' + rowIcon + '">' + icon(iconName, 14) + '</span>' +
      '<span style="' + rowText + '">' + label + '</span>' +
      '<span style="' + rowExt + '">' + icon('externalLink', 11) + '</span>' +
    '</a>';

  const shareRow =
    '<button data-dm-action="copy-share-text" style="' + rowBtn + '">' +
      '<span style="' + rowIcon + '">' + icon('share2', 14) + '</span>' +
      '<span style="' + rowText + '" data-dm-share-label>Share with your network</span>' +
      '<span style="' + rowExt + '">' + icon('copy', 11) + '</span>' +
    '</button>';

  const sponsorBtn =
    '<a href="https://github.com/sponsors/SandeepBaskaran" target="_blank" rel="noopener noreferrer" style="' + primaryBtn + '">' +
      icon('heartHandshake', 14) + ' Sponsor on GitHub ' + icon('externalLink', 12) +
    '</a>';

  return '<div style="padding:16px;">' +
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">' +
    '<button data-dm-action="back-from-contribute" style="background:none;border:none;color:var(--dm-text-secondary);cursor:pointer;display:flex;padding:4px;">' + icon('chevronLeft', 14) + '</button>' +
    '<span style="font-size:14px;font-weight:600;color:var(--dm-text);">Contribute</span></div>' +
    '<p style="margin:0 0 18px 2px;font-size:12px;line-height:1.55;color:var(--dm-text-secondary);">Design Mode is free, forever — and open source. If it’s useful to you, here are a few ways to help.</p>' +
    '<div style="display:flex;flex-direction:column;gap:16px;">' +

    '<div><div style="' + sectionLabel + '">Spread the word</div>' +
    '<div style="' + card + '"><div style="display:flex;flex-direction:column;gap:8px;">' +
    row('star', 'Star the repo on GitHub', 'https://github.com/SandeepBaskaran/design-mode') +
    row('messageSquare', 'Review on the Chrome Web Store', 'https://chromewebstore.google.com/detail/design-mode/ighgobegfcmjagombgnfhgioflinojih') +
    row('productHunt', 'Upvote on Product Hunt', 'https://www.producthunt.com/products/design-mode') +
    shareRow +
    '</div></div></div>' +

    '<div><div style="' + sectionLabel + '">Help improve it</div>' +
    '<div style="' + card + '"><div style="display:flex;flex-direction:column;gap:8px;">' +
    row('alertTriangle', 'Report an issue', 'https://github.com/SandeepBaskaran/design-mode/issues/new/choose') +
    row('messageCircle', 'Start a discussion', 'https://github.com/SandeepBaskaran/design-mode/discussions') +
    row('gitPullRequest', 'Open a pull request', 'https://github.com/SandeepBaskaran/design-mode/compare') +
    '</div></div></div>' +

    '<div><div style="' + sectionLabel + '">Support the project</div>' +
    '<div style="' + card + '">' +
    sponsorBtn +
    '<p style="margin:10px 0 0 0;font-size:11px;line-height:1.5;color:var(--dm-text-secondary);">Helps cover Cloud MCP costs (tool-call limits, infra) so those stay generous for everyone.</p>' +
    '</div></div>' +

    '</div>' +
    '<div style="margin-top:18px;text-align:center;"><div style="font-size:10px;color:var(--dm-text-dimmer);">Design Mode v' + extensionVersion() + '</div></div>' +
    '</div>';
}

/* ── Phase 1: Render with morphdom ── */
function renderCaptureToast(): string {
  if (!captureToast) return '';
  const isErr = captureToast.kind === 'error';
  return '<div style="position:fixed;bottom:14px;left:50%;transform:translateX(-50%);padding:8px 14px;border-radius:6px;font-size:11px;font-family:inherit;color:white;background:' + (isErr ? '#dc2626' : '#1f2937') + ';box-shadow:0 4px 12px rgba(0,0,0,0.25);z-index:60;pointer-events:none;white-space:nowrap;">' + escapeAttr(captureToast.text) + '</div>';
}

// Per-tab scroll memory — the tab body element persists across renders
// (morphdom matches by id), so without intervention `scrollTop` carries
// over between tab switches. That feels wrong: each tab is its own
// document and the user expects to land where they last left it. We
// listen to scroll on the body and stash the last position per tab; on
// switch, the new render() restores the destination tab's saved value.
const tabScrollPositions: Partial<Record<Tab, { top: number; left: number }>> = {};
let pendingTabScrollRestore: { top: number; left: number } | null = null;

function ensureTabScrollListener(): void {
  const el = document.getElementById('dm-tab-body');
  if (!el || (el as any).__dmScrollBound) return;
  (el as any).__dmScrollBound = true;
  el.addEventListener('scroll', () => {
    // Don't record while a programmatic restore is in flight; the
    // browser fires `scroll` synchronously when we set scrollTop and we
    // shouldn't overwrite the value we just told it to use.
    if (pendingTabScrollRestore !== null) return;
    tabScrollPositions[tab] = { top: el.scrollTop, left: el.scrollLeft };
  }, { passive: true });
}

function captureTabScroll(): void {
  const el = document.getElementById('dm-tab-body');
  if (el) tabScrollPositions[tab] = { top: el.scrollTop, left: el.scrollLeft };
}

// Keep inspect suspended while a comment composer is open (add / edit /
// region — all gated by `commentMode`), and restore the prior state when it
// closes. Idempotent and driven from render(), so it catches every transition
// without each composer-open/close site having to call it. Only emits a
// message when actually crossing the boundary.
function reconcileInspectWithComment() {
  const composerOpen = commentMode;
  if (composerOpen && !inspectSuspendedForComment) {
    inspectSuspendedForComment = true;
    inspectWasOnBeforeComment = inspecting;
    if (inspecting) { inspecting = false; void send({ type: 'SP_SET_INSPECT', on: false }); }
  } else if (!composerOpen && inspectSuspendedForComment) {
    inspectSuspendedForComment = false;
    if (inspectWasOnBeforeComment) { inspecting = true; void send({ type: 'SP_SET_INSPECT', on: true }); }
  }
}

function render() {
  reconcileInspectWithComment();
  // Capture scroll for the current tab before morphdom runs. morphdom's
  // diff temporarily drops scrollHeight while adding/removing children,
  // which makes the browser clamp scrollTop downward — usually to 0 if a
  // chunk above the viewport detaches. The user-visible symptom: every
  // numeric Arrow keypress (or any applyStyle that triggers render)
  // snaps the design panel to the top. Restoring at the end keeps the
  // view exactly where the user left it.
  captureTabScroll();

  let html: string;

  if (pipPinned && !isPip) {
    // While pinned, this page is only the PiP window's keep-alive opener —
    // the real panel UI lives in the PiP iframe.
    html = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:12px;color:var(--dm-text-secondary);">' +
      '<span style="display:flex;color:var(--dm-text-dim);">' + icon('pictureInPicture2', 24) + '</span>' +
      '<div style="font-size:12px;">Panel is pinned on top</div>' +
      '<button data-dm-action="pip-dock-back-from-launcher" style="background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:5px;color:var(--dm-text-secondary);padding:5px 12px;cursor:pointer;font-family:inherit;font-size:11px;">Back to side panel</button>' +
      '</div>';
  } else if (settingsOpen) {
    html = renderHeader() + renderSettingsView() + renderCaptureToast();
  } else if (mcpOpen) {
    html = renderHeader() + renderMcpView() + renderCaptureToast();
  } else if (helpOpen) {
    html = renderHeader() + renderHelpView() + renderCaptureToast();
  } else if (contributeOpen) {
    html = renderHeader() + renderContributeView() + renderCaptureToast();
  } else if (tokensOpen) {
    html = '<div style="display:flex;flex-direction:column;height:100vh;overflow:hidden;">' +
      renderHeader() + renderTokensView() + renderCaptureToast() + '</div>';
  } else if (fileAccessBlocked) {
    html = renderHeader() + renderFileAccessView() + renderCaptureToast();
  } else {
    let tabContent = '';
    if (tab === 'layers') tabContent = renderLayersTab();
    else if (tab === 'design') tabContent = renderDesignTab();
    else if (tab === 'changes') tabContent = renderChangesTab();

    html = '<div style="display:flex;flex-direction:column;height:100vh;overflow:hidden;position:relative;">' +
      renderHeader() + renderActionRow() + renderCommentCard() + renderTabs() +
      // Layers pans both axes so deep trees stay readable (rows are
      // max-content wide there — see renderLayersTab); other tabs keep
      // horizontal overflow clipped.
      '<div id="dm-tab-body" style="flex:1;' + (tab === 'layers' ? 'overflow:auto;' : 'overflow-y:auto;overflow-x:hidden;') + '">' + tabContent + '</div>' +
      renderStickyBottom() + renderSendAgentHelpOverlay() + renderComputedCssOverlay() + renderCaptureToast() + '</div>';
  }

  // Shortcuts popover floats above whichever view is active.
  html += renderShortcutsPopover();

  // Use morphdom for efficient DOM diffing
  const newRoot = document.createElement('div');
  newRoot.id = 'dm-root';
  newRoot.innerHTML = html;

  morphdom(root, newRoot, {
    onBeforeElUpdated(fromEl, toEl) {
      // Preserve focused inputs and contenteditables across re-render so
      // typing isn't interrupted (cursor position, selection, etc).
      if (fromEl === document.activeElement) {
        if (fromEl.tagName === 'INPUT' || fromEl.tagName === 'TEXTAREA' || fromEl.tagName === 'SELECT') return false;
        if ((fromEl as HTMLElement).isContentEditable) {
          // EXCEPTION: the typography richtext editor stamps the
          // currently-selected element id. When the user hovers/selects
          // a different layer, that id changes — we must let morphdom
          // replace the contenteditable contents so the typography
          // input shows the NEW layer's text instead of the previously
          // edited text. Without this, the input stays stale until the
          // panel is closed and reopened.
          const fromId = (fromEl as HTMLElement).getAttribute('data-dm-element-id');
          const toId = (toEl as HTMLElement).getAttribute('data-dm-element-id');
          if (fromId && toId && fromId !== toId) return true;
          return false;
        }
      }
      return true;
    },
  });

  // Focus comment textarea if comment mode just activated
  if (commentMode) {
    const ta = root.querySelector('[data-dm-comment-input]') as HTMLTextAreaElement;
    if (ta && document.activeElement !== ta) ta.focus();
  }

  // Bind the per-tab scroll listener once the tab body exists, then
  // restore scroll. Tab switches stash the destination tab's value in
  // pendingTabScrollRestore; normal renders fall back to the value we
  // captured at the top of this function. Either way we set
  // pendingTabScrollRestore before assigning scrollTop so the scroll
  // listener's guard (line ~6313) ignores the programmatic write.
  ensureTabScrollListener();
  const restoreTo = pendingTabScrollRestore !== null
    ? pendingTabScrollRestore
    : tabScrollPositions[tab];
  if (restoreTo != null) {
    const el = document.getElementById('dm-tab-body');
    if (el) {
      pendingTabScrollRestore = restoreTo;
      el.scrollTop = restoreTo.top;
      el.scrollLeft = restoreTo.left;
    }
  }
  pendingTabScrollRestore = null;
}

/* ── Phase 1: Event Delegation (bound once, never re-bound) ── */
function setupDelegation() {
  // Padding-pad inputs and the like — focus highlights the cell, blur
  // restores transparency, and on focus we select-all so a single keystroke
  // overwrites the value. Used to live as inline `onfocus="this.select()"`
  // attributes but MV3 CSP blocks inline handlers, so it's delegated here.
  root.addEventListener('focusin', (e) => {
    const t = e.target as HTMLElement;
    if (t.matches?.('[data-dm-pad-field]') && t instanceof HTMLInputElement) {
      t.style.background = 'var(--dm-input-bg)';
      t.select();
    }
  });
  root.addEventListener('focusout', (e) => {
    const t = e.target as HTMLElement;
    if (t.matches?.('[data-dm-pad-field]') && t instanceof HTMLInputElement) {
      t.style.background = 'transparent';
    }
  });

  // Click handler — async because the eyedropper awaits Chrome's
  // EyeDropper.open() promise.
  root.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;

    // Tab switching. When arriving on the Layers tab from somewhere else
    // (e.g. user changed selection on the Design tab), auto-scroll the
    // currently-selected layer into view so the layers list is "ready" —
    // the user shouldn't have to scroll-hunt for what they just picked.
    const tabBtn = target.closest<HTMLElement>('[data-dm-tab]');
    if (tabBtn) {
      const newTab = tabBtn.dataset.dmTab as Tab;
      if (newTab === tab) return;
      // Save the old tab's scroll before swapping so we can return the
      // user to where they were when they come back. Only queue a
      // restore when the destination tab has a remembered position;
      // first-visit tabs keep their natural auto-scroll behaviour
      // (e.g. Layers scrolling the selected layer into view).
      captureTabScroll();
      const savedScroll = tabScrollPositions[newTab];
      if (savedScroll !== undefined) pendingTabScrollRestore = savedScroll;
      tab = newTab;
      if (newTab === 'layers') {
        refreshDomTree().then(() => scrollSelectedLayerIntoView());
      } else if (newTab === 'changes') {
        refreshChanges();
      } else {
        render();
      }
      return;
    }

    // Action buttons
    const actionBtn = target.closest<HTMLElement>('[data-dm-action]');
    if (actionBtn) {
      const act = actionBtn.dataset.dmAction!;
      switch (act) {
        case 'select-parent': selectParent(); break;
        case 'select-child': selectChild(); break;
        case 'duplicate': domAction('duplicate'); break;
        case 'delete': domAction('delete'); break;
        case 'comment': startComment(); break;
        case 'region-comment': startRegionComment(); break;
        case 'screenshot': takeScreenshot(); break;
        case 'download-media': downloadMedia(); break;
        case 'copy-svg-markup': copySvgMarkup(); break;
        case 'undo': undoAction(); break;
        case 'redo': redoAction(); break;
        case 'refresh-mcp': {
          const before = mcpState;
          refreshMcpStatus().then(() => {
            // Toast only when state actually changed — avoids noise on
            // routine clicks. The renderMcpStatus tooltip explains the
            // current state regardless.
            if (mcpState !== before) {
              if (mcpState === 'connected') showCaptureToast('success', 'MCP connected');
              else if (mcpState === 'running') showCaptureToast('success', 'MCP running — waiting for agent');
              else showCaptureToast('error', 'MCP offline');
            } else if (mcpState === 'offline') {
              const cloudMode = mcpMode === 'cloud' || mcpMode === 'self-hosted';
              showCaptureToast('error', cloudMode
                ? (mcpCloudToken ? 'Cloud relay still unreachable.' : 'No cloud token. Click Connect to Cloud below.')
                : 'MCP still offline. Run `npm start --prefix packages/mcp-local`.');
            }
          });
          break;
        }
        case 'copy-prompt': copyPrompt(); break;
        case 'send-to-agent': sendToAgent(); break;
        case 'send-agent-help-close': sendAgentHelpOpen = false; render(); break;
        case 'send-agent-help-mcp': sendAgentHelpOpen = false; helpOpen = false; contributeOpen = false; settingsOpen = false; mcpOpen = true; render(); break;
        case 'toggle-theme': toggleTheme(); break;
        case 'submit-comment': submitComment(); break;
        case 'cancel-comment': cancelComment(); break;
        case 'close-viewing-comment': viewingCommentId = null; render(); break;
        case 'clear-all-changes': clearAllConfirming = true; render(); break;
        case 'cancel-clear-all': clearAllConfirming = false; render(); break;
        case 'confirm-clear-all': clearAllConfirming = false; clearAllChanges(); break;
        case 'toggle-changes-sort': {
          changesSortMenuOpen = !changesSortMenuOpen;
          render();
          break;
        }
        case 'toggle-contrast-settings': {
          contrastSettingsOpen = !contrastSettingsOpen;
          render();
          break;
        }
        case 'reset-inspector-overlay-colors': {
          inspectorHoverColor = '#4F9EFF';
          inspectorSelectColor = '#FF6B35';
          overlayMarginColor = OVERLAY_MARGIN_DEFAULT;
          overlayPaddingColor = OVERLAY_PADDING_DEFAULT;
          chrome.storage?.local?.set?.({
            'dm-inspector-hover-color': inspectorHoverColor,
            'dm-inspector-select-color': inspectorSelectColor,
            'dm-overlay-margin-color': overlayMarginColor,
            'dm-overlay-padding-color': overlayPaddingColor,
          });
          send({ type: 'SP_SET_INSPECTOR_COLORS', hover: inspectorHoverColor, select: inspectorSelectColor });
          render();
          break;
        }
        case 'set-a11y-category': {
          const next = actionBtn.dataset.dmCat;
          if (next === 'auto' || next === 'large' || next === 'normal' || next === 'graphics') {
            a11yCategory = next;
            chrome.storage?.local?.set?.({ 'dm-a11y-category': a11yCategory });
            contrastSettingsOpen = false;
            render();
          }
          break;
        }
        case 'set-a11y-level': {
          const next = actionBtn.dataset.dmLevel;
          if (next === 'AA' || next === 'AAA') {
            a11yLevel = next;
            chrome.storage?.local?.set?.({ 'dm-a11y-level': a11yLevel });
            render();
          }
          break;
        }
        case 'export-changes': {
          // Build a portable JSON payload from the in-memory state. The
          // shape mirrors content/change-tracker's session payload plus a
          // comments array, with a version + url + timestamp envelope so
          // future imports can detect format changes.
          const payload = {
            version: 1,
            kind: 'design-mode-changes',
            exportedAt: Date.now(),
            url: pinnedDomain || '',
            styleChanges,
            textChanges,
            domChanges,
            comments,
          };
          const json = JSON.stringify(payload, null, 2);
          const blob = new Blob([json], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          const a = document.createElement('a');
          a.href = url;
          a.download = `design-mode-changes-${stamp}.json`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          showCaptureToast('success', `Exported ${styleChanges.length + textChanges.length + domChanges.length + comments.length} change${(styleChanges.length + textChanges.length + domChanges.length + comments.length) === 1 ? '' : 's'}.`);
          break;
        }
        case 'revert-selected-changes': {
          // Drive each selected change-id through the existing per-change
          // revert path so undo state and overlay updates flow correctly.
          const ids = [...changesSelected];
          changesSelected.clear();
          (async () => { for (const id of ids) await removeChange(id); })();
          break;
        }
        case 'clear-selected-changes': changesSelected.clear(); render(); break;
        case 'expand-all-groups': changesGroupCollapsed.clear(); render(); break;
        case 'collapse-all-groups': {
          // Re-derive every group key so we can collapse them all in one pass.
          const allKeys = new Set<string>();
          for (const c of styleChanges)   allKeys.add(c.elementId || c.selector || 'unknown');
          for (const c of textChanges)    allKeys.add(c.elementId || c.selector || 'unknown');
          for (const c of domChanges)     allKeys.add(c.elementId || c.selector || 'unknown');
          for (const c of comments)       allKeys.add((c as any).elementId || (c as any).selector || 'unknown');
          allKeys.forEach(k => changesGroupCollapsed.add(k));
          render();
          break;
        }
        case 'clear-changes-search': changesSearch = ''; render(); break;
        case 'reset-changes-filter': changesFilter = 'all'; changesSearch = ''; render(); break;
        case 'back-from-settings': settingsOpen = false; render(); break;
        case 'settings': helpOpen = false; contributeOpen = false; mcpOpen = false; settingsOpen = !settingsOpen; render(); break;
        case 'back-from-mcp': mcpOpen = false; render(); break;
        case 'mcp': settingsOpen = false; helpOpen = false; contributeOpen = false; mcpOpen = !mcpOpen; if (mcpOpen) refreshMcpStatus(); render(); break;
        case 'back-from-help': helpOpen = false; render(); break;
        case 'help': settingsOpen = false; contributeOpen = false; mcpOpen = false; helpOpen = !helpOpen; render(); break;
        case 'back-from-contribute': contributeOpen = false; render(); break;
        case 'open-file-access-settings': chrome.tabs.create({ url: 'chrome://extensions/?id=' + chrome.runtime.id }); break;
        case 'contribute': settingsOpen = false; helpOpen = false; mcpOpen = false; contributeOpen = !contributeOpen; render(); break;
        case 'copy-diagnostics': {
          const payload = buildDiagnostics();
          const flash = (msg: string) => {
            const lbl = document.querySelector('[data-dm-copy-label]') as HTMLElement | null;
            if (!lbl) return;
            const prev = lbl.textContent || 'Copy diagnostics';
            lbl.textContent = msg;
            setTimeout(() => { lbl.textContent = prev; }, 1500);
          };
          navigator.clipboard.writeText(payload).then(
            () => flash('Copied ✓'),
            () => flash('Copy failed'),
          );
          break;
        }
        case 'copy-share-text': {
          const payload = 'I’ve been using Design Mode — a Chrome side-panel extension that lets you live-edit CSS on any page, with MCP support for Claude/Cursor. Free + open source.\nhttps://chromewebstore.google.com/detail/design-mode/ighgobegfcmjagombgnfhgioflinojih';
          const flash = (msg: string) => {
            const lbl = document.querySelector('[data-dm-share-label]') as HTMLElement | null;
            if (!lbl) return;
            const prev = lbl.textContent || 'Share with your network';
            lbl.textContent = msg;
            setTimeout(() => { lbl.textContent = prev; }, 1500);
          };
          navigator.clipboard.writeText(payload).then(
            () => flash('Copied ✓ — paste anywhere'),
            () => flash('Copy failed'),
          );
          break;
        }
        case 'copy-agent-command': {
          const toolKey = actionBtn.dataset.dmTool;
          const tool = AGENT_TOOLS.find(t => t.key === toolKey);
          navigator.clipboard.writeText(AGENT_COMMAND_MARKDOWN).then(
            () => showCaptureToast('success', tool ? 'Copied — save as ' + tool.path : 'Command copied'),
            () => showCaptureToast('error', 'Copy failed'),
          );
          break;
        }
        case 'pop-out': {
          // Open the floating window (background does windows.create), then
          // close this side panel. The tab keeps design mode — background
          // guards the swap so the close doesn't deactivate it.
          send({ type: 'SP_POP_OUT' }).then((r) => { if (r && r.ok) { try { window.close(); } catch {} } });
          break;
        }
        case 'pip-pin': {
          // Floating window only: this window IS the PiP opener — the click
          // gesture flows straight into requestWindow inside openPipWindow.
          openPipWindow();
          break;
        }
        case 'pip-unpin': {
          // Runs inside the PiP iframe. Closing the PiP (same-extension
          // parent) fires the opener's pagehide handler, which restores the
          // floating window.
          try { window.parent.close(); } catch {}
          break;
        }
        case 'dock-back': {
          // chrome.sidePanel.open needs the click's user gesture, so call it
          // FIRST (synchronously, before any await). Then guard the swap and
          // close this floating window.
          if (myTabId != null) { try { (chrome as any).sidePanel?.open({ tabId: myTabId }); } catch {} }
          send({ type: 'SP_TRANSITION_BEGIN' }).finally(() => { try { window.close(); } catch {} });
          break;
        }
        case 'pip-dock-back': {
          // Runs inside the PiP iframe. sidePanel.open needs the gesture, so
          // it goes first. The broadcast tells the floating-window opener to
          // close itself instead of restoring when the PiP dies; the small
          // delay lets that flag land before pagehide fires.
          if (myTabId != null) { try { (chrome as any).sidePanel?.open({ tabId: myTabId }); } catch {} }
          try { new BroadcastChannel('dm-pip-' + myTabId).postMessage('dock-back'); } catch {}
          send({ type: 'SP_TRANSITION_BEGIN' }).finally(() => {
            setTimeout(() => { try { window.parent.close(); } catch {} }, 50);
          });
          break;
        }
        case 'pip-dock-back-from-launcher': {
          if (myTabId != null) { try { (chrome as any).sidePanel?.open({ tabId: myTabId }); } catch {} }
          pipDockingBack = true;
          send({ type: 'SP_TRANSITION_BEGIN' }).finally(() => { try { pipWindow?.close(); } catch {} });
          break;
        }
        case 'show-shortcuts': shortcutsOpen = true; render(); break;
        case 'close-shortcuts': shortcutsOpen = false; render(); break;
        case 'noop': break;
        // Cloud-mode auth flow. Register mints a fresh device token via
        // the cloud server's /auth/register endpoint and stores it locally.
        case 'mcp-cloud-register': {
          if (mcpCloudRegistering) break;
          if (!mcpCloudUrl) { showCaptureToast('error', 'Set a server URL first.'); break; }
          mcpCloudRegistering = true;
          render();
          send({ type: 'SP_MCP_REGISTER_TOKEN', cloudUrl: mcpCloudUrl }).then(r => {
            mcpCloudRegistering = false;
            if (!r?.ok || !r.token) {
              showCaptureToast('error', r?.error || 'Failed to register.');
              render();
              return;
            }
            mcpCloudToken = r.token;
            mcpCloudTenantId = r.tenantId || '';
            chrome.storage?.local?.set?.({
              'dm-mcp-cloud-token': mcpCloudToken,
              'dm-mcp-cloud-tenant': mcpCloudTenantId,
              'dm-mcp-cloud-url': mcpCloudUrl,
              'dm-mcp-mode': mcpMode,
            });
            send({ type: 'SP_RECONFIGURE_TRANSPORT' });
            showCaptureToast('success', 'Cloud token ready. Paste a config snippet into your agent.');
            render();
          });
          break;
        }
        case 'mcp-cloud-copy-token':
          navigator.clipboard.writeText(mcpCloudToken).then(() =>
            showCaptureToast('success', 'Token copied.')
          ).catch(() => showCaptureToast('error', 'Clipboard blocked.'));
          break;
        case 'mcp-cloud-copy-config': {
          const payload = actionBtn.getAttribute('data-dm-payload') || '';
          if (!payload) break;
          // The `escapeAttr` helper produces `&quot;` / `&amp;` / `&lt;` /
          // `&gt;`. Reverse those before pasting into the clipboard.
          const decoded = payload.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
          navigator.clipboard.writeText(decoded).then(() =>
            showCaptureToast('success', 'MCP config copied.')
          ).catch(() => showCaptureToast('error', 'Clipboard blocked.'));
          break;
        }
        case 'mcp-cloud-revoke': {
          if (!mcpCloudToken) break;
          send({ type: 'SP_MCP_REVOKE_TOKEN', cloudUrl: mcpCloudUrl, token: mcpCloudToken }).then(r => {
            mcpCloudToken = '';
            mcpCloudTenantId = '';
            chrome.storage?.local?.remove?.(['dm-mcp-cloud-token', 'dm-mcp-cloud-tenant']);
            send({ type: 'SP_RECONFIGURE_TRANSPORT' });
            showCaptureToast(r?.ok ? 'success' : 'error', r?.ok ? 'Token revoked.' : 'Local token cleared (server may be unreachable).');
            render();
          });
          break;
        }
        // Comment delete-confirm flow.
        case 'cancel-delete-comment-confirm': deletingCommentId = null; render(); break;
        case 'confirm-delete-comment-confirm': {
          if (deletingCommentId) {
            const id = deletingCommentId;
            deletingCommentId = null;
            deleteCommentEntry(id);
          }
          break;
        }
        case 'reset-settings': {
          theme = 'system'; resolveTheme();
          colorFormat = 'hex';
          captureMode = 'clipboard';
          mcpPort = 9960; mcpAutoConnect = true;
          inspectorHoverColor = '#4F9EFF'; inspectorSelectColor = '#FF6B35';
          customCursor = true;
          pipSavedSize = null; pipUnsupported = false;
          chrome.storage?.local?.remove?.([
            'dm-theme', 'dm-color-format', 'dm-capture-mode',
            'dm-mcp-port', 'dm-mcp-auto-connect',
            'dm-inspector-hover-color', 'dm-inspector-select-color',
            'dm-custom-cursor',
            'dm-pip-size', 'dm-pip-unsupported',
          ]);
          showCaptureToast('success', 'Settings reset to defaults');
          render();
          break;
        }
        // Tokens / Design system panel
        case 'open-tokens':
          tokensOpen = true;
          tokensFocusVar = null;
          // Restore the user's last-active tab within the session.
          chrome.storage?.session?.get?.(['dm-tokens-tab'], (r: any) => {
            const t = r?.['dm-tokens-tab'];
            if (t === 'declared' || t === 'detected' || t === 'defined') tokensTab = t;
            render();
          });
          // Force a refetch each time the panel opens — the page may have
          // changed (theme switch, route nav) since the last open.
          designSystem = null;
          refreshDesignSystem(true);
          refreshCustomPresets();
          render();
          break;
        case 'toggle-matching-layers':
          void toggleMatchingLayers((actionBtn as HTMLInputElement).checked);
          break;
        case 'close-tokens':
          tokensOpen = false;
          tokensFocusVar = null;
          render();
          break;
        case 'refresh-tokens':
          designSystem = null;
          refreshDesignSystem(true);
          render();
          break;
        case 'switch-tokens-tab': {
          const next = actionBtn.dataset.tokensTab as TokensTab | undefined;
          if (next === 'declared' || next === 'detected' || next === 'defined') {
            tokensTab = next;
            chrome.storage?.session?.set?.({ 'dm-tokens-tab': tokensTab });
            // Lazy-fetch the Defined list the first time the user opens it.
            if (next === 'defined') refreshCustomPresets();
            render();
          }
          break;
        }
        case 'toggle-component-tokens':
          componentTokensOpen = !componentTokensOpen;
          render();
          break;
        case 'add-preset-open': {
          if (!info) {
            showCaptureToast('error', 'Select an element on the page first.');
            break;
          }
          presetAddingKind = 'typography';
          render();
          // Focus the name input after the re-render.
          setTimeout(() => {
            const inp = root.querySelector<HTMLInputElement>('[data-dm-defined-name]');
            if (inp) { inp.focus(); inp.select(); }
          }, 0);
          break;
        }
        case 'add-preset-cancel': {
          presetAddingKind = null;
          render();
          break;
        }
        case 'add-preset-save': {
          if (!info) { showCaptureToast('error', 'Select an element on the page first.'); break; }
          const kindEl = root.querySelector<HTMLSelectElement>('[data-dm-defined-kind]');
          const nameEl = root.querySelector<HTMLInputElement>('[data-dm-defined-name]');
          const kind = (kindEl?.value || 'typography') as PresetKindLocal;
          const name = (nameEl?.value || '').trim();
          if (!name) {
            showCaptureToast('error', 'Give the preset a name.');
            break;
          }
          const props: string[] = (SECTION_PROPS as Record<string, string[]>)[kind] || [];
          send({ type: 'SP_SAVE_PRESET', name, kind, props }).then((res: any) => {
            if (res?.error) {
              showCaptureToast('error', res.error);
              return;
            }
            showCaptureToast('success', 'Saved "' + name + '".');
            presetAddingKind = null;
            refreshCustomPresets();
          });
          break;
        }
        case 'apply-preset': {
          if (!info) { showCaptureToast('error', 'Select an element on the page first.'); break; }
          const pid = actionBtn.dataset.presetId;
          const preset = customPresets.find(p => p.id === pid);
          if (!preset || !pid) break;
          send({ type: 'SP_APPLY_PRESET', preset }).then((r: any) => {
            if (r?.info) info = r.info;
            if (r?.styleChanges) styleChanges = r.styleChanges;
            if (r?.domChanges) domChanges = r.domChanges;
            if (r?.comments) comments = r.comments;
            if (r?.undoCount != null) undoCount = r.undoCount;
            if (r?.redoCount != null) redoCount = r.redoCount;
            if (r?.groupId) appliedPresetGroups.set(pid, r.groupId);
            render();
          });
          break;
        }
        case 'unapply-preset': {
          const pid = actionBtn.dataset.presetId;
          if (!pid) break;
          const gid = appliedPresetGroups.get(pid);
          if (!gid) break;
          // Same iteration pattern the existing "revert subgroup" button
          // uses (sidepanel.ts:revert-subgroup) — find every style change
          // tagged with this groupId and remove each via SP_REMOVE_CHANGE.
          const ids = styleChanges
            .filter(c => (c as any).groupId === gid)
            .map(c => c.id)
            .filter((x): x is string => !!x);
          Promise.all(ids.map(id => removeChange(id))).then(() => {
            appliedPresetGroups.delete(pid);
            render();
          });
          break;
        }
        case 'delete-preset': {
          const pid = actionBtn.dataset.presetId;
          if (!pid) break;
          send({ type: 'SP_DELETE_PRESET', presetId: pid }).then(() => {
            refreshCustomPresets();
          });
          break;
        }
        case 'tokens-export': {
          if (!designSystem) break;
          const payload = {
            version: 1,
            kind: 'design-mode-design-system',
            url: pinnedDomain || '',
            exportedAt: Date.now(),
            tokens: designSystem.tokens,
            scales: designSystem.scales,
          };
          const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'design-system-' + stamp + '.json';
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          showCaptureToast('success', 'Exported ' + designSystem.tokens.length + ' tokens.');
          break;
        }
        // v1.2: Computed CSS
        case 'view-computed-css': {
          send({ type: 'SP_GET_COMPUTED_CSS' }).then(r => { computedCssText = r?.css || ''; computedCssOpen = true; render(); });
          break;
        }
        case 'close-computed-css': computedCssOpen = false; render(); break;
        case 'copy-computed-css': navigator.clipboard.writeText(computedCssText).catch(() => {}); break;
        // v1.2: Before/After
        case 'preview-original': {
          send({ type: 'SP_PREVIEW_ORIGINAL' }).then(() => { previewingOriginal = true; render(); });
          break;
        }
        case 'restore-changes': {
          send({ type: 'SP_RESTORE_CHANGES' }).then(() => { previewingOriginal = false; render(); });
          break;
        }
        // v1.2: Shadow actions
        case 'add-shadow': applyStyle('boxShadow', '0px 4px 12px 0px rgba(0, 0, 0, 0.12)'); break;
        case 'clear-shadow': applyStyle('boxShadow', 'none'); break;
        case 'preview-animation':
          send({ type: 'SP_PREVIEW_ANIMATION' }).then(() => showCaptureToast('success', 'Animation previewed'));
          break;
        case 'open-in-vscode': {
          const src = (info as any)?.sourceLocation;
          if (src) send({ type: 'SP_OPEN_VSCODE', source: src });
          break;
        }
        case 'clear-multi-select': {
          pushMultiSelectIds([]).then(() => render());
          break;
        }
        case 'toggle-freeze': {
          send({ type: 'SP_TOGGLE_FREEZE' }).then(res => {
            animationsFrozen = !!res.frozen;
            render();
          });
          break;
        }
        case 'preview-transition':
          send({ type: 'SP_PREVIEW_TRANSITION_RULE' }).then(() => showCaptureToast('success', 'Transition previewed'));
          break;
        case 'toggle-aspect-ratio': {
          const cur = (info?.computedStyles?.aspectRatio || 'auto').trim();
          const isSet = cur && cur !== 'auto';
          if (isSet) {
            applyStyle('aspectRatio', 'auto');
          } else {
            const w = parseFloat(info?.computedStyles?.width || '0') || 0;
            const h = parseFloat(info?.computedStyles?.height || '0') || 0;
            if (w > 0 && h > 0) applyStyle('aspectRatio', (w / h).toFixed(4));
            else applyStyle('aspectRatio', '1 / 1');
          }
          break;
        }
        case 'clear-text-shadow': applyStyle('textShadow', 'none'); break;
        // v1.2: Viz
        case 'close-viz': vizProp = null; render(); break;
        case 'apply-viz': {
          if (vizProp) {
            let cssVal: string;
            if (vizMode === 'ease') {
              cssVal = 'all 0.3s cubic-bezier(' + [bezX1,bezY1,bezX2,bezY2].map(v=>v.toFixed(2)).join(', ') + ')';
            } else {
              const dur = Math.max(0.1, 2*Math.PI*Math.sqrt(Math.max(sprMass,0.1)/Math.max(sprStiffness,1))).toFixed(2);
              cssVal = 'all ' + dur + 's ease-in-out';
            }
            applyStyle(vizProp, cssVal);
            vizProp = null; render();
          }
          break;
        }
      }
      return;
    }

    // Per-section reset — drops every change whose property is in the
    // section's prop list, scoped to the currently selected element. The
    // request is fanned out via SP_REMOVE_CHANGE per change so undo/redo
    // and persistence stay coherent.
    const resetBtn = target.closest<HTMLElement>('[data-dm-reset-section]');
    if (resetBtn) {
      e.stopPropagation();
      const key = resetBtn.dataset.dmResetSection!;
      const propSet = new Set(SECTION_PROPS[key] || []);
      const targetId = info?.id;
      const ids = styleChanges
        .filter(c => propSet.has(c.property) && (!targetId || c.elementId === targetId))
        .map(c => c.id || '');
      if (ids.length === 0) return;
      Promise.all(ids.map(id => send({ type: 'SP_REMOVE_CHANGE', changeId: id }))).then(() => {
        refreshChanges();
        send({ type: 'SP_GET_STATE' }); // refresh selected element's computed styles via the next ELEMENT_SELECTED roundtrip
        if (info?.id) selectElement(info.id);
      });
      return;
    }

    // Section toggle (Phase 3B). Skip when the click landed on an action
    // button inside the header (eye / + / advanced / popover) — those have
    // their own handlers and shouldn't also collapse the section.
    const sectionHeader = target.closest<HTMLElement>('[data-dm-toggle-section]');
    if (sectionHeader && !target.closest('button, .dm-section-action, .dm-section-actions')) {
      const sid = sectionHeader.dataset.dmToggleSection!;
      const current = sectionStates[sid];
      const body = root.querySelector('[data-dm-section-body="' + sid + '"]') as HTMLElement;
      // Determine current open state from body class
      const isOpen = current !== undefined ? current : (body ? !body.classList.contains('dm-collapsed') : true);
      sectionStates[sid] = !isOpen;
      // Persist so the user's expand/collapse choices survive panel reloads.
      chrome.storage?.session?.set?.({ 'dm-section-states': sectionStates });
      render();
      return;
    }

    // Layer collapse toggle (Phase 2B)
    const collapseBtn = target.closest<HTMLElement>('[data-dm-toggle-collapse]');
    if (collapseBtn) {
      e.stopPropagation();
      const nodeId = collapseBtn.dataset.dmToggleCollapse!;
      if (collapsedNodes.has(nodeId)) collapsedNodes.delete(nodeId);
      else collapsedNodes.add(nodeId);
      render();
      return;
    }

    // Layer visibility toggle
    const visBtn = target.closest<HTMLElement>('[data-dm-toggle-vis]');
    if (visBtn) {
      e.stopPropagation();
      toggleLayerVisibility(visBtn.dataset.dmToggleVis!);
      return;
    }

    // Scroll-into-view — page-side scroll to bring the element into the viewport.
    const scrollToBtn = target.closest<HTMLElement>('[data-dm-scroll-to]');
    if (scrollToBtn) {
      e.stopPropagation();
      const id = scrollToBtn.dataset.dmScrollTo!;
      send({ type: 'SP_SCROLL_TO_ELEMENT', elementId: id });
      return;
    }

    // Layers-tab filter chip — narrows the list to one bucket.
    const layersFilterBtn = target.closest<HTMLElement>('[data-dm-layers-filter]');
    if (layersFilterBtn) {
      e.stopPropagation();
      layersFilter = layersFilterBtn.dataset.dmLayersFilter as LayersFilter;
      render();
      return;
    }

    // Multi-select bulk actions.
    const bulkBtn = target.closest<HTMLElement>('[data-dm-bulk-action]');
    if (bulkBtn) {
      e.stopPropagation();
      const action = bulkBtn.dataset.dmBulkAction!;
      const ids = [...multiSelectIds];
      if (action === 'show-all') ids.forEach(id => { if (!domTree.find(n => n.id === id)?.isVisible) toggleLayerVisibility(id); });
      else if (action === 'hide-all') ids.forEach(id => { if (domTree.find(n => n.id === id)?.isVisible) toggleLayerVisibility(id); });
      else if (action === 'duplicate-all') ids.forEach(id => duplicateLayer(id));
      else if (action === 'delete-all') ids.forEach(id => deleteLayer(id));
      else if (action === 'clear-selection') { multiSelectIds.length = 0; multiSelectActive = false; tokenUsesActiveVar = null; render(); }
      return;
    }

    // Layer delete
    const delLayerBtn = target.closest<HTMLElement>('[data-dm-delete-layer]');
    if (delLayerBtn) {
      e.stopPropagation();
      deleteLayer(delLayerBtn.dataset.dmDeleteLayer!);
      return;
    }

    // Layer selection — clicking the row selects that element. Modifier
    // keys drive multi-select directly (the old standalone toggle button
    // is gone):
    //   Plain click    → single-select, clear multi, set anchor to id.
    //   Cmd/Ctrl+click → toggle id in the multi-select set. First cmd-
    //                    click seeds the set with the existing anchor so
    //                    the focused layer comes along.
    //   Shift+click    → select the range from the anchor to id in the
    //                    current visible-layer order, union'd with the
    //                    existing set so prior cmd-clicks survive.
    // Skip when the click landed on one of the row's interactive sub-
    // buttons (collapse / visibility / crosshair / delete).
    const layerEl = target.closest<HTMLElement>('[data-dm-layer]');
    if (layerEl && !target.closest('[data-dm-toggle-collapse]') && !target.closest('[data-dm-toggle-vis]') && !target.closest('[data-dm-scroll-to]') && !target.closest('[data-dm-delete-layer]')) {
      const id = layerEl.dataset.dmLayer!;
      handleLayerClick(id, e as MouseEvent);
      return;
    }

    // Comment actions
    const editCommentBtn = target.closest<HTMLElement>('[data-dm-edit-comment]');
    if (editCommentBtn) {
      e.stopPropagation();
      const c = comments.find(cc => cc.id === editCommentBtn.dataset.dmEditComment);
      if (c) editComment(c);
      return;
    }

    const deleteCommentBtn = target.closest<HTMLElement>('[data-dm-delete-comment]');
    if (deleteCommentBtn) {
      e.stopPropagation();
      // Open inline confirmation overlay rather than zero-confirm delete.
      // Esc on the overlay dismisses (handled in keydown).
      deletingCommentId = deleteCommentBtn.dataset.dmDeleteComment!;
      render();
      return;
    }

    // Resolve / unresolve toggle.
    const resolveCommentBtn = target.closest<HTMLElement>('[data-dm-toggle-resolved]');
    if (resolveCommentBtn) {
      e.stopPropagation();
      const cid = resolveCommentBtn.dataset.dmToggleResolved!;
      const c = comments.find(cc => cc.id === cid);
      if (c) {
        const next = !c.resolved;
        c.resolved = next; // Optimistic local update
        send({ type: 'SP_SET_COMMENT_RESOLVED', commentId: cid, resolved: next })
          .then(() => refreshChanges());
        render();
      }
      return;
    }

    const commentItem = target.closest<HTMLElement>('[data-dm-comment-item]');
    if (commentItem && !target.closest('[data-dm-edit-comment]') && !target.closest('[data-dm-delete-comment]') && !target.closest('[data-dm-toggle-resolved]') && !target.closest('input[data-dm-change-checkbox]')) {
      const c = comments.find(cc => cc.id === commentItem.dataset.dmCommentItem);
      if (c) scrollToComment(c);
      return;
    }

    // Changes filter chip — narrows the list to one kind.
    const changesFilterBtn = target.closest<HTMLElement>('[data-dm-changes-filter]');
    if (changesFilterBtn) {
      e.stopPropagation();
      changesFilter = changesFilterBtn.dataset.dmChangesFilter as ChangesFilter;
      render();
      return;
    }
    // Comments resolved sub-filter (Open / Resolved / All).
    const commentsFilterBtn = target.closest<HTMLElement>('[data-dm-comments-filter]');
    if (commentsFilterBtn) {
      e.stopPropagation();
      commentsResolvedFilter = commentsFilterBtn.dataset.dmCommentsFilter as CommentsResolvedFilter;
      render();
      return;
    }
    const statusFilterBtn = target.closest<HTMLElement>('[data-dm-changes-status]');
    if (statusFilterBtn) {
      e.stopPropagation();
      changesStatusFilter = statusFilterBtn.dataset.dmChangesStatus as ChangesStatusFilter;
      render();
      return;
    }
    // Sort option button (inside the popover) — picks an option and closes.
    const sortOptBtn = target.closest<HTMLElement>('[data-dm-changes-sort]');
    if (sortOptBtn) {
      e.stopPropagation();
      changesSort = sortOptBtn.dataset.dmChangesSort as ChangesSort;
      changesSortMenuOpen = false;
      render();
      return;
    }

    // Per-group: Revert all changes in this group.
    const revertGroupBtn = target.closest<HTMLElement>('[data-dm-revert-group]');
    if (revertGroupBtn) {
      e.stopPropagation();
      const key = revertGroupBtn.dataset.dmRevertGroup!;
      revertGroup(key);
      return;
    }

    // Per-subgroup (preset / multi-select fan-out) revert. Loops every
    // StyleChange that shares the groupId and removes each in turn.
    const revertSubgroupBtn = target.closest<HTMLElement>('[data-dm-revert-subgroup]');
    if (revertSubgroupBtn) {
      e.stopPropagation();
      const gid = revertSubgroupBtn.dataset.dmRevertSubgroup!;
      const ids = styleChanges.filter(c => (c as any).groupId === gid).map(c => c.id).filter((x): x is string => !!x);
      Promise.all(ids.map(id => removeChange(id))).then(() => render());
      return;
    }

    // Remove change
    const removeChangeBtn = target.closest<HTMLElement>('[data-dm-remove-change]');
    if (removeChangeBtn) {
      removeChange(removeChangeBtn.dataset.dmRemoveChange!);
      return;
    }

    // Change group toggle (Phase 4A) — but only when the click was on the
    // header itself, not on one of the action buttons (select / copy /
    // revert) the header now carries.
    const changeGroupHeader = target.closest<HTMLElement>('[data-dm-change-group]');
    if (changeGroupHeader && !target.closest('[data-dm-select-change-el], [data-dm-revert-group]')) {
      const key = changeGroupHeader.dataset.dmChangeGroup!;
      if (changesGroupCollapsed.has(key)) changesGroupCollapsed.delete(key);
      else changesGroupCollapsed.add(key);
      render();
      return;
    }

    // Subgroup chevron toggle — collapse / expand the preset / multi-
    // select bundle. Reuses changesGroupCollapsed with a `sub:` prefix so
    // it doesn't collide with element-level group keys.
    const subgroupHeader = target.closest<HTMLElement>('[data-dm-toggle-subgroup]');
    if (subgroupHeader && !target.closest('[data-dm-revert-subgroup]')) {
      e.stopPropagation();
      const subKey = subgroupHeader.dataset.dmToggleSubgroup!;
      if (changesGroupCollapsed.has(subKey)) changesGroupCollapsed.delete(subKey);
      else changesGroupCollapsed.add(subKey);
      render();
      return;
    }

    // Per-row checkbox — toggles the row's id in `changesSelected`. This
    // sits before the select-element handler so checking a box doesn't
    // also focus the element.
    const changeCheckbox = target.closest<HTMLInputElement>('[data-dm-change-checkbox]');
    if (changeCheckbox) {
      e.stopPropagation();
      const cid = changeCheckbox.dataset.dmChangeCheckbox!;
      if (changesSelected.has(cid)) changesSelected.delete(cid);
      else changesSelected.add(cid);
      render();
      return;
    }

    // Select element from change group / change item — but not when the
    // click was on an inner button (zap, trash, checkbox, etc.) which has its own handler.
    const selectChangeEl = target.closest<HTMLElement>('[data-dm-select-change-el]');
    if (selectChangeEl && !target.closest('button[data-dm-batch-apply], button[data-dm-remove-change], button[data-dm-edit-comment], button[data-dm-delete-comment], input[data-dm-change-checkbox]')) {
      e.stopPropagation();
      const elementId = selectChangeEl.dataset.dmSelectChangeEl;
      if (elementId) {
        // If the row is a style change, jump to the right Design-tab
        // section after selection so the user lands on the property
        // they clicked. Lookup uses SECTION_PROPS as the source of truth.
        const propAttr = selectChangeEl.getAttribute('data-dm-change-prop');
        selectElement(elementId).then(() => {
          if (!propAttr) return;
          let sectionKey: string | null = null;
          for (const [k, props] of Object.entries(SECTION_PROPS)) {
            if (props.includes(propAttr)) { sectionKey = k; break; }
          }
          if (!sectionKey) return;
          tab = 'design';
          sectionStates['dm-sec-' + sectionKey] = true;
          chrome.storage?.session?.set?.({ 'dm-section-states': sectionStates });
          render();
          setTimeout(() => {
            const headerEl = root.querySelector<HTMLElement>('[data-dm-toggle-section="dm-sec-' + sectionKey + '"]');
            if (headerEl) headerEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 100);
        });
      }
      return;
    }

    // Theme setting buttons
    const themeBtn = target.closest<HTMLElement>('[data-dm-theme]');
    if (themeBtn) {
      theme = themeBtn.dataset.dmTheme as Theme;
      resolveTheme();
      chrome.storage?.local?.set?.({ 'dm-theme': theme });
      render();
      return;
    }

    // MCP Mode segmented control — Local / Cloud / Self-hosted.
    const mcpModeBtn = target.closest<HTMLElement>('[data-dm-mcp-mode]');
    if (mcpModeBtn) {
      const next = mcpModeBtn.dataset.dmMcpMode as McpMode;
      if (next !== mcpMode) {
        mcpMode = next;
        chrome.storage?.local?.set?.({ 'dm-mcp-mode': mcpMode });
        // Tell the content script to swap transports.
        send({ type: 'SP_RECONFIGURE_TRANSPORT' });
      }
      render();
      return;
    }

    // Color format buttons
    const colorFormatBtn = target.closest<HTMLElement>('[data-dm-color-format]');
    if (colorFormatBtn) {
      colorFormat = colorFormatBtn.dataset.dmColorFormat as ColorFormat;
      chrome.storage?.local?.set?.({ 'dm-color-format': colorFormat });
      render();
      return;
    }

    // Capture mode buttons
    const captureModeBtn = target.closest<HTMLElement>('[data-dm-capture-mode]');
    if (captureModeBtn) {
      captureMode = captureModeBtn.dataset.dmCaptureMode as CaptureMode;
      chrome.storage?.local?.set?.({ 'dm-capture-mode': captureMode });
      render();
      return;
    }

    // Page cursor (on / off) — the content script picks the key up via
    // chrome.storage.onChanged, so writing it is the whole propagation.
    const customCursorBtn = target.closest<HTMLElement>('[data-dm-custom-cursor]');
    if (customCursorBtn) {
      customCursor = customCursorBtn.dataset.dmCustomCursor === 'on';
      chrome.storage?.local?.set?.({ 'dm-custom-cursor': customCursor });
      render();
      return;
    }

    // Input unit (px / rem) — switches the display unit for size-style
    // inputs across the whole panel.
    const inputUnitBtn = target.closest<HTMLElement>('[data-dm-input-unit]');
    if (inputUnitBtn) {
      const next = inputUnitBtn.dataset.dmInputUnit as 'px' | 'rem';
      if (next === 'px' || next === 'rem') {
        inputUnit = next;
        chrome.storage?.local?.set?.({ 'dm-input-unit': inputUnit });
        render();
      }
      return;
    }

    // Align/style buttons with data-dm-prop and data-dm-value
    const propBtn = target.closest<HTMLElement>('button[data-dm-prop]');
    if (propBtn) {
      const prop = propBtn.dataset.dmProp!;
      const val = propBtn.dataset.dmValue;
      if (val !== undefined) applyStyle(prop, val);
      return;
    }

    // v1.2: Viz mode toggle
    const vizModeBtn = target.closest<HTMLElement>('[data-dm-viz-mode]');
    if (vizModeBtn) {
      vizMode = vizModeBtn.dataset.dmVizMode as 'ease' | 'spring';
      render(); return;
    }

    // v1.2: Viz open toggle
    const vizOpenBtn = target.closest<HTMLElement>('[data-dm-viz-open]');
    if (vizOpenBtn) {
      const prop = vizOpenBtn.dataset.dmVizOpen!;
      vizProp = vizProp === prop ? null : prop;
      render(); return;
    }

    // Tokens panel — design-system banner chip toggles a system filter.
    const systemChip = target.closest<HTMLElement>('[data-dm-token-system]');
    if (systemChip) {
      const id = systemChip.dataset.dmTokenSystem!;
      tokenSystemFilter = tokenSystemFilter === id ? null : id;
      render();
      return;
    }

    // Tokens panel — reset a single edited token back to its original value.
    const resetTokenBtn = target.closest<HTMLElement>('[data-dm-token-reset]');
    if (resetTokenBtn) {
      const cssVar = resetTokenBtn.dataset.dmTokenReset!;
      const scopeSelector = resetTokenBtn.dataset.dmTokenScope || ':root';
      editedTokens.delete(tokenEditKey(scopeSelector, cssVar));
      send({ type: 'SP_RESET_ROOT_VAR', cssVar, scopeSelector }).then((r: any) => {
        if (r?.tokenChanges) tokenChanges = r.tokenChanges;
        designSystem = null;
        refreshDesignSystem();
      });
      return;
    }
    // Tokens panel — "uses" badge highlights every element on the page that
    // resolves to this token via the existing multi-select overlay system.
    const findUsesBtn = target.closest<HTMLElement>('[data-dm-token-find-uses]');
    if (findUsesBtn) {
      const cssVar = findUsesBtn.dataset.dmTokenFindUses!;
      // Second click on the active chip clears the highlight.
      if (tokenUsesActiveVar === cssVar) {
        tokenUsesActiveVar = null;
        multiSelectIds = [];
        multiSelectActive = false;
        send({ type: 'SP_SET_MULTI_SELECT_IDS', ids: [] }).then(() => render());
        return;
      }
      send({ type: 'SP_GET_TOKEN_USAGES', cssVar }).then((r: { ids?: string[] }) => {
        const ids: string[] = r?.ids || [];
        if (!ids.length) {
          showCaptureToast('error', 'No on-page consumers of ' + cssVar);
          return;
        }
        send({ type: 'SP_SET_MULTI_SELECT_IDS', ids }).then(() => {
          multiSelectActive = true;
          multiSelectIds = ids;
          tokenUsesActiveVar = cssVar;
          showCaptureToast('success', ids.length + ' element' + (ids.length === 1 ? '' : 's') + ' using ' + cssVar);
          render();
        });
      });
      return;
    }

    // Pick color from dropdown
    const pickColorBtn = target.closest<HTMLElement>('[data-dm-pick-color]');
    if (pickColorBtn) {
      const val = pickColorBtn.dataset.dmPickColor!;
      const prop = pickColorBtn.dataset.dmPickProp!;
      activeColorPickerProp = null;
      tokensDropdownProp = null;
      colorPickerSearch = '';
      applyStyle(prop, val);
      return;
    }

    // Pick token from the swap-token dropdown (non-color groups)
    const pickTokenBtn = target.closest<HTMLElement>('[data-dm-pick-token]');
    if (pickTokenBtn) {
      const val = pickTokenBtn.dataset.dmPickToken!;
      const prop = pickTokenBtn.dataset.dmPickProp!;
      tokenPickerProp = null;
      tokenBadgeMenuProp = null;
      applyStyle(prop, val);
      return;
    }

    // Token badge menu actions: swap / edit globally / detach
    const tokenActionBtn = target.closest<HTMLElement>('[data-dm-token-action]');
    if (tokenActionBtn) {
      const action = tokenActionBtn.dataset.dmTokenAction!;
      const prop = tokenActionBtn.dataset.dmTokenProp!;
      const cssVar = tokenActionBtn.dataset.dmTokenVar!;
      const tokenScope = tokenActionBtn.dataset.dmTokenScope || ':root';
      tokenBadgeMenuProp = null;
      if (action === 'swap') {
        if (tokenGroupForProp(prop) === 'colour') tokensDropdownProp = prop;
        else tokenPickerProp = prop;
      } else if (action === 'edit') {
        tokenPickerProp = null;
        tokensOpen = true;
        settingsOpen = false;
        helpOpen = false;
        mcpOpen = false;
        tokensTab = 'declared';
        tokensFocusVar = cssVar;
        // Pin the panel to the scope this element resolves the token
        // through — the same token exists on every theme, and editing any
        // other scope's copy would leave this element unchanged.
        tokenScopeFilter = tokenScope;
        tokenSearch = cssVar;
        tokenFilter = 'all';
        tokenSystemFilter = null;
        tokenUsedOnlyFilter = false;
        componentTokensOpen = true;
        designSystem = null;
        refreshDesignSystem().then(() => scrollFocusedTokenIntoView());
      } else if (action === 'detach') {
        // computedStyles only carries longhands, so the uniform
        // padding / margin fields rebuild their shorthand from the sides.
        const cs = info?.computedStyles;
        const resolved = (prop === 'padding' || prop === 'margin')
          ? ['Top', 'Right', 'Bottom', 'Left'].map(s => cs?.[prop + s] || '').filter(Boolean).join(' ')
          : (cs?.[prop] || '');
        if (resolved) applyStyle(prop, resolved);
      }
      render();
      return;
    }

    // Token badge — toggles its menu
    const tokenBadgeBtn = target.closest<HTMLElement>('[data-dm-token-badge]');
    if (tokenBadgeBtn) {
      const prop = tokenBadgeBtn.dataset.dmTokenBadge!;
      const wasOpen = tokenBadgeMenuProp === prop || tokenPickerProp === prop;
      tokenBadgeMenuProp = wasOpen ? null : prop;
      tokenPickerProp = null;
      render();
      return;
    }

    // Color trigger swatch — toggles the picker. Clicking the same
    // swatch twice closes it (matches the popover's click-outside
    // behaviour so users don't have to aim at empty space).
    const colorTrigger = target.closest<HTMLElement>('[data-dm-color-trigger]');
    if (colorTrigger) {
      const prop = colorTrigger.dataset.dmColorTrigger!;
      if (activeColorPickerProp === prop) {
        activeColorPickerProp = null;
        tokensDropdownProp = null;
        colorPickerSearch = '';
        render();
        return;
      }
      activeColorPickerProp = prop;
      colorPickerSearch = '';
      render();
      // After the picker re-renders, focus the hex input inside it so the
      // user can type a value immediately. The swatch trigger itself is a
      // <button> (no .select() / .value), so we query the hex input by its
      // data attribute instead.
      setTimeout(() => {
        const inp = root.querySelector<HTMLInputElement>('input[data-dm-color-hex="' + prop + '"]');
        if (inp) {
          inp.focus();
          inp.select();
        }
      }, 0);
      return;
    }

    // Close the contrast settings popover when a click lands outside it
    // (and outside its trigger button). Set/category actions handle their
    // own close inside the action switch above.
    if (contrastSettingsOpen && !target.closest('[data-dm-contrast-settings]') && !target.closest('[data-dm-action="toggle-contrast-settings"]')) {
      contrastSettingsOpen = false;
      render();
    }

    // Click outside any color popover closes it
    if (activeColorPickerProp && !target.closest('[data-dm-color-popover]') && !target.closest('[data-dm-color-trigger]')) {
      activeColorPickerProp = null;
      colorPickerSearch = '';
      contrastSettingsOpen = false;
      render();
    }

    // Click outside the token badge menu / swap picker closes them
    if ((tokenBadgeMenuProp || tokenPickerProp) &&
      !target.closest('[data-dm-token-menu]') && !target.closest('[data-dm-token-picker]') && !target.closest('[data-dm-token-badge]')) {
      tokenBadgeMenuProp = null;
      tokenPickerProp = null;
      render();
    }

    // Format cycle inside the color panel: HEX → RGB → HSL → HEX.
    const cycleFmtBtn = target.closest<HTMLElement>('[data-dm-cycle-color-format]');
    if (cycleFmtBtn) {
      e.stopPropagation();
      colorFormat = colorFormat === 'hex' ? 'rgba' : colorFormat === 'rgba' ? 'hsl' : 'hex';
      render();
      return;
    }

    // Eyedropper — Chrome's built-in EyeDropper API. Falls back to a
    // friendly alert when unsupported (Firefox / Safari today).
    const eyedropBtn = target.closest<HTMLElement>('[data-dm-eyedropper]');
    if (eyedropBtn) {
      e.stopPropagation();
      const prop = eyedropBtn.dataset.dmEyedropper!;
      const ED = (window as any).EyeDropper;
      if (typeof ED !== 'function') {
        alert('Eyedropper requires Chrome 95+ or any Chromium-based browser.');
        return;
      }
      try {
        const result = await new ED().open();
        if (result?.sRGBHex) applyStyle(prop, result.sRGBHex);
      } catch {
        // User dismissed the picker — silently ignore.
      }
      return;
    }

    // Click outside the Figma-style popovers (sides, effects-add) closes
    // them. Triggers themselves were intercepted earlier so reaching here
    // means the click was outside both the popover body and its trigger.
    if ((sidesPopoverOpen || effectsMenuOpen || motionMenuOpen) && !target.closest('.dm-popover') && !target.closest('[data-dm-sides-popover]') && !target.closest('[data-dm-effects-menu]') && !target.closest('[data-dm-motion-menu]')) {
      sidesPopoverOpen = false;
      effectsMenuOpen = false;
      motionMenuOpen = false;
      render();
    }
    // Same outside-click behaviour for the Changes-tab sort popover.
    if (changesSortMenuOpen && !target.closest('[data-dm-changes-sort-menu]') && !target.closest('[data-dm-action="toggle-changes-sort"]')) {
      changesSortMenuOpen = false;
      render();
    }

    // (Apply-page-token / token-group-accordion handlers removed — page
    // tokens used to back the Built-in tab; tokens now live inline on
    // every colour input via the focus-driven dropdown. The
    // SP_APPLY_TOKEN message is unused but harmless if the background /
    // content scripts still implement it.)

    // v1.2: Border link toggle
    const borderLinkBtn = target.closest<HTMLElement>('[data-dm-border-link]');
    if (borderLinkBtn) {
      e.stopPropagation();
      const key = borderLinkBtn.dataset.dmBorderLink!;
      if (key === 'width') borderWidthLinked = !borderWidthLinked;
      else if (key === 'style') borderStyleLinked = !borderStyleLinked;
      else if (key === 'color') borderColorLinked = !borderColorLinked;
      else if (key === 'radius') cornerRadiusLinked = !cornerRadiusLinked;
      render(); return;
    }

    // ─── Figma-style controls ───
    // Section action toggles (corner expand/link, advanced toggle, sides /
    // effects popovers, eye toggles). Stop propagation so clicking an
    // action doesn't also fire the surrounding section's collapse/expand.
    const spacingExpandBtn = target.closest<HTMLElement>('[data-dm-spacing-expand]');
    if (spacingExpandBtn) {
      e.stopPropagation();
      if (spacingExpandBtn.dataset.dmSpacingExpand === 'margin') marginExpanded = !marginExpanded;
      else paddingExpanded = !paddingExpanded;
      render();
      return;
    }
    const cornerExpandBtn = target.closest<HTMLElement>('[data-dm-corner-expand]');
    if (cornerExpandBtn) { e.stopPropagation(); cornerRadiusExpanded = !cornerRadiusExpanded; render(); return; }

    const cornerLinkBtn = target.closest<HTMLElement>('[data-dm-corner-link]');
    if (cornerLinkBtn) { e.stopPropagation(); cornerRadiusLinked = !cornerRadiusLinked; render(); return; }

    const advancedToggle = target.closest<HTMLElement>('[data-dm-advanced-toggle]');
    if (advancedToggle) {
      e.stopPropagation();
      const key = advancedToggle.dataset.dmAdvancedToggle!;
      advancedOpen[key] = !advancedOpen[key];
      render(); return;
    }

    const sidesPopBtn = target.closest<HTMLElement>('[data-dm-sides-popover]');
    if (sidesPopBtn) { e.stopPropagation(); sidesPopoverOpen = !sidesPopoverOpen; render(); return; }

    const effectsMenuBtn = target.closest<HTMLElement>('[data-dm-effects-menu]');
    if (effectsMenuBtn) { e.stopPropagation(); effectsMenuOpen = !effectsMenuOpen; motionMenuOpen = false; render(); return; }
    const motionMenuBtn = target.closest<HTMLElement>('[data-dm-motion-menu]');
    if (motionMenuBtn) { e.stopPropagation(); motionMenuOpen = !motionMenuOpen; effectsMenuOpen = false; render(); return; }

    // Position alignment buttons. Pragmatic CSS mapping: dispatch to
    // align-self/justify-self for flex|grid parents, top/left + translate
    // for absolute/fixed positioning, and margin auto for plain block.
    const posAlignBtn = target.closest<HTMLElement>('[data-dm-pos-align]');
    if (posAlignBtn) {
      e.stopPropagation();
      const which = posAlignBtn.dataset.dmPosAlign!;
      const s = info?.computedStyles || {};
      const ctx = detectParentContext(info, s);
      applyPositionAlign(which, ctx);
      return;
    }

    // Flip H / Flip V — toggle sign of the corresponding axis on the
    // `scale` longhand (preserve the other axis).
    const flipBtn = target.closest<HTMLElement>('[data-dm-flip]');
    if (flipBtn) {
      e.stopPropagation();
      const axis = flipBtn.dataset.dmFlip!;
      const s = info?.computedStyles || {};
      const scale = (s.scale || '').trim();
      const parts = (scale === 'none' || !scale) ? ['1','1'] : scale.split(/\s+/);
      let sx = parseFloat(parts[0] || '1') || 1;
      let sy = parseFloat(parts[1] || parts[0] || '1') || sx;
      if (axis === 'h') sx = -sx; else if (axis === 'v') sy = -sy;
      applyStyle('scale', sx + ' ' + sy);
      return;
    }

    // Layout mode segmented control.
    const layoutModeBtn = target.closest<HTMLElement>('[data-dm-layout-mode]');
    if (layoutModeBtn) {
      e.stopPropagation();
      const mode = layoutModeBtn.dataset.dmLayoutMode!;
      const cur = info?.computedStyles || {};
      if (mode === 'free') {
        applyStyle('display', 'block');
      } else if (mode === 'hstack') {
        applyStyle('display', 'flex');
        applyStyle('flexDirection', 'row');
      } else if (mode === 'vstack') {
        applyStyle('display', 'flex');
        applyStyle('flexDirection', 'column');
      } else if (mode === 'grid') {
        applyStyle('display', 'grid');
        // Prefill `grid-template-columns: 1fr 1fr` so the grid is visible
        // immediately. Only seeded when no template exists — never clobbers.
        const cols = cur.gridTemplateColumns || 'none';
        if (!cols || cols === 'none') applyStyle('gridTemplateColumns', '1fr 1fr');
      }
      return;
    }

    // Rotate ±90° quick buttons. Reads current `rotate` longhand, increments
    // by the requested step, writes back. Wraps within (-360, 360).
    const rotateStepBtn = target.closest<HTMLElement>('[data-dm-rotate-step]');
    if (rotateStepBtn) {
      e.stopPropagation();
      const step = parseFloat(rotateStepBtn.dataset.dmRotateStep || '0');
      const cur = parseFloat((info?.computedStyles?.rotate || '0').replace('deg','')) || 0;
      const next = ((cur + step) % 360 + 360) % 360;
      applyStyle('rotate', next + 'deg');
      return;
    }

    // Transform-origin 9-cell pad — writes the keyword pair (e.g. `top left`).
    const tOriginBtn = target.closest<HTMLElement>('[data-dm-transform-origin]');
    if (tOriginBtn) {
      e.stopPropagation();
      const val = tOriginBtn.dataset.dmTransformOrigin!;
      applyStyle('transformOrigin', val);
      return;
    }

    // Z-order ±1 step (Bring forward / Send backward).
    const zStepBtn = target.closest<HTMLElement>('[data-dm-z-step]');
    if (zStepBtn) {
      e.stopPropagation();
      const dir = zStepBtn.dataset.dmZStep === 'up' ? 1 : -1;
      const raw = info?.computedStyles?.zIndex || 'auto';
      const cur = (raw === 'auto' || raw === '') ? 0 : (parseInt(raw, 10) || 0);
      applyStyle('zIndex', String(cur + dir));
      return;
    }

    // Distribute (multi-select) — writes the parent's justify-content /
    // align-content via the SP_APPLY_PARENT_STYLE pipe (assumes parent gets
    // flex/grid). For the v1 path, we just write justify-content on the
    // parent of the focused element to space-between.
    const posDistBtn = target.closest<HTMLElement>('[data-dm-pos-distribute]');
    if (posDistBtn) {
      e.stopPropagation();
      const which = posDistBtn.dataset.dmPosDistribute!;
      send({ type: 'SP_APPLY_PARENT_STYLE',
        property: which === 'horizontal' ? 'justifyContent' : 'alignContent',
        value: 'space-between' });
      return;
    }

    // 9-cell children alignment pad — writes to the X / Y axis CSS as
    // resolved by axesForContainer(), which flips the property mapping for
    // flex-column (where justify-content drives Y, not X).
    const childAlignBtn = target.closest<HTMLElement>('[data-dm-children-align]');
    if (childAlignBtn) {
      e.stopPropagation();
      const cell = childAlignBtn.dataset.dmChildrenAlign!;
      const [h, v] = cell.split('-');
      const hMap: Record<string, string> = { left: 'flex-start', center: 'center', right: 'flex-end' };
      const vMap: Record<string, string> = { top: 'flex-start', center: 'center', bottom: 'flex-end' };
      const { xProp, yProp } = axesForContainer(info?.computedStyles || {});
      applyStyle(xProp, hMap[h] || 'flex-start');
      applyStyle(yProp, vMap[v] || 'flex-start');
      return;
    }

    // Typography style toggles — bold / italic / underline / strikethrough.
    // Each flips between an "off" and "on" CSS value.
    const textToggleBtn = target.closest<HTMLElement>('[data-dm-text-toggle]');
    if (textToggleBtn) {
      e.stopPropagation();
      const which = textToggleBtn.dataset.dmTextToggle!;
      const s = info?.computedStyles || {};
      if (which === 'bold') {
        const cur = s.fontWeight || '400';
        const isBold = cur === '700' || cur === 'bold' || (parseInt(cur, 10) || 400) >= 600;
        applyStyle('fontWeight', isBold ? '400' : '700');
      } else if (which === 'italic') {
        applyStyle('fontStyle', s.fontStyle === 'italic' ? 'normal' : 'italic');
      } else if (which === 'underline') {
        const cur = s.textDecorationLine || 'none';
        const has = cur.includes('underline');
        const next = has ? cur.replace('underline','').trim() || 'none' : (cur === 'none' ? 'underline' : (cur + ' underline').trim());
        applyStyle('textDecorationLine', next);
      } else if (which === 'strikethrough') {
        const cur = s.textDecorationLine || 'none';
        const has = cur.includes('line-through');
        const next = has ? cur.replace('line-through','').trim() || 'none' : (cur === 'none' ? 'line-through' : (cur + ' line-through').trim());
        applyStyle('textDecorationLine', next);
      }
      return;
    }

    // List style — writes list-style-type.
    const listStyleBtn = target.closest<HTMLElement>('[data-dm-list-style]');
    if (listStyleBtn) {
      e.stopPropagation();
      const v = listStyleBtn.dataset.dmListStyle!;
      applyStyle('listStyleType', v);
      return;
    }

    // Typography one-click actions (Advanced disclosure).
    const typoActionBtn = target.closest<HTMLElement>('[data-dm-typo-action]');
    if (typoActionBtn) {
      e.stopPropagation();
      const action = typoActionBtn.dataset.dmTypoAction!;
      if (action === 'truncate') {
        // Single-line truncate preset. Three writes that together produce
        // the standard "ellipsis when overflowed" behaviour on a one-line
        // text container.
        applyStyle('textOverflow', 'ellipsis');
        applyStyle('whiteSpace', 'nowrap');
        applyStyle('overflow', 'hidden');
      }
      return;
    }

    // ─── Fill layered list ───
    // All Fill mutations operate on `fillLayersByElement` (the per-element
    // state), then dispatch the four comma-positional CSS properties at
    // once via dispatchFillLayers.
    const fillElIdNow = (): string => info?.id || '';
    const getFill = (): FillLayer[] => {
      const id = fillElIdNow();
      if (!id) return [];
      return getFillLayers(id, info?.computedStyles || {});
    };
    const setFill = (next: FillLayer[]): void => {
      const id = fillElIdNow();
      if (!id) return;
      fillLayersByElement.set(id, next);
      dispatchFillLayers(next, applyStyle);
    };

    const fillAddOpenBtn = target.closest<HTMLElement>('[data-dm-fill-add-open]');
    if (fillAddOpenBtn) { e.stopPropagation(); fillAddOpen = !fillAddOpen; render(); return; }

    const fillAddBtn = target.closest<HTMLElement>('[data-dm-fill-add]');
    if (fillAddBtn) {
      e.stopPropagation();
      const kind = fillAddBtn.dataset.dmFillAdd!;
      const layers = getFill();
      if (layers.length >= FILL_LIMIT) {
        showCaptureToast('error', 'Fill limit reached (' + FILL_LIMIT + ' layers).');
        return;
      }
      let newLayer: FillLayer | null = null;
      if (kind === 'solid') {
        newLayer = { kind: 'solid', raw: '#FFFFFF', visible: true };
      } else if (kind === 'linear') {
        newLayer = { kind: 'linear', raw: 'linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(0,0,0,1) 100%)', visible: true, size: 'auto', repeat: 'no-repeat', position: '0% 0%', blendMode: 'normal' };
      } else if (kind === 'radial') {
        newLayer = { kind: 'radial', raw: 'radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(0,0,0,1) 100%)', visible: true, size: 'auto', repeat: 'no-repeat', position: '0% 0%', blendMode: 'normal' };
      } else if (kind === 'conic') {
        newLayer = { kind: 'conic', raw: 'conic-gradient(from 0deg, rgba(255,0,0,1) 0%, rgba(0,255,0,1) 33%, rgba(0,0,255,1) 66%, rgba(255,0,0,1) 100%)', visible: true, size: 'auto', repeat: 'no-repeat', position: '0% 0%', blendMode: 'normal' };
      } else if (kind === 'image') {
        newLayer = { kind: 'image', raw: 'url(https://images.unsplash.com/photo-1502744688674-c619d1586c9e?auto=format&fit=crop&w=400)', visible: true, size: 'cover', repeat: 'no-repeat', position: '50% 50%', blendMode: 'normal' };
      }
      if (newLayer) {
        // Every new fill goes to the TOP of the stack (array index 0)
        // so the user sees what they just added. Solid stacking is
        // supported by the serializer — bottom-most solid wins the
        // `background-color` slot, extras encode as single-color
        // linear gradients in `background-image`.
        const next = [newLayer, ...layers];
        setFill(next);
        // Auto-expand only for non-solid layers (those use the
        // settings-icon drawer to edit gradients / image URL). Solid
        // fills use the inline row, no expansion needed.
        expandedFillIdx = newLayer.kind === 'solid' ? null : 0;
      }
      fillAddOpen = false;
      return;
    }

    const fillRemoveBtn = target.closest<HTMLElement>('[data-dm-fill-remove]');
    if (fillRemoveBtn) {
      e.stopPropagation();
      const idx = parseInt(fillRemoveBtn.dataset.dmFillRemove || '-1', 10);
      const layers = getFill();
      if (idx >= 0 && idx < layers.length) {
        layers.splice(idx, 1);
        setFill(layers);
        if (expandedFillIdx === idx) expandedFillIdx = null;
      }
      return;
    }

    const fillExpandBtn = target.closest<HTMLElement>('[data-dm-fill-expand]');
    if (fillExpandBtn) {
      e.stopPropagation();
      const idx = parseInt(fillExpandBtn.dataset.dmFillExpand || '-1', 10);
      expandedFillIdx = expandedFillIdx === idx ? null : idx;
      render(); return;
    }

    // Per-fill visibility toggle — flips layer.visible and re-dispatches.
    const fillToggleBtn = target.closest<HTMLElement>('[data-dm-fill-toggle]');
    if (fillToggleBtn) {
      e.stopPropagation();
      const idx = parseInt(fillToggleBtn.dataset.dmFillToggle || '-1', 10);
      const layers = getFill();
      if (idx >= 0 && idx < layers.length) {
        layers[idx].visible = layers[idx].visible === false ? true : false;
        setFill(layers);
      }
      return;
    }

    // Image fill 4-mode segmented — atomically writes {size, repeat}.
    const fitBtn = target.closest<HTMLElement>('[data-dm-fill-fit-mode]');
    if (fitBtn) {
      e.stopPropagation();
      const mode = fitBtn.dataset.dmFillFitMode!;
      const fitIdx = parseInt(fitBtn.dataset.dmFillFitIdx || '-1', 10);
      const layers = getFill();
      if (layers[fitIdx]) {
        const presets: Record<string, { size: string; repeat: string }> = {
          fill: { size: 'cover', repeat: 'no-repeat' },
          fit:  { size: 'contain', repeat: 'no-repeat' },
          crop: { size: '100% 100%', repeat: 'no-repeat' },
          tile: { size: 'auto', repeat: 'repeat' },
        };
        const p = presets[mode];
        if (p) {
          layers[fitIdx].size = p.size;
          layers[fitIdx].repeat = p.repeat;
          setFill(layers);
        }
      }
      return;
    }

    // 9-cell position pad — writes "X% Y%" to the layer's position slot.
    const posCellBtn = target.closest<HTMLElement>('[data-dm-fill-pos-cell]');
    if (posCellBtn) {
      e.stopPropagation();
      const pos = posCellBtn.dataset.dmFillPosCell!;
      const posIdx = parseInt(posCellBtn.dataset.dmFillPosIdx || '-1', 10);
      const layers = getFill();
      if (layers[posIdx]) {
        layers[posIdx].position = pos;
        setFill(layers);
      }
      return;
    }

    // Per-fill stop add / remove (gradient layers).
    const stopAddBtn = target.closest<HTMLElement>('[data-dm-fill-stop-add]');
    if (stopAddBtn) {
      e.stopPropagation();
      const idx = parseInt(stopAddBtn.dataset.dmFillStopAdd || '-1', 10);
      const layers = getFill();
      const layer = layers[idx];
      if (layer && (layer.kind === 'linear' || layer.kind === 'radial' || layer.kind === 'conic')) {
        const parsed = parseGradientStops(layer.raw);
        parsed.stops.push({ color: 'rgba(0,0,0,1)', position: '100%' });
        layer.raw = buildGradient(layer.kind, parsed.prefix, parsed.stops);
        setFill(layers);
      }
      return;
    }
    const stopRemoveBtn = target.closest<HTMLElement>('[data-dm-fill-stop-remove]');
    if (stopRemoveBtn) {
      e.stopPropagation();
      const tok = stopRemoveBtn.dataset.dmFillStopRemove || '';
      const m = tok.match(/^(\d+)_(\d+)$/);
      if (m) {
        const idx = parseInt(m[1], 10);
        const sIdx = parseInt(m[2], 10);
        const layers = getFill();
        const layer = layers[idx];
        if (layer && (layer.kind === 'linear' || layer.kind === 'radial' || layer.kind === 'conic')) {
          const parsed = parseGradientStops(layer.raw);
          if (sIdx >= 0 && sIdx < parsed.stops.length && parsed.stops.length > 2) {
            parsed.stops.splice(sIdx, 1);
            layer.raw = buildGradient(layer.kind, parsed.prefix, parsed.stops);
            setFill(layers);
          }
        }
      }
      return;
    }

    // clip-path polygon vertex add / remove. Manipulates the polygon
    // string by appending or splicing one `X% Y%` pair.
    const polyAddBtn = target.closest<HTMLElement>('[data-dm-clippath-polygon-add]');
    if (polyAddBtn) {
      e.stopPropagation();
      const cur = parseClipPath((info?.computedStyles as any)?.clipPath || 'none');
      const pts = cur.kind === 'polygon' ? cur.points : '';
      const parts = pts.split(',').map(p => p.trim()).filter(Boolean);
      parts.push('50% 50%');
      applyStyle('clipPath', 'polygon(' + parts.join(', ') + ')');
      return;
    }
    const polyRemoveBtn = target.closest<HTMLElement>('[data-dm-clippath-polygon-remove]');
    if (polyRemoveBtn) {
      e.stopPropagation();
      const idx = parseInt(polyRemoveBtn.dataset.dmClippathPolygonRemove || '-1', 10);
      const cur = parseClipPath((info?.computedStyles as any)?.clipPath || 'none');
      if (cur.kind !== 'polygon') return;
      const parts = cur.points.split(',').map(p => p.trim()).filter(Boolean);
      if (idx < 0 || idx >= parts.length) return;
      parts.splice(idx, 1);
      applyStyle('clipPath', parts.length ? 'polygon(' + parts.join(', ') + ')' : 'none');
      return;
    }

    // ─── Layout guide layered list ───
    const guideSectionToggle = target.closest<HTMLElement>('[data-dm-guide-section-toggle]');
    if (guideSectionToggle) {
      e.stopPropagation();
      const id = info?.id || '';
      if (!id) return;
      const willHide = !layoutGuidesSectionHidden.has(id);
      if (willHide) layoutGuidesSectionHidden.add(id);
      else layoutGuidesSectionHidden.delete(id);
      dispatchLayoutGuides(id, getLayoutGuides(id));
      render();
      return;
    }
    const guideAddBtn = target.closest<HTMLElement>('[data-dm-guide-add]');
    if (guideAddBtn) {
      e.stopPropagation();
      const id = info?.id || '';
      if (!id) return;
      const layers = getLayoutGuides(id).slice();
      if (layers.length >= LAYOUT_GUIDE_LIMIT) {
        showCaptureToast('error', 'Layout guide limit reached (' + LAYOUT_GUIDE_LIMIT + ' layers).');
        return;
      }
      layers.unshift(defaultLayoutGuide());
      expandedGuideIdx = 0;
      setLayoutGuides(id, layers);
      dispatchLayoutGuides(id, layers);
      render();
      return;
    }
    const guideRemoveBtn = target.closest<HTMLElement>('[data-dm-guide-remove]');
    if (guideRemoveBtn) {
      e.stopPropagation();
      const id = info?.id || '';
      if (!id) return;
      const idx = parseInt(guideRemoveBtn.dataset.dmGuideRemove || '-1', 10);
      const layers = getLayoutGuides(id).slice();
      if (idx < 0 || idx >= layers.length) return;
      layers.splice(idx, 1);
      if (expandedGuideIdx === idx) expandedGuideIdx = null;
      else if (expandedGuideIdx !== null && expandedGuideIdx > idx) expandedGuideIdx -= 1;
      // The section eye stops rendering below 2 layers — drop the hide flag
      // with it so the remaining guide isn't suppressed by a control the
      // user can no longer see.
      if (layers.length < 2) layoutGuidesSectionHidden.delete(id);
      setLayoutGuides(id, layers);
      dispatchLayoutGuides(id, layers);
      render();
      return;
    }
    const guideToggleBtn = target.closest<HTMLElement>('[data-dm-guide-toggle]');
    if (guideToggleBtn) {
      e.stopPropagation();
      const id = info?.id || '';
      if (!id) return;
      const idx = parseInt(guideToggleBtn.dataset.dmGuideToggle || '-1', 10);
      const layers = getLayoutGuides(id).slice();
      if (idx < 0 || idx >= layers.length) return;
      layers[idx] = { ...layers[idx], visible: layers[idx].visible === false ? true : false };
      setLayoutGuides(id, layers);
      dispatchLayoutGuides(id, layers);
      render();
      return;
    }
    const guideExpandBtn = target.closest<HTMLElement>('[data-dm-guide-expand]');
    if (guideExpandBtn) {
      e.stopPropagation();
      const idx = parseInt(guideExpandBtn.dataset.dmGuideExpand || '-1', 10);
      expandedGuideIdx = expandedGuideIdx === idx ? null : idx;
      render();
      return;
    }

    // ─── Stroke layered list (multi-stroke) ───
    const strokeAddBtn = target.closest<HTMLElement>('[data-dm-stroke-add]');
    if (strokeAddBtn) {
      e.stopPropagation();
      if (strokeAddBtn.hasAttribute('disabled')) return;
      const id = info?.id || '';
      if (!id) return;
      const cs = info?.computedStyles || {};
      const pos = getStrokeActiveTab(id, cs);
      if (pos === 'center') return; // multi not supported on outline
      const layers = getStrokeLayers(id, cs, pos);
      // Cap at STROKE_LIMIT layers. Outside-multi and Inside use the
      // box-shadow chain, which technically scales to any count, but
      // practical use rarely needs more than a handful — beyond ~5
      // the visual just becomes a thick rainbow that's hard to reason
      // about. Matches the spirit of the fill-layer cap.
      if (layers.length >= STROKE_LIMIT) {
        showCaptureToast('error', 'Stroke limit reached (' + STROKE_LIMIT + ' layers).');
        return;
      }
      // Default new stroke: 1px black on top of the stack. Matches the
      // empty-state default the panel surfaces when no stroke is set
      // (Color #000000, Weight 0) — adding a stroke just bumps the
      // weight to a visible 1px.
      layers.unshift({ weight: 1, color: '#000000', visible: true });
      activeStrokeIdx = 0;
      setStrokeLayers(id, pos, layers);
      const intent = strokeStyleByElement.get(id);
      const styleNow = intent || (cs.borderTopStyle && cs.borderTopStyle !== 'none' ? cs.borderTopStyle : 'solid');
      const batch: Array<{ property: string; value: string }> = [];
      dispatchStrokeLayers(layers, pos, cs, (p, v) => batch.push({ property: p, value: v }), styleNow);
      applyStylesBatch(batch, 'Add stroke');
      return;
    }

    const strokeRemoveBtn = target.closest<HTMLElement>('[data-dm-stroke-remove]');
    if (strokeRemoveBtn) {
      e.stopPropagation();
      const id = info?.id || '';
      if (!id) return;
      const idx = parseInt(strokeRemoveBtn.dataset.dmStrokeRemove || '-1', 10);
      const cs = info?.computedStyles || {};
      const pos = getStrokeActiveTab(id, cs);
      const layers = getStrokeLayers(id, cs, pos);
      if (idx < 0 || idx >= layers.length) return;
      layers.splice(idx, 1);
      // Re-point activeStrokeIdx so it stays valid.
      if (activeStrokeIdx >= layers.length) activeStrokeIdx = Math.max(0, layers.length - 1);
      setStrokeLayers(id, pos, layers);
      const intent = strokeStyleByElement.get(id);
      const styleNow = intent || (cs.borderTopStyle && cs.borderTopStyle !== 'none' ? cs.borderTopStyle : 'solid');
      const batch: Array<{ property: string; value: string }> = [];
      dispatchStrokeLayers(layers, pos, cs, (p, v) => batch.push({ property: p, value: v }), styleNow);
      applyStylesBatch(batch, 'Remove stroke');
      return;
    }

    const strokeToggleBtn = target.closest<HTMLElement>('[data-dm-stroke-toggle]');
    if (strokeToggleBtn) {
      e.stopPropagation();
      const id = info?.id || '';
      if (!id) return;
      const idx = parseInt(strokeToggleBtn.dataset.dmStrokeToggle || '-1', 10);
      const cs = info?.computedStyles || {};
      const pos = getStrokeActiveTab(id, cs);
      const layers = getStrokeLayers(id, cs, pos);
      if (idx < 0 || idx >= layers.length) return;
      layers[idx].visible = layers[idx].visible === false ? true : false;
      setStrokeLayers(id, pos, layers);
      const intent = strokeStyleByElement.get(id);
      const styleNow = intent || (cs.borderTopStyle && cs.borderTopStyle !== 'none' ? cs.borderTopStyle : 'solid');
      const batch: Array<{ property: string; value: string }> = [];
      dispatchStrokeLayers(layers, pos, cs, (p, v) => batch.push({ property: p, value: v }), styleNow);
      applyStylesBatch(batch, 'Toggle stroke');
      return;
    }

    // One-click "Gradient text" preset — only meaningful when a gradient
    // fill exists, but applying it on a solid still produces visible-glyph
    // text behaviour (transparent fill).
    const fillActionBtn = target.closest<HTMLElement>('[data-dm-fill-action]');
    if (fillActionBtn) {
      e.stopPropagation();
      if (fillActionBtn.dataset.dmFillAction === 'gradient-text') {
        applyStyle('backgroundClip', 'text');
        applyStyle('webkitBackgroundClip', 'text');
        applyStyle('webkitTextFillColor', 'transparent');
        applyStyle('color', 'transparent');
      }
      return;
    }

    // ─── Effects layered list ───
    const effectExpandBtn = target.closest<HTMLElement>('[data-dm-effect-expand]');
    if (effectExpandBtn) {
      e.stopPropagation();
      const idx = parseInt(effectExpandBtn.dataset.dmEffectExpand || '-1', 10);
      expandedEffectIdx = expandedEffectIdx === idx ? null : idx;
      render(); return;
    }

    const effectRemoveBtn = target.closest<HTMLElement>('[data-dm-effect-remove]');
    if (effectRemoveBtn) {
      e.stopPropagation();
      const id = info?.id || '';
      if (!id) return;
      const idx = parseInt(effectRemoveBtn.dataset.dmEffectRemove || '-1', 10);
      const cs = info?.computedStyles || {};
      const isText = (cs as any)['_kind'] === 'text';
      const list = parseEffects(cs, id, isText || (info && (info.tagName || '').match(/^(p|h[1-6]|span|a|li|button|label)$/i)) ? true : false);
      const target2 = list[idx];
      if (!target2) return;
      // Drop the relevant entry from its CSS chain. We dispatch on
      // `chain` (not kind) because Drop shadow now spans three chains:
      // box-shadow ('box'), filter ('filter'), text-shadow ('text').
      // The overlay chain ('overlay') drives a synthetic prop that
      // round-trips through the change-tracker; we splice the typed
      // entry out of the in-memory stash and re-dispatch the JSON.
      const t2chain = (target2 as any).chain;
      if (t2chain === 'box') {
        const entries = parseCssCommaList(cs.boxShadow || '');
        entries.splice(target2.chainIdx, 1);
        applyStyle('boxShadow', entries.length ? entries.join(', ') : 'none');
      } else if (t2chain === 'filter') {
        const list2 = splitFilterFunctions(cs.filter || '');
        list2.splice((target2 as any).chainIdx, 1);
        applyStyle('filter', list2.length ? list2.join(' ') : 'none');
      } else if (t2chain === 'backdrop') {
        const list2 = splitFilterFunctions((cs as any).backdropFilter || '');
        list2.splice(target2.chainIdx, 1);
        applyStyle('backdropFilter', list2.length ? list2.join(' ') : 'none');
      } else if (t2chain === 'text') {
        applyStyle('textShadow', 'none');
      } else if (t2chain === 'overlay') {
        const list3 = getOverlayEntries(id).slice();
        list3.splice(target2.chainIdx, 1);
        setOverlayEntries(id, list3);
        dispatchOverlayEntries(id, list3);
      }
      // Clean up any stash for this id.
      const hidden = hiddenEffectsByElement.get(id);
      if (hidden) hidden.delete(target2.id);
      return;
    }

    // Per-effect visibility — flips an in-memory hidden flag and stashes /
    // restores the entry's CSS so the row can come back exactly as it was.
    const effectToggleBtn = target.closest<HTMLElement>('[data-dm-effect-toggle]');
    if (effectToggleBtn) {
      e.stopPropagation();
      const id = info?.id || '';
      if (!id) return;
      const idx = parseInt(effectToggleBtn.dataset.dmEffectToggle || '-1', 10);
      const cs = info?.computedStyles || {};
      const isTextLayer = !!(info && (info.tagName || '').match(/^(p|h[1-6]|span|a|li|button|label)$/i));
      const list = parseEffects(cs, id, isTextLayer);
      const target2 = list[idx];
      if (!target2) return;
      let hidden = hiddenEffectsByElement.get(id);
      if (!hidden) { hidden = new Set<string>(); hiddenEffectsByElement.set(id, hidden); }
      const stashKey = id + '::' + target2.id;
      if (hidden.has(target2.id)) {
        // Restore — read the stashed raw entry and splice back into chain.
        const stashed = stashedEffectByKey.get(stashKey);
        hidden.delete(target2.id);
        stashedEffectByKey.delete(stashKey);
        if (stashed) {
          const t2chain2 = (target2 as any).chain;
          if (t2chain2 === 'box') {
            const entries = parseCssCommaList(cs.boxShadow || '');
            entries.splice(target2.chainIdx, 0, stashed);
            applyStyle('boxShadow', entries.join(', '));
          } else if (t2chain2 === 'filter') {
            const list2 = splitFilterFunctions(cs.filter || '');
            list2.splice((target2 as any).chainIdx, 0, stashed);
            applyStyle('filter', list2.join(' '));
          } else if (t2chain2 === 'backdrop') {
            const list2 = splitFilterFunctions((cs as any).backdropFilter || '');
            list2.splice(target2.chainIdx, 0, stashed);
            applyStyle('backdropFilter', list2.join(' '));
          } else if (t2chain2 === 'text') {
            applyStyle('textShadow', stashed);
          } else if (t2chain2 === 'overlay') {
            const list3 = getOverlayEntries(id).slice();
            const entry3 = list3[target2.chainIdx];
            if (entry3) {
              (entry3 as any).visible = true;
              list3[target2.chainIdx] = entry3;
              setOverlayEntries(id, list3);
              dispatchOverlayEntries(id, list3);
            }
          }
        }
      } else {
        // Hide — stash the raw entry and remove from CSS.
        hidden.add(target2.id);
        stashedEffectByKey.set(stashKey, target2.raw);
        const t2chain3 = (target2 as any).chain;
        if (t2chain3 === 'box') {
          const entries = parseCssCommaList(cs.boxShadow || '');
          entries.splice(target2.chainIdx, 1);
          applyStyle('boxShadow', entries.length ? entries.join(', ') : 'none');
        } else if (t2chain3 === 'filter') {
          const list2 = splitFilterFunctions(cs.filter || '');
          list2.splice((target2 as any).chainIdx, 1);
          applyStyle('filter', list2.length ? list2.join(' ') : 'none');
        } else if (t2chain3 === 'backdrop') {
          const list2 = splitFilterFunctions((cs as any).backdropFilter || '');
          list2.splice(target2.chainIdx, 1);
          applyStyle('backdropFilter', list2.length ? list2.join(' ') : 'none');
        } else if (t2chain3 === 'text') {
          applyStyle('textShadow', 'none');
        } else if (t2chain3 === 'overlay') {
          const list3 = getOverlayEntries(id).slice();
          const entry3 = list3[target2.chainIdx];
          if (entry3) {
            (entry3 as any).visible = false;
            list3[target2.chainIdx] = entry3;
            setOverlayEntries(id, list3);
            dispatchOverlayEntries(id, list3);
          }
        }
      }
      return;
    }

    // (Stroke layered-list handlers — add / remove / toggle / select —
    // live above, alongside the rest of the section's wiring.)

    // Color-adjust toggles for `filter` and `backdrop-filter`. Each click
    // toggles the named function on the target shorthand, composing with
    // any existing functions (e.g. existing `contrast(1.2)` is preserved
    // when the user adds `saturate(1.5)`). Re-clicking an active function
    // removes it. Empty result writes `none`.
    const filterFnBtn = target.closest<HTMLElement>('[data-dm-filter-fn], [data-dm-bdfilter-fn]');
    if (filterFnBtn) {
      e.stopPropagation();
      const which = filterFnBtn.dataset.dmFilterFn ?? filterFnBtn.dataset.dmBdfilterFn!;
      const isBackdrop = !!filterFnBtn.dataset.dmBdfilterFn;
      const defaults: Record<string, string> = {
        brightness: 'brightness(1.2)', contrast: 'contrast(1.2)',
        saturate: 'saturate(1.5)', 'hue-rotate': 'hue-rotate(45deg)',
        grayscale: 'grayscale(50%)', invert: 'invert(50%)', sepia: 'sepia(50%)',
        blur: 'blur(8px)',
        'drop-shadow': 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.2))',
      };
      const cssProp = isBackdrop ? 'backdropFilter' : 'filter';
      const cur = (info?.computedStyles?.[cssProp] || 'none').toLowerCase();
      const fnRe = new RegExp('\\b' + which + '\\([^)]*\\)\\s*', 'gi');
      const hasFn = fnRe.test(cur);
      // Reset the lastIndex on the global regex so the replace below starts fresh.
      fnRe.lastIndex = 0;
      let next = (cur === 'none' ? '' : cur).replace(fnRe, '').replace(/\s+/g, ' ').trim();
      if (!hasFn) next = (next + ' ' + (defaults[which] || (which + '(1)'))).trim();
      applyStyle(cssProp, next || 'none');
      return;
    }

    // Stroke position selector (Inside / Outside / Center).
    const strokePosBtn = target.closest<HTMLElement>('[data-dm-stroke-pos]');
    if (strokePosBtn) {
      e.stopPropagation();
      const pos = strokePosBtn.dataset.dmStrokePos as 'inside' | 'outside' | 'center';
      applyStrokePosition(pos);
      return;
    }

    // Sides selector (All/Top/Bottom/Left/Right/Custom). Writes per-side
    // border-width longhands to project the desired pattern.
    const sideBtn = target.closest<HTMLElement>('[data-dm-side]');
    if (sideBtn) {
      e.stopPropagation();
      const side = sideBtn.dataset.dmSide!;
      const s = info?.computedStyles || {};
      const cur = parseFloat(s.borderTopWidth || s.borderRightWidth || s.borderBottomWidth || s.borderLeftWidth || '1') || 1;
      const w = (cur > 0 ? cur : 1) + 'px';
      const zero = '0px';
      if (side === 'all') {
        applyStyle('borderTopWidth', w); applyStyle('borderRightWidth', w);
        applyStyle('borderBottomWidth', w); applyStyle('borderLeftWidth', w);
      } else if (side === 'top') {
        applyStyle('borderTopWidth', w); applyStyle('borderRightWidth', zero);
        applyStyle('borderBottomWidth', zero); applyStyle('borderLeftWidth', zero);
      } else if (side === 'bottom') {
        applyStyle('borderTopWidth', zero); applyStyle('borderRightWidth', zero);
        applyStyle('borderBottomWidth', w); applyStyle('borderLeftWidth', zero);
      } else if (side === 'left') {
        applyStyle('borderTopWidth', zero); applyStyle('borderRightWidth', zero);
        applyStyle('borderBottomWidth', zero); applyStyle('borderLeftWidth', w);
      } else if (side === 'right') {
        applyStyle('borderTopWidth', zero); applyStyle('borderRightWidth', w);
        applyStyle('borderBottomWidth', zero); applyStyle('borderLeftWidth', zero);
      }
      sidesPopoverOpen = false;
      return;
    }

    // Effects add-menu — adds the chosen effect or applies a multi-property
    // preset. Each `kind` corresponds to one + menu item.
    const addEffectBtn = target.closest<HTMLElement>('[data-dm-add-effect]');
    if (addEffectBtn) {
      e.stopPropagation();
      const kind = addEffectBtn.dataset.dmAddEffect!;
      const cs = info?.computedStyles || {};
      // Helper: append a new entry to a comma-separated chain.
      const appendBoxShadow = (newEntry: string) => {
        const cur = cs.boxShadow || 'none';
        const next = cur === 'none' || !cur ? newEntry : (cur + ', ' + newEntry);
        applyStyle('boxShadow', next);
      };
      const appendFilter = (newFn: string) => {
        const list = splitFilterFunctions(cs.filter || '');
        list.push(newFn);
        applyStyle('filter', list.join(' '));
      };
      const appendBackdrop = (newFn: string) => {
        const list = splitFilterFunctions((cs as any).backdropFilter || '');
        list.push(newFn);
        applyStyle('backdropFilter', list.join(' '));
      };
      // Single-effect adds — always APPEND so multi-shadow / multi-filter
      // stacks naturally instead of overwriting an existing effect.
      // Drop shadow defaults to a non-inset box-shadow (checkbox ON in
      // the row UI). The user toggles the row's checkbox OFF to switch
      // to text-shadow (text element) or filter:drop-shadow (others).
      if (kind === 'drop-shadow') appendBoxShadow('0px 4px 12px 0px rgba(0, 0, 0, 0.12)');
      else if (kind === 'inner-shadow') appendBoxShadow('inset 0px 2px 6px 0px rgba(0, 0, 0, 0.18)');
      else if (kind === 'layer-blur') appendFilter('blur(4px)');
      else if (kind === 'backdrop-blur') appendBackdrop('blur(8px)');
      else if (kind === 'noise' || kind === 'texture') {
        // Push a new overlay entry onto the per-element list and
        // dispatch the whole array as one synthetic CSS prop. The
        // content-side translator (change-tracker.rebuildStyleSheet)
        // picks it up and emits an `::after` pseudo-element rule.
        const id = info?.id || '';
        if (!id) return;
        hydrateOverlayFromChanges(id);
        const list = getOverlayEntries(id).slice();
        list.push(kind === 'noise' ? defaultNoiseEntry() : defaultTextureEntry());
        setOverlayEntries(id, list);
        dispatchOverlayEntries(id, list);
      }
      else if (kind === 'transition') applyStyle('transition', 'all 0.2s ease');
      else if (kind === 'animation') applyStyle('animation', 'dm-fade-in 0.4s ease both');
      else if (kind === 'transform') applyStyle('translate', '0px 0px');
      // Motion path — seed an oval for the preset; user customises via
      // the inline editor that appears in the Motion subsection.
      else if (kind === 'motion-path') {
        applyStyle('offsetPath', 'path("M 0,50 a 50,50 0 1,1 100,0 a 50,50 0 1,1 -100,0")');
        applyStyle('offsetDistance', '0%');
        applyStyle('offsetRotate', 'auto');
      }
      // View transition — seed a unique-ish name so the user has
      // something concrete to bind to in their startViewTransition() call.
      else if (kind === 'view-transition') {
        const seed = 'vt-' + Math.random().toString(36).slice(2, 7);
        applyStyle('viewTransitionName', seed);
      }
      // Scroll-driven animation — seed an animation-timeline + range so
      // the user has a working scroll-progress binding immediately. They
      // pair it with the existing animation-* properties on this element.
      else if (kind === 'scroll-driven') {
        applyStyle('animationTimeline', 'scroll(root block)');
        applyStyle('animationRange', 'entry 0% exit 100%');
        // If there's no animation set yet, seed one so something visible
        // happens when the user scrolls. dm-fade-in is harmless.
        const cur = (info?.computedStyles?.animationName || 'none').trim();
        if (cur === 'none' || !cur) {
          applyStyle('animation', 'dm-fade-in 1s linear both');
        }
      }
      // Raw motion kinds now live under the Motion → Advanced disclosure;
      // open it so the seeded editor is visible instead of silently hidden.
      if (['transition','animation','transform','motion-path','view-transition','scroll-driven'].includes(kind)) {
        advancedOpen.motion = true;
      }
      effectsMenuOpen = false;
      motionMenuOpen = false;
      return;
    }

    // ── Motion interactions (trigger-first cards) ──────────────────────
    // Add a trigger: seed the base transition curve + a default Fade change
    // so the card appears with something concrete to tweak.
    const motionAddTriggerBtn = target.closest<HTMLElement>('[data-dm-motion-add-trigger]');
    if (motionAddTriggerBtn) {
      e.stopPropagation();
      const trig = motionAddTriggerBtn.dataset.dmMotionAddTrigger!;
      const s = info?.computedStyles || {};
      if (trig === 'loop') {
        applyStyle('animationName', 'dm-pulse');
        applyStyle('animationDuration', '1s');
        applyStyle('animationTimingFunction', 'ease-in-out');
        applyStyle('animationIterationCount', 'infinite');
      } else if (trig === 'scroll') {
        applyStyle('animationName', 'dm-fade-in');
        applyStyle('animationDuration', '1s');
        applyStyle('animationFillMode', 'both');
        applyStyle('animationTimeline', 'view()');
        applyStyle('animationRange', 'entry 0% cover 40%');
      } else {
        // State-transition family (hover/press/focus/appear). Seed the base
        // transition only if absent so a second trigger shares the curve.
        if ((s.transitionDuration || '0s').split(',')[0].trim() === '0s') {
          applyStyle('transitionProperty', 'all');
          applyStyle('transitionDuration', '0.2s');
          applyStyle('transitionTimingFunction', 'ease');
        }
        // Appear needs allow-discrete so an @starting-style transition fires.
        if (trig === 'appear') applyStyle('transitionBehavior', 'allow-discrete');
        const seed = motionPresetsFor(trig).fade;
        applyStyle('__motion_' + trig + '__' + seed.prop, seed.value);
      }
      return;
    }
    // Add a change preset to an existing trigger card.
    const motionAddChangeBtn = target.closest<HTMLElement>('[data-dm-motion-add-change]');
    if (motionAddChangeBtn) {
      e.stopPropagation();
      const [trig, key] = motionAddChangeBtn.dataset.dmMotionAddChange!.split(':');
      const preset = motionPresetsFor(trig)[key];
      if (preset) applyStyle('__motion_' + trig + '__' + preset.prop, preset.value);
      return;
    }
    // Remove one change from a trigger card ('' clears the variant rule).
    const motionRemoveChangeBtn = target.closest<HTMLElement>('[data-dm-motion-remove-change]');
    if (motionRemoveChangeBtn) {
      e.stopPropagation();
      const [trig, prop] = motionRemoveChangeBtn.dataset.dmMotionRemoveChange!.split(':');
      applyStyle('__motion_' + trig + '__' + prop, '');
      return;
    }
    // Remove a whole trigger. State-family clears its variant changes; the
    // timeline family (loop/scroll) resets the base animation longhands.
    const motionRemoveTriggerBtn = target.closest<HTMLElement>('[data-dm-motion-remove-trigger]');
    if (motionRemoveTriggerBtn) {
      e.stopPropagation();
      const trig = motionRemoveTriggerBtn.dataset.dmMotionRemoveTrigger!;
      const elId = info?.id || '';
      if (trig === 'loop') {
        applyStyle('animationName', 'none');
        applyStyle('animationIterationCount', '1');
        applyStyle('animationDuration', '0s');
      } else if (trig === 'scroll') {
        applyStyle('animationTimeline', 'auto');
        applyStyle('animationRange', 'normal');
        applyStyle('animationName', 'none');
      } else {
        const state = MOTION_TRIGGER_STATE[trig];
        if (motionForcedTrigger === trig) { motionForcedTrigger = null; send({ type: 'SP_FORCE_STATE', elementId: elId, state: '', on: false }); }
        for (const c of styleChanges.filter(c => c.elementId === elId && c.state === state)) {
          applyStyle('__motion_' + trig + '__' + c.property, '');
        }
      }
      return;
    }
    // Preview. Hover/press/focus force the `.dm-force-*` class so the real
    // transition plays. Appear re-inserts the element (@starting-style fires
    // on mount). Loop restarts the keyframe animation.
    const motionPreviewBtn = target.closest<HTMLElement>('[data-dm-motion-preview]');
    if (motionPreviewBtn) {
      e.stopPropagation();
      const trig = motionPreviewBtn.dataset.dmMotionPreview!;
      const elId = info?.id || '';
      if (trig === 'appear') { send({ type: 'SP_REPLAY_APPEAR', elementId: elId }); return; }
      if (trig === 'loop') { send({ type: 'SP_PREVIEW_ANIMATION' }); return; }
      const state = MOTION_TRIGGER_STATE[trig];
      if (motionForcedTrigger === trig) {
        motionForcedTrigger = null;
        send({ type: 'SP_FORCE_STATE', elementId: elId, state, on: false });
      } else {
        if (motionForcedTrigger) send({ type: 'SP_FORCE_STATE', elementId: elId, state: MOTION_TRIGGER_STATE[motionForcedTrigger], on: false });
        motionForcedTrigger = trig;
        send({ type: 'SP_FORCE_STATE', elementId: elId, state, on: true });
      }
      render();
      return;
    }

    // Motion-subsection action buttons (clears + small presets).
    const effectActionBtn = target.closest<HTMLElement>('[data-dm-effect-action]');
    if (effectActionBtn) {
      e.stopPropagation();
      const action = effectActionBtn.dataset.dmEffectAction!;
      if (action === 'clear-motion-path') {
        applyStyle('offsetPath', 'none');
        applyStyle('offsetDistance', '0%');
        applyStyle('offsetRotate', 'auto');
        applyStyle('offsetAnchor', 'auto');
        applyStyle('offsetPosition', 'auto');
      } else if (action === 'clear-view-transition') {
        applyStyle('viewTransitionName', 'none');
        applyStyle('viewTransitionClass', 'none');
      } else if (action === 'clear-scroll-driven') {
        applyStyle('animationTimeline', 'auto');
        applyStyle('animationRange', 'normal');
        applyStyle('scrollTimelineName', 'none');
        applyStyle('scrollTimelineAxis', 'block');
        applyStyle('viewTimelineName', 'none');
        applyStyle('viewTimelineAxis', 'block');
        applyStyle('viewTimelineInset', 'auto');
        applyStyle('timelineScope', 'none');
      } else if (action === 'preset-scroll-progress') {
        applyStyle('animationTimeline', 'scroll(root block)');
        applyStyle('animationRange', 'entry 0% exit 100%');
      }
      return;
    }

    // Stroke eye toggle (Fill section header eye was removed — Fill visibility
    // is controlled per-layer via the eye on each row).
    const strokeEyeBtn = target.closest<HTMLElement>('[data-dm-stroke-eye]');
    if (strokeEyeBtn) {
      e.stopPropagation();
      const s = info?.computedStyles || {};
      const off = (s.borderTopStyle || 'none') === 'none';
      const next = off ? 'solid' : 'none';
      applyStyle('borderTopStyle', next); applyStyle('borderRightStyle', next);
      applyStyle('borderBottomStyle', next); applyStyle('borderLeftStyle', next);
      return;
    }

    // v1.2: Batch apply (toggle visual flag)
    const batchBtn = target.closest<HTMLElement>('[data-dm-batch-apply]');
    if (batchBtn) {
      const cid = batchBtn.dataset.dmBatchApply!;
      if (batchAppliedChanges.has(cid)) {
        // Already batched — clear the flag (does not un-apply)
        batchAppliedChanges.delete(cid);
        render();
        return;
      }
      batchAppliedChanges.add(cid);
      render();
      send({ type: 'SP_BATCH_APPLY_CHANGE', changeId: cid }).then(r => {
        if (r?.styleChanges) styleChanges = r.styleChanges;
        if (r?.textChanges) textChanges = r.textChanges;
        if (r?.domChanges) domChanges = r.domChanges;
        if (r?.comments) comments = r.comments;
        render();
      });
      return;
    }
  });

  // Change handler (selects)
  root.addEventListener('change', (e) => {
    const target = e.target as HTMLElement;

    // Declared tab — scope filter dropdown.
    const scopeFilterSel = target.closest<HTMLSelectElement>('[data-dm-token-scope-filter]');
    if (scopeFilterSel) {
      tokenScopeFilter = scopeFilterSel.value;
      render();
      return;
    }

    // Tokens panel — group filter dropdown (All / Colours / Type / …).
    const groupSel = target.closest<HTMLSelectElement>('[data-dm-token-group]');
    if (groupSel) {
      tokenFilter = groupSel.value as TokenFilter;
      render();
      return;
    }

    // Defined tab — preset kind dropdown.
    const definedKindSel = target.closest<HTMLSelectElement>('[data-dm-defined-kind]');
    if (definedKindSel) {
      presetAddingKind = definedKindSel.value as PresetKindLocal;
      // No re-render — keeps focus on the dropdown.
      return;
    }

    // Detected tab — "Replace with…" dropdown. Selecting an option
    // dispatches the consolidate message; on success we reset the
    // dropdown to its placeholder so the UI doesn't lie about state.
    const replaceSel = target.closest<HTMLSelectElement>('[data-dm-detected-replace]');
    if (replaceSel && replaceSel.value) {
      let payload: { scale: string; rawValue: string; cssVar: string } | null = null;
      try { payload = JSON.parse(replaceSel.value); } catch {}
      // Reset the dropdown selection regardless of outcome.
      replaceSel.value = '';
      if (!payload) return;
      send({ type: 'SP_CONSOLIDATE_DETECTED', scale: payload.scale, rawValue: payload.rawValue, cssVar: payload.cssVar }).then((r: any) => {
        if (!r?.ok) {
          showCaptureToast('error', 'Nothing to consolidate.');
          return;
        }
        if (r?.styleChanges) styleChanges = r.styleChanges;
        if (r?.undoCount != null) undoCount = r.undoCount;
        if (r?.redoCount != null) redoCount = r.redoCount;
        showCaptureToast('success',
          'Replaced ' + r.touched + ' occurrence' + (r.touched === 1 ? '' : 's') + ' of ' + payload!.rawValue + ' with var(' + payload!.cssVar + ').');
        // Refresh the design system so updated value-counts roll in.
        designSystem = null;
        refreshDesignSystem();
      });
      return;
    }

    // Tokens — "show only used on this page" checkbox.
    const usedOnlyInp = target.closest<HTMLInputElement>('[data-dm-tokens-used-only]');
    if (usedOnlyInp) {
      tokenUsedOnlyFilter = usedOnlyInp.checked;
      render();
      return;
    }

    // Tokens — import a design-system JSON. Applies any tokens whose
    // cssVar matches a declared :root variable via SP_SET_ROOT_VAR;
    // unrecognised vars are reported but skipped (we don't create new
    // root vars from imports — that's destructive).
    const tokensImportInp = target.closest<HTMLInputElement>('[data-dm-tokens-import]');
    if (tokensImportInp && tokensImportInp.files?.[0]) {
      const file = tokensImportInp.files[0];
      const reader = new FileReader();
      reader.onload = (ev) => {
        tokensImportInp.value = '';
        let parsed: any = null;
        try { parsed = JSON.parse(ev.target?.result as string); }
        catch { showCaptureToast('error', 'Invalid JSON.'); return; }
        if (!parsed || typeof parsed !== 'object' || parsed.kind !== 'design-mode-design-system') {
          showCaptureToast('error', 'Not a Design Mode design-system file.');
          return;
        }
        const incoming = Array.isArray(parsed.tokens) ? parsed.tokens : [];
        const declared = new Set((designSystem?.tokens || []).map(t => t.cssVar));
        let applied = 0;
        let skipped = 0;
        for (const t of incoming) {
          if (!t || typeof t.cssVar !== 'string' || typeof t.value !== 'string') { skipped++; continue; }
          if (!declared.has(t.cssVar)) { skipped++; continue; }
          const scopeSelector = (designSystem?.tokens || []).find(d => d.cssVar === t.cssVar)?.scope.selector || ':root';
          editedTokens.set(tokenEditKey(scopeSelector, t.cssVar), t.resolvedValue || t.value);
          send({ type: 'SP_SET_ROOT_VAR', cssVar: t.cssVar, value: t.resolvedValue || t.value, scopeSelector });
          applied++;
        }
        showCaptureToast(applied > 0 ? 'success' : 'error',
          'Applied ' + applied + ' token' + (applied === 1 ? '' : 's') +
          (skipped > 0 ? ' (' + skipped + ' skipped — not declared on this page)' : ''));
        designSystem = null;
        refreshDesignSystem();
      };
      reader.readAsText(file);
      return;
    }

    // Import changes file input — replaces every tracked change on the page
    // with the imported payload. Validates the envelope before sending so a
    // malformed file is rejected client-side.
    const importChangesInput = target.closest<HTMLInputElement>('[data-dm-import-changes]');
    if (importChangesInput && importChangesInput.files?.[0]) {
      const file = importChangesInput.files[0];
      const reader = new FileReader();
      reader.onload = (ev) => {
        importChangesInput.value = '';
        let parsed: any = null;
        try { parsed = JSON.parse(ev.target?.result as string); }
        catch { showCaptureToast('error', 'Invalid JSON.'); return; }
        if (!parsed || typeof parsed !== 'object' || parsed.kind !== 'design-mode-changes') {
          showCaptureToast('error', 'Not a Design Mode changes file.');
          return;
        }
        const payload = {
          styleChanges: Array.isArray(parsed.styleChanges) ? parsed.styleChanges : [],
          textChanges: Array.isArray(parsed.textChanges) ? parsed.textChanges : [],
          domChanges: Array.isArray(parsed.domChanges) ? parsed.domChanges : [],
          comments: Array.isArray(parsed.comments) ? parsed.comments : [],
        };
        send({ type: 'SP_IMPORT_CHANGES', payload }).then(r => {
          if (!r?.ok) { showCaptureToast('error', r?.error || 'Import failed.'); return; }
          if (r.styleChanges) styleChanges = r.styleChanges;
          if (r.textChanges) textChanges = r.textChanges;
          if (r.domChanges) domChanges = r.domChanges;
          if (r.comments) comments = r.comments;
          render();
          const total = payload.styleChanges.length + payload.textChanges.length + payload.domChanges.length + payload.comments.length;
          showCaptureToast('success', `Imported ${total} change${total === 1 ? '' : 's'}.`);
        });
      };
      reader.readAsText(file);
      return;
    }


    // W / H size-mode dropdown (Fixed / Hug / Fill). Switching to Fixed
    // from Hug / Fill snapshots the current resolved px so the visual
    // size doesn't jump. The snapshot is converted to rem when the
    // Settings → Input unit preference is rem, so the Changes-tab
    // entry reads in the unit the user picked.
    const sizeModeSel = target.closest<HTMLSelectElement>('[data-dm-size-mode]');
    if (sizeModeSel) {
      const prop = sizeModeSel.dataset.dmSizeMode!;
      const mode = sizeModeSel.value;
      if (mode === 'hug') applyStyle(prop, 'fit-content');
      else if (mode === 'fill') applyStyle(prop, '100%');
      else if (mode === 'fixed') {
        const resolved = (info?.computedStyles?.[prop] || '').trim();
        if (!resolved || resolved === 'auto') {
          applyStyle(prop, inputUnit === 'rem' ? (Math.round((100 / remRootPx) * 10000) / 10000) + 'rem' : '100px');
        } else if (inputUnit === 'rem') {
          const parsed = parseNumeric(resolved);
          if (parsed && (parsed.unit === 'px' || !parsed.unit)) {
            const rem = Math.round((parsed.num / remRootPx) * 10000) / 10000;
            applyStyle(prop, rem + 'rem');
          } else {
            applyStyle(prop, resolved);
          }
        } else {
          applyStyle(prop, resolved);
        }
      }
      return;
    }

    // Gap mode (Fixed / Auto) for the Col/Row gap fields. Auto spreads the
    // children via space-between on the relevant distribution axis and clears
    // the explicit gap; Fixed restores a concrete gap (the measured effective
    // spacing, for visual continuity) and resets the distribution.
    const gapModeSel = target.closest<HTMLSelectElement>('[data-dm-gap-mode]');
    if (gapModeSel) {
      const field = gapModeSel.dataset.dmGapMode as 'col' | 'row';
      const s = (info?.computedStyles || {}) as Record<string, string>;
      const distProp = gapDistProp(field, s);
      const gapProp = field === 'col' ? 'columnGap' : 'rowGap';
      const elId = info?.id || '';
      const stashKey = elId + ':' + distProp;
      if (gapModeSel.value === 'auto') {
        // Stash the current alignment value so switching back to Fixed
        // can restore it instead of resetting to 'normal'.
        const curAlign = s[distProp] || '';
        if (curAlign && curAlign !== 'space-between' && curAlign !== 'space-around' && curAlign !== 'space-evenly') {
          previousGapAlign.set(stashKey, curAlign);
        }
        applyStylesBatch([
          { property: distProp, value: 'space-between' },
          { property: gapProp, value: 'normal' },
        ], 'Auto gap');
      } else {
        const measured = field === 'col' ? info?.childGap?.col : info?.childGap?.row;
        let px: number;
        if (measured != null && measured > 0) {
          px = Math.round(measured);
        } else {
          const parsed = parseNumeric(s[gapProp] || '');
          px = parsed && (parsed.unit === 'px' || !parsed.unit) ? Math.round(parsed.num) : 16;
        }
        const val = inputUnit === 'rem' ? (Math.round((px / remRootPx) * 10000) / 10000) + 'rem' : px + 'px';
        // Restore the alignment the user had before switching to Auto,
        // so the 9-pad isn't reset to 'normal'.
        const restored = previousGapAlign.get(stashKey) || 'flex-start';
        previousGapAlign.delete(stashKey);
        applyStylesBatch([
          { property: distProp, value: restored },
          { property: gapProp, value: val },
        ], 'Fixed gap');
      }
      return;
    }

    // Select property change
    const propSelect = target.closest<HTMLSelectElement>('select[data-dm-prop]');
    if (propSelect) {
      const prop = propSelect.dataset.dmProp!;
      const val = propSelect.value;
      const borderStyles = ['borderTopStyle','borderRightStyle','borderBottomStyle','borderLeftStyle'];
      if (borderStyleLinked && borderStyles.includes(prop)) {
        Promise.all(borderStyles.map(p => send({ type: 'SP_APPLY_STYLE', property: p, value: val }))).then(rs => {
          const last = rs[rs.length-1]; if (last?.info) info = last.info; if (last?.styleChanges) styleChanges = last.styleChanges; render();
        }); return;
      }
      // Position dropdown — prefill sensible offsets so the layer is
      // visible immediately. Only fills when the user hasn't already set
      // the offset (top/left still 'auto'), so we never clobber intent.
      if (prop === 'position') {
        const cur = info?.computedStyles || {};
        applyStyle('position', val);
        const topAuto = !cur.top || cur.top === 'auto';
        const leftAuto = !cur.left || cur.left === 'auto';
        if ((val === 'absolute' || val === 'fixed') && topAuto && leftAuto) {
          applyStyle('top', '0px');
          applyStyle('left', '0px');
        } else if (val === 'sticky' && topAuto) {
          applyStyle('top', '0px');
        }
        return;
      }
      // clip-path shape change — writes a default for the new shape so the
      // editor fields below populate immediately.
      if (prop === '__clippath_shape') {
        const next = defaultClipPathFor(val as ClipPathDef['kind']);
        applyStyle('clipPath', serializeClipPath(next));
        return;
      }
      // Per-shadow inset <select> change — flips a box-shadow entry between
      // outer (drop) and inner. Re-uses the input-handler path by routing
      // through `applyStyle` on the synthetic `__effd_box_<idx>_inset` prop.
      const effdInsetMatch = prop.match(/^__effd_box_(\d+)_inset$/);
      if (effdInsetMatch) {
        const cs = info?.computedStyles || {};
        const idx = parseInt(effdInsetMatch[1], 10);
        const entries = parseCssCommaList(cs.boxShadow || '');
        if (idx < 0 || idx >= entries.length) return;
        const parsed = parseShadowEntry(entries[idx]);
        if (!parsed) return;
        const sh: ShadowParts = { inset: val === 'inset', x: parsed.x, y: parsed.y, blur: parsed.blur, spread: parsed.spread, color: parsed.color };
        entries[idx] = formatShadowEntry(sh);
        applyStyle('boxShadow', entries.join(', '));
        return;
      }
      // Per-layer Layout Guide <select> changes (kind / align).
      if (prop.startsWith('__guide_kind__') || prop.startsWith('__guide_align__')) {
        applyLayoutGuideProperty(prop, val);
        return;
      }
      // Per-layer fill <select> changes (size / repeat / position / blend).
      // Mutates the per-element layer state then re-dispatches all four
      // comma-positional CSS properties at once.
      const fillMatch = prop.match(/^__fill_(size|repeat|position|blend)__(\d+)$/);
      if (fillMatch) {
        const id = info?.id || '';
        if (!id) return;
        const layers = getFillLayers(id, info?.computedStyles || {});
        const field = fillMatch[1];
        const i = parseInt(fillMatch[2], 10);
        // Size / repeat / position / blend only apply to image / gradient
        // layers — a flat solid colour has no tiling or origin.
        if (layers[i] && layers[i].kind !== 'solid') {
          if (field === 'size') layers[i].size = val;
          else if (field === 'repeat') layers[i].repeat = val;
          else if (field === 'position') layers[i].position = val;
          else if (field === 'blend') layers[i].blendMode = val;
          fillLayersByElement.set(id, layers);
          dispatchFillLayers(layers, applyStyle);
        }
        return;
      }
      applyStyle(prop, val); return;
    }

    // Shadow field select change
    const shadowSelect = target.closest<HTMLSelectElement>('[data-dm-shadow-field]');
    if (shadowSelect) { applyShadowFromFields(); return; }

    // Text-shadow color picker (input event fires for type="color")
    const tsColor = target.closest<HTMLInputElement>('[data-dm-textshadow-field="color"]');
    if (tsColor) { applyTextShadowFromFields(); return; }

    // Text input change (on blur/enter). Also covers textareas so the
    // `grid-template-areas` editor can write multi-line strings.
    const propInput = target.closest<HTMLInputElement | HTMLTextAreaElement>('input[data-dm-prop], textarea[data-dm-prop]') as HTMLInputElement | null;
    if (propInput) {
      const prop = propInput.dataset.dmProp!;
      const isNumeric = propInput.dataset.dmNumeric === '1';
      const unit = propInput.dataset.dmUnit || '';
      const raw = propInput.value.trim();
      const isPureNumber = /^-?\d+(?:\.\d+)?$/.test(raw);
      const val = isNumeric && unit && isPureNumber ? raw + unit : raw;
      // var(--token) passes through verbatim — the non-negative clamp
      // below would otherwise flatten a token reference to 0.
      if (/^var\(\s*--/.test(raw)) {
        applyStyle(prop, raw);
        return;
      }
      // Non-negative numeric guard — corner radius and stroke weight
      // both fail silently in CSS when handed a negative value. Same
      // UX either way: floor to 0 whether the user typed a negative,
      // non-numeric, or pasted garbage.
      if (isNonNegativeNumericProp(prop)) {
        const n = parseFloat(raw);
        const clamped = !isFinite(n) || n < 0 ? 0 : n;
        propInput.value = String(clamped);
        applyStyle(prop, clamped + (unit || 'px'));
        return;
      }
      // Opacity percent input — display 0-100 with a locked `%` chip,
      // write 0-1 decimal so the Changes tab shows canonical CSS.
      // Clamped to the 0-100 range on commit so users can't get the
      // element invisible / >1-decimal-equivalent by mistake.
      if (prop === '__opacity_pct') {
        const n = parseFloat(raw);
        if (!isNaN(n)) {
          const clamped = Math.max(0, Math.min(100, n));
          propInput.value = String(clamped);
          applyStyle('opacity', String(Math.round(clamped) / 100));
        }
        return;
      }
      // Line clamp composer — virtual __line_clamp from the Typography
      // Advanced disclosure writes the four CSS properties needed for the
      // -webkit-box clamp pattern (display, -webkit-box-orient, line-clamp,
      // overflow). N=0 clears all four back to defaults.
      if (prop === '__line_clamp') {
        const num = parseInt(raw, 10);
        if (!isFinite(num) || num <= 0) {
          // Clear clamp — leave display alone (don't fight the user) but reset
          // the clamp-specific properties so the line limit is removed.
          applyStyle('webkitLineClamp', 'none');
          applyStyle('webkitBoxOrient', 'horizontal');
          return;
        }
        applyStyle('display', '-webkit-box');
        applyStyle('webkitBoxOrient', 'vertical');
        applyStyle('webkitLineClamp', String(num));
        applyStyle('overflow', 'hidden');
        return;
      }
      // Elliptical corner-radius composer — virtual __corner_<key>_<axis>
      // splices the typed axis into the current border-*-radius value
      // without losing the other axis. Empty input falls back to the
      // existing axis (so leaving Y blank == circular).
      const cornerMatch = prop.match(/^__corner_(tl|tr|bl|br)_(x|y)$/);
      if (cornerMatch) {
        const key = cornerMatch[1] as 'tl'|'tr'|'bl'|'br';
        const axis = cornerMatch[2] as 'x'|'y';
        const cssProp = ({
          tl: 'borderTopLeftRadius', tr: 'borderTopRightRadius',
          bl: 'borderBottomLeftRadius', br: 'borderBottomRightRadius',
        } as const)[key];
        const cur = info?.computedStyles?.[cssProp] || '0px';
        const [curX, curY] = parseRadiusXY(cur);
        const nextX = axis === 'x' ? (val || '0px') : curX;
        const nextY = axis === 'y' ? (val || '0px') : curY;
        applyStyle(cssProp, nextX === nextY ? nextX : nextX + ' ' + nextY);
        return;
      }
      // clip-path composer — virtual __clippath_* props splice into the
      // current clip-path string. Each shape has its own field set; the
      // shape select writes a default for the new shape.
      if (prop.startsWith('__clippath_')) {
        const cur = (info?.computedStyles as any)?.clipPath || 'none';
        const cp = parseClipPath(cur);
        // __clippath_inset_<edge>
        let m = prop.match(/^__clippath_inset_(top|right|bottom|left)$/);
        if (m) {
          const edge = m[1];
          const next: ClipPathDef = cp.kind === 'inset'
            ? { ...cp, [edge]: val } as any
            : { kind: 'inset', top: val, right: val, bottom: val, left: val };
          applyStyle('clipPath', serializeClipPath(next));
          return;
        }
        m = prop.match(/^__clippath_circle_(r|x|y)$/);
        if (m) {
          const f = m[1];
          const base: any = cp.kind === 'circle' ? cp : { kind: 'circle', r: '50%', x: '50%', y: '50%' };
          base[f] = val;
          applyStyle('clipPath', serializeClipPath(base));
          return;
        }
        m = prop.match(/^__clippath_ellipse_(rx|ry|x|y)$/);
        if (m) {
          const f = m[1];
          const base: any = cp.kind === 'ellipse' ? cp : { kind: 'ellipse', rx: '50%', ry: '50%', x: '50%', y: '50%' };
          base[f] = val;
          applyStyle('clipPath', serializeClipPath(base));
          return;
        }
        if (prop === '__clippath_polygon') {
          applyStyle('clipPath', val.trim() ? `polygon(${val.trim()})` : 'none');
          return;
        }
        // Per-vertex polygon inputs — `__clippath_polygon_<x|y>_<idx>`.
        // Reads every vertex's X / Y from the rendered inputs, rebuilds
        // the polygon, and writes back. Empty inputs are kept as 0%.
        m = prop.match(/^__clippath_polygon_(x|y)_(\d+)$/);
        if (m) {
          const xs = root.querySelectorAll<HTMLInputElement>('[data-dm-prop^="__clippath_polygon_x_"]');
          const ys = root.querySelectorAll<HTMLInputElement>('[data-dm-prop^="__clippath_polygon_y_"]');
          const pairs: string[] = [];
          for (let i = 0; i < Math.max(xs.length, ys.length); i++) {
            const xv = (xs[i]?.value || '0%').trim() || '0%';
            const yv = (ys[i]?.value || '0%').trim() || '0%';
            pairs.push(xv + ' ' + yv);
          }
          applyStyle('clipPath', pairs.length ? `polygon(${pairs.join(', ')})` : 'none');
          return;
        }
        if (prop === '__clippath_path') {
          applyStyle('clipPath', val.trim() ? `path('${val.trim()}')` : 'none');
          return;
        }
        if (prop === '__clippath_url') {
          applyStyle('clipPath', val.trim() ? `url(#${val.trim().replace(/^#/, '')})` : 'none');
          return;
        }
        return;
      }
      // Skew composer — virtual __skew_x / __skew_y from the Position
      // Advanced disclosure surgically merge into the existing `transform`
      // shorthand, preserving any rotate / translate / scale functions
      // the user (or another section) has set.
      if (prop === '__skew_x' || prop === '__skew_y') {
        const axis = prop === '__skew_x' ? 'X' : 'Y';
        const num = parseFloat(raw) || 0;
        const fn = `skew${axis}(${num}deg)`;
        const cur = info?.computedStyles?.transform || 'none';
        const base = (cur === 'none' || !cur) ? '' : cur.trim();
        // Strip any existing skewX / skewY (or combined skew) and append.
        const stripped = base
          .replace(/skewX\([^)]*\)/gi, '')
          .replace(/skewY\([^)]*\)/gi, '')
          .replace(/skew\([^)]*\)/gi, '')
          .replace(/\s+/g, ' ')
          .trim();
        const next = (stripped ? stripped + ' ' : '') + fn;
        applyStyle('transform', next || 'none');
        return;
      }
      // Overlay-chain per-field edits (Noise / Texture). Shape:
      //   __effd_overlay_<chainIdx>_<field>
      // The field set varies by kind — we look up the entry in the
      // in-memory stash and apply the field, then dispatch the whole
      // typed array. Mode tabs come in via data-dm-value on a button,
      // which fires through the propBtn path; we also accept the value
      // from the input when it's a regular field.
      const overlayMatch = prop.match(/^__effd_overlay_(\d+)_(\w+)$/);
      if (overlayMatch) {
        const id = info?.id || '';
        if (!id) return;
        const idx = parseInt(overlayMatch[1], 10);
        const field = overlayMatch[2];
        const list = getOverlayEntries(id).slice();
        const entry = list[idx];
        if (!entry) return;
        const cb = propInput as HTMLInputElement;
        if (entry.kind === 'noise') {
          if (field === 'mode') (entry as any).mode = raw as NoiseMode;
          else if (field === 'color1' || field === 'color2') (entry as any)[field] = raw;
          else if (field === 'sizeX' || field === 'sizeY' || field === 'density' ||
                   field === 'color1Opacity' || field === 'color2Opacity' || field === 'opacity') {
            const n = parseFloat(raw);
            (entry as any)[field] = isFinite(n) ? n : 0;
          }
        } else if (entry.kind === 'texture') {
          if (field === 'clipToShape') (entry as any).clipToShape = cb.type === 'checkbox' ? cb.checked : raw === 'true';
          else if (field === 'sizeX' || field === 'sizeY' || field === 'radius') {
            const n = parseFloat(raw);
            (entry as any)[field] = isFinite(n) ? n : 0;
          }
        }
        list[idx] = entry;
        setOverlayEntries(id, list);
        dispatchOverlayEntries(id, list);
        return;
      }
      // Drop shadow's "Show behind transparent areas" toggle. Moves the
      // entry between three CSS chains depending on the checkbox state
      // (and, when toggling OFF, the element's kind):
      //   ON  → box-shadow (rectangle, shows through transparent areas)
      //   OFF + text element → text-shadow (alpha-bound to glyphs)
      //   OFF + other        → filter:drop-shadow (alpha-bound to shape)
      // Spread is preserved in the typed model but not written to text-
      // shadow / filter:drop-shadow (those chains don't support it).
      // Toggling back ON re-emits the entry with its preserved spread.
      const showBehindMatch = prop.match(/^__effd_(box|fx|text)_(\d+)_show_behind$/);
      if (showBehindMatch) {
        const srcChain = showBehindMatch[1] as 'box' | 'fx' | 'text';
        const srcIdx = parseInt(showBehindMatch[2], 10);
        const checkbox = propInput as HTMLInputElement;
        const checked = checkbox.type === 'checkbox' ? checkbox.checked : raw === 'true' || raw === 'on';
        flipDropShadowChain(srcChain, srcIdx, checked);
        return;
      }
      // Per-effect edits via virtual prop names. The shape is
      //   __effd_<chain>_<chainIdx>_<field>
      // where chain ∈ {box, fx, text, lblur, bblur}. We splice the typed
      // value into the relevant CSS shorthand chain (box-shadow, filter,
      // backdrop-filter, text-shadow) without disturbing other entries.
      if (prop.startsWith('__effd_')) {
        const m = prop.match(/^__effd_(box|fx|text|lblur|bblur)_(\d+)_(\w+)$/);
        if (!m) return;
        const chain = m[1] as 'box' | 'fx' | 'text' | 'lblur' | 'bblur';
        const idx = parseInt(m[2], 10);
        const field = m[3];
        const cs = info?.computedStyles || {};

        // Layer / backdrop blur — single-radius edit.
        if (chain === 'lblur' || chain === 'bblur') {
          const cssProp = chain === 'lblur' ? 'filter' : 'backdropFilter';
          const list = splitFilterFunctions((cs as any)[cssProp] || '');
          if (idx < 0 || idx >= list.length) return;
          const num = parseFloat(raw) || 0;
          list[idx] = 'blur(' + num + 'px)';
          applyStyle(cssProp, list.length ? list.join(' ') : 'none');
          return;
        }

        // Shadow chains (box / fx / text). Reconstruct the entry from its
        // current CSS, modify the single field, and write back.
        const get = (): { entries: string[]; cssProp: 'boxShadow' | 'filter' | 'textShadow' } => {
          if (chain === 'box') return { entries: parseCssCommaList(cs.boxShadow || ''), cssProp: 'boxShadow' };
          if (chain === 'fx') return { entries: splitFilterFunctions(cs.filter || ''), cssProp: 'filter' };
          return { entries: [cs.textShadow || 'none'], cssProp: 'textShadow' };
        };
        const { entries, cssProp } = get();
        if (idx < 0 || idx >= entries.length) return;
        const cur = entries[idx];
        const isFx = chain === 'fx';
        const inner = isFx ? (cur.match(/^drop-shadow\((.*)\)\s*$/i)?.[1] || '') : cur;
        const parsed = parseShadowEntry(inner);
        if (!parsed) return;
        const sh: ShadowParts = {
          inset: parsed.inset, x: parsed.x, y: parsed.y,
          blur: parsed.blur, spread: parsed.spread, color: parsed.color,
        };
        if (field === 'x' || field === 'y' || field === 'blur' || field === 'spread') {
          (sh as any)[field] = parseFloat(raw) || 0;
        } else if (field === 'color') {
          sh.color = raw;
        } else if (field === 'inset') {
          sh.inset = raw === 'inset';
        }
        const next = isFx ? formatFilterDropShadow(sh) : formatShadowEntry(sh);
        entries[idx] = next;
        if (cssProp === 'boxShadow') applyStyle('boxShadow', entries.length ? entries.join(', ') : 'none');
        else if (cssProp === 'filter') applyStyle('filter', entries.length ? entries.join(' ') : 'none');
        else applyStyle('textShadow', next);
        return;
      }
      // Per-layer fill edits via virtual prop names. The expanded body
      // emits these for each layer field. Mutates fillLayersByElement and
      // re-dispatches the four CSS properties at once.
      if (prop.startsWith('__fill_')) {
        const id = info?.id || '';
        if (!id) return;
        const layers = getFillLayers(id, info?.computedStyles || {});
        // __fill_color__N — solid colour. Preserves the existing alpha
        // so a colour swap from the picker / text field doesn't reset
        // the opacity field next to it.
        let m = prop.match(/^__fill_color__(\d+)$/);
        if (m) {
          const i = parseInt(m[1], 10);
          if (layers[i] && layers[i].kind === 'solid') {
            const { opacity } = splitColorOpacity(layers[i].raw);
            layers[i].raw = combineColorOpacity(raw, opacity);
            fillLayersByElement.set(id, layers);
            dispatchFillLayers(layers, applyStyle);
          }
          return;
        }
        // __fill_opacity__N — solid-fill opacity expressed as 0-100. We
        // bake it into the colour's alpha channel so the single
        // background-color write covers both. Clamped 0-100.
        m = prop.match(/^__fill_opacity__(\d+)$/);
        if (m) {
          const i = parseInt(m[1], 10);
          const layer = layers[i];
          if (layer && layer.kind === 'solid') {
            const n = parseFloat(raw);
            if (!isNaN(n)) {
              const clamped = Math.max(0, Math.min(100, n));
              propInput.value = String(clamped);
              const { color } = splitColorOpacity(layer.raw);
              layer.raw = combineColorOpacity(color, clamped / 100);
              fillLayersByElement.set(id, layers);
              dispatchFillLayers(layers, applyStyle);
            }
          }
          return;
        }
        // __fill_url__N — image url (rewrap as url(...))
        m = prop.match(/^__fill_url__(\d+)$/);
        if (m) {
          const i = parseInt(m[1], 10);
          if (layers[i] && layers[i].kind === 'image') {
            const trimmed = raw.replace(/^url\(['"]?|['"]?\)$/g, '');
            layers[i].raw = 'url(' + trimmed + ')';
            fillLayersByElement.set(id, layers);
            dispatchFillLayers(layers, applyStyle);
          }
          return;
        }
        // __fill_grad_prefix__N — angle/shape config for gradients
        m = prop.match(/^__fill_grad_prefix__(\d+)$/);
        if (m) {
          const i = parseInt(m[1], 10);
          const layer = layers[i];
          if (layer && (layer.kind === 'linear' || layer.kind === 'radial' || layer.kind === 'conic')) {
            const parsed = parseGradientStops(layer.raw);
            layer.raw = buildGradient(layer.kind, raw, parsed.stops);
            fillLayersByElement.set(id, layers);
            dispatchFillLayers(layers, applyStyle);
          }
          return;
        }
        // __fill_stop_color__N_M / __fill_stop_pos__N_M — gradient stop edits
        m = prop.match(/^__fill_stop_(color|pos)__(\d+)_(\d+)$/);
        if (m) {
          const field = m[1] as 'color' | 'pos';
          const i = parseInt(m[2], 10);
          const sIdx = parseInt(m[3], 10);
          const layer = layers[i];
          if (layer && (layer.kind === 'linear' || layer.kind === 'radial' || layer.kind === 'conic')) {
            const parsed = parseGradientStops(layer.raw);
            if (parsed.stops[sIdx]) {
              if (field === 'color') parsed.stops[sIdx].color = raw;
              else parsed.stops[sIdx].position = raw;
              layer.raw = buildGradient(layer.kind, parsed.prefix, parsed.stops);
              fillLayersByElement.set(id, layers);
              dispatchFillLayers(layers, applyStyle);
            }
          }
          return;
        }
        // __fill_size__N / __fill_repeat__N / __fill_position__N / __fill_blend__N
        m = prop.match(/^__fill_(size|repeat|position|blend)__(\d+)$/);
        if (m) {
          const field = m[1];
          const i = parseInt(m[2], 10);
          // Size / repeat / position / blend only apply to non-solid
          // layers (image / gradient). Solid fills don't have tiling.
          if (layers[i] && layers[i].kind !== 'solid') {
            if (field === 'size') layers[i].size = raw;
            else if (field === 'repeat') layers[i].repeat = raw;
            else if (field === 'position') layers[i].position = raw;
            else if (field === 'blend') layers[i].blendMode = raw;
            fillLayersByElement.set(id, layers);
            dispatchFillLayers(layers, applyStyle);
          }
          return;
        }
        return;
      }
      // Per-layer stroke edits via virtual prop names from each row.
      // Delegates to the shared helper so the change-handler path and
      // the picker-drag path stay in sync.
      if (prop.startsWith('__stroke_color__') || prop.startsWith('__stroke_weight__')) {
        applyStrokeLayerProperty(prop, raw);
        return;
      }
      // Layout guide per-layer text inputs (count, hex, opacity %, size,
      // margin, gutter). Picker drag for swatch hits applyStyle() directly
      // via the intercept above; this catches text-input commits.
      if (prop.startsWith('__guide_')) {
        applyLayoutGuideProperty(prop, raw);
        return;
      }
      const borderWidths = ['borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth'];
      const borderRadii = ['borderTopLeftRadius','borderTopRightRadius','borderBottomLeftRadius','borderBottomRightRadius'];
      // Margin / padding: the uniform field writes the `margin`/`padding`
      // shorthand (which applyStyle fans out to the four longhands); per-side
      // inputs write their own longhand only. No side-edit fan-out here.
      if (borderWidthLinked && borderWidths.includes(prop)) {
        Promise.all(borderWidths.map(p => send({ type: 'SP_APPLY_STYLE', property: p, value: val }))).then(rs => {
          const last = rs[rs.length-1]; if (last?.info) info = last.info; if (last?.styleChanges) styleChanges = last.styleChanges; render();
        }); return;
      }
      // Corner-radius fan-out only triggers for the shorthand `borderRadius`
      // input on the main row — that input is explicitly the "all four
      // corners equal" control. Per-corner inputs in the expanded 2×2
      // panel write to their specific long-form prop (borderTopLeftRadius
      // etc.) and must NOT fan out, otherwise edit-each-corner would
      // immediately equalise every corner again.
      if (prop === 'borderRadius') {
        Promise.all(borderRadii.map(p => send({ type: 'SP_APPLY_STYLE', property: p, value: val }))).then(rs => {
          const last = rs[rs.length-1]; if (last?.info) info = last.info; if (last?.styleChanges) styleChanges = last.styleChanges; render();
        }); return;
      }
      applyStyle(prop, val); return;
    }

    // Textarea text change
    const textArea = target.closest<HTMLTextAreaElement>('[data-dm-text]');
    if (textArea) {
      applyText(textArea.value);
      return;
    }
  });

  // Rich-text editor: toolbar commands. document.execCommand is what
  // contenteditable expects — bold/italic/underline/strikeThrough toggle
  // formatting on the selection; insertUnorderedList / insertOrderedList
  // wrap the current line(s) in <ul>/<ol>; createLink / removeFormat
  // self-explanatory. We intentionally call execCommand BEFORE focus
  // checks because `mousedown` on the toolbar button would already
  // have moved focus away from the editor. Each toolbar button has
  // mousedown.preventDefault to keep selection intact.
  root.addEventListener('mousedown', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-dm-richtext-cmd]');
    if (btn) {
      e.preventDefault(); // keep selection in the editor
    }
  }, true);
  root.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-dm-richtext-cmd]');
    if (!btn) return;
    const cmd = btn.dataset.dmRichtextCmd!;
    const editor = root.querySelector<HTMLElement>('[data-dm-richtext]');
    if (!editor) return;
    editor.focus();
    if (cmd === 'createLink') {
      const url = window.prompt('Link URL:');
      if (url) document.execCommand('createLink', false, url);
    } else {
      document.execCommand(cmd, false);
    }
    // Save immediately so the change shows in the Changes tab + page.
    applyHtml(editor.innerHTML);
  }, true);

  // Auto-save on blur (when the user clicks outside the editor).
  root.addEventListener('focusout', (e) => {
    const editor = (e.target as HTMLElement).closest<HTMLElement>('[data-dm-richtext]');
    if (!editor) return;
    // Defer one tick so a click landing on a toolbar button (which
    // re-focuses the editor) doesn't trigger a save mid-action.
    setTimeout(() => {
      const stillFocused = document.activeElement && (document.activeElement as HTMLElement).closest('[data-dm-richtext]');
      if (stillFocused) return;
      applyHtml(editor.innerHTML);
    }, 0);
  }, true);

  // ── Site-color tokens dropdown — focus-driven popover on hex inputs ──
  // The tokens dropdown opens when a [data-dm-tokens-trigger] input is
  // focused and closes shortly after focus leaves (the delay lets the
  // click on a token register before the dropdown is removed).
  root.addEventListener('focusin', (e) => {
    const inp = (e.target as HTMLElement).closest<HTMLInputElement>('[data-dm-tokens-trigger]');
    if (!inp) return;
    const prop = inp.dataset.dmTokensTrigger!;
    if (tokensDropdownProp !== prop) {
      tokensDropdownProp = prop;
      render();
    }
  });
  root.addEventListener('focusout', (e) => {
    const inp = (e.target as HTMLElement).closest<HTMLInputElement>('[data-dm-tokens-trigger]');
    if (!inp || tokensDropdownProp !== inp.dataset.dmTokensTrigger) return;
    // Wait briefly so a click on a token (which fires after blur) can
    // apply the value before we tear the dropdown down.
    setTimeout(() => {
      const active = document.activeElement as HTMLElement | null;
      if (active && active.closest('[data-dm-tokens-dropdown]')) return; // moved into dropdown
      if (tokensDropdownProp === inp.dataset.dmTokensTrigger) {
        tokensDropdownProp = null;
        render();
      }
    }, 200);
  });

  // ── Rich-text markdown shortcuts + URL autolink ────────────────────
  // Listens on `input` for the keystroke that completes a pattern, then
  // replaces the typed markdown with the corresponding HTML using the
  // existing Selection/Range. All helpers bail out when:
  //   • cursor isn't in a text node, or
  //   • the cursor is already inside an <a>, or
  //   • the pattern doesn't match exactly at the right boundary.
  // Order matters: most specific (markdown link) first, then list
  // prefixes, then bare URL autolink.

  function isInsideAnchor(node: Node | null): boolean {
    while (node) {
      if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === 'A') return true;
      node = (node as any).parentNode;
    }
    return false;
  }

  function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
  }

  function tryMarkdownLink(editor: HTMLElement): boolean {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    const range = sel.getRangeAt(0);
    if (!range.collapsed) return false;
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return false;
    if (!editor.contains(node)) return false;
    if (isInsideAnchor(node)) return false;
    const offset = range.startOffset;
    const text = (node.textContent || '').slice(0, offset);
    const m = text.match(/\[([^\]\n]+)\]\(([^)\s]+)\)$/);
    if (!m) return false;
    const [whole, label, url] = m;
    const start = offset - whole.length;
    const r = document.createRange();
    r.setStart(node, start);
    r.setEnd(node, offset);
    r.deleteContents();
    document.execCommand('insertHTML', false, `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`);
    return true;
  }

  function tryListShortcut(editor: HTMLElement): boolean {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    const range = sel.getRangeAt(0);
    if (!range.collapsed) return false;
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return false;
    if (!editor.contains(node)) return false;
    if (isInsideAnchor(node)) return false;
    // Don't re-list inside an existing list item.
    let parent: Node | null = node;
    while (parent) {
      const tag = (parent as Element).tagName?.toUpperCase?.();
      if (tag === 'LI' || tag === 'UL' || tag === 'OL') return false;
      parent = parent.parentNode;
    }
    const offset = range.startOffset;
    const text = node.textContent || '';
    // Pattern only triggers when the text node STARTS with the prefix and
    // the cursor is right after the trailing space. Conservative — keeps
    // mid-line "- " sequences intact.
    if (text.startsWith('- ') && offset === 2) {
      const r = document.createRange();
      r.setStart(node, 0); r.setEnd(node, 2); r.deleteContents();
      document.execCommand('insertUnorderedList');
      return true;
    }
    const numMatch = text.match(/^\d+\. /);
    if (numMatch && offset === numMatch[0].length) {
      const r = document.createRange();
      r.setStart(node, 0); r.setEnd(node, numMatch[0].length); r.deleteContents();
      document.execCommand('insertOrderedList');
      return true;
    }
    return false;
  }

  function tryUrlAutolink(editor: HTMLElement, trailingChar: string): boolean {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    const range = sel.getRangeAt(0);
    if (!range.collapsed) return false;
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return false;
    if (!editor.contains(node)) return false;
    if (isInsideAnchor(node)) return false;
    const offset = range.startOffset;
    const text = node.textContent || '';
    // Look for a URL ending right before the trailing space/newline.
    if (text[offset - 1] !== trailingChar) return false;
    const before = text.slice(0, offset - 1);
    const m = before.match(/(https?:\/\/[^\s<>"'`)\]]+|www\.[^\s<>"'`)\]]+)$/);
    if (!m) return false;
    const url = m[1];
    const start = offset - 1 - url.length;
    const href = url.startsWith('http') ? url : 'https://' + url;
    const r = document.createRange();
    r.setStart(node, start);
    r.setEnd(node, offset - 1); // keep the trailing space outside the link
    r.deleteContents();
    document.execCommand('insertHTML', false, `<a href="${escapeHtml(href)}">${escapeHtml(url)}</a>`);
    return true;
  }

  root.addEventListener('input', (e) => {
    const editor = (e.target as HTMLElement).closest<HTMLElement>('[data-dm-richtext]');
    if (!editor) return;
    const ie = e as InputEvent;
    const data = ie.data ?? '';
    // Markdown link `[text](url)` triggers on the closing `)`.
    if (data === ')') { if (tryMarkdownLink(editor)) return; }
    // List shortcuts trigger on the trailing space after `- ` or `1. `.
    // URL autolink also triggers on space.
    if (data === ' ') {
      if (tryListShortcut(editor)) return;
      if (tryUrlAutolink(editor, ' ')) return;
    }
    // Newline (Enter) also linkifies a trailing URL.
    if (ie.inputType === 'insertParagraph' || ie.inputType === 'insertLineBreak') {
      tryUrlAutolink(editor, '\n');
    }
  }, true);

  // Paste autolink: a single bare URL becomes an anchor; mixed text
  // gets every URL inside auto-linked too. Falls through to the
  // default paste behavior when no URL is present so formatting from
  // copy sources (Word/Google Docs) still flows through.
  root.addEventListener('paste', (e) => {
    const editor = (e.target as HTMLElement).closest<HTMLElement>('[data-dm-richtext]');
    if (!editor) return;
    const ce = e as ClipboardEvent;
    const text = ce.clipboardData?.getData('text/plain');
    if (!text) return;
    // Only intervene when the pasted text contains http(s) URLs — leaves
    // formatted HTML pastes alone.
    if (!/(?:https?:\/\/|www\.)\S+/i.test(text)) return;
    e.preventDefault();
    const html = text.replace(/(https?:\/\/[^\s<>"'`)\]]+|www\.[^\s<>"'`)\]]+)/gi, (url) => {
      const href = url.startsWith('http') ? url : 'https://' + url;
      return `<a href="${escapeHtml(href)}">${escapeHtml(url)}</a>`;
    });
    document.execCommand('insertHTML', false, html);
  }, true);

  // Input handler (color pickers, comment textarea, layer search)
  root.addEventListener('input', (e) => {
    const target = e.target as HTMLElement;

    // Changes-tab search input — live-filter the list as the user types.
    const changesSearchInput = target.closest<HTMLInputElement>('[data-dm-changes-search]');
    if (changesSearchInput) {
      changesSearch = changesSearchInput.value;
      render();
      return;
    }

    // Tokens panel — live filter the grouped list as the user types.
    const tokenSearchInput = target.closest<HTMLInputElement>('[data-dm-token-search]');
    if (tokenSearchInput) {
      tokenSearch = tokenSearchInput.value;
      render();
      return;
    }

    // Tokens panel — edit a CSS variable's value. We commit on every
    // keystroke so the page repaints live (the user sees consumers
    // shift as they type). Reset is available beside each edited token.
    const tokenEditInput = target.closest<HTMLInputElement>('[data-dm-token-edit]');
    if (tokenEditInput) {
      const cssVar = tokenEditInput.dataset.dmTokenEdit!;
      const scopeSelector = tokenEditInput.dataset.dmTokenScope || ':root';
      const newValue = tokenEditInput.value;
      editedTokens.set(tokenEditKey(scopeSelector, cssVar), newValue);
      send({ type: 'SP_SET_ROOT_VAR', cssVar, value: newValue, scopeSelector }).then((r: any) => { if (r?.tokenChanges) tokenChanges = r.tokenChanges; });
      return;
    }

    // Settings inputs (port, auto-connect, hover/select colours). Each is
    // persisted to chrome.storage.local so the next session starts where
    // the user left off.
    const settingInput = target.closest<HTMLInputElement>('[data-dm-setting]');
    if (settingInput) {
      const key = settingInput.dataset.dmSetting!;
      if (key === 'wsPort') {
        const n = parseInt(settingInput.value, 10);
        if (isFinite(n) && n > 0) { mcpPort = n; chrome.storage?.local?.set?.({ 'dm-mcp-port': n }); }
        return;
      }
      if (key === 'autoConnect') {
        mcpAutoConnect = settingInput.checked;
        chrome.storage?.local?.set?.({ 'dm-mcp-auto-connect': mcpAutoConnect });
        return;
      }
      if (key === 'nudge-amount') {
        const n = parseFloat(settingInput.value);
        if (isFinite(n) && n > 0) {
          nudgeAmount = n;
          chrome.storage?.local?.set?.({ 'dm-nudge-amount': nudgeAmount });
        }
        settingInput.value = String(nudgeAmount);
        return;
      }
      if (key === 'hoverColor') {
        inspectorHoverColor = settingInput.value;
        chrome.storage?.local?.set?.({ 'dm-inspector-hover-color': inspectorHoverColor });
        send({ type: 'SP_SET_INSPECTOR_COLORS', hover: inspectorHoverColor, select: inspectorSelectColor });
        return;
      }
      if (key === 'selectColor') {
        inspectorSelectColor = settingInput.value;
        chrome.storage?.local?.set?.({ 'dm-inspector-select-color': inspectorSelectColor });
        send({ type: 'SP_SET_INSPECTOR_COLORS', hover: inspectorHoverColor, select: inspectorSelectColor });
        return;
      }
      if (key === 'marginColor') {
        overlayMarginColor = settingInput.value;
        // Content script subscribes to chrome.storage.onChanged for the
        // band colours so a write here triggers a live repaint there.
        chrome.storage?.local?.set?.({ 'dm-overlay-margin-color': overlayMarginColor });
        render();
        return;
      }
      if (key === 'paddingColor') {
        overlayPaddingColor = settingInput.value;
        chrome.storage?.local?.set?.({ 'dm-overlay-padding-color': overlayPaddingColor });
        render();
        return;
      }
      if (key === 'cloudUrl') {
        // Strip trailing slash for stable comparison + storage. We don't
        // reconnect on every keystroke — only when the user clicks
        // Connect or flips a mode chip.
        mcpCloudUrl = settingInput.value.replace(/\/$/, '');
        chrome.storage?.local?.set?.({ 'dm-mcp-cloud-url': mcpCloudUrl });
        return;
      }
    }

    // Shadow field inputs (color picker + number fields)
    const shadowInput = target.closest<HTMLInputElement>('[data-dm-shadow-field]');
    if (shadowInput) { applyShadowFromFields(); return; }

    // Text-shadow field inputs (number fields, color hex)
    const tsInput = target.closest<HTMLInputElement>('[data-dm-textshadow-field]');
    if (tsInput) { applyTextShadowFromFields(); return; }

    // Transform components: translate / scale X-Y fields.
    const tcompInput = target.closest<HTMLInputElement>('[data-dm-tcomp-group]');
    if (tcompInput) {
      const group = tcompInput.dataset.dmTcompGroup as 'translate' | 'scale';
      applyTransformComponentFromFields(group);
      return;
    }

    // Filter / backdrop-filter component fields. Sliders and number inputs
    // share group+field; sync the duo first, then recompose. The slider's
    // input event fires continuously as the user drags, so this gives the
    // realtime feedback the user wanted.
    const fcompInput = target.closest<HTMLInputElement>('[data-dm-fcomp-group]');
    if (fcompInput) {
      syncFilterSiblings(fcompInput);
      const group = fcompInput.dataset.dmFcompGroup as 'filter' | 'bfilter';
      applyFilterComponentsFromFields(group);
      return;
    }

    // Color picker — hex input. Each keystroke applies if the value is
    // a valid 3/6-digit hex (alpha 8-digit also tolerated).
    const hexEl = target.closest<HTMLInputElement>('[data-dm-color-hex]');
    if (hexEl) {
      const prop = hexEl.dataset.dmColorHex!;
      let v = hexEl.value.trim().replace(/^#/, '');
      if (/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$|^[0-9a-fA-F]{8}$/.test(v)) {
        applyStyle(prop, '#' + v);
      }
      return;
    }
    // Color picker — RGB inputs (R, G, B).
    const rgbEl = target.closest<HTMLInputElement>('[data-dm-color-rgb]');
    if (rgbEl) {
      const prop = rgbEl.dataset.dmColorRgb!;
      const inputs = root.querySelectorAll<HTMLInputElement>('[data-dm-color-rgb="' + prop + '"]');
      const vals: Record<string, number> = { r: 0, g: 0, b: 0 };
      inputs.forEach(inp => { vals[inp.dataset.c!] = parseInt(inp.value, 10) || 0; });
      const r = clampInt(vals.r), g = clampInt(vals.g), b = clampInt(vals.b);
      const value = colorFormat === 'rgba' ? `rgb(${r}, ${g}, ${b})` : rgbToHexStr(r, g, b);
      applyStyle(prop, value);
      return;
    }
    // Color picker — HSL inputs (H, S, L) when format is HSL. Reads all
    // three values from the panel and writes back as `hsl(H, S%, L%)`.
    const hslEl = target.closest<HTMLInputElement>('[data-dm-color-hsl]');
    if (hslEl) {
      const prop = hslEl.dataset.dmColorHsl!;
      const inputs = root.querySelectorAll<HTMLInputElement>('[data-dm-color-hsl="' + prop + '"]');
      const vals: Record<string, number> = { h: 0, s: 0, l: 0 };
      inputs.forEach(inp => { vals[inp.dataset.c!] = parseFloat(inp.value) || 0; });
      const hh = ((vals.h % 360) + 360) % 360;
      const ss = Math.max(0, Math.min(100, vals.s));
      const ll = Math.max(0, Math.min(100, vals.l));
      applyStyle(prop, `hsl(${hh}, ${ss}%, ${ll}%)`);
      return;
    }

    // Color trigger input — search/filter the dropdown as user types
    const colorSearchInput = target.closest<HTMLInputElement>('[data-dm-color-trigger]');
    if (colorSearchInput && activeColorPickerProp === colorSearchInput.dataset.dmColorTrigger) {
      colorPickerSearch = colorSearchInput.value;
      // Re-render only the popover, but for simplicity just call render preserving focus
      const cursorPos = colorSearchInput.selectionStart;
      render();
      setTimeout(() => {
        const inp = root.querySelector<HTMLInputElement>('[data-dm-color-trigger="' + activeColorPickerProp + '"]');
        if (inp && document.activeElement !== inp) {
          inp.focus();
          if (cursorPos != null) inp.setSelectionRange(cursorPos, cursorPos);
        }
      }, 0);
      return;
    }

    // Comment text
    const commentInput = target.closest<HTMLTextAreaElement>('[data-dm-comment-input]');
    if (commentInput) {
      commentText = commentInput.value;
      commentDirty = true;
      return;
    }



    // Layer search (Phase 2)
    const searchInput = target.closest<HTMLInputElement>('[data-dm-layer-search]');
    if (searchInput) {
      layerSearch = searchInput.value;
      render();
      return;
    }

    // v1.2: Viz param sliders
    const vizParam = target.closest<HTMLInputElement>('[data-dm-viz-param]');
    if (vizParam) {
      const param = vizParam.dataset.dmVizParam!;
      const val = parseFloat(vizParam.value);
      if (param === 'bezX1') bezX1 = val;
      else if (param === 'bezY1') bezY1 = val;
      else if (param === 'bezX2') bezX2 = val;
      else if (param === 'bezY2') bezY2 = val;
      else if (param === 'sprStiffness') sprStiffness = val;
      else if (param === 'sprDamping') sprDamping = val;
      else if (param === 'sprMass') sprMass = val;
      render();
      return;
    }
  });

  // Keydown handler
  root.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement;

    // Escape closes the keyboard-shortcuts popover first.
    if (shortcutsOpen && e.key === 'Escape') {
      e.preventDefault();
      shortcutsOpen = false;
      render();
      return;
    }

    // Escape dismisses confirmation overlays (Clear All / Delete comment).
    if ((clearAllConfirming || deletingCommentId) && e.key === 'Escape') {
      e.preventDefault();
      clearAllConfirming = false;
      deletingCommentId = null;
      render();
      return;
    }

    // Escape closes just the contrast settings popover (the picker stays
    // open). Triggered before the picker-level Esc handler so the popover
    // closes one layer at a time.
    if (contrastSettingsOpen && e.key === 'Escape') {
      e.preventDefault();
      contrastSettingsOpen = false;
      render();
      return;
    }

    // Comment textarea: Ctrl+Enter to submit, Escape to cancel
    if (target.matches('[data-dm-comment-input]')) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submitComment(); }
      if (e.key === 'Escape') cancelComment();
      return;
    }

    // Color trigger: Enter applies typed value as custom color, Escape closes
    const colorTriggerKey = target.closest<HTMLInputElement>('[data-dm-color-trigger]');
    if (colorTriggerKey && activeColorPickerProp === colorTriggerKey.dataset.dmColorTrigger) {
      if (e.key === 'Escape') {
        e.preventDefault();
        activeColorPickerProp = null;
        colorPickerSearch = '';
        render();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const val = colorTriggerKey.value.trim();
        const prop = colorTriggerKey.dataset.dmColorTrigger!;
        activeColorPickerProp = null;
        colorPickerSearch = '';
        if (val) applyStyle(prop, val); else render();
        return;
      }
    }

    // Numeric input arrow keys + strict numeric filter
    // Transform-component / filter-component fields share the numeric-step
    // behavior but recompose their parent property instead of writing the
    // sub-field value directly.
    const tcompKb = target.closest<HTMLInputElement>('[data-dm-tcomp-group]');
    if (tcompKb && tcompKb.dataset.dmNumeric === '1' && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Enter')) {
      e.preventDefault();
      if (e.key !== 'Enter') {
        const step = e.shiftKey ? 10 : 1;
        const current = parseFloat(tcompKb.value) || 0;
        const newVal = e.key === 'ArrowUp' ? current + step : current - step;
        tcompKb.value = String(Math.round(newVal * 100) / 100);
      }
      applyTransformComponentFromFields(tcompKb.dataset.dmTcompGroup as 'translate' | 'scale');
      return;
    }
    const fcompKb = target.closest<HTMLInputElement>('[data-dm-fcomp-group]');
    if (fcompKb && fcompKb.dataset.dmNumeric === '1' && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Enter')) {
      e.preventDefault();
      if (e.key !== 'Enter') {
        const step = e.shiftKey ? (fcompKb.dataset.dmUnit === 'deg' ? 10 : 0.1) : (fcompKb.dataset.dmUnit === 'px' || fcompKb.dataset.dmUnit === 'deg' ? 1 : 0.05);
        const current = parseFloat(fcompKb.value) || 0;
        const newVal = e.key === 'ArrowUp' ? current + step : current - step;
        fcompKb.value = String(Math.round(newVal * 100) / 100);
      }
      syncFilterSiblings(fcompKb);
      applyFilterComponentsFromFields(fcompKb.dataset.dmFcompGroup as 'filter' | 'bfilter');
      return;
    }

    const propInput = target.closest<HTMLInputElement>('input[data-dm-prop]');
    if (propInput) {
      const isNumeric = propInput.dataset.dmNumeric === '1';
      const unit = propInput.dataset.dmUnit || '';
      const propName = propInput.dataset.dmProp || '';

      // Opacity percent input — same conversion as the change handler:
      // display 0-100, clamp, divide by 100, write the real CSS prop.
      const commitOpacityPct = (rawStr: string) => {
        const n = parseFloat(rawStr);
        if (isNaN(n)) return;
        const clamped = Math.max(0, Math.min(100, n));
        propInput.value = String(clamped);
        applyStyle('opacity', String(Math.round(clamped) / 100));
      };
      // Solid-fill opacity input — same shape as Appearance > Opacity
      // but the value is baked into the colour's alpha channel rather
      // than written to a CSS property. Kept as a separate helper so
      // both Enter-commit and Arrow-step paths share the rounding +
      // clamping rules.
      const fillOpacityMatch = propName.match(/^__fill_opacity__(\d+)$/);
      const commitFillOpacityPct = (rawStr: string) => {
        if (!fillOpacityMatch) return;
        const id = info?.id || '';
        if (!id) return;
        const layers = getFillLayers(id, info?.computedStyles || {});
        const i = parseInt(fillOpacityMatch[1], 10);
        const layer = layers[i];
        if (!layer || layer.kind !== 'solid') return;
        const n = parseFloat(rawStr);
        if (isNaN(n)) return;
        const clamped = Math.max(0, Math.min(100, n));
        propInput.value = String(clamped);
        const { color } = splitColorOpacity(layer.raw);
        layer.raw = combineColorOpacity(color, clamped / 100);
        fillLayersByElement.set(id, layers);
        dispatchFillLayers(layers, applyStyle);
      };

      if (e.key === 'Enter') {
        e.preventDefault();
        const raw = propInput.value.trim();
        if (propName === '__opacity_pct') { commitOpacityPct(raw); return; }
        if (fillOpacityMatch) { commitFillOpacityPct(raw); return; }
        if (/^var\(\s*--/.test(raw)) { applyStyle(propName, raw); return; }
        if (isNonNegativeNumericProp(propName)) {
          const n = parseFloat(raw);
          const clamped = !isFinite(n) || n < 0 ? 0 : n;
          propInput.value = String(clamped);
          applyStyle(propName, clamped + (unit || 'px'));
          return;
        }
        const isPureNumber = /^-?\d+(?:\.\d+)?$/.test(raw);
        const val = isNumeric && unit && isPureNumber ? raw + unit : raw;
        applyStyle(propName, val);
        return;
      }

      if (isNumeric && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        // Step size depends on the property's natural scale. Unitless
        // properties (line-height, opacity, scale, z-index decimals)
        // live in the 0..2 range — stepping by 1 is far too coarse, so
        // they use 0.1 (with Shift = 1). Properties with a unit
        // (px, %, deg, em…) keep the original 1 / Shift+10 cadence. The
        // sole unitless prop that wants integer steps is z-index, which
        // we special-case so 1 → 2 → 3 still works as expected. The
        // opacity-pct input also wants integer steps (it lives in 0-100,
        // not 0-1) so it joins the integer-step group.
        const integerUnitless = propName === 'zIndex' || propName === 'z-index' || propName === 'order' || propName === '__opacity_pct' || !!fillOpacityMatch;
        const isFractional = !unit && !integerUnitless;
        const step = isFractional
          ? (e.shiftKey ? 1 : 0.1)
          : (e.shiftKey ? nudgeAmount : 1);
        const current = parseFloat(propInput.value) || 0;
        let newVal = e.key === 'ArrowUp' ? current + step : current - step;
        // Non-negative numerics (corner radius, stroke weight) floor at
        // 0 so Arrow-stepping past zero never shows -1px / -10px.
        if (isNonNegativeNumericProp(propName) && newVal < 0) newVal = 0;
        const rounded = Math.round(newVal * 100) / 100; // 2 decimals max
        if (propName === '__opacity_pct') { commitOpacityPct(String(rounded)); return; }
        if (fillOpacityMatch) { commitFillOpacityPct(String(rounded)); return; }
        propInput.value = String(rounded);
        const val = unit ? rounded + unit : String(rounded);
        applyStyle(propName, val);
        return;
      }

      // Strict numeric filter — only allow valid number characters.
      // Non-negative props (corner radius, stroke weight) also block the
      // minus sign so the field never accepts a value CSS will silently
      // discard.
      if (isNumeric) {
        const allowedKeys = ['Backspace','Tab','Escape','ArrowLeft','ArrowRight','Delete','Home','End'];
        if (allowedKeys.includes(e.key) || e.ctrlKey || e.metaKey) return;
        if (e.key.length !== 1) return; // ignore other special keys
        const nonNegative = isNonNegativeNumericProp(propName);
        if (nonNegative && e.key === '-') { e.preventDefault(); return; }
        const cur = propInput.value;
        const start = propInput.selectionStart ?? cur.length;
        const end = propInput.selectionEnd ?? cur.length;
        const next = cur.slice(0, start) + e.key + cur.slice(end);
        // A var(--token) reference is legal in any numeric field — let the
        // user type one through the strict digit filter.
        if (/^v(?:a(?:r(?:\(.*)?)?)?$/i.test(next)) return;
        const re = nonNegative ? /^\d{0,}(\.\d{0,2})?$/ : /^-?\d{0,}(\.\d{0,2})?$/;
        if (!re.test(next)) {
          e.preventDefault();
        }
      }
    }

    // Text area: Ctrl+Enter to submit
    const textArea = target.closest<HTMLTextAreaElement>('[data-dm-text]');
    if (textArea && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      applyText(textArea.value);
      return;
    }

    // Phase 4C: Tab cycling through design panel inputs
    if (tab === 'design' && e.key === 'Tab') {
      const inputs = Array.from(root.querySelectorAll('.dm-input, .dm-select')) as HTMLElement[];
      if (inputs.length === 0) return;
      const idx = inputs.indexOf(document.activeElement as HTMLElement);
      if (idx === -1) return;
      e.preventDefault();
      const nextIdx = e.shiftKey ? (idx - 1 + inputs.length) % inputs.length : (idx + 1) % inputs.length;
      inputs[nextIdx].focus();
      return;
    }
  });

  // ─── HTML5 drag-and-drop for Fill layer reordering ─────────────────────
  // Each fill row carries `data-dm-fill-row="<idx>"` + `draggable="true"`.
  // dragstart stashes the source index in dataTransfer; drop reads the
  // target index, splices the source out, and re-inserts at the target.
  let fillDragSrc: number | null = null;
  root.addEventListener('dragstart', (e) => {
    const rowEl = (e.target as HTMLElement).closest<HTMLElement>('[data-dm-fill-row]');
    if (!rowEl) return;
    fillDragSrc = parseInt(rowEl.dataset.dmFillRow || '-1', 10);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(fillDragSrc));
    }
    rowEl.style.opacity = '0.5';
  });
  root.addEventListener('dragend', (e) => {
    const rowEl = (e.target as HTMLElement).closest<HTMLElement>('[data-dm-fill-row]');
    if (rowEl) rowEl.style.opacity = '';
    fillDragSrc = null;
  });
  root.addEventListener('dragover', (e) => {
    const rowEl = (e.target as HTMLElement).closest<HTMLElement>('[data-dm-fill-row]');
    if (!rowEl) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  });
  root.addEventListener('drop', (e) => {
    const rowEl = (e.target as HTMLElement).closest<HTMLElement>('[data-dm-fill-row]');
    if (!rowEl) return;
    e.preventDefault();
    const target = parseInt(rowEl.dataset.dmFillRow || '-1', 10);
    const src = fillDragSrc ?? parseInt(e.dataTransfer?.getData('text/plain') || '-1', 10);
    fillDragSrc = null;
    rowEl.style.opacity = '';
    if (src < 0 || target < 0 || src === target) return;
    const id = info?.id || '';
    if (!id) return;
    const layers = getFillLayers(id, info?.computedStyles || {});
    if (src >= layers.length || target >= layers.length) return;
    // Solid fills are now reorderable like any other layer — the
    // serializer figures out which solid wins the background-color
    // slot (bottom-most), and stacks the rest as single-color
    // linear-gradient entries in background-image. No anchor here.
    const [moved] = layers.splice(src, 1);
    layers.splice(target, 0, moved);
    fillLayersByElement.set(id, layers);
    // Keep expanded layer pointing at the same logical layer.
    if (expandedFillIdx === src) expandedFillIdx = target;
    else if (expandedFillIdx !== null && src < expandedFillIdx && target >= expandedFillIdx) expandedFillIdx -= 1;
    else if (expandedFillIdx !== null && src > expandedFillIdx && target <= expandedFillIdx) expandedFillIdx += 1;
    // Repaint immediately from the new cache so the rows flip on drop;
    // applyStyle responses arrive async and would otherwise leave the UI
    // looking unchanged for a beat (which read as "drag did nothing").
    render();
    dispatchFillLayers(layers, applyStyle);
  });

  // ─── HTML5 drag-and-drop for Stroke layer reordering ───────────────────
  // Mirrors the Fill DnD wiring exactly, using `[data-dm-stroke-row]`.
  // Stack-order semantics: top of list paints closest to the element.
  let strokeDragSrc: number | null = null;
  root.addEventListener('dragstart', (e) => {
    const rowEl = (e.target as HTMLElement).closest<HTMLElement>('[data-dm-stroke-row]');
    if (!rowEl) return;
    strokeDragSrc = parseInt(rowEl.dataset.dmStrokeRow || '-1', 10);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(strokeDragSrc));
    }
    rowEl.style.opacity = '0.5';
  });
  root.addEventListener('dragend', (e) => {
    const rowEl = (e.target as HTMLElement).closest<HTMLElement>('[data-dm-stroke-row]');
    if (rowEl) rowEl.style.opacity = '';
    strokeDragSrc = null;
  });
  root.addEventListener('dragover', (e) => {
    const rowEl = (e.target as HTMLElement).closest<HTMLElement>('[data-dm-stroke-row]');
    if (!rowEl) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  });
  root.addEventListener('drop', (e) => {
    const rowEl = (e.target as HTMLElement).closest<HTMLElement>('[data-dm-stroke-row]');
    if (!rowEl) return;
    e.preventDefault();
    const tgt = parseInt(rowEl.dataset.dmStrokeRow || '-1', 10);
    const src = strokeDragSrc ?? parseInt(e.dataTransfer?.getData('text/plain') || '-1', 10);
    strokeDragSrc = null;
    rowEl.style.opacity = '';
    if (src < 0 || tgt < 0 || src === tgt) return;
    const id = info?.id || '';
    if (!id) return;
    const cs = info?.computedStyles || {};
    const pos = getStrokeActiveTab(id, cs);
    const layers = getStrokeLayers(id, cs, pos);
    if (src >= layers.length || tgt >= layers.length) return;
    const [moved] = layers.splice(src, 1);
    layers.splice(tgt, 0, moved);
    setStrokeLayers(id, pos, layers);
    // Keep activeStrokeIdx pointing at the same logical layer.
    if (activeStrokeIdx === src) activeStrokeIdx = tgt;
    else if (src < activeStrokeIdx && tgt >= activeStrokeIdx) activeStrokeIdx -= 1;
    else if (src > activeStrokeIdx && tgt <= activeStrokeIdx) activeStrokeIdx += 1;
    const intent = strokeStyleByElement.get(id);
    const styleNow = intent || (cs.borderTopStyle && cs.borderTopStyle !== 'none' ? cs.borderTopStyle : 'solid');
    render();
    const batch: Array<{ property: string; value: string }> = [];
    dispatchStrokeLayers(layers, pos, cs, (p, v) => batch.push({ property: p, value: v }), styleNow);
    applyStylesBatch(batch, 'Reorder stroke');
  });

  // ─── HTML5 drag-and-drop for Layout Guide layer reordering ─────────────
  // Same pattern as Stroke/Fill: dragstart records the source idx,
  // dragover allows the drop, drop splices the array and re-dispatches.
  root.addEventListener('dragstart', (e) => {
    const rowEl = (e.target as HTMLElement).closest<HTMLElement>('[data-dm-guide-row]');
    if (!rowEl) return;
    draggingGuideIdx = parseInt(rowEl.dataset.dmGuideRow || '-1', 10);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(draggingGuideIdx));
    }
    rowEl.style.opacity = '0.5';
  });
  root.addEventListener('dragend', (e) => {
    const rowEl = (e.target as HTMLElement).closest<HTMLElement>('[data-dm-guide-row]');
    if (rowEl) rowEl.style.opacity = '';
    draggingGuideIdx = null;
  });
  root.addEventListener('dragover', (e) => {
    const rowEl = (e.target as HTMLElement).closest<HTMLElement>('[data-dm-guide-row]');
    if (!rowEl) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  });
  root.addEventListener('drop', (e) => {
    const rowEl = (e.target as HTMLElement).closest<HTMLElement>('[data-dm-guide-row]');
    if (!rowEl) return;
    e.preventDefault();
    const tgt = parseInt(rowEl.dataset.dmGuideRow || '-1', 10);
    const src = draggingGuideIdx ?? parseInt(e.dataTransfer?.getData('text/plain') || '-1', 10);
    draggingGuideIdx = null;
    rowEl.style.opacity = '';
    if (src < 0 || tgt < 0 || src === tgt) return;
    const id = info?.id || '';
    if (!id) return;
    const layers = getLayoutGuides(id).slice();
    if (src >= layers.length || tgt >= layers.length) return;
    const [moved] = layers.splice(src, 1);
    layers.splice(tgt, 0, moved);
    setLayoutGuides(id, layers);
    // Keep expandedGuideIdx pointing at the same logical row.
    if (expandedGuideIdx === src) expandedGuideIdx = tgt;
    else if (expandedGuideIdx !== null) {
      if (src < expandedGuideIdx && tgt >= expandedGuideIdx) expandedGuideIdx -= 1;
      else if (src > expandedGuideIdx && tgt <= expandedGuideIdx) expandedGuideIdx += 1;
    }
    dispatchLayoutGuides(id, layers);
    render();
  });

  // ─── HTML5 drag-and-drop for Effects layer reordering ─────────────────
  // Reorder is constrained to within the same CSS chain (a drop shadow
  // can't be dragged onto a layer-blur — different chains, no swap).
  // Cross-chain drops are silently ignored.
  let effectDragSrc: { idx: number; chain: string } | null = null;
  root.addEventListener('dragstart', (e) => {
    const rowEl = (e.target as HTMLElement).closest<HTMLElement>('[data-dm-effect-row]');
    if (!rowEl) return;
    effectDragSrc = {
      idx: parseInt(rowEl.dataset.dmEffectRow || '-1', 10),
      chain: rowEl.dataset.dmEffectChain || '',
    };
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(effectDragSrc.idx));
    }
    rowEl.style.opacity = '0.5';
  });
  root.addEventListener('dragend', (e) => {
    const rowEl = (e.target as HTMLElement).closest<HTMLElement>('[data-dm-effect-row]');
    if (rowEl) rowEl.style.opacity = '';
    effectDragSrc = null;
  });
  root.addEventListener('dragover', (e) => {
    const rowEl = (e.target as HTMLElement).closest<HTMLElement>('[data-dm-effect-row]');
    if (!rowEl) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  });
  root.addEventListener('drop', (e) => {
    const rowEl = (e.target as HTMLElement).closest<HTMLElement>('[data-dm-effect-row]');
    if (!rowEl) return;
    e.preventDefault();
    const dragSrc = effectDragSrc;
    effectDragSrc = null;
    rowEl.style.opacity = '';
    if (!dragSrc) return;
    const tgtChain = rowEl.dataset.dmEffectChain || '';
    if (tgtChain !== dragSrc.chain || !tgtChain) return; // cross-chain ignored
    const id = info?.id || '';
    if (!id) return;
    const cs = info?.computedStyles || {};
    const isTextLayer = !!(info && (info.tagName || '').match(/^(p|h[1-6]|span|a|li|button|label)$/i));
    const list = parseEffects(cs, id, isTextLayer);
    const srcEntry = list[dragSrc.idx];
    const tgtIdx = parseInt(rowEl.dataset.dmEffectRow || '-1', 10);
    const tgtEntry = list[tgtIdx];
    if (!srcEntry || !tgtEntry) return;
    if ((srcEntry as any).chain !== (tgtEntry as any).chain) return;
    if (dragSrc.chain === 'box') {
      const entries = parseCssCommaList(cs.boxShadow || '');
      const sci = (srcEntry as any).chainIdx;
      const tci = (tgtEntry as any).chainIdx;
      const [moved] = entries.splice(sci, 1);
      entries.splice(tci, 0, moved);
      applyStyle('boxShadow', entries.length ? entries.join(', ') : 'none');
    } else if (dragSrc.chain === 'filter') {
      const list2 = splitFilterFunctions(cs.filter || '');
      const sci = (srcEntry as any).chainIdx;
      const tci = (tgtEntry as any).chainIdx;
      const [moved] = list2.splice(sci, 1);
      list2.splice(tci, 0, moved);
      applyStyle('filter', list2.length ? list2.join(' ') : 'none');
    } else if (dragSrc.chain === 'backdrop') {
      const list2 = splitFilterFunctions((cs as any).backdropFilter || '');
      const sci = (srcEntry as any).chainIdx;
      const tci = (tgtEntry as any).chainIdx;
      const [moved] = list2.splice(sci, 1);
      list2.splice(tci, 0, moved);
      applyStyle('backdropFilter', list2.length ? list2.join(' ') : 'none');
    } else if (dragSrc.chain === 'overlay') {
      // Overlay chain reorder — swap entries inside the in-memory
      // stash and re-dispatch the JSON. Later entries paint on top,
      // matching the rest of the layered editors.
      const stash = getOverlayEntries(id).slice();
      const sci = (srcEntry as any).chainIdx;
      const tci = (tgtEntry as any).chainIdx;
      if (sci >= 0 && tci >= 0 && sci < stash.length && tci < stash.length) {
        const [moved] = stash.splice(sci, 1);
        stash.splice(tci, 0, moved);
        setOverlayEntries(id, stash);
        dispatchOverlayEntries(id, stash);
      }
    }
  });

  // Mouseover/mouseout for layer hover (using mouseover because it bubbles, unlike mouseenter)
  root.addEventListener('mouseover', (e) => {
    const target = e.target as HTMLElement;
    const layerEl = target.closest<HTMLElement>('[data-dm-layer]');
    if (layerEl) {
      const layerId = layerEl.dataset.dmLayer!;
      if (hoveredLayerId !== layerId) {
        hoveredLayerId = layerId;
        send({ type: 'SP_HOVER_ELEMENT', elementId: layerId });
        render();
      }
    }
    // Hover-preview for comment rows — scrolls the page so the pin is in
    // view (without selecting). Triggers once per row to avoid spamming
    // the content script. Pins are usually offscreen if the user hasn't
    // visited that element recently.
    const commentRowEl = target.closest<HTMLElement>('[data-dm-comment-item]');
    if (commentRowEl && (commentRowEl as any).__dmHoverScrolled !== true) {
      (commentRowEl as any).__dmHoverScrolled = true;
      const c = comments.find(cc => cc.id === commentRowEl.dataset.dmCommentItem);
      if (c?.elementId) send({ type: 'SP_SCROLL_TO_ELEMENT', elementId: c.elementId });
    }
  });

  root.addEventListener('mouseout', (e) => {
    const target = e.target as HTMLElement;
    const layerEl = target.closest<HTMLElement>('[data-dm-layer]');
    const relatedTarget = (e as MouseEvent).relatedTarget as HTMLElement | null;
    if (layerEl && (!relatedTarget || !layerEl.contains(relatedTarget))) {
      // Check if we left to another layer or completely outside
      const newLayer = relatedTarget?.closest<HTMLElement>('[data-dm-layer]');
      if (!newLayer && hoveredLayerId) {
        hoveredLayerId = null;
        send({ type: 'SP_UNHOVER_ELEMENT' });
        render();
      }
    }
  });

  // Drag and drop for layer reorder — Keynote-style single insertion
  // bar. On every dragover we re-anchor a floating `#dm-drop-indicator`
  // line to the precise drop location so the user reads the destination
  // (sibling vs child, and at what depth) from the line's geometry. For
  // a "drop INTO target as last child" gesture the line indents one
  // extra level AND the target gets a `.dm-drop-parent` highlight — the
  // user sees both pieces of feedback at once.
  const INDENT_PX = 16;

  const ensureDropIndicator = (): HTMLElement => {
    let el = document.getElementById('dm-drop-indicator') as HTMLElement | null;
    if (!el) {
      el = document.createElement('div');
      el.id = 'dm-drop-indicator';
      document.body.appendChild(el);
    }
    return el;
  };

  const hideDropIndicator = () => {
    const el = document.getElementById('dm-drop-indicator');
    if (el) el.style.display = 'none';
    root.querySelectorAll('.dm-drop-parent').forEach(n => n.classList.remove('dm-drop-parent'));
  };

  const positionDropIndicator = (target: HTMLElement, zone: 'before' | 'inside' | 'after') => {
    const el = ensureDropIndicator();
    const rect = target.getBoundingClientRect();
    // Find the layer row's depth from the rendered indent. The row's
    // `padding-left` carries `4 + depth * 16px` (see renderLayersTab).
    // Inferring from the rendered padding keeps this in sync without a
    // dedicated data-attribute.
    const padLeft = parseFloat(getComputedStyle(target).paddingLeft) || 0;
    const baseDepth = Math.max(0, Math.round((padLeft - 4) / INDENT_PX));
    const dropDepth = zone === 'inside' ? baseDepth + 1 : baseDepth;
    const left = rect.left + 4 + dropDepth * INDENT_PX;
    const width = Math.max(40, rect.right - left - 8);
    let top: number;
    if (zone === 'before') top = rect.top - 1;
    else if (zone === 'after') top = rect.bottom - 1;
    else top = rect.bottom - 1; // 'inside' — sits at the bottom but indented

    root.querySelectorAll('.dm-drop-parent').forEach(n => n.classList.remove('dm-drop-parent'));
    if (zone === 'inside') target.classList.add('dm-drop-parent');

    el.style.display = 'block';
    el.style.top = top + 'px';
    el.style.left = left + 'px';
    el.style.width = width + 'px';
  };

  root.addEventListener('dragstart', (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-dm-layer-drag]');
    if (target) {
      dragLayerId = target.dataset.dmLayerDrag!;
      (e as DragEvent).dataTransfer!.effectAllowed = 'move';
    }
  });

  root.addEventListener('dragover', (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-dm-layer-drag]');
    if (!target || !dragLayerId) return;
    const targetId = target.dataset.dmLayerDrag!;
    // Reject visually when target is inside the dragged subtree — the
    // "no-drop" cursor + a hidden indicator are the bail-out signals.
    if (isLayerAncestor(dragLayerId, targetId)) {
      (e as DragEvent).dataTransfer!.dropEffect = 'none';
      hideDropIndicator();
      return;
    }
    e.preventDefault();
    (e as DragEvent).dataTransfer!.dropEffect = 'move';
    const zone = dropZoneAt(target, (e as DragEvent).clientY);
    positionDropIndicator(target, zone);
  });

  root.addEventListener('dragleave', (e) => {
    // Hide only if we actually left the layer rows, not just slipped off
    // the indicator border for a frame. The indicator re-positions on
    // the next dragover, which is fine.
    const related = (e as DragEvent).relatedTarget as HTMLElement | null;
    if (!related || !related.closest?.('[data-dm-layer-drag]')) hideDropIndicator();
  });

  root.addEventListener('drop', (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-dm-layer-drag]');
    if (target) {
      e.preventDefault();
      const targetId = target.dataset.dmLayerDrag!;
      const zone = dropZoneAt(target, (e as DragEvent).clientY);
      hideDropIndicator();
      if (dragLayerId && targetId && dragLayerId !== targetId && !isLayerAncestor(dragLayerId, targetId)) {
        reorderLayer(dragLayerId, targetId, zone);
      }
      dragLayerId = null;
    } else {
      hideDropIndicator();
    }
  });

  root.addEventListener('dragend', () => {
    dragLayerId = null;
    hideDropIndicator();
  });
}

/* ── Phase 4C: Global keyboard navigation ── */
document.addEventListener('keydown', (e) => {
  const tag = (e.target as HTMLElement)?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

  // Undo/Redo
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undoAction(); }
  if ((e.ctrlKey || e.metaKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) { e.preventDefault(); redoAction(); }

  // Escape to deselect
  if (e.key === 'Escape') {
    if (commentMode) { cancelComment(); return; }
    if (info) { info = null; hoverInfo = null; render(); return; }
  }

  // Arrow keys in layers tab
  if (tab === 'layers' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    e.preventDefault();
    const visible = getVisibleLayers();
    if (visible.length === 0) return;
    const selectedId = info?.id || '';
    const currentIdx = visible.findIndex(n => n.id === selectedId);
    let nextIdx: number;
    if (e.key === 'ArrowUp') {
      nextIdx = currentIdx <= 0 ? visible.length - 1 : currentIdx - 1;
    } else {
      nextIdx = currentIdx >= visible.length - 1 ? 0 : currentIdx + 1;
    }
    selectElement(visible[nextIdx].id);
    // Scroll into view
    setTimeout(() => {
      const el = root.querySelector('[data-dm-layer="' + visible[nextIdx].id + '"]');
      if (el) el.scrollIntoView({ block: 'nearest' });
    }, 50);
    return;
  }

  // Enter to toggle collapse on selected layer
  if (tab === 'layers' && e.key === 'Enter' && info) {
    const node = domTree.find(n => n.id === info!.id);
    if (node && node.childCount > 0) {
      if (collapsedNodes.has(node.id)) collapsedNodes.delete(node.id);
      else collapsedNodes.add(node.id);
      render();
    }
    return;
  }
});

/* ── Init ── */
setupDelegation();
render();
