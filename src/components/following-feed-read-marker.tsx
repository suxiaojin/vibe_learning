"use client";

import { useEffect } from "react";

export function FollowingFeedReadMarker({
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
