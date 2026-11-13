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

// ChurchAppsSupport#1554: every household member can give an email, and the church can turn on a photo.
describe("GuestRegistrationHelper email and photo for each member", () => {
  const png = "data:image/png;base64,iVBORw0KGgo=";
  const body = {
    members: [
      { firstName: "Pat", lastName: "Visitor", email: "pat@example.com", photo: png },
      { firstName: "Lee", lastName: "Visitor", email: "lee@example.com", photo: png }
    ]
  };

  it("leaves the photo off until the church turns it on", () => {
    expect(DEFAULT_GUEST_FIELDS.photo).toBe("off");
    expect(GuestRegistrationHelper.parseModes(JSON.stringify({ photo: "optional" })).photo).toBe("optional");
    const { registration } = GuestRegistrationHelper.sanitize(body, { ...DEFAULT_GUEST_FIELDS });
    expect(registration.members.map((m) => m.photo)).toEqual([undefined, undefined]);
  });

  it("keeps an email for every member, not just the first", () => {
    const { registration } = GuestRegistrationHelper.sanitize(body, { ...DEFAULT_GUEST_FIELDS });
    expect(registration.members.map((m) => m.email)).toEqual(["pat@example.com", "lee@example.com"]);
  });

  it("keeps a PNG photo for every member when the church turned it on", () => {
    const { error, registration } = GuestRegistrationHelper.sanitize(body, { ...DEFAULT_GUEST_FIELDS, photo: "optional" });
    expect(error).toBeUndefined();
    expect(registration.members.map((m) => m.photo)).toEqual([png, png]);
  });

  it("rejects a photo that is not a PNG or is over 5 MB", () => {
    const modes = { ...DEFAULT_GUEST_FIELDS, photo: "optional" as const };
    expect(GuestRegistrationHelper.sanitize({ members: [{ firstName: "Pat", lastName: "Visitor", photo: "data:text/html;base64,PHNjcmlwdD4=" }] }, modes).error).toBe("photo is not valid");
    const huge = "data:image/png;base64," + "A".repeat(8 * 1024 * 1024);
    expect(GuestRegistrationHelper.sanitize({ members: [{ firstName: "Pat", lastName: "Visitor", photo: huge }] }, modes).error).toBe("photo is not valid");
  });

  it("requires a photo of the first person when the church made it required", () => {
    const { error } = GuestRegistrationHelper.sanitize({ members: [{ firstName: "Pat", lastName: "Visitor" }] }, { ...DEFAULT_GUEST_FIELDS, photo: "required" });
    expect(error).toBe("photo is required");
  });
});
