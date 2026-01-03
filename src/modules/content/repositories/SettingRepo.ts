import { injectable } from "inversify";
import { ArrayHelper } from "@churchapps/apihelper";
import { TypedDB } from "../../../shared/infrastructure/TypedDB.js";
import { Setting } from "../models/index.js";
import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo.js";

@injectable()
export class SettingRepo extends ConfiguredRepo<Setting> {
  protected get repoConfig(): RepoConfig<Setting> {
    return {
      tableName: "settings",
      hasSoftDelete: false,
      columns: ["userId", "keyName", "value", "public"]
    };
  }

  public deleteForUser(churchId: string, userId: string, id: string) {
    return TypedDB.query("DELETE FROM settings WHERE id=? and churchId=? and userId=?;", [id, churchId, userId]);
  }

  public loadAll(churchId: string) {
    return TypedDB.query("SELECT * FROM settings WHERE churchId=? and userId is null;", [churchId]);
  }

  public loadUser(churchId: string, userId: string) {
    return TypedDB.query("SELECT * FROM settings WHERE churchId=? and userId=?;", [churchId, userId]);
  }

  public loadPublicSettings(churchId: string) {
    return TypedDB.query("SELECT * FROM settings WHERE churchId=? AND public=?", [churchId, 1]);
  }

  public loadAllPublicSettings() {
    return TypedDB.query("SELECT * FROM settings WHERE public=1 and userId is null;", []);
  }

  public loadMulipleChurches(keyNames: string[], churchIds: string[]) {
    return TypedDB.query("SELECT * FROM settings WHERE keyName in (?) AND churchId IN (?) AND public=1 and userId is null", [keyNames, churchIds]);
  }

  public loadByKeyNames(churchId: string, keyNames: string[]) {
    return TypedDB.query("SELECT * FROM settings WHERE keyName in (?) AND churchId=? and userId is null;", [keyNames, churchId]);
  }

  public getImports(data: any[], type?: string, playlistId?: string, channelId?: string) {
    let result: any[] = [];
    if (playlistId && channelId) {
      const filterType = type === "youtube" ? "youtubeChannelId" : "vimeoChannelId";
      const filteredByPlaylist = data.filter((d) => d.keyName === "autoImportSermons" && d.value.includes(playlistId));
      const filteredByChannel = data.filter((d) => d.keyName === filterType && d.value === channelId);
      const channelIds = ArrayHelper.getIds(filteredByChannel, "id");
      const filtered = filteredByPlaylist.filter((d) => {
        const id = d.value.split("|#");
        return channelIds.indexOf(id[1]) >= 0;
      });
      if (filtered.length > 0) {
        const split = filtered[0].value.split("|#");
        const getChannelId = ArrayHelper.getOne(filteredByChannel, "id", split[1]);
        result = [{ channel: getChannelId, ...filtered[0] }];
      }
    } else {
      const filterByCategory = data.filter((d) => d.keyName === "autoImportSermons");
      if (filterByCategory.length > 0) {
        let filtered: any[] = [];
        if (type === "youtube") {
          const filterByYoutube = data.filter((d) => d.keyName === "youtubeChannelId");
          const ids = ArrayHelper.getIds(filterByYoutube, "id");
          filtered = filterByCategory.filter((d) => {
            const id = d.value.split("|#");
            return ids.indexOf(id[1]) >= 0;
          });
        } else if (type === "vimeo") {
          const filterByVimeo = data.filter((d) => d.keyName === "vimeoChannelId");
          const ids = ArrayHelper.getIds(filterByVimeo, "id");
          filtered = filterByCategory.filter((d) => {
            const id = d.value.split("|#");
            return ids.indexOf(id[1]) >= 0;
          });
        } else {
          filtered = filterByCategory;
        }
        filtered.forEach((row) => {
          const split = row.value.split("|#");
          const getchannel = ArrayHelper.getOne(data, "id", split[1]);
          result.push({ channel: getchannel, ...row });
        });
      }
    }
    return result;
  }

  public convertAllImports(data: any[]) {
    const result: any[] = [];
    data.forEach((d) => {
      result.push({
        id: d.id,
        churchId: d.churchId,
        keyName: d.keyName,
        playlistId: d.value.split("|#")[0],
        [d?.channel?.keyName]: d?.channel?.value
      });
    });
    return result;
  }

  protected rowToModel(row: any): Setting {
    return {
      id: row.id,
      churchId: row.churchId,
      userId: row.userId,
      keyName: row.keyName,
      value: row.value,
      public: row.public
    };
  }
}
