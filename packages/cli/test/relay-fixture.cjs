const { readFileSync } = require('node:fs');
const { resolve, dirname } = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

module.exports = function fixture() {
  const values = new Map();
  const inbound = [];
  const redis = {
    async get(key) { return values.get(key) ?? null; },
    async set(key, value, options) {
      if (options?.XX && !values.has(key)) return null;
      values.set(key, value);
      return 'OK';
    },
    async del(key) { return Number(values.delete(key)); },
    async exists(key) { return Number(values.has(key)); },
    async expire() { return true; },
    multi() {
      const commands = [];
      return {
        rPush(...args) { commands.push(() => redis.rPush(...args)); return this; },
        expire(...args) { commands.push(() => redis.expire(...args)); return this; },
        async exec() {
          const results = [];
          for (const command of commands) results.push(await command());
          return results;
        },
      };
    },
    async incr(key) {
      const value = Number(values.get(key) ?? 0) + 1;
      values.set(key, String(value));
      return value;
    },
    async rPush(key, raw) {
      const message = JSON.parse(raw);
      inbound.push(message);
      if (message.requestId) {
        values.set(`resp:${key.slice('inbound:'.length)}:${message.requestId}`, JSON.stringify({
          type: 'REPLY', payload: message.type === 'CLOUD_GET_SESSION_SUMMARY'
            ? { extensionConnected: true, sessions: 1 } : { ok: true, source: 'synthetic-browser' },
        }));
      }
      return inbound.length;
    },
  };
  const root = resolve(__dirname, '../../mcp-cloud');
  const modules = new Map([
    [resolve(root, 'lib/kv.ts'), { kv: async () => redis }],
    [resolve(root, 'lib/log.ts'), { logEvent() {} }],
  ]);
  function load(file) {
    const filename = resolve(root, file);
    if (modules.has(filename)) return modules.get(filename);
    const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      fileName: filename,
    }).outputText;
    const mod = new Module(filename, module);
    mod.filename = filename;
    mod.paths = Module._nodeModulePaths(dirname(filename));
    mod.require = id => id.startsWith('.')
      ? load(resolve(dirname(filename), id.replace(/\.js$/, '.ts')))
      : require(id);
    modules.set(filename, mod.exports);
    mod._compile(compiled, filename);
    return mod.exports;
  }
  return { load, inbound };
};
