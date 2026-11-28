import { Check, X } from "lucide-react";

export function BrowserParityDiagram() {
  const rows = [
    {
      feature: "Install source",
      chromium: "Chrome Web Store",
      firefox: "Firefox Add-ons (AMO)",
      safari: "GitHub Release zip (manual)",
    },
    {
      feature: "Editor surface",
      chromium: "Side panel, floating window, PiP",
      firefox: "Native docked sidebar",
      safari: "Web Inspector Design Mode tab",
    },
    {
      feature: "Open shortcut",
      chromium: "Alt+D",
      firefox: "Alt+D",
      safari: "Option–Command–I (Web Inspector)",
    },
    {
      feature: "Core editing, Changes & MCP",
      chromium: true,
      firefox: true,
      safari: true,
    },
    {
      feature: "Pop-out floating window",
      chromium: true,
      firefox: false,
      safari: false,
    },
    {
      feature: "Picture-in-Picture (Pin on top)",
      chromium: true,
      firefox: false,
      safari: false,
    },
    {
      feature: "Screen eyedropper (Pick button)",
      chromium: true,
      firefox: false,
      safari: false,
    },
  ];

  const renderCell = (value: string | boolean) => {
    if (value === true) {
      return (
        <span className="inline-flex items-center gap-1.5">
          <Check aria-hidden="true" className="text-primary size-4 shrink-0" />
          <span>Included</span>
        </span>
      );
    }
    if (value === false) {
      return (
        <span className="text-muted-foreground inline-flex items-center gap-1.5">
          <X aria-hidden="true" className="size-4 shrink-0" />
          <span>Unavailable</span>
        </span>
      );
    }
    return <span>{value}</span>;
  };

  return (
    <div className="my-6 overflow-x-auto rounded-xl border">
      <table className="w-full border-collapse text-left text-base">
        <caption className="sr-only">
          Design Mode browser feature parity across Chromium, Firefox, and Safari
        </caption>
        <thead>
          <tr className="bg-muted/50 border-b">
            <th scope="col" className="p-4 font-semibold">
              Capability
            </th>
            <th scope="col" className="p-4 font-semibold">
              Chrome / Edge / Brave / Arc
            </th>
            <th scope="col" className="p-4 font-semibold">
              Firefox 140+
            </th>
            <th scope="col" className="p-4 font-semibold">
              Safari (Mac)
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.feature} className="border-b last:border-b-0">
              <th scope="row" className="p-4 font-medium">
                {row.feature}
              </th>
              <td className="p-4">{renderCell(row.chromium)}</td>
              <td className="p-4">{renderCell(row.firefox)}</td>
              <td className="p-4">{renderCell(row.safari)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KeyCap({ children }: { children: string }) {
  return (
    <kbd className="bg-muted text-foreground inline-flex min-w-7 items-center justify-center rounded-md border border-b-2 px-2 py-0.5 font-mono text-base font-semibold">
      {children}
    </kbd>
  );
}

function ShortcutRow({ keys, label }: { keys: string[]; label: string }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2">
      <span className="text-foreground text-base">{label}</span>
      <span className="inline-flex flex-wrap items-center gap-1">
        {keys.map((k, index) => (
          <span key={`${k}-${index}`} className="inline-flex items-center gap-1">
            {index > 0 && <span className="text-muted-foreground text-base">+</span>}
            <KeyCap>{k}</KeyCap>
          </span>
        ))}
      </span>
    </li>
  );
}

export function KeyboardShortcutsDiagram() {
  const groups = [
    {
      title: "Browser commands (remappable)",
      note: "Rebind at chrome://extensions/shortcuts or about:addons › Manage Extension Shortcuts.",
      items: [
        { label: "Toggle Design Mode (Chrome & Firefox)", keys: ["Alt", "D"] },
        { label: "Take screenshot", keys: ["Alt", "Shift", "S"] },
      ],
    },
    {
      title: "Inspect & panels (read-only)",
      note: "Active while the side panel is open.",
      items: [
        { label: "Toggle Inspect", keys: ["Alt", "I"] },
        { label: "Layers tab", keys: ["Alt", "1"] },
        { label: "Design tab", keys: ["Alt", "2"] },
        { label: "Changes tab", keys: ["Alt", "3"] },
      ],
    },
    {
      title: "Comments & motion (read-only)",
      note: "Works directly on the page.",
      items: [
        { label: "Drop comment pin", keys: ["Alt", "C"] },
        { label: "Region comment box", keys: ["Alt", "R"] },
        { label: "Pause / resume motion", keys: ["Alt", "P"] },
      ],
    },
    {
      title: "Editing & export (read-only)",
      note: "On Mac, Undo / Redo use Cmd.",
      items: [
        { label: "Deselect element", keys: ["Esc"] },
        { label: "Delete selected element", keys: ["Delete"] },
        { label: "Undo change", keys: ["Cmd/Ctrl", "Z"] },
        { label: "Redo change", keys: ["Cmd/Ctrl", "Shift", "Z"] },
        { label: "Copy exported CSS", keys: ["Alt", "X"] },
      ],
    },
  ];

  return (
    <div className="my-6 grid gap-4 md:grid-cols-2" aria-label="Keyboard shortcuts cheat sheet">
      {groups.map((group) => (
        <div key={group.title} className="bg-card rounded-xl border p-5">
          <h3 className="text-foreground text-xl font-semibold">{group.title}</h3>
          <p className="text-muted-foreground mt-1 text-base break-words">{group.note}</p>
          <ul className="mt-4 divide-y">{group.items.map((item) => (
            <ShortcutRow key={item.label} label={item.label} keys={item.keys} />
          ))}</ul>
        </div>
      ))}
    </div>
  );
}
