const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const A = require('../certification/panel-actions.cjs');

module.exports = async h => {
  const rows = [], supplemental = [];
  const save = () => fs.writeFileSync(path.join(h.out, 'rows.json'), JSON.stringify({version: h.version, rows, supplemental}, null, 2));
  const snap = selector => h.panel(A.inspectSelector, selector);
  const click = async selector => { await h.panel(A.clickSelector, selector); await h.wait(450); };
  const input = async (selector, value) => { await h.panel(A.inputSelector, {selector, value: String(value)}); await h.wait(550); };
  const edit = (prop, value) => input('input[data-dm-prop="' + prop + '"]', value);
  const choose = (prop, value) => input('select[data-dm-prop="' + prop + '"]', value);
  const styles = (id, props) => h.content(({id, props}) => {
    const s = getComputedStyle(document.getElementById(id));
    return Object.fromEntries(props.map(p => [p, s[p]]));
  }, {id, props});
  const style = async (id, prop) => (await styles(id, [prop]))[prop];
  const changes = () => h.send('SP_GET_CHANGES');
  const section = async name => {
    const selector = '[data-dm-toggle-section="dm-sec-' + name + '"]';
    const header = (await snap(selector))[0];
    assert(header, name + ' section exists');
    if (header.attributes['aria-expanded'] !== 'true') await click(selector);
  };
  const advanced = async name => {
    await section(name);
    if (!(await snap('[data-dm-advanced-body="' + name + '"]')).length) await click('[data-dm-advanced-toggle="' + name + '"]');
  };
  const fresh = async (name, id = 'plain') => {
    await h.navigate(h.base + '/breadth-design-' + name);
    await h.panel(A.showDesign); await h.wait(250); await h.select(id);
  };
  const test = async (id, fn, remaining = '', list = rows) => {
    if (process.env.CERTIFICATION_IDS && !process.env.CERTIFICATION_IDS.split(',').includes(id)) return;
    assert(!list.some(r => r.id === id), 'Duplicate row: ' + id);
    const row = {id, status: 'running', observed: null, remaining}; list.push(row); save();
    try { row.observed = await fn(row); row.status = row.remaining ? 'partial' : 'pass'; }
    catch (error) {
      row.status = 'fail'; row.error = String(error.stack || error);
      try { row.observed = {prior: row.observed, controls: await snap('[data-dm-prop], [data-dm-motion-preview]'), body: await snap('body')}; }
      catch (diagnosticError) { row.diagnosticError = String(diagnosticError); }
    }
    save(); console.log(id, row.status, row.error || row.remaining);
  };
  const borderProps = ['borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth'];
  const radiusProps = ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius'];
  const linked = async on => {
    const selector = '[data-dm-border-link="width"]';
    const control = (await snap(selector))[0]; assert(control);
    if (control.attributes.title.startsWith('Linked') !== on) await click(selector);
    const result = (await snap(selector))[0];
    assert.equal(result.attributes.title.startsWith('Linked'), on);
    assert.match(result.attributes.style, on ? /color:var\(--dm-accent\)/ : /color:var\(--dm-text-dim\)/);
    return result;
  };
  const corners = async () => {
    await section('appearance');
    if ((await snap('[data-dm-corner-expand]'))[0].attributes['data-active'] !== 'true') await click('[data-dm-corner-expand]');
  };
  const motion = async trigger => { await section('motion'); await click('[data-dm-motion-add-trigger="' + trigger + '"]'); };
  const hover = async id => {
    if (h.page) await h.page.locator('#' + id).hover();
    else {
      await h.content(() => true);
      const {By} = require('selenium-webdriver');
      await h.driver.actions({async: true}).move({origin:'viewport',x:20,y:20}).move({origin: await h.driver.findElement(By.id(id))}).perform();
    }
    await h.wait(450);
  };
  const guideImage = () => h.content(() => getComputedStyle(document.getElementById('plain'), '::before').backgroundImage);

  await test('3.0', async () => {
    await fresh('section-defaults');
    const states = async () => Object.fromEntries((await snap('[data-dm-toggle-section]')).map(x => [x.attributes['data-dm-toggle-section'], x.attributes['aria-expanded']]));
    const empty = await states();
    for (const key of ['stroke', 'effects', 'layout-guide']) assert.equal(empty['dm-sec-' + key], 'false', key);
    assert.equal(empty['dm-sec-fill'], 'true');
    await h.select('decorated'); const populated = await states();
    for (const key of ['stroke', 'effects']) assert.equal(populated['dm-sec-' + key], 'true', key);
    await click('[data-dm-toggle-section="dm-sec-effects"]');
    assert.equal((await states())['dm-sec-effects'], 'false');
    await h.select('plain'); await h.select('decorated');
    assert.equal((await states())['dm-sec-effects'], 'false', 'User-pinned collapse survives selection');
    return {empty, populated, pinned: await states()};
  });
  await test('3.1', async () => {
    await fresh('computed-box'); await advanced('layout');
    const body = (await snap('[data-dm-advanced-body="layout"]'))[0];
    assert.match(body.text, /Computed box/); assert.match(body.html, /border:1px dashed/); assert.match(body.html, /border:1px solid/);
    for (const p of ['margin', 'padding']) for (const side of ['Top', 'Right', 'Bottom', 'Left']) assert(body.html.includes('data-dm-prop="' + p + side + '"'));
    assert.match(body.text, /\d+\s*×\s*\d+/);
    const nested = await snap('[data-dm-advanced-body="layout"] div[style*="border:1px dashed"] div[style*="border:1px solid"]');
    assert(nested.some(box => /\d+\s*×\s*\d+/.test(box.text) && box.html.includes('data-dm-prop="paddingTop"')));
    return body;
  });
  await test('3.3', async () => {
    await fresh('borders-independent', 'border'); await section('stroke'); await linked(false);
    for (let i = 0; i < borderProps.length; i++) {
      const before = await styles('border', borderProps); await edit(borderProps[i], i + 4);
      const after = await styles('border', borderProps); assert.equal(after[borderProps[i]], (i + 4) + 'px');
      for (const p of borderProps.filter(p => p !== borderProps[i])) assert.equal(after[p], before[p]);
    }
    return styles('border', borderProps);
  });
  await test('3.4', async () => {
    await fresh('borders-linked', 'border'); await section('stroke'); await linked(false); const control = await linked(true);
    await edit('borderTopWidth', 9); const actual = await styles('border', borderProps);
    assert.deepEqual(Object.values(actual), ['9px', '9px', '9px', '9px']); return {actual, control};
  });
  await test('3.5', async () => {
    await fresh('borders-unlinked', 'border'); await section('stroke'); await linked(true); await edit('borderTopWidth', 6);
    const control = await linked(false); await edit('borderLeftWidth', 13); const actual = await styles('border', borderProps);
    assert.deepEqual(borderProps.map(p=>actual[p]), ['6px', '6px', '6px', '13px']); return {actual, control};
  });
  await test('3.6', async () => {
    await fresh('radius-independent', 'radius'); await corners();
    for (let i = 0; i < radiusProps.length; i++) await edit(radiusProps[i], i + 3);
    const actual = await styles('radius', radiusProps); assert.deepEqual(radiusProps.map(p=>actual[p]), ['3px', '4px', '5px', '6px']);
    const linkControls = await snap('[data-dm-corner-link], [data-dm-border-link="radius"]');
    return {actual, linkControls};
  }, 'Per-corner independent edits verified. Current corner grid has no link/unlink control; linked radius contract is not certified.');
  await test('3.7', async () => {
    await fresh('stroke-position', 'border'); await section('stroke');
    await click('[data-dm-stroke-pos="inside"]'); if (!(await snap('[data-dm-stroke-row]')).length) await click('[data-dm-stroke-add]'); await edit('__stroke_weight__0', 5);
    const inside = await style('border', 'boxShadow'); assert.match(inside, /inset/); assert.match(inside, /5px/);
    await click('[data-dm-stroke-pos="outside"]'); if (!(await snap('[data-dm-stroke-row]')).length) await click('[data-dm-stroke-add]'); await edit('__stroke_weight__0', 6);
    const outside = await styles('border', ['boxShadow', 'borderTopWidth']); assert.match(outside.boxShadow, /6px(?:,|$)/); assert.match(outside.boxShadow, /5px inset/);
    assert(outside.boxShadow.includes('6px') || outside.borderTopWidth === '6px');
    await click('[data-dm-stroke-pos="center"]'); await edit('__stroke_weight', 7);
    const center = await styles('border', ['outlineWidth', 'outlineStyle']); assert.equal(center.outlineWidth, '7px'); assert.notEqual(center.outlineStyle, 'none');
    return {inside, outside, center};
  }, 'Inside and Center paths asserted. Current Outside uses box-shadow even for one layer; catalogue single-border and multi-layer distinction remains uncertified.');
  await test('3.9a', async () => {
    const evidence = [];
    for (const [id, field, prop, distribution] of [['layout', 'col', 'columnGap', 'justifyContent'], ['grid', 'row', 'rowGap', 'alignContent']]) {
      await fresh('gap-' + id, id); await section('layout');
      await input('[data-dm-gap-mode="' + field + '"]', 'fixed'); await edit(prop, 17); assert.equal(await style(id, prop), '17px');
      await input('[data-dm-gap-mode="' + field + '"]', 'auto'); assert.equal(await style(id, distribution), 'space-between');
      const readonly = (await snap('[data-dm-gap-readonly="' + prop + '"]'))[0]; assert(readonly); assert(Number.isFinite(Number(readonly.text)));
      const measured = await h.content(({id, field}) => {const r=[...document.getElementById(id).children].map(e=>e.getBoundingClientRect());return field==='col'?r[1].left-r[0].right:r[2].top-r[0].bottom;}, {id, field});
      assert(Math.abs(Number(readonly.text) - measured) <= 2, 'Read-only gap matches geometry');
      await input('[data-dm-gap-mode="' + field + '"]', 'fixed'); assert.equal((await snap('[data-dm-gap-readonly="' + prop + '"]')).length, 0);
      await edit(prop, 19); assert.equal(await style(id, prop), '19px'); evidence.push({id, readonly, measured});
    }
    await fresh('authored-auto', 'auto'); assert.equal((await snap('[data-dm-gap-mode="col"]'))[0].value, 'auto'); return evidence;
  });
  await test('3.9b', async () => {
    await fresh('gap-alignment', 'layout'); await section('layout'); await click('[data-dm-children-align="center-center"]');
    const before = await styles('layout', ['justifyContent', 'alignItems']);
    await input('[data-dm-gap-mode="col"]', 'auto'); assert.equal((await snap('[data-dm-children-align][data-active="true"]')).length, 0);
    await input('[data-dm-gap-mode="col"]', 'fixed'); assert.deepEqual(await styles('layout', ['justifyContent', 'alignItems']), before);
    assert.equal((await snap('[data-dm-children-align="center-center"]'))[0].attributes['data-active'], 'true'); return before;
  });
  await test('3.10', async () => {
    await fresh('position'); await advanced('position');
    const top = () => h.content(() => document.getElementById('plain').getBoundingClientRect().top);
    const before = await top(); await choose('position', 'relative'); await edit('top', 10);
    assert.equal(await style('plain', 'position'), 'relative'); assert.equal(await style('plain', 'top'), '10px'); assert.equal(await top() - before, 10);
    return {before, after: await top()};
  });
  await test('3.14', async () => {
    await fresh('curve', 'motion'); await advanced('motion'); await edit('transitionDuration', '0.4');
    await click('[data-dm-viz-open="transition"]'); await click('[data-dm-viz-mode="ease"]');
    for (const [p, v] of [['bezX1', 0.15], ['bezY1', 0.35], ['bezX2', 0.65], ['bezY2', 0.85]]) await input('[data-dm-viz-param="' + p + '"]', v);
    await h.action('apply-viz'); assert.match(await style('motion', 'transitionTimingFunction'), /cubic-bezier\(0.15, 0.35, 0.65, 0.85\)/);
    if (!(await snap('[data-dm-viz]')).length) await click('[data-dm-viz-open="transition"]');
    await click('[data-dm-viz-mode="spring"]');
    for (const [p, v] of [['sprStiffness', 180], ['sprDamping', 18], ['sprMass', 2]]) { await input('[data-dm-viz-param="' + p + '"]', v); assert.equal(Number((await snap('[data-dm-viz-param="' + p + '"]'))[0].value), v); }
    const spring = await snap('[data-dm-viz]'); assert.equal((await snap('[data-dm-viz-param^="bez"]')).length, 0); await h.action('close-viz'); return spring;
  });
  await test('3.15', async () => {
    await fresh('hover', 'motion'); await hover('parking'); await motion('hover');
    assert.equal((await snap('[data-dm-prop="__motion_hover__opacity"]')).length, 1);
    assert((await snap('[data-dm-section-body="dm-sec-motion"]'))[0].text.includes('Curve'));
    const before = await style('motion', 'opacity'); await hover('motion'); const during = await style('motion', 'opacity'); assert(Number(during) < Number(before));
    await hover('parking'); assert.equal(await style('motion', 'opacity'), before); return {before, during};
  });
  await test('3.16', async () => {
    await fresh('preview', 'motion'); await hover('parking'); await motion('hover');
    const button = '[data-dm-motion-preview="hover"]'; await click(button);
    assert.equal((await snap(button))[0].attributes['data-active'], 'true'); assert.equal((await snap(button))[0].attributes.title, 'Stop previewing');
    assert.equal((await snap(button+' svg circle[r="10"]')).length,1); assert.equal((await snap(button+' svg line')).length,2);
    assert(await h.content(() => document.getElementById('motion').classList.contains('dm-force-hover')));
    assert(Number(await style('motion', 'opacity')) < 1); await click(button);
    assert.equal((await snap(button))[0].attributes['data-active'], 'false');
    assert.equal(await h.content(() => document.getElementById('motion').classList.contains('dm-force-hover')), false);
    assert.equal(await style('motion', 'opacity'), '1'); return {startedAndStopped: true};
  });
  await test('3.17', async row => {
    await fresh('lift', 'motion'); await hover('parking'); await motion('hover'); await click('[data-dm-motion-add-change="hover:lift"]');
    assert.equal((await snap('[data-dm-prop="__motion_hover__translate"]')).length, 1);
    const y = () => h.content(() => document.getElementById('motion').getBoundingClientRect().y);
    const before = await y(); const beforeHover=await h.content(()=>[...document.querySelectorAll(':hover')].map(e=>e.id)); await hover('motion'); const lifted = await y();
    row.observed={before,lifted,beforeHover,afterHover:await h.content(()=>[...document.querySelectorAll(':hover')].map(e=>e.id)),styles:await styles('motion',['translate','transform','opacity']),changes:await changes()};
    assert(lifted < before); await hover('parking'); assert(Math.abs(await y() - before) < 0.1); return {before, lifted};
  });
  await test('3.18', async () => {
    await fresh('appear', 'motion'); await motion('appear');
    assert.equal((await snap('[data-dm-prop="__motion_appear__opacity"]')).length, 1);
    await h.content(() => {
      const e = document.getElementById('motion');
      window.__breadthAppear = {removed: false, added: false, frames: [], node: e};
      window.__breadthObserver = new MutationObserver(ms => {
        for (const m of ms) {
          if ([...m.removedNodes].includes(e)) window.__breadthAppear.removed = true;
          if ([...m.addedNodes].includes(e)) window.__breadthAppear.added = true;
        }
      });
      window.__breadthObserver.observe(e.parentNode, {childList: true});
      const start = performance.now();
      const frame = () => {
        window.__breadthAppear.frames.push(Number(getComputedStyle(e).opacity));
        if (performance.now() - start < 1000) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    await click('[data-dm-motion-preview="appear"]'); await h.wait(750);
    const replay = await h.content(() => {
      window.__breadthObserver.disconnect();
      const {node, ...observed} = window.__breadthAppear;
      return {...observed, sameNode: node === document.getElementById('motion')};
    });
    assert(replay.removed && replay.added && replay.sameNode, 'Same target remounts');
    assert(replay.frames.some(x => x <= 0.1), 'Seeded start state');
    assert(replay.frames.some(x => x > 0.1 && x < 0.95), 'Intermediate animation state');
    assert.equal(replay.frames.at(-1), 1);
    assert.notEqual(await style('motion', 'display'), 'none');
    const c = await changes(); assert(c.styleChanges.some(x => x.state === '@starting' && x.property === 'opacity'));
    return {replay, changes: c};
  });
  await test('3.19', async row => {
    await fresh('loop', 'motion'); await motion('loop'); await choose('animationName', 'dm-pulse');
    assert.equal(await style('motion', 'animationIterationCount'), 'infinite');
    const sample = () => h.content(() => document.getElementById('motion').getAnimations().map(a => ({name: a.animationName, time: a.currentTime, state: a.playState, frames: a.effect.getKeyframes()})));
    const first = await sample(); assert(first.some(a => a.name === 'dm-pulse' && a.state === 'running')); await h.wait(1100);
    const later = await sample(); assert(later[0].time > first[0].time); assert(later[0].frames.length > 1);
    await h.content(() => { window.__animationMutations=[]; window.__animationObserver=new MutationObserver(ms=>{for(const m of ms) window.__animationMutations.push({id:m.target.id,old:m.oldValue,current:m.target.getAttribute('style')});});window.__animationObserver.observe(document.body,{attributes:true,attributeFilter:['style'],attributeOldValue:true,subtree:true}); });
    await click('[data-dm-motion-preview="loop"]'); const restarted = await sample();
    row.observed={first,later,restarted,state:await h.send('SP_GET_STATE'),mutations:await h.content(()=>{window.__animationObserver.disconnect();return window.__animationMutations;})};
    assert(restarted[0].time < later[0].time);
    return {first, later, restarted};
  });
  await test('3.20', async row => {
    await fresh('scroll', 'scroll'); await motion('scroll'); const c = await changes();
    assert(c.styleChanges.some(x => x.property === 'animationTimeline' && x.newValue === 'view()'));
    const supported = await h.content(() => CSS.supports('animation-timeline', 'view()'));
    if (!supported) { row.remaining = 'This browser does not support view() timelines; only the recorded scroll-animation intent is certified.'; return {supported, changes: c}; }
    assert.equal(await style('scroll', 'animationTimeline'), 'view()');
    const at = fraction => h.content(fraction => { const e = document.getElementById('scroll'); const y=e.getBoundingClientRect().top+scrollY; window.scrollTo(0,y-innerHeight*fraction); return true; }, fraction);
    await at(0.95); await h.wait(300); const before = await style('scroll', 'opacity');
    await at(0.4); await h.wait(300); const after = await style('scroll', 'opacity'); assert(Number(after) > Number(before)); return {supported, before, after};
  });
  await test('3.23a', async row => {
    await fresh('corner-shape', 'radius'); await section('appearance'); await click('[data-dm-corner-shape-trigger]');
    const options = await snap('[data-dm-corner-shape]'); assert.deepEqual(options.map(x => x.attributes.title), ['round', 'squircle', 'square', 'bevel', 'scoop', 'notch']);
    for (const option of options) { assert.equal(option.text.trim(), ''); assert(option.html.includes('aria-hidden="true"')); assert(option.html.includes('border:1.5px solid currentColor')); }
    assert.match(options[0].attributes.style, /background:var\(--dm-bg-active\)/);
    await h.panel(A.scrollSelector,'[data-dm-corner-shape-popover]');
    const geometry = await h.panel(A.inspectGeometry, '[data-dm-corner-shape]');
    row.observed={options,geometry}; await h.screenshot('corner-shape');
    assert(geometry.every(x => x.rect.height > 0 && x.rect.right <= x.viewport.width));
    await click('[data-dm-corner-shape="squircle"]'); assert.equal((await snap('[data-dm-corner-shape-popover]')).length, 0);
    const supported = await h.content(() => CSS.supports('corner-shape', 'squircle'));
    if (supported) assert.match(await style('radius', 'cornerShape'), /squircle|superellipse\(2\)/);
    else row.remaining += ' This browser cannot render corner-shape.';
    assert((await changes()).styleChanges.some(x => x.property === 'cornerShape' && x.newValue === 'squircle'));
    return {options, geometry, supported};
  }, 'Six-option UI, geometry, computed shape and change intent asserted. Painted corner shape, Appearance grouping in Changes, CSS export, reselected trigger, and outside-click dismissal remain unasserted.');
  await test('3.24', async () => {
    await fresh('mixed-radius', 'radius'); await corners();
    for (let i = 0; i < radiusProps.length; i++) await edit(radiusProps[i], 3 + i * 3);
    await click('[data-dm-corner-expand]'); assert.equal((await snap('input[data-dm-prop="borderRadius"]'))[0].attributes.placeholder, 'Mixed');
    await edit('borderRadius', 15); assert.deepEqual(Object.values(await styles('radius', radiusProps)), ['15px', '15px', '15px', '15px']);
    await corners(); for (const p of radiusProps) assert.equal(Number((await snap('input[data-dm-prop="' + p + '"]'))[0].value), 15);
    assert((await changes()).styleChanges.some(c=>c.property==='borderRadius'&&c.newValue==='15px'));
    return {corners: await styles('radius', radiusProps), changes: await changes()};
  });
  await test('3.25', async () => {
    await fresh('guide-gating'); await section('layout-guide'); await click('[data-dm-guide-add]');
    assert.equal((await snap('[data-dm-guide-toggle]')).length, 1); assert.equal((await snap('[data-dm-guide-section-toggle]')).length, 0);
    await click('[data-dm-guide-add]'); assert.equal((await snap('[data-dm-guide-toggle]')).length, 2);
    assert.equal((await snap('[data-dm-toggle-section="dm-sec-layout-guide"] [data-dm-guide-section-toggle]')).length, 1);
    return snap('[data-dm-guide-row], [data-dm-guide-section-toggle]');
  });
  await test('3.26', async () => {
    await fresh('guide-parent-child'); await section('layout-guide');
    while ((await snap('[data-dm-guide-remove]')).length) await click('[data-dm-guide-remove]');
    await click('[data-dm-guide-add]'); await click('[data-dm-guide-add]');
    await choose('__guide_kind__0', 'columns'); await choose('__guide_kind__1', 'rows'); const both = await guideImage(); assert.notEqual(both, 'none');
    await click('[data-dm-guide-section-toggle]'); assert.equal(await guideImage(), 'none');
    const eyes = await snap('[data-dm-guide-toggle]'); for (const e of eyes) {assert.match(e.attributes.style, /opacity:0.4/); assert.equal(e.attributes['data-active'], 'true');}
    await click('[data-dm-guide-toggle="0"]'); assert.equal((await snap('[data-dm-guide-toggle="0"]'))[0].attributes['data-active'], 'false'); assert.equal(await guideImage(), 'none');
    await click('[data-dm-guide-section-toggle]'); const onlyRows = await guideImage(); assert.notEqual(onlyRows, 'none'); assert.notEqual(onlyRows, both);
    await click('[data-dm-guide-toggle="1"]'); assert.equal(await guideImage(), 'none');
    assert.equal((await changes()).styleChanges.length, 0); return {both, eyes, onlyRows};
  });
  await test('3.27', async () => {
    await fresh('guide-picker'); await section('layout-guide'); await click('[data-dm-guide-add]');
    if ((await snap('[data-dm-guide-expand="0"]'))[0].attributes['data-active'] !== 'true') await click('[data-dm-guide-expand="0"]');
    await click('[data-dm-color-trigger="__guide_color__0"]'); const root = '[data-dm-guide-row="0"]';
    for (const attr of ['color-hex', 'color-sv', 'color-hue']) assert.equal((await snap(root + ' [data-dm-' + attr + '="__guide_color__0"]')).length, 1);
    assert.equal((await snap(root + ' [data-dm-cycle-color-format]')).length, 1);
    assert.equal((await snap(root + ' [data-dm-eyedropper]')).length, h.driver ? 0 : 1);
    assert.equal((await snap(root + ' [data-dm-color-advanced], ' + root + ' [data-dm-pick-color]')).length, 0);
    const body = (await snap(root))[0]; assert.doesNotMatch(body.text, /WCAG|Site Colors|Site colours|contrast ratio/i);
    const before = await guideImage(); await input('[data-dm-color-hex="__guide_color__0"]', '00ff00'); const after = await guideImage(); assert.notEqual(after, before); return {body, before, after};
  });
  await test('3.28', async () => {
    const evidence = [];
    for (const id of ['layout', 'grid']) {
      await fresh('computed-overlay-' + id, id); await section('layout'); const before = await changes();
      await h.action('toggle-computed-layout-overlay');
      const overlay = await h.content(() => {const e=document.getElementById('dm-computed-layout');return e && {html:e.outerHTML, rect:e.getBoundingClientRect().toJSON()};});
      assert(overlay); assert(overlay.html.includes('div')); assert(overlay.rect.width > 0);
      const geometry=await h.content(id=>({target:document.getElementById(id).getBoundingClientRect().toJSON(),children:[...document.getElementById(id).children].map(e=>e.getBoundingClientRect().toJSON()),bands:[...document.querySelector('#dm-computed-layout').children].map(e=>e.getBoundingClientRect().toJSON())}),id);
      for(const key of ['x','y','width','height']) assert.equal(overlay.rect[key],geometry.target[key]);
      const itemBands=geometry.bands.slice(-geometry.children.length);
      for(let i=0;i<itemBands.length;i++)for(const key of ['x','y','width','height'])assert(Math.abs(itemBands[i][key]-geometry.children[i][key])<0.1);
      assert.equal(geometry.bands.length,geometry.children.length+(id==='grid'?4:0));
      if(id==='grid'){assert.equal(geometry.bands[0].width,70);assert.equal(geometry.bands[1].width,70);assert.equal(geometry.bands[2].height,35);assert.equal(geometry.bands[3].height,35);}
      assert.deepEqual(await changes(), before); await h.action('toggle-computed-layout-overlay'); assert.equal(await h.content(() => !!document.getElementById('dm-computed-layout')), false);
      await h.action('toggle-computed-layout-overlay'); await h.send('SP_DESELECT'); await h.wait(400);
      assert.equal(await h.content(() => !!document.getElementById('dm-computed-layout')), false);
      await h.select(id); await section('layout'); await h.action('toggle-computed-layout-overlay');
      assert(await h.content(() => !!document.getElementById('dm-computed-layout')));
      const disabled = await h.send('SP_TOGGLE_DESIGN_MODE');
      try {
        assert.equal(disabled.enabled, false); await h.wait(400);
        assert.equal(await h.content(() => !!document.getElementById('dm-computed-layout')), false);
      } finally { await h.send('SP_ACTIVATE'); await h.wait(400); }
      assert.deepEqual(await changes(), before); evidence.push({id, overlay, disabled});
    }
    return evidence;
  });
  await test('8.30', async () => {
    await fresh('numeric-token', 'radius'); await section('appearance'); await edit('borderRadius', 'var(--cds-spacing-05)');
    assert.deepEqual(Object.values(await styles('radius', radiusProps)), ['16px', '16px', '16px', '16px']);
    const c = await changes(); assert(c.styleChanges.some(x => x.property === 'borderRadius' && x.newValue === 'var(--cds-spacing-05)'));
    await h.panel(A.showChanges); await h.wait(400); assert((await snap('.dm-change-item')).some(x => x.text.includes('var(--cds-spacing-05)'))); return c;
  }, 'Verbatim numeric var value and full Changes text asserted through input/change/blur; the catalogue Enter-key submission is not exercised.');

  await test('fill-solid-layer-lifecycle', async () => {
    await fresh('fill-layer'); await section('fill'); const before = await style('plain', 'backgroundColor');
    await edit('__fill_color__0', '#ff0000'); assert.equal(await style('plain', 'backgroundColor'), 'rgb(255, 0, 0)');
    await click('[data-dm-fill-toggle="0"]'); assert.equal(await style('plain', 'backgroundColor'), 'rgba(0, 0, 0, 0)');
    await click('[data-dm-fill-toggle="0"]'); assert.equal(await style('plain', 'backgroundColor'), 'rgb(255, 0, 0)');
    await click('[data-dm-fill-remove="0"]'); assert.equal((await snap('[data-dm-fill-row]')).length, 0); assert.equal(await style('plain', 'backgroundColor'), 'rgba(0, 0, 0, 0)');
    await click('[data-dm-fill-add="solid"]'); assert.equal((await snap('[data-dm-fill-row]')).length, 1); return {before, changes: await changes()};
  }, '', supplemental);
  for (const [kind, prop, pattern] of [['inner-shadow', 'boxShadow', /inset/], ['layer-blur', 'filter', /blur\(4px\)/], ['backdrop-blur', 'backdropFilter', /blur\(/]]) {
    await test('effect-' + kind + '-lifecycle', async () => {
      await fresh(kind); await section('effects'); await click('[data-dm-effects-menu]'); await click('[data-dm-add-effect="' + kind + '"]');
      const actual = await style('plain', prop); assert.match(actual, pattern);
      const toggles = await snap('[data-dm-effect-toggle]'); assert.equal(toggles.length, 1);
      await click('[data-dm-effect-toggle]'); assert.equal(await style('plain', prop), 'none'); await click('[data-dm-effect-toggle]'); assert.equal(await style('plain', prop), actual);
      await click('[data-dm-effect-remove]'); assert.equal(await style('plain', prop), 'none'); assert.equal((await snap('[data-dm-effect-remove]')).length, 0); return {actual, changes: await changes()};
    }, '', supplemental);
  }
  await test('effect-hidden-chain-removal', async () => {
    await fresh('effect-hidden-chain'); await section('effects');
    for (let i=0;i<2;i++) { await click('[data-dm-effects-menu]'); await click('[data-dm-add-effect="drop-shadow"]'); }
    assert.equal((await snap('[data-dm-effect-toggle]')).length,2);
    await click('[data-dm-effect-toggle="1"]'); const single=await style('plain','boxShadow');
    await click('[data-dm-effect-remove="0"]'); assert.equal(await style('plain','boxShadow'),'none');
    assert.equal((await snap('[data-dm-effect-toggle]')).length,1);
    await click('[data-dm-effect-toggle="0"]'); assert.equal(await style('plain','boxShadow'),single);
    await click('[data-dm-effect-toggle="0"]'); await click('[data-dm-effect-remove="0"]');
    assert.equal(await style('plain','boxShadow'),'none'); assert.equal((await snap('[data-dm-effect-toggle]')).length,0);
    return {single,removedHiddenAndVisible:true};
  }, '', supplemental);
  save();
  if ([...rows, ...supplemental].some(r => r.status === 'fail')) throw Error('Design control breadth certification failed; see rows.json');
};
