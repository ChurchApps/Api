import { DB } from "../../../shared/infrastructure";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { BlockedIp } from "../models";

export class BlockedIpRepository {
  public async loadByConversationId(churchId: string, conversationId: string) {
    const sql = "SELECT * FROM blockedIps WHERE churchId=? AND conversationId=?;";
    const params = [churchId, conversationId];
    const result: any = await DB.query(sql, params);
    const data = result.rows || result || [];
    const ips = data.map((d: BlockedIp) => d.ipAddress);
    return ips;
  }

  public async loadByServiceId(churchId: string, serviceId: string) {
    const result: any = await DB.query("SELECT * FROM blockedIps WHERE churchId=? AND serviceId=?;", [
      churchId,
      serviceId
    ]);
    return result.rows || result || [];
  }

  public async save(blockedIp: BlockedIp) {
    const result: any = await DB.query(
      "SELECT id FROM blockedIps WHERE churchId=? AND conversationId=? AND ipAddress=?;",
      [blockedIp.churchId, blockedIp.conversationId, blockedIp.ipAddress]
    );
    const existingIp = result.rows || result || [];
    return existingIp[0]?.id ? this.deleteExisting(existingIp[0].id) : this.create(blockedIp);
  }

  private async create(blockedIp: BlockedIp): Promise<BlockedIp> {
    blockedIp.id = UniqueIdHelper.shortId();
    const sql = "INSERT INTO blockedIps (id, churchId, conversationId, serviceId, ipAddress) VALUES (?, ?, ?, ?, ?);";
    const params = [
      blockedIp.id,
      blockedIp.churchId,
      blockedIp.conversationId,
      blockedIp.serviceId,
      blockedIp.ipAddress
    ];
    await DB.query(sql, params);
    return blockedIp;
  }

  private deleteExisting(id: string) {
    return DB.query("DELETE FROM blockedIps WHERE id=?;", [id]);
  }

  public deleteByServiceId(churchId: string, serviceId: string) {
    return DB.query("DELETE FROM blockedIps WHERE churchId=? AND serviceId=?;", [churchId, serviceId]);
  }

  public convertToModel(data: any) {
    const result: BlockedIp = {
      id: data.id,
      churchId: data.churchId,
      conversationId: data.conversationId,
      serviceId: data.serviceId,
      ipAddress: data.ipAddress
    };
    return result;
  }

  public convertAllToModel(data: any[]) {
    const result: BlockedIp[] = [];
    data.forEach((d) => result.push(this.convertToModel(d)));
    return result;
  }
}
