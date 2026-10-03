# Region-comment installed-extension certification

## Verified result

Chrome for Testing (`HeadlessChrome/151.0.0.0`), isolated disposable profile, installed unpacked extension: **15/15 cases passed**, exit 0. `npm run build:extension` also exited 0. Firefox was not launched. No production fixes, website edits, telemetry actions, MCP relay actions, staging, or commits were performed. The installed harness blocks non-loopback traffic with routing plus an invalid outbound proxy.

Source: read-only copy of dirty parent `/Users/sandeepbaskaran/Documents/design-mode/.worktrees/feat-next-release/.worktrees/subagent-sa-0-b581b0be`; `seed-manifest.json` records 533 copied files and SHA-256 values. Final child verification found zero seed mismatches. This is the seed at copy time, not a claim about the parent's later source17 changes. Node dependencies were copied locally, excluding `@design-mode`; verification found no outside-root symlinks. Generated dist lives in this child.

## Coverage

| ID | Cases | Assertions |
|---|---:|---|
| 6.9 | 1 | Real mouse drag; document geometry; dashed yellow styling; region composer; pending box survives input; no premature saved comment |
| 6.9b | 2 | Single click without DOM selection gives 180×110; viewport-edge default box clamping |
| 6.9c | 1 | Add removes pending representation, creates one fixed committed box, persisted geometry/text, numbered pin, region Changes-row badge |
| 6.10 | 1 | Pending and committed document anchoring on scroll; saved comment equality and region/pin after reload |
| 6.11 | 2 | Cancel removes pending box without comment; real Escape during held-pointer drag removes drawing and recovers selection |
| 6.12 | 6 | Add/edit/region × Cancel/Submit: inspect aria state off and disabled, no hover outline, clicks preserve heading selection, prior on-state restored, subsequent selection works |
| 6.8 | 1 | Real hover over unobscured pin does not inspect extension UI (actual hover overlay display:none); click still opens comment |
| 6.2 | 1 | Browser-delivered Alt+C opens composer with focused textarea |

Scope limits: Chrome bound panel tab, not native Chrome sidepanel; browser-generated keyboard, not physical macOS input. 6.8 selects a different element before hovering to avoid the selected element's overlapping resize handle. First-run evidence preserves that overlap observation; it is not counted as a product fix. Scroll checks use vertical scrolling. No Firefox claim.

## Files / evidence

- `regions.cjs`: suite, requiring only fixed named evaluators from `../certification/panel-actions.cjs` for panel evaluations; arbitrary evaluation is content-only.
- `fixture.html`: synthetic localhost-only fixture.
- `seed-manifest.json`: seed SHA provenance.
- `run1.log`, `evidence-run1/`: first attempt, exit 1, 8 passed / 7 failed. Six failures were test assertions incorrectly expecting ordinary div text in Design (UI correctly showed `div#other`; editing also stayed in Changes). One was pin hover blocked by the selected element's resize handle. Preserved, not overwritten.
- `run2.log`, `evidence-run2/regions-results.json`: corrected suite, 15 passed / 0 failed, exit 0. 30 screenshots (panel and page per case). On any failed case the final assertion makes the process fail nonzero after recording all cases.

## Reproduce from this child worktree

```sh
npm run build:extension
NODE_PATH=/Users/sandeepbaskaran/Documents/design-mode-recovery/20260926-212555/browser-test-node_modules \
CHROME_BINARY='/Users/sandeepbaskaran/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' \
DM_CERTIFICATION_MODULE="$PWD/packages/extension/tests/certification-regions/regions.cjs" \
DM_CERTIFICATION_FIXTURE="$PWD/packages/extension/tests/certification-regions/fixture.html" \
DM_ACCEPTANCE_OUT="$PWD/packages/extension/tests/certification-regions/evidence-rerun" \
node packages/extension/tests/acceptance-installed.cjs chrome
```

Harness lessons: query inspect button `aria-pressed` and disabled state, assert retained Design breadcrumb rather than assuming div text is rendered, explicitly return to Design before asserting selection, and move selection off the commented anchor before testing its pin. Keep each scenario on a distinct localhost URL and cancel composers explicitly between scenarios.
