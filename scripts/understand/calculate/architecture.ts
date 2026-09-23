import { collectContracts, measureBox, measureBoxHeader, measureEdgeLabel, participantContent, wrapText } from "./measure.ts";
import { placeBoxes } from "./graphvizPlace.ts";
import { routeAroundLeaves } from "./libavoidRoute.ts";
import { projectArchitecture, resolveFocusId, shouldOmitOverview } from "../scope/architecture.ts";

const LANE_GUTTER = 156;

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
    return layoutPicture(view, { layered: false });
  }
  const view = focusId ? projectArchitecture(walkthrough, focusId, false) : walkthrough;
  return layoutPicture(view, { layered: shouldUseResponsibilityLanes(view) });
}

async function layoutPicture(view, options: { layered: boolean }) {
  const { entityById, childrenByParent } = indexEntities(view);
  const layerOrder = usedLayerOrder(view.participants, childrenByParent);
  const boxes = drawingBoxes(view, childrenByParent, layerOrder);
  const relations = drawableRelations(view, entityById);
  const placed = await placeBoxes(
    boxes.map((box) => ({
      id: box.id,
      parentId: box.parentId,
      width: box.width,
      height: box.height,
      headerHeight: box.headerHeight,
      layerRank: box.layerRank,
      type: box.type,
    })),
    relations.map((relation) => ({ sourceId: relation.sourceId, targetId: relation.targetId })),
    { layered: options.layered },
  );
  const nodes = boxes.map((box) => {
    const geometry = placed.get(box.id);
    return { ...box, x: geometry.x, y: geometry.y, width: geometry.width, height: geometry.height };
  });
  settleFrames(nodes);
  const edges = await routeAroundLeaves(nodes, relations);
  const gutter = options.layered ? LANE_GUTTER : 0;
  const shifted = shiftArchitecture(nodes, edges, gutter ? { extraMinX: -gutter } : {});
  if (!options.layered) return finishDrawing({ ...shifted, lanes: [], gutter: 0 });
  const lanes = fillLaneGaps(
    lanesFromNodes(shifted.nodes, gutter, layerOrder),
    Math.max(contentBottom(shifted.nodes, shifted.edges), shifted.height),
  );
  if (lanes.length === 0) {
    const placed = reclaimLaneGutter(shifted, gutter);
    return finishDrawing({ ...placed, lanes: localLayerBands(placed.nodes, layerOrder), gutter: 0 });
  }
  const last = lanes.at(-1);
  return finishDrawing({
    ...shifted,
    width: Math.max(shifted.width, gutter + 48),
    height: Math.max(shifted.height, (last?.y ?? 0) + (last?.height ?? 0)),
    lanes,
    gutter,
  });
}

function drawingBoxes(view, childrenByParent, layerOrder: string[]) {
  const boxes = [];
  const visit = (entity) => {
    const children = childrenByParent.get(entity.id) ?? [];
    if (entity.type === "system" && children.length > 0) {
      for (const child of children) visit(child);
      return;
    }
    const contracts = collectContracts(entity, view);
    const compound = children.length > 0;
    const measured = measureBox(compound ? { ...entity, layer: undefined } : entity, contracts);
    const layer = compound ? undefined : leafResponsibilityLayer(entity);
    boxes.push({
      ...entity,
      contracts,
      width: measured.width,
      height: measured.height,
      isCompound: compound,
      headerHeight: measureBoxHeader(entity),
      layerRank: layer ? layerRank(layer, layerOrder) : null,
    });
    for (const child of children) visit(child);
  };
  const { roots } = indexEntities(view);
  for (const root of roots) visit(root);
  return boxes;
}

function drawableRelations(view, entityById) {
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
    specs.push({ ...relation, sourceId, targetId });
  }
  return specs;
}

const FRAME_GAP = 48;

function settleFrames(nodes) {
  for (let round = 0; round < 16; round += 1) {
    containChildren(nodes);
    if (!separateCollisions(nodes)) return;
  }
  containChildren(nodes);
}

function separateCollisions(nodes) {
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const left = nodes[i];
      const right = nodes[j];
      if (isInside(nodes, left, right.id) || isInside(nodes, right, left.id) || sameLayerGroup(left, right)) continue;
      const overlapX = Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x);
      const overlapY = Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y);
      if (overlapX <= 1 || overlapY <= 1) continue;
      const pushX = overlapX < overlapY;
      const mover = pushX ? (left.x <= right.x ? right : left) : left.y <= right.y ? right : left;
      const dx = pushX ? overlapX + FRAME_GAP : 0;
      const dy = pushX ? 0 : overlapY + FRAME_GAP;
      for (const peer of layerGroupOf(nodes, mover)) shiftSubtree(nodes, peer, dx, dy);
      return true;
    }
  }
  return false;
}

function sameLayerGroup(left, right) {
  return (
    !left.isCompound &&
    !right.isCompound &&
    left.layerRank != null &&
    left.layerRank === right.layerRank &&
    (left.parentId ?? "") === (right.parentId ?? "")
  );
}

function layerGroupOf(nodes, mover) {
  if (mover.isCompound || mover.layerRank == null) return [mover];
  const peers = nodes.filter((node) => sameLayerGroup(node, mover));
  return peers.length > 0 ? peers : [mover];
}

function isInside(nodes, node, ancestorId) {
  let current = node;
  while (current?.parentId) {
    if (current.parentId === ancestorId) return true;
    current = nodes.find((item) => item.id === current.parentId);
  }
  return false;
}

function shiftSubtree(nodes, root, dx, dy) {
  const ids = new Set([root.id]);
  const pending = [root.id];
  while (pending.length > 0) {
    const parentId = pending.pop();
    for (const node of nodes) {
      if (node.parentId === parentId && !ids.has(node.id)) {
        ids.add(node.id);
        pending.push(node.id);
      }
    }
  }
  for (const node of nodes) {
    if (!ids.has(node.id)) continue;
    node.x += dx;
    node.y += dy;
  }
}

function containChildren(nodes) {
  const byParent = new Map();
  for (const node of nodes) {
    if (!node.parentId) continue;
    const siblings = byParent.get(node.parentId) ?? [];
    siblings.push(node);
    byParent.set(node.parentId, siblings);
  }
  const compounds = nodes.filter((node) => node.isCompound);
  const depthOf = new Map();
  const depth = (id) => {
    if (depthOf.has(id)) return depthOf.get(id);
    const node = nodes.find((item) => item.id === id);
    const value = node?.parentId ? depth(node.parentId) + 1 : 0;
    depthOf.set(id, value);
    return value;
  };
  compounds.sort((left, right) => depth(right.id) - depth(left.id));
  for (const parent of compounds) {
    const children = byParent.get(parent.id) ?? [];
    if (children.length === 0) continue;
    const header = parent.headerHeight ?? 0;
    const top = Math.min(...children.map((child) => child.y)) - header;
    const bottom = Math.max(...children.map((child) => child.y + child.height)) + 12;
    const left = Math.min(...children.map((child) => child.x)) - 12;
    const right = Math.max(...children.map((child) => child.x + child.width)) + 12;
    if (top < parent.y) {
      parent.height += parent.y - top;
      parent.y = top;
    }
    if (left < parent.x) {
      parent.width += parent.x - left;
      parent.x = left;
    }
    parent.height = Math.max(parent.height, bottom - parent.y);
    parent.width = Math.max(parent.width, right - parent.x);
  }
}

function reclaimLaneGutter(placed, gutter) {
  if (!gutter) return placed;
  for (const node of placed.nodes) node.x -= gutter;
  for (const edge of placed.edges) {
    for (const point of edge.points ?? []) point.x -= gutter;
    if (edge.labelPoint) edge.labelPoint.x -= gutter;
  }
  return { ...placed, width: Math.max(48, placed.width - gutter) };
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

function finishDrawing(picture) {
  const gutter = picture.gutter ?? 0;
  return {
    ...picture,
    nodes: picture.nodes.map((node) => ({ ...node, content: participantContent(node) })),
    edges: picture.edges.map((edge) => edgeDrawing(edge)),
    lanes: (picture.lanes ?? []).map((lane) => laneTitle(lane, gutter || lane.gutter || LANE_GUTTER)),
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
    path: points.length >= 2 ? roundedOrthogonalPath(points, 10) : "",
    caption: title
      ? { title, protocol, x: labelPoint?.x ?? 0, y: labelPoint?.y ?? 0, width: pill.width, height: pill.height }
      : null,
  };
}

function laneTitle(lane, gutter) {
  if (lane.local) {
    const room = (lane.leafTop ?? lane.y) - lane.y;
    if (room < 16) return { ...lane, titleLines: [], titleTop: lane.y };
    const titleLines = wrapText(lane.title, Math.max(72, (lane.width ?? 120) - 16), 11, 1);
    return { ...lane, titleLines, titleTop: lane.y + 13 };
  }
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
    (entity) => entity.type !== "contract" && (!entity.parentId || !entityById.has(entity.parentId)),
  );
  return { entityById, childrenByParent, roots };
}

function localLayerBands(nodes, layerOrder: string[]) {
  const groups = new Map<string, any[]>();
  for (const node of nodes) {
    if (node.isCompound) continue;
    const layer = leafResponsibilityLayer(node);
    if (!layer) continue;
    const key = `${node.parentId ?? ""}\0${layer}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(node);
    groups.set(key, bucket);
  }
  const bands = [];
  for (const [key, bucket] of groups) {
    const split = key.indexOf("\0");
    const parentId = key.slice(0, split);
    const title = key.slice(split + 1);
    const parent = parentId ? nodes.find((node) => node.id === parentId) : undefined;
    const leafTop = Math.min(...bucket.map((node) => node.y));
    const leafBottom = Math.max(...bucket.map((node) => node.y + node.height));
    const leafLeft = Math.min(...bucket.map((node) => node.x)) - 8;
    const leafRight = Math.max(...bucket.map((node) => node.x + node.width)) + 8;
    let x = parent ? parent.x + 4 : leafLeft;
    let right = parent ? parent.x + parent.width - 4 : leafRight;
    let y = leafTop - 22;
    const headerBottom = parent ? parent.y + (parent.headerHeight ?? 0) : y;
    if (y < headerBottom) y = headerBottom;
    const band = {
      id: `layer.${parentId || "root"}.${title}`,
      title,
      slug: layerSlug(title, layerOrder),
      x,
      y,
      width: Math.max(48, right - x),
      height: Math.max(28, leafBottom + 10 - y),
      contentMid: (leafTop + leafBottom) / 2,
      leafTop,
      local: true,
    };
    const tight = { ...band, x: leafLeft, width: Math.max(48, leafRight - leafLeft) };
    const chosen = bandFits(band, bucket, nodes) ? band : tight;
    if (!bandFits(chosen, bucket, nodes)) continue;
    bands.push(chosen);
  }
  return bands.filter((band, index) => bands.every((other, otherIndex) => otherIndex === index || !rectsOverlap(band, other)));
}

function bandFits(band, members, nodes) {
  const memberIds = new Set(members.map((node) => node.id));
  for (const node of nodes) {
    if (node.isCompound || memberIds.has(node.id)) continue;
    const midX = node.x + node.width / 2;
    const midY = node.y + node.height / 2;
    if (midX > band.x && midX < band.x + band.width && midY > band.y && midY < band.y + band.height) return false;
  }
  return true;
}

function rectsOverlap(left, right) {
  return (
    left.x < right.x + right.width - 1 &&
    left.x + left.width > right.x + 1 &&
    left.y < right.y + right.height - 1 &&
    left.y + left.height > right.y + 1
  );
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
  const unitLeaves = participants.filter((participant) => participant.type === "unit" && !childIds.has(participant.id));
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
      if (ranges[i].top < ranges[j].bottom - 8 && ranges[j].top < ranges[i].bottom - 8) return false;
    }
  }
  for (const node of nodes) {
    if (node.isCompound || leafResponsibilityLayer(node)) continue;
    const midY = node.y + node.height / 2;
    if (ranges.some((range) => midY >= range.top && midY <= range.bottom)) return false;
  }
  return true;
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
