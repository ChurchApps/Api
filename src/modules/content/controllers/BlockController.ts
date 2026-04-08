import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { ContentBaseController } from "./ContentBaseController.js";
import { Block, Element, Section } from "../models/index.js";
import { Permissions } from "../helpers/index.js";
import { TreeHelper } from "../helpers/TreeHelper.js";
import { ArrayHelper } from "@churchapps/apihelper";

@controller("/content/blocks")
export class BlockController extends ContentBaseController {

  @httpGet("/:churchId/tree/:id")
  public async getTree(@requestParam("churchId") churchId: string, @requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const block: Block = await this.repos.block.load(churchId, id);
      let result: Block = {};
      if (block?.id !== undefined) {
        const sections: Section[] =
          block.blockType === "elementBlock" ? [{ id: "", background: "#FFFFFF", textColor: "dark", blockId: block.id }] : await this.repos.section.loadForBlock(churchId, block.id);
        const allElements: Element[] = await this.repos.element.loadForBlock(churchId, block.id);
        TreeHelper.populateAnswers(allElements);
        TreeHelper.populateAnswers(sections);
        result = block;
        result.sections = TreeHelper.buildTree(sections, allElements);
      }
      return result;
    });
  }

  @httpGet("/blockType/:blockType")
  public async loadByType(@requestParam("blockType") blockType: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.block.loadByBlockType(au.churchId, blockType);
    });
  }

  @httpGet("/public/footer/:churchId")
  public async loadFooter(@requestParam("churchId") churchId: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const footerBlocks = await this.repos.block.loadByBlockType(churchId, "footerBlock");
      const result: Section[] = [];
      if (footerBlocks.length > 0) {
        const blockIds: string[] = ArrayHelper.getIds(footerBlocks, "id");
        const allBlockSections = await this.repos.section.loadForBlocks(churchId, blockIds);
        const allBlockElements = await this.repos.element.loadForBlocks(churchId, blockIds);
        TreeHelper.populateAnswers(allBlockElements);
        TreeHelper.populateAnswers(allBlockSections);

        const footerBlockSections = ArrayHelper.getAll(allBlockSections, "blockId", footerBlocks[0].id);
        footerBlockSections.forEach((s) => {
          s.zone = "siteFooter";
          const blockElements = ArrayHelper.getAll(allBlockElements, "blockId", footerBlocks[0].id);
          const tree = TreeHelper.buildTree([s], blockElements);
          result.push(...tree);
        });
      }
      return result;
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repos.block.load(au.churchId, id);
      return this.repos.block.convertToModel(au.churchId, data);
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repos.block.loadAll(au.churchId);
      return this.repos.block.convertAllToModel(au.churchId, data);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Block[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      const promises: Promise<Block>[] = [];
      req.body.forEach((item) => { (item as any).churchId = au.churchId; promises.push(this.repos.block.save(item)); });
      const result = await Promise.all(promises);
      return this.repos.block.convertAllToModel(au.churchId, result);
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      await this.repos.block.delete(au.churchId, id);
      return {};
    });
  }
}
