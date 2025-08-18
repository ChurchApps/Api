import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import axios from "axios";
import { AttendanceBaseController } from "./AttendanceBaseController";
import { VisitSession, Visit, Session, ServiceTime } from "../models";
import { Permissions, Environment } from "../../../shared/helpers";

@controller("/visitsessions")
export class VisitSessionController extends AttendanceBaseController {
  @httpPost("/log")
  public async log(req: express.Request<{}, {}, Visit>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.attendance.edit)) return this.json({}, 401);
      else {
        const repos = await this.getAttendanceRepositories();
        const sessionId = (req.body as Visit).visitSessions[0].sessionId;
        const personId = (req.body as Visit).personId;

        let newVisit = false;
        let visit: Visit = await repos.visitSession.loadForSessionPerson(au.churchId, sessionId, personId);
        if (visit == null) {
          const session: Session = await repos.session.load(au.churchId, sessionId);
          visit = {
            addedBy: au.id,
            checkinTime: new Date(),
            churchId: au.churchId,
            personId,
            visitDate: session.sessionDate
          };

          if (session.serviceTimeId === null) (visit as any).groupId = session.groupId;
          else {
            const st: ServiceTime = await repos.serviceTime.load(au.churchId, session.serviceTimeId);
            (visit as any).serviceId = st.serviceId;
          }
          await repos.visit.save(visit);
          newVisit = true;
        }
        let existingSession: VisitSession = null;
        if (!newVisit)
          existingSession = await repos.visitSession.loadByVisitIdSessionId(au.churchId, visit.id, sessionId);
        if (existingSession == null) {
          const vs: VisitSession = { churchId: au.churchId, sessionId, visitId: visit.id };
          await repos.visitSession.save(vs);
        }
        return {};
      }
    });
  }

  @httpGet("/download/:sessionId")
  public async download(
    @requestParam("sessionId") sessionId: string,
    req: express.Request<{}, {}, any>,
    res: express.Response
  ): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.attendance.view)) return this.json([], 401);
      else {
        const repos = await this.getAttendanceRepositories();
        const result: {
          id: string;
          personId: string;
          visitId: string;
          sessionDate: Date;
          personName: string;
          status: "present" | "absent";
        }[] = [];
        const apiUrl = Environment.membershipApi;
        const visitSessions: VisitSession[] =
          ((await repos.visitSession.loadForSession(au.churchId, sessionId)) as VisitSession[]) || [];
        const session: Session = await repos.session.load(au.churchId, sessionId);

        if (visitSessions.length > 0) {
          const url = apiUrl + `/groupmembers/basic/${(session as any).groupId}`;
          const config = { headers: { Authorization: "Bearer " + au.jwt } };
          const groupMembers: any = (await axios.get(url, config)).data;

          const visitSessionPersonIds = new Set(visitSessions.map((session: any) => session.personId));
          groupMembers?.forEach((member: any) => {
            const status = visitSessionPersonIds.has(member.personId) ? "present" : "absent";
            const visitSession = visitSessions.find((session: any) => session.personId === member.personId);
            result.push({
              id: visitSession ? visitSession.id : "",
              personId: member.personId,
              visitId: visitSession ? visitSession.visitId : "",
              sessionDate: session.sessionDate,
              personName: member.displayName,
              status
            });
          });
        }
        return result;
      }
    });
  }

  @httpGet("/:id")
  public async get(
    @requestParam("id") id: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.attendance.view)) return this.json([], 401);
      else {
        const repos = await this.getAttendanceRepositories();
        const data = await repos.visitSession.load(au.churchId, id);
        return repos.visitSession.convertToModel(au.churchId, data);
      }
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.attendance.view)) return this.json([], 401);
      else {
        const repos = await this.getAttendanceRepositories();
        let data;
        const sessionId = req.query.sessionId === undefined ? "" : req.query.sessionId.toString();
        if (sessionId !== "") data = await repos.visitSession.loadForSession(au.churchId, sessionId);
        else data = await repos.visitSession.loadAll(au.churchId);
        return repos.visitSession.convertAllToModel(au.churchId, data as any) || [];
      }
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, VisitSession[]>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.attendance.edit)) return this.json({}, 401);
      else {
        const repos = await this.getAttendanceRepositories();
        const promises: Promise<VisitSession>[] = [];
        req.body.forEach((visitsession) => {
          visitsession.churchId = au.churchId;
          promises.push(repos.visitSession.save(visitsession));
        });
        const data = await Promise.all(promises);
        return repos.visitSession.convertAllToModel(au.churchId, data);
      }
    });
  }

  @httpDelete("/:id")
  public async delete(
    @requestParam("id") id: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.attendance.edit)) return this.json({}, 401);
      else {
        const repos = await this.getAttendanceRepositories();
        await repos.visitSession.delete(au.churchId, id);
        return this.json({});
      }
    });
  }

  @httpDelete("/")
  public async deleteSessionPerson(
    @requestParam("id") id: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.attendance.edit)) return this.json({}, 401);
      else {
        const repos = await this.getAttendanceRepositories();
        const personId = req.query.personId.toString();
        const sessionId = req.query.sessionId.toString();
        const visit: Visit = await repos.visit.loadForSessionPerson(au.churchId, sessionId, personId);
        if (visit !== null) {
          const existingSession = await repos.visitSession.loadByVisitIdSessionId(au.churchId, visit.id, sessionId);
          if (existingSession !== null) await repos.visitSession.delete(au.churchId, (existingSession as any).id);
          const visitSessions: VisitSession[] =
            ((await repos.visitSession.loadByVisitId(au.churchId, visit.id)) as VisitSession[]) || [];
          if (visitSessions.length === 0) await repos.visit.delete(au.churchId, visit.id);
        }
        return this.json({});
      }
    });
  }
}
