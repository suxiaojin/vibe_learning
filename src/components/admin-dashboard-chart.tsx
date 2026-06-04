import { ArrowUpRight, CalendarDays } from "lucide-react";
import type { TrendPoint, TrendSelection } from "@/lib/admin-dashboard";

type TrendChartProps = {
  title: string;
  description: string;
  accent: string;
  points: TrendPoint[];
  selection: TrendSelection;
  yearParam: string;
  monthParam: string;
  availableYears: number[];
  preservedParams: Record<string, string>;
  suffix?: string;
};

const chartWidth = 760;
const chartHeight = 260;
const padding = {
  top: 24,
  right: 18,
  bottom: 38,
  left: 52
};

function niceMax(value: number) {
  if (value <= 0) {
    return 10;
  }
  const roughStep = value / 5;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  const niceStep = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return Math.ceil(value / (niceStep * magnitude)) * niceStep * magnitude;
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    notation: value >= 10000 ? "compact" : "standard",
    maximumFractionDigits: 1
  }).format(value);
}

export function DashboardTrendChart({
  title,
  description,
  accent,
  points,
  selection,
  yearParam,
  monthParam,
  availableYears,
  preservedParams,
  suffix = "人"
}: TrendChartProps) {
  const maxValue = Math.max(...points.map((point) => point.value), 0);
  const yMax = niceMax(maxValue);
  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;
  const coordinateFor = (point: TrendPoint, index: number) => {
    const x = padding.left + (points.length <= 1 ? 0 : (index / (points.length - 1)) * plotWidth);
    const y = padding.top + plotHeight - (point.value / yMax) * plotHeight;
    return { x, y };
  };
  const coordinates = points.map(coordinateFor);
  const polyline = coordinates.map((point) => `${point.x},${point.y}`).join(" ");
  const yTicks = Array.from({ length: 6 }, (_, index) => {
    const value = Math.round((yMax / 5) * index);
    return {
      value,
      y: padding.top + plotHeight - (index / 5) * plotHeight
    };
  });
  const labelStep = Math.max(1, Math.ceil(points.length / 7));
  const total = points.reduce((sum, point) => sum + point.value, 0);
  const peak = maxValue;

  return (
    <section className="border border-slate-300 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-base font-black text-slate-900">{title}</h2>
          <p className="mt-1 text-xs text-slate-500">{description}</p>
        </div>
        <form className="flex flex-wrap items-center gap-2" action="/admin/dashboard">
          {Object.entries(preservedParams).map(([name, value]) => (
            <input key={name} name={name} type="hidden" value={value} />
          ))}
          <select className="h-9 border border-slate-300 bg-white px-3 text-xs font-semibold outline-none focus:border-[#0872b9]" name={yearParam} defaultValue={selection.year}>
            {availableYears.map((year) => <option key={year} value={year}>{year}年</option>)}
          </select>
          <select className="h-9 border border-slate-300 bg-white px-3 text-xs font-semibold outline-none focus:border-[#0872b9]" name={monthParam} defaultValue={selection.month || ""}>
            <option value="">全年</option>
            {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => <option key={month} value={month}>{month}月</option>)}
          </select>
          <button className="h-9 bg-[#0872b9] px-3 text-xs font-bold text-white transition hover:bg-[#0767a8]" type="submit">
            查询
          </button>
        </form>
      </div>

      <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_150px]">
        <div className="min-w-0 overflow-x-auto">
          <svg className="w-full min-w-[620px] overflow-visible" viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label={`${title}趋势图`}>
            <defs>
              <linearGradient id={`${yearParam}-area`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={accent} stopOpacity="0.22" />
                <stop offset="100%" stopColor={accent} stopOpacity="0.02" />
              </linearGradient>
            </defs>

            {yTicks.map((tick) => (
              <g key={tick.value}>
                <line x1={padding.left} x2={chartWidth - padding.right} y1={tick.y} y2={tick.y} stroke="#e2e8f0" strokeDasharray="4 4" />
                <text x={padding.left - 10} y={tick.y + 4} textAnchor="end" fill="#94a3b8" fontSize="11">
                  {compactNumber(tick.value)}
                </text>
              </g>
            ))}

            {coordinates.length > 1 ? (
              <path
                d={`M ${coordinates[0].x} ${padding.top + plotHeight} L ${coordinates.map((point) => `${point.x} ${point.y}`).join(" L ")} L ${coordinates[coordinates.length - 1].x} ${padding.top + plotHeight} Z`}
                fill={`url(#${yearParam}-area)`}
              />
            ) : null}
            <polyline points={polyline} fill="none" stroke={accent} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
            {coordinates.map((point, index) => (
              <circle key={points[index].key} cx={point.x} cy={point.y} fill="white" r="3.5" stroke={accent} strokeWidth="2">
                <title>{`${points[index].label}: ${points[index].value}${suffix}`}</title>
              </circle>
            ))}

            {points.map((point, index) => {
              const coordinate = coordinates[index];
              const show = index % labelStep === 0 || index === points.length - 1;
              return show ? (
                <text key={point.key} x={coordinate.x} y={chartHeight - 12} textAnchor="middle" fill="#64748b" fontSize="10">
                  {point.label}
                </text>
              ) : null;
            })}

            {maxValue === 0 ? (
              <text x={padding.left + plotWidth / 2} y={padding.top + plotHeight / 2} textAnchor="middle" fill="#94a3b8" fontSize="13">
                当前时间范围暂无数据
              </text>
            ) : null}
          </svg>
        </div>

        <div className="grid content-start gap-3">
          <div className="border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <CalendarDays size={14} />
              数据点合计
            </div>
            <p className="mt-2 text-2xl font-black text-slate-900">{total.toLocaleString("zh-CN")}</p>
            <p className="mt-1 text-xs text-slate-500">{suffix}</p>
          </div>
          <div className="border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <ArrowUpRight size={14} />
              单点峰值
            </div>
            <p className="mt-2 text-2xl font-black" style={{ color: accent }}>{peak.toLocaleString("zh-CN")}</p>
            <p className="mt-1 text-xs text-slate-500">{suffix}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function DashboardUnavailableTrend({
  title,
  selection,
  yearParam,
  monthParam,
  availableYears,
  preservedParams
}: {
  title: string;
  selection: TrendSelection;
  yearParam: string;
  monthParam: string;
  availableYears: number[];
  preservedParams: Record<string, string>;
}) {
  return (
    <section className="border border-dashed border-slate-300 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-base font-black text-slate-900">{title}</h2>
          <p className="mt-1 text-xs text-slate-500">已预留展示位置，支付功能接入后启用。</p>
        </div>
        <form className="flex flex-wrap items-center gap-2" action="/admin/dashboard">
          {Object.entries(preservedParams).map(([name, value]) => (
            <input key={name} name={name} type="hidden" value={value} />
          ))}
          <select className="h-9 border border-slate-300 bg-white px-3 text-xs font-semibold" name={yearParam} defaultValue={selection.year}>
            {availableYears.map((year) => <option key={year} value={year}>{year}年</option>)}
          </select>
          <select className="h-9 border border-slate-300 bg-white px-3 text-xs font-semibold" name={monthParam} defaultValue={selection.month || ""}>
            <option value="">全年</option>
            {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => <option key={month} value={month}>{month}月</option>)}
          </select>
          <button className="h-9 bg-slate-300 px-3 text-xs font-bold text-white" type="submit">查询</button>
        </form>
      </div>
      <div className="grid min-h-[280px] place-items-center p-6 text-center">
        <div>
          <p className="text-4xl font-black text-slate-300">--</p>
          <p className="mt-3 text-sm font-semibold text-slate-500">充值功能未接入</p>
        </div>
      </div>
    </section>
  );
}
