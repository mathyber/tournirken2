import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma';
import { badRequest, forbidden, notFound, parseId } from '../lib/errors';
import { SaveDraftGridSchema, FinalizeGridSchema } from '@tournirken/shared';
import { getTemplateForFormat } from '../services/templates';

export default async function gridRoutes(fastify: FastifyInstance) {
  // POST /api/tournaments/:id/grid/draft
  fastify.post<{ Params: { id: string } }>(
    '/:id/grid/draft',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const id = parseId(request.params.id);
if (!id) return badRequest(reply, 'Неверный ID');

      const tournament = await prisma.tournament.findUnique({ where: { id } });
      if (!tournament) return notFound(reply, 'Турнир не найден');

      const isOrganizer = tournament.organizerId === request.userId;
      const isAdmin = request.userRoles?.includes('ADMIN');
      if (!isOrganizer && !isAdmin) return forbidden(reply);

      const result = SaveDraftGridSchema.safeParse(request.body);
      if (!result.success) return badRequest(reply, 'Неверные данные');

      await prisma.tournament.update({ where: { id }, data: { gridJson: result.data.gridJson } });
      return reply.send({ message: 'Черновик сохранён' });
    }
  );

  // POST /api/tournaments/:id/grid/finalize
  fastify.post<{ Params: { id: string } }>(
    '/:id/grid/finalize',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const id = parseId(request.params.id);
if (!id) return badRequest(reply, 'Неверный ID');

      const tournament = await prisma.tournament.findUnique({
        where: { id },
        include: { participants: true },
      });
      if (!tournament) return notFound(reply, 'Турнир не найден');

      const isOrganizer = tournament.organizerId === request.userId;
      const isAdmin = request.userRoles?.includes('ADMIN');
      if (!isOrganizer && !isAdmin) return forbidden(reply);

      if (!['DRAFT', 'REGISTRATION'].includes(tournament.status)) {
        return badRequest(reply, 'Турнир уже запущен');
      }

      const result = FinalizeGridSchema.safeParse(request.body);
      if (!result.success) return badRequest(reply, result.error.issues[0]?.message ?? 'Неверные данные');

      const { gridJson, participantAssignments, groups: groupConfigs, mixedConfig } = result.data;
      const participantIds = tournament.participants.map((p) => p.id);

      if (participantIds.length < 2) {
        return badRequest(reply, 'Нужно минимум 2 участника');
      }

      // Delete existing matches and groups
      await prisma.match.deleteMany({ where: { tournamentId: id } });
      await prisma.groupParticipant.deleteMany({
        where: { group: { tournamentId: id } },
      });
      await prisma.tournamentGroup.deleteMany({ where: { tournamentId: id } });

      // Determine ordered participant IDs (by seed or original order)
      let orderedParticipants = participantIds;
      if (participantAssignments && participantAssignments.length > 0) {
        const seedMap = new Map<number, number>();
        for (const a of participantAssignments) {
          if (a.seed !== undefined) seedMap.set(a.participantId, a.seed);
        }
        if (seedMap.size > 0) {
          orderedParticipants = participantIds.sort(
            (a, b) => (seedMap.get(a) ?? 999) - (seedMap.get(b) ?? 999)
          );
        }
      }

      try {
        // Generate CUSTOM schema from template
        const template = getTemplateForFormat(tournament.format as any);
        if (!template) {
          return badRequest(reply, `Шаблон для формата ${tournament.format} не найден`);
        }

        const schema = template.generateSchema(participantIds.length);
        const schemaJson = JSON.stringify(schema);

        // Save the generated schema
        await prisma.tournament.update({
          where: { id },
          data: {
            customSchema: schemaJson,
          },
        });

        // Now call the custom-finalize logic by simulating the request
        // We'll reuse the custom-finalize endpoint logic
        const customFinalizeUrl = `/api/tournaments/${id}/custom-finalize`;
        const customResponse = await fastify.inject({
          method: 'POST',
          url: customFinalizeUrl,
          headers: {
            'authorization': request.headers.authorization,
            'user-agent': request.headers['user-agent'] || '',
          },
        });

        if (customResponse.statusCode !== 200) {
          const errorBody = JSON.parse(customResponse.body);
          return reply.status(customResponse.statusCode).send(errorBody);
        }

        return reply.send({ message: 'Турнир запущен с использованием шаблона' });
      } catch (err: any) {
        console.error('Grid generation error:', err);
        return reply.status(500).send({ error: 'Ошибка генерации турнирной сетки', details: err.message });
      }
    }
  );
}
