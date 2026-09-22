import { edgesFromElk } from "./edges.ts";
import { collectContracts, measureBox, measureBoxHeader, measureEdgeLabel, participantContent, wrapText } from "./measure.ts";
import ELK from "./elkImport.ts";
import { projectArchitecture, resolveFocusId, shouldOmitOverview } from "../scope/architecture.ts";

const elk = new ELK();

const RELATION_LABELS = {
  calls: "调用",
  reads: "读取",
  writes: "写入",
  implements: "实现",
  dependsOn: "依赖",
  publishes: "发布",
  subscribes: "订阅",
};

export async function calculateArchitecture(walkthrough, options: { view?: "overview" | "detail" } = {}) {
  const focusId = resolveFocusId(walkthrough);
  if (options.view === "overview") {
    if (!focusId) return null;
    const view = projectArchitecture(walkthrough, focusId, true);
    if (shouldOmitOverview(view)) return null;
    return layoutWithElk(view, { layered: false });
  }
  const view = focusId ? projectArchitecture(walkthrough, focusId, false) : walkthrough;
  return layoutWithElk(view, { layered: shouldUseResponsibilityLanes(view) });
}

async function layoutWithElk(view, options) {
  const { entityById, childrenByParent, roots } = indexEntities(view);
  const layerOrder = usedLayerOrder(view.participants, childrenByParent);
  const gutter = options.layered ? 156 : 0;
  if (options.layered) {
    return layoutPartitionedLeaves(view, entityById, childrenByParent, layerOrder, gutter);
  }
  const graph = {
    id: "architecture-root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
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
      "elk.layered.spacing.nodeNodeBetweenLayers": "28",
      "elk.spacing.edgeNode": "10",
      "elk.spacing.edgeEdge": "8",
      "elk.padding": "[top=16,left=16,bottom=16,right=20]",
    },
    children: createElkForest(roots, childrenByParent, view, entityById, false, layerOrder),
    edges: elkEdgeSpecs(view, entityById),
  };
  addActorAnchor(graph, view);

  const result = await elk.layout(graph);
  const nodes = [];
  flattenNodes(result.children ?? [], 0, 0, entityById, view, nodes);
  const edges = edgesFromElk(result, view.relations);
  expandTightCorridors(nodes, edges);
  separateOverlappingBoxes(nodes, edges);
  placeLabelsNearEdges(edges, nodes);
  resolveLabelOverlaps(edges, nodes);
  return finishDrawing(shiftArchitecture(nodes, edges));
}

async function layoutPartitionedLeaves(view, entityById, childrenByParent, layerOrder, gutter) {
  const leaves = view.participants.filter((entity) => {
    if (entity.type === "contract") return false;
    return !(childrenByParent.get(entity.id) ?? []).some((child) => child.type !== "contract");
  });
  const leafIds = new Set(leaves.map((leaf) => leaf.id));
  const rankOf = new Map();
  for (const leaf of leaves) {
    const layer = leafResponsibilityLayer(leaf);
    if (layer) rankOf.set(leaf.id, layerRank(layer, layerOrder));
  }
  const leafEdges = elkEdgeSpecs(view, entityById).filter(
    (edge) => leafIds.has(edge.sources[0]) && leafIds.has(edge.targets[0]),
  );
  const forwardEdges = [];
  const feedbackEdges = [];
  for (const edge of leafEdges) {
    const source = rankOf.get(edge.sources[0]);
    const target = rankOf.get(edge.targets[0]);
    if (source != null && target != null && source < target) forwardEdges.push(edge);
    else feedbackEdges.push(edge);
  }
  const graph = {
    id: "architecture-root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.layered.unnecessaryBendpoints": "true",
      "elk.layered.nodePlacement.favorStraightEdges": "true",
      "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
      "elk.layered.nodePlacement.bk.fixedAlignment": "LEFTUP",
      "elk.edgeLabels.inline": "true",
      "elk.spacing.edgeLabel": "8",
      "elk.spacing.labelLabel": "4",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.separateConnectedComponents": "false",
      "elk.spacing.nodeNode": "28",
      "elk.layered.spacing.nodeNodeBetweenLayers": "40",
      "elk.spacing.edgeNode": "14",
      "elk.spacing.edgeEdge": "10",
      "elk.padding": `[top=16,left=${gutter + 16},bottom=16,right=24]`,
      "elk.partitioning.activate": "true",
    },
    children: leaves.map((entity) => {
      const rank = rankOf.get(entity.id);
      const size = measureBox(entity, collectContracts(entity, view));
      return {
        id: entity.id,
        width: size.width,
        height: size.height,
        layoutOptions: {
          ...(rank == null ? {} : { "elk.partitioning.partition": String(rank) }),
        },
      };
    }),
    edges: forwardEdges.map((edge) => ({ id: edge.id, sources: edge.sources, targets: edge.targets })),
  };

  const result = await elk.layout(graph);
  const nodes = [];
  flattenNodes(result.children ?? [], 0, 0, entityById, view, nodes);
  appendCompoundFrames(nodes, view, childrenByParent);
  const edges = edgesFromElk(result, view.relations);
  addFeedbackEdges(feedbackEdges, view.relations, edges);
  applyContentSize(nodes);
  compactLeafRows(nodes, edges);
  packLeavesByAncestor(nodes, edges);
  fitCompoundsToDescendants(nodes);
  shiftInsideGutter(nodes, edges, gutter);
  const placed = shiftArchitecture(nodes, edges);
  routeWithPorts(placed.edges, placed.nodes);
  placeLabelsNearEdges(placed.edges, placed.nodes);
  const lanes = fillLaneGaps(
    lanesFromNodes(placed.nodes, gutter, layerOrder),
    Math.max(contentBottom(placed.nodes, placed.edges), placed.height),
  );
  if (lanes.length === 0) {
    return finishDrawing({ ...reclaimLaneGutter(placed, gutter), lanes: [], gutter: 0 });
  }
  const last = lanes.at(-1);
  return finishDrawing({
    ...placed,
    width: Math.max(placed.width, gutter + 48),
    height: Math.max(placed.height, (last?.y ?? 0) + (last?.height ?? 0)),
    lanes,
    gutter,
  });
}

function addFeedbackEdges(specs, relations, edges) {
  const relationById = new Map<string, any>(relations.map((relation) => [relation.id, relation]));
  const have = new Set(edges.map((edge) => edge.id));
  for (const spec of specs) {
    if (have.has(spec.id)) continue;
    const relation = relationById.get(spec.id);
    if (!relation) continue;
    edges.push({ ...relation, points: [] });
  }
}

function appendCompoundFrames(nodes, view, childrenByParent) {
  const present = new Set(nodes.map((node) => node.id));
  for (const entity of view.participants) {
    if (entity.type === "contract" || entity.type === "system" || present.has(entity.id)) continue;
    if (!(childrenByParent.get(entity.id) ?? []).some((child) => child.type !== "contract")) continue;
    const size = measureBox({ ...entity, layer: undefined }, collectContracts(entity, view));
    nodes.push({
      ...entity,
      contracts: collectContracts(entity, view),
      x: 0,
      y: 0,
      width: size.width,
      height: size.height,
      isCompound: true,
      headerHeight: measureBoxHeader(entity),
    });
  }
}

function shiftInsideGutter(nodes, edges, gutter) {
  if (!nodes.length) return;
  const minX = Math.min(...nodes.map((node) => node.x));
  const delta = gutter + 8 - minX;
  if (delta <= 0) return;
  for (const node of nodes) node.x += delta;
  for (const edge of edges) {
    for (const point of edge.points ?? []) point.x += delta;
    if (edge.labelPoint) edge.labelPoint.x += delta;
  }
}

function finishDrawing(picture) {
  const gutter = picture.gutter ?? 0;
  return {
    ...picture,
    nodes: picture.nodes.map((node) => ({ ...node, content: participantContent(node) })),
    edges: picture.edges.map((edge) => edgeDrawing(edge)),
    lanes: (picture.lanes ?? []).map((lane) => laneTitle(lane, gutter || lane.gutter || 156)),
  };
}

function edgeDrawing(edge) {
  const points = edge.points ?? [];
  const title = edge.label || RELATION_LABELS[edge.type] || "";
  const protocol = edge.protocol ?? "";
  const labelPoint = edge.labelPoint ?? (points.length >= 2 ? midpoint(points[0], points[1]) : undefined);
  const pill = measureEdgeLabel(edge);
  return {
    ...edge,
    path: points.length >= 2 ? roundedOrthogonalPath(points, 12) : "",
    caption: title
      ? { title, protocol, x: labelPoint?.x ?? 0, y: labelPoint?.y ?? 0, width: pill.width, height: pill.height }
      : null,
  };
}

function laneTitle(lane, gutter) {
  const titleLines = wrapText(lane.title, gutter - 40, 12, 3);
  const anchor = lane.contentMid ?? lane.y + lane.height / 2;
  const titleTop = anchor - ((titleLines.length - 1) * 15) / 2 + 4;
  return { ...lane, titleLines, titleTop };
}

function roundedOrthogonalPath(points, radius) {
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    const corner = Math.min(radius, distance(previous, current) / 2, distance(current, next) / 2);
    const inbound = moveToward(current, previous, corner);
    const outbound = moveToward(current, next, corner);
    path += ` L ${inbound.x} ${inbound.y} Q ${current.x} ${current.y} ${outbound.x} ${outbound.y}`;
  }
  path += ` L ${points.at(-1).x} ${points.at(-1).y}`;
  return path;
}

function moveToward(from, to, distanceValue) {
  const length = distance(from, to) || 1;
  return { x: from.x + ((to.x - from.x) / length) * distanceValue, y: from.y + ((to.y - from.y) / length) * distanceValue };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function indexEntities(view) {
  const entityById = new Map<string, any>(view.participants.map((entity) => [entity.id, entity]));
  const childrenByParent = new Map();
  for (const entity of view.participants) {
    if (!entity.parentId || entity.type === "contract") continue;
    const siblings = childrenByParent.get(entity.parentId) ?? [];
    siblings.push(entity);
    childrenByParent.set(entity.parentId, siblings);
  }
  const roots = view.participants.filter(
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
  const node: {
    id: string;
    width: number;
    height: number;
    layoutOptions: Record<string, string>;
    children?: unknown[];
  } = {
    id: entity.id,
    width: size.width,
    height: size.height,
    layoutOptions: {},
  };
  if (children.length > 0) {
    node.children = children.map((child) =>
      createElkNode(child, childrenByParent, walkthrough, entityById, layered, layerOrder),
    );
    const padding = `[top=${measureBoxHeader(entity) + 8},left=16,bottom=16,right=16]`;
    node.layoutOptions = layered
      ? {
          "elk.padding": padding,
          "elk.spacing.nodeNode": "20",
        }
      : {
          "elk.algorithm": "layered",
          "elk.direction": entity.type !== "container" ? "DOWN" : "RIGHT",
          "elk.edgeRouting": "ORTHOGONAL",
          "elk.layered.unnecessaryBendpoints": "true",
          "elk.layered.nodePlacement.favorStraightEdges": "true",
          "elk.edgeLabels.inline": "true",
          "elk.spacing.edgeLabel": "10",
          "elk.padding": padding,
          "elk.spacing.nodeNode": "20",
          "elk.layered.spacing.nodeNodeBetweenLayers": "20",
          "elk.spacing.edgeNode": "8",
          "elk.separateConnectedComponents": "false",
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
      elkLabels: (node.labels ?? [])
        .filter((label) => Number.isFinite(label.x) && Number.isFinite(label.y))
        .map((label) => ({
          text: label.text,
          x: label.x,
          y: label.y,
          width: label.width,
          height: label.height,
          role: String(label.id ?? "").split("::")[1] || "title",
        })),
    });
    flattenNodes(node.children ?? [], x, y, entityById, walkthrough, target);
  }
}

function elkEdgeSpecs(view, entityById) {
  const hostByContract = new Map();
  for (const entity of view.participants) {
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
  const actor = view.participants.find((entity) => entity.type === "actor");
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
    const segment = longestHorizontal(edge.points) ?? longestSegment(edge.points);
    const candidates = segment ? [0.5, 0.35, 0.65, 0.22, 0.78].map((at) => lerp(segment.a, segment.b, at)) : [];
    edge.labelPoint =
      candidates.find((point) => !labelHitsAnything(point, pill, nodes, others)) ??
      candidates[0] ??
      pickLabelPoint(edge.points, pill, nodes, others);
    placed.push({ edge, rect: pillRect(edge.labelPoint, pill) });
  }
}

function resolveLabelOverlaps(edges, nodes, allowGrow = true) {
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
        if (!allowGrow) continue;
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

function longestHorizontal(points = []) {
  let best = null;
  let bestLength = -1;
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    if (Math.abs(a.y - b.y) > 1) continue;
    const length = Math.abs(a.x - b.x);
    if (length <= bestLength) continue;
    bestLength = length;
    best = { a, b };
  }
  return best;
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

function packLeavesByAncestor(nodes, edges) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const leaves = nodes.filter((node) => !node.isCompound);
  if (leaves.length < 2) return;
  const rows = new Map();
  for (const leaf of leaves) {
    const key = leafResponsibilityLayer(leaf) ?? `y:${Math.round(leaf.y / 8)}`;
    const row = rows.get(key) ?? [];
    row.push(leaf);
    rows.set(key, row);
  }
  const rootOrder = orderByMinX(leaves, (leaf) => outermostId(leaf, byId));
  const parentOrder = orderByMinX(leaves, (leaf) => leaf.parentId ?? leaf.id);
  const parentWidth = new Map();
  for (const row of rows.values()) {
    const grouped = new Map();
    for (const leaf of row) {
      const parent = leaf.parentId ?? leaf.id;
      const group = grouped.get(parent) ?? [];
      group.push(leaf);
      grouped.set(parent, group);
    }
    for (const [parent, group] of grouped) {
      const width = group.reduce((sum, leaf) => sum + leaf.width, 0) + 28 * (group.length - 1);
      parentWidth.set(parent, Math.max(parentWidth.get(parent) ?? 0, width));
    }
  }
  const parentsByRoot = new Map();
  for (const leaf of leaves) {
    const root = outermostId(leaf, byId);
    const parent = leaf.parentId ?? leaf.id;
    const list = parentsByRoot.get(root) ?? [];
    if (!list.includes(parent)) list.push(parent);
    parentsByRoot.set(root, list);
  }
  const parentX = new Map();
  let cursor = Math.min(...leaves.map((leaf) => leaf.x));
  for (const root of [...parentsByRoot.keys()].sort(
    (left, right) => (rootOrder.get(left) ?? 0) - (rootOrder.get(right) ?? 0),
  )) {
    const parents = parentsByRoot.get(root).sort((left, right) => (parentOrder.get(left) ?? 0) - (parentOrder.get(right) ?? 0));
    for (const parent of parents) {
      parentX.set(parent, cursor);
      cursor += (parentWidth.get(parent) ?? 0) + 56;
    }
    cursor += 24;
  }
  for (const row of rows.values()) {
    const used = new Map();
    for (const leaf of [...row].sort((left, right) => left.x - right.x)) {
      const parent = leaf.parentId ?? leaf.id;
      const origin = parentX.get(parent) ?? leaf.x;
      const local = used.get(parent) ?? 0;
      leaf.x = origin + local;
      used.set(parent, local + leaf.width + 28);
    }
  }
}

function orderByMinX(leaves, keyOf) {
  const minX = new Map();
  for (const leaf of leaves) {
    const key = keyOf(leaf);
    minX.set(key, Math.min(minX.get(key) ?? Infinity, leaf.x));
  }
  const keys = [...minX.keys()].sort((left, right) => minX.get(left) - minX.get(right) || String(left).localeCompare(String(right)));
  return new Map(keys.map((key, index) => [key, index]));
}

function outermostId(node, byId) {
  let current = node;
  let top = node.id;
  while (current?.parentId && byId.has(current.parentId)) {
    current = byId.get(current.parentId);
    top = current.id;
  }
  return top;
}

function applyContentSize(nodes) {
  for (const node of nodes) {
    if (node.isCompound) continue;
    const size = measureBox(node, node.contracts ?? []);
    node.width = size.width;
    node.height = size.height;
    node.elkLabels = undefined;
  }
}

function compactLeafRows(nodes, edges) {
  const leaves = nodes.filter((node) => !node.isCompound);
  if (leaves.length === 0) return;
  const rowKey = (node) => leafResponsibilityLayer(node) ?? `y:${Math.round(node.y / 8)}`;
  const rows = new Map();
  for (const leaf of leaves) {
    const key = rowKey(leaf);
    const row = rows.get(key) ?? [];
    row.push(leaf);
    rows.set(key, row);
  }
  const ordered = [...rows.values()].sort(
    (left, right) => Math.min(...left.map((node) => node.y)) - Math.min(...right.map((node) => node.y)),
  );
  const rowIndex = new Map();
  ordered.forEach((row, rowNumber) => {
    for (const node of row) rowIndex.set(node.id, rowNumber);
  });
  let cursor = Math.min(...leaves.map((node) => node.y));
  for (let index = 0; index < ordered.length; index += 1) {
    const row = ordered[index];
    for (const node of row) node.y = cursor;
    const height = Math.max(...row.map((node) => node.height));
    const next = ordered[index + 1];
    const earlier = ordered.slice(0, index + 1).flat();
    const crossing = edges.filter((edge) => {
      const from = rowIndex.get(edge.sourceId);
      const to = rowIndex.get(edge.targetId);
      if (from == null || to == null) return false;
      return Math.min(from, to) <= index && Math.max(from, to) > index;
    }).length;
    const channelSpace = crossing === 0 ? 24 : 18 + crossing * 46;
    const intrusion = next ? headerIntrusion(next, earlier, nodes) : 0;
    cursor += height + channelSpace + intrusion;
  }
}

function headerIntrusion(nextRow, earlierLeaves, nodes) {
  const byId = new Map<string, any>(nodes.map((node) => [node.id, node]));
  const earlier = new Set(earlierLeaves.map((node) => node.id));
  let max = 0;
  for (const leaf of nextRow) {
    let total = 0;
    let current = leaf;
    while (current?.parentId && byId.has(current.parentId)) {
      const parent = byId.get(current.parentId);
      const descendants = nodes.filter(
        (node) => !node.isCompound && node.id !== parent.id && isDescendantOf(node, parent.id, byId),
      );
      if (descendants.some((node) => earlier.has(node.id))) break;
      total += (parent.headerHeight ?? 36) + 10;
      current = parent;
    }
    max = Math.max(max, total);
  }
  return max;
}

function routeWithPorts(edges, nodes) {
  const byId = new Map<string, any>(nodes.map((node) => [node.id, node]));
  const leaves = nodes.filter((node) => !node.isCompound);
  const routed = edges.filter((edge) => {
    const source = byId.get(edge.sourceId);
    const target = byId.get(edge.targetId);
    return source && target && !source.isCompound && !target.isCompound;
  });
  const grouped = new Map();
  for (const edge of routed) {
    for (const nodeId of [edge.sourceId, edge.targetId]) {
      const side = portSide(edge, nodeId, byId);
      const key = `${nodeId}|${side}`;
      const group = grouped.get(key) ?? [];
      group.push(edge);
      grouped.set(key, group);
    }
  }
  const ports = new Map();
  for (const [key, group] of grouped) {
    const [nodeId, side] = key.split("|");
    const node = byId.get(nodeId);
    const sorted = [...group].sort((left, right) => portOrder(left, right, nodeId, side, byId));
    sorted.forEach((edge, index) => {
      ports.set(`${edge.id}|${nodeId}`, portPosition(node, side, index, sorted.length));
    });
  }
  const rowBottom = new Map();
  for (const leaf of leaves) {
    const key = Math.round(leaf.y);
    rowBottom.set(key, Math.max(rowBottom.get(key) ?? 0, leaf.y + leaf.height));
  }
  const gapUse = new Map();
  for (const edge of routed) {
    const source = byId.get(edge.sourceId);
    const target = byId.get(edge.targetId);
    const upper = source.y <= target.y ? source : target;
    const gap = `${Math.round(upper.y)}`;
    const index = gapUse.get(gap) ?? 0;
    gapUse.set(gap, index + 1);
    const sourcePort = ports.get(`${edge.id}|${edge.sourceId}`);
    const targetPort = ports.get(`${edge.id}|${edge.targetId}`);
    const channelY = (rowBottom.get(Math.round(upper.y)) ?? upper.y + upper.height) + 16 + index * 46;
    edge.points = bendBetween(sourcePort, targetPort, channelY, leaves, index);
    edge.labelPoint = labelOnSegment(edge.points);
  }
}

function portSide(edge, nodeId, byId) {
  const self = byId.get(nodeId);
  const other = byId.get(nodeId === edge.sourceId ? edge.targetId : edge.sourceId);
  if (Math.abs(self.y - other.y) < 8) return other.x >= self.x ? "right" : "left";
  return other.y > self.y + 8 ? "bottom" : "top";
}

function portOrder(left, right, nodeId, side, byId) {
  const other = (edge) => byId.get(edge.sourceId === nodeId ? edge.targetId : edge.sourceId);
  const a = other(left);
  const b = other(right);
  if (side === "left" || side === "right") return a.y - b.y || a.x - b.x;
  return a.x - b.x || a.y - b.y;
}

function portPosition(node, side, index, count) {
  const along = (index + 1) / (count + 1);
  if (side === "bottom" || side === "top") {
    return {
      x: node.x + node.width * along,
      y: side === "bottom" ? node.y + node.height : node.y,
      side,
    };
  }
  return {
    x: side === "left" ? node.x : node.x + node.width,
    y: node.y + node.height * along,
    side,
  };
}

function bendBetween(sourcePort, targetPort, channelY, leaves, index) {
  const nearby = routeAcrossGap(sourcePort, targetPort, leaves, index);
  if (nearby) return nearby;
  return routeChannel(sourcePort, targetPort, channelY, leaves, index);
}

function routeAcrossGap(sourcePort, targetPort, leaves, index) {
  const facing =
    (sourcePort.side === "right" && targetPort.side === "left") ||
    (sourcePort.side === "left" && targetPort.side === "right");
  if (!facing) return null;
  const left = Math.min(sourcePort.x, targetPort.x);
  const right = Math.max(sourcePort.x, targetPort.x);
  if (right - left < 8) return null;
  if (Math.abs(sourcePort.y - targetPort.y) < 1) {
    const direct = [sourcePort, targetPort];
    return polylineHitsLeaf(direct, leaves) ? null : direct;
  }
  if (right - left < APPROACH * 2) return null;
  const jogX = Math.min(right - APPROACH, Math.max(left + APPROACH, left + (right - left) * (((index % 4) + 1) / 5)));
  const jog = [sourcePort, { x: jogX, y: sourcePort.y }, { x: jogX, y: targetPort.y }, targetPort];
  return polylineHitsLeaf(jog, leaves) ? null : dedupePoints(jog);
}

function routeChannel(sourcePort, targetPort, channelY, leaves, index) {
  const sourceApproach = approachOf(sourcePort, leaves, index);
  const targetApproach = approachOf(targetPort, leaves, index);
  const stagger = index * 14;
  for (const y of bandCandidates(sourcePort, sourceApproach, targetPort, targetApproach, channelY)) {
    const path = channelPath(sourcePort, sourceApproach, targetPort, targetApproach, y);
    if (!polylineHitsLeaf(path, leaves)) return path;
  }
  const top = Math.min(...leaves.map((node) => node.y)) - APPROACH - stagger;
  const bottom = Math.max(...leaves.map((node) => node.y + node.height)) + APPROACH + stagger;
  const left = Math.min(...leaves.map((node) => node.x)) - APPROACH - stagger;
  const right = Math.max(...leaves.map((node) => node.x + node.width)) + APPROACH + stagger;
  const around = [];
  for (const laneY of [top, bottom]) {
    for (const railX of [left, right]) {
      around.push(aroundPath(sourcePort, sourceApproach, targetPort, targetApproach, laneY, railX));
    }
  }
  return around.find((path) => !polylineHitsLeaf(path, leaves)) ?? around[0];
}

function channelPath(sourcePort, sourceApproach, targetPort, targetApproach, y) {
  const band = clampBand(sourcePort, sourceApproach, targetPort, targetApproach, y);
  return dedupePoints([
    sourcePort,
    sourceApproach,
    { x: sourceApproach.x, y: band },
    { x: targetApproach.x, y: band },
    targetApproach,
    targetPort,
  ]);
}

function aroundPath(sourcePort, sourceApproach, targetPort, targetApproach, laneY, railX) {
  const sourceAtLane = facePoint(sourcePort, sourceApproach, laneY);
  const targetAtLane = facePoint(targetPort, targetApproach, laneY);
  return dedupePoints([
    sourcePort,
    sourceApproach,
    sourceAtLane,
    { x: railX, y: sourceAtLane.y },
    { x: railX, y: targetAtLane.y },
    targetAtLane,
    targetApproach,
    targetPort,
  ]);
}

function facePoint(port, approach, laneY) {
  if (port.side === "left" || port.side === "right") return { x: approach.x, y: laneY };
  return { x: approach.x, y: approach.y };
}

function clampBand(sourcePort, sourceApproach, targetPort, targetApproach, y) {
  let band = y;
  for (const [port, approach] of [
    [sourcePort, sourceApproach],
    [targetPort, targetApproach],
  ]) {
    if (port.side === "bottom") band = Math.max(band, approach.y);
    if (port.side === "top") band = Math.min(band, approach.y);
  }
  return band;
}

function bandCandidates(sourcePort, sourceApproach, targetPort, targetApproach, channelY) {
  let minY = -Infinity;
  let maxY = Infinity;
  for (const [port, approach] of [
    [sourcePort, sourceApproach],
    [targetPort, targetApproach],
  ]) {
    if (port.side === "bottom") minY = Math.max(minY, approach.y);
    if (port.side === "top") maxY = Math.min(maxY, approach.y);
  }
  const start = Math.min(Math.max(channelY, minY === -Infinity ? channelY : minY), maxY === Infinity ? channelY + 108 : maxY);
  const bands = [];
  for (let step = 0; step < 4; step += 1) {
    const y = start + step * 36;
    if (maxY !== Infinity && y > maxY) break;
    bands.push(y);
  }
  return bands.length > 0 ? bands : [channelY];
}

const APPROACH = 30;

function approachOf(port, leaves, slot = 0) {
  const horizontal = port.side === "right" ? 1 : port.side === "left" ? -1 : 0;
  const vertical = port.side === "bottom" ? 1 : port.side === "top" ? -1 : 0;
  const room = horizontal !== 0 ? sideClearance(port, horizontal, leaves) : endClearance(port, vertical, leaves);
  const distance = room >= APPROACH + 4 ? APPROACH : Math.max(14, Math.min(APPROACH, room - 4));
  const spread = Math.min(slot * 12, Math.max(0, room - distance - 4));
  const outward = distance + spread;
  return { x: port.x + horizontal * outward, y: port.y + vertical * outward };
}

function endClearance(port, dir, leaves) {
  let room = Infinity;
  for (const leaf of leaves) {
    const ownsPort =
      (dir > 0 && Math.abs(port.y - (leaf.y + leaf.height)) < 1.5) ||
      (dir < 0 && Math.abs(port.y - leaf.y) < 1.5);
    if (ownsPort && port.x >= leaf.x - 1 && port.x <= leaf.x + leaf.width + 1) continue;
    if (port.x <= leaf.x + 1 || port.x >= leaf.x + leaf.width - 1) continue;
    if (dir > 0 && leaf.y > port.y) room = Math.min(room, leaf.y - port.y);
    if (dir < 0 && leaf.y + leaf.height < port.y) room = Math.min(room, port.y - (leaf.y + leaf.height));
  }
  return room;
}

function sideClearance(port, dir, leaves) {
  let room = Infinity;
  for (const leaf of leaves) {
    const ownsPort =
      (dir > 0 && Math.abs(port.x - (leaf.x + leaf.width)) < 1.5) ||
      (dir < 0 && Math.abs(port.x - leaf.x) < 1.5);
    if (ownsPort && port.y >= leaf.y - 1 && port.y <= leaf.y + leaf.height + 1) continue;
    if (port.y <= leaf.y + 1 || port.y >= leaf.y + leaf.height - 1) continue;
    if (dir > 0 && leaf.x > port.x) room = Math.min(room, leaf.x - port.x);
    if (dir < 0 && leaf.x + leaf.width < port.x) room = Math.min(room, port.x - (leaf.x + leaf.width));
  }
  return room;
}

function dedupePoints(points) {
  return points.filter((point, index) => {
    const previous = points[index - 1];
    return !previous || Math.abs(previous.x - point.x) > 0.5 || Math.abs(previous.y - point.y) > 0.5;
  });
}

function polylineHitsLeaf(points, leaves) {
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    if (Math.abs(from.y - to.y) < 1 && horizontalHitsLeaf(from.y, from.x, to.x, leaves)) return true;
    if (Math.abs(from.x - to.x) < 1 && verticalHitsLeaf(from.x, from.y, to.y, leaves, "", "")) return true;
  }
  return false;
}

function labelOnSegment(points) {
  let best = null;
  let bestLength = -1;
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    const length = Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
    if (Math.abs(from.y - to.y) > 1 || length <= bestLength) continue;
    bestLength = length;
    best = midpoint(from, to);
  }
  return best ?? (points.length >= 2 ? midpoint(points[0], points[1]) : undefined);
}

function horizontalHitsLeaf(y, left, right, leaves) {
  const minX = Math.min(left, right);
  const maxX = Math.max(left, right);
  return leaves.some(
    (node) => y > node.y + 1 && y < node.y + node.height - 1 && maxX > node.x && minX < node.x + node.width,
  );
}

function verticalHitsLeaf(x, fromY, toY, leaves, sourceId, targetId) {
  const minY = Math.min(fromY, toY);
  const maxY = Math.max(fromY, toY);
  return leaves.some(
    (node) =>
      node.id !== sourceId &&
      node.id !== targetId &&
      x > node.x + 1 &&
      x < node.x + node.width - 1 &&
      maxY > node.y &&
      minY < node.y + node.height,
  );
}

function fitCompoundsToDescendants(nodes) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const compounds = nodes.filter((node) => node.isCompound).sort((left, right) => depthOf(right, byId) - depthOf(left, byId));
  for (const compound of compounds) {
    const descendants = nodes.filter((node) => node.id !== compound.id && isDescendantOf(node, compound.id, byId));
    if (descendants.length === 0) continue;
    const header = compound.headerHeight ?? 28;
    const minX = Math.min(...descendants.map((node) => node.x));
    const minY = Math.min(...descendants.map((node) => node.y));
    const maxX = Math.max(...descendants.map((node) => node.x + node.width));
    const maxY = Math.max(...descendants.map((node) => node.y + node.height));
    compound.x = minX - 12;
    compound.y = minY - header - 8;
    compound.width = maxX + 12 - compound.x;
    compound.height = maxY + 12 - compound.y;
  }
}

function depthOf(node, byId) {
  let depth = 0;
  let current = node;
  while (current?.parentId && byId.has(current.parentId)) {
    depth += 1;
    current = byId.get(current.parentId);
  }
  return depth;
}

function expandCompoundsToFit(nodes) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const depthOf = (node) => {
    let depth = 0;
    let current = node;
    while (current?.parentId && byId.has(current.parentId)) {
      depth += 1;
      current = byId.get(current.parentId);
    }
    return depth;
  };
  const compounds = nodes.filter((node) => node.isCompound).sort((left, right) => depthOf(right) - depthOf(left));
  for (const compound of compounds) {
    const descendants = nodes.filter((node) => node.id !== compound.id && isDescendantOf(node, compound.id, byId));
    if (descendants.length === 0) continue;
    const minX = Math.min(compound.x, ...descendants.map((node) => node.x));
    const minY = Math.min(compound.y, ...descendants.map((node) => node.y));
    const maxX = Math.max(compound.x + compound.width, ...descendants.map((node) => node.x + node.width));
    const maxY = Math.max(compound.y + compound.height, ...descendants.map((node) => node.y + node.height));
    compound.x = minX - 16;
    compound.y = minY - 16;
    compound.width = maxX + 16 - compound.x;
    compound.height = maxY + 16 - compound.y;
  }
}

function isDescendantOf(node, ancestorId, byId) {
  let current = node;
  while (current?.parentId) {
    if (current.parentId === ancestorId) return true;
    current = byId.get(current.parentId);
  }
  return false;
}

function boxesOverlap(left, right) {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

function contentBottom(nodes, edges) {
  let bottom = 0;
  for (const node of nodes) bottom = Math.max(bottom, node.y + node.height);
  for (const edge of edges) {
    for (const point of edge.points ?? []) bottom = Math.max(bottom, point.y);
    if (edge.labelPoint) bottom = Math.max(bottom, edge.labelPoint.y);
  }
  return bottom + 24;
}

function fillLaneGaps(lanes, bottom) {
  if (lanes.length === 0) return lanes;
  if (lanes[0].y > 0) {
    lanes[0].height += lanes[0].y;
    lanes[0].y = 0;
  }
  for (let index = 0; index < lanes.length - 1; index += 1) {
    lanes[index].height = lanes[index + 1].y - lanes[index].y;
  }
  const last = lanes.at(-1);
  last.height = Math.max(last.height, bottom - last.y);
  return lanes;
}

function lanesFromNodes(nodes, gutter, layerOrder: string[] = []) {
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
      contentMid: (top + bottom) / 2,
      gutter,
    };
  });
}

export function leafResponsibilityLayer(participant) {
  if (!participant) return undefined;
  if (typeof participant.layer === "string" && participant.layer.trim()) return participant.layer.trim();
  return undefined;
}

export function shouldUseResponsibilityLanes(view) {
  const participants = view?.participants ?? [];
  const childIds = new Set(
    participants
      .filter((participant) => participant.parentId && participant.type !== "contract")
      .map((participant) => participant.parentId),
  );
  const unitLeaves = participants.filter(
    (participant) => participant.type === "unit" && !childIds.has(participant.id),
  );
  if (unitLeaves.length === 0) return false;
  if (unitLeaves.some((unit) => !leafResponsibilityLayer(unit))) return false;
  return new Set(unitLeaves.map((unit) => leafResponsibilityLayer(unit))).size >= 2;
}

export function usedLayerOrder(participants, childrenByParent = undefined) {
  const order: string[] = [];
  for (const participant of participants ?? []) {
    if (participant.type === "contract") continue;
    if (childrenByParent && (childrenByParent.get(participant.id) ?? []).some((child) => child.type !== "contract")) {
      continue;
    }
    const layer = leafResponsibilityLayer(participant);
    if (layer && !order.includes(layer)) order.push(layer);
  }
  return order;
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

function sortLayers(layers, layerOrder: string[] = []) {
  return [...new Set(layers.filter(Boolean))].sort(
    (left, right) => layerRank(left, layerOrder) - layerRank(right, layerOrder),
  );
}

function layerRank(name, layerOrder: string[] = []) {
  const index = layerOrder.indexOf(name);
  return index === -1 ? layerOrder.length : index;
}

export function layerSlug(name, layerOrder: string[] = []) {
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

function shiftArchitecture(nodes, edges, options: { extraMinX?: number; extraMinY?: number } = {}) {
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
