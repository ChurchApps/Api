import { MergeFieldHelper } from "../MergeFieldHelper.js";

describe("MergeFieldHelper gift fields", () => {
  const person = { firstName: "Donald", lastName: "Clark", displayName: "Donald Clark", email: "donald@example.com" };

  it("lists Amount, Gift Date, Fund and Receipt after the person fields", () => {
    const keys = MergeFieldHelper.availableFields.map((f) => f.key);
    expect(keys).toEqual([
      "{{firstName}}", "{{lastName}}", "{{displayName}}", "{{email}}", "{{churchName}}", "{{amount}}", "{{giftDate}}", "{{fund}}", "{{receipt}}"
    ]);
  });

  it("fills the gift fields from extras", () => {
    const extras = { amount: "$50.00", giftDate: "Nov 8, 2026", fund: "General Fund", receipt: "<table>r</table>" };
    const result = MergeFieldHelper.resolve("Thanks {{firstName}} for {{amount}} to {{fund}} on {{giftDate}}. {{receipt}}", person, { name: "Grace" }, extras);
    expect(result).toBe("Thanks Donald for $50.00 to General Fund on Nov 8, 2026. <table>r</table>");
  });

  it("blanks the gift fields when there is no gift", () => {
    const result = MergeFieldHelper.resolve("Hi {{firstName}} {{amount}}|{{giftDate}}|{{fund}}|{{receipt}} from {{churchName}}", person, { name: "Grace" });
    expect(result).toBe("Hi Donald ||| from Grace");
  });

  it("fills sample gift values in the preview", () => {
    const result = MergeFieldHelper.resolveSample("{{amount}} {{fund}}");
    expect(result).toBe("$50.00 General Fund");
  });
});
