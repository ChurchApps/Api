import { controller, httpGet, requestParam } from "inversify-express-utils";
import express from "express";
import { DoingBaseController } from "./DoingBaseController.js";
import { Plan, PlanItem } from "../models/index.js";
import { FeedVenue, SignageFeedHelper } from "../helpers/SignageFeedHelper.js";

function venueFeedToDefaultPlanItems(venueFeed: FeedVenue, planId: string): PlanItem[] {
  const result: PlanItem[] = [];

  const headerItem: PlanItem = {
    id: `default-header-${planId}`,
    planId,
    label: venueFeed.lessonName || venueFeed.name || "Lesson",
    itemType: "header",
    sort: 1
  };
  result.push(headerItem);

  let sectionSort = 1;
  for (const section of venueFeed.sections || []) {
    const sectionChildren: PlanItem[] = [];
    let actionSort = 1;

    for (const action of section.actions || []) {
      const actionType = action.actionType?.toLowerCase();
      if (actionType === "play" || actionType === "add-on") {
        sectionChildren.push({
          id: action.id || `action-${sectionSort}-${actionSort}`,
          planId,
          parentId: section.id || `section-${sectionSort}`,
          label: action.content || "Action",
          itemType: actionType === "add-on" ? "addon" : "action",
          relatedId: action.id,
          sort: actionSort++
        });
      }
    }

    if (sectionChildren.length > 0) {
      result.push({
        id: section.id || `section-${sectionSort}`,
        planId,
        parentId: headerItem.id,
        label: section.name || "Section",
        itemType: "section",
        relatedId: section.id,
        sort: sectionSort++
      });
      result.push(...sectionChildren);
    }
  }

  return result;
}

@controller("/doing/planFeed")
export class PlanFeedController extends DoingBaseController {

  @httpGet("/presenter/:churchId/:planId")
  public async getForPresenter(
    @requestParam("churchId") churchId: string,
    @requestParam("planId") planId: string,
      req: express.Request<{}, {}, null>,
      res: express.Response
  ): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      // First try to get existing plan items
      let result = (await this.repos.planItem.loadForPlan(churchId, planId)) as PlanItem[];

      if (result.length === 0) {
        const plan = await this.repos.plan.load(churchId, planId);
        if (plan?.contentId) {
          const venueFeed = await SignageFeedHelper.fetchVenueFeed(plan.contentId);
          if (venueFeed) {
            result = venueFeedToDefaultPlanItems(venueFeed, planId);
          }
        }
      }

      return this.buildTree(result, null as any);
    });
  }

  // SignPresenter-compatible external feed: resolves the plan type's current plan
  // (like a lessons.church classroom feed) and emits {messages:[{name, files:[{url, seconds, loopVideo}]}]}.
  @httpGet("/signage/:planTypeId")
  public async getSignageFeed(
    @requestParam("planTypeId") planTypeId: string,
      req: express.Request<{}, {}, null>,
      res: express.Response
  ): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const plan = (await this.repos.plan.loadCurrentByPlanTypeId(planTypeId)) as Plan;
      if (!plan) return { messages: [] };

      const planItems = (await this.repos.planItem.loadForPlan(plan.churchId, plan.id)) as PlanItem[];
      const venueId = SignageFeedHelper.getVenueId(plan, planItems);
      const venueFeed = venueId ? await SignageFeedHelper.fetchVenueFeed(venueId) : null;

      const tree = this.buildTree(planItems, null as any);
      const messages = tree.length > 0 ? SignageFeedHelper.buildMessages(tree, venueFeed) : SignageFeedHelper.buildDefaultMessages(venueFeed);

      return { messages, planName: plan.name, lessonName: venueFeed?.lessonName, venueName: venueFeed?.name };
    });
  }

  private buildTree(planItems: PlanItem[], parentId: string | null): PlanItem[] {
    const result: PlanItem[] = [];
    planItems.forEach((pi) => {
      if (pi.parentId === parentId) {
        pi.children = this.buildTree(planItems, pi.id || "");
        result.push(pi);
      }
    });
    return result;
  }
}
