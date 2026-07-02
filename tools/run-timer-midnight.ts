import "reflect-metadata";
import { Environment } from "../src/shared/helpers/Environment";
import { KyselyPool } from "../src/shared/infrastructure/KyselyPool";
import { NotificationHelper } from "../src/modules/messaging/helpers/NotificationHelper";
import { RepoManager } from "../src/shared/infrastructure/RepoManager";

async function run() {
  try {
    console.log("Initializing environment...");
    await Environment.init(process.env.ENVIRONMENT || "dev");

    console.log("Initializing messaging repos...");
    const repos = await RepoManager.getRepos<any>("messaging");
    NotificationHelper.init(repos);

    console.log("Expanding reminder occurrences...");
    const { expandReminders } = await import("../src/modules/messaging/helpers/ReminderBootstrap");
    await expandReminders(repos);

    console.log("Advancing recurring streaming services...");
    const contentRepos = await RepoManager.getRepos<any>("content");
    await contentRepos.streamingService.advanceRecurringServices();

    console.log("Processing daily email notifications...");
    const result = await NotificationHelper.sendEmailNotifications("daily");
    console.log("sendEmailNotifications result:", JSON.stringify(result));

    console.log("Midnight timer completed successfully.");
    await KyselyPool.destroyAll();
    process.exit(0);
  } catch (error: any) {
    console.error("Error in midnight timer:", error);
    console.error("Stack trace:", error.stack);
    process.exit(1);
  }
}

run();
