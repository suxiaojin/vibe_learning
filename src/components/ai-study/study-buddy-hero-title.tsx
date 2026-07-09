"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { normalizeStudyBuddyHeroEffect } from "@/lib/study-buddy-title-effects";
import { cn } from "@/lib/utils";

type StudyBuddyHeroTitleProps = {
  text: string;
  effect?: string | null;
  className?: string;
  speedMs?: number;
  startDelayMs?: number;
};

const baseTitleClass = "study-buddy-hero-title text-[30px] font-black leading-tight tracking-normal text-[#06122b] md:text-[34px]";

export function StudyBuddyHeroTitle({
  text,
  effect,
  className,
  speedMs = 105,
  startDelayMs = 180
}: StudyBuddyHeroTitleProps) {
  const resolvedEffect = normalizeStudyBuddyHeroEffect(effect);
  const safeSpeedMs = Number.isFinite(speedMs) ? Math.min(300, Math.max(40, Math.round(speedMs))) : 105;

  if (resolvedEffect === "typewriter") {
    return (
      <TypewriterHeading
        key={`${text}-${safeSpeedMs}`}
        className={className}
        speedMs={safeSpeedMs}
        startDelayMs={startDelayMs}
        text={text}
      />
    );
  }

  if (resolvedEffect === "character-pop") {
    return <CharacterPopHeading className={className} text={text} />;
  }

  return (
    <h1 className={cn(baseTitleClass, `study-buddy-hero-title--${resolvedEffect}`, className)}>
      <span className="study-buddy-hero-title__text">{text}</span>
    </h1>
  );
}

function TypewriterHeading({
  text,
  className,
  speedMs,
  startDelayMs
}: Required<Pick<StudyBuddyHeroTitleProps, "text" | "speedMs" | "startDelayMs">> & {
  className?: string;
}) {
  const characters = useMemo(() => Array.from(text), [text]);
  const [visibleCount, setVisibleCount] = useState(0);
  const [showCaret, setShowCaret] = useState(true);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion || characters.length === 0) {
      setVisibleCount(characters.length);
      setShowCaret(false);
      return;
    }

    let intervalId: number | null = null;
    let nextCount = 0;
    setVisibleCount(0);
    setShowCaret(true);

    const timeoutId = window.setTimeout(() => {
      intervalId = window.setInterval(() => {
        nextCount += 1;
        setVisibleCount(nextCount);
        if (nextCount >= characters.length && intervalId) {
          window.clearInterval(intervalId);
          intervalId = null;
        }
      }, speedMs);
    }, startDelayMs);

    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, [characters.length, speedMs, startDelayMs]);

  const visibleText = characters.slice(0, visibleCount).join("");

  return (
    <h1 aria-label={text} className={cn(baseTitleClass, "study-buddy-hero-title--typewriter", className)}>
      <span className="relative inline-block align-bottom">
        <span aria-hidden="true" className="invisible">
          {text}
        </span>
        <span aria-hidden="true" className="absolute left-0 top-0 whitespace-nowrap">
          {visibleText}
          {showCaret ? (
            <span className="ml-1 inline-block h-[0.9em] w-[3px] translate-y-[0.12em] rounded-full bg-[#06122b] animate-pulse motion-reduce:hidden" />
          ) : null}
        </span>
      </span>
    </h1>
  );
}

function CharacterPopHeading({ text, className }: Pick<StudyBuddyHeroTitleProps, "text" | "className">) {
  const characters = useMemo(() => Array.from(text), [text]);

  return (
    <h1 aria-label={text} className={cn(baseTitleClass, "study-buddy-hero-title--character-pop", className)}>
      {characters.map((character, index) => (
        <span
          aria-hidden="true"
          className="study-buddy-hero-title__char"
          key={`${character}-${index}`}
          style={{ "--title-char-index": index } as CSSProperties}
        >
          {character === " " ? "\u00A0" : character}
        </span>
      ))}
    </h1>
  );
}
