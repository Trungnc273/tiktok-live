import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { UsersRepository } from "../persistence/index.js";
import { hashPassword, verifyPassword } from "./password.js";
import { clearAuthCookie, setAuthCookie } from "./auth-plugin.js";

const credentialsSchema = z.object({
  email: z.string().email(),
  // Đăng ký kiểu đơn giản theo yêu cầu người dùng: không xác minh email, chỉ cần
  // mật khẩu tối thiểu 6 ký tự để tránh mật khẩu rỗng/quá yếu.
  password: z.string().min(6),
});

function toPublicUser(user: { id: string; email: string; role: string }) {
  return { id: user.id, email: user.email, role: user.role };
}

export function registerAuthRoutes(
  app: FastifyInstance,
  deps: { usersRepository: UsersRepository; secureCookie: boolean },
): void {
  app.post("/api/auth/register", async (req, reply) => {
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "Email hoặc mật khẩu không hợp lệ (mật khẩu tối thiểu 6 ký tự)" };
    }

    const existing = await deps.usersRepository.findByEmail(parsed.data.email);
    if (existing) {
      reply.code(409);
      return { error: "Email này đã được đăng ký" };
    }

    // Người đăng ký ĐẦU TIÊN của hệ thống tự động là admin (đã thống nhất với người dùng).
    const isFirstUser = (await deps.usersRepository.countAll()) === 0;
    const passwordHash = await hashPassword(parsed.data.password);
    const user = await deps.usersRepository.create({
      email: parsed.data.email,
      passwordHash,
      role: isFirstUser ? "admin" : "user",
    });

    const token = await reply.jwtSign({ id: user.id, email: user.email, role: user.role });
    setAuthCookie(reply, token, deps.secureCookie);
    reply.code(201);
    return toPublicUser(user);
  });

  app.post("/api/auth/login", async (req, reply) => {
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "Email hoặc mật khẩu không hợp lệ" };
    }

    const user = await deps.usersRepository.findByEmail(parsed.data.email);
    // Cố ý dùng CHUNG 1 thông báo lỗi cho "không tồn tại" và "sai mật khẩu" —
    // tránh lộ thông tin email nào đã đăng ký (user enumeration).
    const genericError = { error: "Sai email hoặc mật khẩu" };

    if (!user || user.disabledAt) {
      reply.code(401);
      return genericError;
    }

    const validPassword = await verifyPassword(parsed.data.password, user.passwordHash);
    if (!validPassword) {
      reply.code(401);
      return genericError;
    }

    const token = await reply.jwtSign({ id: user.id, email: user.email, role: user.role });
    setAuthCookie(reply, token, deps.secureCookie);
    return toPublicUser(user);
  });

  app.post("/api/auth/logout", async (_req, reply) => {
    clearAuthCookie(reply);
    return { ok: true };
  });

  app.get("/api/auth/me", { preHandler: app.authenticate }, async (req) => {
    const user = await deps.usersRepository.findById(req.user.id);
    if (!user) return null;
    return { ...toPublicUser(user), tiktokUsername: user.tiktokUsername };
  });

  app.put("/api/auth/tiktok-username", { preHandler: app.authenticate }, async (req, reply) => {
    const parsed = z.object({ tiktokUsername: z.string().min(1).max(100).nullable() }).safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "tiktokUsername không hợp lệ" };
    }
    await deps.usersRepository.setTiktokUsername(req.user.id, parsed.data.tiktokUsername);
    return { ok: true };
  });
}
