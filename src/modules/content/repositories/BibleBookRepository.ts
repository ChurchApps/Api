import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { BibleBook } from "../models";
import { GlobalConfiguredRepository, GlobalRepoConfig } from "../../../shared/infrastructure/GlobalConfiguredRepository";

@injectable()
export class BibleBookRepository extends GlobalConfiguredRepository<BibleBook> {
  protected get repoConfig(): GlobalRepoConfig<BibleBook> {
    return {
      tableName: "bibleBooks",
      hasSoftDelete: false,
      insertColumns: ["translationKey", "keyName", "abbreviation", "name", "sort"],
      updateColumns: ["translationKey", "keyName", "abbreviation", "name", "sort"],
      defaultOrderBy: "sort"
    };
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
