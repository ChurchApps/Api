import { injectable } from "inversify";
import { eq, and, asc } from "drizzle-orm";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { emailTemplates } from "../../../db/schema/messaging.js";

@injectable()
export class EmailTemplateRepo extends DrizzleRepo<typeof emailTemplates> {
  protected readonly table = emailTemplates;
  protected readonly moduleName = "messaging";

  public async save(model: any) {
    const now = new Date();
    if (model.id) {
      model.dateModified = now;
      const { id: _id, churchId: _cid, ...setData } = model;
      await this.db.update(emailTemplates).set(setData)
        .where(and(eq(emailTemplates.id, model.id), eq(emailTemplates.churchId, model.churchId)));
    } else {
      model.id = UniqueIdHelper.shortId();
      model.dateCreated = now;
      model.dateModified = now;
      await this.db.insert(emailTemplates).values(model);
    }
    return model;
  }

  public async loadByChurchId(churchId: string) {
    const result = await this.db.select({
      id: emailTemplates.id,
      churchId: emailTemplates.churchId,
      name: emailTemplates.name,
      subject: emailTemplates.subject,
      category: emailTemplates.category,
      dateCreated: emailTemplates.dateCreated,
      dateModified: emailTemplates.dateModified
    })
      .from(emailTemplates)
      .where(eq(emailTemplates.churchId, churchId))
      .orderBy(asc(emailTemplates.name));
    return result || [];
  }

  public async loadById(churchId: string, id: string) {
    return this.db.select().from(emailTemplates)
      .where(and(eq(emailTemplates.id, id), eq(emailTemplates.churchId, churchId)))
      .then(r => r[0] ?? null);
  }

  public async delete(churchId: string, id: string) {
    await this.db.delete(emailTemplates)
      .where(and(eq(emailTemplates.id, id), eq(emailTemplates.churchId, churchId)));
  }
}
