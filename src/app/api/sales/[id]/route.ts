import type { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiLogging, json } from "@/lib/api";
import { saleUpdateSchema } from "@/lib/validators";
import { logTransaction } from "@/lib/logger";
import { AuthError, requireBearerAuth } from "@/lib/auth";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  return withApiLogging(request, async () => {
    let auth;
    try {
      auth = await requireBearerAuth(request);
    } catch (e) {
      if (e instanceof AuthError) return json({ message: e.message }, e.status);
      throw e;
    }

    const { id } = await context.params;
    const saleId = Number(id);
    if (Number.isNaN(saleId)) return json({ message: "Invalid sale id" }, 400);

    const existing = await prisma.sale.findUnique({ where: { id: saleId } });
    if (!existing) return json({ message: "Sale not found" }, 404);
    if (auth.role !== "ADMIN" && existing.userId !== auth.userId) {
      return json({ message: "Forbidden" }, 403);
    }

    const body = await request.json();
    const parsed = saleUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return json({ message: "Invalid request body", issues: parsed.error.flatten() }, 400);
    }

    const p = parsed.data;
    const data: Prisma.SaleUpdateInput = {};
    if (p.customerName !== undefined) data.customerName = p.customerName;
    if (p.movieId !== undefined) data.movie = { connect: { id: p.movieId } };
    if (p.status !== undefined) data.status = p.status;
    if (p.notes !== undefined) data.notes = p.notes;
    if (p.saleDate !== undefined) data.saleDate = new Date(p.saleDate);
    if (p.returnDate !== undefined) {
      data.returnDate = p.returnDate ? new Date(p.returnDate) : null;
    }

    const updated = await prisma.sale.update({
      where: { id: saleId },
      data,
    });
    await logTransaction("UPDATE_SALE", { saleId: updated.id });
    return json({ data: updated });
  });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return withApiLogging(request, async () => {
    let auth;
    try {
      auth = await requireBearerAuth(request);
    } catch (e) {
      if (e instanceof AuthError) return json({ message: e.message }, e.status);
      throw e;
    }

    const { id } = await context.params;
    const saleId = Number(id);
    if (Number.isNaN(saleId)) return json({ message: "Invalid sale id" }, 400);

    const existing = await prisma.sale.findUnique({ where: { id: saleId } });
    if (!existing) return json({ message: "Sale not found" }, 404);
    if (auth.role !== "ADMIN" && existing.userId !== auth.userId) {
      return json({ message: "Forbidden" }, 403);
    }

    await prisma.sale.delete({ where: { id: saleId } });
    await logTransaction("DELETE_SALE", { saleId });
    return json({ message: "Sale deleted" });
  });
}
