import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { normalizeMockTestCourseKey } from "@/lib/mock-tests";
import { getPastExams } from "@/lib/past-exams";
import { PastExamRunner } from "@/app/mock-tests/special/past/[paperId]/past-exam-runner";
import { parseQuestionBankQuestionTypeConfig } from "@/lib/question-bank-types";

export default async function PastExamPage({ params, searchParams }: { params: Promise<{ paperId: string }>; searchParams?: Promise<{ course?: string }> }) {
  const [{ paperId }, query, user] = await Promise.all([params, searchParams, requireUser()]);
  const courseKey = normalizeMockTestCourseKey(query?.course);
  const { ownerName, papers } = await getPastExams(user.id, courseKey, paperId);
  const paper = papers.find((item) => item.id === paperId);
  if (!paper || !ownerName) redirect(`/mock-tests/special?course=${courseKey}&tab=past`);
  return <PastExamRunner userId={user.id} courseKey={courseKey} paperId={paper.id} title={paper.title} questionTypes={parseQuestionBankQuestionTypeConfig(paper.questionTypeConfig) || []} questions={paper.questions.map((item) => ({ ...item.question, score: item.score }))} />;
}
