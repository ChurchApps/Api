import { ContactInfo } from "./ContactInfo.js";
import { Name } from "./Name.js";
import { FormSubmission } from "../models/FormSubmission.js";

export class Person {
  public id?: string;
  public churchId?: string;
  public name?: Name;
  public contactInfo?: ContactInfo;
  public birthDate?: Date;
  public gender?: string;
  public maritalStatus?: string;
  public anniversary?: Date;
  public membershipStatus?: string;
  public householdId?: string;
  public householdRole?: string;
  public photoUpdated?: Date;
  public photo?: string;
  public importKey?: string;
  public removed?: boolean;
  public conversationId?: string;
  public optedOut?: boolean;
  public nametagNotes?: string;
  public donorNumber?: string;
  public formSubmissions?: FormSubmission[];
  public email?: string;
}
