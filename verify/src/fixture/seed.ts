import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { invoke } from "../app/ipc.ts";
import { join } from "node:path";
import { stageMedia } from "./media.ts";
import { posterPath, type ProtoAsset, type PrototypeData } from "./prototype.ts";

interface Created {
  readonly id: number;
}

export interface SeededAsset {
  readonly proto: ProtoAsset;
  readonly id: number;
}

export interface SeededCollection {
  readonly protoId: string;
  readonly id: number;
}

export interface SeedResult {
  readonly collections: readonly SeededCollection[];
  readonly assets: readonly SeededAsset[];
}

const UPLOAD_COMMANDS = {
  image: "library_image_upload",
  sound: "library_sound_upload",
  video: "library_video_upload",
} as const;

async function createCollections(page: Page, data: PrototypeData): Promise<SeededCollection[]> {
  const created: SeededCollection[] = [];
  for (const collection of data.collections) {
    const input = { name: collection.name, description: collection.desc };
    const row = await invoke<Created>(page, "library_collection_create", { input });
    created.push({ protoId: collection.id, id: row.id });
  }
  return created;
}

function collectionOf(asset: ProtoAsset, collections: readonly SeededCollection[]): number | null {
  const found = collections.find((collection) => collection.protoId === asset.collectionId);
  return found ? found.id : null;
}

async function uploadFile(page: Page, asset: ProtoAsset, collectionId: number | null, staging: string): Promise<number> {
  const command = UPLOAD_COMMANDS[asset.type as keyof typeof UPLOAD_COMMANDS];
  const input = { collectionId, tags: asset.tags, rights: asset.rights };
  const path = await stageMedia(asset, staging);
  try {
    const row = await invoke<Created>(page, command, { path, input });
    return row.id;
  } catch (error) {
    throw new Error(`cannot upload ${asset.name}: ${String(error)}`);
  }
}

async function createPrompt(page: Page, asset: ProtoAsset, collectionId: number | null): Promise<number> {
  const input = { name: asset.name, kind: asset.kind, text: asset.text, collectionId, tags: asset.tags, rights: asset.rights };
  const row = await invoke<Created>(page, "library_prompt_create", { input });
  return row.id;
}

async function attachPoster(page: Page, asset: ProtoAsset, id: number): Promise<void> {
  const path = posterPath(asset);
  if (path === null) {
    return;
  }
  const data = (await readFile(path)).toString("base64");
  await invoke(page, "library_video_poster_set", { id, data });
}

async function seedAsset(page: Page, asset: ProtoAsset, collections: readonly SeededCollection[], staging: string): Promise<number> {
  const collectionId = collectionOf(asset, collections);
  if (asset.type === "prompt") {
    return createPrompt(page, asset, collectionId);
  }
  const id = await uploadFile(page, asset, collectionId, staging);
  if (asset.type === "video") {
    await attachPoster(page, asset, id);
  }
  return id;
}

export async function seedLibrary(page: Page, data: PrototypeData, stagingRoot: string): Promise<SeedResult> {
  const collections = await createCollections(page, data);
  const assets: SeededAsset[] = [];
  for (const proto of data.assets) {
    assets.push({ proto, id: await seedAsset(page, proto, collections, join(stagingRoot, proto.type)) });
  }
  return { collections, assets };
}
