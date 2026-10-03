const fs = require('node:fs'), path = require('node:path');
const assert = require('node:assert/strict');
module.exports = async ({content, select, send, wait, version, out}) => {
  const checks = [];
  const sample = id => content(id => {
    const e = document.getElementById(id);
    return { opacity: getComputedStyle(e).opacity, inline: e.getAttribute('style'), animations: e.getAnimations().map(a => ({time:a.currentTime, state:a.playState, fill:a.effect.getTiming().fill})), frozen:!!document.getElementById('dm-freeze-animations') };
  }, id);
  for (const id of ['completed', 'paused', 'css-paused', 'frozen']) {
    await select(id);
    await content(id => {
      const e = document.getElementById(id);
      e.style.animation = 'finite 1s linear 1 normal none running';
      if (id === 'css-paused') e.style.animationPlayState = 'paused';
      const a = e.getAnimations()[0];
      if (id !== 'completed') { a.currentTime = 500; if (id === 'paused') a.pause(); }
    }, id);
    if (id === 'frozen') await send('SP_TOGGLE_FREEZE');
    await wait(id === 'completed' ? 1250 : 100);
    const before = await sample(id);
    const changesBefore = await send('SP_GET_CHANGES');
    const response = await send('SP_PREVIEW_ANIMATION');
    await wait(100);
    const after = await sample(id);
    const ok = id === 'completed'
      ? before.animations.length === 0 && before.opacity === '1' && after.animations.length === 1 && after.animations[0].state === 'running' && after.animations[0].time < 500 && Number(after.opacity) < .8
      : before.animations[0]?.state === 'paused' && after.animations[0]?.state === 'paused' && after.animations[0]?.time === 0 && after.frozen === before.frozen;
    const historyUnchanged = JSON.stringify(changesBefore) === JSON.stringify(await send('SP_GET_CHANGES'));
    checks.push({id, ok:ok && response?.ok === true && historyUnchanged && before.inline === after.inline && after.animations[0]?.fill === 'none', historyUnchanged, before, after});
    if (id === 'frozen') {
      await send('SP_TOGGLE_FREEZE');
      await wait(100);
      const thawed = await sample(id);
      checks.push({id:'unfreeze-resumes', ok:!thawed.frozen && thawed.animations[0]?.state === 'running' && thawed.animations[0]?.time > 0, thawed});
    }
  }
  const result = {version, checks};
  fs.writeFileSync(path.join(out, 'animation-replay-results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  assert.ok(checks.every(c => c.ok), 'completed fill:none restarts; paused and frozen replay stay paused at zero');
};
