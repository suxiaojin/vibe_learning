"use client";

import { type ChangeEvent, type DragEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronRight, FileText, Info, X } from "lucide-react";

const maxPdfBytes = 20 * 1024 * 1024;

type ApiEnvelope<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error?: {
        code?: string;
        message?: string;
      };
    };

type CreateProjectResponse = {
  project: {
    id: string;
  };
};

type UploadedFile = {
  id: string;
  name: string;
};

type SelectedFile = {
  id: string;
  file: File;
  name: string;
  size: number;
};

export function StudyMaterialImporter() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [error, setError] = useState("");

  function openModal() {
    setError("");
    setIsOpen(true);
  }

  function closeModal() {
    if (isUploading) {
      return;
    }
    setIsOpen(false);
    setIsDragging(false);
    setError("");
    setSelectedFiles([]);
  }

  function openFilePicker() {
    if (isUploading) {
      return;
    }
    fileInputRef.current?.click();
  }

  async function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    selectFiles(event.target.files);
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    selectFiles(event.dataTransfer.files);
  }

  function selectFiles(fileList: FileList | null) {
    const files = Array.from(fileList || []);
    if (files.length === 0 || isUploading) {
      return;
    }

    const nextFiles: SelectedFile[] = [];
    for (const file of files) {
      const validationError = validatePdfFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }
      nextFiles.push({
        id: `${file.name}-${file.size}-${file.lastModified}`,
        file,
        name: file.name,
        size: file.size
      });
    }

    setSelectedFiles(nextFiles.slice(0, 1));
    setError(files.length > 1 ? "当前阶段一次只能创建 1 个 PDF 项目，已选中第一个文件。" : "");
  }

  async function createProject() {
    if (selectedFiles.length === 0 || isUploading) {
      return;
    }

    setIsUploading(true);
    setError("");

    try {
      const created = await uploadOneFile(selectedFiles[0].file);
      setUploadedFiles((current) => [{ id: created.projectId, name: selectedFiles[0].name }, ...current]);
      setSelectedFiles([]);
      setIsOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "创建项目失败，请稍后重试。");
    } finally {
      setIsUploading(false);
    }
  }

  async function uploadOneFile(file: File) {
    const validationError = validatePdfFile(file);
    if (validationError) {
      throw new Error(validationError);
    }

    let projectId = "";
    const title = file.name.replace(/\.[^.]+$/, "").trim() || "未命名学习资料";

    try {
      const created = await postJson<CreateProjectResponse>("/api/ai-study/projects", {
        title,
        sourceType: "pdf",
        learningGoal: "review"
      });
      projectId = created.project.id;

      const uploadForm = new FormData();
      uploadForm.set("file", file);
      await postForm(`/api/ai-study/projects/${projectId}/sources`, uploadForm);

      return { projectId };
    } catch (caught) {
      if (projectId) {
        await fetch(`/api/ai-study/projects/${projectId}`, { method: "DELETE" }).catch(() => null);
      }
      throw caught;
    }
  }

  return (
    <>
      <button
        className="inline-flex h-10 items-center gap-2 rounded-[11px] bg-[linear-gradient(112deg,#101319_0%,#101319_45%,#0f4a22_100%)] px-5 text-[15px] font-extrabold text-white shadow-[0_10px_22px_rgba(15,74,34,0.18)] transition hover:translate-y-[-1px] hover:shadow-[0_14px_28px_rgba(15,74,34,0.22)]"
        onClick={openModal}
        type="button"
      >
        导入学习资料
        <ChevronRight size={17} strokeWidth={3} />
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-[30px]">
          <div className="w-full max-w-[792px] rounded-[16px] bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,0.24)] md:p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-[24px] font-black tracking-normal text-[#101828]">上传项目资料</h2>
              <button
                className="grid size-9 place-items-center rounded-full text-[#111827] transition hover:bg-[#f2f4f7]"
                disabled={isUploading}
                onClick={closeModal}
                title="关闭"
                type="button"
              >
                <X size={21} strokeWidth={2.3} />
              </button>
            </div>

            <div
              className={`mt-6 cursor-pointer rounded-[12px] border border-dashed px-6 py-8 text-center outline-none transition focus:ring-2 focus:ring-[#9ee7b4]/60 ${
                isDragging
                  ? "border-[#22c55e] bg-[#f4fff6]"
                  : "border-[#d7e3dd] bg-[linear-gradient(100deg,#fbfff2_0%,#f9fff7_38%,#f1fdff_100%)]"
              }`}
              onClick={openFilePicker}
              onDragLeave={() => setIsDragging(false)}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDrop={handleDrop}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openFilePicker();
                }
              }}
              role="button"
              tabIndex={0}
            >
              <img alt="" className="mx-auto h-8 w-11 object-contain" height={32} src="/ai-study/upload-books.png" width={44} />
              <p className="mt-2 text-[16px] font-black text-[#111827]">拖放或点击此处上传本地文件</p>
              <p className="mt-3 text-[12px] font-medium text-[#98a2b3]">当前支持 PDF，单个文件不超过20M</p>
              <input
                ref={fileInputRef}
                className="hidden"
                type="file"
                accept="application/pdf,.pdf"
                onChange={handleFileInput}
              />
            </div>

            <section className="mt-6">
              <h3 className="text-[18px] font-black text-[#1d2430]">已选择文件（{selectedFiles.length}）</h3>
              <div className="mt-3 min-h-[38px] space-y-2">
                {selectedFiles.map((file) => (
                  <div key={file.id} className="flex items-center gap-2 rounded-[10px] border border-[#e7ebf0] bg-[#fbfcfd] px-3 py-2 text-sm font-semibold text-[#344054]">
                    <FileText className="size-4 text-[#18a62a]" />
                    <span className="min-w-0 truncate">{file.name}</span>
                    <span className="ml-auto shrink-0 text-xs font-medium text-[#98a2b3]">{formatFileSize(file.size)}</span>
                  </div>
                ))}
                {selectedFiles.length === 0 ? <p className="text-sm font-medium text-[#98a2b3]">选择 PDF 后，点击“创建项目”开始解析。</p> : null}
                {isUploading ? <p className="text-sm font-medium text-[#667085]">正在创建项目并上传资料，请稍候...</p> : null}
              </div>
              {uploadedFiles.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {uploadedFiles.slice(0, 2).map((file) => (
                    <div key={file.id} className="flex items-center gap-2 rounded-[10px] border border-[#dcf2df] bg-[#f7fff8] px-3 py-2 text-sm font-semibold text-[#247a31]">
                      <CheckCircle2 className="size-4 text-[#18a62a]" />
                      <span className="min-w-0 truncate">{file.name} 已提交解析</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>

            {error ? <p className="mt-3 text-sm font-semibold text-[#d92d20]">{error}</p> : null}

            <div className="mt-7 flex items-center justify-between gap-4">
              <p className="flex items-center gap-2 text-[12px] font-medium text-[#98a2b3]">
                <Info className="size-3.5 text-[#f4b740]" />
                上传即代表您已获文件合法有效的知识产权或授权
              </p>
              <div className="flex shrink-0 items-center gap-3">
                <button
                  className="h-10 rounded-[11px] border border-[#d8dee6] bg-white px-7 text-[15px] font-extrabold text-[#344054] transition hover:bg-[#f8fafc]"
                  disabled={isUploading}
                  onClick={closeModal}
                  type="button"
                >
                  取消
                </button>
                <button
                  className="h-10 rounded-[11px] bg-[linear-gradient(90deg,#111827_0%,#126324_100%)] px-7 text-[15px] font-extrabold text-white shadow-[0_10px_22px_rgba(18,99,36,0.18)] transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
                  disabled={isUploading || selectedFiles.length === 0}
                  onClick={createProject}
                  type="button"
                >
                  {isUploading ? "创建中..." : "创建项目"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

async function postJson<T>(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  return readApiResponse<T>(response);
}

async function postForm<T = unknown>(url: string, body: FormData) {
  const response = await fetch(url, {
    method: "POST",
    body
  });
  return readApiResponse<T>(response);
}

async function readApiResponse<T>(response: Response) {
  const payload = await response.json().catch(() => null) as ApiEnvelope<T> | null;
  if (response.ok && payload?.ok) {
    return payload.data;
  }

  if (payload && !payload.ok && payload.error?.message) {
    throw new Error(payload.error.message);
  }
  throw new Error(`请求失败：HTTP ${response.status}`);
}

function isPdfFile(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function validatePdfFile(file: File) {
  if (!isPdfFile(file)) {
    return "当前阶段仅支持上传 PDF 文件。";
  }
  if (file.size <= 0) {
    return "上传文件不能为空。";
  }
  if (file.size > maxPdfBytes) {
    return "PDF 文件不能超过 20MB。";
  }
  return "";
}

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / 1024 / 1024).toFixed(1)}MB`;
  }
  return `${Math.max(1, Math.round(size / 1024))}KB`;
}
