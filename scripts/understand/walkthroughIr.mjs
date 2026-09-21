export const SCHEMA_VERSION = 1;

const ENTITY_TYPES = new Set([
  "actor",
  "system",
  "container",
  "component",
  "module",
  "unit",
  "contract",
  "store",
]);
const RELATION_TYPES = new Set([
  "contains",
  "calls",
  "reads",
  "writes",
  "implements",
  "dependsOn",
  "publishes",
  "subscribes",
]);
const STEP_TYPES = new Set(["call", "return", "async", "note"]);
const CHANGE_STATUSES = new Set(["context", "added", "removed", "modified", "moved"]);

export function emptyWalkthrough(repository = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    revision: 0,
    repository: {
      root: repository.root ?? "",
      commit: repository.commit ?? "",
      workingTreeFingerprint: repository.workingTreeFingerprint ?? "",
    },
    entities: [],
    relations: [],
    scenarios: [],
  };
}

export function validateWalkthrough(value) {
  const issues = [];
  assertObject(value, "$", issues);
  if (issues.length > 0) return issues;

  if (value.schemaVersion !== SCHEMA_VERSION) {
    issues.push(`$.schemaVersion 必须等于 ${SCHEMA_VERSION}`);
  }
  if (!Number.isInteger(value.revision) || value.revision < 0) {
    issues.push("$.revision 必须是非负整数");
  }
  assertObject(value.repository, "$.repository", issues);
  assertArray(value.entities, "$.entities", issues);
  assertArray(value.relations, "$.relations", issues);
  assertArray(value.scenarios, "$.scenarios", issues);
  if (value.guide !== undefined) {
    assertObject(value.guide, "$.guide", issues);
  }
  if (issues.length > 0) return issues;

  const entityIds = new Set();
  for (const [index, entity] of value.entities.entries()) {
    const path = `$.entities[${index}]`;
    validateEntity(entity, path, issues);
    registerId(entity?.id, path, entityIds, issues);
  }

  for (const [index, entity] of value.entities.entries()) {
    if (entity?.parentId && !entityIds.has(entity.parentId)) {
      issues.push(`$.entities[${index}].parentId 引用了不存在的实体 ${entity.parentId}`);
    }
  }

  const relationIds = new Set();
  for (const [index, relation] of value.relations.entries()) {
    const path = `$.relations[${index}]`;
    validateRelation(relation, path, entityIds, issues);
    registerId(relation?.id, path, relationIds, issues);
  }

  const scenarioIds = new Set();
  for (const [index, scenario] of value.scenarios.entries()) {
    const path = `$.scenarios[${index}]`;
    validateScenario(scenario, path, entityIds, issues);
    registerId(scenario?.id, path, scenarioIds, issues);
  }

  return issues;
}

export function validatePatch(value) {
  const issues = [];
  assertObject(value, "$", issues);
  if (issues.length > 0) return issues;

  if (value.schemaVersion !== SCHEMA_VERSION) {
    issues.push(`$.schemaVersion 必须等于 ${SCHEMA_VERSION}`);
  }
  if (
    value.baseRevision !== undefined &&
    (!Number.isInteger(value.baseRevision) || value.baseRevision < 0)
  ) {
    issues.push("$.baseRevision 必须是非负整数");
  }
  assertArray(value.operations, "$.operations", issues);
  if (issues.length > 0) return issues;

  const supportedOperations = new Set([
    "upsertEntity",
    "removeEntity",
    "upsertRelation",
    "removeRelation",
    "replaceScenario",
    "removeScenario",
    "setRepository",
  ]);
  for (const [index, operation] of value.operations.entries()) {
    const path = `$.operations[${index}]`;
    assertObject(operation, path, issues);
    if (!supportedOperations.has(operation?.op)) {
      issues.push(`${path}.op 不受支持：${String(operation?.op)}`);
      continue;
    }
    if (operation.op === "setRepository") {
      assertObject(operation.value, `${path}.value`, issues);
    } else if (operation.op.startsWith("remove")) {
      assertNonEmptyString(operation.id, `${path}.id`, issues);
    } else {
      assertObject(operation.value, `${path}.value`, issues);
    }
  }
  return issues;
}

export function applyPatch(current, patch) {
  assertValid(validateWalkthrough(current), "当前 Walkthrough IR");
  assertValid(validatePatch(patch), "Walkthrough patch");
  if (patch.baseRevision !== undefined && patch.baseRevision !== current.revision) {
    throw new Error(
      `Patch 基于 revision ${patch.baseRevision}，当前 revision 为 ${current.revision}`,
    );
  }

  const next = structuredClone(current);
  for (const operation of patch.operations) {
    switch (operation.op) {
      case "upsertEntity":
        upsertById(next.entities, operation.value);
        break;
      case "removeEntity":
        removeEntity(next, operation.id);
        break;
      case "upsertRelation":
        upsertById(next.relations, operation.value);
        break;
      case "removeRelation":
        removeById(next.relations, operation.id);
        break;
      case "replaceScenario":
        upsertById(next.scenarios, operation.value);
        break;
      case "removeScenario":
        removeById(next.scenarios, operation.id);
        break;
      case "setRepository":
        next.repository = { ...next.repository, ...operation.value };
        break;
    }
  }

  next.revision += 1;
  assertValid(validateWalkthrough(next), "合并后的 Walkthrough IR");
  return next;
}

function validateEntity(entity, path, issues) {
  assertObject(entity, path, issues);
  if (!entity || typeof entity !== "object") return;
  assertNonEmptyString(entity.id, `${path}.id`, issues);
  if (!ENTITY_TYPES.has(entity.type)) {
    issues.push(`${path}.type 不受支持：${String(entity.type)}`);
  }
  assertNonEmptyString(entity.title, `${path}.title`, issues);
  validateOptionalString(entity.codeIdentity, `${path}.codeIdentity`, issues);
  validateOptionalString(entity.file, `${path}.file`, issues);
  validateOptionalString(entity.responsibility, `${path}.responsibility`, issues);
  validateOptionalString(entity.parentId, `${path}.parentId`, issues);
  validateOptionalString(entity.layer, `${path}.layer`, issues);
  validateOptionalStatus(entity.status, `${path}.status`, issues);
  validateEvidence(entity.evidence, `${path}.evidence`, issues);
}

function validateRelation(relation, path, entityIds, issues) {
  assertObject(relation, path, issues);
  if (!relation || typeof relation !== "object") return;
  assertNonEmptyString(relation.id, `${path}.id`, issues);
  if (!RELATION_TYPES.has(relation.type)) {
    issues.push(`${path}.type 不受支持：${String(relation.type)}`);
  }
  assertNonEmptyString(relation.sourceId, `${path}.sourceId`, issues);
  assertNonEmptyString(relation.targetId, `${path}.targetId`, issues);
  if (relation.sourceId && !entityIds.has(relation.sourceId)) {
    issues.push(`${path}.sourceId 引用了不存在的实体 ${relation.sourceId}`);
  }
  if (relation.targetId && !entityIds.has(relation.targetId)) {
    issues.push(`${path}.targetId 引用了不存在的实体 ${relation.targetId}`);
  }
  validateOptionalString(relation.label, `${path}.label`, issues);
  validateOptionalString(relation.protocol, `${path}.protocol`, issues);
  validateOptionalStatus(relation.status, `${path}.status`, issues);
  validateEvidence(relation.evidence, `${path}.evidence`, issues);
}

function validateScenario(scenario, path, entityIds, issues) {
  assertObject(scenario, path, issues);
  if (!scenario || typeof scenario !== "object") return;
  assertNonEmptyString(scenario.id, `${path}.id`, issues);
  assertNonEmptyString(scenario.title, `${path}.title`, issues);
  assertArray(scenario.participantIds, `${path}.participantIds`, issues);
  assertArray(scenario.lanes, `${path}.lanes`, issues);
  assertArray(scenario.steps, `${path}.steps`, issues);
  if (!Array.isArray(scenario.participantIds) || !Array.isArray(scenario.steps)) return;

  const participants = new Set(scenario.participantIds);
  for (const [index, entityId] of scenario.participantIds.entries()) {
    assertNonEmptyString(entityId, `${path}.participantIds[${index}]`, issues);
    if (!entityIds.has(entityId)) {
      issues.push(`${path}.participantIds[${index}] 引用了不存在的实体 ${entityId}`);
    }
  }

  const laneIds = new Set();
  for (const [index, lane] of (scenario.lanes ?? []).entries()) {
    const lanePath = `${path}.lanes[${index}]`;
    assertObject(lane, lanePath, issues);
    assertNonEmptyString(lane?.id, `${lanePath}.id`, issues);
    assertNonEmptyString(lane?.title, `${lanePath}.title`, issues);
    registerId(lane?.id, lanePath, laneIds, issues);
  }

  let previousOrder = -Infinity;
  const stepIds = new Set();
  for (const [index, step] of scenario.steps.entries()) {
    const stepPath = `${path}.steps[${index}]`;
    assertObject(step, stepPath, issues);
    registerId(step?.id, stepPath, stepIds, issues);
    if (!Number.isFinite(step?.order) || step.order <= previousOrder) {
      issues.push(`${stepPath}.order 必须按数组顺序严格递增`);
    }
    previousOrder = step?.order;
    if (!STEP_TYPES.has(step?.kind)) {
      issues.push(`${stepPath}.kind 不受支持：${String(step?.kind)}`);
    }
    assertNonEmptyString(step?.fromId, `${stepPath}.fromId`, issues);
    if (step?.kind !== "note") {
      assertNonEmptyString(step?.toId, `${stepPath}.toId`, issues);
    }
    for (const key of ["fromId", "toId"]) {
      if (step?.[key] && !participants.has(step[key])) {
        issues.push(`${stepPath}.${key} 不在 scenario.participantIds 中`);
      }
    }
    assertNonEmptyString(step?.label, `${stepPath}.label`, issues);
    validateOptionalString(step?.method, `${stepPath}.method`, issues);
    validateOptionalString(step?.detail, `${stepPath}.detail`, issues);
    validateOptionalParams(step?.params, `${stepPath}.params`, issues);
    if (step?.laneId && !laneIds.has(step.laneId)) {
      issues.push(`${stepPath}.laneId 引用了不存在的 Lane ${step.laneId}`);
    }
    if (step?.branch !== undefined) {
      assertObject(step.branch, `${stepPath}.branch`, issues);
      if (!["start", "else", "end"].includes(step.branch?.position)) {
        issues.push(`${stepPath}.branch.position 必须是 start、else 或 end`);
      }
      validateOptionalString(step.branch?.label, `${stepPath}.branch.label`, issues);
    }
    validateOptionalStatus(step?.status, `${stepPath}.status`, issues);
    validateEvidence(step?.evidence, `${stepPath}.evidence`, issues);
  }
}

function validateEvidence(evidence, path, issues) {
  if (evidence === undefined) return;
  assertArray(evidence, path, issues);
  if (!Array.isArray(evidence)) return;
  for (const [index, item] of evidence.entries()) {
    const itemPath = `${path}[${index}]`;
    assertObject(item, itemPath, issues);
    assertNonEmptyString(item?.path, `${itemPath}.path`, issues);
    if (!Number.isInteger(item?.startLine) || item.startLine < 1) {
      issues.push(`${itemPath}.startLine 必须是正整数`);
    }
    if (
      item?.endLine !== undefined &&
      (!Number.isInteger(item.endLine) || item.endLine < item.startLine)
    ) {
      issues.push(`${itemPath}.endLine 必须不小于 startLine`);
    }
  }
}

function removeEntity(walkthrough, id) {
  removeById(walkthrough.entities, id);
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
}

function upsertById(items, value) {
  const index = items.findIndex((item) => item.id === value.id);
  if (index === -1) items.push(value);
  else items[index] = value;
}

function removeById(items, id) {
  const index = items.findIndex((item) => item.id === id);
  if (index !== -1) items.splice(index, 1);
}

function assertValid(issues, label) {
  if (issues.length === 0) return;
  throw new Error(`${label} 校验失败：\n- ${issues.join("\n- ")}`);
}

function registerId(id, path, ids, issues) {
  assertNonEmptyString(id, `${path}.id`, issues);
  if (!id) return;
  if (ids.has(id)) issues.push(`${path}.id 重复：${id}`);
  ids.add(id);
}

function assertObject(value, path, issues) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    issues.push(`${path} 必须是对象`);
  }
}

function assertArray(value, path, issues) {
  if (!Array.isArray(value)) issues.push(`${path} 必须是数组`);
}

function assertNonEmptyString(value, path, issues) {
  if (typeof value !== "string" || value.trim() === "") {
    issues.push(`${path} 必须是非空字符串`);
  }
}

function validateOptionalString(value, path, issues) {
  if (value !== undefined && typeof value !== "string") {
    issues.push(`${path} 必须是字符串`);
  }
}

function validateOptionalParams(value, path, issues) {
  if (value === undefined) return;
  if (typeof value === "string") return;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    issues.push(`${path} 必须是字符串，或非空字符串数组`);
  }
}

function validateOptionalStatus(value, path, issues) {
  if (value !== undefined && !CHANGE_STATUSES.has(value)) {
    issues.push(`${path} 不受支持：${String(value)}`);
  }
}
