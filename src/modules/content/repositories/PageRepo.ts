import { injectable } from "inversify";
import { eq, and } from "drizzle-orm";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { pages } from "../../../db/schema/content.js";

@injectable()
export class PageRepo extends DrizzleRepo<typeof pages> {
  protected readonly table = pages;
  protected readonly moduleName = "content";

  public loadByUrl(churchId: string, url: string) {
    return this.db.select().from(pages).where(and(eq(pages.url, url), eq(pages.churchId, churchId))).then(r => r[0] ?? null);
  }
}
