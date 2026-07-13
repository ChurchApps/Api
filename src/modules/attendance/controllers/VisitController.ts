import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { AttendanceBaseController } from "./AttendanceBaseController.js";
import { Visit, VisitSession, Session } from "../models/index.js";
import { Permissions } from "../../../shared/helpers/index.js";
import { WebhookDispatcher } from "../../../shared/webhooks/index.js";
import { SecurityCodeHelper, CheckinGateHelper } from "../helpers/index.js";
import type { GateGroup, GateCount, GateIncoming } from "../helpers/CheckinGateHelper.js";
import { getMembershipModuleGateway } from "../../../shared/modules/index.js";

interface IdCache {
  [name: string]: string;
}

@controller("/attendance/visits")
export class VisitController extends AttendanceBaseController {
  static cachedSessionIds: IdCache = {};

  private async getSessionId(churchId: string, serviceTimeId: string, groupId: string, currentDate: Date) {
    let result = "";
    const key = currentDate.toDateString() + "_" + serviceTimeId.toString() + "_" + groupId.toString();
    const cached: string = VisitController.cachedSessionIds[key];
    if (cached !== undefined) result = cached;
    else {
      let session: Session = await this.repos.session.loadByGroupServiceTimeDate(churchId, groupId, serviceTimeId, currentDate);
      if (session === null) {
        session = { churchId, groupId, serviceTimeId, sessionDate: currentDate };
        session = await this.repos.session.save(session);
        await WebhookDispatcher.emit(churchId, "session.created", session);
      }
      VisitController.cachedSessionIds[key] = session.id;
      result = session.id;
    }
    return result;
  }

  @httpGet("/checkin")
  public async getCheckin(req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.attendance.view) && !au.checkAccess(Permissions.attendance.checkin)) return this.json({}, 401);
      else {
        const result: Visit[] = [];
        const serviceId = req.query.serviceId.toString();
        const peopleIdList = req.query.peopleIds.toString().split(",");
        const currentDate = new Date();
        currentDate.setHours(0, 0, 0, 0);

        const peopleIds: string[] = [];
        peopleIdList?.forEach((id) => peopleIds.push(id));

        const lastDate = await this.repos.visit.loadLastLoggedDate(au.churchId, serviceId, peopleIds);

        const visits: Visit[] =
          peopleIds.length === 0 ? [] : this.repos.visit.convertAllToModel(au.churchId, (await this.repos.visit.loadByServiceDatePeopleIds(au.churchId, serviceId, lastDate, peopleIds)) as any);

        const visitIds: string[] = [];
        if (visits.length > 0) {
          visits?.forEach((v) => visitIds.push(v.id));
          const visitSessions: VisitSession[] = this.repos.visitSession.convertAllToModel(au.churchId, (await this.repos.visitSession.loadByVisitIds(au.churchId, visitIds)) as any);
          if (visitSessions.length > 0) {
            const sessionIds: string[] = [];
            visitSessions.forEach((vs) => sessionIds.push(vs.sessionId));
            const sessions: Session[] = this.repos.session.convertAllToModel(au.churchId, (await this.repos.session.loadByIds(au.churchId, sessionIds)) as any);
            visits?.forEach((v) => {
              v.visitSessions = [];
              visitSessions?.forEach((vs) => {
                if (vs.visitId === v.id) {
                  sessions?.forEach((s) => {
                    if (s.id === vs.sessionId) vs.session = s;
                  });
                  v.visitSessions.push(vs);
                }
              });
              result.push(v);
            });
          }

          // If previous week, make a copy (remove the ids)
          visits?.forEach((v) => {
            if (v.visitDate !== currentDate) {
              v.id = null;
              v.securityCode = null;
              v.visitSessions?.forEach((vs) => {
                vs.visitId = null;
                vs.id = null;
              });
            }
          });
        }

        return result;
      }
    });
  }

  @httpPost("/checkin")
  public async postCheckin(req: express.Request<{}, {}, Visit[]>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.attendance.edit) && !au.checkAccess(Permissions.attendance.checkin)) return this.json({}, 401);
      else {
        const currentDate = new Date();
        currentDate.setHours(0, 0, 0, 0);

        const serviceId = req.query.serviceId.toString();
        const peopleIdList = req.query.peopleIds.toString().split(",");
        const peopleIds: string[] = [];
        peopleIdList.forEach((id) => peopleIds.push(id));

        const checkDuplicates = req.query.checkDuplicates === "true";

        const existingVisits: Visit[] =
          peopleIds.length === 0 ? [] : this.repos.visit.convertAllToModel(au.churchId, (await this.repos.visit.loadByServiceDatePeopleIds(au.churchId, serviceId, currentDate, peopleIds)) as any);

        if (checkDuplicates && existingVisits.length > 0) {
          return { duplicates: existingVisits.map(v => v.personId) };
        }

        const deleteVisitIds: string[] = [];
        const deleteVisitSessionIds: string[] = [];

        const submittedVisits = [...req.body];
        // Re-check-ins keep their existing code; a fresh one would be returned to the client without ever being saved.
        let securityCode = submittedVisits.find((sv) => sv.securityCode)?.securityCode || "";
        if (!securityCode) {
          for (let attempt = 0; attempt < 5; attempt++) {
            securityCode = SecurityCodeHelper.generate();
            const clashes = await this.repos.visit.loadByCodeToday(au.churchId, securityCode);
            if (clashes.length === 0) break;
          }
        }

        for (const sv of submittedVisits) {
          sv.churchId = au.churchId;
          sv.visitDate = currentDate;
          sv.checkinTime = new Date();
          sv.addedBy = au.id;
          if (!sv.securityCode) sv.securityCode = securityCode;
          // for..of, not forEach(async): unawaited assignments raced the save and wrote NULL sessionIds on first-session creation
          for (const vs of sv.visitSessions) {
            vs.sessionId = await this.getSessionId(au.churchId, vs.session.serviceTimeId, vs.session.groupId, currentDate);
            vs.churchId = au.churchId;
          }
        }

        const existingVisitIds: string[] = [];
        if (existingVisits.length > 0) {
          existingVisits.forEach((v) => existingVisitIds.push(v.id));
          const visitSessions: VisitSession[] = this.repos.visitSession.convertAllToModel(au.churchId, (await this.repos.visitSession.loadByVisitIds(au.churchId, existingVisitIds)) as any);
          this.populateDeleteIds(existingVisits, submittedVisits, visitSessions, deleteVisitIds, deleteVisitSessionIds);
        }

        // Capacity + volunteer-ratio gates run BEFORE any save (postCheckin is not transactional).
        const gateResponse = await this.evaluateGates(au.churchId, submittedVisits, peopleIds, req.query.acknowledgeWarnings === "true");
        if (gateResponse) return this.json(gateResponse.body, gateResponse.status);

        const promises: Promise<any>[] = [];
        await this.getSavePromises(submittedVisits, promises);
        deleteVisitIds.forEach((visitId) => {
          promises.push(this.repos.visit.delete(au.churchId, visitId));
        });
        deleteVisitSessionIds.forEach((visitSessionId) => {
          promises.push(this.repos.visitSession.delete(au.churchId, visitSessionId));
        });

        await Promise.all(promises);

        const streaks = await this.repos.visit.loadConsecutiveWeekStreaks(au.churchId, peopleIds);
        return { streaks, securityCode };
      }
    });
  }

  @httpGet("/code/:code")
  public async getByCode(@requestParam("code") code: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.attendance.view) && !au.checkAccess(Permissions.attendance.checkin)) return this.json({}, 401);
      else {
        const visits: Visit[] = this.repos.visit.convertAllToModel(au.churchId, (await this.repos.visit.loadByCodeToday(au.churchId, code)) as any);
        await this.populateSessions(au.churchId, visits);
        return visits;
      }
    });
  }

  @httpPost("/checkout")
  public async checkout(req: express.Request<{}, {}, { visitIds: string[]; checkedOutBy?: string; checkedOutById?: string }>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.attendance.edit) && !au.checkAccess(Permissions.attendance.checkin)) return this.json({}, 401);
      else {
        const { visitIds, checkedOutBy, checkedOutById } = req.body;
        if (!visitIds || visitIds.length === 0) return [];
        await this.repos.visit.checkout(au.churchId, visitIds, checkedOutBy, checkedOutById);
        const visits: Visit[] = this.repos.visit.convertAllToModel(au.churchId, (await this.repos.visit.loadByIds(au.churchId, visitIds)) as any);
        for (const visit of visits) await WebhookDispatcher.emit(au.churchId, "attendance.checkout", visit);
        return visits;
      }
    });
  }

  @httpGet("/:id/guardians")
  public async getGuardians(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.attendance.checkin) && !au.checkAccess(Permissions.attendance.edit)) return this.json({}, 401);
      const visit = this.repos.visit.convertToModel(au.churchId, await this.repos.visit.load(au.churchId, id));
      if (!visit?.personId) return [];
      const adults = await getMembershipModuleGateway().loadHouseholdAdults(au.churchId, [visit.personId]);
      return adults.map((a) => ({ personId: a.personId, name: a.name, mobilePhone: a.mobilePhone }));
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.attendance.view)) return this.json({}, 401);
      else {
        return this.repos.visit.convertToModel(au.churchId, await this.repos.visit.load(au.churchId, id));
      }
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.attendance.view)) return this.json({}, 401);
      else {
        let result = null;
        if (req.query.personId !== undefined) result = await this.repos.visit.loadForPerson(au.churchId, req.query.personId.toString());
        else result = await this.repos.visit.loadAll(au.churchId);
        return this.repos.visit.convertAllToModel(au.churchId, result as any);
      }
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Visit[]>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.attendance.edit)) return this.json({}, 401);
      else {
        const promises: Promise<Visit>[] = [];
        req.body.forEach((visit) => {
          visit.churchId = au.churchId;
          promises.push(
            this.repos.visit.save(visit).then(async (saved) => {
              await WebhookDispatcher.emit(au.churchId, "attendance.recorded", saved);
              return saved;
            })
          );
        });
        const result = await Promise.all(promises);
        return this.repos.visit.convertAllToModel(au.churchId, result);
      }
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.attendance.edit)) return this.json({}, 401);
      else {
        await this.repos.visit.delete(au.churchId, id);
        return this.json({});
      }
    });
  }

  private async populateSessions(churchId: string, visits: Visit[]) {
    if (visits.length === 0) return;
    const visitIds = visits.map((v) => v.id);
    const visitSessions: VisitSession[] = this.repos.visitSession.convertAllToModel(churchId, (await this.repos.visitSession.loadByVisitIds(churchId, visitIds)) as any);
    const sessionIds = visitSessions.map((vs) => vs.sessionId);
    const sessions: Session[] = sessionIds.length === 0 ? [] : this.repos.session.convertAllToModel(churchId, (await this.repos.session.loadByIds(churchId, sessionIds)) as any);
    visits.forEach((v) => {
      v.visitSessions = visitSessions.filter((vs) => vs.visitId === v.id);
      v.visitSessions.forEach((vs) => (vs.session = sessions.find((s) => s.id === vs.sessionId)));
    });
  }

  // Returns a {body,status} 409 payload when the batch must be rejected, else null.
  private async evaluateGates(churchId: string, submittedVisits: Visit[], batchPersonIds: string[], acknowledgeWarnings: boolean): Promise<{ body: any; status: number } | null> {
    const incoming: Record<string, GateIncoming> = {};
    const targetGroupIds = new Set<string>();
    submittedVisits.forEach((sv) => {
      const isVolunteer = sv.checkinType === "volunteer";
      const isGuest = sv.checkinType === "guest";
      (sv.visitSessions || []).forEach((vs) => {
        const gid = vs.session?.groupId;
        if (!gid) return;
        targetGroupIds.add(gid);
        const e = incoming[gid] ?? (incoming[gid] = { total: 0, volunteers: 0, guests: 0, nonVolunteers: 0 });
        e.total++;
        if (isVolunteer) e.volunteers++;
        else e.nonVolunteers++;
        if (isGuest) e.guests++;
      });
    });
    if (targetGroupIds.size === 0) return null;

    const groupIds = [...targetGroupIds];
    const gateway = getMembershipModuleGateway();
    const [groupList, countRows, ratioSetting] = await Promise.all([
      gateway.loadGroupsForCheckin(churchId, groupIds),
      this.repos.visit.countActiveByGroupToday(churchId, groupIds, batchPersonIds),
      gateway.loadSetting(churchId, "ratioEnforcement")
    ]);

    const groups: Record<string, GateGroup> = {};
    groupList.forEach((g) => (groups[g.id] = g));
    const current: Record<string, GateCount> = {};
    countRows.forEach((r) => (current[r.groupId] = { total: r.total, volunteers: r.volunteers, guests: r.guests }));
    const ratioEnforcement = ratioSetting === "block" ? "block" : "warn";

    const { hard, warnings } = CheckinGateHelper.evaluate({ groups, current, incoming, ratioEnforcement });
    if (hard.length > 0) {
      const primary = hard.some((v) => v.reason === "capacity") ? "capacity" : "ratio";
      return { body: { error: primary, groups: hard }, status: 409 };
    }
    if (warnings.length > 0 && !acknowledgeWarnings) {
      return { body: { warning: true, error: "ratio", groups: warnings }, status: 409 };
    }
    return null;
  }

  private populateDeleteIds(existingVisits: Visit[], _submittedVisits: Visit[], visitSessions: VisitSession[], deleteVisitIds: string[], deleteVisitSessionIds: string[]) {
    existingVisits.forEach((existingVisit) => {
      existingVisit.visitSessions = [];
      visitSessions.forEach((vs) => {
        if (vs.visitId === existingVisit.id) existingVisit.visitSessions.push(vs);
      });

      deleteVisitIds.push(existingVisit.id);
      existingVisit.visitSessions.forEach((vs) => deleteVisitSessionIds.push(vs.id));
    });
  }

  private async getSavePromises(submittedVisits: Visit[], promises: Promise<any>[]) {
    submittedVisits.forEach((submittedVisit) => {
      promises.push(
        this.repos.visit.save(submittedVisit).then(async (sv) => {
          const sessionPromises: Promise<VisitSession>[] = [];
          sv.visitSessions.forEach((vs) => {
            vs.visitId = sv.id;
            sessionPromises.push(this.repos.visitSession.save(vs));
          });
          await Promise.all(sessionPromises);
          await WebhookDispatcher.emit(sv.churchId, "attendance.recorded", sv);
        })
      );
    });
  }
}
