import { FileStorageHelper } from "@churchapps/apihelper";
import { RepoManager } from "../../../shared/infrastructure/index.js";
import { InternalEventBus } from "../../../shared/events/InternalEventBus.js";
import { Task } from "../models/index.js";
import { Repos } from "../repositories/index.js";
import { Environment } from "./Environment.js";

export class DirectoryUpdateHelper {
  private static async savePhoto(churchId: string, base64Str: string, personId: string): Promise<string> {
    const base64Parts = base64Str.split(",");
    const base64 = base64Parts.length > 1 ? base64Parts[1] : "";
    const photoUpdated = new Date();
    const key = "/" + churchId + "/membership/people/pending/" + personId + "-" + photoUpdated.getTime().toString() + ".png";
    await FileStorageHelper.store(key, "image/png", Buffer.from(base64, "base64"));
    return Environment.contentRoot + key + "?dt=" + photoUpdated.getTime().toString();
  }

  static maxPhotoBytes = 5 * 1024 * 1024;

  static isAcceptablePhoto(dataUrl: string): boolean {
    const match = /^data:image\/(png|jpeg|jpg|webp);base64,/i.exec(dataUrl);
    if (!match) return false;
    return (dataUrl.length - match[0].length) * 0.75 <= this.maxPhotoBytes;
  }

  // Rewrites any inline photo data URL in an Open directoryUpdate task to a stored file URL.
  public static async handleDirectoryUpdate(churchId: string, task: Task): Promise<void> {
    if (task.status === "Open") {
      const data = task.data
        ? (() => {
          try {
            return JSON.parse(task.data);
          } catch {
            return [];
          }
        })()
        : [];
      const kept: any[] = [];
      for (const d of Array.isArray(data) ? data : []) {
        if (d?.field === "photo" && typeof d.value === "string" && d.value.startsWith("data:")) {
          if (!this.isAcceptablePhoto(d.value)) continue;
          d.value = await this.savePhoto(churchId, d.value, task.associatedWithId);
        }
        kept.push(d);
      }
      task.data = JSON.stringify(kept);
      task.taskType = "directoryUpdate";
    }
  }

  // Server-side equivalent of the member self-service directory photo submission:
  // builds the Open directoryUpdate task, stores the photo, and persists it for staff approval.
  public static async createPhotoTask(churchId: string, personId: string, dataUrl: string, assignedTo?: { type: string; id: string }): Promise<Task> {
    const repos = await RepoManager.getRepos<Repos>("doing");
    const task: Task = {
      churchId,
      taskType: "directoryUpdate",
      associatedWithType: "person",
      associatedWithId: personId,
      status: "Open",
      title: "Photo",
      data: JSON.stringify([{ field: "photo", label: "Photo", value: dataUrl }])
    };
    if (assignedTo?.id) {
      task.assignedToType = assignedTo.type;
      task.assignedToId = assignedTo.id;
    }
    await this.handleDirectoryUpdate(churchId, task);
    const saved = await repos.task.save(task);
    await InternalEventBus.publish(churchId, "task.updated", saved);
    return saved;
  }

  // Bus subscriber: the membership module publishes "sso.photoSubmitted" after an SSO
  // login so the photo enters the same staff-approval flow as member self-service.
  public static onEvent = async (churchId: string, event: string, payload: any): Promise<void> => {
    if (event !== "sso.photoSubmitted") return;
    if (!payload?.personId || !payload?.dataUrl) return;
    await DirectoryUpdateHelper.createPhotoTask(churchId, payload.personId, payload.dataUrl, payload.assignedTo);
  };
}
