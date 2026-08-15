import proxy from "@fastify/http-proxy";
import { createService, envInt, envString } from "@paashupatastra/service-kit";

async function main() {
  const routes = [
    { prefix: "/v1/auth", upstream: envString("AUTH_URL", "http://localhost:3001") },
    { prefix: "/v1/users", upstream: envString("USERS_URL", "http://localhost:3002") },
    { prefix: "/v1/apartments", upstream: envString("COMMUNITIES_URL", "http://localhost:3003") },
    { prefix: "/v1/community", upstream: envString("COMMUNITIES_URL", "http://localhost:3003") },
    { prefix: "/v1/parking", upstream: envString("PARKING_URL", "http://localhost:3004") },
    { prefix: "/v1/payments", upstream: envString("PAYMENTS_URL", "http://localhost:3005") },
    {
      prefix: "/v1/notifications",
      upstream: envString("NOTIFICATIONS_URL", "http://localhost:3006"),
    },
    { prefix: "/v1/tanker", upstream: envString("TANKER_URL", "http://localhost:3007") },
    { prefix: "/v1/content", upstream: envString("CONTENT_URL", "http://localhost:3008") },
    { prefix: "/v1/seva", upstream: envString("SEVA_URL", "http://localhost:3009") },
  ];

  await createService({
    name: "gateway",
    port: envInt("GATEWAY_PORT", 3000),
    registerRoutes: async (app) => {
      // PowerShell / some clients send Expect: 100-continue which undici rejects
      app.addHook("onRequest", async (request) => {
        delete request.headers.expect;
      });

      for (const route of routes) {
        await app.register(proxy, {
          upstream: route.upstream,
          prefix: route.prefix,
          rewritePrefix: route.prefix,
        });
      }

      app.get("/", async () => ({
        name: "Paashupatastra API Gateway",
        version: "0.1.0",
        services: routes.map((r) => r.prefix),
      }));
    },
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
