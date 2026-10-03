import type { LaunchSurface } from './launch-surface';

export interface LaunchCapabilities {
  floating: boolean;
  pictureInPicture: boolean;
}

export function detectLaunchCapabilities(safari: boolean, api: unknown, context: unknown): LaunchCapabilities {
  const windows = (api as { windows?: { create?: unknown } } | undefined)?.windows;
  const pip = (context as { documentPictureInPicture?: { requestWindow?: unknown } } | undefined)?.documentPictureInPicture;
  const floating = !safari && typeof windows?.create === 'function';
  return { floating, pictureInPicture: floating && typeof pip?.requestWindow === 'function' };
}

export function supportedLaunchSurface(surface: LaunchSurface, capabilities: LaunchCapabilities): LaunchSurface {
  if (surface === 'floating' && !capabilities.floating) return 'side-panel';
  if (surface === 'picture-in-picture' && !capabilities.pictureInPicture) return 'side-panel';
  return surface;
}

export function pipFailureMessage(error: unknown): string {
  return (error as { name?: string })?.name === 'NotAllowedError'
    ? 'Pin on top was refused. Click Pin on top again in the floating window.'
    : 'Pin on top could not open. Staying in the floating window; you can retry.';
}
