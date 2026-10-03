// Run from any directory: node /path/to/certification/run.cjs chrome|firefox|mcp
const path = require('node:path');
const suites = {
  chrome: { browser: 'chrome', module: 'chrome-corrections.cjs', fixture: 'chrome-fixture.html' },
  firefox: { browser: 'firefox', module: 'firefox-corrections.cjs', fixture: 'firefox-fixture.html' },
  mcp: { browser: 'chrome', module: 'mcp-installed.cjs', fixture: 'mcp-fixture.html' },
};
const suite = process.argv[2];
if (!Object.hasOwn(suites, suite)) throw new Error('Choose a certification suite: chrome, firefox, mcp');
const config = suites[suite];
const root = path.resolve(__dirname, '../../../..');
process.env.DM_CERTIFICATION_MODULE = path.join(__dirname, config.module);
process.env.DM_CERTIFICATION_FIXTURE = path.join(__dirname, config.fixture);
process.env.DM_EXTENSION_DIST = path.join(root, 'packages/extension/dist');
process.env.DM_ACCEPTANCE_OUT = path.join(root, '.correction-evidence', suite);
process.argv[2] = config.browser;
require('../acceptance-installed.cjs');
