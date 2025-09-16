import { DB } from "../../../shared/infrastructure";
import { DeviceContent } from "../models";
import { CollectionHelper } from "../../../shared/helpers";
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

  public convertToModel(churchId: string, data: any) {
    const result: DeviceContent = {
      id: data.id,
      churchId,
      deviceId: data.deviceId,
      contentType: data.contentType,
      contentId: data.contentId
    };
    return result;
  }

  public convertAllToModel(churchId: string, data: any) {
    return CollectionHelper.convertAll<DeviceContent>(data, (d: any) => this.convertToModel(churchId, d));
  }
}
