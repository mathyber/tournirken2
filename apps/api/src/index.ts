import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';

import authPlugin from './plugins/auth';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import gameRoutes from './routes/games';
import tournamentRoutes from './routes/tournaments';
import gridRoutes from './routes/grid';
import matchRoutes from './routes/matches';
import adminRoutes from './routes/admin';

const fastify = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
  },
});

async function start() {
  // CORS
  await fastify.register(fastifyCors, {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  });

  // Cookie support
  await fastify.register(fastifyCookie);

  // JWT — simple string secret; we do manual verify with key override per token type in routes
  await fastify.register(fastifyJwt, {
    secret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret-please-change',
  });

  // Global error handler
  fastify.setErrorHandler((error, _request, reply) => {
    fastify.log.error(error);
    reply.status((error as any).statusCode ?? 500).send({
      error: error.message || 'Внутренняя ошибка сервера',
    });
  });

  // Auth plugin
  await fastify.register(authPlugin);

  // Routes
  await fastify.register(authRoutes, { prefix: '/api/auth' });
  await fastify.register(userRoutes, { prefix: '/api/users' });
  await fastify.register(gameRoutes, { prefix: '/api/games' });
  await fastify.register(tournamentRoutes, { prefix: '/api/tournaments' });
  await fastify.register(gridRoutes, { prefix: '/api/tournaments' });
  await fastify.register(matchRoutes, { prefix: '/api/matches' });
  await fastify.register(adminRoutes, { prefix: '/api/admin' });

  // Health check
  fastify.get('/api/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  const port = parseInt(process.env.PORT || '3001');
  const host = '0.0.0.0';

  await fastify.listen({ port, host });
  fastify.log.info(`🚀 Сервер запущен на http://localhost:${port}`);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
