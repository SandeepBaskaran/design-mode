import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  applyPlan,
  assertAbsoluteExistingCli,
  assertSafeProjectRoot,
  formatPlan,
  parseSetupArgs,
  planSetup,
  resolveInsideProject,
  runCliCommand,
  runDoctor,
  runSetup,
  workflowMarkdown,
  type SetupPlan,
} from '../src/setup.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.join(here, '..');

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dm-setup-'));
}

function writeFakeCli(dir: string): string {
  const cli = path.join(dir, 'cli.js');
  fs.writeFileSync(cli, '#!/usr/bin/env node\nconsole.error("fake");\n', 'utf8');
  return cli;
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        server.close();
        reject(new Error('no address'));
        return;
      }
      const port = addr.port;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
    server.on('error', reject);
  });
}

function listen(server: http.Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve());
  });
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve) => {
    if (!server.listening) {
      resolve();
      return;
    }
    server.closeAllConnections?.();
    server.close(() => resolve());
  });
}

function spawnHelp(): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', path.join(packageRoot, 'src/bin/cli.ts'), 'setup', '--help'],
      { cwd: packageRoot, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.on('error', reject);
    child.on('exit', (code) => resolve({ code, stderr }));
  });
}

describe('mcp-local guided setup', { concurrency: false, timeout: 15_000 }, () => {
  let home: string;
  let project: string;
  let cliPath: string;
  const nodePath = process.execPath;

  before(() => {
    home = tmpDir();
    project = tmpDir();
    cliPath = writeFakeCli(tmpDir());
  });

  after(() => {
    for (const dir of [home, project, path.dirname(cliPath)]) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('dry-run previews Claude Code + Cursor files and writes nothing', async () => {
    const opts = parseSetupArgs(
      ['--project', project, '--agent', 'all', '--cli', cliPath, '--dry-run'],
      { cwd: project, execPath: nodePath, homeDir: home, defaultCliPath: cliPath },
    );
    const result = await runSetup(opts, { log() {} });
    assert.equal(result.dryRun, true);
    assert.equal(result.applied, false);
    assert.equal(result.written.length, 0);
    assert.deepEqual(
      result.plan.files.map((file) => file.relativePath).sort(),
      [
        '.claude/commands/design-mode.md',
        '.cursor/mcp.json',
        '.cursor/commands/design-mode.md',
        '.mcp.json',
      ].sort(),
    );
    assert.equal(fs.existsSync(path.join(project, '.mcp.json')), false);
    assert.equal(fs.existsSync(path.join(project, '.cursor')), false);
    assert.match(formatPlan(result.plan), /Dry run|create/i);
  });

  test('Cursor JSONC is previewed, backed up and safely merged', () => {
    const jsoncProject = tmpDir();
    try {
      fs.mkdirSync(path.join(jsoncProject, '.cursor'));
      const config = path.join(jsoncProject, '.cursor/mcp.json');
      const original = '\uFEFF{\n// retain in backup\n"mcpServers":{"other":{"command":"other",},},}';
      fs.writeFileSync(config, original);
      const plan = planSetup({ projectRoot: jsoncProject, agents: ['cursor'], cliPath, nodePath, force: false, homeDir: home });
      assert.deepEqual(plan.errors, []);
      assert.match(formatPlan(plan), /normalised to JSON/);
      assert.equal(fs.readFileSync(config, 'utf8'), original);
      const result = applyPlan(plan, { dryRun: false });
      assert.equal(fs.readFileSync(result.backups[0], 'utf8'), original);
      const merged = JSON.parse(fs.readFileSync(config, 'utf8'));
      assert.equal(merged.mcpServers.other.command, 'other');
      assert.equal(merged.mcpServers['design-mode'].command, nodePath);
    } finally {
      fs.rmSync(jsoncProject, { recursive: true, force: true });
    }
  });

  test('apply without confirmation is refused', async () => {
    const opts = parseSetupArgs(
      ['--project', project, '--agent', 'claude-code', '--cli', cliPath, '--apply'],
      { cwd: project, execPath: nodePath, homeDir: home, defaultCliPath: cliPath },
    );
    await assert.rejects(
      () => runSetup(opts, { log() {}, confirm: async () => false }),
      /cancelled/,
    );
    assert.equal(fs.existsSync(path.join(project, '.mcp.json')), false);
  });

  test('apply --yes writes MCP config and workflow, then is idempotent', async () => {
    const args = ['--project', project, '--agent', 'all', '--cli', cliPath, '--apply', '--yes'];
    const first = await runSetup(
      parseSetupArgs(args, { cwd: project, execPath: nodePath, homeDir: home, defaultCliPath: cliPath }),
      { log() {} },
    );
    assert.equal(first.applied, true);
    assert.equal(first.written.length, 4);

    const mcp = JSON.parse(fs.readFileSync(path.join(project, '.mcp.json'), 'utf8'));
    assert.equal(mcp.mcpServers['design-mode'].command, nodePath);
    assert.deepEqual(mcp.mcpServers['design-mode'].args, [fs.realpathSync(cliPath)]);
    assert.equal(mcp.mcpServers['design-mode'].type, 'stdio');
    assert.equal(
      fs.readFileSync(path.join(project, '.claude/commands/design-mode.md'), 'utf8'),
      workflowMarkdown(),
    );
    assert.match(workflowMarkdown(), /wait_for_handoff/);
    assert.match(workflowMarkdown(), /Only if the user chose live rounds/);
    assert.equal(fs.readFileSync(path.join(project, '.cursor/commands/design-mode.md'), 'utf8'), workflowMarkdown());

    const cursorMcp = JSON.parse(fs.readFileSync(path.join(project, '.cursor/mcp.json'), 'utf8'));
    assert.equal(cursorMcp.mcpServers['design-mode'].args[0], fs.realpathSync(cliPath));

    const second = await runSetup(
      parseSetupArgs(args, { cwd: project, execPath: nodePath, homeDir: home, defaultCliPath: cliPath }),
      { log() {} },
    );
    assert.equal(second.applied, false);
    assert.equal(second.written.length, 0);
    assert.ok(second.plan.files.every((file) => file.action === 'unchanged'));
  });

  test('collision on a different MCP entry is blocked without --force, then backed up', async () => {
    const isolated = tmpDir();
    const localCli = writeFakeCli(isolated);
    fs.writeFileSync(path.join(isolated, '.mcp.json'), `${JSON.stringify({
      mcpServers: {
        'design-mode': { command: 'other', args: ['nope'] },
        other: { command: 'keep-me', args: [] },
      },
    }, null, 2)}\n`);
    const blocked = planSetup({
      projectRoot: isolated,
      agents: ['claude-code'],
      cliPath: localCli,
      nodePath,
      force: false,
      homeDir: home,
    });
    assert.ok(blocked.errors.some((error) => /differs/.test(error)));

    const forced = planSetup({
      projectRoot: isolated,
      agents: ['claude-code'],
      cliPath: localCli,
      nodePath,
      force: true,
      homeDir: home,
    });
    const applied = applyPlan(forced, { dryRun: false, now: new Date('2026-09-19T12:00:00.000Z') });
    assert.equal(applied.written.length, 2);
    assert.equal(applied.backups.length, 1);
    const next = JSON.parse(fs.readFileSync(path.join(isolated, '.mcp.json'), 'utf8'));
    assert.equal(next.mcpServers.other.command, 'keep-me');
    assert.equal(next.mcpServers['design-mode'].command, nodePath);
    assert.ok(fs.existsSync(applied.backups[0]));
    fs.rmSync(isolated, { recursive: true, force: true });
  });

  test('refuses relative CLI paths, missing CLI, home root, escapes, and symlink writes', () => {
    assert.throws(() => assertAbsoluteExistingCli('dist/bin/cli.js'), /absolute/);
    assert.throws(() => assertAbsoluteExistingCli(path.join(project, 'missing.js')), /existing regular file/);
    assert.throws(() => assertSafeProjectRoot(home, home), /home directory/);
    assert.throws(() => resolveInsideProject(project, '../outside.json'), /escapes/);

    const linked = path.join(project, 'link-out.json');
    const outside = path.join(home, 'secret.json');
    fs.writeFileSync(outside, '{"mcpServers":{}}\n');
    fs.symlinkSync(outside, linked);
    const plan: SetupPlan = {
      projectRoot: project,
      cliPath,
      nodePath,
      agents: [],
      errors: [],
      warnings: [],
      files: [{
        relativePath: 'link-out.json',
        absPath: linked,
        action: 'update',
        content: '{}\n',
      }],
    };
    assert.throws(() => applyPlan(plan, { dryRun: false }), /symlink/);
  });

  test('doctor reports missing owner, then connectivity when health is up', async () => {
    const port = await getFreePort();
    const disconnected = await runDoctor({ cliPath, port }, { log() {} });
    assert.equal(disconnected.cliOk, true);
    assert.equal(disconnected.ok, false);
    assert.match(disconnected.issues.join('\n'), /No Design Mode owner/);

    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        identity: 'design-mode-mcp',
        version: '2.2.1',
        pid: 4242,
        role: 'owner',
        extensionConnected: true,
        webSocketToken: 'test-token',
      }));
    });
    await listen(server, port);
    try {
      const connected = await runDoctor({ cliPath, port }, { log() {} });
      assert.equal(connected.ok, true);
      assert.equal(connected.ownerPid, 4242);
      assert.equal(connected.extensionConnected, true);
    } finally {
      await closeServer(server);
    }
  });

  test('CLI setup --help is routed without booting the MCP server', async () => {
    const result = await spawnHelp();
    assert.equal(result.code, 0);
    assert.match(result.stderr, /design-mode-mcp setup/);
    assert.doesNotMatch(result.stderr, /Starting/);
  });

  test('runCliCommand setup dry-run never writes outside the temp project', async () => {
    const isolated = tmpDir();
    const localCli = writeFakeCli(isolated);
    const logs: string[] = [];
    const code = await runCliCommand(
      ['setup', '--project', isolated, '--agent', 'cursor', '--cli', localCli, '--dry-run'],
      {
        cwd: isolated,
        execPath: nodePath,
        homeDir: home,
        scriptPath: path.join(packageRoot, 'src/bin/cli.ts'),
        log: (...args) => { logs.push(args.map(String).join(' ')); },
      },
    );
    assert.equal(code, 0);
    assert.equal(fs.existsSync(path.join(isolated, '.cursor/mcp.json')), false);
    assert.match(logs.join('\n'), /Dry run/);
    fs.rmSync(isolated, { recursive: true, force: true });
  });
});
