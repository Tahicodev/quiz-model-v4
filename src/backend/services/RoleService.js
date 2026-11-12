/**
 * src/backend/services/RoleService.js
 *
 * Role catalog + per-user permission overrides.
 *
 * The enforcement default lives in `src/shared/permissions.js` (a frozen map).
 * This service mirrors that catalog into the `Role` / `RolePermission` tables
 * so the console can SHOW the real permission set — grouped, labelled and
 * auditable — instead of a hardcoded list, and stores the per-user grants and
 * denies that the code map cannot express.
 *
 * The code map stays authoritative for the *baseline*: a role always carries
 * what `ROLE_PERMISSIONS` says it carries. Overrides only ADD (grant) or
 * REMOVE (deny) a single permission for one user, optionally limited to one
 * organization.
 */

import { ROLES } from '../../shared/constants.js';
import {
  PERMISSIONS,
  PERMISSION_INDEX,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  ROLE_SCOPES,
  applyPermissionOverrides,
} from '../../shared/permissions.js';
import { NotFoundError, ValidationError } from '../../shared/errors.js';

const ROLE_DESCRIPTIONS = Object.freeze({
  [ROLES.SUPER_ADMIN]:
    'Platform operator. Sees every organization, governs access, and may act inside any organization.',
  [ROLES.ADMIN]:
    'Organization administrator. Manages the users, classes, content and settings of one organization.',
  [ROLES.TEACHER]:
    'Teacher. Authors content and manages the students of their assigned classes.',
  [ROLES.STUDENT]:
    'Student. Learns, takes assessments and plays the educational games of their organization.',
});

const ROLE_SCOPE_LABELS = Object.freeze({
  platform: 'Every organization',
  school: 'One organization',
  class: 'Own classes',
  none: 'No administrative scope',
});

export class RoleService {
  /** @param {import('../infrastructure/PrismaRepository.js').PrismaRepository} repo */
  constructor(repo) {
    this.#repo = repo;
  }

  #repo;

  get roles() {
    return this.#repo.modelFor('roles');
  }

  get rolePermissions() {
    return this.#repo.modelFor('role_permissions');
  }

  get overrides() {
    return this.#repo.modelFor('user_permission_overrides');
  }

  /**
   * Mirror the code catalog into the database. Idempotent: safe to run on
   * every boot and on every deploy. Rows that already exist are updated so a
   * catalog change propagates.
   * @returns {Promise<{ roles: number, permissions: number }>}
   */
  async ensureSeeded() {
    const roleKeys = Object.keys(ROLE_PERMISSIONS);

    for (const key of roleKeys) {
      const scope = ROLE_SCOPES[key] || 'none';
      await this.roles.upsert({
        where: { id: key },
        update: {
          key,
          label: ROLE_LABELS[key] || key,
          scope,
          description: ROLE_DESCRIPTIONS[key] || null,
          is_system: true,
          // A platform operator may assign any role except their own.
          is_assignable: key !== ROLES.SUPER_ADMIN,
        },
        create: {
          id: key,
          key,
          label: ROLE_LABELS[key] || key,
          scope,
          description: ROLE_DESCRIPTIONS[key] || null,
          is_system: true,
          is_assignable: key !== ROLES.SUPER_ADMIN,
        },
      });

      const permissions = ROLE_PERMISSIONS[key] || [];
      const existing = await this.rolePermissions.findMany({
        where: { role_id: key },
        select: { id: true, permission: true },
      });
      const existingSet = new Set(existing.map((r) => r.permission));

      const toCreate = permissions
        .filter((permission) => !existingSet.has(permission))
        .map((permission) => ({ role_id: key, permission, effect: 'allow' }));
      if (toCreate.length) await this.rolePermissions.createMany({ data: toCreate });

      // Drop permissions the role no longer carries. Overrides are separate
      // rows and are never touched here.
      const stale = existing.filter((r) => !permissions.includes(r.permission));
      if (stale.length) {
        await this.rolePermissions.deleteMany({
          where: { id: { in: stale.map((r) => r.id) } },
        });
      }
    }

    return {
      roles: roleKeys.length,
      permissions: roleKeys.reduce((sum, key) => sum + ROLE_PERMISSIONS[key].length, 0),
    };
  }

  /**
   * The role catalog with its permissions, for the Roles & Permissions page.
   */
  async listRoles() {
    const rows = await this.roles.findMany({ orderBy: { key: 'asc' } });
    const permRows = await this.rolePermissions.findMany({
      select: { role_id: true, permission: true, effect: true },
    });

    const byRole = new Map();
    for (const row of permRows) {
      if (!byRole.has(row.role_id)) byRole.set(row.role_id, []);
      byRole.get(row.role_id).push(row.permission);
    }

    return rows.map((role) => ({
      id: role.id,
      key: role.key,
      label: role.label,
      scope: role.scope,
      scopeLabel: ROLE_SCOPE_LABELS[role.scope] || role.scope,
      description: role.description,
      isSystem: role.is_system,
      isAssignable: role.is_assignable,
      permissions: (byRole.get(role.id) || []).sort(),
    }));
  }

  /**
   * The full permission catalog, grouped for display.
   */
  listPermissionCatalog() {
    const groups = new Map();
    for (const entry of PERMISSIONS) {
      if (!groups.has(entry.group)) groups.set(entry.group, []);
      groups.get(entry.group).push(entry);
    }
    return [...groups.entries()].map(([group, items]) => ({
      group,
      scope: items[0]?.scope || null,
      permissions: items.map((item) => ({ ...item })),
    }));
  }

  /**
   * Effective permissions for a user: role map + DB overrides.
   * @param {string} userId
   * @param {string} role
   * @param {string|null} [schoolId] when given, only overrides scoped to that
   *        organization (or global) are considered.
   */
  async effectivePermissions(userId, role, schoolId = null) {
    let overrides = [];
    if (userId) {
      overrides = await this.overrides.findMany({
        where: {
          user_id: userId,
          OR: [{ scope_key: '*' }, ...(schoolId ? [{ scope_key: String(schoolId) }] : [])],
        },
        select: { permission: true, effect: true, scope_key: true },
      });
    }
    return applyPermissionOverrides(role, overrides);
  }

  /**
   * The overrides recorded for one user.
   */
  async listOverrides(userId) {
    const rows = await this.overrides.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      include: {
        school: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, username: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      userName: row.user?.name || row.user?.username || row.user_id,
      schoolId: row.school_id,
      schoolName: row.school?.name || null,
      scopeKey: row.scope_key,
      permission: row.permission,
      permissionLabel: PERMISSION_INDEX[row.permission]?.label || row.permission,
      effect: row.effect,
      reason: row.reason,
      grantedBy: row.granted_by,
      createdAt: row.created_at,
    }));
  }

  /**
   * Grant or deny a single permission for a user.
   * @param {{ userId:string, schoolId?:string|null, permission:string,
   *           effect:'grant'|'deny', reason?:string|null, grantedBy?:string|null }} input
   */
  async setOverride({ userId, schoolId = null, permission, effect = 'grant', reason = null, grantedBy = null }) {
    if (!PERMISSION_INDEX[permission]) {
      throw new ValidationError({ permission: ['Unknown permission'] });
    }
    if (effect !== 'grant' && effect !== 'deny') {
      throw new ValidationError({ effect: ['Must be "grant" or "deny"'] });
    }
    const user = await this.#repo.modelFor('users').findUnique({
      where: { id: userId },
      select: { id: true, school_id: true },
    });
    if (!user) throw new NotFoundError('User');

    const scopeKey = schoolId ? String(schoolId) : '*';
    const row = await this.overrides.upsert({
      where: {
        user_id_scope_key_permission: {
          user_id: userId,
          scope_key: scopeKey,
          permission,
        },
      },
      update: { effect, reason, granted_by: grantedBy },
      create: {
        user_id: userId,
        school_id: schoolId || null,
        scope_key: scopeKey,
        permission,
        effect,
        reason,
        granted_by: grantedBy,
      },
    });
    return row;
  }

  /**
   * Remove an override. Removing restores the role's baseline.
   */
  async clearOverride({ userId, permission, schoolId = null }) {
    const scopeKey = schoolId ? String(schoolId) : '*';
    await this.overrides.deleteMany({
      where: { user_id: userId, permission, scope_key: scopeKey },
    });
    return { removed: true };
  }
}
