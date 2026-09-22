import assert from "node:assert/strict";
import test from "node:test";
import { applyPatch, emptyWalkthrough, validateWalkthrough } from "./walkthrough.ts";

test("contains 不能通过校验", () => {
  const issues = validateWalkthrough({
    ...emptyWalkthrough(),
    participants: [
      { id: "component.billing", type: "component", title: "Billing" },
      { id: "unit.tool", type: "unit", title: "工具", parentId: "component.billing" },
    ],
    relations: [
      {
        id: "rel.contains",
        type: "contains",
        sourceId: "component.billing",
        targetId: "unit.tool",
      },
    ],
  });
  assert.ok(issues.some((issue) => issue.includes("parentId")));
});

test("没有子参与方的焦点不能通过校验", () => {
  const issues = validateWalkthrough({
    ...emptyWalkthrough(),
    focusParticipantId: "unit.tool",
    participants: [
      { id: "component.billing", type: "component", title: "Billing" },
      { id: "unit.tool", type: "unit", title: "工具", parentId: "component.billing" },
    ],
    relations: [],
  });
  assert.ok(issues.some((issue) => issue.includes("有子参与方")));
});

test("Module 可以作为焦点", () => {
  const issues = validateWalkthrough({
    ...emptyWalkthrough(),
    focusParticipantId: "module.writer",
    participants: [
      { id: "module.writer", type: "module", title: "写入" },
      { id: "unit.tool", type: "unit", title: "工具", parentId: "module.writer" },
    ],
    relations: [],
  });
  assert.deepEqual(issues, []);
});

test("删除仍有子参与方的 Component 会拒绝", () => {
  const walkthrough = emptyWalkthrough();
  walkthrough.participants.push(
    { id: "component.billing", type: "component", title: "Billing" },
    { id: "unit.tool", type: "unit", title: "工具", parentId: "component.billing" },
  );
  assert.throws(
    () =>
      applyPatch(walkthrough, {
        schemaVersion: 1,
        operations: [{ op: "removeParticipant", id: "component.billing" }],
      }),
    /仍有子参与方 unit\.tool/,
  );
});
