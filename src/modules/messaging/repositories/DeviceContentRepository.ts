import { DB } from "../../../shared/infrastructure";
import { DeviceContent } from "../models";
import { injectable } from "inversify";

import { ConfiguredRepository, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepository";

@injectable()
export class DeviceContentRepository extends ConfiguredRepository<DeviceContent> {
  protected get repoConfig(): RepoConfig<DeviceContent> {
    return {
      tableName: "deviceContent",
      hasSoftDelete: false,
      insertColumns: ["deviceId", "contentType", "contentId"],
      updateColumns: ["deviceId", "contentType", "contentId"]
    };
  }
  public loadByDeviceId(churchId: string, deviceId: string) {
    return DB.query("SELECT * FROM deviceContent WHERE churchId=? AND deviceId=?", [churchId, deviceId]);
  }

  public deleteByDeviceId(churchId: string, deviceId: string) {
    return DB.query("DELETE FROM deviceContent WHERE deviceId=? AND churchId=?;", [deviceId, churchId]);
  }

  protected rowToModel(row: any): DeviceContent {
    return {
      id: row.id,
      churchId: row.churchId,
      deviceId: row.deviceId,
      contentType: row.contentType,
      contentId: row.contentId
    };
  }
}
