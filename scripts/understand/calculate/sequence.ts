import { BOX, collectContracts, formatEvidence, formatMethodSignature, measureBox, participantContent, wrapText } from "./measure.ts";

const LANE_GUTTER = 128;
const SIDE_PADDING = 20;
const PARTICIPANT_GAP = 28;
const HEADER_TOP = 24;
const FOOTER_PADDING = 48;
const LANE_GAP = 12;

export function calculateSequence(walkthrough, scenario) {
  const entityById = new Map(walkthrough.participants.map((entity) => [entity.id, entity]));
  let cursorX = LANE_GUTTER + SIDE_PADDING;
  const sized = scenario.participantIds.map((id) => {
    const entity = entityById.get(id) ?? { id, title: id, type: "unit" };
    const contracts = collectContracts(entity, walkthrough);
    const size = measureBox(entity, contracts, {
      minWidth: BOX.minParticipantWidth,
      maxWidth: BOX.maxParticipantWidth,
    });
    return { entity, contracts, size };
  });
  const headerHeight = Math.max(...sized.map((item) => item.size.height), 64);
  const participants = sized.map((item) => {
    const participant = {
      ...item.entity,
      id: item.entity.id,
      contracts: item.contracts,
      x: cursorX,
      y: HEADER_TOP,
      width: item.size.width,
      height: headerHeight,
      centerX: cursorX + item.size.width / 2,
    };
    participant.content = participantContent(participant);
    cursorX += item.size.width + PARTICIPANT_GAP;
    return participant;
  });
  const participantById = new Map<string, any>(participants.map((participant) => [participant.id, participant]));
  const stepTop = HEADER_TOP + headerHeight + 40;
  let cursorY = stepTop;
  const steps = scenario.steps.map((step) => {
    const fromX = participantById.get(step.fromId)?.centerX;
    const toX = participantById.get(step.toId)?.centerX;
    const block = measureStepBlock(step, fromX, toX);
    const branchOffset = step.branch?.position === "start" ? 24 : 0;
    const y = cursorY + branchOffset + block.above;
    cursorY = y + block.below + 28;
    return {
      ...step,
      y,
      fromX,
      toX,
      wrapWidth: block.span,
      labelLines: block.labelLines,
      methodLines: block.methodLines,
      detailLines: block.detailLines,
      evidenceText: formatEvidence(step.evidence) ?? "",
      arrowPoints: arrowHead({ x: toX ?? fromX ?? 0, y }, (fromX ?? 0) <= (toX ?? fromX ?? 0) ? 0 : Math.PI),
    };
  });
  const laneRanges = scenario.lanes
    .map((lane) => {
      const laneSteps = steps.filter((step) => step.laneId === lane.id);
      if (laneSteps.length === 0) return null;
      const y = laneSteps[0].y - (laneSteps[0].labelLines?.length ?? 1) * 16 - 18;
      const range = {
        ...lane,
        y,
        height: Math.max(56, laneSteps.at(-1).y + ((laneSteps.at(-1).detailLines?.length ?? 0) * 16 + 18) - y),
      };
      return range;
    })
    .filter(Boolean);
  for (let index = 0; index < laneRanges.length - 1; index += 1) {
    const current = laneRanges[index];
    const next = laneRanges[index + 1];
    const limit = next.y - LANE_GAP - current.y;
    if (limit > 0) current.height = Math.min(current.height, limit);
  }
  for (const lane of laneRanges) {
    const titleLines = wrapText(lane.title, LANE_GUTTER - 28, 12, 3);
    lane.titleLines = titleLines;
    lane.titleTop = lane.y + lane.height / 2 - ((titleLines.length - 1) * 16) / 2 + 4;
  }

  return {
    ...scenario,
    laneGutter: LANE_GUTTER,
    width: Math.max(980, cursorX - PARTICIPANT_GAP + SIDE_PADDING),
    height: (steps.at(-1)?.y ?? stepTop) + 64 + FOOTER_PADDING,
    participants,
    steps,
    laneRanges,
  };
}

function arrowHead(point, angle) {
  const size = 8;
  const left = {
    x: point.x - size * Math.cos(angle) + size * 0.55 * Math.sin(angle),
    y: point.y - size * Math.sin(angle) - size * 0.55 * Math.cos(angle),
  };
  const right = {
    x: point.x - size * Math.cos(angle) - size * 0.55 * Math.sin(angle),
    y: point.y - size * Math.sin(angle) + size * 0.55 * Math.cos(angle),
  };
  return `${point.x},${point.y} ${left.x},${left.y} ${right.x},${right.y}`;
}

function measureStepBlock(step, fromX, toX) {
  const span = Math.max(240, Math.abs((toX ?? 0) - (fromX ?? 0)) - 16);
  const labelLines = wrapText(step.label ?? "", span, 12, 2);
  const methodLines = wrapText(formatMethodSignature(step), span, 11, 2);
  const detailIsParams = !step.params && step.detail;
  const detailLines = detailIsParams ? [] : wrapText(step.detail ?? "", span, 12, 2);
  return {
    span,
    labelLines,
    methodLines,
    detailLines,
    above: (labelLines.length + methodLines.length) * 16 + 4,
    below: detailLines.length * 16 + 10,
  };
}
