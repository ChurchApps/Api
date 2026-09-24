import { Environment } from "./index.js";

const segmentByApp: Record<string, number> = {
  B1Admin: 1,
  B1: 1,
  "Lessons.church": 2,
  WorshipCommons: 54
};

// Apps whose USER signups (including users joining an existing church) should
// reach Mautic. Deliberately excludes B1/B1Admin: their user base includes
// congregation members of other churches, who never opted into our marketing.
// Only leader/volunteer-facing apps belong here.
const userSegmentByApp: Record<string, number> = { WorshipCommons: 54 };

export class MauticHelper {
  private static authHeader = () => "Basic " + Buffer.from(`${Environment.mauticUser}:${Environment.mauticPassword}`).toString("base64");

  private static request = async (method: string, path: string, body?: any, attempt = 1): Promise<any> => {
    let res;
    try {
      res = await fetch(`${Environment.mauticUrl}${path}`, {
        method,
        headers: { Authorization: MauticHelper.authHeader(), "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined
      });
    } catch (err) {
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
        return MauticHelper.request(method, path, body, attempt + 1);
      }
      throw err;
    }

    if ((res.status >= 500 || res.status === 429) && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
      return MauticHelper.request(method, path, body, attempt + 1);
    }
    if (!res.ok) throw new Error(`Mautic ${path} failed: ${res.status} ${await res.text()}`);
    return res.json();
  };

  private static post = (path: string, body?: any) => MauticHelper.request("POST", path, body);
  private static patch = (path: string, body?: any) => MauticHelper.request("PATCH", path, body);
  private static get = (path: string) => MauticHelper.request("GET", path);

  static register = async (
    churchId: string,
    companyName: string,
    firstName: string,
    lastName: string,
    address: string,
    city: string,
    state: string,
    zip: string,
    country: string,
    email: string,
    initialApp: string
  ) => {
    if (!Environment.mauticUrl || !Environment.mauticUser || !Environment.mauticPassword) return;

    const companyPayload = {
      companyname: companyName,
      companyaddress1: address,
      companycity: city,
      companystate: state,
      companyzipcode: zip,
      companycountry: country,
      companydescription: initialApp,
      companychurchid: churchId
    };

    const contactPayload = {
      firstname: firstName,
      lastname: lastName,
      email,
      address1: address,
      city,
      state,
      zipcode: zip,
      country
    };

    try {
      const [companyResp, contactResp] = await Promise.all([
        MauticHelper.post("/api/companies/new", companyPayload),
        MauticHelper.post("/api/contacts/new", contactPayload)
      ]);

      const companyId = companyResp?.company?.id;
      const contactId = contactResp?.contact?.id;

      if (companyId && contactId) {
        await MauticHelper.post(`/api/companies/${companyId}/contact/${contactId}/add`);
      }

      const segmentId = segmentByApp[initialApp];
      if (segmentId && contactId) {
        await MauticHelper.post(`/api/segments/${segmentId}/contact/${contactId}/add`);
      }
    } catch (err) {
      // The caller swallows this with .catch(() => {}); log it so failed syncs are
      // visible in CloudWatch instead of silently producing orphaned Mautic records.
      console.error(`MauticHelper.register failed for church ${churchId}`, err);
      throw err;
    }
  };

  /** Creates a contact (if truly absent) and applies a tag. Returns silently on any failure. */
  static createAndTag = async (email: string, firstName: string | undefined, lastName: string | undefined, tag: string) => {
    if (!Environment.mauticUrl || !Environment.mauticUser || !Environment.mauticPassword) return;
    try {
      const data = await MauticHelper.get(`/api/contacts?search=${encodeURIComponent(email)}&limit=1`);
      const existing = Object.values(data.contacts || {}) as any[];
      if (existing.length) {
        await MauticHelper.patch(`/api/contacts/${existing[0].id}/edit`, { tags: [tag] });
        return;
      }
      await MauticHelper.post("/api/contacts/new", { email, firstname: firstName, lastname: lastName, tags: [tag] });
    } catch (err) {
      console.error("MauticHelper.createAndTag failed", err);
    }
  };

  // Finds a contact by email and patches the supplied field aliases onto it.
  static updateContact = async (email: string, fields: Record<string, any>) => {
    if (!Environment.mauticUrl || !Environment.mauticUser || !Environment.mauticPassword) return;
    const data = await MauticHelper.get(`/api/contacts?search=${encodeURIComponent(email)}&limit=1`);
    const contacts = Object.values(data.contacts || {}) as any[];
    if (!contacts.length) return;
    await MauticHelper.patch(`/api/contacts/${contacts[0].id}/edit`, fields);
  };

  // Upserts a contact for a USER signup (new account, possibly joining an
  // existing church) for apps in userSegmentByApp. Unlike register(), this
  // fires even when no new church is created. Links the contact to the
  // existing Mautic company via companychurchid when churchId is provided.
  static registerUser = async (email: string, firstName: string, lastName: string, appName: string, churchId?: string) => {
    if (!Environment.mauticUrl || !Environment.mauticUser || !Environment.mauticPassword) return;
    const segmentId = userSegmentByApp[appName];
    if (!segmentId) return;
    try {
      const data = await MauticHelper.get(`/api/contacts?search=${encodeURIComponent(email)}&limit=1`);
      const contacts = Object.values(data.contacts || {}) as any[];
      let contactId = contacts.length ? contacts[0].id : null;
      if (!contactId) {
        const created = await MauticHelper.post("/api/contacts/new", { firstname: firstName, lastname: lastName, email });
        contactId = created?.contact?.id;
      }
      if (!contactId) return;
      await MauticHelper.patch(`/api/contacts/${contactId}/edit`, { tags: [`App: ${appName}`] });
      await MauticHelper.post(`/api/segments/${segmentId}/contact/${contactId}/add`);
      if (churchId) {
        const companies = await MauticHelper.get(`/api/companies?search=${encodeURIComponent("companychurchid:" + churchId)}&limit=1`);
        const list = Object.values(companies.companies || {}) as any[];
        if (list.length) await MauticHelper.post(`/api/companies/${list[0].id}/contact/${contactId}/add`);
      }
    } catch (err) {
      console.error(`MauticHelper.registerUser failed for ${appName}`, err);
    }
  };

  // Records a login: bumps b1_login_count and sets b1_last_login on the contact.
  // When appName is a leader-facing app (userSegmentByApp), also tags the
  // contact with the app and adds it to the app's segment — so an existing
  // ChurchApps contact who starts using a new app becomes visible for it.
  static trackLogin = async (email: string, appName?: string) => {
    if (!Environment.mauticUrl || !Environment.mauticUser || !Environment.mauticPassword) return;
    const data = await MauticHelper.get(`/api/contacts?search=${encodeURIComponent(email)}&limit=1`);
    let contacts = Object.values(data.contacts || {}) as any[];
    if (!contacts.length) {
      // No marketing contact yet (e.g. the user predates the Mautic bridge).
      // For leader-facing apps, create one now so the app connection isn't lost.
      if (!appName || !userSegmentByApp[appName]) return;
      const created = await MauticHelper.post("/api/contacts/new", { email });
      if (!created?.contact?.id) return;
      contacts = [created.contact];
    }
    const contact = contacts[0];
    const currentCount = parseInt(contact.fields?.all?.b1_login_count || "0", 10) || 0;
    const fields: Record<string, any> = {
      b1_last_login: new Date().toISOString(),
      b1_login_count: currentCount + 1
    };
    const appSegment = appName ? userSegmentByApp[appName] : undefined;
    if (appSegment) fields.tags = [`App: ${appName}`];
    await MauticHelper.patch(`/api/contacts/${contact.id}/edit`, fields);
    if (appSegment) await MauticHelper.post(`/api/segments/${appSegment}/contact/${contact.id}/add`);
  };
}
