// Exercise the batch message boundary against the same ownership/undo contract
// as the installed UI single-property tests. Selection and hide/show remain UI.
const A = require('./panel-actions.cjs');
module.exports = h => require('./hidden-multiselect.cjs')({
  ...h,
  panel: async (fn, arg) => {
    if (fn !== A.editProperty || !['__effd_box_0_x','__effd_lblur_0_radius'].includes(arg?.prop)) return h.panel(fn,arg);
    const property = arg.prop === '__effd_box_0_x' ? 'boxShadow' : 'filter';
    const before = await h.content(property => getComputedStyle(document.querySelector('#move'))[property],property);
    const value = property === 'boxShadow' ? before.replace('11px','77px') : 'blur(9px)';
    const changes = [{property,value}];
    // Also prove an explicit focused stash is NOT copied to sibling targets.
    if (process.env.DM_BATCH_EXPLICIT_HIDDEN === '1') {
      const focusedId = await h.content(() => document.querySelector('#move').getAttribute('data-dm-id'));
      const stash = (await h.send('SP_GET_CHANGES')).styleChanges.find(c=>c.elementId===focusedId && c.property==='__effect_hidden');
      if (stash) changes.push({property:'__effect_hidden',value:stash.newValue});
    }
    return h.send('SP_APPLY_STYLES',{changes,groupLabel:'Effects batch regression'});
  },
});
