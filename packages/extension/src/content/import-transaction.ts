// A synchronous DOM rollback journal retains original nodes (and listeners),
// not outerHTML clones. Import is rare; bound the journal before any write.
export function captureImportDomRollback(): () => void {
  const nodes: Array<{ node: Node; children: Node[]; value: string | null; attrs?: Array<[string, string]> }> = [];
  const visit = (node: Node) => {
    if (nodes.length >= 100_000) throw Error('Page too large for safe import');
    const children = Array.from(node.childNodes);
    nodes.push({ node, children, value: node.nodeValue,
      attrs: node instanceof Element ? Array.from(node.attributes, a => [a.name, a.value]) : undefined });
    children.forEach(visit);
  };
  visit(document);
  const sheets = Array.from(document.querySelectorAll('style')).map(el => {
    try { return { el, disabled: el.disabled, rules: Array.from(el.sheet?.cssRules || [], r => r.cssText) }; }
    catch { return { el, disabled: el.disabled, rules: null }; }
  });
  return () => {
    for (const { node, children, value, attrs } of nodes) {
      if (attrs && node instanceof Element) {
        const wanted = new Map(attrs);
        for (const a of Array.from(node.attributes)) if (!wanted.has(a.name)) node.removeAttribute(a.name);
        for (const [name, val] of attrs) if (node.getAttribute(name) !== val) node.setAttribute(name, val);
      }
      if (node.nodeValue !== value) node.nodeValue = value;
      if (children.length !== node.childNodes.length || children.some((c, i) => c !== node.childNodes[i])) {
        while (node.firstChild) node.removeChild(node.firstChild);
        for (const child of children) node.appendChild(child);
      }
    }
    for (const { el, disabled, rules } of sheets) {
      if (rules && el.sheet) {
        while (el.sheet.cssRules.length) el.sheet.deleteRule(0);
        for (const rule of rules) el.sheet.insertRule(rule, el.sheet.cssRules.length);
      }
      el.disabled = disabled;
    }
  };
}
