import { Church } from "../models";
import NodeGeocoder from "node-geocoder";
import { Repositories } from "../repositories";
import { RepositoryManager } from "../../../shared/infrastructure";

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
      (await RepositoryManager.getRepositories<Repositories>("membership")).church.save(church);
    }
  }
}
