const fs = require('node:fs');
const path = require('node:path');
const {Key} = require('selenium-webdriver');
const A = require('../certification/panel-actions.cjs');
module.exports = async h => {
  const samples = [];
  async function snapshot(label) {
    const panel = await h.panel(A.focusState);
    await h.driver.setContext('chrome');
    const native = await h.driver.executeScript(function () {
      const sidebar = document.getElementById('sidebar');
      const inner = sidebar.contentDocument.getElementById('webext-panels-browser');
      return {windowFocused: document.hasFocus(), active: document.activeElement?.localName,
        activeId: document.activeElement?.id, sidebarFocused: sidebar.contentDocument.hasFocus(),
        sidebarActive: sidebar.contentDocument.activeElement?.id,
        innerIsActive: sidebar.contentDocument.activeElement === inner};
    });
    samples.push({label, panel: {hasFocus: panel.hasFocus, active: panel.active.slice(0, 100)}, native});
  }
  await h.select('heading');
  await snapshot('page-selected');
  await h.content(() => true);
  await h.driver.actions({async: true}).keyDown(Key.ALT).sendKeys('c').keyUp(Key.ALT).perform();
  await h.wait(500);
  await snapshot('shortcut');
  await h.driver.setContext('chrome');
  await h.driver.actions({async: true}).sendKeys('Unassisted typing').perform();
  const unassisted = await h.panel(A.inspectSelector, 'textarea');
  await h.driver.setContext('chrome');
  // Privileged focus is a diagnostic control, never a product fix or certification pass.
  await h.driver.executeScript(function () {
    document.getElementById('sidebar').contentDocument.getElementById('webext-panels-browser').focus();
  });
  await snapshot('privileged-focus-control');
  await h.driver.setContext('chrome');
  await h.driver.actions({async: true}).sendKeys('Control typing').perform();
  const controlled = await h.panel(A.inspectSelector, 'textarea');
  const result = {samples, unassisted, controlled, diagnosticOnly: true};
  fs.writeFileSync(path.join(h.out, 'native-focus.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({samples, unassisted: unassisted.map(field => field.value), controlled: controlled.map(field => field.value)}));
};
