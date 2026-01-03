import { Church } from "../models/index.js";
import NodeGeocoder from "node-geocoder";
import { Repos } from "../repositories/index.js";
import { RepoManager } from "../../../shared/infrastructure/index.js";

export class GeoHelper {
  static async updateChurchAddress(church: Church) {
    const options: NodeGeocoder.Options = { provider: "openstreetmap" };
    const geocoder = NodeGeocoder(options);
    const resp: NodeGeocoder.Entry[] = await geocoder.geocode(church.address1 + " " + church.address2 + " " + church.city + ", " + church.state + " " + church.zip + " " + church.country);
    if (resp.length > 0) {
      const r = resp[0];
      if (r.streetNumber) {
        church.address1 = (r.streetNumber + " " + r.streetName).trim();
        church.city = r.city;
        church.state = r.state || r.district;
        church.country = r.country;
        church.zip = r.zipcode;
      }
      church.latitude = r.latitude;
      church.longitude = r.longitude;
      (await RepoManager.getRepos<Repos>("membership")).church.save(church);
    }
  }
}
