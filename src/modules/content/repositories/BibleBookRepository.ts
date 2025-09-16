import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { BibleBook } from "../models";
import { BaseRepository } from "../../../shared/infrastructure/BaseRepository";

@injectable()
export class BibleBookRepository extends BaseRepository<BibleBook> {
  protected tableName = "bibleBooks";
  protected hasSoftDelete = false;

  protected async create(book: BibleBook): Promise<BibleBook> {
    if (!book.id) book.id = this.createId();
    const sql = "INSERT INTO bibleBooks (id, translationKey, keyName, abbreviation, name, sort) VALUES (?, ?, ?, ?, ?, ?);";
    const params = [book.id, book.translationKey, book.keyName, book.abbreviation, book.name, book.sort];
    await TypedDB.query(sql, params);
    return book;
  }

  protected async update(book: BibleBook): Promise<BibleBook> {
    const sql = "UPDATE bibleBooks SET translationKey=?, keyName=?, abbreviation=?, name=?, sort=? WHERE id=?";
    const params = [book.translationKey, book.keyName, book.abbreviation, book.name, book.sort, book.id];
    await TypedDB.query(sql, params);
    return book;
  }

  public saveAll(books: BibleBook[]) {
    const promises: Promise<BibleBook>[] = [];
    books.forEach((b) => {
      promises.push(this.save(b));
    });
    return Promise.all(promises);
  }

  public delete(id: string) {
    return TypedDB.query("DELETE FROM bibleBooks WHERE id=?;", [id]);
  }

  public load(id: string) {
    return TypedDB.queryOne("SELECT * FROM bibleBooks WHERE id=?;", [id]);
  }

  public loadAll(translationKey: string) {
    return TypedDB.query("SELECT * FROM bibleBooks WHERE translationKey=? order by sort;", [translationKey]);
  }

  protected rowToModel(row: any): BibleBook {
    return {
      id: row.id,
      translationKey: row.translationKey,
      keyName: row.keyName,
      abbreviation: row.abbreviation,
      name: row.name,
      sort: row.sort
    };
  }
}
