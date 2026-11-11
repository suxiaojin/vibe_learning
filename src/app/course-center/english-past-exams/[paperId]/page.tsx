import Link from "next/link";
import { notFound } from "next/navigation";
import { PastExamRunner } from "@/app/mock-tests/special/past/[paperId]/past-exam-runner";
import { requireUser } from "@/lib/auth";
import { EnglishPaperError, readEnglishPaper } from "@/lib/english-v1-paper";
import { getHenanEnglishPastExam } from "@/lib/henan-english-past-exams";
import { englishImportSections } from "@/lib/question-bank-types";

const backHref = "/course-center/english-past-exams";
const sections = Object.entries(englishImportSections).map(([key, { label }]) => ({ key, label }));

export default async function EnglishPastExamAnswerPage({ params }: { params: Promise<{ paperId: string }> }) {
  const [user, { paperId }] = await Promise.all([requireUser(), params]);
  const paper = await getHenanEnglishPastExam(user.id, paperId);
  if (!paper) notFound();

  try {
    const { groups } = readEnglishPaper(paper);
    const questions = groups.flatMap((group) => {
      const wordBankOptions = group.section === "word_selection" ? Object.entries(group.rows[0].options) : [];
      const sharesWordBank = group.rows.length > 1 && wordBankOptions.length > 0 &&
        group.rows.every((row) => Object.keys(row.options).length === wordBankOptions.length &&
          wordBankOptions.every(([key, text]) => row.options[key] === text));

      return group.rows.map((row, index) => ({
        id: row.entry.question.id,
        type: englishImportSections[group.section].type,
        section: group.section,
        number: row.number,
        material: index === 0 ? row.contextHtml : undefined,
        stem: row.prompt === String(row.number) || row.prompt === `第 ${row.number} 空` ? "" :
          group.section === "writing" ? row.promptHtml.replace(/^<p>Part\s+(?:VI|6)\s+Writing\s*\(\s*\d+\s+points?\s*\)<\/p>(?=<p>)/i, "") : row.promptHtml,
        options: (sharesWordBank ? wordBankOptions : Object.entries(row.options)).map(([key, text]) => ({
          key,
          text: group.section === "judgment" && text === "正确" ? "True" :
            group.section === "judgment" && text === "错误" ? "False" : text
        })),
        wordBank: sharesWordBank ? (index === 0 ? "start" as const : "continuation" as const) : undefined,
        answer: null,
        analysis: "",
        showAnalysis: false,
        showAiExplanation: false,
        score: row.entry.score
      }));
    });
    return <PastExamRunner
      userId={user.id}
      courseKey="public_subject"
      paperId={paper.id}
      title={paper.title}
      questions={questions}
      questionTypes={[]}
      englishExam={{ backHref, sections }}
    />;
  } catch (error) {
    if (!(error instanceof EnglishPaperError)) throw error;
    return (
      <main className="mx-auto max-w-3xl p-8">
        <Link href={backHref} className="text-sm font-semibold text-teal">返回历年真题</Link>
        <h1 className="mt-4 text-xl font-semibold">{paper.title}</h1>
        <p className="mt-3 text-sm text-slate-600">这套试卷的题型结构暂时无法读取。</p>
      </main>
    );
  }
}
