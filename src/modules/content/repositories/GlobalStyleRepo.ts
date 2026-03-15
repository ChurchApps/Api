import { injectable } from "inversify";
import { eq } from "drizzle-orm";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { globalStyles } from "../../../db/schema/content.js";

@injectable()
export class GlobalStyleRepo extends DrizzleRepo<typeof globalStyles> {
  protected readonly table = globalStyles;
  protected readonly moduleName = "content";

  public loadForChurch(churchId: string) {
    return this.db.select().from(globalStyles).where(eq(globalStyles.churchId, churchId)).limit(1).then(r => r[0] ?? null);
  }
}
