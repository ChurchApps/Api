import { FileStorageHelper } from "@churchapps/apihelper";
import { KyselyPool } from "../../../shared/infrastructure/KyselyPool.js";
import type { RoleMemberRepo } from "../repositories/RoleMemberRepo.js";
import type { UserRepo } from "../repositories/UserRepo.js";
import type { MembershipDatabase } from "../db/DatabaseTypes.js";

// Membership may not import other modules' DatabaseTypes, so these are the columns the erasure touches there.
interface PersonOwnedRow { churchId: string; personId: string }
interface GivingErasureDb {
  donations: PersonOwnedRow;
  customers: PersonOwnedRow & { id: string };
  subscriptions: { id: string; churchId: string; customerId: string };
  subscriptionFunds: { churchId: string; subscriptionId: string };
  gatewayPaymentMethods: { churchId: string; customerId: string };
  eventLogs: { churchId: string; customerId: string };
}
interface AttendanceErasureDb { visits: PersonOwnedRow }
interface MessagingErasureDb {
  devices: PersonOwnedRow;
  connections: PersonOwnedRow;
  deliveryLogs: PersonOwnedRow;
  notifications: PersonOwnedRow;
  notificationPreferences: PersonOwnedRow;
  privateMessages: { churchId: string; fromPersonId: string; toPersonId: string };
  messages: PersonOwnedRow & { displayName: string; content: string };
}
interface DoingErasureDb { assignments: PersonOwnedRow; blockoutDates: PersonOwnedRow }
interface ContentErasureDb {
  registrations: PersonOwnedRow & { id: string };
  registrationMembers: { churchId: string; registrationId: string };
  files: { id: string; churchId: string; contentType: string; contentId: string; externalId: string | null };
  links: { churchId: string; category: string; linkData: string };
}

// The membership repos anonymize() uses; the full Repos satisfies it.
interface ErasureRepos {
  roleMember: Pick<RoleMemberRepo, "isSoleDomainAdmin" | "deleteSelf">;
  user: Pick<UserRepo, "delete">;
}

export class GdprErasureHelper {

  /** Replaces PII with generic values while preserving operational records for reporting */
  public static async anonymize(churchId: string, personId: string, userId: string | null, membershipRepos: ErasureRepos) {
    if (userId && (await membershipRepos.roleMember.isSoleDomainAdmin(churchId, userId))) {
      throw new Error("This person is the only Domain Admin for this church. Make someone else a Domain Admin before deleting their account.");
    }

    await Promise.all([
      this.anonymizeMembership(churchId, personId, membershipRepos),
      this.anonymizeGiving(churchId, personId),
      this.anonymizeAttendance(churchId, personId),
      this.anonymizeMessaging(churchId, personId),
      this.anonymizeDoing(churchId, personId),
      this.anonymizeContent(churchId, personId),
      this.deletePhoto(churchId, personId)
    ]);

    // Delete user account last (auth records)
    // The login is global: only this church's links go, and the account itself only when no other church still uses it.
    if (userId) {
      const db = KyselyPool.getDb<MembershipDatabase>("membership");
      await db.deleteFrom("userChurches").where("userId", "=", userId).where("churchId", "=", churchId).execute();
      await membershipRepos.roleMember.deleteSelf(churchId, userId);
      const otherChurch = await db.selectFrom("userChurches").select("id").where("userId", "=", userId).executeTakeFirst();
      const otherRole = await db.selectFrom("roleMembers").select("id").where("userId", "=", userId).executeTakeFirst();
      if (!otherChurch && !otherRole) await membershipRepos.user.delete(userId);
    }
  }

  private static async anonymizeMembership(churchId: string, personId: string, _repos: ErasureRepos) {
    const db = KyselyPool.getDb<MembershipDatabase>("membership");

    await db.updateTable("people").set({
      displayName: "Anonymized",
      firstName: "Anonymized",
      middleName: null,
      lastName: "User",
      nickName: null,
      prefix: null,
      suffix: null,
      email: null,
      homePhone: null,
      mobilePhone: null,
      workPhone: null,
      address1: null,
      address2: null,
      city: null,
      state: null,
      zip: null,
      birthDate: null,
      anniversary: null,
      gender: null,
      maritalStatus: null,
      photoUpdated: null,
      nametagNotes: null,
      donorNumber: null,
      removed: true,
      optedOut: true,
      smsOptedOut: true
    }).where("id", "=", personId).where("churchId", "=", churchId).execute();

    await Promise.all([
      db.deleteFrom("groupMembers").where("personId", "=", personId).where("churchId", "=", churchId).execute(),
      db.deleteFrom("visibilityPreferences").where("personId", "=", personId).where("churchId", "=", churchId).execute(),
      db.deleteFrom("memberPermissions").where("memberId", "=", personId).where("churchId", "=", churchId).execute()
    ]);
  }

  private static async anonymizeGiving(churchId: string, personId: string) {
    const db = KyselyPool.getDb<GivingErasureDb>("giving");

    // NULL out personId on donations — keeps amounts/dates for financial records
    await db.updateTable("donations").set({ personId: null })
      .where("personId", "=", personId).where("churchId", "=", churchId).execute();

    const customers = await db.selectFrom("customers").select("id")
      .where("personId", "=", personId).where("churchId", "=", churchId).execute();
    const customerIds = customers.map(c => c.id);

    if (customerIds.length > 0) {
      const subs = await db.selectFrom("subscriptions").select("id")
        .where("churchId", "=", churchId)
        .where("customerId", "in", customerIds).execute();
      const subIds = subs.map(s => s.id);

      if (subIds.length > 0) {
        await db.deleteFrom("subscriptionFunds").where("churchId", "=", churchId)
          .where("subscriptionId", "in", subIds).execute();
        await db.deleteFrom("subscriptions").where("churchId", "=", churchId)
          .where("customerId", "in", customerIds).execute();
      }

      await Promise.all([
        db.deleteFrom("gatewayPaymentMethods").where("churchId", "=", churchId)
          .where("customerId", "in", customerIds).execute(),
        db.deleteFrom("eventLogs").where("churchId", "=", churchId)
          .where("customerId", "in", customerIds).execute(),
        db.deleteFrom("customers").where("personId", "=", personId)
          .where("churchId", "=", churchId).execute()
      ]);
    }
  }

  private static async anonymizeAttendance(churchId: string, personId: string) {
    const db = KyselyPool.getDb<AttendanceErasureDb>("attendance");
    // NULL out personId on visits — keeps dates for aggregate stats
    await db.updateTable("visits").set({ personId: null })
      .where("personId", "=", personId).where("churchId", "=", churchId).execute();
  }

  private static async anonymizeMessaging(churchId: string, personId: string) {
    const db = KyselyPool.getDb<MessagingErasureDb>("messaging");
    await Promise.all([
      db.deleteFrom("devices").where("personId", "=", personId).where("churchId", "=", churchId).execute(),
      db.deleteFrom("connections").where("personId", "=", personId).where("churchId", "=", churchId).execute(),
      db.deleteFrom("deliveryLogs").where("personId", "=", personId).where("churchId", "=", churchId).execute(),
      db.deleteFrom("notifications").where("personId", "=", personId).where("churchId", "=", churchId).execute(),
      db.deleteFrom("notificationPreferences").where("personId", "=", personId).where("churchId", "=", churchId).execute(),
      db.deleteFrom("privateMessages").where("churchId", "=", churchId)
        .where((eb) => eb.or([eb("fromPersonId", "=", personId), eb("toPersonId", "=", personId)])).execute(),
      // Anonymize public messages — clear content but keep conversation structure
      db.updateTable("messages").set({ displayName: "Anonymized", content: "" })
        .where("personId", "=", personId).where("churchId", "=", churchId).execute()
    ]);
  }

  private static async anonymizeDoing(churchId: string, personId: string) {
    const db = KyselyPool.getDb<DoingErasureDb>("doing");
    await Promise.all([
      db.deleteFrom("assignments").where("personId", "=", personId).where("churchId", "=", churchId).execute(),
      db.deleteFrom("blockoutDates").where("personId", "=", personId).where("churchId", "=", churchId).execute()
    ]);
  }

  private static async anonymizeContent(churchId: string, personId: string) {
    const db = KyselyPool.getDb<ContentErasureDb>("content");
    // Delete registration members first, then registrations
    const registrations = await db.selectFrom("registrations").select("id")
      .where("personId", "=", personId).where("churchId", "=", churchId).execute();
    const regIds = registrations.map(r => r.id);

    if (regIds.length > 0) {
      await db.deleteFrom("registrationMembers").where("churchId", "=", churchId)
        .where("registrationId", "in", regIds).execute();
      await db.deleteFrom("registrations").where("personId", "=", personId)
        .where("churchId", "=", churchId).execute();
    }

    // Documents on the person's record are about this person only; remove the bytes and the rows.
    const files = await db.selectFrom("files").select(["id", "externalId"])
      .where("churchId", "=", churchId).where("contentType", "=", "person").where("contentId", "=", personId).execute();
    for (const file of files) {
      if (!file.externalId) continue;
      try {
        await FileStorageHelper.remove(file.externalId);
      } catch {
        // Object may already be gone
      }
    }
    await db.deleteFrom("files").where("churchId", "=", churchId).where("contentType", "=", "person").where("contentId", "=", personId).execute();
    await db.deleteFrom("links").where("churchId", "=", churchId).where("category", "=", "personLink").where("linkData", "=", personId).execute();
  }

  private static async deletePhoto(churchId: string, personId: string) {
    const key = "/" + churchId + "/membership/people/" + personId + ".png";
    try {
      await FileStorageHelper.remove(key);
    } catch {
      // Photo may not exist — that's fine
    }
  }

}
