import { getAlertSnapshot } from "@/lib/alerts";
import { json } from "@/lib/api";

export async function GET() {
  const alerts = getAlertSnapshot();
  return json({
    status: "ok",
    uptimeSec: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    alerts,
  });
}
