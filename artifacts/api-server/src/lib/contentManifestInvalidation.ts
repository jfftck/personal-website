import { sql } from "drizzle-orm";
import {
  contentManifestCacheTable,
  contentManifestStateTable,
  db,
} from "@workspace/db";
import { PUBLIC_MANIFEST_CACHE_KEY } from "./contentManifestCache";

type ContentTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function invalidatePublicManifestCache(
  tx: ContentTransaction,
): Promise<void> {
  await tx
    .insert(contentManifestStateTable)
    .values({ key: PUBLIC_MANIFEST_CACHE_KEY, generation: 1 })
    .onConflictDoUpdate({
      target: contentManifestStateTable.key,
      set: {
        generation: sql`${contentManifestStateTable.generation} + 1`,
        updatedAt: new Date(),
      },
    });
  await tx.delete(contentManifestCacheTable);
}
