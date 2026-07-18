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

export interface DomChange {
  id: string; elementId: string; selector: string;
  action: 'delete' | 'duplicate' | 'move' | 'insert';
  tagName: string;
  timestamp: number;
  status?: ChangeStatus;
}

export interface Comment {
  id: string; elementId: string; selector: string;
  text: string; timestamp: number; updatedAt: number;
  pageUrl: string; resolved?: boolean;
  region?: { x: number; y: number; w: number; h: number };
}

// Set when the user clicks "Send to Agent" in the side panel.
export interface AgentHandoff {
  requestedAt: number;
  pageUrl: string;
  pageTitle: string;
}

export interface ChangeSession {
  pageUrl: string;
  pageTitle: string;
  // Design tokens the user redefined. `scopeSelector` is the selector the
  // token is declared on (':root', a theme class like '.cds--g100', …).
  tokenChanges?: Array<{
    cssVar: string; scopeSelector: string;
    oldValue: string; newValue: string; system?: string; cssRule: string;
  }>;
  tokenGuidance?: string;
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
  private domChanges: DomChange[] = [];
  private comments: Comment[] = [];
  private session: ChangeSession | null = null;
  private sessions: Map<string, MCPSession> = new Map();
  private handoff: AgentHandoff | null = null;

  // Upsert by id — the extension re-syncs a change every time the user
  // tweaks the same property, so appends would accumulate duplicates.
  private upsert<T extends { id: string }>(list: T[], change: T) {
    const i = list.findIndex(c => c.id === change.id);
    if (i >= 0) list[i] = change; else list.push(change);
    this.updateSessionActivity();
  }

  addStyleChange(change: StyleChange) { this.upsert(this.styleChanges, change); }
  addTextChange(change: TextChange) { this.upsert(this.textChanges, change); }
  addDomChange(change: DomChange) { this.upsert(this.domChanges, change); }

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

  // Flip status on style/text/DOM changes (and resolved on comments) by id.
  // Omit `ids` to apply to everything. Returns how many items matched.
  setChangeStatus(status: ChangeStatus, ids?: string[]): number {
    const match = (id: string) => !ids || ids.includes(id);
    let count = 0;
    for (const c of this.styleChanges) if (match(c.id)) { c.status = status; count++; }
    for (const c of this.textChanges) if (match(c.id)) { c.status = status; count++; }
    for (const c of this.domChanges) if (match(c.id)) { c.status = status; count++; }
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

  // SESSION_UPDATE carries the page's complete current arrays — replace
  // wholesale so the server converges on page truth (covers edits made
  // before the server started and entries the page has since dropped).
  replaceChanges(report: { styleChanges?: StyleChange[]; textChanges?: TextChange[]; domChanges?: DomChange[] }) {
    const valid = <T extends { id: string }>(list: T[] | undefined) =>
      Array.isArray(list) ? list.filter(c => c && typeof c.id === 'string') : null;
    const styles = valid(report.styleChanges);
    const texts = valid(report.textChanges);
    const doms = valid(report.domChanges);
    if (styles) this.styleChanges = styles;
    if (texts) this.textChanges = texts;
    if (doms) this.domChanges = doms;
  }
  setHandoff(handoff: AgentHandoff) { this.handoff = handoff; }
  getHandoff(): AgentHandoff | null { return this.handoff; }
  getStyleChanges(): StyleChange[] { return this.styleChanges; }
  getTextChanges(): TextChange[] { return this.textChanges; }
  getDomChanges(): DomChange[] { return this.domChanges; }
  getComments(pageUrl?: string): Comment[] {
    if (pageUrl) return this.comments.filter(c => c.pageUrl === pageUrl);
    return this.comments;
  }
  getSession(): ChangeSession | null { return this.session; }

  // Built from the live event-fed arrays — the stored session snapshot only
  // contributes page metadata. Returning the snapshot itself would freeze
  // get_changes at connect time.
  getChangeReport(): object {
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
      pageUrl: this.session?.pageUrl || 'unknown',
      pageTitle: this.session?.pageTitle || 'unknown',
      styleChanges: changes,
      textChanges: this.textChanges.map(c => ({ selector: c.selector, oldText: c.oldText, newText: c.newText })),
      domChanges: this.domChanges.map(c => ({ selector: c.selector, action: c.action, tagName: c.tagName })),
      cssBlock: cssRules.join('\n\n'),
    };
  }

  clear() {
    this.styleChanges = [];
    this.textChanges = [];
    this.domChanges = [];
    this.comments = [];
    this.session = null;
    this.sessions.clear();
    this.handoff = null;
  }
}

export const state = new DesignModeState();
