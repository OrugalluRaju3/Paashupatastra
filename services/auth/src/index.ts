import "reflect-metadata";
import { createService, envInt, loadEnv } from "@paashupatastra/service-kit";
import { OtpChallengeEntity, UserEntity, getDataSource, toIsoRequired } from "@paashupatastra/database";
import { UserRole, requestOtpSchema, verifyOtpSchema } from "@paashupatastra/shared-models";

function serializeUser(user: UserEntity) {
  return {
    id: user.id,
    phone: user.phone,
    name: user.name,
    email: user.email,
    roles: user.roles,
    isActive: user.isActive,
    createdAt: toIsoRequired(user.createdAt),
    updatedAt: toIsoRequired(user.updatedAt),
  };
}

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function deliverOtp(params: {
  phone: string;
  otp: string;
  user: UserEntity | null;
  fallbackEmail?: string;
  log: { info: (obj: unknown, msg?: string) => void; warn: (obj: unknown, msg?: string) => void };
}) {
  const notificationsUrl = (process.env.NOTIFICATIONS_URL ?? "http://localhost:3006").replace(/\/$/, "");
  const deliveredVia: string[] = [];
  const toEmail = params.user?.email ?? params.fallbackEmail;

  if (toEmail) {
    try {
      const res = await fetch(`${notificationsUrl}/v1/notifications/email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId: params.user?.id ?? null,
          toEmail,
          toPhone: params.phone,
          title: "Paashupatastra login OTP",
          body: [
            `Hello ${params.user?.name ?? "there"},`,
            "",
            `Your one-time login OTP is: ${params.otp}`,
            "",
            "This code expires in 10 minutes.",
            "If you did not request this, ignore this email.",
            "",
            "— Paashupatastra",
          ].join("\n"),
          referenceType: "otp_login",
          referenceId: params.user?.id ?? null,
        }),
      });
      if (res.ok) deliveredVia.push("email");
      else params.log.warn({ status: res.status }, "OTP email delivery failed");
    } catch (err) {
      params.log.warn({ err }, "OTP email delivery error");
    }
  }

  try {
    const res = await fetch(`${notificationsUrl}/v1/notifications/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId: params.user?.id ?? null,
        channel: "sms",
        toPhone: params.phone,
        title: "Login OTP",
        body: `Paashupatastra OTP: ${params.otp}. Valid for 10 minutes.`,
      }),
    });
    if (res.ok) deliveredVia.push("sms");
  } catch (err) {
    params.log.warn({ err }, "OTP SMS stub failed");
  }

  return deliveredVia;
}

async function main() {
  loadEnv();
  const ds = await getDataSource();
  const userRepo = ds.getRepository(UserEntity);
  const otpRepo = ds.getRepository(OtpChallengeEntity);

  await createService({
    name: "auth",
    port: envInt("AUTH_PORT", 3001),
    registerRoutes: async (app) => {
      app.post("/v1/auth/otp/request", async (request, reply) => {
        const body = requestOtpSchema.parse(request.body);
        const user = await userRepo.findOne({ where: { phone: body.phone } });

        // Signup flow sends email; block if phone/email already registered
        if (body.email) {
          if (user?.name && user.email) {
            return reply.code(409).send({
              error: {
                code: "ALREADY_REGISTERED",
                message: "This mobile is already registered. Please login instead.",
              },
            });
          }
          const emailOwner = await userRepo
            .createQueryBuilder("u")
            .where("LOWER(u.email) = :email", { email: body.email.trim().toLowerCase() })
            .getOne();
          if (emailOwner && emailOwner.phone !== body.phone) {
            return reply.code(409).send({
              error: {
                code: "DUPLICATE_EMAIL",
                message: "This email is already registered with another account.",
              },
            });
          }
        }

        const otp = generateOtp();

        await otpRepo.save(
          otpRepo.create({
            phone: body.phone,
            otp,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000),
            consumedAt: null,
          }),
        );

        const deliveredVia = await deliverOtp({
          phone: body.phone,
          otp,
          user,
          fallbackEmail: body.email,
          log: app.log,
        });

        app.log.info({ phone: body.phone, deliveredVia }, "OTP requested");

        const exposeDebug = process.env.EXPOSE_DEBUG_OTP === "true";
        const emailed = Boolean(user?.email || body.email);
        return reply.code(200).send({
          ok: true,
          message: emailed
            ? "OTP sent to your email"
            : "OTP generated — check SMS / contact admin if email is missing",
          deliveredVia,
          debugOtp: exposeDebug ? otp : undefined,
        });
      });

      app.post("/v1/auth/otp/verify", async (request, reply) => {
        const body = verifyOtpSchema.parse(request.body);
        const latest = await otpRepo
          .createQueryBuilder("o")
          .where("o.phone = :phone", { phone: body.phone })
          .andWhere("o.otp = :otp", { otp: body.otp })
          .andWhere("o.consumed_at IS NULL")
          .andWhere("o.expires_at > NOW()")
          .orderBy("o.created_at", "DESC")
          .getOne();

        if (!latest) {
          return reply.code(401).send({
            error: { code: "INVALID_OTP", message: "Invalid OTP" },
          });
        }

        latest.consumedAt = new Date();
        await otpRepo.save(latest);

        let user = await userRepo.findOne({ where: { phone: body.phone } });
        if (!user) {
          user = await userRepo.save(
            userRepo.create({
              phone: body.phone,
              name: null,
              email: null,
              roles: [UserRole.CUSTOMER],
              isActive: true,
            }),
          );
        }

        const accessToken = Buffer.from(
          JSON.stringify({ sub: user.id, roles: user.roles }),
        ).toString("base64url");

        return {
          accessToken,
          user: serializeUser(user),
        };
      });
    },
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
