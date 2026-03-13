import prisma from '../lib/prisma';

// ─────────────────────────────────────────────────────────────────────────────
// Single Elimination
// ─────────────────────────────────────────────────────────────────────────────

export async function generateSingleElimination(
  tournamentId: number,
  participantIds: number[],
) {
  // Seed participants (top seeds first)
  const n = participantIds.length;
  const rounds = Math.ceil(Math.log2(n));
  const totalSlots = Math.pow(2, rounds);

  // Standard bracket seeding
  const seeded = buildSingleEliminationBracket(participantIds, totalSlots);

  // Get or create stages
  const stageNames = buildRoundNames(rounds, 'single');
  const stages = await ensureStages(stageNames);

  const matchRecords: any[] = [];

  // Round 1 matches
  for (let i = 0; i < seeded.length; i += 2) {
    const p1 = seeded[i];
    const p2 = seeded[i + 1];
    const isBye = p2 === null;
    matchRecords.push({
      tournamentId,
      stageId: stages[0].id,
      roundNumber: 1,
      player1Id: p1,
      player2Id: p2,
      isFinished: isBye,
      winnerId: isBye ? p1 : null,
      isBye,
    });
  }

  // Create round 1 matches and set up subsequent rounds
  const createdMatches: any[] = [];
  for (const m of matchRecords) {
    const created = await prisma.match.create({ data: m });
    createdMatches.push(created);
  }

  // Create subsequent rounds (empty matches with nextMatchId linking)
  let prevRoundMatches = createdMatches;
  for (let round = 2; round <= rounds; round++) {
    const nextRoundMatchCount = Math.ceil(prevRoundMatches.length / 2);
    const nextRoundMatches: any[] = [];

    for (let i = 0; i < nextRoundMatchCount; i++) {
      const m = await prisma.match.create({
        data: {
          tournamentId,
          stageId: stages[round - 1]?.id ?? stages[stages.length - 1].id,
          roundNumber: round,
        },
      });
      nextRoundMatches.push(m);
    }

    // Link previous round matches to next round (and update in-memory objects)
    for (let i = 0; i < prevRoundMatches.length; i++) {
      const nextMatchIndex = Math.floor(i / 2);
      const slot = (i % 2) + 1;
      await prisma.match.update({
        where: { id: prevRoundMatches[i].id },
        data: { nextMatchId: nextRoundMatches[nextMatchIndex].id, nextMatchSlot: slot },
      });
      prevRoundMatches[i] = {
        ...prevRoundMatches[i],
        nextMatchId: nextRoundMatches[nextMatchIndex].id,
        nextMatchSlot: slot,
      };
    }

    // Auto-advance byes
    for (const prevMatch of prevRoundMatches) {
      if (prevMatch.isBye && prevMatch.winnerId) {
        await advanceWinner({
          id: prevMatch.id,
          winnerId: prevMatch.winnerId,
          nextMatchId: prevMatch.nextMatchId,
          nextMatchSlot: prevMatch.nextMatchSlot,
          tournamentId,
        });
      }
    }

    prevRoundMatches = nextRoundMatches;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Double Elimination
// ─────────────────────────────────────────────────────────────────────────────

export async function generateDoubleElimination(
  tournamentId: number,
  participantIds: number[],
) {
  const n = participantIds.length;

  // ── Degenerate case: 2 players → single Grand Final, no losers bracket ────
  if (n === 2) {
    const grandFinalStage = await ensureStage('Гранд-финал');
    await prisma.match.create({
      data: {
        tournamentId,
        stageId: grandFinalStage.id,
        roundNumber: 1,
        player1Id: participantIds[0],
        player2Id: participantIds[1],
      },
    });
    return;
  }

  const rounds = Math.ceil(Math.log2(n));
  const totalSlots = Math.pow(2, rounds);
  const seeded = buildSingleEliminationBracket(participantIds, totalSlots);

  const wbStage = await ensureStage('Верхняя сетка');
  const lbStage = await ensureStage('Нижняя сетка');
  const grandFinalStage = await ensureStage('Гранд-финал');

  // ── Upper Bracket ─────────────────────────────────────────────────────────

  // WB Round 1
  const wbRound1: any[] = [];
  for (let i = 0; i < seeded.length; i += 2) {
    const p1 = seeded[i];
    const p2 = seeded[i + 1];
    const isBye = p2 === null;
    const m = await prisma.match.create({
      data: {
        tournamentId,
        stageId: wbStage.id,
        roundNumber: 1,
        player1Id: p1,
        player2Id: p2,
        isFinished: isBye,
        winnerId: isBye ? p1 : null,
        isBye,
      },
    });
    wbRound1.push(m);
  }

  // WB rounds 2..rounds
  let prevWB = wbRound1;
  const allWBMatches: any[][] = [wbRound1]; // index 0 = WBR1
  for (let round = 2; round <= rounds; round++) {
    const nextCount = Math.ceil(prevWB.length / 2);
    const nextRound: any[] = [];
    for (let i = 0; i < nextCount; i++) {
      const m = await prisma.match.create({
        data: { tournamentId, stageId: wbStage.id, roundNumber: round },
      });
      nextRound.push(m);
    }
    for (let i = 0; i < prevWB.length; i++) {
      const nextMatchId = nextRound[Math.floor(i / 2)].id;
      const nextMatchSlot = (i % 2) + 1;
      await prisma.match.update({
        where: { id: prevWB[i].id },
        data: { nextMatchId, nextMatchSlot },
      });
      prevWB[i] = { ...prevWB[i], nextMatchId, nextMatchSlot };
    }
    // Auto-advance WBR1 byes up the WB
    for (const m of prevWB) {
      if (m.isBye && m.winnerId) {
        await advanceWinner({
          id: m.id,
          winnerId: m.winnerId,
          nextMatchId: m.nextMatchId,
          nextMatchSlot: m.nextMatchSlot,
          tournamentId,
        });
      }
    }
    allWBMatches.push(nextRound);
    prevWB = nextRound;
  }

  // ── Lower Bracket ─────────────────────────────────────────────────────────
  // totalLBRounds = 2 * (rounds - 1)
  // For lbRound k: matchCount = wbR1Count / 2^ceil(k/2)
  //   lbRound=1 (drop from WBR1):           wbR1Count / 2^1 matches
  //   lbRound=2 (vs WBR2 losers):            wbR1Count / 2^1 matches
  //   lbRound=3 (pure survivor):             wbR1Count / 2^2 matches
  //   lbRound=4 (vs WBR3 losers):            wbR1Count / 2^2 matches
  //   ...

  const wbR1Count = wbRound1.length; // = totalSlots / 2
  const totalLBRounds = 2 * (rounds - 1);
  const allLBMatches: any[][] = []; // index 0 = LBR1

  for (let lbRound = 1; lbRound <= totalLBRounds; lbRound++) {
    const k = Math.ceil(lbRound / 2);
    const matchCount = wbR1Count / Math.pow(2, k);
    const currentRound: any[] = [];
    for (let i = 0; i < matchCount; i++) {
      const m = await prisma.match.create({
        data: { tournamentId, stageId: lbStage.id, roundNumber: lbRound + rounds },
      });
      currentRound.push(m);
    }
    allLBMatches.push(currentRound);
  }

  // ── Wire up LB internal progression ───────────────────────────────────────
  for (let lbRound = 1; lbRound <= totalLBRounds; lbRound++) {
    const currentRound = allLBMatches[lbRound - 1];
    if (lbRound === totalLBRounds) continue; // LB Final feeds Grand Final (wired below)
    const nextLBRound = allLBMatches[lbRound]; // index lbRound = lbRound+1 - 1

    if (lbRound % 2 === 0) {
      // Even rounds: 2-to-1 pairing into next odd round
      // currentRound[2i]   → nextLBRound[i] slot 1
      // currentRound[2i+1] → nextLBRound[i] slot 2
      for (let i = 0; i < currentRound.length; i++) {
        const destIdx = Math.floor(i / 2);
        const slot = (i % 2) + 1;
        await prisma.match.update({
          where: { id: currentRound[i].id },
          data: { nextMatchId: nextLBRound[destIdx].id, nextMatchSlot: slot },
        });
        currentRound[i] = { ...currentRound[i], nextMatchId: nextLBRound[destIdx].id, nextMatchSlot: slot };
      }
    } else {
      // Odd rounds (1, 3, 5, ...): 1-to-1 into next even round
      // LBR(odd)[i] winner → LBR(odd+1)[i] slot 1 (WB loser fills slot 2)
      for (let i = 0; i < currentRound.length; i++) {
        await prisma.match.update({
          where: { id: currentRound[i].id },
          data: { nextMatchId: nextLBRound[i].id, nextMatchSlot: 1 },
        });
        currentRound[i] = { ...currentRound[i], nextMatchId: nextLBRound[i].id, nextMatchSlot: 1 };
      }
    }
  }

  // ── Wire WB losers into LB ─────────────────────────────────────────────────
  // lbRound=1: WBR1 losers fill LBR1 pairs
  //   WBR1[2i]   → LBR1[i] slot1 (via loserNextMatchId)
  //   WBR1[2i+1] → LBR1[i] slot2 (via loserNextMatchId)
  //   Skip BYE matches (no loser)
  const lbR1 = allLBMatches[0];
  for (let i = 0; i < wbRound1.length; i++) {
    if (wbRound1[i].isBye) continue; // BYE has no loser
    const destIdx = Math.floor(i / 2);
    const slot = (i % 2) + 1;
    await prisma.match.update({
      where: { id: wbRound1[i].id },
      data: { loserNextMatchId: lbR1[destIdx].id, loserNextMatchSlot: slot },
    });
    wbRound1[i] = { ...wbRound1[i], loserNextMatchId: lbR1[destIdx].id, loserNextMatchSlot: slot };
  }

  // Even lbRounds: WBR(k+1) losers → LBR(even) slot2, where k = lbRound/2
  for (let lbRound = 2; lbRound <= totalLBRounds; lbRound += 2) {
    const k = lbRound / 2; // which WB round's losers drop here
    // WBR(k+1) = allWBMatches[k] (0-indexed: allWBMatches[0] = WBR1, allWBMatches[k] = WBR(k+1))
    const wbRoundMatches = allWBMatches[k]; // WBR(k+1) matches
    const lbTarget = allLBMatches[lbRound - 1]; // LBR(lbRound) matches (0-indexed)
    if (!wbRoundMatches || !lbTarget) continue;
    for (let i = 0; i < wbRoundMatches.length; i++) {
      await prisma.match.update({
        where: { id: wbRoundMatches[i].id },
        data: { loserNextMatchId: lbTarget[i].id, loserNextMatchSlot: 2 },
      });
      wbRoundMatches[i] = { ...wbRoundMatches[i], loserNextMatchId: lbTarget[i].id, loserNextMatchSlot: 2 };
    }
  }

  // ── Grand Final ───────────────────────────────────────────────────────────
  const wbFinal = allWBMatches[allWBMatches.length - 1][0];
  const lbFinal = allLBMatches[allLBMatches.length - 1][0];
  const grandFinal = await prisma.match.create({
    data: { tournamentId, stageId: grandFinalStage.id, roundNumber: rounds + totalLBRounds + 1 },
  });

  // WB Final winner → GF slot1
  await prisma.match.update({
    where: { id: wbFinal.id },
    data: { nextMatchId: grandFinal.id, nextMatchSlot: 1 },
  });
  // LB Final winner → GF slot2
  await prisma.match.update({
    where: { id: lbFinal.id },
    data: { nextMatchId: grandFinal.id, nextMatchSlot: 2 },
  });

  // Detect LBR1 matches that will NEVER receive any player (both WBR1 feeders are BYEs).
  // Mark them as dead (isFinished: true, isBye: true, winnerId: null) so that
  // downstream advanceLoser calls can correctly skip them via the willGetWinner check.
  for (let i = 0; i < lbR1.length; i++) {
    const lbMatch = lbR1[i]; // in-memory; no slots filled yet at generation time
    const slot1WillFill = wbRound1.some(
      (m: any) => !m.isBye && m.loserNextMatchId === lbMatch.id && m.loserNextMatchSlot === 1
    );
    const slot2WillFill = wbRound1.some(
      (m: any) => !m.isBye && m.loserNextMatchId === lbMatch.id && m.loserNextMatchSlot === 2
    );
    if (!slot1WillFill && !slot2WillFill) {
      // No real WBR1 loser feeds either slot — match is permanently empty.
      await prisma.match.update({
        where: { id: lbMatch.id },
        data: { isFinished: true, isBye: true, winnerId: null },
      });
      // winnerId is null so there is nothing to advance to LBR2.
      // The downstream even-round match will auto-BYE when its WB loser arrives,
      // because willGetWinner (with isFinished: false filter) will correctly return null.
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Round Robin
// ─────────────────────────────────────────────────────────────────────────────

export async function generateRoundRobin(
  tournamentId: number,
  groupId: number,
  participantIds: number[],
) {
  const stage = await ensureStage('Групповой этап');
  const schedule = buildRoundRobinSchedule(participantIds);

  for (let roundIdx = 0; roundIdx < schedule.length; roundIdx++) {
    for (const [p1, p2] of schedule[roundIdx]) {
      await prisma.match.create({
        data: {
          tournamentId,
          stageId: stage.id,
          groupId,
          roundNumber: roundIdx + 1,
          player1Id: p1,
          player2Id: p2,
        },
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Swiss
// ─────────────────────────────────────────────────────────────────────────────

export async function generateSwissRound(
  tournamentId: number,
  roundNumber: number,
  participantIds: number[],
) {
  const stage = await ensureStage('Швейцарская система');

  // Get current standings
  const standings = await getSwissStandings(tournamentId, participantIds);

  // Sort by points DESC, then Buchholz DESC
  standings.sort((a, b) => b.points - a.points || b.buchholz - a.buchholz);

  // Get all previous matches to avoid rematches
  const previousMatches = await prisma.match.findMany({
    where: { tournamentId, roundNumber: { lt: roundNumber } },
    select: { player1Id: true, player2Id: true },
  });
  const hadMatch = new Set<string>();
  for (const m of previousMatches) {
    if (m.player1Id && m.player2Id) {
      hadMatch.add(`${m.player1Id}-${m.player2Id}`);
      hadMatch.add(`${m.player2Id}-${m.player1Id}`);
    }
  }

  // Check who already got a bye
  const byeRecipients = await prisma.match.findMany({
    where: { tournamentId, isBye: true },
    select: { player1Id: true },
  });
  const hadBye = new Set(byeRecipients.map((m) => m.player1Id));

  // Pair players
  const paired = new Set<number>();
  const pairs: [number, number | null][] = [];

  for (let i = 0; i < standings.length; i++) {
    const pid = standings[i].participantId;
    if (paired.has(pid)) continue;

    let found = false;
    for (let j = i + 1; j < standings.length; j++) {
      const opponent = standings[j].participantId;
      if (paired.has(opponent)) continue;
      if (hadMatch.has(`${pid}-${opponent}`)) continue;

      pairs.push([pid, opponent]);
      paired.add(pid);
      paired.add(opponent);
      found = true;
      break;
    }

    if (!found) {
      // This player gets a bye (if not already had one, prefer them last)
      pairs.push([pid, null]);
      paired.add(pid);
    }
  }

  // Handle odd-player bye: assign to lowest ranked unpaired player
  // (already handled above by pairing loop)

  // Create matches
  for (const [p1, p2] of pairs) {
    const isBye = p2 === null;
    await prisma.match.create({
      data: {
        tournamentId,
        stageId: stage.id,
        roundNumber,
        player1Id: p1,
        player2Id: p2,
        isFinished: isBye,
        winnerId: isBye ? p1 : null,
        isBye,
      },
    });
  }
}

export async function getSwissStandings(tournamentId: number, participantIds: number[]) {
  const matches = await prisma.match.findMany({
    where: { tournamentId, isFinished: true },
    include: {
      results: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });

  const points: Record<number, number> = {};
  for (const id of participantIds) points[id] = 0;

  for (const m of matches) {
    if (m.isBye && m.player1Id) {
      points[m.player1Id] = (points[m.player1Id] ?? 0) + 1;
    } else if (m.winnerId) {
      points[m.winnerId] = (points[m.winnerId] ?? 0) + 1;
    } else if (m.results[0]) {
      const r = m.results[0];
      if (r.player1Score === r.player2Score) {
        if (m.player1Id) points[m.player1Id] = (points[m.player1Id] ?? 0) + 0.5;
        if (m.player2Id) points[m.player2Id] = (points[m.player2Id] ?? 0) + 0.5;
      }
    }
  }

  // Calculate Buchholz: sum of opponents' points
  const buchholz: Record<number, number> = {};
  for (const id of participantIds) buchholz[id] = 0;

  for (const m of matches) {
    if (!m.player1Id || !m.player2Id || m.isBye) continue;
    buchholz[m.player1Id] = (buchholz[m.player1Id] ?? 0) + (points[m.player2Id] ?? 0);
    buchholz[m.player2Id] = (buchholz[m.player2Id] ?? 0) + (points[m.player1Id] ?? 0);
  }

  return participantIds.map((id) => ({
    participantId: id,
    points: points[id] ?? 0,
    buchholz: buchholz[id] ?? 0,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Mixed (Group stage + Single Elimination playoff)
// ─────────────────────────────────────────────────────────────────────────────

export async function generateMixedGroupStage(
  tournamentId: number,
  groups: Array<{ groupId: number; participantIds: number[] }>,
) {
  for (const { groupId, participantIds } of groups) {
    await generateRoundRobin(tournamentId, groupId, participantIds);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Advance winner to next match
// ─────────────────────────────────────────────────────────────────────────────

export async function advanceWinner(match: {
  id: number;
  winnerId: number | null;
  nextMatchId?: number | null;
  nextMatchSlot?: number | null;
  tournamentId?: number;
}) {
  if (!match.winnerId) return;

  // Check if this is a CUSTOM tournament with conditional advancement
  let nextMatchId = match.nextMatchId;
  let nextMatchSlot = match.nextMatchSlot;
  let nextGroupId: number | null = null;
  let nextGroupSlot: number | null = null;
  let gridMeta: any = null;

  if (match.tournamentId) {
    const tournament = await prisma.tournament.findUnique({
      where: { id: match.tournamentId },
      select: { format: true, gridJson: true },
    });

    if (tournament?.gridJson) {
      try {
        gridMeta = JSON.parse(tournament.gridJson);
        if (gridMeta?.conditionalAdvancement?.[match.id]) {
          const advancement = gridMeta.conditionalAdvancement[match.id];

          // Determine which player won to choose the correct advancement path
          const fullMatch = await prisma.match.findUnique({
            where: { id: match.id },
            select: { player1Id: true, player2Id: true },
          });

          if (fullMatch) {
            if (match.winnerId === fullMatch.player1Id && advancement.winner1NextMatchId) {
              nextMatchId = advancement.winner1NextMatchId;
              nextMatchSlot = advancement.winner1NextMatchSlot;
              if (advancement.winner1NextGroupId) {
                nextGroupId = advancement.winner1NextGroupId;
                nextGroupSlot = advancement.winner1NextGroupSlot ?? null;
              }
            } else if (match.winnerId === fullMatch.player2Id && advancement.winner2NextMatchId) {
              nextMatchId = advancement.winner2NextMatchId;
              nextMatchSlot = advancement.winner2NextMatchSlot;
              if (advancement.winner2NextGroupId) {
                nextGroupId = advancement.winner2NextGroupId;
                nextGroupSlot = advancement.winner2NextGroupSlot ?? null;
              }
            } else if (advancement.winner1NextMatchId) {
              // Fallback to winner-1 path if available
              nextMatchId = advancement.winner1NextMatchId;
              nextMatchSlot = advancement.winner1NextMatchSlot;
              if (advancement.winner1NextGroupId) {
                nextGroupId = advancement.winner1NextGroupId;
                nextGroupSlot = advancement.winner1NextGroupSlot ?? null;
              }
            } else if (match.winnerId === fullMatch.player1Id && advancement.winner1NextGroupId) {
              nextGroupId = advancement.winner1NextGroupId;
              nextGroupSlot = advancement.winner1NextGroupSlot ?? null;
            } else if (match.winnerId === fullMatch.player2Id && advancement.winner2NextGroupId) {
              nextGroupId = advancement.winner2NextGroupId;
              nextGroupSlot = advancement.winner2NextGroupSlot ?? null;
            }
          }
        }
      } catch (err) {
        console.error('Error parsing tournament gridJson (conditional advancement):', err);
      }
    }
  }

  if (!nextMatchId && nextGroupId && match.tournamentId) {
    await assignParticipantToGroup(match.tournamentId, nextGroupId, match.winnerId, nextGroupSlot);
    return;
  }
  if (!nextMatchId) return;

  const nextMatch = await prisma.match.findUnique({ where: { id: nextMatchId } });
  if (!nextMatch) return;

  const slot = nextMatchSlot ?? 1;
  const updateData: any = {};
  if (slot === 1) {
    updateData.player1Id = match.winnerId;
  } else {
    updateData.player2Id = match.winnerId;
  }

  // Check if both slots are now filled — auto-handle byes in next match
  const updated = await prisma.match.update({ where: { id: nextMatchId }, data: updateData });

  // If new match has both players, nothing needed. If one is auto-bye, handle it.
  if (updated.player1Id && !updated.player2Id) {
    // Wait for slot 2
  } else if (!updated.player1Id && updated.player2Id) {
    // Wait for slot 1
  }

  // Auto-advance if the other slot will never be filled (custom templates/byes)
  if (match.tournamentId && gridMeta?.customMatchInputSlots?.[nextMatchId]) {
    const inputMeta = gridMeta.customMatchInputSlots[nextMatchId];
    const otherSlot = slot === 1 ? 2 : 1;
    const otherHasInput = otherSlot === 1 ? !!inputMeta?.hasSlot1 : !!inputMeta?.hasSlot2;
    const otherFilled = otherSlot === 1 ? !!updated.player1Id : !!updated.player2Id;
    const winnerId = slot === 1 ? updated.player1Id : updated.player2Id;

    if (!otherFilled && !otherHasInput && winnerId) {
      await prisma.match.update({
        where: { id: nextMatchId },
        data: { isFinished: true, isBye: true, winnerId },
      });
      const fullNext = await prisma.match.findUnique({ where: { id: nextMatchId } });
      if (fullNext?.winnerId) {
        await advanceWinner({
          id: fullNext.id,
          winnerId: fullNext.winnerId,
          nextMatchId: fullNext.nextMatchId,
          nextMatchSlot: fullNext.nextMatchSlot,
          tournamentId: match.tournamentId,
        });
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Advance loser to lower bracket (Double Elimination)
// ─────────────────────────────────────────────────────────────────────────────

export async function advanceLoser(match: {
  id: number;
  player1Id: number | null;
  player2Id: number | null;
  winnerId: number | null;
  loserNextMatchId?: number | null;
  loserNextMatchSlot?: number | null;
  tournamentId?: number;
}) {
  let loserNextMatchId = match.loserNextMatchId;
  let loserNextMatchSlot = match.loserNextMatchSlot;
  let loserNextGroupId: number | null = null;
  let loserNextGroupSlot: number | null = null;
  let gridMeta: any = null;

  // Check if this is a CUSTOM tournament with conditional advancement
  if (match.tournamentId) {
    const tournament = await prisma.tournament.findUnique({
      where: { id: match.tournamentId },
      select: { format: true, gridJson: true },
    });

    if (tournament?.gridJson) {
      try {
        gridMeta = JSON.parse(tournament.gridJson);
        if (gridMeta?.conditionalAdvancement?.[match.id]) {
          const advancement = gridMeta.conditionalAdvancement[match.id];
          if (advancement.loserNextMatchId) {
            loserNextMatchId = advancement.loserNextMatchId;
            loserNextMatchSlot = advancement.loserNextMatchSlot;
          }
          if (advancement.loserNextGroupId) {
            loserNextGroupId = advancement.loserNextGroupId;
            loserNextGroupSlot = advancement.loserNextGroupSlot ?? null;
          }
        }
      } catch (err) {
        console.error('Error parsing tournament gridJson (conditional advancement):', err);
      }
    }
  }

  if (!loserNextMatchId && loserNextGroupId && match.tournamentId) {
    const loserId = match.winnerId === match.player1Id ? match.player2Id : match.player1Id;
    if (loserId) {
      await assignParticipantToGroup(match.tournamentId, loserNextGroupId, loserId, loserNextGroupSlot);
    }
    return;
  }
  if (!loserNextMatchId) return;
  const loserId = match.winnerId === match.player1Id ? match.player2Id : match.player1Id;
  if (!loserId) return;

  const slot = loserNextMatchSlot ?? 1;
  const updateData: any = slot === 1
    ? { player1Id: loserId }
    : { player2Id: loserId };

  const lbMatch = await prisma.match.update({
    where: { id: loserNextMatchId },
    data: updateData,
  });

  // Auto-advance if the other slot will never be filled (custom templates/byes)
  if (match.tournamentId && gridMeta?.customMatchInputSlots?.[loserNextMatchId]) {
    const inputMeta = gridMeta.customMatchInputSlots[loserNextMatchId];
    const otherSlot = slot === 1 ? 2 : 1;
    const otherHasInput = otherSlot === 1 ? !!inputMeta?.hasSlot1 : !!inputMeta?.hasSlot2;
    const otherFilled = otherSlot === 1 ? !!lbMatch.player1Id : !!lbMatch.player2Id;
    const winnerId = slot === 1 ? lbMatch.player1Id : lbMatch.player2Id;

    if (!otherFilled && !otherHasInput && winnerId) {
      await prisma.match.update({
        where: { id: loserNextMatchId },
        data: { isFinished: true, isBye: true, winnerId },
      });
      const fullNext = await prisma.match.findUnique({ where: { id: loserNextMatchId } });
      if (fullNext?.winnerId) {
        await advanceWinner({
          id: fullNext.id,
          winnerId: fullNext.winnerId,
          nextMatchId: fullNext.nextMatchId,
          nextMatchSlot: fullNext.nextMatchSlot,
          tournamentId: match.tournamentId,
        });
      }
    }
  }

  // Check if the other slot will ever be filled; if not, auto-advance as BYE
  const otherSlot = slot === 1 ? 2 : 1;
  const otherFilled = otherSlot === 1 ? !!lbMatch.player1Id : !!lbMatch.player2Id;

  if (!otherFilled) {
    const [willGetLoser, willGetWinner] = await Promise.all([
      prisma.match.findFirst({
        where: {
          loserNextMatchId: match.loserNextMatchId,
          loserNextMatchSlot: otherSlot,
          isBye: false,
          isFinished: false,
        },
      }),
      prisma.match.findFirst({
        where: {
          nextMatchId: match.loserNextMatchId,
          nextMatchSlot: otherSlot,
          isFinished: false, // dead matches (isFinished: true, winnerId: null) must not block
        },
      }),
    ]);

    if (!willGetLoser && !willGetWinner) {
      // Permanently empty slot — auto-advance the lone player as BYE
      await prisma.match.update({
        where: { id: loserNextMatchId! },
        data: { isFinished: true, isBye: true, winnerId: loserId },
      });
      const fullLbMatch = await prisma.match.findUnique({ where: { id: loserNextMatchId! } });
      if (fullLbMatch?.nextMatchId) {
        await advanceWinner({
          id: fullLbMatch.id,
          winnerId: loserId,
          nextMatchId: fullLbMatch.nextMatchId,
          nextMatchSlot: fullLbMatch.nextMatchSlot,
          tournamentId: match.tournamentId,
        });
      }
    }
  }
}

export async function assignParticipantToGroup(
  tournamentId: number,
  groupId: number,
  participantId: number,
  _slot?: number | null,
) {
  // Avoid duplicates
  const exists = await prisma.groupParticipant.findFirst({
    where: { groupId, participantId },
  });
  if (exists) return;

  // Read group size / expected count from gridJson metadata (if available)
  let groupSize: number | null = null;
  let expectedCount: number | null = null;
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { gridJson: true, customSchema: true },
  });
  if (tournament?.gridJson) {
    try {
      const meta = JSON.parse(tournament.gridJson);
      if (meta?.customGroupSizes?.[groupId]) {
        groupSize = Number(meta.customGroupSizes[groupId]);
      }
      if (meta?.customGroupExpectedCounts?.[groupId]) {
        expectedCount = Number(meta.customGroupExpectedCounts[groupId]);
      } else if (tournament?.customSchema && meta?.customGroupMap) {
        // Fallback for older tournaments: derive expected count from schema edges
        const groupNodeId = Object.entries(meta.customGroupMap).find(([, gid]) => gid === groupId)?.[0];
        if (groupNodeId) {
          try {
            const schema = JSON.parse(tournament.customSchema);
            const edges = schema?.edges ?? [];
            const incomingSlots = new Set<number>();
            for (const e of edges) {
              if (e.target !== groupNodeId) continue;
              const slot = parseInputSlot(e.targetHandle);
              incomingSlots.add(slot);
            }
            if (incomingSlots.size > 0) expectedCount = incomingSlots.size;
          } catch {
            // ignore
          }
        }
      }
    } catch {
      // ignore
    }
  }

  const targetCount = expectedCount ?? groupSize;
  const currentCount = await prisma.groupParticipant.count({ where: { groupId } });
  if (targetCount && currentCount >= targetCount) return;

  await prisma.groupParticipant.create({
    data: { groupId, participantId },
  });

  // If the group is now full, generate round-robin matches (only once)
  const newCount = currentCount + 1;
  if (targetCount && newCount >= targetCount) {
    const existingMatches = await prisma.match.count({ where: { groupId, tournamentId } });
    if (existingMatches === 0) {
      const participants = await prisma.groupParticipant.findMany({
        where: { groupId },
        select: { participantId: true },
      });
      const participantIds = participants.map((p) => p.participantId);
      if (participantIds.length >= 2) {
        const groupStage = await ensureStage('РљР°СЃС‚РѕРјРЅС‹Р№ РіСЂСѓРїРїРѕРІРѕР№ СЌС‚Р°Рї');
        const schedule = buildRoundRobinSchedule(participantIds);
        for (let roundIdx = 0; roundIdx < schedule.length; roundIdx++) {
          for (const [p1, p2] of schedule[roundIdx]) {
            await prisma.match.create({
              data: {
                tournamentId,
                stageId: groupStage.id,
                groupId,
                roundNumber: roundIdx + 1,
                player1Id: p1,
                player2Id: p2,
              },
            });
          }
        }
      }
    }
  }
}

export async function autoAdvanceCustomBye(tournamentId: number, matchId: number) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { gridJson: true },
  });
  if (!tournament?.gridJson) return;

  let gridMeta: any;
  try { gridMeta = JSON.parse(tournament.gridJson); } catch { return; }
  const inputMeta = gridMeta?.customMatchInputSlots?.[matchId];
  if (!inputMeta) return;

  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match || match.isFinished) return;

  const hasP1 = !!match.player1Id;
  const hasP2 = !!match.player2Id;
  if ((hasP1 && hasP2) || (!hasP1 && !hasP2)) return;

  const emptySlot = hasP1 ? 2 : 1;
  const emptyHasInput = emptySlot === 1 ? !!inputMeta.hasSlot1 : !!inputMeta.hasSlot2;
  if (emptyHasInput) return;

  const winnerId = hasP1 ? match.player1Id : match.player2Id;
  if (!winnerId) return;

  await prisma.match.update({
    where: { id: matchId },
    data: { isFinished: true, isBye: true, winnerId },
  });

  await advanceWinner({
    id: matchId,
    winnerId,
    nextMatchId: match.nextMatchId,
    nextMatchSlot: match.nextMatchSlot,
    tournamentId,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildSingleEliminationBracket(participants: number[], totalSlots: number): (number | null)[] {
  // Build seeded slot order using recursive folding:
  // [1,2] → [1,4,3,2] → [1,8,4,5,3,6,2,7] → ...
  // This ensures top seeds are spread across the bracket and BYEs
  // always land in the p2 slot (never null vs null).
  let seeds = [1, 2];
  while (seeds.length < totalSlots) {
    const n = seeds.length * 2;
    seeds = seeds.flatMap((s) => [s, n + 1 - s]);
  }
  return seeds.map((s) => (s <= participants.length ? participants[s - 1] : null));
}

export function buildRoundRobinSchedule(participants: number[]): [number, number][][] {
  const n = participants.length;
  const rounds: [number, number][][] = [];
  const list = [...participants];
  if (n % 2 !== 0) list.push(-1); // dummy bye

  const numRounds = list.length - 1;
  const half = list.length / 2;

  for (let round = 0; round < numRounds; round++) {
    const pairs: [number, number][] = [];
    for (let i = 0; i < half; i++) {
      const home = list[i];
      const away = list[list.length - 1 - i];
      if (home !== -1 && away !== -1) {
        pairs.push([home, away]);
      }
    }
    rounds.push(pairs);

    // Rotate: fix first element, rotate the rest
    const last = list.pop()!;
    list.splice(1, 0, last);
  }

  return rounds;
}

function buildRoundNames(rounds: number, type: 'single'): string[] {
  const names: string[] = [];
  for (let i = 1; i <= rounds; i++) {
    if (i === rounds) names.push('Финал');
    else if (i === rounds - 1) names.push('1/2 финала');
    else if (i === rounds - 2) names.push('1/4 финала');
    else if (i === rounds - 3) names.push('1/8 финала');
    else names.push(`Раунд ${i}`);
  }
  return names;
}

function parseInputSlot(handle: string | null | undefined): number {
  if (!handle) return 1;
  const num = parseInt(handle.replace(/[^0-9]/g, ''));
  if (isNaN(num)) return 1;
  return num === 0 ? 1 : num;
}

async function ensureStage(name: string) {
  return prisma.stage.upsert({
    where: { name },
    update: {},
    create: { name },
  });
}

async function ensureStages(names: string[]) {
  return Promise.all(names.map(ensureStage));
}
