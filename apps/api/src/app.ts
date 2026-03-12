import Fastify, { FastifyInstance } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import authPlugin from './plugins/auth';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import gameRoutes from './routes/games';
import tournamentRoutes from './routes/tournaments';
import gridRoutes from './routes/grid';
import matchRoutes from './routes/matches';
import adminRoutes from './routes/admin';

export async function buildApp(): Promise<FastifyInstance> {
  const isTest = process.env.NODE_ENV === 'test';
  const fastify = Fastify({
    logger: isTest ? false : { level: process.env.NODE_ENV === 'production' ? 'warn' : 'info' },
  });

  await fastify.register(fastifyCors, {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  });
  await fastify.register(fastifyCookie);
  await fastify.register(fastifyJwt, {
    secret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret-please-change',
  });
  await fastify.register(fastifyRateLimit, {
    global: false, // only apply where explicitly configured
  });

  // Allow empty body with Content-Type: application/json (e.g. POST /open-registration)
  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    if (!body) { done(null, {}); return; }
    try { done(null, JSON.parse(body as string)); }
    catch (e) { done(e as Error); }
  });

  fastify.setErrorHandler((error, _request, reply) => {
    if (!isTest) fastify.log.error(error);
    reply.status((error as any).statusCode ?? 500).send({
      error: error.message || 'Внутренняя ошибка сервера',
    });
  });

  await fastify.register(authPlugin);
  await fastify.register(authRoutes, { prefix: '/api/auth' });
  await fastify.register(userRoutes, { prefix: '/api/users' });
  await fastify.register(gameRoutes, { prefix: '/api/games' });
  await fastify.register(tournamentRoutes, { prefix: '/api/tournaments' });
  await fastify.register(gridRoutes, { prefix: '/api/tournaments' });
  await fastify.register(matchRoutes, { prefix: '/api/matches' });
  await fastify.register(adminRoutes, { prefix: '/api/admin' });
  fastify.get('/api/health', async () => ({ status: 'ok' }));

  return fastify;
}
