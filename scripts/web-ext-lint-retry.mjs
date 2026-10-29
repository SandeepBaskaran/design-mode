// Runs web-ext lint, retrying only SIGBUS deaths (see the note in prepublish-check.mjs).
export const LINT_ATTEMPTS = 8;

export function lintWithRetry(lint, { attempts = LINT_ATTEMPTS, warn = console.warn } = {}) {
  let result;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    result = lint();
    if (result.error) throw result.error;
    if (!result.signal) break;
    if (result.signal !== 'SIGBUS') {
      throw new Error(`web-ext lint died by signal ${result.signal}; only SIGBUS is retried\n${result.stderr ?? ''}`);
    }
    if (attempt === attempts) {
      throw new Error(`web-ext lint crashed ${attempts} times (signal ${result.signal}); no lint result was produced — a tooling crash, not lint findings\n${result.stderr ?? ''}`);
    }
    warn(`   web-ext lint died by signal ${result.signal} (attempt ${attempt}/${attempts}) — retrying`);
  }
  if (result.status !== 0) {
    throw new Error(`web-ext lint failed (exit ${result.status})\n${result.stdout ?? ''}${result.stderr ?? ''}`);
  }
  return result;
}
