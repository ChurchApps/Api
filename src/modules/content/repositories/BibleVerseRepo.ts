import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB.js";
import { BibleVerse } from "../models/index.js";
import { GlobalConfiguredRepo, GlobalRepoConfig } from "../../../shared/infrastructure/GlobalConfiguredRepo.js";

@injectable()
export class BibleVerseRepo extends GlobalConfiguredRepo<BibleVerse> {
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
