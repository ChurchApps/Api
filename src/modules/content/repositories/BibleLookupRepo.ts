import { injectable } from "inversify";
import { eq, between, asc, countDistinct } from "drizzle-orm";
import { GlobalDrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { bibleLookups, bibleTranslations } from "../../../db/schema/content.js";
import { UniqueIdHelper } from "@churchapps/apihelper";

@injectable()
export class BibleLookupRepo extends GlobalDrizzleRepo<typeof bibleLookups> {
  protected readonly table = bibleLookups;
  protected readonly moduleName = "content";

  public async save(lookup: any) {
    if (lookup.id) {
      const { id: _id, ...setData } = lookup;
      await this.db.update(bibleLookups).set(setData).where(eq(bibleLookups.id, lookup.id));
    } else {
      lookup.id = UniqueIdHelper.shortId();
      lookup.lookupTime = new Date();
      await this.db.insert(bibleLookups).values(lookup);
    }
    return lookup;
  }

  public saveAll(lookups: any[]) {
    return Promise.all(lookups.map((b) => this.save(b)));
  }

  public async getStats(startDate: Date, endDate: Date): Promise<any[]> {
    return this.db.select({
      abbreviation: bibleTranslations.abbreviation,
      lookups: countDistinct(bibleLookups.ipAddress)
    })
      .from(bibleTranslations)
      .innerJoin(bibleLookups, eq(bibleLookups.translationKey, bibleTranslations.abbreviation))
      .where(between(bibleLookups.lookupTime, startDate, endDate))
      .groupBy(bibleTranslations.abbreviation)
      .orderBy(asc(bibleTranslations.abbreviation));
  }
}
