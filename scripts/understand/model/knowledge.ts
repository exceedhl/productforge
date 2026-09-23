import type { Participant, Relation, Scenario } from "./participant.ts";
import {
  ANALYSIS_STATUSES,
  type Scope,
  type AnalysisStatus,
} from "./exploration.ts";
import {
  applyPatch,
  emptyWalkthrough,
  validateWalkthrough,
  type RepositoryInfo,
  type Walkthrough,
  type WalkthroughPatch,
} from "./walkthrough.ts";

export const KNOWLEDGE_VERSION = 2;

export const CERTAINTIES = ["confirmed", "corroborated", "inferred", "unknown"] as const;
export type Certainty = (typeof CERTAINTIES)[number];

export const CLAIM_KINDS = ["responsibility", "boundary", "ownership", "designEffect"] as const;
export type ClaimKind = (typeof CLAIM_KINDS)[number];

export interface EvidenceRecord {
  id: string;
  source: "code" | "test" | "document" | "config";
  path: string;
  startLine: number;
  endLine?: number;
  symbolId?: string;
  contentHash?: string;
}

export interface SemanticField {
  name: string;
  meaning: string;
}

export interface Capability {
  id: string;
  title: string;
  responsibility: string;
  entryParticipantIds: string[];
  scenarioIds: string[];
  stateModelIds: string[];
  algorithmIds: string[];
  evidenceIds: string[];
}

export interface Algorithm {
  id: string;
  title: string;
  trigger: string;
  inputs: SemanticField[];
  outputs: SemanticField[];
  pseudocode: string;
  invariants: string[];
  failureCases: string[];
  relatedScenarioIds: string[];
  evidenceIds: string[];
  certainty: Certainty;
}

export interface StateNode {
  id: string;
  title: string;
}

export interface StateTransition {
  id: string;
  from: string;
  to: string;
  trigger: string;
}

export interface StateModel {
  id: string;
  title: string;
  ownerParticipantId?: string;
  states: StateNode[];
  transitions: StateTransition[];
  readers: string[];
  writers: string[];
  persistence?: "memory" | "browser" | "file" | "database" | "external";
  evidenceIds: string[];
}

export interface Claim {
  id: string;
  subjectId: string;
  kind: ClaimKind;
  text: string;
  certainty: Certainty;
  evidenceIds: string[];
  producedBy: "deterministic" | "llm" | "document";
}

export interface Knowledge {
  schemaVersion: 2;
  revision: number;
  title?: string;
  focusParticipantId?: string;
  repository: RepositoryInfo;
  scopes: Scope[];
  capabilities: Capability[];
  participants: Participant[];
  relations: Relation[];
  scenarios: Scenario[];
  algorithms: Algorithm[];
  stateModels: StateModel[];
  claims: Claim[];
  evidence: EvidenceRecord[];
}

export interface KnowledgePatch {
  schemaVersion: 2;
  baseRevision?: number;
  operations: { op: string; id?: string; value?: unknown }[];
}

const PERSISTENCE = new Set(["memory", "browser", "file", "database", "external"]);
const EVIDENCE_SOURCES = new Set(["code", "test", "document", "config"]);

export function emptyKnowledge(repository: Partial<RepositoryInfo> = {}): Knowledge {
  const walkthrough = emptyWalkthrough(repository);
  return {
    schemaVersion: KNOWLEDGE_VERSION,
    revision: 0,
    repository: walkthrough.repository,
    scopes: [],
    capabilities: [],
    participants: [],
    relations: [],
    scenarios: [],
    algorithms: [],
    stateModels: [],
    claims: [],
    evidence: [],
  };
}

export function validateKnowledge(value: unknown): string[] {
  const issues: string[] = [];
  if (!isRecord(value)) return ["$ 必须是对象"];
  if (value.schemaVersion !== KNOWLEDGE_VERSION) issues.push(`$.schemaVersion 必须等于 ${KNOWLEDGE_VERSION}`);
  const structural = validateWalkthrough(asWalkthrough(value, false));
  for (const issue of structural) {
    if (issue.startsWith("$.schemaVersion")) continue;
    issues.push(issue);
  }
  assertArray(value.scopes, "$.scopes", issues);
  assertArray(value.capabilities, "$.capabilities", issues);
  assertArray(value.algorithms, "$.algorithms", issues);
  assertArray(value.stateModels, "$.stateModels", issues);
  assertArray(value.claims, "$.claims", issues);
  assertArray(value.evidence, "$.evidence", issues);
  if (issues.length > 0) return issues;

  const evidenceIds = collectIds(value.evidence, "$.evidence", issues, (item, path) => {
    validateEvidence(item, path, issues);
  });
  const participantIds = new Set(
    (value.participants as { id?: string }[]).map((item) => String(item.id)),
  );
  const scenarioIds = new Set((value.scenarios as { id?: string }[]).map((item) => String(item.id)));
  collectIds(value.scopes, "$.scopes", issues, (item, path) => validateScope(item, path, issues));
  collectIds(value.capabilities, "$.capabilities", issues, (item, path) => {
    validateCapability(item, path, participantIds, scenarioIds, evidenceIds, issues);
  });
  const algorithmIds = collectIds(value.algorithms, "$.algorithms", issues, (item, path) => {
    validateAlgorithm(item, path, scenarioIds, evidenceIds, issues);
  });
  const stateIds = collectIds(value.stateModels, "$.stateModels", issues, (item, path) => {
    validateStateModel(item, path, participantIds, evidenceIds, issues);
  });
  collectIds(value.claims, "$.claims", issues, (item, path) => {
    validateClaim(item, path, evidenceIds, issues);
  });
  for (const [index, capability] of (value.capabilities as Capability[]).entries()) {
    for (const algorithmId of capability.algorithmIds ?? []) {
      if (!algorithmIds.has(algorithmId)) {
        issues.push(`$.capabilities[${index}].algorithmIds 引用了不存在的算法 ${algorithmId}`);
      }
    }
    for (const stateId of capability.stateModelIds ?? []) {
      if (!stateIds.has(stateId)) {
        issues.push(`$.capabilities[${index}].stateModelIds 引用了不存在的状态 ${stateId}`);
      }
    }
  }
  return issues;
}

export function validateKnowledgePatch(value: unknown): string[] {
  const issues: string[] = [];
  if (!isRecord(value)) return ["$ 必须是对象"];
  if (value.schemaVersion !== KNOWLEDGE_VERSION) issues.push(`$.schemaVersion 必须等于 ${KNOWLEDGE_VERSION}`);
  if (
    value.baseRevision !== undefined &&
    (!Number.isInteger(value.baseRevision) || Number(value.baseRevision) < 0)
  ) {
    issues.push("$.baseRevision 必须是非负整数");
  }
  if (!Array.isArray(value.operations)) {
    issues.push("$.operations 必须是数组");
    return issues;
  }
  const supported = new Set([
    "upsertParticipant",
    "removeParticipant",
    "upsertRelation",
    "removeRelation",
    "replaceScenario",
    "removeScenario",
    "setRepository",
    "upsertScope",
    "removeScope",
    "upsertCapability",
    "removeCapability",
    "upsertAlgorithm",
    "removeAlgorithm",
    "upsertStateModel",
    "removeStateModel",
    "upsertClaim",
    "removeClaim",
    "upsertEvidence",
    "removeEvidence",
  ]);
  for (const [index, operation] of value.operations.entries()) {
    const path = `$.operations[${index}]`;
    if (!isRecord(operation) || !supported.has(String(operation.op))) {
      issues.push(`${path}.op 不受支持：${isRecord(operation) ? String(operation.op) : "无效操作"}`);
      continue;
    }
    if (String(operation.op).startsWith("remove")) assertNonEmptyString(operation.id, `${path}.id`, issues);
    else if (operation.op === "setRepository") assertObject(operation.value, `${path}.value`, issues);
    else assertObject(operation.value, `${path}.value`, issues);
  }
  return issues;
}

export function applyKnowledgePatch(current: Knowledge, patch: KnowledgePatch): Knowledge {
  assertValid(validateKnowledge(current), "当前 Knowledge");
  assertValid(validateKnowledgePatch(patch), "Knowledge patch");
  if (patch.baseRevision !== undefined && patch.baseRevision !== current.revision) {
    throw new Error(`Patch 基于 revision ${patch.baseRevision}，当前 revision 为 ${current.revision}`);
  }
  const next = structuredClone(current);
  for (const operation of patch.operations) {
    switch (operation.op) {
      case "upsertParticipant":
      case "removeParticipant":
      case "upsertRelation":
      case "removeRelation":
      case "replaceScenario":
      case "removeScenario":
      case "setRepository":
        copyStructure(
          next,
          applyPatch(asWalkthrough(next, true), {
            schemaVersion: 1,
            operations: [operation],
          } as WalkthroughPatch),
        );
        break;
      case "upsertScope":
        upsertById(next.scopes, operation.value as Scope);
        break;
      case "removeScope":
        removeById(next.scopes, String(operation.id));
        break;
      case "upsertCapability":
        upsertById(next.capabilities, operation.value as Capability);
        break;
      case "removeCapability":
        removeById(next.capabilities, String(operation.id));
        break;
      case "upsertAlgorithm":
        upsertById(next.algorithms, operation.value as Algorithm);
        break;
      case "removeAlgorithm":
        removeById(next.algorithms, String(operation.id));
        break;
      case "upsertStateModel":
        upsertById(next.stateModels, operation.value as StateModel);
        break;
      case "removeStateModel":
        removeById(next.stateModels, String(operation.id));
        break;
      case "upsertClaim":
        upsertById(next.claims, operation.value as Claim);
        break;
      case "removeClaim":
        removeById(next.claims, String(operation.id));
        break;
      case "upsertEvidence":
        upsertById(next.evidence, operation.value as EvidenceRecord);
        break;
      case "removeEvidence":
        removeById(next.evidence, String(operation.id));
        break;
      default:
        break;
    }
  }
  next.revision = current.revision + 1;
  next.schemaVersion = KNOWLEDGE_VERSION;
  assertValid(validateKnowledge(next), "合并后的 Knowledge");
  return next;
}

function asWalkthrough(value: unknown, fillDefaults: boolean): Walkthrough {
  const record = isRecord(value) ? value : {};
  const base = emptyWalkthrough();
  return {
    schemaVersion: 1,
    revision: fillDefaults && !Number.isInteger(record.revision) ? base.revision : (record.revision as number),
    title: typeof record.title === "string" ? record.title : undefined,
    focusParticipantId:
      typeof record.focusParticipantId === "string" ? record.focusParticipantId : undefined,
    repository: fillDefaults && !isRecord(record.repository)
      ? base.repository
      : (record.repository as RepositoryInfo),
    participants: Array.isArray(record.participants) ? (record.participants as Participant[]) : [],
    relations: Array.isArray(record.relations) ? (record.relations as Relation[]) : [],
    scenarios: Array.isArray(record.scenarios) ? (record.scenarios as Scenario[]) : [],
  };
}

function copyStructure(knowledge: Knowledge, walkthrough: Walkthrough) {
  knowledge.repository = walkthrough.repository;
  knowledge.participants = walkthrough.participants;
  knowledge.relations = walkthrough.relations;
  knowledge.scenarios = walkthrough.scenarios;
  knowledge.title = walkthrough.title;
  knowledge.focusParticipantId = walkthrough.focusParticipantId;
}

function validateScope(scope: unknown, path: string, issues: string[]) {
  if (!isRecord(scope)) return;
  assertNonEmptyString(scope.title, `${path}.title`, issues);
  if (!ANALYSIS_STATUSES.includes(scope.status as AnalysisStatus)) {
    issues.push(`${path}.status 不受支持：${String(scope.status)}`);
  }
  if (scope.kind === "scenario") {
    assertNonEmptyString(scope.trigger, `${path}.trigger`, issues);
    if (scope.actor !== undefined) assertOptionalString(scope.actor, `${path}.actor`, issues);
    if (scope.expectedOutcome !== undefined) {
      assertOptionalString(scope.expectedOutcome, `${path}.expectedOutcome`, issues);
    }
    return;
  }
  if (scope.kind === "area") {
    if (!Array.isArray(scope.targetRefs) || scope.targetRefs.length === 0) {
      issues.push(`${path}.targetRefs 至少要有一个代码位置`);
    } else if (scope.targetRefs.some((item) => typeof item !== "string" || item.trim() === "")) {
      issues.push(`${path}.targetRefs 必须是非空字符串数组`);
    }
    if (!["overview", "standard", "deep"].includes(String(scope.depth))) {
      issues.push(`${path}.depth 必须是 overview、standard 或 deep`);
    }
    return;
  }
  issues.push(`${path}.kind 必须是 scenario 或 area`);
}

function validateCapability(
  capability: unknown,
  path: string,
  participantIds: Set<string>,
  scenarioIds: Set<string>,
  evidenceIds: Set<string>,
  issues: string[],
) {
  if (!isRecord(capability)) return;
  assertNonEmptyString(capability.title, `${path}.title`, issues);
  assertNonEmptyString(capability.responsibility, `${path}.responsibility`, issues);
  for (const key of ["entryParticipantIds", "scenarioIds", "stateModelIds", "algorithmIds", "evidenceIds"]) {
    if (!Array.isArray(capability[key])) issues.push(`${path}.${key} 必须是数组`);
  }
  requireIds(capability.entryParticipantIds, `${path}.entryParticipantIds`, participantIds, "参与方", issues);
  requireIds(capability.scenarioIds, `${path}.scenarioIds`, scenarioIds, "场景", issues);
  requireIds(capability.evidenceIds, `${path}.evidenceIds`, evidenceIds, "证据", issues);
}

function validateAlgorithm(
  algorithm: unknown,
  path: string,
  scenarioIds: Set<string>,
  evidenceIds: Set<string>,
  issues: string[],
) {
  if (!isRecord(algorithm)) return;
  assertNonEmptyString(algorithm.title, `${path}.title`, issues);
  assertNonEmptyString(algorithm.trigger, `${path}.trigger`, issues);
  assertNonEmptyString(algorithm.pseudocode, `${path}.pseudocode`, issues);
  validateCertainty(algorithm.certainty, `${path}.certainty`, issues);
  validateFields(algorithm.inputs, `${path}.inputs`, issues);
  validateFields(algorithm.outputs, `${path}.outputs`, issues);
  assertStringList(algorithm.invariants, `${path}.invariants`, issues);
  assertStringList(algorithm.failureCases, `${path}.failureCases`, issues);
  requireIds(algorithm.relatedScenarioIds, `${path}.relatedScenarioIds`, scenarioIds, "场景", issues);
  requireIds(algorithm.evidenceIds, `${path}.evidenceIds`, evidenceIds, "证据", issues);
  if (
    (algorithm.certainty === "confirmed" || algorithm.certainty === "corroborated") &&
    (!Array.isArray(algorithm.evidenceIds) || algorithm.evidenceIds.length === 0)
  ) {
    issues.push(`${path}.evidenceIds 在 ${String(algorithm.certainty)} 时不能为空`);
  }
}

function validateStateModel(
  model: unknown,
  path: string,
  participantIds: Set<string>,
  evidenceIds: Set<string>,
  issues: string[],
) {
  if (!isRecord(model)) return;
  assertNonEmptyString(model.title, `${path}.title`, issues);
  if (model.ownerParticipantId !== undefined && !participantIds.has(String(model.ownerParticipantId))) {
    issues.push(`${path}.ownerParticipantId 引用了不存在的参与方 ${String(model.ownerParticipantId)}`);
  }
  if (model.persistence !== undefined && !PERSISTENCE.has(String(model.persistence))) {
    issues.push(`${path}.persistence 不受支持：${String(model.persistence)}`);
  }
  const stateIds = collectIds(model.states, `${path}.states`, issues, (item, itemPath) => {
    if (isRecord(item)) assertNonEmptyString(item.title, `${itemPath}.title`, issues);
  });
  if (!Array.isArray(model.transitions)) {
    issues.push(`${path}.transitions 必须是数组`);
  } else {
    const transitionIds = new Set<string>();
    for (const [index, transition] of model.transitions.entries()) {
      const itemPath = `${path}.transitions[${index}]`;
      if (!isRecord(transition)) {
        issues.push(`${itemPath} 必须是对象`);
        continue;
      }
      registerId(transition.id, itemPath, transitionIds, issues);
      for (const key of ["from", "to"] as const) {
        if (!stateIds.has(String(transition[key]))) {
          issues.push(`${itemPath}.${key} 引用了不存在的状态 ${String(transition[key])}`);
        }
      }
      assertNonEmptyString(transition.trigger, `${itemPath}.trigger`, issues);
    }
  }
  assertStringList(model.readers, `${path}.readers`, issues);
  assertStringList(model.writers, `${path}.writers`, issues);
  requireIds(model.evidenceIds, `${path}.evidenceIds`, evidenceIds, "证据", issues);
}

function validateClaim(claim: unknown, path: string, evidenceIds: Set<string>, issues: string[]) {
  if (!isRecord(claim)) return;
  assertNonEmptyString(claim.subjectId, `${path}.subjectId`, issues);
  if (!CLAIM_KINDS.includes(claim.kind as ClaimKind)) issues.push(`${path}.kind 不受支持：${String(claim.kind)}`);
  assertNonEmptyString(claim.text, `${path}.text`, issues);
  validateCertainty(claim.certainty, `${path}.certainty`, issues);
  if (!["deterministic", "llm", "document"].includes(String(claim.producedBy))) {
    issues.push(`${path}.producedBy 不受支持：${String(claim.producedBy)}`);
  }
  requireIds(claim.evidenceIds, `${path}.evidenceIds`, evidenceIds, "证据", issues);
  if (
    (claim.certainty === "confirmed" || claim.certainty === "corroborated") &&
    (!Array.isArray(claim.evidenceIds) || claim.evidenceIds.length === 0)
  ) {
    issues.push(`${path}.evidenceIds 在 ${String(claim.certainty)} 时不能为空`);
  }
}

function validateEvidence(evidence: unknown, path: string, issues: string[]) {
  if (!isRecord(evidence)) return;
  if (!EVIDENCE_SOURCES.has(String(evidence.source))) {
    issues.push(`${path}.source 不受支持：${String(evidence.source)}`);
  }
  assertNonEmptyString(evidence.path, `${path}.path`, issues);
  if (!Number.isInteger(evidence.startLine) || Number(evidence.startLine) < 1) {
    issues.push(`${path}.startLine 必须是正整数`);
  }
  if (
    evidence.endLine !== undefined &&
    (!Number.isInteger(evidence.endLine) || Number(evidence.endLine) < Number(evidence.startLine))
  ) {
    issues.push(`${path}.endLine 必须不小于 startLine`);
  }
  if (evidence.symbolId !== undefined) assertOptionalString(evidence.symbolId, `${path}.symbolId`, issues);
  if (evidence.contentHash !== undefined) assertOptionalString(evidence.contentHash, `${path}.contentHash`, issues);
}

function validateFields(value: unknown, path: string, issues: string[]) {
  if (!Array.isArray(value)) {
    issues.push(`${path} 必须是数组`);
    return;
  }
  for (const [index, field] of value.entries()) {
    if (!isRecord(field)) {
      issues.push(`${path}[${index}] 必须是对象`);
      continue;
    }
    assertNonEmptyString(field.name, `${path}[${index}].name`, issues);
    assertNonEmptyString(field.meaning, `${path}[${index}].meaning`, issues);
  }
}

function validateCertainty(value: unknown, path: string, issues: string[]) {
  if (!CERTAINTIES.includes(value as Certainty)) issues.push(`${path} 不受支持：${String(value)}`);
}

function collectIds(
  value: unknown,
  path: string,
  issues: string[],
  visit: (item: unknown, path: string) => void,
) {
  const ids = new Set<string>();
  if (!Array.isArray(value)) return ids;
  for (const [index, item] of value.entries()) {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(item)) {
      issues.push(`${itemPath} 必须是对象`);
      continue;
    }
    registerId(item.id, itemPath, ids, issues);
    visit(item, itemPath);
  }
  return ids;
}

function requireIds(value: unknown, path: string, known: Set<string>, label: string, issues: string[]) {
  if (!Array.isArray(value)) return;
  for (const id of value) {
    if (!known.has(String(id))) issues.push(`${path} 引用了不存在的${label} ${String(id)}`);
  }
}

function assertStringList(value: unknown, path: string, issues: string[]) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    issues.push(`${path} 必须是字符串数组`);
  }
}

function registerId(id: unknown, path: string, ids: Set<string>, issues: string[]) {
  assertNonEmptyString(id, `${path}.id`, issues);
  if (typeof id !== "string" || id.trim() === "") return;
  if (ids.has(id)) issues.push(`${path}.id 重复：${id}`);
  ids.add(id);
}

function assertValid(issues: string[], label: string) {
  if (issues.length === 0) return;
  throw new Error(`${label} 校验失败：\n- ${issues.join("\n- ")}`);
}

function upsertById<T extends { id: string }>(items: T[], value: T) {
  const index = items.findIndex((item) => item.id === value.id);
  if (index === -1) items.push(value);
  else items[index] = value;
}

function removeById<T extends { id: string }>(items: T[], id: string) {
  const index = items.findIndex((item) => item.id === id);
  if (index !== -1) items.splice(index, 1);
}

function assertArray(value: unknown, path: string, issues: string[]) {
  if (!Array.isArray(value)) issues.push(`${path} 必须是数组`);
}

function assertObject(value: unknown, path: string, issues: string[]) {
  if (!isRecord(value)) issues.push(`${path} 必须是对象`);
}

function assertNonEmptyString(value: unknown, path: string, issues: string[]) {
  if (typeof value !== "string" || value.trim() === "") issues.push(`${path} 必须是非空字符串`);
}

function assertOptionalString(value: unknown, path: string, issues: string[]) {
  if (typeof value !== "string") issues.push(`${path} 必须是字符串`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
