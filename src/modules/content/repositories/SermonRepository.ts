import { DateHelper } from "@churchapps/apihelper";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { Sermon } from "../models";
import { ConfiguredRepository, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepository";
import { injectable } from "inversify";

@injectable()
export class SermonRepository extends ConfiguredRepository<Sermon> {
  protected get repoConfig(): RepoConfig<Sermon> {
    return {
      tableName: "sermons",
      hasSoftDelete: false,
      columns: ["playlistId", "videoType", "videoData", "videoUrl", "title", "description", "publishDate", "thumbnail", "duration", "permanentUrl"]
    };
  }

  // Override to use TypedDB instead of DB
  protected async create(model: Sermon): Promise<Sermon> {
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

  protected async update(model: Sermon): Promise<Sermon> {
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
    return TypedDB.query("DELETE FROM sermons WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public async load(churchId: string, id: string): Promise<Sermon> {
    return TypedDB.queryOne("SELECT * FROM sermons WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public loadById(id: string, churchId: string): Promise<Sermon> {
    return this.load(churchId, id);
  }

  public async loadAll(churchId: string): Promise<Sermon[]> {
    return TypedDB.query("SELECT * FROM sermons WHERE churchId=? ORDER BY publishDate desc;", [churchId]);
  }

  public loadPublicAll(churchId: string): Promise<Sermon[]> {
    return TypedDB.query("SELECT * FROM sermons WHERE churchId=? ORDER BY publishDate desc;", [churchId]);
  }

  public async loadTimeline(sermonIds: string[]) {
    const sql = "select 'sermon' as postType, id as postId, title, description, thumbnail" + " from sermons" + " where id in (?)";

    const params = [sermonIds];
    const result = await TypedDB.query(sql, params);
    return result;
  }

  protected rowToModel(row: any): Sermon {
    return {
      id: row.id,
      churchId: row.churchId,
      playlistId: row.playlistId,
      videoType: row.videoType,
      videoData: row.videoData,
      videoUrl: row.videoUrl,
      title: row.title,
      description: row.description,
      publishDate: row.publishDate,
      thumbnail: row.thumbnail,
      duration: row.duration,
      permanentUrl: row.permanentUrl
    };
  }
}
