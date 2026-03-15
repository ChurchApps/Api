import { injectable } from "inversify";
import { eq, and } from "drizzle-orm";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { accessLogs } from "../../../db/schema/membership.js";
import { AccessLog } from "../models/index.js";

@injectable()
export class AccessLogRepo extends DrizzleRepo<typeof accessLogs> {
  protected readonly table = accessLogs;
  protected readonly moduleName = "membership";

  public async save(model: AccessLog) {
    if (model.id) {
      const { id: _id, churchId: _churchId, ...setData } = model as any;
      await this.db.update(accessLogs).set(setData)
        .where(and(eq(accessLogs.id, model.id), eq(accessLogs.churchId, model.churchId!)));
    } else {
      model.id = UniqueIdHelper.shortId();
      await this.db.insert(accessLogs).values({ ...model, loginTime: new Date() } as any);
    }
    return model;
  }

  public async create(log: AccessLog) {
    log.id = UniqueIdHelper.shortId();
    await this.db.insert(accessLogs).values({ ...log, loginTime: new Date() } as any);
    return log;
  }
}
