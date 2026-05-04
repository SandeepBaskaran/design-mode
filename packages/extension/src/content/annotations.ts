// ============================================================
// Phase 1: Annotation & Feedback System
// Rich annotations with intent, severity, status, threading,
// text selection, multi-select, and drawing
// ============================================================

import { Z_INDEX, DATA_ATTR } from '../shared';
import { getElementById, getOrAssignId, getElementRect, generateSelector, getBreadcrumbs, getComputedStyleSubset } from './helpers';
import type { Annotation, AnnotationIntent, AnnotationSeverity, AnnotationStatus, ThreadMessage, DrawingStroke, ElementRect } from '@shared/types';

const STORAGE_KEY = 'dm-annotations';
const pinElements = new Map<string, HTMLDivElement>();
let annotations: Annotation[] = [];
let sessionId = crypto.randomUUID();
let drawingCanvas: HTMLCanvasElement | null = null;
let drawingCtx: CanvasRenderingContext2D | null = null;
let isDrawing = false;
let currentStrokes: DrawingStroke[] = [];
let currentStroke: DrawingStroke | null = null;
let drawingMode = false;
let multiSelectMode = false;
let multiSelectIds: string[] = [];
let multiSelectOverlays: HTMLDivElement[] = [];
let textSelectionHandler: ((e: MouseEvent) => void) | null = null;

// ── Storage ──

export async function loadAnnotations(): Promise<Annotation[]> {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    annotations = data[STORAGE_KEY] || [];
    return annotations;
  } catch { return []; }
}

export async function saveAnnotations() {
  try { await chrome.storage.local.set({ [STORAGE_KEY]: annotations }); } catch {}
}

export function getAnnotations(): Annotation[] { return [...annotations]; }

export function getPageAnnotations(): Annotation[] {
  return annotations.filter(a => a.pageUrl === window.location.href);
}

// ── CRUD ──

export async function createAnnotation(opts: {
  elementId: string;
  comment: string;
  intent?: AnnotationIntent;
  severity?: AnnotationSeverity;
  selectedText?: string;
  isMultiSelect?: boolean;
  multiSelectIds?: string[];
  drawings?: DrawingStroke[];
  drawingDataUrl?: string;
}): Promise<Annotation> {
  const el = getElementById(opts.elementId);
  const rect = el ? getElementRect(el) : { top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 };
  const selector = el ? generateSelector(el) : '';
  const crumbs = el ? getBreadcrumbs(el) : [];
  const styles = el ? getComputedStyleSubset(el) : {};
  const classes = el && typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean) : [];

  const annotation: Annotation = {
    id: crypto.randomUUID(),
    elementId: opts.elementId,
    elementPath: selector,
    boundingBox: rect,
    comment: opts.comment,
    intent: opts.intent || 'note',
    severity: opts.severity || 'suggestion',
    status: 'pending',
    selectedText: opts.selectedText,
    nearbyText: el?.textContent?.slice(0, 200) || undefined,
    cssClasses: classes,
    computedStyles: styles,
    fullPath: crumbs.join(' > '),
    isMultiSelect: opts.isMultiSelect || false,
    multiSelectIds: opts.multiSelectIds,
    thread: [],
    drawings: opts.drawings,
    drawingDataUrl: opts.drawingDataUrl,
    pageUrl: window.location.href,
    pageTitle: document.title,
    timestamp: Date.now(),
    updatedAt: Date.now(),
    author: 'User',
    sessionId,
  };

  annotations.push(annotation);
  await saveAnnotations();
  showAnnotationPin(annotation);
  return annotation;
}

export async function updateAnnotation(id: string, updates: Partial<Annotation>): Promise<Annotation | null> {
  const idx = annotations.findIndex(a => a.id === id);
  if (idx === -1) return null;
  annotations[idx] = { ...annotations[idx], ...updates, updatedAt: Date.now() };
  await saveAnnotations();
  showAnnotationPin(annotations[idx]);
  return annotations[idx];
}

export async function deleteAnnotation(id: string): Promise<boolean> {
  const idx = annotations.findIndex(a => a.id === id);
  if (idx === -1) return false;
  annotations.splice(idx, 1);
  await saveAnnotations();
  const pin = pinElements.get(id);
  if (pin) { pin.remove(); pinElements.delete(id); }
  return true;
}

export async function updateAnnotationStatus(id: string, status: AnnotationStatus): Promise<Annotation | null> {
  return updateAnnotation(id, { status });
}

// ── Threading ──

export async function addThreadMessage(annotationId: string, text: string, authorType: 'human' | 'agent' = 'human'): Promise<ThreadMessage | null> {
  const ann = annotations.find(a => a.id === annotationId);
  if (!ann) return null;
  const msg: ThreadMessage = {
    id: crypto.randomUUID(),
    author: authorType === 'human' ? 'User' : 'Agent',
    authorType,
    text,
    timestamp: Date.now(),
  };
  ann.thread.push(msg);
  ann.updatedAt = Date.now();
  await saveAnnotations();
  return msg;
}

export async function updateThreadMessage(annotationId: string, messageId: string, text: string): Promise<boolean> {
  const ann = annotations.find(a => a.id === annotationId);
  if (!ann) return false;
  const msg = ann.thread.find(m => m.id === messageId);
  if (!msg) return false;
  msg.text = text;
  msg.timestamp = Date.now();
  ann.updatedAt = Date.now();
  await saveAnnotations();
  return true;
}

// ── Annotation Pins ──

const INTENT_COLORS: Record<AnnotationIntent, string> = {
  fix: '#EF4444', change: '#F59E0B', question: '#3B82F6', approve: '#10B981', note: '#8B5CF6',
};

const INTENT_ICONS: Record<AnnotationIntent, string> = {
  fix: '🔧', change: '✏️', question: '❓', approve: '✅', note: '📝',
};

export function showAnnotationPin(ann: Annotation) {
  const el = getElementById(ann.elementId);
  if (!el) return;
  let pin = pinElements.get(ann.id);
  if (!pin) {
    pin = document.createElement('div');
    pin.className = 'dm-annotation-pin';
    pin.setAttribute('data-dm-annotation', ann.id);
    Object.assign(pin.style, {
      position: 'absolute',
      zIndex: String(Z_INDEX.ANNOTATION_PIN),
      width: '28px', height: '28px',
      borderRadius: '50% 50% 50% 0',
      background: INTENT_COLORS[ann.intent],
      color: '#fff', fontSize: '13px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer', fontWeight: '700',
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      transform: 'rotate(-45deg)',
      transition: 'transform 0.15s ease, box-shadow 0.15s ease',
      pointerEvents: 'auto',
      border: ann.status === 'resolved' ? '2px solid #10B981' : 'none',
      opacity: ann.status === 'dismissed' ? '0.5' : '1',
    });
    pin.innerHTML = `<span style="transform:rotate(45deg);font-size:14px">${INTENT_ICONS[ann.intent]}</span>`;
    pin.title = `[${ann.intent.toUpperCase()}] ${ann.comment.slice(0, 60)}`;
    pin.addEventListener('mouseenter', () => { if (pin) pin.style.transform = 'rotate(-45deg) scale(1.2)'; });
    pin.addEventListener('mouseleave', () => { if (pin) pin.style.transform = 'rotate(-45deg)'; });
    pin.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('dm-annotation-clicked', { detail: ann }));
      try { chrome.runtime.sendMessage({ type: 'ANNOTATION_CLICKED', payload: ann }); } catch {}
    });
    document.documentElement.appendChild(pin);
    pinElements.set(ann.id, pin);
  }
  const rect = getElementRect(el);
  pin.style.top = (rect.top - 14) + 'px';
  pin.style.left = (rect.left + rect.width - 14) + 'px';
  pin.style.background = INTENT_COLORS[ann.intent];
  pin.style.opacity = ann.status === 'dismissed' ? '0.5' : '1';
  pin.style.border = ann.status === 'resolved' ? '2px solid #10B981' : 'none';
}

export async function showAllAnnotationPins() {
  await loadAnnotations();
  const pageAnns = getPageAnnotations();
  for (const a of pageAnns) showAnnotationPin(a);
}

export function hideAllAnnotationPins() {
  pinElements.forEach(pin => pin.remove());
  pinElements.clear();
}

// ── Text Selection Annotations ──

export function enableTextSelection(onSelect: (text: string, elementId: string, rect: ElementRect) => void) {
  textSelectionHandler = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) return;
    const range = sel.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const el = container.nodeType === 1 ? container as HTMLElement : container.parentElement;
    if (!el) return;
    const id = getOrAssignId(el);
    const r = range.getBoundingClientRect();
    const rect: ElementRect = {
      top: r.top + window.scrollY, left: r.left + window.scrollX,
      width: r.width, height: r.height,
      bottom: r.bottom + window.scrollY, right: r.right + window.scrollX,
    };
    onSelect(sel.toString(), id, rect);
  };
  document.addEventListener('mouseup', textSelectionHandler);
}

export function disableTextSelection() {
  if (textSelectionHandler) {
    document.removeEventListener('mouseup', textSelectionHandler);
    textSelectionHandler = null;
  }
}

// ── Multi-Select Drag Selection ──

export function enableMultiSelect() {
  multiSelectMode = true;
  multiSelectIds = [];
  document.addEventListener('click', multiSelectClick, true);
}

export function disableMultiSelect() {
  multiSelectMode = false;
  multiSelectIds = [];
  clearMultiSelectOverlays();
  document.removeEventListener('click', multiSelectClick, true);
}

function multiSelectClick(e: MouseEvent) {
  if (!multiSelectMode) return;
  const t = e.target as HTMLElement;
  if (!t || t.getAttribute('data-dm-annotation') || t.closest('[data-dm-annotation]')) return;
  e.preventDefault();
  e.stopPropagation();
  const id = getOrAssignId(t);
  const idx = multiSelectIds.indexOf(id);
  if (idx > -1) {
    multiSelectIds.splice(idx, 1);
  } else {
    multiSelectIds.push(id);
  }
  updateMultiSelectOverlays();
}

function updateMultiSelectOverlays() {
  clearMultiSelectOverlays();
  for (const id of multiSelectIds) {
    const el = getElementById(id);
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed', top: rect.top + 'px', left: rect.left + 'px',
      width: rect.width + 'px', height: rect.height + 'px',
      border: '2px dashed #8B5CF6', background: 'rgba(139, 92, 246, 0.1)',
      pointerEvents: 'none', zIndex: String(Z_INDEX.SELECT_OVERLAY),
      borderRadius: '2px',
    });
    document.documentElement.appendChild(overlay);
    multiSelectOverlays.push(overlay);
  }
}

function clearMultiSelectOverlays() {
  multiSelectOverlays.forEach(o => o.remove());
  multiSelectOverlays = [];
}

export function getMultiSelectIds(): string[] { return [...multiSelectIds]; }

// ── Drawing / Sketching ──

export function enableDrawing() {
  if (drawingCanvas) return;
  drawingMode = true;
  drawingCanvas = document.createElement('canvas');
  drawingCanvas.id = 'dm-drawing-canvas';
  Object.assign(drawingCanvas.style, {
    position: 'fixed', top: '0', left: '0',
    width: '100vw', height: '100vh',
    zIndex: String(Z_INDEX.DRAWING_CANVAS),
    cursor: 'crosshair',
    pointerEvents: 'auto',
    background: 'transparent',
  });
  drawingCanvas.width = window.innerWidth;
  drawingCanvas.height = window.innerHeight;
  document.documentElement.appendChild(drawingCanvas);
  drawingCtx = drawingCanvas.getContext('2d');

  drawingCanvas.addEventListener('mousedown', onDrawStart);
  drawingCanvas.addEventListener('mousemove', onDrawMove);
  drawingCanvas.addEventListener('mouseup', onDrawEnd);
  drawingCanvas.addEventListener('mouseleave', onDrawEnd);
  // Redraw existing strokes
  redrawStrokes();
}

export function disableDrawing() {
  drawingMode = false;
  if (drawingCanvas) {
    drawingCanvas.remove();
    drawingCanvas = null;
    drawingCtx = null;
  }
}

export function isDrawingMode(): boolean { return drawingMode; }

function onDrawStart(e: MouseEvent) {
  isDrawing = true;
  currentStroke = {
    id: crypto.randomUUID(),
    points: [{ x: e.clientX, y: e.clientY, pressure: 0.5 }],
    color: '#EF4444',
    width: 3,
    opacity: 1,
  };
}

function onDrawMove(e: MouseEvent) {
  if (!isDrawing || !currentStroke || !drawingCtx) return;
  currentStroke.points.push({ x: e.clientX, y: e.clientY, pressure: 0.5 });
  // Draw segment
  const pts = currentStroke.points;
  if (pts.length < 2) return;
  drawingCtx.beginPath();
  drawingCtx.strokeStyle = currentStroke.color;
  drawingCtx.lineWidth = currentStroke.width;
  drawingCtx.lineCap = 'round';
  drawingCtx.lineJoin = 'round';
  drawingCtx.globalAlpha = currentStroke.opacity;
  drawingCtx.moveTo(pts[pts.length - 2].x, pts[pts.length - 2].y);
  drawingCtx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
  drawingCtx.stroke();
}

function onDrawEnd() {
  if (!isDrawing || !currentStroke) return;
  isDrawing = false;
  if (currentStroke.points.length > 1) {
    currentStrokes.push(currentStroke);
  }
  currentStroke = null;
}

function redrawStrokes() {
  if (!drawingCtx || !drawingCanvas) return;
  drawingCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
  for (const stroke of currentStrokes) {
    if (stroke.points.length < 2) continue;
    drawingCtx.beginPath();
    drawingCtx.strokeStyle = stroke.color;
    drawingCtx.lineWidth = stroke.width;
    drawingCtx.lineCap = 'round';
    drawingCtx.lineJoin = 'round';
    drawingCtx.globalAlpha = stroke.opacity;
    drawingCtx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let i = 1; i < stroke.points.length; i++) {
      drawingCtx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }
    drawingCtx.stroke();
  }
}

export function clearDrawing() {
  currentStrokes = [];
  if (drawingCtx && drawingCanvas) {
    drawingCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
  }
}

export function getDrawingStrokes(): DrawingStroke[] { return [...currentStrokes]; }

export function getDrawingDataUrl(): string {
  return drawingCanvas?.toDataURL('image/png') || '';
}

export function setDrawingColor(color: string) {
  // Applies to next stroke
  // We store this as a module-level default
  (globalThis as any).__dmDrawColor = color;
}

export function setDrawingWidth(width: number) {
  (globalThis as any).__dmDrawWidth = width;
}

export function undoLastStroke() {
  currentStrokes.pop();
  redrawStrokes();
}

// ── Scroll sync for pins ──

function refreshPins() {
  for (const ann of getPageAnnotations()) {
    showAnnotationPin(ann);
  }
}

window.addEventListener('scroll', refreshPins, true);
window.addEventListener('resize', () => {
  refreshPins();
  if (drawingCanvas) {
    drawingCanvas.width = window.innerWidth;
    drawingCanvas.height = window.innerHeight;
    redrawStrokes();
  }
});
