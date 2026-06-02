"use client";

import { Bold, Eraser, Italic, Link as LinkIcon, List, ListOrdered, Pilcrow, Type, Underline } from "lucide-react";
import type { ReactNode } from "react";
import { useRef, useState } from "react";

type RichTextEditorProps = {
  initialHtml?: string;
  name: string;
};

export function RichTextEditor({ initialHtml = "<p><br></p>", name }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState(initialHtml);

  function syncValue() {
    setHtml(editorRef.current?.innerHTML || "");
  }

  function runCommand(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    syncValue();
  }

  function createLink() {
    const href = window.prompt("输入链接地址");
    if (!href) {
      return;
    }
    runCommand("createLink", href);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 p-2">
        <select
          aria-label="段落样式"
          className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-700 outline-none focus:border-teal"
          defaultValue="p"
          onChange={(event) => runCommand("formatBlock", event.target.value)}
        >
          <option value="p">正文</option>
          <option value="h2">标题</option>
          <option value="h3">小标题</option>
        </select>
        <ToolbarButton icon={<Bold size={18} />} label="加粗" onClick={() => runCommand("bold")} />
        <ToolbarButton icon={<Italic size={18} />} label="斜体" onClick={() => runCommand("italic")} />
        <ToolbarButton icon={<Underline size={18} />} label="下划线" onClick={() => runCommand("underline")} />
        <ToolbarButton icon={<List size={18} />} label="无序列表" onClick={() => runCommand("insertUnorderedList")} />
        <ToolbarButton icon={<ListOrdered size={18} />} label="有序列表" onClick={() => runCommand("insertOrderedList")} />
        <ToolbarButton icon={<LinkIcon size={18} />} label="插入链接" onClick={createLink} />
        <ToolbarButton icon={<Type size={18} />} label="引用" onClick={() => runCommand("formatBlock", "blockquote")} />
        <ToolbarButton icon={<Eraser size={18} />} label="清除格式" onClick={() => runCommand("removeFormat")} />
        <ToolbarButton icon={<Pilcrow size={18} />} label="正文段落" onClick={() => runCommand("formatBlock", "p")} />
      </div>
      <div
        ref={editorRef}
        className="min-h-[220px] px-4 py-3 text-sm leading-7 text-slate-800 outline-none [&_a]:font-semibold [&_a]:text-teal [&_blockquote]:border-l-4 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_h2]:text-xl [&_h2]:font-black [&_h3]:text-lg [&_h3]:font-black [&_li]:ml-5 [&_ol]:list-decimal [&_p]:my-2 [&_ul]:list-disc"
        contentEditable
        dangerouslySetInnerHTML={{ __html: initialHtml }}
        onBlur={syncValue}
        onInput={syncValue}
        suppressContentEditableWarning
      />
      <input name={name} readOnly type="hidden" value={html} />
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
      className="grid size-9 place-items-center rounded-lg border border-transparent text-slate-600 transition hover:border-slate-200 hover:bg-white hover:text-teal focus:outline-none focus:ring-2 focus:ring-teal/20"
      onClick={onClick}
      title={label}
      type="button"
    >
      {icon}
    </button>
  );
}
