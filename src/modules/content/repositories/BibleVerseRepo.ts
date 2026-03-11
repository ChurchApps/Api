import { injectable } from "inversify";
import { eq, and, asc } from "drizzle-orm";
import { GlobalDrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { bibleVerses } from "../../../db/schema/content.js";

@injectable()
export class BibleVerseRepo extends GlobalDrizzleRepo<typeof bibleVerses> {
  protected readonly table = bibleVerses;
  protected readonly moduleName = "content";

  public loadByChapter(translationKey: string, chapterKey: string): Promise<any[]> {
    return this.db.select().from(bibleVerses).where(and(eq(bibleVerses.translationKey, translationKey), eq(bibleVerses.chapterKey, chapterKey))).orderBy(asc(bibleVerses.number));
  }

  public saveAll(models: any[]) {
    return Promise.all(models.map((m) => this.save(m)));
  }
}
