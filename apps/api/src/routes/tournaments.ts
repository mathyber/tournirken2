import { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { badRequest, forbidden, notFound, parseId } from '../lib/errors';
import {
  CreateTournamentSchema,
  UpdateTournamentSchema,
  TournamentFiltersSchema,
} from '@tournirken/shared';

const TOURNAMENT_INCLUDE = {
  tournamentName: { include: { game: true } },
  organizer: { select: { id: true, login: true } },
  _count: { select: { participants: true } },
};

function formatTournament(t: any) {
  return {
    id: t.id,
    name: t.tournamentName.name,
    game: t.tournamentName.game,
    season: t.season,
    organizer: t.organizer,
    info: t.info,
    logo: t.logo,
    maxParticipants: t.maxParticipants,
    participantCount: t._count.participants,
    onlyOrganizerSetsResults: t.onlyOrganizerSetsResults,
    format: t.format,
    status: t.status,
    registrationStart: t.registrationStart,
    registrationEnd: t.registrationEnd,
    tournamentStart: t.tournamentStart,
    tournamentEnd: t.tournamentEnd,
    gridJson: t.gridJson,
    swissRounds: t.swissRounds,
    createdAt: t.createdAt,
  };
}

// Авто-переход статуса по датам (без cron)
async function syncStatusByDates(tournament: any): Promise<any> {
  if (['ACTIVE', 'FINISHED', 'CANCELLED'].includes(tournament.status)) return tournament;

  const now = new Date();
  let newStatus: string | null = null;

  if (
    tournament.status === 'DRAFT' &&
    tournament.registrationStart && now >= tournament.registrationStart &&
    (!tournament.registrationEnd || now <= tournament.registrationEnd)
  ) {
    newStatus = 'REGISTRATION';
  } else if (
    tournament.status === 'REGISTRATION' &&
    tournament.registrationEnd && now > tournament.registrationEnd
  ) {
    newStatus = 'DRAFT';
  }

  if (newStatus) {
    return prisma.tournament.update({
      where: { id: tournament.id },
      data: { status: newStatus },
      include: TOURNAMENT_INCLUDE,
    });
  }

  return tournament;
}

export default async function tournamentRoutes(fastify: FastifyInstance) {
  // GET /api/tournaments
  fastify.get('/', async (request, reply) => {
    const result = TournamentFiltersSchema.safeParse(request.query);
    if (!result.success) return badRequest(reply, 'Неверные параметры фильтрации');
    const { page, limit, name, game, status } = result.data;

    const where: any = {};
    if (status) where.status = status;

    // Case-insensitive search via LOWER() for SQLite
    const nameTrimmed = name?.trim();
    const gameTrimmed = game?.trim();
    const escapeLike = (s: string) => s.replace(/[%_\\]/g, '\\$&');
    if (nameTrimmed || gameTrimmed) {
      const conditions: Prisma.Sql[] = [];
      if (nameTrimmed) conditions.push(Prisma.sql`COALESCE(tn.nameLower, LOWER(tn.name)) LIKE ${'%' + escapeLike(nameTrimmed.toLowerCase()) + '%'} ESCAPE '\\'`);
      if (gameTrimmed) conditions.push(Prisma.sql`COALESCE(g.nameLower, LOWER(g.name)) LIKE ${'%' + escapeLike(gameTrimmed.toLowerCase()) + '%'} ESCAPE '\\'`);
      if (status) conditions.push(Prisma.sql`t.status = ${status}`);
      const whereClause = Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;
      const idsResult = await prisma.$queryRaw<{ id: number }[]>`
        SELECT t.id FROM Tournament t
        JOIN TournamentName tn ON t.nameId = tn.id
        JOIN Game g ON tn.gameId = g.id
        ${whereClause}
      `;
      where.id = { in: idsResult.map((r) => r.id) };
    }

    const [total, tournaments] = await Promise.all([
      prisma.tournament.count({ where }),
      prisma.tournament.findMany({
        where,
        include: TOURNAMENT_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return reply.send({
      data: tournaments.map(formatTournament),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  });

  // GET /api/tournaments/:id
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const id = parseId(request.params.id);
if (!id) return badRequest(reply, 'Неверный ID');

    let tournament = await prisma.tournament.findUnique({
      where: { id },
      include: TOURNAMENT_INCLUDE,
    });
    if (!tournament) return notFound(reply, 'Турнир не найден');

    tournament = await syncStatusByDates(tournament);
    return reply.send(formatTournament(tournament));
  });

  // POST /api/tournaments
  fastify.post('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const result = CreateTournamentSchema.safeParse(request.body);
    if (!result.success) return badRequest(reply, result.error.issues[0]?.message ?? 'Неверные данные');

    const { tournamentName, gameName, season, format, swissRounds, ...rest } = result.data;

    // Get or create game
    let game = await prisma.game.findUnique({ where: { name: gameName } });
    if (!game) {
      game = await prisma.game.create({ data: { name: gameName, nameLower: gameName.toLowerCase() } });
    }

    // Get or create tournament name
    let tnameRecord = await prisma.tournamentName.findUnique({
      where: { name_gameId_creatorId: { name: tournamentName, gameId: game.id, creatorId: request.userId! } },
    });
    if (!tnameRecord) {
      tnameRecord = await prisma.tournamentName.create({
        data: { name: tournamentName, nameLower: tournamentName.toLowerCase(), gameId: game.id, creatorId: request.userId! },
      });
    }

    const tournament = await prisma.tournament.create({
      data: {
        nameId: tnameRecord.id,
        organizerId: request.userId!,
        season,
        format,
        swissRounds: format === 'SWISS' ? (swissRounds ?? null) : null,
        ...rest,
        logo: rest.logo || null,
        registrationStart: rest.registrationStart ?? null,
        registrationEnd: rest.registrationEnd ?? null,
      },
      include: TOURNAMENT_INCLUDE,
    });

    return reply.status(201).send(formatTournament(tournament));
  });

  // PATCH /api/tournaments/:id
  fastify.patch<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const id = parseId(request.params.id);
if (!id) return badRequest(reply, 'Неверный ID');

      const tournament = await prisma.tournament.findUnique({ where: { id } });
      if (!tournament) return notFound(reply, 'Турнир не найден');

      const isOrganizer = tournament.organizerId === request.userId;
      const isAdmin = request.userRoles?.includes('ADMIN') || request.userRoles?.includes('MODERATOR');
      if (!isOrganizer && !isAdmin) return forbidden(reply);

      if (!['DRAFT', 'REGISTRATION'].includes(tournament.status) && !isAdmin) {
        return badRequest(reply, 'Редактирование доступно только в статусах DRAFT и REGISTRATION');
      }

      const result = UpdateTournamentSchema.safeParse(request.body);
      if (!result.success) return badRequest(reply, result.error.issues[0]?.message ?? 'Неверные данные');

      const { tournamentName, gameName, season, swissRounds, format, ...rest } = result.data;

      let updateData: any = {
        ...rest,
        logo: rest.logo !== undefined ? (rest.logo || null) : undefined,
        registrationStart: rest.registrationStart !== undefined ? (rest.registrationStart ?? null) : undefined,
        registrationEnd: rest.registrationEnd !== undefined ? (rest.registrationEnd ?? null) : undefined,
      };

      if (gameName || tournamentName) {
        let game = tournament ? await prisma.game.findUnique({ where: { id: (await prisma.tournamentName.findUnique({ where: { id: tournament.nameId } }))!.gameId } }) : null;
        if (gameName) {
          game = await prisma.game.findUnique({ where: { name: gameName } });
          if (!game) game = await prisma.game.create({ data: { name: gameName, nameLower: gameName.toLowerCase() } });
        }
        if (tournamentName && game) {
          let tnameRecord = await prisma.tournamentName.findUnique({
            where: { name_gameId_creatorId: { name: tournamentName, gameId: game.id, creatorId: request.userId! } },
          });
          if (!tnameRecord) {
            tnameRecord = await prisma.tournamentName.create({
              data: { name: tournamentName, nameLower: tournamentName.toLowerCase(), gameId: game.id, creatorId: request.userId! },
            });
          }
          updateData.nameId = tnameRecord.id;
        }
      }

      if (format !== undefined) {
        updateData.format = format;
        updateData.swissRounds = format === 'SWISS' ? (swissRounds ?? null) : null;
      }

      const updated = await prisma.tournament.update({
        where: { id },
        data: updateData,
        include: TOURNAMENT_INCLUDE,
      });

      return reply.send(formatTournament(updated));
    }
  );

  // DELETE /api/tournaments/:id
  fastify.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const id = parseId(request.params.id);
if (!id) return badRequest(reply, 'Неверный ID');

      const tournament = await prisma.tournament.findUnique({ where: { id } });
      if (!tournament) return notFound(reply, 'Турнир не найден');

      const isOrganizer = tournament.organizerId === request.userId;
      const isAdmin = request.userRoles?.includes('ADMIN') || request.userRoles?.includes('MODERATOR');

      if (!isOrganizer && !isAdmin) return forbidden(reply);
      if (isOrganizer && !isAdmin && tournament.status === 'ACTIVE') {
        return forbidden(reply, 'Нельзя отменить активный турнир');
      }

      await prisma.tournament.update({ where: { id }, data: { status: 'CANCELLED' } });
      return reply.send({ message: 'Турнир отменён' });
    }
  );

  // POST /api/tournaments/:id/join
  fastify.post<{ Params: { id: string } }>(
    '/:id/join',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const id = parseId(request.params.id);
if (!id) return badRequest(reply, 'Неверный ID');

      let tournament: any = await prisma.tournament.findUnique({
        where: { id },
        include: { _count: { select: { participants: true } }, tournamentName: true, organizer: true },
      });
      if (!tournament) return notFound(reply, 'Турнир не найден');

      // Авто-переход по датам перед проверкой
      const syncedFull = await prisma.tournament.findUnique({
        where: { id },
        include: TOURNAMENT_INCLUDE,
      });
      tournament = await syncStatusByDates(syncedFull);
      // Обновляем _count отдельно
      const count = await prisma.tournamentParticipant.count({ where: { tournamentId: id } });
      tournament._count = { participants: count };

      const now = new Date();
      if (tournament.status !== 'REGISTRATION') {
        if (tournament.registrationStart && now < tournament.registrationStart) {
          return badRequest(reply, `Регистрация откроется ${tournament.registrationStart.toLocaleString('ru-RU')}`);
        }
        if (tournament.registrationEnd && now > tournament.registrationEnd) {
          return badRequest(reply, 'Регистрация завершена');
        }
        return badRequest(reply, 'Регистрация недоступна');
      }
      if (tournament._count.participants >= tournament.maxParticipants) {
        return badRequest(reply, 'Турнир заполнен');
      }
      const existing = await prisma.tournamentParticipant.findUnique({
        where: { tournamentId_userId: { tournamentId: id, userId: request.userId! } },
      });
      if (existing) return badRequest(reply, 'Вы уже зарегистрированы');

      const participant = await prisma.tournamentParticipant.create({
        data: { tournamentId: id, userId: request.userId! },
        include: { user: { select: { id: true, login: true } } },
      });

      return reply.status(201).send(participant);
    }
  );

  // DELETE /api/tournaments/:id/leave
  fastify.delete<{ Params: { id: string } }>(
    '/:id/leave',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const id = parseId(request.params.id);
if (!id) return badRequest(reply, 'Неверный ID');

      const tournament = await prisma.tournament.findUnique({ where: { id } });
      if (!tournament) return notFound(reply, 'Турнир не найден');

      if (['ACTIVE', 'FINISHED'].includes(tournament.status)) {
        return badRequest(reply, 'Нельзя покинуть уже начавшийся турнир');
      }

      const participant = await prisma.tournamentParticipant.findUnique({
        where: { tournamentId_userId: { tournamentId: id, userId: request.userId! } },
      });
      if (!participant) return notFound(reply, 'Вы не участвуете в этом турнире');

      await prisma.tournamentParticipant.delete({ where: { id: participant.id } });
      return reply.send({ message: 'Вы покинули турнир' });
    }
  );

  // POST /api/tournaments/:id/fill-random (admin only)
  fastify.post<{ Params: { id: string } }>(
    '/:id/fill-random',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const isAdmin = request.userRoles?.includes('ADMIN') || request.userRoles?.includes('MODERATOR');
      if (!isAdmin) return forbidden(reply);

      const id = parseId(request.params.id);
if (!id) return badRequest(reply, 'Неверный ID');

      const tournament = await prisma.tournament.findUnique({
        where: { id },
        include: { _count: { select: { participants: true } } },
      });
      if (!tournament) return notFound(reply, 'Турнир не найден');
      if (tournament.status !== 'REGISTRATION') return badRequest(reply, 'Регистрация недоступна');

      const slots = tournament.maxParticipants - tournament._count.participants;
      if (slots <= 0) return badRequest(reply, 'Турнир заполнен');

      const existing = await prisma.tournamentParticipant.findMany({
        where: { tournamentId: id },
        select: { userId: true },
      });
      const existingIds = new Set(existing.map((p) => p.userId));

      const allUsers = await prisma.user.findMany({ select: { id: true } });
      const candidates = allUsers.filter((u) => !existingIds.has(u.id));

      const shuffled = candidates.sort(() => Math.random() - 0.5).slice(0, slots);
      if (shuffled.length === 0) return badRequest(reply, 'Нет доступных пользователей');

      await prisma.tournamentParticipant.createMany({
        data: shuffled.map((u) => ({ tournamentId: id, userId: u.id })),
      });

      return reply.send({ added: shuffled.length });
    }
  );

  // GET /api/tournaments/:id/participants
  fastify.get<{ Params: { id: string } }>('/:id/participants', async (request, reply) => {
    const id = parseId(request.params.id);
if (!id) return badRequest(reply, 'Неверный ID');

    const participants = await prisma.tournamentParticipant.findMany({
      where: { tournamentId: id },
      include: { user: { select: { id: true, login: true } } },
      orderBy: { joinedAt: 'asc' },
    });

    return reply.send(participants);
  });

  // GET /api/tournaments/:id/matches
  fastify.get<{ Params: { id: string } }>('/:id/matches', async (request, reply) => {
    const id = parseId(request.params.id);
if (!id) return badRequest(reply, 'Неверный ID');

    const matches = await prisma.match.findMany({
      where: { tournamentId: id },
      include: {
        stage: true,
        group: { select: { id: true, name: true } },
        player1: { include: { user: { select: { id: true, login: true } } } },
        player2: { include: { user: { select: { id: true, login: true } } } },
        winner: { include: { user: { select: { id: true, login: true } } } },
        results: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { setByUser: { select: { id: true, login: true } } },
        },
      },
      orderBy: [{ roundNumber: 'asc' }, { id: 'asc' }],
    });

    return reply.send(matches);
  });

  // POST /api/tournaments/:id/open-registration
  fastify.post<{ Params: { id: string } }>(
    '/:id/open-registration',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const id = parseId(request.params.id);
if (!id) return badRequest(reply, 'Неверный ID');

      const tournament = await prisma.tournament.findUnique({ where: { id } });
      if (!tournament) return notFound(reply, 'Турнир не найден');

      const isOrganizer = tournament.organizerId === request.userId;
      const isAdmin = request.userRoles?.includes('ADMIN') || request.userRoles?.includes('MODERATOR');
      if (!isOrganizer && !isAdmin) return forbidden(reply);

      if (tournament.status !== 'DRAFT') {
        return badRequest(reply, 'Открыть регистрацию можно только из статуса DRAFT');
      }

      const updated = await prisma.tournament.update({
        where: { id },
        data: { status: 'REGISTRATION' },
        include: TOURNAMENT_INCLUDE,
      });

      return reply.send(formatTournament(updated));
    }
  );

  // GET /api/tournaments/:id/groups
  fastify.get<{ Params: { id: string } }>('/:id/groups', async (request, reply) => {
    const id = parseId(request.params.id);
if (!id) return badRequest(reply, 'Неверный ID');

    const groups = await prisma.tournamentGroup.findMany({
      where: { tournamentId: id },
      include: {
        participants: {
          include: { participant: { include: { user: { select: { id: true, login: true } } } } },
        },
        matches: {
          include: {
            player1: { include: { user: { select: { id: true, login: true } } } },
            player2: { include: { user: { select: { id: true, login: true } } } },
            winner: { include: { user: { select: { id: true, login: true } } } },
            results: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
      },
    });

    // Calculate standings for each group
    const groupsWithStandings = groups.map((group) => {
      const standings = calculateGroupStandings(group);
      return { ...group, standings };
    });

    return reply.send(groupsWithStandings);
  });

  // GET /api/tournaments/:id/grid
  fastify.get<{ Params: { id: string } }>('/:id/grid', async (request, reply) => {
    const id = parseId(request.params.id);
if (!id) return badRequest(reply, 'Неверный ID');

    const tournament = await prisma.tournament.findUnique({
      where: { id },
      select: { gridJson: true, status: true },
    });
    if (!tournament) return notFound(reply, 'Турнир не найден');

    const [matches, groups] = await Promise.all([
      prisma.match.findMany({
        where: { tournamentId: id },
        include: {
          stage: true,
          group: { select: { id: true, name: true } },
          player1: { include: { user: { select: { id: true, login: true } } } },
          player2: { include: { user: { select: { id: true, login: true } } } },
          winner: { include: { user: { select: { id: true, login: true } } } },
          results: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
        orderBy: [{ roundNumber: 'asc' }, { id: 'asc' }],
      }),
      prisma.tournamentGroup.findMany({
        where: { tournamentId: id },
        include: {
          participants: {
            include: { participant: { include: { user: { select: { id: true, login: true } } } } },
          },
        },
      }),
    ]);

    return reply.send({ gridJson: tournament.gridJson, matches, groups });
  });
}

function calculateGroupStandings(group: any) {
  const stats: Record<number, {
    participantId: number;
    participant: any;
    wins: number;
    draws: number;
    losses: number;
    goalsFor: number;
    goalsAgainst: number;
    points: number;
  }> = {};

  // Initialize stats
  for (const gp of group.participants) {
    stats[gp.participantId] = {
      participantId: gp.participantId,
      participant: gp.participant,
      wins: 0, draws: 0, losses: 0,
      goalsFor: 0, goalsAgainst: 0, points: 0,
    };
  }

  // Process matches
  for (const match of group.matches) {
    if (!match.isFinished || !match.player1Id || !match.player2Id) continue;
    const result = match.results?.[0];
    if (!result) continue;

    const p1 = stats[match.player1Id];
    const p2 = stats[match.player2Id];
    if (!p1 || !p2) continue;

    p1.goalsFor += result.player1Score;
    p1.goalsAgainst += result.player2Score;
    p2.goalsFor += result.player2Score;
    p2.goalsAgainst += result.player1Score;

    if (result.player1Score > result.player2Score) {
      p1.wins++; p1.points += group.pointsForWin;
      p2.losses++;
    } else if (result.player1Score < result.player2Score) {
      p2.wins++; p2.points += group.pointsForWin;
      p1.losses++;
    } else {
      p1.draws++; p1.points += group.pointsForDraw;
      p2.draws++; p2.points += group.pointsForDraw;
    }
  }

  const sorted = Object.values(stats).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const diffA = a.goalsFor - a.goalsAgainst;
    const diffB = b.goalsFor - b.goalsAgainst;
    if (diffB !== diffA) return diffB - diffA;
    return b.goalsFor - a.goalsFor;
  });

  return sorted.map((s, i) => ({ rank: i + 1, ...s }));
}
