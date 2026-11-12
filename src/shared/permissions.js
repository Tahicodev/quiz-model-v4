/**
 * src/shared/permissions.js
 *
 * Permission catalog + role→permission map for the Admin control center.
 *
 * Design rules
 * ────────────
 * 1. A permission is a stable dotted string. Never rename one: the string is
 *    persisted in `RolePermission` and `UserPermissionOverride`.
 * 2. Permissions are namespaced by the scope they apply in:
 *      platform.* → cross-tenant (SaaS operator)
 *      school.*   → inside one organization (school administrator)
 *      class.*    → inside the teacher's own classes (teacher session)
 * 3. The role map below is the ENFORCEMENT DEFAULT and is always applied.
 *    `UserPermissionOverride` rows can add (grant) or remove (deny) a single
 *    permission for one user, optionally scoped to one organization.
 * 4. Import from here in both frontend and backend. Never hardcode these
 *    strings elsewhere.
 */

import { ROLES } from './constants.js';

/** Scope a permission is evaluated in. */
export const SCOPES = Object.freeze({
  PLATFORM: 'platform',
  SCHOOL: 'school',
  CLASS: 'class',
});

/**
 * The catalog. `group` drives the grouping in the Roles & Permissions UI;
 * `description` is the human-readable explanation shown next to the toggle.
 */
export const PERMISSIONS = Object.freeze([
  // ── Platform (cross-tenant) ─────────────────────────────────────────────
  { id: 'platform.console',           group: 'Platform', scope: SCOPES.PLATFORM, label: 'Access the platform control center', description: 'Open the platform console and read the platform-wide overview.' },
  { id: 'platform.organizations.read', group: 'Platform', scope: SCOPES.PLATFORM, label: 'View organizations', description: 'List and inspect every organization on the platform.' },
  { id: 'platform.organizations.manage', group: 'Platform', scope: SCOPES.PLATFORM, label: 'Manage organizations', description: 'Create organizations and change their profile, plan and quotas.' },
  { id: 'platform.organizations.status', group: 'Platform', scope: SCOPES.PLATFORM, label: 'Change organization status', description: 'Suspend, reactivate or move an organization to pending.' },
  { id: 'platform.users.read',         group: 'Platform', scope: SCOPES.PLATFORM, label: 'View platform users', description: 'Read accounts across every organization.' },
  { id: 'platform.users.manage',       group: 'Platform', scope: SCOPES.PLATFORM, label: 'Manage platform users', description: 'Change account status, roles and permissions across organizations.' },
  { id: 'platform.analytics.read',     group: 'Platform', scope: SCOPES.PLATFORM, label: 'View platform analytics', description: 'Read platform-wide activity, engagement and adoption analytics.' },
  { id: 'platform.audit.read',         group: 'Platform', scope: SCOPES.PLATFORM, label: 'View platform audit log', description: 'Search administrative actions and authentication events across organizations.' },
  { id: 'platform.health.read',        group: 'Platform', scope: SCOPES.PLATFORM, label: 'View system health', description: 'Read service availability, error rates and resource usage.' },
  { id: 'platform.settings.manage',    group: 'Platform', scope: SCOPES.PLATFORM, label: 'Manage platform settings', description: 'Change global configuration, security policies and feature availability.' },

  // ── School (single organization) ────────────────────────────────────────
  { id: 'school.console',              group: 'School', scope: SCOPES.SCHOOL, label: 'Access the school console', description: 'Open the administration console for this organization.' },
  { id: 'school.profile.read',         group: 'School', scope: SCOPES.SCHOOL, label: 'View organization profile', description: 'Read this organization’s profile, plan and quota.' },
  { id: 'school.profile.manage',       group: 'School', scope: SCOPES.SCHOOL, label: 'Edit organization profile', description: 'Change the organization name, contacts, logo and academic year.' },
  { id: 'school.users.read',           group: 'School', scope: SCOPES.SCHOOL, label: 'View users', description: 'List administrators, teachers and students of this organization.' },
  { id: 'school.users.manage',         group: 'School', scope: SCOPES.SCHOOL, label: 'Manage users', description: 'Create, activate, suspend or delete accounts in this organization.' },
  { id: 'school.roles.manage',         group: 'School', scope: SCOPES.SCHOOL, label: 'Manage roles and permissions', description: 'Assign roles and grant or revoke permissions for this organization.' },
  { id: 'school.invitations.manage',   group: 'School', scope: SCOPES.SCHOOL, label: 'Manage invitations', description: 'Review and decide on account and profile requests.' },
  { id: 'school.analytics.read',       group: 'School', scope: SCOPES.SCHOOL, label: 'View organization analytics', description: 'Read activity, engagement and adoption analytics for this organization.' },
  { id: 'school.audit.read',           group: 'School', scope: SCOPES.SCHOOL, label: 'View audit log', description: 'Search administrative actions and authentication events for this organization.' },
  { id: 'school.health.read',          group: 'School', scope: SCOPES.SCHOOL, label: 'View system health', description: 'Read service availability and error trends.' },
  { id: 'school.settings.manage',      group: 'School', scope: SCOPES.SCHOOL, label: 'Manage organization settings', description: 'Change this organization’s settings, security policies and feature availability.' },
  { id: 'school.devices.manage',       group: 'School', scope: SCOPES.SCHOOL, label: 'Manage classroom devices', description: 'Allow, block and assign classroom devices.' },

  // ── Class (teacher) ─────────────────────────────────────────────────────
  { id: 'class.content.author',        group: 'Class', scope: SCOPES.CLASS, label: 'Author content', description: 'Create questions, exams, courses and games for assigned classes.' },
  { id: 'class.students.read',         group: 'Class', scope: SCOPES.CLASS, label: 'View class students', description: 'Read the roster and progress of students in assigned classes.' },
  { id: 'class.realtime.manage',       group: 'Class', scope: SCOPES.CLASS, label: 'Manage live sessions', description: 'Push games and exams to assigned classes.' },
]);

/** Fast lookup: permission id → catalog entry. */
export const PERMISSION_INDEX = Object.freeze(
  PERMISSIONS.reduce((acc, entry) => {
    acc[entry.id] = entry;
    return acc;
  }, Object.create(null)),
);

/** All permission ids of a given scope. */
export function permissionsInScope(scope) {
  return PERMISSIONS.filter((p) => p.scope === scope).map((p) => p.id);
}

const PLATFORM_IDS = permissionsInScope(SCOPES.PLATFORM);
const SCHOOL_IDS = permissionsInScope(SCOPES.SCHOOL);
const CLASS_IDS = permissionsInScope(SCOPES.CLASS);

/**
 * Enforcement default: which permissions each role carries.
 * A SUPER_ADMIN operates the platform AND may drill into any single
 * organization, so it carries the platform set plus the school set.
 */
export const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.SUPER_ADMIN]: Object.freeze([...PLATFORM_IDS, ...SCHOOL_IDS]),
  [ROLES.ADMIN]: Object.freeze([...SCHOOL_IDS]),
  [ROLES.TEACHER]: Object.freeze([...CLASS_IDS]),
  [ROLES.STUDENT]: Object.freeze([]),
});

/** The scope a role operates in. */
export const ROLE_SCOPES = Object.freeze({
  [ROLES.SUPER_ADMIN]: SCOPES.PLATFORM,
  [ROLES.ADMIN]: SCOPES.SCHOOL,
  [ROLES.TEACHER]: SCOPES.CLASS,
  [ROLES.STUDENT]: 'none',
});

/** Permission ids carried by a role (without DB overrides). */
export function permissionsForRole(role) {
  return ROLE_PERMISSIONS[role] ? [...ROLE_PERMISSIONS[role]] : [];
}

/**
 * Does the role carry the permission on its own?
 * Overrides are applied by the caller (backend) because they need the DB.
 */
export function roleHasPermission(role, permission) {
  const list = ROLE_PERMISSIONS[role];
  return Array.isArray(list) ? list.includes(permission) : false;
}

/** Roles that may reach the platform control center. */
export function isConsoleRole(role) {
  return role === ROLES.SUPER_ADMIN || role === ROLES.ADMIN;
}

/**
 * Apply DB overrides to a role's permission list.
 * @param {string} role
 * @param {Array<{permission:string, effect:'grant'|'deny'}>} overrides
 * @returns {string[]} effective permission ids
 */
export function applyPermissionOverrides(role, overrides = []) {
  const effective = new Set(permissionsForRole(role));
  for (const row of overrides || []) {
    if (!row?.permission) continue;
    if (row.effect === 'grant') effective.add(row.permission);
    else if (row.effect === 'deny') effective.delete(row.permission);
  }
  return [...effective];
}

/** Human-readable label for a role (used by the console + notifications). */
export const ROLE_LABELS = Object.freeze({
  [ROLES.SUPER_ADMIN]: 'Platform administrator',
  [ROLES.ADMIN]: 'Organization administrator',
  [ROLES.TEACHER]: 'Teacher',
  [ROLES.STUDENT]: 'Student',
});
