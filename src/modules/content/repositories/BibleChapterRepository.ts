import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { BibleChapter } from "../models";
import { BaseRepository } from "../../../shared/infrastructure/BaseRepository";

@injectable()
export class BibleChapterRepository extends BaseRepository<BibleChapter> {
  protected tableName = "bibleChapters";
  protected hasSoftDelete = false;

  protected async create(chapter: BibleChapter): Promise<BibleChapter> {
    if (!chapter.id) chapter.id = this.createId();
    const sql = "INSERT INTO bibleChapters (id, translationKey, bookKey, keyName, number) VALUES (?, ?, ?, ?, ?);";
    const params = [chapter.id, chapter.translationKey, chapter.bookKey, chapter.keyName, chapter.number];
    await TypedDB.query(sql, params);
    return chapter;
  }

  protected async update(chapter: BibleChapter): Promise<BibleChapter> {
    const sql = "UPDATE bibleChapters SET translationKey=?, bookKey=?, keyName=?, number=? WHERE id=?";
    const params = [chapter.translationKey, chapter.bookKey, chapter.keyName, chapter.number, chapter.id];
    await TypedDB.query(sql, params);
    return chapter;
  }

  public saveAll(chapters: BibleChapter[]) {
    const promises: Promise<BibleChapter>[] = [];
    chapters.forEach((b) => {
      promises.push(this.save(b));
    });
    return Promise.all(promises);
  }

  public delete(id: string) {
    return TypedDB.query("DELETE FROM bibleChapters WHERE id=?;", [id]);
  }

  public load(id: string) {
    return TypedDB.queryOne("SELECT * FROM bibleChapters WHERE id=?;", [id]);
  }

  public loadByBook(translationKey: string, bookKey: string) {
    return TypedDB.query("SELECT * FROM bibleChapters WHERE translationKey=? and bookKey=? order by number;", [translationKey, bookKey]);
  }

  protected rowToModel(row: any): BibleChapter {
    return {
      id: row.id,
      translationKey: row.translationKey,
      bookKey: row.bookKey,
      keyName: row.keyName,
      number: row.number
    };
  }
}
