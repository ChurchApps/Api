import { GRADES } from "./GradeMapping.js";
import { PhotoDataUrl } from "../../../shared/helpers/PhotoDataUrl.js";

export type GuestFieldMode = "off" | "optional" | "required";
export const GUEST_FIELD_KEYS = [
  "title", "email", "phone", "householdRole", "address", "birthDate", "gender", "maritalStatus", "grade", "comments", "photo"
] as const;
export type GuestFieldKey = (typeof GUEST_FIELD_KEYS)[number];
export type GuestFieldModes = Record<GuestFieldKey, GuestFieldMode>;

export const DEFAULT_GUEST_FIELDS: GuestFieldModes = { title: "off", email: "optional", phone: "optional", householdRole: "optional", address: "off", birthDate: "off", gender: "off", maritalStatus: "off", grade: "off", comments: "off", photo: "off" };
export const GUEST_GENDERS = ["Unspecified", "Male", "Female"];
// The first person heads a new household, so the role is asked of everyone after them.
export const GUEST_HOUSEHOLD_ROLES = ["Spouse", "Child", "Other"];
export const GUEST_MARITAL_STATUSES = ["Unknown", "Single", "Married", "Divorced", "Widowed"];

export interface GuestMember { title?: string; firstName: string; lastName: string; email?: string; phone?: string; householdRole?: string; birthDate?: string; gender?: string; grade?: string; photo?: string }
export interface GuestAddress { address1?: string; address2?: string; city?: string; state?: string; zip?: string }
export interface GuestRegistration { members: GuestMember[]; address?: GuestAddress; maritalStatus?: string; comments?: string }

const MODES: GuestFieldMode[] = ["off", "optional", "required"];

// Caps follow the people table column sizes.
const clean = (value: unknown, max: number): string => (typeof value === "string" ? value.trim().slice(0, max) : "");

export class GuestRegistrationHelper {
  // guestRegistrationFields is a public JSON setting; anything missing or malformed falls back to the default.
  static parseModes(raw: string | undefined | null): GuestFieldModes {
    const result: GuestFieldModes = { ...DEFAULT_GUEST_FIELDS };
    if (!raw) return result;
    let parsed: any = null;
    try { parsed = JSON.parse(raw); } catch { return result; }
    if (!parsed || typeof parsed !== "object") return result;
    GUEST_FIELD_KEYS.forEach((k) => { if (MODES.includes(parsed[k])) result[k] = parsed[k]; });
    return result;
  }

  static isValidBirthDate(value: string): boolean {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return false;
    const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return false;
    const now = new Date();
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const oldest = Date.UTC(now.getUTCFullYear() - 120, now.getUTCMonth(), now.getUTCDate());
    return date.getTime() <= today && date.getTime() >= oldest;
  }

  // Keeps only the fields the church included, and rejects missing required or unknown values.
  static sanitize(body: any, modes: GuestFieldModes): { error?: string; registration?: GuestRegistration } {
    const rawMembers: any[] = body?.members;
    const on = (k: GuestFieldKey) => modes[k] !== "off";
    const required = (k: GuestFieldKey) => modes[k] === "required";

    const members: GuestMember[] = [];
    for (let i = 0; i < rawMembers.length; i++) {
      const m = rawMembers[i] || {};
      const member: GuestMember = { firstName: clean(m.firstName, 50), lastName: clean(m.lastName, 50) };
      if (!member.firstName || !member.lastName) return { error: "firstName and lastName are required for each member" };
      // Stored as the person's name prefix, which staff edit as "Title".
      if (on("title")) {
        const title = clean(m.title, 10);
        if (title) member.title = title;
        else if (required("title")) return { error: "title is required for each member" };
      }
      const phone = clean(m.phone, 21);
      if (on("phone") && phone) member.phone = phone;
      else if (i === 0 && required("phone")) return { error: "phone is required" };
      // Everyone can give an email; only the first person is ever required to.
      const email = clean(m.email, 100);
      if (on("email") && email) member.email = email;
      else if (i === 0 && required("email")) return { error: "email is required" };
      if (i > 0 && on("householdRole")) {
        // An unknown role is dropped, so the person is filed as Other as before.
        const role = clean(m.householdRole, 10);
        if (GUEST_HOUSEHOLD_ROLES.includes(role)) member.householdRole = role;
        else if (required("householdRole")) return { error: "householdRole is required for each member after the first" };
      }
      if (on("birthDate")) {
        const birthDate = clean(m.birthDate, 10);
        if (birthDate) {
          if (!this.isValidBirthDate(birthDate)) return { error: "birthDate is not valid" };
          member.birthDate = birthDate;
        } else if (required("birthDate")) return { error: "birthDate is required for each member" };
      }
      if (on("gender")) {
        const gender = clean(m.gender, 11);
        if (gender) {
          if (!GUEST_GENDERS.includes(gender)) return { error: "gender is not valid" };
          member.gender = gender;
        } else if (required("gender")) return { error: "gender is required for each member" };
      }
      if (on("grade")) {
        const grade = clean(m.grade, 10);
        if (grade) {
          if (!GRADES.includes(grade)) return { error: "grade is not valid" };
          member.grade = grade;
        } else if (required("grade")) return { error: "grade is required for each member" };
      }
      // A PNG data URL, cropped in the browser; stored as the new person's profile photo.
      if (on("photo")) {
        if (m.photo) {
          if (!PhotoDataUrl.isAcceptable(m.photo, true)) return { error: "photo is not valid" };
          member.photo = m.photo;
        } else if (i === 0 && required("photo")) return { error: "photo is required" };
      }
      members.push(member);
    }

    const registration: GuestRegistration = { members };
    if (on("address")) {
      const a = body?.address || {};
      const address: GuestAddress = { address1: clean(a.address1, 50), address2: clean(a.address2, 50), city: clean(a.city, 30), state: clean(a.state, 10), zip: clean(a.zip, 10) };
      if (required("address") && (!address.address1 || !address.city || !address.state || !address.zip)) return { error: "address is required" };
      Object.keys(address).forEach((k) => { if (!address[k as keyof GuestAddress]) delete address[k as keyof GuestAddress]; });
      if (Object.keys(address).length > 0) registration.address = address;
    }
    if (on("maritalStatus")) {
      const maritalStatus = clean(body?.maritalStatus, 10);
      if (maritalStatus) {
        if (!GUEST_MARITAL_STATUSES.includes(maritalStatus)) return { error: "maritalStatus is not valid" };
        registration.maritalStatus = maritalStatus;
      } else if (required("maritalStatus")) return { error: "maritalStatus is required" };
    }
    if (on("comments")) {
      const comments = clean(body?.comments, 1000);
      if (comments) registration.comments = comments;
      else if (required("comments")) return { error: "comments is required" };
    }
    return { registration };
  }
}
