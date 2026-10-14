"use client";

import { useEffect } from "react";

export function ChangelogReadMarker({
  action,
  readThroughAt
}: {
  action: (readThroughAt: string) => Promise<void>;
  readThroughAt: string;
}) {
  useEffect(() => {
    void action(readThroughAt).catch(() => undefined);
  }, [action, readThroughAt]);

  return null;
}
