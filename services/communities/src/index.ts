import "reflect-metadata";
import { createService, envInt, loadEnv } from "@paashupatastra/service-kit";
import {
  ApartmentEntity,
  getDataSource,
  toIsoRequired,
} from "@paashupatastra/database";
import {
  createApartmentSchema,
  joinApartmentSchema,
  paginationQuerySchema,
  updateApartmentSchema,
} from "@paashupatastra/shared-models";
import { ILike } from "typeorm";

function makeInviteCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function serializeApartment(row: ApartmentEntity) {
  return {
    id: row.id,
    name: row.name,
    inviteCode: row.inviteCode,
    city: row.city,
    state: row.state,
    addressLine: row.addressLine,
    isActive: row.isActive,
    latitude: row.latitude,
    longitude: row.longitude,
    createdAt: toIsoRequired(row.createdAt),
    updatedAt: toIsoRequired(row.updatedAt),
  };
}

async function main() {
  loadEnv();
  const ds = await getDataSource();
  const repo = ds.getRepository(ApartmentEntity);

  await createService({
    name: "communities",
    port: envInt("COMMUNITIES_PORT", 3003),
    registerRoutes: async (app) => {
      app.get("/v1/apartments/stats", async () => {
        const total = await repo.count();
        const active = await repo.count({ where: { isActive: true } });
        const inactive = await repo.count({ where: { isActive: false } });
        const citiesRaw = await repo
          .createQueryBuilder("a")
          .select("COUNT(DISTINCT a.city)", "cities")
          .getRawOne<{ cities: string }>();

        return {
          total,
          active,
          inactive,
          cities: Number(citiesRaw?.cities ?? 0),
        };
      });

      app.get("/v1/apartments", async (request) => {
        const query = paginationQuerySchema.parse(request.query);
        const where = query.q
          ? [
              { name: ILike(`%${query.q}%`) },
              { city: ILike(`%${query.q}%`) },
              { state: ILike(`%${query.q}%`) },
              { inviteCode: ILike(`%${query.q}%`) },
              { addressLine: ILike(`%${query.q}%`) },
            ]
          : undefined;

        const [rows, total] = await repo.findAndCount({
          where,
          order: { createdAt: "DESC" },
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        });

        const totalPages = Math.max(1, Math.ceil(total / query.limit));
        return {
          items: rows.map(serializeApartment),
          page: query.page,
          limit: query.limit,
          total,
          totalPages,
        };
      });

      app.get("/v1/apartments/:id", async (request, reply) => {
        const { id } = request.params as { id: string };
        const row = await repo.findOne({ where: { id } });
        if (!row) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Apartment not found" } });
        }
        return serializeApartment(row);
      });

      app.post("/v1/apartments", async (request, reply) => {
        const body = createApartmentSchema.parse(request.body);
        const row = repo.create({
          name: body.name,
          inviteCode: makeInviteCode(),
          city: body.city,
          state: body.state,
          addressLine: body.addressLine,
          latitude: body.latitude ?? null,
          longitude: body.longitude ?? null,
          isActive: true,
        });
        const saved = await repo.save(row);
        return reply.code(201).send(serializeApartment(saved));
      });

      app.patch("/v1/apartments/:id", async (request, reply) => {
        const { id } = request.params as { id: string };
        const existing = await repo.findOne({ where: { id } });
        if (!existing) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Apartment not found" } });
        }
        const body = updateApartmentSchema.parse(request.body);
        Object.assign(existing, body);
        const saved = await repo.save(existing);
        return serializeApartment(saved);
      });

      app.delete("/v1/apartments/:id", async (request, reply) => {
        const { id } = request.params as { id: string };
        const result = await repo.delete({ id });
        if (!result.affected) {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Apartment not found" } });
        }
        return reply.code(204).send();
      });

      app.post("/v1/apartments/join", async (request, reply) => {
        const body = joinApartmentSchema.parse(request.body);
        const match = await repo.findOne({ where: { inviteCode: body.inviteCode } });
        if (!match) {
          return reply.code(404).send({
            error: { code: "INVALID_INVITE", message: "Invite code not found" },
          });
        }
        return {
          apartment: serializeApartment(match),
          membership: {
            status: "joined",
            blockName: body.blockName ?? null,
            flatNumber: body.flatNumber ?? null,
          },
        };
      });
    },
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
