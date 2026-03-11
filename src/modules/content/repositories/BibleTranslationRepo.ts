import { injectable } from "inversify";
import { eq, and, asc, isNull } from "drizzle-orm";
import { GlobalDrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { bibleTranslations } from "../../../db/schema/content.js";

@injectable()
export class BibleTranslationRepo extends GlobalDrizzleRepo<typeof bibleTranslations> {
  protected readonly table = bibleTranslations;
  protected readonly moduleName = "content";

  public loadBySourceKey(source: string | null, sourceKey: string) {
    if (source) {
      return this.db.select().from(bibleTranslations).where(and(eq(bibleTranslations.source, source), eq(bibleTranslations.sourceKey, sourceKey))).then(r => r[0] ?? null);
    }
    return this.db.select().from(bibleTranslations).where(eq(bibleTranslations.sourceKey, sourceKey)).then(r => r[0] ?? null);
  }

  public loadAll(): Promise<any[]> {
    return this.db.select().from(bibleTranslations).orderBy(asc(bibleTranslations.name));
  }

  public loadNeedingCopyrights(): Promise<any[]> {
    return this.db.select().from(bibleTranslations).where(isNull(bibleTranslations.copyright));
  }

  public saveAll(models: any[]) {
    return Promise.all(models.map((m) => this.save(m)));
  }
}
