"use client";

import { Download, ImageDown, Loader2, X } from "lucide-react";
import { useRef, useState } from "react";
import type { BuddyActiveLearningDay } from "@/lib/buddy-share-cards";

type ActivityStat = {
  label: string;
  value: string;
};

type PreviewStatus = "idle" | "rendering" | "ready" | "saved" | "error";

const canvasWidth = 1120;
const canvasHeight = 700;
const heatmapColors = ["#e5e7eb", "#dbeafe", "#bfdbfe", "#7fb0ff", "#3b82f6"];
const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function SaveLearningActivityImageButton({
  avatarColor,
  avatarImage,
  nickname,
  stats,
  username,
  weeks
}: {
  avatarColor: string;
  avatarImage: string;
  nickname: string;
  stats: ActivityStat[];
  username: string;
  weeks: BuddyActiveLearningDay[][];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [status, setStatus] = useState<PreviewStatus>("idle");

  async function renderPreview() {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    setStatus("rendering");
    try {
      await drawLearningActivityImage(canvas, {
        avatarColor,
        avatarImage,
        nickname,
        stats: stats.slice(0, 5),
        username,
        weeks: weeks.slice(-40)
      });
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  function openPreview() {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    dialog.showModal();
    window.requestAnimationFrame(() => {
      void renderPreview();
    });
  }

  function closePreview() {
    dialogRef.current?.close();
  }

  function downloadImage() {
    const canvas = canvasRef.current;
    if (!canvas || status === "rendering") {
      return;
    }

    canvas.toBlob((blob) => {
      if (!blob) {
        setStatus("error");
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `VibeLearning-${getLocalDateKey()}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus("saved");
    }, "image/png");
  }

  return (
    <>
      <button
        className="inline-flex min-h-11 items-center gap-1.5 px-2 text-sm font-medium text-slate-600 transition hover:text-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/30"
        type="button"
        onClick={openPreview}
      >
        <ImageDown size={16} />
        保存图片
      </button>

      <dialog
        ref={dialogRef}
        aria-label="保存学习活跃度图片"
        className="m-auto max-h-[96dvh] w-[min(96vw,760px)] overflow-y-auto rounded-[28px] bg-slate-100 p-4 shadow-[0_24px_80px_rgba(15,23,42,0.28)] backdrop:bg-ink/40 sm:p-6"
        onCancel={() => setStatus("idle")}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            closePreview();
          }
        }}
      >
        <div className="mx-auto w-full max-w-[640px]" onClick={(event) => event.stopPropagation()}>
          <div className="mb-3 flex items-center justify-between px-1">
            <button
              aria-label="关闭预览"
              className="grid size-11 place-items-center rounded-full bg-white text-slate-600 shadow-sm transition hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/30"
              type="button"
              onClick={closePreview}
            >
              <X size={20} />
            </button>
            <button
              aria-label="下载学习活跃度图片"
              className="grid size-11 place-items-center rounded-full bg-ink text-white shadow-sm transition hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 disabled:cursor-wait disabled:bg-slate-400"
              disabled={status !== "ready" && status !== "saved"}
              title="下载图片"
              type="button"
              onClick={downloadImage}
            >
              {status === "rendering" ? <Loader2 className="animate-spin" size={20} /> : <Download size={20} />}
            </button>
          </div>

          <div className="relative overflow-hidden rounded-[24px]">
            <canvas
              ref={canvasRef}
              aria-label="学习活跃度图片预览，包含用户信息、近40周答题热力图和五项学习数据"
              className="block h-auto w-full"
              height={canvasHeight}
              role="img"
              width={canvasWidth}
            />
            {status === "rendering" ? (
              <div className="absolute inset-0 grid place-items-center bg-white/65 text-sm font-semibold text-slate-500">正在生成预览…</div>
            ) : null}
          </div>

          {status === "error" ? (
            <div className="mt-3 flex items-center justify-center gap-3 text-sm font-semibold text-coral">
              图片生成失败
              <button className="min-h-10 rounded-full border border-coral/30 px-4 hover:bg-coral/5" type="button" onClick={() => void renderPreview()}>
                重新生成
              </button>
            </div>
          ) : null}
          <p aria-live="polite" className="sr-only">{status === "saved" ? "图片已保存到电脑" : ""}</p>
        </div>
      </dialog>
    </>
  );
}

async function drawLearningActivityImage(
  canvas: HTMLCanvasElement,
  data: {
    avatarColor: string;
    avatarImage: string;
    nickname: string;
    stats: ActivityStat[];
    username: string;
    weeks: BuddyActiveLearningDay[][];
  }
) {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("CANVAS_UNAVAILABLE");
  }

  context.clearRect(0, 0, canvasWidth, canvasHeight);
  context.fillStyle = "#f6f7f8";
  context.fillRect(0, 0, canvasWidth, canvasHeight);

  context.save();
  context.shadowColor = "rgba(15, 23, 42, 0.14)";
  context.shadowBlur = 42;
  context.shadowOffsetY = 18;
  roundedRect(context, 50, 48, 1020, 604, 56);
  context.fillStyle = "#ffffff";
  context.fill();
  context.restore();

  await drawAvatar(context, {
    color: resolveAvatarColor(data.avatarColor),
    image: data.avatarImage,
    name: data.nickname,
    radius: 52,
    x: 124,
    y: 142
  });

  context.textAlign = "left";
  context.textBaseline = "middle";
  context.fillStyle = "#111827";
  context.font = getCanvasFont(32, 700);
  context.fillText(data.nickname, 198, 128, 500);
  context.fillStyle = "#64748b";
  context.font = getCanvasFont(22, 500);
  context.fillText(`@${data.username}`, 198, 164, 500);

  context.textAlign = "right";
  context.fillStyle = "#1f9d8a";
  context.font = getCanvasFont(29, 700);
  context.fillText("Vibe Learning", 1010, 142);

  drawHeatmap(context, data.weeks, 104, 238, 912);
  drawStats(context, data.stats, 74, 510, 972);
}

async function drawAvatar(
  context: CanvasRenderingContext2D,
  avatar: { color: string; image: string; name: string; radius: number; x: number; y: number }
) {
  context.save();
  context.beginPath();
  context.arc(avatar.x, avatar.y, avatar.radius, 0, Math.PI * 2);
  context.clip();
  context.fillStyle = avatar.color;
  context.fillRect(avatar.x - avatar.radius, avatar.y - avatar.radius, avatar.radius * 2, avatar.radius * 2);

  if (avatar.image) {
    try {
      const image = await loadImage(avatar.image);
      const diameter = avatar.radius * 2;
      const scale = Math.max(diameter / image.naturalWidth, diameter / image.naturalHeight);
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      context.drawImage(image, avatar.x - width / 2, avatar.y - height / 2, width, height);
      context.restore();
      return;
    } catch {
      // Fall through to the initials avatar when an old image URL is unavailable.
    }
  }

  context.fillStyle = "#ffffff";
  context.font = getCanvasFont(36, 500);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(getInitials(avatar.name), avatar.x, avatar.y + 1);
  context.restore();
}

function drawHeatmap(context: CanvasRenderingContext2D, weeks: BuddyActiveLearningDay[][], x: number, y: number, width: number) {
  const visibleWeeks = weeks.slice(-40);
  const columnGap = 6;
  const rowGap = 6;
  const cellSize = Math.min(17, (width - Math.max(0, visibleWeeks.length - 1) * columnGap) / Math.max(1, visibleWeeks.length));
  const gridWidth = visibleWeeks.length * cellSize + Math.max(0, visibleWeeks.length - 1) * columnGap;
  const startX = x + (width - gridWidth) / 2;

  visibleWeeks.forEach((week, weekIndex) => {
    week.slice(0, 7).forEach((day, dayIndex) => {
      if (day.future) {
        return;
      }
      const cellX = startX + weekIndex * (cellSize + columnGap);
      const cellY = y + dayIndex * (cellSize + rowGap);
      roundedRect(context, cellX, cellY, cellSize, cellSize, Math.max(3, cellSize * 0.22));
      context.fillStyle = heatmapColors[day.level] || heatmapColors[0];
      context.fill();
    });
  });

  const gridHeight = 7 * cellSize + 6 * rowGap;
  context.fillStyle = "#94a3b8";
  context.font = getCanvasFont(18, 600);
  context.textAlign = "left";
  context.textBaseline = "top";
  visibleWeeks.forEach((week, weekIndex) => {
    const monthLabel = getHeatmapMonthLabel(week, weekIndex);
    if (monthLabel) {
      context.fillText(monthLabel, startX + weekIndex * (cellSize + columnGap), y + gridHeight + 20);
    }
  });
}

function getHeatmapMonthLabel(week: BuddyActiveLearningDay[], weekIndex: number) {
  const labeledDay = week.find((day) => day.key && new Date(`${day.key}T00:00:00Z`).getUTCDate() === 1)
    || (weekIndex === 0 ? week.find((day) => day.key) : undefined);

  if (!labeledDay?.key) {
    return "";
  }

  return monthLabels[new Date(`${labeledDay.key}T00:00:00Z`).getUTCMonth()] || "";
}

function drawStats(context: CanvasRenderingContext2D, stats: ActivityStat[], x: number, y: number, width: number) {
  const items = stats.slice(0, 5);
  const itemWidth = width / Math.max(1, items.length);

  items.forEach((item, index) => {
    const centerX = x + itemWidth * index + itemWidth / 2;
    if (index > 0) {
      context.beginPath();
      context.moveTo(x + itemWidth * index, y + 4);
      context.lineTo(x + itemWidth * index, y + 104);
      context.strokeStyle = "#e5e7eb";
      context.lineWidth = 2;
      context.stroke();
    }

    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = "#111827";
    context.font = getCanvasFont(29, 600);
    context.fillText(item.value, centerX, y + 34, itemWidth - 20);
    context.fillStyle = "#6b7280";
    context.font = getCanvasFont(20, 500);
    context.fillText(item.label, centerX, y + 78, itemWidth - 18);
  });
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

async function loadImage(src: string) {
  const response = await fetch(src, { cache: "no-store", credentials: "include" });
  if (!response.ok) {
    throw new Error("AVATAR_LOAD_FAILED");
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("AVATAR_DECODE_FAILED"));
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function resolveAvatarColor(className: string) {
  if (className.includes("sky")) return "#0ea5e9";
  if (className.includes("coral")) return "#f97363";
  if (className.includes("honey")) return "#f59e0b";
  if (className.includes("violet")) return "#8b5cf6";
  return "#1f9d8a";
}

function getInitials(name: string) {
  return Array.from(name.trim()).slice(0, 2).join("").toUpperCase() || "VL";
}

function getCanvasFont(size: number, weight: number) {
  return `${weight} ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif`;
}

function getLocalDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
