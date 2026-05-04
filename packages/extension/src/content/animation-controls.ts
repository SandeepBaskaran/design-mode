// ============================================================
// Phase 4: Animation & Motion Controls
// Freeze animations, spring editor, easing curve editor,
// transition mode toggle, live preview
// ============================================================

import type { SpringConfig, EasingConfig, AnimationState } from '@shared/types';

let frozen = false;
let originalRAF: typeof requestAnimationFrame;
let originalSetTimeout: typeof setTimeout;
let originalSetInterval: typeof setInterval;
let freezeStyleEl: HTMLStyleElement | null = null;
let pausedVideos: HTMLVideoElement[] = [];
let pausedAnimations: Animation[] = [];

// Store originals on first load
originalRAF = window.requestAnimationFrame;
originalSetTimeout = window.setTimeout;
originalSetInterval = window.setInterval;

// ── Freeze All Animations ──

export function freezeAnimations(): void {
  if (frozen) return;
  frozen = true;

  // 1. CSS animations & transitions
  freezeStyleEl = document.createElement('style');
  freezeStyleEl.id = 'dm-freeze-animations';
  freezeStyleEl.textContent = `
    *, *::before, *::after {
      animation-play-state: paused !important;
      transition-duration: 0s !important;
      transition-delay: 0s !important;
    }
  `;
  document.head.appendChild(freezeStyleEl);

  // 2. Web Animations API
  try {
    const allAnimations = document.getAnimations();
    for (const anim of allAnimations) {
      if (anim.playState === 'running') {
        anim.pause();
        pausedAnimations.push(anim);
      }
    }
  } catch {}

  // 3. Videos
  const videos = document.querySelectorAll('video');
  for (const v of videos) {
    if (!v.paused) {
      v.pause();
      pausedVideos.push(v);
    }
  }

  // 4. Monkey-patch rAF, setTimeout, setInterval
  (window as any).__dm_origRAF = originalRAF;
  (window as any).__dm_origSetTimeout = originalSetTimeout;
  (window as any).__dm_origSetInterval = originalSetInterval;

  // Block new animation frames (but keep our own bypass)
  window.requestAnimationFrame = (cb: FrameRequestCallback) => {
    // Queue but don't execute - animations frozen
    return 0;
  };
}

export function unfreezeAnimations(): void {
  if (!frozen) return;
  frozen = false;

  // 1. Remove CSS freeze
  if (freezeStyleEl) {
    freezeStyleEl.remove();
    freezeStyleEl = null;
  }

  // 2. Resume WAAPI animations
  for (const anim of pausedAnimations) {
    try { anim.play(); } catch {}
  }
  pausedAnimations = [];

  // 3. Resume videos
  for (const v of pausedVideos) {
    try { v.play(); } catch {}
  }
  pausedVideos = [];

  // 4. Restore rAF
  window.requestAnimationFrame = originalRAF;
}

export function isFrozen(): boolean { return frozen; }

export function toggleFreeze(): boolean {
  if (frozen) unfreezeAnimations();
  else freezeAnimations();
  return frozen;
}

// ── Get Animation State ──

export function getAnimationState(): AnimationState {
  const animations: AnimationState['animations'] = [];
  try {
    for (const anim of document.getAnimations()) {
      const effect = anim.effect as KeyframeEffect;
      const target = effect?.target as HTMLElement;
      if (!target) continue;
      const selector = target.id ? `#${target.id}` : target.tagName.toLowerCase();
      animations.push({
        element: selector,
        name: (anim as any).animationName || 'animation',
        state: anim.playState === 'running' ? 'running' : 'paused',
        duration: effect?.getTiming()?.duration?.toString() || '0',
        timing: effect?.getTiming()?.easing || 'linear',
      });
    }
  } catch {}
  return { frozen, animations };
}

// ── Spring Physics ──

export function springToCss(config: SpringConfig): string {
  // Convert spring parameters to a CSS cubic-bezier approximation
  const { stiffness, damping, mass } = config;
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));

  // Approximate cubic-bezier based on damping ratio
  let x1: number, y1: number, x2: number, y2: number;
  if (zeta < 1) {
    // Underdamped (bouncy)
    x1 = 0.2 + (1 - zeta) * 0.15;
    y1 = 1 + (1 - zeta) * 0.6;
    x2 = 0.1 + zeta * 0.3;
    y2 = 1;
  } else {
    // Overdamped
    x1 = 0.3 + (zeta - 1) * 0.1;
    y1 = 0;
    x2 = 0.7 - (zeta - 1) * 0.1;
    y2 = 1;
  }

  x1 = Math.max(0, Math.min(1, x1));
  y1 = Math.max(-2, Math.min(2, y1));
  x2 = Math.max(0, Math.min(1, x2));
  y2 = Math.max(-2, Math.min(2, y2));

  // Duration based on settling time
  const duration = Math.round((4 / (zeta * w0)) * 1000);

  return `cubic-bezier(${x1.toFixed(3)}, ${y1.toFixed(3)}, ${x2.toFixed(3)}, ${y2.toFixed(3)}) ${duration}ms`;
}

export function applySpring(elementId: string, config: SpringConfig, property: string = 'all'): void {
  const el = document.querySelector(`[data-dm-id="${elementId}"]`) as HTMLElement;
  if (!el) return;
  const css = springToCss(config);
  const [timing, duration] = css.split(' ');
  el.style.transitionProperty = property;
  el.style.transitionTimingFunction = timing;
  el.style.transitionDuration = duration;
}

// ── Easing Curve Editor ──

export function easingToCss(config: EasingConfig): string {
  if (config.type === 'cubic-bezier') {
    const [x1, y1, x2, y2] = config.values;
    return `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`;
  }
  if (config.type === 'steps') {
    return `steps(${config.values[0]}, ${config.values[1] ? 'end' : 'start'})`;
  }
  if (config.type === 'spring') {
    const springConf: SpringConfig = {
      stiffness: config.values[0] || 100,
      damping: config.values[1] || 10,
      mass: config.values[2] || 1,
      bounce: config.values[3] || 0,
      velocity: config.values[4] || 0,
    };
    return springToCss(springConf).split(' ')[0];
  }
  return 'ease';
}

export function applyEasing(elementId: string, config: EasingConfig): void {
  const el = document.querySelector(`[data-dm-id="${elementId}"]`) as HTMLElement;
  if (!el) return;
  el.style.transitionTimingFunction = easingToCss(config);
}

// ── Live Transition Preview ──

export function previewTransition(elementId: string, property: string, fromValue: string, toValue: string, duration: number = 500, easing: string = 'ease'): void {
  const el = document.querySelector(`[data-dm-id="${elementId}"]`) as HTMLElement;
  if (!el) return;

  // Set initial state
  el.style.transition = 'none';
  (el.style as any)[property] = fromValue;

  // Force reflow
  el.offsetHeight;

  // Animate
  el.style.transition = `${property} ${duration}ms ${easing}`;
  (el.style as any)[property] = toValue;
}

// ── Generate spring keyframes for WAAPI ──

export function generateSpringKeyframes(config: SpringConfig, property: string, from: number, to: number, steps: number = 60): Keyframe[] {
  const { stiffness, damping, mass } = config;
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  const wd = w0 * Math.sqrt(1 - zeta * zeta);
  const duration = 4 / (zeta * w0);

  const keyframes: Keyframe[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * duration;
    let value: number;
    if (zeta < 1) {
      value = to - (to - from) * Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + (zeta * w0 / wd) * Math.sin(wd * t));
    } else {
      const r1 = -w0 * (zeta + Math.sqrt(zeta * zeta - 1));
      const r2 = -w0 * (zeta - Math.sqrt(zeta * zeta - 1));
      value = to - (to - from) * ((r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r2 - r1));
    }
    keyframes.push({ [property]: value, offset: i / steps });
  }
  return keyframes;
}

// Use original rAF for our own code (bypasses freeze)
export function safeRAF(cb: FrameRequestCallback): number {
  return originalRAF.call(window, cb);
}
