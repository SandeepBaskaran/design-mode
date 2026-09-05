'use strict';

const { claimOrAttach } = require('../../dist/owner-bridge.js');

async function main() {
  const port = Number(process.env.DM_PORT);
  if (!Number.isInteger(port) || port <= 0) {
    console.error('DM_PORT required');
    process.exit(1);
  }

  const claim = await claimOrAttach(port);
  process.stdout.write(JSON.stringify({
    role: claim.role,
    pid: process.pid,
    ownerPid: claim.pid ?? null,
  }) + '\n');

  await new Promise((resolve) => {
    const done = () => resolve();
    process.on('SIGTERM', done);
    process.on('SIGINT', done);
  });
  await claim.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
