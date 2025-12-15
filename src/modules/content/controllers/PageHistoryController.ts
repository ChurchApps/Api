import { controller, httpPost, httpGet, requestParam } from "inversify-express-utils";
import express from "express";
import { ContentBaseController } from "./ContentBaseController";
import { PageHistory, Section, Element } from "../models";
import { Permissions } from "../helpers";
import { UniqueIdHelper } from "@churchapps/apihelper";

@controller("/content/pageHistory")
export class PageHistoryController extends ContentBaseController {

  @httpGet("/page/:pageId")
  public async getForPage(@requestParam("pageId") pageId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      return await this.repos.pageHistory.loadForPage(au.churchId, pageId);
    });
  }

  @httpGet("/block/:blockId")
  public async getForBlock(@requestParam("blockId") blockId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      return await this.repos.pageHistory.loadForBlock(au.churchId, blockId);
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      return await this.repos.pageHistory.load(au.churchId, id);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, PageHistory>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);

      const history = req.body;
      history.churchId = au.churchId;
      history.userId = au.id;
      history.createdDate = new Date();

      const result = await this.repos.pageHistory.save(history);

      // Occasionally clean up old history entries (keep last 30 days)
      // Only run cleanup ~5% of the time to reduce database load
      if (history.pageId && Math.random() < 0.05) {
        await this.repos.pageHistory.deleteOldHistory(au.churchId, history.pageId, 30);
      }

      return result;
    });
  }

  @httpPost("/restore/:id")
  public async restore(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);

      const history = await this.repos.pageHistory.load(au.churchId, id);
      if (!history) return this.json({ error: "History not found" }, 404);

      const snapshot = JSON.parse(history.snapshotJSON);

      // Delete existing sections and elements, then restore from snapshot
      await this.deleteAndRestoreContent(au.churchId, history.pageId, history.blockId, snapshot);

      return { success: true, snapshot };
    });
  }

  @httpPost("/restoreSnapshot")
  public async restoreSnapshot(req: express.Request<{}, {}, { pageId?: string; blockId?: string; snapshot: any }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);

      const { pageId, blockId, snapshot } = req.body;
      if (!snapshot || !snapshot.sections) return this.json({ error: "Invalid snapshot" }, 400);

      // Delete existing sections and elements, then restore from snapshot
      await this.deleteAndRestoreContent(au.churchId, pageId, blockId, snapshot);

      return { success: true };
    });
  }

  private async deleteAndRestoreContent(churchId: string, pageId: string, blockId: string, snapshot: any) {
    // Delete existing sections and elements for this page/block
    let existingSections: Section[] = [];
    if (pageId) {
      existingSections = await this.repos.section.loadForPage(churchId, pageId);
    } else if (blockId) {
      existingSections = await this.repos.section.loadForBlock(churchId, blockId);
    }

    for (const section of existingSections) {
      // Delete all elements in this section
      const elements = await this.repos.element.loadForSection(churchId, section.id);
      for (const element of elements) {
        await this.repos.element.delete(churchId, element.id);
      }
      // Delete the section
      await this.repos.section.delete(churchId, section.id);
    }

    // Now restore sections and elements from snapshot with NEW IDs
    for (const sectionData of snapshot.sections || []) {
      const newSectionId = UniqueIdHelper.shortId();
      const section: Section = {
        ...sectionData,
        id: newSectionId,
        churchId
      };
      delete (section as any).elements;
      await this.repos.section.insert(section);

      // Restore elements for this section with new IDs
      for (const elementData of sectionData.elements || []) {
        await this.restoreElement(churchId, newSectionId, elementData, {});
      }
    }
  }

  private async restoreElement(churchId: string, sectionId: string, elementData: any, idMap: Record<string, string>) {
    const oldId = elementData.id;
    const newId = UniqueIdHelper.shortId();
    idMap[oldId] = newId;

    const element: Element = {
      ...elementData,
      id: newId,
      sectionId,
      churchId,
      // Update parentId if it was remapped
      parentId: elementData.parentId ? (idMap[elementData.parentId] || elementData.parentId) : null
    };
    const childElements = element.elements;
    delete element.elements;
    await this.repos.element.insert(element);

    // Restore child elements recursively
    if (childElements && childElements.length > 0) {
      for (const child of childElements) {
        await this.restoreElement(churchId, sectionId, child, idMap);
      }
    }
  }
}
