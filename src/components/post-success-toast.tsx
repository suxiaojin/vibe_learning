"use client";

import { CheckCircle2, X } from "lucide-react";
import { useEffect, useState } from "react";

const postSentEvent = "buddy-post-sent";

export function notifyBuddyPostSent() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(postSentEvent));
  }
}

export function PostSuccessToast() {
  const [toastId, setToastId] = useState(0);

  useEffect(() => {
    const showToast = () => setToastId((current) => current + 1);
    window.addEventListener(postSentEvent, showToast);
    return () => window.removeEventListener(postSentEvent, showToast);
  }, []);

  useEffect(() => {
    if (!toastId) {
      return;
    }
    const timer = window.setTimeout(() => setToastId(0), 3000);
    return () => window.clearTimeout(timer);
  }, [toastId]);

  if (!toastId) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[90] flex justify-center px-4" role="status" aria-live="polite">
      <div className="pointer-events-auto flex min-h-12 items-center gap-3 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm font-black text-emerald-700 shadow-[0_12px_32px_rgba(15,23,42,0.18)]">
        <CheckCircle2 className="shrink-0" size={20} />
        <span>帖子发送成功，快去看看吧</span>
        <button
          aria-label="关闭提示"
          className="grid size-7 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          type="button"
          onClick={() => setToastId(0)}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

export function PostSuccessNoticeTrigger({ active }: { active: boolean }) {
  useEffect(() => {
    if (!active) {
      return;
    }

    const timer = window.setTimeout(() => {
      notifyBuddyPostSent();
      const url = new URL(window.location.href);
      url.searchParams.delete("notice");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [active]);

  return null;
}
