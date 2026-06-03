import Link from "next/link";
import { ImageUp, Save } from "lucide-react";
import { updateSystemSettings } from "@/app/admin/actions";
import { requireAdmin } from "@/lib/auth";
import { getSystemSettings } from "@/lib/system-settings";

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

export default async function AdminSettingsPage({
  searchParams
}: {
  searchParams?: Promise<{ notice?: string; error?: string }>;
}) {
  await requireAdmin();
  const [settings, params] = await Promise.all([getSystemSettings(), searchParams]);
  const notice = params?.notice ? noticeText[params.notice] : null;
  const error = params?.error ? errorText[params.error] : null;

  return (
    <main className="grid gap-6 xl:grid-cols-[420px_1fr]">
      <section className="border border-slate-300 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-black">系统设置</h1>
            <p className="mt-2 text-sm text-slate-500">管理用户端登录、注册页面展示内容。</p>
          </div>
          <Link className="secondary-button rounded-none" href="/login" target="_blank">
            预览
          </Link>
        </div>

        {notice ? <p className="mt-4 border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{notice}</p> : null}
        {error ? <p className="mt-4 border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}

        <div className="mt-5 overflow-hidden border border-slate-200 bg-slate-100">
          <img alt="当前登录页图片" className="aspect-[3/4] w-full object-cover" src={settings.loginHeroImageUrl} />
        </div>
      </section>

      <section className="border border-slate-300 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-black">登录与注册页内容</h2>
        <form action={updateSystemSettings} className="mt-5 grid gap-5">
          <div>
            <label className="label">登录图片地址</label>
            <input
              className="input rounded-none"
              name="loginHeroImageUrl"
              placeholder="/login-hero-vibelearning.png"
              defaultValue={settings.loginHeroImageUrl}
              required
            />
          </div>

          <div>
            <label className="label">重新上传登录图片</label>
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
          </div>

          <div>
            <label className="label">顶部营销图标</label>
            <select className="input rounded-none" name="loginMarketingIcon" defaultValue={settings.loginMarketingIcon} required>
              {marketingIconOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <label className="label">顶部营销标题</label>
              <input
                className="input rounded-none"
                name="loginMarketingTitle"
                defaultValue={settings.loginMarketingTitle}
                required
              />
            </div>
            <div>
              <label className="label">欢迎标题</label>
              <input
                className="input rounded-none"
                name="loginWelcomeTitle"
                defaultValue={settings.loginWelcomeTitle}
                required
              />
            </div>
          </div>

          <div>
            <label className="label">顶部营销说明</label>
            <textarea
              className="input min-h-28 rounded-none"
              name="loginMarketingDescription"
              defaultValue={settings.loginMarketingDescription}
              required
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-3">
            <div>
              <label className="label">用户协议内容</label>
              <textarea
                className="input min-h-36 rounded-none"
                name="userAgreementContent"
                defaultValue={settings.userAgreementContent}
                required
              />
            </div>
            <div>
              <label className="label">隐私政策内容</label>
              <textarea
                className="input min-h-36 rounded-none"
                name="privacyPolicyContent"
                defaultValue={settings.privacyPolicyContent}
                required
              />
            </div>
            <div>
              <label className="label">平台使用协议内容</label>
              <textarea
                className="input min-h-36 rounded-none"
                name="platformAgreementContent"
                defaultValue={settings.platformAgreementContent}
                required
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button className="primary-button rounded-none" type="submit">
              <Save size={16} />
              保存设置
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
