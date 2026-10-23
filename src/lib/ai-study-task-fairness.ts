type OwnedTask = { project: { ownerId: string } };

// Candidates arrive in creation order. Balance active slots first, then give
// the next turn to the owner who has waited longest since their last claim.
export function chooseFairAiStudyTask<T extends OwnedTask>(
  pending: T[],
  runningOwnerIds: string[],
  lastClaimedAtByOwner: ReadonlyMap<string, number>,
  isEligible: (task: T) => boolean = () => true
): T | null {
  const runningByOwner = new Map<string, number>();
  for (const ownerId of runningOwnerIds) {
    runningByOwner.set(ownerId, (runningByOwner.get(ownerId) ?? 0) + 1);
  }

  let selected: T | null = null;
  let fewestRunning = Number.POSITIVE_INFINITY;
  let oldestClaim = Number.POSITIVE_INFINITY;
  for (const task of pending) {
    if (!isEligible(task)) continue;
    const ownerId = task.project.ownerId;
    const running = runningByOwner.get(ownerId) ?? 0;
    const lastClaim = lastClaimedAtByOwner.get(ownerId) ?? Number.NEGATIVE_INFINITY;
    if (running < fewestRunning || (running === fewestRunning && lastClaim < oldestClaim)) {
      selected = task;
      fewestRunning = running;
      oldestClaim = lastClaim;
      if (running === 0 && lastClaim === Number.NEGATIVE_INFINITY) break;
    }
  }
  return selected;
}
