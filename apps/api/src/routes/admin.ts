import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma';
import { badRequest, forbidden, notFound, parseId } from '../lib/errors';
import { UpdateUserRolesSchema } from '@tournirken/shared';

function requireRole(roles: string[] | undefined, ...required: string[]) {
  return roles?.some((r) => required.includes(r)) ?? false;
}

export default async function adminRoutes(fastify: FastifyInstance) {
  // GET /api/admin/users?search=&page=1&limit=20
  fastify.get('/users', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (!requireRole(request.userRoles, 'ADMIN', 'MODERATOR')) return forbidden(reply);

    const { search = '', page = '1', limit = '20' } = request.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};
    if (search.trim()) {
      const escapeLike = (s: string) => s.replace(/[%_\\]/g, '\\$&');
      const pattern = '%' + escapeLike(search.trim().toLowerCase()) + '%';
      const idsResult = await prisma.$queryRaw<{ id: number }[]>`
        SELECT id FROM User
        WHERE LOWER(login) LIKE ${pattern} ESCAPE '\\'
           OR LOWER(COALESCE(email, '')) LIKE ${pattern} ESCAPE '\\'
      `;
      where.id = { in: idsResult.map((r) => r.id) };
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: { roles: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.user.count({ where }),
    ]);

    return reply.send({
      items: users.map((u) => ({
        id: u.id,
        login: u.login,
        email: u.email,
        createdAt: u.createdAt,
        roles: u.roles.map((r) => r.role),
      })),
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
    });
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

  // GET /api/admin/tournaments?search=&page=1&limit=20
  fastify.get('/tournaments', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (!requireRole(request.userRoles, 'ADMIN', 'MODERATOR')) return forbidden(reply);

    const { search = '', page = '1', limit = '20' } = request.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};
    if (search.trim()) {
      const escapeLike = (s: string) => s.replace(/[%_\\]/g, '\\$&');
      const pattern = '%' + escapeLike(search.trim().toLowerCase()) + '%';
      const idsResult = await prisma.$queryRaw<{ id: number }[]>`
        SELECT t.id FROM Tournament t
        JOIN TournamentName tn ON t.nameId = tn.id
        WHERE COALESCE(tn.nameLower, LOWER(tn.name)) LIKE ${pattern} ESCAPE '\\'
      `;
      where.id = { in: idsResult.map((r) => r.id) };
    }

    const INCLUDE = {
      tournamentName: { include: { game: true } },
      organizer: { select: { login: true } },
    };

    const [tournaments, total] = await Promise.all([
      prisma.tournament.findMany({
        where,
        include: INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.tournament.count({ where }),
    ]);

    return reply.send({
      items: tournaments.map((t) => ({
        id: t.id,
        name: t.tournamentName.name,
        game: t.tournamentName.game,
        season: t.season,
        organizer: t.organizer,
        status: t.status,
        createdAt: t.createdAt,
      })),
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
    });
  });

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
