import { injectable } from "inversify";
import { eq, and, inArray, sql } from "drizzle-orm";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { files } from "../../../db/schema/content.js";

@injectable()
export class FileRepo extends DrizzleRepo<typeof files> {
  protected readonly table = files;
  protected readonly moduleName = "content";

  public override async save(model: any) {
    if (model.id) {
      const { id: _id, churchId: _cid, ...setData } = model;
      await this.db.update(files).set(setData).where(and(eq(files.id, model.id), eq(files.churchId, model.churchId)));
    } else {
      model.id = UniqueIdHelper.shortId();
      model.dateModified = new Date();
      await this.db.insert(files).values(model);
    }
    return model;
  }

  public loadByIds(churchId: string, ids: string[]) {
    return this.db.select().from(files).where(and(eq(files.churchId, churchId), inArray(files.id, ids)));
  }

  public loadForContent(churchId: string, contentType: string, contentId: string) {
    return this.db.select().from(files).where(and(eq(files.churchId, churchId), eq(files.contentType, contentType), eq(files.contentId, contentId)));
  }

  public loadForWebsite(churchId: string) {
    return this.db.select().from(files).where(and(eq(files.churchId, churchId), eq(files.contentType, "website")));
  }

  public async loadTotalBytes(churchId: string, contentType: string, contentId: string): Promise<any> {
    return this.db.select({ size: sql<number>`COALESCE(SUM(${files.size}), 0)`.as("size") })
      .from(files)
      .where(and(eq(files.churchId, churchId), eq(files.contentType, contentType), eq(files.contentId, contentId)));
  }
}
