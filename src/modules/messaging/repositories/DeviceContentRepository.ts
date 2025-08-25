import { DB } from "../../../shared/infrastructure";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { DeviceContent } from "../models";

export class DeviceContentRepository {
  public loadByChurchId(churchId: string) {
    return DB.query("SELECT * FROM deviceContent WHERE churchId=?", [churchId]);
  }

  public loadByDeviceId(churchId: string, deviceId: string) {
    return DB.query("SELECT * FROM deviceContent WHERE churchId=? AND deviceId=?", [churchId, deviceId]);
  }

  public loadById(churchId: string, id: string) {
    return DB.queryOne("SELECT * FROM deviceContent WHERE id=? and churchId=?;", [id, churchId]);
  }

  public delete(churchId: string, id: string) {
    return DB.query("DELETE FROM deviceContent WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public deleteByDeviceId(churchId: string, deviceId: string) {
    return DB.query("DELETE FROM deviceContent WHERE deviceId=? AND churchId=?;", [deviceId, churchId]);
  }

  public save(deviceContent: DeviceContent) {
    return deviceContent.id ? this.update(deviceContent) : this.create(deviceContent);
  }

  private async create(deviceContent: DeviceContent): Promise<DeviceContent> {
    deviceContent.id = UniqueIdHelper.shortId();
    const sql = "INSERT INTO deviceContent (id, churchId, deviceId, contentType, contentId) VALUES (?, ?, ?, ?, ?);";
    const params = [deviceContent.id, deviceContent.churchId, deviceContent.deviceId, deviceContent.contentType, deviceContent.contentId];
    await DB.query(sql, params);
    return deviceContent;
  }

  private async update(deviceContent: DeviceContent) {
    const sql = "UPDATE deviceContent SET deviceId=?, contentType=?, contentId=? WHERE id=? AND churchId=?;";
    const params = [deviceContent.deviceId, deviceContent.contentType, deviceContent.contentId, deviceContent.id, deviceContent.churchId];
    await DB.query(sql, params);
    return deviceContent;
  }

  public convertToModel(data: any) {
    const result: DeviceContent = {
      id: data.id,
      churchId: data.churchId,
      deviceId: data.deviceId,
      contentType: data.contentType,
      contentId: data.contentId
    };
    return result;
  }

  public convertAllToModel(data: any[]) {
    const result: DeviceContent[] = [];
    data.forEach((d) => result.push(this.convertToModel(d)));
    return result;
  }
}
