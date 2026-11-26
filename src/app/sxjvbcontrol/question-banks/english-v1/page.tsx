import { EnglishV1Workbench, type EnglishV1Sample } from "@/components/english-v1-workbench";
import { requireAdmin } from "@/lib/auth";
import { parserVersionUrl } from "@/lib/question-pdf-parser-versions";

export default async function EnglishV1PreviewPage() {
  await requireAdmin();
  let sample: EnglishV1Sample | null = null;
  try {
    const response = await fetch(`${parserVersionUrl("english")}/english-v1/sample`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000)
    });
    if (response.ok) sample = await response.json() as EnglishV1Sample;
  } catch (error) {
    console.error("英语 V1 测试样本读取失败", error);
  }
  return <EnglishV1Workbench sample={sample} />;
}
