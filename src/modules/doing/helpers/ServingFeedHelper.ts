import * as ics from "ics";
import { Time } from "../models/index.js";
import type { Repos } from "../repositories/index.js";
import { DateHelper } from "../../../shared/helpers/DateHelper.js";
import { AppUrlHelper } from "../../../shared/helpers/AppUrlHelper.js";
import { getMembershipModuleGateway } from "../../../shared/modules/index.js";
import { ServingFeedTokenHelper } from "./ServingFeedTokenHelper.js";

export interface ServingFeedRow {
  assignmentId: string;
  positionName?: string;
  categoryName?: string;
  planId: string;
  planName?: string;
  serviceDate?: Date | string;
}

// One event per service time that applies to the position's team; a plan without
// usable times becomes an all-day event on its service date.
export class ServingFeedHelper {
  static async link(churchId: string, personId: string, reset = false) {
    const token = reset ? await ServingFeedTokenHelper.reset(churchId, personId) : await ServingFeedTokenHelper.create(churchId, personId);
    return { churchId, personId, token };
  }

  // null when the token does not verify for exactly this church and person; nothing is loaded before that.
  static async calendar(churchId: unknown, personId: unknown, token: unknown, repos: Repos): Promise<ics.ReturnObject | null> {
    if (!await ServingFeedTokenHelper.verify(churchId, personId, token)) return null;
    const rows = await repos.assignment.loadAcceptedForFeed(churchId as string, personId as string);
    const planIds = [...new Set(rows.map((r) => r.planId))];
    const times = (await repos.time.loadByPlanIds(churchId as string, planIds)) as Time[];
    const church = rows.length > 0 ? await getMembershipModuleGateway().loadChurch(churchId as string) : null;
    const base = AppUrlHelper.b1AppUrl(church?.subDomain || "app");
    const events = this.buildEvents(rows, times, (planId) => `${base}/mobile/plans/${planId}`);
    return ics.createEvents(events, { calName: church?.name ? `Serving at ${church.name}` : "Serving schedule" });
  }

  static timesForRow(row: ServingFeedRow, times: Time[]): Time[] {
    const planTimes = times.filter((t) => t.planId === row.planId && t.startTime && !isNaN(new Date(t.startTime).getTime()));
    const team = planTimes.filter((t) => row.categoryName && typeof t.teams === "string" && t.teams.indexOf(row.categoryName) > -1);
    if (team.length > 0) return team;
    return planTimes.filter((t) => (t.serviceTimeType || "service") === "service");
  }

  static buildEvents(rows: ServingFeedRow[], times: Time[], planUrl: (planId: string) => string): ics.EventAttributes[] {
    const result: ics.EventAttributes[] = [];
    rows.forEach((row) => {
      const title = [row.positionName, row.planName].filter(Boolean).join(" · ") || "Serving";
      const url = planUrl(row.planId);
      const rowTimes = this.timesForRow(row, times);
      if (rowTimes.length > 0) {
        rowTimes.forEach((t) => {
          const start = new Date(t.startTime).getTime();
          const end = t.endTime && new Date(t.endTime).getTime() > start ? new Date(t.endTime).getTime() : start + 60 * 60 * 1000;
          const description = [`Serving as ${row.positionName || "a volunteer"} for ${row.planName || "a service"}.`, t.displayName, url].filter(Boolean).join("\n");
          result.push({ uid: `${row.assignmentId}-${t.id}@b1.church`, start, end, title, description });
        });
      } else {
        const date = DateHelper.toMysqlDateOnly(row.serviceDate as Date);
        if (!date) return;
        const [y, m, d] = date.split("-").map(Number);
        const next = new Date(Date.UTC(y, m - 1, d + 1));
        result.push({
          uid: `${row.assignmentId}@b1.church`,
          start: [y, m, d],
          end: [next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate()],
          title,
          description: `Serving as ${row.positionName || "a volunteer"} for ${row.planName || "a service"}.\n${url}`
        });
      }
    });
    return result;
  }
}
