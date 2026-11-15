import { zipStore } from './zip-store';

export interface RegionShot {
  commentId: string;
  png: Uint8Array | null;
}

export interface ReviewFile {
  name: string;
  bytes: Uint8Array;
  mime: string;
}

function stamp(now: Date): string {
  return now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function pngBytes(dataUrl: string | null | undefined): Uint8Array | null {
  if (!dataUrl) return null;
  const match = dataUrl.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  const binary = atob(match[1]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function shotsFromCapture(ids: string[], images: { id?: string; dataUrl?: string | null }[] | undefined): RegionShot[] {
  const byId = new Map((images || []).map(image => [image.id, pngBytes(image.dataUrl)]));
  return ids.map(commentId => ({ commentId, png: byId.get(commentId) ?? null }));
}

export function reviewFile(payload: object, shots: RegionShot[], now = new Date()): ReviewFile {
  const nameStamp = stamp(now);
  if (shots.length === 0) {
    return {
      name: `design-mode-changes-${nameStamp}.json`,
      bytes: new TextEncoder().encode(JSON.stringify(payload, null, 2)),
      mime: 'application/json',
    };
  }
  const regionScreenshots = shots.map((shot, index) => ({
    commentId: shot.commentId,
    file: shot.png ? `regions/region-${index + 1}.png` : null,
    status: shot.png ? 'saved' : 'not-captured',
  }));
  const json = new TextEncoder().encode(JSON.stringify({ ...payload, regionScreenshots }, null, 2));
  const files: { name: string; bytes: Uint8Array<ArrayBuffer> }[] = [{ name: 'design-mode-changes.json', bytes: new Uint8Array(json) }];
  shots.forEach((shot, index) => {
    if (shot.png) files.push({ name: `regions/region-${index + 1}.png`, bytes: new Uint8Array(shot.png) });
  });
  return {
    name: `design-mode-changes-${nameStamp}.zip`,
    bytes: zipStore(files),
    mime: 'application/zip',
  };
}
