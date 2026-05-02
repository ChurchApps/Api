import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { MembershipBaseController } from "./MembershipBaseController.js";
import { AssociatedGroup } from "../models/index.js";
import { PlanAuth } from "../../../shared/helpers/index.js";

@controller("/membership/associatedGroups")
export class AssociatedGroupController extends MembershipBaseController {
  @httpGet("/content/:contentType/:contentId")
  public async getByContent(
    @requestParam("contentType") contentType: string,
    @requestParam("contentId") contentId: string,
    req: express.Request,
    res: express.Response
  ): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repos.associatedGroup.loadByContent(au.churchId, contentType, contentId);
      return this.repos.associatedGroup.convertAllToModel(au.churchId, data);
    });
  }

  @httpGet("/group/:groupId")
  public async getByGroup(
    @requestParam("groupId") groupId: string,
    req: express.Request,
    res: express.Response
  ): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const contentType = typeof req.query.contentType === "string" ? req.query.contentType : undefined;
      const data = await this.repos.associatedGroup.loadByGroup(au.churchId, groupId, contentType);
      return this.repos.associatedGroup.convertAllToModel(au.churchId, data);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, AssociatedGroup[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      for (const item of req.body) {
        if (item.contentType === "planType") {
          if (!await PlanAuth.canEditPlanType(au, item.contentId)) return this.json({}, 401);
        }
      }
      const promises: Promise<AssociatedGroup>[] = [];
      req.body.forEach((item) => { item.churchId = au.churchId; promises.push(this.repos.associatedGroup.save(item)); });
      const result = await Promise.all(promises);
      return this.repos.associatedGroup.convertAllToModel(au.churchId, result);
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const assoc: any = await this.repos.associatedGroup.load(au.churchId, id);
      if (assoc?.contentType === "planType") {
        if (!await PlanAuth.canEditPlanType(au, assoc.contentId)) return this.json({}, 401);
      }
      await this.repos.associatedGroup.delete(au.churchId, id);
      return {};
    });
  }
}
