import Link from "next/link";
import { BookOpenCheck, LayoutDashboard, LogOut } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";

export async function Nav() {
  const user = await getCurrentUser();

  if (user?.role === "student") {
    return null;
  }

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href={user?.role === "admin" ? "/admin" : "/learn"} className="flex items-center gap-2 font-semibold text-ink">
          <span className="grid size-9 place-items-center rounded-xl bg-teal text-white">
            <BookOpenCheck size={20} />
          </span>
          Vibe Learning
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          {user?.role === "admin" ? (
            <Link className="nav-link" href="/admin">
              <LayoutDashboard size={16} />
              后台
            </Link>
          ) : null}
          {user ? (
            <form action="/api/auth/logout" method="post">
              <button className="icon-button" title="退出登录" type="submit">
                <LogOut size={18} />
              </button>
            </form>
          ) : (
            <Link className="primary-button" href="/login">登录</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
