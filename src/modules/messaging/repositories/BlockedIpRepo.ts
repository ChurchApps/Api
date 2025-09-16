import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { BlockedIp } from "../models";
import { injectable } from "inversify";

import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo";

@injectable()
export class BlockedIpRepo extends ConfiguredRepo<BlockedIp> {
  protected get repoConfig(): RepoConfig<BlockedIp> {
    return {
      tableName: "blockedIps",
      hasSoftDelete: false,
      columns: ["conversationId", "serviceId", "ipAddress"]
    };
  }
  public async loadByConversationId(churchId: string, conversationId: string) {
    const sql = "SELECT * FROM blockedIps WHERE churchId=? AND conversationId=?;";
    const params = [churchId, conversationId];
    const result: any = await TypedDB.query(sql, params);
    const data = result || [];
    const ips = data.map((d: BlockedIp) => d.ipAddress);
    return ips;
  }

  public async loadByServiceId(churchId: string, serviceId: string) {
    const result: any = await TypedDB.query("SELECT * FROM blockedIps WHERE churchId=? AND serviceId=?;", [churchId, serviceId]);
    return result || [];
  }

  // Override save to implement toggle behavior (if exists, delete; if not, create)
  public async save(blockedIp: BlockedIp) {
    const result: any = await TypedDB.query("SELECT id FROM blockedIps WHERE churchId=? AND conversationId=? AND ipAddress=?;", [blockedIp.churchId, blockedIp.conversationId, blockedIp.ipAddress]);
    const existingIp = result || [];
    return existingIp[0]?.id ? this.deleteExisting(existingIp[0].id) : super.save(blockedIp);
  }

  private deleteExisting(id: string) {
    return TypedDB.query("DELETE FROM blockedIps WHERE id=?;", [id]);
  }

  public deleteByServiceId(churchId: string, serviceId: string) {
    return TypedDB.query("DELETE FROM blockedIps WHERE churchId=? AND serviceId=?;", [churchId, serviceId]);
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
