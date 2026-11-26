"use server";

import { getCurrentAdmin } from "@/lib/auth";
import { adminProjectPurchasersSchema, listAdminProjectPurchasers } from "@/lib/admin-study-project-purchases";

export async function getStudyProjectPurchaseUsers(input: unknown) {
  if (!await getCurrentAdmin()) {
    return { ok: false as const, error: "请先登录管理后台。" };
  }
  const parsed = adminProjectPurchasersSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "购买用户查询参数不合法。" };
  }
  const data = await listAdminProjectPurchasers(parsed.data);
  if (!data) {
    return { ok: false as const, error: "项目不存在或已删除，无法查看购买用户。" };
  }
  return { ok: true as const, data };
}
