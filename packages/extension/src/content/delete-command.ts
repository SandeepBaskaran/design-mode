import { getElementById } from './helpers';
import { orderDomDeletionTargets } from './dom-delete';
import { deleteElement } from './html-editor';
import { captureTrackerRollback, persistSession, getStyleChanges, getTextChanges, getDomChanges } from './change-tracker';

export interface DeleteCommand {
  kind: 'delete-group';
  elements: Map<string, HTMLElement>;
  undo: () => boolean;
  redo: () => boolean;
}

export function deleteElements(ids: string[]): DeleteCommand | null {
  const targets = orderDomDeletionTargets(ids, getElementById,
    (a, b) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? 1 : -1);
  const affected = new Set(targets.map(target => target.id));
  const unaffected = () => JSON.stringify([getStyleChanges(), getTextChanges(), getDomChanges()]
    .map(changes => changes.filter(change => !affected.has(change.elementId))));
  const untouched = unaffected();
  const before = captureTrackerRollback();
  const removed: Array<{ id: string; element: HTMLElement; parent: Node; next: Node | null }> = [];
  for (const { id, element } of targets) {
    const parent = element.parentNode, next = element.nextSibling;
    if (parent && deleteElement(id)) removed.push({ id, element, parent, next });
  }
  if (!removed.length) return null;
  const after = captureTrackerRollback();
  return {
    kind: 'delete-group',
    elements: new Map(removed.map(({ id, element }) => [id, element])),
    undo() {
      if (unaffected() !== untouched) return false;
      if (removed.some(({ parent, element }) => element.isConnected || (!parent.isConnected && !removed.some(item => item.element.contains(parent))))) return false;
      for (const { element, parent, next } of [...removed].reverse()) {
        parent.insertBefore(element, next?.parentNode === parent ? next : null);
      }
      before();
      persistSession();
      return true;
    },
    redo() {
      if (unaffected() !== untouched) return false;
      if (removed.some(({ element, parent }) => element.parentNode !== parent || !parent.isConnected)) return false;
      for (const { element } of removed) element.remove();
      after();
      persistSession();
      return true;
    },
  };
}
