import { z } from 'zod';
import { encode } from '../core/toon-serializer.js';

const AgentNodeSchema = z.object({
  id: z.string().min(1),
  agentType: z.string().min(1),
  brief: z.string(),
  dependsOn: z.array(z.string()),
});

interface AgentNode {
  id: string;
  agentType: string;
  brief: string;
  dependsOn: string[];
}

class CycleDetectedError extends Error {
  constructor(message = 'Cycle detected in DAG') {
    super(message);
    this.name = 'CycleDetectedError';
  }
}

function validateNodes(rawNodes: readonly unknown[]): AgentNode[] {
  return rawNodes.map((node) => AgentNodeSchema.parse(node));
}

/** Encode a node to TOON for inter-component transport */
function serializeNode(node: AgentNode): string {
  return encode('agent-node', {
    id: node.id,
    agentType: node.agentType,
    brief: node.brief,
    dependsOn: node.dependsOn,
  });
}

async function executeDAG(
  nodes: AgentNode[],
  executor: (node: AgentNode) => Promise<string>,
): Promise<Map<string, string>> {
  const validated = validateNodes(nodes);

  if (validated.length === 0) {
    return new Map<string, string>();
  }

  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  const nodeMap = new Map<string, AgentNode>();

  for (const node of validated) {
    nodeMap.set(node.id, node);
    inDegree.set(node.id, 0);
    dependents.set(node.id, []);
  }

  for (const node of validated) {
    for (const dep of node.dependsOn) {
      if (!nodeMap.has(dep)) {
        throw new Error(`Node '${node.id}' depends on unknown node '${dep}'`);
      }
      inDegree.set(node.id, (inDegree.get(node.id) ?? 0) + 1);
      const depList = dependents.get(dep);
      if (depList) {
        depList.push(node.id);
      }
    }
  }

  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  const results = new Map<string, string>();
  let processedCount = 0;

  while (queue.length > 0) {
    const currentBatch = [...queue];
    queue.length = 0;

    const batchResults = await Promise.all(
      currentBatch.map(async (id) => {
        const node = nodeMap.get(id)!;
        const result = await executor(node);
        return { id, result };
      }),
    );

    for (const { id, result } of batchResults) {
      results.set(id, result);
      processedCount++;

      const deps = dependents.get(id) ?? [];
      for (const depId of deps) {
        const newDegree = (inDegree.get(depId) ?? 1) - 1;
        inDegree.set(depId, newDegree);
        if (newDegree === 0) {
          queue.push(depId);
        }
      }
    }
  }

  if (processedCount !== validated.length) {
    throw new CycleDetectedError();
  }

  return results;
}

export { executeDAG, validateNodes, serializeNode, CycleDetectedError, AgentNodeSchema };
export type { AgentNode };
