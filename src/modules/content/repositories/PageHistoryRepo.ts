import { TypedDB } from "../../../shared/infrastructure/TypedDB.js";
import { PageHistory } from "../models/index.js";
import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo.js";
import { injectable } from "inversify";

@injectable()
export class PageHistoryRepo extends ConfiguredRepo<PageHistory> {
  protected get repoConfig(): RepoConfig<PageHistory> {
    return {
      tableName: "pageHistory",
      hasSoftDelete: false,
      defaultOrderBy: "createdDate DESC",
      columns: ["pageId", "blockId", "snapshotJSON", "description", "userId", "createdDate"]
    };
  }

  public loadForPage(churchId: string, pageId: string, limit: number = 50) {
    // Note: LIMIT doesn't work with prepared statement parameters in some MySQL versions
    return TypedDB.query(
      `SELECT * FROM pageHistory WHERE churchId=? AND pageId=? ORDER BY createdDate DESC LIMIT ${parseInt(String(limit), 10)};`,
      [churchId, pageId]
    );
  }

  public loadForBlock(churchId: string, blockId: string, limit: number = 50) {
    // Note: LIMIT doesn't work with prepared statement parameters in some MySQL versions
    return TypedDB.query(
      `SELECT * FROM pageHistory WHERE churchId=? AND blockId=? ORDER BY createdDate DESC LIMIT ${parseInt(String(limit), 10)};`,
      [churchId, blockId]
    );
  }

  public async deleteOldHistory(churchId: string, pageId: string, daysToKeep: number = 30) {
    await TypedDB.query("DELETE FROM pageHistory WHERE churchId=? AND pageId=? AND createdDate < DATE_SUB(NOW(), INTERVAL ? DAY);", [churchId, pageId, daysToKeep]);
  }

  protected rowToModel(row: any): PageHistory {
    return {
      id: row.id,
      churchId: row.churchId,
      pageId: row.pageId,
      blockId: row.blockId,
      snapshotJSON: row.snapshotJSON,
      description: row.description,
      userId: row.userId,
      createdDate: row.createdDate
    };
  }
}
