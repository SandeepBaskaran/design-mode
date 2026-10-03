// An operation belongs to the document on which it started, not whichever
// document is selected when its next request happens to run.
export class InspectorOperationCancelled extends Error {
  constructor() {
    super('Inspector target changed');
    this.name = 'InspectorOperationCancelled';
  }
}

export function createInspectorOperation(currentEpoch: () => number, enabled: boolean) {
  const epoch = currentEpoch();
  const isCurrent = () => !enabled || currentEpoch() === epoch;
  const assertCurrent = () => {
    if (!isCurrent()) throw new InspectorOperationCancelled();
  };
  return {
    isCurrent,
    assertCurrent,
    async wait<T>(pending: PromiseLike<T>): Promise<T> {
      try {
        const result = await pending;
        assertCurrent();
        return result;
      } catch (error) {
        // A target reset may itself reject pending RPCs. Treat that as
        // cancellation, but preserve genuine errors on the current target.
        assertCurrent();
        throw error;
      }
    },
  };
}
export type InspectorOperation = ReturnType<typeof createInspectorOperation>;

// Only UI boundaries consume cancellation. Nested operations must reject so
// a cancelled group/comment/bulk operation cannot continue with another RPC.
export async function runInspectorAction<T>(pending: PromiseLike<T>): Promise<T | undefined> {
  try { return await pending; }
  catch (error) {
    if (error instanceof InspectorOperationCancelled) return undefined;
    throw error;
  }
}
