import { injectable } from "inversify";
import { sql } from "drizzle-orm";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { households } from "../../../db/schema/membership.js";

@injectable()
export class HouseholdRepo extends DrizzleRepo<typeof households> {
  protected readonly table = households;
  protected readonly moduleName = "membership";

  public deleteUnused(churchId: string) {
    return this.db.execute(sql`
      DELETE FROM households WHERE churchId=${churchId}
        AND id NOT IN (SELECT householdId FROM people WHERE churchId=${churchId} AND householdId IS NOT NULL GROUP BY householdId)
    `);
  }
}
