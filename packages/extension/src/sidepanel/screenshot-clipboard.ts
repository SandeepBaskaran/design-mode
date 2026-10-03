export function writeScreenshotClipboard(capture: Promise<{ dataUrl?: string }>): Promise<boolean> {
  const blob = capture.then(async ({ dataUrl }) => {
    if (!dataUrl?.startsWith('data:image/png;base64,')) throw new Error('Capture failed');
    return (await fetch(dataUrl)).blob();
  });
  // Safari requires write() in the click stack, before capture has completed.
  void blob.catch(() => {});
  try {
    return navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(() => true, () => false);
  } catch {
    return Promise.resolve(false);
  }
}
