import { injectable } from "inversify";
import { eq, and } from "drizzle-orm";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { visibilityPreferences } from "../../../db/schema/membership.js";

@injectable()
export class VisibilityPreferenceRepo extends DrizzleRepo<typeof visibilityPreferences> {
  protected readonly table = visibilityPreferences;
  protected readonly moduleName = "membership";

  public loadForPerson(churchId: string, personId: string) {
    return this.db.select().from(visibilityPreferences)
      .where(and(eq(visibilityPreferences.churchId, churchId), eq(visibilityPreferences.personId, personId)));
  }
}
