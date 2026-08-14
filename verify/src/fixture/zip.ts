import { crc32, deflateRawSync } from "node:zlib";

export interface ZipEntry {
  readonly name: string;
  readonly data: Buffer;
}

const UTF8_FLAG = 0x0800;
const DEFLATED = 8;
const VERSION = 20;
const DOS_TIME = 0;
const DOS_DATE = (46 << 9) | (1 << 5) | 1;

function localHeader(name: Buffer, crc: number, packed: number, size: number): Buffer {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(VERSION, 4);
  header.writeUInt16LE(UTF8_FLAG, 6);
  header.writeUInt16LE(DEFLATED, 8);
  header.writeUInt16LE(DOS_TIME, 10);
  header.writeUInt16LE(DOS_DATE, 12);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(packed, 18);
  header.writeUInt32LE(size, 22);
  header.writeUInt16LE(name.length, 26);
  return Buffer.concat([header, name]);
}

function centralHeader(name: Buffer, crc: number, packed: number, size: number, offset: number): Buffer {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(VERSION, 4);
  header.writeUInt16LE(VERSION, 6);
  header.writeUInt16LE(UTF8_FLAG, 8);
  header.writeUInt16LE(DEFLATED, 10);
  header.writeUInt16LE(DOS_TIME, 12);
  header.writeUInt16LE(DOS_DATE, 14);
  header.writeUInt32LE(crc, 16);
  header.writeUInt32LE(packed, 20);
  header.writeUInt32LE(size, 24);
  header.writeUInt16LE(name.length, 28);
  header.writeUInt32LE(offset, 42);
  return Buffer.concat([header, name]);
}

function endRecord(count: number, size: number, offset: number): Buffer {
  const record = Buffer.alloc(22);
  record.writeUInt32LE(0x06054b50, 0);
  record.writeUInt16LE(count, 8);
  record.writeUInt16LE(count, 10);
  record.writeUInt32LE(size, 12);
  record.writeUInt32LE(offset, 16);
  return record;
}

export function zip(entries: readonly ZipEntry[]): Buffer {
  const body: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const packed = deflateRawSync(entry.data);
    const crc = crc32(entry.data);
    const local = Buffer.concat([localHeader(name, crc, packed.length, entry.data.length), packed]);
    directory.push(centralHeader(name, crc, packed.length, entry.data.length, offset));
    body.push(local);
    offset += local.length;
  }
  const central = Buffer.concat(directory);
  return Buffer.concat([...body, central, endRecord(entries.length, central.length, offset)]);
}
