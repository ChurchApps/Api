import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { TypedDB } from "../helpers";
import { BibleTranslation } from "../models";

@injectable()
export class BibleTranslationRepository {
  public saveAll(translations: BibleTranslation[]) {
    const promises: Promise<BibleTranslation>[] = [];
    translations.forEach((t) => {
      promises.push(this.save(t));
    });
    return Promise.all(promises);
  }

  public save(translation: BibleTranslation) {
    return translation.id ? this.update(translation) : this.create(translation);
  }

  private async create(translation: BibleTranslation) {
    translation.id = UniqueIdHelper.shortId();

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

  private async update(translation: BibleTranslation) {
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
}
