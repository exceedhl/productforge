import assert from "node:assert/strict";
import test from "node:test";
import { emptyView, validateView } from "./exploration.ts";
import { applyKnowledgePatch, emptyKnowledge, validateKnowledge } from "./knowledge.ts";
import { projectKnowledgeToWalkthrough } from "../project/knowledgeToWalkthrough.ts";

test("空 Knowledge 可以通过校验", () => {
  assert.deepEqual(validateKnowledge(emptyKnowledge()), []);
});

test("场景范围必须有触发条件，已确认判断必须有证据", () => {
  const knowledge = emptyKnowledge();
  knowledge.scopes.push({
    id: "scope.refresh",
    kind: "scenario",
    title: "刷新",
    trigger: "",
    status: "discovered",
  });
  assert.ok(validateKnowledge(knowledge).some((issue) => issue.includes("trigger")));

  const confirmed = emptyKnowledge();
  confirmed.claims.push({
    id: "claim.owner",
    subjectId: "unit.refresh",
    kind: "ownership",
    text: "刷新结果由后端保存",
    certainty: "confirmed",
    evidenceIds: [],
    producedBy: "llm",
  });
  assert.ok(validateKnowledge(confirmed).some((issue) => issue.includes("evidenceIds")));
});

test("patch 合并判断，并把算法和状态投影成文字", () => {
  const next = applyKnowledgePatch(emptyKnowledge({ root: "/repo" }), {
    schemaVersion: 2,
    operations: [
      {
        op: "upsertEvidence",
        value: { id: "evidence.refresh", source: "code", path: "widgetRefresh.ts", startLine: 3, endLine: 8 },
      },
      {
        op: "upsertScope",
        value: {
          id: "scope.refresh",
          kind: "scenario",
          title: "刷新 Widget",
          trigger: "用户点击刷新",
          expectedOutcome: "看到最新结果",
          status: "summarized",
        },
      },
      {
        op: "upsertAlgorithm",
        value: {
          id: "algorithm.refresh",
          title: "刷新判定",
          trigger: "收到 id",
          inputs: [{ name: "id", meaning: "当前 Widget" }],
          outputs: [{ name: "status", meaning: "用户可见状态" }],
          pseudocode: "if (!id) throw missing\nreturn ready",
          invariants: ["缺少 id 时不写结果"],
          failureCases: ["id 为空"],
          relatedScenarioIds: [],
          evidenceIds: ["evidence.refresh"],
          certainty: "confirmed",
        },
      },
      {
        op: "upsertStateModel",
        value: {
          id: "state.refresh",
          title: "刷新状态",
          states: [
            { id: "state.empty", title: "空" },
            { id: "state.ready", title: "就绪" },
          ],
          transitions: [{ id: "transition.ready", from: "state.empty", to: "state.ready", trigger: "读到草稿" }],
          readers: ["StatusView"],
          writers: ["refreshWidget"],
          persistence: "memory",
          evidenceIds: ["evidence.refresh"],
        },
      },
    ],
  });
  assert.equal(next.revision, 1);
  assert.equal(next.algorithms[0]?.certainty, "confirmed");
  const walkthrough = projectKnowledgeToWalkthrough(next);
  assert.match(walkthrough.guide?.algorithms?.[0]?.code ?? "", /throw missing/);
  assert.match(walkthrough.guide?.state ?? "", /空 → 就绪/);
  assert.equal(walkthrough.scenarios.length, 0);
});

test("View 要求预算和短标识", () => {
  assert.deepEqual(validateView(emptyView("scope.refresh")), []);
  const view = emptyView("scope.refresh", "当前");
  assert.ok(validateView(view).some((issue) => issue.includes("id")));
});
