import { controller, httpGet, requestParam } from "inversify-express-utils";
import express from "express";
import { DoingBaseController } from "./DoingBaseController.js";
import { PlanItem } from "../models/index.js";

const LESSONS_API_BASE = "https://api.lessons.church";

interface FeedAction {
  id?: string;
  actionType?: string;
  content?: string;
}

interface FeedSection {
  id?: string;
  name?: string;
  actions?: FeedAction[];
}

interface FeedVenue {
  id?: string;
  name?: string;
  lessonName?: string;
  sections?: FeedSection[];
}

async function fetchVenueFeed(venueId: string): Promise<FeedVenue | null> {
  try {
    const url = `${LESSONS_API_BASE}/venues/public/feed/${venueId}`;
    const response = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

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
      console.log("PlanFeed: loaded planItems count:", result.length);

      // Auto-populate from venue feed if no plan items exist
      if (result.length === 0) {
        const plan = await this.repos.plan.load(churchId, planId);
        console.log("PlanFeed: plan loaded:", plan ? `contentId=${plan.contentId}` : "null");
        if (plan?.contentId) {
          const venueFeed = await fetchVenueFeed(plan.contentId);
          console.log("PlanFeed: venueFeed:", venueFeed ? `sections=${venueFeed.sections?.length}` : "null");
          if (venueFeed) {
            result = venueFeedToDefaultPlanItems(venueFeed, planId);
            console.log("PlanFeed: generated items count:", result.length);
          }
        }
      }

      return this.buildTree(result, null as any);
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
