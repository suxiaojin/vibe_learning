import Link from "next/link";
import { redirect } from "next/navigation";
import { ImageUp, Plus, Save, Trash2 } from "lucide-react";
import type { ShareCopyContext } from "@prisma/client";
import {
  createShareCopyPhrase,
  createShareCopyStyle,
  deleteShareCopyPhrase,
  deleteShareCopyStyle,
  updateShareCopyPhrase,
  updateShareCopyStyle,
  updateStudyBuddyHeroEffectSettings,
  updateStudyBuddyHeroImageSettings,
  updateStudyBuddyHeroTitleSettings,
  updateSystemSettings
} from "@/app/admin/actions";
import { AdminDiamondRuleSettings } from "@/components/admin-diamond-rule-settings";
import { AdminProfileBackgroundUploadForm } from "@/components/admin-profile-background-upload-form";
import { AdminRechargeQrUploadForm } from "@/components/admin-recharge-qr-upload-form";
import { requireAdmin } from "@/lib/auth";
import { listDiamondRuleSettings } from "@/lib/diamond-rules";
import { prisma } from "@/lib/prisma";
import { isShareCopyContext, shareCopyContextLabels } from "@/lib/share-copy";
import { studyBuddyHeroEffectOptions } from "@/lib/study-buddy-title-effects";
import { getSystemSettings } from "@/lib/system-settings";
import { cn } from "@/lib/utils";

type SettingsTab = "login" | "admin" | "agreements" | "study-buddy" | "share-copy" | "diamonds";

const tabs: Array<{ key: SettingsTab; label: string }> = [
  { key: "login", label: "登录页配置" },
  { key: "admin", label: "管理员配置" },
  { key: "agreements", label: "协议内容" },
  { key: "study-buddy", label: "学习搭子" },
  { key: "share-copy", label: "分享文案" },
  { key: "diamonds", label: "钻石设置" }
];

const noticeText: Record<string, string> = {
  saved: "系统设置已保存。",
  "diamond-recharge-qr-saved": "钻石充值客服二维码已保存。",
  "profile-homepage-background-saved": "个人主页背景图已保存，并已覆盖当前用户的背景显示。",
  "study-buddy-hero-image-saved": "顶部动画已保存。",
  "study-buddy-hero-title-saved": "顶部标题已保存。",
  "study-buddy-hero-effect-saved": "标题效果已保存。",
  "share-copy-saved": "分享文案已保存。",
  "diamond-rule-saved": "钻石规则已保存，后续新事件将使用最新配置。"
};

const errorText: Record<string, string> = {
  "image-too-large": "图片不能超过 5MB。",
  "invalid-image-type": "请上传 PNG、JPG、WEBP 或 GIF 图片。",
  "diamond-recharge-qr-required": "请选择要上传的钻石充值客服二维码。",
  "invalid-diamond-recharge-qr-type": "钻石充值客服二维码仅支持 PNG、JPG 或 WEBP 图片。",
  "diamond-recharge-qr-too-large": "钻石充值客服二维码不能超过 2MB。",
  "profile-homepage-background-required": "请选择要上传的个人主页背景图。",
  "invalid-profile-homepage-background-type": "个人主页背景图仅支持 PNG、JPG 或 WEBP 图片。",
  "profile-homepage-background-too-large": "个人主页背景图不能超过 2MB。",
  "invalid-study-buddy-hero-image-type": "请上传 WEBP 图片或动画。",
  "study-buddy-hero-image-too-large": "学习搭子顶部动画不能超过 5MB。",
  "invalid-diamond-rule": "钻石规则不存在或尚未接入代码。",
  "invalid-diamond-rule-amount": "钻石数量必须是 1 到 1,000,000 之间的整数。"
};

const marketingIconOptions = [
  { value: "gift", label: "礼物" },
  { value: "sparkles", label: "星光" },
  { value: "book", label: "书本" },
  { value: "graduation", label: "学士帽" },
  { value: "trophy", label: "奖杯" }
];

function resolveTab(value?: string): SettingsTab {
  return tabs.some((tab) => tab.key === value) ? (value as SettingsTab) : "login";
}

function resolveShareCopyContext(value?: string): ShareCopyContext {
  return value && isShareCopyContext(value) ? value : "question_correct";
}

function FieldBlock({
  children,
  description,
  label
}: {
  children: React.ReactNode;
  description?: string;
  label: React.ReactNode;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {description ? <p className="mt-1.5 text-xs font-semibold text-slate-500">{description}</p> : null}
    </div>
  );
}

export default async function AdminSettingsPage({
  searchParams
}: {
  searchParams?: Promise<{
    context?: string;
    notice?: string;
    error?: string;
    tab?: string;
    promptProfileId?: string;
    promptVersionId?: string;
    promptQuery?: string;
    promptStatus?: string;
  }>;
}) {
  await requireAdmin();
  const [settings, params] = await Promise.all([getSystemSettings(), searchParams]);
  if (params?.tab === "prompt") {
    const query = new URLSearchParams();
    for (const key of ["notice", "error", "promptProfileId", "promptVersionId", "promptQuery", "promptStatus"] as const) {
      const value = params[key];
      if (value) {
        query.set(key, value);
      }
    }
    redirect(`/admin/prompt-settings${query.size ? `?${query.toString()}` : ""}`);
  }
  const activeTab = resolveTab(params?.tab);
  const activeShareContext = resolveShareCopyContext(params?.context);
  const shareCopyStyles = activeTab === "share-copy"
    ? await prisma.shareCopyStyle.findMany({
        where: { context: activeShareContext },
        include: {
          phrases: {
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
          }
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
      })
    : [];
  const diamondRules = activeTab === "diamonds" ? await listDiamondRuleSettings() : [];
  const notice = params?.notice ? noticeText[params.notice] : null;
  const error = params?.error ? errorText[params.error] : null;

  return (
    <main className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-ink">系统设置</h1>
          <p className="mt-1 text-sm font-semibold text-slate-500">管理用户端内容、管理员配置、学习搭子和钻石规则。</p>
        </div>
        {activeTab === "login" ? (
          <Link className="secondary-button rounded-none" href="/login" target="_blank">
            预览登录页
          </Link>
        ) : null}
      </header>

      <nav className="flex gap-8 overflow-x-auto whitespace-nowrap border-b border-slate-200 text-sm font-bold text-slate-600" aria-label="系统设置导航">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            className={cn(
              "border-b-2 px-0 py-3 transition hover:border-teal hover:text-teal",
              activeTab === tab.key ? "border-teal text-ink" : "border-transparent"
            )}
            href={`/admin/settings?tab=${tab.key}`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {notice ? <div className="rounded border border-teal/20 bg-teal/10 p-3 text-sm font-semibold text-teal">{notice}</div> : null}
      {error ? <div className="rounded border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div> : null}

      <form action={updateSystemSettings} className="space-y-4">
        <section className={cn(activeTab === "login" ? "grid gap-4 xl:grid-cols-[360px_1fr]" : "hidden")}>
          <aside className="border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black text-ink">当前登录图片</h2>
            <div className="mt-4 overflow-hidden border border-slate-200 bg-slate-100">
              <img alt="当前登录页图片" className="aspect-[3/4] w-full object-cover" src={settings.loginHeroImageUrl} />
            </div>
            <p className="mt-3 text-xs font-semibold leading-5 text-slate-500">建议上传竖版学习主题图片，登录页和注册页都会使用这张图。</p>
          </aside>

          <section className="border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-black text-ink">登录页配置</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">图片、欢迎标题、营销文案和客服邮箱。</p>
              </div>
              <button className="primary-button rounded-none" type="submit">
                <Save size={16} />
                保存设置
              </button>
            </div>

            <div className="mt-5 grid gap-5">
              <FieldBlock label="登录图片地址" description="可直接填写 public 下的路径，也可以使用下面的上传控件覆盖。">
                <input
                  className="input rounded-none"
                  name="loginHeroImageUrl"
                  placeholder="/login-hero-vibelearning.png"
                  defaultValue={settings.loginHeroImageUrl}
                  required
                />
              </FieldBlock>

              <FieldBlock
                label={
                  <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span>重新上传登录图片</span>
                    <span className="text-xs font-black text-red-500">建议尺寸：1200 × 1800 px（竖版 2:3，至少 900 × 1350 px）</span>
                  </span>
                }
              >
                <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center text-sm font-bold text-slate-600 transition hover:border-[#0872b9] hover:bg-blue-50">
                  <ImageUp className="mb-2 text-[#0872b9]" size={26} />
                  <span>选择 PNG、JPG、WEBP 或 GIF 图片</span>
                  <input
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="sr-only"
                    name="loginHeroImageFile"
                    type="file"
                  />
                </label>
              </FieldBlock>

              <div className="grid gap-5 lg:grid-cols-2">
                <FieldBlock label="欢迎标题">
                  <input
                    className="input rounded-none"
                    name="loginWelcomeTitle"
                    defaultValue={settings.loginWelcomeTitle}
                    required
                  />
                </FieldBlock>

                <FieldBlock label="客服邮箱地址">
                  <input
                    className="input rounded-none"
                    name="customerServiceEmail"
                    type="email"
                    defaultValue={settings.customerServiceEmail}
                    required
                  />
                </FieldBlock>
              </div>

              <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
                <FieldBlock label="顶部营销图标">
                  <select className="input rounded-none" name="loginMarketingIcon" defaultValue={settings.loginMarketingIcon} required>
                    {marketingIconOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </FieldBlock>

                <FieldBlock label="顶部营销标题">
                  <input
                    className="input rounded-none"
                    name="loginMarketingTitle"
                    defaultValue={settings.loginMarketingTitle}
                    required
                  />
                </FieldBlock>
              </div>

              <FieldBlock label="顶部营销说明">
                <textarea
                  className="input min-h-28 rounded-none"
                  name="loginMarketingDescription"
                  defaultValue={settings.loginMarketingDescription}
                  required
                />
              </FieldBlock>
            </div>
          </section>
        </section>

        <section className={cn(activeTab === "agreements" ? "border border-slate-200 bg-white p-5 shadow-sm" : "hidden")}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-black text-ink">协议内容</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">协议页和前端帮助页读取这里的内容，支持 Markdown 标题、列表、表格、加粗和链接。</p>
            </div>
            <button className="primary-button rounded-none" type="submit">
              <Save size={16} />
              保存设置
            </button>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <FieldBlock description="前端不额外添加标题，Markdown 正文需自带完整标题。" label="用户协议内容">
              <textarea
                className="input min-h-72 rounded-none"
                name="userAgreementContent"
                defaultValue={settings.userAgreementContent}
                required
              />
            </FieldBlock>
            <FieldBlock description="前端不额外添加标题，Markdown 正文需自带完整标题。" label="隐私政策内容">
              <textarea
                className="input min-h-72 rounded-none"
                name="privacyPolicyContent"
                defaultValue={settings.privacyPolicyContent}
                required
              />
            </FieldBlock>
            <FieldBlock description="前端不额外添加标题，Markdown 正文需自带完整标题。" label="平台使用协议内容">
              <textarea
                className="input min-h-72 rounded-none"
                name="platformAgreementContent"
                defaultValue={settings.platformAgreementContent}
                required
              />
            </FieldBlock>
            <FieldBlock description="学生端“更多—帮助”打开此内容；Markdown 正文需自带完整标题。" label="常见问题内容">
              <textarea
                className="input min-h-72 rounded-none"
                name="faqContent"
                defaultValue={settings.faqContent}
                required
              />
            </FieldBlock>
          </div>
        </section>

      </form>

      {activeTab === "admin" ? (
        <div className="grid gap-4">
          <AdminRechargeQrUploadForm currentQrCodeUrl={settings.diamondRechargeQrCodeUrl} />
          <AdminProfileBackgroundUploadForm currentBackgroundImageUrl={settings.profileHomepageBackgroundImageUrl} />
        </div>
      ) : null}

      {activeTab === "study-buddy" ? (
        <section className="border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-black text-ink">学习搭子首页</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">顶部动画、标题文字、标题效果分别保存，互不覆盖。</p>
            </div>
          </div>

          <div className="mt-5 grid gap-5">
            <form action={updateStudyBuddyHeroImageSettings} className="border-b border-slate-100 pb-5" encType="multipart/form-data">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-black text-ink">顶部动画</h3>
                  <p className="mt-1 text-xs font-semibold text-slate-500">只保存首页左侧 WebP 动画图片。</p>
                </div>
                <button className="secondary-button rounded-none" type="submit">
                  <Save size={16} />
                  保存动画
                </button>
              </div>

              <div className="mt-4 grid gap-5 xl:grid-cols-[220px_1fr]">
                <FieldBlock label="当前顶部动画">
                  <div className="flex min-h-[150px] items-center justify-center border border-slate-200 bg-slate-50 px-4 py-5">
                    <img alt="" className="h-[110px] w-[160px] object-contain" src={settings.studyBuddyHeroImageUrl} />
                  </div>
                </FieldBlock>

                <div className="grid gap-5">
                  <FieldBlock label="顶部动画地址" description="可填写 public 路径或远程图片地址；上传 WebP 后会把图片数据保存到数据库。">
                    <input
                      className="input rounded-none"
                      name="studyBuddyHeroImageAddress"
                      placeholder="/ai-study/study-buddy-hero.webp"
                      defaultValue={settings.studyBuddyHeroImageUrl.startsWith("data:") ? "" : settings.studyBuddyHeroImageUrl}
                    />
                  </FieldBlock>

                  <FieldBlock label="上传顶部 WebP 动画" description="上传后保存为数据库字段，学生端刷新 /study-buddy 即可读取，不依赖容器共享目录。">
                    <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center text-sm font-bold text-slate-600 transition hover:border-[#0872b9] hover:bg-blue-50">
                      <ImageUp className="mb-2 text-[#0872b9]" size={24} />
                      <span>选择 WEBP 图片或动画</span>
                      <span className="mt-1 text-xs font-semibold text-slate-500">建议控制在 5MB 内，尺寸接近 320 × 220 px</span>
                      <input
                        accept="image/webp"
                        className="sr-only"
                        name="studyBuddyHeroImageFile"
                        type="file"
                      />
                    </label>
                  </FieldBlock>
                </div>
              </div>
            </form>

            <form action={updateStudyBuddyHeroTitleSettings} className="border-b border-slate-100 pb-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-black text-ink">标题文字</h3>
                  <p className="mt-1 text-xs font-semibold text-slate-500">只保存学生端首页顶部标题文本。</p>
                </div>
                <button className="secondary-button rounded-none" type="submit">
                  <Save size={16} />
                  保存标题
                </button>
              </div>

              <div className="mt-4">
                <FieldBlock label="顶部标题" description="保存后学生端刷新 /study-buddy 即可读取最新标题。">
                  <input
                    className="input rounded-none"
                    name="studyBuddyHeroTitle"
                    defaultValue={settings.studyBuddyHeroTitle}
                    maxLength={40}
                    required
                  />
                </FieldBlock>
              </div>
            </form>

            <form action={updateStudyBuddyHeroEffectSettings}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-black text-ink">标题效果</h3>
                  <p className="mt-1 text-xs font-semibold text-slate-500">只保存标题动效和打字速度。</p>
                </div>
                <button className="secondary-button rounded-none" type="submit">
                  <Save size={16} />
                  保存效果
                </button>
              </div>

              <div className="mt-4 grid gap-5 lg:grid-cols-[220px_220px_1fr]">
                <FieldBlock label="标题效果">
                  <select className="input rounded-none" name="studyBuddyHeroEffect" defaultValue={settings.studyBuddyHeroEffect} required>
                    {studyBuddyHeroEffectOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </FieldBlock>

                <FieldBlock label="打字速度">
                  <input
                    className="input rounded-none"
                    name="studyBuddyHeroTypeSpeedMs"
                    type="number"
                    min={40}
                    max={300}
                    step={5}
                    defaultValue={settings.studyBuddyHeroTypeSpeedMs}
                    required
                  />
                </FieldBlock>

                <div className="rounded border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold leading-5 text-slate-500">
                  打字速度只影响“打字机”，单位为毫秒 / 字，数值越小越快；其他效果使用固定轻量动画。保存后学生端刷新 /study-buddy 即可读取最新效果。
                </div>
              </div>
            </form>
          </div>
        </section>
      ) : null}

      {activeTab === "share-copy" ? (
        <ShareCopySettingsPanel
          activeContext={activeShareContext}
          styles={shareCopyStyles}
        />
      ) : null}

      {activeTab === "diamonds" ? <AdminDiamondRuleSettings rules={diamondRules} /> : null}
    </main>
  );
}

function ShareCopySettingsPanel({
  activeContext,
  styles
}: {
  activeContext: ShareCopyContext;
  styles: Array<{
    id: string;
    label: string;
    sortOrder: number;
    status: string;
    phrases: Array<{
      id: string;
      content: string;
      sortOrder: number;
      status: string;
    }>;
  }>;
}) {
  const contexts = Object.entries(shareCopyContextLabels) as Array<[ShareCopyContext, string]>;

  return (
    <section className="space-y-4">
      <div className="border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-ink">分享文案</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">按分享场景维护文案风格和语句。学生点击风格名时，会从该风格下的已发布语句中选择一句。</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {contexts.map(([context, label]) => (
            <Link
              key={context}
              className={cn(
                "min-h-10 rounded-full border px-4 py-2 text-sm font-black transition",
                activeContext === context ? "border-teal bg-teal/10 text-teal" : "border-slate-200 text-slate-600 hover:border-teal/40 hover:text-teal"
              )}
              href={`/admin/settings?tab=share-copy&context=${context}`}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      <form action={createShareCopyStyle} className="grid gap-3 border border-slate-200 bg-white p-5 shadow-sm lg:grid-cols-[1fr_120px_140px_auto]">
        <input name="context" type="hidden" value={activeContext} />
        <FieldBlock label="新增风格名称">
          <input className="input rounded-none" name="label" placeholder="例如：高频考点" required />
        </FieldBlock>
        <FieldBlock label="排序">
          <input className="input rounded-none" name="sortOrder" type="number" defaultValue={0} />
        </FieldBlock>
        <FieldBlock label="状态">
          <select className="input rounded-none" name="status" defaultValue="published">
            <option value="published">已发布</option>
            <option value="draft">草稿</option>
            <option value="archived">归档</option>
          </select>
        </FieldBlock>
        <div className="flex items-end">
          <button className="primary-button rounded-none" type="submit">
            <Plus size={16} />
            新增风格
          </button>
        </div>
      </form>

      {styles.length === 0 ? (
        <div className="border border-dashed border-slate-300 bg-white p-10 text-center text-sm font-semibold text-slate-500">当前场景还没有分享文案风格。</div>
      ) : (
        <div className="space-y-4">
          {styles.map((style) => (
            <section key={style.id} className="border border-slate-200 bg-white p-5 shadow-sm">
              <form action={updateShareCopyStyle} className="grid gap-3 border-b border-slate-100 pb-4 lg:grid-cols-[1fr_120px_140px_auto_auto]">
                <input name="context" type="hidden" value={activeContext} />
                <input name="styleId" type="hidden" value={style.id} />
                <FieldBlock label="风格名称">
                  <input className="input rounded-none" name="label" defaultValue={style.label} required />
                </FieldBlock>
                <FieldBlock label="排序">
                  <input className="input rounded-none" name="sortOrder" type="number" defaultValue={style.sortOrder} />
                </FieldBlock>
                <FieldBlock label="状态">
                  <select className="input rounded-none" name="status" defaultValue={style.status}>
                    <option value="published">已发布</option>
                    <option value="draft">草稿</option>
                    <option value="archived">归档</option>
                  </select>
                </FieldBlock>
                <div className="flex items-end">
                  <button className="secondary-button rounded-none" type="submit">
                    <Save size={16} />
                    保存风格
                  </button>
                </div>
                <div className="flex items-end">
                  <button form={`delete-share-style-${style.id}`} className="secondary-button rounded-none border-red-100 text-red-600 hover:bg-red-50" type="submit">
                    <Trash2 size={16} />
                    删除
                  </button>
                </div>
              </form>

              <form id={`delete-share-style-${style.id}`} action={deleteShareCopyStyle} className="hidden">
                <input name="context" type="hidden" value={activeContext} />
                <input name="styleId" type="hidden" value={style.id} />
              </form>

              <div className="mt-4 space-y-3">
                {style.phrases.map((phrase) => (
                  <form key={phrase.id} action={updateShareCopyPhrase} className="grid gap-3 rounded border border-slate-200 bg-slate-50 p-3 lg:grid-cols-[1fr_120px_140px_auto_auto]">
                    <input name="context" type="hidden" value={activeContext} />
                    <input name="phraseId" type="hidden" value={phrase.id} />
                    <FieldBlock label="文案语句">
                      <textarea className="input min-h-20 rounded-none bg-white" name="content" defaultValue={phrase.content} required />
                    </FieldBlock>
                    <FieldBlock label="排序">
                      <input className="input rounded-none bg-white" name="sortOrder" type="number" defaultValue={phrase.sortOrder} />
                    </FieldBlock>
                    <FieldBlock label="状态">
                      <select className="input rounded-none bg-white" name="status" defaultValue={phrase.status}>
                        <option value="published">已发布</option>
                        <option value="draft">草稿</option>
                        <option value="archived">归档</option>
                      </select>
                    </FieldBlock>
                    <div className="flex items-end">
                      <button className="secondary-button rounded-none" type="submit">
                        <Save size={16} />
                        保存
                      </button>
                    </div>
                    <div className="flex items-end">
                      <button form={`delete-share-phrase-${phrase.id}`} className="secondary-button rounded-none border-red-100 text-red-600 hover:bg-red-50" type="submit">
                        <Trash2 size={16} />
                        删除
                      </button>
                    </div>
                  </form>
                ))}

                {style.phrases.map((phrase) => (
                  <form key={`delete-${phrase.id}`} id={`delete-share-phrase-${phrase.id}`} action={deleteShareCopyPhrase} className="hidden">
                    <input name="context" type="hidden" value={activeContext} />
                    <input name="phraseId" type="hidden" value={phrase.id} />
                  </form>
                ))}

                <form action={createShareCopyPhrase} className="grid gap-3 rounded border border-dashed border-slate-300 p-3 lg:grid-cols-[1fr_120px_140px_auto]">
                  <input name="context" type="hidden" value={activeContext} />
                  <input name="styleId" type="hidden" value={style.id} />
                  <FieldBlock label="新增文案语句">
                    <textarea className="input min-h-20 rounded-none" name="content" placeholder="输入这类风格下的一条可选文案" required />
                  </FieldBlock>
                  <FieldBlock label="排序">
                    <input className="input rounded-none" name="sortOrder" type="number" defaultValue={style.phrases.length * 10 + 10} />
                  </FieldBlock>
                  <FieldBlock label="状态">
                    <select className="input rounded-none" name="status" defaultValue="published">
                      <option value="published">已发布</option>
                      <option value="draft">草稿</option>
                      <option value="archived">归档</option>
                    </select>
                  </FieldBlock>
                  <div className="flex items-end">
                    <button className="primary-button rounded-none" type="submit">
                      <Plus size={16} />
                      新增文案
                    </button>
                  </div>
                </form>
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
