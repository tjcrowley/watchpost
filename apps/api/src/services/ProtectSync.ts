import { query, queryOne } from "../db/client.js";
import { createLogger } from "@watchpost/logger";
import type { Camera } from "@watchpost/types";

const logger = createLogger("protect-sync");

export interface ProtectCamera {
  id: string;
  name: string;
  type: string;
  state: string;
}

export async function syncCamerasFromProtect(
  siteId: string,
  protectCameras: ProtectCamera[]
): Promise<{ added: number; updated: number }> {
  let added = 0;
  let updated = 0;

  for (const pc of protectCameras) {
    const existing = await queryOne<Camera>(
      "SELECT * FROM cameras WHERE site_id = $1 AND protect_id = $2",
      [siteId, pc.id]
    );

    if (existing) {
      await query(
        "UPDATE cameras SET name = $1 WHERE id = $2",
        [pc.name, existing.id]
      );
      updated++;
    } else {
      await query(
        `INSERT INTO cameras (site_id, protect_id, name)
         VALUES ($1, $2, $3)`,
        [siteId, pc.id, pc.name]
      );
      added++;
    }
  }

  logger.info({ siteId, added, updated }, "Camera sync complete");
  return { added, updated };
}
