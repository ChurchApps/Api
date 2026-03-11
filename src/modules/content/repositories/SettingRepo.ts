import { injectable } from "inversify";
import { eq, and, inArray, isNull, sql } from "drizzle-orm";
import { ArrayHelper } from "@churchapps/apihelper";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { contentSettings } from "../../../db/schema/content.js";

@injectable()
export class SettingRepo extends DrizzleRepo<typeof contentSettings> {
  protected readonly table = contentSettings;
  protected readonly moduleName = "content";

  public deleteForUser(churchId: string, userId: string, id: string) {
    return this.db.delete(contentSettings).where(and(eq(contentSettings.id, id), eq(contentSettings.churchId, churchId), eq(contentSettings.userId, userId)));
  }

  public override loadAll(churchId: string) {
    return this.db.select().from(contentSettings).where(and(eq(contentSettings.churchId, churchId), isNull(contentSettings.userId)));
  }

  public loadUser(churchId: string, userId: string) {
    return this.db.select().from(contentSettings).where(and(eq(contentSettings.churchId, churchId), eq(contentSettings.userId, userId)));
  }

  public loadPublicSettings(churchId: string) {
    return this.db.select().from(contentSettings).where(and(eq(contentSettings.churchId, churchId), eq(contentSettings.public, true)));
  }

  public loadAllPublicSettings() {
    return this.db.select().from(contentSettings).where(and(eq(contentSettings.public, true), isNull(contentSettings.userId)));
  }

  public loadMulipleChurches(keyNames: string[], churchIds: string[]) {
    return this.db.select().from(contentSettings).where(and(
      inArray(contentSettings.keyName, keyNames),
      inArray(contentSettings.churchId, churchIds),
      eq(contentSettings.public, true),
      isNull(contentSettings.userId)
    ));
  }

  public loadByKeyNames(churchId: string, keyNames: string[]) {
    return this.db.select().from(contentSettings).where(and(
      inArray(contentSettings.keyName, keyNames),
      eq(contentSettings.churchId, churchId),
      isNull(contentSettings.userId)
    ));
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

  public saveAll(models: any[]) {
    return Promise.all(models.map((m) => this.save(m)));
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
}
