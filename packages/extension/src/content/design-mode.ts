// ============================================================
// Phase 5: Design/Layout Mode
// Component palette, wireframe placement, smart snapping,
// resize handles, size indicators
// ============================================================

import { Z_INDEX } from '../shared';
import { getOrAssignId, getElementById } from './helpers';
import type { ComponentPalette } from '@shared/types';

let designModeActive = false;
let snapGuideElements: HTMLDivElement[] = [];
let placementGhostEl: HTMLDivElement | null = null;

// ── Component Palette ──

export const COMPONENTS: ComponentPalette[] = [
  // Layout
  { id: 'div-container', name: 'Container', category: 'layout', html: '<div style="padding:24px;border:1px dashed #ccc;border-radius:8px;min-height:100px"></div>', icon: 'box', description: 'Generic container div' },
  { id: 'flex-row', name: 'Flex Row', category: 'layout', html: '<div style="display:flex;gap:16px;padding:16px"></div>', icon: 'columns', description: 'Horizontal flex container' },
  { id: 'flex-col', name: 'Flex Column', category: 'layout', html: '<div style="display:flex;flex-direction:column;gap:16px;padding:16px"></div>', icon: 'rows', description: 'Vertical flex container' },
  { id: 'grid-2col', name: 'Grid 2-Col', category: 'layout', html: '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:16px"></div>', icon: 'layout-grid', description: '2-column grid' },
  { id: 'grid-3col', name: 'Grid 3-Col', category: 'layout', html: '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;padding:16px"></div>', icon: 'layout-grid', description: '3-column grid' },
  { id: 'grid-4col', name: 'Grid 4-Col', category: 'layout', html: '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;padding:16px"></div>', icon: 'layout-grid', description: '4-column grid' },
  { id: 'section', name: 'Section', category: 'layout', html: '<section style="padding:48px 24px"><h2 style="margin-bottom:16px">Section Title</h2><p>Section content goes here.</p></section>', icon: 'panel-top', description: 'Page section with heading' },
  { id: 'sidebar-layout', name: 'Sidebar Layout', category: 'layout', html: '<div style="display:grid;grid-template-columns:250px 1fr;gap:24px"><aside style="padding:16px;background:#f5f5f5;border-radius:8px">Sidebar</aside><main style="padding:16px">Main content</main></div>', icon: 'panel-left', description: 'Sidebar + main layout' },
  { id: 'centered', name: 'Centered Box', category: 'layout', html: '<div style="display:flex;align-items:center;justify-content:center;min-height:200px"><div style="padding:24px;text-align:center">Centered content</div></div>', icon: 'align-center', description: 'Centered content container' },
  { id: 'sticky-header', name: 'Sticky Header', category: 'layout', html: '<header style="position:sticky;top:0;padding:16px;background:white;border-bottom:1px solid #eee;z-index:100">Sticky Header</header>', icon: 'pin', description: 'Sticky positioned header' },
  // Content
  { id: 'heading-h1', name: 'Heading H1', category: 'content', html: '<h1 style="font-size:2.5rem;font-weight:700;margin-bottom:16px">Heading</h1>', icon: 'heading-1', description: 'Large heading' },
  { id: 'heading-h2', name: 'Heading H2', category: 'content', html: '<h2 style="font-size:2rem;font-weight:600;margin-bottom:12px">Heading</h2>', icon: 'heading-2', description: 'Medium heading' },
  { id: 'heading-h3', name: 'Heading H3', category: 'content', html: '<h3 style="font-size:1.5rem;font-weight:600;margin-bottom:8px">Heading</h3>', icon: 'heading-3', description: 'Small heading' },
  { id: 'paragraph', name: 'Paragraph', category: 'content', html: '<p style="line-height:1.6;color:#374151">Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>', icon: 'text', description: 'Text paragraph' },
  { id: 'blockquote', name: 'Blockquote', category: 'content', html: '<blockquote style="border-left:4px solid #3B82F6;padding:16px 24px;margin:16px 0;background:#F0F7FF;border-radius:0 8px 8px 0"><p style="color:#1E40AF;font-style:italic">"Quote text goes here."</p></blockquote>', icon: 'quote', description: 'Styled blockquote' },
  { id: 'divider', name: 'Divider', category: 'content', html: '<hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0"/>', icon: 'minus', description: 'Horizontal divider' },
  { id: 'ul-list', name: 'Unordered List', category: 'content', html: '<ul style="padding-left:20px;line-height:1.8"><li>Item one</li><li>Item two</li><li>Item three</li></ul>', icon: 'list', description: 'Bullet list' },
  { id: 'ol-list', name: 'Ordered List', category: 'content', html: '<ol style="padding-left:20px;line-height:1.8"><li>First item</li><li>Second item</li><li>Third item</li></ol>', icon: 'list-ordered', description: 'Numbered list' },
  { id: 'code-block', name: 'Code Block', category: 'content', html: '<pre style="background:#1E1E1E;color:#D4D4D4;padding:16px;border-radius:8px;overflow-x:auto;font-family:monospace;font-size:14px"><code>const hello = "world";</code></pre>', icon: 'code', description: 'Code snippet' },
  { id: 'badge', name: 'Badge', category: 'content', html: '<span style="display:inline-block;padding:2px 10px;font-size:12px;font-weight:600;border-radius:9999px;background:#DBEAFE;color:#1D4ED8">Badge</span>', icon: 'tag', description: 'Inline badge/tag' },
  // Form
  { id: 'input', name: 'Text Input', category: 'form', html: '<input type="text" placeholder="Enter text..." style="padding:8px 12px;border:1px solid #D1D5DB;border-radius:6px;font-size:14px;width:100%;box-sizing:border-box"/>', icon: 'text-cursor-input', description: 'Text input field' },
  { id: 'textarea', name: 'Textarea', category: 'form', html: '<textarea placeholder="Enter text..." rows="4" style="padding:8px 12px;border:1px solid #D1D5DB;border-radius:6px;font-size:14px;width:100%;box-sizing:border-box;resize:vertical"></textarea>', icon: 'align-left', description: 'Multi-line input' },
  { id: 'select', name: 'Select Dropdown', category: 'form', html: '<select style="padding:8px 12px;border:1px solid #D1D5DB;border-radius:6px;font-size:14px;width:100%;box-sizing:border-box"><option>Option 1</option><option>Option 2</option><option>Option 3</option></select>', icon: 'chevron-down', description: 'Dropdown select' },
  { id: 'checkbox', name: 'Checkbox', category: 'form', html: '<label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox"/><span>Checkbox label</span></label>', icon: 'check-square', description: 'Checkbox with label' },
  { id: 'radio', name: 'Radio Group', category: 'form', html: '<fieldset style="border:none;padding:0;display:flex;flex-direction:column;gap:8px"><label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="radio" name="dm-radio"/><span>Option A</span></label><label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="radio" name="dm-radio"/><span>Option B</span></label></fieldset>', icon: 'circle-dot', description: 'Radio button group' },
  { id: 'button-primary', name: 'Primary Button', category: 'form', html: '<button style="padding:10px 20px;background:#3B82F6;color:white;border:none;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer">Button</button>', icon: 'mouse-pointer-click', description: 'Primary action button' },
  { id: 'button-outline', name: 'Outline Button', category: 'form', html: '<button style="padding:10px 20px;background:transparent;color:#3B82F6;border:1px solid #3B82F6;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer">Button</button>', icon: 'mouse-pointer-click', description: 'Outline button' },
  { id: 'form-group', name: 'Form Group', category: 'form', html: '<div style="display:flex;flex-direction:column;gap:4px"><label style="font-size:14px;font-weight:500;color:#374151">Label</label><input type="text" placeholder="Enter value" style="padding:8px 12px;border:1px solid #D1D5DB;border-radius:6px;font-size:14px"/><span style="font-size:12px;color:#6B7280">Helper text</span></div>', icon: 'form-input', description: 'Label + input + helper' },
  { id: 'toggle', name: 'Toggle Switch', category: 'form', html: '<label style="display:inline-flex;align-items:center;gap:8px;cursor:pointer"><div style="position:relative;width:44px;height:24px;background:#D1D5DB;border-radius:12px;transition:0.2s"><div style="position:absolute;top:2px;left:2px;width:20px;height:20px;background:white;border-radius:50%;transition:0.2s"></div></div><span>Toggle</span></label>', icon: 'toggle-left', description: 'Toggle switch' },
  // Media
  { id: 'img-placeholder', name: 'Image', category: 'media', html: '<div style="width:100%;aspect-ratio:16/9;background:#F3F4F6;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#9CA3AF">Image Placeholder</div>', icon: 'image', description: 'Image placeholder' },
  { id: 'avatar', name: 'Avatar', category: 'media', html: '<div style="width:48px;height:48px;border-radius:50%;background:#DBEAFE;display:flex;align-items:center;justify-content:center;font-weight:600;color:#3B82F6">AB</div>', icon: 'circle-user', description: 'User avatar' },
  { id: 'icon-placeholder', name: 'Icon', category: 'media', html: '<div style="width:24px;height:24px;background:#E5E7EB;border-radius:4px"></div>', icon: 'star', description: 'Icon placeholder' },
  { id: 'video-placeholder', name: 'Video', category: 'media', html: '<div style="width:100%;aspect-ratio:16/9;background:#111;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:48px">▶</div>', icon: 'play', description: 'Video placeholder' },
  // Navigation
  { id: 'nav-horizontal', name: 'Horizontal Nav', category: 'navigation', html: '<nav style="display:flex;gap:24px;padding:16px"><a href="#" style="color:#3B82F6;text-decoration:none;font-weight:500">Home</a><a href="#" style="color:#6B7280;text-decoration:none">About</a><a href="#" style="color:#6B7280;text-decoration:none">Contact</a></nav>', icon: 'navigation', description: 'Horizontal navigation bar' },
  { id: 'breadcrumb', name: 'Breadcrumb', category: 'navigation', html: '<nav style="display:flex;gap:8px;font-size:14px;color:#6B7280"><a href="#" style="color:#3B82F6;text-decoration:none">Home</a><span>/</span><a href="#" style="color:#3B82F6;text-decoration:none">Products</a><span>/</span><span>Current</span></nav>', icon: 'chevron-right', description: 'Breadcrumb navigation' },
  { id: 'pagination', name: 'Pagination', category: 'navigation', html: '<div style="display:flex;gap:4px"><button style="padding:8px 12px;border:1px solid #D1D5DB;border-radius:6px;background:white;cursor:pointer">←</button><button style="padding:8px 12px;border:1px solid #3B82F6;border-radius:6px;background:#3B82F6;color:white">1</button><button style="padding:8px 12px;border:1px solid #D1D5DB;border-radius:6px;background:white;cursor:pointer">2</button><button style="padding:8px 12px;border:1px solid #D1D5DB;border-radius:6px;background:white;cursor:pointer">3</button><button style="padding:8px 12px;border:1px solid #D1D5DB;border-radius:6px;background:white;cursor:pointer">→</button></div>', icon: 'arrow-left-right', description: 'Page pagination' },
  { id: 'tabs', name: 'Tabs', category: 'navigation', html: '<div style="border-bottom:1px solid #E5E7EB"><div style="display:flex;gap:0"><button style="padding:12px 20px;border:none;border-bottom:2px solid #3B82F6;background:none;color:#3B82F6;font-weight:500;cursor:pointer">Tab 1</button><button style="padding:12px 20px;border:none;border-bottom:2px solid transparent;background:none;color:#6B7280;cursor:pointer">Tab 2</button><button style="padding:12px 20px;border:none;border-bottom:2px solid transparent;background:none;color:#6B7280;cursor:pointer">Tab 3</button></div></div>', icon: 'layout-list', description: 'Tab navigation' },
  // Feedback
  { id: 'alert-info', name: 'Info Alert', category: 'feedback', html: '<div style="padding:16px;background:#DBEAFE;border:1px solid #93C5FD;border-radius:8px;color:#1E40AF;display:flex;gap:12px;align-items:start"><span>ℹ️</span><div><strong>Info</strong><p style="margin:4px 0 0;font-size:14px">This is an informational message.</p></div></div>', icon: 'info', description: 'Info alert banner' },
  { id: 'alert-success', name: 'Success Alert', category: 'feedback', html: '<div style="padding:16px;background:#D1FAE5;border:1px solid #6EE7B7;border-radius:8px;color:#065F46;display:flex;gap:12px;align-items:start"><span>✅</span><div><strong>Success</strong><p style="margin:4px 0 0;font-size:14px">Operation completed successfully.</p></div></div>', icon: 'check-circle', description: 'Success alert' },
  { id: 'alert-warning', name: 'Warning Alert', category: 'feedback', html: '<div style="padding:16px;background:#FEF3C7;border:1px solid #FCD34D;border-radius:8px;color:#92400E;display:flex;gap:12px;align-items:start"><span>⚠️</span><div><strong>Warning</strong><p style="margin:4px 0 0;font-size:14px">Please review before continuing.</p></div></div>', icon: 'alert-triangle', description: 'Warning alert' },
  { id: 'alert-error', name: 'Error Alert', category: 'feedback', html: '<div style="padding:16px;background:#FEE2E2;border:1px solid #FCA5A5;border-radius:8px;color:#991B1B;display:flex;gap:12px;align-items:start"><span>❌</span><div><strong>Error</strong><p style="margin:4px 0 0;font-size:14px">Something went wrong.</p></div></div>', icon: 'alert-circle', description: 'Error alert' },
  { id: 'toast', name: 'Toast', category: 'feedback', html: '<div style="display:inline-flex;align-items:center;gap:12px;padding:12px 20px;background:#1F2937;color:white;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);font-size:14px"><span>✓</span><span>Action completed</span></div>', icon: 'bell', description: 'Toast notification' },
  { id: 'progress-bar', name: 'Progress Bar', category: 'feedback', html: '<div style="width:100%"><div style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:14px"><span>Progress</span><span>60%</span></div><div style="width:100%;height:8px;background:#E5E7EB;border-radius:4px;overflow:hidden"><div style="width:60%;height:100%;background:#3B82F6;border-radius:4px"></div></div></div>', icon: 'bar-chart', description: 'Progress indicator' },
  { id: 'skeleton', name: 'Skeleton', category: 'feedback', html: '<div style="display:flex;flex-direction:column;gap:12px"><div style="width:100%;height:20px;background:#E5E7EB;border-radius:4px;animation:pulse 1.5s ease-in-out infinite"></div><div style="width:75%;height:20px;background:#E5E7EB;border-radius:4px;animation:pulse 1.5s ease-in-out infinite"></div><div style="width:50%;height:20px;background:#E5E7EB;border-radius:4px;animation:pulse 1.5s ease-in-out infinite"></div></div>', icon: 'loader', description: 'Loading skeleton' },
  // Data
  { id: 'card', name: 'Card', category: 'data', html: '<div style="padding:24px;border:1px solid #E5E7EB;border-radius:12px;background:white;box-shadow:0 1px 3px rgba(0,0,0,0.1)"><h3 style="font-size:18px;font-weight:600;margin-bottom:8px">Card Title</h3><p style="color:#6B7280;font-size:14px;line-height:1.5">Card description goes here with some details.</p></div>', icon: 'square', description: 'Content card' },
  { id: 'stat-card', name: 'Stat Card', category: 'data', html: '<div style="padding:24px;border:1px solid #E5E7EB;border-radius:12px;background:white"><p style="font-size:14px;color:#6B7280">Total Revenue</p><p style="font-size:32px;font-weight:700;margin:4px 0">$45,231</p><p style="font-size:14px;color:#10B981">↑ 12.5% from last month</p></div>', icon: 'trending-up', description: 'Statistics card' },
  { id: 'table-simple', name: 'Table', category: 'data', html: '<table style="width:100%;border-collapse:collapse;font-size:14px"><thead><tr style="border-bottom:2px solid #E5E7EB"><th style="text-align:left;padding:12px;font-weight:600">Name</th><th style="text-align:left;padding:12px;font-weight:600">Status</th><th style="text-align:left;padding:12px;font-weight:600">Role</th></tr></thead><tbody><tr style="border-bottom:1px solid #E5E7EB"><td style="padding:12px">John Doe</td><td style="padding:12px"><span style="padding:2px 8px;border-radius:9999px;background:#D1FAE5;color:#065F46;font-size:12px">Active</span></td><td style="padding:12px">Admin</td></tr><tr style="border-bottom:1px solid #E5E7EB"><td style="padding:12px">Jane Smith</td><td style="padding:12px"><span style="padding:2px 8px;border-radius:9999px;background:#FEF3C7;color:#92400E;font-size:12px">Pending</span></td><td style="padding:12px">User</td></tr></tbody></table>', icon: 'table-2', description: 'Data table' },
  { id: 'list-item', name: 'List Item', category: 'data', html: '<div style="display:flex;align-items:center;gap:12px;padding:12px;border-bottom:1px solid #F3F4F6"><div style="width:40px;height:40px;border-radius:50%;background:#DBEAFE;display:flex;align-items:center;justify-content:center;font-weight:600;color:#3B82F6">JD</div><div style="flex:1"><p style="font-weight:500">List Item Title</p><p style="font-size:14px;color:#6B7280">Secondary text</p></div><span style="color:#9CA3AF">→</span></div>', icon: 'list', description: 'List item with avatar' },
  { id: 'chip-group', name: 'Chip Group', category: 'data', html: '<div style="display:flex;flex-wrap:wrap;gap:8px"><span style="padding:6px 12px;border-radius:9999px;background:#F3F4F6;font-size:13px;cursor:pointer">Design</span><span style="padding:6px 12px;border-radius:9999px;background:#DBEAFE;color:#1D4ED8;font-size:13px;cursor:pointer">Selected</span><span style="padding:6px 12px;border-radius:9999px;background:#F3F4F6;font-size:13px;cursor:pointer">Development</span></div>', icon: 'tags', description: 'Filter chips' },
  { id: 'modal', name: 'Modal Dialog', category: 'data', html: '<div style="position:relative;width:400px;padding:24px;background:white;border-radius:12px;box-shadow:0 25px 50px rgba(0,0,0,0.25)"><h3 style="font-size:18px;font-weight:600;margin-bottom:8px">Dialog Title</h3><p style="color:#6B7280;font-size:14px;margin-bottom:20px">Are you sure you want to proceed?</p><div style="display:flex;justify-content:flex-end;gap:8px"><button style="padding:8px 16px;border:1px solid #D1D5DB;border-radius:6px;background:white;cursor:pointer">Cancel</button><button style="padding:8px 16px;border:none;border-radius:6px;background:#3B82F6;color:white;cursor:pointer">Confirm</button></div></div>', icon: 'panel-top-close', description: 'Modal dialog' },
];

export function getComponentsByCategory(category?: string): ComponentPalette[] {
  if (!category) return COMPONENTS;
  return COMPONENTS.filter(c => c.category === category);
}

// ── Wireframe Placement ──

export function startPlacement(component: ComponentPalette, onPlace: (html: string, parentId: string) => void) {
  if (placementGhostEl) cancelPlacement();

  placementGhostEl = document.createElement('div');
  Object.assign(placementGhostEl.style, {
    position: 'fixed', pointerEvents: 'none',
    opacity: '0.7', zIndex: String(Z_INDEX.SNAP_GUIDE),
    border: '2px dashed #3B82F6', borderRadius: '4px',
    padding: '4px', background: 'rgba(59,130,246,0.05)',
    transition: 'none',
  });
  placementGhostEl.innerHTML = component.html;
  document.documentElement.appendChild(placementGhostEl);

  const onMove = (e: MouseEvent) => {
    if (!placementGhostEl) return;
    placementGhostEl.style.left = e.clientX + 'px';
    placementGhostEl.style.top = e.clientY + 'px';

    // Show snap guides
    const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement;
    if (target && !target.id?.startsWith('dm-')) {
      showSnapGuides(target);
    }
  };

  const onClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement;
    if (target && !target.id?.startsWith('dm-')) {
      const parentId = getOrAssignId(target);
      onPlace(component.html, parentId);
    }
    cancelPlacement();
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('click', onClick, true);
  };

  document.addEventListener('mousemove', onMove, true);
  document.addEventListener('click', onClick, true);
}

export function cancelPlacement() {
  if (placementGhostEl) {
    placementGhostEl.remove();
    placementGhostEl = null;
  }
  hideSnapGuides();
}

export function placeComponent(html: string, parentId: string): string | null {
  const parent = getElementById(parentId);
  if (!parent) return null;
  const temp = document.createElement('div');
  temp.innerHTML = html;
  const el = temp.firstElementChild as HTMLElement;
  if (!el) return null;
  parent.appendChild(el);
  const id = getOrAssignId(el);
  return id;
}

// ── Smart Snapping ──

function showSnapGuides(target: HTMLElement) {
  hideSnapGuides();
  const rect = target.getBoundingClientRect();
  const guides: Array<{ type: 'horizontal' | 'vertical'; pos: number }> = [
    { type: 'horizontal', pos: rect.top },
    { type: 'horizontal', pos: rect.top + rect.height / 2 },
    { type: 'horizontal', pos: rect.bottom },
    { type: 'vertical', pos: rect.left },
    { type: 'vertical', pos: rect.left + rect.width / 2 },
    { type: 'vertical', pos: rect.right },
  ];

  for (const g of guides) {
    const line = document.createElement('div');
    Object.assign(line.style, {
      position: 'fixed',
      zIndex: String(Z_INDEX.SNAP_GUIDE),
      background: '#3B82F6',
      opacity: '0.4',
      pointerEvents: 'none',
    });
    if (g.type === 'horizontal') {
      Object.assign(line.style, { top: g.pos + 'px', left: '0', width: '100vw', height: '1px' });
    } else {
      Object.assign(line.style, { left: g.pos + 'px', top: '0', height: '100vh', width: '1px' });
    }
    document.documentElement.appendChild(line);
    snapGuideElements.push(line);
  }
}

function hideSnapGuides() {
  snapGuideElements.forEach(g => g.remove());
  snapGuideElements = [];
}

export function isDesignModeActive(): boolean { return designModeActive; }
export function setDesignModeActive(v: boolean) { designModeActive = v; }
