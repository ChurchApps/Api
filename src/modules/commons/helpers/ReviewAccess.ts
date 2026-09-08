import { Permissions } from "../../../shared/helpers/index.js";

// The one place that decides who may review packages (approve, request changes, listen).
// ponytail: server admin only today; the music-editor branch widens this to COMMONS_MUSIC_EDITORS here.
export const canReview = (au: { id?: string; checkAccess: (permission: any) => boolean }): boolean =>
  !!au?.id && au.checkAccess(Permissions.server.admin);
