import { injectable } from "inversify";
import { eq, and } from "drizzle-orm";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { arrangementKeys } from "../../../db/schema/content.js";

@injectable()
export class ArrangementKeyRepo extends DrizzleRepo<typeof arrangementKeys> {
  protected readonly table = arrangementKeys;
  protected readonly moduleName = "content";

  public deleteForArrangement(churchId: string, arrangementId: string) {
    return this.db.delete(arrangementKeys).where(and(eq(arrangementKeys.churchId, churchId), eq(arrangementKeys.arrangementId, arrangementId)));
  }

  public loadByArrangementId(churchId: string, arrangementId: string) {
    return this.db.select().from(arrangementKeys).where(and(eq(arrangementKeys.churchId, churchId), eq(arrangementKeys.arrangementId, arrangementId)));
  }
}
