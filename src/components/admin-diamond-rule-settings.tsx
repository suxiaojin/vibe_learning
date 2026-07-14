import { Save } from "lucide-react";
import { updateDiamondRuleSettings } from "@/app/admin/actions";
import {
  type DiamondRuleSettingItem,
  maxDiamondRuleAmount
} from "@/lib/diamond-rules";

function formatBeijingDate(value: Date | null) {
  if (!value) {
    return "尚未写入";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(value);
}

function DiamondRuleList({ rules }: { rules: DiamondRuleSettingItem[] }) {
  if (rules.length === 0) {
    return (
      <div className="border-t border-slate-100 px-5 py-10 text-center">
        <p className="text-sm font-bold text-slate-600">当前暂无扣减项目</p>
        <p className="mt-1 text-xs font-semibold text-slate-400">接入真实功能扣费后，对应规则会显示在这里。</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border-t border-slate-100">
      <div className="min-w-[1280px]">
        <div className="grid grid-cols-[190px_minmax(260px,1fr)_220px_130px_150px_190px_110px] gap-4 bg-slate-50 px-5 py-3 text-xs font-black text-slate-500">
          <span>行为</span>
          <span>具体说明</span>
          <span>触发时机</span>
          <span>钻石数量</span>
          <span>状态</span>
          <span>最后修改</span>
          <span>操作</span>
        </div>

        {rules.map((rule) => (
          <form
            key={rule.key}
            action={updateDiamondRuleSettings}
            className="grid grid-cols-[190px_minmax(260px,1fr)_220px_130px_150px_190px_110px] items-center gap-4 border-t border-slate-100 px-5 py-4 first:border-t-0"
          >
            <input name="key" type="hidden" value={rule.key} />
            <div>
              <p className="text-sm font-black text-ink">{rule.label}</p>
              <p className="mt-1 text-xs font-semibold text-slate-400">{rule.key}</p>
            </div>
            <p className="text-sm font-semibold leading-6 text-slate-600">{rule.description}</p>
            <p className="text-sm font-semibold leading-6 text-slate-600">{rule.triggerTiming}</p>
            <input
              aria-label={`${rule.label}钻石数量`}
              className="input rounded-none"
              defaultValue={rule.amount}
              max={maxDiamondRuleAmount}
              min={1}
              name="amount"
              required
              step={1}
              type="number"
            />
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input className="peer sr-only" defaultChecked={rule.enabled} name="enabled" type="checkbox" />
              <span className="relative h-6 w-11 shrink-0 rounded-full bg-slate-300 transition after:absolute after:left-1 after:top-1 after:size-4 after:rounded-full after:bg-white after:content-[''] peer-checked:bg-teal peer-checked:after:translate-x-5" />
              <span className="text-sm font-bold text-slate-600">启用</span>
            </label>
            <div className="text-xs font-semibold leading-5 text-slate-500">
              <p>{rule.updatedByUsername || "系统默认"}</p>
              <p>{formatBeijingDate(rule.updatedAt)}</p>
              <p className="text-slate-400">版本 {rule.version}</p>
            </div>
            <button className="secondary-button rounded-none" type="submit">
              <Save size={16} />
              保存
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}

export function AdminDiamondRuleSettings({ rules }: { rules: DiamondRuleSettingItem[] }) {
  const grantRules = rules.filter((rule) => rule.direction === "grant");
  const consumeRules = rules.filter((rule) => rule.direction === "consume");

  return (
    <section className="space-y-4">
      <section className="border border-slate-200 bg-white shadow-sm">
        <header className="px-5 py-4">
          <h2 className="text-lg font-black text-ink">钻石增加规则</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">修改数量或启停后，只影响后续新触发的奖励。</p>
        </header>
        <DiamondRuleList rules={grantRules} />
      </section>

      <section className="border border-slate-200 bg-white shadow-sm">
        <header className="px-5 py-4">
          <h2 className="text-lg font-black text-ink">钻石扣减规则</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">只展示已经接入后端真实扣费事件的功能。</p>
        </header>
        <DiamondRuleList rules={consumeRules} />
      </section>
    </section>
  );
}
