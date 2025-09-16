import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { BibleTranslation } from "../models";
import { BaseRepository } from "../../../shared/infrastructure/BaseRepository";

@injectable()
export class BibleTranslationRepository extends BaseRepository<BibleTranslation> {
  protected tableName = "bibleTranslations";
  protected hasSoftDelete = false;

  protected async create(translation: BibleTranslation): Promise<BibleTranslation> {
    if (!translation.id) translation.id = this.createId();
    const sql =
      "INSERT INTO bibleTranslations (id, abbreviation, name, nameLocal, description, source, sourceKey, language, countries, copyright, attributionRequired, attributionString) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);";
    const params = [
      translation.id,
      translation.abbreviation,
      translation.name,
      translation.nameLocal,
      translation.description,
      translation.source,
      translation.sourceKey,
      translation.language,
      translation.countries,
      translation.copyright,
      translation.attributionRequired,
      translation.attributionString
    ];
    await TypedDB.query(sql, params);
    return translation;
  }

  protected async update(translation: BibleTranslation): Promise<BibleTranslation> {
    const sql =
      "UPDATE bibleTranslations SET abbreviation=?, name=?, nameLocal=?, description=?, source=?, sourceKey=?, language=?, countries=?, copyright=?, attributionRequired=?, attributionString=? WHERE id=?";
    const params = [
      translation.abbreviation,
      translation.name,
      translation.nameLocal,
      translation.description,
      translation.source,
      translation.sourceKey,
      translation.language,
      translation.countries,
      translation.copyright,
      translation.attributionRequired,
      translation.attributionString,
      translation.id
    ];
    await TypedDB.query(sql, params);
    return translation;
  }

  public saveAll(translations: BibleTranslation[]) {
    const promises: Promise<BibleTranslation>[] = [];
    translations.forEach((t) => {
      promises.push(this.save(t));
    });
    return Promise.all(promises);
  }

  public delete(id: string) {
    return TypedDB.query("DELETE FROM bibleTranslations WHERE id=?;", [id]);
  }

  public load(id: string) {
    return TypedDB.queryOne("SELECT * FROM bibleTranslations WHERE id=?;", [id]);
  }

  public loadBySourceKey(source: string, sourceKey: string) {
    return TypedDB.queryOne("SELECT * FROM bibleTranslations WHERE source=? and sourceKey=?;", [source, sourceKey]);
  }

  public loadAll() {
    return TypedDB.query("SELECT * FROM bibleTranslations order by name;", []);
  }

  public loadNeedingCopyrights() {
    return TypedDB.query("SELECT * FROM bibleTranslations where copyright is null;", []);
  }

  protected rowToModel(row: any): BibleTranslation {
    return {
      id: row.id,
      abbreviation: row.abbreviation,
      name: row.name,
      nameLocal: row.nameLocal,
      description: row.description,
      source: row.source,
      sourceKey: row.sourceKey,
      language: row.language,
      countries: row.countries,
      copyright: row.copyright,
      attributionRequired: row.attributionRequired,
      attributionString: row.attributionString
    };
  }
}
