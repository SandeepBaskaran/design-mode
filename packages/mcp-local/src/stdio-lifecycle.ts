export const SHUTDOWN_GRACE_MS = 2_000;

export type Closable = { close: () => Promise<void> };

export interface ProcessShutdown {
  shutdown: (code?: number) => Promise<void>;
  isShuttingDown: () => boolean;
}

export function createProcessShutdown(options: {
  getBridge: () => Closable | null | undefined;
  exit: (code: number) => void;
  graceMs?: number;
}): ProcessShutdown {
  const graceMs = options.graceMs ?? SHUTDOWN_GRACE_MS;

  let shuttingDown = false;

  return {
    isShuttingDown: () => shuttingDown,
    shutdown: async (code = 0) => {
      if (shuttingDown) return;
      shuttingDown = true;
      const closed = Promise.resolve()
        .then(() => options.getBridge()?.close())
        .catch(() => undefined);
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        // Keep shutdown alive even when cleanup leaves no other event-loop handles.
        await Promise.race([
          closed,
          new Promise<void>((resolve) => {
            timer = setTimeout(resolve, graceMs);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
      options.exit(code);
    },
  };
}

export function watchStdinEof(
  stdin: NodeJS.ReadableStream & {
    isTTY?: boolean;
    readableEnded?: boolean;
    destroyed?: boolean;
  },
  onEof: () => void,
): boolean {
  if (stdin.isTTY) return false;
  stdin.on('end', onEof);
  stdin.on('close', onEof);
  if (stdin.readableEnded || stdin.destroyed) onEof();
  return true;
}
