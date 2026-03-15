import { injectable } from "inversify";
import { eq, asc } from "drizzle-orm";
import { GlobalDrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { bibleBooks } from "../../../db/schema/content.js";

@injectable()
export class BibleBookRepo extends GlobalDrizzleRepo<typeof bibleBooks> {
  protected readonly table = bibleBooks;
  protected readonly moduleName = "content";

  public loadByTranslation(translationKey: string): Promise<any[]> {
    return this.db.select().from(bibleBooks).where(eq(bibleBooks.translationKey, translationKey)).orderBy(asc(bibleBooks.sort));
  }

  public saveAll(models: any[]) {
    return Promise.all(models.map((m) => this.save(m)));
  }
}
