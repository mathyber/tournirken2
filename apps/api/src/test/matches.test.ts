import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../app';
import { createUser, loginAs, createTournament, addParticipant, auth } from './helpers';
import prisma from '../lib/prisma';

let app: FastifyInstance;
beforeAll(async () => { app = await buildApp(); await app.ready(); });
afterAll(async () => { await app.close(); });

// Creates a real playoff match with two participants and an organizer token
async function setupMatch(params: { format?: string; onlyOrganizerSetsResults?: boolean } = {}) {
  const { user: org, password: orgPass } = await createUser({ login: `orgm_${Date.now()}`, email: `orgm_${Date.now()}@t.com` });
  const { user: p1, password: p1Pass } = await createUser({ login: `p1_${Date.now()}`, email: `p1_${Date.now()}@t.com` });
  const { user: p2, password: p2Pass } = await createUser({ login: `p2_${Date.now()}`, email: `p2_${Date.now()}@t.com` });

  const t = await createTournament({
    organizerId: org.id,
    format: params.format ?? 'SINGLE_ELIMINATION',
    status: 'ACTIVE',
    onlyOrganizerSetsResults: params.onlyOrganizerSetsResults ?? false,
  });
  const part1 = await addParticipant(t.id, p1.id);
  const part2 = await addParticipant(t.id, p2.id);

  const stage = await prisma.stage.upsert({ where: { name: 'Финал' }, create: { name: 'Финал' }, update: {} });
  const match = await prisma.match.create({
    data: {
      tournamentId: t.id,
      stageId: stage.id,
      roundNumber: 1,
      player1Id: part1.id,
      player2Id: part2.id,
    },
  });

  const { token: orgToken } = await loginAs(app, org.login, orgPass);
  const { token: p1Token } = await loginAs(app, p1.login, p1Pass);
  const { token: p2Token } = await loginAs(app, p2.login, p2Pass);

  return { match, org, p1, p2, part1, part2, t, orgToken, p1Token, p2Token };
}

// ─── GET /api/matches/:id ────────────────────────────────────────────────────

describe('GET /api/matches/:id', () => {
  test('returns match details (no auth needed)', async () => {
    const { match } = await setupMatch();
    const res = await app.inject({ method: 'GET', url: `/api/matches/${match.id}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.id).toBe(match.id);
    expect(body.player1).toBeDefined();
    expect(body.player2).toBeDefined();
  });

  test('404 for unknown match', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/matches/999999' });
    expect(res.statusCode).toBe(404);
  });
});

// ─── POST /api/matches/:id/result ────────────────────────────────────────────

describe('POST /api/matches/:id/result — organizer', () => {
  test('organizer with isFinal=true closes match immediately', async () => {
    const { match, orgToken } = await setupMatch();
    const res = await app.inject({
      method: 'POST', url: `/api/matches/${match.id}/result`,
      headers: auth(orgToken),
      payload: { player1Score: 3, player2Score: 1, isFinal: true },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.isFinished).toBe(true);
    expect(body.winner).toBeDefined();
    // result marked as accepted
    expect(body.results.some((r: any) => r.isAccepted)).toBe(true);
  });

  test('organizer with isFinal=false records result but does not close match', async () => {
    const { match, orgToken } = await setupMatch();
    const res = await app.inject({
      method: 'POST', url: `/api/matches/${match.id}/result`,
      headers: auth(orgToken),
      payload: { player1Score: 2, player2Score: 0, isFinal: false },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.isFinished).toBe(false);
    expect(body.winner).toBeNull();
  });

  test('cannot submit result to already-finished match', async () => {
    const { match, orgToken } = await setupMatch();
    // Close it first
    await app.inject({
      method: 'POST', url: `/api/matches/${match.id}/result`,
      headers: auth(orgToken),
      payload: { player1Score: 2, player2Score: 0, isFinal: true },
    });
    // Try again
    const res = await app.inject({
      method: 'POST', url: `/api/matches/${match.id}/result`,
      headers: auth(orgToken),
      payload: { player1Score: 1, player2Score: 1, isFinal: true },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/matches/:id/result — playoff draw prevention', () => {
  test('400 when organizer submits draw as final in playoff', async () => {
    const { match, orgToken } = await setupMatch();
    const res = await app.inject({
      method: 'POST', url: `/api/matches/${match.id}/result`,
      headers: auth(orgToken),
      payload: { player1Score: 2, player2Score: 2, isFinal: true },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/ничь/i);
  });

  test('200 when organizer submits draw as NON-final in playoff', async () => {
    const { match, orgToken } = await setupMatch();
    const res = await app.inject({
      method: 'POST', url: `/api/matches/${match.id}/result`,
      headers: auth(orgToken),
      payload: { player1Score: 1, player2Score: 1, isFinal: false },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).isFinished).toBe(false);
  });
});

describe('POST /api/matches/:id/result — player flow', () => {
  test('player can submit non-final result', async () => {
    const { match, p1Token } = await setupMatch();
    const res = await app.inject({
      method: 'POST', url: `/api/matches/${match.id}/result`,
      headers: auth(p1Token),
      payload: { player1Score: 2, player2Score: 1, isFinal: false },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).isFinished).toBe(false);
  });

  test('match closes when both players submit identical FINAL results', async () => {
    const { match, p1Token, p2Token } = await setupMatch();
    await app.inject({
      method: 'POST', url: `/api/matches/${match.id}/result`,
      headers: auth(p1Token),
      payload: { player1Score: 3, player2Score: 1, isFinal: true },
    });
    const res = await app.inject({
      method: 'POST', url: `/api/matches/${match.id}/result`,
      headers: auth(p2Token),
      payload: { player1Score: 3, player2Score: 1, isFinal: true },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.isFinished).toBe(true);
    expect(body.winner).toBeDefined();
    expect(body.results.some((r: any) => r.isAccepted)).toBe(true);
  });

  test('match stays open when players submit DIFFERENT final results', async () => {
    const { match, p1Token, p2Token } = await setupMatch();
    await app.inject({
      method: 'POST', url: `/api/matches/${match.id}/result`,
      headers: auth(p1Token),
      payload: { player1Score: 3, player2Score: 1, isFinal: true },
    });
    const res = await app.inject({
      method: 'POST', url: `/api/matches/${match.id}/result`,
      headers: auth(p2Token),
      payload: { player1Score: 1, player2Score: 3, isFinal: true },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).isFinished).toBe(false);
  });

  test('non-participant cannot set result', async () => {
    const { match } = await setupMatch();
    const { user: stranger, password } = await createUser();
    const { token } = await loginAs(app, stranger.login, password);

    const res = await app.inject({
      method: 'POST', url: `/api/matches/${match.id}/result`,
      headers: auth(token),
      payload: { player1Score: 1, player2Score: 0, isFinal: true },
    });
    expect(res.statusCode).toBe(403);
  });

  test('player cannot set result when onlyOrganizerSetsResults=true', async () => {
    const { match, p1Token } = await setupMatch({ onlyOrganizerSetsResults: true });
    const res = await app.inject({
      method: 'POST', url: `/api/matches/${match.id}/result`,
      headers: auth(p1Token),
      payload: { player1Score: 1, player2Score: 0, isFinal: true },
    });
    expect(res.statusCode).toBe(403);
  });

  test('401 without auth', async () => {
    const { match } = await setupMatch();
    const res = await app.inject({
      method: 'POST', url: `/api/matches/${match.id}/result`,
      payload: { player1Score: 1, player2Score: 0, isFinal: true },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/matches/:id/result — group match draw', () => {
  test('draw is allowed as final result in group stage matches', async () => {
    const { user: org, password: orgPass } = await createUser({ login: `orggg_${Date.now()}`, email: `orggg_${Date.now()}@t.com` });
    const { user: p1 } = await createUser();
    const { user: p2 } = await createUser();
    const t = await createTournament({ organizerId: org.id, format: 'ROUND_ROBIN', status: 'ACTIVE' });
    const part1 = await addParticipant(t.id, p1.id);
    const part2 = await addParticipant(t.id, p2.id);
    const group = await prisma.tournamentGroup.create({
      data: { tournamentId: t.id, name: 'Группа A' },
    });
    const stage = await prisma.stage.upsert({ where: { name: 'Групповой этап' }, create: { name: 'Групповой этап' }, update: {} });
    const match = await prisma.match.create({
      data: { tournamentId: t.id, stageId: stage.id, groupId: group.id, roundNumber: 1, player1Id: part1.id, player2Id: part2.id },
    });
    const { token: orgToken } = await loginAs(app, org.login, orgPass);

    const res = await app.inject({
      method: 'POST', url: `/api/matches/${match.id}/result`,
      headers: auth(orgToken),
      payload: { player1Score: 1, player2Score: 1, isFinal: true },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).isFinished).toBe(true);
  });
});
