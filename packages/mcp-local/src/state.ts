// ============================================================
// Design Mode Server — State Management
// Stores style/text/DOM changes, comments, and active sessions.
// ============================================================

// Lifecycle a coding agent drives over MCP. Mirrors @design-mode/shared
// ChangeStatus. Absent ⇒ 'todo'.
export type ChangeStatus = 'todo' | 'in_progress' | 'resolved';

export interface StyleChange {
  id: string; elementId: string; selector: string;
  property: string; oldValue: string; newValue: string;
  timestamp: number;
  status?: ChangeStatus;
}

export interface TextChange {
  id: string; elementId: string; selector: string;
  oldText: string; newText: string; timestamp: number;
  status?: ChangeStatus;
}

export interface Comment {
  id: string; elementId: string; selector: string;
  text: string; timestamp: number; updatedAt: number;
  pageUrl: string; resolved?: boolean;
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
  private session: ChangeSession | null = null;
  private sessions: Map<string, MCPSession> = new Map();

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

  // Flip status on style/text changes (and resolved on comments) by id.
  // Omit `ids` to apply to everything. Returns how many items matched.
  setChangeStatus(status: ChangeStatus, ids?: string[]): number {
    const match = (id: string) => !ids || ids.includes(id);
    let count = 0;
    for (const c of this.styleChanges) if (match(c.id)) { c.status = status; count++; }
    for (const c of this.textChanges) if (match(c.id)) { c.status = status; count++; }
    for (const c of this.comments) if (match(c.id)) { c.resolved = status === 'resolved'; count++; }
    return count;
  }

  // Session management
  getOrCreateSession(pageUrl: string, pageTitle: string): MCPSession {
    for (const [, s] of this.sessions) {
      if (s.pageUrl === pageUrl) { s.lastActivity = Date.now(); return s; }
    }
    const session: MCPSession = {
      id: `session-${Date.now()}`,
      pageUrl, pageTitle, startedAt: Date.now(), lastActivity: Date.now(),
      styleChanges: [], textChanges: [],
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
    };
  }

  clear() {
    this.styleChanges = [];
    this.textChanges = [];
    this.comments = [];
    this.session = null;
  }
}

export const state = new DesignModeState();
