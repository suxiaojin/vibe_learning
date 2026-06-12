import Link from "next/link";
import {
  Bot,
  CalendarClock,
  History,
  Mail,
  Power,
  PowerOff,
  RotateCcw,
  Save,
  Send,
  Trash2,
  Undo2,
  UsersRound
} from "lucide-react";
import {
  archiveNotification,
  cancelScheduledEmail,
  cancelScheduledNotification,
  createEmailAutomationRule,
  createNotificationAutomationRule,
  deleteNotificationAutomationRule,
  deleteNotificationTemplate,
  rescheduleEmailNotification,
  rescheduleNotification,
  restoreNotification,
  saveNotificationTemplate,
  scheduleEmailNotification,
  scheduleNotification,
  sendEmailNotification,
  sendNotification,
  toggleNotificationAutomationRule
} from "@/app/admin/notifications/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { NotificationRecipientPicker, type NotificationRecipientOption } from "@/components/notification-recipient-picker";
import { RichTextEditor } from "@/components/rich-text-editor";
import { requireAdmin } from "@/lib/auth";
import { isValidEmail, normalizeEmail } from "@/lib/email-verification";
import { stripNotificationHtml } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type NotificationTab = "email" | "records" | "send" | "templates";
type NotificationSendMode = "automated" | "immediate" | "scheduled";

const tabs: Array<{ key: NotificationTab; label: string }> = [
  { key: "send", label: "通知发送" },
  { key: "email", label: "邮件发送" },
  { key: "templates", label: "通知模板" },
  { key: "records", label: "通知记录" }
];
const errorText: Record<string, string> = {
  "automation-delay-invalid": "延迟时间必须是 0 至 10080 分钟之间的整数。",
  "automation-event-required": "请选择自动通知触发场景。",
  "automation-name-required": "请输入自动通知规则名称。",
  "content-required": "请输入通知内容。",
  "content-too-large": "通知内容过大，请减少图片或文字后再提交。",
  "email-recipients-unavailable": "所选学生没有可用邮箱，请重新选择。",
  "recipients-required": "请选择接收学生。",
  "recipients-unavailable": "没有找到可接收通知的正常学生账号。",
  "scheduled-time-invalid": "请选择晚于当前时间的发送日期和时间。",
  "template-name-required": "请输入模板名称。",
  "template-required": "请选择通知模板。",
  "template-unavailable": "选择的通知模板不存在或已删除。",
  "title-required": "请输入通知标题。"
};
const noticeText: Record<string, string> = {
  "automation-created": "自动通知规则已创建。",
  "automation-deleted": "自动通知规则已删除。",
  "automation-disabled": "自动通知规则已停用。",
  "automation-enabled": "自动通知规则已启用。",
  restored: "通知已恢复展示。",
  "schedule-cancelled": "定时发送计划已取消。",
  "schedule-updated": "定时发送计划已重新排期。",
  "template-created": "通知模板已保存。",
  "template-deleted": "通知模板已删除。",
  "template-updated": "通知模板已更新。",
  withdrawn: "通知已撤回，学生端不再展示。"
};

function resolveTab(value?: string): NotificationTab {
  return tabs.some((tab) => tab.key === value) ? (value as NotificationTab) : "send";
}

export default async function AdminNotificationsPage({
  searchParams
}: {
  searchParams?: Promise<{ count?: string; error?: string; mode?: string; notice?: string; tab?: string; templateId?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const activeTab = resolveTab(params?.tab);
  const sendMode: NotificationSendMode = params?.mode === "scheduled"
    ? "scheduled"
    : params?.mode === "automated"
      ? "automated"
      : "immediate";
  const deliveryTab = activeTab === "email" || activeTab === "send";
  const activeChannel = activeTab === "email" ? "email" : "in_app";
  const [students, templates, emailJobs, notifications, unreadCount, scheduledJobs, automationRules] = await Promise.all([
    deliveryTab && sendMode !== "automated"
      ? prisma.user.findMany({
          where: {
            role: "student",
            status: "active",
            ...(activeTab === "email" ? { email: { not: null } } : {})
          },
          orderBy: { username: "asc" },
          select: {
            id: true,
            email: true,
            username: true,
            studentProfile: {
              select: {
                major: { select: { name: true } },
                region: { select: { province: true, studySystem: true } }
              }
            }
          }
        })
      : Promise.resolve([]),
    deliveryTab || activeTab === "templates"
      ? prisma.notificationTemplate.findMany({
          orderBy: { updatedAt: "desc" },
          include: { author: { select: { username: true } } }
        })
      : Promise.resolve([]),
    activeTab === "records"
      ? prisma.notificationDispatchJob.findMany({
          where: { channel: "email" },
          orderBy: { createdAt: "desc" },
          include: {
            author: { select: { username: true } },
            recipients: { orderBy: { usernameSnapshot: "asc" } }
          }
        })
      : Promise.resolve([]),
    activeTab === "records"
      ? prisma.notification.findMany({
          where: { status: { in: ["sent", "archived"] } },
          orderBy: { createdAt: "desc" },
          include: {
            author: { select: { username: true } },
            recipients: {
              orderBy: { deliveredAt: "desc" },
              select: {
                readAt: true,
                user: { select: { username: true } }
              }
            }
          }
        })
      : Promise.resolve([]),
    activeTab === "records"
      ? prisma.notificationRecipient.count({ where: { readAt: null, notification: { status: "sent" } } })
      : Promise.resolve(0),
    deliveryTab && sendMode === "scheduled"
      ? prisma.notificationDispatchJob.findMany({
          where: {
            channel: activeChannel,
            type: "scheduled",
            status: { in: ["pending", "processing", "failed", "cancelled"] }
          },
          orderBy: { createdAt: "desc" },
          take: 100,
          include: {
            template: { select: { name: true } },
            recipients: { orderBy: { usernameSnapshot: "asc" } }
          }
        })
      : Promise.resolve([]),
    deliveryTab && sendMode === "automated"
      ? prisma.notificationAutomationRule.findMany({
          where: { channel: activeChannel },
          orderBy: { createdAt: "desc" },
          include: {
            template: { select: { name: true } },
            jobs: {
              orderBy: { createdAt: "desc" },
              take: 3,
              select: {
                id: true,
                status: true,
                scheduledAt: true,
                sentAt: true,
                lastError: true
              }
            }
          }
        })
      : Promise.resolve([])
  ]);
  const selectedTemplate = params?.templateId ? templates.find((template) => template.id === params.templateId) : null;
  const eligibleStudents = activeTab === "email"
    ? students.filter((student) => isValidEmail(normalizeEmail(student.email || "")))
    : students;
  const studentOptions: NotificationRecipientOption[] = eligibleStudents.map((student) => ({
    id: student.id,
    email: student.email || "",
    username: student.username,
    province: student.studentProfile?.region?.province || "",
    studySystem: student.studentProfile?.region?.studySystem || "",
    majorName: student.studentProfile?.major?.name || ""
  }));
  const notice = params?.notice === "sent"
    ? `通知已发送给 ${params.count || 0} 名学生。`
    : params?.notice === "email-queued"
      ? `已提交 ${params.count || 0} 封邮件，系统将在后台发送。`
    : params?.notice === "email-scheduled"
      ? `已为 ${params.count || 0} 名学生创建邮件定时发送计划。`
    : params?.notice === "scheduled"
      ? `已为 ${params.count || 0} 名学生创建定时发送计划。`
    : params?.notice
      ? noticeText[params.notice]
      : null;
  const error = params?.error ? errorText[params.error] : null;

  return (
    <main className="space-y-4">
      <header>
        <h1 className="text-xl font-black text-ink">通知管理</h1>
        <p className="mt-1 text-sm font-semibold text-slate-500">发送系统通知、维护常用模板并查看完整发送记录。</p>
      </header>

      <nav className="flex gap-8 border-b border-slate-200 text-sm font-bold text-slate-600" aria-label="通知管理导航">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            className={cn(
              "border-b-2 px-0 py-3 transition hover:border-teal hover:text-teal",
              activeTab === tab.key ? "border-teal text-ink" : "border-transparent"
            )}
            href={`/admin/notifications?tab=${tab.key}`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {notice ? <div className="rounded border border-teal/20 bg-teal/10 p-3 text-sm font-semibold text-teal">{notice}</div> : null}
      {error ? <div className="rounded border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div> : null}

      {deliveryTab ? (
        <NotificationSendSection
          channel={activeChannel}
          scheduledJobs={scheduledJobs}
          automationRules={automationRules}
          selectedTemplate={selectedTemplate}
          sendMode={sendMode}
          students={studentOptions}
          templates={templates}
        />
      ) : null}
      {activeTab === "templates" ? (
        <NotificationTemplatesSection selectedTemplate={selectedTemplate} templates={templates} />
      ) : null}
      {activeTab === "records" ? (
        <NotificationRecordsSection emailJobs={emailJobs} notifications={notifications} unreadCount={unreadCount} />
      ) : null}
    </main>
  );
}

function NotificationSendSection({
  automationRules,
  channel,
  scheduledJobs,
  selectedTemplate,
  sendMode,
  students,
  templates
}: {
  channel: "email" | "in_app";
  automationRules: Array<{
    id: string;
    name: string;
    eventType: string;
    enabled: boolean;
    delayMinutes: number;
    template: { name: string };
    jobs: Array<{
      id: string;
      status: string;
      scheduledAt: Date;
      sentAt: Date | null;
      lastError: string | null;
    }>;
  }>;
  scheduledJobs: Array<{
    id: string;
    status: string;
    scheduledAt: Date;
    lastError: string | null;
    template: { name: string } | null;
    recipients: Array<{
      deliveryStatus: string;
      emailSnapshot: string | null;
      id: string;
      usernameSnapshot: string;
      provinceSnapshot: string | null;
      studySystemSnapshot: string | null;
      majorNameSnapshot: string | null;
    }>;
  }>;
  selectedTemplate: { id: string; name: string; title: string; contentHtml: string } | null | undefined;
  sendMode: NotificationSendMode;
  students: NotificationRecipientOption[];
  templates: Array<{ id: string; name: string; title: string; contentHtml: string }>;
}) {
  const isEmail = channel === "email";
  const tab = isEmail ? "email" : "send";
  const immediateAction = isEmail ? sendEmailNotification : sendNotification;
  const scheduledAction = isEmail ? scheduleEmailNotification : scheduleNotification;

  return (
    <div className="space-y-4">
      <section className="border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-black text-ink">{isEmail ? "邮件发送" : "通知发送"}</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              {sendMode === "scheduled"
                ? `选择通知模板、发送时间和学生名单，创建定时${isEmail ? "邮件" : "通知"}计划。`
                : sendMode === "automated"
                  ? `配置业务场景触发规则，由系统自动向事件对应的学生发送${isEmail ? "邮件" : "通知"}。`
                  : isEmail
                    ? "编辑邮件主题和富文本正文，提交后由后台任务逐封发送。"
                    : "立即发送自定义通知，通知发送后长期保留。"}
            </p>
          </div>
          {sendMode === "immediate" && selectedTemplate ? (
            <Link className="secondary-button rounded-none px-3 py-2 text-xs" href={`/admin/notifications?tab=${tab}&mode=immediate`}>
              <Undo2 size={15} />
              清除模板
            </Link>
          ) : null}
        </div>

        <div className="mt-4 inline-flex border border-slate-200 bg-slate-50 p-1 text-sm font-bold">
          <Link
            className={cn("flex min-h-10 items-center gap-2 px-4 transition", sendMode === "immediate" ? "bg-teal text-white" : "text-slate-600 hover:bg-white")}
            href={`/admin/notifications?tab=${tab}&mode=immediate`}
          >
            <Send size={16} />
            立即发送
          </Link>
          <Link
            className={cn("flex min-h-10 items-center gap-2 px-4 transition", sendMode === "scheduled" ? "bg-teal text-white" : "text-slate-600 hover:bg-white")}
            href={`/admin/notifications?tab=${tab}&mode=scheduled`}
          >
            <CalendarClock size={16} />
            定时发送
          </Link>
          <Link
            className={cn("flex min-h-10 items-center gap-2 px-4 transition", sendMode === "automated" ? "bg-teal text-white" : "text-slate-600 hover:bg-white")}
            href={`/admin/notifications?tab=${tab}&mode=automated`}
          >
            <Bot size={16} />
            自动发送
          </Link>
        </div>

        {sendMode === "immediate" ? (
          <>
            {selectedTemplate ? (
              <div className="mt-4 border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-700">
                已载入模板：{selectedTemplate.name}
              </div>
            ) : null}
            <form action={immediateAction} className="mt-5 grid gap-5">
              <label>
                <span className="label">{isEmail ? "邮件主题" : "通知标题"}</span>
                <input
                  className="input rounded-none"
                  defaultValue={selectedTemplate?.title || ""}
                  maxLength={120}
                  name="title"
                  placeholder="例如：本周模拟测验提醒"
                  required
                />
              </label>

              <div>
                <span className="label">{isEmail ? "邮件正文" : "通知内容"}</span>
                <RichTextEditor initialHtml={selectedTemplate?.contentHtml} name="contentHtml" />
              </div>

              <fieldset>
                <legend className="label">接收学生</legend>
                <NotificationRecipientPicker showEmail={isEmail} students={students} />
              </fieldset>

              <div className="flex justify-end border-t border-slate-100 pt-5">
                <button className="primary-button rounded-none min-w-36" disabled={students.length === 0} type="submit">
                  <Send size={18} />
                  {isEmail ? "提交发送" : "立即发送"}
                </button>
              </div>
            </form>
          </>
        ) : sendMode === "scheduled" ? (
          <form action={scheduledAction} className="mt-5 grid gap-5">
            <div className="grid gap-5 lg:grid-cols-2">
              <label>
                <span className="label">{isEmail ? "邮件模板" : "通知模板"}</span>
                <select className="input rounded-none" name="templateId" required>
                  <option value="">请选择通知模板</option>
                  {templates.map((template) => <option key={template.id} value={template.id}>{template.name} · {template.title}</option>)}
                </select>
              </label>
              <label>
                <span className="label">发送日期时间（北京时间）</span>
                <input
                  className="input rounded-none"
                  defaultValue={formatDateTimeLocal(new Date(Date.now() + 5 * 60 * 1000))}
                  min={formatDateTimeLocal(new Date())}
                  name="scheduledAt"
                  required
                  type="datetime-local"
                />
              </label>
            </div>
            <div className="border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold leading-6 text-blue-800">
              创建计划后会冻结当前模板内容、学生资料{isEmail ? "和邮箱地址" : ""}。之后修改模板或学生资料，不会影响该计划。
            </div>
            <fieldset>
              <legend className="label">接收学生</legend>
              <NotificationRecipientPicker showEmail={isEmail} students={students} />
            </fieldset>
            <div className="flex justify-end border-t border-slate-100 pt-5">
              <button className="primary-button rounded-none min-w-40" disabled={students.length === 0 || templates.length === 0} type="submit">
                <CalendarClock size={18} />
                创建定时{isEmail ? "邮件" : "通知"}计划
              </button>
            </div>
          </form>
        ) : null}
      </section>

      {sendMode === "scheduled" ? <ScheduledNotificationPlans channel={channel} jobs={scheduledJobs} /> : null}
      {sendMode === "automated" ? <NotificationAutomationSection channel={channel} rules={automationRules} templates={templates} /> : null}
    </div>
  );
}

function NotificationTemplatesSection({
  selectedTemplate,
  templates
}: {
  selectedTemplate: { id: string; name: string; title: string; contentHtml: string } | null | undefined;
  templates: Array<{
    id: string;
    name: string;
    title: string;
    contentHtml: string;
    updatedAt: Date;
    author: { username: string } | null;
  }>;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-black text-ink">{selectedTemplate ? "编辑通知模板" : "新建通知模板"}</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">保存常用通知标题和富文本内容，发送时可直接套用。</p>
          </div>
          {selectedTemplate ? (
            <Link className="secondary-button rounded-none px-3 py-2 text-xs" href="/admin/notifications?tab=templates">
              新建模板
            </Link>
          ) : null}
        </div>

        <form action={saveNotificationTemplate} className="mt-5 grid gap-5">
          <input name="id" type="hidden" value={selectedTemplate?.id || ""} />
          <label>
            <span className="label">模板名称</span>
            <input className="input rounded-none" defaultValue={selectedTemplate?.name || ""} maxLength={80} name="name" placeholder="例如：每周测验提醒" required />
          </label>
          <label>
            <span className="label">通知标题</span>
            <input className="input rounded-none" defaultValue={selectedTemplate?.title || ""} maxLength={120} name="title" placeholder="发送通知时使用的标题" required />
          </label>
          <div>
            <span className="label">通知内容</span>
            <RichTextEditor initialHtml={selectedTemplate?.contentHtml} minHeightClassName="min-h-[280px]" name="contentHtml" />
          </div>
          <NotificationTemplateVariables />
          <div className="flex justify-end border-t border-slate-100 pt-5">
            <button className="primary-button rounded-none" type="submit">
              <Save size={17} />
              {selectedTemplate ? "更新模板" : "保存模板"}
            </button>
          </div>
        </form>
      </section>

      <aside className="border border-slate-200 bg-white p-5 shadow-sm">
        <div className="border-b border-slate-100 pb-4">
          <h2 className="text-lg font-black text-ink">已保存模板</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">共 {templates.length} 个模板</p>
        </div>
        <div className="mt-4 grid gap-3">
          {templates.length === 0 ? (
            <div className="grid min-h-40 place-items-center bg-slate-50 px-4 text-center text-sm font-semibold text-slate-500">
              暂无通知模板。
            </div>
          ) : templates.map((template) => {
            const deleteFormId = `delete-notification-template-${template.id}`;
            return (
              <article key={template.id} className="border border-slate-200 bg-slate-50 p-4">
                <h3 className="font-black text-ink">{template.name}</h3>
                <p className="mt-1 truncate text-sm font-semibold text-slate-600">{template.title}</p>
                <p className="mt-2 max-h-10 overflow-hidden text-xs leading-5 text-slate-500">{stripNotificationHtml(template.contentHtml)}</p>
                <p className="mt-3 text-xs font-semibold text-slate-400">
                  {formatDateTime(template.updatedAt)} · {template.author?.username || "未知"}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link className="secondary-button rounded-none px-3 py-2 text-xs" href={`/admin/notifications?tab=send&templateId=${template.id}`}>
                    <Send size={14} />
                    用于通知
                  </Link>
                  <Link className="secondary-button rounded-none px-3 py-2 text-xs" href={`/admin/notifications?tab=email&templateId=${template.id}`}>
                    <Mail size={14} />
                    用于邮件
                  </Link>
                  <Link className="secondary-button rounded-none px-3 py-2 text-xs" href={`/admin/notifications?tab=templates&templateId=${template.id}`}>
                    编辑
                  </Link>
                  <form action={deleteNotificationTemplate} id={deleteFormId}>
                    <input name="id" type="hidden" value={template.id} />
                  </form>
                  <ConfirmSubmitButton
                    className="secondary-button rounded-none px-3 py-2 text-xs text-red-600 hover:border-red-300 hover:text-red-700"
                    form={deleteFormId}
                    message={`确定删除模板“${template.name}”吗？`}
                  >
                    <Trash2 size={14} />
                    删除
                  </ConfirmSubmitButton>
                </div>
              </article>
            );
          })}
        </div>
      </aside>
    </div>
  );
}

function NotificationTemplateVariables() {
  const variables = [
    { code: "{{username}}", meaning: "学生用户名", scope: "通知和邮件的立即、定时、自动发送" },
    { code: "{{email}}", meaning: "学生邮箱", scope: "邮件的立即、定时、自动发送" },
    { code: "{{province}}", meaning: "学生所属省份", scope: "通知定时发送；邮件全部发送方式" },
    { code: "{{studySystem}}", meaning: "学生学制", scope: "通知定时发送；邮件全部发送方式" },
    { code: "{{majorName}}", meaning: "学生专业名称", scope: "通知定时发送；邮件全部发送方式" },
    { code: "{{occurredAt}}", meaning: "业务事件触发时间", scope: "自动发送" },
    { code: "{{amount}}", meaning: "钻石变更数量", scope: "后台添加钻石自动通知" },
    { code: "{{balanceAfter}}", meaning: "变更后的钻石余额", scope: "后台添加钻石自动通知" },
    { code: "{{note}}", meaning: "钻石变更说明", scope: "后台添加钻石自动通知" },
    { code: "{{actorUsername}}", meaning: "执行操作的管理员用户名", scope: "后台添加钻石自动通知" }
  ];

  return (
    <section className="border-y border-slate-200 bg-slate-50 px-4 py-4" aria-labelledby="notification-template-variables-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="notification-template-variables-title" className="text-sm font-black text-ink">可用模板变量</h3>
        <p className="text-xs font-semibold text-slate-500">可用于通知标题和通知内容</p>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse text-left text-xs">
          <thead>
            <tr className="text-slate-500">
              <th className="border-b border-slate-200 py-2 pr-4 font-semibold">变量</th>
              <th className="border-b border-slate-200 py-2 pr-4 font-semibold">内容</th>
              <th className="border-b border-slate-200 py-2 font-semibold">适用范围</th>
            </tr>
          </thead>
          <tbody>
            {variables.map((variable) => (
              <tr key={variable.code} className="text-slate-700">
                <td className="border-b border-slate-200/70 py-2.5 pr-4">
                  <code className="font-bold text-[#0872b9]">{variable.code}</code>
                </td>
                <td className="border-b border-slate-200/70 py-2.5 pr-4 font-semibold">{variable.meaning}</td>
                <td className="border-b border-slate-200/70 py-2.5 text-slate-500">{variable.scope}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs font-semibold leading-5 text-slate-500">
        未设置的学生资料会替换为空；变量名称区分大小写，无法识别的变量会保留原文，便于检查拼写。
      </p>
    </section>
  );
}

function ScheduledNotificationPlans({
  channel,
  jobs
}: {
  channel: "email" | "in_app";
  jobs: Array<{
    id: string;
    status: string;
    scheduledAt: Date;
    lastError: string | null;
    template: { name: string } | null;
    recipients: Array<{
      deliveryStatus: string;
      emailSnapshot: string | null;
      id: string;
      usernameSnapshot: string;
      provinceSnapshot: string | null;
      studySystemSnapshot: string | null;
      majorNameSnapshot: string | null;
    }>;
  }>;
}) {
  const isEmail = channel === "email";
  const cancelAction = isEmail ? cancelScheduledEmail : cancelScheduledNotification;
  const rescheduleAction = isEmail ? rescheduleEmailNotification : rescheduleNotification;

  return (
    <section className="border border-slate-200 bg-white p-5 shadow-sm">
      <div className="border-b border-slate-100 pb-4">
        <h2 className="text-lg font-black text-ink">待发送计划</h2>
        <p className="mt-1 text-sm font-semibold text-slate-500">查看、改期或取消尚未完成的定时{isEmail ? "邮件" : "通知"}。</p>
      </div>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[980px] border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr className="text-slate-500">
              <th className="border-b border-slate-200 py-3 pr-4 font-semibold">{isEmail ? "邮件模板" : "通知模板"}</th>
              <th className="border-b border-slate-200 py-3 pr-4 font-semibold">计划时间</th>
              <th className="border-b border-slate-200 py-3 pr-4 font-semibold">学生名单</th>
              <th className="border-b border-slate-200 py-3 pr-4 font-semibold">状态</th>
              <th className="border-b border-slate-200 py-3 font-semibold">操作</th>
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 ? (
              <tr>
                <td className="py-12 text-center text-slate-500" colSpan={5}>暂无待发送计划。</td>
              </tr>
            ) : jobs.map((job) => (
              <tr key={job.id} className="align-top text-slate-700">
                <td className="border-b border-slate-100 py-4 pr-4 font-bold text-ink">{job.template?.name || "模板已删除"}</td>
                <td className="border-b border-slate-100 py-4 pr-4">{formatDateTime(job.scheduledAt)}</td>
                <td className="border-b border-slate-100 py-4 pr-4">
                  <details>
                    <summary className="cursor-pointer font-semibold text-teal">查看 {job.recipients.length} 名学生</summary>
                    <div className="mt-2 max-h-44 w-[420px] overflow-auto border border-slate-200 bg-slate-50">
                      {job.recipients.map((recipient) => (
                        <div key={recipient.id} className={cn("grid gap-2 border-b border-slate-100 px-3 py-2 text-xs", isEmail ? "grid-cols-[1fr_1.5fr_0.8fr_0.8fr_0.8fr]" : "grid-cols-[1fr_1fr_1fr_1fr]")}>
                          <span className="font-bold text-ink">{recipient.usernameSnapshot}</span>
                          {isEmail ? <span className="truncate">{recipient.emailSnapshot || "未设置"}</span> : null}
                          <span>{recipient.provinceSnapshot || "未设置"}</span>
                          <span>{recipient.studySystemSnapshot || "未设置"}</span>
                          <span>{recipient.majorNameSnapshot || "未设置"}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                </td>
                <td className="border-b border-slate-100 py-4 pr-4">
                  <span className={cn("badge", dispatchStatusClass(job.status))}>{dispatchStatusLabel(job.status)}</span>
                  {job.lastError ? <p className="mt-2 max-w-64 text-xs leading-5 text-red-600">{job.lastError}</p> : null}
                </td>
                <td className="border-b border-slate-100 py-4">
                  <div className="flex min-w-[310px] flex-wrap gap-2">
                    {job.status !== "processing" ? (
                      <form action={rescheduleAction} className="flex gap-2">
                        <input name="id" type="hidden" value={job.id} />
                        <input
                          className="input min-h-9 w-44 rounded-none py-1 text-xs"
                          defaultValue={formatDateTimeLocal(job.scheduledAt)}
                          min={formatDateTimeLocal(new Date())}
                          name="scheduledAt"
                          required
                          type="datetime-local"
                        />
                        <button className="secondary-button min-h-9 rounded-none px-3 py-1 text-xs" type="submit">改期/重试</button>
                      </form>
                    ) : null}
                    {job.status !== "processing" && job.status !== "cancelled" ? (
                      <form action={cancelAction}>
                        <input name="id" type="hidden" value={job.id} />
                        <button className="secondary-button min-h-9 rounded-none px-3 py-1 text-xs text-red-600 hover:border-red-300 hover:text-red-700" type="submit">
                          取消
                        </button>
                      </form>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function NotificationAutomationSection({
  channel,
  rules,
  templates
}: {
  channel: "email" | "in_app";
  rules: Array<{
    id: string;
    name: string;
    eventType: string;
    enabled: boolean;
    delayMinutes: number;
    template: { name: string };
    jobs: Array<{
      id: string;
      status: string;
      scheduledAt: Date;
      sentAt: Date | null;
      lastError: string | null;
    }>;
  }>;
  templates: Array<{ id: string; name: string; title: string; contentHtml: string }>;
}) {
  const isEmail = channel === "email";
  const createAction = isEmail ? createEmailAutomationRule : createNotificationAutomationRule;

  return (
    <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
      <section className="border border-slate-200 bg-white p-5 shadow-sm">
        <div className="border-b border-slate-100 pb-4">
          <h2 className="text-lg font-black text-ink">新建自动{isEmail ? "邮件" : "通知"}规则</h2>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">业务场景发生后，系统自动套用模板向触发该事件的学生发送{isEmail ? "邮件" : "通知"}。</p>
        </div>
        <form action={createAction} className="mt-5 grid gap-4">
          <label>
            <span className="label">规则名称</span>
            <input className="input rounded-none" maxLength={100} name="name" placeholder="例如：新用户欢迎通知" required />
          </label>
          <label>
            <span className="label">触发场景</span>
            <select className="input rounded-none" name="eventType" required>
              <option value="">请选择触发场景</option>
              <option value="user_registered">用户注册成功</option>
              <option value="admin_diamond_added">后台添加钻石成功</option>
              <option value="diamond_purchase_succeeded">钻石充值成功（预留）</option>
            </select>
          </label>
          <label>
            <span className="label">{isEmail ? "邮件模板" : "通知模板"}</span>
            <select className="input rounded-none" name="templateId" required>
              <option value="">请选择通知模板</option>
              {templates.map((template) => <option key={template.id} value={template.id}>{template.name} · {template.title}</option>)}
            </select>
          </label>
          <label>
            <span className="label">延迟发送分钟数</span>
            <input className="input rounded-none" defaultValue={0} max={10080} min={0} name="delayMinutes" required type="number" />
          </label>
          <label className="flex cursor-pointer items-center gap-3 border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
            <input className="size-4 accent-teal" defaultChecked name="enabled" type="checkbox" />
            创建后立即启用
          </label>
          <button className="primary-button rounded-none" disabled={templates.length === 0} type="submit">
            <Bot size={17} />
            创建自动{isEmail ? "邮件" : "通知"}规则
          </button>
        </form>
        <p className="mt-4 text-xs font-semibold leading-5 text-slate-500">
          “钻石充值成功”规则已预留，待充值支付流程接入事件后自动生效。模板变量请在“通知模板”页查看。
        </p>
      </section>

      <section className="border border-slate-200 bg-white p-5 shadow-sm">
        <div className="border-b border-slate-100 pb-4">
          <h2 className="text-lg font-black text-ink">自动{isEmail ? "邮件" : "通知"}规则</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">共 {rules.length} 条规则，停用后不会处理后续新事件。</p>
        </div>
        <div className="mt-5 grid gap-4">
          {rules.length === 0 ? (
            <div className="grid min-h-48 place-items-center bg-slate-50 text-sm font-semibold text-slate-500">暂无自动{isEmail ? "邮件" : "通知"}规则。</div>
          ) : rules.map((rule) => {
            const deleteFormId = `delete-automation-rule-${rule.id}`;
            return (
              <article key={rule.id} className="border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-black text-ink">{rule.name}</h3>
                      <span className={cn("badge", rule.enabled ? "bg-teal/10 text-teal" : "bg-slate-100 text-slate-500")}>{rule.enabled ? "已启用" : "已停用"}</span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-600">{automationEventLabel(rule.eventType)} · 模板：{rule.template.name}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-400">{rule.delayMinutes === 0 ? "立即发送" : `延迟 ${rule.delayMinutes} 分钟发送`}</p>
                  </div>
                  <div className="flex gap-2">
                    <form action={toggleNotificationAutomationRule}>
                      <input name="id" type="hidden" value={rule.id} />
                      <button className="secondary-button rounded-none px-3 py-2 text-xs" type="submit">
                        {rule.enabled ? <PowerOff size={14} /> : <Power size={14} />}
                        {rule.enabled ? "停用" : "启用"}
                      </button>
                    </form>
                    <form action={deleteNotificationAutomationRule} id={deleteFormId}>
                      <input name="id" type="hidden" value={rule.id} />
                    </form>
                    <ConfirmSubmitButton
                      className="secondary-button rounded-none px-3 py-2 text-xs text-red-600 hover:border-red-300 hover:text-red-700"
                      form={deleteFormId}
                      message={`确定删除自动${isEmail ? "邮件" : "通知"}规则“${rule.name}”吗？`}
                    >
                      <Trash2 size={14} />
                      删除
                    </ConfirmSubmitButton>
                  </div>
                </div>
                <div className="mt-4 border-t border-slate-100 pt-3">
                  <p className="text-xs font-black text-slate-500">最近执行</p>
                  {rule.jobs.length === 0 ? (
                    <p className="mt-2 text-xs font-semibold text-slate-400">暂无触发记录。</p>
                  ) : (
                    <div className="mt-2 grid gap-2">
                      {rule.jobs.map((job) => (
                        <div key={job.id} className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                          <span>{formatDateTime(job.sentAt || job.scheduledAt)}</span>
                          <span className={cn("badge", dispatchStatusClass(job.status))}>{dispatchStatusLabel(job.status)}</span>
                          {job.lastError ? <span className="text-red-600">{job.lastError}</span> : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

type InAppNotificationRecord = {
  id: string;
  title: string;
  contentHtml: string;
  source: string;
  status: string;
  sentAt: Date | null;
  createdAt: Date;
  author: { username: string } | null;
  recipients: Array<{ readAt: Date | null; user: { username: string } }>;
};

type EmailNotificationRecord = {
  id: string;
  type: string;
  status: string;
  titleSnapshot: string;
  contentHtmlSnapshot: string;
  scheduledAt: Date;
  sentAt: Date | null;
  createdAt: Date;
  lastError: string | null;
  author: { username: string } | null;
  recipients: Array<{
    id: string;
    usernameSnapshot: string;
    emailSnapshot: string | null;
    deliveryStatus: string;
    deliveryLastError: string | null;
  }>;
};

function NotificationRecordsSection({
  emailJobs,
  notifications,
  unreadCount
}: {
  emailJobs: EmailNotificationRecord[];
  notifications: InAppNotificationRecord[];
  unreadCount: number;
}) {
  const records: Array<
    | { channel: "email"; item: EmailNotificationRecord; recordAt: Date }
    | { channel: "in_app"; item: InAppNotificationRecord; recordAt: Date }
  > = [
    ...notifications.map((item) => ({ channel: "in_app" as const, item, recordAt: item.sentAt || item.createdAt })),
    ...emailJobs.map((item) => ({ channel: "email" as const, item, recordAt: item.sentAt || item.createdAt }))
  ].sort((left, right) => right.recordAt.getTime() - left.recordAt.getTime());
  const sentCount = notifications.filter((notification) => notification.status === "sent").length;
  const withdrawnCount = notifications.filter((notification) => notification.status === "archived").length;
  const emailSentCount = emailJobs.reduce((count, job) => count + job.recipients.filter((recipient) => recipient.deliveryStatus === "sent").length, 0);
  const emailFailedCount = emailJobs.reduce((count, job) => count + job.recipients.filter((recipient) => recipient.deliveryStatus === "failed").length, 0);

  return (
    <section className="border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-lg font-black text-ink">通知记录</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">统一呈现站内通知和邮件任务，并保留每位收件人的投递结果。</p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="badge bg-teal/10 text-teal">展示中 {sentCount}</span>
          <span className="badge bg-slate-100 text-slate-600">已撤回 {withdrawnCount}</span>
          <span className="badge bg-coral/10 text-coral">未读 {unreadCount}</span>
          <span className="badge bg-sky-50 text-sky-700">邮件成功 {emailSentCount}</span>
          {emailFailedCount > 0 ? <span className="badge bg-red-50 text-red-700">邮件失败 {emailFailedCount}</span> : null}
        </div>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[1220px] border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr className="text-slate-500">
              <th className="border-b border-slate-200 py-3 pr-4 font-semibold">渠道</th>
              <th className="border-b border-slate-200 py-3 pr-4 font-semibold">标题与内容</th>
              <th className="border-b border-slate-200 py-3 pr-4 font-semibold">收件人</th>
              <th className="border-b border-slate-200 py-3 pr-4 font-semibold">来源</th>
              <th className="border-b border-slate-200 py-3 pr-4 font-semibold">状态</th>
              <th className="border-b border-slate-200 py-3 pr-4 font-semibold">发送时间</th>
              <th className="border-b border-slate-200 py-3 font-semibold">操作</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr>
                <td className="py-14 text-center text-slate-500" colSpan={7}>暂无通知记录。</td>
              </tr>
            ) : records.map((record) => {
              if (record.channel === "email") {
                const job = record.item;
                const sentRecipients = job.recipients.filter((recipient) => recipient.deliveryStatus === "sent").length;
                const failedRecipients = job.recipients.filter((recipient) => recipient.deliveryStatus === "failed").length;
                const pendingRecipients = job.recipients.filter((recipient) => recipient.deliveryStatus === "pending").length;
                return (
                  <tr key={`email-${job.id}`} className="align-top text-slate-700">
                    <td className="border-b border-slate-100 py-4 pr-4">
                      <span className="badge bg-sky-50 text-sky-700"><Mail size={13} />邮件通知</span>
                    </td>
                    <td className="border-b border-slate-100 py-4 pr-4">
                      <p className="font-black text-ink">{job.titleSnapshot}</p>
                      <p className="mt-1 max-h-10 max-w-md overflow-hidden text-xs font-semibold leading-5 text-slate-500">{stripNotificationHtml(job.contentHtmlSnapshot)}</p>
                    </td>
                    <td className="border-b border-slate-100 py-4 pr-4">
                      <div className="flex items-center gap-2 font-semibold"><UsersRound size={16} />{job.recipients.length} 人</div>
                      <p className="mt-1 max-w-72 truncate text-xs text-slate-400">{job.recipients.map((recipient) => recipient.emailSnapshot || recipient.usernameSnapshot).join("、") || "暂无"}</p>
                      <p className="mt-1 text-xs text-slate-500">成功 {sentRecipients} · 失败 {failedRecipients} · 待处理 {pendingRecipients}</p>
                    </td>
                    <td className="border-b border-slate-100 py-4 pr-4">
                      <span className={cn("badge", notificationSourceClass(job.type))}>{notificationSourceLabel(job.type)}</span>
                    </td>
                    <td className="border-b border-slate-100 py-4 pr-4">
                      <span className={cn("badge", dispatchStatusClass(job.status))}>{dispatchStatusLabel(job.status)}</span>
                      {job.lastError ? <p className="mt-2 max-w-64 text-xs leading-5 text-red-600">{job.lastError}</p> : null}
                    </td>
                    <td className="border-b border-slate-100 py-4 pr-4">
                      <p>{formatDateTime(job.sentAt || job.scheduledAt)}</p>
                      <p className="mt-1 text-xs text-slate-400">发送人 {job.author?.username || "系统"}</p>
                    </td>
                    <td className="border-b border-slate-100 py-4">
                      <details className="max-w-80">
                        <summary className="cursor-pointer font-semibold text-teal">投递详情</summary>
                        <div className="mt-2 max-h-52 overflow-auto border border-slate-200 bg-slate-50 p-2 text-xs">
                          {job.recipients.map((recipient) => (
                            <div key={recipient.id} className="border-b border-slate-200 px-2 py-2 last:border-b-0">
                              <p className="font-bold text-ink">{recipient.usernameSnapshot} · {recipient.emailSnapshot || "无邮箱"}</p>
                              <p className="mt-1 text-slate-500">{deliveryStatusLabel(recipient.deliveryStatus)}</p>
                              {recipient.deliveryLastError ? <p className="mt-1 text-red-600">{recipient.deliveryLastError}</p> : null}
                            </div>
                          ))}
                        </div>
                      </details>
                    </td>
                  </tr>
                );
              }

              const notification = record.item;
              const readCount = notification.recipients.filter((recipient) => recipient.readAt).length;
              const recipientNames = notification.recipients.map((recipient) => recipient.user.username);
              const withdrawn = notification.status === "archived";
              return (
                <tr key={`in-app-${notification.id}`} className="align-top text-slate-700">
                  <td className="border-b border-slate-100 py-4 pr-4">
                    <span className="badge bg-teal/10 text-teal"><Send size={13} />站内通知</span>
                  </td>
                  <td className="border-b border-slate-100 py-4 pr-4">
                    <p className="font-black text-ink">{notification.title}</p>
                    <p className="mt-1 max-h-10 max-w-md overflow-hidden text-xs font-semibold leading-5 text-slate-500">{stripNotificationHtml(notification.contentHtml)}</p>
                  </td>
                  <td className="border-b border-slate-100 py-4 pr-4">
                    <div className="flex items-center gap-2 font-semibold">
                      <UsersRound size={16} />
                      {notification.recipients.length} 人
                    </div>
                    <p className="mt-1 max-w-64 truncate text-xs text-slate-400">{recipientNames.join("、") || "暂无"}</p>
                    <p className="mt-1 text-xs text-slate-500">已读 {readCount}/{notification.recipients.length}</p>
                  </td>
                  <td className="border-b border-slate-100 py-4 pr-4">
                    <span className={cn("badge", notificationSourceClass(notification.source))}>
                      {notificationSourceLabel(notification.source)}
                    </span>
                  </td>
                  <td className="border-b border-slate-100 py-4 pr-4">
                    <span className={cn("badge", withdrawn ? "bg-slate-100 text-slate-500" : "bg-teal/10 text-teal")}>
                      {withdrawn ? "已撤回" : "展示中"}
                    </span>
                  </td>
                  <td className="border-b border-slate-100 py-4 pr-4">
                    <p>{formatDateTime(notification.sentAt || notification.createdAt)}</p>
                    <p className="mt-1 text-xs text-slate-400">发送人 {notification.author?.username || "未知"}</p>
                  </td>
                  <td className="border-b border-slate-100 py-4">
                    {withdrawn ? (
                      <form action={restoreNotification}>
                        <input name="id" type="hidden" value={notification.id} />
                        <button className="secondary-button rounded-none px-3 py-2 text-xs" type="submit">
                          <RotateCcw size={15} />
                          恢复展示
                        </button>
                      </form>
                    ) : (
                      <form action={archiveNotification}>
                        <input name="id" type="hidden" value={notification.id} />
                        <button className="secondary-button rounded-none px-3 py-2 text-xs" type="submit">
                          <History size={15} />
                          撤回通知
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
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

function formatDateTimeLocal(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Shanghai",
    year: "numeric"
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}`;
}

function dispatchStatusLabel(status: string) {
  return {
    cancelled: "已取消",
    failed: "发送失败",
    pending: "等待发送",
    processing: "正在发送",
    sent: "已发送"
  }[status] || status;
}

function dispatchStatusClass(status: string) {
  return {
    cancelled: "bg-slate-100 text-slate-500",
    failed: "bg-red-50 text-red-700",
    pending: "bg-amber-50 text-amber-700",
    processing: "bg-blue-50 text-blue-700",
    sent: "bg-teal/10 text-teal"
  }[status] || "bg-slate-100 text-slate-600";
}

function deliveryStatusLabel(status: string) {
  return {
    failed: "发送失败",
    pending: "等待发送",
    sent: "发送成功",
    skipped: "已跳过"
  }[status] || status;
}

function automationEventLabel(eventType: string) {
  return {
    admin_diamond_added: "后台添加钻石成功",
    diamond_purchase_succeeded: "钻石充值成功（预留）",
    user_registered: "用户注册成功"
  }[eventType] || eventType;
}

function notificationSourceLabel(source: string) {
  return {
    automated: "自动发送",
    immediate: "立即发送",
    manual: "立即发送",
    scheduled: "定时发送"
  }[source] || source;
}

function notificationSourceClass(source: string) {
  return {
    automated: "bg-violet-50 text-violet-700",
    immediate: "bg-sky-50 text-sky-700",
    manual: "bg-sky-50 text-sky-700",
    scheduled: "bg-amber-50 text-amber-700"
  }[source] || "bg-slate-100 text-slate-600";
}
