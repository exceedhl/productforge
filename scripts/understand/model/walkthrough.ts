import {
  CHANGE_STATUSES,
  PARTICIPANT_TYPES,
  RELATION_TYPES,
  STEP_KINDS,
  type Participant,
  type Relation,
  type Scenario,
} from "./participant.ts";

export const SCHEMA_VERSION = 1;

export interface RepositoryInfo {
  root: string;
  commit: string;
  workingTreeFingerprint: string;
}

export interface GuideBlock {
  title: string;
  body: string;
}

export interface Guide {
  view?: "current" | "change";
  scope?: { label?: string };
  baseline?: string;
  conclusion?: string;
  architectureNotes?: { view: string; caption: string }[];
  userPaths?: GuideBlock[];
  sequenceNotes?: string[];
  algorithms?: { title: string; code: string }[];
  state?: string;
  rules?: { text: string; location?: string }[];
  reading?: { path?: string; label?: string; note?: string }[];
}

export interface Walkthrough {
  schemaVersion: number;
  revision: number;
  title?: string;
  focusParticipantId?: string;
  repository: RepositoryInfo;
  participants: Participant[];
  relations: Relation[];
  scenarios: Scenario[];
  guide?: Guide;
}

export interface PatchOperation {
  op: string;
  id?: string;
  value?: unknown;
}

export interface WalkthroughPatch {
  schemaVersion: number;
  baseRevision?: number;
  operations: PatchOperation[];
}

export function emptyWalkthrough(repository: Partial<RepositoryInfo> = {}): Walkthrough {
  return {
    schemaVersion: SCHEMA_VERSION,
    revision: 0,
    repository: {
      root: repository.root ?? "",
      commit: repository.commit ?? "",
      workingTreeFingerprint: repository.workingTreeFingerprint ?? "",
    },
    participants: [],
    relations: [],
    scenarios: [],
  };
}

export function validateWalkthrough(value: unknown): string[] {
  const issues: string[] = [];
  assertObject(value, "$", issues);
  if (issues.length > 0 || !isRecord(value)) return issues;

  if (value.schemaVersion !== SCHEMA_VERSION) {
    issues.push(`$.schemaVersion 必须等于 ${SCHEMA_VERSION}`);
  }
  if (!Number.isInteger(value.revision) || Number(value.revision) < 0) {
    issues.push("$.revision 必须是非负整数");
  }
  assertObject(value.repository, "$.repository", issues);
  if (value.entities !== undefined && value.participants === undefined) {
    issues.push("$.participants 缺失。参与方写在 participants，不要写 entities。");
  }
  assertArray(value.participants, "$.participants", issues);
  assertArray(value.relations, "$.relations", issues);
  assertArray(value.scenarios, "$.scenarios", issues);
  if (value.guide !== undefined) assertObject(value.guide, "$.guide", issues);
  if (value.focusParticipantId !== undefined) {
    assertNonEmptyString(value.focusParticipantId, "$.focusParticipantId", issues);
  }
  if (issues.length > 0) return issues;

  const participantIds = new Set<string>();
  const participants = value.participants as unknown[];
  for (const [index, participant] of participants.entries()) {
    const path = `$.participants[${index}]`;
    validateParticipant(participant, path, issues);
    registerId(isRecord(participant) ? participant.id : undefined, path, participantIds, issues);
  }

  for (const [index, participant] of participants.entries()) {
    if (!isRecord(participant) || !participant.parentId) continue;
    if (!participantIds.has(String(participant.parentId))) {
      issues.push(`$.participants[${index}].parentId 引用了不存在的参与方 ${String(participant.parentId)}`);
    }
  }

  if (typeof value.focusParticipantId === "string" && value.focusParticipantId.trim() !== "") {
    const focus = participants.find(
      (item) => isRecord(item) && item.id === value.focusParticipantId,
    );
    if (!focus) {
      issues.push(`$.focusParticipantId 引用了不存在的参与方 ${value.focusParticipantId}`);
    } else if (
      !participants.some((item) => isRecord(item) && item.parentId === value.focusParticipantId)
    ) {
      issues.push("$.focusParticipantId 必须指向有子参与方的参与方");
    }
  }

  const relationIds = new Set<string>();
  for (const [index, relation] of (value.relations as unknown[]).entries()) {
    const path = `$.relations[${index}]`;
    validateRelation(relation, path, participantIds, issues);
    registerId(isRecord(relation) ? relation.id : undefined, path, relationIds, issues);
  }

  const scenarioIds = new Set<string>();
  for (const [index, scenario] of (value.scenarios as unknown[]).entries()) {
    const path = `$.scenarios[${index}]`;
    validateScenario(scenario, path, participantIds, issues);
    registerId(isRecord(scenario) ? scenario.id : undefined, path, scenarioIds, issues);
  }

  return issues;
}

export function validatePatch(value: unknown): string[] {
  const issues: string[] = [];
  assertObject(value, "$", issues);
  if (issues.length > 0 || !isRecord(value)) return issues;

  if (value.schemaVersion !== SCHEMA_VERSION) {
    issues.push(`$.schemaVersion 必须等于 ${SCHEMA_VERSION}`);
  }
  if (
    value.baseRevision !== undefined &&
    (!Number.isInteger(value.baseRevision) || Number(value.baseRevision) < 0)
  ) {
    issues.push("$.baseRevision 必须是非负整数");
  }
  assertArray(value.operations, "$.operations", issues);
  if (issues.length > 0) return issues;

  const supportedOperations = new Set([
    "upsertParticipant",
    "removeParticipant",
    "upsertRelation",
    "removeRelation",
    "replaceScenario",
    "removeScenario",
    "setRepository",
  ]);
  for (const [index, operation] of (value.operations as unknown[]).entries()) {
    const path = `$.operations[${index}]`;
    assertObject(operation, path, issues);
    if (!isRecord(operation)) continue;
    if (operation.op === "upsertEntity" || operation.op === "removeEntity") {
      issues.push(`${path}.op 请使用 upsertParticipant / removeParticipant，不要使用 ${String(operation.op)}`);
      continue;
    }
    if (!supportedOperations.has(String(operation.op))) {
      issues.push(`${path}.op 不受支持：${String(operation.op)}`);
      continue;
    }
    if (operation.op === "setRepository") {
      assertObject(operation.value, `${path}.value`, issues);
    } else if (String(operation.op).startsWith("remove")) {
      assertNonEmptyString(operation.id, `${path}.id`, issues);
    } else {
      assertObject(operation.value, `${path}.value`, issues);
    }
  }
  return issues;
}

export function applyPatch(current: Walkthrough, patch: WalkthroughPatch): Walkthrough {
  assertValid(validateWalkthrough(current), "当前 Walkthrough");
  assertValid(validatePatch(patch), "Walkthrough patch");
  if (patch.baseRevision !== undefined && patch.baseRevision !== current.revision) {
    throw new Error(`Patch 基于 revision ${patch.baseRevision}，当前 revision 为 ${current.revision}`);
  }

  const next = structuredClone(current);
  for (const operation of patch.operations) {
    switch (operation.op) {
      case "upsertParticipant":
        upsertById(next.participants, operation.value as Participant);
        break;
      case "removeParticipant":
        removeParticipant(next, String(operation.id));
        break;
      case "upsertRelation":
        upsertById(next.relations, operation.value as Relation);
        break;
      case "removeRelation":
        removeById(next.relations, String(operation.id));
        break;
      case "replaceScenario":
        upsertById(next.scenarios, operation.value as Scenario);
        break;
      case "removeScenario":
        removeById(next.scenarios, String(operation.id));
        break;
      case "setRepository":
        next.repository = { ...next.repository, ...(operation.value as Partial<RepositoryInfo>) };
        break;
      default:
        break;
    }
  }

  next.revision += 1;
  assertValid(validateWalkthrough(next), "合并后的 Walkthrough");
  return next;
}

function validateParticipant(participant: unknown, path: string, issues: string[]) {
  assertObject(participant, path, issues);
  if (!isRecord(participant)) return;
  assertNonEmptyString(participant.id, `${path}.id`, issues);
  if (!PARTICIPANT_TYPES.includes(participant.type as (typeof PARTICIPANT_TYPES)[number])) {
    issues.push(`${path}.type 不受支持：${String(participant.type)}`);
  }
  assertNonEmptyString(participant.title, `${path}.title`, issues);
  for (const key of ["codeIdentity", "file", "responsibility", "parentId", "layer"]) {
    validateOptionalString(participant[key], `${path}.${key}`, issues);
  }
  validateOptionalStatus(participant.status, `${path}.status`, issues);
  validateEvidence(participant.evidence, `${path}.evidence`, issues);
}

function validateRelation(relation: unknown, path: string, participantIds: Set<string>, issues: string[]) {
  assertObject(relation, path, issues);
  if (!isRecord(relation)) return;
  assertNonEmptyString(relation.id, `${path}.id`, issues);
  if (relation.type === "contains") {
    issues.push(`${path}.type 不能是 contains。包含关系写在 parentId 上。`);
  } else if (!RELATION_TYPES.includes(relation.type as (typeof RELATION_TYPES)[number])) {
    issues.push(`${path}.type 不受支持：${String(relation.type)}`);
  }
  assertNonEmptyString(relation.sourceId, `${path}.sourceId`, issues);
  assertNonEmptyString(relation.targetId, `${path}.targetId`, issues);
  if (relation.sourceId && !participantIds.has(String(relation.sourceId))) {
    issues.push(`${path}.sourceId 引用了不存在的参与方 ${String(relation.sourceId)}`);
  }
  if (relation.targetId && !participantIds.has(String(relation.targetId))) {
    issues.push(`${path}.targetId 引用了不存在的参与方 ${String(relation.targetId)}`);
  }
  validateOptionalString(relation.label, `${path}.label`, issues);
  validateOptionalString(relation.protocol, `${path}.protocol`, issues);
  validateOptionalStatus(relation.status, `${path}.status`, issues);
  validateEvidence(relation.evidence, `${path}.evidence`, issues);
}

function validateScenario(scenario: unknown, path: string, participantIds: Set<string>, issues: string[]) {
  assertObject(scenario, path, issues);
  if (!isRecord(scenario)) return;
  assertNonEmptyString(scenario.id, `${path}.id`, issues);
  assertNonEmptyString(scenario.title, `${path}.title`, issues);
  assertArray(scenario.participantIds, `${path}.participantIds`, issues);
  assertArray(scenario.lanes, `${path}.lanes`, issues);
  assertArray(scenario.steps, `${path}.steps`, issues);
  if (!Array.isArray(scenario.participantIds) || !Array.isArray(scenario.steps)) return;

  const participants = new Set(scenario.participantIds);
  for (const [index, participantId] of scenario.participantIds.entries()) {
    assertNonEmptyString(participantId, `${path}.participantIds[${index}]`, issues);
    if (!participantIds.has(String(participantId))) {
      issues.push(`${path}.participantIds[${index}] 引用了不存在的参与方 ${String(participantId)}`);
    }
  }

  const laneIds = new Set<string>();
  for (const [index, lane] of (Array.isArray(scenario.lanes) ? scenario.lanes : []).entries()) {
    const lanePath = `${path}.lanes[${index}]`;
    assertObject(lane, lanePath, issues);
    if (!isRecord(lane)) continue;
    assertNonEmptyString(lane.id, `${lanePath}.id`, issues);
    assertNonEmptyString(lane.title, `${lanePath}.title`, issues);
    registerId(lane.id, lanePath, laneIds, issues);
  }

  let previousOrder = -Infinity;
  const stepIds = new Set<string>();
  for (const [index, step] of scenario.steps.entries()) {
    const stepPath = `${path}.steps[${index}]`;
    assertObject(step, stepPath, issues);
    if (!isRecord(step)) continue;
    registerId(step.id, stepPath, stepIds, issues);
    if (!Number.isFinite(step.order) || Number(step.order) <= previousOrder) {
      issues.push(`${stepPath}.order 必须按数组顺序严格递增`);
    }
    previousOrder = Number(step.order);
    if (!STEP_KINDS.includes(step.kind as (typeof STEP_KINDS)[number])) {
      issues.push(`${stepPath}.kind 不受支持：${String(step.kind)}`);
    }
    assertNonEmptyString(step.fromId, `${stepPath}.fromId`, issues);
    if (step.kind !== "note") assertNonEmptyString(step.toId, `${stepPath}.toId`, issues);
    for (const key of ["fromId", "toId"] as const) {
      if (step[key] && !participants.has(step[key])) {
        issues.push(`${stepPath}.${key} 不在 scenario.participantIds 中`);
      }
    }
    assertNonEmptyString(step.label, `${stepPath}.label`, issues);
    validateOptionalString(step.method, `${stepPath}.method`, issues);
    validateOptionalString(step.detail, `${stepPath}.detail`, issues);
    validateOptionalParams(step.params, `${stepPath}.params`, issues);
    if (step.laneId && !laneIds.has(String(step.laneId))) {
      issues.push(`${stepPath}.laneId 引用了不存在的 Lane ${String(step.laneId)}`);
    }
    if (step.branch !== undefined) {
      assertObject(step.branch, `${stepPath}.branch`, issues);
      if (!isRecord(step.branch) || !["start", "else", "end"].includes(String(step.branch.position))) {
        issues.push(`${stepPath}.branch.position 必须是 start、else 或 end`);
      } else {
        validateOptionalString(step.branch.label, `${stepPath}.branch.label`, issues);
      }
    }
    validateOptionalStatus(step.status, `${stepPath}.status`, issues);
    validateEvidence(step.evidence, `${stepPath}.evidence`, issues);
  }
}

function validateEvidence(evidence: unknown, path: string, issues: string[]) {
  if (evidence === undefined) return;
  assertArray(evidence, path, issues);
  if (!Array.isArray(evidence)) return;
  for (const [index, item] of evidence.entries()) {
    const itemPath = `${path}[${index}]`;
    assertObject(item, itemPath, issues);
    if (!isRecord(item)) continue;
    assertNonEmptyString(item.path, `${itemPath}.path`, issues);
    if (!Number.isInteger(item.startLine) || Number(item.startLine) < 1) {
      issues.push(`${itemPath}.startLine 必须是正整数`);
    }
    if (
      item.endLine !== undefined &&
      (!Number.isInteger(item.endLine) || Number(item.endLine) < Number(item.startLine))
    ) {
      issues.push(`${itemPath}.endLine 必须不小于 startLine`);
    }
  }
}

function removeParticipant(walkthrough: Walkthrough, id: string) {
  const child = walkthrough.participants.find((participant) => participant.parentId === id);
  if (child) {
    throw new Error(
      `不能删除 ${id}：仍有子参与方 ${child.id}。请先删除或改挂子参与方。包含关系写在 parentId 上，删除必须逐个声明。`,
    );
  }
  removeById(walkthrough.participants, id);
  walkthrough.relations = walkthrough.relations.filter(
    (relation) => relation.sourceId !== id && relation.targetId !== id,
  );
  walkthrough.scenarios = walkthrough.scenarios
    .map((scenario) => ({
      ...scenario,
      participantIds: scenario.participantIds.filter((participantId) => participantId !== id),
      steps: scenario.steps.filter((step) => step.fromId !== id && step.toId !== id),
    }))
    .filter((scenario) => scenario.participantIds.length > 0);
  if (walkthrough.focusParticipantId === id) delete walkthrough.focusParticipantId;
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

function assertValid(issues: string[], label: string) {
  if (issues.length === 0) return;
  throw new Error(`${label} 校验失败：\n- ${issues.join("\n- ")}`);
}

function registerId(id: unknown, path: string, ids: Set<string>, issues: string[]) {
  assertNonEmptyString(id, `${path}.id`, issues);
  if (typeof id !== "string" || id.trim() === "") return;
  if (ids.has(id)) issues.push(`${path}.id 重复：${id}`);
  ids.add(id);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertObject(value: unknown, path: string, issues: string[]) {
  if (!isRecord(value)) issues.push(`${path} 必须是对象`);
}

function assertArray(value: unknown, path: string, issues: string[]) {
  if (!Array.isArray(value)) issues.push(`${path} 必须是数组`);
}

function assertNonEmptyString(value: unknown, path: string, issues: string[]) {
  if (typeof value !== "string" || value.trim() === "") issues.push(`${path} 必须是非空字符串`);
}

function validateOptionalString(value: unknown, path: string, issues: string[]) {
  if (value !== undefined && typeof value !== "string") issues.push(`${path} 必须是字符串`);
}

function validateOptionalParams(value: unknown, path: string, issues: string[]) {
  if (value === undefined) return;
  if (typeof value === "string") return;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    issues.push(`${path} 必须是字符串，或非空字符串数组`);
  }
}

function validateOptionalStatus(value: unknown, path: string, issues: string[]) {
  if (value !== undefined && !CHANGE_STATUSES.includes(value as (typeof CHANGE_STATUSES)[number])) {
    issues.push(`${path} 不受支持：${String(value)}`);
  }
}
