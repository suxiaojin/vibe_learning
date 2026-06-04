import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const dashboardPeriods = ["today", "7d", "30d"] as const;

export type DashboardPeriod = (typeof dashboardPeriods)[number];

export type PeriodCounts = Record<DashboardPeriod, number>;

export type TrendSelection = {
  year: number;
  month: number | null;
};

export type TrendPoint = {
  key: string;
  label: string;
  value: number;
};

export type DashboardTrendKind = "registrations" | "activeUsers" | "answerUsers" | "answerCount";

export type DashboardOverview = {
  totalUsers: number;
  registrations: PeriodCounts;
  loginUsers: PeriodCounts;
  activeUsers: PeriodCounts;
  aiUsers: PeriodCounts;
};

export type DashboardRegionOption = {
  id: string;
  province: string;
  studySystem: string;
};

export type DashboardDistributionItem = {
  label: string;
  value: number;
};

export type SubjectAnswerRankingItem = {
  rank: number;
  username: string;
  courseName: string;
  answerCount: number;
};

type DailyUserRow = {
  userId: string;
  day: string;
};

type CountRow = {
  bucket: string;
  value: number;
};

type DistributionRow = {
  label: string;
  value: number;
};

type RankingRow = {
  username: string;
  courseName: string;
  answerCount: number;
};

const millisecondsPerDay = 24 * 60 * 60 * 1000;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function getBeijingParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(values.get("year")),
    month: Number(values.get("month")),
    day: Number(values.get("day"))
  };
}

function beijingTimestampStart(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day, -8));
}

function dateOnlyStart(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * millisecondsPerDay);
}

function dateKeyFromDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function currentPeriodRanges() {
  const current = getBeijingParts();
  const todayTimestamp = beijingTimestampStart(current.year, current.month, current.day);
  const tomorrowTimestamp = addDays(todayTimestamp, 1);
  const todayDateOnly = dateOnlyStart(current.year, current.month, current.day);
  const tomorrowDateOnly = addDays(todayDateOnly, 1);

  return {
    timestamp: {
      today: todayTimestamp,
      sevenDays: addDays(todayTimestamp, -6),
      thirtyDays: addDays(todayTimestamp, -29),
      tomorrow: tomorrowTimestamp
    },
    dateOnly: {
      today: todayDateOnly,
      sevenDays: addDays(todayDateOnly, -6),
      thirtyDays: addDays(todayDateOnly, -29),
      tomorrow: tomorrowDateOnly
    },
    keys: {
      today: dateKeyFromDateOnly(todayDateOnly),
      sevenDays: dateKeyFromDateOnly(addDays(todayDateOnly, -6)),
      thirtyDays: dateKeyFromDateOnly(addDays(todayDateOnly, -29))
    }
  };
}

function countDailyUsers(rows: DailyUserRow[], keys: { today: string; sevenDays: string; thirtyDays: string }): PeriodCounts {
  const countFrom = (startDay: string) => new Set(rows.filter((row) => row.day >= startDay).map((row) => row.userId)).size;

  return {
    today: new Set(rows.filter((row) => row.day === keys.today).map((row) => row.userId)).size,
    "7d": countFrom(keys.sevenDays),
    "30d": countFrom(keys.thirtyDays)
  };
}

export async function getDashboardOverview(): Promise<DashboardOverview> {
  const ranges = currentPeriodRanges();

  const [totalUsers, registrationToday, registrationSevenDays, registrationThirtyDays, loginRows, activeRows, aiRows] = await Promise.all([
    prisma.user.count({ where: { role: "student" } }),
    prisma.user.count({
      where: {
        role: "student",
        createdAt: { gte: ranges.timestamp.today, lt: ranges.timestamp.tomorrow }
      }
    }),
    prisma.user.count({
      where: {
        role: "student",
        createdAt: { gte: ranges.timestamp.sevenDays, lt: ranges.timestamp.tomorrow }
      }
    }),
    prisma.user.count({
      where: {
        role: "student",
        createdAt: { gte: ranges.timestamp.thirtyDays, lt: ranges.timestamp.tomorrow }
      }
    }),
    prisma.$queryRaw<DailyUserRow[]>(Prisma.sql`
      SELECT DISTINCT
        dt."userId",
        to_char(dt."occurredOn", 'YYYY-MM-DD') AS day
      FROM "diamond_transactions" dt
      INNER JOIN "users" u ON u.id = dt."userId"
      WHERE u.role = 'student'
        AND dt.type = 'daily_active_bonus'
        AND dt."occurredOn" >= CAST(${ranges.dateOnly.thirtyDays} AS date)
        AND dt."occurredOn" < CAST(${ranges.dateOnly.tomorrow} AS date)
    `),
    prisma.$queryRaw<DailyUserRow[]>(Prisma.sql`
      SELECT
        qa."userId",
        to_char(timezone('Asia/Shanghai', qa."createdAt" AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day
      FROM "question_attempts" qa
      INNER JOIN "users" u ON u.id = qa."userId"
      WHERE u.role = 'student'
        AND qa."createdAt" >= CAST(${ranges.timestamp.thirtyDays} AS timestamp)
        AND qa."createdAt" < CAST(${ranges.timestamp.tomorrow} AS timestamp)
      GROUP BY qa."userId", to_char(timezone('Asia/Shanghai', qa."createdAt" AT TIME ZONE 'UTC'), 'YYYY-MM-DD')
      HAVING COUNT(*) >= 30
    `),
    prisma.$queryRaw<DailyUserRow[]>(Prisma.sql`
      SELECT DISTINCT
        ac."userId",
        to_char(timezone('Asia/Shanghai', ac."createdAt" AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day
      FROM "ai_conversations" ac
      INNER JOIN "users" u ON u.id = ac."userId"
      WHERE u.role = 'student'
        AND ac."createdAt" >= CAST(${ranges.timestamp.thirtyDays} AS timestamp)
        AND ac."createdAt" < CAST(${ranges.timestamp.tomorrow} AS timestamp)
    `)
  ]);

  return {
    totalUsers,
    registrations: {
      today: registrationToday,
      "7d": registrationSevenDays,
      "30d": registrationThirtyDays
    },
    loginUsers: countDailyUsers(loginRows, ranges.keys),
    activeUsers: countDailyUsers(activeRows, ranges.keys),
    aiUsers: countDailyUsers(aiRows, ranges.keys)
  };
}

export async function getDashboardRegionOptions() {
  return prisma.region.findMany({
    select: {
      id: true,
      province: true,
      studySystem: true
    },
    orderBy: [{ province: "asc" }, { studySystem: "asc" }]
  });
}

export async function getMajorTopFive(filters: { province?: string; studySystem?: string }) {
  const conditions: Prisma.Sql[] = [Prisma.sql`u.role = 'student'`];
  if (filters.province) {
    conditions.push(Prisma.sql`r.province = ${filters.province}`);
  }
  if (filters.studySystem) {
    conditions.push(Prisma.sql`r."studySystem" = ${filters.studySystem}`);
  }

  const rows = await prisma.$queryRaw<DistributionRow[]>(Prisma.sql`
    SELECT
      m.name AS label,
      COUNT(*)::int AS value
    FROM "student_profiles" sp
    INNER JOIN "users" u ON u.id = sp."userId"
    INNER JOIN "regions" r ON r.id = sp."regionId"
    INNER JOIN "majors" m ON m.id = sp."majorId"
    WHERE ${Prisma.join(conditions, " AND ")}
    GROUP BY m.id, m.name
    ORDER BY value DESC, m.name ASC
    LIMIT 5
  `);

  return rows.map((row) => ({ label: row.label, value: Number(row.value) }));
}

export async function getProvinceDistribution(totalUsers: number) {
  const rows = await prisma.$queryRaw<DistributionRow[]>(Prisma.sql`
    SELECT
      r.province AS label,
      COUNT(*)::int AS value
    FROM "student_profiles" sp
    INNER JOIN "users" u ON u.id = sp."userId"
    INNER JOIN "regions" r ON r.id = sp."regionId"
    WHERE u.role = 'student'
    GROUP BY r.province
    ORDER BY value DESC, r.province ASC
  `);
  const normalized = rows.map((row) => ({ label: row.label, value: Number(row.value) }));
  const topFive = normalized.slice(0, 5);
  const filledCount = normalized.reduce((sum, row) => sum + row.value, 0);
  const otherCount = normalized.slice(5).reduce((sum, row) => sum + row.value, 0);
  const missingCount = Math.max(0, totalUsers - filledCount);

  return {
    topFive,
    otherCount,
    missingCount
  };
}

function periodTimestampRange(period: DashboardPeriod) {
  const ranges = currentPeriodRanges();
  return {
    start:
      period === "today"
        ? ranges.timestamp.today
        : period === "7d"
          ? ranges.timestamp.sevenDays
          : ranges.timestamp.thirtyDays,
    end: ranges.timestamp.tomorrow
  };
}

export async function getSubjectAnswerRanking(filters: {
  province?: string;
  studySystem?: string;
  courseType: "public_subject" | "major";
  period: DashboardPeriod;
}) {
  const range = periodTimestampRange(filters.period);
  const conditions: Prisma.Sql[] = [
    Prisma.sql`u.role = 'student'`,
    Prisma.sql`qa."createdAt" >= CAST(${range.start} AS timestamp)`,
    Prisma.sql`qa."createdAt" < CAST(${range.end} AS timestamp)`,
    Prisma.sql`lc."courseType"::text = ${filters.courseType}`
  ];
  if (filters.province) {
    conditions.push(Prisma.sql`r.province = ${filters.province}`);
  }
  if (filters.studySystem) {
    conditions.push(Prisma.sql`r."studySystem" = ${filters.studySystem}`);
  }

  const rows = await prisma.$queryRaw<RankingRow[]>(Prisma.sql`
    SELECT
      u.username,
      lc.name AS "courseName",
      COUNT(qa.id)::int AS "answerCount"
    FROM "question_attempts" qa
    INNER JOIN "users" u ON u.id = qa."userId"
    INNER JOIN "quiz_sessions" qs ON qs.id = qa."sessionId"
    INNER JOIN "syllabus_items" si ON si.id = qs."syllabusItemId"
    INNER JOIN "learning_courses" lc ON lc.id = si."courseId"
    INNER JOIN "student_profiles" sp ON sp."userId" = u.id
    INNER JOIN "regions" r ON r.id = sp."regionId"
    WHERE ${Prisma.join(conditions, " AND ")}
    GROUP BY u.id, u.username, lc.id, lc.name
    ORDER BY "answerCount" DESC, u.username ASC, lc.name ASC
    LIMIT 10
  `);

  let previousCount: number | null = null;
  let currentRank = 0;

  return rows.map((row, index): SubjectAnswerRankingItem => {
    const answerCount = Number(row.answerCount);
    if (previousCount !== answerCount) {
      currentRank = index + 1;
      previousCount = answerCount;
    }

    return {
      rank: currentRank,
      username: row.username,
      courseName: row.courseName,
      answerCount
    };
  });
}

function trendRange(selection: TrendSelection) {
  const start = selection.month
    ? beijingTimestampStart(selection.year, selection.month, 1)
    : beijingTimestampStart(selection.year, 1, 1);
  const naturalEnd = selection.month
    ? selection.month === 12
      ? beijingTimestampStart(selection.year + 1, 1, 1)
      : beijingTimestampStart(selection.year, selection.month + 1, 1)
    : beijingTimestampStart(selection.year + 1, 1, 1);
  const current = getBeijingParts();
  const tomorrow = addDays(beijingTimestampStart(current.year, current.month, current.day), 1);
  const end = naturalEnd > tomorrow ? tomorrow : naturalEnd;

  return { start, end };
}

function trendBuckets(selection: TrendSelection) {
  const current = getBeijingParts();

  if (!selection.month) {
    const monthCount = selection.year === current.year ? current.month : 12;
    return Array.from({ length: monthCount }, (_, index) => {
      const month = index + 1;
      return {
        key: `${selection.year}-${pad(month)}`,
        label: `${month}月`
      };
    });
  }

  const days =
    selection.year === current.year && selection.month === current.month
      ? current.day
      : new Date(Date.UTC(selection.year, selection.month, 0)).getUTCDate();
  return Array.from({ length: days }, (_, index) => {
    const day = index + 1;
    return {
      key: `${selection.year}-${pad(selection.month || 1)}-${pad(day)}`,
      label: `${pad(selection.month || 1)}-${pad(day)}`
    };
  });
}

function fillTrend(selection: TrendSelection, rows: CountRow[]): TrendPoint[] {
  const valueByBucket = new Map(rows.map((row) => [row.bucket, Number(row.value)]));
  return trendBuckets(selection).map((bucket) => ({
    ...bucket,
    value: valueByBucket.get(bucket.key) || 0
  }));
}

export async function getDashboardTrend(kind: DashboardTrendKind, selection: TrendSelection) {
  const range = trendRange(selection);
  const createdAtBucket = selection.month
    ? Prisma.sql`to_char(timezone('Asia/Shanghai', u."createdAt" AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`
    : Prisma.sql`to_char(timezone('Asia/Shanghai', u."createdAt" AT TIME ZONE 'UTC'), 'YYYY-MM')`;
  const attemptBucket = selection.month
    ? Prisma.sql`to_char(timezone('Asia/Shanghai', qa."createdAt" AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`
    : Prisma.sql`to_char(timezone('Asia/Shanghai', qa."createdAt" AT TIME ZONE 'UTC'), 'YYYY-MM')`;
  const activeBucket = selection.month
    ? Prisma.sql`to_char(daily.day, 'YYYY-MM-DD')`
    : Prisma.sql`to_char(daily.day, 'YYYY-MM')`;

  let rows: CountRow[];

  if (kind === "registrations") {
    rows = await prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT ${createdAtBucket} AS bucket, COUNT(*)::int AS value
      FROM "users" u
      WHERE u.role = 'student'
        AND u."createdAt" >= CAST(${range.start} AS timestamp)
        AND u."createdAt" < CAST(${range.end} AS timestamp)
      GROUP BY ${createdAtBucket}
      ORDER BY ${createdAtBucket}
    `);
  } else if (kind === "activeUsers") {
    rows = await prisma.$queryRaw<CountRow[]>(Prisma.sql`
      WITH daily AS (
        SELECT
          qa."userId",
          timezone('Asia/Shanghai', qa."createdAt" AT TIME ZONE 'UTC')::date AS day
        FROM "question_attempts" qa
        INNER JOIN "users" u ON u.id = qa."userId"
        WHERE u.role = 'student'
          AND qa."createdAt" >= CAST(${range.start} AS timestamp)
          AND qa."createdAt" < CAST(${range.end} AS timestamp)
        GROUP BY qa."userId", timezone('Asia/Shanghai', qa."createdAt" AT TIME ZONE 'UTC')::date
        HAVING COUNT(*) >= 30
      )
      SELECT ${activeBucket} AS bucket, COUNT(DISTINCT daily."userId")::int AS value
      FROM daily
      GROUP BY ${activeBucket}
      ORDER BY ${activeBucket}
    `);
  } else {
    const aggregate = kind === "answerUsers"
      ? Prisma.sql`COUNT(DISTINCT qa."userId")::int`
      : Prisma.sql`COUNT(*)::int`;

    rows = await prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT ${attemptBucket} AS bucket, ${aggregate} AS value
      FROM "question_attempts" qa
      INNER JOIN "users" u ON u.id = qa."userId"
      WHERE u.role = 'student'
        AND qa."createdAt" >= CAST(${range.start} AS timestamp)
        AND qa."createdAt" < CAST(${range.end} AS timestamp)
      GROUP BY ${attemptBucket}
      ORDER BY ${attemptBucket}
    `);
  }

  return fillTrend(selection, rows);
}

export function getCurrentTrendSelection(): TrendSelection {
  const current = getBeijingParts();
  return {
    year: current.year,
    month: current.month
  };
}
