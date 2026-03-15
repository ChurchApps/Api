import { injectable } from "inversify";
import { lt } from "drizzle-orm";
import { GlobalDrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { clientErrors } from "../../../db/schema/membership.js";
import { DateHelper } from "../../../shared/helpers/DateHelper.js";

@injectable()
export class ClientErrorRepo extends GlobalDrizzleRepo<typeof clientErrors> {
  protected readonly table = clientErrors;
  protected readonly moduleName = "membership";

  public deleteOld() {
    return this.db.delete(clientErrors).where(lt(clientErrors.errorTime, DateHelper.daysFromNow(-7)));
  }
}
