import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { TypedDB } from "../helpers";
import { SongDetailLink } from "../models";

@injectable()
export class SongDetailLinkRepository {
  public saveAll(links: SongDetailLink[]) {
    const promises: Promise<SongDetailLink>[] = [];
    links.forEach((sd) => {
      promises.push(this.save(sd));
    });
    return Promise.all(promises);
  }

  public save(link: SongDetailLink) {
    return link.id ? this.update(link) : this.create(link);
  }

  private async create(link: SongDetailLink) {
    link.id = UniqueIdHelper.shortId();
    const sql = "INSERT INTO songDetailLinks (id, songDetailId, service, serviceKey, url) VALUES (?, ?, ?, ?, ?);";
    const params = [link.id, link.songDetailId, link.service, link.serviceKey, link.url || null];
    await TypedDB.query(sql, params);
    return link;
  }

  private async update(link: SongDetailLink) {
    const sql = "UPDATE songDetailLinks SET songDetailId=?, service=?, serviceKey=?, url=? WHERE id=?";
    const params = [link.songDetailId, link.service, link.serviceKey, link.url, link.id];
    await TypedDB.query(sql, params);
    return link;
  }

  public delete(id: string) {
    return TypedDB.query("DELETE FROM songDetailLinks WHERE id=?;", [id]);
  }

  public load(id: string) {
    return TypedDB.queryOne("SELECT * FROM songDetailLinks WHERE id=?;", [id]);
  }

  public loadForSongDetail(songDetailId: string) {
    return TypedDB.query("SELECT * FROM songDetailLinks WHERE songDetailId=? ORDER BY service;", [songDetailId]);
  }

  public loadByServiceAndKey(service: string, serviceKey: string) {
    return TypedDB.queryOne("SELECT * FROM songDetailLinks WHERE service=? AND serviceKey=?;", [service, serviceKey]);
  }
}
