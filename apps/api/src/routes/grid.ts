import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { SaveDraftGridSchema, FinalizeGridSchema } from '@tournirken/shared';
import {
  generateSingleElimination,
  generateDoubleElimination,
  generateRoundRobin,
  generateSwissRound,
  generateMixedGroupStage,
} from '../services/brackets';

export default async function gridRoutes(fastify: FastifyInstance) {
  // POST /api/tournaments/:id/grid/draft
  fastify.post<{ Params: { id: string } }>(
    '/:id/grid/draft',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const id = parseInt(request.params.id);
      if (isNaN(id)) return badRequest(reply, 'Неверный ID');

      const tournament = await prisma.tournament.findUnique({ where: { id } });
      if (!tournament) return notFound(reply, 'Турнир не найден');

      const isOrganizer = tournament.organizerId === request.userId;
      const isAdmin = request.userRoles?.includes('ADMIN');
      if (!isOrganizer && !isAdmin) return forbidden(reply);

      const result = SaveDraftGridSchema.safeParse(request.body);
      if (!result.success) return badRequest(reply, 'Неверные данные');

      await prisma.tournament.update({ where: { id }, data: { gridJson: result.data.gridJson } });
      return reply.send({ message: 'Черновик сохранён' });
    }
  );

  // POST /api/tournaments/:id/grid/finalize
  fastify.post<{ Params: { id: string } }>(
    '/:id/grid/finalize',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const id = parseInt(request.params.id);
      if (isNaN(id)) return badRequest(reply, 'Неверный ID');

      const tournament = await prisma.tournament.findUnique({
        where: { id },
        include: { participants: true },
      });
      if (!tournament) return notFound(reply, 'Турнир не найден');

      const isOrganizer = tournament.organizerId === request.userId;
      const isAdmin = request.userRoles?.includes('ADMIN');
      if (!isOrganizer && !isAdmin) return forbidden(reply);

      if (!['DRAFT', 'REGISTRATION'].includes(tournament.status)) {
        return badRequest(reply, 'Турнир уже запущен');
      }

      const result = FinalizeGridSchema.safeParse(request.body);
      if (!result.success) return badRequest(reply, result.error.issues[0]?.message ?? 'Неверные данные');

      const { gridJson, participantAssignments, groups: groupConfigs, mixedConfig } = result.data;
      const participantIds = tournament.participants.map((p) => p.id);

      if (participantIds.length < 2) {
        return badRequest(reply, 'Нужно минимум 2 участника');
      }

      // Delete existing matches and groups
      await prisma.match.deleteMany({ where: { tournamentId: id } });
      await prisma.groupParticipant.deleteMany({
        where: { group: { tournamentId: id } },
      });
      await prisma.tournamentGroup.deleteMany({ where: { tournamentId: id } });

      // Determine ordered participant IDs (by seed or original order)
      let orderedParticipants = participantIds;
      if (participantAssignments && participantAssignments.length > 0) {
        const seedMap = new Map<number, number>();
        for (const a of participantAssignments) {
          if (a.seed !== undefined) seedMap.set(a.participantId, a.seed);
        }
        if (seedMap.size > 0) {
          orderedParticipants = participantIds.sort(
            (a, b) => (seedMap.get(a) ?? 999) - (seedMap.get(b) ?? 999)
          );
        }
      }

      try {
        switch (tournament.format) {
          case 'SINGLE_ELIMINATION':
            await generateSingleElimination(id, orderedParticipants);
            break;

          case 'DOUBLE_ELIMINATION':
            await generateDoubleElimination(id, orderedParticipants);
            break;

          case 'ROUND_ROBIN': {
            // Create one group for all participants
            const group = await prisma.tournamentGroup.create({
              data: {
                tournamentId: id,
                name: groupConfigs?.[0]?.name ?? 'Основная группа',
                pointsForWin: groupConfigs?.[0]?.pointsForWin ?? 3,
                pointsForDraw: groupConfigs?.[0]?.pointsForDraw ?? 1,
              },
            });
            await prisma.groupParticipant.createMany({
              data: orderedParticipants.map((pid) => ({ groupId: group.id, participantId: pid })),
            });
            await generateRoundRobin(id, group.id, orderedParticipants);
            break;
          }

          case 'SWISS': {
            const swissRounds = tournament.swissRounds ?? Math.ceil(Math.log2(participantIds.length));
            await generateSwissRound(id, 1, orderedParticipants);
            // Store total rounds in gridJson for tracking
            const swissMeta = { totalRounds: swissRounds, currentRound: 1 };
            await prisma.tournament.update({
              where: { id },
              data: { gridJson: JSON.stringify(swissMeta) },
            });
            break;
          }

          case 'MIXED': {
            if (!mixedConfig) return badRequest(reply, 'Нужна конфигурация Mixed турнира');
            const { numberOfGroups, advancePerGroup } = mixedConfig;

            // Create groups
            const createdGroups: Array<{ groupId: number; participantIds: number[] }> = [];
            for (let i = 0; i < numberOfGroups; i++) {
              const gConfig = groupConfigs?.[i];
              const group = await prisma.tournamentGroup.create({
                data: {
                  tournamentId: id,
                  name: gConfig?.name ?? `Группа ${String.fromCharCode(65 + i)}`,
                  pointsForWin: gConfig?.pointsForWin ?? 3,
                  pointsForDraw: gConfig?.pointsForDraw ?? 1,
                },
              });

              // Distribute participants round-robin style among groups
              const groupParticipants = participantAssignments
                ?.filter((a) => a.groupId === gConfig?.id || a.groupId === group.id.toString())
                .map((a) => a.participantId) ?? [];

              // Fallback: distribute evenly
              if (groupParticipants.length === 0) {
                for (let j = i; j < orderedParticipants.length; j += numberOfGroups) {
                  groupParticipants.push(orderedParticipants[j]);
                }
              }

              await prisma.groupParticipant.createMany({
                data: groupParticipants.map((pid) => ({ groupId: group.id, participantId: pid })),
              });
              createdGroups.push({ groupId: group.id, participantIds: groupParticipants });
            }

            await generateMixedGroupStage(id, createdGroups);

            // Playoff bracket will be generated after groups finish
            const mixedMeta = { advancePerGroup, playoffStarted: false };
            await prisma.tournament.update({
              where: { id },
              data: { gridJson: JSON.stringify({ ...JSON.parse(gridJson || '{}'), ...mixedMeta }) },
            });
            break;
          }

          default:
            return badRequest(reply, 'Неподдерживаемый формат турнира');
        }

        await prisma.tournament.update({
          where: { id },
          data: {
            status: 'ACTIVE',
            tournamentStart: new Date(),
            gridJson: tournament.format !== 'SWISS' && tournament.format !== 'MIXED' ? gridJson : undefined,
          },
        });

        return reply.send({ message: 'Турнир запущен' });
      } catch (err: any) {
        return reply.status(500).send({ error: 'Ошибка генерации турнирной сетки', details: err.message });
      }
    }
  );
}
