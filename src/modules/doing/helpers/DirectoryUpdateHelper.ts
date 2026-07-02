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
    const key = "/" + churchId + "/membership/people/" + personId + ".png";
    await FileStorageHelper.store(key, "image/png", Buffer.from(base64, "base64"));
    const photoUpdated = new Date();
    return Environment.contentRoot + key + "?dt=" + photoUpdated.getTime().toString();
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
      for (const d of data) {
        if (d.field === "photo" && d.value !== undefined) {
          d.value = await this.savePhoto(churchId, d.value, task.associatedWithId);
        }
      }
      task.data = JSON.stringify(data);
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
