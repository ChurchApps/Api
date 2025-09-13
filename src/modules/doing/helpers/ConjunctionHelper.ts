import { Repositories } from "../repositories";
import { RepositoryManager } from "../../../shared/infrastructure";
import { Automation, Condition, Conjunction } from "../models";
import { ArrayHelper } from "@churchapps/apihelper";
import { ConditionHelper } from "./ConditionHelper";

export class ConjunctionHelper {
  public static async getPeopleIds(automation: Automation, repositories?: Repositories) {
    const repos = repositories || (await RepositoryManager.getRepositories<Repositories>("doing"));
    const conjunctions = await repos.conjunction.loadForAutomation(automation.churchId || "", automation.id || "");
    let conditions = (await repos.condition.loadForAutomation(automation.churchId || "", automation.id || "")) as Condition[];
    conditions = await ConditionHelper.getPeopleIdsMatchingConditions(conditions, repos);
    const tree = this.buildTree(conjunctions as Conjunction[], conditions);
    const peopleIds = this.getPeopleFromTree(tree);
    return peopleIds;
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
      if (result.length === 0)
        peopleArrays.forEach((pa) => {
          result = result.concat(pa);
        });
    } else {
      peopleArrays.forEach((pa) => {
        let allPeople = true;
        let noPeople = false;
        if (pa.length !== 1 || pa[0] !== "*") {
          allPeople = false;
          if (pa.length === 0) noPeople = true;
          if (result.length === 0) result = pa;
          else {
            for (let i = result.length - 1; i >= 0; i--) {
              const id = result[i];
              if (pa.indexOf(id) === -1) result.splice(i, 1);
            }
          }
        }
        if (allPeople) result = ["*"];
        else if (noPeople) result = [];
      });
    }
    parent.matchingIds = result;
    return result;
  }
}
