import { DateHelper } from "./DateHelper.js";

export interface MessagingSafetyPerson {
  birthDate?: Date;
  householdRole?: string;
  // Admin-set per-person switch (ChurchAppsSupport#1680). bit(1) columns arrive as 0/1 from the pool.
  disablePrivateMessages?: boolean | number | null;
}

export type MessagingRestriction = "messagingDisabled" | "ageRestricted";

export class MessagingSafetyHelper {
  static readonly DEFAULT_MINIMUM_AGE = 18;

  static parseMinimumAge(setting: string | null): number {
    if (setting === null || setting.trim() === "") return this.DEFAULT_MINIMUM_AGE;
    const n = parseInt(setting, 10);
    return Number.isNaN(n) ? this.DEFAULT_MINIMUM_AGE : Math.max(0, n);
  }

  static isRestricted(person: MessagingSafetyPerson | null, minimumAge: number): boolean {
    return this.restrictionReason(person, minimumAge) !== null;
  }

  // Why a new private conversation with this person is blocked, or null when it is not.
  // The per-person flag wins over the age rule and applies even when the age rule is Off.
  static restrictionReason(person: MessagingSafetyPerson | null, minimumAge: number): MessagingRestriction | null {
    if (!person) return null;
    if (person.disablePrivateMessages) return "messagingDisabled";
    if (minimumAge <= 0) return null;
    if (person.birthDate && DateHelper.isValid(person.birthDate)) return DateHelper.getAge(person.birthDate) < minimumAge ? "ageRestricted" : null;
    return (person.householdRole || "").toLowerCase() === "child" ? "ageRestricted" : null;
  }
}
