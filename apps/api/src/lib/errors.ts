import { FastifyReply } from 'fastify';

export function sendError(reply: FastifyReply, statusCode: number, message: string) {
  return reply.status(statusCode).send({ error: message });
}

export function notFound(reply: FastifyReply, what = 'Не найдено') {
  return sendError(reply, 404, what);
}

export function forbidden(reply: FastifyReply, msg = 'Нет доступа') {
  return sendError(reply, 403, msg);
}

export function badRequest(reply: FastifyReply, msg: string) {
  return sendError(reply, 400, msg);
}

export function unauthorized(reply: FastifyReply, msg = 'Необходима авторизация') {
  return sendError(reply, 401, msg);
}
