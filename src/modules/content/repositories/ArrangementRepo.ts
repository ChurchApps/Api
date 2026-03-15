import { injectable } from "inversify";
import { eq, and } from "drizzle-orm";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { arrangements } from "../../../db/schema/content.js";

@injectable()
export class ArrangementRepo extends DrizzleRepo<typeof arrangements> {
  protected readonly table = arrangements;
  protected readonly moduleName = "content";

  public loadBySongId(churchId: string, songId: string) {
    return this.db.select().from(arrangements).where(and(eq(arrangements.churchId, churchId), eq(arrangements.songId, songId)));
  }

  public loadBySongDetailId(churchId: string, songDetailId: string) {
    return this.db.select().from(arrangements).where(and(eq(arrangements.churchId, churchId), eq(arrangements.songDetailId, songDetailId)));
  }

  public loadByFreeShowId(churchId: string, freeShowId: string) {
    return this.db.select().from(arrangements).where(and(eq(arrangements.churchId, churchId), eq(arrangements.freeShowId, freeShowId))).then(r => r[0] ?? null);
  }
}
