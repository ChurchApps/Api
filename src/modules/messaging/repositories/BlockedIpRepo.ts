import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { BlockedIp } from "../models/index.js";

@injectable()
export class BlockedIpRepo {
  public async save(blockedIp: BlockedIp) {
    // Toggle behavior: if exists, delete; if not, create
    const existing = (await getDb().selectFrom("blockedIps")
      .select("id")
      .where("churchId", "=", blockedIp.churchId)
      .where("conversationId", "=", blockedIp.conversationId)
      .where("ipAddress", "=", blockedIp.ipAddress)
      .executeTakeFirst()) ?? null;
    if (existing?.id) {
      await getDb().deleteFrom("blockedIps").where("id", "=", existing.id).execute();
      return blockedIp;
    }
    return this.create(blockedIp);
  }

  private async create(model: BlockedIp): Promise<BlockedIp> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("blockedIps").values({
      id: model.id,
      churchId: model.churchId,
      conversationId: model.conversationId,
      serviceId: model.serviceId,
      ipAddress: model.ipAddress
    }).execute();
    return model;
  }

  public async loadByConversationId(churchId: string, conversationId: string) {
    const data = await getDb().selectFrom("blockedIps")
      .selectAll()
      .where("churchId", "=", churchId)
      .where("conversationId", "=", conversationId)
      .execute();
    return data.map((d: any) => d.ipAddress);
  }

  public async loadByServiceId(churchId: string, serviceId: string) {
    return getDb().selectFrom("blockedIps")
      .selectAll()
      .where("churchId", "=", churchId)
      .where("serviceId", "=", serviceId)
      .execute();
  }

  public async deleteByServiceId(churchId: string, serviceId: string) {
    await getDb().deleteFrom("blockedIps")
      .where("churchId", "=", churchId)
      .where("serviceId", "=", serviceId)
      .execute();
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("blockedIps").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("blockedIps").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("blockedIps").selectAll().where("churchId", "=", churchId).execute();
  }

  public convertToModel(_churchId: string, data: any): BlockedIp {
    if (!data) return null;
    return this.rowToModel(data);
  }

  public convertAllToModel(_churchId: string, data: any[]): BlockedIp[] {
    if (!data) return [];
    return (Array.isArray(data) ? data : []).map((d: any) => this.rowToModel(d));
  }

  protected rowToModel(row: any): BlockedIp {
    return {
      id: row.id,
      churchId: row.churchId,
      conversationId: row.conversationId,
      serviceId: row.serviceId,
      ipAddress: row.ipAddress
    };
  }
}
