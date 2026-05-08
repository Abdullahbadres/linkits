import { mkdir, appendFile } from "node:fs/promises";
import path from "node:path";
import { registerErrorEvent, registerLatencyEvent } from "@/lib/alerts";

const logsDir = path.join(process.cwd(), "logs");
const appLogPath = path.join(logsDir, "app.log");
const txLogPath = path.join(logsDir, "transaction.log");
const errorLogPath = path.join(logsDir, "error.log");

async function writeLine(filePath: string, line: string) {
  await mkdir(logsDir, { recursive: true });
  await appendFile(filePath, line + "\n", "utf-8");
}

export async function logApiRequest(params: {
  method: string;
  endpoint: string;
  status: number;
  responseTimeMs: number;
}) {
  registerLatencyEvent(params.responseTimeMs);
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    type: "api",
    ...params,
  });
  await writeLine(appLogPath, line);
}

export async function logTransaction(action: string, payload: Record<string, unknown>) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    type: "transaction",
    action,
    payload,
  });
  await writeLine(txLogPath, line);
}

export async function logError(error: unknown, context: Record<string, unknown> = {}) {
  registerErrorEvent();
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    type: "error",
    context,
    error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
  });
  await writeLine(errorLogPath, line);
}
