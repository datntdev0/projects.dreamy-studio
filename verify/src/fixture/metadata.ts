import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AssetKind, PrototypeData } from "./prototype.ts";
import { posterPath, toTimestamp } from "./prototype.ts";
import type { SeedResult } from "./seed.ts";

const WORKSPACE_DB_FILE = "workspace.dreamydb";

const ASSET_TABLES: Record<AssetKind, string> = {
  image: "ws_library_images",
  sound: "ws_library_sounds",
  video: "ws_library_videos",
  prompt: "ws_library_prompts",
};

export function pinMetadata(workspacePath: string, data: PrototypeData, seeded: SeedResult): void {
  const db = new DatabaseSync(join(workspacePath, WORKSPACE_DB_FILE));
  try {
    for (const collection of data.collections) {
      const row = seeded.collections.find((item) => item.protoId === collection.id);
      const stamp = toTimestamp(collection.created);
      db.prepare("UPDATE ws_library_collections SET created_at = ?, updated_at = ? WHERE id = ?").run(stamp, stamp, row?.id ?? -1);
    }
    for (const entry of seeded.assets) {
      const stamp = toTimestamp(entry.proto.added);
      const table = ASSET_TABLES[entry.proto.type];
      db.prepare(`UPDATE ${table} SET created_at = ?, updated_at = ? WHERE id = ?`).run(stamp, stamp, entry.id);
    }
    for (const entry of seeded.assets.filter((item) => item.proto.type === "video")) {
      db.prepare("UPDATE ws_library_videos SET fps = ? WHERE id = ?").run(entry.proto.meta?.fps ?? null, entry.id);
    }
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  } finally {
    db.close();
  }
}

export function pinPosters(workspacePath: string, seeded: SeedResult): void {
  const directory = join(workspacePath, "library", "videos", "posters");
  mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(join(workspacePath, WORKSPACE_DB_FILE));
  try {
    for (const entry of seeded.assets.filter((item) => item.proto.type === "video")) {
      const source = posterPath(entry.proto);
      if (source === null) {
        continue;
      }
      copyFileSync(source, join(directory, `${entry.id}.jpg`));
      db.prepare("UPDATE ws_library_videos SET has_poster = 1 WHERE id = ?").run(entry.id);
    }
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  } finally {
    db.close();
  }
}
