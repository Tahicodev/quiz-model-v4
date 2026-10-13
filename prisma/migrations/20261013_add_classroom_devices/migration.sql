-- Classroom Devices: one row per connected machine/browser. Populated from the
-- student socket `register` handshake and managed from the admin
-- "Classroom Devices" tab (block / allow / assign to student).

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "school_id" TEXT NOT NULL,
    "device_key" TEXT NOT NULL,
    "hostname" TEXT,
    "device_type" TEXT NOT NULL DEFAULT 'desktop',
    "platform" TEXT,
    "user_agent" TEXT,
    "last_ip" TEXT,
    "assigned_user_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'allowed',
    "note" TEXT,
    "last_seen" DATETIME,
    "first_seen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "Device_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Device_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Device_school_id_device_key_key" ON "Device"("school_id", "device_key");

-- CreateIndex
CREATE INDEX "Device_school_id_status_idx" ON "Device"("school_id", "status");

-- CreateIndex
CREATE INDEX "Device_school_id_assigned_user_id_idx" ON "Device"("school_id", "assigned_user_id");
