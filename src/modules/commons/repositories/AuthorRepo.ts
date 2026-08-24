import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";

@injectable()
export class AuthorRepo {
  public async findOrCreate(name: string): Promise<string> {
    const existing = await getDb().selectFrom("authors").select("id").where("name", "=", name).executeTakeFirst();
    if (existing?.id) return existing.id;
    const id = UniqueIdHelper.shortId();
    await getDb().insertInto("authors").values({ id, name }).execute();
    return id;
  }
}
