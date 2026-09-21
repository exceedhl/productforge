export function edgesFromElk(elkGraph, relations) {
  const relationById = new Map(relations.map((relation) => [relation.id, relation]));
  const world = new Map();
  const parentOf = new Map();
  indexElkTree(elkGraph, 0, 0, world, parentOf);

  const edges = [];
  collectListedEdges(elkGraph, (edge, listedOn) => {
    const relation = relationById.get(edge.id);
    if (!relation) return;
    const fallbackOrigin =
      world.get(listedOn) ??
      world.get(
        lowestCommonAncestor(
          edge.sources?.[0] ?? relation.sourceId,
          edge.targets?.[0] ?? relation.targetId,
          parentOf,
        ),
      ) ??
      { x: 0, y: 0 };
    const points = [];
    for (const section of edge.sections ?? []) {
      const origin = sectionOrigin(section, world, parentOf, fallbackOrigin);
      addPoint(points, origin, section.startPoint);
      for (const bend of section.bendPoints ?? []) addPoint(points, origin, bend);
      addPoint(points, origin, section.endPoint);
    }
    const cleaned = simplifyOrthogonal(points);
    if (cleaned.length >= 2) {
      edges.push({
        ...relation,
        points: cleaned,
      });
    }
  });
  return edges;
}

export function labelAnchor(points) {
  let best = { x: points[0]?.x ?? 0, y: (points[0]?.y ?? 0) - 4 };
  let bestLength = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const first = points[index];
    const second = points[index + 1];
    const horizontal = Math.abs(first.y - second.y) < 1;
    const length = Math.abs(first.x - second.x) + Math.abs(first.y - second.y);
    const score = length + (horizontal ? 32 : 0);
    if (score >= bestLength) {
      bestLength = score;
      best = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 - 6 };
    }
  }
  return best;
}

function sectionOrigin(section, world, parentOf, fallback) {
  const incoming = section.incomingShape;
  const outgoing = section.outgoingShape;
  if (typeof incoming === "string" && typeof outgoing === "string") {
    const lca = lowestCommonAncestor(incoming, outgoing, parentOf);
    if (lca && world.has(lca)) return world.get(lca);
  }
  if (typeof incoming === "string" && world.has(parentOf.get(incoming))) {
    return world.get(parentOf.get(incoming));
  }
  return fallback;
}

function indexElkTree(node, parentX, parentY, world, parentOf) {
  const x = parentX + (node.x ?? 0);
  const y = parentY + (node.y ?? 0);
  world.set(node.id, { x, y });
  for (const child of node.children ?? []) {
    parentOf.set(child.id, node.id);
    indexElkTree(child, x, y, world, parentOf);
  }
}

function collectListedEdges(node, visit) {
  for (const edge of node.edges ?? []) visit(edge, node.id);
  for (const child of node.children ?? []) collectListedEdges(child, visit);
}

function lowestCommonAncestor(leftId, rightId, parentOf) {
  const seen = new Set();
  let current = leftId;
  while (current) {
    seen.add(current);
    current = parentOf.get(current);
  }
  current = rightId;
  while (current && !seen.has(current)) {
    current = parentOf.get(current);
  }
  return current;
}

function addPoint(points, origin, point) {
  if (!point) return;
  const next = { x: origin.x + point.x, y: origin.y + point.y };
  const last = points.at(-1);
  if (!last) {
    points.push(next);
    return;
  }
  if (Math.abs(last.x - next.x) < 0.5 && Math.abs(last.y - next.y) < 0.5) return;
  if (Math.abs(last.x - next.x) >= 1 && Math.abs(last.y - next.y) >= 1) {
    points.push({ x: next.x, y: last.y });
  }
  points.push(next);
}

function simplifyOrthogonal(points) {
  const collapsed = [];
  for (const point of points) {
    const last = collapsed.at(-1);
    if (last && Math.abs(last.x - point.x) < 1 && Math.abs(last.y - point.y) < 1) continue;
    const previous = collapsed.at(-2);
    if (
      previous &&
      last &&
      ((Math.abs(previous.x - last.x) < 1 && Math.abs(last.x - point.x) < 1) ||
        (Math.abs(previous.y - last.y) < 1 && Math.abs(last.y - point.y) < 1))
    ) {
      collapsed[collapsed.length - 1] = point;
      continue;
    }
    collapsed.push(point);
  }

  const withoutU = [];
  for (const point of collapsed) {
    withoutU.push(point);
    while (withoutU.length >= 3) {
      const a = withoutU.at(-3);
      const b = withoutU.at(-2);
      const c = withoutU.at(-1);
      const backtrack =
        (Math.abs(a.x - c.x) < 1 && ((b.y - a.y) * (c.y - b.y) < 0 || Math.abs(a.y - c.y) < 1)) ||
        (Math.abs(a.y - c.y) < 1 && ((b.x - a.x) * (c.x - b.x) < 0 || Math.abs(a.x - c.x) < 1));
      if (!backtrack) break;
      withoutU.splice(-2, 1);
    }
  }
  return withoutU;
}
