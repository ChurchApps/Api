import { SSMClient, GetParametersCommand } from "@aws-sdk/client-ssm";
import { AwsHelper } from "@churchapps/apihelper";

type ReadOne = (name: string) => Promise<string>;
type SendGetParameters = (command: GetParametersCommand) => Promise<{ Parameters?: { Name?: string; Value?: string }[] } | undefined>;

let client: SSMClient | undefined;
const defaultSend: SendGetParameters = (command) => {
  if (!client) client = new SSMClient({ region: process.env.AWS_REGION || "us-east-2" });
  return client.send(command);
};

/**
 * Reads several SSM parameters in one GetParameters call (up to 10 names).
 * A burst of cold starts gets throttled by SSM when each container makes one call per secret, and a
 * failed read left that container without the secret until it was recycled. One batched call per
 * container cuts the request rate, and jittered backoff spreads the retries of containers that
 * started together. Missing parameters come back as "".
 * If the role is not allowed ssm:GetParameters, falls back to one GetParameter read per name.
 */
export async function readSsmParameters(
  names: string[],
  send: SendGetParameters = defaultSend,
  options: { attempts?: number; baseDelayMs?: number; readOne?: ReadOne } = {}
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  names.forEach((name) => { result[name] = ""; });
  if (names.length === 0) return result;

  const attempts = Math.max(1, options.attempts ?? 5);
  const baseDelayMs = options.baseDelayMs ?? 200;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await send(new GetParametersCommand({ Names: names, WithDecryption: true }));
      (response?.Parameters || []).forEach((p) => { if (p.Name) result[p.Name] = p.Value || ""; });
      return result;
    } catch (e) {
      if ((e as { name?: string })?.name === "AccessDeniedException") {
        console.warn("readSsmParameters: ssm:GetParameters denied, reading parameters one at a time");
        const readOne = options.readOne ?? ((name: string) => AwsHelper.readParameter(name));
        for (const name of names) result[name] = await readOne(name);
        return result;
      }
      lastError = e;
      if (attempt < attempts) {
        const cap = baseDelayMs * 2 ** (attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, cap / 2 + Math.random() * cap / 2));
      }
    }
  }
  const err = lastError as { name?: string; message?: string } | undefined;
  console.error(`readSsmParameters failed for ${names.join(", ")} after ${attempts} attempts: ${err?.name || "Error"}: ${err?.message || String(lastError)}`);
  return result;
}
