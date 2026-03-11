import { injectable } from "inversify";
import { eq, asc, sql } from "drizzle-orm";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { streamingServices } from "../../../db/schema/content.js";
import { getDialect } from "../../../shared/helpers/Dialect.js";

@injectable()
export class StreamingServiceRepo extends DrizzleRepo<typeof streamingServices> {
  protected readonly table = streamingServices;
  protected readonly moduleName = "content";

  public override async loadAll(churchId: string) {
    return (this.db as any).select().from(streamingServices).where(eq(streamingServices.churchId, churchId)).orderBy(asc(streamingServices.serviceTime));
  }

  public loadById(id: string, churchId: string) {
    return this.loadOne(churchId, id);
  }

  public loadAllRecurring(): Promise<any[]> {
    return (this.db as any).select().from(streamingServices).where(eq(streamingServices.recurring, true)).orderBy(asc(streamingServices.serviceTime));
  }

  public async advanceRecurringServices() {
    if (getDialect() === "postgres") {
      await (this.db as any).execute(sql`
        UPDATE "streamingServices"
        SET "serviceTime" = "serviceTime" + INTERVAL '1 day' * CEIL(EXTRACT(EPOCH FROM (NOW() + INTERVAL '6 hours' - "serviceTime")) / 86400.0 / 7) * 7
        WHERE recurring = true AND "serviceTime" < NOW() - INTERVAL '6 hours'
      `);
    } else {
      await (this.db as any).execute(sql`
        UPDATE streamingServices
        SET serviceTime = DATE_ADD(serviceTime, INTERVAL CEIL(TIMESTAMPDIFF(DAY, serviceTime, DATE_ADD(NOW(), INTERVAL 6 HOUR)) / 7) * 7 DAY)
        WHERE recurring = 1 AND serviceTime < DATE_SUB(NOW(), INTERVAL 6 HOUR)
      `);
    }
  }
}
