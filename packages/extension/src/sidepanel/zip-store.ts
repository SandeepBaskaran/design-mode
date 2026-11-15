function crc32(bytes: Uint8Array): number {
  let crc = ~0;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

export function zipStore(files: { name: string; bytes: Uint8Array<ArrayBuffer> }[]): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const crc = crc32(file.bytes);
    const local = new Uint8Array(30 + name.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0x0800, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, file.bytes.length, true);
    view.setUint32(22, file.bytes.length, true);
    view.setUint16(26, name.length, true);
    local.set(name, 30);
    locals.push(local, file.bytes);

    const central = new Uint8Array(46 + name.length);
    const directory = new DataView(central.buffer);
    directory.setUint32(0, 0x02014b50, true);
    directory.setUint16(4, 20, true);
    directory.setUint16(6, 20, true);
    directory.setUint16(8, 0x0800, true);
    directory.setUint32(16, crc, true);
    directory.setUint32(20, file.bytes.length, true);
    directory.setUint32(24, file.bytes.length, true);
    directory.setUint16(28, name.length, true);
    directory.setUint32(42, offset, true);
    central.set(name, 46);
    centrals.push(central);
    offset += local.length + file.bytes.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const ending = new DataView(end.buffer);
  ending.setUint32(0, 0x06054b50, true);
  ending.setUint16(8, files.length, true);
  ending.setUint16(10, files.length, true);
  ending.setUint32(12, centralSize, true);
  ending.setUint32(16, offset, true);
  const parts = [...locals, ...centrals, end];
  const archive = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let cursor = 0;
  for (const part of parts) {
    archive.set(part, cursor);
    cursor += part.length;
  }
  return archive;
}
