import { captureMoveChangeRestore } from './change-tracker';

export interface MoveCommand {
  kind: 'move';
  undo(): boolean;
  redo(): boolean;
}

// Keep live nodes (including text siblings), not HTML or positional selectors.
// Only this element's move report is restored; unrelated edits stay untouched.
export function beginMove(source: HTMLElement, elementId: string): () => MoveCommand | null {
  const before = { parent: source.parentNode, next: source.nextSibling };
  const restoreBefore = captureMoveChangeRestore(elementId);
  return () => {
    const after = { parent: source.parentNode, next: source.nextSibling };
    if (!before.parent || !after.parent || (before.parent === after.parent && before.next === after.next)) return null;
    const restoreAfter = captureMoveChangeRestore(elementId);
    const apply = (from: typeof before, to: typeof before, restore: () => void) => {
      if (!source.isConnected || source.parentNode !== from.parent || !to.parent?.isConnected || source.contains(to.parent)) return false;
      // A removed/reparented anchor is ambiguous. Leave history intact.
      if (to.next && to.next.parentNode !== to.parent) return false;
      to.parent.insertBefore(source, to.next);
      restore();
      return true;
    };
    return {
      kind: 'move',
      undo: () => apply(after, before, restoreBefore),
      redo: () => apply(before, after, restoreAfter),
    };
  };
}
