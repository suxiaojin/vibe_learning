import { requireAdmin } from "@/lib/auth";
import { getAdminStudyMineruSettings, maxStudyMineruConcurrency } from "@/lib/ai-study-mineru-settings";
import { AiSettingsTabs } from "../ai-settings-tabs";
import { saveStudyMineruAction } from "./actions";

const providers = [
  { id: "private", name: "内网 MinerU" },
  { id: "online", name: "MinerU 官方在线 API" }
] as const;

const errors: Record<string, string> = {
  "mineru-invalid": "请选择解析服务，并检查 API Key 格式。",
  "mineru-key-required": "切换到在线 API 前，请填写 MinerU API Key。",
  "mineru-save-failed": "保存 MinerU 配置失败，请检查数据库和服务端加密配置。"
};

const inputClassName = "min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal";

export default async function AdminStudyMineruPage({
  searchParams
}: {
  searchParams?: Promise<{ notice?: string; error?: string }>;
}) {
  await requireAdmin();
  const [params, mineru] = await Promise.all([searchParams, getAdminStudyMineruSettings()]);
  const error = params?.error ? errors[params.error] : null;

  return (
    <main className="space-y-4">
      <header>
        <h1 className="text-xl font-black text-ink">AI配置</h1>
        <p className="mt-1 text-sm font-semibold text-slate-500">管理闯关页、学习搭子 Prompt、AI 服务器与 PDF 解析。</p>
      </header>
      <AiSettingsTabs active="mineru" />

      <section id="study-mineru" aria-labelledby="mineru-title" className="space-y-4">
        <div>
          <h2 id="mineru-title" className="text-lg font-black text-ink">学习搭子 PDF 解析</h2>
          <p className="mt-1 text-sm text-slate-600">保存后，排队中的任务按所选服务和并发上限调度。</p>
        </div>
        {params?.notice === "mineru-saved" ? <p role="status" className="rounded-md border border-teal/20 bg-teal/10 p-3 text-sm font-semibold text-teal">解析配置已保存。</p> : null}
        {error ? <p role="alert" className="rounded-md border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}

        <form action={saveStudyMineruAction} className="space-y-4">
          <fieldset className="min-w-0">
            <legend className="mb-2 text-sm font-semibold text-ink">选择解析服务</legend>
            <div className="grid gap-4 lg:grid-cols-2">
              {providers.map(({ id, name }) => {
                const active = mineru.provider === id;
                return (
                  <section key={id} aria-labelledby={`mineru-${id}-title`}
                    className={`flex min-w-0 flex-col rounded-lg border bg-white p-4 ${active ? "border-teal" : "border-slate-200"}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 id={`mineru-${id}-title`} className="font-black text-ink">{name}</h3>
                      {active ? <span className="rounded-full bg-teal/10 px-2.5 py-1 text-xs font-bold text-teal">当前使用</span> : null}
                    </div>
                    <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold text-ink">
                      <input type="radio" name="provider" value={id} defaultChecked={active} required
                        aria-label={`使用${name}`} className="h-4 w-4 accent-teal" />
                      设为解析服务
                    </label>
                    <div className="mt-2 space-y-4 border-t border-slate-100 pt-4">
                      <label className="grid max-w-52 gap-1 text-sm font-semibold text-ink">
                        并发任务数
                        <input type="number" name={`${id}Concurrency`} defaultValue={mineru.concurrency[id]} required
                          min={1} max={maxStudyMineruConcurrency} step={1} className={inputClassName} />
                        {params?.error === `mineru-invalid-${id}` ? (
                          <span role="alert" className="text-xs text-red-700">请输入 1 至 {maxStudyMineruConcurrency} 的整数。</span>
                        ) : (
                          <span className="text-xs font-normal text-slate-600">1～{maxStudyMineruConcurrency}</span>
                        )}
                      </label>
                      {id === "online" ? (
                        <>
                          <label className="grid gap-1 text-sm font-semibold text-ink">
                            MinerU API Key
                            <input type="password" name="token" autoComplete="new-password" maxLength={4096}
                              placeholder={mineru.apiKeyConfigured ? "已配置，留空保留当前密钥" : "首次启用时填写"}
                              className={inputClassName} />
                            <span className="text-xs font-normal text-slate-600">PDF 会上传至 MinerU，每份提交文件最多 200 页，超出时系统会自动拆分。</span>
                          </label>
                          <div>
                            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold text-ink">
                              <input type="checkbox" name="onlineImageSupplementEnabled" defaultChecked={mineru.onlineImageSupplementEnabled}
                                aria-describedby="mineru-online-image-supplement-help" className="h-4 w-4 accent-teal" />
                              启用图片补充解析
                            </label>
                            <p id="mineru-online-image-supplement-help" className="text-xs text-slate-600">
                              开启后会对缺少文字说明的图片再次识别，可能延长解析时间。
                            </p>
                          </div>
                        </>
                      ) : null}
                    </div>
                  </section>
                );
              })}
            </div>
          </fieldset>
          <p className="text-xs text-slate-600">上传大小、项目创建额度和思维导图生成使用学习搭子的共用规则。</p>
          <button className="min-h-11 rounded-md bg-teal px-4 py-2 text-sm font-bold text-white" type="submit">保存解析配置</button>
        </form>
      </section>
    </main>
  );
}
