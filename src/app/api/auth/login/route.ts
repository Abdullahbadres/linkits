import { NextRequest } from "next/server";
import { withApiLogging, json } from "@/lib/api";
import { createToken, ensureDefaultUser, validateCredentials } from "@/lib/auth";
import { loginSchema } from "@/lib/validators";

export async function POST(request: NextRequest) {
  return withApiLogging(request, async () => {
    await ensureDefaultUser();
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return json({ message: "Invalid request body", issues: parsed.error.flatten() }, 400);
    }

    const user = await validateCredentials(parsed.data.username, parsed.data.password);
    if (!user) {
      return json({ message: "Invalid username or password" }, 401);
    }

    const token = await createToken({
      userId: user.id,
      username: user.username,
      role: user.role,
    });
    return json({
      token,
      user: { id: user.id, username: user.username, role: user.role },
    });
  });
}
