import { injectable } from "inversify";
import { eq, asc, sql } from "drizzle-orm";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { streamingServices } from "../../../db/schema/content.js";

@injectable()
export class StreamingServiceRepo extends DrizzleRepo<typeof streamingServices> {
  protected readonly table = streamingServices;
  protected readonly moduleName = "content";

  public override async loadAll(churchId: string) {
    return this.db.select().from(streamingServices).where(eq(streamingServices.churchId, churchId)).orderBy(asc(streamingServices.serviceTime));
  }

  public loadById(id: string, churchId: string) {
    return this.loadOne(churchId, id);
  }

  public loadAllRecurring(): Promise<any[]> {
    return this.db.select().from(streamingServices).where(eq(streamingServices.recurring, true)).orderBy(asc(streamingServices.serviceTime));
  }

  public async advanceRecurringServices() {
    await this.db.execute(sql`
      UPDATE streamingServices
      SET serviceTime = DATE_ADD(serviceTime, INTERVAL CEIL(TIMESTAMPDIFF(DAY, serviceTime, DATE_ADD(NOW(), INTERVAL 6 HOUR)) / 7) * 7 DAY)
      WHERE recurring = 1 AND serviceTime < DATE_SUB(NOW(), INTERVAL 6 HOUR)
    `);
  }
}
