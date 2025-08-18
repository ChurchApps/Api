import { controller, httpGet, requestParam } from "inversify-express-utils";
import { Sermon, StreamingService } from "../models";
import { StreamingConfigHelper, SubDomainHelper } from "../helpers";
import { ContentBaseController } from "./ContentBaseController";
import { Link } from "../models";

@controller("/preview")
export class PreviewController extends ContentBaseController {
  @httpGet("/data/:key")
  public async loadData(@requestParam("key") key: string): Promise<any> {
    try {
      const churchId = await SubDomainHelper.getId(key);
      let tabs: Link[] = null;
      let links: Link[] = null;
      let services: StreamingService[] = null;
      let sermons: Sermon[] = null;

      const promises: Promise<any>[] = [];
      promises.push(this.repositories.link.loadByCategory(churchId, "streamingTab").then((d) => (tabs = d)));
      promises.push(this.repositories.link.loadByCategory(churchId, "streamingLink").then((d) => (links = d)));
      promises.push(this.repositories.streamingService.loadAll(churchId).then((d) => (services = d)));
      promises.push(this.repositories.sermon.loadAll(churchId).then((d) => (sermons = d)));
      await Promise.all(promises);

      const result = StreamingConfigHelper.generateJson(churchId, tabs, links, services, sermons);
      return this.json(result, 200);
    } catch (e) {
      this.logger.error(e);
      return this.internalServerError(e);
    }
  }
}
