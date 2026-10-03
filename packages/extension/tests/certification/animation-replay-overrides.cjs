const fs = require('node:fs'), path = require('node:path');
const assert = require('node:assert/strict');
module.exports = async ({content, panel, base, select, send, wait, version, out}) => {
  const checks = [];
  const sample = id => content(id => {
    const e = document.getElementById(id);
    return {inline:e.getAttribute('style'), fill:getComputedStyle(e).animationFillMode, opacity:getComputedStyle(e).opacity,
      animations:e.getAnimations().map(a => ({time:a.currentTime,state:a.playState,fill:a.effect.getTiming().fill}))};
  }, id);
  for (const property of ['animationFillMode', 'animation']) {
    const id = property === 'animation' ? 'paused' : 'completed';
    await select(id);
    await content(id => { document.getElementById(id).style.animation = 'finite 1s linear 1 normal both running'; }, id);
    await send('SP_APPLY_STYLE', {property:'animation',value:'finite 1s linear 1 normal both running'});
    await send('SP_APPLY_STYLE', {property,value:property === 'animation' ? 'finite 1s linear 1 normal none running' : 'none'});
    await wait(1300);
    const before = await sample(id);
    const changesBefore = await send('SP_GET_CHANGES');
    const savedBefore = await panel(require('./panel-actions.cjs').readSession, 'dm_session:' + base + '/mixed');
    const response = await send('SP_PREVIEW_ANIMATION');
    await wait(100);
    const after = await sample(id);
    const changesAfter = await send('SP_GET_CHANGES');
    await wait(1100);
    const settled = await sample(id);
    const savedAfter = await panel(require('./panel-actions.cjs').readSession, 'dm_session:' + base + '/mixed');
    const persistenceUnchanged = savedBefore === savedAfter;
    checks.push({property,before,after,settled,response,persistenceUnchanged,ok:response?.ok === true
      && settled.animations.length === 0 && settled.fill === 'none' && settled.opacity === '1'
      && before.animations.length === 0 && before.fill === 'none'
      && after.animations.length === 1 && after.animations[0].state === 'running' && after.animations[0].time < 500
      && after.fill === 'none' && after.animations[0].fill === 'none' && Number(after.opacity) < .8
      && persistenceUnchanged
      && before.inline === after.inline && before.inline === settled.inline && JSON.stringify(changesBefore) === JSON.stringify(changesAfter)});
  }
  const result = {version,checks};
  fs.writeFileSync(path.join(out,'animation-replay-overrides-results.json'), JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
  assert.ok(checks.every(c => c.ok), 'USER important fill longhand and animation shorthand replay without persistent changes');
};
