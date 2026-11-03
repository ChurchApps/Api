import { getProvider, ContentProviderAuthData, Instructions, InstructionItem } from "@churchapps/content-providers";
import { NotificationService } from "../../../shared/helpers/NotificationService.js";
import { getMembershipModuleGateway } from "../../../shared/modules/index.js";
import { Plan, PlanItem } from "../models/index.js";
import { ProviderAuthHelper } from "./ProviderAuthHelper.js";

// A plan type's saved lesson trim (#1401): the parts of a lesson kept in one hand-customized plan, re-applied by name
// (and, for a part inside a section, by position) to every lesson scheduled into that plan type. Provider-neutral:
// it only reads the Instructions shape (sections → actions → files). Spoken-script (action) labels are never matched.

export interface LessonTrimKeep {
  section: string;
  sectionIndex: string;
  part?: string;
  partPath?: string;
  itemType?: string;
  media?: boolean;
}

export interface LessonTrim {
  providerId: string;
  savedFromPlanId?: string;
  savedFromName?: string;
  savedFromDate?: string;
  keep: LessonTrimKeep[];
}

export interface LessonTrimResult {
  planId: string;
  name?: string;
  serviceDate?: Date;
  warning: string | null;
}

interface SectionNode { item: InstructionItem; path: string; group: number }

interface ProviderLike {
  requiresAuth?: boolean | (() => boolean);
  authTypes?: string[];
  getInstructions?(path: string, auth?: ContentProviderAuthData | null): Promise<Instructions | null>;
}

export const LESSON_UNREADABLE = "Couldn't read the lesson to apply the saved trim";
export const NOTHING_MATCHED = "Nothing in this lesson matched the saved trim";

export class LessonTrimHelper {
  public static parse(json?: string | null): LessonTrim | null {
    if (!json) return null;
    try {
      const trim = JSON.parse(json) as LessonTrim;
      return trim?.providerId && Array.isArray(trim.keep) && trim.keep.length > 0 ? trim : null;
    } catch {
      return null;
    }
  }

  private static normalize(text?: string): string {
    return (text || "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  }

  // Equal wins; otherwise one name containing the other on word boundaries ("Bible Story Questions" ⊂ "Big Bible Story Questions").
  private static matchScore(a?: string, b?: string): number {
    const x = this.normalize(a);
    const y = this.normalize(b);
    if (!x || !y) return 0;
    if (x === y) return 2;
    return (` ${x} `).includes(` ${y} `) || (` ${y} `).includes(` ${x} `) ? 1 : 0;
  }

  private static bestMatch<T>(name: string, candidates: T[], label: (c: T) => string | undefined): T | null {
    let best: T | null = null;
    let bestScore = 0;
    for (const c of candidates) {
      const score = this.matchScore(name, label(c));
      if (score > bestScore) { best = c; bestScore = score; }
    }
    return best;
  }

  // Section-level nodes are what Customize saves as rows: the children of each header, or the top-level items when there is no header.
  private static sections(instructions: Instructions): SectionNode[] {
    const items = instructions?.items || [];
    const hasHeader = items.some((i) => i.itemType === "header");
    const result: SectionNode[] = [];
    items.forEach((item, i) => {
      if (hasHeader && item.itemType === "header") (item.children || []).forEach((child, j) => result.push({ item: child, path: `${i}.${j}`, group: i }));
      else result.push({ item, path: String(i), group: hasHeader ? i : -1 });
    });
    return result;
  }

  private static navigate(item: InstructionItem, relPath: string): InstructionItem | null {
    let node: InstructionItem | undefined = item;
    for (const part of relPath.split(".")) node = node?.children?.[Number(part)];
    return node || null;
  }

  private static files(item: InstructionItem, prefix = ""): { item: InstructionItem; path: string }[] {
    return (item.children || []).flatMap((child, i) => {
      const path = prefix ? `${prefix}.${i}` : String(i);
      return [...(child.itemType === "file" ? [{ item: child, path }] : []), ...this.files(child, path)];
    });
  }

  private static hasMedia(item: InstructionItem): boolean {
    return !!item.downloadUrl || (item.children || []).some((c) => this.hasMedia(c));
  }

  private static partName(item: InstructionItem): string | undefined {
    if (item.itemType === "file") return item.label;
    return this.files(item)[0]?.item.label || (item.itemType === "action" ? undefined : item.label);
  }

  private static thumbnail(item: InstructionItem): string | undefined {
    if (item.thumbnail) return item.thumbnail;
    for (const child of item.children || []) {
      const found = this.thumbnail(child);
      if (found) return found;
    }
    return undefined;
  }

  // Mirrors B1Admin ServiceOrder.instructionToPlanItem, plus relatedId falling back to the item id so a TV paired to the plan type can match it.
  private static toRow(item: InstructionItem, providerId: string, providerPath: string, contentPath: string): PlanItem {
    const typeMap: Record<string, string> = { section: "providerSection", action: "providerPresentation", file: "providerFile" };
    return {
      itemType: typeMap[item.itemType || ""] || item.itemType || "item",
      actionType: item.actionType,
      relatedId: item.relatedId || item.id,
      label: item.label || "",
      description: item.content,
      seconds: item.seconds ?? 0,
      providerId,
      providerPath,
      providerContentPath: contentPath,
      thumbnailUrl: this.thumbnail(item)
    };
  }

  public static capture(rows: PlanItem[], plan: Plan, instructions: Instructions | null): LessonTrim {
    const providerRows = (rows || []).filter((r) => r.providerId && r.providerContentPath && r.itemType !== "header" && (!r.providerPath || r.providerPath === plan.providerPlanId));
    const sections = instructions ? this.sections(instructions) : [];
    const keep: LessonTrimKeep[] = [];
    for (const row of providerRows) {
      const path = row.providerContentPath || "";
      if (!instructions) {
        if (row.itemType === "providerSection") keep.push({ section: row.label || "", sectionIndex: path });
        continue;
      }
      const section = sections.find((s) => path === s.path || path.startsWith(s.path + "."));
      if (!section?.item.label) continue;
      if (path === section.path) {
        keep.push({ section: section.item.label, sectionIndex: section.path, media: this.hasMedia(section.item) });
        continue;
      }
      const partPath = path.slice(section.path.length + 1);
      const node = this.navigate(section.item, partPath);
      const part = node ? this.partName(node) : undefined;
      if (!node || !part) continue;
      keep.push({ section: section.item.label, sectionIndex: section.path, part, partPath, itemType: row.itemType, media: this.hasMedia(node) });
    }
    const whole = new Set(keep.filter((k) => !k.part).map((k) => k.sectionIndex));
    const seen = new Set<string>();
    const deduped = keep.filter((k) => {
      if (k.part && whole.has(k.sectionIndex)) return false;
      const key = `${k.sectionIndex}|${k.partPath || ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const serviceDate = plan.serviceDate ? new Date(plan.serviceDate) : null;
    return {
      providerId: plan.providerId || "",
      savedFromPlanId: plan.id,
      savedFromName: plan.name,
      savedFromDate: serviceDate && !isNaN(serviceDate.getTime()) ? serviceDate.toISOString().split("T")[0] : undefined,
      keep: deduped
    };
  }

  public static select(instructions: Instructions, trim: LessonTrim, providerId: string, providerPath: string, lessonName?: string): { rows: PlanItem[]; notes: string[]; misses: string[] } {
    const sections = this.sections(instructions);
    const notes: string[] = [];
    const misses: string[] = [];
    const kept: { group: number; order: string; row: PlanItem }[] = [];
    const used = new Set<string>();

    for (const k of trim.keep) {
      const section = this.bestMatch(k.section, sections, (s) => s.item.label);
      if (!section) { misses.push(`"${k.section}" isn't in this lesson`); continue; }

      let target: InstructionItem = section.item;
      let targetPath = section.path;
      let name = section.item.label || k.section;
      if (k.part && k.partPath) {
        const depth = k.partPath.split(".").length;
        const byName = this.bestMatch(k.part, this.files(section.item), (f) => f.item.label);
        const relPath = byName ? byName.path.split(".").slice(0, depth).join(".") : k.partPath;
        const node = this.navigate(section.item, relPath);
        if (!byName && node) {
          const current = this.partName(node) || node.label || "";
          if (this.matchScore(current, k.part) === 0) notes.push(`Kept "${current}" by position in "${name}"; last time it was "${k.part}"`);
        }
        if (!node) { misses.push(`"${k.part}" isn't in "${name}" this lesson`); continue; }
        target = node;
        targetPath = `${section.path}.${relPath}`;
        name = this.partName(node) || k.part;
      }
      if (used.has(targetPath)) continue;
      if (k.media && !this.hasMedia(target)) { misses.push(`"${name}" has no video or image this week`); continue; }
      used.add(targetPath);
      kept.push({ group: section.group, order: targetPath, row: this.toRow(target, providerId, providerPath, targetPath) });
    }

    if (kept.length === 0) return { rows: [], notes: [], misses: [NOTHING_MATCHED] };

    // Lesson order: compare dot paths numerically.
    const cmp = (a: string, b: string) => {
      const x = a.split(".").map(Number);
      const y = b.split(".").map(Number);
      for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? -1) !== (y[i] ?? -1)) return (x[i] ?? -1) - (y[i] ?? -1);
      return 0;
    };
    kept.sort((a, b) => cmp(a.order, b.order));

    // Same shape as Customize: a flat lesson is wrapped in one header named after it; a lesson with headers keeps the ones that still have parts.
    const rows: PlanItem[] = [];
    const items = instructions.items || [];
    if (!items.some((i) => i.itemType === "header")) {
      rows.push({ itemType: "header", label: instructions.name || lessonName || "", children: kept.map((k) => k.row) });
    } else {
      for (const k of kept) {
        if (k.group < 0) { rows.push(k.row); continue; }
        const header = items[k.group];
        let headerRow = rows.find((r) => r.itemType === "header" && r.providerContentPath === String(k.group));
        if (!headerRow) {
          headerRow = { ...this.toRow(header, providerId, providerPath, String(k.group)), children: [] };
          rows.push(headerRow);
        }
        headerRow.children!.push(k.row);
      }
    }
    return { rows, notes, misses };
  }

  public static async loadInstructions(repos: any, churchId: string, plan: Plan): Promise<Instructions | null> {
    if (!plan.providerId || !plan.providerPlanId) return null;
    const provider = getProvider(plan.providerId) as unknown as ProviderLike | null;
    if (!provider?.getInstructions || provider.authTypes?.includes("network_discovery")) return null;
    const needsAuth = typeof provider.requiresAuth === "function" ? provider.requiresAuth() : !!provider.requiresAuth;
    const auth = needsAuth ? await ProviderAuthHelper.getAuth(repos, churchId, plan.ministryId, plan.providerId) : null;
    if (needsAuth && !auth) return null;
    return provider.getInstructions(plan.providerPlanId, auth);
  }

  // Trims a lesson-linked plan to its plan type's saved trim. Skips plans that already have an order of service unless forced.
  // Never throws: a provider failure becomes the plan's warning, and the lesson plays whole.
  public static async apply(repos: any, churchId: string, plan: Plan, opts: { force?: boolean } = {}): Promise<LessonTrimResult | null> {
    if (!plan?.id || !plan.planTypeId || !plan.providerId || !plan.providerPlanId) return null;
    const planType = await repos.planType.load(churchId, plan.planTypeId);
    const trim = this.parse(planType?.lessonTrim);
    if (!trim || trim.providerId !== plan.providerId) return null;
    const existing = (await repos.planItem.loadForPlan(churchId, plan.id)) as PlanItem[];
    if (existing.length > 0 && !opts.force) return null;

    let warning: string;
    try {
      const instructions = await this.loadInstructions(repos, churchId, plan);
      if (!instructions?.items?.length) throw new Error("No instructions");
      const selected = this.select(instructions, trim, plan.providerId, plan.providerPlanId, plan.providerPlanName);
      if (selected.rows.length > 0) {
        if (existing.length > 0) {
          await repos.planItemTime.deleteByPlanId(churchId, plan.id);
          await repos.planItem.deleteByPlanId(churchId, plan.id);
        }
        await this.saveTree(repos, churchId, plan.id, selected.rows);
      }
      warning = [...selected.misses, ...selected.notes].join(". ");
    } catch (e) {
      console.error("Lesson trim failed for plan " + plan.id, e);
      warning = LESSON_UNREADABLE;
    }

    const stored = warning ? warning.slice(0, 500) : null;
    await repos.plan.updateLessonTrimWarning(churchId, plan.id, stored);
    if (stored) await this.notifyLeaders(churchId, plan, stored);
    return { planId: plan.id, name: plan.name, serviceDate: plan.serviceDate, warning: stored };
  }

  private static async saveTree(repos: any, churchId: string, planId: string, rows: PlanItem[], parentId?: string): Promise<void> {
    for (let i = 0; i < rows.length; i++) {
      const { children, ...row } = rows[i];
      const saved = await repos.planItem.save({ ...row, churchId, planId, parentId, sort: i + 1 });
      if (children?.length) await this.saveTree(repos, churchId, planId, children, saved.id);
    }
  }

  private static async notifyLeaders(churchId: string, plan: Plan, warning: string): Promise<void> {
    try {
      if (!plan.ministryId) return;
      const gateway = getMembershipModuleGateway();
      const leaderIds = await gateway.loadGroupLeaderPersonIds(churchId, plan.ministryId);
      if (leaderIds.length === 0) return;
      const church = await gateway.loadChurch(churchId);
      const planUrl = `https://${church?.subDomain || "app"}.b1.church/mobile/plans/${plan.id}`;
      await NotificationService.createNotifications(leaderIds, churchId, "plan", plan.id, `${plan.name}: ${warning}`.slice(0, 500), planUrl);
    } catch (e) {
      console.error("Lesson trim notification failed:", e);
    }
  }
}
