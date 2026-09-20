import { it } from 'node:test';
import assert from 'node:assert/strict';
import { readPageComponentContexts } from './page-component-context.ts';

it('reads bounded React/Vue metadata without returning props or combining different owners', () => {
  const oldDocument = globalThis.document;
  const oldCSS = globalThis.CSS;
  const nodes: Record<string, unknown> = {
    'dm-react': { __reactFiber$fixture: { type: 'button', return: { type: { name: 'Card' }, _debugSource: { fileName: '/src/Card.tsx' }, memoizedProps: { secret: 'not exported' } } } },
    'dm-vue': { __vueParentComponent: { type: { __name: 'Toolbar', __file: '/src/Toolbar.vue' } } },
    'dm-plain': {},
    'dm-loop': { __reactFiber$fixture: { type: 'div' } },
  };
  const cycle = (nodes['dm-loop'] as any).__reactFiber$fixture;
  cycle.return = cycle;
  Object.defineProperty(nodes['dm-plain'], '__reactFiber$throws', { enumerable: true, get() { throw new Error('page getter'); } });
  try {
    globalThis.document = { querySelector(selector: string) { return nodes[selector.match(/"(.+)"/)![1]]; } } as any;
    globalThis.CSS = { escape: (value: string) => value } as any;
    const result = readPageComponentContexts(Object.keys(nodes));
    assert.deepEqual({ ...result }, {
      'dm-react': { name: 'Card', file: '/src/Card.tsx' },
      'dm-vue': { name: 'Toolbar', file: '/src/Toolbar.vue' },
    });
    assert.equal(JSON.stringify(result).includes('not exported'), false);
  } finally {
    globalThis.document = oldDocument;
    globalThis.CSS = oldCSS;
  }
});
