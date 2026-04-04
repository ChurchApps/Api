import { injectable } from "inversify";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { AccessLog } from "../models/index.js";

@injectable()
export class AccessLogRepo {
  public async save(model: AccessLog) {
    return model.id ? this.update(model) : this.create(model);
  }

  public async create(log: AccessLog): Promise<AccessLog> {
    log.id = UniqueIdHelper.shortId();
    await getDb().insertInto("accessLogs").values({
      id: log.id,
      churchId: log.churchId,
      userId: log.userId,
      appName: log.appName,
      loginTime: sql`NOW()` as any
    }).execute();
    return log;
  }

  private async update(log: AccessLog): Promise<AccessLog> {
    await getDb().updateTable("accessLogs").set({
      userId: log.userId,
      appName: log.appName
    }).where("id", "=", log.id).where("churchId", "=", log.churchId).execute();
    return log;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("accessLogs").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("accessLogs").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("accessLogs").selectAll().where("churchId", "=", churchId).execute();
  }

  public convertToModel(_churchId: string, data: any) { return data; }
  public convertAllToModel(_churchId: string, data: any[]) { return data || []; }
}
