import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';

let _seq = 0;
function uid() { return `${Date.now()}_${++_seq}`; }

export async function createUser(params: {
  login?: string;
  email?: string;
  password?: string;
  roles?: string[];
} = {}) {
  const id = uid();
  const login = params.login ?? `u${id}`;
  const email = params.email ?? `u${id}@test.com`;
  const password = params.password ?? 'testpass123';
  const roles = params.roles ?? ['USER'];
  const passwordHash = await bcrypt.hash(password, 4);
  const user = await prisma.user.create({
    data: { login, email, passwordHash, roles: { create: roles.map((role) => ({ role })) } },
    include: { roles: true },
  });
  return { user, password };
}

export async function loginAs(app: FastifyInstance, login: string, password: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { login, password },
  });
  const body = JSON.parse(res.body);
  return { token: body.accessToken as string, statusCode: res.statusCode };
}

export async function createGame(name?: string) {
  return prisma.game.create({ data: { name: name ?? `Game_${uid()}` } });
}

export async function createTournament(params: {
  organizerId: number;
  format?: string;
  maxParticipants?: number;
  status?: string;
  onlyOrganizerSetsResults?: boolean;
}) {
  const game = await createGame();
  const tn = await prisma.tournamentName.create({
    data: { name: `T_${uid()}`, gameId: game.id, creatorId: params.organizerId },
  });
  return prisma.tournament.create({
    data: {
      nameId: tn.id,
      organizerId: params.organizerId,
      format: params.format ?? 'SINGLE_ELIMINATION',
      maxParticipants: params.maxParticipants ?? 16,
      status: params.status ?? 'DRAFT',
      onlyOrganizerSetsResults: params.onlyOrganizerSetsResults ?? false,
    },
  });
}

export async function addParticipant(tournamentId: number, userId: number) {
  return prisma.tournamentParticipant.create({ data: { tournamentId, userId } });
}

export async function addNParticipants(tournamentId: number, n: number) {
  const ids: number[] = [];
  for (let i = 0; i < n; i++) {
    const { user } = await createUser();
    const p = await addParticipant(tournamentId, user.id);
    ids.push(p.id);
  }
  return ids;
}

export function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}
