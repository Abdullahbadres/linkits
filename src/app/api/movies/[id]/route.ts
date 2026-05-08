import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiLogging, json } from "@/lib/api";
import { movieCreateSchema } from "@/lib/validators";
import { logTransaction } from "@/lib/logger";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PUT(request: NextRequest, context: RouteContext) {
  return withApiLogging(request, async () => {
    const { id } = await context.params;
    const movieId = Number(id);
    if (Number.isNaN(movieId)) {
      return json({ message: "Invalid movie id" }, 400);
    }

    const body = await request.json();
    const parsed = movieCreateSchema.partial().safeParse(body);
    if (!parsed.success) {
      return json({ message: "Invalid request body", issues: parsed.error.flatten() }, 400);
    }

    const updated = await prisma.movie.update({
      where: { id: movieId },
      data: parsed.data,
    });
    await logTransaction("UPDATE_MOVIE", { movieId: updated.id });
    return json({ data: updated });
  });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return withApiLogging(request, async () => {
    const { id } = await context.params;
    const movieId = Number(id);
    if (Number.isNaN(movieId)) {
      return json({ message: "Invalid movie id" }, 400);
    }
    await prisma.movie.delete({ where: { id: movieId } });
    await logTransaction("DELETE_MOVIE", { movieId });
    return json({ message: "Movie deleted" });
  });
}
