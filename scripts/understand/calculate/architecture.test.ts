import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  calculateArchitecture,
  leafResponsibilityLayer,
  layerSlug,
  shouldUseResponsibilityLanes,
  usedLayerOrder,
} from "./architecture.ts";
import { measureBox } from "./measure.ts";
import { resolveFocusId } from "../scope/architecture.ts";

const here = dirname(fileURLToPath(import.meta.url));

function walkthrough(participants, relations: { id: string; type: string; sourceId: string; targetId: string; label?: string }[] = []) {
  return {
    schemaVersion: 1,
    revision: 1,
    repository: { root: "", commit: "", workingTreeFingerprint: "" },
    participants,
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
  const layout = await calculateArchitecture(
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
  const layout = await calculateArchitecture(
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

test("多个参与方都有内部后代且未指定焦点时，不画整图，全图保留各内部节点", async () => {
  const data = walkthrough(
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
  );
  assert.equal(resolveFocusId(data), undefined);
  assert.equal(await calculateArchitecture(data, { view: "overview" }), null);
  const layout = await calculateArchitecture(data, { view: "detail" });
  assert.ok(layout.nodes.some((node) => node.id === "orch"));
  assert.ok(layout.nodes.some((node) => node.id === "write"));
});

test("指定焦点后只展开该 Component", async () => {
  const layout = await calculateArchitecture(
    {
      ...walkthrough(
        [
          { id: "c", type: "container", title: "评测" },
          { id: "family", type: "component", title: "图表", parentId: "c" },
          { id: "shared", type: "component", title: "装置", parentId: "c" },
          { id: "orch", type: "unit", title: "编排", parentId: "family", layer: "编排" },
          { id: "score", type: "unit", title: "打点", parentId: "family", layer: "判定" },
          { id: "judge", type: "unit", title: "Judge", parentId: "shared", layer: "判定" },
          { id: "write", type: "unit", title: "落盘", parentId: "shared", layer: "落盘" },
        ],
        [{ id: "rel.family-shared", type: "dependsOn", sourceId: "family", targetId: "shared", label: "取装置" }],
      ),
      focusParticipantId: "family",
    },
    { view: "detail" },
  );
  assert.ok(layout.nodes.some((node) => node.id === "orch"));
  assert.equal(layout.nodes.some((node) => node.id === "judge" || node.id === "write"), false);
  assert.ok(layout.nodes.some((node) => node.id === "shared"));
  assert.ok(layout.nodes.some((node) => node.id === "c"));
});

test("与焦点子树没有边的参与方不出现", async () => {
  const layout = await calculateArchitecture(
    {
      ...walkthrough([
        { id: "family", type: "component", title: "图表" },
        { id: "orch", type: "unit", title: "编排", parentId: "family" },
        { id: "other", type: "store", title: "别的记录" },
      ]),
      focusParticipantId: "family",
    },
    { view: "detail" },
  );
  assert.equal(layout.nodes.some((node) => node.id === "other"), false);
  assert.ok(layout.nodes.some((node) => node.id === "orch"));
});

test("整图收起后只剩一个框时不画整图", async () => {
  const data = {
    ...walkthrough([
      { id: "family", type: "component", title: "图表" },
      { id: "orch", type: "unit", title: "编排", parentId: "family" },
    ]),
    focusParticipantId: "family",
  };
  assert.equal(await calculateArchitecture(data, { view: "overview" }), null);
  const detail = await calculateArchitecture(data, { view: "detail" });
  assert.ok(detail.nodes.some((node) => node.id === "orch"));
});

test("焦点可以是 Module，只展开该 Module", async () => {
  const layout = await calculateArchitecture(
    {
      ...walkthrough(
        [
          { id: "comp", type: "component", title: "绘制" },
          { id: "svg", type: "module", title: "架构 SVG", parentId: "comp" },
          { id: "lanes", type: "unit", title: "画色带", parentId: "svg" },
          { id: "box", type: "module", title: "参与方框", parentId: "comp" },
          { id: "entity", type: "unit", title: "画框", parentId: "box" },
        ],
        [{ id: "rel", type: "calls", sourceId: "svg", targetId: "box", label: "画框" }],
      ),
      focusParticipantId: "svg",
    },
    { view: "detail" },
  );
  assert.ok(layout.nodes.some((node) => node.id === "lanes"));
  assert.equal(layout.nodes.some((node) => node.id === "entity"), false);
  assert.ok(layout.nodes.some((node) => node.id === "box"));
  assert.ok(layout.nodes.some((node) => node.id === "comp"));
});

test("不同层的 Unit 仍留在父框内", async () => {
  const layout = await calculateArchitecture(
    {
      ...walkthrough([
        { id: "box", type: "component", title: "绘制" },
        { id: "a", type: "unit", title: "色带", parentId: "box", layer: "色带" },
        { id: "b", type: "unit", title: "箭头", parentId: "box", layer: "箭头" },
      ]),
      focusParticipantId: "box",
    },
    { view: "detail" },
  );
  const parent = layout.nodes.find((node) => node.id === "box");
  assert.ok(parent);
  for (const id of ["a", "b"]) {
    const child = layout.nodes.find((node) => node.id === id);
    assert.ok(child);
    assert.ok(child.x >= parent.x - 1);
    assert.ok(child.x + child.width <= parent.x + parent.width + 1);
    assert.ok(child.y >= parent.y - 1);
    assert.ok(child.y + child.height <= parent.y + parent.height + 1);
  }
});

test("不同父框里的同一层各自成组，不排成通栏", async () => {
  const layout = await calculateArchitecture(
    {
      ...walkthrough(
        [
          { id: "left", type: "component", title: "左侧" },
          { id: "right", type: "component", title: "右侧" },
          { id: "a", type: "unit", title: "入口甲", parentId: "left", layer: "入口" },
          { id: "b", type: "unit", title: "入口乙", parentId: "right", layer: "入口" },
          { id: "c", type: "unit", title: "落盘", parentId: "right", layer: "落盘" },
        ],
        [{ id: "rel", type: "calls", sourceId: "a", targetId: "c", label: "写入" }],
      ),
      focusParticipantId: "right",
    },
    { view: "detail" },
  );
  const node = (id) => layout.nodes.find((item) => item.id === id);
  for (const [childId, parentId] of [["a", "left"], ["b", "right"], ["c", "right"]]) {
    const child = node(childId);
    const parent = node(parentId);
    assert.ok(child.x >= parent.x - 1);
    assert.ok(child.x + child.width <= parent.x + parent.width + 1);
    assert.ok(child.y >= parent.y - 1);
    assert.ok(child.y + child.height <= parent.y + parent.height + 1);
  }
});

test("同一层分属不同父框时，父框不会叠在一起", async () => {
  const layout = await calculateArchitecture(
    walkthrough(
      [
        { id: "back", type: "container", title: "后端进程", codeIdentity: "backend", responsibility: "接住对话并写入产物" },
        { id: "front", type: "container", title: "网页", codeIdentity: "frontend", responsibility: "对话界面和 agent 工作台" },
        { id: "api", type: "component", title: "对话通道", parentId: "back", responsibility: "校验模型并转发一轮对话" },
        { id: "client", type: "component", title: "对话客户端", parentId: "front", responsibility: "把用户操作送到后端" },
        { id: "start", type: "unit", title: "发起一轮对话", parentId: "client", layer: "编排" },
        { id: "handle", type: "unit", title: "开始一轮", parentId: "api", layer: "编排" },
        { id: "repo", type: "unit", title: "读写定义行", parentId: "back", layer: "落盘" },
      ],
      [
        { id: "r1", type: "calls", sourceId: "start", targetId: "handle", label: "发送一条消息" },
        { id: "r2", type: "writes", sourceId: "handle", targetId: "repo", label: "写入" },
      ],
    ),
    { view: "detail" },
  );
  const node = (id) => layout.nodes.find((item) => item.id === id);
  const overlaps = (left, right) =>
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y;
  for (const [leftId, rightId] of [
    ["back", "front"],
    ["api", "client"],
    ["back", "client"],
    ["front", "api"],
  ]) {
    assert.equal(overlaps(node(leftId), node(rightId)), false, `${leftId} 与 ${rightId} 的框不应重叠`);
  }
  for (const id of ["start", "handle", "repo"]) {
    const leaf = node(id);
    assert.equal(leaf.height, measureBox(leaf, leaf.contracts ?? []).height);
  }
  for (const [childId, parentId] of [
    ["api", "back"],
    ["handle", "api"],
    ["repo", "back"],
    ["client", "front"],
    ["start", "client"],
  ]) {
    const child = node(childId);
    const parent = node(parentId);
    assert.ok(child.x >= parent.x - 1);
    assert.ok(child.x + child.width <= parent.x + parent.width + 1);
    assert.ok(child.y >= parent.y + (parent.headerHeight ?? 0) - 1);
  }
});

test("进入同一个框的线条从不同点接入，并且不穿过别的框", async () => {
  const layout = await calculateArchitecture(
    walkthrough(
      [
        { id: "a", type: "unit", title: "甲", layer: "上" },
        { id: "b", type: "unit", title: "乙", layer: "上" },
        { id: "c", type: "unit", title: "丙", layer: "下" },
      ],
      [
        { id: "r1", type: "calls", sourceId: "a", targetId: "c", label: "第一条" },
        { id: "r2", type: "calls", sourceId: "b", targetId: "c", label: "第二条" },
      ],
    ),
    { view: "detail" },
  );
  const edge = (id) => layout.edges.find((item) => item.id === id);
  const endA = edge("r1").points.at(-1);
  const endB = edge("r2").points.at(-1);
  assert.ok(Math.abs(endA.x - endB.x) > 8 || Math.abs(endA.y - endB.y) > 8);
  const spans = (points) => {
    const rows = [];
    for (let index = 0; index < points.length - 1; index += 1) {
      if (Math.abs(points[index].y - points[index + 1].y) >= 1 || Math.abs(points[index].x - points[index + 1].x) <= 8) continue;
      rows.push({ y: points[index].y, x0: Math.min(points[index].x, points[index + 1].x), x1: Math.max(points[index].x, points[index + 1].x) });
    }
    return rows;
  };
  for (const left of spans(edge("r1").points)) {
    for (const right of spans(edge("r2").points)) {
      const overlap = Math.min(left.x1, right.x1) - Math.max(left.x0, right.x0);
      if (overlap < 40) continue;
      assert.ok(Math.abs(left.y - right.y) > 20);
    }
  }
  const columns = (points) => {
    const cols = [];
    for (let index = 0; index < points.length - 1; index += 1) {
      if (Math.abs(points[index].x - points[index + 1].x) >= 1 || Math.abs(points[index].y - points[index + 1].y) <= 8) continue;
      cols.push({ x: points[index].x, y0: Math.min(points[index].y, points[index + 1].y), y1: Math.max(points[index].y, points[index + 1].y) });
    }
    return cols;
  };
  for (const left of columns(edge("r1").points)) {
    for (const right of columns(edge("r2").points)) {
      const overlap = Math.min(left.y1, right.y1) - Math.max(left.y0, right.y0);
      if (overlap < 40) continue;
      assert.ok(Math.abs(left.x - right.x) > 20);
    }
  }
  const boxes = layout.nodes.filter((node) => !node.isCompound);
  for (const item of [edge("r1"), edge("r2")]) {
    for (let index = 0; index < item.points.length - 1; index += 1) {
      const from = item.points[index];
      const to = item.points[index + 1];
      for (const box of boxes) {
        if (box.id === item.sourceId || box.id === item.targetId) continue;
        assert.equal(segmentHitsBox(from, to, box), false, `${item.id} 不应穿过 ${box.id}`);
      }
    }
    const source = boxes.find((box) => box.id === item.sourceId);
    const target = boxes.find((box) => box.id === item.targetId);
    const first = [item.points[0], item.points[1]];
    const last = [item.points.at(-2), item.points.at(-1)];
    assert.equal(segmentLiesOnBorder(first[0], first[1], source), false, `${item.id} 出发段贴着边框`);
    assert.equal(segmentLiesOnBorder(last[0], last[1], target), false, `${item.id} 进入段贴着边框`);
    assert.ok(pointOnBorder(last[1], target), `${item.id} 终点应落在边框上`);
    for (let index = 0; index < item.points.length - 1; index += 1) {
      assert.equal(
        segmentHitsBox(item.points[index], item.points[index + 1], target),
        false,
        `${item.id} 不应穿过目标框`,
      );
    }
  }
});

test("横跨中间框的连线不穿过中间框，进框前留出直线", async () => {
  const layout = await calculateArchitecture(
    walkthrough(
      [
        { id: "a", type: "unit", title: "甲", layer: "上" },
        { id: "b", type: "unit", title: "乙", layer: "上" },
        { id: "c", type: "unit", title: "丙", layer: "上" },
      ],
      [{ id: "r", type: "calls", sourceId: "a", targetId: "c", label: "调用" }],
    ),
    { view: "detail" },
  );
  const edge = layout.edges.find((item) => item.id === "r");
  assertOrthogonal(edge.points);
  const middle = layout.nodes.find((node) => node.id === "b");
  const target = layout.nodes.find((node) => node.id === "c");
  for (let index = 0; index < edge.points.length - 1; index += 1) {
    const from = edge.points[index];
    const to = edge.points[index + 1];
    assert.equal(segmentHitsBox(from, to, middle), false);
  }
  const bend = edge.points.at(-2);
  const end = edge.points.at(-1);
  assert.ok(Math.hypot(bend.x - end.x, bend.y - end.y) >= 24);
  const outside =
    bend.x < target.x - 8 ||
    bend.x > target.x + target.width + 8 ||
    bend.y < target.y - 8 ||
    bend.y > target.y + target.height + 8;
  assert.ok(outside);
});

test("同一层相邻框的连线走两者之间，不绕到框下方", async () => {
  const layout = await calculateArchitecture(
    walkthrough(
      [
        { id: "a", type: "unit", title: "甲", layer: "上" },
        { id: "b", type: "unit", title: "乙", layer: "上" },
      ],
      [{ id: "r", type: "calls", sourceId: "a", targetId: "b", label: "调用" }],
    ),
    { view: "detail" },
  );
  const edge = layout.edges.find((item) => item.id === "r");
  assertOrthogonal(edge.points);
  const boxes = layout.nodes.filter((node) => node.id === "a" || node.id === "b");
  const low = Math.max(...boxes.map((box) => box.y + box.height));
  for (const point of edge.points) assert.ok(point.y <= low + 4);
  const [from, to] = edge.points;
  assert.equal(segmentLiesOnBorder(from, to, boxes.find((box) => box.id === "a")), false);
});

test("同一父框里的同一层排成一块", async () => {
  const layout = await calculateArchitecture(
    walkthrough(
      [
        { id: "parent", type: "component", title: "定义", responsibility: "保存角色卡" },
        { id: "a", type: "unit", title: "入口甲", parentId: "parent", layer: "入口" },
        { id: "b", type: "unit", title: "入口乙", parentId: "parent", layer: "入口" },
        { id: "c", type: "unit", title: "落盘", parentId: "parent", layer: "落盘" },
      ],
      [{ id: "rel", type: "calls", sourceId: "a", targetId: "c", label: "写入" }],
    ),
    { view: "detail" },
  );
  const node = (id) => layout.nodes.find((item) => item.id === id);
  assert.ok(Math.abs(node("a").y - node("b").y) < 2);
  const left = node("a").x <= node("b").x ? node("a") : node("b");
  const right = left === node("a") ? node("b") : node("a");
  const gap = right.x - (left.x + left.width);
  assert.ok(gap > 24 && gap < 200);
  const parent = node("parent");
  for (const id of ["a", "b", "c"]) {
    const child = node(id);
    assert.ok(child.x >= parent.x - 1);
    assert.ok(child.x + child.width <= parent.x + parent.width + 1);
    assert.ok(child.y >= parent.y + (parent.headerHeight ?? 0) - 1);
  }
});

test("各层对不齐时，每个父框里仍涂出这一层的背景", async () => {
  const layout = await calculateArchitecture(
    walkthrough(
      [
        { id: "left", type: "component", title: "左", responsibility: "只负责落盘" },
        { id: "right", type: "component", title: "右", responsibility: "先接入口再落盘" },
        { id: "b", type: "unit", title: "右入口", parentId: "right", layer: "入口" },
        { id: "c", type: "unit", title: "右落盘", parentId: "right", layer: "落盘" },
        { id: "a", type: "unit", title: "左落盘", parentId: "left", layer: "落盘" },
      ],
      [{ id: "rel", type: "calls", sourceId: "b", targetId: "a", label: "写入" }],
    ),
    { view: "detail" },
  );
  const lanes = layout.lanes ?? [];
  assert.ok(lanes.length >= 2);
  for (const id of ["a", "b", "c"]) {
    const node = layout.nodes.find((item) => item.id === id);
    const lane = lanes.find(
      (item) =>
        item.title === node.layer &&
        node.x >= item.x - 1 &&
        node.x + node.width <= item.x + item.width + 1 &&
        node.y >= item.y - 1 &&
        node.y + node.height <= item.y + item.height + 1,
    );
    assert.ok(lane, `${id} 应落在自己的层背景里`);
    assert.ok(lane.width < layout.width - 8, "对不齐时背景不拉通整张图");
  }
  const overlaps = (left, right) =>
    left.x < right.x + right.width - 1 &&
    left.x + left.width > right.x + 1 &&
    left.y < right.y + right.height - 1 &&
    left.y + left.height > right.y + 1;
  assert.equal(overlaps(layout.nodes.find((item) => item.id === "left"), layout.nodes.find((item) => item.id === "right")), false);
});

test("职责层背景铺到下一层", async () => {
  const layout = await calculateArchitecture(
    walkthrough(
      [
        { id: "a", type: "unit", title: "甲", layer: "上" },
        { id: "b", type: "unit", title: "乙", layer: "下" },
      ],
      [{ id: "r", type: "calls", sourceId: "a", targetId: "b", label: "调用" }],
    ),
    { view: "detail" },
  );
  const lanes = layout.lanes ?? [];
  assert.ok(lanes.length >= 2);
  for (const node of layout.nodes) {
    if (node.isCompound || !node.layer) continue;
    const lane = lanes.find((item) => item.title === node.layer && boxInside(node, laneRect(item, layout)));
    assert.ok(lane, `${node.id} 应落在 ${node.layer} 的背景里`);
  }
  for (let i = 0; i < lanes.length; i += 1) {
    for (let j = i + 1; j < lanes.length; j += 1) {
      assert.equal(rectsOverlap(laneRect(lanes[i], layout), laneRect(lanes[j], layout)), false);
    }
  }
});

function laneRect(lane, layout) {
  return { x: lane.x ?? 0, y: lane.y, width: lane.width ?? layout.width, height: lane.height };
}

function boxInside(node, rect) {
  return node.x >= rect.x - 1 && node.x + node.width <= rect.x + rect.width + 1 && node.y >= rect.y - 1 && node.y + node.height <= rect.y + rect.height + 1;
}

function rectsOverlap(left, right) {
  return (
    left.x < right.x + right.width - 1 &&
    left.x + left.width > right.x + 1 &&
    left.y < right.y + right.height - 1 &&
    left.y + left.height > right.y + 1
  );
}

function assertOrthogonal(points) {
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    assert.ok(Math.abs(point.x - previous.x) < 1 || Math.abs(point.y - previous.y) < 1);
  }
}

function pointOnBorder(point, box) {
  const onX = Math.abs(point.x - box.x) < 1.5 || Math.abs(point.x - (box.x + box.width)) < 1.5;
  const onY = Math.abs(point.y - box.y) < 1.5 || Math.abs(point.y - (box.y + box.height)) < 1.5;
  const insideX = point.x >= box.x - 1 && point.x <= box.x + box.width + 1;
  const insideY = point.y >= box.y - 1 && point.y <= box.y + box.height + 1;
  return (onX && insideY) || (onY && insideX);
}

function segmentHitsBox(from, to, box) {
  const left = box.x + 1;
  const right = box.x + box.width - 1;
  const top = box.y + 1;
  const bottom = box.y + box.height - 1;
  let start = 0;
  let end = 1;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const clips = [
    [-dx, from.x - left],
    [dx, right - from.x],
    [-dy, from.y - top],
    [dy, bottom - from.y],
  ];
  for (const [direction, distance] of clips) {
    if (Math.abs(direction) < 1e-9) {
      if (distance < 0) return false;
      continue;
    }
    const at = distance / direction;
    if (direction < 0) {
      if (at > end) return false;
      if (at > start) start = at;
    } else {
      if (at < start) return false;
      if (at < end) end = at;
    }
  }
  return start < end;
}

function segmentLiesOnBorder(from, to, box) {
  const onVertical =
    Math.abs(from.x - to.x) < 1 &&
    (Math.abs(from.x - box.x) < 1 || Math.abs(from.x - (box.x + box.width)) < 1) &&
    Math.min(from.y, to.y) < box.y + box.height - 1 &&
    Math.max(from.y, to.y) > box.y + 1;
  const onHorizontal =
    Math.abs(from.y - to.y) < 1 &&
    (Math.abs(from.y - box.y) < 1 || Math.abs(from.y - (box.y + box.height)) < 1) &&
    Math.min(from.x, to.x) < box.x + box.width - 1 &&
    Math.max(from.x, to.x) > box.x + 1;
  return onVertical || onHorizontal;
}

test("层在 Y 向上叠在一起时丢掉全部色带", async () => {
  const layout = await calculateArchitecture(
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
      assert.equal(
        rectsOverlap(laneRect(left, layout), laneRect(right, layout)),
        false,
        `${left.title} 与 ${right.title} 不应重叠`,
      );
    }
    assert.ok(leftTitle(lanes[i]), "每条 Lane 必须有完整层名");
  }
});

test("Billing 示例的放大图只保留有叶子的层，并且层名完整", async () => {
  const example = JSON.parse(await readFile(resolve(here, "../examples/walkthrough.json"), "utf8"));
  const layout = await calculateArchitecture(example, { view: "detail" });
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
