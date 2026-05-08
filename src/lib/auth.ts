import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-super-secret-change-me");
const defaultUsername = process.env.DEFAULT_ADMIN_USERNAME ?? "admin";
const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD ?? "admin123";

export type AuthPayload = {
  userId: number;
  username: string;
  /** "ADMIN" | "USER" */
  role: string;
};

export async function ensureDefaultUser() {
  const existing = await prisma.user.findUnique({ where: { username: defaultUsername } });
  if (existing) {
    if (existing.role !== "ADMIN") {
      return prisma.user.update({
        where: { id: existing.id },
        data: { role: "ADMIN" },
      });
    }
    return existing;
  }
  const passwordHash = await bcrypt.hash(defaultPassword, 10);
  return prisma.user.create({
    data: { username: defaultUsername, passwordHash, role: "ADMIN" },
  });
}

export async function validateCredentials(username: string, password: string) {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) return null;
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;
  return user;
}

export async function createToken(payload: AuthPayload) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(secret);
}

export async function verifyToken(token: string): Promise<AuthPayload> {
  const { payload } = await jwtVerify(token, secret);
  const p = payload as Record<string, unknown>;
  const userId = Number(p.userId);
  const username = String(p.username ?? "");
  const role = typeof p.role === "string" && p.role.length > 0 ? p.role : "USER";
  return { userId, username, role };
}

/** Authorization: Bearer & valid JWT. */
export async function requireBearerAuth(request: NextRequest): Promise<AuthPayload> {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    throw new AuthError("Unauthorized", 401);
  }
  try {
    return await verifyToken(auth.slice(7));
  } catch {
    throw new AuthError("Unauthorized", 401);
  }
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export function requireAdmin(auth: AuthPayload): void {
  if (auth.role !== "ADMIN") {
    throw new AuthError("Forbidden: admin role required", 403);
  }
}
