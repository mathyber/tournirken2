import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../app';
import { createUser, loginAs, auth } from './helpers';

let app: FastifyInstance;
beforeAll(async () => { app = await buildApp(); await app.ready(); });
afterAll(async () => { await app.close(); });

describe('GET /api/users/me', () => {
  test('returns own profile when authenticated', async () => {
    const { user, password } = await createUser({ login: 'meuser', email: 'me@test.com' });
    const { token } = await loginAs(app, 'meuser', password);

    const res = await app.inject({ method: 'GET', url: '/api/users/me', headers: auth(token) });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.login).toBe('meuser');
    expect(body.email).toBe('me@test.com');
    expect(body.stats).toBeDefined();
    expect(body.passwordHash).toBeUndefined();
  });

  test('401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/users/me' });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /api/users/me/participations', () => {
  test('returns array of tournament IDs', async () => {
    const { user, password } = await createUser();
    const { token } = await loginAs(app, user.login, password);
    const res = await app.inject({ method: 'GET', url: '/api/users/me/participations', headers: auth(token) });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(JSON.parse(res.body))).toBe(true);
  });

  test('401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/users/me/participations' });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /api/users/:login', () => {
  test('returns public profile', async () => {
    const { user } = await createUser({ login: 'publicuser', email: 'pub@test.com' });
    const res = await app.inject({ method: 'GET', url: '/api/users/publicuser' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.login).toBe('publicuser');
    expect(body.email).toBeUndefined(); // email not in public profile
    expect(body.stats).toBeDefined();
  });

  test('404 for unknown user', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/users/doesnotexist' });
    expect(res.statusCode).toBe(404);
  });
});

describe('PATCH /api/users/me/email', () => {
  test('updates own email', async () => {
    const { user, password } = await createUser({ login: 'emailchange', email: 'old@test.com' });
    const { token } = await loginAs(app, 'emailchange', password);

    const res = await app.inject({
      method: 'PATCH', url: '/api/users/me/email',
      headers: auth(token), payload: { email: 'new@test.com' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).email).toBe('new@test.com');
  });

  test('400 on duplicate email', async () => {
    await createUser({ login: 'other', email: 'taken@test.com' });
    const { user, password } = await createUser({ login: 'changer', email: 'mine@test.com' });
    const { token } = await loginAs(app, 'changer', password);

    const res = await app.inject({
      method: 'PATCH', url: '/api/users/me/email',
      headers: auth(token), payload: { email: 'taken@test.com' },
    });
    expect(res.statusCode).toBe(400);
  });

  test('401 without token', async () => {
    const res = await app.inject({
      method: 'PATCH', url: '/api/users/me/email',
      payload: { email: 'x@test.com' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('PATCH /api/users/me/password', () => {
  test('changes password with correct current password', async () => {
    const { user, password } = await createUser({ login: 'pwchange', email: 'pwchange@test.com', password: 'oldpass123' });
    const { token } = await loginAs(app, 'pwchange', 'oldpass123');

    const res = await app.inject({
      method: 'PATCH', url: '/api/users/me/password',
      headers: auth(token),
      payload: { currentPassword: 'oldpass123', newPassword: 'newpass456' },
    });
    expect(res.statusCode).toBe(200);

    // Verify new password works
    const { statusCode } = await loginAs(app, 'pwchange', 'newpass456');
    expect(statusCode).toBe(200);
  });

  test('400 on wrong current password', async () => {
    const { user, password } = await createUser({ login: 'pwwrong', email: 'pwwrong@test.com', password: 'correct123' });
    const { token } = await loginAs(app, 'pwwrong', 'correct123');

    const res = await app.inject({
      method: 'PATCH', url: '/api/users/me/password',
      headers: auth(token),
      payload: { currentPassword: 'wrongpassword', newPassword: 'newpass456' },
    });
    expect(res.statusCode).toBe(400);
  });
});
