import { injectable } from "inversify";
import { eq, and } from "drizzle-orm";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { conjunctions } from "../../../db/schema/doing.js";

@injectable()
export class ConjunctionRepo extends DrizzleRepo<typeof conjunctions> {
  protected readonly table = conjunctions;
  protected readonly moduleName = "doing";

  public loadForAutomation(churchId: string, automationId: string) {
    return this.db.select().from(conjunctions).where(and(eq(conjunctions.automationId, automationId), eq(conjunctions.churchId, churchId)));
  }
}
