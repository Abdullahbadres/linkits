import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * One client per warm serverless instance (Vercel). Without this, production
 * created a new PrismaClient on every request and could exhaust Neon pooler / time out.
 */
export const prisma = globalForPrisma.prisma ?? new PrismaClient();

globalForPrisma.prisma = prisma;
