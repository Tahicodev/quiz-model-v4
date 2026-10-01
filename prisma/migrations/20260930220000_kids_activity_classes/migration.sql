-- Which classes are meant to play a Kids Space activity.
-- Mirrors ExamClass so both assignment lists behave the same way.
CREATE TABLE "KidsActivityClass" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "activity_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "assigned_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KidsActivityClass_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "KidsActivity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KidsActivityClass_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "Class" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "KidsActivityClass_activity_id_class_id_key" ON "KidsActivityClass"("activity_id", "class_id");
CREATE INDEX "KidsActivityClass_activity_id_idx" ON "KidsActivityClass"("activity_id");
CREATE INDEX "KidsActivityClass_class_id_idx" ON "KidsActivityClass"("class_id");
