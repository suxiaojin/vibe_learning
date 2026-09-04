export type AiStudyOutlineStructureNode = {
  clientId: string;
  parentClientId?: string | null;
  title: string;
  depth: number;
};

export function assertCompleteFourLevelOutline(nodes: AiStudyOutlineStructureNode[]) {
  const fourthLevelNodes = nodes.filter((node) => node.depth === 3);
  if (fourthLevelNodes.length === 0) {
    throw new Error("知识框架必须完整生成 4 层，但模型没有生成任何第 4 层知识点。");
  }

  const parentIds = new Set(
    nodes
      .map((node) => node.parentClientId)
      .filter((parentId): parentId is string => Boolean(parentId))
  );
  const prematureLeaves = nodes.filter((node) => node.depth < 3 && !parentIds.has(node.clientId));
  if (prematureLeaves.length === 0) {
    return;
  }

  const preview = prematureLeaves
    .slice(0, 6)
    .map((node) => `第 ${node.depth + 1} 层“${node.title}”`)
    .join("、");
  const remainder = prematureLeaves.length > 6 ? `等 ${prematureLeaves.length} 个节点` : "";
  throw new Error(`知识框架必须完整生成 4 层，以下分支提前结束：${preview}${remainder}。`);
}
