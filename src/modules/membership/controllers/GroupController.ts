import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { sql } from "kysely";
import { MembershipBaseController } from "./MembershipBaseController.js";
import { Group } from "../models/index.js";
import { Permissions } from "../helpers/index.js";
import { ArrayHelper, SlugHelper } from "@churchapps/apihelper";
import { KyselyPool } from "../../../shared/infrastructure/KyselyPool.js";
import { WebhookDispatcher } from "../../../shared/webhooks/index.js";

@controller("/membership/groups")
export class GroupController extends MembershipBaseController {
  @httpGet("/search")
  public async search(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const campusId = req.query.campusId.toString();
      const serviceId = req.query.serviceId.toString();
      const serviceTimeId = req.query.serviceTimeId.toString();
      return this.repos.group.convertAllToModel(au.churchId, (await this.repos.group.search(au.churchId, campusId, serviceId, serviceTimeId)) as any[]);
    });
  }

  @httpGet("/my/:tag")
  public async getMyTag(@requestParam("tag") tag: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const result = this.repos.group.convertAllToModel(au.churchId, (await this.repos.group.loadAllForPerson(au.personId)) as any[]);
      return result.filter((g) => (g.tags || "").indexOf(tag) > -1);
    });
  }

  @httpGet("/my")
  public async getMy(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return this.repos.group.convertAllToModel(au.churchId, (await this.repos.group.loadForPerson(au.personId)) as any[]);
    });
  }

  @httpGet("/public/:churchId/slug/:slug")
  public async getPublicSlug(@requestParam("churchId") churchId: string, @requestParam("slug") slug: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const group = await this.repos.group.loadPublicSlug(churchId, slug);
      return group ? this.repos.group.convertToModel(churchId, group) : this.json({ error: "Group not found" }, 404);
    });
  }

  @httpGet("/public/:churchId/label")
  public async getPublicLabel(@requestParam("churchId") churchId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const label = req.query.label.toString();
      return this.repos.group.convertAllToModel(churchId, (await this.repos.group.publicLabel(churchId, label)) as any[]);
    });
  }

  @httpGet("/public/:churchId/list")
  public async getPublicList(@requestParam("churchId") churchId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      return this.repos.group.convertAllToModel(churchId, (await this.repos.group.loadAll(churchId)) as any[]);
    });
  }

  @httpGet("/public/:churchId/:id")
  public async getPublic(@requestParam("churchId") churchId: string, @requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const group = await this.repos.group.load(churchId, id);
      return group ? this.repos.group.convertToModel(churchId, group) : this.json({ error: "Group not found" }, 404);
    });
  }

  @httpGet("/tag/:tag")
  public async getByTag(@requestParam("tag") tag: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return this.repos.group.convertAllToModel(au.churchId, (await this.repos.group.loadByTag(au.churchId, tag)) as any[]);
    });
  }

  @httpGet("/public/:churchId/tag/:tag")
  public async getPublicByTag(@requestParam("churchId") churchId: string, @requestParam("tag") tag: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      return this.repos.group.convertAllToModel(churchId, (await this.repos.group.loadByTag(churchId, tag)) as any[]);
    });
  }

  @httpGet("/health/summary")
  public async healthSummary(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.groupMembers.view)) return this.json({}, 401);
      const since = new Date();
      since.setDate(since.getDate() - 90);
      const [groups, members, history] = await Promise.all([
        this.repos.group.loadByTag(au.churchId, "standard"),
        this.repos.groupMember.loadHealthSummary(au.churchId),
        this.repos.groupMemberHistory.loadCountsSince(au.churchId, since)
      ]);
      return (groups as any[]).map((g) => {
        const m = (members as any[]).find((r) => r.groupId === g.id);
        const joins90 = Number((history as any[]).find((h) => h.groupId === g.id && h.action === "joined")?.count || 0);
        const leaves90 = Number((history as any[]).find((h) => h.groupId === g.id && h.action === "left")?.count || 0);
        const memberCount = Number(m?.memberCount || 0);
        return {
          groupId: g.id,
          name: g.name,
          categoryName: g.categoryName,
          memberCount,
          leaderCount: Number(m?.leaderCount || 0),
          averageAge: m?.averageAge === null || m?.averageAge === undefined ? null : Math.round(Number(m.averageAge)),
          femaleCount: Number(m?.femaleCount || 0),
          maleCount: Number(m?.maleCount || 0),
          joins90,
          leaves90,
          churnRate90: this.churnRate(memberCount, joins90, leaves90)
        };
      });
    });
  }

  @httpGet("/:id/health")
  public async health(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.groupMembers.view) && !au.leaderGroupIds?.includes(id)) return this.json({}, 401);
      const since = new Date();
      since.setDate(since.getDate() - 90);
      const [summary, history, monthlyRows, demographics] = await Promise.all([
        this.repos.groupMember.loadHealthSummary(au.churchId),
        this.repos.groupMemberHistory.loadCountsSince(au.churchId, since),
        this.repos.groupMemberHistory.loadMonthlyStats(au.churchId, id, 12),
        this.repos.groupMember.loadDemographicsForGroup(au.churchId, id)
      ]);
      const m = (summary as any[]).find((r) => r.groupId === id);
      const joins90 = Number((history as any[]).find((h) => h.groupId === id && h.action === "joined")?.count || 0);
      const leaves90 = Number((history as any[]).find((h) => h.groupId === id && h.action === "left")?.count || 0);
      const memberCount = Number(m?.memberCount || 0);

      // Fill the last 12 calendar months so charts get a continuous axis.
      const monthly: { month: string; joins: number; leaves: number }[] = [];
      const cursor = new Date();
      cursor.setDate(1);
      cursor.setMonth(cursor.getMonth() - 11);
      for (let i = 0; i < 12; i++) {
        const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
        const joins = Number((monthlyRows as any[]).find((r) => r.month === key && r.action === "joined")?.count || 0);
        const leaves = Number((monthlyRows as any[]).find((r) => r.month === key && r.action === "left")?.count || 0);
        monthly.push({ month: key, joins, leaves });
        cursor.setMonth(cursor.getMonth() + 1);
      }

      return {
        memberCount,
        leaderCount: Number(m?.leaderCount || 0),
        averageAge: m?.averageAge === null || m?.averageAge === undefined ? null : Math.round(Number(m.averageAge)),
        joins90,
        leaves90,
        churnRate90: this.churnRate(memberCount, joins90, leaves90),
        monthly,
        demographics
      };
    });
  }

  // Leaves over the period as a percent of the period's starting size (one decimal).
  private churnRate(memberCount: number, joins: number, leaves: number): number {
    const startCount = memberCount - joins + leaves;
    const base = startCount > 0 ? startCount : memberCount + leaves;
    return base > 0 ? Math.round((leaves / base) * 1000) / 10 : 0;
  }

  @httpGet("/:id/plans")
  public async getPlans(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const isAdmin = au.checkAccess(Permissions.groups.edit) || au.checkAccess(Permissions.plans.edit);
      if (!isAdmin) {
        const member = await (this.repos.groupMember as any).loadForPerson(au.churchId, au.personId);
        const isMember = Array.isArray(member) && member.some((m: any) => m.groupId === id);
        if (!isMember) return this.json({ error: "Not a member of this group" }, 403);
      }
      const associations = (await this.repos.associatedGroup.loadByGroup(au.churchId, id, "planType")) as { contentId: string; settings: string | null }[];
      if (associations.length === 0) return [];
      const doingDb = KyselyPool.getDb<any>("doing");
      return doingDb.selectFrom("plans").selectAll()
        .where("churchId", "=", au.churchId)
        .where((eb: any) => eb.or(associations.map((a) => {
          const base = eb("planTypeId", "=", a.contentId);
          if (a.settings === "past") return eb.and([base, eb("serviceDate", "<", sql`CURDATE()`)]);
          if (a.settings === "future") return eb.and([base, eb("serviceDate", ">=", sql`CURDATE()`)]);
          return base;
        })))
        .orderBy("serviceDate", "desc")
        .execute();
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repos.group.load(au.churchId, id);
      return this.repos.group.convertToModel(au.churchId, data);
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repos.group.loadAll(au.churchId);
      return this.repos.group.convertAllToModel(au.churchId, data);
    });
  }

  // Custom POST implementation (slug generation)
  @httpPost("/")
  public async save(req: express.Request<{}, {}, Group[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.groups.edit)) return this.json({}, 401);
      else {
        const promises: Promise<Group>[] = [];
        req.body.forEach((group) => {
          group.churchId = au.churchId;
          if (!group.slug) group.slug = SlugHelper.slugifyString(group.name);
          const isNew = !group.id;
          promises.push(
            this.repos.group.save(group).then(async (g) => {
              await WebhookDispatcher.emit(au.churchId, isNew ? "group.created" : "group.updated", g);
              return g;
            })
          );
        });
        const result = await Promise.all(promises);
        return this.repos.group.convertAllToModel(au.churchId, result);
      }
    });
  }

  // Custom DELETE implementation (ministry tag handling)
  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.groups.edit)) return this.json({}, 401);
      else {
        const group: Group = await this.repos.group.load(au.churchId, id);
        if ((group.tags || "").indexOf("ministry") > -1) {
          const AllTeams = (await this.repos.group.loadByTag(au.churchId, "team")) as any[];
          const ministryTeams = ArrayHelper.getAll(AllTeams, "categoryName", id);
          const ids = ArrayHelper.getIds(ministryTeams, "id");
          await this.repos.group.delete(au.churchId, id);
          await this.repos.group.deleteByIds(au.churchId, ids);
          for (const deletedId of [id, ...ids]) await WebhookDispatcher.emit(au.churchId, "group.destroyed", { id: deletedId, churchId: au.churchId });
          return this.json({});
        } else {
          await this.repos.group.delete(au.churchId, id);
          await WebhookDispatcher.emit(au.churchId, "group.destroyed", { id, churchId: au.churchId });
          return this.json({});
        }
      }
    });
  }
}
