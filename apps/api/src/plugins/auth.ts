import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    optionalAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    userId?: number;
    userRoles?: string[];
  }
}

export default fp(async function authPlugin(fastify: FastifyInstance) {
  function extractPayload(request: FastifyRequest): { userId: number; roles: string[] } | null {
    const token = request.headers.authorization?.replace('Bearer ', '');
    if (!token) return null;
    try {
      const payload = fastify.jwt.verify(token) as { userId: number; roles: string[]; type?: string };
      if (payload.type === 'refresh') return null; // refuse refresh tokens for API calls
      return payload;
    } catch {
      return null;
    }
  }

  fastify.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    const payload = extractPayload(request);
    if (!payload) return reply.status(401).send({ error: 'Необходима авторизация' });
    request.userId = payload.userId;
    request.userRoles = payload.roles;
  });

  fastify.decorate('optionalAuth', async function (request: FastifyRequest, reply: FastifyReply) {
    const payload = extractPayload(request);
    if (payload) {
      request.userId = payload.userId;
      request.userRoles = payload.roles;
    }
  });
});
