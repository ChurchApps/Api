import { injectable } from "inversify";
import { eq, and, inArray } from "drizzle-orm";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { contentProviderAuths } from "../../../db/schema/doing.js";

@injectable()
export class ContentProviderAuthRepo extends DrizzleRepo<typeof contentProviderAuths> {
  protected readonly table = contentProviderAuths;
  protected readonly moduleName = "doing";

  public loadByIds(churchId: string, ids: string[]) {
    return this.db.select().from(contentProviderAuths).where(and(eq(contentProviderAuths.churchId, churchId), inArray(contentProviderAuths.id, ids)));
  }

  public loadByMinistry(churchId: string, ministryId: string) {
    return this.db.select().from(contentProviderAuths).where(and(eq(contentProviderAuths.churchId, churchId), eq(contentProviderAuths.ministryId, ministryId)));
  }

  public loadByMinistryAndProvider(churchId: string, ministryId: string, providerId: string) {
    return this.db.select().from(contentProviderAuths)
      .where(and(eq(contentProviderAuths.churchId, churchId), eq(contentProviderAuths.ministryId, ministryId), eq(contentProviderAuths.providerId, providerId)))
      .then(r => r[0] ?? null);
  }
}
