import { DateHelper, UniqueIdHelper } from "@churchapps/apihelper";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { Sermon } from "../models/index.js";
import { injectable } from "inversify";

@injectable()
export class SermonRepo {
  public async save(model: Sermon) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: Sermon): Promise<Sermon> {
    model.id = UniqueIdHelper.shortId();
    const publishDate = model.publishDate ? DateHelper.toMysqlDate(model.publishDate) : model.publishDate;
    await getDb().insertInto("sermons").values({
      id: model.id,
      churchId: model.churchId,
      playlistId: model.playlistId,
      videoType: model.videoType,
      videoData: model.videoData,
      videoUrl: model.videoUrl,
      title: model.title,
      description: model.description,
      publishDate,
      thumbnail: model.thumbnail,
      duration: model.duration,
      permanentUrl: model.permanentUrl,
      audioUrl: model.audioUrl ?? null
    }).execute();
    return model;
  }

  private async update(model: Sermon): Promise<Sermon> {
    const publishDate = model.publishDate ? DateHelper.toMysqlDate(model.publishDate) : model.publishDate;
    await getDb().updateTable("sermons").set({
      playlistId: model.playlistId,
      videoType: model.videoType,
      videoData: model.videoData,
      videoUrl: model.videoUrl,
      title: model.title,
      description: model.description,
      publishDate,
      thumbnail: model.thumbnail,
      duration: model.duration,
      permanentUrl: model.permanentUrl,
      audioUrl: model.audioUrl ?? null
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("sermons").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string): Promise<Sermon | undefined> {
    return (await getDb().selectFrom("sermons").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public loadById(id: string, churchId: string): Promise<Sermon | undefined> {
    return this.load(churchId, id);
  }

  public async loadAll(churchId: string): Promise<Sermon[]> {
    return getDb().selectFrom("sermons").selectAll().where("churchId", "=", churchId).orderBy("publishDate", "desc").execute();
  }

  public async loadPublicAll(churchId: string): Promise<Sermon[]> {
    return getDb().selectFrom("sermons").selectAll()
      .where("churchId", "=", churchId)
      .where((eb) => eb.or([eb("publishDate", "is", null), eb("publishDate", "<=", sql<Date>`NOW()`)]))
      .orderBy("publishDate", "desc").execute();
  }

  public async loadTimeline(churchId: string, sermonIds: string[]) {
    if (!sermonIds || sermonIds.length === 0) return [];
    const result = await sql`select 'sermon' as postType, id as postId, title, description, thumbnail
      from sermons
      where churchId = ${churchId}
      and id in (${sql.join(sermonIds.map(id => sql`${id}`), sql`,`)})`.execute(getDb());
    return result.rows;
  }

  public convertToModel(_churchId: string, data: Sermon) { return data; }
  public convertAllToModel(_churchId: string, data: Sermon[]) { return data || []; }

  protected rowToModel(row: Sermon): Sermon {
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
      permanentUrl: row.permanentUrl,
      audioUrl: row.audioUrl
    };
  }
}
