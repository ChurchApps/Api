import { LoggingHelper } from "@churchapps/apihelper";

export class Logger {
  private logs: string[] = [];

  public error(message: string) {
    this.logs.push(`ERROR: ${new Date().toISOString()} - ${message}`);
    console.error(message);
  }

  public info(message: string) {
    this.logs.push(`INFO: ${new Date().toISOString()} - ${message}`);
    console.log(message);
  }

  public warn(message: string) {
    this.logs.push(`WARN: ${new Date().toISOString()} - ${message}`);
    console.warn(message);
  }

  public async flush() {
    // In the unified structure, we can use LoggingHelper from apihelper
    // or implement CloudWatch logging as needed
    if (this.logs.length > 0) {
      const logData = this.logs.join("\n");
      try {
        LoggingHelper.getCurrent().error(`[messaging] batch-logs: ${logData}`);
      } catch (error) {
        console.error("Failed to flush logs:", error);
      }
      this.logs = [];
    }
  }
}
