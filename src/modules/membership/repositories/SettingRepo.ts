import { injectable } from "inversify";
import { eq, and, inArray } from "drizzle-orm";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { membershipSettings } from "../../../db/schema/membership.js";

@injectable()
export class SettingRepo extends DrizzleRepo<typeof membershipSettings> {
  protected readonly table = membershipSettings;
  protected readonly moduleName = "membership";

  public convertToModel(_churchId: string, data: any) { return data; }
  public convertAllToModel(_churchId: string, data: any) { return Array.isArray(data) ? data : []; }

  public loadPublicSettings(churchId: string) {
    return this.db.select().from(membershipSettings)
      .where(and(eq(membershipSettings.churchId, churchId), eq(membershipSettings.public, true)));
  }

  public loadMulipleChurches(keyNames: string[], churchIds: string[]) {
    if (!keyNames.length || !churchIds.length) return Promise.resolve([]);
    return this.db.select().from(membershipSettings)
      .where(and(
        inArray(membershipSettings.keyName, keyNames),
        inArray(membershipSettings.churchId, churchIds),
        eq(membershipSettings.public, true)
      ));
  }
}
