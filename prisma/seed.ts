import 'dotenv/config';
import prisma from '../src/lib/prisma';

async function main() {
  await prisma.user.upsert({
    where: { id: '00000000-0000-0000-0000-000000000000' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000000',
      email: 'local@dreamstation.invalid',
      password: '', // Local profile, not a login credential.
      name: 'Local curator',
    },
  });
  console.log('DreamStation local profile is ready.');
}
main().catch(() => {
  console.error('Database setup failed. Check DATABASE_URL and run npm run db:setup.');
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
