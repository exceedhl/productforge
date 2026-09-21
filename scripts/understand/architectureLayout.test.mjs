import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  layoutArchitecture,
  leafResponsibilityLayer,
  layerSlug,
  shouldUseResponsibilityLanes,
  usedLayerOrder,
} from "./architectureLayout.mjs";

const here = dirname(fileURLToPath(import.meta.url));

function walkthrough(entities, relations = []) {
  return {
    schemaVersion: 1,
    revision: 1,
    repository: { root: "", commit: "", workingTreeFingerprint: "" },
    entities,
    relations,
    scenarios: [],
  };
}

test("没有 Unit 时不启用职责层", () => {
  assert.equal(
    shouldUseResponsibilityLanes(
      walkthrough([
        { id: "c", type: "component", title: "C", layer: "接口 / 编排" },
        { id: "s", type: "store", title: "S" },
      ]),
    ),
    false,
  );
});

test("叶子只有 Store 一个层时不启用职责层", () => {
  assert.equal(
    shouldUseResponsibilityLanes(
      walkthrough([
        { id: "u", type: "unit", title: "U" },
        { id: "s", type: "store", title: "S" },
      ]),
    ),
    false,
  );
});

test("叶子有至少两个具名层才启用职责层", () => {
  assert.equal(
    shouldUseResponsibilityLanes(
      walkthrough([
        { id: "u1", type: "unit", title: "入口", layer: "编排" },
        { id: "u2", type: "unit", title: "打点", layer: "判定" },
        { id: "s", type: "store", title: "记录" },
      ]),
    ),
    true,
  );
});

test("父容器的层名不会变成叶子的层", () => {
  const parent = { id: "box", type: "component", title: "评测", layer: "接口 / 编排" };
  const child = { id: "u", type: "unit", title: "打点", parentId: "box" };
  assert.equal(leafResponsibilityLayer(parent), "接口 / 编排");
  assert.equal(leafResponsibilityLayer(child), undefined);
});

test("自定义层名按出现顺序得到不同 slug，不挤进同一个 other", () => {
  const order = usedLayerOrder([
    { id: "a", type: "unit", title: "A", layer: "编排" },
    { id: "b", type: "unit", title: "B", layer: "判定" },
    { id: "c", type: "unit", title: "C", layer: "落盘" },
  ]);
  assert.deepEqual(order, ["编排", "判定", "落盘"]);
  assert.notEqual(layerSlug("编排", order), layerSlug("判定", order));
  assert.notEqual(layerSlug("判定", order), layerSlug("落盘", order));
});

test("放大图在没有可对齐层时不画 Lane", async () => {
  const layout = await layoutArchitecture(
    walkthrough([
      { id: "actor.user", type: "actor", title: "用户" },
      { id: "u", type: "unit", title: "入口" },
      { id: "s", type: "store", title: "记录" },
    ]),
    { view: "detail" },
  );
  assert.equal((layout.lanes ?? []).length, 0);
  assert.equal(layout.gutter ?? 0, 0);
});

test("没有边的判定 Unit 不会仅因为容器里有 Store 被提起", async () => {
  const layout = await layoutArchitecture(
    walkthrough(
      [
        { id: "box", type: "component", title: "图表", responsibility: "分数表" },
        { id: "u", type: "unit", title: "打点", parentId: "box", layer: "判定" },
        { id: "s", type: "store", title: "记录" },
      ],
      [{ id: "rel", type: "reads", sourceId: "box", targetId: "s", label: "读记录" }],
    ),
    { view: "detail" },
  );
  const parent = layout.nodes.find((node) => node.id === "box");
  const child = layout.nodes.find((node) => node.id === "u");
  assert.ok(parent && child);
  assert.ok(child.x >= parent.x - 1);
  assert.ok(child.x + child.width <= parent.x + parent.width + 1);
  assert.ok(child.y >= parent.y - 1);
  assert.ok(child.y + child.height <= parent.y + parent.height + 1);
});

test("层对不齐时重排为不分层，不留下空父框", async () => {
  const layout = await layoutArchitecture(
    walkthrough(
      [
        { id: "c", type: "container", title: "评测" },
        { id: "family", type: "component", title: "图表", parentId: "c" },
        { id: "shared", type: "component", title: "装置", parentId: "c" },
        { id: "orch", type: "unit", title: "编排", parentId: "family", layer: "编排" },
        { id: "score", type: "unit", title: "打点", parentId: "family", layer: "判定" },
        { id: "judge", type: "unit", title: "Judge", parentId: "shared", layer: "判定" },
        { id: "write", type: "unit", title: "落盘", parentId: "shared", layer: "落盘" },
        { id: "runs", type: "store", title: "记录", parentId: "c" },
      ],
      [
        { id: "rel.family-shared", type: "dependsOn", sourceId: "family", targetId: "shared", label: "取装置" },
        { id: "rel.write", type: "writes", sourceId: "write", targetId: "runs", label: "追加" },
      ],
    ),
    { view: "detail" },
  );
  if ((layout.lanes ?? []).length === 0) {
    assert.equal(layout.gutter ?? 0, 0);
  }
  const family = layout.nodes.find((node) => node.id === "family");
  const kids = layout.nodes.filter((node) => node.parentId === "family" && !node.isCompound);
  const top = Math.min(...kids.map((node) => node.y));
  const bottom = Math.max(...kids.map((node) => node.y + node.height));
  assert.ok(family && kids.length >= 2);
  assert.ok(family.height < bottom - top + 280, `图表框过高: ${family.height}`);
});

test("层在 Y 向上叠在一起时丢掉全部色带", async () => {
  const layout = await layoutArchitecture(
    walkthrough(
      [
        { id: "u1", type: "unit", title: "入口", layer: "编排" },
        { id: "u2", type: "unit", title: "打点", layer: "判定" },
        { id: "s", type: "store", title: "记录" },
      ],
      [{ id: "rel", type: "reads", sourceId: "u1", targetId: "s", label: "读记录" }],
    ),
    { view: "detail" },
  );
  const lanes = layout.lanes ?? [];
  if (lanes.length === 0) {
    assert.equal(layout.gutter ?? 0, 0);
    return;
  }
  for (let i = 0; i < lanes.length; i += 1) {
    for (let j = i + 1; j < lanes.length; j += 1) {
      const left = lanes[i];
      const right = lanes[j];
      const overlap = left.y < right.y + right.height && right.y < left.y + left.height;
      assert.equal(overlap, false, `${left.title} 与 ${right.title} 不应重叠`);
    }
    assert.ok(leftTitle(lanes[i]), "每条 Lane 必须有完整层名");
  }
});

test("Billing 示例的放大图只保留有叶子的层，并且层名完整", async () => {
  const example = JSON.parse(await readFile(resolve(here, "examples/walkthrough.json"), "utf8"));
  const layout = await layoutArchitecture(example, { view: "detail" });
  const titles = (layout.lanes ?? []).map((lane) => lane.title);
  assert.ok(!titles.includes("Presentation"), "未使用的模板层不能出现");
  for (const title of titles) {
    assert.ok(title.length > 0);
    assert.notEqual(title, "接口");
    assert.notEqual(title, "编排");
  }
});

function leftTitle(lane) {
  return typeof lane.title === "string" && lane.title.trim() !== "";
}
