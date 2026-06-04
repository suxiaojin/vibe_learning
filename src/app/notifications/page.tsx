import Link from "next/link";
import { Bell, FileText } from "lucide-react";
import { StudentSidebar } from "@/components/student-sidebar";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const tabs = ["系统消息", "导入消息", "导出消息", "下载消息", "督导消息"];

export default async function NotificationsPage() {
  const user = await requireUser();
  const now = new Date();
  const visibleNotificationWhere = {
    userId: user.id,
    notification: {
      status: "sent" as const
    }
  };
  const unreadReceipts = await prisma.notificationRecipient.findMany({
    where: {
      ...visibleNotificationWhere,
      readAt: null
    },
    select: { id: true }
  });
  const unreadReceiptIds = unreadReceipts.map((receipt) => receipt.id);

  if (unreadReceiptIds.length > 0) {
    await prisma.notificationRecipient.updateMany({
      where: { id: { in: unreadReceiptIds } },
      data: { readAt: now }
    });
  }

  const receipts = await prisma.notificationRecipient.findMany({
    where: visibleNotificationWhere,
    orderBy: { deliveredAt: "desc" },
    include: {
      notification: {
        select: {
          title: true,
          contentHtml: true,
          sentAt: true
        }
      }
    }
  });
  const unreadSet = new Set(unreadReceiptIds);

  return (
    <main className="min-h-dvh bg-[#f2f2f2] lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <StudentSidebar active="notifications" />

      <section className="min-w-0 px-5 py-7 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <nav className="mb-8 text-sm font-semibold text-slate-600" aria-label="面包屑">
            <Link className="hover:text-teal" href="/learn">首页</Link>
            <span className="mx-2 text-slate-400">&gt;</span>
            <span>消息中心</span>
          </nav>

          <div className="bg-white">
            <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-6 py-6">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-xl bg-sky-50 text-sky-600">
                  <Bell size={22} />
                </span>
                <h1 className="text-2xl font-medium text-slate-900">消息中心</h1>
              </div>
              <div className="flex min-h-11 flex-wrap items-center gap-8 text-base text-slate-700">
                {tabs.map((tab, index) => (
                  <button
                    key={tab}
                    className={index === 0 ? "border-b-4 border-[#0872b9] px-1 pb-4 font-semibold text-[#0872b9]" : "px-1 pb-4 text-slate-700"}
                    disabled={index !== 0}
                    type="button"
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </header>

            <div className="px-6 py-5">
              <p className="text-base font-semibold text-red-600">
                说明：系统通知会长期保留；管理员撤回后将不再显示。
              </p>

              <div className="mt-6 overflow-x-auto border border-slate-200">
                <table className="w-full min-w-[760px] table-fixed border-collapse text-center text-sm">
                  <thead>
                    <tr className="bg-[#f5fafc] text-slate-800">
                      <th className="border-b border-slate-200 px-4 py-4 font-medium">消息名称</th>
                      <th className="border-b border-slate-200 px-4 py-4 font-medium">消息内容</th>
                      <th className="border-b border-slate-200 px-4 py-4 font-medium">消息时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receipts.length === 0 ? (
                      <tr>
                        <td className="h-[450px] border-b border-slate-100 px-4 py-12" colSpan={3}>
                          <div className="grid place-items-center text-slate-400">
                            <div className="grid size-28 place-items-center rounded-full bg-slate-100 text-slate-300">
                              <FileText size={56} strokeWidth={1.5} />
                            </div>
                            <p className="mt-4 text-lg font-medium">暂无数据</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      receipts.map((receipt) => (
                        <tr key={receipt.id} className="align-top text-slate-700">
                          <td className="border-b border-slate-100 px-4 py-5 text-left">
                            <div className="flex items-center gap-2">
                              {unreadSet.has(receipt.id) ? <span className="badge bg-coral/10 text-coral">未读</span> : null}
                              <span className="font-semibold text-slate-900">{receipt.notification.title}</span>
                            </div>
                          </td>
                          <td className="border-b border-slate-100 px-4 py-5 text-left">
                            <div
                              className="notification-rich-text max-w-none text-sm leading-7 text-slate-700 [&_a]:font-semibold [&_a]:text-teal [&_blockquote]:border-l-4 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_h2]:text-lg [&_h2]:font-black [&_h3]:font-bold [&_img]:my-3 [&_img]:h-auto [&_img]:max-w-full [&_li]:ml-5 [&_ol]:list-decimal [&_p]:my-1 [&_ul]:list-disc"
                              dangerouslySetInnerHTML={{ __html: receipt.notification.contentHtml }}
                            />
                          </td>
                          <td className="border-b border-slate-100 px-4 py-5 text-slate-600">
                            {receipt.notification.sentAt ? formatDateTime(receipt.notification.sentAt) : formatDateTime(receipt.deliveredAt)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function formatDateTime(date: Date) {
  return date.toLocaleString("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Shanghai",
    year: "numeric"
  });
}
