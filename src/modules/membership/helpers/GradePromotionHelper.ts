import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { Repos } from "../repositories/index.js";
import { RepoManager } from "../../../shared/infrastructure/RepoManager.js";
import { Setting } from "../models/index.js";
import { GRADES, nextGrade } from "./GradeMapping.js";

export { GRADES, nextGrade };

const pad2 = (n: number) => String(n).padStart(2, "0");

export class GradePromotionHelper {
  public static async promoteChurch(churchId: string): Promise<void> {
    const cases = GRADES.slice(0, -1).map((g, i) => sql`WHEN ${g} THEN ${GRADES[i + 1]}`);
    await sql`
      UPDATE people
      SET grade = CASE grade ${sql.join(cases, sql` `)} ELSE grade END
      WHERE churchId = ${churchId} AND removed = 0 AND grade IS NOT NULL AND grade <> 'Graduated'
    `.execute(getDb());
  }

  public static async checkPromotions(): Promise<{ promoted: number }> {
    const repos = await RepoManager.getRepos<Repos>("membership");
    const dateSettings = (await repos.setting.loadAllByKeyName("gradePromotionDate")) as Setting[];
    if (!dateSettings.length) return { promoted: 0 };

    const lastRunSettings = (await repos.setting.loadAllByKeyName("gradePromotionLastRun")) as Setting[];
    const lastRunByChurch = new Map<string, Setting>();
    lastRunSettings.forEach((s) => lastRunByChurch.set(s.churchId, s));

    const now = new Date();
    const year = String(now.getFullYear());
    const todayMMDD = `${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;

    let promoted = 0;
    for (const setting of dateSettings) {
      const mmdd = (setting.value || "").trim();
      if (!/^\d{2}-\d{2}$/.test(mmdd)) continue;
      const lastRun = lastRunByChurch.get(setting.churchId);
      if (lastRun?.value === year) continue;
      // >= so a day missed by a downed timer still self-heals on the next run this year.
      if (todayMMDD < mmdd) continue;

      try {
        await this.promoteChurch(setting.churchId);
        if (lastRun) {
          lastRun.value = year;
          await repos.setting.save(lastRun);
        } else {
          await repos.setting.save({ churchId: setting.churchId, keyName: "gradePromotionLastRun", value: year });
        }
        promoted++;
      } catch (e) {
        console.error(`[GradePromotionHelper] Promotion failed for church ${setting.churchId}:`, e);
      }
    }
    return { promoted };
  }
}
