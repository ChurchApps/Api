import { DateHelper } from "./DateHelper.js";

export interface MessagingSafetyPerson {
  birthDate?: Date;
  householdRole?: string;
}

export class MessagingSafetyHelper {
  static readonly DEFAULT_MINIMUM_AGE = 18;

  static parseMinimumAge(setting: string | null): number {
    if (setting === null || setting.trim() === "") return this.DEFAULT_MINIMUM_AGE;
    const n = parseInt(setting, 10);
    return Number.isNaN(n) ? this.DEFAULT_MINIMUM_AGE : Math.max(0, n);
  }

  static isRestricted(person: MessagingSafetyPerson | null, minimumAge: number): boolean {
    if (minimumAge <= 0 || !person) return false;
    if (person.birthDate && DateHelper.isValid(person.birthDate)) return DateHelper.getAge(person.birthDate) < minimumAge;
    return (person.householdRole || "").toLowerCase() === "child";
  }
}
