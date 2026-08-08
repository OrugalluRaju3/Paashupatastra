import "reflect-metadata";
import { createService, envInt, loadEnv, parseEntityId } from "@paashupatastra/service-kit";
import {
  OtpChallengeEntity,
  TankerUserEntity,
  UserEntity,
  getDataSource,
  toIsoRequired,
} from "@paashupatastra/database";
import { UserRole, requestOtpSchema, verifyOtpSchema } from "@paashupatastra/shared-models";

type AuthUserLike = UserEntity | TankerUserEntity;

function serializeUser(user: AuthUserLike) {
  const parkingUser = user as UserEntity;
  return {
    id: user.id,
    phone: user.phone,
    name: user.name,
    email: user.email,
    roles: user.roles,
    isActive: user.isActive,
    deactivationReason: parkingUser.deactivationReason ?? null,
    deactivatedAt: parkingUser.deactivatedAt ? toIsoRequired(parkingUser.deactivatedAt) : null,
    createdAt: toIsoRequired(user.createdAt),
    updatedAt: toIsoRequired(user.updatedAt),
  };
}

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hasRole(roles: string[], role: string) {
  return roles.includes(role);
}

function hasAnyRole(roles: string[], wanted: string[]) {
  return wanted.some((r) => roles.includes(r));
}

function isParkingStaff(roles: string[]) {
  return hasAnyRole(roles, [
    UserRole.PARKING_SUPER_ADMIN,
    UserRole.SUPER_ADMIN,
    UserRole.VERIFICATION_MANAGER,
    UserRole.FIELD_EXECUTIVE,
  ]);
}

function isParkingSuperAdmin(roles: string[]) {
  return hasAnyRole(roles, [UserRole.PARKING_SUPER_ADMIN, UserRole.SUPER_ADMIN]);
}

type LoginGate =
  | { ok: true }
  | { ok: false; code: string; message: string; statusCode: number };

/**
 * Reject login when phone exists but selected portal/intent does not match roles.
 * Signup skips this (roles are assigned after verify).
 */
function gateLoginAccess(input: {
  module: "parking" | "tanker";
  portal?: string;
  intent?: string;
  roles: string[];
  isActive: boolean;
  deactivationReason?: string | null;
}): LoginGate {
  if (!input.isActive) {
    const reason = input.deactivationReason?.trim();
    return {
      ok: false,
      statusCode: 403,
      code: "ACCOUNT_DISABLED",
      message: reason
        ? `Your account is inactive. Reason: ${reason}. Contact Parking Super Admin to reactivate.`
        : "Your account is inactive. Contact support or Parking Super Admin to reactivate.",
    };
  }

  if (!input.portal || !input.intent) {
    return {
      ok: false,
      statusCode: 400,
      code: "INTENT_REQUIRED",
      message: "Select a role to continue login",
    };
  }

  const { module, portal, intent, roles } = input;

  if (portal === "staff") {
    if (module === "parking") {
      if (!isParkingStaff(roles)) {
        return {
          ok: false,
          statusCode: 403,
          code: "ROLE_MISMATCH",
          message:
            "This mobile is not registered as parking staff. Use Customer/Owner login, or ask Parking Super Admin to add a staff role.",
        };
      }
      if (intent === "parking_super_admin" && !isParkingSuperAdmin(roles)) {
        return {
          ok: false,
          statusCode: 403,
          code: "ROLE_MISMATCH",
          message: "This mobile does not have Parking Super Admin access.",
        };
      }
      if (
        (intent === "verification_manager" || intent === "field_executive") &&
        !hasRole(roles, intent) &&
        !isParkingSuperAdmin(roles)
      ) {
        return {
          ok: false,
          statusCode: 403,
          code: "ROLE_MISMATCH",
          message: `This mobile does not have ${intent.replaceAll("_", " ")} access.`,
        };
      }
      return { ok: true };
    }

    if (!hasRole(roles, UserRole.TANKER_SUPER_ADMIN)) {
      return {
        ok: false,
        statusCode: 403,
        code: "ROLE_MISMATCH",
        message: "This mobile is not registered as tanker staff.",
      };
    }
    if (intent === "tanker_super_admin" && !hasRole(roles, UserRole.TANKER_SUPER_ADMIN)) {
      return {
        ok: false,
        statusCode: 403,
        code: "ROLE_MISMATCH",
        message: "This mobile does not have Tanker Super Admin access.",
      };
    }
    return { ok: true };
  }

  // public portal
  if (module === "parking") {
    if (intent === "owner") {
      if (!hasRole(roles, UserRole.PARKING_OWNER)) {
        return {
          ok: false,
          statusCode: 403,
          code: "ROLE_MISMATCH",
          message: "This mobile is not registered as a parking owner. Sign up as Owner first.",
        };
      }
      return { ok: true };
    }
    if (intent === "customer") {
      if (!hasRole(roles, UserRole.CUSTOMER)) {
        return {
          ok: false,
          statusCode: 403,
          code: "ROLE_MISMATCH",
          message:
            "This mobile is not registered as a parking customer. Sign up first, or use Owner login if you are an owner.",
        };
      }
      return { ok: true };
    }
    return {
      ok: false,
      statusCode: 400,
      code: "INVALID_INTENT",
      message: "Use Tanker login for supplier/driver roles.",
    };
  }

  // tanker public
  if (intent === "supplier") {
    if (!hasRole(roles, UserRole.TANKER_SUPPLIER)) {
      return {
        ok: false,
        statusCode: 403,
        code: "ROLE_MISMATCH",
        message: "This mobile is not registered as a tanker supplier. Sign up as Supplier first.",
      };
    }
    return { ok: true };
  }
  if (intent === "customer") {
    if (!hasRole(roles, UserRole.CUSTOMER)) {
      return {
        ok: false,
        statusCode: 403,
        code: "ROLE_MISMATCH",
        message: "This mobile is not registered as a tanker customer. Sign up first.",
      };
    }
    return { ok: true };
  }
  if (intent === "driver") {
    // Driver may claim role after OTP if supplier already listed this phone on a vehicle.
    // Phone must at least exist in tanker_users (enforced by caller). Role claim is frontend.
    return { ok: true };
  }
  return {
    ok: false,
    statusCode: 400,
    code: "INVALID_INTENT",
    message: "Use Parking login for owner roles.",
  };
}

async function deliverOtp(params: {
  phone: string;
  otp: string;
  user: AuthUserLike | null;
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
  const tankerUserRepo = ds.getRepository(TankerUserEntity);
  const otpRepo = ds.getRepository(OtpChallengeEntity);

  await createService({
    name: "auth",
    port: envInt("AUTH_PORT", 3001),
    registerRoutes: async (app) => {
      app.post("/v1/auth/otp/request", async (request, reply) => {
        const body = requestOtpSchema.parse(request.body);
        const module = body.module;
        const purpose = body.purpose ?? "login";
        const isLogin = purpose === "login";

        if (module === "tanker") {
          const user = await tankerUserRepo.findOne({ where: { phone: body.phone } });

          if (isLogin) {
            if (!user) {
              return reply.code(404).send({
                error: {
                  code: "USER_NOT_FOUND",
                  message:
                    "This mobile is not registered for Tanker. Sign up first, or check the number.",
                },
              });
            }
            const gate = gateLoginAccess({
              module: "tanker",
              portal: body.portal,
              intent: body.intent,
              roles: user.roles ?? [],
              isActive: user.isActive,
            });
            if (!gate.ok) {
              return reply.code(gate.statusCode).send({
                error: { code: gate.code, message: gate.message },
              });
            }
          }

          if (body.email) {
          if (user?.name && user.email) {
            return reply.code(409).send({
              error: {
                code: "ALREADY_REGISTERED",
                message: "This mobile is already registered. Please login instead.",
              },
            });
          }
          const emailOwner = await tankerUserRepo
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
            module: "tanker",
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

        app.log.info({ phone: body.phone, module, purpose, deliveredVia }, "OTP requested");

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
      }

      const user = await userRepo.findOne({ where: { phone: body.phone } });

      if (isLogin) {
        if (!user) {
          return reply.code(404).send({
            error: {
              code: "USER_NOT_FOUND",
              message:
                "This mobile is not registered for Parking. Sign up first, or check the number.",
            },
          });
        }
        const gate = gateLoginAccess({
          module: "parking",
          portal: body.portal,
          intent: body.intent,
          roles: user.roles ?? [],
          isActive: user.isActive,
          deactivationReason: user.deactivationReason,
        });
        if (!gate.ok) {
          return reply.code(gate.statusCode).send({
            error: { code: gate.code, message: gate.message },
          });
        }
      }

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
            module: "parking",
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

        app.log.info({ phone: body.phone, module, purpose, deliveredVia }, "OTP requested");

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
        const module = body.module;
        const purpose = body.purpose ?? "login";
        const isLogin = purpose === "login";

        const latest = await otpRepo
          .createQueryBuilder("o")
          .where("o.phone = :phone", { phone: body.phone })
          .andWhere("o.module = :module", { module })
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

        if (module === "tanker") {
          let user = await tankerUserRepo.findOne({ where: { phone: body.phone } });

          if (isLogin) {
            if (!user) {
              return reply.code(404).send({
                error: {
                  code: "USER_NOT_FOUND",
                  message: "This mobile is not registered for Tanker.",
                },
              });
            }
            const gate = gateLoginAccess({
              module: "tanker",
              portal: body.portal,
              intent: body.intent,
              roles: user.roles ?? [],
              isActive: user.isActive,
            });
            if (!gate.ok) {
              return reply.code(gate.statusCode).send({
                error: { code: gate.code, message: gate.message },
              });
            }
          } else if (!user) {
            user = await tankerUserRepo.save(
              tankerUserRepo.create({
                phone: body.phone,
                name: null,
                email: null,
                roles: [],
                isActive: true,
              }),
            );
          }

          const accessToken = Buffer.from(
            JSON.stringify({ sub: String(user!.id), roles: user!.roles, module: "tanker" }),
          ).toString("base64url");

          return {
            accessToken,
            user: serializeUser(user!),
          };
        }

        let user = await userRepo.findOne({ where: { phone: body.phone } });

        if (isLogin) {
          if (!user) {
            return reply.code(404).send({
              error: {
                code: "USER_NOT_FOUND",
                message: "This mobile is not registered for Parking.",
              },
            });
          }
          const gate = gateLoginAccess({
            module: "parking",
            portal: body.portal,
            intent: body.intent,
            roles: user.roles ?? [],
            isActive: user.isActive,
            deactivationReason: user.deactivationReason,
          });
          if (!gate.ok) {
            return reply.code(gate.statusCode).send({
              error: { code: gate.code, message: gate.message },
            });
          }
        } else if (!user) {
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
          JSON.stringify({ sub: String(user!.id), roles: user!.roles, module: "parking" }),
        ).toString("base64url");

        return {
          accessToken,
          user: serializeUser(user!),
        };
      });

      app.post("/v1/auth/token/refresh", async (request, reply) => {
        const authHeader = request.headers.authorization;
        if (!authHeader?.startsWith("Bearer ")) {
          return reply.code(401).send({
            error: { code: "UNAUTHORIZED", message: "Bearer token required" },
          });
        }

        const token = authHeader.slice("Bearer ".length);
        let payload: { sub?: string; module?: string };
        try {
          payload = JSON.parse(Buffer.from(token, "base64url").toString("utf8")) as {
            sub?: string;
            module?: string;
          };
        } catch {
          return reply.code(401).send({
            error: { code: "INVALID_TOKEN", message: "Invalid token" },
          });
        }

        if (!payload.sub) {
          return reply.code(401).send({
            error: { code: "INVALID_TOKEN", message: "Invalid token payload" },
          });
        }

        if (payload.module === "tanker") {
          const user = await tankerUserRepo.findOne({ where: { id: parseEntityId(payload.sub) } });
          if (!user || !user.isActive) {
            return reply.code(401).send({
              error: { code: "UNAUTHORIZED", message: "User not found" },
            });
          }

          const accessToken = Buffer.from(
            JSON.stringify({ sub: String(user.id), roles: user.roles, module: "tanker" }),
          ).toString("base64url");

          return { accessToken, user: serializeUser(user) };
        }

        const user = await userRepo.findOne({ where: { id: parseEntityId(payload.sub) } });
        if (!user || !user.isActive) {
          return reply.code(401).send({
            error: { code: "UNAUTHORIZED", message: "User not found" },
          });
        }

        const accessToken = Buffer.from(
          JSON.stringify({ sub: String(user.id), roles: user.roles, module: "parking" }),
        ).toString("base64url");

        return { accessToken, user: serializeUser(user) };
      });
    },
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
