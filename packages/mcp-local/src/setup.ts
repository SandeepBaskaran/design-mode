import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { LOOPBACK_HOST, probeOwnerHealth } from './owner-bridge.js';
import { SETUP_WORKFLOW_MARKDOWN } from './setup-workflow.js';
import { parseJsonc } from './jsonc.js';

export const DEFAULT_WS_PORT = 9960;
export const MCP_SERVER_KEY = 'design-mode';

export type AgentId = 'claude-code' | 'cursor';
export type FileAction = 'create' | 'update' | 'unchanged' | 'collision';

export interface AgentTarget {
  id: AgentId;
  label: string;
  mcpRelative: string;
  workflowRelative: string;
  includeStdioType: boolean;
}

export const PROJECT_AGENTS: AgentTarget[] = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    mcpRelative: '.mcp.json',
    workflowRelative: '.claude/commands/design-mode.md',
    includeStdioType: true,
  },
  {
    id: 'cursor',
    label: 'Cursor',
    mcpRelative: '.cursor/mcp.json',
    workflowRelative: '.cursor/commands/design-mode.md',
    includeStdioType: true,
  },
];

export interface SetupCliOptions {
  projectRoot: string;
  agents: AgentId[];
  cliPath: string;
  nodePath: string;
  apply: boolean;
  yes: boolean;
  force: boolean;
  dryRun: boolean;
  help?: boolean;
  homeDir: string;
}

export interface DoctorOptions {
  cliPath: string;
  port: number;
  help?: boolean;
}

export interface PlannedFile {
  relativePath: string;
  absPath: string;
  action: FileAction;
  content: string;
  previous?: string;
  reason?: string;
}

export interface SetupPlan {
  projectRoot: string;
  cliPath: string;
  nodePath: string;
  agents: AgentTarget[];
  files: PlannedFile[];
  errors: string[];
  warnings: string[];
}

export interface SetupApplyResult {
  dryRun: boolean;
  applied: boolean;
  plan: SetupPlan;
  written: string[];
  backups: string[];
}

export interface DoctorReport {
  cliPath: string;
  cliOk: boolean;
  port: number;
  ownerPid: number | null;
  extensionConnected: boolean | null;
  ok: boolean;
  issues: string[];
}

const AGENT_IDS: AgentId[] = ['claude-code', 'cursor'];

export function workflowMarkdown(): string {
  return SETUP_WORKFLOW_MARKDOWN;
}

export function parseSetupArgs(argv: string[], defaults: {
  cwd?: string;
  execPath?: string;
  homeDir?: string;
  defaultCliPath?: string;
} = {}): SetupCliOptions {
  const cwd = defaults.cwd ?? process.cwd();
  const homeDir = defaults.homeDir ?? os.homedir();
  let projectRoot = cwd;
  const agents: AgentId[] = [];
  let cliPath = defaults.defaultCliPath ?? '';
  let nodePath = defaults.execPath ?? process.execPath;
  let apply = false;
  let yes = false;
  let force = false;
  let dryRun = false;
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (!value || value.startsWith('-')) {
        throw new Error(`Missing value for ${arg}`);
      }
      return value;
    };
    if (arg === '--help' || arg === '-h') help = true;
    else if (arg === '--apply') apply = true;
    else if (arg === '--yes' || arg === '-y') yes = true;
    else if (arg === '--force') force = true;
    else if (arg === '--dry-run') dryRun = true;
    else if (arg === '--project') projectRoot = next();
    else if (arg === '--cli') cliPath = next();
    else if (arg === '--node') nodePath = next();
    else if (arg === '--agent') {
      const raw = next();
      if (raw === 'all') agents.push(...AGENT_IDS);
      else agents.push(parseAgentId(raw));
    } else {
      throw new Error(`Unknown setup option: ${arg}`);
    }
  }

  return {
    projectRoot,
    agents: uniqueAgents(agents),
    cliPath,
    nodePath,
    apply,
    yes,
    force,
    dryRun: dryRun || !apply,
    help,
    homeDir,
  };
}

export function parseDoctorArgs(argv: string[], defaults: {
  defaultCliPath?: string;
  port?: number;
} = {}): DoctorOptions {
  let cliPath = defaults.defaultCliPath ?? '';
  let port = defaults.port ?? parseInt(process.env.DM_PORT || String(DEFAULT_WS_PORT), 10);
  let help = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (!value || value.startsWith('-')) throw new Error(`Missing value for ${arg}`);
      return value;
    };
    if (arg === '--help' || arg === '-h') help = true;
    else if (arg === '--cli') cliPath = next();
    else if (arg === '--port') port = parseInt(next(), 10);
    else throw new Error(`Unknown doctor option: ${arg}`);
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${port}`);
  }
  return { cliPath, port, help };
}

export function parseAgentId(raw: string): AgentId {
  if (raw === 'claude-code' || raw === 'claude') return 'claude-code';
  if (raw === 'cursor') return 'cursor';
  throw new Error(`Unsupported agent: ${raw}. Choose claude-code or cursor.`);
}

function uniqueAgents(agents: AgentId[]): AgentId[] {
  return AGENT_IDS.filter((id) => agents.includes(id));
}

export function resolveBuiltCliPath(fromScriptPath: string): string {
  const script = path.resolve(fromScriptPath);
  const dir = path.dirname(script);
  const candidates = [
    path.join(dir, 'cli.js'),
    path.resolve(dir, '..', '..', 'dist', 'bin', 'cli.js'),
    path.resolve(dir, '..', 'dist', 'bin', 'cli.js'),
  ];
  for (const candidate of candidates) {
    if (isExistingRegularFile(candidate)) return fs.realpathSync(candidate);
  }
  throw new Error(
    'Built local CLI not found. Run `npm --workspace @design-mode/mcp-local run build` and pass --cli with that absolute dist/bin/cli.js path.',
  );
}

export function assertAbsoluteExistingCli(cliPath: string): string {
  if (!cliPath) {
    throw new Error('Missing --cli. Pass the absolute path to the built dist/bin/cli.js.');
  }
  if (!path.isAbsolute(cliPath)) {
    throw new Error(`CLI path must be absolute: ${cliPath}`);
  }
  if (!isExistingRegularFile(cliPath)) {
    throw new Error(`CLI is not an existing regular file: ${cliPath}`);
  }
  return fs.realpathSync(cliPath);
}

function isExistingRegularFile(filePath: string): boolean {
  try {
    const st = fs.lstatSync(filePath);
    if (st.isSymbolicLink()) {
      const real = fs.realpathSync(filePath);
      return fs.statSync(real).isFile();
    }
    return st.isFile();
  } catch {
    return false;
  }
}

export function assertSafeProjectRoot(projectRoot: string, homeDir = os.homedir()): string {
  const resolved = path.resolve(projectRoot);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`Project root does not exist or is not a directory: ${resolved}`);
  }
  if (fs.lstatSync(resolved).isSymbolicLink()) {
    throw new Error(`Refusing to use a symlinked project root: ${resolved}`);
  }
  const real = fs.realpathSync(resolved);
  const realHome = safeRealpath(homeDir);
  if (real === realHome) {
    throw new Error('Refusing to use the home directory as a project root');
  }
  for (const name of ['.claude', '.cursor']) {
    if (real === path.join(realHome, name)) {
      throw new Error('Refusing to treat an agent config directory as a project root');
    }
  }
  return real;
}

function safeRealpath(target: string): string {
  const resolved = path.resolve(target);
  try {
    return fs.realpathSync(resolved);
  } catch {
    return resolved;
  }
}

export function resolveInsideProject(root: string, relativePath: string): string {
  if (path.isAbsolute(relativePath)) {
    throw new Error(`Target must be project-relative: ${relativePath}`);
  }
  if (relativePath.includes('\0')) {
    throw new Error('Invalid path');
  }
  const abs = path.resolve(root, relativePath);
  const rel = path.relative(root, abs);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path escapes project root: ${relativePath}`);
  }
  return abs;
}

export function assertWritablePath(root: string, absPath: string): void {
  if (fs.existsSync(absPath) && fs.lstatSync(absPath).isSymbolicLink()) {
    throw new Error(`Refusing to write through symlink: ${absPath}`);
  }
  let current = path.dirname(absPath);
  while (true) {
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) {
      throw new Error(`Refusing to write through symlink directory: ${current}`);
    }
    if (current === root) break;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

export function mcpServerEntry(nodePath: string, cliPath: string, includeStdioType: boolean): Record<string, unknown> {
  const entry: Record<string, unknown> = {
    command: nodePath,
    args: [cliPath],
  };
  if (includeStdioType) entry.type = 'stdio';
  return entry;
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function readJsonObject(absPath: string): Record<string, unknown> {
  const raw = fs.readFileSync(absPath, 'utf8');
  let parsed: unknown;
  try {
    parsed = parseJsonc(raw);
  } catch {
    throw new Error(`Invalid JSON/JSONC: ${absPath}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Expected a JSON object: ${absPath}`);
  }
  return parsed as Record<string, unknown>;
}

export function mergeMcpConfig(
  existing: Record<string, unknown> | null,
  serverEntry: Record<string, unknown>,
  force: boolean,
): { next: Record<string, unknown>; action: FileAction; reason?: string } {
  const base = existing ? { ...existing } : {};
  const serversRaw = base.mcpServers;
  const servers = (serversRaw && typeof serversRaw === 'object' && !Array.isArray(serversRaw))
    ? { ...(serversRaw as Record<string, unknown>) }
    : {};
  if (serversRaw !== undefined && (!serversRaw || typeof serversRaw !== 'object' || Array.isArray(serversRaw))) {
    return { next: base, action: 'collision', reason: 'mcpServers is not an object' };
  }
  const current = servers[MCP_SERVER_KEY];
  const currentObject = current && typeof current === 'object' && !Array.isArray(current)
    ? current as Record<string, unknown> : {};
  const mergedEntry = { ...currentObject, ...serverEntry };
  delete mergedEntry.url;
  delete mergedEntry.headers;
  if (!serverEntry.type) delete mergedEntry.type;
  if (current && sameJson(current, mergedEntry)) {
    const next = { ...base, mcpServers: { ...servers, [MCP_SERVER_KEY]: mergedEntry } };
    return { next, action: 'unchanged' };
  }
  if (current !== undefined && !force) {
    return {
      next: base,
      action: 'collision',
      reason: `Existing ${MCP_SERVER_KEY} MCP entry differs. Re-run with --force to replace it after a backup.`,
    };
  }
  const next = { ...base, mcpServers: { ...servers, [MCP_SERVER_KEY]: mergedEntry } };
  return { next, action: existing ? 'update' : 'create' };
}

export function planSetup(opts: {
  projectRoot: string;
  agents: AgentId[];
  cliPath: string;
  nodePath: string;
  force: boolean;
  homeDir?: string;
}): SetupPlan {
  const projectRoot = assertSafeProjectRoot(opts.projectRoot, opts.homeDir);
  const cliPath = assertAbsoluteExistingCli(opts.cliPath);
  const nodePath = opts.nodePath;
  if (!path.isAbsolute(nodePath)) {
    throw new Error(`Node path must be absolute: ${nodePath}`);
  }
  if (opts.agents.length === 0) {
    throw new Error('Select at least one agent: --agent claude-code and/or --agent cursor');
  }
  const agents = PROJECT_AGENTS.filter((agent) => opts.agents.includes(agent.id));
  const files: PlannedFile[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const workflow = workflowMarkdown();

  for (const agent of agents) {
    const serverEntry = mcpServerEntry(nodePath, cliPath, agent.includeStdioType);
    const mcpAbs = resolveInsideProject(projectRoot, agent.mcpRelative);
    try {
      assertWritablePath(projectRoot, mcpAbs);
      const existing = fs.existsSync(mcpAbs) ? readJsonObject(mcpAbs) : null;
      const merged = mergeMcpConfig(existing, serverEntry, opts.force);
      if (existing && merged.action === 'update') {
        warnings.push(`${agent.mcpRelative}: comments and formatting will be normalised to JSON; the original is backed up.`);
      }
      const content = `${JSON.stringify(merged.next, null, 2)}\n`;
      if (merged.action === 'collision') {
        errors.push(`${agent.mcpRelative}: ${merged.reason}`);
      }
      files.push({
        relativePath: agent.mcpRelative,
        absPath: mcpAbs,
        action: merged.action === 'unchanged' && existing && fs.readFileSync(mcpAbs, 'utf8') === content
          ? 'unchanged'
          : merged.action,
        content,
        previous: existing ? fs.readFileSync(mcpAbs, 'utf8') : undefined,
        reason: merged.reason,
      });
    } catch (err) {
      errors.push(`${agent.mcpRelative}: ${(err as Error).message}`);
    }

    const workflowAbs = resolveInsideProject(projectRoot, agent.workflowRelative);
    try {
      assertWritablePath(projectRoot, workflowAbs);
      const exists = fs.existsSync(workflowAbs);
      const previous = exists ? fs.readFileSync(workflowAbs, 'utf8') : undefined;
      let action: FileAction = exists ? (previous === workflow ? 'unchanged' : 'update') : 'create';
      let reason: string | undefined;
      if (exists && previous !== workflow && !opts.force) {
        action = 'collision';
        reason = 'Existing workflow file differs. Re-run with --force to replace it after a backup.';
        errors.push(`${agent.workflowRelative}: ${reason}`);
      }
      files.push({
        relativePath: agent.workflowRelative,
        absPath: workflowAbs,
        action,
        content: workflow,
        previous,
        reason,
      });
    } catch (err) {
      errors.push(`${agent.workflowRelative}: ${(err as Error).message}`);
    }
  }

  return { projectRoot, cliPath, nodePath, agents, files, errors, warnings };
}

export function formatPlan(plan: SetupPlan): string {
  const lines = [
    'Design Mode local agent setup (project scope only)',
    `Project: ${plan.projectRoot}`,
    `CLI:     ${plan.nodePath} ${plan.cliPath}`,
    `Agents:  ${plan.agents.map((agent) => agent.label).join(', ')}`,
    '',
  ];
  for (const file of plan.files) {
    lines.push(`  ${file.action.padEnd(10)} ${file.relativePath}`);
    if (file.reason) lines.push(`             ${file.reason}`);
  }
  if (plan.warnings.length) {
    lines.push('', 'Warnings:');
    for (const warning of plan.warnings) lines.push(`  - ${warning}`);
  }
  if (plan.errors.length) {
    lines.push('', 'Blocked:');
    for (const error of plan.errors) lines.push(`  - ${error}`);
  }
  return lines.join('\n');
}

export async function confirmApply(question = 'Apply these project-local changes? [y/N] '): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stderr.isTTY) return false;
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await new Promise<string>((resolve) => rl.question(question, resolve));
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

export function backupPath(absPath: string, now = new Date()): string {
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  return `${absPath}.bak-${stamp}`;
}

export function applyPlan(plan: SetupPlan, opts: { dryRun: boolean; now?: Date }): { written: string[]; backups: string[] } {
  if (plan.errors.length) {
    throw new Error(plan.errors.join('\n'));
  }
  const written: string[] = [];
  const backups: string[] = [];
  if (opts.dryRun) return { written, backups };

  for (const file of plan.files) {
    if (file.action === 'unchanged' || file.action === 'collision') continue;
    assertWritablePath(plan.projectRoot, file.absPath);
    if (file.action === 'update' && fs.existsSync(file.absPath)) {
      const dest = backupPath(file.absPath, opts.now);
      fs.copyFileSync(file.absPath, dest, fs.constants.COPYFILE_EXCL);
      backups.push(dest);
    }
    atomicWrite(file.absPath, file.content);
    written.push(file.absPath);
  }
  return { written, backups };
}

function atomicWrite(absPath: string, content: string): void {
  const dir = path.dirname(absPath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.design-mode-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`);
  fs.writeFileSync(tmp, content, { encoding: 'utf8', mode: 0o644, flag: 'wx' });
  try {
    fs.renameSync(tmp, absPath);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    throw err;
  }
}

export async function runSetup(opts: SetupCliOptions, io: {
  log?: (...args: unknown[]) => void;
  confirm?: () => Promise<boolean>;
} = {}): Promise<SetupApplyResult> {
  const log = io.log ?? ((...args: unknown[]) => console.error(...args));
  if (opts.help) {
    log(setupHelp());
    return {
      dryRun: true,
      applied: false,
      plan: {
        projectRoot: opts.projectRoot,
        cliPath: opts.cliPath,
        nodePath: opts.nodePath,
        agents: [],
        files: [],
        errors: [],
        warnings: [],
      },
      written: [],
      backups: [],
    };
  }

  const plan = planSetup(opts);
  log(formatPlan(plan));
  if (plan.errors.length) {
    throw new Error(plan.errors.join('\n'));
  }

  const nothingToWrite = plan.files.every((file) => file.action === 'unchanged');
  if (nothingToWrite) {
    log('\nAlready configured. No files changed.');
    return { dryRun: true, applied: false, plan, written: [], backups: [] };
  }

  if (opts.dryRun || !opts.apply) {
    log('\nDry run. Re-run with --apply --yes after reviewing the preview.');
    return { dryRun: true, applied: false, plan, written: [], backups: [] };
  }

  const confirmed = opts.yes || await (io.confirm ?? confirmApply)();
  if (!confirmed) {
    throw new Error('Apply cancelled: pass --yes to confirm, or run without --apply to preview.');
  }

  const { written, backups } = applyPlan(plan, { dryRun: false });
  log(`\nWrote ${written.length} file(s). Backups: ${backups.length ? backups.join(', ') : 'none'}`);
  return { dryRun: false, applied: true, plan, written, backups };
}

export async function runDoctor(opts: DoctorOptions, io: {
  log?: (...args: unknown[]) => void;
} = {}): Promise<DoctorReport> {
  const log = io.log ?? ((...args: unknown[]) => console.error(...args));
  if (opts.help) {
    log(doctorHelp());
    return {
      cliPath: opts.cliPath,
      cliOk: false,
      port: opts.port,
      ownerPid: null,
      extensionConnected: null,
      ok: true,
      issues: [],
    };
  }
  const issues: string[] = [];
  let cliPath = opts.cliPath;
  let cliOk = false;
  try {
    cliPath = assertAbsoluteExistingCli(cliPath);
    cliOk = true;
  } catch (err) {
    issues.push((err as Error).message);
  }

  const health = await probeOwnerHealth(opts.port);
  const ownerPid = health?.pid ?? null;
  const extensionConnected = health ? health.extensionConnected : null;
  if (!health) {
    issues.push(`No Design Mode owner on ${LOOPBACK_HOST}:${opts.port}. Start the local MCP server, then re-run doctor.`);
  } else if (!health.extensionConnected) {
    issues.push('Owner is up, but the browser extension is not connected.');
  }

  const report: DoctorReport = {
    cliPath,
    cliOk,
    port: opts.port,
    ownerPid,
    extensionConnected,
    ok: cliOk && Boolean(health?.extensionConnected),
    issues,
  };
  log(formatDoctor(report));
  return report;
}

export function formatDoctor(report: DoctorReport): string {
  const lines = [
    'Design Mode doctor',
    `CLI:        ${report.cliOk ? report.cliPath : 'missing'}`,
    `Owner:      ${report.ownerPid ? `pid ${report.ownerPid} on port ${report.port}` : `not reachable on port ${report.port}`}`,
    `Extension:  ${report.extensionConnected == null ? 'unknown' : report.extensionConnected ? 'connected' : 'disconnected'}`,
  ];
  if (report.issues.length) {
    lines.push('Issues:');
    for (const issue of report.issues) lines.push(`  - ${issue}`);
  } else {
    lines.push('Status:     ok');
  }
  return lines.join('\n');
}

export function setupHelp(): string {
  return [
    'Usage: design-mode-mcp setup [options]',
    '',
    'Preview and optionally write project-local MCP config plus a workflow file.',
    'Supported agents: Claude Code (.mcp.json) and Cursor (.cursor/mcp.json).',
    'User/global config is not written. Default is a dry-run preview.',
    '',
    '  --project <dir>   Project root (default: current directory)',
    '  --agent <id>      claude-code | cursor | all (repeatable; required to apply)',
    '  --cli <abs-path>  Absolute built dist/bin/cli.js',
    '  --node <abs-path> Absolute node binary (default: current process)',
    '  --dry-run         Preview only (default)',
    '  --apply           Write files after preview',
    '  --yes             Confirm apply without a prompt',
    '  --force           Replace a colliding design-mode entry after backup',
    '  --help            Show this help',
  ].join('\n');
}

export function doctorHelp(): string {
  return [
    'Usage: design-mode-mcp doctor [options]',
    '',
    'Check the built CLI path and localhost owner/extension connectivity.',
    '',
    '  --cli <abs-path>  Absolute built dist/bin/cli.js',
    '  --port <n>        Owner port (default: DM_PORT or 9960)',
    '  --help            Show this help',
  ].join('\n');
}

export async function runCliCommand(argv: string[], defaults: {
  scriptPath?: string;
  cwd?: string;
  execPath?: string;
  homeDir?: string;
  log?: (...args: unknown[]) => void;
  confirm?: () => Promise<boolean>;
} = {}): Promise<number> {
  const command = argv[0];
  const rest = argv.slice(1);
  const scriptPath = defaults.scriptPath ?? process.argv[1];
  let defaultCliPath = '';
  try {
    defaultCliPath = resolveBuiltCliPath(scriptPath);
  } catch {
    defaultCliPath = '';
  }

  if (command === 'setup') {
    const opts = parseSetupArgs(rest, {
      cwd: defaults.cwd,
      execPath: defaults.execPath,
      homeDir: defaults.homeDir,
      defaultCliPath,
    });
    if (!opts.cliPath) opts.cliPath = defaultCliPath;
    await runSetup(opts, { log: defaults.log, confirm: defaults.confirm });
    return 0;
  }

  if (command === 'doctor') {
    const opts = parseDoctorArgs(rest, { defaultCliPath });
    if (!opts.cliPath) opts.cliPath = defaultCliPath;
    const report = await runDoctor(opts, { log: defaults.log });
    return report.ok ? 0 : 1;
  }

  throw new Error(`Unknown command: ${command}`);
}
