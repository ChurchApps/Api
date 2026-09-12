import { injectable } from "inversify";
import { sql } from "kysely";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { BibleLookup } from "../models/index.js";
import { DateHelper } from "../../../shared/helpers/DateHelper.js";

@injectable()
export class BibleLookupRepo {
  public async save(model: BibleLookup) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: BibleLookup): Promise<BibleLookup> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("bibleLookups").values({
      id: model.id,
      translationKey: model.translationKey,
      lookupTime: sql`NOW()` as any,
      ipAddress: model.ipAddress,
      startVerseKey: model.startVerseKey,
      endVerseKey: model.endVerseKey
    } as any).execute();
    return model;
  }

  private async update(model: BibleLookup): Promise<BibleLookup> {
    await getDb().updateTable("bibleLookups").set({
      translationKey: model.translationKey,
      lookupTime: model.lookupTime,
      ipAddress: model.ipAddress,
      startVerseKey: model.startVerseKey,
      endVerseKey: model.endVerseKey
    } as any).where("id", "=", model.id).execute();
    return model;
  }

  public saveAll(lookups: BibleLookup[]) {
    const promises: Promise<BibleLookup>[] = [];
    lookups.forEach((b) => {
      promises.push(this.save(b));
    });
    return Promise.all(promises);
  }

  public async getStats(startDate: Date, endDate: Date) {
    const start = DateHelper.toMysqlDate(startDate);
    const end = DateHelper.toMysqlDate(endDate);
    const db = getDb();
    // An OR join can't use an index; a keyed derived table turns it into one lookup per row.
    const keys = db.selectFrom("bibleTranslations").select(["abbreviation as k", "abbreviation"])
      .union(db.selectFrom("bibleTranslations").select(["sourceKey as k", "abbreviation"]).where("sourceKey", "is not", null));
    // Collapsing to distinct key/ip pairs first keeps the join off millions of duplicate rows.
    const pairs = db.selectFrom("bibleLookups")
      .select(["translationKey", "ipAddress"])
      .where("lookupTime", ">=", start as any)
      .where("lookupTime", "<=", end as any)
      .groupBy(["translationKey", "ipAddress"]);
    const result = await db.selectFrom(pairs.as("d"))
      .innerJoin(keys.as("m"), "m.k", "d.translationKey")
      .select(["m.abbreviation", sql<number>`count(distinct(d.ipAddress))`.as("lookups")])
      .groupBy("m.abbreviation")
      .orderBy("m.abbreviation")
      .execute();
    return result;
  }

  public async delete(id: string) {
    await getDb().deleteFrom("bibleLookups").where("id", "=", id).execute();
  }

  public async load(id: string): Promise<BibleLookup | undefined> {
    return (await getDb().selectFrom("bibleLookups").selectAll().where("id", "=", id).executeTakeFirst()) ?? null;
  }

  public convertToModel(data: any) { return data as BibleLookup; }
  public convertAllToModel(data: any[]) { return (data || []) as BibleLookup[]; }

  protected rowToModel(row: any): BibleLookup {
    return {
      id: row.id,
      translationKey: row.translationKey,
      lookupTime: row.lookupTime,
      ipAddress: row.ipAddress,
      startVerseKey: row.startVerseKey,
      endVerseKey: row.endVerseKey
    };
  }
}
