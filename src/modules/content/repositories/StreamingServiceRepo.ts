import { injectable } from "inversify";
import { sql } from "kysely";
import { DateHelper, UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { StreamingService } from "../models/index.js";

@injectable()
export class StreamingServiceRepo {
  public async save(model: StreamingService) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: StreamingService): Promise<StreamingService> {
    model.id = UniqueIdHelper.shortId();
    const serviceTime = DateHelper.toMysqlDate(model.serviceTime);
    await getDb().insertInto("streamingServices").values({
      id: model.id,
      churchId: model.churchId,
      serviceTime,
      earlyStart: model.earlyStart,
      chatBefore: model.chatBefore,
      chatAfter: model.chatAfter,
      provider: model.provider,
      providerKey: model.providerKey,
      videoUrl: model.videoUrl,
      timezoneOffset: model.timezoneOffset,
      recurring: model.recurring,
      label: model.label,
      sermonId: model.sermonId
    } as any).execute();
    return model;
  }

  private async update(model: StreamingService): Promise<StreamingService> {
    const serviceTime = DateHelper.toMysqlDate(model.serviceTime);
    await getDb().updateTable("streamingServices").set({
      serviceTime,
      earlyStart: model.earlyStart,
      chatBefore: model.chatBefore,
      chatAfter: model.chatAfter,
      provider: model.provider,
      providerKey: model.providerKey,
      videoUrl: model.videoUrl,
      timezoneOffset: model.timezoneOffset,
      recurring: model.recurring,
      label: model.label,
      sermonId: model.sermonId
    } as any).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(id: string, churchId: string) {
    await getDb().deleteFrom("streamingServices").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string): Promise<StreamingService | undefined> {
    return (await getDb().selectFrom("streamingServices").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string): Promise<StreamingService[]> {
    return getDb().selectFrom("streamingServices").selectAll().where("churchId", "=", churchId).orderBy("serviceTime").execute() as any;
  }

  public async loadById(id: string, churchId: string): Promise<StreamingService | undefined> {
    return (await getDb().selectFrom("streamingServices").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAllRecurring(): Promise<StreamingService[]> {
    return getDb().selectFrom("streamingServices").selectAll()
      .where("recurring", "=", 1 as any)
      .orderBy("serviceTime").execute() as any;
  }

  public async advanceRecurringServices(): Promise<void> {
    await sql`UPDATE streamingServices SET serviceTime = DATE_ADD(serviceTime, INTERVAL CEIL(TIMESTAMPDIFF(DAY, serviceTime, DATE_ADD(NOW(), INTERVAL 6 HOUR)) / 7) * 7 DAY) WHERE recurring = 1 AND serviceTime < DATE_SUB(NOW(), INTERVAL 6 HOUR)`.execute(getDb());
  }

  public convertToModel(_churchId: string, data: any) { return data as StreamingService; }
  public convertAllToModel(_churchId: string, data: any[]) { return (data || []) as StreamingService[]; }

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
