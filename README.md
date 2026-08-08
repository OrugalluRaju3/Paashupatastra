# Paashupatastra

Community services super app — parking marketplace first, then water, home services, community, and more.

**Stack:** Node.js · Fastify microservices · `@paashupatastra/shared-models` · PostgreSQL · Redis · React admin · Flutter mobile

## Monorepo layout

```
paashupatastra/
├── apps/
│   ├── admin/          # React admin panel
│   └── mobile/         # Flutter (scaffold next)
├── packages/
│   ├── shared-models/  # Zod schemas + TS types (npm scope)
│   └── service-kit/    # Fastify bootstrap helpers
├── services/
│   ├── gateway/        # :3000
│   ├── auth/           # :3001
│   ├── users/          # :3002
│   ├── communities/    # :3003
│   ├── parking/        # :3004
│   ├── payments/       # :3005
│   └── notifications/  # :3006
└── docker-compose.yml  # Postgres + Redis
```

## Phase roadmap

| Phase | Focus | Goal |
|-------|--------|------|
| **0** | Auth, users, communities | Login + belong to an apartment |
| **1** | Parking MVP | List, approve, book, pay, QR/OTP check-in in 1 apartment |
| **2** | Trust + nearby search | KYC, guard verify, map radius |
| **3** | Water tanker | Second marketplace on same core |
| **4+** | Home services → community → delivery → ERP → schools | Expand after pilot proof |

## Quick start

```bash
# 1) Create Postgres role + database (one-time)
# Use your local Postgres superuser password:
$env:PGPASSWORD="YOUR_POSTGRES_PASSWORD"
npm run db:init

# 2) Install + build shared packages (TypeORM entities sync on service start when TYPEORM_SYNC=true)
npm install
npm run build:shared

# 3) Run services
.\scripts\dev-services.cmd

# 4) Admin UI
npm run dev:admin
```

All apartments, parking slots, bookings, users, and OTPs are stored in Postgres via TypeORM (no hardcoded lists).

### Parking V1.0 workflow (implemented)
1. Owner OTP login → submit owner application (docs + bank + parking)
2. Status `pending_verification` → assign **Field Executive**
3. Field report → `manager_review` / `needs_info` / `rejected`
4. Manager **approve** → listing `approved` + active
5. Customer search → quote → book → collect payment (platform wallet)
6. OTP check-in → check-out → settle (owner wallet − commission)

Admin pages: Dashboard, Owner listings, Verification, Users & staff, Commission, Bookings.

### Water tanker V1 (ported into monorepo)
Source concepts from [Tanker_Backend](https://github.com/OrugalluRaju3/Tanker_Backend) + [Tanker_Web](https://github.com/OrugalluRaju3/Tanker_Web), rewritten for this boilerplate (Fastify + Postgres/TypeORM + React admin — not Express/Angular).

**Service:** `services/tanker` on `:3007` → gateway `/v1/tanker`

**Core flows implemented:**
1. Supplier OTP signup (`intent=supplier`) → create supplier profile → add tankers/drivers
2. Customer requests water / browses nearby online suppliers
3. Supplier accept/reject request → order + delivery OTP
4. Order status updates through delivery; staff console lists suppliers/vehicles/orders

**Still to port from old tanker apps (next iterations):** invoices PDF, promo codes, tax settings UI, Cashfree checkout for tanker orders, live socket driver tracking, S3 image uploads (use existing `/users/uploads` for now), Angular-only screens not yet mirrored 1:1.

### Database
- Connection: `DATABASE_URL` in `.env`
- Dev schema sync: `TYPEORM_SYNC=true`
- Entities: `packages/database`
- Reference SQL: `scripts/schema.sql`

Gateway: `http://localhost:3000`  
Health: `http://localhost:3000/health` (gateway) or each service `/health`

### Dev OTP
Use phone `9876543210` and OTP `123456` against `POST /v1/auth/otp/request` and `/v1/auth/otp/verify`.

## Shared models (npmrc)

Local workspaces publish as `@paashupatastra/*`.  
Later, point `.npmrc` at your private registry (GitHub Packages / Verdaccio / npm org).

## Next build steps
1. Postgres schemas + migrations per service (or shared DB with service-owned schemas)
2. Real JWT in auth + gateway verification
3. Wire parking → payments → notifications
4. Flutter resident app shell + parking screens
5. React admin: apartments + slot approvals
