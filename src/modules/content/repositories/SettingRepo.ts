import { injectable } from "inversify";
import { ArrayHelper, UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { Setting } from "../models/index.js";

// Sermon auto-import keys legitimately hold several rows per church.
const MULTI_ROW_KEYS = ["youtubeChannelId", "vimeoChannelId", "autoImportSermons"];

function isSingleChurchKey(model: Setting) {
  return !model.userId && !!model.churchId && !!model.keyName && !MULTI_ROW_KEYS.includes(model.keyName);
}

@injectable()
export class SettingRepo {
  public async save(model: Setting) {
    if (!model.id && isSingleChurchKey(model)) {
      const existing = await this.findIdByKey(model.churchId, model.keyName);
      if (existing) model.id = existing;
    }
    const saved = model.id ? await this.update(model) : await this.create(model);
    if (isSingleChurchKey(saved)) await this.deleteSiblings(saved);
    return saved;
  }

  private async findIdByKey(churchId: string, keyName: string) {
    const existing = await getDb().selectFrom("settings").select("id")
      .where("churchId", "=", churchId)
      .where("keyName", "=", keyName)
      .where("userId", "is", null)
      .orderBy("id", "asc").executeTakeFirst();
    return existing?.id;
  }

  private async deleteSiblings(model: Setting) {
    await getDb().deleteFrom("settings")
      .where("churchId", "=", model.churchId)
      .where("keyName", "=", model.keyName)
      .where("userId", "is", null)
      .where("id", "!=", model.id).execute();
  }

  // Duplicate church-level (churchId, keyName) rows make public settings last-write-win; keep the lowest id so Admin and the public site agree.
  private keepOnePerKey(rows: any[]) {
    if (!rows?.length) return rows || [];
    const best = new Map<string, any>();
    const result: any[] = [];
    for (const row of rows) {
      if (MULTI_ROW_KEYS.includes(row.keyName)) { result.push(row); continue; }
      const key = `${row.churchId}\t${row.keyName}`;
      const existing = best.get(key);
      if (!existing || String(row.id) < String(existing.id)) best.set(key, row);
    }
    return result.concat(Array.from(best.values()));
  }

  private async create(model: Setting): Promise<Setting> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("settings").values({
      id: model.id,
      churchId: model.churchId,
      userId: model.userId,
      keyName: model.keyName,
      value: model.value,
      public: model.public
    } as any).execute();
    return model;
  }

  private async update(model: Setting): Promise<Setting> {
    await getDb().updateTable("settings").set({
      userId: model.userId,
      keyName: model.keyName,
      value: model.value,
      public: model.public
    } as any).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("settings").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string): Promise<Setting | undefined> {
    return (await getDb().selectFrom("settings").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async deleteForUser(churchId: string, userId: string, id: string) {
    await getDb().deleteFrom("settings")
      .where("id", "=", id)
      .where("churchId", "=", churchId)
      .where("userId", "=", userId).execute();
  }

  public async loadAll(churchId: string) {
    return this.keepOnePerKey(await getDb().selectFrom("settings").selectAll()
      .where("churchId", "=", churchId)
      .where("userId", "is", null).execute());
  }

  public async loadUser(churchId: string, userId: string) {
    return getDb().selectFrom("settings").selectAll()
      .where("churchId", "=", churchId)
      .where("userId", "=", userId).execute() as any;
  }

  public async loadPublicSettings(churchId: string) {
    return this.keepOnePerKey(await getDb().selectFrom("settings").selectAll()
      .where("churchId", "=", churchId)
      .where("public", "=", 1 as any)
      .where("userId", "is", null).execute());
  }

  public async loadAllPublicSettings() {
    return this.keepOnePerKey(await getDb().selectFrom("settings").selectAll()
      .where("public", "=", 1 as any)
      .where("userId", "is", null).execute());
  }

  public async loadMulipleChurches(keyNames: string[], churchIds: string[]) {
    if (!keyNames || keyNames.length === 0 || !churchIds || churchIds.length === 0) return [];
    return this.keepOnePerKey(await getDb().selectFrom("settings").selectAll()
      .where("keyName", "in", keyNames)
      .where("churchId", "in", churchIds)
      .where("public", "=", 1 as any)
      .where("userId", "is", null).execute());
  }

  public async loadByKeyNames(churchId: string, keyNames: string[]) {
    if (!keyNames || keyNames.length === 0) return [];
    return getDb().selectFrom("settings").selectAll()
      .where("keyName", "in", keyNames)
      .where("churchId", "=", churchId)
      .where("userId", "is", null).execute() as any;
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

  public async saveAll(models: Setting[]) {
    const promises = models.map(m => this.save(m));
    return Promise.all(promises);
  }

  public convertToModel(_churchId: string, data: any) { return data as Setting; }
  public convertAllToModel(_churchId: string, data: any[]) { return (data || []) as Setting[]; }

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
