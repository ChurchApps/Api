import { DEFAULT_GUEST_FIELDS, GuestRegistrationHelper } from "../GuestRegistrationHelper.js";

// ChurchAppsSupport#1448: the QR sign-up asks phone for everyone and a household role for each later person.
describe("GuestRegistrationHelper household role and phone", () => {
  const body = {
    members: [
      { firstName: "Pat", lastName: "Visitor", phone: "555-0100", householdRole: "Spouse" },
      { firstName: "Lee", lastName: "Visitor", phone: "555-0101", householdRole: "Spouse" },
      { firstName: "Sam", lastName: "Visitor", householdRole: "Boss" }
    ]
  };

  it("asks the household role by default", () => {
    expect(DEFAULT_GUEST_FIELDS.householdRole).toBe("optional");
    expect(GuestRegistrationHelper.parseModes(JSON.stringify({ householdRole: "off" })).householdRole).toBe("off");
  });

  it("keeps a phone for every person and a known role for everyone after the first", () => {
    const { error, registration } = GuestRegistrationHelper.sanitize(body, { ...DEFAULT_GUEST_FIELDS });
    expect(error).toBeUndefined();
    expect(registration.members[0]).toEqual({ firstName: "Pat", lastName: "Visitor", phone: "555-0100" });
    expect(registration.members[1]).toEqual({ firstName: "Lee", lastName: "Visitor", phone: "555-0101", householdRole: "Spouse" });
    expect(registration.members[2]).toEqual({ firstName: "Sam", lastName: "Visitor" });
  });

  it("drops the role when the church turned it off", () => {
    const { registration } = GuestRegistrationHelper.sanitize(body, { ...DEFAULT_GUEST_FIELDS, householdRole: "off" });
    expect(registration.members[1].householdRole).toBeUndefined();
  });

  it("requires a role for later people when the church made it required", () => {
    const { error } = GuestRegistrationHelper.sanitize({ members: [body.members[0], { firstName: "Max", lastName: "Visitor" }] }, { ...DEFAULT_GUEST_FIELDS, householdRole: "required" });
    expect(error).toBe("householdRole is required for each member after the first");
  });
});
