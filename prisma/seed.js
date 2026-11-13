/**
 * prisma/seed.js
 *
 * Idempotent seed: creates the bootstrap School tenant + an administrator
 * account + default settings across all visibility tiers. Safe to run on every
 * deploy — `upsert` + the existence check make it a no-op once seeded.
 *
 * The school id can be overridden via DEFAULT_SCHOOL_ID; otherwise a stable
 * development id is used. Real tenants created through the admin UI get
 * cryptographically-random ids and are NOT affected by this seed.
 *
 * ── FIRST-RUN ADMINISTRATOR PROVISIONING ──────────────────────────────────
 * There is NO published default password any more.
 *
 *   BOOTSTRAP_ADMIN_PASSWORD=<password>   → used as-is (never printed)
 *   (not set)                             → a random 20-character password
 *                                           is generated and printed ONCE
 *
 * An account whose hash still matches the historical well-known default is
 * ROTATED on the next seed run, so an installation that was seeded with the
 * old default stops accepting it.
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';

const prisma = new PrismaClient();

// Default tenant used for the bootstrap admin user. Operators can override
// this for their environment; there is no behaviour change otherwise.
const SCHOOL_ID = process.env.DEFAULT_SCHOOL_ID || 'saas-default';

// The historical default. Kept ONLY to detect an account that still uses it
// so it can be rotated — never to create one.
const LEGACY_DEFAULT_PASSWORD = 'admin123';

const PASSWORD_ALPHABET =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#%';

/** A random, readable, high-entropy bootstrap password. */
function generateBootstrapPassword(length = 20) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += PASSWORD_ALPHABET[bytes[i] % PASSWORD_ALPHABET.length];
  }
  return out;
}

/**
 * The password the administrator account will use.
 * @returns {{ password:string, generated:boolean }}
 */
function resolveBootstrapPassword() {
  const fromEnv = String(process.env.BOOTSTRAP_ADMIN_PASSWORD || '').trim();
  if (fromEnv) {
    if (fromEnv.length < 10) {
      throw new Error('BOOTSTRAP_ADMIN_PASSWORD must be at least 10 characters.');
    }
    return { password: fromEnv, generated: false };
  }
  return { password: generateBootstrapPassword(), generated: true };
}

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
  const { password, generated } = resolveBootstrapPassword();
  const bcryptRounds = Number(process.env.BCRYPT_ROUNDS) || 12;
  const adminHash = await bcrypt.hash(password, bcryptRounds);

  const existing = await prisma.user.findUnique({
    where: { school_id_username: { school_id: school.id, username: 'admin' } },
    select: { id: true, password_hash: true },
  });

  if (!existing) {
    await prisma.user.create({
      data: {
        school_id: school.id,
        username: 'admin',
        password_hash: adminHash,
        role: 'admin',
        name: 'School Administrator',
        status: 'active',
      },
    });
    console.log('✓ Administrator created: admin');
    if (generated) {
      console.log('');
      console.log('  ┌──────────────────────────────────────────────┐');
      console.log('  │  ONE-TIME ADMINISTRATOR PASSWORD              │');
      console.log('  ├──────────────────────────────────────────────┤');
      console.log(`  │  ${password.padEnd(44)} │`);
      console.log('  └──────────────────────────────────────────────┘');
      console.log('  Store it now — it is not shown again.');
      console.log('  Sign in at /console and change it immediately.');
      console.log('');
    } else {
      console.log('  (the password came from BOOTSTRAP_ADMIN_PASSWORD)');
    }
  } else {
    // Rotate an account that still carries the published default.
    const legacyHash = await bcrypt.hash(LEGACY_DEFAULT_PASSWORD, bcryptRounds);
    const stillDefault =
      existing.password_hash === legacyHash ||
      (await bcrypt.compare(LEGACY_DEFAULT_PASSWORD, existing.password_hash).catch(() => false));
    if (stillDefault) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { password_hash: adminHash },
      });
      console.log('✓ Administrator password rotated away from the published default');
      if (generated) {
        console.log(`  New one-time password: ${password}`);
        console.log('  Store it now — it is not shown again.');
      }
    } else {
      console.log('✓ Administrator already provisioned (password left untouched)');
    }
  }

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
    // bcrypt hash of the dashboard recovery code (set via Quick Start or the
    // admin panel). Empty = recovery flow disabled until an admin sets a code.
    { key: 'system.recovery_code_hash', value: '', visibility: 'system' },
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
  console.log('⚠  Change the administrator password immediately after first login!');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
