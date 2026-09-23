import { AvoidLib } from "libavoid-js";

const SHAPE_BUFFER = 8;
const NUDGE_DISTANCE = 20;
const APPROACH_GAP = 24;
const SPREAD_GAP = 20;

const DIRECTION = { top: 1, bottom: 2, left: 4, right: 8 } as const;

type Side = keyof typeof DIRECTION;

let avoidPromise: Promise<void> | null = null;

function loadAvoid() {
  avoidPromise ??= AvoidLib.load();
  return avoidPromise;
}

type Box = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isCompound?: boolean;
};

type Edge = {
  id: string;
  sourceId: string;
  targetId: string;
  points?: { x: number; y: number }[];
  labelPoint?: { x: number; y: number };
};

export async function routeAroundLeaves<T extends Edge>(leaves: Box[], edges: T[]) {
  if (edges.length === 0) return edges;
  await loadAvoid();
  const Avoid = AvoidLib.getInstance() as unknown as AvoidApi;
  const router = new Avoid.Router(Avoid.RouterFlag.OrthogonalRouting.value);
  const pins = [];
  const shapes = new Map<string, unknown>();
  try {
    // embind 只认枚举对象。传 .value 数字时，间距仍停在默认的 4。
    router.setRoutingParameter(Avoid.RoutingParameter.shapeBufferDistance, SHAPE_BUFFER);
    router.setRoutingParameter(Avoid.RoutingParameter.idealNudgingDistance, NUDGE_DISTANCE);
    for (const leaf of leaves) {
      if (leaf.isCompound) continue;
      const rect = new Avoid.Rectangle(
        new Avoid.Point(leaf.x, leaf.y),
        new Avoid.Point(leaf.x + leaf.width, leaf.y + leaf.height),
      );
      shapes.set(leaf.id, new Avoid.ShapeRef(router, rect));
    }
    const byId = new Map(leaves.map((leaf) => [leaf.id, leaf]));
    const ends = edges.map((edge) => ({
      edge,
      source: chooseSide(byId.get(edge.sourceId), byId.get(edge.targetId)),
      target: chooseSide(byId.get(edge.targetId), byId.get(edge.sourceId)),
    }));
    const slots = new Map<string, number>();
    for (const end of ends) {
      countSlot(slots, end.edge.sourceId, end.source);
      countSlot(slots, end.edge.targetId, end.target);
    }
    const used = new Map<string, number>();
    const pinClass = new Map<string, number>();
    const connectors = ends.map((end) => {
      const source = pinEnd(Avoid, shapes, pins, pinClass, byId, used, slots, end.edge.sourceId, end.source);
      const target = pinEnd(Avoid, shapes, pins, pinClass, byId, used, slots, end.edge.targetId, end.target);
      const connector = new Avoid.ConnRef(router, source.end, target.end);
      const checkpoints = new Avoid.CheckpointVector();
      const sourceStop = approachPoint(source.point, end.source, source.index, leaves, end.edge.sourceId);
      const targetStop = approachPoint(target.point, end.target, target.index, leaves, end.edge.targetId);
      if (sourceStop) checkpoints.push_back(new Avoid.Checkpoint(new Avoid.Point(sourceStop.x, sourceStop.y)));
      if (targetStop) checkpoints.push_back(new Avoid.Checkpoint(new Avoid.Point(targetStop.x, targetStop.y)));
      connector.setRoutingCheckpoints(checkpoints);
      return { edge: end.edge, source: source.point, target: target.point, connector };
    });
    const orthogonal = Avoid.ConnType.ConnType_Orthogonal.value;
    for (const item of connectors) item.connector.setRoutingType(orthogonal);
    router.processTransaction();
    const routed = connectors.map((item) => {
      const route = item.connector.displayRoute();
      const points = [];
      for (let index = 0; index < route.size(); index += 1) {
        const point = route.at(index);
        points.push({ x: point.x, y: point.y });
      }
      if (points.length === 0) points.push({ ...item.source }, { ...item.target });
      points[0] = { ...item.source };
      points[points.length - 1] = { ...item.target };
      const cleaned = dedupePoints(points);
      return { ...item.edge, points: cleaned, labelPoint: longestMidpoint(cleaned) };
    });
    return spreadTightSegments(routed, leaves);
  } finally {
    router.delete();
  }
}

function approachPoint(
  pin: { x: number; y: number },
  side: Side,
  index: number,
  leaves: Box[],
  ownerId: string,
) {
  const gap = APPROACH_GAP + index * NUDGE_DISTANCE;
  const stepped =
    side === "bottom"
      ? { x: pin.x, y: pin.y + gap }
      : side === "top"
        ? { x: pin.x, y: pin.y - gap }
        : side === "right"
          ? { x: pin.x + gap, y: pin.y }
          : { x: pin.x - gap, y: pin.y };
  return insideLeaf(stepped, leaves, ownerId) ? null : stepped;
}

function insideLeaf(point: { x: number; y: number }, leaves: Box[], ownerId: string) {
  return leaves.some(
    (leaf) =>
      leaf.id !== ownerId &&
      !leaf.isCompound &&
      point.x > leaf.x + 1 &&
      point.x < leaf.x + leaf.width - 1 &&
      point.y > leaf.y + 1 &&
      point.y < leaf.y + leaf.height - 1,
  );
}

function pinEnd(Avoid: AvoidApi, shapes, pins, pinClass, byId, used, slots, id: string, side: Side) {
  const box = byId.get(id);
  const index = takeSlot(used, id, side);
  const count = slots.get(slotKey(id, side)) ?? 1;
  const point = borderPoint(box, side, index, count);
  const shape = shapes.get(id);
  if (!shape || !box) {
    return { point, end: new Avoid.ConnEnd(new Avoid.Point(point.x, point.y)), index };
  }
  const classId = (pinClass.get(id) ?? 0) + 1;
  pinClass.set(id, classId);
  const along = (index + 1) / (count + 1);
  const offset =
    side === "left" || side === "right" ? { x: side === "left" ? 0 : 1, y: along } : { x: along, y: side === "top" ? 0 : 1 };
  const pin = new Avoid.ShapeConnectionPin(shape, classId, offset.x, offset.y, true, 0, DIRECTION[side]);
  pins.push(pin);
  return { point, end: new Avoid.ConnEnd(shape, classId), index };
}

function chooseSide(from: Box | undefined, to: Box | undefined): Side {
  if (!from || !to) return "right";
  const dx = to.x + to.width / 2 - (from.x + from.width / 2);
  const dy = to.y + to.height / 2 - (from.y + from.height / 2);
  const xGap = dx >= 0 ? to.x - (from.x + from.width) : from.x - (to.x + to.width);
  const yGap = dy >= 0 ? to.y - (from.y + from.height) : from.y - (to.y + to.height);
  if (yGap > 0 && xGap <= 0) return dy >= 0 ? "bottom" : "top";
  if (xGap > 0 && yGap <= 0) return dx >= 0 ? "right" : "left";
  if (Math.abs(dy) >= Math.abs(dx)) return dy >= 0 ? "bottom" : "top";
  return dx >= 0 ? "right" : "left";
}

function borderPoint(box: Box | undefined, side: Side, index: number, count: number) {
  const along = (index + 1) / (count + 1);
  if (!box) return { x: 0, y: 0 };
  if (side === "left") return { x: box.x, y: box.y + box.height * along };
  if (side === "right") return { x: box.x + box.width, y: box.y + box.height * along };
  if (side === "top") return { x: box.x + box.width * along, y: box.y };
  return { x: box.x + box.width * along, y: box.y + box.height };
}

function slotKey(id: string, side: Side) {
  return `${id}:${side}`;
}

function countSlot(slots: Map<string, number>, id: string, side: Side) {
  const key = slotKey(id, side);
  slots.set(key, (slots.get(key) ?? 0) + 1);
}

function takeSlot(used: Map<string, number>, id: string, side: Side) {
  const key = slotKey(id, side);
  const index = used.get(key) ?? 0;
  used.set(key, index + 1);
  return index;
}

function dedupePoints(points: { x: number; y: number }[]) {
  return points.filter((point, index) => {
    const previous = points[index - 1];
    return !previous || Math.abs(previous.x - point.x) > 0.5 || Math.abs(previous.y - point.y) > 0.5;
  });
}

function longestMidpoint(points: { x: number; y: number }[]) {
  let best = points.length >= 2 ? midpoint(points[0], points[1]) : undefined;
  let bestLength = -1;
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    const length = Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
    if (length <= bestLength) continue;
    bestLength = length;
    best = midpoint(from, to);
  }
  return best;
}

function midpoint(from: { x: number; y: number }, to: { x: number; y: number }) {
  return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
}

type TightSegment = {
  edgeIndex: number;
  pointIndex: number;
  vertical: boolean;
  pos: number;
  start: number;
  end: number;
  length: number;
};

function spreadTightSegments<T extends Edge>(edges: T[], leaves: Box[]): T[] {
  for (let pass = 0; pass < 8; pass += 1) {
    const segments = collectSegments(edges);
    let moved = false;
    for (let i = 0; i < segments.length && !moved; i += 1) {
      for (let j = i + 1; j < segments.length; j += 1) {
        const left = segments[i];
        const right = segments[j];
        if (left.vertical !== right.vertical || left.edgeIndex === right.edgeIndex) continue;
        const gap = Math.abs(left.pos - right.pos);
        if (gap >= SPREAD_GAP) continue;
        const overlap = Math.min(left.end, right.end) - Math.max(left.start, right.start);
        if (overlap < 24) continue;
        const shorter = left.length <= right.length ? left : right;
        const longer = shorter === left ? right : left;
        if (separatePair(edges, shorter, longer, gap, leaves) || separatePair(edges, longer, shorter, gap, leaves)) {
          moved = true;
          break;
        }
      }
    }
    if (!moved) break;
  }
  return edges.map((edge) => {
    if (!edge.points) return edge;
    const points = dedupePoints(edge.points);
    return { ...edge, points, labelPoint: longestMidpoint(points) };
  });
}

function collectSegments<T extends Edge>(edges: T[]) {
  const segments: TightSegment[] = [];
  edges.forEach((edge, edgeIndex) => {
    const points = edge.points ?? [];
    for (let pointIndex = 0; pointIndex < points.length - 1; pointIndex += 1) {
      const from = points[pointIndex];
      const to = points[pointIndex + 1];
      const vertical = Math.abs(from.x - to.x) < 1;
      const horizontal = Math.abs(from.y - to.y) < 1;
      if (!vertical && !horizontal) continue;
      const length = Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
      if (length < 24) continue;
      segments.push({
        edgeIndex,
        pointIndex,
        vertical,
        pos: vertical ? from.x : from.y,
        start: vertical ? Math.min(from.y, to.y) : Math.min(from.x, to.x),
        end: vertical ? Math.max(from.y, to.y) : Math.max(from.x, to.x),
        length,
      });
    }
  });
  return segments;
}

function separatePair<T extends Edge>(edges: T[], segment: TightSegment, other: TightSegment, gap: number, leaves: Box[]) {
  const direction = Math.sign(segment.pos - other.pos) || 1;
  return shiftSegment(edges, segment, (SPREAD_GAP - gap) * direction, leaves);
}

function shiftSegment<T extends Edge>(edges: T[], segment: TightSegment, delta: number, leaves: Box[]) {
  const edge = edges[segment.edgeIndex];
  const points = edge.points;
  if (!points || delta === 0) return false;
  const start = segment.pointIndex;
  const end = start + 1;
  if (start === 0 || end === points.length - 1) return false;
  const axis = segment.vertical ? "x" : "y";
  const saved = points.map((point) => ({ ...point }));
  points[start] = { ...points[start], [axis]: points[start][axis] + delta };
  points[end] = { ...points[end], [axis]: points[end][axis] + delta };
  const clear = points.every((point, index) => {
    if (index === 0) return true;
    return !leaves.some((leaf) => leaf.id !== edge.sourceId && leaf.id !== edge.targetId && segmentCutsLeaf(points[index - 1], point, leaf));
  });
  const departure = points[0];
  const afterDeparture = points[1];
  const arrival = points[points.length - 1];
  const beforeArrival = points[points.length - 2];
  const longEnough =
    Math.abs(departure.x - afterDeparture.x) + Math.abs(departure.y - afterDeparture.y) >= 24 &&
    Math.abs(arrival.x - beforeArrival.x) + Math.abs(arrival.y - beforeArrival.y) >= 24;
  if (clear && longEnough) return true;
  edge.points = saved;
  return false;
}

function segmentCutsLeaf(from: { x: number; y: number }, to: { x: number; y: number }, leaf: Box) {
  if (leaf.isCompound) return false;
  const overlapX = Math.min(Math.max(from.x, to.x), leaf.x + leaf.width - 1) - Math.max(Math.min(from.x, to.x), leaf.x + 1);
  const overlapY = Math.min(Math.max(from.y, to.y), leaf.y + leaf.height - 1) - Math.max(Math.min(from.y, to.y), leaf.y + 1);
  return overlapX > 1 && overlapY > 1;
}

type AvoidApi = {
  Router: new (flags: number) => {
    setRoutingParameter(parameter: unknown, value: number): void;
    setRoutingOption(option: unknown, value: boolean): void;
    processTransaction(): void;
    delete(): void;
  };
  RouterFlag: { OrthogonalRouting: { value: number } };
  RoutingParameter: { shapeBufferDistance: { value: number }; idealNudgingDistance: { value: number } };
  Checkpoint: new (point: { x: number; y: number }) => unknown;
  CheckpointVector: new () => { push_back(checkpoint: unknown): void };
  Point: new (x: number, y: number) => { x: number; y: number };
  Rectangle: new (topLeft: { x: number; y: number }, bottomRight: { x: number; y: number }) => unknown;
  ShapeRef: new (router: unknown, rect: unknown) => unknown;
  ShapeConnectionPin: new (
    shape: unknown,
    classId: number,
    xOffset: number,
    yOffset: number,
    proportional: boolean,
    insideOffset: number,
    visDirs: number,
  ) => { setExclusive(exclusive: boolean): void };
  ConnEnd: new (...args: unknown[]) => unknown;
  ConnRef: new (
    router: unknown,
    source: unknown,
    target: unknown,
  ) => {
    displayRoute(): { size(): number; at(index: number): { x: number; y: number } };
    setRoutingType(type: number): void;
    setRoutingCheckpoints(checkpoints: unknown): void;
  };
  ConnType: { ConnType_Orthogonal: { value: number } };
};
