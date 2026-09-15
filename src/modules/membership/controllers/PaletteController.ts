import { controller, httpGet } from "inversify-express-utils";
import express from "express";
import { AuthenticatedUser } from "@churchapps/apihelper";
import { MembershipBaseController } from "./MembershipBaseController.js";
import { Permissions } from "../helpers/index.js";
import { getDb } from "../db/index.js";
import { getDoingModuleGateway } from "../../../shared/modules/DoingModuleGateway.js";
import { getGivingModuleGateway } from "../../../shared/modules/GivingModuleGateway.js";

export interface PaletteItem { n: string; a?: string[]; t: "do" | "person" | "group" | "plan" | "fund" | "jump"; u: string }

interface Access { people: boolean; peopleEdit: boolean; giving: boolean; attendance: boolean; content: boolean; sermons: boolean; settings: boolean; roles: boolean; forms: boolean; plans: boolean }

// Same gates as B1Admin Header.tsx: if they cannot open it, it is not in the payload.
export const staticItems = (c: Access): PaletteItem[] => {
  const items: PaletteItem[] = [];
  if (c.peopleEdit) items.push({ n: "Add a person", a: ["new person", "new household", "create person"], t: "do", u: "#addPerson" });
  if (c.settings) items.push({ n: "Start check-in", a: ["kiosk"], t: "do", u: "/mobile/checkin" });
  items.push({ n: "Sunday", a: ["home", "dashboard", "this week", "bulletin"], t: "jump", u: "/" });
  if (c.people) items.push({ n: "People", a: ["directory", "members", "congregation", "households"], t: "jump", u: "/people" });
  items.push({ n: "Groups", a: ["classes", "teams", "small groups"], t: "jump", u: "/groups" });
  if (c.giving) items.push({ n: "Donations", a: ["giving", "gifts", "tithes", "money", "batches"], t: "jump", u: "/donations" });
  if (c.plans) {
    items.push({
      n: "Plans",
      a: [
        "serving", "service order", "volunteer scheduling", "rotations", "teams", "schedule", "freeshow", "freeplay"
      ],
      t: "jump",
      u: "/serving/plans"
    });
  }
  items.push({ n: "My Work", a: ["tasks", "assignments"], t: "jump", u: "/serving/tasks" });
  if (c.attendance) items.push({ n: "Attendance", a: ["check-in", "who's here", "rooms"], t: "jump", u: "/attendance" });
  if (c.content) items.push({ n: "Site", a: ["website", "pages", "web"], t: "jump", u: "/site/pages" });
  if (c.sermons) items.push({ n: "Sermons", a: ["streaming", "livestream", "video"], t: "jump", u: "/sermons" });
  if (c.content) items.push({ n: "Calendars", a: ["events", "rooms"], t: "jump", u: "/calendars" });
  if (c.forms) items.push({ n: "Forms", a: ["registration forms"], t: "jump", u: "/forms" });
  if (c.settings) items.push({ n: "Settings", a: ["roles", "users", "appearance"], t: "jump", u: "/settings" });
  else if (c.roles) items.push({ n: "Settings", a: ["roles", "users"], t: "jump", u: "/settings/roles" });
  if (c.content || c.settings) items.push({ n: "Mobile", a: ["app", "kiosk", "check-in app"], t: "jump", u: "/mobile" });
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
      attendance: can(Permissions.attendance.viewSummary),
      content: can(Permissions.content.edit),
      sermons: can(Permissions.streamingServices.edit),
      settings: can(Permissions.settings.edit),
      roles: can(Permissions.roles.view),
      forms: can(Permissions.forms.admin) || can(Permissions.forms.edit),
      plans
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
