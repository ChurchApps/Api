import { injectable } from "inversify";
import { eq, and, inArray } from "drizzle-orm";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { notificationPreferences } from "../../../db/schema/messaging.js";

@injectable()
export class NotificationPreferenceRepo extends DrizzleRepo<typeof notificationPreferences> {
  protected readonly table = notificationPreferences;
  protected readonly moduleName = "messaging";

  public async loadByPersonId(churchId: string, personId: string) {
    return this.db.select().from(notificationPreferences)
      .where(and(eq(notificationPreferences.churchId, churchId), eq(notificationPreferences.personId, personId)))
      .then(r => r[0] ?? null);
  }

  public async loadByChurchId(churchId: string) {
    const result = await this.db.select().from(notificationPreferences)
      .where(eq(notificationPreferences.churchId, churchId));
    return result || [];
  }

  public async loadByPersonIds(personIds: string[]) {
    if (!personIds || personIds.length === 0) return [];
    const result = await this.db.select().from(notificationPreferences)
      .where(inArray(notificationPreferences.personId, personIds));
    return result || [];
  }
}
