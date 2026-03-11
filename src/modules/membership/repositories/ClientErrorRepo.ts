import { injectable } from "inversify";
import { sql } from "drizzle-orm";
import { GlobalDrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { clientErrors } from "../../../db/schema/membership.js";

@injectable()
export class ClientErrorRepo extends GlobalDrizzleRepo<typeof clientErrors> {
  protected readonly table = clientErrors;
  protected readonly moduleName = "membership";

  public deleteOld() {
    return this.db.execute(sql`DELETE FROM clientErrors WHERE errorTime < DATE_ADD(NOW(), INTERVAL -7 DAY)`);
  }
}
