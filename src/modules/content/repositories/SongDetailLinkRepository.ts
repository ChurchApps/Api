import { injectable } from "inversify";
import { TypedDB } from "../helpers";
import { SongDetailLink } from "../models";
import { ConfiguredRepository, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepository";

@injectable()
export class SongDetailLinkRepository extends ConfiguredRepository<SongDetailLink> {
  protected get repoConfig(): RepoConfig<SongDetailLink> {
    return {
      tableName: "songDetailLinks",
      hasSoftDelete: false,
      insertColumns: ["songDetailId", "service", "serviceKey", "url"],
      updateColumns: ["songDetailId", "service", "serviceKey", "url"]
    };
  }

  // Override to use TypedDB instead of DB
  protected async create(model: SongDetailLink): Promise<SongDetailLink> {
    const m: any = model as any;
    if (!m[this.idColumn]) m[this.idColumn] = this.createId();
    const { sql, params } = this.buildInsert(model);
    await TypedDB.query(sql, params);
    return model;
  }

  protected async update(model: SongDetailLink): Promise<SongDetailLink> {
    const { sql, params } = this.buildUpdate(model);
    await TypedDB.query(sql, params);
    return model;
  }

  public async delete(id: string): Promise<any> {
    return TypedDB.query("DELETE FROM songDetailLinks WHERE id=?;", [id]);
  }

  public async load(id: string): Promise<SongDetailLink> {
    return TypedDB.queryOne("SELECT * FROM songDetailLinks WHERE id=?;", [id]);
  }

  public saveAll(links: SongDetailLink[]) {
    const promises: Promise<SongDetailLink>[] = [];
    links.forEach((sd) => {
      promises.push(this.save(sd));
    });
    return Promise.all(promises);
  }

  public loadForSongDetail(songDetailId: string) {
    return TypedDB.query("SELECT * FROM songDetailLinks WHERE songDetailId=? ORDER BY service;", [songDetailId]);
  }

  public loadByServiceAndKey(service: string, serviceKey: string) {
    return TypedDB.queryOne("SELECT * FROM songDetailLinks WHERE service=? AND serviceKey=?;", [service, serviceKey]);
  }

  protected rowToModel(row: any): SongDetailLink {
    return {
      id: row.id,
      songDetailId: row.songDetailId,
      service: row.service,
      serviceKey: row.serviceKey,
      url: row.url
    };
  }
}
