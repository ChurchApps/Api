import { Repos } from "../repositories/index.js";
import { RepoManager } from "../../../shared/infrastructure/index.js";
import { Condition, Conjunction } from "../models/index.js";
import { ArrayHelper } from "@churchapps/apihelper";
import { ConditionHelper } from "./ConditionHelper.js";

export class ConjunctionHelper {
  // Ids of people matching a scheduled rule's condition tree (["*"] = everyone, [] = none).
  public static async getPeopleIdsForTrigger(churchId: string, triggerId: string, repositories?: Repos) {
    const repos = repositories || (await RepoManager.getRepos<Repos>("doing"));
    const conjunctions = (await repos.conjunction.loadForTrigger(churchId, triggerId)) as Conjunction[];
    if (!conjunctions || conjunctions.length === 0) return [];
    let conditions = (await repos.condition.loadForTrigger(churchId, triggerId)) as Condition[];
    conditions = await ConditionHelper.getPeopleIdsMatchingConditions(conditions);
    const tree = this.buildTree(conjunctions, conditions);
    if (!tree) return [];
    return this.getPeopleFromTree(tree);
  }

  // Ids of people matching a step route's condition tree (["*"] = everyone, [] = none).
  public static async getPeopleIdsForStepRoute(churchId: string, stepRouteId: string, repositories?: Repos) {
    const repos = repositories || (await RepoManager.getRepos<Repos>("doing"));
    const conjunctions = (await repos.conjunction.loadForStepRoute(churchId, stepRouteId)) as Conjunction[];
    if (!conjunctions || conjunctions.length === 0) return [];
    let conditions = (await repos.condition.loadForStepRoute(churchId, stepRouteId)) as Condition[];
    conditions = await ConditionHelper.getPeopleIdsMatchingConditions(conditions);
    const tree = this.buildTree(conjunctions, conditions);
    if (!tree) return [];
    return this.getPeopleFromTree(tree);
  }

  public static async personMatchesStepRoute(churchId: string, stepRouteId: string, personId: string, repositories?: Repos) {
    const ids = await this.getPeopleIdsForStepRoute(churchId, stepRouteId, repositories);
    return ids.indexOf("*") > -1 || ids.indexOf(personId) > -1;
  }

  public static buildTree(allConjunctions: Conjunction[], allConditions: Condition[]) {
    allConjunctions.forEach((ac) => {
      if (ac.parentId === null) ac.parentId = "";
    });
    const root: Conjunction = ArrayHelper.getOne(allConjunctions, "parentId", "");
    this.buildTreeLevel(allConjunctions, allConditions, root);
    return root;
  }

  private static buildTreeLevel(allConjunctions: Conjunction[], allConditions: Condition[], parent: Conjunction) {
    parent.conjunctions = ArrayHelper.getAll(allConjunctions, "parentId", parent.id);
    parent.conditions = ArrayHelper.getAll(allConditions, "conjunctionId", parent.id);
    parent.conjunctions.forEach((c) => {
      this.buildTreeLevel(allConjunctions, allConditions, c);
    });
  }

  public static getPeopleFromTree(parent: Conjunction) {
    const peopleArrays: string[][] = [];
    let result: string[] = [];
    parent.conditions.forEach((c) => {
      peopleArrays.push(c.matchingIds || []);
    });
    parent.conjunctions.forEach((c) => {
      peopleArrays.push(this.getPeopleFromTree(c));
    });

    if (parent.groupType === "OR") {
      peopleArrays.forEach((pa) => {
        if (pa.length === 1 && pa[0] === "*") result = ["*"];
      });
      if (result.length === 0) {
        peopleArrays.forEach((pa) => {
          result = result.concat(pa);
        });
      }
    } else {
      let intersection: string[] | null = null;
      for (const pa of peopleArrays) {
        if (pa.length === 1 && pa[0] === "*") continue;
        intersection = intersection === null ? [...pa] : intersection.filter((id) => pa.includes(id));
      }
      result = intersection ?? (peopleArrays.length > 0 ? ["*"] : []);
    }
    parent.matchingIds = result;
    return result;
  }
}
