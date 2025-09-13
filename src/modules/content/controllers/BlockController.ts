import { controller, httpGet, requestParam } from "inversify-express-utils";
import express from "express";
import { ContentCrudController } from "./ContentCrudController";
import { Block, Element, Section } from "../models";
import { Permissions } from "../helpers";
import { TreeHelper } from "../helpers/TreeHelper";
import { ArrayHelper } from "@churchapps/apihelper";

@controller("/content/blocks")
export class BlockController extends ContentCrudController {
  protected crudSettings = {
    repoKey: "block",
    permissions: { view: null, edit: Permissions.content.edit },
    routes: ["getById", "getAll", "post", "delete"] as const
  };
  @httpGet("/:churchId/tree/:id")
  public async getTree(@requestParam("churchId") churchId: string, @requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const block: Block = await this.repositories.block.load(churchId, id);
      let result: Block = {};
      if (block?.id !== undefined) {
        const sections: Section[] =
          block.blockType === "elementBlock" ? [{ id: "", background: "#FFFFFF", textColor: "dark", blockId: block.id }] : await this.repositories.section.loadForBlock(churchId, block.id);
        const allElements: Element[] = await this.repositories.element.loadForBlock(churchId, block.id);
        /*
        const allElements: Element[] = (block.blockType === "elements")
        ? await this.repositories.element.loadByBlockId(churchId, block.id)
        : await this.repositories.element.loadForBlock(churchId, block.id);*/
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
      return await this.repositories.block.loadByBlockType(au.churchId, blockType);
    });
  }

  @httpGet("/public/footer/:churchId")
  public async loadFooter(@requestParam("churchId") churchId: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const footerBlocks = await this.repositories.block.loadByBlockType(churchId, "footerBlock");
      const result: Section[] = [];
      if (footerBlocks.length > 0) {
        const blockIds: string[] = ArrayHelper.getIds(footerBlocks, "id");
        const allBlockSections = await this.repositories.section.loadForBlocks(churchId, blockIds);
        const allBlockElements = await this.repositories.element.loadForBlocks(churchId, blockIds);
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
}
