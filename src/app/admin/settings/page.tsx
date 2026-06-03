import Link from "next/link";
import { ImageUp, Save } from "lucide-react";
import { updateSystemSettings } from "@/app/admin/actions";
import { requireAdmin } from "@/lib/auth";
import { getSystemSettings } from "@/lib/system-settings";
import { cn } from "@/lib/utils";

type SettingsTab = "login" | "agreements";

const tabs: Array<{ key: SettingsTab; label: string }> = [
  { key: "login", label: "登录页配置" },
  { key: "agreements", label: "协议内容" }
];

const noticeText: Record<string, string> = {
  saved: "系统设置已保存。"
};

const errorText: Record<string, string> = {
  "image-too-large": "图片不能超过 5MB。",
  "invalid-image-type": "请上传 PNG、JPG、WEBP 或 GIF 图片。"
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
  searchParams?: Promise<{ notice?: string; error?: string; tab?: string }>;
}) {
  await requireAdmin();
  const [settings, params] = await Promise.all([getSystemSettings(), searchParams]);
  const activeTab = resolveTab(params?.tab);
  const notice = params?.notice ? noticeText[params.notice] : null;
  const error = params?.error ? errorText[params.error] : null;

  return (
    <main className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-ink">系统设置</h1>
          <p className="mt-1 text-sm font-semibold text-slate-500">管理用户端登录、注册、协议页面展示内容。</p>
        </div>
        <Link className="secondary-button rounded-none" href="/login" target="_blank">
          预览登录页
        </Link>
      </header>

      <nav className="flex gap-8 border-b border-slate-200 text-sm font-bold text-slate-600" aria-label="系统设置导航">
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
              <p className="mt-1 text-sm font-semibold text-slate-500">登录注册页协议链接读取这里的内容。</p>
            </div>
            <button className="primary-button rounded-none" type="submit">
              <Save size={16} />
              保存设置
            </button>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-3">
            <FieldBlock label="用户协议内容">
              <textarea
                className="input min-h-72 rounded-none"
                name="userAgreementContent"
                defaultValue={settings.userAgreementContent}
                required
              />
            </FieldBlock>
            <FieldBlock label="隐私政策内容">
              <textarea
                className="input min-h-72 rounded-none"
                name="privacyPolicyContent"
                defaultValue={settings.privacyPolicyContent}
                required
              />
            </FieldBlock>
            <FieldBlock label="平台使用协议内容">
              <textarea
                className="input min-h-72 rounded-none"
                name="platformAgreementContent"
                defaultValue={settings.platformAgreementContent}
                required
              />
            </FieldBlock>
          </div>
        </section>
      </form>
    </main>
  );
}
