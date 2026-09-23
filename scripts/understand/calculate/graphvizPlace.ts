import { Graphviz } from "@hpcc-js/wasm/graphviz";

const POINTS_PER_INCH = 72;

let graphvizPromise: Promise<Graphviz> | null = null;

function loadGraphviz() {
  graphvizPromise ??= Graphviz.load();
  return graphvizPromise;
}

export type PlaceBox = {
  id: string;
  parentId?: string;
  width: number;
  height: number;
  headerHeight: number;
  layerRank: number | null;
  type?: string;
};

export type PlaceEdge = {
  sourceId: string;
  targetId: string;
};

export type PlacedBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const MEMBER_GAP = 48;
const GROUP_GAP = 72;
const FRAME_PAD = 20;

type Movable = { width: number; height: number; move: (dx: number, dy: number) => void };

export async function placeBoxes(
  boxes: PlaceBox[],
  edges: PlaceEdge[],
  options: { layered: boolean },
) {
  if (boxes.length === 0) return new Map<string, PlacedBox>();
  if (!options.layered) return runDot(boxes, edges);
  return packBalanced(boxes);
}

async function runDot(boxes: PlaceBox[], edges: PlaceEdge[]) {
  const names = new Map(boxes.map((box, index) => [box.id, `n${index}`]));
  const byName = new Map(boxes.map((box) => [names.get(box.id), box]));
  const dot = buildDot(boxes, edges, names);
  const graphviz = await loadGraphviz();
  const parsed = JSON.parse(graphviz.layout(dot, "json", "dot"));
  return readPlacement(parsed, boxes, byName);
}

function buildDot(boxes: PlaceBox[], edges: PlaceEdge[], names: Map<string, string>) {
  const { roots, childrenOf } = forest(boxes);
  const lines = [
    "digraph G {",
    "graph [rankdir=LR, newrank=true, splines=none, nodesep=0.7, ranksep=0.85, pad=0.2];",
    'node [shape=box, fixedsize=true, label=""];',
    "edge [style=invis];",
  ];
  for (const root of roots) emitBox(root, childrenOf, names, lines);
  const actors = boxes.filter((box) => box.type === "actor" && (childrenOf.get(box.id) ?? []).length === 0);
  if (actors.length > 0) {
    lines.push(`{ rank=source; ${actors.map((box) => names.get(box.id)).join("; ")}; }`);
  }
  for (const edge of edges) {
    const source = leafName(edge.sourceId, childrenOf, names);
    const target = leafName(edge.targetId, childrenOf, names);
    if (!source || !target || source === target) continue;
    lines.push(`${source} -> ${target} [constraint=true];`);
  }
  lines.push("}");
  return lines.join("\n");
}

function packBalanced(boxes: PlaceBox[]) {
  const { roots, childrenOf } = forest(boxes);
  const placed = new Map<string, PlacedBox>();
  const blocks = roots.map((box) => placeBlock(box, childrenOf, placed));
  flow(blocks).move(0, 0);
  return placed;
}

function placeBlock(box: PlaceBox, childrenOf: Map<string, PlaceBox[]>, placed: Map<string, PlacedBox>): Movable {
  const children = childrenOf.get(box.id) ?? [];
  if (children.length === 0) {
    placed.set(box.id, { x: 0, y: 0, width: box.width, height: box.height });
    return {
      width: box.width,
      height: box.height,
      move(dx, dy) {
        const current = placed.get(box.id);
        current.x += dx;
        current.y += dy;
      },
    };
  }
  const blocks = childBlocks(children, childrenOf, placed);
  const content = flow(blocks);
  content.move(FRAME_PAD, box.headerHeight);
  const width = Math.max(box.width, content.width + FRAME_PAD * 2);
  const height = box.headerHeight + content.height + FRAME_PAD;
  placed.set(box.id, { x: 0, y: 0, width, height });
  return {
    width,
    height,
    move(dx, dy) {
      const current = placed.get(box.id);
      current.x += dx;
      current.y += dy;
      content.move(dx, dy);
    },
  };
}

function childBlocks(children: PlaceBox[], childrenOf: Map<string, PlaceBox[]>, placed: Map<string, PlacedBox>) {
  const blocks: Movable[] = [];
  const seen = new Set<string>();
  for (const child of children) {
    if ((childrenOf.get(child.id) ?? []).length > 0) {
      blocks.push(placeBlock(child, childrenOf, placed));
      continue;
    }
    const key = child.layerRank == null ? `solo:${child.id}` : `layer:${child.layerRank}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const members = children.filter(
      (item) => (childrenOf.get(item.id) ?? []).length === 0 && (item.layerRank == null ? `solo:${item.id}` : `layer:${item.layerRank}`) === key,
    );
    blocks.push(packMembers(members, childrenOf, placed));
  }
  return blocks;
}

function packMembers(members: PlaceBox[], childrenOf: Map<string, PlaceBox[]>, placed: Map<string, PlacedBox>): Movable {
  const cols = members.length <= 3 ? members.length : Math.ceil(Math.sqrt(members.length));
  const blocks = members.map((member) => placeBlock(member, childrenOf, placed));
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  let usedWidth = 0;
  let column = 0;
  for (const block of blocks) {
    if (column === cols) {
      y += rowHeight + MEMBER_GAP;
      x = 0;
      rowHeight = 0;
      column = 0;
    }
    block.move(x, y);
    x += block.width + MEMBER_GAP;
    rowHeight = Math.max(rowHeight, block.height);
    usedWidth = Math.max(usedWidth, x - MEMBER_GAP);
    column += 1;
  }
  return {
    width: usedWidth,
    height: y + rowHeight,
    move(dx, dy) {
      for (const block of blocks) block.move(dx, dy);
    },
  };
}

function flow(blocks: Movable[]): Movable {
  if (blocks.length === 0) return { width: 0, height: 0, move() {} };
  const widest = Math.max(...blocks.map((block) => block.width));
  const area = blocks.reduce((sum, block) => sum + (block.width + GROUP_GAP) * (block.height + GROUP_GAP), 0);
  const maxWidth = Math.max(widest, Math.sqrt(area) * 1.25);
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  let usedWidth = 0;
  for (const block of blocks) {
    if (x > 0 && x + block.width > maxWidth) {
      y += rowHeight + GROUP_GAP;
      x = 0;
      rowHeight = 0;
    }
    block.move(x, y);
    x += block.width + GROUP_GAP;
    rowHeight = Math.max(rowHeight, block.height);
    usedWidth = Math.max(usedWidth, x - GROUP_GAP);
  }
  return {
    width: usedWidth,
    height: y + rowHeight,
    move(dx, dy) {
      for (const block of blocks) block.move(dx, dy);
    },
  };
}

function emitBox(box: PlaceBox, childrenOf: Map<string, PlaceBox[]>, names: Map<string, string>, lines: string[]) {
  const name = names.get(box.id);
  const children = childrenOf.get(box.id) ?? [];
  if (children.length === 0) {
    lines.push(
      `${name} [width=${(box.width / POINTS_PER_INCH).toFixed(4)}, height=${(box.height / POINTS_PER_INCH).toFixed(4)}];`,
    );
    return;
  }
  const header = Math.max(1, Math.round(box.headerHeight));
  lines.push(`subgraph cluster_${name} {`);
  lines.push(
    `label=<<TABLE BORDER="0" CELLBORDER="0" CELLPADDING="0" CELLSPACING="0"><TR><TD HEIGHT="${header}" WIDTH="4"></TD></TR></TABLE>>;`,
  );
  lines.push('labelloc="t";');
  lines.push('margin="0.16";');
  for (const child of children) emitBox(child, childrenOf, names, lines);
  lines.push("}");
}

function forest(boxes: PlaceBox[]) {
  const ids = new Set(boxes.map((box) => box.id));
  const childrenOf = new Map<string, PlaceBox[]>();
  const roots: PlaceBox[] = [];
  for (const box of boxes) {
    if (box.parentId && ids.has(box.parentId)) {
      const siblings = childrenOf.get(box.parentId) ?? [];
      siblings.push(box);
      childrenOf.set(box.parentId, siblings);
    } else {
      roots.push(box);
    }
  }
  return { roots, childrenOf };
}

function leafName(id: string, childrenOf: Map<string, PlaceBox[]>, names: Map<string, string>) {
  const children = childrenOf.get(id) ?? [];
  if (children.length === 0) return names.get(id);
  for (const child of children) {
    const found = leafName(child.id, childrenOf, names);
    if (found) return found;
  }
  return undefined;
}

function readPlacement(graph, boxes: PlaceBox[], byName: Map<string, PlaceBox>) {
  const [left, , , top] = String(graph.bb ?? "0,0,0,0").split(",").map(Number);
  const placed = new Map<string, PlacedBox>();
  for (const object of graph.objects ?? []) {
    const name = String(object.name ?? "");
    if (name.startsWith("cluster_")) {
      const box = byName.get(name.slice("cluster_".length));
      const bounds = parseBounds(object.bb);
      if (!box || !bounds) continue;
      placed.set(box.id, {
        x: bounds.x0 - left,
        y: top - bounds.y1,
        width: bounds.x1 - bounds.x0,
        height: bounds.y1 - bounds.y0,
      });
      continue;
    }
    const box = byName.get(name);
    if (!box || !object.pos) continue;
    const [centerX, centerY] = String(object.pos).split(",").map(Number);
    placed.set(box.id, {
      x: centerX - box.width / 2 - left,
      y: top - (centerY + box.height / 2),
      width: box.width,
      height: box.height,
    });
  }
  const missing = boxes.filter((box) => !placed.has(box.id)).map((box) => box.id);
  if (missing.length > 0) {
    throw new Error(`dot 没有给出这些框的坐标：${missing.join(", ")}`);
  }
  return placed;
}

function parseBounds(value) {
  if (typeof value !== "string") return null;
  const [x0, y0, x1, y1] = value.split(",").map(Number);
  if (![x0, y0, x1, y1].every(Number.isFinite)) return null;
  return { x0, y0, x1, y1 };
}
