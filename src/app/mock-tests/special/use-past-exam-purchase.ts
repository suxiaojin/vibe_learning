"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PastExamOffer } from "@/lib/past-exam-purchase";

export function usePastExamPurchase(paper: { id: string; title: string; diamondPrice: number; purchased: boolean }, courseKey: string, henanEnglish: boolean) {
  const router = useRouter();
  const busy = useRef(false);
  const [offer, setOffer] = useState(paper);
  const [confirmation, setConfirmation] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  function open() {
    if (busy.current) return;
    setError("");
    if (offer.diamondPrice > 0 && !offer.purchased) setConfirmation(true);
    else void submit(false);
  }
  function close() {
    if (busy.current) return;
    setConfirmation(false);
    setError("");
  }
  async function submit(confirmed: boolean) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/mock-tests/past/${encodeURIComponent(paper.id)}/purchase`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseKey,
          entry: henanEnglish ? "henan_english" : undefined,
          expectedDiamondPrice: offer.diamondPrice,
          confirmed
        })
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; data?: { offer?: PastExamOffer }; error?: { code?: string; message?: string } } | null;
      const next = payload?.data?.offer;
      if (response.status === 409 && next) {
        setOffer(next);
        setConfirmation(next.requiresPurchase);
      }
      if (!response.ok || !payload?.ok || !next) throw new Error(payload?.error?.message || "题库打开失败，请稍后重试。");
      setOffer(next);
      setConfirmation(false);
      router.push(next.href);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "题库打开失败，请稍后重试。");
    } finally { busy.current = false; setPending(false); }
  }
  return { open, offer, pending, dialogProps: {
    error, pending, onClose: close,
    confirmation: confirmation ? { title: offer.title, diamondPrice: offer.diamondPrice, onConfirm: () => { void submit(true); } } : undefined
  } };
}
