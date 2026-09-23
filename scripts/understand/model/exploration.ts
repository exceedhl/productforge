export const ANALYSIS_STATUSES = [
  "discovered",
  "traced",
  "evidence-confirmed",
  "summarized",
  "rendered",
] as const;

export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];

export const VIEW_STATUSES = ["planned", "indexing", "tracing", "ready", "partial"] as const;

export type ViewStatus = (typeof VIEW_STATUSES)[number];

export const SLIDE_KINDS = [
  "summary",
  "architecture",
  "sequence",
  "state",
  "algorithm",
  "reading",
  "unknowns",
] as const;

export type SlideKind = (typeof SLIDE_KINDS)[number];

export interface AnalysisBudget {
  maxFiles: number;
  maxSymbols: number;
  maxCallDepth: number;
  maxScenarios: number;
  maxSlides: number;
}

export const DEFAULT_BUDGET: AnalysisBudget = {
  maxFiles: 40,
  maxSymbols: 80,
  maxCallDepth: 4,
  maxScenarios: 2,
  maxSlides: 4,
};

export interface ScenarioScope {
  id: string;
  kind: "scenario";
  title: string;
  actor?: string;
  trigger: string;
  expectedOutcome?: string;
  status: AnalysisStatus;
}

export interface AreaScope {
  id: string;
  kind: "area";
  title: string;
  targetRefs: string[];
  depth: "overview" | "standard" | "deep";
  status: AnalysisStatus;
}

export type Scope = ScenarioScope | AreaScope;

export interface SlideSpec {
  id: string;
  kind: SlideKind;
  title: string;
  sourceIds: string[];
  focusId?: string;
}

export interface UnderstandView {
  schemaVersion: 1;
  id: string;
  scopeId: string;
  mode: "current" | "change";
  status: ViewStatus;
  selectedCapabilityIds: string[];
  selectedScenarioIds: string[];
  slideSpecs: SlideSpec[];
  budget: AnalysisBudget;
  completedQuestions: string[];
  unresolvedQuestions: string[];
  generatedFromRevision: number;
}

export function emptyView(scopeId: string, id = "current"): UnderstandView {
  return {
    schemaVersion: 1,
    id,
    scopeId,
    mode: "current",
    status: "planned",
    selectedCapabilityIds: [],
    selectedScenarioIds: [],
    slideSpecs: [],
    budget: { ...DEFAULT_BUDGET },
    completedQuestions: [],
    unresolvedQuestions: [],
    generatedFromRevision: 0,
  };
}

export function validateView(value: unknown): string[] {
  const issues: string[] = [];
  if (!isRecord(value)) return ["$ 必须是对象"];
  if (value.schemaVersion !== 1) issues.push("$.schemaVersion 必须等于 1");
  assertSlug(value.id, "$.id", issues);
  assertNonEmptyString(value.scopeId, "$.scopeId", issues);
  if (value.mode !== "current" && value.mode !== "change") issues.push("$.mode 必须是 current 或 change");
  if (!VIEW_STATUSES.includes(value.status as ViewStatus)) {
    issues.push(`$.status 不受支持：${String(value.status)}`);
  }
  assertStringArray(value.selectedCapabilityIds, "$.selectedCapabilityIds", issues);
  assertStringArray(value.selectedScenarioIds, "$.selectedScenarioIds", issues);
  assertStringArray(value.completedQuestions, "$.completedQuestions", issues);
  assertStringArray(value.unresolvedQuestions, "$.unresolvedQuestions", issues);
  if (!Number.isInteger(value.generatedFromRevision) || Number(value.generatedFromRevision) < 0) {
    issues.push("$.generatedFromRevision 必须是非负整数");
  }
  validateBudget(value.budget, "$.budget", issues);
  if (!Array.isArray(value.slideSpecs)) {
    issues.push("$.slideSpecs 必须是数组");
    return issues;
  }
  if (value.slideSpecs.length > DEFAULT_BUDGET.maxSlides * 3) {
    issues.push(`$.slideSpecs 超过 ${DEFAULT_BUDGET.maxSlides * 3} 张`);
  }
  const ids = new Set<string>();
  for (const [index, slide] of value.slideSpecs.entries()) {
    const path = `$.slideSpecs[${index}]`;
    if (!isRecord(slide)) {
      issues.push(`${path} 必须是对象`);
      continue;
    }
    assertSlug(slide.id, `${path}.id`, issues);
    if (typeof slide.id === "string" && ids.has(slide.id)) issues.push(`${path}.id 重复：${slide.id}`);
    if (typeof slide.id === "string") ids.add(slide.id);
    if (!SLIDE_KINDS.includes(slide.kind as SlideKind)) issues.push(`${path}.kind 不受支持：${String(slide.kind)}`);
    assertNonEmptyString(slide.title, `${path}.title`, issues);
    assertStringArray(slide.sourceIds, `${path}.sourceIds`, issues);
    if (slide.focusId !== undefined) assertNonEmptyString(slide.focusId, `${path}.focusId`, issues);
  }
  return issues;
}

function validateBudget(value: unknown, path: string, issues: string[]) {
  if (!isRecord(value)) {
    issues.push(`${path} 必须是对象`);
    return;
  }
  for (const key of ["maxFiles", "maxSymbols", "maxCallDepth", "maxScenarios", "maxSlides"] as const) {
    if (!Number.isInteger(value[key]) || Number(value[key]) < 1) {
      issues.push(`${path}.${key} 必须是正整数`);
    }
  }
}

function assertSlug(value: unknown, path: string, issues: string[]) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/u.test(value)) {
    issues.push(`${path} 必须是字母或数字开头的短标识`);
  }
}

function assertNonEmptyString(value: unknown, path: string, issues: string[]) {
  if (typeof value !== "string" || value.trim() === "") issues.push(`${path} 必须是非空字符串`);
}

function assertStringArray(value: unknown, path: string, issues: string[]) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    issues.push(`${path} 必须是字符串数组`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
