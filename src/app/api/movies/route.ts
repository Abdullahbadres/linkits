import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiLogging, json } from "@/lib/api";
import { movieCreateSchema } from "@/lib/validators";
import { logTransaction } from "@/lib/logger";

export async function GET(request: NextRequest) {
  return withApiLogging(request, async () => {
    const movies = await prisma.movie.findMany({ orderBy: { createdAt: "desc" } });
    return json({ data: movies });
  });
}

export async function POST(request: NextRequest) {
  return withApiLogging(request, async () => {
    const body = await request.json();
    const parsed = movieCreateSchema.safeParse(body);
    if (!parsed.success) {
      return json({ message: "Invalid request body", issues: parsed.error.flatten() }, 400);
    }
    const created = await prisma.movie.create({ data: parsed.data });
    await logTransaction("CREATE_MOVIE", { movieId: created.id, title: created.title });
    return json({ data: created }, 201);
  });
}
