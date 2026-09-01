import assert from "node:assert/strict";
import { buildQuestionBankKnowledgeCopyMapping, type QuestionBankCopyCourse } from "../src/lib/question-bank-copy";

function course(prefix: string, courseName = "计算机应用基础"): QuestionBankCopyCourse {
  return {
    name: courseName,
    syllabusItems: [
      { id: `${prefix}-chapter`, parentId: null, checkpointScope: null, code: "1", title: "计算机基础" },
      { id: `${prefix}-point`, parentId: `${prefix}-chapter`, checkpointScope: null, code: "1.1", title: "信息编码" }
    ],
    chapters: [
      {
        title: "计算机基础",
        sortOrder: 1,
        points: [
          { id: `${prefix}-knowledge`, syllabusItemId: `${prefix}-point`, title: "信息编码", sortOrder: 1 }
        ]
      }
    ]
  };
}

const exact = buildQuestionBankKnowledgeCopyMapping([course("source")], [course("target")], [
  {
    knowledgePointId: "source-knowledge",
    syllabusItemId: "source-point",
    knowledgeTagSyllabusItemIds: ["source-point"]
  },
  { knowledgePointId: null, syllabusItemId: null, knowledgeTagSyllabusItemIds: [] }
]);
assert.equal(exact.knowledgePointIds.get("source-knowledge"), "target-knowledge");
assert.equal(exact.syllabusItemIds.get("source-point"), "target-point");
assert.deepEqual(exact.summary, {
  questionCount: 2,
  associationCount: 3,
  mappedAssociationCount: 3,
  unmappedAssociationCount: 0,
  unclassifiedQuestionCount: 1,
  questionsWithUnmappedAssociations: 0
});

const differentTitle = buildQuestionBankKnowledgeCopyMapping([course("source")], [course("target", "计算机文化基础")], [
  {
    knowledgePointId: "source-knowledge",
    syllabusItemId: "source-point",
    knowledgeTagSyllabusItemIds: ["source-point"]
  }
]);
assert.equal(differentTitle.summary.mappedAssociationCount, 0);
assert.equal(differentTitle.summary.unmappedAssociationCount, 3);
assert.equal(differentTitle.summary.questionsWithUnmappedAssociations, 1);

const ambiguousTarget = buildQuestionBankKnowledgeCopyMapping(
  [course("source")],
  [course("target-a"), course("target-b")],
  [{ knowledgePointId: null, syllabusItemId: "source-point", knowledgeTagSyllabusItemIds: [] }]
);
assert.equal(ambiguousTarget.syllabusItemIds.size, 0);
assert.equal(ambiguousTarget.summary.unmappedAssociationCount, 1);

console.log("question bank knowledge copy mapping tests passed");
