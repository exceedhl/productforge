const CELL = 8;
const MARGIN = 64;
const CLEARANCE = 8;
const BEND_COST = 9;
const USED_COST = 14;
const HEADER_PAD = 8;

export function routeArchitectureEdges(nodes, relations) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const jobs = collectJobs(nodes, relations, nodeById);
  const grid = createGrid(nodes);
  const sideUsage = new Map();
  for (const job of jobs) {
    if (job.kind !== "peer") continue;
    bump(sideUsage, `${job.source.id}:${job.fromSide}`);
  }
  const sideIndex = new Map();
  const edges = [];
  for (const job of jobs) {
    if (job.kind === "ancestor") {
      edges.push({ ...job.relation, points: ancestorPoints(job.source, job.target), labelPoint: undefined });
      continue;
    }
    const fromSlot = bump(sideIndex, `${job.source.id}:${job.fromSide}`);
    const fromTotal = sideUsage.get(`${job.source.id}:${job.fromSide}`) ?? 1;
    const start = sidePoint(job.source, job.fromSide, fromSlot, fromTotal);
    const end = sidePoint(job.target, job.toSide, 0, 1);
    markObstacles(grid, nodes, job.source, job.target, nodeById);
    const points = routeOnGrid(grid, start, end, job.fromSide, job.toSide);
    reservePath(grid, points);
    clearMarks(grid);
    edges.push({
      ...job.relation,
      points,
      labelPoint: labelAnchor(points, job.source, job.target),
    });
  }
  return edges;
}

function collectJobs(nodes, relations, nodeById) {
  return relations
    .filter(
      (relation) =>
        relation.type !== "contains" &&
        nodeById.has(relation.sourceId) &&
        nodeById.has(relation.targetId),
    )
    .map((relation) => {
      const source = exclusiveContainer(
        nodeById.get(relation.sourceId),
        nodeById.get(relation.targetId),
        nodeById,
      );
      const target = exclusiveContainer(
        nodeById.get(relation.targetId),
        nodeById.get(relation.sourceId),
        nodeById,
      );
      if (!source || !target || source.id === target.id) return null;
      if (isAncestor(source.id, target.id, nodeById) || isAncestor(target.id, source.id, nodeById)) {
        return { kind: "ancestor", relation, source, target };
      }
      const [fromSide, toSide] = pickSides(source, target);
      return { kind: "peer", relation, source, target, fromSide, toSide };
    })
    .filter(Boolean);
}

function exclusiveContainer(node, other, nodeById) {
  if (!node || !other) return node;
  let current = node;
  while (current.parentId) {
    const parent = nodeById.get(current.parentId);
    if (!parent || containsNode(parent, other, nodeById)) break;
    current = parent;
  }
  return current;
}

function containsNode(parent, node, nodeById) {
  return parent.id === node.id || ancestorIds(node.id, nodeById).has(parent.id);
}

function createGrid(nodes) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + node.width);
    maxY = Math.max(maxY, node.y + node.height);
  }
  minX -= MARGIN;
  minY -= MARGIN;
  maxX += MARGIN;
  maxY += MARGIN;
  const cols = Math.max(8, Math.ceil((maxX - minX) / CELL));
  const rows = Math.max(8, Math.ceil((maxY - minY) / CELL));
  return {
    minX,
    minY,
    cols,
    rows,
    blocked: new Uint8Array(cols * rows),
    used: new Uint8Array(cols * rows),
    scratch: new Uint8Array(cols * rows),
  };
}

function markObstacles(grid, nodes, source, target, nodeById) {
  const shared = sharedAncestorIds(source, target, nodeById);
  grid.scratch.fill(0);
  for (const node of nodes) {
    if (shared.has(node.id)) {
      markRect(grid, grid.scratch, node.x, node.y, node.width, (node.headerHeight ?? 72) + HEADER_PAD, 1);
      continue;
    }
    markRect(
      grid,
      grid.scratch,
      node.x - CLEARANCE,
      node.y - CLEARANCE,
      node.width + CLEARANCE * 2,
      node.height + CLEARANCE * 2,
      1,
    );
  }
}

function clearMarks(grid) {
  grid.scratch.fill(0);
}

function routeOnGrid(grid, start, end, fromSide, toSide) {
  const origin = stepOutside(grid, start, fromSide);
  const goal = stepOutside(grid, end, toSide);
  const cells = astar(grid, origin, goal) ?? walkAround(origin, goal);
  const points = [start, ...cells.map((cell) => cellToPoint(grid, cell)), end];
  return collapsePoints(points);
}

function astar(grid, start, goal) {
  const startKey = keyOf(grid, start.c, start.r);
  const goalKey = keyOf(grid, goal.c, goal.r);
  const open = [{ ...start, g: 0, dir: -1, f: manhattan(start, goal) }];
  const best = new Map([[startKey, 0]]);
  const prev = new Map();
  const seen = new Uint8Array(grid.cols * grid.rows);

  while (open.length > 0) {
    const current = popMin(open);
    const currentKey = keyOf(grid, current.c, current.r);
    if (currentKey === goalKey) return reconstruct(grid, prev, current);
    if (seen[currentKey]) continue;
    seen[currentKey] = 1;
    for (const [dc, dr, dir] of [
      [1, 0, 0],
      [-1, 0, 1],
      [0, 1, 2],
      [0, -1, 3],
    ]) {
      const c = current.c + dc;
      const r = current.r + dr;
      if (!inBounds(grid, c, r)) continue;
      const nextKey = keyOf(grid, c, r);
      if (nextKey !== goalKey && nextKey !== startKey && grid.scratch[nextKey]) continue;
      const step = 1 + (current.dir !== -1 && current.dir !== dir ? BEND_COST : 0) + grid.used[nextKey] * USED_COST;
      const g = current.g + step;
      if (best.has(nextKey) && best.get(nextKey) <= g) continue;
      best.set(nextKey, g);
      prev.set(nextKey, current);
      open.push({ c, r, g, dir, f: g + manhattan({ c, r }, goal) });
    }
  }
  return null;
}

function reconstruct(grid, prev, current) {
  const cells = [{ c: current.c, r: current.r }];
  let cursor = current;
  while (prev.has(keyOf(grid, cursor.c, cursor.r))) {
    cursor = prev.get(keyOf(grid, cursor.c, cursor.r));
    cells.push({ c: cursor.c, r: cursor.r });
  }
  cells.reverse();
  return cells;
}

function walkAround(start, goal) {
  return [start, { c: start.c, r: goal.r }, goal];
}

function reservePath(grid, points) {
  for (let index = 0; index < points.length - 1; index += 1) {
    const first = toCell(grid, points[index]);
    const second = toCell(grid, points[index + 1]);
    const dc = Math.sign(second.c - first.c);
    const dr = Math.sign(second.r - first.r);
    let c = first.c;
    let r = first.r;
    while (true) {
      if (inBounds(grid, c, r)) grid.used[keyOf(grid, c, r)] = Math.min(6, grid.used[keyOf(grid, c, r)] + 1);
      if (c === second.c && r === second.r) break;
      c += dc;
      r += dr;
    }
  }
}

function markRect(grid, layer, x, y, width, height, value) {
  const c0 = Math.max(0, Math.floor((x - grid.minX) / CELL));
  const r0 = Math.max(0, Math.floor((y - grid.minY) / CELL));
  const c1 = Math.min(grid.cols, Math.ceil((x + width - grid.minX) / CELL));
  const r1 = Math.min(grid.rows, Math.ceil((y + height - grid.minY) / CELL));
  for (let r = r0; r < r1; r += 1) {
    for (let c = c0; c < c1; c += 1) {
      layer[keyOf(grid, c, r)] = value;
    }
  }
}

function pickSides(source, target) {
  const down = target.y - (source.y + source.height);
  const up = source.y - (target.y + target.height);
  const right = target.x - (source.x + source.width);
  const left = source.x - (target.x + target.width);
  const gaps = [
    [down, "s", "n"],
    [up, "n", "s"],
    [right, "e", "w"],
    [left, "w", "e"],
  ].sort((a, b) => b[0] - a[0]);
  return gaps[0][0] > 0 ? [gaps[0][1], gaps[0][2]] : source.x <= target.x ? ["e", "w"] : ["w", "e"];
}

function sidePoint(node, side, slot, total) {
  const ratio = (slot + 1) / (total + 1);
  if (side === "n") return { x: node.x + node.width * ratio, y: node.y };
  if (side === "s") return { x: node.x + node.width * ratio, y: node.y + node.height };
  if (side === "w") return { x: node.x, y: node.y + node.height * ratio };
  return { x: node.x + node.width, y: node.y + node.height * ratio };
}

function stepOutside(grid, point, side) {
  const cell = toCell(grid, point);
  const delta = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] }[side];
  let c = cell.c + delta[0];
  let r = cell.r + delta[1];
  for (let step = 0; step < 6; step += 1) {
    if (inBounds(grid, c, r) && !grid.scratch[keyOf(grid, c, r)]) return { c, r };
    c += delta[0];
    r += delta[1];
  }
  return { c: clamp(c, 0, grid.cols - 1), r: clamp(r, 0, grid.rows - 1) };
}

function ancestorPoints(source, target) {
  const child = source.y < target.y ? target : source;
  const parent = child === target ? source : target;
  const x = clamp(child.x + child.width / 2, child.x + 16, child.x + child.width - 16);
  if (parent === source) return [{ x, y: Math.max(parent.y + 48, child.y - 24) }, { x, y: child.y }];
  return [{ x, y: child.y + child.height }, { x, y: child.y + child.height + 24 }];
}

function labelAnchor(points) {
  let best = points[0];
  let bestLength = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const first = points[index];
    const second = points[index + 1];
    const length = Math.abs(first.x - second.x) + Math.abs(first.y - second.y);
    if (length >= bestLength) {
      bestLength = length;
      best = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
    }
  }
  return { x: best.x, y: best.y - 4 };
}

function collapsePoints(points) {
  if (points.length >= 2) {
    const first = points[0];
    const last = points.at(-1);
    if (Math.abs(first.x - last.x) <= 4 || Math.abs(first.y - last.y) <= 4) {
      return [first, last];
    }
  }
  const cleaned = [];
  for (const point of points) {
    const last = cleaned.at(-1);
    if (last && Math.abs(last.x - point.x) < 1 && Math.abs(last.y - point.y) < 1) continue;
    const previous = cleaned.at(-2);
    if (
      previous &&
      last &&
      ((Math.abs(previous.x - last.x) < 1 && Math.abs(last.x - point.x) < 1) ||
        (Math.abs(previous.y - last.y) < 1 && Math.abs(last.y - point.y) < 1))
    ) {
      cleaned[cleaned.length - 1] = point;
      continue;
    }
    cleaned.push(point);
  }
  return cleaned;
}

function sharedAncestorIds(source, target, nodeById) {
  const sourceAncestors = ancestorIds(source.id, nodeById);
  const shared = new Set();
  for (const id of ancestorIds(target.id, nodeById)) {
    if (sourceAncestors.has(id)) shared.add(id);
  }
  return shared;
}

function isAncestor(ancestorId, nodeId, nodeById) {
  return ancestorIds(nodeId, nodeById).has(ancestorId);
}

function ancestorIds(nodeId, nodeById) {
  const ids = new Set();
  let current = nodeById.get(nodeId);
  while (current?.parentId && !ids.has(current.parentId)) {
    ids.add(current.parentId);
    current = nodeById.get(current.parentId);
  }
  return ids;
}

function toCell(grid, point) {
  return {
    c: clamp(Math.round((point.x - grid.minX) / CELL), 0, grid.cols - 1),
    r: clamp(Math.round((point.y - grid.minY) / CELL), 0, grid.rows - 1),
  };
}

function cellToPoint(grid, cell) {
  return { x: grid.minX + cell.c * CELL, y: grid.minY + cell.r * CELL };
}

function keyOf(grid, c, r) {
  return r * grid.cols + c;
}

function inBounds(grid, c, r) {
  return c >= 0 && r >= 0 && c < grid.cols && r < grid.rows;
}

function manhattan(a, b) {
  return Math.abs(a.c - b.c) + Math.abs(a.r - b.r);
}

function popMin(open) {
  let best = 0;
  for (let index = 1; index < open.length; index += 1) {
    if (open[index].f < open[best].f) best = index;
  }
  return open.splice(best, 1)[0];
}

function bump(map, key) {
  const next = map.get(key) ?? 0;
  map.set(key, next + 1);
  return next;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
