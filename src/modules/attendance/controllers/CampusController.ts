import { controller } from "inversify-express-utils";
import { AttendanceCrudController } from "./AttendanceCrudController.js";
import { Permissions } from "../../../shared/helpers/index.js";

@controller("/attendance/campuses")
export class CampusController extends AttendanceCrudController {
  protected crudSettings = {
    repoKey: "campus",
    permissions: { view: undefined, edit: Permissions.services.edit },
    routes: ["getById", "getAll", "post", "delete"] as const
  };
}
