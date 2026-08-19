import fastifyCookie from "@fastify/cookie";
import fastifyJwt from "@fastify/jwt";
import jwt from "jsonwebtoken";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

export interface JwtUserPayload {
  id: string;
  email: string;
  role: "admin" | "user";
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

// Cách chuẩn @fastify/jwt tài liệu hoá để type `req.user`/payload sign — KHÔNG tự
// khai báo lại `FastifyRequest.user` (sẽ đụng độ với khai báo sẵn có của plugin).
declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtUserPayload;
    user: JwtUserPayload;
  }
}

export interface AuthPluginOptions {
  jwtSecret: string;
  /** Cookie chỉ gửi qua HTTPS — bật khi deploy production thật (không phải localhost). */
  secureCookie: boolean;
}

/**
 * Auth bằng JWT lưu trong cookie httpOnly (docs trao đổi với người dùng: đăng nhập
 * email/mật khẩu đơn giản, không cần dịch vụ ngoài, không cần session store riêng).
 * KHÔNG dùng localStorage cho token — httpOnly cookie tránh lộ token qua XSS.
 */
export async function registerAuthPlugin(app: FastifyInstance, options: AuthPluginOptions): Promise<void> {
  await app.register(fastifyCookie);
  await app.register(fastifyJwt, {
    secret: options.jwtSecret,
    cookie: { cookieName: "token", signed: false },
  });

  app.decorate("authenticate", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      reply.code(401).send({ error: "Chưa đăng nhập hoặc phiên đăng nhập đã hết hạn" });
    }
  });

  app.decorate("requireAdmin", async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.user?.role !== "admin") {
      reply.code(403).send({ error: "Chỉ admin mới có quyền thực hiện thao tác này" });
    }
  });
}

export function setAuthCookie(reply: FastifyReply, token: string, secureCookie: boolean): void {
  reply.setCookie("token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookie,
    path: "/",
    maxAge: 7 * 24 * 60 * 60, // 7 ngày
  });
}

export function clearAuthCookie(reply: FastifyReply): void {
  reply.clearCookie("token", { path: "/" });
}

/**
 * Verify JWT ĐỘC LẬP với Fastify — dùng cho `OverlayGateway` (Socket.IO, không
 * phải Fastify request) khi xác thực namespace "/dashboard" qua cookie thô trong
 * WebSocket handshake. `@fastify/jwt` ký token chuẩn HS256, `jsonwebtoken.verify()`
 * đọc lại được với cùng secret — không cần phụ thuộc instance Fastify.
 */
export function verifyJwtToken(secret: string, token: string): JwtUserPayload | null {
  try {
    return jwt.verify(token, secret) as JwtUserPayload;
  } catch {
    return null;
  }
}
