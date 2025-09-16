import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { BibleTranslation } from "../models";
import { GlobalConfiguredRepo, GlobalRepoConfig } from "../../../shared/infrastructure/GlobalConfiguredRepo";

@injectable()
export class BibleTranslationRepo extends GlobalConfiguredRepo<BibleTranslation> {
  protected get repoConfig(): GlobalRepoConfig<BibleTranslation> {
    return {
      tableName: "bibleTranslations",
      hasSoftDelete: false,
      columns: ["abbreviation", "name", "nameLocal", "description", "source", "sourceKey", "language", "countries", "copyright", "attributionRequired", "attributionString"],
      defaultOrderBy: "name"
    };
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
