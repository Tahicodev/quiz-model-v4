import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
try {
	const users = await prisma.user.findMany({
		select: { username: true, role: true, status: true, school_id: true },
		take: 40,
	});
	console.log('USERS', JSON.stringify(users, null, 1));
	const school = await prisma.school.findFirst().catch(() => null);
	console.log('SCHOOL', school && school.id);
	const deviceCount = await prisma.device.count().catch((e) => 'no device model: ' + e.message);
	console.log('DEVICES', deviceCount);
} finally {
	await prisma.$disconnect();
}
