import { TypedDB } from "../../../shared/infrastructure/TypedDB.js";
import { RegistrationMember } from "../models/index.js";
import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo.js";
import { injectable } from "inversify";

@injectable()
export class RegistrationMemberRepo extends ConfiguredRepo<RegistrationMember> {
  protected get repoConfig(): RepoConfig<RegistrationMember> {
    return {
      tableName: "registrationMembers",
      hasSoftDelete: false,
      columns: [
        "registrationId", "personId", "firstName", "lastName"
      ]
    };
  }

  public async loadForRegistration(churchId: string, registrationId: string): Promise<RegistrationMember[]> {
    return TypedDB.query(
      "SELECT * FROM registrationMembers WHERE churchId=? AND registrationId=?;",
      [churchId, registrationId]
    );
  }

  public async loadForEvent(churchId: string, eventId: string): Promise<RegistrationMember[]> {
    return TypedDB.query(
      "SELECT rm.* FROM registrationMembers rm INNER JOIN registrations r ON rm.registrationId=r.id WHERE r.churchId=? AND r.eventId=?;",
      [churchId, eventId]
    );
  }

  public async deleteForRegistration(churchId: string, registrationId: string): Promise<void> {
    await TypedDB.query(
      "DELETE FROM registrationMembers WHERE churchId=? AND registrationId=?;",
      [churchId, registrationId]
    );
  }
}
