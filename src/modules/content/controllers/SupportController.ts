import { controller, httpPost } from "inversify-express-utils";
import express from "express";
import { ContentBaseController } from "./ContentBaseController.js";
import { PollyHelper } from "../helpers/PollyHelper.js";

@controller("/content/support")
export class SupportController extends ContentBaseController {
  @httpPost("/createAudio")
  public async post(req: express.Request<{}, {}, { ssml: string }>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      // const ssmlTest = "<speak>This is a test of the SSML to MP3 conversion.</speak>";
      const ssml = req.body.ssml;
      const data = await PollyHelper.SsmlToMp3(ssml);
      return data;
    });
  }
}
