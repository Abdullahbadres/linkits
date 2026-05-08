import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiLogging, json } from "@/lib/api";
import { logTransaction } from "@/lib/logger";
import { saleCreateSchema } from "@/lib/validators";
import { AuthError, requireBearerAuth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  return withApiLogging(request, async () => {
    let auth;
    try {
      auth = await requireBearerAuth(request);
    } catch (e) {
      if (e instanceof AuthError) return json({ message: e.message }, e.status);
      throw e;
    }

    const where = auth.role === "ADMIN" ? {} : { userId: auth.userId };
    const sales = await prisma.sale.findMany({
      where,
      include: { movie: true, user: { select: { id: true, username: true } } },
      orderBy: { createdAt: "desc" },
    });
    return json({ data: sales });
  });
}

export async function POST(request: NextRequest) {
  return withApiLogging(request, async () => {
    let auth;
    try {
      auth = await requireBearerAuth(request);
    } catch (e) {
      if (e instanceof AuthError) return json({ message: e.message }, e.status);
      throw e;
    }

    const body = await request.json();
    const parsed = saleCreateSchema.safeParse(body);
    if (!parsed.success) {
      return json({ message: "Invalid request body", issues: parsed.error.flatten() }, 400);
    }

    const created = await prisma.sale.create({
      data: {
        userId: auth.userId,
        movieId: parsed.data.movieId,
        customerName: parsed.data.customerName,
        saleDate: new Date(parsed.data.saleDate),
        returnDate: parsed.data.returnDate ? new Date(parsed.data.returnDate) : null,
        status: parsed.data.status,
        notes: parsed.data.notes,
        transactionRef: `TX-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      },
    });
    await logTransaction("CREATE_SALE", {
      saleId: created.id,
      transactionRef: created.transactionRef,
    });
    return json({ data: created }, 201);
  });
}
