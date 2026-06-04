"use client";

import {
  Bold,
  Eraser,
  ImagePlus,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Pilcrow,
  Type,
  Underline
} from "lucide-react";
import type { ChangeEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { notificationHtmlMaxChars, notificationImageMaxBytes } from "@/lib/notifications";

type RichTextEditorProps = {
  initialHtml?: string;
  minHeightClassName?: string;
  name: string;
};

const fontOptions = [
  { label: "默认字体", value: "" },
  { label: "微软雅黑", value: "Microsoft YaHei" },
  { label: "宋体", value: "SimSun" },
  { label: "黑体", value: "SimHei" },
  { label: "楷体", value: "KaiTi" },
  { label: "Arial", value: "Arial" }
];
const fontSizeOptions = [
  { label: "12", value: "2" },
  { label: "14", value: "3" },
  { label: "18", value: "4" },
  { label: "24", value: "5" },
  { label: "32", value: "6" }
];
const allowedImageTypes = new Set(["image/gif", "image/jpeg", "image/png", "image/webp"]);

export function RichTextEditor({
  initialHtml = "<p><br></p>",
  minHeightClassName = "min-h-[320px]",
  name
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const [error, setError] = useState("");
  const [html, setHtml] = useState(initialHtml);

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = initialHtml;
      setHtml(initialHtml);
    }
  }, [initialHtml]);

  function rememberSelection() {
    const selection = window.getSelection();
    const editor = editorRef.current;
    if (!selection || !editor || selection.rangeCount === 0 || !editor.contains(selection.anchorNode)) {
      return;
    }
    savedRangeRef.current = selection.getRangeAt(0).cloneRange();
  }

  function restoreSelection() {
    const selection = window.getSelection();
    const range = savedRangeRef.current;
    if (!selection || !range) {
      return;
    }
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function syncValue() {
    const nextHtml = editorRef.current?.innerHTML || "";
    setHtml(nextHtml);
    setError(nextHtml.length > notificationHtmlMaxChars ? "通知内容过大，请减少图片或文字后再保存。" : "");
    rememberSelection();
  }

  function runCommand(command: string, value?: string) {
    editorRef.current?.focus();
    restoreSelection();
    document.execCommand(command, false, value);
    syncValue();
  }

  function createLink() {
    const href = window.prompt("输入链接地址");
    if (href) {
      runCommand("createLink", href);
    }
  }

  function openImagePicker() {
    rememberSelection();
    imageInputRef.current?.click();
  }

  function insertImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    if (!allowedImageTypes.has(file.type)) {
      setError("仅支持 PNG、JPG、WEBP 或 GIF 图片。");
      return;
    }
    if (file.size > notificationImageMaxBytes) {
      setError("单张图片不能超过 2MB。");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result || "");
      const editor = editorRef.current;
      if (!editor || html.length + src.length > notificationHtmlMaxChars) {
        setError("通知内容过大，请减少图片或文字后再插入。");
        return;
      }

      editor.focus();
      restoreSelection();
      const image = document.createElement("img");
      image.alt = file.name;
      image.src = src;
      image.style.height = "auto";
      image.style.maxWidth = "100%";

      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0 && editor.contains(selection.anchorNode)) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        range.insertNode(image);
        range.setStartAfter(image);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      } else {
        editor.append(image);
      }
      setError("");
      syncValue();
    };
    reader.readAsDataURL(file);
  }

  return (
    <div>
      <div className="overflow-hidden border border-slate-200 bg-white focus-within:border-teal focus-within:ring-2 focus-within:ring-teal/10">
        <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 p-2">
          <select
            aria-label="段落样式"
            className="h-9 border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-700 outline-none focus:border-teal"
            defaultValue="p"
            onChange={(event) => runCommand("formatBlock", event.target.value)}
            onMouseDown={rememberSelection}
          >
            <option value="p">正文</option>
            <option value="h2">标题</option>
            <option value="h3">小标题</option>
            <option value="blockquote">引用</option>
          </select>
          <select
            aria-label="字体"
            className="h-9 border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-700 outline-none focus:border-teal"
            defaultValue=""
            onChange={(event) => event.target.value && runCommand("fontName", event.target.value)}
            onMouseDown={rememberSelection}
          >
            {fontOptions.map((option) => <option key={option.label} value={option.value}>{option.label}</option>)}
          </select>
          <select
            aria-label="字号"
            className="h-9 border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-700 outline-none focus:border-teal"
            defaultValue="3"
            onChange={(event) => runCommand("fontSize", event.target.value)}
            onMouseDown={rememberSelection}
          >
            {fontSizeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}px</option>)}
          </select>
          <ToolbarButton icon={<Bold size={18} />} label="加粗" onClick={() => runCommand("bold")} />
          <ToolbarButton icon={<Italic size={18} />} label="斜体" onClick={() => runCommand("italic")} />
          <ToolbarButton icon={<Underline size={18} />} label="下划线" onClick={() => runCommand("underline")} />
          <ToolbarButton icon={<List size={18} />} label="无序列表" onClick={() => runCommand("insertUnorderedList")} />
          <ToolbarButton icon={<ListOrdered size={18} />} label="有序列表" onClick={() => runCommand("insertOrderedList")} />
          <ToolbarButton icon={<LinkIcon size={18} />} label="插入链接" onClick={createLink} />
          <ToolbarButton icon={<ImagePlus size={18} />} label="插入图片" onClick={openImagePicker} />
          <label className="grid size-9 cursor-pointer place-items-center border border-transparent text-slate-600 transition hover:border-slate-200 hover:bg-white" title="文字颜色">
            <span className="sr-only">文字颜色</span>
            <input
              aria-label="文字颜色"
              className="size-6 cursor-pointer border-0 bg-transparent p-0"
              defaultValue="#18202f"
              onChange={(event) => runCommand("foreColor", event.target.value)}
              onMouseDown={rememberSelection}
              type="color"
            />
          </label>
          <ToolbarButton icon={<Type size={18} />} label="引用" onClick={() => runCommand("formatBlock", "blockquote")} />
          <ToolbarButton icon={<Eraser size={18} />} label="清除格式" onClick={() => runCommand("removeFormat")} />
          <ToolbarButton icon={<Pilcrow size={18} />} label="正文段落" onClick={() => runCommand("formatBlock", "p")} />
          <input
            ref={imageInputRef}
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="sr-only"
            onChange={insertImage}
            type="file"
          />
        </div>
        <div
          ref={editorRef}
          aria-label="通知内容"
          className={`${minHeightClassName} cursor-text px-4 py-3 text-sm leading-7 text-slate-800 outline-none [&_a]:font-semibold [&_a]:text-teal [&_blockquote]:border-l-4 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_h2]:text-xl [&_h2]:font-black [&_h3]:text-lg [&_h3]:font-black [&_img]:my-3 [&_img]:h-auto [&_img]:max-w-full [&_li]:ml-5 [&_ol]:list-decimal [&_p]:my-2 [&_ul]:list-disc`}
          contentEditable
          onBlur={syncValue}
          onInput={syncValue}
          onKeyUp={rememberSelection}
          onMouseUp={rememberSelection}
          role="textbox"
          suppressContentEditableWarning
          tabIndex={0}
        />
        <input name={name} readOnly type="hidden" value={html} />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold">
        <p className={error ? "text-red-600" : "text-slate-500"}>
          {error || "支持富文本、链接和图片；单张图片不超过 2MB。"}
        </p>
        <p className="text-slate-400">{Math.ceil(html.length / 1024)} KB / {Math.ceil(notificationHtmlMaxChars / 1024 / 1024)} MB</p>
      </div>
    </div>
  );
}

function ToolbarButton({
  icon,
  label,
  onClick
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="grid size-9 place-items-center border border-transparent text-slate-600 transition hover:border-slate-200 hover:bg-white hover:text-teal focus:outline-none focus:ring-2 focus:ring-teal/20"
      onClick={onClick}
      onMouseDown={(event) => event.preventDefault()}
      title={label}
      type="button"
    >
      {icon}
    </button>
  );
}
