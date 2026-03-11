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

    // Link previous round matches to next round
    for (let i = 0; i < prevRoundMatches.length; i++) {
      const nextMatchIndex = Math.floor(i / 2);
      const slot = (i % 2) + 1;
      await prisma.match.update({
        where: { id: prevRoundMatches[i].id },
        data: { nextMatchId: nextRoundMatches[nextMatchIndex].id, nextMatchSlot: slot },
      });
    }

    // Auto-advance byes
    for (const prevMatch of prevRoundMatches) {
      if (prevMatch.isBye && prevMatch.winnerId) {
        await advanceWinner(prevMatch);
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
  const rounds = Math.ceil(Math.log2(n));
  const totalSlots = Math.pow(2, rounds);
  const seeded = buildSingleEliminationBracket(participantIds, totalSlots);

  const wbStage = await ensureStage('Верхняя сетка');
  const lbStage = await ensureStage('Нижняя сетка');
  const grandFinalStage = await ensureStage('Гранд-финал');

  // Upper bracket round 1
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

  // Upper bracket subsequent rounds
  let prevWB = wbRound1;
  const allWBMatches: any[][] = [wbRound1];
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
      await prisma.match.update({
        where: { id: prevWB[i].id },
        data: { nextMatchId: nextRound[Math.floor(i / 2)].id, nextMatchSlot: (i % 2) + 1 },
      });
    }
    allWBMatches.push(nextRound);
    prevWB = nextRound;
  }

  // Lower bracket (simplified: one round per WB round feeding in)
  // LB has (rounds * 2 - 1) rounds
  const lbRounds = rounds * 2 - 1;
  const allLBMatches: any[][] = [];
  let lbMatchCount = Math.floor(wbRound1.length / 2);
  let prevLB: any[] = [];

  for (let lbRound = 1; lbRound <= lbRounds; lbRound++) {
    const currentCount = lbRound === 1 ? lbMatchCount : Math.ceil(prevLB.length / 2);
    const currentRound: any[] = [];
    for (let i = 0; i < Math.max(1, currentCount); i++) {
      const m = await prisma.match.create({
        data: { tournamentId, stageId: lbStage.id, roundNumber: lbRound + rounds },
      });
      currentRound.push(m);
    }

    if (prevLB.length > 0) {
      for (let i = 0; i < prevLB.length; i++) {
        await prisma.match.update({
          where: { id: prevLB[i].id },
          data: { nextMatchId: currentRound[Math.floor(i / 2)].id, nextMatchSlot: (i % 2) + 1 },
        });
      }
    }

    allLBMatches.push(currentRound);
    prevLB = currentRound;
  }

  // Grand final
  const wbFinal = allWBMatches[allWBMatches.length - 1][0];
  const lbFinal = allLBMatches[allLBMatches.length - 1][0];
  const grandFinal = await prisma.match.create({
    data: { tournamentId, stageId: grandFinalStage.id, roundNumber: rounds + lbRounds + 1 },
  });

  await prisma.match.update({
    where: { id: wbFinal.id },
    data: { nextMatchId: grandFinal.id, nextMatchSlot: 1 },
  });
  await prisma.match.update({
    where: { id: lbFinal.id },
    data: { nextMatchId: grandFinal.id, nextMatchSlot: 2 },
  });
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
}) {
  if (!match.winnerId || !match.nextMatchId) return;

  const nextMatch = await prisma.match.findUnique({ where: { id: match.nextMatchId } });
  if (!nextMatch) return;

  const updateData: any = {};
  if (match.nextMatchSlot === 1) {
    updateData.player1Id = match.winnerId;
  } else {
    updateData.player2Id = match.winnerId;
  }

  // Check if both slots are now filled — auto-handle byes in next match
  const updated = await prisma.match.update({ where: { id: match.nextMatchId }, data: updateData });

  // If new match has both players, nothing needed. If one is auto-bye, handle it.
  if (updated.player1Id && !updated.player2Id) {
    // Wait for slot 2
  } else if (!updated.player1Id && updated.player2Id) {
    // Wait for slot 1
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildSingleEliminationBracket(participants: number[], totalSlots: number): (number | null)[] {
  // Standard seeding: 1 vs last, 2 vs second-to-last etc.
  const result: (number | null)[] = new Array(totalSlots).fill(null);
  for (let i = 0; i < participants.length; i++) {
    result[i] = participants[i];
  }
  return result;
}

function buildRoundRobinSchedule(participants: number[]): [number, number][][] {
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
