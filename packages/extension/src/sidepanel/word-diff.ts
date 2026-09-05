export type WordDiffRun = { kind: 'eq' | 'add' | 'del'; text: string };

function tokenize(value: string): string[] {
  return value.match(/\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]+/gu) || [];
}

function coalesce(runs: WordDiffRun[]): WordDiffRun[] {
  const result: WordDiffRun[] = [];
  for (const run of runs) {
    if (!run.text) continue;
    const previous = result[result.length - 1];
    if (previous?.kind === run.kind) previous.text += run.text;
    else result.push({ ...run });
  }
  return result;
}

export function diffWords(oldValue: string, newValue: string): WordDiffRun[] {
  const oldTokens = tokenize(oldValue);
  const newTokens = tokenize(newValue);
  let prefix = 0;
  while (prefix < oldTokens.length && prefix < newTokens.length && oldTokens[prefix] === newTokens[prefix]) prefix++;

  let suffix = 0;
  while (
    suffix < oldTokens.length - prefix
    && suffix < newTokens.length - prefix
    && oldTokens[oldTokens.length - 1 - suffix] === newTokens[newTokens.length - 1 - suffix]
  ) suffix++;

  const oldMiddle = oldTokens.slice(prefix, oldTokens.length - suffix);
  const newMiddle = newTokens.slice(prefix, newTokens.length - suffix);
  const runs: WordDiffRun[] = [];
  if (prefix) runs.push({ kind: 'eq', text: oldTokens.slice(0, prefix).join('') });

  if (oldMiddle.length * newMiddle.length > 40_000) {
    if (oldMiddle.length) runs.push({ kind: 'del', text: oldMiddle.join('') });
    if (newMiddle.length) runs.push({ kind: 'add', text: newMiddle.join('') });
  } else {
    const dp: number[][] = Array.from(
      { length: oldMiddle.length + 1 },
      () => new Array(newMiddle.length + 1).fill(0),
    );
    for (let i = 1; i <= oldMiddle.length; i++) {
      for (let j = 1; j <= newMiddle.length; j++) {
        dp[i][j] = oldMiddle[i - 1] === newMiddle[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }

    const middleRuns: WordDiffRun[] = [];
    let i = oldMiddle.length;
    let j = newMiddle.length;
    while (i > 0 && j > 0) {
      if (oldMiddle[i - 1] === newMiddle[j - 1]) {
        middleRuns.unshift({ kind: 'eq', text: oldMiddle[i - 1] });
        i--;
        j--;
      } else if (dp[i][j - 1] >= dp[i - 1][j]) {
        middleRuns.unshift({ kind: 'add', text: newMiddle[j - 1] });
        j--;
      } else {
        middleRuns.unshift({ kind: 'del', text: oldMiddle[i - 1] });
        i--;
      }
    }
    while (i > 0) middleRuns.unshift({ kind: 'del', text: oldMiddle[--i] });
    while (j > 0) middleRuns.unshift({ kind: 'add', text: newMiddle[--j] });
    runs.push(...middleRuns);
  }

  if (suffix) runs.push({ kind: 'eq', text: oldTokens.slice(oldTokens.length - suffix).join('') });
  return coalesce(runs);
}
