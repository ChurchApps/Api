export interface MergeFieldPerson {
  firstName?: string;
  lastName?: string;
  displayName?: string;
  email?: string;
}

export interface MergeFieldChurch {
  name?: string;
}

export interface MergeFieldDef {
  key: string;
  label: string;
}

export class MergeFieldHelper {

  static availableFields: MergeFieldDef[] = [
    { key: "{{firstName}}", label: "First Name" },
    { key: "{{lastName}}", label: "Last Name" },
    { key: "{{displayName}}", label: "Display Name" },
    { key: "{{email}}", label: "Email" },
    { key: "{{churchName}}", label: "Church Name" },
  ];

  static resolve(template: string, person: MergeFieldPerson, church?: MergeFieldChurch): string {
    return template
      .replace(/\{\{firstName\}\}/g, person.firstName || "")
      .replace(/\{\{lastName\}\}/g, person.lastName || "")
      .replace(/\{\{displayName\}\}/g, person.displayName || "")
      .replace(/\{\{email\}\}/g, person.email || "")
      .replace(/\{\{churchName\}\}/g, church?.name || "");
  }

  static resolveSample(template: string, churchName?: string): string {
    return this.resolve(template, {
      firstName: "John",
      lastName: "Smith",
      displayName: "John Smith",
      email: "john@example.com"
    }, { name: churchName || "Your Church" });
  }

}
