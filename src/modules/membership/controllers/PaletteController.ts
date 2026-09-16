import { controller, httpGet } from "inversify-express-utils";
import express from "express";
import { AuthenticatedUser } from "@churchapps/apihelper";
import { MembershipBaseController } from "./MembershipBaseController.js";
import { Permissions } from "../helpers/index.js";
import { getDb } from "../db/index.js";
import { getDoingModuleGateway } from "../../../shared/modules/DoingModuleGateway.js";
import { getGivingModuleGateway } from "../../../shared/modules/GivingModuleGateway.js";

export interface PaletteItem { n: string; a?: string[]; t: "do" | "person" | "group" | "plan" | "fund" | "jump"; u: string }

interface Access {
  people: boolean; peopleEdit: boolean; giving: boolean; givingView: boolean; givingEdit: boolean; attendance: boolean; content: boolean;
  sermons: boolean; settings: boolean; roles: boolean; forms: boolean; plans: boolean; serverAdmin: boolean
}

const jump = (n: string, u: string, a?: string[]): PaletteItem => (a ? { n, a, t: "jump", u } : { n, t: "jump", u });

// Same gates as B1Admin Header.tsx / SecondaryMenuHelper.ts: if they cannot open it, it is not in the payload.
export const staticItems = (c: Access): PaletteItem[] => {
  const items: PaletteItem[] = [];
  if (c.peopleEdit) items.push({ n: "Add a person", a: ["new person", "new household", "create person"], t: "do", u: "#addPerson" });
  if (c.settings) items.push({ n: "Start check-in", a: ["kiosk", "b1 check-in", "checkin app"], t: "do", u: "/mobile/checkin" });
  items.push(jump("Sunday", "/", ["home", "dashboard", "this week", "bulletin"]));
  if (c.people) {
    items.push(jump("People", "/people", ["directory", "members", "congregation", "households"]));
    items.push(jump("Demographics", "/people/demographics", ["people stats", "age", "gender"]));
    items.push(jump("Print directory", "/people/print-directory", ["directory pdf"]));
  }
  items.push(jump("Groups", "/groups", ["classes", "teams", "small groups"]));
  items.push(jump("Pending group requests", "/groups/pending", ["join requests", "group requests"]));
  items.push(jump("Group health", "/groups/health", ["group stats", "group attendance"]));
  if (c.giving) {
    items.push(jump("Donations", "/donations", ["giving", "gifts", "tithes", "money", "summary"]));
    items.push(jump("Batches", "/donations/batches", ["donation batches", "deposits"]));
    items.push(jump("Funds", "/donations/funds", ["designations"]));
    items.push(jump("Campaigns", "/donations/campaigns", ["pledges", "fundraising", "goals"]));
    items.push(jump("Giving statements", "/donations/statements", ["tax statements", "year end", "contribution statements"]));
  }
  if (c.givingView) items.push(jump("Failed donations", "/donations/failed", ["declined", "failed payments"]));
  if (c.givingEdit) items.push(jump("Stripe import", "/donations/stripe-import", ["import donations"]));
  if (c.plans) {
    items.push(jump("Plans", "/serving/plans", [
      "serving", "service order", "volunteer scheduling", "rotations", "teams", "schedule", "freeshow", "freeplay"
    ]));
    items.push(jump("Songs", "/serving/songs", ["worship", "music", "arrangements", "praisecharts", "setlist"]));
    items.push(jump("Serving overview", "/serving/overview", ["positions", "unfilled", "who's serving"]));
  }
  items.push(jump("My Work", "/serving/tasks", ["tasks", "assignments"]));
  items.push(jump("Workflows", "/serving/tasks/workflows", ["automations", "pipelines", "kanban", "boards"]));
  if (c.attendance) items.push(jump("Attendance", "/attendance", ["check-in", "who's here", "rooms", "services", "service times"]));
  if (c.content) {
    items.push(jump("Site", "/site/pages", ["website", "pages", "web"]));
    items.push(jump("Blog", "/site/blog", ["blogs", "posts", "articles", "news"]));
    items.push(jump("Blocks", "/site/blocks", ["reusable blocks", "sections", "footer", "header"]));
    items.push(jump("Appearance", "/site/appearance", ["colors", "fonts", "logo", "theme", "branding"]));
    items.push(jump("Files", "/site/files", ["uploads", "media", "images", "documents"]));
    items.push(jump("Calendars", "/calendars", ["events", "rooms"]));
    items.push(jump("Availability", "/calendars/availability", ["time off", "unavailable", "blackout dates"]));
    items.push(jump("Rooms & resources", "/calendars/rooms", ["room booking", "equipment", "reservations"]));
    items.push(jump("Approvals", "/calendars/approvals", ["event approvals", "pending events"]));
    items.push(jump("Registrations", "/registrations", ["event registration", "sign ups", "rsvp", "tickets"]));
    items.push(jump("App navigation", "/mobile/navigation", ["mobile menu", "app tabs", "app links"]));
  }
  if (c.sermons) {
    items.push(jump("Sermons", "/sermons", ["streaming", "livestream", "video", "messages"]));
    items.push(jump("Live stream times", "/sermons/times", ["stream schedule", "service stream"]));
    items.push(jump("Bulk import sermons", "/sermons/bulk", ["youtube import", "vimeo import"]));
  }
  if (c.forms) items.push(jump("Forms", "/forms", ["registration forms", "surveys", "questionnaires"]));
  if (c.settings) {
    items.push(jump("Settings", "/settings", ["church settings", "church info", "general"]));
    items.push(jump("Giving settings", "/settings#giving", ["stripe", "paypal", "payment provider", "processor"]));
    items.push(jump("Texting settings", "/settings#texting", ["sms", "twilio", "text messages"]));
    items.push(jump("Storage settings", "/settings#storage", ["s3", "google drive", "byos", "file storage"]));
    items.push(jump("Domains", "/settings#domains", ["custom domain", "dns", "subdomain"]));
    items.push(jump("Grade promotion", "/settings#grade-promotion", ["grades", "school year", "promote"]));
    items.push(jump("Check-in settings", "/settings#check-ins", ["checkin options", "self check-in", "pin"]));
    items.push(jump("Campuses", "/settings#campuses", ["locations", "sites"]));
    items.push(jump("Custom fields", "/settings#custom-fields", ["person fields", "extra fields"]));
    items.push(jump("Developer", "/settings#developer", ["webhooks", "api keys", "oauth", "integrations", "zapier"]));
    items.push(jump("Email templates", "/settings/email-templates", ["emails", "templates"]));
    items.push(jump("Audit log", "/settings/audit-log", ["history", "changes", "who changed", "undo"]));
    items.push(jump("Batch jobs", "/settings/batches", ["bulk edits", "batch history"]));
    items.push(jump("App theme", "/mobile/theme", ["mobile colors", "app colors", "app logo"]));
    items.push(jump("B1 Mobile", "/mobile/b1-mobile", ["mobile app", "app store", "play store"]));
    items.push(jump("Check-in labels", "/mobile/checkin/labels", ["name tags", "nametags", "label printer"]));
  }
  if (c.roles || c.settings) items.push(jump("Roles", "/settings/roles", ["users", "permissions", "access", "staff logins"]));
  if (c.content || c.settings) items.push(jump("Mobile", "/mobile", ["app", "kiosk", "check-in app"]));
  if (c.serverAdmin) items.push(jump("Server admin", "/admin", ["admin", "all churches", "reports"]));
  items.push(jump("Profile", "/profile", ["my account", "password", "notifications"]));
  items.push(jump("Devices", "/profile/devices", ["logged in devices", "sessions", "push"]));
  return items;
};

@controller("/membership/palette")
export class PaletteController extends MembershipBaseController {

  @httpGet("/")
  public async get(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const access = await this.access(au);
      const [people, groups, plans, funds] = await Promise.all([
        access.people ? this.loadPeople(au.churchId) : [],
        this.loadGroups(au.churchId),
        access.plans ? getDoingModuleGateway().loadPalette(au.churchId) : [],
        access.giving ? getGivingModuleGateway().loadPalette(au.churchId) : []
      ]);
      const items: PaletteItem[] = [
        ...staticItems(access),
        ...people,
        ...groups.map((g: any) => ({ n: g.name, t: "group" as const, u: "/groups/" + g.id })),
        ...plans.map((p) => ({ n: p.name, t: "plan" as const, u: "/serving/plans/" + p.id })),
        ...funds.map((f) => ({ n: f.name, t: "fund" as const, u: "/donations/funds/" + f.id }))
      ];
      return { items };
    });
  }

  private async access(au: AuthenticatedUser): Promise<Access> {
    const can = (p: any) => au.checkAccess(p);
    let plans = can(Permissions.plans.edit);
    if (!plans && au.personId) {
      const mine = (await this.repos.group.loadAllForPerson(au.personId)) as any[];
      plans = mine.some((g) => (g.tags || "").indexOf("ministry") > -1);
    }
    return {
      people: can(Permissions.people.view),
      peopleEdit: can(Permissions.people.edit),
      giving: can(Permissions.donations.viewSummary),
      givingView: can(Permissions.donations.view),
      givingEdit: can(Permissions.donations.edit),
      attendance: can(Permissions.attendance.viewSummary),
      content: can(Permissions.content.edit),
      sermons: can(Permissions.streamingServices.edit),
      settings: can(Permissions.settings.edit),
      roles: can(Permissions.roles.view),
      forms: can(Permissions.forms.admin) || can(Permissions.forms.edit),
      plans,
      serverAdmin: can(Permissions.server.admin)
    };
  }

  private async loadPeople(churchId: string): Promise<PaletteItem[]> {
    const rows = await getDb().selectFrom("people").select(["id", "displayName", "firstName", "nickName"])
      .where("churchId", "=", churchId).where("removed", "=", false as any).execute();
    return rows.map((r: any) => {
      const item: PaletteItem = { n: r.displayName, t: "person", u: "/people/" + r.id };
      if (r.nickName && r.nickName !== r.firstName) item.a = [r.nickName];
      return item;
    });
  }

  private loadGroups(churchId: string) {
    return getDb().selectFrom("groups").select(["id", "name"])
      .where("churchId", "=", churchId).where("removed", "=", false as any)
      .where((eb) => eb.or([eb("archived", "is", null), eb("archived", "=", false as any)]))
      .orderBy("name").execute();
  }
}
