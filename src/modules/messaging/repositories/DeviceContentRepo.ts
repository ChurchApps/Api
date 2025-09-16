import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { DeviceContent } from "../models";
import { injectable } from "inversify";

import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo";

@injectable()
export class DeviceContentRepo extends ConfiguredRepo<DeviceContent> {
  protected get repoConfig(): RepoConfig<DeviceContent> {
    return {
      tableName: "deviceContent",
      hasSoftDelete: false,
      columns: ["deviceId", "contentType", "contentId"]
    };
  }
  public loadByDeviceId(churchId: string, deviceId: string) {
    return TypedDB.query("SELECT * FROM deviceContent WHERE churchId=? AND deviceId=?", [churchId, deviceId]);
  }

  public deleteByDeviceId(churchId: string, deviceId: string) {
    return TypedDB.query("DELETE FROM deviceContent WHERE deviceId=? AND churchId=?;", [deviceId, churchId]);
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
