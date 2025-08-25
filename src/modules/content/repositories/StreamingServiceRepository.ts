import { DateHelper, UniqueIdHelper } from "@churchapps/apihelper";
import { TypedDB } from "../helpers";
import { StreamingService } from "../models";

export class StreamingServiceRepository {
  public save(service: StreamingService) {
    return service.id ? this.update(service) : this.create(service);
  }

  private async create(service: StreamingService) {
    service.id = UniqueIdHelper.shortId();
    const serviceTime = DateHelper.toMysqlDate(service.serviceTime);
    const sql = "INSERT INTO streamingServices (id, churchId, serviceTime, earlyStart, chatBefore, chatAfter, provider, providerKey, videoUrl, timezoneOffset, recurring, label, sermonId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);";
    const params = [service.id, service.churchId, serviceTime, service.earlyStart, service.chatBefore, service.chatAfter, service.provider, service.providerKey, service.videoUrl, service.timezoneOffset, service.recurring, service.label, service.sermonId];
    await TypedDB.query(sql, params);
    return service;
  }

  private async update(service: StreamingService) {
    const serviceTime = DateHelper.toMysqlDate(service.serviceTime);
    const sql = "UPDATE streamingServices SET serviceTime=?, earlyStart=?, chatBefore=?, chatAfter=?, provider=?, providerKey=?, videoUrl=?, timezoneOffset=?, recurring=?, label=?, sermonId=? WHERE id=?;";
    const params = [serviceTime, service.earlyStart, service.chatBefore, service.chatAfter, service.provider, service.providerKey, service.videoUrl, service.timezoneOffset, service.recurring, service.label, service.sermonId, service.id];
    await TypedDB.query(sql, params);
    return service;
  }

  public delete(id: string, churchId: string) {
    return TypedDB.query("DELETE FROM streamingServices WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public loadById(id: string, churchId: string): Promise<StreamingService> {
    return TypedDB.queryOne("SELECT * FROM streamingServices WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public loadAll(churchId: string): Promise<StreamingService[]> {
    return TypedDB.query("SELECT * FROM streamingServices WHERE churchId=? ORDER BY serviceTime;", [churchId]);
  }

  public loadAllRecurring(): Promise<StreamingService[]> {
    return TypedDB.query("SELECT * FROM streamingServices WHERE recurring=1 ORDER BY serviceTime;", []);
  }
}
