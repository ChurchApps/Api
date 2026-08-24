import type { AssetRepo } from "../repositories/AssetRepo.js";
import { ipHash } from "./RequestHelper.js";

/**
 * The one download tally: IP-deduped, shared by the asset download endpoint and the
 * song file endpoints. Undercounts behind NAT, which is fine for a popularity metric.
 */
export async function recordAssetDownload(
  repo: AssetRepo,
  asset: { id?: string; downloadCount?: number },
  req: { headers: Record<string, any>; socket?: { remoteAddress?: string } }
): Promise<number> {
  const id = asset.id || "";
  const counted = await repo.recordDownload(id, ipHash(req));
  return counted ? await repo.incrementDownloadCount(id) : asset.downloadCount || 0;
}
