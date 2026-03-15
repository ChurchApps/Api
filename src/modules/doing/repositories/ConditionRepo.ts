import { injectable } from "inversify";
import { eq, and, inArray } from "drizzle-orm";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { conditions, conjunctions } from "../../../db/schema/doing.js";

@injectable()
export class ConditionRepo extends DrizzleRepo<typeof conditions> {
  protected readonly table = conditions;
  protected readonly moduleName = "doing";

  public async loadForAutomation(churchId: string, automationId: string) {
    const conjunctionIds = this.db.select({ id: conjunctions.id }).from(conjunctions).where(eq(conjunctions.automationId, automationId));
    return this.db.select().from(conditions).where(and(inArray(conditions.conjunctionId, conjunctionIds), eq(conditions.churchId, churchId)));
  }
}
