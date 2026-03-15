import { injectable } from "inversify";
import { eq, and, sql } from "drizzle-orm";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { registrationMembers } from "../../../db/schema/content.js";

@injectable()
export class RegistrationMemberRepo extends DrizzleRepo<typeof registrationMembers> {
  protected readonly table = registrationMembers;
  protected readonly moduleName = "content";

  public async loadForRegistration(churchId: string, registrationId: string) {
    return this.db.select().from(registrationMembers).where(and(eq(registrationMembers.churchId, churchId), eq(registrationMembers.registrationId, registrationId)));
  }

  public async loadForEvent(churchId: string, eventId: string): Promise<any[]> {
    return this.executeRows(sql`
      SELECT rm.* FROM registrationMembers rm
      INNER JOIN registrations r ON rm.registrationId = r.id
      WHERE r.churchId = ${churchId} AND r.eventId = ${eventId}
    `);
  }

  public async deleteForRegistration(churchId: string, registrationId: string) {
    await this.db.delete(registrationMembers).where(and(eq(registrationMembers.churchId, churchId), eq(registrationMembers.registrationId, registrationId)));
  }
}
