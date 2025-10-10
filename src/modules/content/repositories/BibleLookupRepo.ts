import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { BibleLookup } from "../models";
import { BaseRepo } from "../../../shared/infrastructure/BaseRepo";

@injectable()
export class BibleLookupRepo extends BaseRepo<BibleLookup> {
  protected tableName = "bibleLookups";
  protected hasSoftDelete = false;

  protected async create(lookup: BibleLookup): Promise<BibleLookup> {
    if (!lookup.id) lookup.id = this.createId();
    const sql = "INSERT INTO bibleLookups (id, translationKey, lookupTime, ipAddress, startVerseKey, endVerseKey) VALUES (?, ?, now(), ?, ?, ?);";
    const params = [lookup.id, lookup.translationKey, lookup.ipAddress, lookup.startVerseKey, lookup.endVerseKey];
    await TypedDB.query(sql, params);
    return lookup;
  }

  protected async update(lookup: BibleLookup): Promise<BibleLookup> {
    const sql = "UPDATE bibleLookups SET translationKey=?, lookupTime=?, ipAddress=?, startVerseKey=?, endVerseKey=? WHERE id=?";
    const params = [lookup.translationKey, lookup.lookupTime, lookup.ipAddress, lookup.startVerseKey, lookup.endVerseKey, lookup.id];
    await TypedDB.query(sql, params);
    return lookup;
  }

  public saveAll(lookups: BibleLookup[]) {
    const promises: Promise<BibleLookup>[] = [];
    lookups.forEach((b) => {
      promises.push(this.save(b));
    });
    return Promise.all(promises);
  }

  public async getStats(startDate: Date, endDate: Date) {
    const sql =
      "SELECT bt.abbreviation, count(distinct(bl.ipAddress)) as lookups" +
      " FROM bibleTranslations bt" +
      " INNER JOIN bibleLookups bl ON bl.translationKey = bt.abbreviation" +
      " WHERE bl.lookupTime BETWEEN ? AND ?" +
      " GROUP BY bt.abbreviation" +
      " ORDER BY bt.abbreviation;";
    const params = [startDate, endDate];
    return TypedDB.query(sql, params);
  }

  public delete(id: string) {
    return TypedDB.query("DELETE FROM bibleLookups WHERE id=?;", [id]);
  }

  public load(id: string) {
    return TypedDB.queryOne("SELECT * FROM bibleLookups WHERE id=?;", [id]);
  }

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
