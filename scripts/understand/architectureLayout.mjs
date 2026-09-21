import { routeArchitectureEdges } from "./architectureEdges.mjs";
import { collectContracts, measureBox, measureBoxHeader } from "./boxContent.mjs";
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
  if (options.view === "overview") {
    return layoutContainment(projectOverview(walkthrough));
  }
  return layoutLayeredArchitecture(walkthrough);
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

async function layoutContainment(view) {
  const { entityById, childrenByParent, roots } = indexEntities(view);
  const graph = {
    id: "architecture-root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.layered.crossingMinimization.forceNodeModelOrder": "true",
      "elk.spacing.nodeNode": "48",
      "elk.layered.spacing.nodeNodeBetweenLayers": "72",
      "elk.spacing.edgeNode": "28",
      "elk.padding": "[top=28,left=28,bottom=28,right=40]",
    },
    children: roots.map((entity) => createElkNode(entity, childrenByParent, view)),
    edges: [],
  };

  const result = await elk.layout(graph);
  const nodes = [];
  flattenNodes(result.children ?? [], 0, 0, entityById, view, nodes);
  return finalizeArchitecture(nodes, view);
}

function layoutLayeredArchitecture(walkthrough) {
  const { entityById, childrenByParent, roots } = indexEntities(walkthrough);
  const forest = roots.map((entity) => measureLayeredNode(entity, childrenByParent, walkthrough, entityById));
  const usedLayers = sortLayers(forest.flatMap((node) => node.layers));
  if (usedLayers.length === 0) {
    return layoutContainment(walkthrough);
  }

  const gutter = 156;
  const lanes = buildLanes(forest, usedLayers);
  const packed = packSiblings(forest);
  const nodes = [];
  placeLayeredForest(forest, packed, gutter + 20, lanes, nodes);
  const result = finalizeArchitecture(nodes, walkthrough, {
    extraMinX: 8,
    extraMinY: lanes[0]?.y ?? 0,
  });
  const canvasWidth = Math.max(result.width, gutter + 48);
  const canvasHeight = Math.max(result.height, (lanes.at(-1)?.y ?? 0) + (lanes.at(-1)?.height ?? 0) + result.shiftY + 16);
  const shiftedLanes = lanes.map((lane, index) => {
    const y = lane.y + result.shiftY;
    const next = lanes[index + 1];
    const height = next ? next.y + result.shiftY - y : Math.max(lane.height, canvasHeight - y - 8);
    return { ...lane, y, height, gutter };
  });
  return {
    ...result,
    width: canvasWidth,
    height: canvasHeight,
    lanes: shiftedLanes,
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

function measureLayeredNode(entity, childrenByParent, walkthrough, entityById) {
  const contracts = collectContracts(entity, walkthrough);
  const display = { ...entity, layer: undefined };
  const children = (childrenByParent.get(entity.id) ?? []).map((child) =>
    measureLayeredNode(child, childrenByParent, walkthrough, entityById),
  );
  if (children.length === 0) {
    const size = measureBox(display, contracts);
    const layer = resolveLayer(entity, entityById);
    return {
      entity,
      contracts,
      width: size.width,
      height: size.height,
      headerHeight: measureBoxHeader(display),
      layers: layer ? [layer] : [],
      children: [],
      placements: [],
    };
  }

  const placements = packSiblings(children);
  const innerWidth = Math.max(0, ...placements.map((item) => item.x + item.node.width));
  const headerHeight = measureBoxHeader(display);
  const headerWidth = measureBox(display, []).width;
  const layers = sortLayers(children.flatMap((child) => child.layers));
  const omitFrame = children.length === 1 || (entity.type === "system" && layers.length >= 3);
  return {
    entity,
    contracts,
    width: omitFrame ? innerWidth : Math.max(headerWidth, innerWidth) + 56,
    height: 0,
    headerHeight: omitFrame ? 0 : headerHeight,
    layers,
    children,
    placements,
    omitFrame,
  };
}

function packSiblings(nodes) {
  const cursorByLayer = new Map();
  return nodes.map((node) => {
    const layers = node.layers.length > 0 ? node.layers : ["未标注"];
    const x = Math.max(0, ...layers.map((layer) => cursorByLayer.get(layer) ?? 0));
    for (const layer of layers) {
      cursorByLayer.set(layer, x + node.width + 36);
    }
    return { node, x };
  });
}

function buildLanes(forest, usedLayers) {
  const contentByLayer = new Map(usedLayers.map((layer) => [layer, 0]));
  walkLeaves(forest, [], (leaf, ancestors) => {
    const layer = leaf.layers[0];
    if (!layer) return;
    let headers = 0;
    for (const ancestor of ancestors) {
      if (ancestor.layers[0] === layer) {
        headers += ancestor.headerHeight + 10;
      }
    }
    contentByLayer.set(layer, Math.max(contentByLayer.get(layer) ?? 0, headers + leaf.height));
  });

  let y = 0;
  return usedLayers.map((title) => {
    const height = Math.max(120, (contentByLayer.get(title) ?? 0) + 48);
    const lane = { id: `layer.${title}`, title, slug: layerSlug(title), y, height };
    y += height;
    return lane;
  });
}

function walkLeaves(nodes, ancestors, visit) {
  for (const node of nodes) {
    if (node.children.length === 0) {
      visit(node, ancestors);
      continue;
    }
    walkLeaves(node.children, [...ancestors, node], visit);
  }
}

function placeLayeredForest(forest, placements, originX, lanes, nodes) {
  const laneByTitle = new Map(lanes.map((lane) => [lane.title, lane]));
  for (const placement of placements) {
    placeLayeredNode(placement.node, originX + placement.x, laneByTitle, nodes, []);
  }
}

function placeLayeredNode(measured, x, laneByTitle, nodes, ancestors) {
  if (measured.children.length === 0) {
    const layer = measured.layers[0];
    const lane = laneByTitle.get(layer);
    let headers = 0;
    for (const ancestor of ancestors) {
      if (ancestor.layers[0] === layer) {
        headers += ancestor.headerHeight + 10;
      }
    }
    const y = (lane?.y ?? 0) + 24 + headers;
    nodes.push(toPlacedNode(measured, x, y, measured.width, measured.height, false));
    return;
  }

  if (measured.omitFrame) {
    for (const placement of measured.placements) {
      placeLayeredNode(placement.node, x + placement.x, laneByTitle, nodes, ancestors);
    }
    return;
  }

  for (const placement of measured.placements) {
    placeLayeredNode(placement.node, x + 28 + placement.x, laneByTitle, nodes, [...ancestors, measured]);
  }

  const descendants = nodes.filter((node) => isDescendant(node, measured.entity.id, nodes));
  const childBoxes = descendants.filter((node) => node.parentId === measured.entity.id);
  const boxed = childBoxes.length > 0 ? childBoxes : descendants;
  const minY = Math.min(...boxed.map((node) => node.y)) - measured.headerHeight - 8;
  const maxY = Math.max(...boxed.map((node) => node.y + node.height)) + 28;
  nodes.push(toPlacedNode(measured, x, minY, measured.width, Math.max(maxY - minY, measured.headerHeight + 36), true));
}

function toPlacedNode(measured, x, y, width, height, isCompound) {
  return {
    ...measured.entity,
    layer: undefined,
    contracts: measured.contracts,
    x,
    y,
    width,
    height,
    isCompound,
    headerHeight: measured.headerHeight,
  };
}

function isDescendant(node, ancestorId, nodes) {
  const byId = new Map(nodes.map((item) => [item.id, item]));
  let current = node;
  while (current) {
    if (current.parentId === ancestorId) return true;
    current = byId.get(current.parentId);
  }
  return false;
}

function resolveLayer(entity, entityById) {
  if (entity.layer) return entity.layer;
  if (entity.type === "actor") return "Actor";
  if (entity.type === "store") return "Store";
  let current = entityById.get(entity.parentId);
  while (current) {
    if (current.layer) return current.layer;
    current = entityById.get(current.parentId);
  }
  return undefined;
}

function sortLayers(layers) {
  const unique = [...new Set(layers.filter(Boolean))];
  return unique.sort((left, right) => layerRank(left) - layerRank(right));
}

function layerRank(name) {
  const index = LAYER_ORDER.indexOf(name);
  return index === -1 ? LAYER_ORDER.length - 0.5 : index;
}

export function layerSlug(name) {
  const known = {
    Actor: "actor",
    Presentation: "presentation",
    "接口 / 编排": "interface",
    "领域 / 应用": "domain",
    "持久化 / 网关": "persistence",
    Store: "store",
  };
  return known[name] ?? "other";
}

function finalizeArchitecture(nodes, view, options = {}) {
  const edges = routeArchitectureEdges(nodes, relationsForRouting(view, nodes));
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

function createElkNode(entity, childrenByParent, walkthrough) {
  const contracts = collectContracts(entity, walkthrough);
  const size = measureBox(entity, contracts);
  const children = childrenByParent.get(entity.id) ?? [];
  const node = {
    id: entity.id,
    width: size.width,
    height: size.height,
    layoutOptions: {
      "elk.portConstraints": "FIXED_ORDER",
    },
  };
  if (children.length > 0) {
    node.children = children.map((child) => createElkNode(child, childrenByParent, walkthrough));
    node.layoutOptions = {
      ...node.layoutOptions,
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.padding": `[top=${measureBoxHeader(entity) + 12},left=36,bottom=36,right=48]`,
      "elk.spacing.nodeNode": "48",
      "elk.layered.spacing.nodeNodeBetweenLayers": "72",
    };
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

function relationsForRouting(walkthrough, nodes) {
  const hostByContract = new Map();
  for (const node of nodes) {
    for (const contract of node.contracts ?? []) {
      hostByContract.set(contract.id, node.id);
    }
  }
  const nodeIds = new Set(nodes.map((node) => node.id));
  return walkthrough.relations
    .map((relation) => ({
      ...relation,
      sourceId: hostByContract.get(relation.sourceId) ?? relation.sourceId,
      targetId: hostByContract.get(relation.targetId) ?? relation.targetId,
    }))
    .filter((relation) => {
      if (relation.type === "contains" || relation.sourceId === relation.targetId) return false;
      return nodeIds.has(relation.sourceId) && nodeIds.has(relation.targetId);
    });
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
