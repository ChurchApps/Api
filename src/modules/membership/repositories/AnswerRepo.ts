import { injectable } from "inversify";
import { eq, and } from "drizzle-orm";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { answers } from "../../../db/schema/membership.js";

@injectable()
export class AnswerRepo extends DrizzleRepo<typeof answers> {
  protected readonly table = answers;
  protected readonly moduleName = "membership";


  public deleteForSubmission(churchId: string, formSubmissionId: string) {
    return this.db.delete(answers).where(and(eq(answers.churchId, churchId), eq(answers.formSubmissionId, formSubmissionId)));
  }

  public loadForFormSubmission(churchId: string, formSubmissionId: string) {
    return this.db.select().from(answers).where(and(eq(answers.churchId, churchId), eq(answers.formSubmissionId, formSubmissionId)));
  }
}
