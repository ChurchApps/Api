import { TypedDB } from "../helpers";
import { File } from "../models";
import { ArrayHelper, UniqueIdHelper } from "@churchapps/apihelper";

export class FileRepository {
  public save(file: File) {
    if (UniqueIdHelper.isMissing(file.id)) return this.create(file);
    else return this.update(file);
  }

  public async create(file: File) {
    file.id = UniqueIdHelper.shortId();
    const sql = "INSERT INTO files (id, churchId, contentType, contentId, fileName, contentPath, fileType, size, dateModified) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW());";
    const params = [file.id, file.churchId, file.contentType, file.contentId, file.fileName, file.contentPath, file.fileType, file.size];
    await TypedDB.query(sql, params);
    return file;
  }

  public async update(file: File) {
    const sql = "UPDATE files SET contentType=?, contentId=?, fileName=?, contentPath=?, fileType=?, size=?, dateModified=? WHERE id=? AND churchId=?";
    const params = [file.contentType, file.contentId, file.fileName, file.contentPath, file.fileType, file.size, file.dateModified, file.id, file.churchId];
    await TypedDB.query(sql, params);
    return file;
  }

  public load(churchId: string, id: string): Promise<File> {
    return TypedDB.queryOne("SELECT * FROM files WHERE id=? AND churchId=?", [id, churchId]);
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

  public delete(churchId: string, id: string): Promise<File> {
    return TypedDB.query("DELETE FROM files WHERE id=? AND churchId=?", [id, churchId]);
  }
}
