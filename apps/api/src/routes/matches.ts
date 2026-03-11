import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma';
import { badRequest, forbidden, notFound, unauthorized } from '../lib/errors';
import { SetMatchResultSchema } from '@tournirken/shared';
import { advanceWinner, generateSwissRound, generateSingleElimination } from '../services/brackets';

const MATCH_INCLUDE = {
  stage: true,
  group: { select: { id: true, name: true } },
  player1: { include: { user: { select: { id: true, login: true } } } },
  player2: { include: { user: { select: { id: true, login: true } } } },
  winner: { include: { user: { select: { id: true, login: true } } } },
  tournament: { select: { organizerId: true, onlyOrganizerSetsResults: true } },
  results: {
    orderBy: { createdAt: 'desc' as const },
    include: { setByUser: { select: { id: true, login: true } } },
  },
};

export default async function matchRoutes(fastify: FastifyInstance) {
  // GET /api/matches/:id
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const id = parseInt(request.params.id);
    if (isNaN(id)) return badRequest(reply, 'Неверный ID');

    const match = await prisma.match.findUnique({ where: { id }, include: MATCH_INCLUDE });
    if (!match) return notFound(reply, 'Матч не найден');

    return reply.send(match);
  });

  // POST /api/matches/:id/result
  fastify.post<{ Params: { id: string } }>(
    '/:id/result',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const id = parseInt(request.params.id);
      if (isNaN(id)) return badRequest(reply, 'Неверный ID');

      const match = await prisma.match.findUnique({
        where: { id },
        include: {
          tournament: { select: { organizerId: true, onlyOrganizerSetsResults: true, format: true, id: true } },
          player1: { select: { userId: true } },
          player2: { select: { userId: true } },
          results: { orderBy: { createdAt: 'desc' } },
        },
      });
      if (!match) return notFound(reply, 'Матч не найден');

      if (match.isFinished) return badRequest(reply, 'Матч уже завершён');
      if (match.isBye) return badRequest(reply, 'Матч является байем');
      if (!match.player1Id || !match.player2Id) {
        return badRequest(reply, 'Участники матча ещё не определены');
      }

      const userId = request.userId!;
      const isAdmin = request.userRoles?.includes('ADMIN') || request.userRoles?.includes('MODERATOR');
      const isOrganizer = match.tournament.organizerId === userId || isAdmin;
      const isParticipant =
        match.player1?.userId === userId || match.player2?.userId === userId;

      if (!isOrganizer && (!isParticipant || match.tournament.onlyOrganizerSetsResults)) {
        return forbidden(reply, 'У вас нет прав устанавливать результат этого матча');
      }

      const result = SetMatchResultSchema.safeParse(request.body);
      if (!result.success) return badRequest(reply, result.error.issues[0]?.message ?? 'Неверные данные');

      const { player1Score, player2Score, isFinal, info } = result.data;

      // Create result record
      const matchResult = await prisma.matchResult.create({
        data: {
          matchId: id,
          setByUserId: userId,
          player1Score,
          player2Score,
          isFinal: isOrganizer ? isFinal : false,
          info,
        },
      });

      // Determine if match should be confirmed
      let shouldFinish = false;
      let finalWinnerId: number | null = null;
      let finalP1Score = player1Score;
      let finalP2Score = player2Score;

      if (isOrganizer && isFinal) {
        shouldFinish = true;
      } else if (!match.tournament.onlyOrganizerSetsResults) {
        // Check if both participants submitted identical final scores
        const p1UserId = match.player1?.userId;
        const p2UserId = match.player2?.userId;

        const p1Submissions = match.results.filter(
          (r) => r.setByUserId === p1UserId
        );
        const p2Submissions = match.results.filter(
          (r) => r.setByUserId === p2UserId
        );

        // Include the new result
        const allP1 = p1UserId === userId ? [matchResult, ...p1Submissions] : p1Submissions;
        const allP2 = p2UserId === userId ? [matchResult, ...p2Submissions] : p2Submissions;

        const latestP1 = allP1.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
        const latestP2 = allP2.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

        if (latestP1 && latestP2 &&
          latestP1.player1Score === latestP2.player1Score &&
          latestP1.player2Score === latestP2.player2Score) {
          shouldFinish = true;
          finalP1Score = latestP1.player1Score;
          finalP2Score = latestP1.player2Score;
        }
      }

      if (shouldFinish) {
        if (finalP1Score > finalP2Score) finalWinnerId = match.player1Id;
        else if (finalP2Score > finalP1Score) finalWinnerId = match.player2Id;
        else finalWinnerId = null; // draw (for group stage)

        const updatedMatch = await prisma.match.update({
          where: { id },
          data: { isFinished: true, winnerId: finalWinnerId },
        });

        // Mark result as final
        await prisma.matchResult.update({
          where: { id: matchResult.id },
          data: { isFinal: true },
        });

        // Advance winner to next match (for elimination formats)
        const fullMatch = await prisma.match.findUnique({ where: { id } });
        if (fullMatch?.nextMatchId && finalWinnerId) {
          await advanceWinner({
            id: fullMatch.id,
            winnerId: finalWinnerId,
            nextMatchId: fullMatch.nextMatchId,
            nextMatchSlot: fullMatch.nextMatchSlot,
          });
        }

        // Check Swiss: all matches in round finished? Generate next round
        const tournament = await prisma.tournament.findUnique({
          where: { id: match.tournament.id },
          include: { participants: true },
        });

        if (tournament?.format === 'SWISS' && tournament.gridJson) {
          try {
            const meta = JSON.parse(tournament.gridJson);
            const currentRound = meta.currentRound as number;
            const totalRounds = meta.totalRounds as number;

            const roundMatches = await prisma.match.findMany({
              where: { tournamentId: tournament.id, roundNumber: currentRound },
            });
            const allFinished = roundMatches.every((m) => m.isFinished);

            if (allFinished && currentRound < totalRounds) {
              const nextRound = currentRound + 1;
              const participantIds = tournament.participants.map((p) => p.id);
              await generateSwissRound(tournament.id, nextRound, participantIds);
              await prisma.tournament.update({
                where: { id: tournament.id },
                data: { gridJson: JSON.stringify({ ...meta, currentRound: nextRound }) },
              });
            } else if (allFinished && currentRound >= totalRounds) {
              await prisma.tournament.update({
                where: { id: tournament.id },
                data: { status: 'FINISHED', tournamentEnd: new Date() },
              });
            }
          } catch { /* ignore json parse errors */ }
        }

        // Check if all group matches are done → generate Mixed playoff
        if (tournament?.format === 'MIXED' && match.groupId) {
          await checkAndGenerateMixedPlayoff(tournament.id, tournament.participants.map(p => p.id));
        }
      }

      const updatedMatch = await prisma.match.findUnique({ where: { id }, include: MATCH_INCLUDE });
      return reply.send(updatedMatch);
    }
  );
}

async function checkAndGenerateMixedPlayoff(tournamentId: number, allParticipantIds: number[]) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { gridJson: true },
  });

  if (!tournament?.gridJson) return;

  let meta: any;
  try {
    meta = JSON.parse(tournament.gridJson);
  } catch { return; }

  if (meta.playoffStarted) return;

  const groups = await prisma.tournamentGroup.findMany({
    where: { tournamentId },
    include: {
      matches: true,
      participants: { include: { participant: true } },
    },
  });

  const allGroupMatchesFinished = groups.every((g) =>
    g.matches.every((m) => m.isFinished)
  );
  if (!allGroupMatchesFinished) return;

  const advancePerGroup = meta.advancePerGroup ?? 2;

  // Get top N from each group based on standings
  const advancingIds: number[] = [];
  for (const group of groups) {
    const standings = computeGroupStandings(group);
    const top = standings.slice(0, advancePerGroup).map((s) => s.participantId);
    advancingIds.push(...top);
  }

  if (advancingIds.length < 2) return;

  // Generate single elimination playoff for advancing participants
  await generateSingleElimination(tournamentId, advancingIds);

  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { gridJson: JSON.stringify({ ...meta, playoffStarted: true }) },
  });
}

function computeGroupStandings(group: any) {
  const stats: Record<number, { participantId: number; points: number; gd: number; gf: number }> = {};
  for (const gp of group.participants) {
    stats[gp.participantId] = { participantId: gp.participantId, points: 0, gd: 0, gf: 0 };
  }

  for (const match of group.matches) {
    if (!match.isFinished || !match.player1Id || !match.player2Id) continue;
    const p1 = stats[match.player1Id];
    const p2 = stats[match.player2Id];
    if (!p1 || !p2) continue;

    // We'd need results here — simplified: use winnerId
    if (match.winnerId === match.player1Id) {
      p1.points += group.pointsForWin;
    } else if (match.winnerId === match.player2Id) {
      p2.points += group.pointsForWin;
    } else {
      p1.points += group.pointsForDraw;
      p2.points += group.pointsForDraw;
    }
  }

  return Object.values(stats).sort((a, b) => b.points - a.points);
}
