import type { Knowledge } from "../model/knowledge.ts";
import type { Walkthrough } from "../model/walkthrough.ts";

const CERTAINTY_LABELS = {
  confirmed: "已确认",
  corroborated: "有旁证",
  inferred: "推断",
  unknown: "未知",
} as const;

export function projectKnowledgeToWalkthrough(knowledge: Knowledge): Walkthrough {
  const scope = knowledge.scopes[0];
  return {
    schemaVersion: 1,
    revision: knowledge.revision,
    title: knowledge.title ?? knowledge.capabilities[0]?.title ?? scope?.title ?? "代码导览",
    focusParticipantId: knowledge.focusParticipantId,
    repository: knowledge.repository,
    participants: knowledge.participants,
    relations: knowledge.relations,
    scenarios: knowledge.scenarios,
    guide: {
      view: "current",
      scope: scope ? { label: scope.title } : undefined,
      conclusion: knowledge.capabilities.map((capability) => capability.responsibility).join("\n\n") || undefined,
      userPaths: knowledge.scopes.flatMap((item) => {
        if (item.kind !== "scenario") return [];
        return [{
          title: item.title,
          body: [item.trigger, item.expectedOutcome].filter(Boolean).join("。"),
        }];
      }),
      algorithms: knowledge.algorithms.map((algorithm) => ({
        title: algorithm.title,
        code: algorithm.pseudocode,
      })),
      state: formatState(knowledge) || undefined,
      rules: knowledge.claims.map((claim) => ({
        text: `${claim.text}〔${CERTAINTY_LABELS[claim.certainty]}〕`,
        location: locationOf(knowledge, claim.evidenceIds[0]),
      })),
      reading: readingEntries(knowledge),
    },
  };
}

function formatState(knowledge: Knowledge) {
  return knowledge.stateModels
    .map((model) => {
      const owner = model.ownerParticipantId ? `持有者：${model.ownerParticipantId}` : "";
      const persistence = model.persistence ? `持久化：${model.persistence}` : "";
      const transitions = model.transitions
        .map((transition) => {
          const from = model.states.find((state) => state.id === transition.from)?.title ?? transition.from;
          const to = model.states.find((state) => state.id === transition.to)?.title ?? transition.to;
          return `${from} → ${to}：${transition.trigger}`;
        })
        .join("\n");
      const actors = [
        model.readers.length > 0 ? `读取：${model.readers.join("、")}` : "",
        model.writers.length > 0 ? `写入：${model.writers.join("、")}` : "",
      ].filter(Boolean);
      return [model.title, owner, persistence, ...actors, transitions].filter(Boolean).join("\n");
    })
    .join("\n\n");
}

function locationOf(knowledge: Knowledge, evidenceId: string | undefined) {
  const evidence = knowledge.evidence.find((item) => item.id === evidenceId);
  if (!evidence) return undefined;
  const end = evidence.endLine ? `-${evidence.endLine}` : "";
  return `${evidence.path}:${evidence.startLine}${end}`;
}

function readingEntries(knowledge: Knowledge) {
  const seen = new Set<string>();
  const entries = [];
  for (const participant of knowledge.participants) {
    if (!participant.file || seen.has(participant.file)) continue;
    seen.add(participant.file);
    entries.push({
      path: participant.file,
      label: participant.title,
      note: participant.codeIdentity,
    });
    if (entries.length >= 12) break;
  }
  return entries;
}
