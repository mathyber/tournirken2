import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../app';
import { createUser, loginAs, createTournament, auth } from './helpers';

let app: FastifyInstance;
beforeAll(async () => { app = await buildApp(); await app.ready(); });
afterAll(async () => { await app.close(); });

// ─── GET /api/admin/users ────────────────────────────────────────────────────

describe('GET /api/admin/users', () => {
  test('admin can list users', async () => {
    const { user, password } = await createUser({ login: 'adminuser', email: 'admin@test.com', roles: ['ADMIN'] });
    const { token } = await loginAs(app, 'adminuser', password);

    const res = await app.inject({ method: 'GET', url: '/api/admin/users', headers: auth(token) });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(JSON.parse(res.body))).toBe(true);
  });

  test('moderator can list users', async () => {
    const { user, password } = await createUser({ login: 'moduser', email: 'mod@test.com', roles: ['MODERATOR'] });
    const { token } = await loginAs(app, 'moduser', password);

    const res = await app.inject({ method: 'GET', url: '/api/admin/users', headers: auth(token) });
    expect(res.statusCode).toBe(200);
  });

  test('regular user gets 403', async () => {
    const { user, password } = await createUser({ login: 'regularuser', email: 'regular@test.com' });
    const { token } = await loginAs(app, 'regularuser', password);

    const res = await app.inject({ method: 'GET', url: '/api/admin/users', headers: auth(token) });
    expect(res.statusCode).toBe(403);
  });

  test('unauthenticated gets 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/users' });
    expect(res.statusCode).toBe(401);
  });
});

// ─── PATCH /api/admin/users/:id/roles ────────────────────────────────────────

describe('PATCH /api/admin/users/:id/roles', () => {
  test('admin can change user roles', async () => {
    const { user: admin, password } = await createUser({ login: 'adminroles', email: 'adminroles@test.com', roles: ['ADMIN'] });
    const { user: target } = await createUser({ login: 'target', email: 'target@test.com' });
    const { token } = await loginAs(app, 'adminroles', password);

    const res = await app.inject({
      method: 'PATCH', url: `/api/admin/users/${target.id}/roles`,
      headers: auth(token),
      payload: { roles: ['USER', 'MODERATOR'] },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).roles).toContain('MODERATOR');
  });

  test('moderator cannot change roles (admin only)', async () => {
    const { user, password } = await createUser({ login: 'modroles', email: 'modroles@test.com', roles: ['MODERATOR'] });
    const { user: target } = await createUser({ login: 'target2', email: 'target2@test.com' });
    const { token } = await loginAs(app, 'modroles', password);

    const res = await app.inject({
      method: 'PATCH', url: `/api/admin/users/${target.id}/roles`,
      headers: auth(token),
      payload: { roles: ['USER', 'MODERATOR'] },
    });
    expect(res.statusCode).toBe(403);
  });

  test('404 for unknown user', async () => {
    const { user, password } = await createUser({ login: 'admin404', email: 'admin404@test.com', roles: ['ADMIN'] });
    const { token } = await loginAs(app, 'admin404', password);

    const res = await app.inject({
      method: 'PATCH', url: '/api/admin/users/999999/roles',
      headers: auth(token),
      payload: { roles: ['USER'] },
    });
    expect(res.statusCode).toBe(404);
  });
});

// ─── DELETE /api/admin/tournaments/:id ──────────────────────────────────────

describe('DELETE /api/admin/tournaments/:id', () => {
  test('admin can cancel tournament', async () => {
    const { user: admin, password } = await createUser({ login: 'admincancel', email: 'admincancel@test.com', roles: ['ADMIN'] });
    const { user: org } = await createUser();
    const t = await createTournament({ organizerId: org.id, status: 'REGISTRATION' });
    const { token } = await loginAs(app, 'admincancel', password);

    const res = await app.inject({
      method: 'DELETE', url: `/api/admin/tournaments/${t.id}`,
      headers: auth(token),
    });
    expect(res.statusCode).toBe(200);

    const { default: prisma } = await import('../lib/prisma');
    const updated = await prisma.tournament.findUnique({ where: { id: t.id } });
    expect(updated?.status).toBe('CANCELLED');
  });

  test('moderator can cancel tournament', async () => {
    const { user: mod, password } = await createUser({ login: 'modcancel', email: 'modcancel@test.com', roles: ['MODERATOR'] });
    const { user: org } = await createUser();
    const t = await createTournament({ organizerId: org.id });
    const { token } = await loginAs(app, 'modcancel', password);

    const res = await app.inject({
      method: 'DELETE', url: `/api/admin/tournaments/${t.id}`,
      headers: auth(token),
    });
    expect(res.statusCode).toBe(200);
  });

  test('regular user gets 403', async () => {
    const { user: org } = await createUser();
    const t = await createTournament({ organizerId: org.id });
    const { user, password } = await createUser({ login: 'regusr', email: 'regusr@test.com' });
    const { token } = await loginAs(app, 'regusr', password);

    const res = await app.inject({
      method: 'DELETE', url: `/api/admin/tournaments/${t.id}`,
      headers: auth(token),
    });
    expect(res.statusCode).toBe(403);
  });

  test('404 for unknown tournament', async () => {
    const { user, password } = await createUser({ login: 'admin404t', email: 'admin404t@test.com', roles: ['ADMIN'] });
    const { token } = await loginAs(app, 'admin404t', password);

    const res = await app.inject({
      method: 'DELETE', url: '/api/admin/tournaments/999999',
      headers: auth(token),
    });
    expect(res.statusCode).toBe(404);
  });
});
