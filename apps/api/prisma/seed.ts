import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const existingAdmin = await prisma.user.findUnique({ where: { login: 'admin' } });
  if (existingAdmin) {
    console.log('Admin user already exists, skipping user seed.');
  } else {

  const password = 'admin123';
  const passwordHash = await bcrypt.hash(password, 10);

  const admin = await prisma.user.create({
    data: {
      login: 'admin',
      email: 'admin@tournirken.local',
      passwordHash,
      roles: {
        create: [
          { role: 'USER' },
          { role: 'ADMIN' },
        ],
      },
    },
  });

  console.log('✅ Admin user created:');
  console.log('   login: admin');
  console.log('   password: admin123');
  console.log('   ⚠️  Please change the password after first login!');
  console.log(`   id: ${admin.id}`);
  }

  // Seed some games (upsert to avoid duplicates on re-run)
  const games = [
    { name: 'Counter-Strike 2', info: 'Тактический шутер от Valve' },
    { name: 'Dota 2', info: 'MOBA от Valve' },
    { name: 'League of Legends', info: 'MOBA от Riot Games' },
    { name: 'Valorant', info: 'Тактический шутер от Riot Games' },
    { name: 'FIFA 24', info: 'Футбольный симулятор от EA Sports' },
  ];
  for (const game of games) {
    await prisma.game.upsert({
      where: { name: game.name },
      update: {},
      create: game,
    });
  }

  console.log('✅ Sample games seeded.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
