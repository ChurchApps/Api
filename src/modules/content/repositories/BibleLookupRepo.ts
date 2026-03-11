import { injectable } from "inversify";
import { eq, sql } from "drizzle-orm";
import { GlobalDrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { bibleLookups } from "../../../db/schema/content.js";
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
    return this.executeRows(sql`
      SELECT bt.abbreviation, COUNT(DISTINCT(bl.ipAddress)) as lookups
      FROM bibleTranslations bt
      INNER JOIN bibleLookups bl ON bl.translationKey = bt.abbreviation
      WHERE bl.lookupTime BETWEEN ${startDate} AND ${endDate}
      GROUP BY bt.abbreviation
      ORDER BY bt.abbreviation
    `);
  }
}
