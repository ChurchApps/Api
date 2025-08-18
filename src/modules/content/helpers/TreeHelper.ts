import { Section, Element, Block } from "../models";
import { ArrayHelper } from "@churchapps/apihelper";
import { ContentRepositories } from "../repositories";

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

  static async insertBlocks(sections: Section[], allElements: Element[], churchId: string) {
    const blockIds: string[] = [];
    const footerBlocks: Block[] = await ContentRepositories.getCurrent().block.loadByBlockType(churchId, "footerBlock");
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
      const allBlockSections = await ContentRepositories.getCurrent().section.loadForBlocks(churchId, blockIds);
      const allBlockElements = await ContentRepositories.getCurrent().element.loadForBlocks(churchId, blockIds);
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

      if (footerBlocks.length > 0) {
        const footerBlockSections = ArrayHelper.getAll(allBlockSections, "blockId", footerBlocks[0].id);
        footerBlockSections.forEach((s) => {
          s.zone = "siteFooter";
          const blockElements = ArrayHelper.getAll(allBlockElements, "blockId", footerBlocks[0].id);
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
    const sec = { ...section };
    const block = await ContentRepositories.getCurrent().block.save({
      churchId: sec.churchId,
      blockType: "sectionBlock",
      name: blockName || ""
    });
    sec.id = undefined;
    sec.pageId = undefined;
    sec.blockId = block.id;
    const result = await ContentRepositories.getCurrent().section.save(sec);
    const promises: Promise<Element>[] = [];
    sec.elements?.forEach((e) => {
      promises.push(this.duplicateElement(e, result.id, null, block.id));
    });
    await Promise.all(promises);
    return result;
  }

  static async duplicateSection(section: Section) {
    const sec = { ...section };
    sec.id = undefined;
    const result = await ContentRepositories.getCurrent().section.save(sec);
    const promises: Promise<Element>[] = [];
    sec.elements?.forEach((e) => {
      promises.push(this.duplicateElement(e, result.id, null));
    });
    await Promise.all(promises);
    return result;
  }

  static async duplicateElement(element: Element, sectionId: string, parentId: string, blockId?: string) {
    const el = { ...element };
    el.id = undefined;
    el.sectionId = sectionId;
    el.parentId = parentId;
    if (blockId) el.blockId = blockId;
    // el.sort = element.sort + 1;
    const result = await ContentRepositories.getCurrent().element.save(el);
    const promises: Promise<Element>[] = [];
    el.elements?.forEach((e) => {
      promises.push(this.duplicateElement(e, sectionId, result.id, blockId));
    });
    await Promise.all(promises);
    return result;
  }
}
