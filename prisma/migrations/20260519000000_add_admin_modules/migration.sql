CREATE TABLE "admin_modules" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'settings',
    "status" "ContentStatus" NOT NULL DEFAULT 'published',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "builtIn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_modules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "admin_modules_key_key" ON "admin_modules"("key");
CREATE INDEX "admin_modules_status_sortOrder_idx" ON "admin_modules"("status", "sortOrder");

INSERT INTO "admin_modules" ("id", "key", "label", "href", "icon", "status", "sortOrder", "builtIn", "updatedAt")
VALUES
  ('admin_module_dashboard', 'dashboard', '仪表盘', '/admin/regions', 'dashboard', 'published', 1, true, CURRENT_TIMESTAMP),
  ('admin_module_regions', 'regions', '区域管理', '/admin/regions', 'map', 'published', 2, true, CURRENT_TIMESTAMP),
  ('admin_module_public_subjects', 'public-subjects', '公共课管理', '/admin/public-subjects', 'book', 'published', 3, true, CURRENT_TIMESTAMP),
  ('admin_module_majors', 'majors', '专业课管理', '/admin/majors', 'graduation', 'published', 4, true, CURRENT_TIMESTAMP),
  ('admin_module_settings', 'settings', '系统设置', '/admin/regions', 'settings', 'published', 99, true, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
