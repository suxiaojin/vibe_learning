"use client";

import { type ChangeEvent, type DragEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronRight, FileText, Info, X } from "lucide-react";
import { DiamondInsufficientMessage } from "@/components/diamond-insufficient-message";
import { isDiamondInsufficientMessage } from "@/lib/diamond-insufficient";

const maxStudyMaterialBytes = 80 * 1024 * 1024;

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

type UploadPhase = "idle" | "creating" | "uploading" | "uploaded" | "starting" | "submitted";

type SelectedFile = {
  id: string;
  file: File;
  name: string;
  size: number;
};

type SupportedStudyMaterialType = "pdf" | "document";

export function StudyMaterialImporter() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeUploadTokenRef = useRef("");
  const uploadRequestRef = useRef<XMLHttpRequest | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [uploadedProjectId, setUploadedProjectId] = useState("");
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState("");

  function openModal() {
    resetUploadState();
    setError("");
    setIsOpen(true);
  }

  async function closeModal() {
    if (isUploading || isStarting) {
      return;
    }
    if (uploadedProjectId && uploadPhase === "uploaded") {
      await deleteDraftProject(uploadedProjectId);
      router.refresh();
    }
    setIsOpen(false);
    setIsDragging(false);
    resetUploadState();
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
      const validationError = validateStudyMaterialFile(file);
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

    const selectedFile = nextFiles[0];
    const previousProjectId = uploadedProjectId;
    if (previousProjectId) {
      void deleteDraftProject(previousProjectId).then(() => router.refresh());
    }
    const uploadToken = `${selectedFile.id}-${Date.now()}`;
    activeUploadTokenRef.current = uploadToken;
    setSelectedFiles([selectedFile]);
    setUploadedProjectId("");
    setUploadPhase("idle");
    setUploadProgress(0);
    setError(files.length > 1 ? "当前阶段一次只能创建 1 个学习资料项目，已自动上传第一个文件。" : "");
    void uploadSelectedFile(selectedFile, uploadToken);
  }

  async function uploadSelectedFile(selectedFile: SelectedFile, uploadToken: string) {
    if (isUploading) {
      return;
    }

    setIsUploading(true);
    setUploadPhase("creating");
    setUploadProgress(1);
    setError("");

    try {
      const created = await uploadOneFile(selectedFile.file, (progress) => {
        if (activeUploadTokenRef.current !== uploadToken) {
          return;
        }
        setUploadPhase("uploading");
        setUploadProgress(progress);
      }, uploadToken);
      if (activeUploadTokenRef.current !== uploadToken) {
        return;
      }
      setUploadProgress(100);
      setUploadedProjectId(created.projectId);
      setUploadPhase("uploaded");
    } catch (caught) {
      if (activeUploadTokenRef.current !== uploadToken) {
        return;
      }
      setError(caught instanceof Error ? caught.message : "创建项目失败，请稍后重试。");
      setUploadPhase("idle");
      setUploadProgress(0);
    } finally {
      if (activeUploadTokenRef.current === uploadToken) {
        setIsUploading(false);
      }
    }
  }

  async function startProject() {
    if (!uploadedProjectId || isUploading || isStarting) {
      return;
    }

    setIsStarting(true);
    setUploadPhase("starting");
    setError("");
    try {
      await postJson(`/api/ai-study/projects/${uploadedProjectId}/start`, {});
      setUploadPhase("submitted");
      router.refresh();
      window.setTimeout(() => {
        setIsOpen(false);
        resetUploadState();
      }, 450);
    } catch (caught) {
      setUploadPhase("uploaded");
      setError(caught instanceof Error ? caught.message : "创建项目失败，请稍后重试。");
    } finally {
      setIsStarting(false);
    }
  }

  function resetUploadState() {
    activeUploadTokenRef.current = "";
    uploadRequestRef.current = null;
    setSelectedFiles([]);
    setUploadedProjectId("");
    setUploadPhase("idle");
    setUploadProgress(0);
    setIsStarting(false);
    setError("");
  }

  async function removeSelectedFile() {
    const projectId = uploadedProjectId;
    const request = uploadRequestRef.current;
    activeUploadTokenRef.current = "";
    uploadRequestRef.current = null;

    if (request && request.readyState !== XMLHttpRequest.DONE) {
      request.abort();
    }

    resetUploadState();
    setIsUploading(false);
    setIsStarting(false);

    if (projectId) {
      await deleteDraftProject(projectId);
      router.refresh();
    }
  }

  async function uploadOneFile(file: File, onProgress: (progress: number) => void, uploadToken: string) {
    const validationError = validateStudyMaterialFile(file);
    if (validationError) {
      throw new Error(validationError);
    }
    const sourceType = getStudyMaterialType(file);
    if (!sourceType) {
      throw new Error("当前阶段仅支持上传 PDF、Word（.doc/.docx）文件。");
    }

    let projectId = "";
    const title = file.name.replace(/\.[^.]+$/, "").trim() || "未命名学习资料";

    try {
      const created = await postJson<CreateProjectResponse>("/api/ai-study/projects", {
        title,
        sourceType,
        learningGoal: "review"
      });
      projectId = created.project.id;
      onProgress(5);
      if (activeUploadTokenRef.current !== uploadToken) {
        throw new Error("已取消上传。");
      }

      const uploadForm = new FormData();
      uploadForm.set("file", file);
      uploadForm.set("startParsing", "false");
      await postFormWithProgress(`/api/ai-study/projects/${projectId}/sources`, uploadForm, (progress) => {
        onProgress(Math.max(5, Math.min(99, progress)));
      }, (request) => {
        if (activeUploadTokenRef.current === uploadToken) {
          uploadRequestRef.current = request;
          return;
        }
        request.abort();
      });
      if (uploadRequestRef.current?.readyState === XMLHttpRequest.DONE) {
        uploadRequestRef.current = null;
      }

      return { projectId };
    } catch (caught) {
      uploadRequestRef.current = null;
      if (projectId) {
        await deleteDraftProject(projectId);
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
              <p className="mt-3 text-[12px] font-medium text-[#98a2b3]">当前支持 PDF、Word（.doc/.docx），单个文件不超过80M</p>
              <input
                ref={fileInputRef}
                className="hidden"
                type="file"
                accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.pdf,.doc,.docx"
                onChange={handleFileInput}
              />
            </div>

            <section className="mt-6">
              <h3 className="text-[18px] font-black text-[#1d2430]">已上传文件（{selectedFiles.length}）</h3>
              <div className="mt-3 min-h-[38px] space-y-2">
                {selectedFiles.map((file) => (
                  <div key={file.id} className="relative w-[184px] rounded-[10px] bg-[#f3f4f6] px-3 py-2 pr-8">
                    <button
                      aria-label={`删除 ${file.name}`}
                      className="absolute right-2 top-2 grid size-5 place-items-center rounded-full bg-[#8b949e] text-white transition hover:bg-[#667085] disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={isStarting}
                      onClick={(event) => {
                        event.stopPropagation();
                        void removeSelectedFile();
                      }}
                      title="删除资料"
                      type="button"
                    >
                      <X size={12} strokeWidth={3} />
                    </button>
                    <div className="flex items-center gap-2 text-sm font-semibold text-[#344054]">
                      <FileText className="size-5 shrink-0 text-[#ff5630]" />
                      <span className="min-w-0 truncate">{file.name}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs font-medium text-[#667085]">
                      {uploadPhase !== "idle" && !error ? (
                        <>
                          {uploadPhase === "uploaded" || uploadPhase === "submitted" ? (
                            <CheckCircle2 className="size-3.5 text-[#16a329]" />
                          ) : (
                            <span className="inline-block size-3 animate-spin rounded-full border-2 border-[#cfd5dd] border-t-[#667085]" />
                          )}
                          <span>{getUploadStatusText(uploadPhase)}</span>
                          <span className="ml-auto text-[#98a2b3]">{uploadProgress}%</span>
                        </>
                      ) : (
                        <>
                          <span>{error ? "上传失败" : "等待上传"}</span>
                          <span className="ml-auto text-[#98a2b3]">{formatFileSize(file.size)}</span>
                        </>
                      )}
                    </div>
                    {uploadPhase !== "idle" && !error ? (
                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-[#dbe1e8]">
                        <span className="block h-full rounded-full bg-[#16a329]" style={{ width: `${uploadProgress}%` }} />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>

            {error ? (
              isDiamondInsufficientMessage(error) ? (
                <DiamondInsufficientMessage className="mt-3 block text-sm" />
              ) : (
                <p className="mt-3 text-sm font-semibold text-[#d92d20]">{error}</p>
              )
            ) : null}

            <div className="mt-7 flex items-center justify-between gap-4">
              <p className="flex items-center gap-2 text-[12px] font-medium text-[#98a2b3]">
                <Info className="size-3.5 text-[#f4b740]" />
                上传即代表您已获文件合法有效的知识产权或授权
              </p>
              <div className="flex shrink-0 items-center gap-3">
                <button
                  className="h-10 rounded-[11px] border border-[#d8dee6] bg-white px-7 text-[15px] font-extrabold text-[#344054] transition hover:bg-[#f8fafc]"
                  disabled={isUploading || isStarting}
                  onClick={closeModal}
                  type="button"
                >
                  取消
                </button>
                <button
                  className="h-10 rounded-[11px] bg-[linear-gradient(90deg,#111827_0%,#126324_100%)] px-7 text-[15px] font-extrabold text-white shadow-[0_10px_22px_rgba(18,99,36,0.18)] transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
                  disabled={isUploading || isStarting || !uploadedProjectId || uploadPhase !== "uploaded"}
                  onClick={startProject}
                  type="button"
                >
                  创建项目
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

function postFormWithProgress<T = unknown>(
  url: string,
  body: FormData,
  onProgress: (progress: number) => void,
  onRequest?: (request: XMLHttpRequest) => void
) {
  return new Promise<T>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", url);
    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) {
        onProgress(50);
        return;
      }
      onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => {
      const payload = parseApiEnvelope<T>(request.responseText);
      if (request.status >= 200 && request.status < 300 && payload?.ok) {
        resolve(payload.data);
        return;
      }
      if (payload && !payload.ok && payload.error?.message) {
        reject(new Error(payload.error.message));
        return;
      }
      reject(new Error(`请求失败：HTTP ${request.status}`));
    };
    request.onabort = () => reject(new Error("已取消上传。"));
    request.onerror = () => reject(new Error("上传失败，请检查网络后重试。"));
    onRequest?.(request);
    request.send(body);
  });
}

async function deleteDraftProject(projectId: string) {
  await fetch(`/api/ai-study/projects/${projectId}`, { method: "DELETE" }).catch(() => null);
}

function parseApiEnvelope<T>(value: string) {
  try {
    return JSON.parse(value) as ApiEnvelope<T>;
  } catch {
    return null;
  }
}

function getStudyMaterialType(file: File): SupportedStudyMaterialType | null {
  const mimeType = file.type.toLowerCase();
  const fileName = file.name.toLowerCase();
  if (mimeType === "application/pdf" || fileName.endsWith(".pdf")) {
    return "pdf";
  }
  if (
    mimeType === "application/msword" ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    fileName.endsWith(".doc") ||
    fileName.endsWith(".docx")
  ) {
    return "document";
  }
  return null;
}

function validateStudyMaterialFile(file: File) {
  if (!getStudyMaterialType(file)) {
    return "当前阶段仅支持上传 PDF、Word（.doc/.docx）文件。";
  }
  if (file.size <= 0) {
    return "上传文件不能为空。";
  }
  if (file.size > maxStudyMaterialBytes) {
    return "学习资料文件不能超过 80MB。";
  }
  return "";
}

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / 1024 / 1024).toFixed(1)}MB`;
  }
  return `${Math.max(1, Math.round(size / 1024))}KB`;
}

function getUploadStatusText(phase: UploadPhase) {
  if (phase === "creating") {
    return "创建中";
  }
  if (phase === "uploaded") {
    return "已上传";
  }
  if (phase === "starting") {
    return "提交解析中";
  }
  if (phase === "submitted") {
    return "已提交解析";
  }
  return "上传中";
}
