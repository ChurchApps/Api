import { Environment } from "./index.js";

const segmentByApp: Record<string, number> = {
  B1Admin: 1,
  B1: 1,
  "Lessons.church": 2
};

export class MauticHelper {
  private static authHeader = () => "Basic " + Buffer.from(`${Environment.mauticUser}:${Environment.mauticPassword}`).toString("base64");

  private static post = async (path: string, body?: any, attempt = 1): Promise<any> => {
    let res;
    try {
      res = await fetch(`${Environment.mauticUrl}${path}`, {
        method: "POST",
        headers: { Authorization: MauticHelper.authHeader(), "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined
      });
    } catch (err) {
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
        return MauticHelper.post(path, body, attempt + 1);
      }
      throw err;
    }
    
    if ((res.status >= 500 || res.status === 429) && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
      return MauticHelper.post(path, body, attempt + 1);
    }
    if (!res.ok) throw new Error(`Mautic ${path} failed: ${res.status} ${await res.text()}`);
    return res.json();
  };

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
}
