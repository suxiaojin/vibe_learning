import type { LucideIcon } from "lucide-react";
import {
  Bot,
  BrainCircuit,
  CircleDollarSign,
  ClipboardCheck,
  LogIn,
  Medal,
  Trophy,
  UserRoundPlus,
  UsersRound
} from "lucide-react";
import { DashboardMajorFilters, DashboardRankingFilters } from "@/components/admin-dashboard-filters";
import { DashboardTrendChart, DashboardUnavailableTrend } from "@/components/admin-dashboard-chart";
import {
  dashboardPeriods,
  getCurrentTrendSelection,
  getDashboardOverview,
  getDashboardRegionOptions,
  getDashboardTrend,
  getMajorTopFive,
  getProvinceDistribution,
  getSubjectAnswerRanking,
  type DashboardDistributionItem,
  type DashboardPeriod,
  type PeriodCounts,
  type TrendSelection
} from "@/lib/admin-dashboard";
import { requireAdmin } from "@/lib/auth";

type SearchParams = {
  majorProvince?: string;
  majorStudySystem?: string;
  rankingProvince?: string;
  rankingStudySystem?: string;
  rankingCourseType?: string;
  rankingPeriod?: string;
  registrationYear?: string;
  registrationMonth?: string;
  activeYear?: string;
  activeMonth?: string;
  rechargeYear?: string;
  rechargeMonth?: string;
  answerUsersYear?: string;
  answerUsersMonth?: string;
  answerCountYear?: string;
  answerCountMonth?: string;
};

const periodLabels: Record<DashboardPeriod, string> = {
  today: "今天",
  "7d": "近7天",
  "30d": "近30天"
};

const courseTypeLabels = {
  public_subject: "公共课",
  major: "专业课"
} as const;

function parseTrendSelection(params: SearchParams, yearParam: keyof SearchParams, monthParam: keyof SearchParams, fallback: TrendSelection) {
  const parsedYear = Number(params[yearParam]);
  const rawMonth = params[monthParam];
  const parsedMonth = Number(rawMonth);
  const year = Number.isInteger(parsedYear) && parsedYear >= 2020 && parsedYear <= fallback.year ? parsedYear : fallback.year;
  const requestedMonth =
    rawMonth === ""
      ? null
      : Number.isInteger(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12
        ? parsedMonth
        : fallback.month;

  return {
    year,
    month: year === fallback.year && requestedMonth && fallback.month && requestedMonth > fallback.month ? fallback.month : requestedMonth
  };
}

function preservedParams(params: SearchParams, excluded: Array<keyof SearchParams>) {
  const excludedSet = new Set(excluded);
  return Object.fromEntries(
    Object.entries(params).filter(([key, value]) => value !== undefined && !excludedSet.has(key as keyof SearchParams))
  ) as Record<string, string>;
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function resolveProvince(value: string | undefined, provinces: string[]) {
  return value && provinces.includes(value) ? value : provinces[0] || "";
}

function resolveStudySystem(value: string | undefined, available: string[]) {
  return value && available.includes(value) ? value : available[0] || "";
}

function isDashboardPeriod(value?: string): value is DashboardPeriod {
  return dashboardPeriods.includes(value as DashboardPeriod);
}

function MetricCard({
  title,
  value,
  counts,
  description,
  icon: Icon,
  tone
}: {
  title: string;
  value: number | string;
  counts?: PeriodCounts;
  description: string;
  icon: LucideIcon;
  tone: string;
}) {
  return (
    <section className="border border-slate-300 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-slate-500">{title}</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-slate-900">
            {typeof value === "number" ? value.toLocaleString("zh-CN") : value}
          </p>
        </div>
        <span className="grid size-10 place-items-center text-white" style={{ backgroundColor: tone }}>
          <Icon size={20} />
        </span>
      </div>
      {counts ? (
        <div className="mt-4 grid grid-cols-3 border-y border-slate-200 py-3 text-center">
          {dashboardPeriods.map((period) => (
            <div key={period} className="border-r border-slate-200 last:border-r-0">
              <p className="text-[11px] font-semibold text-slate-400">{periodLabels[period]}</p>
              <p className="mt-1 text-sm font-black text-slate-800">{counts[period].toLocaleString("zh-CN")}</p>
            </div>
          ))}
        </div>
      ) : null}
      <p className="mt-3 min-h-8 text-xs leading-5 text-slate-500">{description}</p>
    </section>
  );
}

function HorizontalBars({
  items,
  emptyText,
  accent = "#0872b9",
  rankedCount = items.length,
  total
}: {
  items: DashboardDistributionItem[];
  emptyText: string;
  accent?: string;
  rankedCount?: number;
  total?: number;
}) {
  const maxValue = Math.max(...items.map((item) => item.value), 0);

  if (items.length === 0) {
    return <div className="grid min-h-52 place-items-center text-sm font-semibold text-slate-400">{emptyText}</div>;
  }

  return (
    <div className="space-y-4">
      {items.map((item, index) => (
        <div key={`${item.label}-${index}`}>
          <div className="mb-1.5 flex items-center justify-between gap-4 text-sm">
            <span className="min-w-0 truncate font-semibold text-slate-700">
              <span className="mr-2 inline-flex size-5 items-center justify-center bg-slate-100 text-[11px] font-black text-slate-500">
                {index < rankedCount ? index + 1 : "·"}
              </span>
              {item.label}
            </span>
            <span className="shrink-0 font-black text-slate-900">
              {item.value.toLocaleString("zh-CN")} 人
              {total ? <span className="ml-1 text-xs font-semibold text-slate-400">· {((item.value / total) * 100).toFixed(1)}%</span> : null}
            </span>
          </div>
          <div className="h-2.5 bg-slate-100">
            <div
              className="h-full transition-all"
              style={{
                backgroundColor: accent,
                width: `${maxValue > 0 ? Math.max(3, (item.value / maxValue) * 100) : 0}%`,
                opacity: Math.max(0.48, 1 - index * 0.1)
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function SectionHeader({ title, description, icon: Icon }: { title: string; description: string; icon: LucideIcon }) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid size-9 shrink-0 place-items-center bg-[#e8f3fb] text-[#0872b9]">
        <Icon size={18} />
      </span>
      <div>
        <h2 className="text-base font-black text-slate-900">{title}</h2>
        <p className="mt-1 text-xs text-slate-500">{description}</p>
      </div>
    </div>
  );
}

export default async function DashboardPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  await requireAdmin();
  const params = (await searchParams) || {};
  const currentSelection = getCurrentTrendSelection();

  const [overview, regionOptions] = await Promise.all([
    getDashboardOverview(),
    getDashboardRegionOptions()
  ]);

  const provinces = unique(regionOptions.map((region) => region.province));
  const majorProvince = resolveProvince(params.majorProvince, provinces);
  const majorStudySystems = unique(regionOptions.filter((region) => region.province === majorProvince).map((region) => region.studySystem));
  const majorStudySystem = resolveStudySystem(params.majorStudySystem, majorStudySystems);
  const rankingProvince = resolveProvince(params.rankingProvince, provinces);
  const rankingStudySystems = unique(regionOptions.filter((region) => region.province === rankingProvince).map((region) => region.studySystem));
  const rankingStudySystem = resolveStudySystem(params.rankingStudySystem, rankingStudySystems);
  const rankingCourseType = params.rankingCourseType === "major" ? "major" : "public_subject";
  const rankingPeriod = isDashboardPeriod(params.rankingPeriod) ? params.rankingPeriod : "today";

  const registrationSelection = parseTrendSelection(params, "registrationYear", "registrationMonth", currentSelection);
  const activeSelection = parseTrendSelection(params, "activeYear", "activeMonth", currentSelection);
  const rechargeSelection = parseTrendSelection(params, "rechargeYear", "rechargeMonth", currentSelection);
  const answerUsersSelection = parseTrendSelection(params, "answerUsersYear", "answerUsersMonth", currentSelection);
  const answerCountSelection = parseTrendSelection(params, "answerCountYear", "answerCountMonth", currentSelection);
  const allSelectedYears = [
    currentSelection.year,
    registrationSelection.year,
    activeSelection.year,
    rechargeSelection.year,
    answerUsersSelection.year,
    answerCountSelection.year
  ];
  const oldestYear = Math.min(currentSelection.year - 4, ...allSelectedYears);
  const availableYears = Array.from({ length: currentSelection.year - oldestYear + 1 }, (_, index) => currentSelection.year - index);

  const [
    majorTopFive,
    provinceDistribution,
    ranking,
    registrationTrend,
    activeTrend,
    answerUsersTrend,
    answerCountTrend
  ] = await Promise.all([
    getMajorTopFive({ province: majorProvince, studySystem: majorStudySystem }),
    getProvinceDistribution(overview.totalUsers),
    getSubjectAnswerRanking({
      province: rankingProvince,
      studySystem: rankingStudySystem,
      courseType: rankingCourseType,
      period: rankingPeriod
    }),
    getDashboardTrend("registrations", registrationSelection),
    getDashboardTrend("activeUsers", activeSelection),
    getDashboardTrend("answerUsers", answerUsersSelection),
    getDashboardTrend("answerCount", answerCountSelection)
  ]);

  const provinceBars = [
    ...provinceDistribution.topFive,
    ...(provinceDistribution.otherCount > 0 ? [{ label: "其他省份", value: provinceDistribution.otherCount }] : []),
    ...(provinceDistribution.missingCount > 0 ? [{ label: "未填写地区", value: provinceDistribution.missingCount }] : [])
  ];

  return (
    <main className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-normal text-slate-950">运营仪表盘</h1>
          <p className="mt-2 text-sm text-slate-500">用户增长、登录活跃、答题行为与 AI 使用概览，所有日期按北京时间统计。</p>
        </div>
        <div className="border border-slate-300 bg-white px-4 py-3 text-xs text-slate-500 shadow-sm">
          <span className="font-black text-slate-800">统计口径：</span>
          登录用户按每日首次访问奖励记录，学习活跃用户按单日答题数 ≥ 30。
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <MetricCard
          title="总用户数"
          value={overview.totalUsers}
          description="role 为 student 的全部注册账号。"
          icon={UsersRound}
          tone="#334155"
        />
        <MetricCard
          title="新注册用户"
          value={overview.registrations.today}
          counts={overview.registrations}
          description="按账号注册时间统计。"
          icon={UserRoundPlus}
          tone="#0872b9"
        />
        <MetricCard
          title="登录用户"
          value={overview.loginUsers.today}
          counts={overview.loginUsers}
          description="周期内获得每日首次访问奖励的去重用户。"
          icon={LogIn}
          tone="#0f766e"
        />
        <MetricCard
          title="学习活跃用户"
          value={overview.activeUsers.today}
          counts={overview.activeUsers}
          description="周期内至少有一天答题数量达到 30 道的去重用户。"
          icon={BrainCircuit}
          tone="#7c3aed"
        />
        <MetricCard
          title="AI 使用人数"
          value={overview.aiUsers.today}
          counts={overview.aiUsers}
          description="周期内至少成功获得一次 AI 回答的去重用户。"
          icon={Bot}
          tone="#ea580c"
        />
        <MetricCard
          title="充值人数"
          value="--"
          description="充值功能未接入，暂不统计。"
          icon={CircleDollarSign}
          tone="#94a3b8"
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="border border-slate-300 bg-white shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
            <SectionHeader title="用户数最多的专业 Top5" description="不包括公共课，仅统计已选择专业的用户。" icon={Medal} />
            <DashboardMajorFilters
              regions={regionOptions}
              defaultProvince={majorProvince}
              defaultStudySystem={majorStudySystem}
              preservedParams={preservedParams(params, ["majorProvince", "majorStudySystem"])}
            />
          </div>
          <div className="p-5">
            <HorizontalBars items={majorTopFive} emptyText="当前筛选范围暂无已选择专业的用户。" accent="#0f766e" />
          </div>
        </div>

        <div className="border border-slate-300 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <SectionHeader title="省份用户 Top5" description="按用户选择的报考地区统计，同时展示其他省份与未填写地区。" icon={Trophy} />
          </div>
          <div className="p-5">
            <HorizontalBars
              items={provinceBars}
              emptyText="暂无地区用户数据。"
              accent="#0872b9"
              rankedCount={provinceDistribution.topFive.length}
              total={overview.totalUsers}
            />
          </div>
        </div>
      </section>

      <section className="border border-slate-300 bg-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <SectionHeader
            title="各学科答题数量 Top10 用户"
            description="每条答题记录计为一次，重复作答重复计数；相同答题数使用相同排名。"
            icon={ClipboardCheck}
          />
          <DashboardRankingFilters
            regions={regionOptions}
            defaultProvince={rankingProvince}
            defaultStudySystem={rankingStudySystem}
            defaultCourseType={rankingCourseType}
            defaultPeriod={rankingPeriod}
            preservedParams={preservedParams(params, ["rankingProvince", "rankingStudySystem", "rankingCourseType", "rankingPeriod"])}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-[#eef0f4] text-xs font-bold text-slate-600">
              <tr>
                <th className="border-b border-slate-300 px-5 py-3">排名</th>
                <th className="border-b border-slate-300 px-5 py-3">用户名</th>
                <th className="border-b border-slate-300 px-5 py-3">学科类型</th>
                <th className="border-b border-slate-300 px-5 py-3">学科</th>
                <th className="border-b border-slate-300 px-5 py-3 text-right">答题数量</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {ranking.length > 0 ? ranking.map((item) => (
                <tr key={`${item.username}-${item.courseName}`} className="hover:bg-slate-50">
                  <td className="px-5 py-4">
                    <span className="inline-flex size-8 items-center justify-center bg-[#e8f3fb] font-black text-[#0872b9]">{item.rank}</span>
                  </td>
                  <td className="px-5 py-4 font-bold text-slate-900">{item.username}</td>
                  <td className="px-5 py-4 text-slate-600">{courseTypeLabels[rankingCourseType]}</td>
                  <td className="px-5 py-4 text-slate-700">{item.courseName}</td>
                  <td className="px-5 py-4 text-right text-base font-black text-slate-900">{item.answerCount.toLocaleString("zh-CN")}</td>
                </tr>
              )) : (
                <tr>
                  <td className="px-5 py-12 text-center text-sm font-semibold text-slate-400" colSpan={5}>当前筛选范围暂无答题记录。</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-xl font-black text-slate-950">趋势展示</h2>
          <p className="mt-1 text-sm text-slate-500">选择年份查看逐月趋势，选择年份与月份查看逐日趋势；纵轴根据实际数据自动缩放。</p>
        </div>
        <div className="grid gap-6 2xl:grid-cols-2">
          <DashboardTrendChart
            title="新注册用户趋势"
            description="所选时间范围内注册的学生账号数量。"
            accent="#0872b9"
            points={registrationTrend}
            selection={registrationSelection}
            yearParam="registrationYear"
            monthParam="registrationMonth"
            availableYears={availableYears}
            preservedParams={preservedParams(params, ["registrationYear", "registrationMonth"])}
          />
          <DashboardTrendChart
            title="学习活跃用户趋势"
            description="每天或每月内，至少有一天答题数量达到 30 道的去重用户。"
            accent="#7c3aed"
            points={activeTrend}
            selection={activeSelection}
            yearParam="activeYear"
            monthParam="activeMonth"
            availableYears={availableYears}
            preservedParams={preservedParams(params, ["activeYear", "activeMonth"])}
          />
          <DashboardUnavailableTrend
            title="充值人数趋势"
            selection={rechargeSelection}
            yearParam="rechargeYear"
            monthParam="rechargeMonth"
            availableYears={availableYears}
            preservedParams={preservedParams(params, ["rechargeYear", "rechargeMonth"])}
          />
          <DashboardTrendChart
            title="答题人数趋势"
            description="每个用户每天或每月答题数量达到 1 道即计为 1 人。"
            accent="#0f766e"
            points={answerUsersTrend}
            selection={answerUsersSelection}
            yearParam="answerUsersYear"
            monthParam="answerUsersMonth"
            availableYears={availableYears}
            preservedParams={preservedParams(params, ["answerUsersYear", "answerUsersMonth"])}
          />
          <DashboardTrendChart
            title="答题数量趋势"
            description="所有学生在所选时间范围内产生的答题记录数量。"
            accent="#ea580c"
            points={answerCountTrend}
            selection={answerCountSelection}
            yearParam="answerCountYear"
            monthParam="answerCountMonth"
            availableYears={availableYears}
            preservedParams={preservedParams(params, ["answerCountYear", "answerCountMonth"])}
            suffix="道"
          />
        </div>
      </section>
    </main>
  );
}
