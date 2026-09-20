export function parseJsonc(raw: string): unknown {
  const uncommented = raw.replace(/^\uFEFF/, '').replace(
    /"(?:\\[\s\S]|[^"\\])*"|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g,
    token => token.startsWith('/') ? token.replace(/[^\r\n]/g, ' ') : token,
  );
  const json = uncommented.replace(
    /("(?:\\[\s\S]|[^"\\])*")|,\s*(?=[}\]])/g,
    (token, stringToken: string | undefined, offset: number) => {
      if (stringToken) return stringToken;
      const previous = uncommented.slice(0, offset).trimEnd().slice(-1);
      return !previous || '[{,:'.includes(previous) ? token : '';
    },
  );
  return JSON.parse(json);
}
