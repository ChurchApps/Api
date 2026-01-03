import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB.js";
import { BibleTranslation } from "../models/index.js";
import { GlobalConfiguredRepo, GlobalRepoConfig } from "../../../shared/infrastructure/GlobalConfiguredRepo.js";

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

  public loadBySourceKey(source: string | null, sourceKey: string) {
    if (source) {
      return TypedDB.queryOne("SELECT * FROM bibleTranslations WHERE source=? and sourceKey=?;", [source, sourceKey]);
    }
    return TypedDB.queryOne("SELECT * FROM bibleTranslations WHERE sourceKey=?;", [sourceKey]);
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
