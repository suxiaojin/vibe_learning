import { Save } from "lucide-react";
import { updateAiServerSettings } from "@/app/admin/actions";
import type { AdminAiServerSettings } from "@/lib/ai-server-settings";

function KeyStatus({ configured }: { configured: boolean }) {
  return (
    <span className={configured ? "font-black text-teal" : "font-black text-slate-500"}>
      {configured ? "已配置（不回显）" : "未配置"}
    </span>
  );
}

export function AdminAiServerSettingsPanel({ settings }: { settings: AdminAiServerSettings }) {
  return (
    <form action={updateAiServerSettings} className="border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-lg font-black text-ink">AI 服务器配置</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            统一控制 AI解释、AI追问、专项练习答疑、学习搭子生成与“问问搭子”等后续模型调用。
          </p>
        </div>
        <button className="primary-button rounded-none" type="submit">
          <Save size={16} />
          保存并切换
        </button>
      </div>

      <div className="mt-5 border border-teal/20 bg-teal/5 px-4 py-3">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-teal">当前正在使用</p>
        <div className="mt-2 grid gap-x-6 gap-y-2 text-sm font-semibold text-slate-600 lg:grid-cols-4">
          <p><span className="text-slate-400">来源：</span>{settings.active.mode === "custom" ? "自定义配置" : "内置配置"}</p>
          <p><span className="text-slate-400">名称：</span>{settings.active.name}</p>
          <p className="break-all"><span className="text-slate-400">模型：</span>{settings.active.model || "未配置"}</p>
          <p><span className="text-slate-400">API Key：</span><KeyStatus configured={settings.active.apiKeyConfigured} /></p>
          <p className="break-all lg:col-span-4"><span className="text-slate-400">API Base URL：</span>{settings.active.baseUrl || "未配置"}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <section className="border border-slate-200 bg-slate-50 p-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input className="mt-1 h-4 w-4 accent-teal" defaultChecked={settings.mode === "built_in"} name="mode" type="radio" value="built_in" />
            <span>
              <span className="block font-black text-ink">使用内置 AI 服务器</span>
              <span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">读取服务器环境变量中的 QWEN_API_BASE_URL、QWEN_MODEL 和 QWEN_API_KEY。</span>
            </span>
          </label>
          <dl className="mt-4 grid gap-3 text-sm font-semibold text-slate-600">
            <div><dt className="text-xs font-black text-slate-400">API Base URL</dt><dd className="mt-1 break-all">{settings.builtIn.baseUrl || "未配置"}</dd></div>
            <div><dt className="text-xs font-black text-slate-400">模型 ID</dt><dd className="mt-1 break-all">{settings.builtIn.model || "未配置"}</dd></div>
            <div><dt className="text-xs font-black text-slate-400">API Key</dt><dd className="mt-1"><KeyStatus configured={settings.builtIn.apiKeyConfigured} /></dd></div>
          </dl>
        </section>

        <section className="border border-slate-200 bg-white p-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input className="mt-1 h-4 w-4 accent-teal" defaultChecked={settings.mode === "custom"} name="mode" type="radio" value="custom" />
            <span>
              <span className="block font-black text-ink">使用自定义 AI 服务器</span>
              <span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">适用于 DeepSeek、GLM 或其他兼容 OpenAI Chat Completions 的服务。</span>
            </span>
          </label>

          <div className="mt-4 grid gap-4">
            <label>
              <span className="label">配置名称</span>
              <input className="input rounded-none" defaultValue={settings.custom.name} maxLength={80} name="customName" placeholder="例如：DeepSeek" />
            </label>
            <label>
              <span className="label">API Base URL（IP / 域名）</span>
              <input className="input rounded-none" defaultValue={settings.custom.baseUrl} maxLength={1000} name="customBaseUrl" placeholder="https://api.deepseek.com/v1" type="url" />
              <span className="mt-1.5 block text-xs font-semibold text-slate-500">填写到 API 版本路径即可，不要包含 /chat/completions。</span>
            </label>
            <label>
              <span className="label">模型 ID</span>
              <input className="input rounded-none" defaultValue={settings.custom.model} maxLength={160} name="customModel" placeholder="例如：deepseek-chat 或 glm-4-plus" />
            </label>
            <label>
              <span className="label">API Key</span>
              <input autoComplete="new-password" className="input rounded-none" maxLength={8192} name="customApiKey" placeholder={settings.custom.apiKeyConfigured ? "已保存；留空保持不变" : "请输入 API Key；无鉴权服务可留空"} type="password" />
              <span className="mt-1.5 block text-xs font-semibold text-slate-500">密钥加密保存且不会在后台回显。更换密钥时直接输入新值。</span>
            </label>
            {settings.custom.apiKeyConfigured ? (
              <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
                <input className="h-4 w-4 accent-red-500" name="clearCustomApiKey" type="checkbox" value="true" />
                清除已保存的自定义 API Key
              </label>
            ) : null}
          </div>
        </section>
      </div>

      <p className="mt-4 text-xs font-semibold leading-5 text-slate-500">
        保存后，后续新发起的模型请求立即读取所选配置；已经生成并缓存的 AI 内容不会重新生成。自定义服务需兼容 OpenAI 的 /chat/completions 请求与流式返回格式。
      </p>
    </form>
  );
}
