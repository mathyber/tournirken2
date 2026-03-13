import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma';
import { badRequest, forbidden, notFound, unauthorized, parseId } from '../lib/errors';
import { SetMatchResultSchema } from '@tournirken/shared';
import { advanceWinner, advanceLoser, autoAdvanceCustomBye, generateSwissRound, generateSingleElimination, getSwissStandings } from '../services/brackets';

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
    const id = parseId(request.params.id);
if (!id) return badRequest(reply, 'Неверный ID');

    const match = await prisma.match.findUnique({ where: { id }, include: MATCH_INCLUDE });
    if (!match) return notFound(reply, 'Матч не найден');

    return reply.send(match);
  });

  // POST /api/matches/:id/result
  fastify.post<{ Params: { id: string } }>(
    '/:id/result',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const id = parseId(request.params.id);
if (!id) return badRequest(reply, 'Неверный ID');

      const match = await prisma.match.findUnique({
        where: { id },
        include: {
          tournament: { select: { organizerId: true, onlyOrganizerSetsResults: true, format: true, id: true } },
          player1: { select: { userId: true } },
          player2: { select: { userId: true } },
          results: { orderBy: { createdAt: 'desc' } },
          group: { select: { id: true } },
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

      const isPlayoffMatch = !match.group;
      if (isPlayoffMatch && isFinal && player1Score === player2Score) {
        return badRequest(reply, 'В матчах плей-офф финальный результат не может быть ничьей');
      }

      // Create result record
      const matchResult = await prisma.matchResult.create({
        data: {
          matchId: id,
          setByUserId: userId,
          player1Score,
          player2Score,
          isFinal: isFinal,
          info,
        },
      });

      // Determine if match should be confirmed
      let shouldFinish = false;
      let finalWinnerId: number | null = null;
      let finalP1Score = player1Score;
      let finalP2Score = player2Score;
      const acceptedResultIds: number[] = [];

      if (isOrganizer && isFinal) {
        shouldFinish = true;
        acceptedResultIds.push(matchResult.id);
      } else if (!match.tournament.onlyOrganizerSetsResults && isFinal) {
        // Both players must submit identical FINAL results
        const p1UserId = match.player1?.userId;
        const p2UserId = match.player2?.userId;

        const p1Submissions = match.results.filter(
          (r) => r.setByUserId === p1UserId && r.isFinal
        );
        const p2Submissions = match.results.filter(
          (r) => r.setByUserId === p2UserId && r.isFinal
        );

        // Include the new result (already saved with isFinal: false above, update in-memory)
        const newResultAsFinal = { ...matchResult, isFinal: true };
        const allP1 = p1UserId === userId ? [newResultAsFinal, ...p1Submissions] : p1Submissions;
        const allP2 = p2UserId === userId ? [newResultAsFinal, ...p2Submissions] : p2Submissions;

        const latestP1 = allP1.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
        const latestP2 = allP2.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

        if (latestP1 && latestP2 &&
          latestP1.player1Score === latestP2.player1Score &&
          latestP1.player2Score === latestP2.player2Score) {
          shouldFinish = true;
          finalP1Score = latestP1.player1Score;
          finalP2Score = latestP1.player2Score;
          acceptedResultIds.push(latestP1.id, latestP2.id);
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

        // Mark accepted results
        await prisma.matchResult.updateMany({
          where: { id: { in: acceptedResultIds } },
          data: { isFinal: true, isAccepted: true },
        });

        // Advance winner to next match (for elimination formats)
        const fullMatch = await prisma.match.findUnique({ where: { id } });
        if (finalWinnerId && fullMatch) {
          await advanceWinner({
            id: fullMatch.id,
            winnerId: finalWinnerId,
            nextMatchId: fullMatch.nextMatchId,
            nextMatchSlot: fullMatch.nextMatchSlot,
            tournamentId: match.tournamentId,
          });
        }

        // Advance loser to lower bracket (for double elimination / custom loser routing)
        if (finalWinnerId && fullMatch) {
          await advanceLoser({
            id: fullMatch.id,
            player1Id: fullMatch.player1Id,
            player2Id: fullMatch.player2Id,
            winnerId: finalWinnerId,
            loserNextMatchId: fullMatch.loserNextMatchId,
            loserNextMatchSlot: fullMatch.loserNextMatchSlot,
            tournamentId: match.tournamentId,
          });
        }

        // ── Assign final placements ──────────────────────────────────────────
        const format = match.tournament.format;

        const tournament = await prisma.tournament.findUnique({
          where: { id: match.tournament.id },
          include: { participants: true },
        });

        let customMeta: any = null;
        let hasCustomRouting = false;
        if (tournament?.gridJson) {
          try {
            customMeta = JSON.parse(tournament.gridJson);
            hasCustomRouting = !!(
              customMeta?.conditionalAdvancement ||
              customMeta?.customNodeMap ||
              customMeta?.customGroupMap ||
              customMeta?.customGroupOutputs ||
              customMeta?.customMatchInputSlots
            );
          } catch { /* ignore */ }
        }

        // Elimination / Mixed playoff final: only for legacy (non-custom) routing
        if (!hasCustomRouting && !fullMatch?.nextMatchId && !match.groupId &&
            ['SINGLE_ELIMINATION', 'DOUBLE_ELIMINATION', 'MIXED'].includes(format)) {

          // ── Double Elimination: Grand Final Reset check ──────────────────
          // In DE, player1 comes from WB (0 losses), player2 comes from LB (1 loss).
          // If player2 (LB finalist) wins the GF, the WB finalist still has only 1 loss
          // and we must play a reset match. Only finish tournament if WB finalist won,
          // OR if this match is already a GF reset (gridJson has grandFinalResetMatchId).
          if (format === 'DOUBLE_ELIMINATION') {
            const tourney = await prisma.tournament.findUnique({
              where: { id: match.tournament.id },
              select: { gridJson: true },
            });
            let meta: any = {};
            try { meta = tourney?.gridJson ? JSON.parse(tourney.gridJson) : {}; } catch { /* ignore */ }

            const isResetMatch = meta.grandFinalResetMatchId === id;
            const lbFinalistWon = finalWinnerId === match.player2Id; // player2 is LB finalist

            if (!isResetMatch && lbFinalistWon) {
              // LB finalist won the GF — create a Grand Final Reset match
              const grandFinalStage = await prisma.stage.findFirst({ where: { name: 'Гранд-финал' } });
              if (grandFinalStage) {
                const resetMatch = await prisma.match.create({
                  data: {
                    tournamentId: match.tournament.id,
                    stageId: grandFinalStage.id,
                    roundNumber: (fullMatch?.roundNumber ?? 1) + 1,
                    player1Id: match.player1Id, // WB finalist
                    player2Id: match.player2Id, // LB finalist
                  },
                });
                // Record the reset match ID so we know it's the final
                await prisma.tournament.update({
                  where: { id: match.tournament.id },
                  data: { gridJson: JSON.stringify({ ...meta, grandFinalResetMatchId: resetMatch.id }) },
                });
              }
              // Do NOT finish tournament yet — wait for the reset match
            } else {
              // WB finalist won GF (normal end) OR this is the reset match completing
              if (finalWinnerId) {
                await prisma.tournamentParticipant.update({ where: { id: finalWinnerId }, data: { finalResult: '1' } });
              }
              const finalLoserId = finalWinnerId === match.player1Id ? match.player2Id : match.player1Id;
              if (finalLoserId) {
                await prisma.tournamentParticipant.update({ where: { id: finalLoserId }, data: { finalResult: '2' } });
              }
              await prisma.tournament.update({
                where: { id: match.tournament.id },
                data: { status: 'FINISHED', tournamentEnd: new Date() },
              });
            }
          } else {
            // Single Elimination / Mixed
            if (finalWinnerId) {
              await prisma.tournamentParticipant.update({ where: { id: finalWinnerId }, data: { finalResult: '1' } });
            }
            const finalLoserId = finalWinnerId === match.player1Id ? match.player2Id : match.player1Id;
            if (finalLoserId) {
              await prisma.tournamentParticipant.update({ where: { id: finalLoserId }, data: { finalResult: '2' } });
            }
            // 3rd place: losers of the two semi-final matches that fed into this one
            const semis = await prisma.match.findMany({ where: { nextMatchId: id, isFinished: true } });
            for (const sf of semis) {
              const sfLoser = sf.winnerId === sf.player1Id ? sf.player2Id : sf.player1Id;
              if (sfLoser) {
                await prisma.tournamentParticipant.updateMany({
                  where: { id: sfLoser, finalResult: null },
                  data: { finalResult: '3' },
                });
              }
            }
            await prisma.tournament.update({
              where: { id: match.tournament.id },
              data: { status: 'FINISHED', tournamentEnd: new Date() },
            });
          }
        }

        // Round Robin: check if all matches are now done
        if (format === 'ROUND_ROBIN') {
          const remaining = await prisma.match.count({
            where: { tournamentId: match.tournament.id, isFinished: false },
          });
          if (remaining === 0) {
            await finalizeRoundRobinResults(match.tournament.id);
          }
        }

        // CUSTOM: check if all matches are finished, and assign placements based on final node
        if (hasCustomRouting && tournament?.customSchema && tournament.gridJson) {
          const remaining = await prisma.match.count({
            where: { tournamentId: match.tournament.id, isFinished: false },
          });
          if (remaining === 0) {
            // All matches finished, determine winner from final node
            try {
              const { nodes, edges } = JSON.parse(tournament.customSchema);
              const meta = customMeta ?? JSON.parse(tournament.gridJson);
              const customNodeMap = meta.customNodeMap || {};
              const customGroupMap = meta.customGroupMap || {};
              const finalNode = nodes.find((n: any) => n.type === 'final');

              let finalWinnerId: number | null = null;
              let finalRunnerUpId: number | null = null;
              let groupRankForWinner: number | null = null;
              let groupStandingsForWinner: any[] | null = null;

              if (finalNode) {
                const incomingEdges = edges.filter((e: any) => e.target === finalNode.id);
                for (const edge of incomingEdges) {
                  const edgeType = (edge.data?.edgeType ?? edge.type) as string;
                  const sourceNodeId = edge.source;

                  // Match -> Final
                  if (customNodeMap[sourceNodeId]) {
                    const finalMatchId = customNodeMap[sourceNodeId];
                    const finalMatch = await prisma.match.findUnique({
                      where: { id: finalMatchId },
                      select: { winnerId: true, player1Id: true, player2Id: true },
                    });
                    if (!finalMatch?.winnerId) continue;

                    const p1 = finalMatch.player1Id;
                    const p2 = finalMatch.player2Id;
                    if (!p1 || !p2) continue;

                    if (edgeType === 'loser') {
                      finalWinnerId = finalMatch.winnerId === p1 ? p2 : p1;
                      finalRunnerUpId = finalMatch.winnerId;
                    } else if (edgeType === 'winner-1') {
                      if (finalMatch.winnerId === p1) {
                        finalWinnerId = p1;
                        finalRunnerUpId = p2;
                      } else {
                        continue;
                      }
                    } else if (edgeType === 'winner-2') {
                      if (finalMatch.winnerId === p2) {
                        finalWinnerId = p2;
                        finalRunnerUpId = p1;
                      } else {
                        continue;
                      }
                    } else {
                      // 'winner' or any other: use the actual winner
                      finalWinnerId = finalMatch.winnerId;
                      finalRunnerUpId = finalMatch.winnerId === p1 ? p2 : p1;
                    }
                  }

                  // Group -> Final (rank-based)
                  if (!finalWinnerId && customGroupMap[sourceNodeId]) {
                    const groupId = customGroupMap[sourceNodeId];
                    const group = await prisma.tournamentGroup.findUnique({
                      where: { id: groupId },
                      include: {
                        matches: { include: { results: { where: { isAccepted: true }, take: 1 } } },
                        participants: { include: { participant: true } },
                      },
                    });
                    if (!group) continue;
                    const standings = computeGroupStandings(group);
                    let rank = 1;
                    if (typeof edge.sourceHandle === 'string' && edge.sourceHandle.startsWith('rank-')) {
                      const rankNum = parseInt(edge.sourceHandle.replace('rank-', ''));
                      rank = isNaN(rankNum) ? 1 : (rankNum === 0 ? 1 : rankNum);
                    }
                    const winner = standings[rank - 1]?.participantId;
                    if (!winner) continue;
                    finalWinnerId = winner;
                    groupRankForWinner = rank;
                    groupStandingsForWinner = standings;
                    if (standings.length > 1) {
                      finalRunnerUpId = rank === 1
                        ? standings[1]?.participantId ?? null
                        : standings[0]?.participantId ?? null;
                    }
                  }

                  if (finalWinnerId) break;
                }
              }

              if (finalWinnerId) {
                await prisma.tournamentParticipant.update({ where: { id: finalWinnerId }, data: { finalResult: '1' } });
              }
              if (finalRunnerUpId && finalRunnerUpId !== finalWinnerId) {
                await prisma.tournamentParticipant.update({ where: { id: finalRunnerUpId }, data: { finalResult: '2' } });
              }
              if (groupStandingsForWinner && groupRankForWinner === 1 && groupStandingsForWinner.length > 2) {
                const thirdId = groupStandingsForWinner[2]?.participantId;
                if (thirdId) {
                  await prisma.tournamentParticipant.update({ where: { id: thirdId }, data: { finalResult: '3' } });
                }
              }

              await prisma.tournament.update({
                where: { id: match.tournament.id },
                data: { status: 'FINISHED', tournamentEnd: new Date() },
              });
            } catch (err) {
              console.error('Error finishing CUSTOM tournament:', err);
            }
          }
        }
        // ────────────────────────────────────────────────────────────────────

        // Check Swiss: all matches in round finished? Generate next round
        if (!hasCustomRouting && tournament?.format === 'SWISS' && tournament.gridJson) {
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
              // Set final placements by Swiss standings
              const participantIds = tournament.participants.map((p) => p.id);
              const standings = await getSwissStandings(tournament.id, participantIds);
              standings.sort((a, b) => b.points - a.points || b.buchholz - a.buchholz);
              const places = ['1', '2', '3'];
              for (let i = 0; i < Math.min(3, standings.length); i++) {
                await prisma.tournamentParticipant.update({
                  where: { id: standings[i].participantId },
                  data: { finalResult: places[i] },
                });
              }
            }
          } catch { /* ignore json parse errors */ }
        }

        // Check if all group matches are done → generate Mixed playoff
        if (!hasCustomRouting && tournament?.format === 'MIXED' && match.groupId) {
          await checkAndGenerateMixedPlayoff(tournament.id, tournament.participants.map(p => p.id));
        }

        // CUSTOM format: check if all matches in the group are done → advance ranked participants
        if (hasCustomRouting && match.groupId) {
          await checkAndAdvanceCustomGroupOutputs(tournament.id, match.groupId);
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
      matches: { include: { results: { where: { isAccepted: true }, take: 1 } } },
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

async function finalizeRoundRobinResults(tournamentId: number) {
  const participants = await prisma.tournamentParticipant.findMany({ where: { tournamentId } });
  const wins: Record<number, number> = {};
  for (const p of participants) wins[p.id] = 0;

  const matches = await prisma.match.findMany({ where: { tournamentId, isFinished: true } });
  for (const m of matches) {
    if (m.winnerId) wins[m.winnerId] = (wins[m.winnerId] ?? 0) + 1;
  }

  const sorted = Object.entries(wins).sort(([, a], [, b]) => b - a).map(([id]) => Number(id));
  const places = ['1', '2', '3'];
  for (let i = 0; i < Math.min(3, sorted.length); i++) {
    await prisma.tournamentParticipant.update({ where: { id: sorted[i] }, data: { finalResult: places[i] } });
  }
  await prisma.tournament.update({ where: { id: tournamentId }, data: { status: 'FINISHED', tournamentEnd: new Date() } });
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

    const accepted = match.results?.[0];
    const s1 = accepted?.player1Score ?? 0;
    const s2 = accepted?.player2Score ?? 0;
    p1.gf += s1; p1.gd += s1 - s2;
    p2.gf += s2; p2.gd += s2 - s1;

    if (match.winnerId === match.player1Id) {
      p1.points += group.pointsForWin;
    } else if (match.winnerId === match.player2Id) {
      p2.points += group.pointsForWin;
    } else {
      p1.points += group.pointsForDraw;
      p2.points += group.pointsForDraw;
    }
  }

  return Object.values(stats).sort((a, b) =>
    b.points - a.points || b.gd - a.gd || b.gf - a.gf
  );
}

// ── CUSTOM format: advance group-ranked participants to the next match ──────
async function checkAndAdvanceCustomGroupOutputs(tournamentId: number, groupId: number) {
  // Load tournament gridJson to get customGroupOutputs mapping
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { gridJson: true },
  });
  if (!tournament?.gridJson) return;

  let meta: any;
  try { meta = JSON.parse(tournament.gridJson); } catch { return; }
  if (!meta.hasCustomGroups || !meta.customGroupOutputs) return;

  // Check if all matches in this specific group are finished
  const groupMatches = await prisma.match.findMany({
    where: { tournamentId, groupId },
  });
  if (groupMatches.length === 0) return;
  const allDone = groupMatches.every((m) => m.isFinished);
  if (!allDone) return;

  // Mark the group as finished
  await prisma.tournamentGroup.update({
    where: { id: groupId },
    data: { isFinished: true },
  });

  // Compute standings for this group
  const group = await prisma.tournamentGroup.findUnique({
    where: { id: groupId },
    include: {
      matches: { include: { results: { where: { isAccepted: true }, take: 1 } } },
      participants: { include: { participant: true } },
    },
  });
  if (!group) return;

  const standings = computeGroupStandings(group);

  // For each rank-N output wired in customGroupOutputs, advance the participant
  const outputs: Record<string, { matchId: number; slot: number }> = meta.customGroupOutputs;
  for (let rank = 1; rank <= standings.length; rank++) {
    const key = `${groupId}-${rank}`;
    const target = outputs[key];
    if (!target) continue;

    const participantId = standings[rank - 1]?.participantId;
    if (!participantId) continue;

    const updateData: any = target.slot === 1
      ? { player1Id: participantId }
      : { player2Id: participantId };

    await prisma.match.update({
      where: { id: target.matchId },
      data: updateData,
    });

    // Auto-advance if the other slot will never be filled (custom templates/byes)
    await autoAdvanceCustomBye(tournamentId, target.matchId);
  }
}
