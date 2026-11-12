/**
 * scripts/create-platform-admin.mjs
 *
 * Provision a platform administrator (role = super_admin).
 *
 * A platform administrator operates across every organization: they see the
 * platform control center, can read every organization's usage, and can act
 * inside any one of them.
 *
 * There is deliberately no UI for this — granting platform access is an
 * operator action taken on the server, not a self-service one. The account
 * still lives in a specific organization (its "home" tenant) and the platform
 * scope is granted by the role, not by the tenant.
 *
 * Usage:
 *   node scripts/create-platform-admin.mjs --username=root --password='...' \
 *        [--name='Platform Operator'] [--school=<slug-or-id>] [--school-type=lycee]
 *
 * The school is created if it does not exist.
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

function arg(name, fallback = null) {
	const match = process.argv.find((value) => value.startsWith(`--${name}=`));
	if (!match) return fallback;
	const value = match.slice(name.length + 3);
	return value.replace(/^["']|["']$/g, '');
}

async function main() {
	const username = arg('username');
	const password = arg('password');
	const name = arg('name', 'Platform Operator');
	const schoolSlug = arg('school', 'platform');
	const schoolType = arg('school-type', 'lycee');

	if (!username || !password) {
		console.error('Usage: node scripts/create-platform-admin.mjs --username=… --password=…');
		process.exit(1);
	}
	if (password.length < 8) {
		console.error('The password must be at least 8 characters.');
		process.exit(1);
	}

	const school = await prisma.school.upsert({
		where: { slug: schoolSlug },
		update: {},
		create: {
			name: arg('school-name', 'Platform Operations'),
			slug: schoolSlug,
			school_type: schoolType,
			status: 'active',
		},
	});

	const passwordHash = await bcrypt.hash(password, 12);
	const user = await prisma.user.upsert({
		where: { school_id_username: { school_id: school.id, username } },
		update: { role: 'super_admin', status: 'active', password_hash: passwordHash, name },
		create: {
			school_id: school.id,
			username,
			password_hash: passwordHash,
			role: 'super_admin',
			status: 'active',
			name,
		},
	});

	console.log(`✓ Platform administrator ready: ${user.username} (${user.id})`);
	console.log(`  Home organization: ${school.name} (${school.id})`);
	console.log('  Sign in at /console — the platform scope reaches every organization.');
}

main()
	.catch((err) => {
		console.error('Failed:', err.message);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
