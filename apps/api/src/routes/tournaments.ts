import { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { badRequest, forbidden, notFound, parseId } from '../lib/errors';
import {
  CreateTournamentSchema,
  UpdateTournamentSchema,
  TournamentFiltersSchema,
} from '@tournirken/shared';
import { autoAdvanceCustomBye, buildRoundRobinSchedule } from '../services/brackets';

const CopyTournamentSchema = z.object({
  newName: z.string().min(1),
});

/**
 * Parse a ReactFlow handle id like "input-1" or "input-2" into a 1-indexed slot number.
 * The frontend uses 1-indexed handles (input-1 = slot 1, input-2 = slot 2).
 * If the handle is 0-indexed (input-0 = slot 1), we convert it correctly.
 * Falls back to slot 1 for any unrecognised input.
 */
function parseInputSlot(handle: string | null | undefined): number {
  if (!handle) return 1;
  const num = parseInt(handle.replace(/[^0-9]/g, ''));
  if (isNaN(num)) return 1;
  // 0-indexed: 0 → slot 1, 1 → slot 2
  // 1-indexed: 1 → slot 1, 2 → slot 2
  // The frontend uses 1-indexed, but we handle both safely:
  // If num is 0, it must be 0-indexed first slot → slot 1.
  // Otherwise keep num as-is (1 stays 1, 2 stays 2).
  return num === 0 ? 1 : num;
}

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
    customSchema: t.customSchema,
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

  // POST /api/tournaments/:id/copy
  fastify.post<{ Params: { id: string } }>(
    '/:id/copy',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const id = parseId(request.params.id);
      if (!id) return badRequest(reply, 'Неверный ID');

      const result = CopyTournamentSchema.safeParse(request.body);
      if (!result.success) return badRequest(reply, result.error.issues[0]?.message ?? 'Неверные данные');
      const { newName } = result.data;

      const tournament = await prisma.tournament.findUnique({
        where: { id },
        include: { tournamentName: true },
      });
      if (!tournament) return notFound(reply, 'Турнир не найден');

      const isOrganizer = tournament.organizerId === request.userId;
      if (!isOrganizer) return forbidden(reply);

      // Copy tournament, but strip participants, results and all date fields.
      // Keep basic settings + schema/grid if present.

      const game = await prisma.game.findUnique({ where: { id: tournament.tournamentName.gameId } });
      if (!game) return badRequest(reply, 'Игра не найдена');

      let copiedNameRecord = await prisma.tournamentName.findUnique({
        where: { name_gameId_creatorId: { name: newName, gameId: game.id, creatorId: request.userId! } },
      });
      if (!copiedNameRecord) {
        copiedNameRecord = await prisma.tournamentName.create({
          data: {
            name: newName,
            nameLower: newName.toLowerCase(),
            gameId: game.id,
            creatorId: request.userId!,
          },
        });
      }

      const copied = await prisma.tournament.create({
        data: {
          nameId: copiedNameRecord.id,
          organizerId: request.userId!,
          season: tournament.season,
          format: tournament.format,
          maxParticipants: tournament.maxParticipants,
          onlyOrganizerSetsResults: tournament.onlyOrganizerSetsResults,
          info: tournament.info,
          logo: tournament.logo,
          swissRounds: tournament.swissRounds,
          customSchema: tournament.customSchema,
          gridJson: tournament.gridJson,
          // Dates cleared so the new tournament is fresh
          registrationStart: null,
          registrationEnd: null,
          tournamentStart: null,
          tournamentEnd: null,
          status: 'DRAFT',
        },
        include: TOURNAMENT_INCLUDE,
      });

      return reply.status(201).send(formatTournament(copied));
    }
  );

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

  // POST /api/tournaments/:id/custom-schema
  fastify.post<{ Params: { id: string } }>(
    '/:id/custom-schema',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const id = parseId(request.params.id);
      if (!id) return badRequest(reply, 'Неверный ID');

      const tournament = await prisma.tournament.findUnique({ where: { id } });
      if (!tournament) return notFound(reply, 'Турнир не найден');

      const isOrganizer = tournament.organizerId === request.userId;
      const isAdmin = request.userRoles?.includes('ADMIN') || request.userRoles?.includes('MODERATOR');
      if (!isOrganizer && !isAdmin) return forbidden(reply);

      if (tournament.format !== 'CUSTOM') {
        return badRequest(reply, 'Эта операция доступна только для турниров формата CUSTOM');
      }
      if (!['DRAFT', 'REGISTRATION'].includes(tournament.status)) {
        return badRequest(reply, 'Схему можно сохранять только в статусах DRAFT и REGISTRATION');
      }

      const { nodes, edges } = request.body as { nodes: any[]; edges: any[] };
      if (!Array.isArray(nodes) || !Array.isArray(edges)) {
        return badRequest(reply, 'Необходимо передать nodes и edges');
      }

      const schemaJson = JSON.stringify({ nodes, edges });
      const updated = await prisma.tournament.update({
        where: { id },
        data: { customSchema: schemaJson },
        include: TOURNAMENT_INCLUDE,
      });

      return reply.send({ ...formatTournament(updated), customSchema: schemaJson });
    }
  );

  // POST /api/tournaments/:id/custom-finalize
  fastify.post<{ Params: { id: string } }>(
    '/:id/custom-finalize',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const id = parseId(request.params.id);
      if (!id) return badRequest(reply, 'Неверный ID');

      const tournament = await prisma.tournament.findUnique({
        where: { id },
        include: { participants: { include: { user: { select: { id: true, login: true } } } } },
      });
      if (!tournament) return notFound(reply, 'Турнир не найден');

      const isOrganizer = tournament.organizerId === request.userId;
      const isAdmin = request.userRoles?.includes('ADMIN') || request.userRoles?.includes('MODERATOR');
      if (!isOrganizer && !isAdmin) return forbidden(reply);

      if (!tournament.customSchema) {
        return badRequest(reply, 'Сначала сохраните схему турнира');
      }
      if (tournament.status === 'ACTIVE' || tournament.status === 'FINISHED') {
        return badRequest(reply, 'Турнир уже запущен');
      }

      const { nodes, edges } = JSON.parse(tournament.customSchema);

      const matchNodes = nodes.filter((n: any) => n.type === 'match');
      const groupNodes = nodes.filter((n: any) => n.type === 'group');
      const finalNodes = nodes.filter((n: any) => n.type === 'final');
      if (matchNodes.length === 0 && groupNodes.length === 0) {
        return reply.status(400).send({ error: 'Схема должна содержать хотя бы один матч' });
      }
      if (finalNodes.length === 0) {
        return reply.status(400).send({ error: 'Схема должна содержать узел «Победитель»' });
      }

      const participants = tournament.participants;
      // Shuffle participants for random seeding
      const shuffled = [...participants].sort(() => Math.random() - 0.5);
      const startNodes = nodes.filter((n: any) => n.type === 'start');

      // Create a Stage for CUSTOM matches
      const stage = await prisma.stage.upsert({
        where: { name: 'Кастомная сетка' },
        update: {},
        create: { name: 'Кастомная сетка' },
      });

      // Create a Stage for CUSTOM group-stage matches
      const groupStage = groupNodes.length > 0
        ? await prisma.stage.upsert({
            where: { name: 'Кастомный групповой этап' },
            update: {},
            create: { name: 'Кастомный групповой этап' },
          })
        : null;

      // Map nodeId -> DB matchId for MatchNodes
      const nodeIdToMatchId = new Map<string, number>();
      // Map nodeId -> DB groupId for GroupNodes
      const nodeIdToGroupId = new Map<string, number>();
      // Map groupId -> size (from schema)
      const customGroupSizes: Record<number, number> = {};
      // Map groupId -> expected participant count based on connected inputs
      const customGroupExpectedCounts: Record<number, number> = {};

      // ── Step 1: Create MatchNode records (without links yet) ───────────────
      for (const mn of matchNodes as any[]) {
        const match = await prisma.match.create({
          data: {
            tournamentId: id,
            stageId: stage.id,
            roundNumber: mn.data?.round ?? 1,
          },
        });
        nodeIdToMatchId.set(mn.id, match.id);
      }

      // ── Step 2: Create TournamentGroup + GroupParticipant + GroupMatch records ──
      // For each GroupNode, gather which StartNode participants connect to it (via
      // participant-type edges), create the group, assign members, and generate
      // round-robin matches between all group members.
      for (const gn of groupNodes as any[]) {
        const groupSize: number = gn.data?.size ?? 4;

        // Determine how many participants are реально подключены к группе (по входящим ребрам)
        const incomingEdges = edges.filter((e: any) => e.target === gn.id);
        const incomingSlots = new Set<number>();
        for (const e of incomingEdges) {
          const slot = parseInputSlot(e.targetHandle);
          incomingSlots.add(slot);
        }
        const expectedCount = incomingSlots.size > 0 ? incomingSlots.size : groupSize;

        // Collect the input slots that StartNodes connect to this group, ordered by slot number.
        // Edges from StartNodes to GroupNode have edgeType 'participant' and targetHandle 'input-N'.
        const inputEdges = edges
          .filter((e: any) => e.target === gn.id && e.data?.edgeType === 'participant')
          .sort((a: any, b: any) => {
            const slotA = parseInt((a.targetHandle ?? 'input-1').replace('input-', '')) || 1;
            const slotB = parseInt((b.targetHandle ?? 'input-1').replace('input-', '')) || 1;
            return slotA - slotB;
          });

        // Build ordered list of participant IDs for this group's slots.
        // Each inputEdge.source is a StartNode ID; map it to a shuffled participant.
        // We track which shuffled participant index has been consumed globally.
        const groupParticipantIds: number[] = [];
        for (const ie of inputEdges) {
          // Find which slot/index this StartNode occupies among all startNodes
          const snIdx = startNodes.findIndex((sn: any) => sn.id === ie.source);
          if (snIdx !== -1 && snIdx < shuffled.length) {
            groupParticipantIds.push(shuffled[snIdx].id);
          }
        }

        // Create TournamentGroup
        const group = await prisma.tournamentGroup.create({
          data: {
            tournamentId: id,
            name: gn.data?.label ?? `Группа`,
          },
        });
        nodeIdToGroupId.set(gn.id, group.id);
        customGroupSizes[group.id] = groupSize;
        customGroupExpectedCounts[group.id] = expectedCount;

        // Assign participants to the group
        for (const participantId of groupParticipantIds) {
          await prisma.groupParticipant.create({
            data: { groupId: group.id, participantId },
          });
        }

        // Generate round-robin matches only when the group is fully populated
        if (groupParticipantIds.length >= 2 && groupParticipantIds.length >= expectedCount) {
          const schedule = buildRoundRobinSchedule(groupParticipantIds);
          for (let roundIdx = 0; roundIdx < schedule.length; roundIdx++) {
            for (const [p1, p2] of schedule[roundIdx]) {
              await prisma.match.create({
                data: {
                  tournamentId: id,
                  stageId: groupStage!.id,
                  groupId: group.id,
                  roundNumber: roundIdx + 1,
                  player1Id: p1,
                  player2Id: p2,
                },
              });
            }
          }
        }
      }

      // ── Step 3: Wire match-to-match edges (winner/loser advancement) ────────
      // React Flow stores render type (e.g. 'smoothstep') in edge.type;
      // the actual winner/loser type is stored in edge.data.edgeType.
      const advancementEdges = edges.filter(
        (e: any) => ['winner', 'winner-1', 'winner-2', 'loser'].includes(e.data?.edgeType) ||
                   ['winner', 'winner-1', 'winner-2', 'loser'].includes(e.type)
      );

      // Store conditional advancement rules for matches
      const conditionalAdvancement: Record<number, {
        winner1NextMatchId?: number;
        winner1NextMatchSlot?: number;
        winner2NextMatchId?: number;
        winner2NextMatchSlot?: number;
        loserNextMatchId?: number;
        loserNextMatchSlot?: number;
        winner1NextGroupId?: number;
        winner1NextGroupSlot?: number;
        winner2NextGroupId?: number;
        winner2NextGroupSlot?: number;
        loserNextGroupId?: number;
        loserNextGroupSlot?: number;
      }> = {};

      for (const edge of advancementEdges) {
        const sourceMatchDbId = nodeIdToMatchId.get(edge.source);
        const targetMatchDbId = nodeIdToMatchId.get(edge.target);
        const targetGroupDbId = nodeIdToGroupId.get(edge.target);
        if (!sourceMatchDbId || (!targetMatchDbId && !targetGroupDbId)) continue;

        const slot = parseInputSlot(edge.targetHandle);
        const resolvedEdgeType = edge.data?.edgeType ?? edge.type;

        if (!conditionalAdvancement[sourceMatchDbId]) {
          conditionalAdvancement[sourceMatchDbId] = {};
        }

        if (resolvedEdgeType === 'winner-1') {
          if (targetMatchDbId) {
            conditionalAdvancement[sourceMatchDbId].winner1NextMatchId = targetMatchDbId;
            conditionalAdvancement[sourceMatchDbId].winner1NextMatchSlot = slot;
          } else if (targetGroupDbId) {
            conditionalAdvancement[sourceMatchDbId].winner1NextGroupId = targetGroupDbId;
            conditionalAdvancement[sourceMatchDbId].winner1NextGroupSlot = slot;
          }
        } else if (resolvedEdgeType === 'winner-2') {
          if (targetMatchDbId) {
            conditionalAdvancement[sourceMatchDbId].winner2NextMatchId = targetMatchDbId;
            conditionalAdvancement[sourceMatchDbId].winner2NextMatchSlot = slot;
          } else if (targetGroupDbId) {
            conditionalAdvancement[sourceMatchDbId].winner2NextGroupId = targetGroupDbId;
            conditionalAdvancement[sourceMatchDbId].winner2NextGroupSlot = slot;
          }
        } else if (resolvedEdgeType === 'loser') {
          if (targetMatchDbId) {
            conditionalAdvancement[sourceMatchDbId].loserNextMatchId = targetMatchDbId;
            conditionalAdvancement[sourceMatchDbId].loserNextMatchSlot = slot;
          } else if (targetGroupDbId) {
            conditionalAdvancement[sourceMatchDbId].loserNextGroupId = targetGroupDbId;
            conditionalAdvancement[sourceMatchDbId].loserNextGroupSlot = slot;
          }
        } else if (resolvedEdgeType === 'winner') {
          // Legacy support: old 'winner' edges apply to both winner-1 and winner-2
          if (targetMatchDbId) {
            conditionalAdvancement[sourceMatchDbId].winner1NextMatchId = targetMatchDbId;
            conditionalAdvancement[sourceMatchDbId].winner1NextMatchSlot = slot;
            conditionalAdvancement[sourceMatchDbId].winner2NextMatchId = targetMatchDbId;
            conditionalAdvancement[sourceMatchDbId].winner2NextMatchSlot = slot;
          } else if (targetGroupDbId) {
            conditionalAdvancement[sourceMatchDbId].winner1NextGroupId = targetGroupDbId;
            conditionalAdvancement[sourceMatchDbId].winner1NextGroupSlot = slot;
            conditionalAdvancement[sourceMatchDbId].winner2NextGroupId = targetGroupDbId;
            conditionalAdvancement[sourceMatchDbId].winner2NextGroupSlot = slot;
          }
        }
      }

      // Store conditional advancement in gridJson for runtime use
      const gridMeta: any = {
        conditionalAdvancement,
        customNodeMap: {},
        customGroupMap: {},
        customGroupSizes: {},
        customGroupExpectedCounts: {},
        customMatchInputSlots: {},
        customGroupOutputs: {},
        hasCustomGroups: false,
      };

      // Track which match input slots have any incoming edges
      const customMatchInputSlots: Record<number, { hasSlot1: boolean; hasSlot2: boolean }> = {};
      for (const matchId of nodeIdToMatchId.values()) {
        customMatchInputSlots[matchId] = { hasSlot1: false, hasSlot2: false };
      }
      for (const edge of edges) {
        const targetMatchDbId = nodeIdToMatchId.get(edge.target);
        if (!targetMatchDbId) continue;
        const slot = parseInputSlot(edge.targetHandle);
        if (!customMatchInputSlots[targetMatchDbId]) {
          customMatchInputSlots[targetMatchDbId] = { hasSlot1: false, hasSlot2: false };
        }
        if (slot === 1) customMatchInputSlots[targetMatchDbId].hasSlot1 = true;
        else customMatchInputSlots[targetMatchDbId].hasSlot2 = true;
      }

      // Persist group sizes and match input map
      gridMeta.customGroupSizes = customGroupSizes;
      gridMeta.customGroupExpectedCounts = customGroupExpectedCounts;
      gridMeta.customMatchInputSlots = customMatchInputSlots;

      // ── Step 4: Assign StartNode participants to direct-match inputs ────────
      // (Only applies for StartNodes that connect directly to a MatchNode, not a GroupNode)
      for (let i = 0; i < startNodes.length && i < shuffled.length; i++) {
        const startNode = startNodes[i];
        const participant = shuffled[i];

        const outEdge = edges.find((e: any) => e.source === startNode.id);
        if (!outEdge) continue;

        // Skip if the target is a GroupNode (handled in Step 2)
        if (nodeIdToGroupId.has(outEdge.target)) continue;

        const targetMatchDbId = nodeIdToMatchId.get(outEdge.target);
        if (!targetMatchDbId) continue;

        const slot = parseInputSlot(outEdge.targetHandle);
        const updateData: any = slot === 1
          ? { player1Id: participant.id }
          : { player2Id: participant.id };

        await prisma.match.update({ where: { id: targetMatchDbId }, data: updateData });
      }

      // ── Step 5: Build customGroupOutputs metadata for group→match wiring ───
      // When a group finishes, the match handler needs to know which rank-N output
      // connects to which match input slot. Store this as:
      //   customGroupOutputs: { "<groupDbId>-<rank>": { matchId, slot } }
      // Also store customNodeMap: { "<nodeId>": matchDbId } for the view layer.
      const customGroupOutputs: Record<string, { matchId?: number; groupId?: number; slot: number; type?: string }> = {};

      // Rank edges from GroupNode outputs (sourceHandle: 'rank-N') to MatchNode inputs
      const rankEdges = edges.filter(
        (e: any) => e.source && nodeIdToGroupId.has(e.source) &&
                    typeof e.sourceHandle === 'string' && e.sourceHandle.startsWith('rank-')
      );
      for (const edge of rankEdges) {
        const groupDbId = nodeIdToGroupId.get(edge.source);
        const targetMatchDbId = nodeIdToMatchId.get(edge.target);
        const targetGroupDbId = nodeIdToGroupId.get(edge.target);
        if (!groupDbId || (!targetMatchDbId && !targetGroupDbId)) continue;
        const rankNum = parseInt(edge.sourceHandle.replace('rank-', ''));
        const rank = isNaN(rankNum) ? 1 : (rankNum === 0 ? 1 : rankNum);
        const slot = parseInputSlot(edge.targetHandle);
        if (targetMatchDbId) {
          customGroupOutputs[`${groupDbId}-${rank}`] = { matchId: targetMatchDbId, slot, type: 'match' };
        } else if (targetGroupDbId) {
          customGroupOutputs[`${groupDbId}-${rank}`] = { groupId: targetGroupDbId, slot, type: 'group' };
        }
      }

      // customNodeMap: nodeId → DB matchId (for the view to map nodes to real matches)
      const customNodeMap: Record<string, number> = {};
      for (const [nodeId, matchId] of nodeIdToMatchId.entries()) {
        customNodeMap[nodeId] = matchId;
      }
      const customGroupMap: Record<string, number> = {};
      for (const [nodeId, groupId] of nodeIdToGroupId.entries()) {
        customGroupMap[nodeId] = groupId;
      }

      // Update gridMeta with group outputs
      gridMeta.customGroupOutputs = customGroupOutputs;
      gridMeta.customNodeMap = customNodeMap;
      gridMeta.customGroupMap = customGroupMap;
      gridMeta.hasCustomGroups = Object.keys(customGroupOutputs).length > 0;

      // Update tournament status to ACTIVE
      await prisma.tournament.update({
        where: { id },
        data: { status: 'ACTIVE', gridJson: JSON.stringify(gridMeta) },
      });

      // Auto-advance BYE matches (slots with no incoming edges) after gridJson is stored
      for (const matchId of nodeIdToMatchId.values()) {
        await autoAdvanceCustomBye(id, matchId);
      }

      return reply.send({ success: true, matchCount: matchNodes.length, groupCount: groupNodes.length });
    }
  );

  // GET /api/tournaments/:id/custom-schema
  fastify.get<{ Params: { id: string } }>('/:id/custom-schema', async (request, reply) => {
    const id = parseId(request.params.id);
    if (!id) return badRequest(reply, 'Неверный ID');

    const tournament = await prisma.tournament.findUnique({
      where: { id },
      select: { customSchema: true, format: true },
    });
    if (!tournament) return notFound(reply, 'Турнир не найден');
    if (tournament.format !== 'CUSTOM') return badRequest(reply, 'Не кастомный турнир');

    return reply.send({ customSchema: tournament.customSchema });
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

