// ============================================================
// Animation freeze — pause every CSS animation, transition, WAAPI
// animation, and <video> on the page so the user can inspect the
// in-between state. Toggled from the side-panel toolbar.
// ============================================================

import type { AnimationState } from '@shared/types';

let frozen = false;
let freezeStyleEl: HTMLStyleElement | null = null;
let pausedVideos: HTMLVideoElement[] = [];
let pausedAnimations: Animation[] = [];

export function freezeAnimations(): void {
  if (frozen) return;
  frozen = true;

  // 1. CSS animations + transitions: pause via a global stylesheet override.
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

  // 2. Web Animations API instances.
  try {
    for (const anim of document.getAnimations()) {
      if (anim.playState === 'running') {
        anim.pause();
        pausedAnimations.push(anim);
      }
    }
  } catch {}

  // 3. <video> elements.
  for (const v of Array.from(document.querySelectorAll('video'))) {
    if (!v.paused) {
      v.pause();
      pausedVideos.push(v);
    }
  }
}

export function unfreezeAnimations(): void {
  if (!frozen) return;
  frozen = false;

  if (freezeStyleEl) {
    freezeStyleEl.remove();
    freezeStyleEl = null;
  }

  for (const anim of pausedAnimations) {
    try { anim.play(); } catch {}
  }
  pausedAnimations = [];

  for (const v of pausedVideos) {
    try { v.play(); } catch {}
  }
  pausedVideos = [];
}

export function isFrozen(): boolean { return frozen; }

export function toggleFreeze(): boolean {
  if (frozen) unfreezeAnimations();
  else freezeAnimations();
  return frozen;
}

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
