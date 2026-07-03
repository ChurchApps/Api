import { Section, Element, Block } from "../models/index.js";
import { ArrayHelper } from "@churchapps/apihelper";
import { Repos } from "../repositories/index.js";
import { RepoManager } from "../../../shared/infrastructure/index.js";

export class TreeHelper {
  public static getChildElements(element: Element, allElements: Element[]) {
    const children = ArrayHelper.getAll(allElements, "parentId", element.id);
    if (children.length > 0) {
      element.elements = children;
      element.elements.forEach((e) => {
        this.getChildElements(e, allElements);
      });
    }
  }

  static buildTree(sections: Section[], allElements: Element[]) {
    const result = sections;
    result.forEach((s) => {
      s.elements = ArrayHelper.getAll(ArrayHelper.getAll(allElements, "sectionId", s.id), "parentId", null);
      s.elements.forEach((e) => {
        this.getChildElements(e, allElements);
      });
    });
    return result;
  }

  static async insertBlocks(sections: Section[], allElements: Element[], churchId: string, siteId = "") {
    const blockIds: string[] = [];
    const repos = await RepoManager.getRepos<Repos>("content");
    const footerBlocks: Block[] = await repos.block.loadByBlockType(churchId, "footerBlock", siteId);
    footerBlocks.forEach((b) => {
      blockIds.push(b.id);
    });
    sections.forEach((s) => {
      if (s.targetBlockId) blockIds.push(s.targetBlockId);
    });
    allElements.forEach((e) => {
      if (e.answers.targetBlockId) blockIds.push(e.answers.targetBlockId);
    });
    if (blockIds.length > 0) {
      const allBlockSections = await repos.section.loadForBlocks(churchId, blockIds);
      const allBlockElements = await repos.element.loadForBlocks(churchId, blockIds);
      this.populateAnswers(allBlockElements);
      this.populateAnswers(allBlockSections);

      allElements.forEach((e) => {
        if (e.answers?.targetBlockId) {
          const blockSections: Section[] = [{ id: "" }];
          const blockElements = ArrayHelper.getAll(allBlockElements, "blockId", e.answers?.targetBlockId);
          const tree = this.buildTree(blockSections, blockElements);
          e.elements = tree[0].elements;
        }
      });

      sections.forEach((s) => {
        if (s.targetBlockId) {
          const blockSections = ArrayHelper.getAll(allBlockSections, "blockId", s.targetBlockId);
          const blockElements = ArrayHelper.getAll(allBlockElements, "blockId", s.targetBlockId);
          const tree = this.buildTree(blockSections, blockElements);
          s.sections = tree;
        }
      });

      // Prefer the site's own footer block, else fall back to the shared ('') one.
      const chosen = (siteId && footerBlocks.find((b) => b.siteId === siteId)) || footerBlocks.find((b) => !b.siteId || b.siteId === "");
      if (chosen) {
        const footerBlockSections = ArrayHelper.getAll(allBlockSections, "blockId", chosen.id);
        footerBlockSections.forEach((s) => {
          s.zone = "siteFooter";
          const blockElements = ArrayHelper.getAll(allBlockElements, "blockId", chosen.id);
          const tree = this.buildTree([s], blockElements);
          sections.push(...tree);
        });
      }
    }
  }

  static populateAnswers(items: Element[] | Section[]) {
    items.forEach((e) => {
      try {
        e.answers = JSON.parse(e.answersJSON);
        e.styles = JSON.parse(e.stylesJSON);
        e.animations = JSON.parse(e.animationsJSON);
      } catch {
        e.answers = {};
        e.styles = {};
        e.animations = {};
      }
      if (!e.answers) e.answers = {};
      if (!e.styles) e.styles = {};
      if (!e.animations) e.animations = {};
    });
  }

  static async convertToBlock(section: Section, blockName: string) {
    const repos = await RepoManager.getRepos<Repos>("content");
    const sec = { ...section };
    const block = await repos.block.save({
      churchId: sec.churchId,
      blockType: "sectionBlock",
      name: blockName || ""
    });
    sec.id = undefined;
    sec.pageId = undefined;
    sec.blockId = block.id;
    const result = await repos.section.save(sec);
    const promises: Promise<Element>[] = [];
    sec.elements?.forEach((e) => {
      promises.push(this.duplicateElement(e, result.id, null, block.id));
    });
    await Promise.all(promises);
    return result;
  }

  static async duplicateSection(section: Section) {
    const repos = await RepoManager.getRepos<Repos>("content");
    const sec = { ...section };
    sec.id = undefined;
    const result = await repos.section.save(sec);
    const promises: Promise<Element>[] = [];
    sec.elements?.forEach((e) => {
      promises.push(this.duplicateElement(e, result.id, null));
    });
    await Promise.all(promises);
    return result;
  }

  // Replaces a page's (or block's) entire content with a snapshot tree, assigning new ids.
  static async deleteAndRestoreContent(churchId: string, pageId: string, blockId: string, snapshot: any) {
    const repos = await RepoManager.getRepos<Repos>("content");
    let existingSections: Section[] = [];
    if (pageId) existingSections = await repos.section.loadForPage(churchId, pageId);
    else if (blockId) existingSections = await repos.section.loadForBlock(churchId, blockId);

    for (const section of existingSections) {
      const elements = await repos.element.loadForSection(churchId, section.id);
      for (const element of elements) await repos.element.delete(churchId, element.id);
      await repos.section.delete(churchId, section.id);
    }

    for (const sectionData of snapshot.sections || []) {
      const section: Section = { ...sectionData, id: undefined, churchId };
      delete (section as any).elements;
      const savedSection = await repos.section.insert(section);
      for (const elementData of sectionData.elements || []) {
        await this.restoreElement(churchId, savedSection.id, elementData, {});
      }
    }
  }

  private static async restoreElement(churchId: string, sectionId: string, elementData: any, idMap: Record<string, string>) {
    const repos = await RepoManager.getRepos<Repos>("content");
    const oldId = elementData.id;
    const element: Element = {
      ...elementData,
      id: undefined,
      sectionId,
      churchId,
      parentId: elementData.parentId ? (idMap[elementData.parentId] || elementData.parentId) : null
    };
    const childElements = element.elements;
    delete element.elements;
    const savedElement = await repos.element.insert(element);
    idMap[oldId] = savedElement.id;

    if (childElements && childElements.length > 0) {
      for (const child of childElements) {
        await this.restoreElement(churchId, sectionId, child, idMap);
      }
    }
  }

  static async duplicateElement(element: Element, sectionId: string, parentId: string, blockId?: string) {
    const repos = await RepoManager.getRepos<Repos>("content");
    const el = { ...element };
    el.id = undefined;
    el.sectionId = sectionId;
    el.parentId = parentId;
    if (blockId) el.blockId = blockId;
    // el.sort = element.sort + 1;
    const result = await repos.element.save(el);
    const promises: Promise<Element>[] = [];
    el.elements?.forEach((e) => {
      promises.push(this.duplicateElement(e, sectionId, result.id, blockId));
    });
    await Promise.all(promises);
    return result;
  }
}
