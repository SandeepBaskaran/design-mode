type PresetStyles = Record<string, string | undefined>;

export function hasPresetStyles(kind: string, styles: PresetStyles, props: readonly string[]): boolean {
  const nonDefault = (value: string | undefined) => !!value &&
    !['none', 'normal', 'auto', '0px', '0', 'rgba(0, 0, 0, 0)', 'transparent'].includes(value);
  if (kind === 'motion') {
    // Timing, origins and axes have computed defaults even without a motion effect.
    const effects = ['animationName', 'translate', 'rotate', 'scale', 'transform',
      'perspective', 'offsetPath', 'viewTransitionName', 'viewTransitionClass',
      'scrollTimelineName', 'viewTimelineName'];
    return effects.some(prop => nonDefault(styles[prop])) ||
      styles.transformStyle === 'preserve-3d' || styles.backfaceVisibility === 'hidden' ||
      (styles.transitionProperty !== 'none' &&
        [styles.transitionDuration, styles.transitionDelay].some(list => (list || '').split(',')
          .some(value => parseFloat(value) > 0)));
  }
  return props.some(prop => nonDefault(styles[prop]));
}
