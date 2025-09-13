import { ConnectionManager } from "./ConnectionManager";

export class RepositoryManager {
  private static instances: Map<string, any> = new Map();

  static async getRepositories<T>(moduleName: string): Promise<T> {
    if (!this.instances.has(moduleName)) {
      const repositories = await this.createRepositories(moduleName);
      this.instances.set(moduleName, repositories);
    }
    return this.instances.get(moduleName);
  }

  private static async createRepositories(moduleName: string): Promise<any> {
    // Get the pool for this module (DB helper will be managed by individual repositories)
    const _pool = await ConnectionManager.getPool(moduleName);

    switch (moduleName) {
      case "attendance":
        const { Repositories: AttendanceRepos } = await import("../../modules/attendance");
        return new AttendanceRepos();

      case "content":
        const { Repositories: ContentRepos } = await import("../../modules/content");
        return new ContentRepos();

      case "doing":
        const { Repositories: DoingRepos } = await import("../../modules/doing");
        return new DoingRepos();

      case "giving":
        const { Repositories: GivingRepos } = await import("../../modules/giving");
        return new GivingRepos();

      case "membership":
        const { Repositories: MembershipRepos } = await import("../../modules/membership");
        return new MembershipRepos();

      case "messaging":
        const { Repositories: MessagingRepos } = await import("../../modules/messaging");
        return new MessagingRepos();

      case "reporting":
        const { Repositories: ReportingRepos } = await import("../../modules/reporting");
        return new ReportingRepos();

      default:
        throw new Error(`Unknown module: ${moduleName}`);
    }
  }

  /**
   * Legacy method to support existing getCurrent() pattern
   * For modules that use Repositories.getCurrent(), this provides
   * the same interface while using the shared infrastructure
   */
  static async getCurrentForModule(moduleName: string): Promise<any> {
    return await this.getRepositories(moduleName);
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
    await this.getRepositories(moduleName);
  }
}
