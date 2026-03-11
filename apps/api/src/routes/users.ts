import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';
import { badRequest, forbidden, notFound, unauthorized } from '../lib/errors';
import { UpdateEmailSchema, UpdatePasswordSchema } from '@tournirken/shared';

export default async function userRoutes(fastify: FastifyInstance) {
  // GET /api/users/me
  fastify.get('/me', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.userId! },
      include: { roles: true },
    });
    if (!user) return notFound(reply, 'Пользователь не найден');

    const [tournamentsPlayed, organized] = await Promise.all([
      prisma.tournamentParticipant.count({ where: { userId: user.id } }),
      prisma.tournament.count({ where: { organizerId: user.id } }),
    ]);

    const placements = await prisma.tournamentParticipant.findMany({
      where: { userId: user.id, finalResult: { not: null } },
      select: { finalResult: true },
    });
    const wins = placements.filter((p) => p.finalResult === '1').length;
    const secondPlaces = placements.filter((p) => p.finalResult === '2').length;
    const thirdPlaces = placements.filter((p) => p.finalResult === '3').length;

    return reply.send({
      id: user.id,
      login: user.login,
      email: user.email,
      createdAt: user.createdAt,
      roles: user.roles.map((r) => r.role),
      stats: { tournamentsPlayed, wins, secondPlaces, thirdPlaces, organized },
    });
  });

  // GET /api/users/me/participations — массив tournament ID
  fastify.get('/me/participations', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const participations = await prisma.tournamentParticipant.findMany({
      where: { userId: request.userId! },
      select: { tournamentId: true },
    });
    return reply.send(participations.map((p) => p.tournamentId));
  });

  // GET /api/users/:login
  fastify.get<{ Params: { login: string } }>('/:login', async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { login: request.params.login },
      include: { roles: true },
    });
    if (!user) return notFound(reply, 'Пользователь не найден');

    const [tournamentsPlayed, organized] = await Promise.all([
      prisma.tournamentParticipant.count({ where: { userId: user.id } }),
      prisma.tournament.count({ where: { organizerId: user.id } }),
    ]);

    const placements = await prisma.tournamentParticipant.findMany({
      where: { userId: user.id, finalResult: { not: null } },
      select: { finalResult: true },
    });
    const wins = placements.filter((p) => p.finalResult === '1').length;
    const secondPlaces = placements.filter((p) => p.finalResult === '2').length;
    const thirdPlaces = placements.filter((p) => p.finalResult === '3').length;

    return reply.send({
      id: user.id,
      login: user.login,
      createdAt: user.createdAt,
      roles: user.roles.map((r) => r.role),
      stats: { tournamentsPlayed, wins, secondPlaces, thirdPlaces, organized },
    });
  });

  // PATCH /api/users/me/email
  fastify.patch('/me/email', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const result = UpdateEmailSchema.safeParse(request.body);
    if (!result.success) return badRequest(reply, result.error.issues[0]?.message ?? 'Неверные данные');

    const existing = await prisma.user.findUnique({ where: { email: result.data.email } });
    if (existing && existing.id !== request.userId) {
      return badRequest(reply, 'Email уже используется');
    }

    const user = await prisma.user.update({
      where: { id: request.userId! },
      data: { email: result.data.email },
    });

    return reply.send({ email: user.email });
  });

  // PATCH /api/users/me/password
  fastify.patch('/me/password', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const result = UpdatePasswordSchema.safeParse(request.body);
    if (!result.success) return badRequest(reply, result.error.issues[0]?.message ?? 'Неверные данные');

    const user = await prisma.user.findUnique({ where: { id: request.userId! } });
    if (!user) return notFound(reply, 'Пользователь не найден');

    const valid = await bcrypt.compare(result.data.currentPassword, user.passwordHash);
    if (!valid) return badRequest(reply, 'Неверный текущий пароль');

    const passwordHash = await bcrypt.hash(result.data.newPassword, 10);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

    return reply.send({ message: 'Пароль изменён' });
  });
}
