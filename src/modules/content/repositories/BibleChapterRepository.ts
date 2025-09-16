import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { BibleChapter } from "../models";
import { GlobalConfiguredRepository, GlobalRepoConfig } from "../../../shared/infrastructure/GlobalConfiguredRepository";

@injectable()
export class BibleChapterRepository extends GlobalConfiguredRepository<BibleChapter> {
  protected get repoConfig(): GlobalRepoConfig<BibleChapter> {
    return {
      tableName: "bibleChapters",
      hasSoftDelete: false,
      insertColumns: ["translationKey", "bookKey", "keyName", "number"],
      updateColumns: ["translationKey", "bookKey", "keyName", "number"],
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
