import { FileStorageHelper } from "@churchapps/apihelper";
import { getDb as getMembershipDb } from "../db/index.js";
import { getDb as getGivingDb } from "../../giving/db/index.js";
import { getDb as getAttendanceDb } from "../../attendance/db/index.js";
import { getDb as getMessagingDb } from "../../messaging/db/index.js";
import { getDb as getDoingDb } from "../../doing/db/index.js";
import { getDb as getContentDb } from "../../content/db/index.js";
import { Repos } from "../repositories/index.js";

export class GdprErasureHelper {

  /**
   * Anonymizes a person across all modules. Replaces PII with generic values
   * while preserving operational records (donation amounts, attendance dates)
   * for church reporting. Then deletes the user account.
   */
  public static async anonymize(churchId: string, personId: string, userId: string | null, membershipRepos: Repos) {
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
    if (userId) {
      await membershipRepos.user.delete(userId);
      await membershipRepos.userChurch.delete(userId);
      await membershipRepos.roleMember.deleteUser(userId);
    }
  }

  private static async anonymizeMembership(churchId: string, personId: string, repos: Repos) {
    const db = getMembershipDb();

    // Anonymize the person record — clear PII, keep the row
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
      photo: null,
      photoUpdated: null,
      nametagNotes: null,
      donorNumber: null,
      removed: true as any,
      optedOut: true as any
    } as any).where("id", "=", personId).where("churchId", "=", churchId).execute();

    // Remove from groups, visibility prefs, member permissions
    await Promise.all([
      db.deleteFrom("groupMembers").where("personId", "=", personId).where("churchId", "=", churchId).execute(),
      db.deleteFrom("visibilityPreferences").where("personId", "=", personId).where("churchId", "=", churchId).execute(),
      db.deleteFrom("memberPermissions").where("memberId", "=", personId).where("churchId", "=", churchId).execute()
    ]);
  }

  private static async anonymizeGiving(churchId: string, personId: string) {
    const db = getGivingDb();

    // NULL out personId on donations — keeps amounts/dates for financial records
    await db.updateTable("donations").set({ personId: null } as any)
      .where("personId", "=", personId).where("churchId", "=", churchId).execute();

    // Delete customer records (payment gateway tokens)
    const customers = await db.selectFrom("customers").select("id")
      .where("personId", "=", personId).where("churchId", "=", churchId).execute();
    const customerIds = customers.map(c => c.id);

    if (customerIds.length > 0) {
      // Delete subscriptions and their fund allocations
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

      // Delete payment methods and event logs linked to customers
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
    const db = getAttendanceDb();
    // NULL out personId on visits — keeps dates for aggregate stats
    await db.updateTable("visits").set({ personId: null } as any)
      .where("personId", "=", personId).where("churchId", "=", churchId).execute();
  }

  private static async anonymizeMessaging(churchId: string, personId: string) {
    const db = getMessagingDb();
    await Promise.all([
      db.deleteFrom("devices").where("personId", "=", personId).where("churchId", "=", churchId).execute(),
      db.deleteFrom("connections").where("personId", "=", personId).where("churchId", "=", churchId).execute(),
      db.deleteFrom("deliveryLogs").where("personId", "=", personId).where("churchId", "=", churchId).execute(),
      db.deleteFrom("notifications").where("personId", "=", personId).where("churchId", "=", churchId).execute(),
      db.deleteFrom("notificationPreferences").where("personId", "=", personId).where("churchId", "=", churchId).execute(),
      db.deleteFrom("privateMessages").where("churchId", "=", churchId)
        .where((eb) => eb.or([eb("fromPersonId", "=", personId), eb("toPersonId", "=", personId)])).execute(),
      // Anonymize public messages — clear content but keep conversation structure
      db.updateTable("messages").set({ displayName: "Anonymized", content: "" } as any)
        .where("personId", "=", personId).where("churchId", "=", churchId).execute()
    ]);
  }

  private static async anonymizeDoing(churchId: string, personId: string) {
    const db = getDoingDb();
    await Promise.all([
      db.deleteFrom("assignments").where("personId", "=", personId).where("churchId", "=", churchId).execute(),
      db.deleteFrom("blockoutDates").where("personId", "=", personId).where("churchId", "=", churchId).execute()
    ]);
  }

  private static async anonymizeContent(churchId: string, personId: string) {
    const db = getContentDb();
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
