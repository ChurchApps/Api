import { injectable } from "inversify";
import { eq, and } from "drizzle-orm";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { blockedIps } from "../../../db/schema/messaging.js";

@injectable()
export class BlockedIpRepo extends DrizzleRepo<typeof blockedIps> {
  protected readonly table = blockedIps;
  protected readonly moduleName = "messaging";

  // Toggle behavior: if exists delete, if not insert
  public async save(blockedIp: any) {
    const existing = await this.db.select({ id: blockedIps.id })
      .from(blockedIps)
      .where(and(
        eq(blockedIps.churchId, blockedIp.churchId),
        eq(blockedIps.conversationId, blockedIp.conversationId),
        eq(blockedIps.ipAddress, blockedIp.ipAddress)
      ));
    if (existing[0]?.id) {
      await this.db.delete(blockedIps).where(eq(blockedIps.id, existing[0].id));
      return;
    }
    return super.save(blockedIp);
  }

  public async loadByConversationId(churchId: string, conversationId: string) {
    const result = await this.db.select()
      .from(blockedIps)
      .where(and(eq(blockedIps.churchId, churchId), eq(blockedIps.conversationId, conversationId)));
    return (result || []).map((d: any) => d.ipAddress);
  }

  public async loadByServiceId(churchId: string, serviceId: string) {
    const result = await this.db.select()
      .from(blockedIps)
      .where(and(eq(blockedIps.churchId, churchId), eq(blockedIps.serviceId, serviceId)));
    return result || [];
  }

  public async deleteByServiceId(churchId: string, serviceId: string) {
    await this.db.delete(blockedIps)
      .where(and(eq(blockedIps.churchId, churchId), eq(blockedIps.serviceId, serviceId)));
  }


}
