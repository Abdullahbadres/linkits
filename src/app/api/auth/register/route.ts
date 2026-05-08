import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { withApiLogging, json } from "@/lib/api";
import { ensureDefaultUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validatePasswordStrength } from "@/lib/passwordStrength";
import { registerSchema } from "@/lib/validators";

export async function POST(request: NextRequest) {
  return withApiLogging(request, async () => {
    await ensureDefaultUser();
    const body = await request.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return json({ message: "Invalid request body", issues: parsed.error.flatten() }, 400);
    }

    const strengthErrors = validatePasswordStrength(parsed.data.password);
    if (strengthErrors.length > 0) {
      return json({ message: "Password does not meet requirements", errors: strengthErrors }, 400);
    }

    const username = parsed.data.username.trim();
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return json({ message: "Username already registered" }, 409);
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    const created = await prisma.user.create({
      data: {
        username,
        passwordHash,
      },
    });

    return json(
      {
        message: "Account created successfully. Please sign in with your username and password.",
        user: { id: created.id, username: created.username },
      },
      201,
    );
  });
}
