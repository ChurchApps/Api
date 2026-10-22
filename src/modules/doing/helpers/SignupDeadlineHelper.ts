import { Plan, Time } from "../models/index.js";
import { getMembershipModuleGateway } from "../../../shared/modules/index.js";
import { ScreenScheduleHelper } from "./ScreenScheduleHelper.js";

// A plan's signup closes signupDeadlineHours before its first service time. Times are
// stored as instants; serviceDate is a date-only column, so a plan with no times falls
// back to 9:00 on that date in the church's zone (the default B1Admin gives a new time).
export class SignupDeadlineHelper {
  static readonly FALLBACK_HOUR = 9;

  static compute(plan: Plan, times: Time[], timeZone?: string): Date | null {
    if (!plan?.signupDeadlineHours || !plan.serviceDate) return null;
    const withStart = (times || []).filter((t) => t.startTime && !isNaN(new Date(t.startTime).getTime()));
    const services = withStart.filter((t) => (t.serviceTimeType || "service") === "service");
    const candidates = (services.length > 0 ? services : withStart).map((t) => new Date(t.startTime).getTime());
    let anchor: number;
    if (candidates.length > 0) anchor = Math.min(...candidates);
    else {
      const [y, m, d] = new Date(plan.serviceDate).toISOString().split("T")[0].split("-").map((n) => parseInt(n, 10));
      anchor = ScreenScheduleHelper.fromWallClock(new Date(y, m - 1, d, this.FALLBACK_HOUR, 0, 0), ScreenScheduleHelper.validTimeZone(timeZone)).getTime();
    }
    return new Date(anchor - plan.signupDeadlineHours * 60 * 60 * 1000);
  }

  static async churchTimeZone(churchId: string): Promise<string | undefined> {
    try {
      return (await getMembershipModuleGateway().loadChurch(churchId))?.timeZone || undefined;
    } catch {
      return undefined;
    }
  }

  // Only reads the church zone when a plan has a deadline and no service times.
  static async forPlan(churchId: string, plan: Plan, times: Time[]): Promise<Date | null> {
    if (!plan?.signupDeadlineHours) return null;
    const needsZone = !(times || []).some((t) => t.startTime);
    return this.compute(plan, times, needsZone ? await this.churchTimeZone(churchId) : undefined);
  }

  static async hasPassed(churchId: string, plan: Plan, times: Time[], now = new Date()): Promise<boolean> {
    const deadline = await this.forPlan(churchId, plan, times);
    return !!deadline && now > deadline;
  }
}
