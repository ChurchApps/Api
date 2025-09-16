import { DateHelper } from "@churchapps/apihelper";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { EventException } from "../models";
import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo";
import { injectable } from "inversify";

@injectable()
export class EventExceptionRepo extends ConfiguredRepo<EventException> {
  protected get repoConfig(): RepoConfig<EventException> {
    return {
      tableName: "eventExceptions",
      hasSoftDelete: false,
      columns: ["eventId", "exceptionDate"]
    };
  }

  // Override to handle date conversion
  protected async create(model: EventException): Promise<EventException> {
    const m: any = model as any;
    if (!m[this.idColumn]) m[this.idColumn] = this.createId();
    // Convert exceptionDate before insert
    if (m.exceptionDate) {
      m.exceptionDate = DateHelper.toMysqlDate(m.exceptionDate);
    }
    const { sql, params } = this.buildInsert(model);
    await TypedDB.query(sql, params);
    return model;
  }

  protected async update(model: EventException): Promise<EventException> {
    const m: any = model as any;
    // Convert exceptionDate before update
    if (m.exceptionDate) {
      m.exceptionDate = DateHelper.toMysqlDate(m.exceptionDate);
    }
    const { sql, params } = this.buildUpdate(model);
    await TypedDB.query(sql, params);
    return model;
  }

  public loadForEvents(churchId: string, eventIds: string[]) {
    return TypedDB.query("SELECT * FROM eventExceptions WHERE churchId=? and eventId in (?);", [churchId, eventIds]);
  }

  protected rowToModel(row: any): EventException {
    return {
      id: row.id,
      churchId: row.churchId,
      eventId: row.eventId,
      exceptionDate: row.exceptionDate
    };
  }
}
