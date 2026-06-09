"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";

export function AutoDismissMessage({
  children,
  className,
  duration = 3000
}: {
  children: ReactNode;
  className: string;
  duration?: number;
}) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), duration);
    return () => window.clearTimeout(timer);
  }, [duration]);

  if (!visible) {
    return null;
  }

  return <p className={className}>{children}</p>;
}
