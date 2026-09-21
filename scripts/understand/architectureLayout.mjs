import { edgesFromElk } from "./architectureEdges.mjs";
import { collectContracts, measureBox, measureBoxHeader, measureEdgeLabel } from "./boxContent.mjs";
import ELK from "./elkImport.mjs";

const elk = new ELK();

const OVERVIEW_TYPES = new Set(["actor", "system", "container", "component", "store"]);

export const LAYER_ORDER = [
  "Actor",
  "Presentation",
  "接口 / 编排",
  "领域 / 应用",
  "持久化 / 网关",
  "Store",
];

export async function layoutArchitecture(walkthrough, options = {}) {
  const view = options.view === "overview" ? projectOverview(walkthrough) : walkthrough;
  const layered = options.view !== "overview" && shouldUseResponsibilityLanes(view);
  const placed = await layoutWithElk(view, { layered });
  if (!layered || (placed.lanes ?? []).length > 0) return placed;
  return layoutWithElk(view, { layered: false });
}

function projectOverview(walkthrough) {
  const entityById = new Map(walkthrough.entities.map((entity) => [entity.id, entity]));
  const lift = (id) => {
    let current = entityById.get(id);
    while (current && !OVERVIEW_TYPES.has(current.type)) {
      current = entityById.get(current.parentId);
    }
    return current;
  };
  const entities = walkthrough.entities
    .filter((entity) => OVERVIEW_TYPES.has(entity.type))
    .map((entity) => ({ ...entity, layer: undefined }));
  const seen = new Set();
  const relations = [];
  for (const relation of walkthrough.relations) {
    if (relation.type === "contains" || relation.type === "implements") continue;
    const source = lift(relation.sourceId);
    const target = lift(relation.targetId);
    if (!source || !target || source.id === target.id) continue;
    const key = `${relation.type}:${source.id}:${target.id}:${relation.protocol ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    relations.push({ ...relation, sourceId: source.id, targetId: target.id });
  }
  return { ...walkthrough, entities, relations };
}

async function layoutWithElk(view, options) {
  const { entityById, childrenByParent, roots } = indexEntities(view);
  const layerOrder = usedLayerOrder(view.entities, childrenByParent);
  const layoutChildren = hoistDisconnectedLeaves(view, childrenByParent, entityById);
  const gutter = options.layered ? 156 : 0;
  const graph = {
    id: "architecture-root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": options.layered ? "DOWN" : "RIGHT",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.layered.unnecessaryBendpoints": "true",
      "elk.layered.nodePlacement.favorStraightEdges": "true",
      "elk.edgeLabels.inline": "true",
      "elk.spacing.edgeLabel": "10",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.layered.crossingMinimization.forceNodeModelOrder": "true",
      "elk.separateConnectedComponents": "false",
      "elk.spacing.nodeNode": "24",
      "elk.layered.spacing.nodeNodeBetweenLayers": options.layered ? "36" : "28",
      "elk.spacing.edgeNode": "10",
      "elk.spacing.edgeEdge": "8",
      "elk.padding": options.layered
        ? `[top=12,left=${gutter + 12},bottom=16,right=20]`
        : "[top=16,left=16,bottom=16,right=20]",
      ...(options.layered ? { "elk.partitioning.activate": "true" } : {}),
    },
    children: createElkForest(roots, layoutChildren, view, entityById, options.layered, layerOrder),
    edges: elkEdgeSpecs(view, entityById),
  };
  addActorAnchor(graph, view);
  if (options.layered) addLayerAnchors(graph, layoutChildren, entityById, layerOrder);

  const result = await elk.layout(graph);
  const nodes = [];
  flattenNodes(result.children ?? [], 0, 0, entityById, view, nodes);
  if (options.layered) snapDisconnectedLeaves(nodes, view, entityById, gutter);
  const edges = edgesFromElk(result, view.relations);
  expandTightCorridors(nodes, edges);
  separateOverlappingBoxes(nodes, edges);
  if (options.layered) keepBoxesOutOfLaneRail(nodes, edges, gutter);
  placeLabelsNearEdges(edges, nodes);
  resolveLabelOverlaps(edges, nodes);
  const placed = shiftArchitecture(nodes, edges);
  if (!options.layered) return placed;

  const lanes = lanesFromNodes(placed.nodes, gutter, layerOrder);
  if (lanes.length === 0) {
    return { ...reclaimLaneGutter(placed, gutter), lanes: [], gutter: 0 };
  }
  const last = lanes.at(-1);
  return {
    ...placed,
    width: Math.max(placed.width, gutter + 48),
    height: Math.max(placed.height, (last?.y ?? 0) + (last?.height ?? 0) + 16),
    lanes,
    gutter,
  };
}

function indexEntities(view) {
  const entityById = new Map(view.entities.map((entity) => [entity.id, entity]));
  const childrenByParent = new Map();
  for (const entity of view.entities) {
    if (!entity.parentId || entity.type === "contract") continue;
    const siblings = childrenByParent.get(entity.parentId) ?? [];
    siblings.push(entity);
    childrenByParent.set(entity.parentId, siblings);
  }
  const roots = view.entities.filter(
    (entity) =>
      entity.type !== "contract" && (!entity.parentId || !entityById.has(entity.parentId)),
  );
  return { entityById, childrenByParent, roots };
}

function createElkForest(entities, childrenByParent, walkthrough, entityById, layered, layerOrder) {
  return entities.flatMap((entity) =>
    hoistOrCreate(entity, childrenByParent, walkthrough, entityById, layered, layerOrder),
  );
}

function hoistOrCreate(entity, childrenByParent, walkthrough, entityById, layered, layerOrder) {
  const children = childrenByParent.get(entity.id) ?? [];
  if (entity.type === "system" && children.length > 0) {
    return children.flatMap((child) =>
      hoistOrCreate(child, childrenByParent, walkthrough, entityById, layered, layerOrder),
    );
  }
  return [createElkNode(entity, childrenByParent, walkthrough, entityById, layered, layerOrder)];
}

function createElkNode(entity, childrenByParent, walkthrough, entityById, layered, layerOrder) {
  const contracts = collectContracts(entity, walkthrough);
  const size = measureBox({ ...entity, layer: layered ? undefined : entity.layer }, contracts);
  const children = childrenByParent.get(entity.id) ?? [];
  const node = {
    id: entity.id,
    width: size.width,
    height: size.height,
    layoutOptions: {},
  };
  if (children.length > 0) {
    node.children = children.map((child) =>
      createElkNode(child, childrenByParent, walkthrough, entityById, layered, layerOrder),
    );
    node.layoutOptions = {
      "elk.algorithm": "layered",
      "elk.direction": layered || entity.type !== "container" ? "DOWN" : "RIGHT",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.layered.unnecessaryBendpoints": "true",
      "elk.layered.nodePlacement.favorStraightEdges": "true",
      "elk.edgeLabels.inline": "true",
      "elk.spacing.edgeLabel": "10",
      "elk.padding": `[top=${measureBoxHeader(entity) + 8},left=16,bottom=16,right=16]`,
      "elk.spacing.nodeNode": "20",
      "elk.layered.spacing.nodeNodeBetweenLayers": layered ? "28" : "20",
      "elk.spacing.edgeNode": "8",
      "elk.separateConnectedComponents": "false",
      ...(layered ? { "elk.partitioning.activate": "true" } : {}),
    };
  } else if (layered) {
    const layer = leafResponsibilityLayer(entity);
    if (layer) {
      node.layoutOptions["elk.partitioning.partition"] = String(layerRank(layer, layerOrder));
    }
  } else if (entity.type === "actor") {
    node.layoutOptions["elk.layered.layering.layerConstraint"] = "FIRST";
  }
  return node;
}

function flattenNodes(nodes, parentX, parentY, entityById, walkthrough, target) {
  for (const node of nodes) {
    const x = parentX + (node.x ?? 0);
    const y = parentY + (node.y ?? 0);
    const entity = entityById.get(node.id);
    target.push({
      ...entity,
      contracts: collectContracts(entity, walkthrough),
      x,
      y,
      width: node.width ?? 180,
      height: node.height ?? 88,
      isCompound: (node.children?.length ?? 0) > 0,
      headerHeight: measureBoxHeader(entity),
    });
    flattenNodes(node.children ?? [], x, y, entityById, walkthrough, target);
  }
}

function elkEdgeSpecs(view, entityById) {
  const hostByContract = new Map();
  for (const entity of view.entities) {
    if (entity.type !== "contract" || !entity.parentId) continue;
    hostByContract.set(entity.id, entity.parentId);
  }
  const seen = new Set();
  const specs = [];
  for (const relation of view.relations) {
    if (relation.type === "contains" || relation.type === "implements") continue;
    const sourceId = hostByContract.get(relation.sourceId) ?? relation.sourceId;
    const targetId = hostByContract.get(relation.targetId) ?? relation.targetId;
    if (!entityById.has(sourceId) || !entityById.has(targetId) || sourceId === targetId) continue;
    const key = `${relation.id}:${sourceId}:${targetId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const label = measureEdgeLabel(relation);
    specs.push({
      id: relation.id,
      sources: [sourceId],
      targets: [targetId],
      labels:
        label.width > 0
          ? [{ id: `${relation.id}.label`, text: relation.label ?? "", width: label.width, height: label.height }]
          : [],
    });
  }
  return specs;
}

function addActorAnchor(graph, view) {
  const actor = view.entities.find((entity) => entity.type === "actor");
  if (!actor) return;
  const alreadyLinked = graph.edges.some(
    (edge) => edge.sources.includes(actor.id) || edge.targets.includes(actor.id),
  );
  if (alreadyLinked) return;
  const target = graph.children.find((child) => child.id !== actor.id);
  if (!target) return;
  graph.edges.push({
    id: "layout.actor-anchor",
    sources: [actor.id],
    targets: [target.id],
  });
}

function hasDrawnRelation(entity, view) {
  return view.relations.some(
    (relation) =>
      relation.type !== "contains" &&
      relation.type !== "implements" &&
      (relation.sourceId === entity.id || relation.targetId === entity.id),
  );
}

function hoistDisconnectedLeaves(view, childrenByParent, entityById) {
  const relocated = new Map();
  for (const [parentId, children] of childrenByParent) {
    relocated.set(parentId, [...children]);
  }
  for (const entity of view.entities) {
    if (entity.type === "contract" || hasDrawnRelation(entity, view)) continue;
    if ((childrenByParent.get(entity.id) ?? []).length > 0) continue;
    const layer = leafResponsibilityLayer(entity);
    if (!layer) continue;
    let hostId = entity.parentId;
    let current = entityById.get(entity.parentId);
    while (current?.parentId && entityById.has(current.parentId)) {
      const uncles = childrenByParent.get(current.parentId) ?? [];
      const hasNeighbor = uncles.some(
        (item) => item.id !== current.id && leafResponsibilityLayer(item) === layer,
      );
      if (!hasNeighbor) break;
      hostId = current.parentId;
      current = entityById.get(current.parentId);
    }
    if (!hostId || hostId === entity.parentId) continue;
    const from = relocated.get(entity.parentId);
    if (from) {
      const index = from.findIndex((item) => item.id === entity.id);
      if (index >= 0) from.splice(index, 1);
    }
    const into = relocated.get(hostId) ?? [];
    into.push(entity);
    relocated.set(hostId, into);
  }
  return relocated;
}

function expandTightCorridors(nodes, edges) {
  for (let round = 0; round < 4; round += 1) {
    let grew = false;
    for (const edge of edges) {
      const source = nodes.find((node) => node.id === edge.sourceId);
      const target = nodes.find((node) => node.id === edge.targetId);
      const pill = measureEdgeLabel(edge);
      if (!source || !target || pill.width === 0) continue;
      const corridor = corridorToExpand(source, target, edge.points, pill);
      if (!corridor) continue;
      const delta = corridor.needed - corridor.gap;
      if (delta <= 0.5) continue;
      growAlongCut(nodes, edges, corridor.axis, corridor.cut, delta);
      grew = true;
    }
    if (!grew) break;
  }
}

function corridorToExpand(source, target, points, pill) {
  const facing = facingGap(source, target);
  if (facing) {
    const needed = facing.axis === "x" ? pill.width + 20 : pill.height + 16;
    if (facing.gap + 0.5 >= needed) return null;
    return { ...facing, needed };
  }
  const segment = longestSegment(points);
  if (!segment) return null;
  const horizontal = Math.abs(segment.a.y - segment.b.y) < 1;
  const length = horizontal
    ? Math.abs(segment.a.x - segment.b.x)
    : Math.abs(segment.a.y - segment.b.y);
  const needed = horizontal ? pill.width + 20 : pill.height + 16;
  if (length + 0.5 >= needed) return null;
  return {
    axis: horizontal ? "x" : "y",
    gap: length,
    needed,
    cut: horizontal ? Math.max(segment.a.x, segment.b.x) : Math.max(segment.a.y, segment.b.y),
  };
}

function facingGap(source, target) {
  const yOverlap = !(source.y + source.height <= target.y || target.y + target.height <= source.y);
  const xOverlap = !(source.x + source.width <= target.x || target.x + target.width <= source.x);
  if (yOverlap && target.x >= source.x + source.width) {
    return { axis: "x", gap: target.x - (source.x + source.width), cut: target.x };
  }
  if (yOverlap && source.x >= target.x + target.width) {
    return { axis: "x", gap: source.x - (target.x + target.width), cut: source.x };
  }
  if (xOverlap && target.y >= source.y + source.height) {
    return { axis: "y", gap: target.y - (source.y + source.height), cut: target.y };
  }
  if (xOverlap && source.y >= target.y + target.height) {
    return { axis: "y", gap: source.y - (target.y + target.height), cut: source.y };
  }
  return null;
}

function growAlongCut(nodes, edges, axis, cut, delta) {
  for (const node of nodes) {
    const start = axis === "x" ? node.x : node.y;
    const size = axis === "x" ? node.width : node.height;
    if (start >= cut - 0.5) {
      if (axis === "x") node.x += delta;
      else node.y += delta;
    } else if (start + size > cut + 0.5) {
      if (axis === "x") node.width += delta;
      else node.height += delta;
    }
  }
  for (const edge of edges) {
    for (const point of [...(edge.points ?? []), edge.labelPoint].filter(Boolean)) {
      if ((axis === "x" ? point.x : point.y) >= cut - 0.5) {
        if (axis === "x") point.x += delta;
        else point.y += delta;
      }
    }
  }
}

function separateOverlappingBoxes(nodes, edges) {
  const gap = 12;
  for (let round = 0; round < 8; round += 1) {
    let moved = false;
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const left = nodes[i];
        const right = nodes[j];
        if (isContained(left, right) || isContained(right, left)) continue;
        if (!paddedOverlap(left, right, gap)) continue;
        const east = left.x >= right.x ? left : right;
        const west = east === left ? right : left;
        const south = left.y >= right.y ? left : right;
        const north = south === left ? right : left;
        const needX = west.x + west.width + gap - east.x;
        const needY = north.y + north.height + gap - south.y;
        if (needX > 0 && (needY <= 0 || needX <= needY)) {
          growAlongCut(nodes, edges, "x", east.x, needX);
        } else if (needY > 0) {
          growAlongCut(nodes, edges, "y", south.y, needY);
        } else {
          continue;
        }
        moved = true;
      }
    }
    if (!moved) break;
  }
  expandCompoundsToFit(nodes);
}

function placeLabelsNearEdges(edges, nodes) {
  const placed = [];
  const ordered = [...edges].sort((left, right) => polylineLength(right.points) - polylineLength(left.points));
  for (const edge of ordered) {
    const pill = measureEdgeLabel(edge);
    if (pill.width === 0 || (edge.points?.length ?? 0) < 2) continue;
    const others = placed.map((item) => item.rect);
    edge.labelPoint = pickLabelPoint(edge.points, pill, nodes, others);
    placed.push({ edge, rect: pillRect(edge.labelPoint, pill) });
  }
}

function resolveLabelOverlaps(edges, nodes) {
  for (let round = 0; round < 6; round += 1) {
    const items = edges
      .filter((edge) => edge.labelPoint)
      .map((edge) => ({ edge, pill: measureEdgeLabel(edge), rect: pillRect(edge.labelPoint, measureEdgeLabel(edge)) }));
    let grew = false;
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        if (!paddedOverlap(items[i].rect, items[j].rect, 8)) continue;
        const others = items.filter((_, index) => index !== j).map((item) => item.rect);
        const next = pickLabelPoint(items[j].edge.points, items[j].pill, nodes, others);
        if (next && !paddedOverlap(pillRect(next, items[j].pill), items[i].rect, 8)) {
          items[j].edge.labelPoint = next;
          continue;
        }
        const overlapX =
          Math.min(items[i].rect.x + items[i].rect.width, items[j].rect.x + items[j].rect.width) -
          Math.max(items[i].rect.x, items[j].rect.x);
        const overlapY =
          Math.min(items[i].rect.y + items[i].rect.height, items[j].rect.y + items[j].rect.height) -
          Math.max(items[i].rect.y, items[j].rect.y);
        const south = items[i].rect.y >= items[j].rect.y ? items[i].rect : items[j].rect;
        const east = items[i].rect.x >= items[j].rect.x ? items[i].rect : items[j].rect;
        if (overlapY >= overlapX) growAlongCut(nodes, edges, "y", south.y, overlapY + 10);
        else growAlongCut(nodes, edges, "x", east.x, overlapX + 10);
        grew = true;
      }
    }
    placeLabelsNearEdges(edges, nodes);
    if (!grew) break;
  }
}

function pickLabelPoint(points, pill, nodes, otherRects) {
  const fallback = longestSegment(points);
  return (
    labelCandidates(points, pill).find(
      (point) => !labelHitsAnything(point, pill, nodes, otherRects) && nearPolyline(point, points, pill.height + 16),
    ) ?? (fallback ? lerp(fallback.a, fallback.b, 0.5) : { x: points[0]?.x ?? 0, y: points[0]?.y ?? 0 })
  );
}

function labelCandidates(points, pill) {
  const candidates = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const first = points[index];
    const second = points[index + 1];
    const horizontal = Math.abs(first.y - second.y) < 1;
    for (const at of [0.5, 0.38, 0.62, 0.28, 0.72]) {
      const mid = lerp(first, second, at);
      candidates.push(mid);
      if (horizontal) {
        candidates.push({ x: mid.x, y: mid.y + 2 });
        candidates.push({ x: mid.x, y: mid.y + pill.height + 6 });
      } else {
        candidates.push({ x: mid.x + 12, y: mid.y });
        candidates.push({ x: mid.x - 12, y: mid.y });
        candidates.push({ x: mid.x + 12, y: mid.y - 10 });
        candidates.push({ x: mid.x - 12, y: mid.y + 10 });
      }
    }
  }
  return candidates;
}

function labelHitsAnything(point, pill, nodes, otherRects) {
  if (labelHitsBox(point, pill, nodes)) return true;
  const rect = pillRect(point, pill);
  return otherRects.some((other) => paddedOverlap(rect, other, 8));
}

function pillRect(point, pill) {
  return {
    x: point.x - pill.width / 2,
    y: point.y - pill.height - 2,
    width: pill.width,
    height: pill.height,
  };
}

function polylineLength(points = []) {
  let length = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    length += Math.abs(points[index].x - points[index + 1].x) + Math.abs(points[index].y - points[index + 1].y);
  }
  return length;
}

function paddedOverlap(left, right, pad = 0) {
  return (
    left.x < right.x + right.width + pad &&
    left.x + left.width + pad > right.x &&
    left.y < right.y + right.height + pad &&
    left.y + left.height + pad > right.y
  );
}

function isContained(inner, outer) {
  return (
    inner.x >= outer.x - 1 &&
    inner.y >= outer.y - 1 &&
    inner.x + inner.width <= outer.x + outer.width + 1 &&
    inner.y + inner.height <= outer.y + outer.height + 1
  );
}

function labelHitsBox(point, pill, nodes) {
  const left = point.x - pill.width / 2;
  const right = point.x + pill.width / 2;
  const top = point.y - pill.height - 2;
  const bottom = point.y - 2;
  return nodes.some(
    (node) =>
      !node.isCompound &&
      left < node.x + node.width &&
      right > node.x &&
      top < node.y + node.height &&
      bottom > node.y,
  );
}

function nearPolyline(point, points, slack) {
  for (let index = 0; index < points.length - 1; index += 1) {
    const first = points[index];
    const second = points[index + 1];
    const minX = Math.min(first.x, second.x) - slack;
    const maxX = Math.max(first.x, second.x) + slack;
    const minY = Math.min(first.y, second.y) - slack;
    const maxY = Math.max(first.y, second.y) + slack;
    if (point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY) return true;
  }
  return false;
}

function longestSegment(points = []) {
  let best = null;
  let bestLength = -1;
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    const length = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    if (length >= bestLength) {
      bestLength = length;
      best = { a, b };
    }
  }
  return best;
}

function lerp(first, second, at) {
  return {
    x: first.x + (second.x - first.x) * at,
    y: first.y + (second.y - first.y) * at,
  };
}

function snapDisconnectedLeaves(nodes, view, entityById, gutter = 0) {
  const floor = gutter + 12;
  for (const node of nodes) {
    if (node.isCompound || hasDrawnRelation(node, view)) continue;
    const layer = leafResponsibilityLayer(node);
    if (!layer) continue;
    const mates = nodes.filter((other) => {
      if (other.id === node.id || other.isCompound) return false;
      return leafResponsibilityLayer(other) === layer;
    });
    if (mates.length === 0) continue;
    const mateY = Math.min(...mates.map((item) => item.y));
    if (Math.abs(node.y - mateY) < 40) continue;
    const mateLeft = Math.min(...mates.map((item) => item.x));
    const leftX = mateLeft - node.width - 16;
    node.y = mateY;
    node.x = leftX >= floor ? leftX : Math.max(...mates.map((item) => item.x + item.width)) + 16;
  }
}

function keepBoxesOutOfLaneRail(nodes, edges, gutter) {
  const floor = gutter + 12;
  for (let round = 0; round < 6; round += 1) {
    const hit = nodes.find((node) => node.x < floor - 0.5);
    if (!hit) break;
    hit.x = floor;
    const blockers = nodes.filter(
      (other) =>
        other.id !== hit.id &&
        !other.isCompound &&
        !hit.isCompound &&
        boxesOverlap(hit, other),
    );
    for (const blocker of blockers) {
      const needed = hit.x + hit.width + 16 - blocker.x;
      if (needed > 0.5) growAlongCut(nodes, edges, "x", blocker.x, needed);
    }
  }
  expandCompoundsToFit(nodes);
}

function expandCompoundsToFit(nodes) {
  for (const compound of nodes.filter((node) => node.isCompound)) {
    const inner = nodes.filter(
      (node) => node.id !== compound.id && !node.isCompound && centerInside(node, compound),
    );
    if (inner.length === 0) continue;
    const maxX = Math.max(...inner.map((node) => node.x + node.width));
    const maxY = Math.max(...inner.map((node) => node.y + node.height));
    compound.width = Math.max(compound.width, maxX + 16 - compound.x);
    compound.height = Math.max(compound.height, maxY + 16 - compound.y);
  }
}

function centerInside(node, compound) {
  const midX = node.x + node.width / 2;
  const midY = node.y + node.height / 2;
  return (
    midX >= compound.x &&
    midX <= compound.x + compound.width + 16 &&
    midY >= compound.y &&
    midY <= compound.y + compound.height
  );
}

function boxesOverlap(left, right) {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

function edgeJumpsRank(graph, entityById, rank, layerOrder) {
  return graph.edges.some((edge) => {
    if (String(edge.id).startsWith("layout.")) return false;
    const source = entityById.get(edge.sources?.[0]);
    const target = entityById.get(edge.targets?.[0]);
    if (!source || !target) return false;
    const sourceRank = layerRank(leafResponsibilityLayer(source) ?? "", layerOrder);
    const targetRank = layerRank(leafResponsibilityLayer(target) ?? "", layerOrder);
    return sourceRank < rank && targetRank > rank;
  });
}

function addLayerAnchors(graph, childrenByParent, entityById, layerOrder) {
  for (const children of childrenByParent.values()) {
    const byRank = new Map();
    for (const child of children) {
      if (child.type === "contract") continue;
      const layer = leafResponsibilityLayer(child);
      if (!layer) continue;
      const rank = layerRank(layer, layerOrder);
      const bucket = byRank.get(rank) ?? [];
      bucket.push(child);
      byRank.set(rank, bucket);
    }
    const ranks = [...byRank.keys()].sort((left, right) => left - right);
    for (let index = 1; index < ranks.length; index += 1) {
      const previous = byRank.get(ranks[index - 1])[0];
      for (const next of byRank.get(ranks[index])) {
        const hasIncoming = graph.edges.some((edge) => edge.targets.includes(next.id));
        if (hasIncoming) continue;
        if (edgeJumpsRank(graph, entityById, ranks[index], layerOrder)) continue;
        graph.edges.push({
          id: `layout.layer-anchor.${previous.id}.${next.id}`,
          sources: [previous.id],
          targets: [next.id],
        });
      }
    }
  }
}

function lanesFromNodes(nodes, gutter, layerOrder = LAYER_ORDER) {
  const groups = new Map();
  for (const node of nodes) {
    if (node.isCompound) continue;
    const layer = leafResponsibilityLayer(node);
    if (!layer) continue;
    const bucket = groups.get(layer) ?? [];
    bucket.push(node);
    groups.set(layer, bucket);
  }
  const titles = sortLayers([...groups.keys()], layerOrder);
  if (!lanesHaveClearMembership(nodes, groups, titles)) return [];

  let cursor = 0;
  return titles.map((title, index) => {
    const bucket = groups.get(title);
    const top = Math.min(...bucket.map((node) => node.y)) - 16;
    const bottom = Math.max(...bucket.map((node) => node.y + node.height)) + 16;
    const y = index === 0 ? Math.min(0, top) : Math.max(cursor, top);
    const height = Math.max(72, bottom - y);
    cursor = y + height;
    return {
      id: `layer.${title}`,
      title,
      slug: layerSlug(title, layerOrder),
      y,
      height,
      gutter,
    };
  });
}

export function leafResponsibilityLayer(entity) {
  if (!entity) return undefined;
  if (typeof entity.layer === "string" && entity.layer.trim()) return entity.layer.trim();
  if (entity.type === "actor") return "Actor";
  if (entity.type === "store") return "Store";
  return undefined;
}

export function shouldUseResponsibilityLanes(view) {
  const entities = view?.entities ?? [];
  if (!entities.some((entity) => entity.type === "unit")) return false;
  const childIds = new Set(
    entities
      .filter((entity) => entity.parentId && entity.type !== "contract")
      .map((entity) => entity.parentId),
  );
  const layers = new Set();
  for (const entity of entities) {
    if (entity.type === "contract" || childIds.has(entity.id)) continue;
    const layer = leafResponsibilityLayer(entity);
    if (layer && layer !== "Actor") layers.add(layer);
  }
  return layers.size >= 2;
}

export function usedLayerOrder(entities, childrenByParent) {
  const used = new Set();
  for (const entity of entities ?? []) {
    if (entity.type === "contract") continue;
    if (childrenByParent && (childrenByParent.get(entity.id) ?? []).some((child) => child.type !== "contract")) {
      continue;
    }
    const layer = leafResponsibilityLayer(entity);
    if (layer) used.add(layer);
  }
  const known = LAYER_ORDER.filter((name) => used.has(name));
  const custom = [...used].filter((name) => !LAYER_ORDER.includes(name));
  return [...known, ...custom];
}

function lanesHaveClearMembership(nodes, groups, titles) {
  if (titles.length === 0) return false;
  const ranges = titles.map((title) => {
    const bucket = groups.get(title);
    return {
      top: Math.min(...bucket.map((node) => node.y)),
      bottom: Math.max(...bucket.map((node) => node.y + node.height)),
    };
  });
  for (let i = 0; i < ranges.length; i += 1) {
    for (let j = i + 1; j < ranges.length; j += 1) {
      if (ranges[i].top < ranges[j].bottom - 8 && ranges[j].top < ranges[i].bottom - 8) {
        return false;
      }
    }
  }
  for (const node of nodes) {
    if (node.isCompound || leafResponsibilityLayer(node)) continue;
    const midY = node.y + node.height / 2;
    if (ranges.some((range) => midY >= range.top && midY <= range.bottom)) {
      return false;
    }
  }
  return true;
}

function reclaimLaneGutter(placed, gutter) {
  if (!gutter) return placed;
  for (const node of placed.nodes) node.x -= gutter;
  for (const edge of placed.edges) {
    for (const point of edge.points ?? []) point.x -= gutter;
    if (edge.labelPoint) edge.labelPoint.x -= gutter;
  }
  return {
    ...placed,
    width: Math.max(48, placed.width - gutter),
  };
}

function sortLayers(layers, layerOrder = LAYER_ORDER) {
  return [...new Set(layers.filter(Boolean))].sort(
    (left, right) => layerRank(left, layerOrder) - layerRank(right, layerOrder),
  );
}

function layerRank(name, layerOrder = LAYER_ORDER) {
  const index = layerOrder.indexOf(name);
  return index === -1 ? layerOrder.length : index;
}

export function layerSlug(name, layerOrder = LAYER_ORDER) {
  const known = {
    Actor: "actor",
    Presentation: "presentation",
    "接口 / 编排": "interface",
    "领域 / 应用": "domain",
    "持久化 / 网关": "persistence",
    Store: "store",
  };
  if (known[name]) return known[name];
  const palette = ["presentation", "interface", "domain", "persistence", "other"];
  const index = layerOrder.indexOf(name);
  return palette[Math.max(0, index) % palette.length];
}

function shiftArchitecture(nodes, edges, options = {}) {
  const bound = boundsOf(nodes, edges);
  const minX = Math.min(bound.minX, options.extraMinX ?? bound.minX);
  const minY = Math.min(bound.minY, options.extraMinY ?? bound.minY);
  const shiftX = minX < 8 ? 8 - minX : 0;
  const shiftY = minY < 8 ? 8 - minY : 0;
  if (shiftX || shiftY) {
    for (const node of nodes) {
      node.x += shiftX;
      node.y += shiftY;
    }
    for (const edge of edges) {
      for (const point of edge.points ?? []) {
        point.x += shiftX;
        point.y += shiftY;
      }
      if (edge.labelPoint) {
        edge.labelPoint.x += shiftX;
        edge.labelPoint.y += shiftY;
      }
    }
  }
  return {
    width: Math.ceil(bound.maxX + shiftX + 48),
    height: Math.ceil(bound.maxY + shiftY + 48),
    nodes,
    edges,
    shiftX,
    shiftY,
  };
}

function boundsOf(nodes, edges) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = 0;
  let maxY = 0;
  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + node.width);
    maxY = Math.max(maxY, node.y + node.height);
  }
  for (const edge of edges) {
    for (const point of [...(edge.points ?? []), edge.labelPoint].filter(Boolean)) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 1200, maxY: 720 };
  return { minX, minY, maxX, maxY };
}
