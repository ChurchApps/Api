import { controller } from "inversify-express-utils";
import { MembershipCrudController } from "./MembershipCrudController.js";
import { Permissions } from "../helpers/index.js";

@controller("/membership/households")
export class HouseholdController extends MembershipCrudController {
  protected crudSettings = {
    repoKey: "household",
    permissions: { view: null, edit: Permissions.people.edit },
    routes: ["getById", "getAll", "post", "delete"] as const
  };
}
