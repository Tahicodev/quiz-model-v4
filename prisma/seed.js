/**
 * prisma/seed.js
 *
 * Idempotent seed: creates the bootstrap School tenant + an admin user +
 * default settings across all visibility tiers. Safe to run on every deploy —
 * `upsert` + the existence check make it a no-op once seeded.
 *
 * The school id can be overridden via DEFAULT_SCHOOL_ID; otherwise a stable
 * development id is used. Real tenants created through the admin UI get
 * cryptographically-random ids and are NOT affected by this seed.
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Default tenant used for the bootstrap admin user. Operators can override
// this for their environment; there is no behaviour change otherwise.
const SCHOOL_ID = process.env.DEFAULT_SCHOOL_ID || 'saas-default';

async function main() {
  // ── Default school (the tenant root for the bootstrap admin user) ─────────
  const school = await prisma.school.upsert({
    where: { slug: SCHOOL_ID },
    update: {},
    create: {
      id: SCHOOL_ID,
      name: 'My School',
      slug: SCHOOL_ID,
    },
  });
  console.log(`✓ School ensured: ${school.name} (id: ${school.id})`);

  // ── Admin user ─────────────────────────────────────────────────────────────
  const adminHash = await bcrypt.hash('admin123', 12);
  await prisma.user.upsert({
    where: { school_id_username: { school_id: school.id, username: 'admin' } },
    update: {},
    create: {
      school_id: school.id,
      username: 'admin',
      password_hash: adminHash,
      role: 'admin',
      name: 'School Administrator',
      status: 'active',
    },
  });
  console.log('✓ Admin user ensured: admin / admin123');

  // ── Default settings by visibility tier ────────────────────────────────────
  const settings = [
    // Public — safe for any visitor to read (login page, branding)
    { key: 'app.name', value: 'Quiz App', visibility: 'public' },
    { key: 'app.language', value: 'en', visibility: 'public' },
    { key: 'app.logo_url', value: '', visibility: 'public' },

    // Teacher — visible to admin/teacher after login
    { key: 'exam.default_duration', value: '60', visibility: 'teacher' },
    { key: 'exam.default_passing_score', value: '50', visibility: 'teacher' },
    { key: 'game.max_players', value: '30', visibility: 'teacher' },

    // Admin — visible to admin only
    { key: 'auth.allow_student_register', value: 'false', visibility: 'admin' },
    { key: 'auth.registration_code', value: '', visibility: 'admin' },

    // System — NEVER sent to any client
    { key: 'system.backup_key', value: '', visibility: 'system' },
  ];

  for (const s of settings) {
    await prisma.setting.upsert({
      where: { school_id_key: { school_id: school.id, key: s.key } },
      update: {},
      create: { school_id: school.id, ...s },
    });
  }
  console.log(`✓ ${settings.length} default settings ensured`);

  console.log('');
  console.log('⚠  Change the admin password immediately after first login!');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
