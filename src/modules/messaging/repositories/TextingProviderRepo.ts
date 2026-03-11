import { injectable } from "inversify";
import { eq, and } from "drizzle-orm";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { textingProviders } from "../../../db/schema/messaging.js";

@injectable()
export class TextingProviderRepo extends DrizzleRepo<typeof textingProviders> {
  protected readonly table = textingProviders;
  protected readonly moduleName = "messaging";

  public async loadByChurchId(churchId: string) {
    const result = await this.db.select().from(textingProviders)
      .where(eq(textingProviders.churchId, churchId));
    return result || [];
  }
}
