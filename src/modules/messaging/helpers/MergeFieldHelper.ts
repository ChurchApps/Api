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
    { key: "{{amount}}", label: "Amount" },
    { key: "{{giftDate}}", label: "Gift Date" },
    { key: "{{fund}}", label: "Fund" },
    { key: "{{receipt}}", label: "Receipt" }
  ];

  // Filled only for workflows started by a donation; blanked otherwise so placeholders never leak.
  private static giftKeys = ["amount", "giftDate", "fund", "receipt"];

  static resolve(template: string, person: MergeFieldPerson, church?: MergeFieldChurch, extras?: Record<string, string>): string {
    let result = template
      .replace(/\{\{firstName\}\}/g, person.firstName || "")
      .replace(/\{\{lastName\}\}/g, person.lastName || "")
      .replace(/\{\{displayName\}\}/g, person.displayName || "")
      .replace(/\{\{email\}\}/g, person.email || "")
      .replace(/\{\{churchName\}\}/g, church?.name || "");
    this.giftKeys.forEach((key) => {
      result = result.split("{{" + key + "}}").join(extras?.[key] ?? "");
    });
    return result;
  }

  static resolveSample(template: string, churchName?: string): string {
    return this.resolve(template, {
      firstName: "John",
      lastName: "Smith",
      displayName: "John Smith",
      email: "john@example.com"
    }, { name: churchName || "Your Church" }, {
      amount: "$50.00",
      giftDate: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      fund: "General Fund",
      receipt: "<table role=\"presentation\" cellspacing=\"8\"><tr><th>Fund</th><th>Amount</th></tr><tr><td>General Fund</td><td>$40.00</td></tr><tr><td>Missions</td><td>$10.00</td></tr><tr><th>Total</th><td>$50.00</td></tr></table>"
    });
  }

}
