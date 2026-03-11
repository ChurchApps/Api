import { injectable } from "inversify";
import { eq, and } from "drizzle-orm";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { actions } from "../../../db/schema/doing.js";

@injectable()
export class ActionRepo extends DrizzleRepo<typeof actions> {
  protected readonly table = actions;
  protected readonly moduleName = "doing";

  public loadForAutomation(churchId: string, automationId: string) {
    return this.db.select().from(actions).where(and(eq(actions.automationId, automationId), eq(actions.churchId, churchId)));
  }
}
