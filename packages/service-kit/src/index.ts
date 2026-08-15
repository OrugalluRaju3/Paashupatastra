import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";

export function loadEnv(): void {
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../../.env"),
    path.resolve(__dirname, "../../../.env"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      dotenv.config({ path: candidate });
      return;
    }
  }
}

export type CreateServiceOptions = {
  name: string;
  port: number;
  host?: string;
  registerRoutes: (app: FastifyInstance) => Promise<void> | void;
  afterReady?: (app: FastifyInstance) => Promise<void> | void;
};

export async function createService(options: CreateServiceOptions): Promise<FastifyInstance> {
  loadEnv();

  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
    },
  });

  await app.register(cors, { origin: true });
  await app.register(helmet);

  app.get("/health", async () => ({
    status: "ok" as const,
    service: options.name,
    timestamp: new Date().toISOString(),
  }));

  await options.registerRoutes(app);

  await app.ready();
  if (options.afterReady) {
    await options.afterReady(app);
  }

  await app.listen({
    port: options.port,
    host: options.host ?? "0.0.0.0",
  });

  app.log.info(`${options.name} listening on ${options.port}`);
  return app;
}

export function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : fallback;
}

export function envString(name: string, fallback?: string): string {
  const raw = process.env[name];
  if (raw && raw.length > 0) return raw;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required env: ${name}`);
}

export function getUserIdFromHeaders(headers: Record<string, unknown>): string | null {
  const explicit = headers["x-user-id"];
  if (typeof explicit === "string" && explicit.length > 0) return explicit;

  const auth = headers.authorization;
  if (typeof auth !== "string" || !auth.startsWith("Bearer ")) return null;
  try {
    const token = auth.slice("Bearer ".length);
    const json = Buffer.from(token, "base64url").toString("utf8");
    const payload = JSON.parse(json) as { sub?: string | number };
    if (payload.sub === undefined || payload.sub === null) return null;
    return String(payload.sub);
  } catch {
    return null;
  }
}

/** Read auth module (`parking` | `tanker` | `seva`) from JWT or x-auth-module header. */
export function getAuthModuleFromHeaders(
  headers: Record<string, unknown>,
): "parking" | "tanker" | "seva" | null {
  const explicit = headers["x-auth-module"];
  if (explicit === "parking" || explicit === "tanker" || explicit === "seva") return explicit;

  const auth = headers.authorization;
  if (typeof auth !== "string" || !auth.startsWith("Bearer ")) return null;
  try {
    const token = auth.slice("Bearer ".length);
    const json = Buffer.from(token, "base64url").toString("utf8");
    const payload = JSON.parse(json) as { module?: string };
    if (payload.module === "parking" || payload.module === "tanker" || payload.module === "seva") {
      return payload.module;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Active login intent / portal role for inbox scoping.
 * Prefer `x-auth-intent`, then JWT `intent` if present.
 */
export function getAuthIntentFromHeaders(headers: Record<string, unknown>): string | null {
  const explicit = headers["x-auth-intent"];
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim().toLowerCase();

  const auth = headers.authorization;
  if (typeof auth !== "string" || !auth.startsWith("Bearer ")) return null;
  try {
    const token = auth.slice("Bearer ".length);
    const json = Buffer.from(token, "base64url").toString("utf8");
    const payload = JSON.parse(json) as { intent?: string };
    if (typeof payload.intent === "string" && payload.intent.trim()) {
      return payload.intent.trim().toLowerCase();
    }
    return null;
  } catch {
    return null;
  }
}

/** Map login intent → notification audience bucket used for inbox filtering. */
export function notificationAudienceForIntent(intent: string | null | undefined): string | null {
  if (!intent) return null;
  const value = intent.toLowerCase();
  if (value === "customer" || value === "resident" || value === "visitor") return "customer";
  if (value === "supplier" || value === "tanker_supplier") return "supplier";
  if (value === "driver" || value === "tanker_driver") return "driver";
  if (value === "provider" || value === "seva_provider") return "provider";
  if (value === "worker" || value === "seva_worker") return "worker";
  if (
    value === "tanker_super_admin" ||
    value === "tanker_admin" ||
    value === "seva_super_admin" ||
    value === "super_admin" ||
    value === "admin"
  ) {
    return "admin";
  }
  if (value === "owner" || value === "parking_owner") return "owner";
  if (value === "parking_super_admin" || value === "verification_manager" || value === "field_executive") {
    return "staff";
  }
  return null;
}

/** Parse route/header/JWT id strings into numeric entity ids. */
export function parseEntityId(value: string | number): number {
  const n = typeof value === "number" ? value : Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Invalid entity id: ${value}`);
  }
  return n;
}

export function parseUserIdFromHeaders(headers: Record<string, unknown>): number | null {
  const raw = getUserIdFromHeaders(headers);
  if (!raw) return null;
  try {
    return parseEntityId(raw);
  } catch {
    return null;
  }
}

export function getRolesFromHeaders(headers: Record<string, unknown>): string[] {
  const explicit = headers["x-user-roles"];
  if (typeof explicit === "string" && explicit.length > 0) {
    return explicit.split(",").map((r) => r.trim()).filter(Boolean);
  }
  const auth = headers.authorization;
  if (typeof auth !== "string" || !auth.startsWith("Bearer ")) return [];
  try {
    const token = auth.slice("Bearer ".length);
    const json = Buffer.from(token, "base64url").toString("utf8");
    const payload = JSON.parse(json) as { roles?: string[] };
    return payload.roles ?? [];
  } catch {
    return [];
  }
}
