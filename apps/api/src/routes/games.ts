import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma';

export default async function gameRoutes(fastify: FastifyInstance) {
  // GET /api/games
  fastify.get('/', async (request, reply) => {
    const games = await prisma.game.findMany({
      orderBy: { name: 'asc' },
    });
    return reply.send(games);
  });
}
