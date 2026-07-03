import { controller, httpGet, httpPost } from "inversify-express-utils";
import express from "express";
import { AttendanceBaseController } from "./AttendanceBaseController.js";
import { Permissions } from "../../../shared/helpers/index.js";
import { getMembershipModuleGateway, getMessagingModuleGateway, type HouseholdAdult } from "../../../shared/modules/index.js";

@controller("/attendance/checkin")
export class CheckinController extends AttendanceBaseController {
  // Church settings the kiosk needs (attendance.checkin JWT can't read /membership/settings).
  @httpGet("/settings")
  public async getSettings(req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.attendance.checkin) && !au.checkAccess(Permissions.attendance.view)) return this.json({}, 401);
      const gradePromotionDate = await getMembershipModuleGateway().loadSetting(au.churchId, "gradePromotionDate");
      return { gradePromotionDate };
    });
  }

  @httpPost("/page")
  public async page(req: express.Request<{}, {}, { visitId: string; message: string }>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.attendance.checkin) && !au.checkAccess(Permissions.attendance.edit)) return this.json({}, 401);
      const { visitId, message } = req.body;
      if (!visitId || !message) return this.json({ error: "visitId and message are required" }, 400);

      const visit = this.repos.visit.convertToModel(au.churchId, await this.repos.visit.load(au.churchId, visitId));
      if (!visit?.personId) return this.json({ error: "Visit not found" }, 404);

      const adults = await getMembershipModuleGateway().loadHouseholdAdults(au.churchId, [visit.personId]);
      return this.dispatch(au.churchId, adults, message, "checkin-page");
    });
  }

  @httpPost("/broadcast")
  public async broadcast(req: express.Request<{}, {}, { serviceId: string; message: string }>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.attendance.checkin) && !au.checkAccess(Permissions.attendance.edit)) return this.json({}, 401);
      const { serviceId, message } = req.body;
      if (!serviceId || !message) return this.json({ error: "serviceId and message are required" }, 400);

      const rows = (await this.repos.visit.loadActiveByServiceToday(au.churchId, serviceId)) as any[];
      const personIds = [...new Set(rows.map((r) => r.personId).filter((id) => !!id))];
      if (personIds.length === 0) return { sent: 0, skippedOptedOut: 0, skippedNoPhone: 0 };

      const adults = await getMembershipModuleGateway().loadHouseholdAdults(au.churchId, personIds);
      return this.dispatch(au.churchId, adults, message, "checkin-broadcast");
    });
  }

  // Categorize (dedupe by phone), send via the messaging gateway, surface skipped counts.
  private async dispatch(churchId: string, adults: HouseholdAdult[], message: string, context: string) {
    const seen = new Set<string>();
    const eligible: { personId: string; phoneNumber: string }[] = [];
    let skippedNoPhone = 0;
    let skippedOptedOut = 0;

    for (const a of adults) {
      const phone = (a.mobilePhone || "").trim();
      if (!phone) { skippedNoPhone++; continue; }
      if (a.optedOut) { skippedOptedOut++; continue; }
      if (seen.has(phone)) continue;
      seen.add(phone);
      eligible.push({ personId: a.personId, phoneNumber: phone });
    }

    const result = await getMessagingModuleGateway().sendBulkText(churchId, eligible, message, context);
    if (!result.ok && result.reason === "no_provider") {
      return this.json({ error: "No SMS provider configured. Set one up in B1Admin Texting settings." }, 400);
    }
    return { sent: result.sent ?? 0, failed: result.failed ?? 0, skippedOptedOut, skippedNoPhone };
  }
}
