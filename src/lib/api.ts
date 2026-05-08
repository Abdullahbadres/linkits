import { NextResponse } from "next/server";
import { logApiRequest, logError } from "@/lib/logger";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export async function withApiLogging(
  request: Request,
  handler: () => Promise<NextResponse>,
): Promise<NextResponse> {
  const start = Date.now();
  try {
    const response = await handler();
    await logApiRequest({
      method: request.method,
      endpoint: new URL(request.url).pathname,
      status: response.status,
      responseTimeMs: Date.now() - start,
    });
    return response;
  } catch (error) {
    await logError(error, {
      method: request.method,
      endpoint: new URL(request.url).pathname,
    });
    const fail = json({ message: "Internal server error" }, 500);
    await logApiRequest({
      method: request.method,
      endpoint: new URL(request.url).pathname,
      status: 500,
      responseTimeMs: Date.now() - start,
    });
    return fail;
  }
}
