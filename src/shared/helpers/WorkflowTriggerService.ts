export interface FormSubmissionLike {
  churchId?: string;
  formId?: string;
  contentType?: string;
  contentId?: string;
}

export type OnFormSubmissionFn = (submission: FormSubmissionLike | FormSubmissionLike[]) => Promise<void>;

export class WorkflowTriggerService {
  private static onFormSubmissionImpl: OnFormSubmissionFn | null = null;

  static register(impl: OnFormSubmissionFn) {
    WorkflowTriggerService.onFormSubmissionImpl = impl;
  }

  // No-op when the doing module hasn't booted in this process; the scheduled automation check is the fallback.
  static async onFormSubmission(submission: FormSubmissionLike | FormSubmissionLike[]): Promise<void> {
    if (!WorkflowTriggerService.onFormSubmissionImpl) return;
    return WorkflowTriggerService.onFormSubmissionImpl(submission);
  }
}
