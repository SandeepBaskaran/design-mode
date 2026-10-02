// Hidden entries belong to an element, not to the currently focused inspector.
// Rebase only their positions when a visible CSS chain changes length.
export function rebaseHiddenEffectValue(saved: string, property: string, beforeValue: string, afterValue: string): string {
  const patterns: Record<string, RegExp> = {
    boxShadow: /^box:\d+$/, filter: /^(filter-drop|layer-blur):\d+$/,
    backdropFilter: /^backdrop-blur:\d+$/, textShadow: /^text-shadow$/,
  };
  const pattern = patterns[property];
  if (!pattern) return saved;
  const split = (value: string): string[] => {
    if (!value || value === 'none') return [];
    const result: string[] = []; let depth = 0, start = 0;
    for (let i = 0; i < value.length; i++) {
      if (value[i] === '(') depth++;
      else if (value[i] === ')') depth--;
      const boundary = property === 'boxShadow' || property === 'textShadow' ? value[i] === ',' : /\s/.test(value[i]);
      if (depth === 0 && boundary) { if (value.slice(start,i).trim()) result.push(value.slice(start,i).trim()); start = i + 1; }
    }
    if (value.slice(start).trim()) result.push(value.slice(start).trim());
    return result;
  };
  const before = split(beforeValue), after = split(afterValue);
  if (before.length === after.length) return saved;
  let entries: Array<{id: string; raw: string}>;
  try { entries = JSON.parse(saved); } catch { return saved; }
  if (!Array.isArray(entries)) return saved;
  const hidden = entries.filter(e => pattern.test(e.id)).sort((a,b) => Number(a.id.split(':')[1] || 0) - Number(b.id.split(':')[1] || 0));
  const used = new Set<number>();
  const positions = before.map(raw => {const i=after.findIndex((v,i)=>v===raw&&!used.has(i));if(i>=0)used.add(i);return i;});
  const rebased = hidden.map((entry,i) => {
    const boundary=Number(entry.id.split(':')[1] || 0)-i;
    let index=-1;
    for(let next=boundary;next<positions.length;next++) if(positions[next]>=0){index=positions[next];break;}
    if(index<0)for(let prev=boundary-1;prev>=0;prev--)if(positions[prev]>=0){index=positions[prev]+1;break;}
    return {entry,index:index<0?Math.min(boundary,after.length):index};
  }).sort((a,b)=>a.index-b.index);
  const ids=new Map(rebased.map(({entry,index},i)=>[entry.id,entry.id.replace(/:\d+$/, ':'+(index+i))]));
  return JSON.stringify(entries.map(entry=>({...entry,id:ids.get(entry.id) ?? entry.id})));
}
