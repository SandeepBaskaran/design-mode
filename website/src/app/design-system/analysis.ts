import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export type ComponentFile = {
  id: string;
  file: string;
  exports: string[];
  client: boolean;
  usedBy: string[];
  routes: string[];
  marked: string[];
};

export type InlineSection = { tag: string; label: string | null; line: number };

export type OutlineItem =
  | { kind: "component"; name: string; id: string; line: number; marked: boolean }
  | ({ kind: "inline" } & InlineSection);

export type PageInfo = {
  route: string;
  file: string;
  isLayout: boolean;
  components: { id: string; names: string[] }[];
  inline: InlineSection[];
  outline: OutlineItem[];
};

const SRC = join(process.cwd(), "src");
const COMPONENTS = join(SRC, "components");
const APP = join(SRC, "app");
const IMPORT_RE = /^import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+["']@\/components\/([^"']+)["']/gm;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

function importsOf(source: string) {
  const out: { id: string; names: string[] }[] = [];
  for (const m of source.matchAll(IMPORT_RE)) {
    const names = m[1]
      .split(",")
      .map((n) => n.replace(/^\s*type\s+/, "").split(" as ")[0].trim())
      .filter((n) => /^[A-Z]/.test(n));
    if (names.length) out.push({ id: m[2], names });
  }
  return out;
}

function inlineSections(source: string): InlineSection[] {
  const ret = source.indexOf("return (");
  if (ret < 0) return [];
  const body = source.slice(ret);
  const offset = source.slice(0, ret).split("\n").length - 1;
  const found: InlineSection[] = [];
  for (const m of body.matchAll(/<(section|article|aside)\b[^>]*>/g)) {
    const label = /data-ds-inline="([^"]+)"/.exec(m[0]);
    found.push({
      tag: m[1],
      label: label ? label[1] : null,
      line: offset + body.slice(0, m.index!).split("\n").length,
    });
  }
  return found;
}

function outlineOf(
  source: string,
  imports: { id: string; names: string[] }[],
  inline: InlineSection[],
  marked: Set<string>,
): OutlineItem[] {
  const ret = source.indexOf("return (");
  if (ret < 0) return [];
  const offset = source.slice(0, ret).split("\n").length - 1;
  const body = source.slice(ret);
  const idOf = new Map(imports.flatMap((i) => i.names.map((n) => [n, i.id] as const)));
  const items: OutlineItem[] = [];
  for (const m of body.matchAll(/<([A-Z]\w*)\b/g)) {
    const id = idOf.get(m[1]);
    if (id)
      items.push({
        kind: "component",
        name: m[1],
        id,
        line: offset + body.slice(0, m.index!).split("\n").length,
        marked: marked.has(m[1]),
      });
  }
  items.push(...inline.map((s) => ({ kind: "inline" as const, ...s })));
  return items.sort((a, b) => a.line - b.line);
}

function routeOf(file: string) {
  const dir = relative(APP, file).replace(/\/?page\.tsx$/, "");
  return "/" + dir;
}

function layoutLabel(file: string) {
  const dir = relative(APP, file).replace(/\/?layout\.tsx$/, "");
  return dir ? `/${dir}/* (layout)` : "Every page (layout)";
}

export function analyze() {
  const files = walk(SRC);
  const sources = new Map(files.map((f) => [f, readFileSync(f, "utf8")]));

  const components: ComponentFile[] = walk(COMPONENTS)
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => {
      const src = sources.get(f)!;
      const declared = [...src.matchAll(/^export (?:const|function) ([A-Z]\w*)/gm)].map((m) => m[1]);
      const listed = [...src.matchAll(/^export \{([^}]*)\}/gm)]
        .flatMap((m) => m[1].split(","))
        .map((n) => n.trim())
        .filter((n) => /^[A-Z]\w*$/.test(n));
      const exports = [...declared, ...listed];
      return {
        id: relative(COMPONENTS, f).replace(/\.tsx$/, ""),
        file: relative(process.cwd(), f),
        exports: [...new Set(exports)],
        client: /^["']use client["']/.test(src.trimStart()),
        usedBy: [],
        routes: [],
        marked: [
          ...new Set([
            ...[...src.matchAll(/data-ds="(\w+)"/g)].map((m) => m[1]),
            ...[...src.matchAll(/\$\{outer\} (\w+)/g)].map((m) => m[1]),
          ]),
        ].filter((n) => exports.includes(n)),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  const byId = new Map(components.map((c) => [c.id, c]));
  for (const [file, src] of sources) {
    if (file.includes(`${join("app", "design-system")}`)) continue;
    const who = file.startsWith(APP) ? (file.endsWith("page.tsx") ? routeOf(file) : relative(SRC, file)) : relative(COMPONENTS, file).replace(/\.tsx?$/, "");
    for (const imp of importsOf(src)) {
      const target = byId.get(imp.id);
      if (target && !target.usedBy.includes(who)) target.usedBy.push(who);
    }
  }

  const importers = new Map<string, string[]>();
  for (const [file, src] of sources) {
    if (file.includes(join("app", "design-system"))) continue;
    for (const imp of importsOf(src)) {
      importers.set(imp.id, [...(importers.get(imp.id) ?? []), file]);
    }
  }
  const routesOf = (id: string, seen = new Set<string>()): string[] => {
    if (seen.has(id)) return [];
    seen.add(id);
    return (importers.get(id) ?? []).flatMap((file) => {
      if (file.startsWith(APP)) return [file.endsWith("layout.tsx") ? layoutLabel(file) : routeOf(file)];
      return routesOf(relative(COMPONENTS, file).replace(/\.tsx?$/, ""), seen);
    });
  };
  for (const c of components) c.routes = [...new Set(routesOf(c.id))].sort();
  const markedNames = new Set(components.flatMap((c) => c.marked));

  const pageFiles = files.filter((f) => f.startsWith(APP) && /(page|layout)\.tsx$/.test(f) && !f.includes(join("app", "design-system")));
  const pages: PageInfo[] = pageFiles
    .map((f) => {
      const src = sources.get(f)!;
      const components = importsOf(src).filter((i) => byId.has(i.id));
      const inline = inlineSections(src);
      return {
        route: f.endsWith("layout.tsx") ? layoutLabel(f) : routeOf(f),
        file: relative(process.cwd(), f),
        isLayout: f.endsWith("layout.tsx"),
        components,
        inline,
        outline: outlineOf(src, components, inline, markedNames),
      };
    })
    .sort((a, b) => (a.route.startsWith("Every") ? -1 : b.route.startsWith("Every") ? 1 : a.route.localeCompare(b.route)));

  return { components, pages };
}
