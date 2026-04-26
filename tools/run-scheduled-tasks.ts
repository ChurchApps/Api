import "reflect-metadata";
import { Environment } from "../src/shared/helpers/Environment";
import { KyselyPool } from "../src/shared/infrastructure/KyselyPool";
import { processServiceRequestReminders } from "../src/shared/infrastructure/ScheduledTaskRunner";

async function runScheduledTasks() {
  try {
    console.log("Initializing environment...");
    await Environment.init(process.env.ENVIRONMENT || "dev");

    console.log("Running scheduled tasks locally...");
    console.log("========================================");

    await processServiceRequestReminders();

    console.log("========================================");
    console.log("Scheduled tasks completed successfully!");

    await KyselyPool.destroyAll();
    process.exit(0);
  } catch (error: any) {
    console.error("Error running scheduled tasks:", error);
    console.error("Stack trace:", error.stack);
    process.exit(1);
  }
}

runScheduledTasks();
