import { injectable } from "inversify";
import { eq, and, asc } from "drizzle-orm";
import { GlobalDrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { bibleChapters } from "../../../db/schema/content.js";

@injectable()
export class BibleChapterRepo extends GlobalDrizzleRepo<typeof bibleChapters> {
  protected readonly table = bibleChapters;
  protected readonly moduleName = "content";

  public loadByBook(translationKey: string, bookKey: string): Promise<any[]> {
    return this.db.select().from(bibleChapters).where(and(eq(bibleChapters.translationKey, translationKey), eq(bibleChapters.bookKey, bookKey))).orderBy(asc(bibleChapters.number));
  }

  public saveAll(models: any[]) {
    return Promise.all(models.map((m) => this.save(m)));
  }
}
