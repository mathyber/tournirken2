import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../app';
import { createUser } from './helpers';

let app: FastifyInstance;
beforeAll(async () => { app = await buildApp(); await app.ready(); });
afterAll(async () => { await app.close(); });

describe('POST /api/auth/register', () => {
  test('creates user, returns accessToken + user with USER role', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { login: 'alice', email: 'alice@test.com', password: 'password123' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.accessToken).toBeTruthy();
    expect(body.user.login).toBe('alice');
    expect(body.user.roles).toContain('USER');
    expect(body.user.passwordHash).toBeUndefined();
  });

  test('sets httpOnly refresh cookie', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { login: 'bob', email: 'bob@test.com', password: 'password123' },
    });
    const cookie = res.headers['set-cookie'] as string;
    expect(cookie).toContain('refreshToken');
    expect(cookie).toContain('HttpOnly');
  });

  test('400 on duplicate login', async () => {
    await createUser({ login: 'dupLogin', email: 'a@test.com' });
    const res = await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { login: 'dupLogin', email: 'b@test.com', password: 'password123' },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/логин/i);
  });

  test('400 on duplicate email', async () => {
    await createUser({ login: 'user1', email: 'same@test.com' });
    const res = await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { login: 'user2', email: 'same@test.com', password: 'password123' },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/email/i);
  });

  test('400 on missing required fields', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { login: 'nopass' },
    });
    expect(res.statusCode).toBe(400);
  });

  test('400 on password too short (< 6 chars)', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { login: 'shortpw', email: 'shortpw@test.com', password: '123' },
    });
    expect(res.statusCode).toBe(400);
  });

  test('400 on invalid email format', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { login: 'bademail', email: 'notanemail', password: 'password123' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  test('200 with valid credentials (by login)', async () => {
    await createUser({ login: 'loginuser', email: 'loginuser@test.com', password: 'mypassword' });
    const res = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { login: 'loginuser', password: 'mypassword' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.accessToken).toBeTruthy();
    expect(body.user.login).toBe('loginuser');
  });

  test('200 with valid credentials (by email)', async () => {
    await createUser({ login: 'emailuser', email: 'emailuser@test.com', password: 'mypassword' });
    const res = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { login: 'emailuser@test.com', password: 'mypassword' },
    });
    expect(res.statusCode).toBe(200);
  });

  test('401 on wrong password', async () => {
    await createUser({ login: 'wrongpw', email: 'wrongpw@test.com', password: 'correctpass' });
    const res = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { login: 'wrongpw', password: 'wrongpass' },
    });
    expect(res.statusCode).toBe(401);
  });

  test('401 on unknown user', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { login: 'nobody', password: 'whatever' },
    });
    expect(res.statusCode).toBe(401);
  });

  test('400 on missing password', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { login: 'loginuser' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/auth/refresh', () => {
  test('200 with valid refresh cookie', async () => {
    await createUser({ login: 'refreshuser', email: 'refreshuser@test.com', password: 'testpass123' });
    const loginRes = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { login: 'refreshuser', password: 'testpass123' },
    });
    const setCookie = loginRes.headers['set-cookie'];
    const cookieStr = (Array.isArray(setCookie) ? setCookie[0] : setCookie) ?? '';
    const tokenPart = cookieStr.split(';')[0];

    const res = await app.inject({
      method: 'POST', url: '/api/auth/refresh',
      headers: { cookie: tokenPart },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).accessToken).toBeTruthy();
  });

  test('401 with no cookie', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/refresh' });
    expect(res.statusCode).toBe(401);
  });

  test('401 when access token used as refresh token', async () => {
    await createUser({ login: 'norefresh', email: 'norefresh@test.com', password: 'testpass123' });
    const loginRes = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { login: 'norefresh', password: 'testpass123' },
    });
    const accessToken = JSON.parse(loginRes.body).accessToken;

    const res = await app.inject({
      method: 'POST', url: '/api/auth/refresh',
      headers: { cookie: `refreshToken=${accessToken}` },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  test('200, clears refresh cookie', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/logout' });
    expect(res.statusCode).toBe(200);
    const setCookie = res.headers['set-cookie'] as string;
    expect(setCookie).toContain('refreshToken');
  });
});

describe('Protected route auth check', () => {
  test('401 when no token provided', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/users/me' });
    expect(res.statusCode).toBe(401);
  });

  test('401 when refresh token used as access token', async () => {
    await createUser({ login: 'tokencheck', email: 'tc@test.com', password: 'testpass123' });
    const loginRes = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { login: 'tokencheck', password: 'testpass123' },
    });
    const setCookie = loginRes.headers['set-cookie'];
    const cookieStr = (Array.isArray(setCookie) ? setCookie[0] : setCookie) ?? '';
    const refreshToken = cookieStr.split(';')[0].replace('refreshToken=', '');

    const res = await app.inject({
      method: 'GET', url: '/api/users/me',
      headers: { authorization: `Bearer ${refreshToken}` },
    });
    expect(res.statusCode).toBe(401);
  });
});
