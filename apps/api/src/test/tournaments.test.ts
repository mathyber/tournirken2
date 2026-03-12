import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../app';
import { createUser, loginAs, createTournament, addParticipant, addNParticipants, createGame, auth } from './helpers';
import prisma from '../lib/prisma';

let app: FastifyInstance;
beforeAll(async () => { app = await buildApp(); await app.ready(); });
afterAll(async () => { await app.close(); });

// ─── Helpers for this file ───────────────────────────────────────────────────

async function setup() {
  const { user: organizer, password } = await createUser({ login: 'org', email: 'org@test.com' });
  const { token } = await loginAs(app, 'org', password);
  return { organizer, token };
}

async function createTournamentViaApi(token: string, extra: Record<string, any> = {}) {
  const game = await createGame();
  const tn = await prisma.tournamentName.create({
    data: { name: `T_${Date.now()}`, gameId: game.id, creatorId: 1 },
  });
  // Use direct DB create for simplicity in most tests
  const { user: org } = await createUser();
  const t = await createTournament({ organizerId: org.id, ...extra });
  return t;
}

// ─── GET /api/tournaments ────────────────────────────────────────────────────

describe('GET /api/tournaments', () => {
  test('returns paginated list', async () => {
    const { user: org } = await createUser();
    await createTournament({ organizerId: org.id, status: 'REGISTRATION' });
    await createTournament({ organizerId: org.id, status: 'REGISTRATION' });

    const res = await app.inject({ method: 'GET', url: '/api/tournaments?page=1&limit=10' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toBeDefined();
    expect(body.total).toBeGreaterThanOrEqual(2);
  });

  test('filters by status', async () => {
    const { user: org } = await createUser();
    await createTournament({ organizerId: org.id, status: 'ACTIVE' });

    const res = await app.inject({ method: 'GET', url: '/api/tournaments?status=ACTIVE' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.every((t: any) => t.status === 'ACTIVE')).toBe(true);
  });
});

// ─── GET /api/tournaments/:id ────────────────────────────────────────────────

describe('GET /api/tournaments/:id', () => {
  test('returns tournament by id', async () => {
    const { user: org } = await createUser();
    const t = await createTournament({ organizerId: org.id });
    const res = await app.inject({ method: 'GET', url: `/api/tournaments/${t.id}` });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).id).toBe(t.id);
  });

  test('404 for unknown id', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/tournaments/999999' });
    expect(res.statusCode).toBe(404);
  });

  test('400 for non-numeric id', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/tournaments/abc' });
    expect(res.statusCode).toBe(400);
  });
});

// ─── POST /api/tournaments/:id/join ─────────────────────────────────────────

describe('POST /api/tournaments/:id/join', () => {
  test('participant can join open tournament', async () => {
    const { user: org } = await createUser();
    const t = await createTournament({ organizerId: org.id, status: 'REGISTRATION' });
    const { user, password } = await createUser();
    const { token } = await loginAs(app, user.login, password);

    const res = await app.inject({ method: 'POST', url: `/api/tournaments/${t.id}/join`, headers: auth(token) });
    expect(res.statusCode).toBe(201);
  });

  test('cannot join twice', async () => {
    const { user: org } = await createUser();
    const t = await createTournament({ organizerId: org.id, status: 'REGISTRATION' });
    const { user, password } = await createUser();
    await addParticipant(t.id, user.id);
    const { token } = await loginAs(app, user.login, password);

    const res = await app.inject({ method: 'POST', url: `/api/tournaments/${t.id}/join`, headers: auth(token) });
    expect(res.statusCode).toBe(400);
  });

  test('cannot join if tournament is not REGISTRATION', async () => {
    const { user: org } = await createUser();
    const t = await createTournament({ organizerId: org.id, status: 'ACTIVE' });
    const { user, password } = await createUser();
    const { token } = await loginAs(app, user.login, password);

    const res = await app.inject({ method: 'POST', url: `/api/tournaments/${t.id}/join`, headers: auth(token) });
    expect(res.statusCode).toBe(400);
  });

  test('cannot join if tournament is full', async () => {
    const { user: org } = await createUser();
    const t = await createTournament({ organizerId: org.id, status: 'REGISTRATION', maxParticipants: 2 });
    const { user: p1 } = await createUser();
    const { user: p2 } = await createUser();
    await addParticipant(t.id, p1.id);
    await addParticipant(t.id, p2.id);
    const { user: p3, password } = await createUser();
    const { token } = await loginAs(app, p3.login, password);

    const res = await app.inject({ method: 'POST', url: `/api/tournaments/${t.id}/join`, headers: auth(token) });
    expect(res.statusCode).toBe(400);
  });

  test('401 without auth', async () => {
    const { user: org } = await createUser();
    const t = await createTournament({ organizerId: org.id, status: 'REGISTRATION' });
    const res = await app.inject({ method: 'POST', url: `/api/tournaments/${t.id}/join` });
    expect(res.statusCode).toBe(401);
  });
});

// ─── DELETE /api/tournaments/:id/leave ──────────────────────────────────────

describe('DELETE /api/tournaments/:id/leave', () => {
  test('participant can leave', async () => {
    const { user: org } = await createUser();
    const t = await createTournament({ organizerId: org.id, status: 'REGISTRATION' });
    const { user, password } = await createUser();
    await addParticipant(t.id, user.id);
    const { token } = await loginAs(app, user.login, password);

    const res = await app.inject({ method: 'DELETE', url: `/api/tournaments/${t.id}/leave`, headers: auth(token) });
    expect(res.statusCode).toBe(200);
  });

  test('400 if not a participant', async () => {
    const { user: org } = await createUser();
    const t = await createTournament({ organizerId: org.id, status: 'REGISTRATION' });
    const { user, password } = await createUser();
    const { token } = await loginAs(app, user.login, password);

    const res = await app.inject({ method: 'DELETE', url: `/api/tournaments/${t.id}/leave`, headers: auth(token) });
    expect(res.statusCode).toBe(404);
  });

  test('400 if tournament is ACTIVE (cannot leave)', async () => {
    const { user: org } = await createUser();
    const t = await createTournament({ organizerId: org.id, status: 'ACTIVE' });
    const { user, password } = await createUser();
    await addParticipant(t.id, user.id);
    const { token } = await loginAs(app, user.login, password);

    const res = await app.inject({ method: 'DELETE', url: `/api/tournaments/${t.id}/leave`, headers: auth(token) });
    expect(res.statusCode).toBe(400);
  });
});

// ─── GET /api/tournaments/:id/participants ───────────────────────────────────

describe('GET /api/tournaments/:id/participants', () => {
  test('returns list of participants', async () => {
    const { user: org } = await createUser();
    const t = await createTournament({ organizerId: org.id });
    const { user: p } = await createUser();
    await addParticipant(t.id, p.id);

    const res = await app.inject({ method: 'GET', url: `/api/tournaments/${t.id}/participants` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(1);
    expect(body[0].user.login).toBe(p.login);
  });
});

// ─── POST /api/tournaments/:id/open-registration ────────────────────────────

describe('POST /api/tournaments/:id/open-registration', () => {
  test('organizer can open registration from DRAFT', async () => {
    const { user: org, password } = await createUser({ login: 'org_openreg', email: 'org_openreg@test.com' });
    const t = await createTournament({ organizerId: org.id, status: 'DRAFT' });
    const { token } = await loginAs(app, 'org_openreg', password);

    const res = await app.inject({
      method: 'POST', url: `/api/tournaments/${t.id}/open-registration`,
      headers: auth(token),
    });
    expect(res.statusCode).toBe(200);
    const updated = await prisma.tournament.findUnique({ where: { id: t.id } });
    expect(updated?.status).toBe('REGISTRATION');
  });

  test('403 if not organizer', async () => {
    const { user: org } = await createUser();
    const t = await createTournament({ organizerId: org.id, status: 'DRAFT' });
    const { user, password } = await createUser();
    const { token } = await loginAs(app, user.login, password);

    const res = await app.inject({
      method: 'POST', url: `/api/tournaments/${t.id}/open-registration`,
      headers: auth(token),
    });
    expect(res.statusCode).toBe(403);
  });

  test('400 if already ACTIVE', async () => {
    const { user: org, password } = await createUser({ login: 'org_active', email: 'org_active@test.com' });
    const t = await createTournament({ organizerId: org.id, status: 'ACTIVE' });
    const { token } = await loginAs(app, 'org_active', password);

    const res = await app.inject({
      method: 'POST', url: `/api/tournaments/${t.id}/open-registration`,
      headers: auth(token),
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── PATCH /api/tournaments/:id ──────────────────────────────────────────────

describe('PATCH /api/tournaments/:id', () => {
  test('organizer can update tournament', async () => {
    const { user: org, password } = await createUser({ login: 'org_upd', email: 'org_upd@test.com' });
    const t = await createTournament({ organizerId: org.id });
    const { token } = await loginAs(app, 'org_upd', password);

    const res = await app.inject({
      method: 'PATCH', url: `/api/tournaments/${t.id}`,
      headers: auth(token),
      payload: { info: 'Updated info', maxParticipants: 32 },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).info).toBe('Updated info');
  });

  test('403 if not organizer', async () => {
    const { user: org } = await createUser();
    const t = await createTournament({ organizerId: org.id });
    const { user, password } = await createUser();
    const { token } = await loginAs(app, user.login, password);

    const res = await app.inject({
      method: 'PATCH', url: `/api/tournaments/${t.id}`,
      headers: auth(token),
      payload: { info: 'Hacked' },
    });
    expect(res.statusCode).toBe(403);
  });
});

// ─── GET /api/tournaments/:id/matches ────────────────────────────────────────

describe('GET /api/tournaments/:id/matches', () => {
  test('returns matches for active tournament', async () => {
    const { user: org } = await createUser();
    const t = await createTournament({ organizerId: org.id, status: 'ACTIVE' });
    const res = await app.inject({ method: 'GET', url: `/api/tournaments/${t.id}/matches` });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(JSON.parse(res.body))).toBe(true);
  });
});
