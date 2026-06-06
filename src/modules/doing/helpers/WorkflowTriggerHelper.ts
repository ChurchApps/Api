import { Repos } from "../repositories/index.js";
import { RepoManager } from "../../../shared/infrastructure/index.js";
import { FormWorkflowTrigger } from "../models/index.js";
import { WorkflowHelper } from "./WorkflowHelper.js";
import { getMembershipModuleGateway } from "../../../shared/modules/index.js";

interface SubmissionLike {
  churchId?: string;
  formId?: string;
  contentType?: string;
  contentId?: string;
}

export class WorkflowTriggerHelper {
  // After a form submission, add the person to any workflow that form triggers.
  public static async onFormSubmission(submission: SubmissionLike | SubmissionLike[]): Promise<void> {
    const submissions = Array.isArray(submission) ? submission : [submission];
    try {
      const repos = await RepoManager.getRepos<Repos>("doing");
      for (const sub of submissions) {
        if (!sub?.formId || !sub.churchId) continue;
        if (sub.contentType !== "person" || !sub.contentId) continue;
        const triggers = (await repos.formWorkflowTrigger.loadByForm(sub.churchId, sub.formId)) as FormWorkflowTrigger[];
        if (triggers.length === 0) continue;
        const people = await getMembershipModuleGateway().loadPeople(sub.churchId, [sub.contentId]);
        const label = people[0]?.displayName;
        for (const trigger of triggers) {
          if (!trigger.workflowId) continue;
          await WorkflowHelper.addToWorkflow(
            sub.churchId,
            trigger.workflowId,
            { type: "person", id: sub.contentId, label },
            { type: "system", label: "Form" },
            undefined,
            repos
          );
        }
      }
    } catch {
      // Doing module not reachable in this process; the scheduled automation check is the fallback.
    }
  }
}
