// ============================================================
// Design Mode Server — State Management (Phase 8 Enhanced)
// Stores changes, comments, annotations, sessions
// ============================================================

export interface StyleChange {
  id: string; elementId: string; selector: string;
  property: string; oldValue: string; newValue: string;
  timestamp: number;
}

export interface TextChange {
  id: string; elementId: string; selector: string;
  oldText: string; newText: string; timestamp: number;
}

export interface Comment {
  id: string; elementId: string; selector: string;
  text: string; timestamp: number; updatedAt: number;
  pageUrl: string; resolved?: boolean;
}

export interface ThreadMessage {
  id: string; author: string; authorType: 'human' | 'agent';
  text: string; timestamp: number;
}

export interface Annotation {
  id: string;
  elementId: string; elementPath: string;
  boundingBox: { top: number; left: number; width: number; height: number; bottom: number; right: number };
  comment: string;
  intent: 'fix' | 'change' | 'question' | 'approve' | 'note';
  severity: 'blocking' | 'important' | 'suggestion' | 'info';
  status: 'pending' | 'acknowledged' | 'in_progress' | 'resolved' | 'dismissed';
  selectedText?: string;
  nearbyText?: string;
  cssClasses: string[];
  fullPath: string;
  isMultiSelect: boolean;
  thread: ThreadMessage[];
  drawings?: any[];
  drawingDataUrl?: string;
  reactComponents?: string[];
  sourceFile?: string;
  pageUrl: string;
  pageTitle: string;
  timestamp: number;
  updatedAt: number;
  author: string;
  sessionId: string;
}

export interface ChangeSession {
  pageUrl: string;
  pageTitle: string;
  styleChanges: Array<{
    selector: string; property: string;
    oldValue: string; newValue: string; cssRule: string;
  }>;
  textChanges: Array<{ selector: string; oldText: string; newText: string }>;
  cssBlock: string;
}

export interface MCPSession {
  id: string;
  pageUrl: string;
  pageTitle: string;
  startedAt: number;
  lastActivity: number;
  annotations: Annotation[];
  styleChanges: StyleChange[];
  textChanges: TextChange[];
}

function toKebab(s: string): string {
  return s.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
}

class DesignModeState {
  private styleChanges: StyleChange[] = [];
  private textChanges: TextChange[] = [];
  private comments: Comment[] = [];
  private annotations: Annotation[] = [];
  private session: ChangeSession | null = null;
  private sessions: Map<string, MCPSession> = new Map();
  private watchers: Map<string, { since: number; resolve: (anns: Annotation[]) => void; timeout: NodeJS.Timeout }> = new Map();

  addStyleChange(change: StyleChange) { this.styleChanges.push(change); this.updateSessionActivity(); }
  addTextChange(change: TextChange) { this.textChanges.push(change); this.updateSessionActivity(); }

  addComment(comment: Comment) {
    const existing = this.comments.findIndex(c => c.id === comment.id);
    if (existing >= 0) this.comments[existing] = comment;
    else this.comments.push(comment);
  }

  updateComment(id: string, text: string): Comment | null {
    const c = this.comments.find(x => x.id === id);
    if (!c) return null;
    c.text = text; c.updatedAt = Date.now();
    return c;
  }

  deleteComment(id: string) { this.comments = this.comments.filter(c => c.id !== id); }

  // Phase 1/8: Annotations
  addAnnotation(ann: Annotation) {
    const existing = this.annotations.findIndex(a => a.id === ann.id);
    if (existing >= 0) this.annotations[existing] = ann;
    else this.annotations.push(ann);
    this.updateSessionActivity();
    this.notifyWatchers(ann);
  }

  updateAnnotation(id: string, updates: Partial<Annotation>): Annotation | null {
    const ann = this.annotations.find(a => a.id === id);
    if (!ann) return null;
    Object.assign(ann, updates, { updatedAt: Date.now() });
    this.notifyWatchers(ann);
    return ann;
  }

  deleteAnnotation(id: string) { this.annotations = this.annotations.filter(a => a.id !== id); }

  getAnnotations(opts?: { pageUrl?: string; status?: string; sessionId?: string }): Annotation[] {
    let anns = [...this.annotations];
    if (opts?.pageUrl) anns = anns.filter(a => a.pageUrl === opts.pageUrl);
    if (opts?.status) anns = anns.filter(a => a.status === opts.status);
    if (opts?.sessionId) anns = anns.filter(a => a.sessionId === opts.sessionId);
    return anns;
  }

  getPendingAnnotations(): Annotation[] {
    return this.annotations.filter(a => a.status === 'pending' || a.status === 'acknowledged');
  }

  acknowledgeAnnotation(id: string): Annotation | null {
    return this.updateAnnotation(id, { status: 'acknowledged' });
  }

  resolveAnnotation(id: string): Annotation | null {
    return this.updateAnnotation(id, { status: 'resolved' });
  }

  dismissAnnotation(id: string): Annotation | null {
    return this.updateAnnotation(id, { status: 'dismissed' });
  }

  addThreadReply(annotationId: string, text: string, authorType: 'human' | 'agent' = 'agent'): ThreadMessage | null {
    const ann = this.annotations.find(a => a.id === annotationId);
    if (!ann) return null;
    const msg: ThreadMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      author: authorType === 'agent' ? 'Agent' : 'User',
      authorType, text, timestamp: Date.now(),
    };
    ann.thread.push(msg);
    ann.updatedAt = Date.now();
    return msg;
  }

  // Phase 8: Watch/poll annotations (SSE-like)
  watchAnnotations(sessionId: string, since: number): Promise<Annotation[]> {
    const existing = this.annotations.filter(a => a.sessionId === sessionId && a.updatedAt > since);
    if (existing.length > 0) return Promise.resolve(existing);
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.watchers.delete(sessionId);
        resolve([]);
      }, 30000); // 30s long poll
      this.watchers.set(sessionId, { since, resolve, timeout });
    });
  }

  private notifyWatchers(ann: Annotation) {
    const watcher = this.watchers.get(ann.sessionId);
    if (watcher && ann.updatedAt > watcher.since) {
      clearTimeout(watcher.timeout);
      this.watchers.delete(ann.sessionId);
      watcher.resolve([ann]);
    }
  }

  // Phase 8: Session management
  getOrCreateSession(pageUrl: string, pageTitle: string): MCPSession {
    for (const [, s] of this.sessions) {
      if (s.pageUrl === pageUrl) { s.lastActivity = Date.now(); return s; }
    }
    const session: MCPSession = {
      id: `session-${Date.now()}`,
      pageUrl, pageTitle, startedAt: Date.now(), lastActivity: Date.now(),
      annotations: [], styleChanges: [], textChanges: [],
    };
    this.sessions.set(session.id, session);
    return session;
  }

  listSessions(): MCPSession[] { return Array.from(this.sessions.values()); }

  private updateSessionActivity() {
    for (const [, s] of this.sessions) { s.lastActivity = Date.now(); }
  }

  updateSession(session: ChangeSession) { this.session = session; }
  getStyleChanges(): StyleChange[] { return this.styleChanges; }
  getTextChanges(): TextChange[] { return this.textChanges; }
  getComments(pageUrl?: string): Comment[] {
    if (pageUrl) return this.comments.filter(c => c.pageUrl === pageUrl);
    return this.comments;
  }
  getSession(): ChangeSession | null { return this.session; }

  getChangeReport(): object {
    if (this.session) return this.session;
    const bySelector = new Map<string, Map<string, { old: string; new_: string }>>();
    for (const c of this.styleChanges) {
      if (!bySelector.has(c.selector)) bySelector.set(c.selector, new Map());
      bySelector.get(c.selector)!.set(c.property, { old: c.oldValue, new_: c.newValue });
    }
    const changes: Array<{ selector: string; property: string; oldValue: string; newValue: string; cssRule: string }> = [];
    const cssRules: string[] = [];
    for (const [sel, props] of bySelector) {
      const decls: string[] = [];
      for (const [prop, vals] of props) {
        const kebab = toKebab(prop);
        changes.push({ selector: sel, property: prop, oldValue: vals.old, newValue: vals.new_, cssRule: `${sel} { ${kebab}: ${vals.new_}; }` });
        decls.push(`  ${kebab}: ${vals.new_};`);
      }
      cssRules.push(`${sel} {\n${decls.join('\n')}\n}`);
    }
    return {
      pageUrl: 'unknown', pageTitle: 'unknown',
      styleChanges: changes,
      textChanges: this.textChanges.map(c => ({ selector: c.selector, oldText: c.oldText, newText: c.newText })),
      cssBlock: cssRules.join('\n\n'),
      annotations: this.annotations.map(a => ({
        id: a.id, selector: a.elementPath, comment: a.comment,
        intent: a.intent, severity: a.severity, status: a.status,
        selectedText: a.selectedText, thread: a.thread,
        reactComponents: a.reactComponents, sourceFile: a.sourceFile,
      })),
    };
  }

  clear() {
    this.styleChanges = []; this.textChanges = []; this.comments = [];
    this.annotations = []; this.session = null;
  }
}

export const state = new DesignModeState();
