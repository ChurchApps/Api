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
    this.logs = [];
  }
}
