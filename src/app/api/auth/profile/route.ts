import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { verifyToken } from "@/lib/auth";
import { withApiLogging, json } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { validatePasswordStrength } from "@/lib/passwordStrength";
import { profileUpdateSchema } from "@/lib/validators";

async function authFromRequest(request: NextRequest) {
  const auth = request.headers.get("authorization");
  const token = auth?.startsWith("Bearer ")
    ? auth.slice(7)
    : request.cookies.get("token")?.value;
  if (!token) return null;
  return verifyToken(token).catch(() => null);
}

export async function GET(request: NextRequest) {
  return withApiLogging(request, async () => {
    const payload = await authFromRequest(request);
    if (!payload) return json({ message: "Unauthorized" }, 401);

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, username: true, role: true, createdAt: true },
    });
    if (!user) return json({ message: "User not found" }, 404);
    return json({ data: user });
  });
}

export async function PUT(request: NextRequest) {
  return withApiLogging(request, async () => {
    const payload = await authFromRequest(request);
    if (!payload) return json({ message: "Unauthorized" }, 401);

    const body = await request.json();
    const parsed = profileUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return json({ message: "Invalid request body", issues: parsed.error.flatten() }, 400);
    }

    const nextData: { username?: string; passwordHash?: string } = {};
    if (parsed.data.username) {
      const username = parsed.data.username.trim();
      const existing = await prisma.user.findUnique({ where: { username } });
      if (existing && existing.id !== payload.userId) {
        return json({ message: "Username already used by another account" }, 409);
      }
      nextData.username = username;
    }

    if (parsed.data.password) {
      const strengthErrors = validatePasswordStrength(parsed.data.password);
      if (strengthErrors.length > 0) {
        return json({ message: "Password does not meet requirements", errors: strengthErrors }, 400);
      }
      nextData.passwordHash = await bcrypt.hash(parsed.data.password, 10);
    }

    const updated = await prisma.user.update({
      where: { id: payload.userId },
      data: nextData,
      select: { id: true, username: true, role: true, createdAt: true },
    });

    return json({ data: updated });
  });
}
