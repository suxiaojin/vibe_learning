import bcrypt from "bcryptjs";
import { CalendarDays, CheckCircle2, Gem, KeyRound, Medal, Pencil, School, Upload, UserRound } from "lucide-react";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { StudentSidebar } from "@/components/student-sidebar";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureDiamondAccount, getMedalLevel, getMedalRule, medalRules } from "@/lib/rewards";
import { cn } from "@/lib/utils";

const avatarColors = [
  { key: "green", className: "bg-[#58cc02]" },
  { key: "sky", className: "bg-sky-500" },
  { key: "coral", className: "bg-coral" },
  { key: "honey", className: "bg-honey" },
  { key: "violet", className: "bg-violet-500" }
];

const avatarMaxBytes = 800 * 1024;
const allowedAvatarTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

const transactionLabels: Record<string, string> = {
  register_bonus: "注册赠送",
  daily_active_bonus: "每日登录",
  daily_answer_bonus: "每日答题",
  purchase: "购买充值",
  admin_adjust: "后台调整",
  ai_consumption: "AI 消耗"
};

export default async function MePage({
  searchParams
}: {
  searchParams?: Promise<{ profile?: string; password?: string }>;
}) {
  const user = await requireUser();
  const query = await searchParams;
  const [fullUser, account, transactions, totalAttempts] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      include: { studentProfile: true }
    }),
    ensureDiamondAccount(user.id),
    prisma.diamondTransaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20
    }),
    prisma.questionAttempt.count({ where: { userId: user.id } })
  ]);

  if (!fullUser) {
    redirect("/login");
  }

  const nickname = fullUser.studentProfile?.nickname || fullUser.username;
  const avatarColor = avatarColors.some((item) => item.key === fullUser.studentProfile?.avatarColor)
    ? fullUser.studentProfile?.avatarColor || "green"
    : "green";
  const avatarImage = fullUser.studentProfile?.avatarImage || "";
  const medalLevel = getMedalLevel(totalAttempts);
  const currentMedal = getMedalRule(medalLevel);
  const joinedAt = fullUser.createdAt.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    timeZone: "Asia/Shanghai"
  });

  return (
    <main className="min-h-dvh bg-mist/60 lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <StudentSidebar active="me" />

      <section className="min-w-0 px-5 py-8 lg:px-8">
        <div className="mx-auto max-w-6xl space-y-6">
          <header className="flex flex-wrap items-center justify-between gap-6 border-b border-slate-200 bg-white px-6 py-6">
            <div>
              <p className="text-sm font-black text-teal">个人档案</p>
              <h1 className="mt-2 text-3xl font-black text-ink">{nickname}</h1>
              <p className="mt-2 text-sm font-semibold text-slate-500">用户名：{fullUser.username}</p>
              <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate-500">
                <CalendarDays size={18} />
                {joinedAt} 加入
              </p>
            </div>
            <Avatar name={nickname} color={avatarColor} image={avatarImage} size="lg" />
          </header>

          <Message
            type={query?.profile}
            successText="资料已保存"
            errors={{
              avatar_size: "头像文件不能超过 800KB",
              avatar_type: "头像只支持 JPG、PNG 或 WebP"
            }}
          />
          <Message type={query?.password} successText="密码已更新" />

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
            <ProfilePanel
              username={fullUser.username}
              nickname={nickname}
              avatarColor={avatarColor}
              avatarImage={avatarImage}
              gender={fullUser.studentProfile?.gender || ""}
              school={fullUser.studentProfile?.school || ""}
            />
            <PasswordPanel status={query?.password} />
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_320px]">
            <DiamondPanel balance={account.balance} transactions={transactions} />
            <DiamondRulesPanel />
          </section>

          <MedalTrack currentMedal={currentMedal.label} totalAttempts={totalAttempts} />
        </div>
      </section>
    </main>
  );
}

function ProfilePanel({
  username,
  nickname,
  avatarColor,
  avatarImage,
  gender,
  school
}: {
  username: string;
  nickname: string;
  avatarColor: string;
  avatarImage: string;
  gender: string;
  school: string;
}) {
  return (
    <section className="panel">
      <div className="flex items-center gap-3">
        <UserRound className="text-teal" size={24} />
        <h2 className="text-xl font-black text-ink">我的信息</h2>
      </div>

      <form action={updateProfile} className="mt-5 space-y-5" encType="multipart/form-data">
        <div className="grid gap-5 md:grid-cols-[140px_minmax(0,1fr)]">
          <div>
            <span className="label">头像</span>
            <Avatar name={nickname} color={avatarColor} image={avatarImage} size="md" />
          </div>
          <div>
            <label>
              <span className="label">上传头像</span>
              <span className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 text-sm font-bold text-slate-600 transition hover:border-teal hover:text-teal">
                <Upload size={18} />
                选择图片
                <input className="sr-only" name="avatarImage" type="file" accept="image/png,image/jpeg,image/webp" />
              </span>
            </label>
            <p className="mt-2 text-xs font-semibold leading-5 text-slate-400">支持 JPG、PNG、WebP，大小不超过 800KB。</p>
            <div className="mt-3">
              <span className="label">默认头像颜色</span>
              <div className="flex flex-wrap gap-3">
                {avatarColors.map((color) => (
                  <label key={color.key} className="cursor-pointer">
                    <input className="peer sr-only" name="avatarColor" type="radio" value={color.key} defaultChecked={avatarColor === color.key} />
                    <span className={cn("block size-10 rounded-full border-4 border-white shadow ring-1 ring-slate-200 peer-checked:ring-2 peer-checked:ring-teal", color.className)} />
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label>
            <span className="label">昵称</span>
            <input className="input" name="nickname" defaultValue={nickname} maxLength={30} />
          </label>
          <div>
            <span className="label">用户名</span>
            <div className="flex min-h-11 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-500">
              {username}
            </div>
          </div>
        </div>

        <fieldset>
          <legend className="label">性别</legend>
          <div className="flex flex-wrap gap-2">
            {[
              { value: "", label: "不选择" },
              { value: "male", label: "男" },
              { value: "female", label: "女" }
            ].map((item) => (
              <label key={item.value || "unset"} className="cursor-pointer">
                <input className="peer sr-only" name="gender" type="radio" value={item.value} defaultChecked={gender === item.value} />
                <span className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600 transition peer-checked:border-teal peer-checked:bg-teal peer-checked:text-white">
                  {item.label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <label>
          <span className="label">学校</span>
          <div className="relative">
            <School className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input className="input pl-10" name="school" defaultValue={school} maxLength={80} placeholder="填写学校名称" />
          </div>
        </label>

        <button className="primary-button" type="submit">
          <Pencil size={18} />
          保存资料
        </button>
      </form>
    </section>
  );
}

function PasswordPanel({ status }: { status?: string }) {
  const errorText =
    status === "invalid"
      ? "当前密码不正确"
      : status === "mismatch"
        ? "两次新密码不一致"
        : status === "short"
          ? "新密码至少 6 个字符"
          : null;

  return (
    <section className="panel">
      <div className="flex items-center gap-3">
        <KeyRound className="text-teal" size={24} />
        <h2 className="text-xl font-black text-ink">修改密码</h2>
      </div>
      {errorText ? <p className="mt-4 rounded-xl bg-coral/10 px-4 py-3 text-sm font-semibold text-coral">{errorText}</p> : null}
      <form action={changePassword} className="mt-5 space-y-4">
        <label>
          <span className="label">当前密码</span>
          <input className="input" name="currentPassword" type="password" autoComplete="current-password" />
        </label>
        <label>
          <span className="label">新密码</span>
          <input className="input" name="newPassword" type="password" autoComplete="new-password" />
        </label>
        <label>
          <span className="label">确认新密码</span>
          <input className="input" name="confirmPassword" type="password" autoComplete="new-password" />
        </label>
        <button className="secondary-button w-full" type="submit">
          更新密码
        </button>
      </form>
    </section>
  );
}

function DiamondPanel({
  balance,
  transactions
}: {
  balance: number;
  transactions: Array<{
    id: string;
    type: string;
    amount: number;
    balanceAfter: number;
    note: string | null;
    createdAt: Date;
  }>;
}) {
  return (
    <section className="panel">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Gem className="text-sky-500" size={26} />
          <h2 className="text-xl font-black text-ink">我的钻石</h2>
        </div>
        <div className="rounded-2xl bg-sky-50 px-5 py-3 text-right">
          <p className="text-xs font-black text-sky-500">钻石余额</p>
          <p className="mt-1 text-3xl font-black text-sky-600">{balance}</p>
        </div>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs font-black text-slate-400">
              <th className="py-3 pr-4">时间</th>
              <th className="py-3 pr-4">类型</th>
              <th className="py-3 pr-4">数量</th>
              <th className="py-3 pr-4">余额</th>
              <th className="py-3">说明</th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 ? (
              <tr>
                <td className="py-6 text-center text-sm font-semibold text-slate-400" colSpan={5}>
                  暂无钻石记录
                </td>
              </tr>
            ) : (
              transactions.map((item) => (
                <tr key={item.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-3 pr-4 font-semibold text-slate-500">{formatDateTime(item.createdAt)}</td>
                  <td className="py-3 pr-4 font-bold text-ink">{transactionLabels[item.type] || item.type}</td>
                  <td className={cn("py-3 pr-4 font-black", item.amount >= 0 ? "text-[#58cc02]" : "text-coral")}>
                    {item.amount >= 0 ? "+" : ""}
                    {item.amount}
                  </td>
                  <td className="py-3 pr-4 font-semibold text-slate-600">{item.balanceAfter}</td>
                  <td className="py-3 text-slate-500">{item.note || "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DiamondRulesPanel() {
  return (
    <aside className="panel">
      <h2 className="text-xl font-black text-ink">钻石有什么用</h2>
      <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">钻石可用于站内 AI 提问、AI 解答等功能。</p>

      <h3 className="mt-6 text-lg font-black text-ink">钻石如何获得</h3>
      <ul className="mt-3 space-y-3 text-sm font-semibold leading-6 text-slate-600">
        <li>注册获得 100 钻石。</li>
        <li>每日首次访问按勋章发放：小白 +10、达人 +15、学霸 +20。</li>
        <li>每日答题每达到 10 道发放 5 钻石，可重复触发阶梯奖励。</li>
        <li>购买功能暂未开放，后续按 1 钻石 = 1 元人民币。</li>
      </ul>
    </aside>
  );
}

function MedalTrack({ currentMedal, totalAttempts }: { currentMedal: string; totalAttempts: number }) {
  const expertTarget = medalRules.find((rule) => rule.level === "expert")?.minAttempts || 400;
  const scholarTarget = medalRules.find((rule) => rule.level === "scholar")?.minAttempts || 600;
  const nextRule = medalRules.find((rule) => rule.minAttempts > totalAttempts);
  const remaining = nextRule ? Math.max(0, nextRule.minAttempts - totalAttempts) : 0;
  const progress =
    totalAttempts >= scholarTarget
      ? 100
      : totalAttempts >= expertTarget
        ? 50 + ((totalAttempts - expertTarget) / (scholarTarget - expertTarget)) * 50
        : (totalAttempts / expertTarget) * 50;
  const progressPercent = Math.max(0, Math.min(100, progress));
  const nodes = [
    { label: "小白", threshold: 0, position: 0 },
    { label: "达人", threshold: expertTarget, position: 50 },
    { label: "学霸", threshold: scholarTarget, position: 100 }
  ];

  return (
    <section className="panel">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-black text-teal">我的勋章</p>
          <h2 className="mt-1 text-2xl font-black text-ink">{currentMedal}</h2>
        </div>
        <span className="badge bg-sky-50 text-sky-600">累计答题 {totalAttempts} 次</span>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white px-5 py-6">
        <div className="relative mx-auto max-w-3xl px-3 pb-16 pt-10">
          <div className="absolute left-3 right-3 top-[78px] h-2 rounded-full bg-slate-200" />
          <div className="absolute left-3 top-[78px] h-2 rounded-full bg-honey" style={{ width: `calc((100% - 24px) * ${progressPercent / 100})` }} />
          <div className="absolute top-[70px] z-20 size-6 rounded-full border-4 border-white bg-teal shadow-soft" style={{ left: `calc(12px + (100% - 24px) * ${progressPercent / 100})`, transform: "translateX(-50%)" }} />

          {nodes.map((node) => {
            const reached = totalAttempts >= node.threshold;
            return (
              <div key={node.label} className="absolute top-0 z-10 w-28" style={{ left: `calc(12px + (100% - 24px) * ${node.position / 100})`, transform: nodeTransform(node.position) }}>
                <p className="mb-5 text-center text-sm font-black text-ink">{node.label}</p>
                <span className={cn("mx-auto grid size-11 place-items-center rounded-full border-4 border-white shadow-soft", reached ? "bg-teal text-white" : "bg-slate-200 text-slate-400")}>
                  <Medal size={22} />
                </span>
                <p className="mt-3 text-center text-xs font-black text-slate-400">{node.threshold === 0 ? "默认" : `${node.threshold} 道`}</p>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 text-sm font-semibold">
          <span className="text-slate-500">当前进度：{totalAttempts} 道</span>
          <span className="text-teal">{nextRule ? `距离${nextRule.label}还差 ${remaining} 道题` : "已获得最高勋章"}</span>
        </div>
      </div>
    </section>
  );
}

function nodeTransform(position: number) {
  if (position === 0) {
    return "translateX(0)";
  }
  if (position === 100) {
    return "translateX(-100%)";
  }
  return "translateX(-50%)";
}

function Message({ type, successText, errors = {} }: { type?: string; successText: string; errors?: Record<string, string> }) {
  if (type !== "updated") {
    const errorText = type ? errors[type] : null;
    return errorText ? <p className="rounded-2xl border border-coral/20 bg-coral/10 px-4 py-3 text-sm font-bold text-coral">{errorText}</p> : null;
  }

  return (
    <p className="flex items-center gap-2 rounded-2xl border border-teal/20 bg-teal/10 px-4 py-3 text-sm font-bold text-teal">
      <CheckCircle2 size={18} />
      {successText}
    </p>
  );
}

function Avatar({ name, color, image, size }: { name: string; color: string; image?: string; size: "md" | "lg" }) {
  const colorClass = avatarColors.find((item) => item.key === color)?.className || avatarColors[0].className;
  const sizeClass = size === "lg" ? "size-28 text-5xl font-black" : "size-24 text-4xl font-black";

  if (image) {
    return (
      <img
        alt={`${name} 的头像`}
        className={cn("shrink-0 rounded-full object-cover shadow-soft", sizeClass)}
        src={image}
      />
    );
  }

  return (
    <div
      className={cn(
        "grid shrink-0 place-items-center rounded-full text-white shadow-soft",
        colorClass,
        sizeClass
      )}
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

function formatDateTime(date: Date) {
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Shanghai"
  });
}

async function updateProfile(formData: FormData) {
  "use server";

  const user = await requireUser();
  const nicknameInput = String(formData.get("nickname") || "").trim();
  const nickname = nicknameInput.slice(0, 30) || user.username;
  const avatarColorInput = String(formData.get("avatarColor") || "green");
  const avatarColor = avatarColors.some((item) => item.key === avatarColorInput) ? avatarColorInput : "green";
  const genderInput = String(formData.get("gender") || "");
  const gender = genderInput === "male" || genderInput === "female" ? genderInput : null;
  const schoolInput = String(formData.get("school") || "").trim();
  const school = schoolInput ? schoolInput.slice(0, 80) : null;
  const avatarFile = formData.get("avatarImage");
  const avatarImage = await readAvatarImage(avatarFile);

  await prisma.studentProfile.upsert({
    where: { userId: user.id },
    update: {
      nickname,
      avatarColor,
      ...(avatarImage ? { avatarImage } : {}),
      gender,
      school
    },
    create: {
      userId: user.id,
      nickname,
      avatarColor,
      avatarImage,
      gender,
      school
    }
  });

  revalidatePath("/me");
  redirect("/me?profile=updated");
}

async function readAvatarImage(value: FormDataEntryValue | null) {
  if (!(value instanceof File) || value.size === 0) {
    return null;
  }

  if (value.size > avatarMaxBytes) {
    redirect("/me?profile=avatar_size");
  }

  if (!allowedAvatarTypes.has(value.type)) {
    redirect("/me?profile=avatar_type");
  }

  const bytes = Buffer.from(await value.arrayBuffer());
  return `data:${value.type};base64,${bytes.toString("base64")}`;
}

async function changePassword(formData: FormData) {
  "use server";

  const user = await requireUser();
  const currentPassword = String(formData.get("currentPassword") || "");
  const newPassword = String(formData.get("newPassword") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (newPassword.length < 6) {
    redirect("/me?password=short");
  }
  if (newPassword !== confirmPassword) {
    redirect("/me?password=mismatch");
  }

  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true }
  });

  if (!fullUser || !(await bcrypt.compare(currentPassword, fullUser.passwordHash))) {
    redirect("/me?password=invalid");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(newPassword, 12) }
  });

  revalidatePath("/me");
  redirect("/me?password=updated");
}
