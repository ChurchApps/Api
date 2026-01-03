import { controller, httpGet, requestParam } from "inversify-express-utils";
import { Sermon, StreamingService } from "../models/index.js";
import { StreamingConfigHelper, SubDomainHelper } from "../helpers/index.js";
import { ContentBaseController } from "./ContentBaseController.js";
import { Link } from "../models/index.js";

@controller("/content/preview")
export class PreviewController extends ContentBaseController {
  @httpGet("/data/:key")
  public async loadData(@requestParam("key") key: string, req: any, res: any): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const churchId = await SubDomainHelper.getId(key);
      let tabs: Link[] = null;
      let links: Link[] = null;
      let services: StreamingService[] = null;
      let sermons: Sermon[] = null;

      const promises: Promise<any>[] = [];
      promises.push(this.repos.link.loadByCategory(churchId, "streamingTab").then((d) => (tabs = d)));
      promises.push(this.repos.link.loadByCategory(churchId, "streamingLink").then((d) => (links = d)));
      promises.push(this.repos.streamingService.loadAll(churchId).then((d) => (services = d)));
      promises.push(this.repos.sermon.loadAll(churchId).then((d) => (sermons = d)));
      await Promise.all(promises);

      const result = StreamingConfigHelper.generateJson(churchId, tabs, links, services, sermons);
      return result;
    });
  }
}
