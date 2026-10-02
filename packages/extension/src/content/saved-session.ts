import type { DomChange } from './change-tracker';

export function restoreSavedDomLocations(changes: DomChange[]): DomChange[] {
  // Earlier body selectors were empty. Only repair internal saved locations;
  // file imports still pass the strict selector boundary unchanged.
  return changes.map(change => {
    const repair = (loc: DomChange['origin']) => loc?.parentSelector === ''
      ? { ...loc, parentSelector: 'body' } : loc;
    return { ...change, origin: repair(change.origin), destination: repair(change.destination) };
  });
}
