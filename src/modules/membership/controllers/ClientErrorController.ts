import { controller } from "inversify-express-utils";
import { MembershipCrudController } from "./MembershipCrudController";

@controller("/membership/clientErrors")
export class ClientErrorController extends MembershipCrudController {
  protected crudSettings = {
    repoKey: "clientError",
    permissions: { view: null, edit: null },
    routes: ["post"] as const
  };
}
