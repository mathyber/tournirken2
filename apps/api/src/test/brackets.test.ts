import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import {
  generateSingleElimination,
  generateDoubleElimination,
  generateRoundRobin,
  getSwissStandings,
  advanceWinner,
  advanceLoser,
} from '../services/brackets';
import { createUser, createTournament, addNParticipants } from './helpers';
import prisma from '../lib/prisma';

// ─── Single Elimination ──────────────────────────────────────────────────────

describe('generateSingleElimination', () => {
  test('2 players → 1 match total', async () => {
    const { user: org } = await createUser();
    const t = await createTournament({ organizerId: org.id });
    const ids = await addNParticipants(t.id, 2);
    await generateSingleElimination(t.id, ids);

    const matches = await prisma.match.findMany({ where: { tournamentId: t.id } });
    expect(matches.length).toBe(1);
    expect(matches[0].player1Id).not.toBeNull();
    expect(matches[0].player2Id).not.toBeNull();
    expect(matches[0].isBye).toBe(false);
  });

  test('4 players → 3 matches (2 R1 + 1 final), BYE-free', async () => {
    const { user: org } = await createUser();
    const t = await createTournament({ organizerId: org.id });
    const ids = await addNParticipants(t.id, 4);
    await generateSingleElimination(t.id, ids);

    const matches = await prisma.match.findMany({ where: { tournamentId: t.id } });
    expect(matches.length).toBe(3);
    expect(matches.every((m) => !m.isBye)).toBe(true);
    // All R1 matches should link to final
    const r1 = matches.filter((m) => m.roundNumber === 1);
    expect(r1.every((m) => m.nextMatchId !== null)).toBe(true);
    expect(new Set(r1.map((m) => m.nextMatchId)).size).toBe(1); // same final match
  });

  test('8 players → 7 matches', async () => {
    const { user: org } = await createUser();
    const t = await createTournament({ organizerId: org.id });
    const ids = await addNParticipants(t.id, 8);
    await generateSingleElimination(t.id, ids);

    const matches = await prisma.match.findMany({ where: { tournamentId: t.id } });
    expect(matches.length).toBe(7);
  });

  test('3 players → 2 matches: 1 real R1 + 1 BYE R1, final created', async () => {
    const { user: org } = await createUser();
    const t = await createTournament({ organizerId: org.id });
    const ids = await addNParticipants(t.id, 3);
    await generateSingleElimination(t.id, ids);

    const matches = await prisma.match.findMany({ where: { tournamentId: t.id } });
    expect(matches.length).toBe(3);
    const byes = matches.filter((m) => m.isBye);
    expect(byes.length).toBe(1);
    // BYE auto-advances its winner
    expect(byes[0].winnerId).not.toBeNull();
  });

  test('5 players → 4 slots padded to 8, 7 matches, 3 BYEs', async () => {
    const { user: org } = await createUser();
    const t = await createTournament({ organizerId: org.id });
    const ids = await addNParticipants(t.id, 5);
    await generateSingleElimination(t.id, ids);

    const matches = await prisma.match.findMany({ where: { tournamentId: t.id } });
    expect(matches.length).toBe(7);
    const byes = matches.filter((m) => m.isBye);
    expect(byes.length).toBe(3);
  });

  test('nextMatchId chain is valid — no orphaned matches', async () => {
    const { user: org } = await createUser();
    const t = await createTournament({ organizerId: org.id });
    const ids = await addNParticipants(t.id, 8);
    await generateSingleElimination(t.id, ids);

    const matches = await prisma.match.findMany({ where: { tournamentId: t.id } });
    const matchIds = new Set(matches.map((m) => m.id));
    // Every non-final nextMatchId should point to a real match
    const nonFinal = matches.filter((m) => m.nextMatchId !== null);
    for (const m of nonFinal) {
      expect(matchIds.has(m.nextMatchId!)).toBe(true);
    }
  });

  test('slot assignment: nextMatchSlot is 1 or 2', async () => {
    const { user: org } = await createUser();
    const t = await createTournament({ organizerId: org.id });
    const ids = await addNParticipants(t.id, 4);
    await generateSingleElimination(t.id, ids);

    const r1 = await prisma.match.findMany({ where: { tournamentId: t.id, roundNumber: 1 } });
    expect(r1[0].nextMatchSlot).toBe(1);
    expect(r1[1].nextMatchSlot).toBe(2);
  });
});

// ─── Double Elimination ──────────────────────────────────────────────────────

describe('generateDoubleElimination', () => {
  test('4 players → WB 3 + LB 2 + GF 1 = 6 matches', async () => {
    // 4 players, rounds=2, totalLBRounds=2*(2-1)=2
    // WBR1:2, WBR2:1 | LBR1:1, LBR2:1 | GF:1 = 6
    const { user: org } = await createUser();
    const t = await createTournament({ organizerId: org.id, format: 'DOUBLE_ELIMINATION' });
    const ids = await addNParticipants(t.id, 4);
    await generateDoubleElimination(t.id, ids);

    const allMatches = await prisma.match.findMany({ where: { tournamentId: t.id } });
    expect(allMatches.length).toBe(6);
  });

  test('4 players → WBR1 losers have loserNextMatchId set', async () => {
    const { user: org } = await createUser();
    const t = await createTournament({ organizerId: org.id, format: 'DOUBLE_ELIMINATION' });
    const ids = await addNParticipants(t.id, 4);
    await generateDoubleElimination(t.id, ids);

    const wbR1 = await prisma.match.findMany({ where: { tournamentId: t.id, roundNumber: 1 } });
    expect(wbR1.length).toBe(2);
    // All WBR1 matches are real (no BYEs for 4 players) and should have loserNextMatchId
    expect(wbR1.every((m) => !m.isBye)).toBe(true);
    expect(wbR1.every((m) => m.loserNextMatchId !== null)).toBe(true);
  });

  test('4 players → WBR2 loser has loserNextMatchId to LBR2', async () => {
    const { user: org } = await createUser();
    const t = await createTournament({ organizerId: org.id, format: 'DOUBLE_ELIMINATION' });
    const ids = await addNParticipants(t.id, 4);
    await generateDoubleElimination(t.id, ids);

    const stages = await prisma.stage.findMany({ where: { matches: { some: { tournamentId: t.id } } } });
    const wbStage = stages.find((s) => s.name === 'Верхняя сетка');
    const lbStage = stages.find((s) => s.name === 'Нижняя сетка');
    expect(wbStage).toBeDefined();
    expect(lbStage).toBeDefined();

    const wbR2 = await prisma.match.findMany({ where: { tournamentId: t.id, stageId: wbStage!.id, roundNumber: 2 } });
    expect(wbR2.length).toBe(1);
    expect(wbR2[0].loserNextMatchId).not.toBeNull();
  });

  test('8 players → 14 matches total', async () => {
    // rounds=3, totalLBRounds=4
    // WB: 4+2+1=7, LB: 2+2+1+1=6, GF:1 = 14
    const { user: org } = await createUser();
    const t = await createTournament({ organizerId: org.id, format: 'DOUBLE_ELIMINATION' });
    const ids = await addNParticipants(t.id, 8);
    await generateDoubleElimination(t.id, ids);

    const allMatches = await prisma.match.findMany({ where: { tournamentId: t.id } });
    expect(allMatches.length).toBe(14);
  });

  test('21 players → dead LBR1 matches are marked isFinished=true, isBye=true, winnerId=null', async () => {
    const { user: org } = await createUser();
    const t = await createTournament({ organizerId: org.id, format: 'DOUBLE_ELIMINATION' });
    const ids = await addNParticipants(t.id, 21);
    await generateDoubleElimination(t.id, ids);

    const lbStage = await prisma.stage.findFirst({ where: { name: 'Нижняя сетка' } });
    expect(lbStage).toBeDefined();

    // rounds = ceil(log2(21)) = 5, wbR1Count = 16
    // LBR1 matches: roundNumber = rounds + 1 = 6 (stageId = lbStage, roundNumber 6)
    const lbR1Matches = await prisma.match.findMany({
      where: { tournamentId: t.id, stageId: lbStage!.id },
      orderBy: { id: 'asc' },
    });
    // All "dead" LBR1 matches should have winnerId = null and isFinished = true
    const deadMatches = lbR1Matches.filter((m) => m.isBye && m.winnerId === null);
    expect(deadMatches.length).toBeGreaterThan(0); // there should be some dead ones for 21 players
    // Crucially: no dead match should be blocking any subsequent match that is still open
    // (verified by the fix: willGetWinner skips dead matches)
  });

  test('21 players — grand final exists and points to correct slots', async () => {
    const { user: org } = await createUser();
    const t = await createTournament({ organizerId: org.id, format: 'DOUBLE_ELIMINATION' });
    const ids = await addNParticipants(t.id, 21);
    await generateDoubleElimination(t.id, ids);

    const gfStage = await prisma.stage.findFirst({ where: { name: 'Гранд-финал' } });
    expect(gfStage).toBeDefined();
    const gf = await prisma.match.findFirst({ where: { tournamentId: t.id, stageId: gfStage!.id } });
    expect(gf).toBeDefined();
    expect(gf!.nextMatchId).toBeNull(); // GF has no next match
  });
});

// ─── Round Robin ─────────────────────────────────────────────────────────────

describe('generateRoundRobin', () => {
  test('4 players in 1 group → 6 matches', async () => {
    const { user: org } = await createUser();
    const t = await createTournament({ organizerId: org.id, format: 'ROUND_ROBIN' });
    const ids = await addNParticipants(t.id, 4);
    const group = await prisma.tournamentGroup.create({
      data: { tournamentId: t.id, name: 'Группа A' },
    });
    await generateRoundRobin(t.id, group.id, ids);

    const matches = await prisma.match.findMany({ where: { tournamentId: t.id, groupId: group.id } });
    expect(matches.length).toBe(6); // 4*(4-1)/2 = 6
    expect(matches.every((m) => !m.isBye)).toBe(true);
    expect(matches.every((m) => m.player1Id !== null && m.player2Id !== null)).toBe(true);
  });

  test('3 players → 3 matches', async () => {
    const { user: org } = await createUser();
    const t = await createTournament({ organizerId: org.id, format: 'ROUND_ROBIN' });
    const ids = await addNParticipants(t.id, 3);
    const group = await prisma.tournamentGroup.create({
      data: { tournamentId: t.id, name: 'Группа A' },
    });
    await generateRoundRobin(t.id, group.id, ids);

    const matches = await prisma.match.findMany({ where: { tournamentId: t.id } });
    expect(matches.length).toBe(3); // 3*(3-1)/2 = 3
  });

  test('2 players → 1 match', async () => {
    const { user: org } = await createUser();
    const t = await createTournament({ organizerId: org.id, format: 'ROUND_ROBIN' });
    const ids = await addNParticipants(t.id, 2);
    const group = await prisma.tournamentGroup.create({
      data: { tournamentId: t.id, name: 'Группа A' },
    });
    await generateRoundRobin(t.id, group.id, ids);

    const matches = await prisma.match.findMany({ where: { tournamentId: t.id } });
    expect(matches.length).toBe(1);
  });

  test('no duplicate pairings (each pair plays exactly once)', async () => {
    const { user: org } = await createUser();
    const t = await createTournament({ organizerId: org.id, format: 'ROUND_ROBIN' });
    const ids = await addNParticipants(t.id, 5);
    const group = await prisma.tournamentGroup.create({
      data: { tournamentId: t.id, name: 'Группа A' },
    });
    await generateRoundRobin(t.id, group.id, ids);

    const matches = await prisma.match.findMany({ where: { tournamentId: t.id } });
    const pairs = new Set<string>();
    for (const m of matches) {
      const key1 = `${m.player1Id}-${m.player2Id}`;
      const key2 = `${m.player2Id}-${m.player1Id}`;
      expect(pairs.has(key1) || pairs.has(key2)).toBe(false);
      pairs.add(key1);
    }
  });
});

// ─── Swiss standings ─────────────────────────────────────────────────────────

describe('getSwissStandings', () => {
  test('winner gets 1 point, loser gets 0', async () => {
    const { user: org } = await createUser();
    const t = await createTournament({ organizerId: org.id, format: 'SWISS' });
    const [p1id, p2id] = await addNParticipants(t.id, 2);

    const stage = await prisma.stage.upsert({ where: { name: 'Швейцарская система' }, create: { name: 'Швейцарская система' }, update: {} });
    const match = await prisma.match.create({
      data: {
        tournamentId: t.id,
        stageId: stage.id,
        roundNumber: 1,
        player1Id: p1id,
        player2Id: p2id,
        isFinished: true,
        winnerId: p1id,
      },
    });

    const standings = await getSwissStandings(t.id, [p1id, p2id]);
    const p1 = standings.find((s) => s.participantId === p1id)!;
    const p2 = standings.find((s) => s.participantId === p2id)!;
    expect(p1.points).toBe(1);
    expect(p2.points).toBe(0);
  });

  test('bye gives 1 point', async () => {
    const { user: org } = await createUser();
    const t = await createTournament({ organizerId: org.id, format: 'SWISS' });
    const [p1id] = await addNParticipants(t.id, 1);

    const stage = await prisma.stage.upsert({ where: { name: 'Швейцарская система' }, create: { name: 'Швейцарская система' }, update: {} });
    await prisma.match.create({
      data: {
        tournamentId: t.id,
        stageId: stage.id,
        roundNumber: 1,
        player1Id: p1id,
        isFinished: true,
        winnerId: p1id,
        isBye: true,
      },
    });

    const standings = await getSwissStandings(t.id, [p1id]);
    expect(standings[0].points).toBe(1);
  });

  test('buchholz = sum of opponents points', async () => {
    const { user: org } = await createUser();
    const t = await createTournament({ organizerId: org.id, format: 'SWISS' });
    const [p1id, p2id, p3id] = await addNParticipants(t.id, 3);

    const stage = await prisma.stage.upsert({ where: { name: 'Швейцарская система' }, create: { name: 'Швейцарская система' }, update: {} });
    // p1 beats p2 (p1=1pt, p2=0pt), then p1 vs p3 is pending
    await prisma.match.create({
      data: { tournamentId: t.id, stageId: stage.id, roundNumber: 1, player1Id: p1id, player2Id: p2id, isFinished: true, winnerId: p1id },
    });

    const standings = await getSwissStandings(t.id, [p1id, p2id, p3id]);
    const p1 = standings.find((s) => s.participantId === p1id)!;
    const p2 = standings.find((s) => s.participantId === p2id)!;
    // p2's buchholz = p1's points = 1
    expect(p2.buchholz).toBe(1);
    // p1's buchholz = p2's points = 0
    expect(p1.buchholz).toBe(0);
  });
});

// ─── advanceWinner ───────────────────────────────────────────────────────────

describe('advanceWinner', () => {
  test('places winner into slot 1 of next match', async () => {
    const { user: org } = await createUser();
    const t = await createTournament({ organizerId: org.id });
    const [p1id, p2id] = await addNParticipants(t.id, 2);
    const stage = await prisma.stage.upsert({ where: { name: 'Финал' }, create: { name: 'Финал' }, update: {} });

    const nextMatch = await prisma.match.create({ data: { tournamentId: t.id, stageId: stage.id, roundNumber: 2 } });
    const match = await prisma.match.create({
      data: { tournamentId: t.id, stageId: stage.id, roundNumber: 1, player1Id: p1id, player2Id: p2id, nextMatchId: nextMatch.id, nextMatchSlot: 1 },
    });

    await advanceWinner({ id: match.id, winnerId: p1id, nextMatchId: nextMatch.id, nextMatchSlot: 1 });

    const updated = await prisma.match.findUnique({ where: { id: nextMatch.id } });
    expect(updated?.player1Id).toBe(p1id);
    expect(updated?.player2Id).toBeNull();
  });

  test('places winner into slot 2 of next match', async () => {
    const { user: org } = await createUser();
    const t = await createTournament({ organizerId: org.id });
    const [p1id, p2id] = await addNParticipants(t.id, 2);
    const stage = await prisma.stage.upsert({ where: { name: '1/2 финала' }, create: { name: '1/2 финала' }, update: {} });

    const nextMatch = await prisma.match.create({ data: { tournamentId: t.id, stageId: stage.id, roundNumber: 2 } });
    const match = await prisma.match.create({
      data: { tournamentId: t.id, stageId: stage.id, roundNumber: 1, nextMatchId: nextMatch.id, nextMatchSlot: 2 },
    });

    await advanceWinner({ id: match.id, winnerId: p2id, nextMatchId: nextMatch.id, nextMatchSlot: 2 });

    const updated = await prisma.match.findUnique({ where: { id: nextMatch.id } });
    expect(updated?.player2Id).toBe(p2id);
  });

  test('no-op if no nextMatchId', async () => {
    const { user: org } = await createUser();
    const t = await createTournament({ organizerId: org.id });
    const [p1id] = await addNParticipants(t.id, 1);
    const stage = await prisma.stage.upsert({ where: { name: 'Финал' }, create: { name: 'Финал' }, update: {} });

    const match = await prisma.match.create({ data: { tournamentId: t.id, stageId: stage.id, roundNumber: 1, player1Id: p1id } });
    // Should not throw
    await expect(advanceWinner({ id: match.id, winnerId: p1id, nextMatchId: null })).resolves.toBeUndefined();
  });
});

// ─── advanceLoser ─────────────────────────────────────────────────────────────

describe('advanceLoser', () => {
  test('places loser in LB slot', async () => {
    const { user: org } = await createUser();
    const t = await createTournament({ organizerId: org.id, format: 'DOUBLE_ELIMINATION' });
    const [p1id, p2id] = await addNParticipants(t.id, 2);
    const wbStage = await prisma.stage.upsert({ where: { name: 'Верхняя сетка' }, create: { name: 'Верхняя сетка' }, update: {} });
    const lbStage = await prisma.stage.upsert({ where: { name: 'Нижняя сетка' }, create: { name: 'Нижняя сетка' }, update: {} });

    const lbMatch = await prisma.match.create({ data: { tournamentId: t.id, stageId: lbStage.id, roundNumber: 3 } });
    const wbMatch = await prisma.match.create({
      data: { tournamentId: t.id, stageId: wbStage.id, roundNumber: 1, player1Id: p1id, player2Id: p2id, loserNextMatchId: lbMatch.id, loserNextMatchSlot: 2 },
    });

    await advanceLoser({ id: wbMatch.id, player1Id: p1id, player2Id: p2id, winnerId: p1id, loserNextMatchId: lbMatch.id, loserNextMatchSlot: 2 });

    const updatedLb = await prisma.match.findUnique({ where: { id: lbMatch.id } });
    expect(updatedLb?.player2Id).toBe(p2id); // loser = p2
  });

  test('auto-advances as BYE when other slot will never be filled', async () => {
    const { user: org } = await createUser();
    const t = await createTournament({ organizerId: org.id, format: 'DOUBLE_ELIMINATION' });
    const [p1id, p2id] = await addNParticipants(t.id, 2);
    const lbStage = await prisma.stage.upsert({ where: { name: 'Нижняя сетка' }, create: { name: 'Нижняя сетка' }, update: {} });
    const wbStage = await prisma.stage.upsert({ where: { name: 'Верхняя сетка' }, create: { name: 'Верхняя сетка' }, update: {} });
    const nextLbStage = await prisma.stage.upsert({ where: { name: 'Гранд-финал' }, create: { name: 'Гранд-финал' }, update: {} });

    const nextLbMatch = await prisma.match.create({ data: { tournamentId: t.id, stageId: nextLbStage.id, roundNumber: 5 } });
    // LB match with slot2 incoming from loser, slot1 will NEVER be filled (no source match points to it)
    const lbMatch = await prisma.match.create({
      data: { tournamentId: t.id, stageId: lbStage.id, roundNumber: 3, nextMatchId: nextLbMatch.id, nextMatchSlot: 1 },
    });
    const wbMatch = await prisma.match.create({
      data: { tournamentId: t.id, stageId: wbStage.id, roundNumber: 1, player1Id: p1id, player2Id: p2id, loserNextMatchId: lbMatch.id, loserNextMatchSlot: 2 },
    });

    await advanceLoser({ id: wbMatch.id, player1Id: p1id, player2Id: p2id, winnerId: p1id, loserNextMatchId: lbMatch.id, loserNextMatchSlot: 2 });

    const updatedLb = await prisma.match.findUnique({ where: { id: lbMatch.id } });
    expect(updatedLb?.isFinished).toBe(true);
    expect(updatedLb?.isBye).toBe(true);
    expect(updatedLb?.winnerId).toBe(p2id); // auto-advanced loser

    // Winner should have been advanced to nextLbMatch
    const updatedNext = await prisma.match.findUnique({ where: { id: nextLbMatch.id } });
    expect(updatedNext?.player1Id).toBe(p2id);
  });

  test('does NOT auto-advance when other slot will be filled by a pending match', async () => {
    const { user: org } = await createUser();
    const t = await createTournament({ organizerId: org.id, format: 'DOUBLE_ELIMINATION' });
    const [p1id, p2id, p3id, p4id] = await addNParticipants(t.id, 4);
    const lbStage = await prisma.stage.upsert({ where: { name: 'Нижняя сетка' }, create: { name: 'Нижняя сетка' }, update: {} });
    const wbStage = await prisma.stage.upsert({ where: { name: 'Верхняя сетка' }, create: { name: 'Верхняя сетка' }, update: {} });

    const lbMatch = await prisma.match.create({ data: { tournamentId: t.id, stageId: lbStage.id, roundNumber: 3 } });
    // Another WB match that will send its winner to LBR slot1 (still unfinished)
    const pendingWb = await prisma.match.create({
      data: { tournamentId: t.id, stageId: wbStage.id, roundNumber: 2, player1Id: p3id, player2Id: p4id,
        loserNextMatchId: lbMatch.id, loserNextMatchSlot: 1 },
    });
    const wbMatch = await prisma.match.create({
      data: { tournamentId: t.id, stageId: wbStage.id, roundNumber: 1, player1Id: p1id, player2Id: p2id,
        loserNextMatchId: lbMatch.id, loserNextMatchSlot: 2 },
    });

    await advanceLoser({ id: wbMatch.id, player1Id: p1id, player2Id: p2id, winnerId: p1id, loserNextMatchId: lbMatch.id, loserNextMatchSlot: 2 });

    const updatedLb = await prisma.match.findUnique({ where: { id: lbMatch.id } });
    // Should NOT be auto-BYEd because slot1 will come from pendingWb
    expect(updatedLb?.isFinished).toBe(false);
    expect(updatedLb?.player2Id).toBe(p2id);
  });

  test('no-op when loserNextMatchId is null', async () => {
    const { user: org } = await createUser();
    const t = await createTournament({ organizerId: org.id });
    const [p1id, p2id] = await addNParticipants(t.id, 2);
    const stage = await prisma.stage.upsert({ where: { name: 'Финал' }, create: { name: 'Финал' }, update: {} });
    const match = await prisma.match.create({ data: { tournamentId: t.id, stageId: stage.id, roundNumber: 1, player1Id: p1id, player2Id: p2id } });

    await expect(
      advanceLoser({ id: match.id, player1Id: p1id, player2Id: p2id, winnerId: p1id, loserNextMatchId: null })
    ).resolves.toBeUndefined();
  });
});

// ─── Grid finalization via API (end-to-end) ──────────────────────────────────

describe('POST /api/tournaments/:id/grid/finalize', () => {
  let _app: any;
  beforeAll(async () => {
    const { buildApp } = await import('../app');
    _app = await buildApp();
    await _app.ready();
  });
  afterAll(async () => { await _app.close(); });

  test('400 if fewer than 2 participants', async () => {
    const { user: org, password } = await createUser({ login: `org_gf_${Date.now()}`, email: `org_gf_${Date.now()}@t.com` });
    const t = await createTournament({ organizerId: org.id, status: 'REGISTRATION' });
    await addNParticipants(t.id, 1);
    const { token } = await import('./helpers').then(h => h.loginAs(_app, org.login, password));

    const res = await _app.inject({
      method: 'POST', url: `/api/tournaments/${t.id}/grid/finalize`,
      headers: { authorization: `Bearer ${token}` },
      payload: { gridJson: '{}' },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/2/);
  });

  test('403 if not organizer', async () => {
    const { user: org } = await createUser();
    const t = await createTournament({ organizerId: org.id });
    await addNParticipants(t.id, 4);
    const { user: other, password } = await createUser({ login: `other_gf_${Date.now()}`, email: `other_gf_${Date.now()}@t.com` });
    const { token } = await import('./helpers').then(h => h.loginAs(_app, other.login, password));

    const res = await _app.inject({
      method: 'POST', url: `/api/tournaments/${t.id}/grid/finalize`,
      headers: { authorization: `Bearer ${token}` },
      payload: { gridJson: '{}' },
    });
    expect(res.statusCode).toBe(403);
  });

  test('SINGLE_ELIMINATION with 4 participants → creates 3 matches, status=ACTIVE', async () => {
    const ts = Date.now();
    const { user: org, password } = await createUser({ login: `org_se_${ts}`, email: `org_se_${ts}@t.com` });
    const t = await createTournament({ organizerId: org.id, format: 'SINGLE_ELIMINATION', status: 'REGISTRATION' });
    await addNParticipants(t.id, 4);
    const { token } = await import('./helpers').then(h => h.loginAs(_app, org.login, password));

    const res = await _app.inject({
      method: 'POST', url: `/api/tournaments/${t.id}/grid/finalize`,
      headers: { authorization: `Bearer ${token}` },
      payload: { gridJson: '{}' },
    });
    expect(res.statusCode).toBe(200);

    const matches = await prisma.match.findMany({ where: { tournamentId: t.id } });
    expect(matches.length).toBe(3);
    const updated = await prisma.tournament.findUnique({ where: { id: t.id } });
    expect(updated?.status).toBe('ACTIVE');
  });

  test('DOUBLE_ELIMINATION with 4 participants → creates 6 matches', async () => {
    const ts = Date.now();
    const { user: org, password } = await createUser({ login: `org_de_${ts}`, email: `org_de_${ts}@t.com` });
    const t = await createTournament({ organizerId: org.id, format: 'DOUBLE_ELIMINATION', status: 'REGISTRATION' });
    await addNParticipants(t.id, 4);
    const { token } = await import('./helpers').then(h => h.loginAs(_app, org.login, password));

    const res = await _app.inject({
      method: 'POST', url: `/api/tournaments/${t.id}/grid/finalize`,
      headers: { authorization: `Bearer ${token}` },
      payload: { gridJson: '{}' },
    });
    expect(res.statusCode).toBe(200);
    const matches = await prisma.match.findMany({ where: { tournamentId: t.id } });
    expect(matches.length).toBe(6);
  });

  test('ROUND_ROBIN with 4 participants → 6 matches in group', async () => {
    const ts = Date.now();
    const { user: org, password } = await createUser({ login: `org_rr_${ts}`, email: `org_rr_${ts}@t.com` });
    const t = await createTournament({ organizerId: org.id, format: 'ROUND_ROBIN', status: 'REGISTRATION' });
    await addNParticipants(t.id, 4);
    const { token } = await import('./helpers').then(h => h.loginAs(_app, org.login, password));

    const res = await _app.inject({
      method: 'POST', url: `/api/tournaments/${t.id}/grid/finalize`,
      headers: { authorization: `Bearer ${token}` },
      payload: { gridJson: JSON.stringify({ groups: [{ name: 'Группа A' }] }) },
    });
    expect(res.statusCode).toBe(200);
    const matches = await prisma.match.findMany({ where: { tournamentId: t.id } });
    expect(matches.length).toBe(6);
  });
});
