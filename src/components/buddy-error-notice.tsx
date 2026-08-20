"use client";

import { useEffect, useState } from "react";

export function BuddyErrorNotice({ code, message }: { code: string; message: string }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(true);
    const timeoutId = window.setTimeout(() => {
      setVisible(false);
      const url = new URL(window.location.href);
      if (url.searchParams.get("error") === code) {
        url.searchParams.delete("error");
        window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
      }
    }, 4000);

    return () => window.clearTimeout(timeoutId);
  }, [code]);

  if (!visible) {
    return null;
  }

  return (
    <p className="rounded-2xl bg-coral/10 px-4 py-3 text-sm font-semibold text-coral" role="alert">
      {message}
    </p>
  );
}
