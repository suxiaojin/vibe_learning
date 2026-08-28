"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ProjectDiamondPriceKind } from "@/lib/project-diamond-price";
import type { StudyProjectOffer } from "@/lib/study-project-access";

export function useProjectPurchase(input: {
  kind: ProjectDiamondPriceKind;
  id: string;
  title: string;
  diamondPrice: number;
  purchased?: boolean;
  owned?: boolean;
}) {
  const router = useRouter();
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [title, setTitle] = useState(input.title);
  const [diamondPrice, setDiamondPrice] = useState(input.diamondPrice);
  const [purchased, setPurchased] = useState(Boolean(input.purchased));

  useEffect(() => {
    setTitle(input.title);
    setDiamondPrice(input.diamondPrice);
    setPurchased(Boolean(input.purchased));
  }, [input.id, input.title, input.diamondPrice, input.purchased]);

  function open() {
    if (inFlight.current) return;
    setError("");
    if (diamondPrice > 0 && !purchased && !input.owned) {
      setConfirmationOpen(true);
      return;
    }
    void submitPurchase(false);
  }

  function dismiss() {
    if (inFlight.current) return;
    setConfirmationOpen(false);
    setError("");
  }

  function confirmPurchase() {
    if (confirmationOpen) void submitPurchase(true);
  }

  async function submitPurchase(confirmed: boolean) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/study-buddy/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: input.kind, id: input.id, expectedDiamondPrice: diamondPrice, confirmed })
      });
      const payload = await response.json().catch(() => null) as {
        ok?: boolean;
        data?: { offer?: StudyProjectOffer };
        error?: { code?: string; message?: string };
      } | null;
      const offer = payload?.data?.offer;
      if (response.status === 409 && offer &&
          (payload?.error?.code === "STUDY_PROJECT_PRICE_CHANGED" || payload?.error?.code === "STUDY_PROJECT_CONFIRMATION_REQUIRED")) {
        setTitle(offer.title);
        setDiamondPrice(offer.diamondPrice);
        setPurchased(offer.purchased);
        setConfirmationOpen(offer.requiresPurchase);
      }
      if (!response.ok || !payload?.ok || !offer) {
        throw new Error(payload?.error?.message || "项目打开失败，请稍后重试。");
      }
      setDiamondPrice(offer.diamondPrice);
      setPurchased(offer.purchased);
      setConfirmationOpen(false);
      // Refresh also replaces a direct-link purchase gate at the same URL.
      router.push(offer.href);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "项目打开失败，请稍后重试。");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return {
    open, pending, diamondPrice, purchased,
    dialogProps: {
      error,
      pending,
      onClose: dismiss,
      confirmation: confirmationOpen ? { title, diamondPrice, onConfirm: confirmPurchase } : undefined
    }
  };
}
