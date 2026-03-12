import { afterEach } from 'vitest';
import prisma from '../lib/prisma';

afterEach(async () => {
  // Delete in FK-safe reverse order
  await prisma.matchResult.deleteMany();
  await prisma.groupParticipant.deleteMany();
  await prisma.match.deleteMany();
  await prisma.tournamentParticipant.deleteMany();
  await prisma.tournamentGroup.deleteMany();
  await prisma.tournament.deleteMany();
  await prisma.tournamentName.deleteMany();
  await prisma.game.deleteMany();
  await prisma.stage.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.user.deleteMany();
});
