// Flat, id-addressable view shared by local MCP get_changes and the cloud
// CLOUD_GET_CHANGES reply so set_change_status can target the same ids.

export type McpItemKind = 'style' | 'text' | 'dom' | 'comment';

export type McpItem = {
  id: string;
  kind: McpItemKind;
  selector: string;
  status: string;
  property?: string;
  action?: string;
};

export function buildMcpItems(input: {
  styleChanges?: Array<{ id: string; selector: string; property: string; status?: string }>;
  textChanges?: Array<{ id: string; selector: string; status?: string }>;
  domChanges?: Array<{ id: string; selector: string; action: string; status?: string }>;
  comments?: Array<{ id: string; selector: string; resolved?: boolean }>;
}): McpItem[] {
  return [
    ...(input.styleChanges || []).map(c => ({
      id: c.id, kind: 'style' as const, selector: c.selector, property: c.property, status: c.status || 'todo',
    })),
    ...(input.textChanges || []).map(c => ({
      id: c.id, kind: 'text' as const, selector: c.selector, status: c.status || 'todo',
    })),
    ...(input.domChanges || []).map(c => ({
      id: c.id, kind: 'dom' as const, selector: c.selector, action: c.action, status: c.status || 'todo',
    })),
    ...(input.comments || []).map(c => ({
      id: c.id, kind: 'comment' as const, selector: c.selector, status: c.resolved ? 'resolved' : 'todo',
    })),
  ];
}

export function buildCloudSessionSummary(input: {
  pageUrl: string;
  pageTitle: string;
  startedAt: number;
  lastActivity: number;
  totalStyleChanges: number;
  totalTextChanges: number;
  totalDomChanges: number;
  totalComments: number;
  pendingHandoff: object | null;
}): {
  extensionConnected: true;
  activeSessions: 1;
  sessions: Array<{ id: string; pageUrl: string; pageTitle: string; startedAt: string; lastActivity: string }>;
  totalStyleChanges: number;
  totalTextChanges: number;
  totalDomChanges: number;
  totalComments: number;
  pendingHandoff: object | null;
} {
  return {
    extensionConnected: true,
    activeSessions: 1,
    sessions: [{
      id: 'page',
      pageUrl: input.pageUrl,
      pageTitle: input.pageTitle,
      startedAt: new Date(input.startedAt).toISOString(),
      lastActivity: new Date(input.lastActivity).toISOString(),
    }],
    totalStyleChanges: input.totalStyleChanges,
    totalTextChanges: input.totalTextChanges,
    totalDomChanges: input.totalDomChanges,
    totalComments: input.totalComments,
    pendingHandoff: input.pendingHandoff,
  };
}
