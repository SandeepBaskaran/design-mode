export const LAUNCH_SURFACE_KEY = 'dm-launch-surface';

export const LAUNCH_SURFACES = ['side-panel', 'floating', 'picture-in-picture'] as const;

export type LaunchSurface = (typeof LAUNCH_SURFACES)[number];

export const DEFAULT_LAUNCH_SURFACE: LaunchSurface = 'side-panel';

export function parseLaunchSurface(value: unknown): LaunchSurface {
  return (LAUNCH_SURFACES as readonly string[]).includes(value as string)
    ? (value as LaunchSurface)
    : DEFAULT_LAUNCH_SURFACE;
}
