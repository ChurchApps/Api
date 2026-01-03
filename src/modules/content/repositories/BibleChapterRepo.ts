import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB.js";
import { BibleChapter } from "../models/index.js";
import { GlobalConfiguredRepo, GlobalRepoConfig } from "../../../shared/infrastructure/GlobalConfiguredRepo.js";

@injectable()
export class BibleChapterRepo extends GlobalConfiguredRepo<BibleChapter> {
  protected get repoConfig(): GlobalRepoConfig<BibleChapter> {
    return {
      tableName: "bibleChapters",
      hasSoftDelete: false,
      columns: ["translationKey", "bookKey", "keyName", "number"],
      defaultOrderBy: "number"
    };
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
