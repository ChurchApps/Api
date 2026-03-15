import { injectable } from "inversify";
import { eq, asc } from "drizzle-orm";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { automations } from "../../../db/schema/doing.js";

@injectable()
export class AutomationRepo extends DrizzleRepo<typeof automations> {
  protected readonly table = automations;
  protected readonly moduleName = "doing";

  public loadAll(churchId: string) {
    return this.db.select().from(automations).where(eq(automations.churchId, churchId)).orderBy(asc(automations.title));
  }

  public loadAllChurches() {
    return this.db.select().from(automations);
  }
}
