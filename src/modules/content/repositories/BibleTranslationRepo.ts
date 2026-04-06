import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { BibleTranslation } from "../models/index.js";

@injectable()
export class BibleTranslationRepo {
  public async save(model: BibleTranslation) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: BibleTranslation): Promise<BibleTranslation> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("bibleTranslations").values({
      id: model.id,
      abbreviation: model.abbreviation,
      name: model.name,
      nameLocal: model.nameLocal,
      description: model.description,
      source: model.source,
      sourceKey: model.sourceKey,
      language: model.language,
      countries: model.countries,
      copyright: model.copyright,
      attributionRequired: model.attributionRequired,
      attributionString: model.attributionString
    } as any).execute();
    return model;
  }

  private async update(model: BibleTranslation): Promise<BibleTranslation> {
    await getDb().updateTable("bibleTranslations").set({
      abbreviation: model.abbreviation,
      name: model.name,
      nameLocal: model.nameLocal,
      description: model.description,
      source: model.source,
      sourceKey: model.sourceKey,
      language: model.language,
      countries: model.countries,
      copyright: model.copyright,
      attributionRequired: model.attributionRequired,
      attributionString: model.attributionString
    }).where("id", "=", model.id).execute();
    return model;
  }

  public async delete(id: string) {
    await getDb().deleteFrom("bibleTranslations").where("id", "=", id).execute();
  }

  public async load(id: string): Promise<BibleTranslation | undefined> {
    return (await getDb().selectFrom("bibleTranslations").selectAll().where("id", "=", id).executeTakeFirst()) ?? null;
  }

  public async loadBySourceKey(source: string | null, sourceKey: string) {
    if (source) {
      return (await getDb().selectFrom("bibleTranslations").selectAll()
        .where("source", "=", source)
        .where("sourceKey", "=", sourceKey)
        .executeTakeFirst()) ?? null;
    }
    return (await getDb().selectFrom("bibleTranslations").selectAll()
      .where("sourceKey", "=", sourceKey)
      .executeTakeFirst()) ?? null;
  }

  public async loadAll() {
    return getDb().selectFrom("bibleTranslations").selectAll().orderBy("name").execute() as any;
  }

  public async loadNeedingCopyrights() {
    return getDb().selectFrom("bibleTranslations").selectAll().where("copyright", "is", null).execute() as any;
  }

  public async saveAll(models: BibleTranslation[]) {
    const promises = models.map(m => this.save(m));
    return Promise.all(promises);
  }

  public convertToModel(data: any) { return data as BibleTranslation; }
  public convertAllToModel(data: any[]) { return (data || []) as BibleTranslation[]; }

  protected rowToModel(row: any): BibleTranslation {
    return {
      id: row.id,
      abbreviation: row.abbreviation,
      name: row.name,
      nameLocal: row.nameLocal,
      description: row.description,
      source: row.source,
      sourceKey: row.sourceKey,
      language: row.language,
      countries: row.countries,
      copyright: row.copyright,
      attributionRequired: row.attributionRequired,
      attributionString: row.attributionString
    };
  }
}
