import { Plan, PlanItem } from "../models/index.js";

const LESSONS_API_BASE = "https://api.lessons.church";

export interface FeedFile {
  id?: string;
  name?: string;
  url?: string;
  seconds?: number;
  loop?: boolean;
}

export interface FeedAction {
  id?: string;
  actionType?: string;
  content?: string;
  files?: FeedFile[];
}

export interface FeedSection {
  id?: string;
  name?: string;
  actions?: FeedAction[];
}

export interface FeedVenue {
  id?: string;
  name?: string;
  lessonName?: string;
  lessonImage?: string;
  sections?: FeedSection[];
}

export interface SignageFile {
  name?: string;
  url: string;
  seconds: number;
  loopVideo: boolean;
}

export interface SignageMessage {
  name: string;
  files: SignageFile[];
}

const SECTION_TYPES = new Set(["lessonSection", "section", "providerSection"]);
const ACTION_TYPES = new Set(["lessonAction", "action", "lessonAddOn", "addon"]);
const LINK_TYPES = new Set(["providerFile", "providerPresentation"]);

export class SignageFeedHelper {
  static async fetchVenueFeed(venueId: string): Promise<FeedVenue | null> {
    try {
      const url = `${LESSONS_API_BASE}/venues/public/feed/${venueId}`;
      const response = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  // SignPresenter treats 0/loop as "fill the slot" — 3600 matches the lessons.church classroom feed convention.
  static convertFeedFiles(files: FeedFile[] | undefined): SignageFile[] {
    return (files || []).filter((f) => f.url).map((f) => {
      const loopVideo = !!f.loop;
      let seconds = f.seconds || 0;
      if (!seconds || loopVideo) seconds = 3600;
      return { name: f.name, url: f.url as string, seconds, loopVideo };
    });
  }

  static getSectionFiles(venueFeed: FeedVenue, sectionId: string): SignageFile[] {
    const section = (venueFeed.sections || []).find((s) => s.id === sectionId);
    if (!section) return [];
    const result: SignageFile[] = [];
    for (const action of section.actions || []) {
      const actionType = action.actionType?.toLowerCase();
      if (actionType === "play" || actionType === "add-on") result.push(...this.convertFeedFiles(action.files));
    }
    return result;
  }

  static getActionFiles(venueFeed: FeedVenue, actionId: string): SignageFile[] {
    for (const section of venueFeed.sections || []) {
      for (const action of section.actions || []) {
        if (action.id === actionId) return this.convertFeedFiles(action.files);
      }
    }
    return [];
  }

  private static getItemFiles(item: PlanItem, venueFeed: FeedVenue | null): SignageFile[] {
    if (ACTION_TYPES.has(item.itemType || "") && item.relatedId && venueFeed) return this.getActionFiles(venueFeed, item.relatedId);
    if (LINK_TYPES.has(item.itemType || "") && item.link) {
      return [{ name: item.label, url: item.link, seconds: item.seconds || 3600, loopVideo: false }];
    }
    return [];
  }

  static buildMessages(planItems: PlanItem[], venueFeed: FeedVenue | null): SignageMessage[] {
    const messages: SignageMessage[] = [];
    const walk = (items: PlanItem[]) => {
      for (const item of items || []) {
        if (SECTION_TYPES.has(item.itemType || "")) {
          const childFiles = (item.children || []).flatMap((c) => this.getItemFiles(c, venueFeed));
          let files = childFiles;
          if (files.length === 0 && (item.children || []).length === 0 && item.relatedId && venueFeed) files = this.getSectionFiles(venueFeed, item.relatedId);
          if (files.length > 0) messages.push({ name: item.label || "Section", files });
        } else {
          const files = this.getItemFiles(item, venueFeed);
          if (files.length > 0) messages.push({ name: item.label || "Item", files });
          else walk(item.children || []);
        }
      }
    };
    walk(planItems);
    return messages;
  }

  static buildDefaultMessages(venueFeed: FeedVenue | null): SignageMessage[] {
    if (!venueFeed) return [];
    const messages: SignageMessage[] = [];
    for (const section of venueFeed.sections || []) {
      const files: SignageFile[] = [];
      for (const action of section.actions || []) {
        const actionType = action.actionType?.toLowerCase();
        if (actionType === "play" || actionType === "add-on") files.push(...this.convertFeedFiles(action.files));
      }
      if (files.length > 0) messages.push({ name: section.name || "Section", files });
    }
    return messages;
  }

  static getVenueId(plan: Plan, planItems: PlanItem[]): string | null {
    const primaryLessonItem = planItems.find((pi) => pi.providerId && pi.providerPath);
    if (primaryLessonItem) {
      if (primaryLessonItem.providerId !== "lessonschurch") return null;
      return primaryLessonItem.providerPath || null;
    }
    if (plan.providerId && plan.providerId !== "lessonschurch") return null;
    return plan.contentId || null;
  }
}
