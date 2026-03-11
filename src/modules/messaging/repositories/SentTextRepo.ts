import { injectable } from "inversify";
import { eq, and, desc } from "drizzle-orm";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { sentTexts } from "../../../db/schema/messaging.js";

@injectable()
export class SentTextRepo extends DrizzleRepo<typeof sentTexts> {
  protected readonly table = sentTexts;
  protected readonly moduleName = "messaging";

  public async save(model: any) {
    if (model.id) {
      await this.db.update(sentTexts).set(model)
        .where(and(eq(sentTexts.id, model.id), eq(sentTexts.churchId, model.churchId)));
    } else {
      model.id = UniqueIdHelper.shortId();
      model.timeSent = new Date();
      await this.db.insert(sentTexts).values(model);
    }
    return model;
  }

  public async loadByChurchId(churchId: string) {
    const result = await this.db.select().from(sentTexts)
      .where(eq(sentTexts.churchId, churchId))
      .orderBy(desc(sentTexts.timeSent));
    return result || [];
  }

  public async loadById(churchId: string, id: string) {
    return this.db.select().from(sentTexts)
      .where(and(eq(sentTexts.id, id), eq(sentTexts.churchId, churchId)))
      .then(r => r[0] ?? null);
  }
}
