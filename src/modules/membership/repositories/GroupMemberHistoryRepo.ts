import { injectable } from "inversify";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { UniqueIdHelper } from "@churchapps/apihelper";

@injectable()
export class GroupMemberHistoryRepo {
  public async log(churchId: string, groupId: string, personId: string, action: "joined" | "left") {
    await getDb().insertInto("groupMemberHistory").values({
      id: UniqueIdHelper.shortId(),
      churchId,
      groupId,
      personId,
      action,
      actionDate: sql`NOW()` as any
    }).execute();
  }

  public async loadMonthlyStats(churchId: string, groupId: string, months: number) {
    const rows = await sql<any>`SELECT DATE_FORMAT(actionDate, '%Y-%m') AS month, action, COUNT(*) AS count
      FROM groupMemberHistory
      WHERE churchId=${churchId} AND groupId=${groupId} AND actionDate >= DATE_SUB(CURDATE(), INTERVAL ${months} MONTH)
      GROUP BY month, action
      ORDER BY month`.execute(getDb());
    return rows.rows;
  }

  public async loadCountsSince(churchId: string, since: Date) {
    const rows = await sql<any>`SELECT groupId, action, COUNT(*) AS count
      FROM groupMemberHistory
      WHERE churchId=${churchId} AND actionDate >= ${since}
      GROUP BY groupId, action`.execute(getDb());
    return rows.rows;
  }
}
