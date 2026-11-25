import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import axios from "axios";
import { AttendanceBaseController } from "./AttendanceBaseController.js";
import { VisitSession, Visit, Session, ServiceTime } from "../models/index.js";
import { Permissions, Environment } from "../../../shared/helpers/index.js";
import { WebhookDispatcher } from "../../../shared/webhooks/index.js";
import { CheckedInByHelper } from "../helpers/CheckedInByHelper.js";

// The fields read from membership's /groupmembers/basic/:groupId response.
export interface GroupMemberBasic {
  personId: string;
  displayName: string;
}

// One row of the session CSV download: every group member, present or absent.
export interface SessionDownloadRow {
  id: string;
  personId: string;
  visitId: string;
  sessionDate: Date;
  personName: string;
  status: "present" | "absent";
  checkinTime: Date | null;
  checkoutTime: Date | null;
  checkedOutBy: string;
  checkedInBy: string;
  checkinType: string;
}

export function toSessionDownloadRow(member: GroupMemberBasic, session: Session, visitSession?: VisitSession): SessionDownloadRow {
  const visit = visitSession?.visit;
  return {
    id: visitSession?.id || "",
    personId: member.personId,
    visitId: visitSession?.visitId || "",
    sessionDate: session.sessionDate,
    personName: member.displayName,
    status: visitSession ? "present" : "absent",
    checkinTime: visit?.checkinTime || null,
    checkoutTime: visit?.checkoutTime || null,
    checkedOutBy: visit?.checkedOutBy || "",
    checkedInBy: visit?.checkedInBy || "",
    checkinType: visit?.checkinType || ""
  };
}

@controller("/attendance/visitsessions")
export class VisitSessionController extends AttendanceBaseController {
  @httpPost("/log")
  public async log(req: express.Request<{}, {}, Visit>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const sessionId = (req.body as Visit)?.visitSessions?.[0]?.sessionId;
      const personId = (req.body as Visit)?.personId;
      if (!sessionId || !personId) return this.json({ error: "personId and visitSessions[0].sessionId are required" }, 400);

      // Check if user is a leader of the group this session belongs to
      const session: Session = await this.repos.session.load(au.churchId, sessionId);
      const isGroupLeader = session?.groupId && au.leaderGroupIds?.includes(session.groupId);

      if (!au.checkAccess(Permissions.attendance.edit) && !isGroupLeader) return this.json({}, 401);
      else if (!session) return this.json({ error: "Session not found" }, 404);
      else {
        let newVisit = false;
        let visit: Visit = await this.repos.visit.loadForSessionPerson(au.churchId, sessionId, personId);
        if (visit == null) {
          visit = {
            addedBy: au.id,
            checkinTime: new Date(),
            churchId: au.churchId,
            personId,
            visitDate: session.sessionDate
          };

          if (session.serviceTimeId === null) visit.groupId = session.groupId;
          else {
            const st: ServiceTime = await this.repos.serviceTime.load(au.churchId, session.serviceTimeId);
            visit.serviceId = st?.serviceId;
          }
          visit = await this.repos.visit.save(visit);
          newVisit = true;
        }
        let existingSession: VisitSession = null;
        if (!newVisit) existingSession = await this.repos.visitSession.loadByVisitIdSessionId(au.churchId, visit.id, sessionId);
        if (existingSession == null) {
          const vs: VisitSession = { churchId: au.churchId, sessionId, visitId: visit.id };
          await this.repos.visitSession.save(vs);
          await WebhookDispatcher.emit(au.churchId, "attendance.recorded", { ...visit, visitSessions: [vs] });
        }
        return {};
      }
    });
  }

  @httpGet("/download/:sessionId")
  public async download(@requestParam("sessionId") sessionId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.attendance.view)) return this.json([], 401);
      else {
        const result: SessionDownloadRow[] = [];
        const apiUrl = Environment.membershipApi;
        const visitSessions: VisitSession[] = ((await this.repos.visitSession.loadForSession(au.churchId, sessionId)) as VisitSession[]) || [];
        const session: Session = await this.repos.session.load(au.churchId, sessionId);

        if (visitSessions.length > 0 && session) {
          await CheckedInByHelper.attachNames(au.churchId, visitSessions.map((vs) => vs.visit));
          const url = apiUrl + `/groupmembers/basic/${session.groupId}`;
          const config = { headers: { Authorization: "Bearer " + au.jwt } };
          const groupMembers = (await axios.get<GroupMemberBasic[]>(url, config)).data;

          groupMembers?.forEach((member) => {
            const visitSession = visitSessions.find((vs) => vs.visit?.personId === member.personId);
            result.push(toSessionDownloadRow(member, session, visitSession));
          });
        }
        return result;
      }
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.attendance.view)) return this.json([], 401);
      else {
        const data = await this.repos.visitSession.load(au.churchId, id);
        return this.repos.visitSession.convertToModel(au.churchId, data);
      }
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const sessionId = req.query.sessionId === undefined ? "" : req.query.sessionId.toString();

      // Check if user is a leader of the group this session belongs to
      let isGroupLeader = false;
      if (sessionId !== "") {
        const session: Session = await this.repos.session.load(au.churchId, sessionId);
        isGroupLeader = session?.groupId && au.leaderGroupIds?.includes(session.groupId);
      }

      if (!au.checkAccess(Permissions.attendance.view) && !isGroupLeader) return this.json([], 401);
      else {
        if (sessionId !== "") {
          const visitSessions: VisitSession[] = (await this.repos.visitSession.loadForSession(au.churchId, sessionId)) || [];
          await CheckedInByHelper.attachNames(au.churchId, visitSessions.map((vs) => vs.visit));
          return visitSessions;
        } else {
          const data = await this.repos.visitSession.loadAll(au.churchId);
          return this.repos.visitSession.convertAllToModel(au.churchId, data) || [];
        }
      }
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, VisitSession[]>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.attendance.edit)) return this.json({}, 401);
      else {
        const promises: Promise<VisitSession>[] = [];
        req.body.forEach((visitsession) => {
          visitsession.churchId = au.churchId;
          promises.push(this.repos.visitSession.save(visitsession));
        });
        const data = await Promise.all(promises);
        return this.repos.visitSession.convertAllToModel(au.churchId, data);
      }
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.attendance.edit)) return this.json({}, 401);
      else {
        await this.repos.visitSession.delete(au.churchId, id);
        return this.json({});
      }
    });
  }

  @httpDelete("/")
  public async deleteSessionPerson(@requestParam("id") _id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const personId = req.query.personId.toString();
      const sessionId = req.query.sessionId.toString();

      // Check if user is a leader of the group this session belongs to
      const session: Session = await this.repos.session.load(au.churchId, sessionId);
      const isGroupLeader = session?.groupId && au.leaderGroupIds?.includes(session.groupId);

      if (!au.checkAccess(Permissions.attendance.edit) && !isGroupLeader) return this.json({}, 401);
      else {
        const visit: Visit = await this.repos.visit.loadForSessionPerson(au.churchId, sessionId, personId);
        if (visit !== null) {
          const existingSession = await this.repos.visitSession.loadByVisitIdSessionId(au.churchId, visit.id, sessionId);
          if (existingSession !== null) await this.repos.visitSession.delete(au.churchId, existingSession.id);
          const visitSessions: VisitSession[] = ((await this.repos.visitSession.loadByVisitId(au.churchId, visit.id)) as VisitSession[]) || [];
          if (visitSessions.length === 0) await this.repos.visit.delete(au.churchId, visit.id);
        }
        return this.json({});
      }
    });
  }
}
