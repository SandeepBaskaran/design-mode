# Test fixture for Design Mode

A static HTML file you can iterate against without a server.

## Setup

1. Build: `cd packages/extension && node build.mjs`
2. Load `dist/` unpacked in `chrome://extensions` (Developer mode → Load unpacked).
3. Open `packages/extension/test-fixtures/index.html` in Chrome via `file://`.
4. Click the extension icon to pin the side panel.

## End-to-end checklist

Walk these in order. Each step assumes the previous succeeded.

### 1. Persistence (Workstream A)

- [ ] Click `#primary-btn`. Change its background color in the side panel.
- [ ] Open DevTools → Elements → `<head>`. Confirm `<style id="dm-applied-styles">` exists with a rule like `[data-dm-id="dm-N"] { background: ... }`.
- [ ] Reload the page. The button should still show the new color.
- [ ] Open the side panel. The change should still appear in the Changes tab.

### 2. Structured animation editor (Workstream B)

- [ ] Select `#hero-card`.
- [ ] In the Animation editor, choose **Slide Up**, set Duration **0.6s**, Iterations **1**, Fill **forwards**.
- [ ] Click **▶ Preview**. Card slides up.
- [ ] Reload. Card slides up automatically (Fill: forwards keeps it in the end state).
- [ ] In `<style id="dm-applied-styles">`, verify both `@keyframes dm-slide-up { ... }` and the rule on the card are present.

### 3. Transition editor (Workstream B)

- [ ] Select `#hero-card`. Set Transition Property **background-color**, Duration **300ms**, Timing **ease-in-out**.
- [ ] Now change the background color via the color picker — it should fade in over 300ms.
- [ ] Reload, change color again — transition still works.

### 4. Capture modes (Workstream C)

- [ ] Settings → **Screenshot Capture** → set **Clipboard**. Click camera icon. Toast: "Copied to clipboard". Paste somewhere to confirm.
- [ ] Set **Download**. Click camera. Browser downloads PNG. Toast: "Saved as element-….png" (or `viewport-…`).
- [ ] Set **Both**. Click camera. Both happen. Toast: "Copied & saved as ….png".

### 5. Page re-render resilience (Workstream A — MutationObserver)

- [ ] Open DevTools console. Run: `document.getElementById('hero-card').outerHTML = document.getElementById('hero-card').outerHTML`
- [ ] This re-creates the element with the same selector but no `data-dm-id`.
- [ ] Within ~100ms, the rule should re-apply (re-stamper runs on the next mutation tick).

## Debug helpers

In DevTools console:

- `__dm.dump()` — current in-memory styleChanges/textChanges/domChanges arrays.
- `__dm.applied()` — current text of `<style id="dm-applied-styles">`.

These let you confirm what the extension thinks is applied without guessing.
