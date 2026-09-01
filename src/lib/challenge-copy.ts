export type ChallengeCopyQuestionContent = {
  id: string;
  type: string;
  stem: string;
  options: unknown;
  answer: unknown;
  analysis: string;
  source: string;
  sourceType: string;
  sourceYear: number | null;
  difficulty: string;
};

export type ChallengeQuestionCopyMatch = {
  sourceQuestionId: string;
  targetQuestionId: string;
};

function stableJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableJson);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableJson(entry)])
    );
  }
  return value;
}

export function challengeQuestionFingerprint(question: ChallengeCopyQuestionContent) {
  return JSON.stringify(stableJson({
    type: question.type,
    stem: question.stem,
    options: question.options,
    answer: question.answer,
    analysis: question.analysis,
    source: question.source,
    sourceType: question.sourceType,
    sourceYear: question.sourceYear,
    difficulty: question.difficulty
  }));
}

export function matchChallengeQuestions(
  sourceQuestions: ChallengeCopyQuestionContent[],
  targetQuestions: ChallengeCopyQuestionContent[]
) {
  const sourceByFingerprint = new Map<string, ChallengeCopyQuestionContent[]>();
  const targetByFingerprint = new Map<string, ChallengeCopyQuestionContent[]>();

  for (const question of sourceQuestions) {
    const fingerprint = challengeQuestionFingerprint(question);
    sourceByFingerprint.set(fingerprint, [...(sourceByFingerprint.get(fingerprint) || []), question]);
  }
  for (const question of targetQuestions) {
    const fingerprint = challengeQuestionFingerprint(question);
    targetByFingerprint.set(fingerprint, [...(targetByFingerprint.get(fingerprint) || []), question]);
  }

  const matches: ChallengeQuestionCopyMatch[] = [];
  for (const [fingerprint, sources] of sourceByFingerprint) {
    const targets = targetByFingerprint.get(fingerprint) || [];
    if (sources.length === 1 && targets.length === 1) {
      matches.push({ sourceQuestionId: sources[0].id, targetQuestionId: targets[0].id });
    }
  }

  return {
    matches,
    sourceQuestionCount: sourceQuestions.length,
    mappedQuestionCount: matches.length,
    unmappedQuestionCount: sourceQuestions.length - matches.length
  };
}
