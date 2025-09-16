import { DateHelper } from "@churchapps/apihelper";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { Playlist } from "../models";
import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo";
import { injectable } from "inversify";

@injectable()
export class PlaylistRepo extends ConfiguredRepo<Playlist> {
  protected get repoConfig(): RepoConfig<Playlist> {
    return {
      tableName: "playlists",
      hasSoftDelete: false,
      columns: ["title", "description", "publishDate", "thumbnail"]
    };
  }

  // Override to use TypedDB instead of DB
  protected async create(model: Playlist): Promise<Playlist> {
    const m: any = model as any;
    if (!m[this.idColumn]) m[this.idColumn] = this.createId();
    // Convert publishDate before insert
    if (m.publishDate) {
      m.publishDate = DateHelper.toMysqlDate(m.publishDate);
    }
    const { sql, params } = this.buildInsert(model);
    await TypedDB.query(sql, params);
    return model;
  }

  protected async update(model: Playlist): Promise<Playlist> {
    const m: any = model as any;
    // Convert publishDate before update
    if (m.publishDate) {
      m.publishDate = DateHelper.toMysqlDate(m.publishDate);
    }
    const { sql, params } = this.buildUpdate(model);
    await TypedDB.query(sql, params);
    return model;
  }

  public async delete(churchId: string, id: string): Promise<any> {
    return TypedDB.query("DELETE FROM playlists WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public async load(churchId: string, id: string): Promise<Playlist> {
    return TypedDB.queryOne("SELECT * FROM playlists WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public loadById(id: string, churchId: string): Promise<Playlist> {
    return this.load(churchId, id);
  }

  public async loadAll(churchId: string): Promise<Playlist[]> {
    return TypedDB.query("SELECT * FROM playlists WHERE churchId=? ORDER BY publishDate desc;", [churchId]);
  }

  public loadPublicAll(churchId: string): Promise<Playlist[]> {
    return TypedDB.query("SELECT * FROM playlists WHERE churchId=? ORDER BY publishDate desc;", [churchId]);
  }

  protected rowToModel(row: any): Playlist {
    return {
      id: row.id,
      churchId: row.churchId,
      title: row.title,
      description: row.description,
      publishDate: row.publishDate,
      thumbnail: row.thumbnail
    };
  }
}
