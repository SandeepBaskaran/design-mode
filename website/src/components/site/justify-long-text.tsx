"use client";

import { useEffect } from "react";

import { usePathname } from "next/navigation";

// Applies text-justify to paragraphs and list items inside #main-content
// whenever their rendered height exceeds two lines.
export function JustifyLongText() {
  const pathname = usePathname();

  useEffect(() => {
    const main = document.getElementById("main-content");
    if (!main) return;

    let frameId = 0;

    const update = () => {
      const nodes = main.querySelectorAll<HTMLElement>("p, li");
      for (const el of nodes) {
        if (
          el.closest("nav, table, pre, code, button, [role='tablist']") ||
          (el.tagName === "LI" && el.querySelector("p, ul, ol"))
        ) {
          continue;
        }

        const style = window.getComputedStyle(el);
        if (style.textAlign === "center" || style.textAlign === "right") {
          if (el.dataset.dmJustified === "true") {
            el.style.textAlign = "";
            delete el.dataset.dmJustified;
          }
          continue;
        }

        const fontSize = parseFloat(style.fontSize) || 16;
        const parsedLineHeight = parseFloat(style.lineHeight);
        const lineHeight = Number.isFinite(parsedLineHeight)
          ? parsedLineHeight
          : fontSize * 1.5;

        const height = el.getBoundingClientRect().height;
        if (height > lineHeight * 2.2) {
          el.style.textAlign = "justify";
          el.dataset.dmJustified = "true";
        } else if (el.dataset.dmJustified === "true") {
          el.style.textAlign = "";
          delete el.dataset.dmJustified;
        }
      }
    };

    const schedule = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(update);
    };

    schedule();
    document.fonts?.ready?.then(schedule);
    window.addEventListener("resize", schedule);

    const observer = new MutationObserver(schedule);
    observer.observe(main, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", schedule);
      observer.disconnect();
    };
  }, [pathname]);

  return null;
}
