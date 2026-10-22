type PublicPart = {
  id: string;
  canonicalProjectId: string | null;
  partIndex: number | null;
  partCount: number | null;
};

export function originalAiStudyProjectTitle(title: string) {
  const original = title
    .replace(/^\s*\[Part\.\s*\d+\s*\/\s*\d+\]\s*/i, "")
    .replace(/\s*[（(]原文第\s*\d+\s*[-–—]\s*\d+\s*页[）)]\s*$/, "")
    .trim();
  return original || title.trim();
}

export function groupPublicAiStudyProjects<T extends PublicPart>(projects: T[]) {
  const groups = new Map<string, T[]>();
  for (const project of projects) {
    const canonicalId = project.canonicalProjectId || project.id;
    const parts = groups.get(canonicalId) || [];
    parts.push(project);
    groups.set(canonicalId, parts);
  }

  return Array.from(groups, ([canonicalId, parts]) => ({
    canonicalId,
    project: parts.find((part) => part.id === canonicalId)
      || [...parts].sort((left, right) => (left.partIndex ?? 1) - (right.partIndex ?? 1))[0],
    partCount: Math.max(parts.length, ...parts.map((part) => part.partCount || 1)),
    unified: parts.some((part) => Boolean(part.canonicalProjectId))
  }));
}

export function groupCompletedOwnedAiStudyProjects<T extends PublicPart>(projects: T[], completedProjectIds: ReadonlySet<string>) {
  const groups = new Map<string, T[]>();
  for (const project of projects) {
    const canonicalId = project.canonicalProjectId || project.id;
    const parts = groups.get(canonicalId) || [];
    parts.push(project);
    groups.set(canonicalId, parts);
  }

  return Array.from(groups, ([canonicalId, parts]) => {
    const partCount = Math.max(parts.length, ...parts.map((part) => part.partCount || 1));
    const canonical = parts.find((part) => part.id === canonicalId);
    if (canonical
      && parts.some((part) => Boolean(part.canonicalProjectId))
      && parts.length === partCount
      && parts.every((part) => completedProjectIds.has(part.id))) {
      return [{ project: canonical, partCount, unified: true }];
    }
    return parts.map((project) => ({ project, partCount, unified: false }));
  }).flat();
}
