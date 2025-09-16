import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { BibleVerse } from "../models";
import { GlobalConfiguredRepository, GlobalRepoConfig } from "../../../shared/infrastructure/GlobalConfiguredRepository";

@injectable()
export class BibleVerseRepository extends GlobalConfiguredRepository<BibleVerse> {
  protected get repoConfig(): GlobalRepoConfig<BibleVerse> {
    return {
      tableName: "bibleVerses",
      hasSoftDelete: false,
      columns: ["translationKey", "chapterKey", "keyName", "number"],
      defaultOrderBy: "number"
    };
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
