import { z } from "zod";

export const loginSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
});

export const registerSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
});

export const profileUpdateSchema = z
  .object({
    username: z.string().min(3).optional(),
    password: z.string().min(6).optional(),
  })
  .refine((data) => Boolean(data.username || data.password), {
    message: "At least username or password is required",
  });

export const movieCreateSchema = z.object({
  externalId: z.number().int().positive(),
  title: z.string().min(1),
  genre: z.string().min(1),
  director: z.string().optional(),
  actors: z.string().optional(),
  production: z.string().optional(),
  streamingProviders: z.string().optional(),
  year: z.number().int().optional(),
  imdbRating: z.number().min(0).max(10).optional(),
  posterUrl: z.string().url().optional(),
  sourcePayload: z.string().min(2),
});

export const saleCreateSchema = z.object({
  movieId: z.number().int().positive(),
  customerName: z.string().min(2),
  saleDate: z.string().datetime(),
  returnDate: z.string().datetime().optional(),
  status: z.enum(["RENTED", "RETURNED", "OVERDUE"]),
  notes: z.string().optional(),
});

export const saleUpdateSchema = saleCreateSchema.partial();
