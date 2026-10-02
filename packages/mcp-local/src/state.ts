// ============================================================
// Design Mode Server — State Management
// Stores style/text/DOM changes, comments, and active sessions.
// ============================================================

// Lifecycle a coding agent drives over MCP. Mirrors @design-mode/shared
// ChangeStatus. Absent ⇒ 'todo'.
export type ChangeStatus = 'todo' | 'in_progress' | 'resolved';

interface ViewportContext {
  viewportWidth?: number;
  breakpoint?: 'mobile' | 'tablet' | 'desktop';
}

function viewportContext(change: ViewportContext): ViewportContext {
  return {
    ...(change.viewportWidth !== undefined ? { viewportWidth: change.viewportWidth } : {}),
    ...(change.breakpoint !== undefined ? { breakpoint: change.breakpoint } : {}),
  };
}

export interface RouteMetadata {
  pageUrl?: string;
  routeKey?: string;
}

export interface StyleChange extends RouteMetadata, ViewportContext {
  id: string; elementId: string; selector: string;
  property: string; oldValue: string; newValue: string;
  timestamp: number;
  status?: ChangeStatus;
}

export interface TextChange extends RouteMetadata, ViewportContext {
  id: string; elementId: string; selector: string;
  oldText: string; newText: string; timestamp: number;
  attributeName?: string;
  status?: ChangeStatus;
}

export interface DomChange extends RouteMetadata, ViewportContext {
  id: string; elementId: string; selector: string;
  action: 'delete' | 'duplicate' | 'move' | 'insert';
  origin?: { parentSelector: string; index: number; parentId?: string };
  destination?: { parentSelector: string; index: number; parentId?: string };
  tagName: string;
  timestamp: number;
  status?: ChangeStatus;
}

export interface Comment extends RouteMetadata {
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

export interface RouteGroup {
  routeKey: string;
  url: string;
  styleChanges: StyleChange[];
  textChanges: TextChange[];
  domChanges: DomChange[];
  comments: Comment[];
}

export interface ChangeSession {
  routeGroups?: RouteGroup[];
  domChanges?: DomChange[];
  comments?: Comment[];
  pageUrl: string;
  pageTitle: string;
  // Design tokens the user redefined. `scopeSelector` is the selector the
  // token is declared on (':root', a theme class like '.cds--g100', …).
  tokenChanges?: Array<{
    cssVar: string; scopeSelector: string;
    oldValue: string; newValue: string; system?: string; cssRule: string;
  }>;
  tokenGuidance?: string;
  styleChanges: Array<RouteMetadata & {
    selector: string; property: string;
    oldValue: string; newValue: string; cssRule: string;
  }>;
  textChanges: Array<RouteMetadata & { selector: string; oldText: string; newText: string; attributeName?: string }>;
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
  private upsert<T extends { id: string } & RouteMetadata>(list: T[], change: T) {
    const i = list.findIndex(c => c.id === change.id);
    // Incremental events can omit the metadata added by a site snapshot.
    if (i >= 0) list[i] = { ...this.routeMetadata(list[i]), ...change }; else list.push(change);
    this.updateSessionActivity();
  }

  addStyleChange(change: StyleChange) { this.upsert(this.styleChanges, change); }
  addTextChange(change: TextChange) { this.upsert(this.textChanges, change); }
  addDomChange(change: DomChange) { this.upsert(this.domChanges, change); }

  addComment(comment: Comment) {
    const existing = this.comments.findIndex(c => c.id === comment.id);
    if (existing >= 0) this.comments[existing] = { ...this.routeMetadata(this.comments[existing]), ...comment };
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
  replaceChanges(report: { styleChanges?: StyleChange[]; textChanges?: TextChange[]; domChanges?: DomChange[]; comments?: Comment[] }) {
    const valid = <T extends { id: string }>(list: T[] | undefined) =>
      Array.isArray(list) ? list.filter(c => c && typeof c.id === 'string') : null;
    const styles = valid(report.styleChanges);
    const texts = valid(report.textChanges);
    const doms = valid(report.domChanges);
    const comments = valid(report.comments);
    if (styles) this.styleChanges = styles;
    if (texts) this.textChanges = texts;
    if (doms) this.domChanges = doms;
    if (comments) this.comments = comments;
  }
  setHandoff(handoff: AgentHandoff | null) { this.handoff = handoff; }
  getHandoff(): AgentHandoff | null { return this.handoff; }
  getStyleChanges(): StyleChange[] { return this.styleChanges; }
  getTextChanges(): TextChange[] { return this.textChanges; }
  getDomChanges(): DomChange[] { return this.domChanges; }
  getComments(pageUrl?: string): Comment[] {
    if (pageUrl) return this.comments.filter(c => c.pageUrl === pageUrl);
    return this.comments;
  }
  getSession(): ChangeSession | null { return this.session; }

  // Keep legacy single-page output sparse; never infer that an explicitly
  // routed change belongs to whichever page happens to be active now.
  private routeMetadata(change: RouteMetadata): RouteMetadata {
    return {
      ...(change.pageUrl !== undefined ? { pageUrl: change.pageUrl } : {}),
      ...(change.routeKey !== undefined ? { routeKey: change.routeKey } : {}),
    };
  }

  private routeKey(change: RouteMetadata): string {
    return change.routeKey ?? change.pageUrl ?? this.session?.pageUrl ?? 'unknown';
  }

  // Built from live arrays, not the SESSION_UPDATE snapshot: incremental
  // events and status changes must also be reflected in each route group.
  getChangeReport(): object {
    const byRouteSelector = new Map<string, Map<string, StyleChange>>();
    for (const c of this.styleChanges) {
      const key = JSON.stringify([this.routeKey(c), c.selector]);
      if (!byRouteSelector.has(key)) byRouteSelector.set(key, new Map());
      byRouteSelector.get(key)!.set(c.property, c);
    }
    const changes: Array<RouteMetadata & { selector: string; property: string; oldValue: string; newValue: string; cssRule: string }> = [];
    const cssByRoute = new Map<string, { pageUrl?: string; rules: string[] }>();
    for (const props of byRouteSelector.values()) {
      const first = props.values().next().value!;
      const decls: string[] = [];
      for (const c of props.values()) {
        const kebab = toKebab(c.property);
        changes.push({ ...this.routeMetadata(c), ...viewportContext(c), selector: c.selector, property: c.property, oldValue: c.oldValue, newValue: c.newValue, cssRule: `${c.selector} { ${kebab}: ${c.newValue}; }` });
        decls.push(`  ${kebab}: ${c.newValue};`);
      }
      const key = this.routeKey(first);
      if (!cssByRoute.has(key)) cssByRoute.set(key, { pageUrl: first.pageUrl ?? first.routeKey, rules: [] });
      cssByRoute.get(key)!.rules.push(`${first.selector} {\n${decls.join('\n')}\n}`);
    }
    const routeGroups = this.session?.routeGroups?.map(group => {
      const belongs = (c: RouteMetadata) => this.routeKey(c) === group.routeKey;
      return {
        ...group,
        styleChanges: this.styleChanges.filter(belongs).map(c => ({ ...c })),
        textChanges: this.textChanges.filter(belongs).map(c => ({ ...c })),
        domChanges: this.domChanges.filter(belongs).map(c => ({ ...c })),
        comments: this.comments.filter(belongs).map(c => ({ ...c })),
        cssBlock: cssByRoute.get(group.routeKey)?.rules.join('\n\n') ?? '',
      };
    });
    return {
      pageUrl: this.session?.pageUrl || 'unknown',
      pageTitle: this.session?.pageTitle || 'unknown',
      ...(routeGroups ? { routeGroups } : {}),
      styleChanges: changes,
      textChanges: this.textChanges.map(c => ({
        ...this.routeMetadata(c),
        selector: c.selector,
        oldText: c.oldText,
        newText: c.newText,
        ...(c.attributeName ? { attributeName: c.attributeName } : {}),
        ...viewportContext(c),
      })),
      domChanges: this.domChanges.map(c => ({ ...this.routeMetadata(c), selector: c.selector, action: c.action, tagName: c.tagName, origin: c.origin, destination: c.destination, ...viewportContext(c) })),
      cssBlock: [...cssByRoute.values()].map(({ pageUrl, rules }) =>
        (pageUrl ? `/* Route: ${pageUrl.replace(/\*\//g, '* /')} */\n` : '') + rules.join('\n\n')
      ).join('\n\n'),
    };
  }

  getFullChangeReport(): object {
    const report: Record<string, unknown> = { ...this.getChangeReport() as Record<string, unknown> };
    if (this.session?.tokenChanges) report.tokenChanges = this.session.tokenChanges.map(t => ({ ...t }));
    if (this.session?.tokenGuidance) report.tokenGuidance = this.session.tokenGuidance;
    report.comments = this.getComments().map(c => ({
      ...this.routeMetadata(c),
      id: c.id,
      selector: c.selector,
      text: c.text,
      region: c.region,
      timestamp: new Date(c.timestamp).toISOString(),
      pageUrl: c.pageUrl,
      resolved: c.resolved || false,
      screenshot: `get_screenshot({ commentId: "${c.id}" })`,
    }));
    report.items = [
      ...this.styleChanges.map(c => ({ ...this.routeMetadata(c), id: c.id, kind: 'style', selector: c.selector, property: c.property, status: c.status || 'todo' })),
      ...this.textChanges.map(c => ({ ...this.routeMetadata(c), id: c.id, kind: 'text', selector: c.selector, status: c.status || 'todo' })),
      ...this.domChanges.map(c => ({ ...this.routeMetadata(c), id: c.id, kind: 'dom', selector: c.selector, action: c.action, status: c.status || 'todo' })),
      ...this.getComments().map(c => ({ ...this.routeMetadata(c), id: c.id, kind: 'comment', selector: c.selector, status: c.resolved ? 'resolved' : 'todo' })),
    ];
    if (this.handoff) {
      report.handoff = { ...this.handoff, requestedAt: new Date(this.handoff.requestedAt).toISOString() };
    }
    return report;
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
