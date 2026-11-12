-- ─── Admin platform governance ───────────────────────────────────────────────
-- Additive only. No table is dropped, no existing column is renamed, retyped
-- or re-constrained. Safe on a fresh database and on an existing deployment:
-- every statement below either creates a new table or adds a column with a
-- constant default (which SQLite back-fills onto the existing rows).
--
-- 1. Organization lifecycle — `School.plan` already said WHAT an organization
--    is entitled to; `status` says WHETHER it may currently operate.
-- 2. Audit outcome + severity — the action alone could not distinguish a
--    successful action from a denied one, nor rank urgency.
-- 3. Security events — durable, append-only authentication/access trail.
--    Previously failed logins only existed in a volatile in-memory buffer.
-- 4. Roles & permissions — the catalog becomes visible and auditable, and
--    per-user grants/denies become expressible.

-- 1. Organization lifecycle ──────────────────────────────────────────────────
ALTER TABLE "School" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "School" ADD COLUMN "suspended_at" DATETIME;
ALTER TABLE "School" ADD COLUMN "suspended_reason" TEXT;

CREATE INDEX "School_status_idx" ON "School"("status");

-- 2. Audit outcome + severity ────────────────────────────────────────────────
-- Historical rows keep the default: every action recorded before this
-- migration completed successfully.
ALTER TABLE "AuditLog" ADD COLUMN "outcome" TEXT NOT NULL DEFAULT 'success';
ALTER TABLE "AuditLog" ADD COLUMN "severity" TEXT NOT NULL DEFAULT 'info';

CREATE INDEX "AuditLog_occurred_at_entity_type_idx" ON "AuditLog"("occurred_at", "entity_type");
CREATE INDEX "AuditLog_severity_occurred_at_idx" ON "AuditLog"("severity", "occurred_at");

-- 3. Security events ─────────────────────────────────────────────────────────
CREATE TABLE "SecurityEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "school_id" TEXT,
    "user_id" TEXT,
    "username" TEXT,
    "event_type" TEXT NOT NULL,
    "outcome" TEXT NOT NULL DEFAULT 'success',
    "severity" TEXT NOT NULL DEFAULT 'info',
    "reason" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "meta_json" TEXT,
    "occurred_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SecurityEvent_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SecurityEvent_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "SecurityEvent_school_id_occurred_at_idx" ON "SecurityEvent"("school_id", "occurred_at");
CREATE INDEX "SecurityEvent_event_type_occurred_at_idx" ON "SecurityEvent"("event_type", "occurred_at");
CREATE INDEX "SecurityEvent_user_id_occurred_at_idx" ON "SecurityEvent"("user_id", "occurred_at");
CREATE INDEX "SecurityEvent_severity_occurred_at_idx" ON "SecurityEvent"("severity", "occurred_at");

-- 4. Roles & permissions ─────────────────────────────────────────────────────
CREATE TABLE "Role" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "is_assignable" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "Role_key_key" ON "Role"("key");
CREATE INDEX "Role_scope_idx" ON "Role"("scope");

CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "role_id" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "effect" TEXT NOT NULL DEFAULT 'allow',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RolePermission_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "Role" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "RolePermission_role_id_permission_key" ON "RolePermission"("role_id", "permission");
CREATE INDEX "RolePermission_permission_idx" ON "RolePermission"("permission");

-- `scope_key` is the organization id, or '*' for "every scope". It exists
-- because SQLite treats NULLs as distinct in a unique index, which would allow
-- duplicate global overrides for the same (user, permission).
CREATE TABLE "UserPermissionOverride" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "school_id" TEXT,
    "role_id" TEXT,
    "scope_key" TEXT NOT NULL DEFAULT '*',
    "permission" TEXT NOT NULL,
    "effect" TEXT NOT NULL DEFAULT 'grant',
    "reason" TEXT,
    "granted_by" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "UserPermissionOverride_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserPermissionOverride_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserPermissionOverride_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "Role" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "UserPermissionOverride_user_id_scope_key_permission_key" ON "UserPermissionOverride"("user_id", "scope_key", "permission");
CREATE INDEX "UserPermissionOverride_user_id_idx" ON "UserPermissionOverride"("user_id");
CREATE INDEX "UserPermissionOverride_permission_idx" ON "UserPermissionOverride"("permission");
