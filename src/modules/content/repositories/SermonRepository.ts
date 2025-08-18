import { UniqueIdHelper, DateHelper } from "@churchapps/apihelper";
import { TypedDB } from "../helpers";
import { Sermon } from "../models";

export class SermonRepository {
  public save(sermon: Sermon) {
    return sermon.id ? this.update(sermon) : this.create(sermon);
  }

  private async create(sermon: Sermon) {
    sermon.id = UniqueIdHelper.shortId();
    const publishDate = DateHelper.toMysqlDate(sermon.publishDate);
    const sql =
      "INSERT INTO sermons (id, churchId, playlistId, videoType, videoData, videoUrl, title, description, publishDate, thumbnail, duration, permanentUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);";
    const params = [
      sermon.id,
      sermon.churchId,
      sermon.playlistId,
      sermon.videoType,
      sermon.videoData,
      sermon.videoUrl,
      sermon.title,
      sermon.description,
      publishDate,
      sermon.thumbnail,
      sermon.duration,
      sermon.permanentUrl
    ];
    await TypedDB.query(sql, params);
    return sermon;
  }

  private async update(sermon: Sermon) {
    const publishDate = DateHelper.toMysqlDate(sermon.publishDate);
    const sql =
      "UPDATE sermons SET playlistId=?, videoType=?, videoData=?, videoUrl=?, title=?, description=?, publishDate=?, thumbnail=?, duration=?, permanentUrl=? WHERE id=? and churchId=?;";
    const params = [
      sermon.playlistId,
      sermon.videoType,
      sermon.videoData,
      sermon.videoUrl,
      sermon.title,
      sermon.description,
      publishDate,
      sermon.thumbnail,
      sermon.duration,
      sermon.permanentUrl,
      sermon.id,
      sermon.churchId
    ];
    await TypedDB.query(sql, params);
    return sermon;
  }

  public delete(id: string, churchId: string) {
    return TypedDB.query("DELETE FROM sermons WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public loadById(id: string, churchId: string): Promise<Sermon> {
    return TypedDB.queryOne("SELECT * FROM sermons WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public loadAll(churchId: string): Promise<Sermon[]> {
    return TypedDB.query("SELECT * FROM sermons WHERE churchId=? ORDER BY publishDate desc;", [churchId]);
  }

  public loadPublicAll(churchId: string): Promise<Sermon[]> {
    return TypedDB.query("SELECT * FROM sermons WHERE churchId=? ORDER BY publishDate desc;", [churchId]);
  }

  public async loadTimeline(sermonIds: string[]) {
    const sql =
      "select 'sermon' as postType, id as postId, title, description, thumbnail" + " from sermons" + " where id in (?)";

    const params = [sermonIds];
    const result = await TypedDB.query(sql, params);
    return result;
  }
}
