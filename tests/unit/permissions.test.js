/**
 * tests/unit/permissions.test.js
 *
 * The permission catalog is the contract between the Roles & Permissions page
 * and the code that enforces access. These tests pin:
 *   - every permission id is unique and namespaced,
 *   - every role's permission list only contains catalog entries,
 *   - overrides can add and remove a permission, and nothing else.
 */

import { describe, it, expect } from 'vitest';

import {
	PERMISSIONS,
	PERMISSION_INDEX,
	ROLE_PERMISSIONS,
	ROLE_SCOPES,
	SCOPES,
	permissionsForRole,
	roleHasPermission,
	applyPermissionOverrides,
	isConsoleRole,
} from '../../src/shared/permissions.js';
import { ROLES } from '../../src/shared/constants.js';

describe('Permission catalog', () => {
	it('has unique, namespaced permission ids', () => {
		const ids = PERMISSIONS.map((p) => p.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const entry of PERMISSIONS) {
			expect(entry.id).toMatch(/^(platform|school|class)\.[a-z0-9.]+$/);
			expect(entry.scope).toBe(entry.id.split('.')[0]);
		}
	});

	it('gives every permission a label and a description', () => {
		for (const entry of PERMISSIONS) {
			expect(entry.label, entry.id).toBeTruthy();
			expect(entry.description, entry.id).toBeTruthy();
		}
	});

	it('indexes every permission by id', () => {
		for (const entry of PERMISSIONS) {
			expect(PERMISSION_INDEX[entry.id]).toBeTruthy();
			expect(PERMISSION_INDEX[entry.id].label).toBe(entry.label);
		}
	});
});

describe('Role map', () => {
	it('only references catalog entries', () => {
		for (const [role, permissions] of Object.entries(ROLE_PERMISSIONS)) {
			for (const permission of permissions) {
				expect(PERMISSION_INDEX[permission], `${role} → ${permission}`).toBeTruthy();
			}
		}
	});

	it('scopes each role to the right slice of the platform', () => {
		expect(ROLE_SCOPES[ROLES.SUPER_ADMIN]).toBe(SCOPES.PLATFORM);
		expect(ROLE_SCOPES[ROLES.ADMIN]).toBe(SCOPES.SCHOOL);
		expect(ROLE_SCOPES[ROLES.TEACHER]).toBe(SCOPES.CLASS);
		expect(ROLE_SCOPES[ROLES.STUDENT]).toBe('none');
	});

	it('gives a platform operator both the platform and the school sets', () => {
		const platformPermissions = permissionsForRole(ROLES.SUPER_ADMIN);
		expect(platformPermissions.some((p) => p.startsWith('platform.'))).toBe(true);
		expect(platformPermissions.some((p) => p.startsWith('school.'))).toBe(true);
	});

	it('gives an organization administrator no platform permissions', () => {
		const adminPermissions = permissionsForRole(ROLES.ADMIN);
		expect(adminPermissions.some((p) => p.startsWith('platform.'))).toBe(false);
		expect(adminPermissions.some((p) => p.startsWith('school.'))).toBe(true);
	});

	it('gives a teacher no console permissions', () => {
		const teacherPermissions = permissionsForRole(ROLES.TEACHER);
		expect(teacherPermissions.some((p) => p.startsWith('platform.'))).toBe(false);
		expect(teacherPermissions.some((p) => p.startsWith('school.'))).toBe(false);
		expect(teacherPermissions.every((p) => p.startsWith('class.'))).toBe(true);
	});

	it('gives a student nothing', () => {
		expect(permissionsForRole(ROLES.STUDENT)).toEqual([]);
	});

	it('reports the console roles', () => {
		expect(isConsoleRole(ROLES.SUPER_ADMIN)).toBe(true);
		expect(isConsoleRole(ROLES.ADMIN)).toBe(true);
		expect(isConsoleRole(ROLES.TEACHER)).toBe(false);
		expect(isConsoleRole(ROLES.STUDENT)).toBe(false);
	});
});

describe('Permission overrides', () => {
	it('grants a permission the role does not carry', () => {
		const effective = applyPermissionOverrides(ROLES.TEACHER, [
			{ permission: 'school.analytics.read', effect: 'grant' },
		]);
		expect(effective).toContain('school.analytics.read');
	});

	it('denies a permission the role does carry', () => {
		const effective = applyPermissionOverrides(ROLES.ADMIN, [
			{ permission: 'school.users.manage', effect: 'deny' },
		]);
		expect(effective).not.toContain('school.users.manage');
		expect(effective).toContain('school.analytics.read');
	});

	it('ignores rows without a permission', () => {
		const effective = applyPermissionOverrides(ROLES.ADMIN, [{ effect: 'grant' }]);
		expect(effective).toEqual(permissionsForRole(ROLES.ADMIN));
	});

	it('never changes the role map itself', () => {
		const before = permissionsForRole(ROLES.ADMIN);
		applyPermissionOverrides(ROLES.ADMIN, [
			{ permission: 'school.users.manage', effect: 'deny' },
		]);
		expect(permissionsForRole(ROLES.ADMIN)).toEqual(before);
	});
});

describe('roleHasPermission', () => {
	it('answers for known roles', () => {
		expect(roleHasPermission(ROLES.ADMIN, 'school.users.manage')).toBe(true);
		expect(roleHasPermission(ROLES.ADMIN, 'platform.users.manage')).toBe(false);
		expect(roleHasPermission('unknown-role', 'school.users.manage')).toBe(false);
	});
});
