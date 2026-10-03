export function writeInspectorTextClipboard(text: Promise<string>): Promise<boolean> {
  const blob = text.then(value => {
    if (typeof value !== 'string' || !value) throw new Error('Nothing to copy');
    return new Blob([value], { type: 'text/plain' });
  });
  // WebKit requires write() during the gesture, not after the export RPC.
  void blob.catch(() => {});
  try {
    return navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })]).then(() => true, () => false);
  } catch {
    return Promise.resolve(false);
  }
}
