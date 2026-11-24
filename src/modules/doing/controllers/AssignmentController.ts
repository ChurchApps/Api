import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { DoingBaseController } from "./DoingBaseController.js";
import { Assignment, Plan, Position, Time } from "../models/index.js";
import { Repos } from "../repositories/index.js";
import { PlanAuth, Permissions } from "../../../shared/helpers/index.js";
import { DateHelper } from "../../../shared/helpers/DateHelper.js";
import { InternalEventBus } from "../../../shared/events/InternalEventBus.js";
import { PlanHelper } from "../helpers/PlanHelper.js";
import { ReminderTokenHelper } from "../helpers/ReminderTokenHelper.js";
import { cleanDeclineReason, formReason, redactDeclineReasons } from "../helpers/DeclineReason.js";
import { SignupDeadlineHelper } from "../helpers/SignupDeadlineHelper.js";
import { ServingFeedHelper } from "../helpers/ServingFeedHelper.js";

@controller("/doing/assignments")
export class AssignmentController extends DoingBaseController {
  @httpGet("/my")
  public async getMy(@requestParam("id") _id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.assignment.loadByByPersonId(au.churchId, au.personId);
    });
  }

  @httpGet("/my/upcoming")
  public async getMyUpcoming(req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.assignment.loadUpcomingByPersonId(au.churchId, au.personId);
    });
  }

  // The signed-in person's serving calendar link credentials; the client builds the webcal URL.
  @httpGet("/my/calendar")
  public async getMyCalendar(req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.personId) return this.json({ error: "personId required" }, 400);
      return await ServingFeedHelper.link(au.churchId, au.personId);
    });
  }

  // "Reset link": a new nonce invalidates every link issued before it.
  // authz-exempt: self-service; only ever resets the signed-in person's own link (au.personId)
  @httpPost("/my/calendar/reset")
  public async resetMyCalendar(req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.personId) return this.json({ error: "personId required" }, 400);
      return await ServingFeedHelper.link(au.churchId, au.personId, true);
    });
  }

  // Personal serving ICS feed. The HMAC token from /my/calendar is the credential and is checked before any data loads.
  @httpGet("/public/calendar")
  public async calendarFeed(req: express.Request, res: express.Response): Promise<void> {
    try {
      // authz-exempt: churchId/personId are only trusted after the signed token verifies for exactly that pair
      const result = await ServingFeedHelper.calendar(req.query.churchId, req.query.personId, req.query.token, await this.getRepos<Repos>());
      if (!result) {
        res.status(401).send("Invalid calendar link.");
        return;
      }
      if (result.error || !result.value) {
        console.error("[calendarFeed] ics failed:", result.error);
        res.status(500).send("Error generating calendar.");
        return;
      }
      res.set("Content-Type", "text/calendar");
      res.set("Cache-Control", "private, max-age=900");
      res.send(result.value);
    } catch (e) {
      console.error("[calendarFeed] failed:", e);
      res.status(500).send("Error generating calendar.");
    }
  }

  @httpGet("/monthCounts")
  public async getMonthCounts(req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const dateString = typeof req.query.date === "string" ? req.query.date : "";
      const date = dateString ? new Date(dateString) : new Date();
      return await this.repos.assignment.loadMonthServeCounts(au.churchId, date);
    });
  }

  // Assign Position picker: when each team member last served and what else they serve that day.
  @httpGet("/picker/:positionId")
  public async getPickerContext(@requestParam("positionId") positionId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!await PlanAuth.canEditPosition(au, positionId)) return this.json({}, 401);
      return await PlanHelper.loadPickerContext(au.churchId, positionId, this.repos);
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const assignment = (await this.repos.assignment.load(au.churchId, id)) as Assignment;
      if (!assignment) return assignment;
      return redactDeclineReasons([assignment], au.personId, au.checkAccess(Permissions.plans.edit))[0];
    });
  }

  @httpGet("/plan/ids")
  public async getByPlanIds(req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const planIdsString = req.query.planIds as string;
      const planIds = planIdsString.split(",");
      return redactDeclineReasons(await this.repos.assignment.loadByPlanIds(au.churchId, planIds) as Assignment[], au.personId, au.checkAccess(Permissions.plans.edit));
    });
  }

  @httpGet("/plan/:planId")
  public async getForPlan(@requestParam("planId") planId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      return redactDeclineReasons(await this.repos.assignment.loadByPlanId(au.churchId, planId) as Assignment[], au.personId, au.checkAccess(Permissions.plans.edit));
    });
  }

  @httpPost("/accept/:id")
  public async accept(@requestParam("id") id: string, req: express.Request<{}, {}, []>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const assignment = (await this.repos.assignment.load(au.churchId, id)) as Assignment;
      if (!assignment) return this.json({}, 404);
      if (assignment.personId !== au.personId) throw new Error("Invalid Assignment");
      else {
        assignment.status = "Accepted";
        const result = await this.repos.assignment.save(assignment);
        await InternalEventBus.publish(au.churchId, "assignment.updated", result);
        await PlanHelper.notifyLeadersOfResponse(au.churchId, assignment, this.repos);
        return result;
      }
    });
  }

  @httpPost("/decline/:id")
  public async decline(@requestParam("id") id: string, req: express.Request<{}, {}, { declineReason?: string }>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const assignment = (await this.repos.assignment.load(au.churchId, id)) as Assignment;
      if (!assignment) return this.json({}, 404);
      if (assignment.personId !== au.personId) throw new Error("Invalid Assignment");
      else {
        assignment.status = "Declined";
        assignment.declineReason = cleanDeclineReason(req.body?.declineReason);
        const result = await this.repos.assignment.save(assignment);
        await InternalEventBus.publish(au.churchId, "assignment.updated", result);
        try {
          await PlanHelper.autoReplaceDeclined(au.churchId, assignment, this.repos);
        } catch (e) {
          // A replacement failure must never block the decline itself.
          console.error("autoReplaceDeclined failed:", e);
        }
        await PlanHelper.notifyLeadersOfResponse(au.churchId, assignment, this.repos);
        return result;
      }
    });
  }

  // Unauthenticated accept/decline from an email link; the signed token is the auth. GET only shows a
  // confirm button because mail link scanners fetch every URL in a message.
  @httpGet("/public/respond")
  public async respondConfirm(req: express.Request, res: express.Response): Promise<void> {
    return this.respond(req, res, false);
  }

  // authz-exempt: the HMAC-signed, expiring token in the query string is the authorization (verified in respond)
  @httpPost("/public/respond")
  public async respondSubmit(req: express.Request, res: express.Response): Promise<void> {
    return this.respond(req, res, true);
  }

  private async respond(req: express.Request, res: express.Response, apply: boolean): Promise<void> {
    const page = (title: string, msg: string, extra = "") =>
      `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>` +
      `<body style="font-family:sans-serif;max-width:480px;margin:60px auto;padding:0 20px;text-align:center;"><h2>${title}</h2><p style="color:#555;">${msg}</p>${extra}</body></html>`;
    try {
      const payload = ReminderTokenHelper.verify(req.query.token as string);
      if (!payload) { res.status(400).send(page("Link expired", "This link is no longer valid. Please open the app to respond.")); return; }

      const repos = await this.getRepos<Repos>();
      const assignment = (await repos.assignment.load(payload.churchId, payload.assignmentId)) as Assignment;
      if (!assignment) { res.status(404).send(page("Not found", "We couldn't find that serving request.")); return; }

      // New confirmation links are bound to the issued person/role/service, so an
      // old bearer link cannot answer a reassigned or rescheduled request.
      if (payload.request) {
        const position = await repos.position.load(payload.churchId, assignment.positionId) as Position;
        const plan = position ? await repos.plan.load(payload.churchId, position.planId) as Plan : null;
        const sameSubject = assignment.personId === payload.request.personId && assignment.positionId === payload.request.positionId;
        const samePlan = plan && plan.id === payload.request.planId && !plan.prepared && DateHelper.toMysqlDateOnly(plan.serviceDate) === payload.request.serviceDate;
        if (!sameSubject || !samePlan) {
          res.status(400).send(page("Request changed", "This request has changed. Please open the app to review your current schedule.")); return;
        }
      }

      const target = payload.action === "accept" ? "Accepted" : "Declined";
      if (!apply && assignment.status !== target) {
        const label = target === "Accepted" ? "Accept" : "Decline";
        const reasonField = target === "Declined"
          ? `<label for="reason" style="display:block;margin-bottom:6px;color:#555;">Reason (optional)</label><input id="reason" name="reason" type="text" maxlength="255" style="box-sizing:border-box;width:100%;padding:10px;margin-bottom:16px;border:1px solid #ccc;border-radius:5px;font-size:16px;">`
          : "";
        const button = `<form method="post" action="">${reasonField}<button type="submit" style="background-color:#0288d1;border:0;border-radius:5px;color:white;cursor:pointer;font-size:16px;padding:10px 24px;">${label}</button></form>`;
        res.status(200).send(page(target === "Accepted" ? "Accept this serving request?" : "Decline this serving request?", "Tap the button below to confirm.", button));
        return;
      }
      if (assignment.status !== target) {
        assignment.status = target;
        if (target === "Declined") assignment.declineReason = cleanDeclineReason(formReason(req.body));
        await repos.assignment.save(assignment);
        await InternalEventBus.publish(payload.churchId, "assignment.updated", assignment);
        if (target === "Declined") {
          try {
            await PlanHelper.autoReplaceDeclined(payload.churchId, assignment, repos);
          } catch (e) {
            console.error("autoReplaceDeclined failed:", e);
          }
        }
        await PlanHelper.notifyLeadersOfResponse(payload.churchId, assignment, repos);
      }

      res.status(200).send(page(
        target === "Accepted" ? "You're confirmed" : "Thanks for letting us know",
        target === "Accepted" ? "Thank you for serving — see you then!" : "No problem — we'll find someone else to fill in."
      ));
    } catch (e) {
      console.error("[respond] failed:", e);
      res.status(500).send(page("Something went wrong", "Please try again, or open the app to respond."));
    }
  }

  @httpPost("/signup")
  public async signup(req: express.Request<{}, {}, { positionId: string }>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const { positionId } = req.body;
      if (!positionId) throw new Error("positionId is required");

      const position = (await this.repos.position.load(au.churchId, positionId)) as Position;
      if (!position || !position.allowSelfSignup) throw new Error("Self-signup is not enabled for this position");

      // Check signup deadline
      const plan = (await this.repos.plan.load(au.churchId, position.planId)) as Plan;
      if (!plan) return this.json({}, 404);
      if (plan.signupDeadlineHours && await SignupDeadlineHelper.hasPassed(au.churchId, plan, await this.repos.time.loadByPlanId(au.churchId, plan.id) as Time[])) {
        throw new Error("Signup deadline has passed");
      }

      // Check capacity
      const countResult = await this.repos.assignment.countByPositionId(au.churchId, positionId);
      if (countResult.cnt >= position.count) throw new Error("Position is full");

      // Check duplicate
      const existing = await this.repos.assignment.loadByPlanId(au.churchId, position.planId) as Assignment[];
      const alreadyAssigned = existing.find(a => a.positionId === positionId && a.personId === au.personId);
      if (alreadyAssigned) throw new Error("Already signed up for this position");

      const assignment = new Assignment();
      assignment.churchId = au.churchId;
      assignment.positionId = positionId;
      assignment.personId = au.personId;
      assignment.status = "Accepted";
      return await this.repos.assignment.save(assignment);
    });
  }

  @httpDelete("/signup/:id")
  public async signupRemove(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const assignment = (await this.repos.assignment.load(au.churchId, id)) as Assignment;
      if (!assignment || assignment.personId !== au.personId) throw new Error("Invalid assignment");

      const position = (await this.repos.position.load(au.churchId, assignment.positionId)) as Position;
      if (!position || !position.allowSelfSignup) throw new Error("Self-signup is not enabled for this position");

      // Check removal deadline
      const plan = (await this.repos.plan.load(au.churchId, position.planId)) as Plan;
      if (plan?.signupDeadlineHours && await SignupDeadlineHelper.hasPassed(au.churchId, plan, await this.repos.time.loadByPlanId(au.churchId, plan.id) as Time[])) {
        throw new Error("Removal deadline has passed");
      }

      await this.repos.assignment.delete(au.churchId, id);
      await InternalEventBus.publish(au.churchId, "assignment.destroyed", { id });
      return {};
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Assignment[]>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      for (const assignment of req.body) {
        if (!await PlanAuth.canEditPosition(au, assignment.positionId)) return this.json({}, 401);
        if (assignment.id) {
          const existing = (await this.repos.assignment.load(au.churchId, assignment.id)) as Assignment;
          if (existing && !await PlanAuth.canEditPosition(au, existing.positionId)) return this.json({}, 401);
        }
      }
      const promises: Promise<Assignment>[] = [];
      req.body.forEach((assignment) => {
        assignment.churchId = au.churchId;
        if (!assignment.status) assignment.status = "Unconfirmed";
        // JSON bodies carry notified as an ISO string, which MySQL rejects for DATETIME.
        if (assignment.notified) assignment.notified = new Date(assignment.notified);
        promises.push(this.repos.assignment.save(assignment));
      });
      const result = await Promise.all(promises);
      for (const saved of result) await InternalEventBus.publish(au.churchId, "assignment.updated", saved);
      return result;
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const assignment: Assignment | null = await this.repos.assignment.load(au.churchId, id);
      if (!await PlanAuth.canEditPosition(au, assignment?.positionId)) return this.json({}, 401);
      await this.repos.assignment.delete(au.churchId, id);
      await InternalEventBus.publish(au.churchId, "assignment.destroyed", { id });
      return {};
    });
  }
}
