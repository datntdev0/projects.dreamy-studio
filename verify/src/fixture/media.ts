import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { mediaPath, type ProtoAsset } from "./prototype.ts";

const MVHD_V0_DURATION_OFFSET = 16;

interface Box {
  readonly kind: string;
  readonly start: number;
  readonly payload: number;
  readonly end: number;
}

function boxesIn(data: Buffer, from: number, to: number): Box[] {
  const found: Box[] = [];
  let offset = from;
  while (offset + 8 <= to) {
    const size = data.readUInt32BE(offset);
    const kind = data.toString("latin1", offset + 4, offset + 8);
    const end = size === 0 ? to : offset + size;
    if (size < 8 || end > to) {
      break;
    }
    found.push({ kind, start: offset, payload: offset + 8, end });
    offset = end;
  }
  return found;
}

function findBox(data: Buffer, parent: Box | null, kind: string): Box | null {
  const from = parent ? parent.payload : 0;
  const to = parent ? parent.end : data.length;
  return boxesIn(data, from, to).find((box) => box.kind === kind) ?? null;
}

export function withMovieDuration(source: Buffer, durationMs: number): Buffer {
  const data = Buffer.from(source);
  const moov = findBox(data, null, "moov");
  const mvhd = moov ? findBox(data, moov, "mvhd") : null;
  if (!mvhd || data[mvhd.payload] !== 0) {
    throw new Error("video has no version 0 mvhd box to normalize");
  }
  const scale = data.readUInt32BE(mvhd.payload + 12);
  data.writeUInt32BE(Math.round((durationMs * scale) / 1000), mvhd.payload + MVHD_V0_DURATION_OFFSET);
  return data;
}

export async function stageMedia(asset: ProtoAsset, directory: string): Promise<string> {
  await mkdir(directory, { recursive: true });
  const target = join(directory, asset.name);
  if (asset.type !== "video") {
    await copyFile(mediaPath(asset), target);
    return target;
  }
  const seconds = asset.meta?.dur ?? 0;
  await writeFile(target, withMovieDuration(await readFile(mediaPath(asset)), Math.round(seconds * 1000)));
  return target;
}
