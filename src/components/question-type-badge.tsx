const questionTypeColors: Record<string, string> = {
  single_choice: "bg-blue-50 text-blue-700 ring-blue-200",
  multiple_choice: "bg-violet-50 text-violet-700 ring-violet-200",
  true_false: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  fill_blank: "bg-amber-50 text-amber-800 ring-amber-200",
  calculation: "bg-orange-50 text-orange-700 ring-orange-200",
  proof: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200",
  comprehensive: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  term_explanation: "bg-cyan-50 text-cyan-800 ring-cyan-200",
  calculation_analysis: "bg-rose-50 text-rose-700 ring-rose-200",
  practical_writing: "bg-pink-50 text-pink-700 ring-pink-200",
  short_answer: "bg-teal-50 text-teal-700 ring-teal-200",
  essay: "bg-red-50 text-red-700 ring-red-200",
  comprehensive_analysis: "bg-purple-50 text-purple-700 ring-purple-200",
  material_analysis: "bg-sky-50 text-sky-700 ring-sky-200",
  operation_record: "bg-lime-50 text-lime-800 ring-lime-200",
  practical_operation: "bg-green-50 text-green-700 ring-green-200",
  application: "bg-yellow-50 text-yellow-800 ring-yellow-200",
  question_answer: "bg-zinc-100 text-zinc-800 ring-zinc-300",
  handwriting: "bg-stone-100 text-stone-800 ring-stone-300",
  reading_comprehension: "bg-sky-100 text-sky-800 ring-sky-300",
  poetry_appreciation: "bg-purple-100 text-purple-800 ring-purple-300",
  classical_chinese_translation: "bg-orange-100 text-orange-800 ring-orange-300",
  writing: "bg-pink-100 text-pink-800 ring-pink-300",
  legal_document: "bg-slate-100 text-slate-700 ring-slate-300",
  chinese_character_writing: "bg-rose-50 text-rose-700 ring-rose-200",
  language_expression: "bg-teal-100 text-teal-800 ring-teal-300",
  teaching_design: "bg-indigo-100 text-indigo-800 ring-indigo-300",
  comprehensive_essay: "bg-red-100 text-red-800 ring-red-300"
};

export function QuestionTypeBadge({ type, label }: { type: string; label: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${
        questionTypeColors[type] || "bg-slate-100 text-slate-700 ring-slate-200"
      }`}
    >
      {label}
    </span>
  );
}
