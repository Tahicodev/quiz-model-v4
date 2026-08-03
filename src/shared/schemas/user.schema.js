import { z } from 'zod';
import { ROLES } from '../constants.js';

const roleValues = Object.values(ROLES);

export const UserCreateSchema = z.object({
	username: z.string().min(2).max(50),
	password: z.string().min(6).max(100),
	name: z.string().min(1).max(100),
	role: z.enum(roleValues).default('student'),
	class_id: z.string().min(1).max(100).optional().nullable(),
	numero: z.string().max(50).optional().nullable(),
	status: z.enum(['active', 'inactive', 'suspended']).default('active'),
});

export const UserUpdateSchema = z.object({
	name: z.string().min(1).max(100).optional(),
	role: z.enum(roleValues).optional(),
	class_id: z.string().min(1).max(100).optional().nullable(),
	numero: z.string().max(50).optional().nullable(),
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
});
