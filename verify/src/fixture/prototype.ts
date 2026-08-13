import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { runInNewContext } from "node:vm";
import { prototypeData, prototypeMedia } from "../paths.ts";

export type AssetKind = "image" | "sound" | "video" | "prompt";
export type Rights = "own" | "licensed" | "free" | "other";
export type PromptKind = "image" | "video" | "voice" | "general";

export interface ProtoCollection {
  readonly id: string;
  readonly name: string;
  readonly desc: string;
  readonly created: string;
}

export interface ProtoAsset {
  readonly id: string;
  readonly type: AssetKind;
  readonly name: string;
  readonly tags: readonly string[];
  readonly collectionId: string | null;
  readonly rights: Rights;
  readonly added: string;
  readonly kind?: PromptKind;
  readonly text?: string;
  readonly img?: string;
  readonly meta?: { readonly dur?: number; readonly fps?: number };
}

export interface PrototypeData {
  readonly collections: readonly ProtoCollection[];
  readonly assets: readonly ProtoAsset[];
}

interface PrototypeWindow {
  LB?: { state: PrototypeData };
}

export async function loadPrototype(): Promise<PrototypeData> {
  const source = await readFile(prototypeData, "utf8");
  const sandbox = { window: {} as PrototypeWindow, Blob };
  runInNewContext(source, sandbox, { filename: prototypeData });
  const state = sandbox.window.LB?.state;
  if (!state) {
    throw new Error(`${prototypeData} did not define window.LB`);
  }
  return state;
}

export function mediaPath(asset: ProtoAsset): string {
  return join(prototypeMedia, asset.name);
}

export function posterPath(asset: ProtoAsset): string | null {
  return asset.img ? join(prototypeMedia, basename(asset.img)) : null;
}

export function toTimestamp(local: string): string {
  const [date, time = "00:00"] = local.split(" ");
  return `${date}T${time}:00.000Z`;
}
