import type { FastifyInstance } from "fastify";
import type { UsersRepository } from "../persistence/index.js";

/** Route quản trị — chỉ role "admin" gọi được (docs: "trang quản lý admin"). */
export function registerAdminRoutes(app: FastifyInstance, deps: { usersRepository: UsersRepository }): void {
  const guard = { preHandler: [app.authenticate, app.requireAdmin] };

  app.get("/api/admin/users", guard, async () => {
    const list = await deps.usersRepository.list();
    return list.map((u) => ({
      id: u.id,
      email: u.email,
      role: u.role,
      tiktokUsername: u.tiktokUsername,
      disabledAt: u.disabledAt,
      createdAt: u.createdAt,
    }));
  });

  app.post("/api/admin/users/:id/disable", guard, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (id === req.user.id) {
      reply.code(400);
      return { error: "Không thể tự vô hiệu hoá chính tài khoản admin đang đăng nhập" };
    }
    await deps.usersRepository.setDisabled(id, true);
    return { ok: true };
  });

  app.post("/api/admin/users/:id/enable", guard, async (req) => {
    const { id } = req.params as { id: string };
    await deps.usersRepository.setDisabled(id, false);
    return { ok: true };
  });
}
