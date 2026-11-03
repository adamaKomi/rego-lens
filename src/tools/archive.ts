/**
 * Extracts one file from the release archives of regodrill: tar.gz (Linux, macOS) and zip (Windows), as
 * goreleaser writes them with Go's archive/tar and archive/zip. Node only (zlib), no dependency, no VS Code
 * API, so it is unit-tested in plain Node.
 *
 * Formats: POSIX ustar headers of 512 bytes, with pax extended headers (typeflag `x`) that may override the
 * path (https://pubs.opengroup.org/onlinepubs/9799919799/utilities/pax.html); zip entries read from the
 * central directory, because Go's writer puts the sizes in a data descriptor after the data and leaves them
 * at zero in the local header (APPNOTE.TXT 4.3.9, https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT).
 */
import * as zlib from 'zlib';

/** Reads a NUL-terminated string field of a tar header. */
function tarString(header: Buffer, start: number, length: number): string {
  const field = header.subarray(start, start + length);
  const end = field.indexOf(0);
  return field.subarray(0, end === -1 ? field.length : end).toString('utf8');
}

/** Reads an octal number field of a tar header. */
function tarNumber(header: Buffer, start: number, length: number): number {
  const text = tarString(header, start, length).trim();
  return text === '' ? 0 : parseInt(text, 8);
}

/** The `path` record of a pax extended header ("<length> path=<value>\n" records). */
function paxPath(data: Buffer): string | undefined {
  let offset = 0;
  while (offset < data.length) {
    const space = data.indexOf(0x20, offset);
    if (space === -1) {
      break;
    }
    const length = parseInt(data.subarray(offset, space).toString('ascii'), 10);
    if (!Number.isFinite(length) || length <= 0) {
      break;
    }
    const record = data.subarray(space + 1, offset + length - 1).toString('utf8');
    if (record.startsWith('path=')) {
      return record.slice('path='.length);
    }
    offset += length;
  }
  return undefined;
}

function baseName(entry: string): string {
  return entry.replace(/\/+$/, '').split('/').pop() ?? entry;
}

/** The content of the regular file named `name` (at any depth) in a gzip-compressed tar archive. */
export function extractFromTarGz(archive: Buffer, name: string): Buffer {
  const tar = zlib.gunzipSync(archive);
  let offset = 0;
  let nextPath: string | undefined;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) {
      break; // end of archive: two zero blocks
    }
    const size = tarNumber(header, 124, 12);
    const type = String.fromCharCode(header[156] || 0x30); // NUL is an old regular file
    const prefix = tarString(header, 345, 155);
    const headerPath = (prefix ? `${prefix}/` : '') + tarString(header, 0, 100);
    const dataStart = offset + 512;
    const data = tar.subarray(dataStart, dataStart + size);
    offset = dataStart + Math.ceil(size / 512) * 512;
    if (type === 'x') {
      nextPath = paxPath(data);
      continue;
    }
    if (type === 'g') {
      continue; // global pax header: no path of its own
    }
    const entryPath = nextPath ?? headerPath;
    nextPath = undefined;
    if ((type === '0' || type === '7') && baseName(entryPath) === name) {
      if (data.length !== size) {
        throw new Error(`${name} is truncated in the archive`);
      }
      return Buffer.from(data);
    }
  }
  throw new Error(`${name} not found in the archive`);
}

/** The content of the file named `name` (at any depth) in a zip archive. */
export function extractFromZip(archive: Buffer, name: string): Buffer {
  // End of central directory record: signature 0x06054b50, at least 22 bytes from the end, followed by a
  // comment of up to 65535 bytes.
  const minEnd = Math.max(0, archive.length - 22 - 0xffff);
  let end = -1;
  for (let i = archive.length - 22; i >= minEnd; i--) {
    if (archive.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end === -1) {
    throw new Error('not a zip archive');
  }
  const count = archive.readUInt16LE(end + 10);
  let offset = archive.readUInt32LE(end + 16);
  for (let i = 0; i < count; i++) {
    if (archive.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error('invalid zip central directory');
    }
    const method = archive.readUInt16LE(offset + 10);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const size = archive.readUInt32LE(offset + 24);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localOffset = archive.readUInt32LE(offset + 42);
    const entryName = archive.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    offset += 46 + nameLength + extraLength + commentLength;
    if (entryName.endsWith('/') || baseName(entryName) !== name) {
      continue;
    }
    if (archive.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error('invalid zip local header');
    }
    const dataStart =
      localOffset +
      30 +
      archive.readUInt16LE(localOffset + 26) +
      archive.readUInt16LE(localOffset + 28);
    const raw = archive.subarray(dataStart, dataStart + compressedSize);
    let content: Buffer;
    if (method === 0) {
      content = Buffer.from(raw);
    } else if (method === 8) {
      content = zlib.inflateRawSync(raw);
    } else {
      throw new Error(`unsupported zip compression method ${method}`);
    }
    if (content.length !== size) {
      throw new Error(`${name} has an unexpected size in the archive`);
    }
    return content;
  }
  throw new Error(`${name} not found in the archive`);
}
