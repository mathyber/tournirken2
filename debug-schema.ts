import prisma from './apps/api/src/lib/prisma';

const TOURNAMENT_ID = 225;

async function main() {
  const t = await prisma.tournament.findUnique({
    where: { id: TOURNAMENT_ID },
    include: { participants: true },
  });
  console.log('tournament status:', t?.status);
  console.log('customSchema:', t?.customSchema);
  console.log('participants:', t?.participants.map((p) => ({ id: p.id, userId: p.userId, finalResult: p.finalResult })));

  const matches = await prisma.match.findMany({ where: { tournamentId: TOURNAMENT_ID } });
  console.log('matches:', matches.map((m) => ({ id: m.id, isFinished: m.isFinished, winnerId: m.winnerId, player1Id: m.player1Id, player2Id: m.player2Id })));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
