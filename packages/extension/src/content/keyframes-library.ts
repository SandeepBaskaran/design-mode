// ============================================================
// Built-in @keyframes library
// All built-in animation names are prefixed `dm-` to avoid colliding
// with keyframes the page already defines. When any change applies
// `animation-name: dm-...`, the change-tracker injects the matching
// rule into <style id="dm-applied-styles">.
// ============================================================

export const BUILTIN_KEYFRAMES: Record<string, string> = {
  'dm-fade-in': `@keyframes dm-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}`,
  'dm-fade-out': `@keyframes dm-fade-out {
  from { opacity: 1; }
  to { opacity: 0; }
}`,
  'dm-slide-up': `@keyframes dm-slide-up {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}`,
  'dm-slide-down': `@keyframes dm-slide-down {
  from { transform: translateY(-20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}`,
  'dm-slide-left': `@keyframes dm-slide-left {
  from { transform: translateX(20px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}`,
  'dm-slide-right': `@keyframes dm-slide-right {
  from { transform: translateX(-20px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}`,
  'dm-pulse': `@keyframes dm-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}`,
  'dm-bounce': `@keyframes dm-bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}`,
  'dm-shake': `@keyframes dm-shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-6px); }
  75% { transform: translateX(6px); }
}`,
  'dm-spin': `@keyframes dm-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}`,
  'dm-wiggle': `@keyframes dm-wiggle {
  0%, 100% { transform: rotate(0deg); }
  25% { transform: rotate(-3deg); }
  75% { transform: rotate(3deg); }
}`,
  'dm-ping': `@keyframes dm-ping {
  0% { transform: scale(1); opacity: 1; }
  100% { transform: scale(2); opacity: 0; }
}`,
};

export const ANIMATION_NAMES = Object.keys(BUILTIN_KEYFRAMES);
