import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma';
import { badRequest, forbidden, notFound, parseId } from '../lib/errors';
import { UpdateUserRolesSchema } from '@tournirken/shared';

function requireRole(roles: string[] | undefined, ...required: string[]) {
  return roles?.some((r) => required.includes(r)) ?? false;
}

export default async function adminRoutes(fastify: FastifyInstance) {
  // GET /api/admin/users
  fastify.get('/users', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (!requireRole(request.userRoles, 'ADMIN', 'MODERATOR')) return forbidden(reply);

    const users = await prisma.user.findMany({
      include: { roles: true },
      orderBy: { createdAt: 'desc' },
    });

    return reply.send(
      users.map((u) => ({
        id: u.id,
        login: u.login,
        email: u.email,
        createdAt: u.createdAt,
        roles: u.roles.map((r) => r.role),
      }))
    );
  });

  // PATCH /api/admin/users/:id/roles
  fastify.patch<{ Params: { id: string } }>(
    '/users/:id/roles',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      if (!requireRole(request.userRoles, 'ADMIN')) return forbidden(reply, 'Только администратор может менять роли');

      const id = parseId(request.params.id);
if (!id) return badRequest(reply, 'Неверный ID');

      const result = UpdateUserRolesSchema.safeParse(request.body);
      if (!result.success) return badRequest(reply, 'Неверные данные');

      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) return notFound(reply, 'Пользователь не найден');

      // Replace all roles
      await prisma.userRole.deleteMany({ where: { userId: id } });
      await prisma.userRole.createMany({
        data: result.data.roles.map((role) => ({ userId: id, role })),
      });

      const updated = await prisma.user.findUnique({ where: { id }, include: { roles: true } });
      return reply.send({
        id: updated!.id,
        login: updated!.login,
        email: updated!.email,
        roles: updated!.roles.map((r) => r.role),
      });
    }
  );

  // DELETE /api/admin/tournaments/:id
  fastify.delete<{ Params: { id: string } }>(
    '/tournaments/:id',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      if (!requireRole(request.userRoles, 'ADMIN', 'MODERATOR')) return forbidden(reply);

      const id = parseId(request.params.id);
if (!id) return badRequest(reply, 'Неверный ID');

      const tournament = await prisma.tournament.findUnique({ where: { id } });
      if (!tournament) return notFound(reply, 'Турнир не найден');

      await prisma.tournament.update({ where: { id }, data: { status: 'CANCELLED' } });
      return reply.send({ message: 'Турнир отменён' });
    }
  );
}
