import { injectable } from "inversify";
import { TypedDB } from "../helpers";
import { CuratedCalendar } from "../models";
import { ConfiguredRepository, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepository";

@injectable()
export class CuratedCalendarRepository extends ConfiguredRepository<CuratedCalendar> {
  protected get repoConfig(): RepoConfig<CuratedCalendar> {
    return {
      tableName: "curatedCalendars",
      hasSoftDelete: false,
      insertColumns: ["name"],
      updateColumns: ["name"]
    };
  }

  // Override to use TypedDB instead of DB
  protected async create(model: CuratedCalendar): Promise<CuratedCalendar> {
    const m: any = model as any;
    if (!m[this.idColumn]) m[this.idColumn] = this.createId();
    const { sql, params } = this.buildInsert(model);
    await TypedDB.query(sql, params);
    return model;
  }

  protected async update(model: CuratedCalendar): Promise<CuratedCalendar> {
    const { sql, params } = this.buildUpdate(model);
    await TypedDB.query(sql, params);
    return model;
  }

  public async delete(churchId: string, id: string): Promise<any> {
    return TypedDB.query("DELETE FROM curatedCalendars WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public async load(churchId: string, id: string): Promise<CuratedCalendar> {
    return TypedDB.queryOne("SELECT * FROM curatedCalendars WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public async loadAll(churchId: string): Promise<CuratedCalendar[]> {
    return TypedDB.query("SELECT * FROM curatedCalendars WHERE churchId=?;", [churchId]);
  }

  protected rowToModel(row: any): CuratedCalendar {
    return {
      id: row.id,
      churchId: row.churchId,
      name: row.name
    };
  }
}
