import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { BibleVerse } from "../models";
import { BaseRepository } from "../../../shared/infrastructure/BaseRepository";

@injectable()
export class BibleVerseRepository extends BaseRepository<BibleVerse> {
  protected tableName = "bibleVerses";
  protected hasSoftDelete = false;

  protected async create(verse: BibleVerse): Promise<BibleVerse> {
    if (!verse.id) verse.id = this.createId();
    const sql = "INSERT INTO bibleVerses (id, translationKey, chapterKey, keyName, number) VALUES (?, ?, ?, ?, ?);";
    const params = [verse.id, verse.translationKey, verse.chapterKey, verse.keyName, verse.number];
    await TypedDB.query(sql, params);
    return verse;
  }

  protected async update(verse: BibleVerse): Promise<BibleVerse> {
    const sql = "UPDATE bibleVerses SET translationKey=?, chapterKey=?, keyName=?, number=? WHERE id=?";
    const params = [verse.translationKey, verse.chapterKey, verse.keyName, verse.number, verse.id];
    await TypedDB.query(sql, params);
    return verse;
  }

  public saveAll(verses: BibleVerse[]) {
    const promises: Promise<BibleVerse>[] = [];
    verses.forEach((v) => {
      promises.push(this.save(v));
    });
    return Promise.all(promises);
  }

  public delete(id: string) {
    return TypedDB.query("DELETE FROM bibleVerses WHERE id=?;", [id]);
  }

  public load(id: string) {
    return TypedDB.queryOne("SELECT * FROM bibleVerses WHERE id=?;", [id]);
  }

  public loadByChapter(translationKey: string, chapterKey: string) {
    return TypedDB.query("SELECT * FROM bibleVerses WHERE translationKey=? and chapterKey=? order by number;", [translationKey, chapterKey]);
  }

  protected rowToModel(row: any): BibleVerse {
    return {
      id: row.id,
      translationKey: row.translationKey,
      chapterKey: row.chapterKey,
      keyName: row.keyName,
      number: row.number
    };
  }
}
