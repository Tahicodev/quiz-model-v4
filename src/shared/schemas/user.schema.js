import { z } from 'zod';
import { ROLES } from '../constants.js';

const roleValues = Object.values(ROLES);

const optionalContact = (max) =>
	z
		.string()
		.max(max)
		.optional()
		.nullable()
		.transform((v) => (v == null || v.trim() === '' ? null : v.trim()));

	// Raw strings are accepted and cleaned in the transform (trim + drop
	// empties) — a per-item min(1) would reject "Math, ," before cleanup.
	const subjectsField = z
		.array(z.string().max(100))
		.max(20)
		.optional()
		.nullable()
		.transform((v) => (v == null ? null : v.map((s) => s.trim()).filter(Boolean)));

export const UserCreateSchema = z.object({
	username: z.string().min(2).max(50),
	password: z.string().min(6).max(100),
	name: z.string().min(1).max(100),
	role: z.enum(roleValues).default('student'),
	class_id: z.string().min(1).max(100).optional().nullable(),
	numero: z.string().max(50).optional().nullable(),
	// Teacher/staff contact fields (safe for students/admins — they stay null).
	email: z
		.string()
		.max(255)
		.optional()
		.nullable()
		.transform((v) => (v == null || v.trim() === '' ? null : v.trim()))
		.refine((v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
			message: 'Invalid email address',
		}),
	phone: optionalContact(50),
	subjects: subjectsField,
	status: z.enum(['active', 'inactive', 'suspended']).default('active'),
});

export const UserUpdateSchema = z.object({
	name: z.string().min(1).max(100).optional(),
	role: z.enum(roleValues).optional(),
	class_id: z.string().min(1).max(100).optional().nullable(),
	numero: z.string().max(50).optional().nullable(),
	email: z
		.string()
		.max(255)
		.optional()
		.nullable()
		.transform((v) => (v == null || v.trim() === '' ? null : v.trim()))
		.refine((v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
			message: 'Invalid email address',
		}),
	phone: optionalContact(50),
	subjects: subjectsField,
	status: z.enum(['active', 'inactive', 'suspended']).optional(),
});

export const UserFilterSchema = z.object({
	role: z.enum(roleValues).optional(),
	class_id: z.string().uuid().optional(),
	status: z.enum(['active', 'inactive', 'suspended']).optional(),
	search: z.string().optional(),
	limit: z.coerce.number().int().min(1).max(200).default(50),
	offset: z.coerce.number().int().min(0).default(0),
	orderBy: z
		.enum(['name', 'username', 'created_at', 'last_login'])
		.default('name'),
	direction: z.enum(['asc', 'desc']).default('asc'),
});

export const ChangePasswordSchema = z.object({
	oldPassword: z.string().min(1),
	newPassword: z.string().min(6).max(100),
});

export const LoginSchema = z.object({
	username: z.string().min(1),
	password: z.string().min(1),
	schoolSlug: z.string().optional(),
	// Which surface is signing in ("admin" | "student"). The admin portal and
	// the student workspace can be open in two tabs of the SAME browser — the
	// refresh cookie is scoped per portal so one tab's refresh never rotates
	// (or mints a wrong-identity token for) the other tab's session.
	portal: z.enum(['admin', 'student']).optional(),
});
