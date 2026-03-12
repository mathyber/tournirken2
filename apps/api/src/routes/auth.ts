import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';
import { badRequest, unauthorized } from '../lib/errors';
import { RegisterSchema, LoginSchema } from '@tournirken/shared';

export default async function authRoutes(fastify: FastifyInstance) {
  function signAccess(userId: number, roles: string[]) {
    return fastify.jwt.sign({ userId, roles }, { expiresIn: '15m' });
  }

  function signRefresh(userId: number, roles: string[]) {
    return fastify.jwt.sign({ userId, roles, type: 'refresh' }, { expiresIn: '30d' });
  }

  function setRefreshCookie(reply: any, token: string) {
    reply.setCookie('refreshToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
      path: '/api/auth',
    });
  }

  // POST /api/auth/register
  fastify.post('/register', async (request, reply) => {
    const result = RegisterSchema.safeParse(request.body);
    if (!result.success) {
      return badRequest(reply, result.error.issues[0]?.message ?? 'Неверные данные');
    }
    const { login, email, password } = result.data;

    const existing = await prisma.user.findFirst({
      where: { OR: [{ login }, { email }] },
    });
    if (existing) {
      if (existing.login === login) return badRequest(reply, 'Логин уже занят');
      return badRequest(reply, 'Email уже используется');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        login,
        email,
        passwordHash,
        roles: { create: [{ role: 'USER' }] },
      },
      include: { roles: true },
    });

    const roles = user.roles.map((r) => r.role);
    const accessToken = signAccess(user.id, roles);
    const refreshToken = signRefresh(user.id, roles);
    setRefreshCookie(reply, refreshToken);

    return reply.status(201).send({
      accessToken,
      user: { id: user.id, login: user.login, email: user.email, roles },
    });
  });

  // POST /api/auth/login
  fastify.post('/login', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute',
        errorResponseBuilder: (_req: any, context: any) => {
          const err: any = new Error('Слишком много попыток входа. Попробуйте через минуту.');
          err.statusCode = context.statusCode;
          return err;
        },
      },
    },
  }, async (request, reply) => {
    const result = LoginSchema.safeParse(request.body);
    if (!result.success) return badRequest(reply, 'Неверные данные');

    const { login, password } = result.data;
    const user = await prisma.user.findFirst({
      where: { OR: [{ login }, { email: login }] },
      include: { roles: true },
    });
    if (!user) return unauthorized(reply, 'Неверный логин или пароль');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return unauthorized(reply, 'Неверный логин или пароль');

    const roles = user.roles.map((r) => r.role);
    const accessToken = signAccess(user.id, roles);
    const refreshToken = signRefresh(user.id, roles);
    setRefreshCookie(reply, refreshToken);

    return reply.send({
      accessToken,
      user: { id: user.id, login: user.login, email: user.email, roles },
    });
  });

  // POST /api/auth/refresh
  fastify.post('/refresh', async (request, reply) => {
    const refreshToken = request.cookies?.refreshToken;
    if (!refreshToken) return unauthorized(reply, 'Refresh token отсутствует');

    try {
      const payload = fastify.jwt.verify(refreshToken) as {
        userId: number;
        roles: string[];
        type?: string;
      };

      if (payload.type !== 'refresh') return unauthorized(reply, 'Недействительный refresh token');

      const user = await prisma.user.findUnique({ where: { id: payload.userId }, include: { roles: true } });
      if (!user) return unauthorized(reply, 'Пользователь не найден');

      const roles = user.roles.map((r) => r.role);
      return reply.send({ accessToken: signAccess(user.id, roles) });
    } catch {
      return unauthorized(reply, 'Недействительный refresh token');
    }
  });

  // POST /api/auth/logout
  fastify.post('/logout', async (request, reply) => {
    reply.clearCookie('refreshToken', { path: '/api/auth' });
    return reply.send({ message: 'Вы вышли из системы' });
  });
}
