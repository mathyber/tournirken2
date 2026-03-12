import { buildApp } from './app';

async function start() {
  const fastify = await buildApp();
  const port = parseInt(process.env.PORT || '3001');
  await fastify.listen({ port, host: '0.0.0.0' });
  fastify.log.info(`🚀 Сервер запущен на http://localhost:${port}`);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
