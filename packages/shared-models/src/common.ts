import { z } from "zod";

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  timestamp: z.string().datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  q: z.string().trim().optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** Uploaded file path (`/v1/...`) or absolute http(s) URL. */
export const uploadedFileRefSchema = z
  .string()
  .min(1)
  .refine((v) => v.startsWith("/v1/") || /^https?:\/\//i.test(v), {
    message: "Upload a file",
  });

export type UploadedFileRef = z.infer<typeof uploadedFileRefSchema>;

export function paginate<T>(
  items: T[],
  page: number,
  limit: number,
): { items: T[]; page: number; limit: number; total: number; totalPages: number } {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * limit;
  return {
    items: items.slice(start, start + limit),
    page: safePage,
    limit,
    total,
    totalPages,
  };
}
