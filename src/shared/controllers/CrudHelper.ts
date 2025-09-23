import express from "express";

export class CrudHelper {
  static async getById<TModel>(au: any, permission: any | null, loader: () => Promise<any>, convert: (churchId: string, row: any) => TModel): Promise<TModel | {}> {
    if (permission && !au.checkAccess(permission)) return {};
    const data = await loader();
    return convert(au.churchId, data);
  }

  static async list<TModel>(au: any, loader: () => Promise<any[]>, convertAll: (churchId: string, rows: any[]) => TModel[]): Promise<TModel[]> {
    const data = (await loader()) || [];
    return convertAll(au.churchId, data);
  }

  static async saveMany<TModel, TInput extends { churchId?: string }>(
    au: any,
    editPermission: any,
    items: TInput[],
    setChurchId: (item: TInput, churchId: string) => void,
    save: (item: TInput) => Promise<TModel>,
    convertAll: (churchId: string, rows: any[]) => TModel[]
  ): Promise<TModel[] | {}> {
    if (!au.checkAccess(editPermission)) return {};
    const promises: Promise<TModel>[] = [];
    items.forEach((item) => {
      setChurchId(item, au.churchId);
      promises.push(save(item));
    });
    const result = await Promise.all(promises);
    return convertAll(au.churchId, result as any[]);
  }

  static async remove(au: any, editPermission: any, remover: () => Promise<any>): Promise<{}> {
    await remover();
    return {};
  }

  // Auto-convert variants using repository's convertToModel/convertAllToModel
  static async getByIdAuto<TModel>(au: any, permission: any | null, loader: () => Promise<any>, repo: { convertToModel: (churchId: string, row: any) => TModel }): Promise<TModel> {
    const data = await loader();
    return repo.convertToModel(au.churchId, data);
  }

  static async listAuto<TModel>(au: any, loader: () => Promise<any[]>, repo: { convertAllToModel: (churchId: string, rows: any[]) => TModel[] }): Promise<TModel[]> {
    const data = (await loader()) || [];
    return repo.convertAllToModel(au.churchId, data);
  }

  static async saveManyAuto<TModel, TInput extends { churchId?: string }>(
    au: any,
    editPermission: any,
    items: TInput[],
    setChurchId: (item: TInput, churchId: string) => void,
    save: (item: TInput) => Promise<TModel>,
    repo: { convertAllToModel: (churchId: string, rows: any[]) => TModel[] }
  ): Promise<TModel[]> {
    const promises: Promise<TModel>[] = [];
    items.forEach((item) => {
      setChurchId(item, au.churchId);
      promises.push(save(item));
    });
    const result = await Promise.all(promises);
    return repo.convertAllToModel(au.churchId, result as any[]);
  }

  // Controller-wrapped variants (use controller's action wrappers and repositories)
  static getByIdWrapped(ctrl: any, req: express.Request, res: express.Response, permission: any | null, repoKey: string, id: string) {
    return (ctrl as any).actionWrapper(req, res, async (au: any) => {
      if (permission && !au.checkAccess(permission)) {
        return (ctrl as any).json({ error: `User lacks ${permission} permission` }, 401);
      }
      return CrudHelper.getByIdAuto(au, permission, () => ctrl.repos[repoKey].load(au.churchId, id), ctrl.repos[repoKey]);
    });
  }

  static listWrapped(
    ctrl: any,
    req: express.Request,
    res: express.Response,
    repoKey: string,
    loader: (repos: any, au: any) => Promise<any[]>,
    permission?: any | null
  ) {
    return (ctrl as any).actionWrapper(req, res, async (au: any) => {
      if (permission && !au.checkAccess(permission)) {
        return (ctrl as any).json({ error: `User lacks ${permission} permission` }, 401);
      }
      return CrudHelper.listAuto(au, () => loader(ctrl.repos, au), ctrl.repos[repoKey]);
    });
  }

  static listAnonWrapped(ctrl: { actionWrapperAnon: Function; repos: any }, req: express.Request, res: express.Response, repoKey: string, loader: (repos: any) => Promise<any[]>) {
    return (ctrl as any).actionWrapperAnon(req, res, async () => CrudHelper.listAuto({ churchId: undefined } as any, () => loader(ctrl.repos), ctrl.repos[repoKey]));
  }

  static saveManyWrapped<TInput extends { churchId?: string }>(
    ctrl: any,
    req: express.Request<{}, {}, TInput[]>,
    res: express.Response,
    editPermission: any,
    repoKey: string,
    setChurchId?: (item: TInput, churchId: string) => void
  ) {
    return (ctrl as any).actionWrapper(req, res, async (au: any) => {
      if (!au.checkAccess(editPermission)) {
        return (ctrl as any).json({ error: `User lacks ${editPermission} permission` }, 401);
      }
      return CrudHelper.saveManyAuto(
        au,
        editPermission,
        req.body,
        (item, churchId) => (setChurchId ? setChurchId(item, churchId) : ((item as any).churchId = churchId)),
        (item) => ctrl.repos[repoKey].save(item),
        ctrl.repos[repoKey]
      );
    });
  }

  static deleteWrapped(
    ctrl: any,
    req: express.Request,
    res: express.Response,
    editPermission: any,
    repoKey: string,
    remover: (repos: any, au: any) => Promise<any>
  ) {
    return (ctrl as any).actionWrapper(req, res, async (au: any) => {
      if (!au.checkAccess(editPermission)) {
        return (ctrl as any).json({ error: `User lacks ${editPermission} permission` }, 401);
      }
      return CrudHelper.remove(au, editPermission, () => remover(ctrl.repos, au));
    });
  }
}
