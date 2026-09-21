import { BOX, collectContracts, formatMethodSignature, measureBox, wrapText } from "./boxContent.mjs";

const LANE_GUTTER = 128;
const SIDE_PADDING = 20;
const PARTICIPANT_GAP = 28;
const HEADER_TOP = 24;
const FOOTER_PADDING = 48;
const LANE_GAP = 12;

export function layoutSequence(walkthrough, scenario) {
  const entityById = new Map(walkthrough.entities.map((entity) => [entity.id, entity]));
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
    cursorX += item.size.width + PARTICIPANT_GAP;
    return participant;
  });
  const participantById = new Map(participants.map((participant) => [participant.id, participant]));
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
    };
  });
  const laneRanges = scenario.lanes
    .map((lane) => {
      const laneSteps = steps.filter((step) => step.laneId === lane.id);
      if (laneSteps.length === 0) return null;
      const y = laneSteps[0].y - (laneSteps[0].labelLines?.length ?? 1) * 16 - 18;
      return {
        ...lane,
        y,
        height: Math.max(56, laneSteps.at(-1).y + ((laneSteps.at(-1).detailLines?.length ?? 0) * 16 + 18) - y),
      };
    })
    .filter(Boolean);
  for (let index = 0; index < laneRanges.length - 1; index += 1) {
    const current = laneRanges[index];
    const next = laneRanges[index + 1];
    const limit = next.y - LANE_GAP - current.y;
    if (limit > 0) current.height = Math.min(current.height, limit);
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
