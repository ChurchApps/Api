import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { File } from "../models";
import { ArrayHelper } from "@churchapps/apihelper";

import { ConfiguredRepository, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepository";

export class FileRepository extends ConfiguredRepository<File> {
  protected get repoConfig(): RepoConfig<File> {
    return {
      tableName: "files",
      hasSoftDelete: false,
      insertColumns: ["contentType", "contentId", "fileName", "contentPath", "fileType", "size"],
      updateColumns: ["contentType", "contentId", "fileName", "contentPath", "fileType", "size", "dateModified"],
      insertLiterals: {
        dateModified: "NOW()"
      }
    };
  }

  public async delete(churchId: string, id: string): Promise<any> {
    return TypedDB.query("DELETE FROM files WHERE id=? AND churchId=?", [id, churchId]);
  }

  public async load(churchId: string, id: string): Promise<File> {
    return TypedDB.queryOne("SELECT * FROM files WHERE id=? AND churchId=?", [id, churchId]);
  }

  public async loadAll(churchId: string): Promise<File[]> {
    return TypedDB.query("SELECT * FROM files WHERE churchId=?", [churchId]);
  }

  public loadByIds(churchId: string, ids: string[]): Promise<File[]> {
    const sql = "SELECT * FROM files WHERE churchId=? AND id IN (" + ArrayHelper.fillArray("?", ids.length) + ")";
    return TypedDB.query(sql, [churchId].concat(ids));
  }

  public loadForContent(churchId: string, contentType: string, contentId: string): Promise<File[]> {
    return TypedDB.query("SELECT * FROM files WHERE churchId=? and contentType=? and contentId=?", [churchId, contentType, contentId]);
  }

  public loadForWebsite(churchId: string): Promise<File[]> {
    return TypedDB.query("SELECT * FROM files WHERE churchId=? and contentType='website'", [churchId]);
  }

  public loadTotalBytes(churchId: string, contentType: string, contentId: string): Promise<{ size: number }> {
    return TypedDB.query("select IFNULL(sum(size), 0) as size from files where churchId=? and contentType=? and contentId=?", [churchId, contentType, contentId]);
  }
}
