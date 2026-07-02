import type { Repos } from "../repositories/index.js";
import type { Answer, Household, Person, Question } from "../models/index.js";

export interface FormContact {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
}

export class ConversationalFormHelper {
  static extractContact(questions: Question[], answers: Answer[]): FormContact {
    const contact: FormContact = {};
    const valueFor = (q: Question) => (answers || []).find((a) => a.questionId === q.id)?.value?.trim();
    (questions || []).forEach((q) => {
      const v = valueFor(q);
      if (!v) return;
      const title = (q.title || "").toLowerCase().trim();
      const ft = q.fieldType;
      if (!contact.email && (ft === "Email" || title.includes("email"))) contact.email = v;
      else if (!contact.phone && (ft === "Phone Number" || title.includes("phone") || title.includes("mobile") || title.includes("cell"))) contact.phone = v;
      else if (!contact.firstName && title.includes("first name")) contact.firstName = v;
      else if (!contact.lastName && title.includes("last name")) contact.lastName = v;
      else if (!contact.firstName && !contact.lastName && (title === "name" || title.includes("full name") || title.includes("your name"))) {
        const parts = v.split(/\s+/);
        contact.firstName = parts.shift();
        contact.lastName = parts.join(" ") || undefined;
      }
    });
    return contact;
  }

  static applyTokens(template: string, tokens: { firstName?: string; churchName?: string }): string {
    if (!template) return template;
    return template.replace(/\{firstName\}/g, tokens.firstName || "").replace(/\{churchName\}/g, tokens.churchName || "");
  }

  static async findOrCreatePerson(repos: Repos, churchId: string, contact: FormContact): Promise<Person | null> {
    if (!contact?.email) return null;
    const email = contact.email.trim();

    const matches = ((await repos.person.searchEmail(churchId, email)) as any[]) || [];
    const existing = matches.find((p) => (p.email || "").toLowerCase() === email.toLowerCase());
    if (existing) return repos.person.convertToModel(churchId, existing);

    const household: Household = { churchId, name: contact.lastName || contact.firstName || email };
    await repos.household.save(household);

    let person: Person = {
      churchId,
      householdId: household.id,
      householdRole: "Head",
      name: { first: contact.firstName, last: contact.lastName },
      membershipStatus: "Guest",
      contactInfo: { email }
    };
    if (contact.phone) person.contactInfo.mobilePhone = contact.phone;
    person = await repos.person.save(person);
    return repos.person.convertToModel(churchId, await repos.person.load(person.churchId, person.id));
  }
}
