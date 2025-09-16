import { ConnectionManager } from "./ConnectionManager";

export class RepoManager {
  private static instances: Map<string, any> = new Map();

  static async getRepos<T>(moduleName: string): Promise<T> {
    if (!this.instances.has(moduleName)) {
      const repos = await this.createRepos(moduleName);
      this.instances.set(moduleName, repos);
    }
    return this.instances.get(moduleName);
  }

  private static async createRepos(moduleName: string): Promise<any> {
    // Get the pool for this module (DB helper will be managed by individual repositories)
    const _pool = await ConnectionManager.getPool(moduleName);

    switch (moduleName) {
      case "attendance":
        const { Repos: AttendanceRepos } = await import("../../modules/attendance");
        return new AttendanceRepos();

      case "content":
        const { Repos: ContentRepos } = await import("../../modules/content");
        return new ContentRepos();

      case "doing":
        const { Repos: DoingRepos } = await import("../../modules/doing");
        return new DoingRepos();

      case "giving":
        const { Repos: GivingRepos } = await import("../../modules/giving");
        return new GivingRepos();

      case "membership":
        const { Repos: MembershipRepos } = await import("../../modules/membership");
        return new MembershipRepos();

      case "messaging":
        const { Repos: MessagingRepos } = await import("../../modules/messaging");
        return new MessagingRepos();

      case "reporting":
        const { Repos: ReportingRepos } = await import("../../modules/reporting");
        return new ReportingRepos();

      default:
        throw new Error(`Unknown module: ${moduleName}`);
    }
  }

  /**
   * Legacy method to support existing getCurrent() pattern
   * For modules that use Repos.getCurrent(), this provides
   * the same interface while using the shared infrastructure
   */
  static async getCurrentForModule(moduleName: string): Promise<any> {
    return await this.getRepos(moduleName);
  }

  static clearCache(moduleName?: string): void {
    if (moduleName) {
      this.instances.delete(moduleName);
    } else {
      this.instances.clear();
    }
  }

  static getCachedModules(): string[] {
    return Array.from(this.instances.keys());
  }

  /**
   * Reinitialize repositories for a module (useful after connection changes)
   */
  static async reinitializeModule(moduleName: string): Promise<void> {
    this.clearCache(moduleName);
    await this.getRepos(moduleName);
  }
}
