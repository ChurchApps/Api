import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB.js";
import { CuratedCalendar } from "../models/index.js";
import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo.js";

@injectable()
export class CuratedCalendarRepo extends ConfiguredRepo<CuratedCalendar> {
  protected get repoConfig(): RepoConfig<CuratedCalendar> {
    return {
      tableName: "curatedCalendars",
      hasSoftDelete: false,
      columns: ["name"]
    };
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
