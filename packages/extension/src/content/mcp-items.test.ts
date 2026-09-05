import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCloudSessionSummary, buildMcpItems } from './mcp-items.ts';

describe('buildMcpItems', () => {
  it('matches the local get_changes items[] shape', () => {
    const items = buildMcpItems({
      styleChanges: [{ id: 's1', selector: 'h1', property: 'color', status: 'in_progress' }],
      textChanges: [{ id: 't1', selector: 'p', status: undefined }],
      domChanges: [{ id: 'd1', selector: 'div.card', action: 'move' }],
      comments: [{ id: 'c1', selector: 'region', resolved: true }],
    });
    assert.deepEqual(items, [
      { id: 's1', kind: 'style', selector: 'h1', property: 'color', status: 'in_progress' },
      { id: 't1', kind: 'text', selector: 'p', status: 'todo' },
      { id: 'd1', kind: 'dom', selector: 'div.card', action: 'move', status: 'todo' },
      { id: 'c1', kind: 'comment', selector: 'region', status: 'resolved' },
    ]);
  });
});

describe('buildCloudSessionSummary', () => {
  it('exposes the same fields as local get_session_summary', () => {
    const summary = buildCloudSessionSummary({
      pageUrl: 'https://example.com/',
      pageTitle: 'Example',
      startedAt: Date.UTC(2026, 0, 1),
      lastActivity: Date.UTC(2026, 0, 2),
      totalStyleChanges: 2,
      totalTextChanges: 1,
      totalDomChanges: 0,
      totalComments: 3,
      pendingHandoff: { pageUrl: 'https://example.com/' },
    });
    assert.equal(summary.extensionConnected, true);
    assert.equal(summary.activeSessions, 1);
    assert.equal(summary.sessions.length, 1);
    assert.equal(summary.sessions[0].id, 'page');
    assert.equal(summary.sessions[0].startedAt, '2026-01-01T00:00:00.000Z');
    assert.equal(summary.totalComments, 3);
    assert.ok(summary.pendingHandoff);
  });
});
