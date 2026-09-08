import { fileRole } from "@churchapps/helpers";
import { Environment, Permissions } from "../../../shared/helpers/index.js";
import { AssetFile, SubmissionPayload } from "../models/index.js";

/** The slice of AuthenticatedUser the review gates need. */
export interface Reviewer { id?: string; email?: string; checkAccess: (p: any) => boolean }

export interface DeclinedFile { name: string; reason: string }

/** File roles whose upload is a recording-ownership attestation, so adding one to a live song is a rights change. */
const RIGHTS_FILE_ROLES = ["demoAudio", "stemsZip"];

const text = (v: unknown) => (v === undefined || v === null ? "" : String(v).trim());

/**
 * Who may review. Server admins always; music editors are the users listed in COMMONS_MUSIC_EDITORS
 * and may approve, request changes and reject anything that leaves the rights alone.
 */
export class ReviewerHelper {
  // ponytail: env list — upgrade path is a Commons/Edit permission in membership when roles get UI
  static isMusicEditor(au: Reviewer | undefined): boolean {
    if (!au?.id) return false;
    const listed = (Environment.commonsMusicEditors || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!listed.length) return false;
    const email = (au.email || "").trim().toLowerCase();
    return listed.some((entry) => entry === au.id || (!!email && entry.toLowerCase() === email));
  }

  static canReview(au: Reviewer | undefined): boolean {
    if (!au?.id) return false;
    return au.checkAccess(Permissions.server.admin) || this.isMusicEditor(au);
  }

  /**
   * The first rights field the proposal changes against the live payload, or undefined when the rights stand.
   * A new asset has no live payload, so its first publish is itself the rights decision.
   * licenseVersion is auto-filled at submit, so it only counts once the live song already carries one.
   */
  static rightsChange(live: SubmissionPayload | undefined, proposed: SubmissionPayload | undefined, proposedFiles: AssetFile[] = []): string | undefined {
    if (!live) return "license";
    if (text(live.license) !== text(proposed?.license)) return "license";
    if (text(live.licenseVersion) && text(live.licenseVersion) !== text(proposed?.licenseVersion)) return "licenseVersion";
    if (!!live.detail?.recordingOwned !== !!proposed?.detail?.recordingOwned) return "recordingOwned";
    if (text(live.detail?.proAnswer) !== text(proposed?.detail?.proAnswer)) return "proAnswer";
    const upload = proposedFiles.find((f) => f.action !== "remove" && RIGHTS_FILE_ROLES.includes(fileRole(f.name || "")));
    return upload?.name;
  }

  /** Validates a partial-approve body against the submission's proposed files. */
  static parseDeclined(raw: unknown, proposed: AssetFile[], liveNames: string[], requiredRoles: string[]): { declined: DeclinedFile[]; error?: string } {
    if (raw === undefined || raw === null) return { declined: [] };
    if (!Array.isArray(raw)) return { declined: [], error: "declineFiles must be a list" };
    const names = new Set(proposed.filter((f) => f.action !== "remove").map((f) => f.name || ""));
    const declined: DeclinedFile[] = [];
    for (const item of raw) {
      const name = text((item as any)?.name);
      const reason = text((item as any)?.reason).slice(0, 200);
      if (!names.has(name)) return { declined: [], error: `${name || "(blank)"} is not a proposed file` };
      if (!reason) return { declined: [], error: `a reason is required to decline ${name}` };
      if (declined.some((d) => d.name === name)) return { declined: [], error: `${name} is listed twice` };
      if (requiredRoles.includes(fileRole(name)) && !liveNames.includes(name)) return { declined: [], error: `${name} is required and has no live copy to fall back on` };
      declined.push({ name, reason });
    }
    return { declined };
  }
}
