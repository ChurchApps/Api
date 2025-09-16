import { injectable } from "inversify";
import { DateHelper } from "@churchapps/apihelper";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { StreamingService } from "../models";
import { ConfiguredRepository, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepository";

@injectable()
export class StreamingServiceRepository extends ConfiguredRepository<StreamingService> {
  protected get repoConfig(): RepoConfig<StreamingService> {
    return {
      tableName: "streamingServices",
      hasSoftDelete: false,
      columns: ["serviceTime", "earlyStart", "chatBefore", "chatAfter", "provider", "providerKey", "videoUrl", "timezoneOffset", "recurring", "label", "sermonId"]
    };
  }

  // Override to use TypedDB and handle date conversion
  protected async create(service: StreamingService): Promise<StreamingService> {
    const m: any = service as any;
    if (!m[this.idColumn]) m[this.idColumn] = this.createId();

    // Convert serviceTime to MySQL format for database insertion
    const serviceTime = DateHelper.toMysqlDate(service.serviceTime);
    const modifiedService = { ...service, serviceTime } as any;

    const { sql, params } = this.buildInsert(modifiedService);
    await TypedDB.query(sql, params);
    return service;
  }

  protected async update(service: StreamingService): Promise<StreamingService> {
    // Convert serviceTime to MySQL format for database update
    const serviceTime = DateHelper.toMysqlDate(service.serviceTime);
    const modifiedService = { ...service, serviceTime } as any;

    const { sql, params } = this.buildUpdate(modifiedService);
    await TypedDB.query(sql, params);
    return service;
  }

  public async delete(id: string, churchId: string): Promise<any> {
    return TypedDB.query("DELETE FROM streamingServices WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public async load(churchId: string, id: string): Promise<StreamingService> {
    return TypedDB.queryOne("SELECT * FROM streamingServices WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public async loadAll(churchId: string): Promise<StreamingService[]> {
    return TypedDB.query("SELECT * FROM streamingServices WHERE churchId=? ORDER BY serviceTime;", [churchId]);
  }

  public loadById(id: string, churchId: string): Promise<StreamingService> {
    return TypedDB.queryOne("SELECT * FROM streamingServices WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public loadAllRecurring(): Promise<StreamingService[]> {
    return TypedDB.query("SELECT * FROM streamingServices WHERE recurring=1 ORDER BY serviceTime;", []);
  }

  protected rowToModel(row: any): StreamingService {
    return {
      id: row.id,
      churchId: row.churchId,
      serviceTime: row.serviceTime,
      earlyStart: row.earlyStart,
      chatBefore: row.chatBefore,
      chatAfter: row.chatAfter,
      provider: row.provider,
      providerKey: row.providerKey,
      videoUrl: row.videoUrl,
      timezoneOffset: row.timezoneOffset,
      recurring: row.recurring,
      label: row.label,
      sermonId: row.sermonId
    };
  }
}
