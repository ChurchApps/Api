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

    console.log("Escalating unread notifications...");
    const escalationResult = await NotificationHelper.escalateDelivery();
    console.log("escalateDelivery result:", JSON.stringify(escalationResult));

    console.log("Processing individual email notifications...");
    const emailResult = await NotificationHelper.sendEmailNotifications("individual");
    console.log("sendEmailNotifications result:", JSON.stringify(emailResult));

    console.log("30-minute timer completed successfully.");
    await KyselyPool.destroyAll();
    process.exit(0);
  } catch (error: any) {
    console.error("Error in 30-minute timer:", error);
    console.error("Stack trace:", error.stack);
    process.exit(1);
  }
}

run();
