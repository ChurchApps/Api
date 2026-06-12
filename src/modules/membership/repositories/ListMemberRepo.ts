import { injectable } from "inversify";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { UniqueIdHelper } from "@churchapps/apihelper";

@injectable()
export class ListMemberRepo {
  public async loadPersonIds(churchId: string, listId: string): Promise<string[]> {
    const rows = await getDb().selectFrom("listMembers").select("personId").where("churchId", "=", churchId).where("listId", "=", listId).execute();
    return rows.map((r: any) => r.personId);
  }

  public async addPersonIds(churchId: string, listId: string, personIds: string[]) {
    if (personIds.length === 0) return;
    const values = personIds.map((personId) => ({
      id: UniqueIdHelper.shortId(),
      churchId,
      listId,
      personId,
      dateAdded: sql`NOW()` as any
    }));
    await getDb().insertInto("listMembers").values(values).execute();
  }

  public async removePersonIds(churchId: string, listId: string, personIds: string[]) {
    if (personIds.length === 0) return;
    await getDb().deleteFrom("listMembers").where("churchId", "=", churchId).where("listId", "=", listId).where("personId", "in", personIds).execute();
  }

  public async deleteForList(churchId: string, listId: string) {
    await getDb().deleteFrom("listMembers").where("churchId", "=", churchId).where("listId", "=", listId).execute();
  }
}
