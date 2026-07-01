import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create default super admin
  const password_hash = await bcrypt.hash('admin123', 10);
  
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      password_hash,
      name: 'Super Admin',
      role: 'super_admin',
      school_id: 'local',
      status: 'active',
    },
  });
  
  console.log(`Ensured admin user exists (username: admin, password: admin123)`);

  // Create default public settings if missing
  const settings = [
    { key: 'app.name', value: 'Quiz App v4', visibility: 'public' },
    { key: 'app.theme', value: 'light', visibility: 'public' },
    { key: 'app.language', value: 'en', visibility: 'public' },
    { key: 'features.ai_enabled', value: 'true', visibility: 'admin' },
  ];

  for (const s of settings) {
    await prisma.setting.upsert({
      where: {
        school_id_key: { school_id: 'local', key: s.key }
      },
      update: {},
      create: {
        school_id: 'local',
        key: s.key,
        value: s.value,
        visibility: s.visibility,
      },
    });
  }
  
  console.log('Ensured default settings exist');
  console.log('Seeding complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
