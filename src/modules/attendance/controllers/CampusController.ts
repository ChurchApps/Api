import { controller } from "inversify-express-utils";
import { AttendanceCrudController } from "./AttendanceCrudController";
import { Permissions } from "../../../shared/helpers";

@controller("/attendance/campuses")
export class CampusController extends AttendanceCrudController {
  protected crudSettings = {
    repoKey: "campus",
    permissions: { view: undefined, edit: Permissions.services.edit },
    routes: ["getById", "getAll", "post", "delete"] as const
  };
}
